use super::{
    call_id, command_started_from_response_item, compact_json, parsed_arguments,
    plan_final_from_response_item, string_field, tool_name, truncate_output_preview,
    web_search_action_label, web_search_arguments, web_search_query,
};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone)]
pub(in crate::runtime::conversation_import) enum CodexRolloutEvent {
    Runtime {
        event_type: &'static str,
        payload: Value,
    },
    Tool(CodexToolCall),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::runtime::conversation_import) enum CodexToolPhase {
    Started,
    Completed,
    Failed,
}

#[derive(Debug, Clone)]
pub(in crate::runtime::conversation_import) struct CodexToolCall {
    pub(in crate::runtime::conversation_import) phase: CodexToolPhase,
    pub(in crate::runtime::conversation_import) call_id: Option<String>,
    pub(in crate::runtime::conversation_import) name: Option<String>,
    pub(in crate::runtime::conversation_import) arguments: Option<Value>,
    pub(in crate::runtime::conversation_import) output: Option<Value>,
    pub(in crate::runtime::conversation_import) source: CodexToolSource,
}

#[derive(Debug, Clone, Default)]
pub(in crate::runtime::conversation_import) struct CodexToolSource {
    pub(in crate::runtime::conversation_import) source_client: Option<String>,
    pub(in crate::runtime::conversation_import) source_event_type: Option<String>,
    pub(in crate::runtime::conversation_import) source_provenance: Option<Value>,
    pub(in crate::runtime::conversation_import) imported: bool,
    pub(in crate::runtime::conversation_import) synthetic: bool,
    pub(in crate::runtime::conversation_import) incomplete: bool,
    pub(in crate::runtime::conversation_import) synthetic_id: bool,
    pub(in crate::runtime::conversation_import) failure_category: Option<String>,
    pub(in crate::runtime::conversation_import) action: Option<Value>,
    pub(in crate::runtime::conversation_import) query: Option<String>,
    pub(in crate::runtime::conversation_import) success: Option<bool>,
    pub(in crate::runtime::conversation_import) ref_ids: Vec<String>,
    pub(in crate::runtime::conversation_import) output_bytes: Option<u64>,
    pub(in crate::runtime::conversation_import) output_preview: Option<String>,
    pub(in crate::runtime::conversation_import) structured_content: Option<Value>,
    pub(in crate::runtime::conversation_import) error: Option<String>,
    pub(in crate::runtime::conversation_import) duration_ms: Option<u64>,
    pub(in crate::runtime::conversation_import) truncated: bool,
    pub(in crate::runtime::conversation_import) output_ref: Option<String>,
    pub(in crate::runtime::conversation_import) extensions: Map<String, Value>,
}

impl CodexRolloutEvent {
    pub(in crate::runtime::conversation_import) fn new(
        event_type: &'static str,
        payload: Value,
    ) -> Self {
        Self::Runtime {
            event_type,
            payload,
        }
    }

    fn tool(draft: CodexToolCall) -> Self {
        Self::Tool(draft)
    }

    pub(in crate::runtime::conversation_import) fn event_type(&self) -> &'static str {
        match self {
            Self::Runtime { event_type, .. } => event_type,
            Self::Tool(draft) => draft.event_type(),
        }
    }

    pub(in crate::runtime::conversation_import) fn payload(&self) -> Option<&Value> {
        match self {
            Self::Runtime { payload, .. } => Some(payload),
            Self::Tool(_) => None,
        }
    }

    pub(in crate::runtime::conversation_import) fn tool_call(&self) -> Option<&CodexToolCall> {
        match self {
            Self::Runtime { .. } => None,
            Self::Tool(draft) => Some(draft),
        }
    }

    pub(in crate::runtime::conversation_import) fn into_runtime(
        self,
    ) -> Option<(&'static str, Value)> {
        match self {
            Self::Runtime {
                event_type,
                payload,
            } => Some((event_type, payload)),
            Self::Tool(_) => None,
        }
    }

    pub(in crate::runtime::conversation_import) fn source_provenance_value(
        &self,
    ) -> Option<&Value> {
        match self {
            Self::Runtime { payload, .. } => payload.get("sourceProvenance"),
            Self::Tool(draft) => draft.source.source_provenance.as_ref(),
        }
    }

    pub(in crate::runtime::conversation_import) fn set_source_provenance(
        &mut self,
        provenance: Value,
    ) {
        match self {
            Self::Runtime { payload, .. } => {
                if let Value::Object(object) = payload {
                    object.insert("sourceProvenance".to_string(), provenance);
                }
            }
            Self::Tool(draft) => {
                draft.source.source_provenance = Some(provenance);
            }
        }
    }

    pub(in crate::runtime::conversation_import) fn enrich_source_provenance(
        &mut self,
        provenance: Value,
    ) {
        match self {
            Self::Runtime { payload, .. } => {
                if let Value::Object(object) = payload {
                    object
                        .entry("sourceProvenance".to_string())
                        .or_insert(provenance);
                }
            }
            Self::Tool(draft) => {
                if draft.source.source_provenance.is_none() {
                    draft.source.source_provenance = Some(provenance);
                }
            }
        }
    }
}

impl CodexToolCall {
    fn started(
        call_id: Option<String>,
        name: Option<String>,
        arguments: Option<Value>,
        metadata: Value,
    ) -> Self {
        Self {
            phase: CodexToolPhase::Started,
            call_id,
            name,
            arguments,
            output: None,
            source: CodexToolSource::from_value(metadata),
        }
    }

    fn terminal(
        call_id: Option<String>,
        name: Option<String>,
        arguments: Option<Value>,
        output: Option<Value>,
        failed: bool,
        metadata: Value,
    ) -> Self {
        Self {
            phase: if failed {
                CodexToolPhase::Failed
            } else {
                CodexToolPhase::Completed
            },
            call_id,
            name,
            arguments,
            output,
            source: CodexToolSource::from_value(metadata),
        }
    }

    pub(in crate::runtime::conversation_import) fn event_type(&self) -> &'static str {
        match self.phase {
            CodexToolPhase::Started => "import.tool.started",
            CodexToolPhase::Completed => "import.tool.completed",
            CodexToolPhase::Failed => "import.tool.failed",
        }
    }
}

impl CodexToolSource {
    fn from_value(metadata: Value) -> Self {
        let mut fields = compact_json(metadata)
            .as_object()
            .cloned()
            .unwrap_or_default();
        let source_client = take_string(&mut fields, &["sourceClient"]);
        let source_event_type = take_string(&mut fields, &["sourceEventType"]);
        let source_provenance = fields.remove("sourceProvenance");
        let imported = take_bool(&mut fields, &["imported"]);
        let synthetic = take_bool(&mut fields, &["importedSynthetic"]);
        let incomplete = take_bool(&mut fields, &["importedIncomplete"]);
        let synthetic_id = take_bool(&mut fields, &["importedSyntheticId"]);
        let failure_category = take_string(&mut fields, &["failureCategory"]);
        let action = fields.remove("action");
        let query = take_string(&mut fields, &["query"]);
        let success = fields.remove("success").and_then(|value| value.as_bool());
        let ref_ids = fields
            .remove("refIds")
            .and_then(|value| value.as_array().cloned())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| value.as_str().map(str::to_string))
            .collect();
        let output_bytes = take_u64(&mut fields, &["outputBytes"]);
        let output_preview = take_string(&mut fields, &["outputPreview", "output_preview"]);
        let structured_content = fields
            .remove("structuredContent")
            .or_else(|| fields.remove("structured_content"));
        let error = take_string(&mut fields, &["error", "message", "reason"]);
        let duration_ms = take_u64(&mut fields, &["durationMs", "duration_ms"]);
        let truncated = take_bool(&mut fields, &["outputTruncated", "truncated"]);
        let output_ref = take_string(&mut fields, &["outputRef", "output_ref"]);
        Self {
            source_client,
            source_event_type,
            source_provenance,
            imported,
            synthetic,
            incomplete,
            synthetic_id,
            failure_category,
            action,
            query,
            success,
            ref_ids,
            output_bytes,
            output_preview,
            structured_content,
            error,
            duration_ms,
            truncated,
            output_ref,
            extensions: fields,
        }
    }

    pub(in crate::runtime::conversation_import) fn to_value(&self) -> Value {
        let mut fields = self.extensions.clone();
        insert_optional_string(&mut fields, "sourceClient", self.source_client.as_ref());
        insert_optional_string(
            &mut fields,
            "sourceEventType",
            self.source_event_type.as_ref(),
        );
        if let Some(value) = self.source_provenance.clone() {
            fields.insert("sourceProvenance".to_string(), value);
        }
        insert_true(&mut fields, "imported", self.imported);
        insert_true(&mut fields, "importedSynthetic", self.synthetic);
        insert_true(&mut fields, "importedIncomplete", self.incomplete);
        insert_true(&mut fields, "importedSyntheticId", self.synthetic_id);
        insert_optional_string(
            &mut fields,
            "failureCategory",
            self.failure_category.as_ref(),
        );
        if let Some(value) = self.action.clone() {
            fields.insert("action".to_string(), value);
        }
        insert_optional_string(&mut fields, "query", self.query.as_ref());
        if let Some(value) = self.success {
            fields.insert("success".to_string(), Value::Bool(value));
        }
        if !self.ref_ids.is_empty() {
            fields.insert("refIds".to_string(), json!(self.ref_ids));
        }
        if let Some(value) = self.output_bytes {
            fields.insert("outputBytes".to_string(), json!(value));
        }
        insert_optional_string(&mut fields, "outputPreview", self.output_preview.as_ref());
        if let Some(value) = self.structured_content.clone() {
            fields.insert("structuredContent".to_string(), value);
        }
        insert_optional_string(&mut fields, "error", self.error.as_ref());
        if let Some(value) = self.duration_ms {
            fields.insert("durationMs".to_string(), json!(value));
        }
        insert_true(&mut fields, "truncated", self.truncated);
        insert_optional_string(&mut fields, "outputRef", self.output_ref.as_ref());
        Value::Object(fields)
    }
}

fn take_string(fields: &mut Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        fields
            .remove(*key)
            .and_then(|value| value.as_str().map(str::to_string))
    })
}

fn take_bool(fields: &mut Map<String, Value>, keys: &[&str]) -> bool {
    keys.iter()
        .find_map(|key| fields.remove(*key).and_then(|value| value.as_bool()))
        .unwrap_or(false)
}

fn take_u64(fields: &mut Map<String, Value>, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .find_map(|key| fields.remove(*key).and_then(|value| value.as_u64()))
}

fn insert_optional_string(fields: &mut Map<String, Value>, key: &str, value: Option<&String>) {
    if let Some(value) = value {
        fields.insert(key.to_string(), Value::String(value.clone()));
    }
}

fn insert_true(fields: &mut Map<String, Value>, key: &str, value: bool) {
    if value {
        fields.insert(key.to_string(), Value::Bool(true));
    }
}

pub(super) fn tool_started(
    call_id: Option<String>,
    name: Option<String>,
    arguments: Option<Value>,
    metadata: Value,
) -> CodexRolloutEvent {
    CodexRolloutEvent::tool(CodexToolCall::started(call_id, name, arguments, metadata))
}

pub(super) fn tool_terminal(
    call_id: Option<String>,
    name: Option<String>,
    arguments: Option<Value>,
    output: Option<Value>,
    failed: bool,
    metadata: Value,
) -> CodexRolloutEvent {
    CodexRolloutEvent::tool(CodexToolCall::terminal(
        call_id, name, arguments, output, failed, metadata,
    ))
}

pub(super) fn tool_start_events_from_response_item(payload: &Value) -> Vec<CodexRolloutEvent> {
    let mut events = vec![tool_started_from_response_item(payload)];
    match tool_name(payload).as_deref() {
        Some("exec_command") => events.push(command_started_from_response_item(payload)),
        Some("update_plan") => {
            if let Some(event) = plan_final_from_response_item(payload) {
                events.push(event);
            }
        }
        _ => {}
    }
    events
}

pub(super) fn tool_finish_events_from_response_item(
    payload: &Value,
    failed: bool,
) -> Vec<CodexRolloutEvent> {
    vec![tool_finished_from_response_item(payload, failed)]
}

pub(super) fn tool_started_from_response_item(payload: &Value) -> CodexRolloutEvent {
    tool_started(
        call_id(payload),
        tool_name(payload),
        parsed_arguments(payload),
        json!({
            "status": string_field(payload, &["status"]),
            "sourceClient": "codex",
            "sourceEventType": payload.get("type").cloned(),
        }),
    )
}

pub(super) fn tool_finished_from_response_item(payload: &Value, failed: bool) -> CodexRolloutEvent {
    let output = response_item_output_value(payload);
    let output_preview = output.as_ref().and_then(tool_output_preview);
    tool_terminal(
        call_id(payload),
        tool_name(payload),
        None,
        output,
        failed,
        json!({
            "status": if failed { "failed" } else { "completed" },
            "success": !failed,
            "outputPreview": output_preview,
            "sourceClient": "codex",
            "sourceEventType": payload.get("type").and_then(Value::as_str),
        }),
    )
}

pub(super) fn response_item_web_search_event(payload: &Value) -> Option<CodexRolloutEvent> {
    let call_id = call_id(payload)?;
    let action = payload.get("action").cloned();
    let query = web_search_query(payload, action.as_ref());
    Some(tool_started(
        Some(call_id),
        Some("web_search".to_string()),
        web_search_arguments(action.as_ref(), query.as_deref()),
        json!({
            "status": "in_progress",
            "action": action.as_ref().and_then(web_search_action_label),
            "query": query,
            "sourceClient": "codex",
            "sourceEventType": "web_search_call",
        }),
    ))
}

pub(super) fn completed_turn_item_tool_event(payload: &Value) -> Option<CodexRolloutEvent> {
    let item = payload.get("item")?;
    let item_type = item.get("type").and_then(Value::as_str)?;
    let call_id = string_field(item, &["id"]);
    let status = string_field(item, &["status"]).unwrap_or_else(|| "completed".to_string());
    let failed = matches!(status.as_str(), "failed" | "declined" | "error");
    let source = json!({
        "status": status,
        "success": !failed,
        "sourceClient": "codex",
        "sourceEventType": "item_completed",
        "sourceItemType": item_type,
        "failureCategory": failed.then_some("completed_item_failed"),
    });

    let (name, arguments, output, source) = match item_type {
        "CommandExecution" => {
            let command = item.get("command").cloned().unwrap_or_else(|| json!([]));
            let command_text = command
                .as_array()
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .filter(|value| !value.is_empty());
            let output = string_field(
                item,
                &[
                    "aggregated_output",
                    "aggregatedOutput",
                    "formatted_output",
                    "formattedOutput",
                ],
            )
            .or_else(|| string_field(item, &["stdout"]))
            .or_else(|| string_field(item, &["stderr"]))
            .map(Value::String);
            (
                Some("exec_command".to_string()),
                Some(json!({
                    "cmd": command_text,
                    "command": command,
                    "workdir": item.get("cwd").cloned(),
                })),
                output,
                source,
            )
        }
        "DynamicToolCall" => {
            let namespace = string_field(item, &["namespace"]);
            let tool = string_field(item, &["tool"])?;
            let name = namespace
                .as_ref()
                .map(|namespace| format!("{namespace}.{tool}"))
                .unwrap_or(tool);
            let content = item
                .get("content_items")
                .or_else(|| item.get("contentItems"))
                .cloned();
            (
                Some(name),
                item.get("arguments").cloned(),
                content,
                merge_metadata(
                    source,
                    json!({
                        "namespace": namespace,
                        "error": string_field(item, &["error"]),
                        "durationMs": duration_millis(item.get("duration")),
                    }),
                ),
            )
        }
        "McpToolCall" => {
            let server = string_field(item, &["server"])?;
            let tool = string_field(item, &["tool"])?;
            let error = item
                .get("error")
                .and_then(|error| string_field(error, &["message"]));
            (
                Some(format!("mcp__{server}__{tool}")),
                item.get("arguments").cloned(),
                item.get("result").cloned(),
                merge_metadata(
                    source,
                    json!({
                        "server": server,
                        "pluginId": string_field(item, &["pluginId", "plugin_id"]),
                        "mcpAppResourceUri": string_field(item, &["mcpAppResourceUri", "mcp_app_resource_uri"]),
                        "error": error,
                        "durationMs": duration_millis(item.get("duration")),
                    }),
                ),
            )
        }
        "WebSearch" => (
            Some("web_search".to_string()),
            Some(json!({
                "query": string_field(item, &["query"]),
                "action": item.get("action").cloned(),
            })),
            item.get("action").cloned(),
            merge_metadata(
                source,
                json!({
                    "query": string_field(item, &["query"]),
                }),
            ),
        ),
        "ImageView" => {
            let path = item.get("path").cloned();
            let output = path.as_ref().map(|path| {
                let path = path
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| path.to_string());
                Value::String(format!("Viewed image: {path}"))
            });
            (
                Some("view_image".to_string()),
                Some(json!({ "path": path })),
                output,
                source,
            )
        }
        "ImageGeneration" => (
            Some("image_generation".to_string()),
            Some(json!({
                "revisedPrompt": string_field(item, &["revised_prompt", "revisedPrompt"]),
                "savedPath": item.get("saved_path").or_else(|| item.get("savedPath")).cloned(),
            })),
            item.get("result").cloned(),
            source,
        ),
        "CollabAgentToolCall" => {
            let tool = string_field(item, &["tool"]).unwrap_or_else(|| "collab_agent".to_string());
            (
                Some(collab_turn_item_tool_name(&tool).to_string()),
                Some(json!({
                    "senderThreadId": item.get("sender_thread_id").or_else(|| item.get("senderThreadId")).cloned(),
                    "receiverThreadIds": item.get("receiver_thread_ids").or_else(|| item.get("receiverThreadIds")).cloned(),
                    "prompt": string_field(item, &["prompt"]),
                    "model": string_field(item, &["model"]),
                })),
                item.get("agents_states")
                    .or_else(|| item.get("agentsStates"))
                    .cloned(),
                source,
            )
        }
        "Sleep" => (
            Some("sleep".to_string()),
            Some(json!({
                "durationMs": item.get("duration_ms").or_else(|| item.get("durationMs")).cloned(),
            })),
            None,
            source,
        ),
        _ => return None,
    };

    Some(tool_terminal(
        call_id, name, arguments, output, failed, source,
    ))
}

fn merge_metadata(base: Value, extension: Value) -> Value {
    let mut base = base.as_object().cloned().unwrap_or_default();
    if let Some(extension) = compact_json(extension).as_object() {
        base.extend(extension.clone());
    }
    Value::Object(base)
}

fn duration_millis(duration: Option<&Value>) -> Option<u64> {
    let duration = duration?;
    duration
        .as_u64()
        .or_else(|| duration.as_str()?.strip_suffix("ms")?.trim().parse().ok())
}

fn collab_turn_item_tool_name(tool: &str) -> &str {
    match tool {
        "spawn_agent" => "agent",
        "send_input" => "send_message",
        "resume_agent" => "resume_agent",
        "wait" => "wait_agent",
        "close_agent" => "close_agent",
        _ => "collab_agent",
    }
}

fn response_item_output_value(payload: &Value) -> Option<Value> {
    payload
        .get("output")
        .or_else(|| payload.get("tools"))
        .or_else(|| payload.get("result"))
        .cloned()
}

pub(in crate::runtime::conversation_import) fn visible_tool_output_text(
    output: &Value,
) -> Option<String> {
    match output {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => {
            let text = parts
                .iter()
                .filter_map(|part| {
                    let part_type = part.get("type").and_then(Value::as_str)?;
                    matches!(part_type, "input_text" | "output_text" | "text")
                        .then(|| part.get("text").and_then(Value::as_str))
                        .flatten()
                })
                .collect::<String>();
            (!text.is_empty()).then_some(text)
        }
        Value::Object(object) => object
            .get("text")
            .and_then(Value::as_str)
            .map(str::to_string),
        _ => None,
    }
}

fn tool_output_preview(output: &Value) -> Option<String> {
    visible_tool_output_text(output).map(|text| truncate_output_preview(&text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_item_tool_output_preserves_content_items() {
        let output = json!([
            { "type": "input_text", "text": "result" },
            { "type": "input_image", "image_url": "data:image/png;base64,AA==" }
        ]);
        let events = tool_finish_events_from_response_item(
            &json!({
                "type": "function_call_output",
                "call_id": "call-structured",
                "output": output,
            }),
            false,
        );
        let draft = events[0].tool_call().expect("decoded tool call");

        assert_eq!(draft.phase, CodexToolPhase::Completed);
        assert_eq!(draft.output.as_ref(), Some(&output));
        assert_eq!(draft.call_id.as_deref(), Some("call-structured"));
        assert_eq!(draft.source.output_preview.as_deref(), Some("result"));
    }

    #[test]
    fn response_item_tool_output_joins_visible_text_without_serializing_parts() {
        let output = json!([
            { "type": "input_text", "text": "Script completed\n" },
            { "type": "input_text", "text": "Output:\nready\n" },
            { "type": "input_image", "image_url": "data:image/png;base64,AA==" }
        ]);

        assert_eq!(
            visible_tool_output_text(&output).as_deref(),
            Some("Script completed\nOutput:\nready\n")
        );
        assert!(!tool_output_preview(&output)
            .expect("text preview")
            .contains("input_text"));
    }

    #[test]
    fn completed_dynamic_turn_item_becomes_tool_call() {
        let event = completed_turn_item_tool_event(&json!({
            "type": "item_completed",
            "item": {
                "type": "DynamicToolCall",
                "id": "call-paginated",
                "namespace": "docs",
                "tool": "lookup",
                "arguments": { "query": "typed draft" },
                "status": "completed",
                "content_items": [{ "type": "input_text", "text": "result" }],
                "success": true,
            }
        }))
        .expect("paginated tool item");
        let draft = event.tool_call().expect("decoded tool call");

        assert_eq!(draft.call_id.as_deref(), Some("call-paginated"));
        assert_eq!(draft.name.as_deref(), Some("docs.lookup"));
        assert_eq!(draft.phase, CodexToolPhase::Completed);
        assert_eq!(
            draft.output,
            Some(json!([{ "type": "input_text", "text": "result" }]))
        );
    }
}
