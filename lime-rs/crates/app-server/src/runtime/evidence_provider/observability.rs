use app_server_protocol::AgentEvent;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::collections::HashSet;

pub(super) fn skill_invocations_summary(events: &[AgentEvent]) -> Value {
    let mut invocations = Vec::new();
    let mut seen = HashSet::new();
    for event in events {
        let Some(metadata) = tool_result_metadata_from_event(event) else {
            continue;
        };
        if !metadata_marks_skill_invocation(metadata) {
            continue;
        }
        let skill_name = metadata_map_string(metadata, &["skill_name", "skillName"])
            .or_else(|| tool_skill_name_from_event(event))
            .unwrap_or_else(|| "unknown".to_string());
        let tool_call_id = tool_call_id_from_event(event);
        let dedupe_key = format!(
            "{}:{}:{}",
            event.turn_id.as_deref().unwrap_or_default(),
            tool_call_id.as_deref().unwrap_or(event.event_id.as_str()),
            skill_name
        );
        if !seen.insert(dedupe_key) {
            continue;
        }

        let mut invocation = Map::new();
        invocation.insert("event".to_string(), json!("skill_invocation"));
        invocation.insert("skillName".to_string(), json!(skill_name));
        invocation.insert("status".to_string(), json!(tool_status(event)));
        invocation.insert("sourceEventId".to_string(), json!(event.event_id));
        invocation.insert("sourceEventType".to_string(), json!(event.event_type));
        if let Some(turn_id) = event.turn_id.as_deref() {
            invocation.insert("turnId".to_string(), json!(turn_id));
        }
        if let Some(tool_call_id) = tool_call_id {
            invocation.insert("toolCallId".to_string(), json!(tool_call_id));
        }
        if let Some(workspace_source) = metadata
            .get("workspace_skill_source")
            .or_else(|| metadata.get("workspaceSkillSource"))
            .cloned()
        {
            invocation.insert("workspaceSkillSource".to_string(), workspace_source);
        }
        if let Some(runtime_enable) = metadata
            .get("workspace_skill_runtime_enable")
            .or_else(|| metadata.get("workspaceSkillRuntimeEnable"))
            .cloned()
        {
            invocation.insert("workspaceSkillRuntimeEnable".to_string(), runtime_enable);
        }
        if let Some(contract) = metadata.get("modality_runtime_contract").cloned() {
            invocation.insert("modalityRuntimeContract".to_string(), contract);
        }
        invocations.push(Value::Object(invocation));
    }
    Value::Array(invocations)
}

pub(super) fn skill_searches_summary(events: &[AgentEvent]) -> Value {
    let mut searches = Vec::new();
    let mut seen = HashSet::new();
    for event in events {
        let Some(metadata) = tool_result_metadata_from_event(event) else {
            continue;
        };
        if !metadata_marks_skill_search(metadata) {
            continue;
        }
        let query = metadata_map_string(metadata, &["skill_search_query", "skillSearchQuery"])
            .or_else(|| tool_argument_string_from_event(event, &["query"]));
        let tool_call_id = tool_call_id_from_event(event);
        let dedupe_key = format!(
            "{}:{}:{}",
            event.turn_id.as_deref().unwrap_or_default(),
            tool_call_id.as_deref().unwrap_or(event.event_id.as_str()),
            query.as_deref().unwrap_or_default()
        );
        if !seen.insert(dedupe_key) {
            continue;
        }

        let mut search = Map::new();
        search.insert("event".to_string(), json!("skill_search"));
        search.insert("status".to_string(), json!(tool_status(event)));
        search.insert("sourceEventId".to_string(), json!(event.event_id));
        search.insert("sourceEventType".to_string(), json!(event.event_type));
        if let Some(query) = query {
            search.insert("query".to_string(), json!(query));
        }
        if let Some(result_count) = metadata_map_u64(
            metadata,
            &["skill_search_result_count", "skillSearchResultCount"],
        ) {
            search.insert("resultCount".to_string(), json!(result_count));
        }
        if let Some(snapshot_skill_count) = metadata_map_u64(
            metadata,
            &[
                "skill_search_snapshot_skill_count",
                "skillSearchSnapshotSkillCount",
            ],
        ) {
            search.insert(
                "snapshotSkillCount".to_string(),
                json!(snapshot_skill_count),
            );
        }
        if let Some(turn_id) = event.turn_id.as_deref() {
            search.insert("turnId".to_string(), json!(turn_id));
        }
        if let Some(tool_call_id) = tool_call_id {
            search.insert("toolCallId".to_string(), json!(tool_call_id));
        }
        searches.push(Value::Object(search));
    }
    Value::Array(searches)
}

pub(super) fn mcp_tool_results_summary(events: &[AgentEvent]) -> Value {
    let mut results = Vec::new();
    let mut seen = HashSet::new();
    for event in events {
        if !matches!(event.event_type.as_str(), "tool.result" | "item.completed") {
            continue;
        }
        let Some(tool_name) = tool_name_from_event(event) else {
            continue;
        };
        if !tool_name.starts_with("mcp__") {
            continue;
        }
        let Some(structured_content) = tool_structured_content_from_event(event) else {
            continue;
        };
        let tool_call_id = tool_call_id_from_event(event);
        let dedupe_key = format!(
            "{}:{}:{}",
            event.turn_id.as_deref().unwrap_or_default(),
            tool_call_id.as_deref().unwrap_or(event.event_id.as_str()),
            tool_name
        );
        if !seen.insert(dedupe_key) {
            continue;
        }

        let mut result = Map::new();
        result.insert("event".to_string(), json!("mcp_tool_result"));
        result.insert("toolName".to_string(), json!(tool_name));
        result.insert("status".to_string(), json!(tool_status(event)));
        result.insert("sourceEventId".to_string(), json!(event.event_id));
        result.insert("sourceEventType".to_string(), json!(event.event_type));
        result.insert("hasStructuredContent".to_string(), json!(true));
        if let Some(keys) = structured_content_keys(structured_content) {
            result.insert("structuredContentKeys".to_string(), json!(keys));
        }
        if let Some(turn_id) = event.turn_id.as_deref() {
            result.insert("turnId".to_string(), json!(turn_id));
        }
        if let Some(tool_call_id) = tool_call_id {
            result.insert("toolCallId".to_string(), json!(tool_call_id));
        }
        results.push(Value::Object(result));
    }
    Value::Array(results)
}

fn tool_result_metadata_from_event(event: &AgentEvent) -> Option<&Map<String, Value>> {
    let payload = &event.payload;
    let candidate = payload
        .get("metadata")
        .or_else(|| {
            payload
                .get("result")
                .and_then(|result| result.get("metadata"))
        })
        .or_else(|| {
            payload
                .get("item")
                .and_then(|item| item.get("payload").or(Some(item)))
                .and_then(|item_payload| item_payload.get("metadata"))
        });
    candidate.and_then(Value::as_object)
}

fn metadata_map_string(metadata: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(value_string)
}

fn metadata_map_u64(metadata: &Map<String, Value>, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(Value::as_u64)
}

fn metadata_marks_skill_invocation(metadata: &Map<String, Value>) -> bool {
    metadata
        .get("tool_family")
        .or_else(|| metadata.get("toolFamily"))
        .and_then(Value::as_str)
        .is_some_and(|family| family == "skill")
        || metadata.get("workspace_skill_source").is_some()
        || metadata.get("workspaceSkillSource").is_some()
        || metadata.get("workspace_skill_runtime_enable").is_some()
        || metadata.get("workspaceSkillRuntimeEnable").is_some()
}

fn metadata_marks_skill_search(metadata: &Map<String, Value>) -> bool {
    metadata
        .get("tool_family")
        .or_else(|| metadata.get("toolFamily"))
        .and_then(Value::as_str)
        .is_some_and(|family| family == "skill_search")
}

fn tool_skill_name_from_event(event: &AgentEvent) -> Option<String> {
    event
        .payload
        .get("arguments")
        .and_then(|arguments| {
            metadata_string(Some(arguments), &["skill", "skill_name", "skillName"])
        })
        .or_else(|| {
            event
                .payload
                .get("item")
                .and_then(|item| item.get("payload").or(Some(item)))
                .and_then(|payload| payload.get("arguments"))
                .and_then(|arguments| {
                    metadata_string(Some(arguments), &["skill", "skill_name", "skillName"])
                })
        })
}

fn tool_argument_string_from_event(event: &AgentEvent, keys: &[&str]) -> Option<String> {
    event
        .payload
        .get("arguments")
        .and_then(|arguments| metadata_string(Some(arguments), keys))
        .or_else(|| {
            event
                .payload
                .get("item")
                .and_then(|item| item.get("payload").or(Some(item)))
                .and_then(|payload| payload.get("arguments"))
                .and_then(|arguments| metadata_string(Some(arguments), keys))
        })
}

fn tool_name_from_event(event: &AgentEvent) -> Option<String> {
    metadata_string(Some(&event.payload), &["toolName", "tool_name", "name"]).or_else(|| {
        event.payload.get("item").and_then(|item| {
            metadata_string(Some(item), &["toolName", "tool_name", "name"]).or_else(|| {
                item.get("payload").and_then(|payload| {
                    metadata_string(Some(payload), &["toolName", "tool_name", "name"])
                })
            })
        })
    })
}

fn tool_structured_content_from_event(event: &AgentEvent) -> Option<&Value> {
    structured_content_value(&event.payload).or_else(|| {
        event.payload.get("item").and_then(|item| {
            item.get("payload")
                .and_then(structured_content_value)
                .or_else(|| structured_content_value(item))
        })
    })
}

fn structured_content_value(value: &Value) -> Option<&Value> {
    value
        .get("structuredContent")
        .or_else(|| value.get("structured_content"))
        .filter(|value| !value.is_null())
        .or_else(|| {
            value
                .get("result")
                .and_then(|result| {
                    result
                        .get("structuredContent")
                        .or_else(|| result.get("structured_content"))
                })
                .filter(|value| !value.is_null())
        })
}

fn structured_content_keys(value: &Value) -> Option<Vec<String>> {
    let object = value.as_object()?;
    Some(object.keys().cloned().collect())
}

fn tool_call_id_from_event(event: &AgentEvent) -> Option<String> {
    metadata_string(
        Some(&event.payload),
        &["toolCallId", "tool_call_id", "toolId", "tool_id", "id"],
    )
    .or_else(|| {
        event.payload.get("item").and_then(|item| {
            metadata_string(Some(item), &["id", "itemId", "item_id"]).or_else(|| {
                item.get("payload").and_then(|payload| {
                    metadata_string(Some(payload), &["id", "itemId", "item_id"])
                })
            })
        })
    })
}

fn tool_status(event: &AgentEvent) -> &'static str {
    match event.event_type.as_str() {
        "tool.failed" => "failed",
        "item.completed" | "tool.result" => "completed",
        "item.started" | "item.updated" | "tool.started" => "started",
        _ => "recorded",
    }
}

fn metadata_string(metadata: Option<&Value>, keys: &[&str]) -> Option<String> {
    let metadata = metadata?;
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(value_string)
}

fn value_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
