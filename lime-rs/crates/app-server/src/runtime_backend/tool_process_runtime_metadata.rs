use super::tool_process_metadata::{
    build_tool_process_metadata, merge_result_tool_process_metadata, merge_tool_process_metadata,
    SoulStyleMetadata, ToolProcessMetadataInput, ToolProcessStatus,
};
use lime_agent::AgentEvent as RuntimeAgentEvent;
use serde_json::{Map, Value};
use std::collections::HashMap;

pub(super) fn enrich_runtime_tool_process_payload(
    event: &RuntimeAgentEvent,
    payload_object: &mut Map<String, Value>,
    fallback_soul_style: Option<&SoulStyleMetadata>,
) {
    let Some(input) = runtime_tool_process_input(event) else {
        return;
    };
    let payload_soul_style = SoulStyleMetadata::from_payload_object(payload_object)
        .unwrap_or_default()
        .merge_with_fallback(fallback_soul_style);
    let metadata = build_tool_process_metadata(ToolProcessMetadataInput {
        tool_id: input.tool_id,
        tool_name: input.tool_name.as_deref(),
        status: input.status,
        arguments: input.arguments.as_ref(),
        result: input.result,
        soul_style: payload_soul_style.as_ref(),
    });
    merge_tool_process_metadata(payload_object, &metadata);
    merge_result_tool_process_metadata(payload_object, &metadata);
    insert_runtime_tool_process_aliases(payload_object, &metadata);
}

pub(super) fn runtime_tool_args_event_payload(
    tool_id: &str,
    tool_name: &str,
    arguments: &str,
    fallback_soul_style: Option<&SoulStyleMetadata>,
) -> Value {
    let parsed_arguments = parse_tool_arguments(arguments);
    let mut payload = Map::from_iter([
        ("toolCallId".to_string(), Value::String(tool_id.to_string())),
        ("args".to_string(), parsed_arguments.clone()),
        ("rawArgs".to_string(), Value::String(arguments.to_string())),
        (
            "source".to_string(),
            Value::String("runtime_tool_start".to_string()),
        ),
    ]);
    let metadata = build_tool_process_metadata(ToolProcessMetadataInput {
        tool_id,
        tool_name: Some(tool_name),
        status: ToolProcessStatus::InputDelta,
        arguments: Some(&parsed_arguments),
        result: None,
        soul_style: fallback_soul_style,
    });
    merge_tool_process_metadata(&mut payload, &metadata);
    insert_runtime_tool_process_aliases(&mut payload, &metadata);
    Value::Object(payload)
}

struct RuntimeToolProcessInput<'a> {
    tool_id: &'a str,
    tool_name: Option<String>,
    status: ToolProcessStatus,
    arguments: Option<Value>,
    result: Option<&'a lime_agent::AgentToolResult>,
}

fn runtime_tool_process_input(event: &RuntimeAgentEvent) -> Option<RuntimeToolProcessInput<'_>> {
    match event {
        RuntimeAgentEvent::ToolStart {
            tool_name,
            tool_id,
            arguments,
        } => Some(RuntimeToolProcessInput {
            tool_id,
            tool_name: Some(tool_name.clone()),
            status: ToolProcessStatus::Started,
            arguments: arguments
                .as_deref()
                .and_then(non_empty_str)
                .map(parse_tool_arguments),
            result: None,
        }),
        RuntimeAgentEvent::ToolEnd { tool_id, result } => Some(RuntimeToolProcessInput {
            tool_id,
            tool_name: result
                .metadata
                .as_ref()
                .and_then(|metadata| read_metadata_string(metadata, &["tool_name", "toolName"])),
            status: if result.success {
                ToolProcessStatus::Completed
            } else {
                ToolProcessStatus::Failed
            },
            arguments: None,
            result: Some(result),
        }),
        RuntimeAgentEvent::ToolProgress { tool_id, progress } => Some(RuntimeToolProcessInput {
            tool_id,
            tool_name: progress
                .metadata
                .as_ref()
                .and_then(|metadata| read_metadata_string(metadata, &["tool_name", "toolName"])),
            status: ToolProcessStatus::Progress,
            arguments: None,
            result: None,
        }),
        RuntimeAgentEvent::ToolOutputDelta {
            tool_id, metadata, ..
        } => Some(RuntimeToolProcessInput {
            tool_id,
            tool_name: metadata
                .as_ref()
                .and_then(|metadata| read_metadata_string(metadata, &["tool_name", "toolName"])),
            status: ToolProcessStatus::OutputDelta,
            arguments: None,
            result: None,
        }),
        RuntimeAgentEvent::ToolInputDelta {
            tool_id,
            tool_name,
            accumulated_arguments,
            ..
        } => Some(RuntimeToolProcessInput {
            tool_id,
            tool_name: tool_name.clone(),
            status: ToolProcessStatus::InputDelta,
            arguments: accumulated_arguments
                .as_deref()
                .and_then(non_empty_str)
                .map(parse_tool_arguments),
            result: None,
        }),
        _ => None,
    }
}

fn insert_runtime_tool_process_aliases(
    payload_object: &mut Map<String, Value>,
    metadata: &Map<String, Value>,
) {
    if let Some(facts) = metadata.get("tool_process_facts") {
        payload_object.insert("toolProcessFacts".to_string(), facts.clone());
    }
    if let Some(summary) = metadata.get("tool_process_summary") {
        payload_object.insert("toolProcessSummary".to_string(), summary.clone());
    }
}

fn parse_tool_arguments(arguments: &str) -> Value {
    serde_json::from_str(arguments).unwrap_or_else(|_| Value::String(arguments.to_string()))
}

fn read_metadata_string(metadata: &HashMap<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| metadata.get(*key)?.as_str().and_then(non_empty_str))
        .map(str::to_string)
}

fn non_empty_str(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()).then_some(value)
}
