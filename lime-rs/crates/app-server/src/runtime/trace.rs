use super::StoredSession;
use crate::trace_context::w3c_trace_context;
use app_server_protocol::AgentEvent;
use chrono::DateTime;
use serde_json::Map;
use serde_json::Value;

const CLAW_TRACE_SCHEMA_VERSION: u64 = 1;
const TRACE_METADATA_KEYS: &[&str] = &["agentUiPerformanceTrace", "agent_ui_performance_trace"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RuntimeTraceContext {
    pub(super) request_id: Option<String>,
    pub(super) run_id: Option<String>,
    pub(super) session_id: Option<String>,
    pub(super) source: Option<String>,
    pub(super) submitted_at: Option<i64>,
    pub(super) trace_id: Option<String>,
    pub(super) turn_id: Option<String>,
    pub(super) w3c_trace_id: Option<String>,
    pub(super) w3c_traceparent: Option<String>,
    pub(super) w3c_tracestate: Option<String>,
    pub(super) workspace_id: Option<String>,
}

pub(super) fn trace_context_for_turn(
    stored: &StoredSession,
    turn_id: Option<&str>,
) -> Option<RuntimeTraceContext> {
    let turn_id = turn_id?;
    let metadata = stored
        .turn_runtime_options
        .get(turn_id)?
        .runtime_metadata()?;
    let trace = TRACE_METADATA_KEYS
        .iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(Value::as_object)?;

    let w3c = w3c_trace_context(trace);
    let context = RuntimeTraceContext {
        request_id: string_field(trace, &["requestId", "request_id"]),
        run_id: string_field(trace, &["runId", "run_id"]),
        session_id: string_field(trace, &["sessionId", "session_id"]),
        source: string_field(trace, &["source"]),
        submitted_at: number_field(trace, &["submittedAt", "submitted_at"]),
        trace_id: string_field(trace, &["traceId", "trace_id"]),
        turn_id: string_field(trace, &["turnId", "turn_id"]),
        w3c_trace_id: w3c.as_ref().map(|context| context.trace_id.clone()),
        w3c_traceparent: w3c.as_ref().map(|context| context.traceparent.clone()),
        w3c_tracestate: w3c.and_then(|context| context.tracestate),
        workspace_id: string_field(trace, &["workspaceId", "workspace_id"]),
    };

    context.has_identity().then_some(context)
}

pub(super) fn attach_agent_event_trace(event: &mut AgentEvent, context: &RuntimeTraceContext) {
    let Some(payload) = event.payload.as_object_mut() else {
        return;
    };

    insert_string(payload, "trace_id", context.trace_id.as_deref());
    insert_string(payload, "run_id", context.run_id.as_deref());
    insert_string(payload, "request_id", context.request_id.as_deref());
    insert_number(
        payload,
        "server_event_emitted_at",
        timestamp_ms(&event.timestamp),
    );

    let Some(checkpoint) = checkpoint_for_event_type(&event.event_type) else {
        return;
    };
    let trace = ensure_object_field(payload, "trace");
    trace.insert(
        "schemaVersion".to_string(),
        Value::Number(CLAW_TRACE_SCHEMA_VERSION.into()),
    );
    trace.insert(
        "checkpoint".to_string(),
        Value::String(checkpoint.to_string()),
    );
    insert_string(trace, "traceId", context.trace_id.as_deref());
    insert_string(trace, "runId", context.run_id.as_deref());
    insert_string(trace, "requestId", context.request_id.as_deref());
    insert_string(trace, "sessionId", context.session_id.as_deref());
    insert_string(trace, "turnId", context.turn_id.as_deref());
    insert_string(trace, "workspaceId", context.workspace_id.as_deref());
    insert_string(trace, "source", context.source.as_deref());
    insert_string(trace, "w3cTraceparent", context.w3c_traceparent.as_deref());
    insert_string(trace, "w3cTracestate", context.w3c_tracestate.as_deref());
    insert_string(trace, "w3cTraceId", context.w3c_trace_id.as_deref());
    insert_number(trace, "submittedAt", context.submitted_at);
    insert_number(
        trace,
        "serverEventEmittedAt",
        timestamp_ms(&event.timestamp),
    );
}

impl RuntimeTraceContext {
    fn has_identity(&self) -> bool {
        self.request_id.is_some() || self.run_id.is_some() || self.trace_id.is_some()
    }
}

fn checkpoint_for_event_type(event_type: &str) -> Option<&'static str> {
    match event_type {
        "provider.request.started" => Some("provider.request.started"),
        "provider.first_event.received" => Some("provider.first_event.received"),
        "provider.first_text_delta.received" => Some("provider.first_text_delta.received"),
        "provider.failed" => Some("provider.failed"),
        "provider.canceled" => Some("provider.canceled"),
        "message.delta" | "message.delta_batch" | "message.batch" => {
            Some("app_server.message_delta.emitted")
        }
        "message.created" | "turn.accepted" | "turn.started" => Some("app_server.turn.received"),
        "turn.completed" | "turn.failed" | "turn.canceled" => Some("app_server.turn.terminal"),
        _ => None,
    }
}

fn ensure_object_field<'a>(
    payload: &'a mut Map<String, Value>,
    key: &str,
) -> &'a mut Map<String, Value> {
    let entry = payload
        .entry(key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        *entry = Value::Object(Map::new());
    }
    entry
        .as_object_mut()
        .expect("trace payload field should be a JSON object")
}

fn insert_string(payload: &mut Map<String, Value>, key: &str, value: Option<&str>) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    payload.insert(key.to_string(), Value::String(value.to_string()));
}

fn insert_number(payload: &mut Map<String, Value>, key: &str, value: Option<i64>) {
    let Some(value) = value else {
        return;
    };
    payload.insert(key.to_string(), Value::Number(value.into()));
}

fn string_field(payload: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn number_field(payload: &Map<String, Value>, keys: &[&str]) -> Option<i64> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(|value| {
            value
                .as_i64()
                .or_else(|| value.as_u64().and_then(|value| i64::try_from(value).ok()))
        })
}

fn timestamp_ms(timestamp: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .map(|value| value.timestamp_millis())
}
