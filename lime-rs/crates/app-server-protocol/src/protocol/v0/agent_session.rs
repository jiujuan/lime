use agent_protocol::{Thread, ThreadItem, Turn};
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AgentSessionApprovalDecision {
    AllowOnce,
    AllowForSession,
    Decline,
    Cancel,
}

impl AgentSessionApprovalDecision {
    pub fn confirmed(self) -> bool {
        matches!(self, Self::AllowOnce | Self::AllowForSession)
    }

    pub fn is_cancel(self) -> bool {
        matches!(self, Self::Cancel)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::AllowOnce => "allow_once",
            Self::AllowForSession => "allow_for_session",
            Self::Decline => "decline",
            Self::Cancel => "cancel",
        }
    }

    pub fn scope(self) -> &'static str {
        match self {
            Self::AllowForSession => "session",
            _ => "once",
        }
    }
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
    pub available_decisions: Option<Vec<AgentSessionApprovalDecision>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decision: Option<AgentSessionApprovalDecision>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmed: Option<bool>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canonical_event: Option<CanonicalThreadEventNotification>,
}

impl AgentSessionEventParams {
    pub fn from_event(event: AgentEvent) -> Self {
        let typed_event = AgentSessionRuntimeEventNotification::from_agent_event(&event);
        let canonical_event = CanonicalThreadEventNotification::from_agent_event(&event);
        Self {
            event,
            typed_event,
            canonical_event,
        }
    }
}

/// Canonical live projection for Thread/Turn/Item consumers.
///
/// The projection only accepts fully typed canonical entities embedded by the
/// runtime owner. It does not infer a canonical object from legacy payload
/// fields; producers that do not yet emit a canonical entity remain visible
/// through `event` until their owner migrates.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "method", content = "params")]
pub enum CanonicalThreadEventNotification {
    #[serde(rename = "thread/updated")]
    ThreadUpdated(Thread),
    #[serde(rename = "turn/updated")]
    TurnUpdated(Turn),
    #[serde(rename = "item/updated")]
    ItemUpdated(ThreadItem),
}

impl CanonicalThreadEventNotification {
    pub fn from_agent_event(event: &AgentEvent) -> Option<Self> {
        match event.event_type.as_str() {
            "thread.created" | "thread.started" | "thread.updated" => {
                canonical_entity(&event.payload, "thread").map(Self::ThreadUpdated)
            }
            "turn.accepted" | "turn.started" | "turn.completed" | "turn.failed"
            | "turn.canceled" => canonical_entity(&event.payload, "turn").map(Self::TurnUpdated),
            _ => canonical_entity(&event.payload, "item").map(Self::ItemUpdated),
        }
    }
}

fn canonical_entity<T>(payload: &serde_json::Value, key: &str) -> Option<T>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_value(payload.get(key)?.clone()).ok()
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
            "item.completed" | "message.completed" => {
                AgentSessionItemLifecycleNotification::from_agent_event(
                    event,
                    Some("completed".to_string()),
                )
                .map(Self::ItemCompleted)
            }
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
    pub ordinal: Option<u64>,
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
            ordinal: number_field(item, &["ordinal", "itemOrdinal", "item_ordinal"])
                .or_else(|| number_field(payload, &["ordinal", "itemOrdinal", "item_ordinal"]))
                .or_else(|| {
                    number_field(&event.payload, &["ordinal", "itemOrdinal", "item_ordinal"])
                }),
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

fn number_field(value: &serde_json::Value, keys: &[&str]) -> Option<u64> {
    let object = value.as_object()?;
    keys.iter().find_map(|key| {
        object.get(*key).and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_str()?.parse::<u64>().ok())
        })
    })
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

    #[test]
    fn item_lifecycle_projects_stable_ordinal_when_present() {
        let params = AgentSessionEventParams::from_event(event(
            "item.started",
            json!({
                "item": {
                    "id": "item_1",
                    "type": "agent_message",
                    "ordinal": "12"
                }
            }),
        ));

        let typed_event = params.typed_event.expect("typed item event");
        assert_eq!(
            serde_json::to_value(typed_event).expect("serialize typed event"),
            json!({
                "method": "item/started",
                "params": {
                    "eventId": "evt_1",
                    "sequence": 7,
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "turnId": "turn_1",
                    "timestamp": "2026-07-05T00:00:00Z",
                    "itemId": "item_1",
                    "ordinal": 12,
                    "itemType": "agent_message"
                }
            })
        );
    }

    #[test]
    fn message_completed_projects_typed_item_completed_lifecycle() {
        let params = AgentSessionEventParams::from_event(event(
            "message.completed",
            json!({
                "item": {
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "turnId": "turn_1",
                    "itemId": "agent-turn_1",
                    "sequence": 7,
                    "ordinal": 3,
                    "createdAtMs": 100,
                    "updatedAtMs": 120,
                    "completedAtMs": 120,
                    "kind": "agentMessage",
                    "status": "completed",
                    "payload": {
                        "type": "agentMessage",
                        "text": "hello",
                        "phase": "final_answer"
                    }
                }
            }),
        ));

        assert!(matches!(
            params.typed_event,
            Some(AgentSessionRuntimeEventNotification::ItemCompleted(
                AgentSessionItemLifecycleNotification { ref item_id, .. }
            )) if item_id == "agent-turn_1"
        ));
    }

    #[test]
    fn canonical_item_event_deserializes_the_agent_protocol_contract_directly() {
        let params = AgentSessionEventParams::from_event(event(
            "item.updated",
            json!({
                "item": {
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "turnId": "turn_1",
                    "itemId": "msg_1",
                    "sequence": 7,
                    "ordinal": 3,
                    "createdAtMs": 100,
                    "updatedAtMs": 120,
                    "kind": "agentMessage",
                    "status": "inProgress",
                    "payload": {
                        "type": "agentMessage",
                        "text": "hello",
                        "phase": "commentary"
                    }
                }
            }),
        ));

        let canonical_event = params.canonical_event.expect("canonical item event");
        assert!(matches!(
            &canonical_event,
            CanonicalThreadEventNotification::ItemUpdated(item)
                if item.item_id.as_str() == "msg_1"
                    && item.sequence == 7
                    && item.ordinal == 3
        ));
        assert_eq!(
            serde_json::to_value(canonical_event).expect("serialize canonical item event"),
            json!({
                "method": "item/updated",
                "params": {
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "turnId": "turn_1",
                    "itemId": "msg_1",
                    "sequence": 7,
                    "ordinal": 3,
                    "createdAtMs": 100,
                    "updatedAtMs": 120,
                    "kind": "agentMessage",
                    "status": "inProgress",
                    "payload": {
                        "type": "agentMessage",
                        "text": "hello",
                        "phase": "commentary"
                    },
                    "metadata": null
                }
            })
        );
    }

    #[test]
    fn partial_item_payload_does_not_guess_a_canonical_entity() {
        let params = AgentSessionEventParams::from_event(event(
            "item.updated",
            json!({
                "item": {
                    "id": "legacy_item_1",
                    "text": "partial"
                }
            }),
        ));

        assert_eq!(params.canonical_event, None);
    }

    #[test]
    fn current_turn_canceled_accepts_interrupted_canonical_turn() {
        let payload = json!({
            "turn": {
                "sessionId": "sess_1",
                "threadId": "thread_1",
                "turnId": "turn_1",
                "status": "interrupted",
                "createdAtMs": 100,
                "updatedAtMs": 120
            }
        });

        let canceled = AgentSessionEventParams::from_event(event("turn.canceled", payload.clone()));
        assert!(matches!(
            canceled.canonical_event,
            Some(CanonicalThreadEventNotification::TurnUpdated(turn))
                if turn.status == agent_protocol::TurnStatus::Interrupted
        ));

        let retired = AgentSessionEventParams::from_event(event("turn.interrupted", payload));
        assert_eq!(retired.canonical_event, None);
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
    pub queued_turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_request: Option<RuntimeRequest>,
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

impl RuntimeOptions {
    /// 返回 current turn 的 typed 运行时请求。
    pub fn runtime_request(&self) -> Option<&RuntimeRequest> {
        self.runtime_request.as_ref()
    }

    /// 返回 current turn 执行配置中的运行时元数据。
    pub fn runtime_metadata(&self) -> Option<&serde_json::Value> {
        self.runtime_request()
            .and_then(|request| request.metadata.as_ref())
    }

    pub fn provider_preference(&self) -> Option<&str> {
        self.runtime_request()
            .and_then(|request| request.provider_preference.as_deref())
    }

    pub fn model_preference(&self) -> Option<&str> {
        self.runtime_request()
            .and_then(|request| request.model_preference.as_deref())
    }

    /// 为 current turn 执行配置提供唯一的可写 owner。
    pub fn runtime_request_mut(&mut self) -> &mut RuntimeRequest {
        self.runtime_request.get_or_insert_default()
    }

    pub fn runtime_metadata_mut(&mut self) -> &mut Option<serde_json::Value> {
        &mut self.runtime_request_mut().metadata
    }
}

/// 由 App Server current turn 主链消费的运行时参数。
///
/// 输入、session、turn、event 名和 structured output 已在 `AgentSessionTurnStartParams`
/// 或 `RuntimeOptions` 顶层表达。本结构只承载 provider lowering 与 turn execution
/// 所需的显式配置，不能作为任意 host JSON 的逃生通道。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_config: Option<RuntimeProviderConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_preference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_preference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox_policy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_root: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_root: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub web_search: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_mode: Option<RuntimeSearchMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution_strategy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_continue: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProviderConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_strategy: Option<RuntimeToolCallStrategy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub toolshim_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_capabilities: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeToolCallStrategy {
    #[default]
    Native,
    ToolShim,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeSearchMode {
    Disabled,
    #[default]
    Auto,
    Required,
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
