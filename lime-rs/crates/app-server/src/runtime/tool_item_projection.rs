mod extract;

use super::StoredSession;
use app_server_protocol::AgentEvent;
use extract::{
    current_tool_item_from_event, is_command_tool_name, is_update_plan_tool_name,
    item_type_for_tool_name, legacy_tool_event_from_event, legacy_tool_id, CurrentToolItem,
    LegacyToolEvent,
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
    output_bytes: Option<u64>,
    success: Option<bool>,
    error: Option<String>,
    query: Option<String>,
    action: Option<String>,
    metadata: Map<String, Value>,
    diagnostics: Vec<Value>,
    started_at: String,
    updated_at: String,
    completed_at: Option<String>,
    sequence: u64,
    has_current_item: bool,
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
            return;
        }
        if let Some(tool_event) = legacy_tool_event_from_event(event) {
            self.apply_legacy_tool_event(event, fallback_thread_id, tool_event);
        }
    }

    fn apply_current_item(
        &mut self,
        event: &AgentEvent,
        fallback_thread_id: Option<&str>,
        item: CurrentToolItem,
    ) {
        let index = self
            .find_current_index(&item)
            .or_else(|| self.find_legacy_match_for_current(&item));
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

    fn apply_legacy_tool_event(
        &mut self,
        event: &AgentEvent,
        fallback_thread_id: Option<&str>,
        tool_event: LegacyToolEvent,
    ) {
        let index = self.find_legacy_index(event, &tool_event);
        let Some(index) = index else {
            self.tools.push(ToolState::from_legacy_event(
                event,
                fallback_thread_id,
                tool_event,
            ));
            return;
        };
        self.tools[index].merge_legacy_event(event, tool_event);
    }

    fn find_current_index(&self, item: &CurrentToolItem) -> Option<usize> {
        self.tools.iter().position(|tool| {
            same_turn(tool.turn_id.as_deref(), item.turn_id.as_deref())
                && (tool.item_id.as_deref() == Some(item.item_id.as_str())
                    || tool.tool_call_id.as_deref() == Some(item.item_id.as_str())
                    || tool.id == item.item_id)
        })
    }

    fn find_legacy_match_for_current(&self, item: &CurrentToolItem) -> Option<usize> {
        let tool_name = item.tool_name.as_deref()?;
        self.tools.iter().position(|tool| {
            !tool.has_current_item
                && same_turn(tool.turn_id.as_deref(), item.turn_id.as_deref())
                && tool.tool_name.as_deref() == Some(tool_name)
        })
    }

    fn find_legacy_index(&self, event: &AgentEvent, tool_event: &LegacyToolEvent) -> Option<usize> {
        if let Some(tool_call_id) = tool_event.tool_call_id.as_deref() {
            return self.tools.iter().position(|tool| {
                same_turn(tool.turn_id.as_deref(), event.turn_id.as_deref())
                    && (tool.item_id.as_deref() == Some(tool_call_id)
                        || tool.tool_call_id.as_deref() == Some(tool_call_id)
                        || tool.id == tool_call_id)
            });
        }
        let tool_name = tool_event.tool_name.as_deref()?;
        self.tools.iter().position(|tool| {
            same_turn(tool.turn_id.as_deref(), event.turn_id.as_deref())
                && tool.tool_call_id.is_none()
                && tool.tool_name.as_deref() == Some(tool_name)
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
            id: item.item_id.clone(),
            item_id: Some(item.item_id.clone()),
            tool_call_id: Some(item.item_id.clone()),
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
            output_bytes: item.output_bytes,
            success: item.success,
            error: item.error.clone(),
            query: item.query.clone(),
            action: item.action.clone(),
            metadata: Map::new(),
            diagnostics: Vec::new(),
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
            has_current_item: true,
        };
        state.merge_metadata_value(item.metadata);
        state.merge_event_metadata(event);
        state
    }

    fn from_legacy_event(
        event: &AgentEvent,
        fallback_thread_id: Option<&str>,
        tool_event: LegacyToolEvent,
    ) -> Self {
        let id = legacy_tool_id(event, &tool_event);
        let item_type = item_type_for_tool_name(tool_event.tool_name.as_deref());
        let mut metadata = Map::new();
        if !has_metadata_key(tool_event.metadata.as_ref(), "source") {
            metadata.insert("source".to_string(), json!("legacy_tool_event"));
        }
        let mut state = Self {
            id: id.clone(),
            item_id: None,
            tool_call_id: tool_event.tool_call_id.clone(),
            thread_id: event
                .thread_id
                .clone()
                .or_else(|| fallback_thread_id.map(str::to_string))
                .unwrap_or_else(|| event.session_id.clone()),
            turn_id: event.turn_id.clone(),
            item_type,
            status: tool_event.status.clone(),
            tool_name: tool_event.tool_name.clone(),
            arguments: tool_event.arguments.clone(),
            structured_content: tool_event.structured_content.clone(),
            output: tool_event.output.clone(),
            output_ref: tool_event.output_ref.clone(),
            ref_ids: tool_event.ref_ids.clone(),
            output_truncated: tool_event.output_truncated,
            output_bytes: tool_event.output_bytes,
            success: tool_event.success,
            error: tool_event.error.clone(),
            query: tool_event.query.clone(),
            action: tool_event.action.clone(),
            metadata,
            diagnostics: Vec::new(),
            started_at: event.timestamp.clone(),
            updated_at: event.timestamp.clone(),
            completed_at: is_terminal_status(&tool_event.status).then(|| event.timestamp.clone()),
            sequence: event.sequence,
            has_current_item: false,
        };
        state.merge_metadata_value(tool_event.metadata);
        state.merge_event_metadata(event);
        state
    }

    fn merge_current_item(&mut self, event: &AgentEvent, item: CurrentToolItem) {
        self.has_current_item = true;
        self.item_id = Some(item.item_id.clone());
        self.tool_call_id.get_or_insert(item.item_id.clone());
        self.id = item.item_id.clone();
        self.item_type = item.item_type.clone();
        self.thread_id = item
            .thread_id
            .clone()
            .or_else(|| event.thread_id.clone())
            .unwrap_or_else(|| self.thread_id.clone());
        if item.turn_id.is_some() {
            self.turn_id = item.turn_id.clone();
        }
        self.merge_status(event, &item.status, true);
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

    fn merge_legacy_event(&mut self, event: &AgentEvent, tool_event: LegacyToolEvent) {
        let status_applied = self.merge_status(event, &tool_event.status, false);
        if self.tool_call_id.is_none() {
            self.tool_call_id = tool_event.tool_call_id.clone();
        }
        merge_option_if_empty(&mut self.tool_name, tool_event.tool_name);
        merge_option_if_empty(&mut self.arguments, tool_event.arguments);
        if status_applied || !self.has_current_item {
            merge_option_if_present(&mut self.structured_content, tool_event.structured_content);
            merge_option_if_present(&mut self.output, tool_event.output);
            merge_option_if_present(&mut self.output_ref, tool_event.output_ref);
            merge_vec_unique(&mut self.ref_ids, tool_event.ref_ids);
            self.output_truncated = tool_event.output_truncated.or(self.output_truncated);
            self.output_bytes = tool_event.output_bytes.or(self.output_bytes);
            self.success = tool_event.success.or(self.success);
            merge_option_if_present(&mut self.error, tool_event.error);
            self.query = tool_event.query.or(self.query.take());
            self.action = tool_event.action.or(self.action.take());
        }
        self.updated_at = event.timestamp.clone();
        self.merge_metadata_value_prefer_new(tool_event.metadata);
        self.merge_event_metadata(event);
        self.sequence = self.sequence.min(event.sequence);
    }

    fn merge_status(&mut self, event: &AgentEvent, next_status: &str, current_item: bool) -> bool {
        if current_item {
            if is_terminal_status(&self.status) && next_status == "in_progress" {
                self.push_status_diagnostic(event, next_status);
                return false;
            }
            self.status = next_status.to_string();
            if is_terminal_status(next_status) {
                self.completed_at = Some(event.timestamp.clone());
            }
            return true;
        }

        if self.has_current_item {
            if is_terminal_status(next_status) && self.status != next_status {
                self.push_status_diagnostic(event, next_status);
                return false;
            }
            return true;
        }

        self.status = next_status.to_string();
        if is_terminal_status(next_status) {
            self.completed_at = Some(event.timestamp.clone());
        }
        true
    }

    fn push_status_diagnostic(&mut self, event: &AgentEvent, ignored_status: &str) {
        self.diagnostics.push(json!({
            "kind": "ignored_legacy_status_conflict",
            "source_event_id": event.event_id,
            "source_event_type": event.event_type,
            "ignored_status": ignored_status,
            "kept_status": self.status,
        }));
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

    fn merge_metadata_value_prefer_new(&mut self, metadata: Option<Value>) {
        let Some(Value::Object(metadata)) = metadata else {
            return;
        };
        for (key, value) in metadata {
            self.metadata.insert(key, value);
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
        if !self.diagnostics.is_empty() {
            object.insert(
                "diagnostics".to_string(),
                json!({ "status_conflicts": self.diagnostics }),
            );
        }
    }
}

fn is_terminal_status(status: &str) -> bool {
    matches!(status, "completed" | "failed")
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

fn merge_option_if_empty<T>(target: &mut Option<T>, value: Option<T>) {
    if target.is_none() {
        *target = value;
    }
}

fn merge_option_if_present<T>(target: &mut Option<T>, value: Option<T>) {
    if value.is_some() {
        *target = value;
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

fn has_metadata_key(metadata: Option<&Value>, key: &str) -> bool {
    metadata
        .and_then(Value::as_object)
        .is_some_and(|metadata| metadata.contains_key(key))
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
