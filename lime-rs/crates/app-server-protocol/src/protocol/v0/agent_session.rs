use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionStartParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub business_object_ref: Option<BusinessObjectRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionStartResponse {
    pub session: AgentSession,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReadParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_limit: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_offset: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_before_message_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReadResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionMediaReadParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(
        default,
        alias = "ref",
        alias = "ref_id",
        skip_serializing_if = "Option::is_none"
    )]
    pub ref_id: Option<String>,
    #[serde(
        default,
        alias = "sidecar_ref",
        skip_serializing_if = "Option::is_none"
    )]
    pub sidecar_ref: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub length: Option<u64>,
    #[serde(default)]
    pub stream: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionMediaReadResponse {
    pub session_id: String,
    pub uri: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    pub bytes: u64,
    pub total_bytes: u64,
    pub offset: u64,
    pub length: u64,
    pub content_range: String,
    pub has_more: bool,
    pub sha256: String,
    pub content_base64: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidecar_ref: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionToolInventoryReadParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caller: Option<String>,
    #[serde(default)]
    pub workbench: bool,
    #[serde(default)]
    pub browser_assist: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionToolInventoryReadResponse {
    pub inventory: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnStartParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub input: AgentInput,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_options: Option<RuntimeOptions>,
    #[serde(default)]
    pub queue_if_busy: bool,
    #[serde(default)]
    pub skip_pre_submit_resume: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnStartResponse {
    pub turn: AgentTurn,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnCancelParams {
    pub session_id: String,
    pub turn_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnCancelResponse {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AgentSessionActionType {
    ToolConfirmation,
    AskUser,
    Elicitation,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionScope {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionReplayParams {
    pub session_id: String,
    pub request_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReplayedActionRequired {
    #[serde(rename = "type")]
    pub event_type: String,
    pub request_id: String,
    pub action_type: AgentSessionActionType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arguments: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub questions: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requested_schema: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<AgentSessionActionScope>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionReplayResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<AgentSessionReplayedActionRequired>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionRespondParams {
    pub session_id: String,
    pub request_id: String,
    pub action_type: AgentSessionActionType,
    pub confirmed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_data: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action_scope: Option<AgentSessionActionScope>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionRespondResponse {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionRuntimeEventAppendParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default)]
    pub runtime_events: Vec<AgentSessionRuntimeEventInput>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionRuntimeEventInput {
    #[serde(rename = "type", alias = "eventType", alias = "event_type")]
    pub event_type: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionRuntimeEventAppendResponse {
    #[serde(default)]
    pub events: Vec<AgentEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionEventParams {
    pub event: AgentEvent,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub typed_event: Option<AgentSessionRuntimeEventNotification>,
}

impl AgentSessionEventParams {
    pub fn from_event(event: AgentEvent) -> Self {
        let typed_event = AgentSessionRuntimeEventNotification::from_agent_event(&event);
        Self { event, typed_event }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "params")]
pub enum AgentSessionRuntimeEventNotification {
    #[serde(rename = "message/created")]
    MessageCreated(AgentSessionMessageCreatedNotification),
    #[serde(rename = "turn/accepted")]
    TurnAccepted(AgentSessionTurnLifecycleNotification),
    #[serde(rename = "turn/started")]
    TurnStarted(AgentSessionTurnLifecycleNotification),
    #[serde(rename = "turn/completed")]
    TurnCompleted(AgentSessionTurnLifecycleNotification),
    #[serde(rename = "turn/failed")]
    TurnFailed(AgentSessionTurnLifecycleNotification),
    #[serde(rename = "item/agentMessage/delta")]
    AgentMessageDelta(AgentSessionAgentMessageDeltaNotification),
    #[serde(rename = "item/started")]
    ItemStarted(AgentSessionItemLifecycleNotification),
    #[serde(rename = "item/completed")]
    ItemCompleted(AgentSessionItemLifecycleNotification),
}

impl AgentSessionRuntimeEventNotification {
    pub fn from_agent_event(event: &AgentEvent) -> Option<Self> {
        match event.event_type.as_str() {
            "message.created" => Some(Self::MessageCreated(
                AgentSessionMessageCreatedNotification::from_agent_event(event),
            )),
            "turn.accepted" => Some(Self::TurnAccepted(turn_lifecycle_notification(
                event,
                AgentTurnStatus::Accepted,
            ))),
            "turn.started" => Some(Self::TurnStarted(turn_lifecycle_notification(
                event,
                AgentTurnStatus::Running,
            ))),
            "turn.completed" => Some(Self::TurnCompleted(turn_lifecycle_notification(
                event,
                AgentTurnStatus::Completed,
            ))),
            "turn.failed" => Some(Self::TurnFailed(turn_lifecycle_notification(
                event,
                AgentTurnStatus::Failed,
            ))),
            "message.delta" | "message.delta_batch" | "message.batch" => {
                AgentSessionAgentMessageDeltaNotification::from_agent_event(event)
                    .map(Self::AgentMessageDelta)
            }
            "item.started" => AgentSessionItemLifecycleNotification::from_agent_event(event, None)
                .map(Self::ItemStarted),
            "item.completed" => AgentSessionItemLifecycleNotification::from_agent_event(
                event,
                Some("completed".to_string()),
            )
            .map(Self::ItemCompleted),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionMessageCreatedNotification {
    pub event_id: String,
    pub sequence: u64,
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub timestamp: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input: Option<AgentInput>,
}

impl AgentSessionMessageCreatedNotification {
    fn from_agent_event(event: &AgentEvent) -> Self {
        let input = agent_input_from_payload(&event.payload);
        let text = input
            .as_ref()
            .map(|input| input.text.clone())
            .filter(|text| !text.trim().is_empty())
            .or_else(|| text_from_payload(&event.payload));
        Self {
            event_id: event.event_id.clone(),
            sequence: event.sequence,
            session_id: event.session_id.clone(),
            thread_id: event.thread_id.clone(),
            turn_id: event.turn_id.clone(),
            timestamp: event.timestamp.clone(),
            role: string_field(&event.payload, &["role"]),
            text,
            input,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnLifecycleNotification {
    pub event_id: String,
    pub sequence: u64,
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub timestamp: String,
    pub status: AgentTurnStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionAgentMessageDeltaNotification {
    pub event_id: String,
    pub sequence: u64,
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub timestamp: String,
    pub item_id: String,
    pub delta: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

impl AgentSessionAgentMessageDeltaNotification {
    fn from_agent_event(event: &AgentEvent) -> Option<Self> {
        let item_id = string_field(&event.payload, &["itemId", "item_id"])?;
        let delta = text_from_payload(&event.payload)?;
        Some(Self {
            event_id: event.event_id.clone(),
            sequence: event.sequence,
            session_id: event.session_id.clone(),
            thread_id: event.thread_id.clone(),
            turn_id: event.turn_id.clone(),
            timestamp: event.timestamp.clone(),
            item_id,
            delta,
            phase: string_field(&event.payload, &["phase", "messagePhase", "message_phase"]),
            source: string_field(&event.payload, &["source"]),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionItemLifecycleNotification {
    pub event_id: String,
    pub sequence: u64,
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub timestamp: String,
    pub item_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

impl AgentSessionItemLifecycleNotification {
    fn from_agent_event(event: &AgentEvent, default_status: Option<String>) -> Option<Self> {
        let item = event.payload.get("item").unwrap_or(&event.payload);
        let payload = item.get("payload").unwrap_or(item);
        let item_id = string_field(item, &["id", "itemId", "item_id"])
            .or_else(|| string_field(payload, &["id", "itemId", "item_id"]))
            .or_else(|| string_field(&event.payload, &["id", "itemId", "item_id"]))?;
        Some(Self {
            event_id: event.event_id.clone(),
            sequence: event.sequence,
            session_id: event.session_id.clone(),
            thread_id: event.thread_id.clone(),
            turn_id: event.turn_id.clone(),
            timestamp: event.timestamp.clone(),
            item_id,
            item_type: string_field(item, &["type", "kind"])
                .or_else(|| string_field(payload, &["type", "kind"])),
            status: string_field(item, &["status"])
                .or_else(|| string_field(payload, &["status"]))
                .or(default_status),
        })
    }
}

fn turn_lifecycle_notification(
    event: &AgentEvent,
    status: AgentTurnStatus,
) -> AgentSessionTurnLifecycleNotification {
    AgentSessionTurnLifecycleNotification {
        event_id: event.event_id.clone(),
        sequence: event.sequence,
        session_id: event.session_id.clone(),
        thread_id: event.thread_id.clone(),
        turn_id: event.turn_id.clone(),
        timestamp: event.timestamp.clone(),
        status,
    }
}

fn agent_input_from_payload(payload: &serde_json::Value) -> Option<AgentInput> {
    payload
        .get("input")
        .cloned()
        .and_then(|input| serde_json::from_value::<AgentInput>(input).ok())
        .or_else(|| {
            text_from_payload(payload).map(|text| AgentInput {
                text,
                attachments: Vec::new(),
            })
        })
}

fn text_from_payload(payload: &serde_json::Value) -> Option<String> {
    value_as_string(payload)
        .or_else(|| {
            string_field(
                payload,
                &[
                    "text",
                    "delta",
                    "content",
                    "message",
                    "outputText",
                    "output_text",
                ],
            )
        })
        .or_else(|| {
            payload.get("input").and_then(|input| {
                value_as_string(input).or_else(|| string_field(input, &["text", "message"]))
            })
        })
        .or_else(|| {
            payload.get("content").and_then(|content| {
                value_as_string(content).or_else(|| string_field(content, &["text", "message"]))
            })
        })
}

fn string_field(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    keys.iter()
        .find_map(|key| object.get(*key).and_then(value_as_string))
}

fn value_as_string(value: &serde_json::Value) -> Option<String> {
    let text = value.as_str()?.trim();
    (!text.is_empty()).then(|| text.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event(event_type: &str, payload: serde_json::Value) -> AgentEvent {
        AgentEvent {
            event_id: "evt_1".to_string(),
            sequence: 7,
            session_id: "sess_1".to_string(),
            thread_id: Some("thread_1".to_string()),
            turn_id: Some("turn_1".to_string()),
            event_type: event_type.to_string(),
            timestamp: "2026-07-05T00:00:00Z".to_string(),
            payload,
        }
    }

    #[test]
    fn message_delta_with_item_id_projects_to_typed_agent_message_delta() {
        let notification = AgentSessionRuntimeEventNotification::from_agent_event(&event(
            "message.delta",
            json!({
                "itemId": "item_final_1",
                "text": "hello",
                "phase": "final_answer",
                "source": "runtime",
            }),
        ))
        .expect("typed event");

        assert_eq!(
            serde_json::to_value(notification).expect("serialize"),
            json!({
                "method": "item/agentMessage/delta",
                "params": {
                    "eventId": "evt_1",
                    "sequence": 7,
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "turnId": "turn_1",
                    "timestamp": "2026-07-05T00:00:00Z",
                    "itemId": "item_final_1",
                    "delta": "hello",
                    "phase": "final_answer",
                    "source": "runtime"
                }
            })
        );
    }

    #[test]
    fn message_delta_without_item_id_stays_legacy_event_only() {
        let notification = AgentSessionRuntimeEventNotification::from_agent_event(&event(
            "message.delta",
            json!({
                "text": "legacy text",
            }),
        ));

        assert_eq!(notification, None);
    }

    #[test]
    fn event_params_include_typed_turn_terminal_projection() {
        let params = AgentSessionEventParams::from_event(event("turn.completed", json!({})));

        assert!(matches!(
            params.typed_event,
            Some(AgentSessionRuntimeEventNotification::TurnCompleted(_))
        ));
        assert_eq!(params.event.event_type, "turn.completed");
    }

    #[test]
    fn turn_failed_projects_to_typed_turn_terminal_projection() {
        let params = AgentSessionEventParams::from_event(event("turn.failed", json!({})));

        assert!(matches!(
            &params.typed_event,
            Some(AgentSessionRuntimeEventNotification::TurnFailed(_))
        ));
        assert_eq!(
            serde_json::to_value(&params.typed_event).expect("serialize"),
            json!({
                "method": "turn/failed",
                "params": {
                    "eventId": "evt_1",
                    "sequence": 7,
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "turnId": "turn_1",
                    "timestamp": "2026-07-05T00:00:00Z",
                    "status": "failed"
                }
            })
        );
        assert_eq!(params.event.event_type, "turn.failed");
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BusinessObjectRef {
    pub kind: String,
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum AgentSessionStatus {
    Idle,
    Running,
    WaitingAction,
    Completed,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub session_id: String,
    pub thread_id: String,
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub business_object_ref: Option<BusinessObjectRef>,
    pub status: AgentSessionStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum AgentTurnStatus {
    Accepted,
    Queued,
    Running,
    WaitingAction,
    Completed,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurn {
    pub turn_id: String,
    pub session_id: String,
    pub thread_id: String,
    pub status: AgentTurnStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentInput {
    pub text: String,
    #[serde(default)]
    pub attachments: Vec<AgentAttachment>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAttachment {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AgentThreadContentReference {
    pub uri: String,
    pub mime_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
    #[serde(default, alias = "sidecarRef", skip_serializing_if = "Option::is_none")]
    pub sidecar_ref: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub byte_size: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentThreadMessageContentPart {
    Text {
        text: String,
    },
    Media {
        kind: String,
        reference: AgentThreadContentReference,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        caption: Option<String>,
    },
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capability_id: Option<String>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_preference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_preference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queued_turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_options: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_output: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured_output: Option<StructuredOutputContract>,
    #[serde(
        default,
        rename = "outputSchema",
        alias = "output_schema",
        skip_serializing_if = "Option::is_none"
    )]
    pub output_schema: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StructuredOutputContract {
    #[serde(default, rename = "type", skip_serializing_if = "Option::is_none")]
    pub contract_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_validation_retries: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure_subtype: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub materializer: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    pub event_id: String,
    pub sequence: u64,
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(rename = "type")]
    pub event_type: String,
    pub timestamp: String,
    pub payload: serde_json::Value,
}
