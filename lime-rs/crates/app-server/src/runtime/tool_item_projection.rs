mod extract;

use super::StoredSession;
use app_server_protocol::AgentEvent;
use extract::{
    current_tool_item_from_event, is_command_tool_name, is_update_plan_tool_name, CurrentToolItem,
};
use serde_json::{json, Map, Value};

#[derive(Debug, Default)]
struct ToolProjection {
    tools: Vec<ToolState>,
}

#[derive(Debug, Clone)]
struct ToolState {
    id: String,
    item_id: Option<String>,
    tool_call_id: Option<String>,
    thread_id: String,
    turn_id: Option<String>,
    item_type: String,
    status: String,
    tool_name: Option<String>,
    arguments: Option<Value>,
    structured_content: Option<Value>,
    output: Option<String>,
    output_ref: Option<String>,
    ref_ids: Vec<String>,
    output_truncated: Option<bool>,
    duration_ms: Option<u64>,
    output_bytes: Option<u64>,
    success: Option<bool>,
    error: Option<String>,
    query: Option<String>,
    action: Option<String>,
    metadata: Map<String, Value>,
    started_at: String,
    updated_at: String,
    completed_at: Option<String>,
    sequence: u64,
}

pub(super) fn tool_items_from_events(stored: &StoredSession) -> Vec<Value> {
    let mut projection = ToolProjection::default();
    for event in &stored.events {
        projection.apply_event(event, Some(stored.session.thread_id.as_str()));
    }
    projection
        .tools
        .into_iter()
        .filter(|tool| {
            !tool
                .tool_name
                .as_deref()
                .is_some_and(|name| is_command_tool_name(name) || is_update_plan_tool_name(name))
        })
        .map(ToolState::into_thread_item)
        .collect()
}

pub(super) fn tool_calls_from_events(events: &[AgentEvent]) -> Vec<Value> {
    let mut projection = ToolProjection::default();
    for event in events {
        projection.apply_event(event, None);
    }
    projection
        .tools
        .into_iter()
        .map(ToolState::into_tool_call)
        .collect()
}

impl ToolProjection {
    fn apply_event(&mut self, event: &AgentEvent, fallback_thread_id: Option<&str>) {
        if let Some(item) = current_tool_item_from_event(event) {
            self.apply_current_item(event, fallback_thread_id, item);
        }
    }

    fn apply_current_item(
        &mut self,
        event: &AgentEvent,
        fallback_thread_id: Option<&str>,
        item: CurrentToolItem,
    ) {
        let index = self.find_current_index(&item);
        let Some(index) = index else {
            self.tools.push(ToolState::from_current_item(
                event,
                fallback_thread_id,
                item,
            ));
            return;
        };
        self.tools[index].merge_current_item(event, item);
    }

    fn find_current_index(&self, item: &CurrentToolItem) -> Option<usize> {
        self.tools.iter().position(|tool| {
            same_turn(tool.turn_id.as_deref(), item.turn_id.as_deref())
                && (tool.item_id.as_deref() == Some(item.item_id.as_str())
                    || tool.tool_call_id.as_deref() == Some(item.tool_call_id.as_str())
                    || tool.id == item.tool_call_id)
        })
    }
}

impl ToolState {
    fn from_current_item(
        event: &AgentEvent,
        fallback_thread_id: Option<&str>,
        item: CurrentToolItem,
    ) -> Self {
        let thread_id = item
            .thread_id
            .clone()
            .or_else(|| event.thread_id.clone())
            .or_else(|| fallback_thread_id.map(str::to_string))
            .unwrap_or_else(|| event.session_id.clone());
        let mut state = Self {
            id: item.tool_call_id.clone(),
            item_id: Some(item.item_id.clone()),
            tool_call_id: Some(item.tool_call_id.clone()),
            thread_id,
            turn_id: item.turn_id.clone().or_else(|| event.turn_id.clone()),
            item_type: item.item_type.clone(),
            status: item.status.clone(),
            tool_name: item.tool_name.clone(),
            arguments: item.arguments.clone(),
            structured_content: item.structured_content.clone(),
            output: item.output.clone(),
            output_ref: item.output_ref.clone(),
            ref_ids: item.ref_ids.clone(),
            output_truncated: item.output_truncated,
            duration_ms: item.duration_ms,
            output_bytes: item.output_bytes,
            success: item.success,
            error: item.error.clone(),
            query: item.query.clone(),
            action: item.action.clone(),
            metadata: Map::new(),
            started_at: item
                .started_at
                .clone()
                .unwrap_or_else(|| event.timestamp.clone()),
            updated_at: item
                .updated_at
                .clone()
                .unwrap_or_else(|| event.timestamp.clone()),
            completed_at: item
                .completed_at
                .clone()
                .or_else(|| is_terminal_status(&item.status).then(|| event.timestamp.clone())),
            sequence: item.sequence,
        };
        state.merge_metadata_value(item.metadata);
        state.merge_event_metadata(event);
        state
    }

    fn merge_current_item(&mut self, event: &AgentEvent, item: CurrentToolItem) {
        self.item_id = Some(item.item_id.clone());
        self.tool_call_id = Some(item.tool_call_id.clone());
        self.id = item.tool_call_id.clone();
        self.item_type = item.item_type.clone();
        self.thread_id = item
            .thread_id
            .clone()
            .or_else(|| event.thread_id.clone())
            .unwrap_or_else(|| self.thread_id.clone());
        if item.turn_id.is_some() {
            self.turn_id = item.turn_id.clone();
        }
        self.merge_status(event, &item.status);
        self.merge_current_fields(item);
        self.merge_event_metadata(event);
    }

    fn merge_current_fields(&mut self, item: CurrentToolItem) {
        self.sequence = item.sequence;
        self.tool_name = item.tool_name.or(self.tool_name.take());
        self.arguments = item.arguments.or(self.arguments.take());
        self.structured_content = item.structured_content.or(self.structured_content.take());
        self.output = item.output.or(self.output.take());
        self.output_ref = item.output_ref.or(self.output_ref.take());
        merge_vec_unique(&mut self.ref_ids, item.ref_ids);
        self.output_truncated = item.output_truncated.or(self.output_truncated);
        self.duration_ms = item.duration_ms.or(self.duration_ms);
        self.output_bytes = item.output_bytes.or(self.output_bytes);
        self.success = item.success.or(self.success);
        self.error = item.error.or(self.error.take());
        self.query = item.query.or(self.query.take());
        self.action = item.action.or(self.action.take());
        self.started_at = item.started_at.unwrap_or_else(|| self.started_at.clone());
        self.updated_at = item.updated_at.unwrap_or_else(|| self.updated_at.clone());
        self.completed_at = item.completed_at.or(self.completed_at.take());
        self.merge_metadata_value(item.metadata);
    }

    fn merge_status(&mut self, event: &AgentEvent, next_status: &str) {
        if is_terminal_status(&self.status) && next_status == "in_progress" {
            return;
        }
        self.status = next_status.to_string();
        if is_terminal_status(next_status) {
            self.completed_at = Some(event.timestamp.clone());
        }
    }

    fn merge_event_metadata(&mut self, event: &AgentEvent) {
        merge_metadata_array(
            &mut self.metadata,
            "source_event_ids",
            Value::String(event.event_id.clone()),
        );
        merge_metadata_array(
            &mut self.metadata,
            "source_event_types",
            Value::String(event.event_type.clone()),
        );
        self.metadata
            .insert("source_event_id".to_string(), json!(event.event_id));
        self.metadata
            .insert("source_event_type".to_string(), json!(event.event_type));
        copy_payload_metadata(&mut self.metadata, &event.payload);
    }

    fn merge_metadata_value(&mut self, metadata: Option<Value>) {
        let Some(Value::Object(metadata)) = metadata else {
            return;
        };
        for (key, value) in metadata {
            self.metadata.entry(key).or_insert(value);
        }
    }

    fn into_thread_item(self) -> Value {
        let mut object = Map::new();
        object.insert("id".to_string(), json!(self.id));
        object.insert("thread_id".to_string(), json!(self.thread_id));
        object.insert("turn_id".to_string(), json!(self.turn_id));
        object.insert("sequence".to_string(), json!(self.sequence));
        object.insert("type".to_string(), json!(self.item_type));
        object.insert("status".to_string(), json!(self.status));
        object.insert("started_at".to_string(), json!(self.started_at));
        object.insert("updated_at".to_string(), json!(self.updated_at));
        insert_optional(
            &mut object,
            "completed_at",
            self.completed_at.clone().map(Value::String),
        );
        self.insert_common_fields(&mut object);
        compact_json(Value::Object(object))
    }

    fn into_tool_call(self) -> Value {
        let mut object = Map::new();
        object.insert("id".to_string(), json!(self.id));
        object.insert("status".to_string(), json!(tool_call_status(&self.status)));
        object.insert("turn_id".to_string(), json!(self.turn_id));
        object.insert("timestamp".to_string(), json!(self.updated_at));
        insert_optional(
            &mut object,
            "tool_call_id",
            self.tool_call_id.clone().map(Value::String),
        );
        self.insert_common_fields(&mut object);
        compact_json(Value::Object(object))
    }

    fn insert_common_fields(&self, object: &mut Map<String, Value>) {
        insert_optional(
            object,
            "tool_name",
            self.tool_name.clone().map(Value::String),
        );
        insert_optional(object, "arguments", self.arguments.clone());
        insert_optional(
            object,
            "structured_content",
            self.structured_content.clone(),
        );
        insert_optional(object, "output", self.output.clone().map(Value::String));
        insert_optional(
            object,
            "output_preview",
            self.output.clone().map(Value::String),
        );
        insert_optional(
            object,
            "output_ref",
            self.output_ref.clone().map(Value::String),
        );
        if !self.ref_ids.is_empty() {
            object.insert("ref_ids".to_string(), json!(self.ref_ids));
        }
        insert_optional(
            object,
            "output_truncated",
            self.output_truncated.map(Value::Bool),
        );
        insert_optional(
            object,
            "duration_ms",
            self.duration_ms.map(|value| json!(value)),
        );
        insert_optional(
            object,
            "output_bytes",
            self.output_bytes.map(|value| json!(value)),
        );
        insert_optional(object, "success", self.success.map(Value::Bool));
        insert_optional(object, "error", self.error.clone().map(Value::String));
        insert_optional(object, "query", self.query.clone().map(Value::String));
        insert_optional(object, "action", self.action.clone().map(Value::String));
        if !self.metadata.is_empty() {
            object.insert("metadata".to_string(), Value::Object(self.metadata.clone()));
        }
    }
}

fn is_terminal_status(status: &str) -> bool {
    matches!(status, "completed" | "failed" | "interrupted" | "cancelled")
}

fn tool_call_status(status: &str) -> &str {
    match status {
        "in_progress" => "running",
        other => other,
    }
}

fn same_turn(left: Option<&str>, right: Option<&str>) -> bool {
    match (left, right) {
        (Some(left), Some(right)) => left == right,
        (None, None) => true,
        _ => false,
    }
}

fn merge_vec_unique(target: &mut Vec<String>, values: Vec<String>) {
    for value in values {
        if !target.iter().any(|existing| existing == &value) {
            target.push(value);
        }
    }
}

fn merge_metadata_array(metadata: &mut Map<String, Value>, key: &str, value: Value) {
    let entry = metadata
        .entry(key.to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(values) = entry.as_array_mut() else {
        return;
    };
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn copy_payload_metadata(metadata: &mut Map<String, Value>, payload: &Value) {
    for (source_key, target_key) in [
        ("source", "source"),
        ("workflowKey", "workflowKey"),
        ("workflow_key", "workflow_key"),
        ("sourceClient", "source_client"),
        ("sourceProvenance", "source_provenance"),
        ("imported", "imported"),
        ("importedSynthetic", "imported_synthetic"),
        ("importedIncomplete", "imported_incomplete"),
    ] {
        if let Some(value) = payload.get(source_key).cloned() {
            metadata.insert(target_key.to_string(), value);
        }
    }
}

fn insert_optional(object: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    let Some(value) = value else {
        return;
    };
    if value.is_null() {
        return;
    }
    if value.as_str().is_some_and(str::is_empty) {
        return;
    }
    if matches!(&value, Value::Array(items) if items.is_empty()) {
        return;
    }
    object.insert(key.to_string(), value);
}

fn compact_json(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .filter_map(|(key, value)| {
                    let value = compact_json(value);
                    if value.is_null() {
                        return None;
                    }
                    if value.as_str().is_some_and(str::is_empty) {
                        return None;
                    }
                    if matches!(&value, Value::Array(items) if items.is_empty()) {
                        return None;
                    }
                    Some((key, value))
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(compact_json).collect()),
        value => value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_tool_items_use_call_identity_and_preserve_typed_output() {
        let events = vec![
            event(
                "item-started",
                1,
                "item.started",
                canonical_tool_item("inProgress", false),
            ),
            event(
                "item-completed",
                2,
                "item.completed",
                canonical_tool_item("failed", true),
            ),
        ];

        let tool_calls = tool_calls_from_events(&events);

        assert_eq!(tool_calls.len(), 1);
        let call = &tool_calls[0];
        assert_eq!(call["id"], "call-runtime-1");
        assert_eq!(call["tool_call_id"], "call-runtime-1");
        assert_eq!(call["status"], "failed");
        assert_eq!(call["tool_name"], "read_file");
        assert_eq!(
            call["arguments"],
            json!([
                {"name": "path", "value": "/workspace/README.md"},
                {"name": "line_start", "value": "1"},
                {"name": "query", "value": "needle"}
            ])
        );
        assert_eq!(call["output"], "partial output");
        assert_eq!(call["structured_content"]["lines"], 12);
        assert_eq!(call["error"], "permission denied");
        assert_eq!(call["duration_ms"], 42);
        assert_eq!(call["output_truncated"], true);
        assert_eq!(call["output_ref"], "sidecar://call-runtime-1");
        assert_eq!(call["output_bytes"], 2048);
        assert_eq!(call["ref_ids"], json!(["ref-item", "ref-outer"]));
        assert_eq!(call["query"], "needle");
        assert_eq!(call["action"], "read");
        assert_eq!(call["success"], false);
        assert_eq!(call["metadata"]["source"], "runtime-tool");
    }

    #[test]
    fn canonical_tool_item_preserves_interrupted_status() {
        let event = event(
            "item-interrupted",
            1,
            "item.completed",
            json!({"item": canonical_tool_item_with_status("interrupted")}),
        );

        let tool_calls = tool_calls_from_events(&[event]);

        assert_eq!(tool_calls[0]["status"], "interrupted");
        assert_eq!(tool_calls[0]["success"], false);
    }

    #[test]
    fn canonical_tool_projection_does_not_downgrade_completed_item_with_late_update() {
        let events = vec![
            event(
                "item-started",
                1,
                "item.started",
                canonical_tool_item("inProgress", false),
            ),
            event(
                "item-completed",
                2,
                "item.completed",
                canonical_tool_item("completed", true),
            ),
            event(
                "item-updated-late",
                3,
                "item.updated",
                canonical_tool_item("inProgress", false),
            ),
        ];

        let tool_calls = tool_calls_from_events(&events);

        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0]["status"], "completed");
        assert_eq!(tool_calls[0]["output"], "partial output");
    }

    #[test]
    fn canonical_tool_projection_uses_outer_event_envelope_facts() {
        let mut payload = canonical_tool_item("completed", true);
        payload["item"]["threadId"] = json!("placeholder-thread");
        payload["item"]["turnId"] = json!("placeholder-turn");
        payload["item"]["sequence"] = json!(999);
        payload["item"]["createdAtMs"] = json!(1);
        payload["item"]["updatedAtMs"] = json!(2);
        payload["item"]["completedAtMs"] = json!(3);
        let mut completed = event("item-completed", 42, "item.completed", payload);
        completed.thread_id = Some("outer-thread".to_string());
        completed.turn_id = Some("outer-turn".to_string());
        completed.timestamp = "2026-07-13T01:23:45Z".to_string();

        let extracted = current_tool_item_from_event(&completed).expect("canonical tool item");
        assert_eq!(extracted.thread_id.as_deref(), Some("outer-thread"));
        assert_eq!(extracted.turn_id.as_deref(), Some("outer-turn"));
        assert_eq!(extracted.sequence, 42);
        assert_eq!(
            extracted.completed_at.as_deref(),
            Some("2026-07-13T01:23:45Z")
        );

        let tool_calls = tool_calls_from_events(&[completed]);

        assert_eq!(tool_calls[0]["turn_id"], "outer-turn");
        assert_eq!(tool_calls[0]["timestamp"], "2026-07-13T01:23:45Z");
    }

    fn event(event_id: &str, sequence: u64, event_type: &str, payload: Value) -> AgentEvent {
        AgentEvent {
            event_id: event_id.to_string(),
            sequence,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: event_type.to_string(),
            timestamp: "2026-07-13T00:00:00Z".to_string(),
            payload,
        }
    }

    fn canonical_tool_item(status: &str, terminal: bool) -> Value {
        let mut item = canonical_tool_item_with_status(status);
        if terminal {
            item["completedAtMs"] = json!(1_783_900_000_042_i64);
            item["payload"]["arguments"] = json!([]);
            item["payload"]["output"] = json!({
                "text": "partial output",
                "structuredContent": {"lines": 12},
                "error": "permission denied",
                "durationMs": 42,
                "truncated": true,
                "outputRef": "sidecar://call-runtime-1"
            });
            item["metadata"]["output_bytes"] = json!(2048);
            item["metadata"]["ref_ids"] = json!(["ref-item"]);
            item["metadata"]["action"] = json!("read");
        }
        let ref_ids = if terminal {
            json!(["ref-outer"])
        } else {
            json!([])
        };
        json!({
            "item": item,
            "refIds": ref_ids
        })
    }

    fn canonical_tool_item_with_status(status: &str) -> Value {
        json!({
            "sessionId": "session-1",
            "threadId": "thread-1",
            "turnId": "turn-1",
            "itemId": "item-display-1",
            "sequence": 1,
            "ordinal": 1,
            "createdAtMs": 1_783_900_000_000_i64,
            "updatedAtMs": 1_783_900_000_010_i64,
            "kind": "tool",
            "status": status,
            "payload": {
                "type": "tool",
                "call_id": "call-runtime-1",
                "name": "read_file",
                "arguments": [
                    {"name": "path", "value": "/workspace/README.md"},
                    {"name": "line_start", "value": "1"},
                    {"name": "query", "value": "needle"}
                ]
            },
            "metadata": {"source": "runtime-tool"}
        })
    }
}
