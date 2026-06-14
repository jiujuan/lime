use app_server_protocol::AgentEvent;
use serde_json::{Map, Value};
use std::collections::HashMap;

#[derive(Default)]
struct ToolLifecycleState {
    tools: HashMap<String, ToolState>,
}

#[derive(Default)]
struct ToolState {
    pending_action_id: Option<String>,
    denied: bool,
    owner: ToolOwner,
}

#[derive(Default, Debug, Clone, PartialEq, Eq)]
struct ToolOwner {
    assistant_owner_id: Option<String>,
    item_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ToolLifecycleViolation {
    code: &'static str,
    event_id: String,
    tool_call_id: Option<String>,
}

pub(super) fn validate_tool_lifecycle_event(
    existing_events: &[AgentEvent],
    candidate: &AgentEvent,
) -> Result<(), String> {
    let mut state = ToolLifecycleState::default();
    for event in existing_events
        .iter()
        .filter(|event| same_tool_lifecycle_scope(event, candidate))
    {
        state.push_existing(event);
    }

    let violations = state.validate_candidate(candidate);
    if violations.is_empty() {
        return Ok(());
    }

    Err(format!(
        "agent runtime tool lifecycle validation failed: {}",
        violations
            .iter()
            .map(format_violation)
            .collect::<Vec<_>>()
            .join("; ")
    ))
}

pub(super) fn normalize_policy_event_payload(
    existing_events: &[AgentEvent],
    turn_id: Option<&str>,
    event_type: &str,
    payload: Value,
) -> Value {
    let event_class = normalize_event_class(event_type);
    if !is_policy_event_class(event_class) {
        return payload;
    }

    let Value::Object(mut object) = payload else {
        return payload;
    };

    if is_action_event_class(event_class) {
        normalize_action_aliases(&mut object);
        if payload_string_from_map(
            &object,
            &["toolCallId", "tool_call_id", "toolId", "tool_id"],
        )
        .is_none()
        {
            let tool_call_id = if event_class == "action.required" {
                active_tool_call_id_for_action(existing_events, turn_id, &object)
            } else {
                action_id_from_map(&object).and_then(|action_id| {
                    previous_action_tool_call_id(existing_events, turn_id, &action_id)
                })
            };
            if let Some(tool_call_id) = tool_call_id {
                object.insert("toolCallId".to_string(), Value::String(tool_call_id));
            }
        }
        if event_class == "action.required" {
            normalize_action_required_kind(&mut object);
        }
    }

    Value::Object(object)
}

impl ToolLifecycleState {
    fn push_existing(&mut self, event: &AgentEvent) {
        match normalize_event_class(&event.event_type) {
            "tool.started" => {
                if let Some(tool_call_id) = tool_call_id(event) {
                    self.tools.insert(
                        tool_call_id,
                        ToolState {
                            pending_action_id: None,
                            denied: false,
                            owner: ToolOwner::from_event(event),
                        },
                    );
                }
            }
            "tool.result" | "tool.failed" => {
                if let Some(tool_call_id) = tool_call_id(event) {
                    self.tools.remove(&tool_call_id);
                }
            }
            "action.required" => {
                if let Some(tool_call_id) = explicit_tool_call_id(event) {
                    if let Some(tool) = self.tools.get_mut(&tool_call_id) {
                        tool.pending_action_id = action_id(event);
                    }
                }
            }
            event_class if is_action_terminal_event_class(event_class) => {
                if let Some(tool_call_id) = explicit_tool_call_id(event) {
                    if let Some(tool) = self.tools.get_mut(&tool_call_id) {
                        if tool.pending_action_id.as_deref() == action_id(event).as_deref() {
                            tool.pending_action_id = None;
                            tool.denied = action_denies_tool(event);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn validate_candidate(&mut self, event: &AgentEvent) -> Vec<ToolLifecycleViolation> {
        let mut violations = Vec::new();
        let event_class = normalize_event_class(&event.event_type);
        match event_class {
            "tool.args" | "tool.args.delta" => {
                if let Some(tool_call_id) = tool_call_id(event) {
                    if let Some(tool) = self.tools.get(&tool_call_id) {
                        validate_tool_owner(
                            &mut violations,
                            event,
                            &tool_call_id,
                            tool,
                            OwnerRequirement::ExplicitOnly,
                        );
                    } else {
                        violations.push(ToolLifecycleViolation {
                            code: "tool_args_without_start",
                            event_id: event.event_id.clone(),
                            tool_call_id: Some(tool_call_id),
                        });
                    }
                }
            }
            "tool.output.delta" => {
                if let Some(tool_call_id) = tool_call_id(event) {
                    if let Some(tool) = self.tools.get(&tool_call_id) {
                        validate_tool_owner(
                            &mut violations,
                            event,
                            &tool_call_id,
                            tool,
                            OwnerRequirement::ExplicitOnly,
                        );
                        if tool.pending_action_id.is_some() {
                            violations.push(ToolLifecycleViolation {
                                code: "tool_output_before_action_resolved",
                                event_id: event.event_id.clone(),
                                tool_call_id: Some(tool_call_id),
                            });
                        }
                    } else {
                        violations.push(ToolLifecycleViolation {
                            code: "tool_output_without_start",
                            event_id: event.event_id.clone(),
                            tool_call_id: Some(tool_call_id),
                        });
                    }
                }
            }
            "tool.result" => {
                if let Some(tool_call_id) = tool_call_id(event) {
                    if let Some(tool) = self.tools.get(&tool_call_id) {
                        validate_tool_owner(
                            &mut violations,
                            event,
                            &tool_call_id,
                            tool,
                            OwnerRequirement::RequiredForTerminal,
                        );
                        if tool.pending_action_id.is_some() {
                            violations.push(ToolLifecycleViolation {
                                code: "tool_result_before_action_resolved",
                                event_id: event.event_id.clone(),
                                tool_call_id: Some(tool_call_id),
                            });
                        } else if tool.denied {
                            violations.push(ToolLifecycleViolation {
                                code: "tool_result_after_action_denied",
                                event_id: event.event_id.clone(),
                                tool_call_id: Some(tool_call_id),
                            });
                        }
                    }
                }
            }
            "tool.failed" => {
                if let Some(tool_call_id) = tool_call_id(event) {
                    if let Some(tool) = self.tools.get(&tool_call_id) {
                        validate_tool_owner(
                            &mut violations,
                            event,
                            &tool_call_id,
                            tool,
                            OwnerRequirement::RequiredForTerminal,
                        );
                        if tool.pending_action_id.is_some() {
                            violations.push(ToolLifecycleViolation {
                                code: "tool_failed_before_action_resolved",
                                event_id: event.event_id.clone(),
                                tool_call_id: Some(tool_call_id),
                            });
                        }
                    }
                }
            }
            "permission.denied" | "sandbox.blocked" | "action.required" => {
                if let Some(tool_call_id) = explicit_tool_call_id(event) {
                    if let Some(tool) = self.tools.get(&tool_call_id) {
                        validate_tool_owner(
                            &mut violations,
                            event,
                            &tool_call_id,
                            tool,
                            OwnerRequirement::ExplicitOnly,
                        );
                    } else {
                        violations.push(ToolLifecycleViolation {
                            code: "tool_policy_event_without_active_tool",
                            event_id: event.event_id.clone(),
                            tool_call_id: Some(tool_call_id),
                        });
                    }
                }
            }
            _ => {}
        }
        violations
    }
}

#[derive(Debug, Clone)]
struct ActiveToolCandidate {
    name: Option<String>,
    arguments: Option<Value>,
}

#[derive(Clone, Copy)]
enum OwnerRequirement {
    ExplicitOnly,
    RequiredForTerminal,
}

impl ToolOwner {
    fn from_event(event: &AgentEvent) -> Self {
        Self {
            assistant_owner_id: string_field(
                &event.payload,
                &[
                    "assistantMessageId",
                    "assistant_message_id",
                    "messageId",
                    "message_id",
                ],
            ),
            item_id: string_field(&event.payload, &["itemId", "item_id"]),
        }
    }

    fn is_empty(&self) -> bool {
        self.assistant_owner_id.is_none() && self.item_id.is_none()
    }

    fn has_comparable_field_with(&self, other: &ToolOwner) -> bool {
        (self.assistant_owner_id.is_some() && other.assistant_owner_id.is_some())
            || (self.item_id.is_some() && other.item_id.is_some())
    }

    fn matches(&self, other: &ToolOwner) -> bool {
        if self
            .assistant_owner_id
            .as_deref()
            .zip(other.assistant_owner_id.as_deref())
            .is_some_and(|(left, right)| left != right)
        {
            return false;
        }
        if self
            .item_id
            .as_deref()
            .zip(other.item_id.as_deref())
            .is_some_and(|(left, right)| left != right)
        {
            return false;
        }
        self.has_comparable_field_with(other)
    }
}

fn validate_tool_owner(
    violations: &mut Vec<ToolLifecycleViolation>,
    event: &AgentEvent,
    tool_call_id: &str,
    tool: &ToolState,
    requirement: OwnerRequirement,
) {
    let event_owner = ToolOwner::from_event(event);
    if tool.owner.is_empty() {
        return;
    }
    if event_owner.is_empty() {
        if matches!(requirement, OwnerRequirement::RequiredForTerminal) {
            violations.push(ToolLifecycleViolation {
                code: "tool_terminal_missing_owner",
                event_id: event.event_id.clone(),
                tool_call_id: Some(tool_call_id.to_string()),
            });
        }
        return;
    }
    if !tool.owner.matches(&event_owner) {
        violations.push(ToolLifecycleViolation {
            code: "tool_event_owner_mismatch",
            event_id: event.event_id.clone(),
            tool_call_id: Some(tool_call_id.to_string()),
        });
    }
}

fn same_tool_lifecycle_scope(event: &AgentEvent, candidate: &AgentEvent) -> bool {
    event.session_id == candidate.session_id && event.turn_id == candidate.turn_id
}

fn normalize_event_class(event_type: &str) -> &str {
    match event_type {
        "tool_args" => "tool.args",
        "tool_args_delta" => "tool.args.delta",
        "tool_output_delta" => "tool.output.delta",
        value => value,
    }
}

fn is_policy_event_class(event_class: &str) -> bool {
    is_action_event_class(event_class)
        || matches!(event_class, "permission.denied" | "sandbox.blocked")
}

fn is_action_event_class(event_class: &str) -> bool {
    event_class == "action.required" || is_action_terminal_event_class(event_class)
}

fn normalize_action_aliases(object: &mut Map<String, Value>) {
    if let Some(action_id) = payload_string_from_map(object, &["actionId", "action_id"])
        .or_else(|| payload_string_from_map(object, &["requestId", "request_id"]))
    {
        insert_string_if_absent(object, "actionId", action_id.clone());
        insert_string_if_absent(object, "requestId", action_id);
    }

    if let Some(action_type) = payload_string_from_map(object, &["actionType", "action_type"]) {
        insert_string_if_absent(object, "actionType", action_type);
    }
}

fn normalize_action_required_kind(object: &mut Map<String, Value>) {
    if payload_string_from_map(object, &["actionKind", "action_kind"]).is_some() {
        return;
    }
    let action_type = payload_string_from_map(object, &["actionType", "action_type"])
        .unwrap_or_else(|| "runtime_action".to_string());
    let action_kind = match action_type.as_str() {
        "tool_confirmation" => "approve-tool",
        "ask_user" | "elicitation" => "provide-input",
        _ => "runtime-action",
    };
    object.insert(
        "actionKind".to_string(),
        Value::String(action_kind.to_string()),
    );
}

fn active_tool_call_id_for_action(
    existing_events: &[AgentEvent],
    turn_id: Option<&str>,
    action_payload: &Map<String, Value>,
) -> Option<String> {
    let active_tools = active_tools_for_turn(existing_events, turn_id);
    let action_id = action_id_from_map(action_payload);
    if let Some(action_id) = action_id.as_deref() {
        if active_tools.contains_key(action_id) {
            return Some(action_id.to_string());
        }
    }

    let action_tool_name = action_tool_name(action_payload)?;
    let action_arguments = action_arguments(action_payload);
    active_tools
        .iter()
        .find(|(_, tool)| {
            tool.name
                .as_deref()
                .is_some_and(|tool_name| lookup_key(tool_name) == lookup_key(&action_tool_name))
                && action_arguments_match(tool.arguments.as_ref(), action_arguments.as_ref())
        })
        .map(|(tool_call_id, _)| tool_call_id.clone())
}

fn previous_action_tool_call_id(
    existing_events: &[AgentEvent],
    turn_id: Option<&str>,
    action_id: &str,
) -> Option<String> {
    existing_events
        .iter()
        .rev()
        .filter(|event| same_turn(event, turn_id))
        .find(|event| {
            normalize_event_class(&event.event_type) == "action.required"
                && event_action_id(event).as_deref() == Some(action_id)
        })
        .and_then(|event| explicit_tool_call_id(event).or_else(|| tool_call_id(event)))
}

fn active_tools_for_turn(
    existing_events: &[AgentEvent],
    turn_id: Option<&str>,
) -> HashMap<String, ActiveToolCandidate> {
    let mut active_tools = HashMap::new();
    for event in existing_events
        .iter()
        .filter(|event| same_turn(event, turn_id))
    {
        match normalize_event_class(&event.event_type) {
            "tool.started" => {
                if let Some(tool_call_id) = tool_call_id(event) {
                    active_tools.insert(
                        tool_call_id,
                        ActiveToolCandidate {
                            name: string_field(&event.payload, &["toolName", "tool_name", "name"]),
                            arguments: tool_arguments_from_event(event),
                        },
                    );
                }
            }
            "tool.result" | "tool.failed" => {
                if let Some(tool_call_id) = tool_call_id(event) {
                    active_tools.remove(&tool_call_id);
                }
            }
            _ => {}
        }
    }
    active_tools
}

fn same_turn(event: &AgentEvent, turn_id: Option<&str>) -> bool {
    event.turn_id.as_deref() == turn_id
}

fn event_action_id(event: &AgentEvent) -> Option<String> {
    string_field(
        &event.payload,
        &["actionId", "action_id", "requestId", "request_id", "id"],
    )
}

fn action_id_from_map(object: &Map<String, Value>) -> Option<String> {
    payload_string_from_map(
        object,
        &["actionId", "action_id", "requestId", "request_id", "id"],
    )
}

fn action_tool_name(object: &Map<String, Value>) -> Option<String> {
    payload_string_from_map(object, &["toolName", "tool_name"]).or_else(|| {
        object
            .get("data")
            .and_then(Value::as_object)
            .and_then(|data| payload_string_from_map(data, &["toolName", "tool_name"]))
    })
}

fn action_arguments(object: &Map<String, Value>) -> Option<Value> {
    object
        .get("arguments")
        .cloned()
        .or_else(|| object.get("data")?.as_object()?.get("arguments").cloned())
}

fn tool_arguments_from_event(event: &AgentEvent) -> Option<Value> {
    event
        .payload
        .get("arguments")
        .and_then(normalize_arguments_value)
        .or_else(|| event.payload.get("args").cloned())
}

fn normalize_arguments_value(value: &Value) -> Option<Value> {
    match value {
        Value::String(text) => serde_json::from_str(text)
            .ok()
            .or_else(|| Some(value.clone())),
        other => Some(other.clone()),
    }
}

fn action_arguments_match(
    tool_arguments: Option<&Value>,
    action_arguments: Option<&Value>,
) -> bool {
    match (tool_arguments, action_arguments) {
        (Some(left), Some(right)) => canonical_json(left) == canonical_json(right),
        (_, None) => true,
        _ => false,
    }
}

fn canonical_json(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}

fn lookup_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect()
}

fn payload_string_from_map(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn insert_string_if_absent(object: &mut Map<String, Value>, key: &str, value: String) {
    if object
        .get(key)
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty())
    {
        return;
    }
    object.insert(key.to_string(), Value::String(value));
}

fn tool_call_id(event: &AgentEvent) -> Option<String> {
    string_field(
        &event.payload,
        &["toolCallId", "tool_call_id", "toolId", "tool_id", "id"],
    )
}

fn explicit_tool_call_id(event: &AgentEvent) -> Option<String> {
    string_field(
        &event.payload,
        &["toolCallId", "tool_call_id", "toolId", "tool_id"],
    )
}

fn action_id(event: &AgentEvent) -> Option<String> {
    string_field(
        &event.payload,
        &["actionId", "action_id", "requestId", "request_id"],
    )
}

fn is_action_terminal_event_class(event_class: &str) -> bool {
    matches!(
        event_class,
        "action.resolved" | "action.cancelled" | "action.canceled" | "action.expired"
    )
}

fn action_denies_tool(event: &AgentEvent) -> bool {
    let event_class = normalize_event_class(&event.event_type);
    if matches!(
        event_class,
        "action.cancelled" | "action.canceled" | "action.expired"
    ) {
        return true;
    }
    let Some(object) = event.payload.as_object() else {
        return false;
    };
    ["decision", "status", "result"]
        .iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .map(|value| {
            matches!(
                value,
                "deny" | "denied" | "reject" | "rejected" | "cancel" | "canceled" | "cancelled"
            )
        })
        .unwrap_or(false)
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn format_violation(violation: &ToolLifecycleViolation) -> String {
    match violation.tool_call_id.as_deref() {
        Some(tool_call_id) => format!(
            "{} event_id={} tool_call_id={}",
            violation.code, violation.event_id, tool_call_id
        ),
        None => format!("{} event_id={}", violation.code, violation.event_id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event(event_id: &str, event_type: &str, payload: Value) -> AgentEvent {
        AgentEvent {
            event_id: event_id.to_string(),
            sequence: 1,
            session_id: "sess_test".to_string(),
            thread_id: Some("thread_test".to_string()),
            turn_id: Some("turn_test".to_string()),
            event_type: event_type.to_string(),
            timestamp: "2026-06-13T00:00:00.000Z".to_string(),
            payload,
        }
    }

    #[test]
    fn rejects_tool_args_without_active_tool() {
        let candidate = event(
            "evt_args",
            "tool.args",
            json!({ "toolCallId": "tool_1", "args": {} }),
        );

        let error = validate_tool_lifecycle_event(&[], &candidate)
            .expect_err("tool args without active tool should fail");
        assert!(error.contains("tool_args_without_start"));
    }

    #[test]
    fn allows_tool_args_between_start_and_result() {
        let existing = vec![event(
            "evt_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        )];
        let candidate = event(
            "evt_args",
            "tool.args.delta",
            json!({ "toolCallId": "tool_1", "delta": "{}" }),
        );

        validate_tool_lifecycle_event(&existing, &candidate).expect("active tool args");
    }

    #[test]
    fn rejects_policy_event_for_inactive_tool() {
        let existing = vec![
            event(
                "evt_start",
                "tool.started",
                json!({ "toolCallId": "tool_1" }),
            ),
            event(
                "evt_result",
                "tool.result",
                json!({ "toolCallId": "tool_1" }),
            ),
        ];
        let candidate = event(
            "evt_sandbox",
            "sandbox.blocked",
            json!({ "toolCallId": "tool_1", "reasonCode": "sandbox_denied" }),
        );

        let error = validate_tool_lifecycle_event(&existing, &candidate)
            .expect_err("policy event for completed tool should fail");
        assert!(error.contains("tool_policy_event_without_active_tool"));
    }

    #[test]
    fn rejects_tool_output_before_action_resolution() {
        let existing = vec![
            event(
                "evt_start",
                "tool.started",
                json!({ "toolCallId": "tool_1" }),
            ),
            event(
                "evt_action",
                "action.required",
                json!({
                    "actionId": "action_1",
                    "toolCallId": "tool_1"
                }),
            ),
        ];
        let candidate = event(
            "evt_output",
            "tool.output.delta",
            json!({ "toolCallId": "tool_1", "delta": "running" }),
        );

        let error = validate_tool_lifecycle_event(&existing, &candidate)
            .expect_err("tool output before approval should fail");
        assert!(error.contains("tool_output_before_action_resolved"));
    }

    #[test]
    fn allows_tool_result_after_action_resolution() {
        let existing = vec![
            event(
                "evt_start",
                "tool.started",
                json!({ "toolCallId": "tool_1" }),
            ),
            event(
                "evt_action",
                "action.required",
                json!({
                    "actionId": "action_1",
                    "toolCallId": "tool_1"
                }),
            ),
            event(
                "evt_action_resolved",
                "action.resolved",
                json!({
                    "actionId": "action_1",
                    "toolCallId": "tool_1",
                    "decision": "approve"
                }),
            ),
        ];
        let candidate = event(
            "evt_result",
            "tool.result",
            json!({ "toolCallId": "tool_1", "output": "ok" }),
        );

        validate_tool_lifecycle_event(&existing, &candidate)
            .expect("approved tool result should pass");
    }

    #[test]
    fn rejects_tool_result_after_action_denial() {
        let existing = vec![
            event(
                "evt_start",
                "tool.started",
                json!({ "toolCallId": "tool_1" }),
            ),
            event(
                "evt_action",
                "action.required",
                json!({
                    "actionId": "action_1",
                    "toolCallId": "tool_1"
                }),
            ),
            event(
                "evt_action_denied",
                "action.canceled",
                json!({
                    "actionId": "action_1",
                    "toolCallId": "tool_1"
                }),
            ),
        ];
        let candidate = event(
            "evt_result",
            "tool.result",
            json!({ "toolCallId": "tool_1", "output": "should not run" }),
        );

        let error = validate_tool_lifecycle_event(&existing, &candidate)
            .expect_err("denied tool result should fail");
        assert!(error.contains("tool_result_after_action_denied"));
    }

    #[test]
    fn allows_tool_result_with_matching_owner() {
        let existing = vec![event(
            "evt_start",
            "tool.started",
            json!({
                "toolCallId": "tool_1",
                "messageId": "assistant_1",
                "itemId": "item_1"
            }),
        )];
        let candidate = event(
            "evt_result",
            "tool.result",
            json!({
                "toolCallId": "tool_1",
                "assistantMessageId": "assistant_1",
                "itemId": "item_1",
                "output": "ok"
            }),
        );

        validate_tool_lifecycle_event(&existing, &candidate)
            .expect("matching tool owner should pass");
    }

    #[test]
    fn rejects_tool_result_owner_mismatch() {
        let existing = vec![event(
            "evt_start",
            "tool.started",
            json!({
                "toolCallId": "tool_1",
                "messageId": "assistant_1"
            }),
        )];
        let candidate = event(
            "evt_result",
            "tool.result",
            json!({
                "toolCallId": "tool_1",
                "messageId": "assistant_2",
                "output": "wrong owner"
            }),
        );

        let error = validate_tool_lifecycle_event(&existing, &candidate)
            .expect_err("mismatched tool owner should fail");
        assert!(error.contains("tool_event_owner_mismatch"));
    }

    #[test]
    fn rejects_tool_result_missing_owner_when_start_has_owner() {
        let existing = vec![event(
            "evt_start",
            "tool.started",
            json!({
                "toolCallId": "tool_1",
                "messageId": "assistant_1"
            }),
        )];
        let candidate = event(
            "evt_result",
            "tool.result",
            json!({ "toolCallId": "tool_1", "output": "missing owner" }),
        );

        let error = validate_tool_lifecycle_event(&existing, &candidate)
            .expect_err("owned tool terminal without owner should fail");
        assert!(error.contains("tool_terminal_missing_owner"));
    }

    #[test]
    fn rejects_tool_output_owner_mismatch() {
        let existing = vec![event(
            "evt_start",
            "tool.started",
            json!({
                "toolCallId": "tool_1",
                "itemId": "item_1"
            }),
        )];
        let candidate = event(
            "evt_output",
            "tool.output.delta",
            json!({
                "toolCallId": "tool_1",
                "itemId": "item_2",
                "delta": "wrong owner"
            }),
        );

        let error = validate_tool_lifecycle_event(&existing, &candidate)
            .expect_err("mismatched output owner should fail");
        assert!(error.contains("tool_event_owner_mismatch"));
    }

    #[test]
    fn normalizes_action_required_with_matching_active_tool() {
        let existing = vec![event(
            "evt_start",
            "tool.started",
            json!({
                "toolCallId": "tool_shell",
                "toolName": "Bash",
                "arguments": {
                    "command": "npm test"
                }
            }),
        )];

        let normalized = normalize_policy_event_payload(
            &existing,
            Some("turn_test"),
            "action.required",
            json!({
                "requestId": "approval_1",
                "actionType": "tool_confirmation",
                "data": {
                    "tool_name": "Bash",
                    "arguments": {
                        "command": "npm test"
                    }
                }
            }),
        );

        assert_eq!(normalized["actionId"].as_str(), Some("approval_1"));
        assert_eq!(normalized["requestId"].as_str(), Some("approval_1"));
        assert_eq!(normalized["toolCallId"].as_str(), Some("tool_shell"));
        assert_eq!(normalized["actionKind"].as_str(), Some("approve-tool"));
    }

    #[test]
    fn normalizes_action_resolved_from_previous_action_required_tool() {
        let existing = vec![
            event(
                "evt_start",
                "tool.started",
                json!({ "toolCallId": "tool_shell", "toolName": "Bash" }),
            ),
            event(
                "evt_action",
                "action.required",
                json!({
                    "actionId": "approval_1",
                    "requestId": "approval_1",
                    "toolCallId": "tool_shell",
                    "actionType": "tool_confirmation"
                }),
            ),
        ];

        let normalized = normalize_policy_event_payload(
            &existing,
            Some("turn_test"),
            "action.resolved",
            json!({
                "requestId": "approval_1",
                "actionType": "tool_confirmation",
                "decision": "approve"
            }),
        );
        let candidate = event("evt_resolved", "action.resolved", normalized);

        assert_eq!(candidate.payload["toolCallId"].as_str(), Some("tool_shell"));
        validate_tool_lifecycle_event(&existing, &candidate)
            .expect("resolved action with inferred tool id should pass");
    }
}
