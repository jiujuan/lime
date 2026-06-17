use super::codex::events::ImportedRuntimeEvent;
use serde_json::{json, Value};
use std::collections::BTreeSet;

const DEFAULT_MATERIALIZED_COMMAND_TOOL_CALLS_PER_THREAD: usize = 80;
const DEFAULT_MATERIALIZED_OTHER_TOOL_CALLS_PER_THREAD: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ImportedRuntimeEventProjectionSummary {
    pub(super) source_runtime_events: usize,
    pub(super) materialized_runtime_events: usize,
    pub(super) sidecar_runtime_events: usize,
    pub(super) materialized_command_tool_calls: usize,
    pub(super) materialized_other_tool_calls: usize,
    pub(super) skipped_command_tool_calls: usize,
    pub(super) skipped_other_tool_calls: usize,
    pub(super) command_tool_call_limit: usize,
    pub(super) other_tool_call_limit: usize,
}

impl Default for ImportedRuntimeEventProjectionSummary {
    fn default() -> Self {
        Self {
            source_runtime_events: 0,
            materialized_runtime_events: 0,
            sidecar_runtime_events: 0,
            materialized_command_tool_calls: 0,
            materialized_other_tool_calls: 0,
            skipped_command_tool_calls: 0,
            skipped_other_tool_calls: 0,
            command_tool_call_limit: DEFAULT_MATERIALIZED_COMMAND_TOOL_CALLS_PER_THREAD,
            other_tool_call_limit: DEFAULT_MATERIALIZED_OTHER_TOOL_CALLS_PER_THREAD,
        }
    }
}

impl ImportedRuntimeEventProjectionSummary {
    pub(super) fn merge(&mut self, turn: &ImportedRuntimeEventProjectionSummary) {
        self.source_runtime_events += turn.source_runtime_events;
        self.materialized_runtime_events += turn.materialized_runtime_events;
        self.sidecar_runtime_events += turn.sidecar_runtime_events;
        self.materialized_command_tool_calls += turn.materialized_command_tool_calls;
        self.materialized_other_tool_calls += turn.materialized_other_tool_calls;
        self.skipped_command_tool_calls += turn.skipped_command_tool_calls;
        self.skipped_other_tool_calls += turn.skipped_other_tool_calls;
    }
}

pub(super) fn materialize_imported_runtime_events_for_default_projection(
    events: Vec<ImportedRuntimeEvent>,
) -> (
    Vec<ImportedRuntimeEvent>,
    ImportedRuntimeEventProjectionSummary,
) {
    let mut selector = ImportedRuntimeEventProjectionSelector::new(
        DEFAULT_MATERIALIZED_COMMAND_TOOL_CALLS_PER_THREAD,
        DEFAULT_MATERIALIZED_OTHER_TOOL_CALLS_PER_THREAD,
    );
    let source_runtime_events = events.len();
    let events = events
        .into_iter()
        .filter(|event| selector.should_materialize(event))
        .collect::<Vec<_>>();
    let mut summary = selector.finish();
    summary.source_runtime_events = source_runtime_events;
    summary.materialized_runtime_events = events.len();
    summary.sidecar_runtime_events = source_runtime_events.saturating_sub(events.len());
    (events, summary)
}

struct ImportedRuntimeEventProjectionSelector {
    command_tool_call_limit: usize,
    other_tool_call_limit: usize,
    materialized_command_tool_calls: usize,
    materialized_other_tool_calls: usize,
    skipped_command_tool_calls: usize,
    skipped_other_tool_calls: usize,
    materialized_tool_call_ids: BTreeSet<String>,
    skipped_tool_call_ids: BTreeSet<String>,
    materialized_patch_ids: BTreeSet<String>,
    materialized_action_ids: BTreeSet<String>,
}

impl ImportedRuntimeEventProjectionSelector {
    fn new(command_tool_call_limit: usize, other_tool_call_limit: usize) -> Self {
        Self {
            command_tool_call_limit,
            other_tool_call_limit,
            materialized_command_tool_calls: 0,
            materialized_other_tool_calls: 0,
            skipped_command_tool_calls: 0,
            skipped_other_tool_calls: 0,
            materialized_tool_call_ids: BTreeSet::new(),
            skipped_tool_call_ids: BTreeSet::new(),
            materialized_patch_ids: BTreeSet::new(),
            materialized_action_ids: BTreeSet::new(),
        }
    }

    fn should_materialize(&mut self, event: &ImportedRuntimeEvent) -> bool {
        match event.event_type {
            "tool.started" | "tool.result" | "tool.failed" => {
                self.should_materialize_tool_event(event)
            }
            "command.started" | "command.output" | "command.exited" => {
                self.should_materialize_command_event(event)
            }
            "patch.started" | "patch.applied" | "patch.failed" => {
                self.should_materialize_patch_event(event)
            }
            "action.required" | "action.resolved" | "action.cancelled" | "action.canceled"
            | "action.expired" => self.should_materialize_action_event(event),
            _ => true,
        }
    }

    fn should_materialize_tool_event(&mut self, event: &ImportedRuntimeEvent) -> bool {
        let tool_call_id = tool_payload_id(&event.payload)
            .unwrap_or_else(|| format!("missing-tool-call:{}", event.event_type));
        if self.materialized_tool_call_ids.contains(&tool_call_id) {
            return true;
        }
        if self.skipped_tool_call_ids.contains(&tool_call_id) {
            return false;
        }

        let is_command = string_payload(&event.payload, &["toolName", "tool_name", "name"])
            .as_deref()
            .is_some_and(is_command_tool_name);
        if is_command {
            if self.materialized_command_tool_calls < self.command_tool_call_limit {
                self.materialized_command_tool_calls += 1;
                self.materialized_tool_call_ids.insert(tool_call_id);
                true
            } else {
                self.skipped_command_tool_calls += 1;
                self.skipped_tool_call_ids.insert(tool_call_id);
                false
            }
        } else if self.materialized_other_tool_calls < self.other_tool_call_limit {
            self.materialized_other_tool_calls += 1;
            self.materialized_tool_call_ids.insert(tool_call_id);
            true
        } else {
            self.skipped_other_tool_calls += 1;
            self.skipped_tool_call_ids.insert(tool_call_id);
            false
        }
    }

    fn should_materialize_command_event(&self, event: &ImportedRuntimeEvent) -> bool {
        match command_payload_id(&event.payload) {
            Some(command_id) => self.materialized_tool_call_ids.contains(&command_id),
            None => true,
        }
    }

    fn should_materialize_patch_event(&mut self, event: &ImportedRuntimeEvent) -> bool {
        let Some(patch_id) = string_payload(&event.payload, &["patchId", "patch_id"]) else {
            return true;
        };
        if self.materialized_patch_ids.contains(&patch_id) {
            return true;
        }
        if string_payload(&event.payload, &["toolCallId", "tool_call_id"])
            .is_some_and(|tool_call_id| self.skipped_tool_call_ids.contains(&tool_call_id))
        {
            return false;
        }
        self.materialized_patch_ids.insert(patch_id);
        true
    }

    fn should_materialize_action_event(&mut self, event: &ImportedRuntimeEvent) -> bool {
        let Some(action_id) = string_payload(
            &event.payload,
            &["actionId", "action_id", "requestId", "request_id"],
        ) else {
            return true;
        };
        if self.materialized_action_ids.contains(&action_id) {
            return true;
        }
        if self.skipped_tool_call_ids.contains(&action_id) {
            return false;
        }
        self.materialized_action_ids.insert(action_id);
        true
    }

    fn finish(self) -> ImportedRuntimeEventProjectionSummary {
        ImportedRuntimeEventProjectionSummary {
            source_runtime_events: 0,
            materialized_runtime_events: 0,
            sidecar_runtime_events: 0,
            materialized_command_tool_calls: self.materialized_command_tool_calls,
            materialized_other_tool_calls: self.materialized_other_tool_calls,
            skipped_command_tool_calls: self.skipped_command_tool_calls,
            skipped_other_tool_calls: self.skipped_other_tool_calls,
            command_tool_call_limit: self.command_tool_call_limit,
            other_tool_call_limit: self.other_tool_call_limit,
        }
    }
}

pub(super) struct ImportedRuntimeEventNormalizer {
    active_tools: BTreeSet<String>,
    active_patches: BTreeSet<String>,
    active_actions: BTreeSet<String>,
    active_commands: BTreeSet<String>,
    has_terminal_event: bool,
}

impl ImportedRuntimeEventNormalizer {
    pub(super) fn new() -> Self {
        Self {
            active_tools: BTreeSet::new(),
            active_patches: BTreeSet::new(),
            active_actions: BTreeSet::new(),
            active_commands: BTreeSet::new(),
            has_terminal_event: false,
        }
    }

    pub(super) fn push(&mut self, event: ImportedRuntimeEvent) -> Vec<ImportedRuntimeEvent> {
        let mut normalized = Vec::new();
        match event.event_type {
            "tool.started" => {
                if let Some(tool_call_id) = string_payload(&event.payload, &["toolCallId"]) {
                    self.active_tools.insert(tool_call_id);
                }
                normalized.push(event);
            }
            "tool.result" | "tool.failed" => {
                let tool_call_id = string_payload(&event.payload, &["toolCallId"]);
                if let Some(tool_call_id) = tool_call_id.as_deref() {
                    if !self.active_tools.remove(tool_call_id) {
                        normalized.push(imported_tool_start_from_terminal(tool_call_id, &event));
                    }
                    if self.active_commands.remove(tool_call_id) {
                        normalized.push(imported_command_output_from_tool_terminal(
                            tool_call_id,
                            &event,
                        ));
                        normalized.push(imported_command_exited_from_tool_terminal(
                            tool_call_id,
                            &event,
                        ));
                    }
                }
                normalized.push(event);
            }
            "patch.started" => {
                if let Some(patch_id) = string_payload(&event.payload, &["patchId", "patch_id"]) {
                    self.active_patches.insert(patch_id);
                }
                normalized.push(event);
            }
            "patch.applied" | "patch.failed" => {
                let patch_id = string_payload(&event.payload, &["patchId", "patch_id"]);
                if let Some(patch_id) = patch_id.as_deref() {
                    if !self.active_patches.remove(patch_id) {
                        normalized.push(imported_patch_start_from_terminal(patch_id, &event));
                    }
                }
                normalized.push(event);
            }
            "command.started" => {
                if let Some(command_id) = string_payload(&event.payload, &["commandId"]) {
                    self.active_commands.insert(command_id);
                }
                normalized.push(event);
            }
            "command.output" => normalized.push(event),
            "command.exited" => {
                if let Some(command_id) = string_payload(&event.payload, &["commandId"]) {
                    self.active_commands.remove(&command_id);
                }
                normalized.push(event);
            }
            "action.required" => {
                let action_id =
                    string_payload(&event.payload, &["actionId", "action_id", "requestId"]);
                if let Some(action_id) = action_id.as_deref() {
                    self.active_actions.insert(action_id.to_string());
                }
                normalized.push(event);
                if let Some(action_id) = action_id {
                    normalized.push(imported_action_resolved(&action_id));
                    self.active_actions.remove(&action_id);
                }
            }
            "action.resolved" | "action.cancelled" | "action.canceled" | "action.expired" => {
                if let Some(action_id) =
                    string_payload(&event.payload, &["actionId", "action_id", "requestId"])
                {
                    self.active_actions.remove(&action_id);
                }
                normalized.push(event);
            }
            "turn.completed" | "turn.failed" | "turn.canceled" => {
                close_active_imported_lifecycles(
                    &mut normalized,
                    &mut self.active_actions,
                    &mut self.active_commands,
                    &mut self.active_patches,
                    &mut self.active_tools,
                );
                normalized.push(event);
                self.has_terminal_event = true;
            }
            _ => normalized.push(event),
        }
        normalized
    }

    pub(super) fn finish(&mut self) -> Vec<ImportedRuntimeEvent> {
        let mut normalized = Vec::new();
        close_active_imported_lifecycles(
            &mut normalized,
            &mut self.active_actions,
            &mut self.active_commands,
            &mut self.active_patches,
            &mut self.active_tools,
        );
        normalized
    }

    pub(super) fn has_terminal_event(&self) -> bool {
        self.has_terminal_event
    }
}

pub(super) fn enrich_imported_runtime_event_payload(mut payload: Value) -> Value {
    if let Value::Object(ref mut object) = payload {
        object
            .entry("imported".to_string())
            .or_insert_with(|| json!(true));
        object
            .entry("sourceClient".to_string())
            .or_insert_with(|| json!("codex"));
    }
    payload
}

fn close_active_imported_lifecycles(
    normalized: &mut Vec<ImportedRuntimeEvent>,
    active_actions: &mut BTreeSet<String>,
    active_commands: &mut BTreeSet<String>,
    active_patches: &mut BTreeSet<String>,
    active_tools: &mut BTreeSet<String>,
) {
    let actions = std::mem::take(active_actions);
    for action_id in actions {
        normalized.push(imported_action_resolved(&action_id));
    }
    let commands = std::mem::take(active_commands);
    for command_id in commands {
        normalized.push(ImportedRuntimeEvent::new(
            "command.exited",
            json!({
                "commandId": command_id,
                "exitCode": 0,
                "status": "completed",
                "result": "imported_incomplete",
                "failureCategory": "incomplete_import",
                "sourceClient": "codex",
                "sourceEventType": "synthetic_command_exited",
                "importedSynthetic": true,
                "importedIncomplete": true,
            }),
        ));
    }
    let patches = std::mem::take(active_patches);
    for patch_id in patches {
        normalized.push(ImportedRuntimeEvent::new(
            "patch.applied",
            json!({
                "patchId": patch_id,
                "status": "completed",
                "success": true,
                "failureCategory": "incomplete_import",
                "sourceClient": "codex",
                "sourceEventType": "synthetic_patch_applied",
                "importedSynthetic": true,
                "importedIncomplete": true,
            }),
        ));
    }
    let tools = std::mem::take(active_tools);
    for tool_call_id in tools {
        normalized.push(ImportedRuntimeEvent::new(
            "tool.result",
            json!({
                "toolCallId": tool_call_id,
                "status": "completed",
                "success": true,
                "failureCategory": "incomplete_import",
                "sourceClient": "codex",
                "sourceEventType": "synthetic_tool_result",
                "importedSynthetic": true,
                "importedIncomplete": true,
            }),
        ));
    }
}

fn imported_tool_start_from_terminal(
    tool_call_id: &str,
    terminal: &ImportedRuntimeEvent,
) -> ImportedRuntimeEvent {
    ImportedRuntimeEvent::new(
        "tool.started",
        json!({
            "toolCallId": tool_call_id,
            "toolName": string_payload(&terminal.payload, &["toolName", "tool_name", "name"]),
            "name": string_payload(&terminal.payload, &["name", "toolName", "tool_name"]),
            "sourceClient": "codex",
            "sourceEventType": "synthetic_tool_started",
            "importedSynthetic": true,
        }),
    )
}

fn imported_patch_start_from_terminal(
    patch_id: &str,
    terminal: &ImportedRuntimeEvent,
) -> ImportedRuntimeEvent {
    ImportedRuntimeEvent::new(
        "patch.started",
        json!({
            "patchId": patch_id,
            "toolCallId": string_payload(&terminal.payload, &["toolCallId", "tool_call_id"]),
            "paths": terminal.payload.get("paths").cloned(),
            "changedFiles": terminal.payload.get("changedFiles").cloned(),
            "sourceClient": "codex",
            "sourceEventType": "synthetic_patch_started",
            "importedSynthetic": true,
        }),
    )
}

fn imported_command_output_from_tool_terminal(
    command_id: &str,
    terminal: &ImportedRuntimeEvent,
) -> ImportedRuntimeEvent {
    ImportedRuntimeEvent::new(
        "command.output",
        json!({
            "commandId": command_id,
            "toolCallId": command_id,
            "outputRef": format!("output://codex-import/{command_id}"),
            "refIds": [format!("output://codex-import/{command_id}")],
            "outputPreview": string_payload(&terminal.payload, &["outputPreview", "output_preview", "output"]),
            "summary": string_payload(&terminal.payload, &["outputPreview", "output_preview", "output"]),
            "sourceClient": "codex",
            "sourceEventType": "synthetic_command_output",
            "importedSynthetic": true,
        }),
    )
}

fn imported_command_exited_from_tool_terminal(
    command_id: &str,
    terminal: &ImportedRuntimeEvent,
) -> ImportedRuntimeEvent {
    let output = string_payload(&terminal.payload, &["output"]).unwrap_or_default();
    let exit_code = parse_exit_code(&output).unwrap_or_else(|| {
        if terminal.event_type == "tool.failed" {
            1
        } else {
            0
        }
    });
    ImportedRuntimeEvent::new(
        "command.exited",
        json!({
            "commandId": command_id,
            "toolCallId": command_id,
            "exitCode": exit_code,
            "result": if exit_code == 0 { "passed" } else { "failed" },
            "sourceClient": "codex",
            "sourceEventType": "synthetic_command_exited",
            "importedSynthetic": true,
        }),
    )
}

fn imported_action_resolved(action_id: &str) -> ImportedRuntimeEvent {
    ImportedRuntimeEvent::new(
        "action.resolved",
        json!({
            "actionId": action_id,
            "requestId": action_id,
            "actionType": "tool_confirmation",
            "decision": "imported_read_only",
            "sourceClient": "codex",
            "sourceEventType": "synthetic_action_resolved",
            "importedSynthetic": true,
            "importedReadOnly": true,
        }),
    )
}

fn string_payload(payload: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| payload.get(*key).and_then(Value::as_str))
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
}

fn tool_payload_id(payload: &Value) -> Option<String> {
    string_payload(
        payload,
        &["toolCallId", "tool_call_id", "toolId", "tool_id", "id"],
    )
}

fn command_payload_id(payload: &Value) -> Option<String> {
    string_payload(
        payload,
        &[
            "commandId",
            "command_id",
            "toolCallId",
            "tool_call_id",
            "id",
        ],
    )
}

fn is_command_tool_name(value: &str) -> bool {
    matches!(value, "exec_command" | "shell" | "bash")
}

fn parse_exit_code(output: &str) -> Option<i64> {
    output.lines().find_map(|line| {
        line.strip_prefix("Exit code:")
            .and_then(|value| value.trim().parse::<i64>().ok())
    })
}
