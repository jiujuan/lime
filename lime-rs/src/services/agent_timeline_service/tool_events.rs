use lime_core::database::dao::agent_timeline::AgentThreadItemPayload;
use serde_json::Value;

fn parse_tool_arguments(arguments: Option<&str>) -> Option<Value> {
    let raw = arguments?.trim();
    if raw.is_empty() {
        return None;
    }

    Some(serde_json::from_str::<Value>(raw).unwrap_or_else(|_| Value::String(raw.to_string())))
}

fn metadata_value_from_tool_result(result: &lime_agent::AgentToolResult) -> Option<Value> {
    result
        .metadata
        .as_ref()
        .and_then(|metadata| serde_json::to_value(metadata).ok())
}

fn tool_name_from_metadata(metadata: Option<&Value>) -> Option<String> {
    metadata
        .and_then(|value| value.get("toolName").or_else(|| value.get("tool_name")))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(super) fn build_tool_start_payload(
    tool_name: &str,
    arguments: Option<&str>,
) -> AgentThreadItemPayload {
    AgentThreadItemPayload::ToolCall {
        tool_name: tool_name.to_string(),
        arguments: parse_tool_arguments(arguments),
        output: None,
        success: None,
        error: None,
        metadata: None,
    }
}

pub(super) fn build_tool_end_payload(
    tool_id: &str,
    result: &lime_agent::AgentToolResult,
    previous_tool_name: Option<String>,
    previous_arguments: Option<Value>,
) -> AgentThreadItemPayload {
    let metadata = metadata_value_from_tool_result(result);
    let tool_name = tool_name_from_metadata(metadata.as_ref())
        .or(previous_tool_name)
        .unwrap_or_else(|| tool_id.to_string());

    AgentThreadItemPayload::ToolCall {
        tool_name,
        arguments: previous_arguments,
        output: if result.output.is_empty() {
            None
        } else {
            Some(result.output.clone())
        },
        success: Some(result.success),
        error: result.error.clone(),
        metadata,
    }
}
