use super::canonical_tool::{canonical_tool, CanonicalTool, CanonicalToolKind};
use app_server_protocol::AgentEvent;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::collections::HashSet;

pub(super) fn skill_invocations_summary(events: &[AgentEvent]) -> Value {
    let mut invocations = Vec::new();
    let mut seen = HashSet::new();
    for event in events {
        let Some(tool) = canonical_tool(event) else {
            continue;
        };
        let Some(metadata) = skill_invocation_metadata(&tool) else {
            continue;
        };
        if !metadata_marks_skill_invocation(&metadata) {
            continue;
        }
        let skill_name = metadata_map_string(&metadata, &["skill_name", "skillName"])
            .or_else(|| tool_skill_name(&tool))
            .unwrap_or_else(|| "unknown".to_string());
        let dedupe_key = format!(
            "{}:{}:{}",
            event.turn_id.as_deref().unwrap_or_default(),
            tool.call_id,
            skill_name
        );
        if !seen.insert(dedupe_key) {
            continue;
        }

        let mut invocation = Map::new();
        invocation.insert("event".to_string(), json!("skill_invocation"));
        invocation.insert("skillName".to_string(), json!(skill_name));
        invocation.insert("status".to_string(), json!(tool.status_label()));
        invocation.insert("sourceEventId".to_string(), json!(event.event_id));
        invocation.insert("sourceEventType".to_string(), json!(event.event_type));
        if let Some(turn_id) = event.turn_id.as_deref() {
            invocation.insert("turnId".to_string(), json!(turn_id));
        }
        invocation.insert("toolCallId".to_string(), json!(tool.call_id));
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

fn skill_invocation_metadata(tool: &CanonicalTool) -> Option<Map<String, Value>> {
    let mut metadata = Map::new();
    if let Some(raw_metadata) = tool_result_metadata(tool) {
        metadata.extend(
            raw_metadata
                .iter()
                .map(|(key, value)| (key.clone(), value.clone())),
        );
    }
    if let Some(structured_content) = tool.structured_content().and_then(Value::as_object) {
        metadata.extend(
            structured_content
                .iter()
                .map(|(key, value)| (key.clone(), value.clone())),
        );
    }
    (!metadata.is_empty()).then_some(metadata)
}

pub(super) fn skill_searches_summary(events: &[AgentEvent]) -> Value {
    let mut searches = Vec::new();
    let mut seen = HashSet::new();
    for event in events {
        let Some(tool) = canonical_tool(event) else {
            continue;
        };
        let Some(metadata) = skill_invocation_metadata(&tool) else {
            continue;
        };
        if !metadata_marks_skill_search(&metadata) {
            continue;
        }
        let query = metadata_map_string(&metadata, &["skill_search_query", "skillSearchQuery"])
            .or_else(|| tool_argument_string(&tool, &["query"]));
        let dedupe_key = format!(
            "{}:{}:{}",
            event.turn_id.as_deref().unwrap_or_default(),
            tool.call_id,
            query.as_deref().unwrap_or_default()
        );
        if !seen.insert(dedupe_key) {
            continue;
        }

        let mut search = Map::new();
        search.insert("event".to_string(), json!("skill_search"));
        search.insert("status".to_string(), json!(tool.status_label()));
        search.insert("sourceEventId".to_string(), json!(event.event_id));
        search.insert("sourceEventType".to_string(), json!(event.event_type));
        if let Some(query) = query {
            search.insert("query".to_string(), json!(query));
        }
        if let Some(result_count) = metadata_map_u64(
            &metadata,
            &["skill_search_result_count", "skillSearchResultCount"],
        ) {
            search.insert("resultCount".to_string(), json!(result_count));
        }
        if let Some(snapshot_skill_count) = metadata_map_u64(
            &metadata,
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
        search.insert("toolCallId".to_string(), json!(tool.call_id));
        searches.push(Value::Object(search));
    }
    Value::Array(searches)
}

pub(super) fn mcp_tool_results_summary(events: &[AgentEvent]) -> Value {
    let mut results = Vec::new();
    let mut seen = HashSet::new();
    for event in events {
        if event.event_type != "item.completed" {
            continue;
        }
        let Some(tool) = canonical_tool(event) else {
            continue;
        };
        if tool.kind != CanonicalToolKind::Mcp && !tool.name.starts_with("mcp__") {
            continue;
        }
        let Some(structured_content) = tool.structured_content() else {
            continue;
        };
        let dedupe_key = format!(
            "{}:{}:{}",
            event.turn_id.as_deref().unwrap_or_default(),
            tool.call_id,
            tool.name
        );
        if !seen.insert(dedupe_key) {
            continue;
        }

        let mut result = Map::new();
        result.insert("event".to_string(), json!("mcp_tool_result"));
        result.insert("toolName".to_string(), json!(tool.name));
        result.insert("status".to_string(), json!(tool.status_label()));
        result.insert("sourceEventId".to_string(), json!(event.event_id));
        result.insert("sourceEventType".to_string(), json!(event.event_type));
        result.insert("hasStructuredContent".to_string(), json!(true));
        if let Some(server_name) = &tool.server_name {
            result.insert("serverName".to_string(), json!(server_name));
        }
        if let Some(keys) = structured_content_keys(structured_content) {
            result.insert("structuredContentKeys".to_string(), json!(keys));
        }
        if let Some(turn_id) = event.turn_id.as_deref() {
            result.insert("turnId".to_string(), json!(turn_id));
        }
        result.insert("toolCallId".to_string(), json!(tool.call_id));
        results.push(Value::Object(result));
    }
    Value::Array(results)
}

pub(super) fn mcp_resource_reads_summary(events: &[AgentEvent]) -> Value {
    let mut reads = Vec::new();
    let mut seen = HashSet::new();
    for event in events {
        if event.event_type != "item.completed" {
            continue;
        }
        let Some(tool) = canonical_tool(event) else {
            continue;
        };
        if !tool.name.eq_ignore_ascii_case("ReadMcpResourceTool")
            && !tool.name.eq_ignore_ascii_case("read_mcp_resource")
        {
            continue;
        }
        let Some(uri) = mcp_resource_uri(&tool) else {
            continue;
        };
        let dedupe_key = format!(
            "{}:{}:{}",
            event.turn_id.as_deref().unwrap_or_default(),
            tool.call_id,
            uri
        );
        if !seen.insert(dedupe_key) {
            continue;
        }

        let mut read = Map::new();
        read.insert("event".to_string(), json!("mcp_resource_read"));
        read.insert("toolName".to_string(), json!(tool.name));
        read.insert("uri".to_string(), json!(uri));
        read.insert("status".to_string(), json!(tool.status_label()));
        read.insert("sourceEventId".to_string(), json!(event.event_id));
        read.insert("sourceEventType".to_string(), json!(event.event_type));
        if let Some(server) = mcp_resource_server(&tool) {
            read.insert("server".to_string(), json!(server));
        }
        if let Some(mime_types) = mcp_resource_mime_types(&tool) {
            read.insert("mimeTypes".to_string(), json!(mime_types));
        }
        if let Some(content_count) = mcp_resource_content_count(&tool) {
            read.insert("contentCount".to_string(), json!(content_count));
        }
        if let Some(content_refs) = mcp_resource_content_refs(&tool) {
            read.insert("contentRefs".to_string(), json!(content_refs));
        }
        if let Some(turn_id) = event.turn_id.as_deref() {
            read.insert("turnId".to_string(), json!(turn_id));
        }
        read.insert("toolCallId".to_string(), json!(tool.call_id));
        reads.push(Value::Object(read));
    }
    Value::Array(reads)
}

fn tool_result_metadata(tool: &CanonicalTool) -> Option<&Map<String, Value>> {
    tool.structured_content()
        .and_then(|content| content.get("metadata"))
        .and_then(Value::as_object)
        .or_else(|| tool.metadata.as_object())
}

fn tool_argument_string(tool: &CanonicalTool, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| tool.arguments.get(*key))
        .find_map(value_string)
}

fn tool_result(tool: &CanonicalTool) -> Option<&Value> {
    tool.structured_content()
}

fn mcp_resource_server(tool: &CanonicalTool) -> Option<String> {
    tool.server_name.clone().or_else(|| {
        metadata_map_string(
            &tool.arguments,
            &[
                "server",
                "serverName",
                "server_name",
                "mcpServer",
                "mcp_server",
            ],
        )
    })
}

fn mcp_resource_uri(tool: &CanonicalTool) -> Option<String> {
    metadata_map_string(&tool.arguments, &["uri", "resourceUri", "resource_uri"]).or_else(|| {
        tool_result(tool).and_then(|result| {
            metadata_string(Some(result), &["uri", "resourceUri", "resource_uri"])
        })
    })
}

fn mcp_resource_mime_types(tool: &CanonicalTool) -> Option<Vec<String>> {
    let mut values = Vec::new();
    if let Some(result) = tool_result(tool) {
        collect_resource_mime_types(result, &mut values);
    }
    let deduped = dedupe_strings(values);
    if deduped.is_empty() {
        None
    } else {
        Some(deduped)
    }
}

fn mcp_resource_content_count(tool: &CanonicalTool) -> Option<usize> {
    let result = tool_result(tool)?;
    if let Some(contents) = result.get("contents").and_then(Value::as_array) {
        return Some(contents.len());
    }
    if result.get("text").is_some() || result.get("blob").is_some() {
        return Some(1);
    }
    None
}

fn mcp_resource_content_refs(tool: &CanonicalTool) -> Option<Vec<Value>> {
    let result = tool_result(tool)?;
    let mut refs = Vec::new();
    if let Some(contents) = result.get("contents").and_then(Value::as_array) {
        for (index, content) in contents.iter().enumerate() {
            if let Some(reference) = resource_content_ref(content, index) {
                refs.push(reference);
            }
        }
    } else if let Some(reference) = resource_content_ref(result, 0) {
        refs.push(reference);
    }

    if refs.is_empty() {
        None
    } else {
        Some(refs)
    }
}

fn collect_resource_mime_types(value: &Value, target: &mut Vec<String>) {
    if let Some(mime_type) = metadata_string(Some(value), &["mimeType", "mime_type"]) {
        target.push(mime_type);
    }

    match value {
        Value::Array(items) => {
            for item in items {
                collect_resource_mime_types(item, target);
            }
        }
        Value::Object(object) => {
            for item in object.values() {
                collect_resource_mime_types(item, target);
            }
        }
        _ => {}
    }
}

fn resource_content_ref(value: &Value, index: usize) -> Option<Value> {
    let mut reference = Map::new();
    reference.insert("index".to_string(), json!(index));

    if let Some(content_type) =
        metadata_string(Some(value), &["type", "contentType", "content_type"])
    {
        reference.insert("type".to_string(), json!(content_type));
    } else if value.get("text").is_some() {
        reference.insert("type".to_string(), json!("text"));
    } else if value.get("blob").is_some() {
        reference.insert("type".to_string(), json!("blob"));
    }

    if let Some(uri) = metadata_string(Some(value), &["uri", "resourceUri", "resource_uri"]) {
        reference.insert("uri".to_string(), json!(uri));
    }
    if let Some(mime_type) = metadata_string(Some(value), &["mimeType", "mime_type"]) {
        reference.insert("mimeType".to_string(), json!(mime_type));
    }
    if let Some(char_count) = value
        .get("text")
        .and_then(Value::as_str)
        .map(|text| text.chars().count())
    {
        reference.insert("textCharCount".to_string(), json!(char_count));
    }
    if let Some(blob_bytes) = value.get("blob").and_then(Value::as_str).map(str::len) {
        reference.insert("blobBase64Bytes".to_string(), json!(blob_bytes));
    }

    if reference.len() > 1 {
        Some(Value::Object(reference))
    } else {
        None
    }
}

fn dedupe_strings(items: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for item in items {
        if seen.insert(item.clone()) {
            deduped.push(item);
        }
    }
    deduped
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

fn tool_skill_name(tool: &CanonicalTool) -> Option<String> {
    tool_argument_string(tool, &["skill", "skill_name", "skillName"])
}

fn structured_content_keys(value: &Value) -> Option<Vec<String>> {
    let object = value.as_object()?;
    Some(object.keys().cloned().collect())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn event(event_type: &str, event_id: &str, payload: Value) -> AgentEvent {
        AgentEvent {
            event_id: event_id.to_string(),
            sequence: 1,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: event_type.to_string(),
            timestamp: "2026-06-22T00:00:00.000Z".to_string(),
            payload,
        }
    }

    fn completed_tool_event(
        event_id: &str,
        call_id: &str,
        name: &str,
        arguments: Value,
        structured_content: Value,
    ) -> AgentEvent {
        let arguments = arguments
            .as_object()
            .expect("arguments object")
            .iter()
            .map(|(name, value)| {
                json!({
                    "name": name,
                    "value": value.to_string(),
                })
            })
            .collect::<Vec<_>>();
        event(
            "item.completed",
            event_id,
            json!({
                "item": {
                    "sessionId": "session-1",
                    "threadId": "thread-1",
                    "turnId": "turn-1",
                    "itemId": format!("item-{call_id}"),
                    "sequence": 1,
                    "ordinal": 1,
                    "createdAtMs": 1,
                    "updatedAtMs": 2,
                    "completedAtMs": 2,
                    "kind": "tool",
                    "status": "completed",
                    "payload": {
                        "type": "tool",
                        "call_id": call_id,
                        "name": name,
                        "arguments": arguments,
                        "output": {
                            "structuredContent": structured_content,
                        }
                    },
                    "metadata": {}
                }
            }),
        )
    }

    #[test]
    fn mcp_resource_reads_summary_projects_resource_grounding() {
        let summary = mcp_resource_reads_summary(&[completed_tool_event(
            "evt-resource-1",
            "resource-call-1",
            "ReadMcpResourceTool",
            json!({
                "server": "docs",
                "uri": "file:///docs/intro.md"
            }),
            json!({
                "uri": "file:///docs/intro.md",
                "mime_type": "text/markdown",
                "text": "# Intro"
            }),
        )]);

        let reads = summary.as_array().expect("summary array");
        assert_eq!(reads.len(), 1);
        assert_eq!(reads[0]["event"], "mcp_resource_read");
        assert_eq!(reads[0]["server"], "docs");
        assert_eq!(reads[0]["uri"], "file:///docs/intro.md");
        assert_eq!(reads[0]["mimeTypes"], json!(["text/markdown"]));
        assert_eq!(reads[0]["contentCount"], 1);
        assert_eq!(reads[0]["contentRefs"][0]["type"], "text");
        assert_eq!(reads[0]["contentRefs"][0]["textCharCount"], 7);
        assert_eq!(reads[0]["toolCallId"], "resource-call-1");
        assert!(reads[0].get("text").is_none());
    }

    #[test]
    fn mcp_resource_reads_summary_projects_item_completed_contents() {
        let summary = mcp_resource_reads_summary(&[completed_tool_event(
            "evt-resource-2",
            "resource-call-2",
            "read_mcp_resource",
            json!({
                "serverName": "assets",
                "resourceUri": "asset://logo"
            }),
            json!({
                "contents": [
                    {
                        "uri": "asset://logo",
                        "mimeType": "image/png",
                        "blob": "aGVsbG8="
                    },
                    {
                        "uri": "asset://logo.txt",
                        "mimeType": "text/plain",
                        "text": "logo"
                    }
                ]
            }),
        )]);

        let reads = summary.as_array().expect("summary array");
        assert_eq!(reads.len(), 1);
        assert_eq!(reads[0]["toolName"], "read_mcp_resource");
        assert_eq!(reads[0]["server"], "assets");
        assert_eq!(reads[0]["uri"], "asset://logo");
        assert_eq!(reads[0]["mimeTypes"], json!(["image/png", "text/plain"]));
        assert_eq!(reads[0]["contentCount"], 2);
        assert_eq!(reads[0]["contentRefs"][0]["type"], "blob");
        assert_eq!(reads[0]["contentRefs"][0]["blobBase64Bytes"], 8);
        assert_eq!(reads[0]["contentRefs"][1]["type"], "text");
        assert_eq!(reads[0]["contentRefs"][1]["textCharCount"], 4);
    }

    #[test]
    fn raw_tool_lifecycle_does_not_produce_observability_evidence() {
        let raw = event(
            "tool.result",
            "evt-raw-tool",
            json!({
                "toolCallId": "raw-call",
                "toolName": "mcp__docs__read",
                "arguments": { "uri": "file:///raw" },
                "result": {
                    "metadata": { "tool_family": "skill_search" },
                    "structuredContent": { "raw": true }
                }
            }),
        );

        assert_eq!(skill_invocations_summary(&[raw.clone()]), json!([]));
        assert_eq!(skill_searches_summary(&[raw.clone()]), json!([]));
        assert_eq!(mcp_tool_results_summary(&[raw.clone()]), json!([]));
        assert_eq!(mcp_resource_reads_summary(&[raw]), json!([]));
    }

    #[test]
    fn typed_mcp_tool_call_projects_server_and_payload_identity() {
        let event = event(
            "item.completed",
            "evt-mcp-typed",
            json!({
                "item": {
                    "sessionId": "session-1",
                    "threadId": "thread-1",
                    "turnId": "turn-1",
                    "itemId": "different-item-id",
                    "sequence": 1,
                    "ordinal": 1,
                    "createdAtMs": 1,
                    "updatedAtMs": 2,
                    "completedAtMs": 2,
                    "kind": "mcpToolCall",
                    "status": "completed",
                    "payload": {
                        "type": "mcpToolCall",
                        "call_id": "typed-mcp-call",
                        "server_name": "docs",
                        "tool_name": "search_docs",
                        "arguments": [],
                        "output": {
                            "structuredContent": {
                                "answer": "ok"
                            }
                        }
                    },
                    "metadata": {}
                }
            }),
        );

        let summary = mcp_tool_results_summary(&[event]);
        assert_eq!(summary[0]["toolCallId"], "typed-mcp-call");
        assert_eq!(summary[0]["toolName"], "search_docs");
        assert_eq!(summary[0]["serverName"], "docs");
        assert_eq!(summary[0]["status"], "completed");
    }
}
