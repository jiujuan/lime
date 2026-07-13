use super::{
    canonical_tool::{canonical_tool, is_retired_raw_tool_lifecycle},
    metadata_string, nested_metadata_string, nested_metadata_value, push_unique,
    push_value_strings, value_string,
};
use agent_protocol::ItemStatus;
use app_server_protocol::AgentEvent;
use serde_json::{json, Map, Value};

#[derive(Debug, Default)]
struct CodingEvidenceSummary {
    file_change_count: usize,
    patch_count: usize,
    failed_patch_count: usize,
    command_count: usize,
    failed_command_count: usize,
    test_count: usize,
    failed_test_count: usize,
    action_required_count: usize,
    action_resolved_count: usize,
    approval_session_cache_hit_count: usize,
    approval_session_cache_resolved_count: usize,
    recovery_request_count: usize,
    tool_call_count: usize,
    completed_tool_call_count: usize,
    failed_tool_call_count: usize,
    tool_names: Vec<String>,
    tool_call_ids: Vec<String>,
    completed_tool_call_ids: Vec<String>,
    failed_tool_call_ids: Vec<String>,
    output_refs: Vec<String>,
    diff_refs: Vec<String>,
    checkpoint_refs: Vec<String>,
    artifact_refs: Vec<String>,
    evidence_refs: Vec<String>,
    action_request_ids: Vec<String>,
    action_tool_call_ids: Vec<String>,
    approval_session_cache_source_request_ids: Vec<String>,
    approval_session_cache_resolved_request_ids: Vec<String>,
    approval_session_cache_hit_keys: Vec<Value>,
    source_event_ids: Vec<String>,
}

pub(super) fn coding_evidence_summary(events: &[AgentEvent]) -> Value {
    let mut summary = CodingEvidenceSummary::default();
    for event in events {
        if is_retired_raw_tool_lifecycle(&event.event_type) {
            continue;
        }
        collect_common_coding_refs(&mut summary, event);
        if let Some(tool) = canonical_tool(event) {
            collect_canonical_tool(&mut summary, event, &tool);
        }
        match event.event_type.as_str() {
            "file.changed" => {
                summary.file_change_count += 1;
                push_unique(&mut summary.source_event_ids, event.event_id.clone());
            }
            "patch.started" => {
                summary.patch_count += 1;
                push_unique(&mut summary.source_event_ids, event.event_id.clone());
            }
            "patch.applied" | "patch.failed" => {
                if event.event_type == "patch.failed" {
                    summary.failed_patch_count += 1;
                }
                push_unique(&mut summary.source_event_ids, event.event_id.clone());
            }
            "command.started" => {
                summary.command_count += 1;
                push_unique(&mut summary.source_event_ids, event.event_id.clone());
            }
            "command.exited" => {
                if event
                    .payload
                    .get("exitCode")
                    .or_else(|| event.payload.get("exit_code"))
                    .and_then(Value::as_i64)
                    .is_some_and(|exit_code| exit_code != 0)
                {
                    summary.failed_command_count += 1;
                }
                push_unique(&mut summary.source_event_ids, event.event_id.clone());
            }
            "test.completed" => {
                summary.test_count += 1;
                let failed_count = event
                    .payload
                    .get("failed")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let failed_result = event
                    .payload
                    .get("result")
                    .and_then(Value::as_str)
                    .is_some_and(|result| result.eq_ignore_ascii_case("failed"));
                if failed_count > 0 || failed_result {
                    summary.failed_test_count += 1;
                }
                push_unique(&mut summary.source_event_ids, event.event_id.clone());
            }
            "action.required" => {
                summary.action_required_count += 1;
                collect_action_correlation(&mut summary, event);
                push_unique(&mut summary.source_event_ids, event.event_id.clone());
            }
            "action.resolved" => {
                summary.action_resolved_count += 1;
                collect_action_correlation(&mut summary, event);
                collect_approval_session_cache_resolved(&mut summary, event);
                push_unique(&mut summary.source_event_ids, event.event_id.clone());
            }
            "approval.session_cache.hit" => {
                collect_approval_session_cache_hit(&mut summary, event);
                push_unique(&mut summary.source_event_ids, event.event_id.clone());
            }
            _ => {}
        }
        if nested_metadata_value(Some(&event.payload), "harness", "coding_workbench_recovery")
            .is_some()
        {
            summary.recovery_request_count += 1;
            push_unique(&mut summary.source_event_ids, event.event_id.clone());
        }
    }

    json!({
        "schemaVersion": "coding-evidence-summary.v1",
        "fileChangeCount": summary.file_change_count,
        "patchCount": summary.patch_count,
        "failedPatchCount": summary.failed_patch_count,
        "commandCount": summary.command_count,
        "failedCommandCount": summary.failed_command_count,
        "testCount": summary.test_count,
        "failedTestCount": summary.failed_test_count,
        "actionRequiredCount": summary.action_required_count,
        "actionResolvedCount": summary.action_resolved_count,
        "approvalSessionCacheHitCount": summary.approval_session_cache_hit_count,
        "approvalSessionCacheResolvedCount": summary.approval_session_cache_resolved_count,
        "approvalSessionCacheSourceRequestIds": summary.approval_session_cache_source_request_ids,
        "approvalSessionCacheResolvedRequestIds": summary.approval_session_cache_resolved_request_ids,
        "approvalSessionCacheHitKeys": summary.approval_session_cache_hit_keys,
        "recoveryRequestCount": summary.recovery_request_count,
        "toolCallCount": summary.tool_call_count,
        "completedToolCallCount": summary.completed_tool_call_count,
        "failedToolCallCount": summary.failed_tool_call_count,
        "toolNames": summary.tool_names,
        "toolCallIds": summary.tool_call_ids,
        "completedToolCallIds": summary.completed_tool_call_ids,
        "failedToolCallIds": summary.failed_tool_call_ids,
        "outputRefs": summary.output_refs,
        "diffRefs": summary.diff_refs,
        "checkpointRefs": summary.checkpoint_refs,
        "artifactRefs": summary.artifact_refs,
        "evidenceRefs": summary.evidence_refs,
        "actionRequestIds": summary.action_request_ids,
        "actionToolCallIds": summary.action_tool_call_ids,
        "sourceEventIds": summary.source_event_ids,
    })
}

fn collect_canonical_tool(
    summary: &mut CodingEvidenceSummary,
    event: &AgentEvent,
    tool: &super::canonical_tool::CanonicalTool,
) {
    push_unique(&mut summary.tool_names, tool.name.clone());
    push_unique(&mut summary.tool_call_ids, tool.call_id.clone());
    push_unique(&mut summary.source_event_ids, event.event_id.clone());

    if event.event_type == "item.started" {
        summary.tool_call_count += 1;
        return;
    }

    summary.completed_tool_call_count += 1;
    push_unique(&mut summary.completed_tool_call_ids, tool.call_id.clone());
    if tool.status == ItemStatus::Failed {
        summary.failed_tool_call_count += 1;
        push_unique(&mut summary.failed_tool_call_ids, tool.call_id.clone());
    }
    if let Some(output) = &tool.output {
        if let Some(output_ref) = &output.output_ref {
            push_unique(&mut summary.output_refs, output_ref.clone());
        }
        if let Some(structured_content) = &output.structured_content {
            collect_coding_ref_fields(summary, structured_content);
        }
    }
}

fn collect_action_correlation(summary: &mut CodingEvidenceSummary, event: &AgentEvent) {
    if let Some(request_id) = payload_or_data_string(
        &event.payload,
        &["requestId", "request_id", "actionId", "action_id", "id"],
    ) {
        push_unique(&mut summary.action_request_ids, request_id);
    }
    if let Some(tool_call_id) = payload_or_data_string(
        &event.payload,
        &["toolCallId", "tool_call_id", "toolId", "tool_id"],
    ) {
        push_unique(&mut summary.action_tool_call_ids, tool_call_id);
    }
}

fn collect_approval_session_cache_hit(summary: &mut CodingEvidenceSummary, event: &AgentEvent) {
    summary.approval_session_cache_hit_count += 1;
    if let Some(request_id) =
        payload_or_data_string(&event.payload, &["sourceRequestId", "source_request_id"])
    {
        push_unique(
            &mut summary.approval_session_cache_source_request_ids,
            request_id,
        );
    }
    collect_approval_session_cache_key(summary, event.payload.get("key"));
}

fn collect_approval_session_cache_resolved(
    summary: &mut CodingEvidenceSummary,
    event: &AgentEvent,
) {
    let is_cache_source = metadata_string(Some(&event.payload), &["source"])
        .is_some_and(|source| source == "approval_session_cache");
    if !is_cache_source {
        return;
    }

    summary.approval_session_cache_resolved_count += 1;
    if let Some(request_id) = payload_or_data_string(
        &event.payload,
        &["requestId", "request_id", "actionId", "action_id", "id"],
    ) {
        push_unique(
            &mut summary.approval_session_cache_resolved_request_ids,
            request_id,
        );
    }
    if let Some(cache) = event.payload.get("cache") {
        if let Some(request_id) =
            metadata_string(Some(cache), &["sourceRequestId", "source_request_id"])
        {
            push_unique(
                &mut summary.approval_session_cache_source_request_ids,
                request_id,
            );
        }
        collect_approval_session_cache_key(summary, cache.get("key"));
    }
}

fn collect_approval_session_cache_key(summary: &mut CodingEvidenceSummary, key: Option<&Value>) {
    let Some(key) = key.and_then(approval_session_cache_key_summary) else {
        return;
    };
    if !summary
        .approval_session_cache_hit_keys
        .iter()
        .any(|existing| existing == &key)
    {
        summary.approval_session_cache_hit_keys.push(key);
    }
}

fn approval_session_cache_key_summary(value: &Value) -> Option<Value> {
    let mut object = Map::new();
    insert_summary_string(
        &mut object,
        "actionKind",
        metadata_string(Some(value), &["actionKind", "action_kind"]),
    );
    insert_summary_string(
        &mut object,
        "toolFamily",
        metadata_string(
            Some(value),
            &["toolFamily", "tool_family", "toolName", "tool_name"],
        ),
    );
    insert_summary_string(
        &mut object,
        "approvalPolicy",
        metadata_string(Some(value), &["approvalPolicy", "approval_policy"]),
    );
    insert_summary_string(
        &mut object,
        "sandboxPolicy",
        metadata_string(Some(value), &["sandboxPolicy", "sandbox_policy"]),
    );
    insert_summary_string(
        &mut object,
        "contractKey",
        metadata_string(Some(value), &["contractKey", "contract_key"]),
    );
    if let Some(scope) = value
        .get("scope")
        .and_then(approval_session_cache_scope_summary)
    {
        object.insert("scope".to_string(), scope);
    }
    if object.is_empty() {
        None
    } else {
        Some(Value::Object(object))
    }
}

fn approval_session_cache_scope_summary(value: &Value) -> Option<Value> {
    let mut object = Map::new();
    insert_summary_string(
        &mut object,
        "riskClass",
        metadata_string(Some(value), &["riskClass", "risk_class"]),
    );
    insert_summary_string(
        &mut object,
        "workspaceId",
        metadata_string(Some(value), &["workspaceId", "workspace_id"]),
    );
    insert_summary_string(
        &mut object,
        "workingDirHash",
        metadata_string(Some(value), &["workingDirHash", "working_dir_hash"]),
    );
    insert_summary_string(
        &mut object,
        "projectRootHash",
        metadata_string(Some(value), &["projectRootHash", "project_root_hash"]),
    );
    insert_summary_string(
        &mut object,
        "networkHost",
        metadata_string(Some(value), &["networkHost", "network_host"]),
    );
    if object.is_empty() {
        None
    } else {
        Some(Value::Object(object))
    }
}

fn insert_summary_string(object: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value {
        object.insert(key.to_string(), Value::String(value));
    }
}

fn payload_or_data_string(value: &Value, keys: &[&str]) -> Option<String> {
    metadata_string(Some(value), keys).or_else(|| nested_metadata_string(Some(value), "data", keys))
}

fn collect_common_coding_refs(summary: &mut CodingEvidenceSummary, event: &AgentEvent) {
    collect_coding_ref_fields(summary, &event.payload);
    for parent in ["change", "file_change", "metadata", "harness"] {
        if let Some(child) = event.payload.get(parent) {
            collect_coding_ref_fields(summary, child);
            if let Some(recovery) = child.get("coding_workbench_recovery") {
                collect_coding_ref_fields(summary, recovery);
            }
        }
    }
}

fn collect_coding_ref_fields(summary: &mut CodingEvidenceSummary, value: &Value) {
    push_value_strings(
        &mut summary.output_refs,
        value,
        &["outputRef", "output_ref"],
    );
    push_value_string_arrays(
        &mut summary.output_refs,
        value,
        &["outputRefs", "output_refs", "refIds", "ref_ids"],
    );
    push_value_strings(&mut summary.diff_refs, value, &["diffRef", "diff_ref"]);
    push_value_strings(
        &mut summary.artifact_refs,
        value,
        &["artifactId", "artifact_id", "artifactRef", "artifact_ref"],
    );
    push_value_string_arrays(
        &mut summary.artifact_refs,
        value,
        &["artifactRefs", "artifact_refs"],
    );
    push_value_strings(
        &mut summary.checkpoint_refs,
        value,
        &[
            "checkpointRef",
            "checkpoint_ref",
            "checkpointId",
            "checkpoint_id",
        ],
    );
    push_value_string_arrays(
        &mut summary.evidence_refs,
        value,
        &["evidenceRefs", "evidence_refs"],
    );
}

fn push_value_string_arrays(target: &mut Vec<String>, value: &Value, keys: &[&str]) {
    for key in keys {
        if let Some(values) = value.get(*key).and_then(Value::as_array) {
            for item in values {
                if let Some(text) = value_string(item) {
                    push_unique(target, text);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raw_tool_lifecycle_does_not_affect_coding_summary() {
        let summary = coding_evidence_summary(&[AgentEvent {
            event_id: "raw-tool-result".to_string(),
            sequence: 1,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: "tool.result".to_string(),
            timestamp: "2026-07-13T00:00:00Z".to_string(),
            payload: json!({
                "toolCallId": "raw-call",
                "toolName": "Bash",
                "outputRef": "output://raw"
            }),
        }]);

        assert_eq!(summary["toolCallCount"], 0);
        assert_eq!(summary["completedToolCallCount"], 0);
        assert_eq!(summary["toolCallIds"], json!([]));
        assert_eq!(summary["outputRefs"], json!([]));
        assert_eq!(summary["sourceEventIds"], json!([]));
    }

    #[test]
    fn failed_canonical_tool_completion_projects_failed_evidence() {
        let summary = coding_evidence_summary(&[AgentEvent {
            event_id: "canonical-tool-failed".to_string(),
            sequence: 1,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: "item.completed".to_string(),
            timestamp: "2026-07-13T00:00:00Z".to_string(),
            payload: json!({
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
                    "kind": "tool",
                    "status": "failed",
                    "payload": {
                        "type": "tool",
                        "call_id": "canonical-failed-call",
                        "name": "Bash",
                        "arguments": [],
                        "output": {
                            "error": "exit 1",
                            "outputRef": "output://failed"
                        }
                    },
                    "metadata": {}
                }
            }),
        }]);

        assert_eq!(summary["completedToolCallCount"], 1);
        assert_eq!(summary["failedToolCallCount"], 1);
        assert_eq!(summary["toolCallIds"], json!(["canonical-failed-call"]));
        assert_eq!(
            summary["failedToolCallIds"],
            json!(["canonical-failed-call"])
        );
        assert_eq!(summary["outputRefs"], json!(["output://failed"]));
    }

    #[test]
    fn tool_output_delta_keeps_non_lifecycle_coding_refs() {
        let summary = coding_evidence_summary(&[AgentEvent {
            event_id: "tool-output-delta".to_string(),
            sequence: 1,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: "tool.output.delta".to_string(),
            timestamp: "2026-07-13T00:00:00Z".to_string(),
            payload: json!({ "outputRef": "output://delta" }),
        }]);

        assert_eq!(summary["outputRefs"], json!(["output://delta"]));
        assert_eq!(summary["toolCallCount"], 0);
    }
}
