mod browser;
mod observability;

use self::browser::browser_action_index_summary;
use self::browser::browser_evidence_artifacts;
use self::browser::browser_file_evidence_artifacts;
use self::browser::browser_file_evidence_summary;
use self::observability::mcp_resource_reads_summary;
use self::observability::mcp_tool_results_summary;
use self::observability::skill_invocations_summary;
use self::observability::skill_searches_summary;
use super::status::agent_session_status_label;
use super::status::agent_turn_is_active;
use super::status::agent_turn_status_label;
use super::timestamp;
use super::EvidenceExportProvider;
use super::EvidencePackRequest;
use super::RuntimeCoreError;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::EvidencePackArtifact;
use app_server_protocol::EvidencePackSummary;
use async_trait::async_trait;
use lime_infra::telemetry::RequestStatus;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;

#[derive(Debug, Default)]
pub struct NoopEvidenceExportProvider;

#[async_trait]
impl EvidenceExportProvider for NoopEvidenceExportProvider {
    async fn export_evidence_pack(
        &self,
        _request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
        Ok(None)
    }
}

#[derive(Debug, Default)]
pub struct BasicEvidenceExportProvider;

#[async_trait]
impl EvidenceExportProvider for BasicEvidenceExportProvider {
    async fn export_evidence_pack(
        &self,
        request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
        Ok(Some(basic_evidence_pack_summary(request)))
    }
}

fn basic_evidence_pack_summary(request: &EvidencePackRequest) -> EvidencePackSummary {
    let latest_turn_status = request
        .turns
        .last()
        .map(|turn| agent_turn_status_label(turn.status).to_string());
    let pending_request_count = request
        .events
        .iter()
        .filter(|event| event.event_type == "action.required")
        .count();
    let queued_turn_count = request
        .turns
        .iter()
        .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
        .count();
    let running_turn_count = request
        .turns
        .iter()
        .filter(|turn| agent_turn_is_active(turn.status))
        .count();
    let completion_decision = if pending_request_count > 0 {
        "needs_input"
    } else if running_turn_count > 0 || queued_turn_count > 0 {
        "in_progress"
    } else if matches!(
        request.session.status,
        AgentSessionStatus::Failed | AgentSessionStatus::Canceled
    ) {
        "failed"
    } else {
        "verifying"
    };
    let known_gaps = if request.artifacts.is_empty() {
        vec!["no_recent_artifacts".to_string()]
    } else {
        Vec::new()
    };
    let request_telemetry_count = request.request_logs.len();
    let request_telemetry_summary = if request_telemetry_count == 0 {
        json!({
            "status": "missing",
            "requestCount": 0,
            "sessionRequestCount": 0,
            "turnRequestCount": 0,
        })
    } else {
        let session_request_count = request
            .request_logs
            .iter()
            .filter(|log| log.session_id.as_deref() == Some(request.session.session_id.as_str()))
            .count();
        let turn_request_count = request
            .request_logs
            .iter()
            .filter(|log| {
                log.turn_id.as_deref().is_some()
                    && request
                        .turns
                        .iter()
                        .any(|turn| Some(turn.turn_id.as_str()) == log.turn_id.as_deref())
            })
            .count();
        json!({
            "status": "exported",
            "requestCount": request_telemetry_count,
            "sessionRequestCount": session_request_count,
            "turnRequestCount": turn_request_count,
            "statusBreakdown": {
                "success": request.request_logs.iter().filter(|log| log.status == RequestStatus::Success).count(),
                "failed": request.request_logs.iter().filter(|log| log.status == RequestStatus::Failed).count(),
                "timeout": request.request_logs.iter().filter(|log| log.status == RequestStatus::Timeout).count(),
                "cancelled": request.request_logs.iter().filter(|log| log.status == RequestStatus::Cancelled).count(),
            }
        })
    };

    let browser_action_index = browser_action_index_summary(&request.events, &request.artifacts);
    let browser_file_evidence = browser_file_evidence_summary(&request.events, &request.artifacts);
    let evidence_artifacts = evidence_pack_artifacts(request);
    let coding_summary = coding_evidence_summary(&request.events);
    let skill_invocations = skill_invocations_summary(&request.events);
    let skill_searches = skill_searches_summary(&request.events);
    let mcp_tool_results = mcp_tool_results_summary(&request.events);
    let mcp_resource_reads = mcp_resource_reads_summary(&request.events);
    let workspace_skill_tool_call_count = skill_invocations
        .as_array()
        .map(Vec::len)
        .unwrap_or_default();

    let mut observability_summary = json!({
        "schema_version": "runtime-evidence-pack.v1",
        "source": "app-server-basic",
        "event_count": request.events.len(),
        "artifact_count": request.artifacts.len(),
        "evidence_artifact_count": evidence_artifacts.len(),
        "request_telemetry": request_telemetry_summary,
        "coding": coding_summary,
        "skill_invocations": skill_invocations,
        "skill_searches": skill_searches,
        "mcp_tool_results": mcp_tool_results,
        "mcp_resource_reads": mcp_resource_reads,
    });
    if browser_action_index.is_some() || browser_file_evidence.is_some() {
        let snapshot_count = browser_action_index
            .as_ref()
            .and_then(|index| index.get("action_count"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let mut modality_runtime_contracts = Map::new();
        modality_runtime_contracts.insert("snapshot_count".to_string(), json!(snapshot_count));
        if let Some(browser_action_index) = browser_action_index {
            modality_runtime_contracts.insert(
                "snapshot_index".to_string(),
                json!({
                    "browser_action_index": browser_action_index,
                }),
            );
        }
        if let Some(browser_file_evidence) = browser_file_evidence {
            modality_runtime_contracts.insert(
                "file_evidence".to_string(),
                json!({
                    "browser_file_artifacts": browser_file_evidence,
                }),
            );
        }
        if let Some(summary) = observability_summary.as_object_mut() {
            summary.insert(
                "modality_runtime_contracts".to_string(),
                Value::Object(modality_runtime_contracts),
            );
        }
    }

    EvidencePackSummary {
        pack_relative_root: format!(
            ".lime/harness/sessions/{}/evidence",
            request.session.session_id
        ),
        pack_absolute_root: None,
        exported_at: timestamp(),
        thread_status: agent_session_status_label(request.session.status).to_string(),
        latest_turn_status,
        turn_count: request.turns.len(),
        item_count: request.events.len(),
        pending_request_count,
        queued_turn_count,
        recent_artifact_count: request.artifacts.len(),
        known_gaps,
        observability_summary: Some(observability_summary),
        completion_audit_summary: Some(json!({
            "decision": completion_decision,
            "pendingRequestCount": pending_request_count,
            "queuedTurnCount": queued_turn_count,
            "runningTurnCount": running_turn_count,
            "workspaceSkillToolCallCount": workspace_skill_tool_call_count,
            "artifactCount": request.artifacts.len(),
            "turnCount": request.turns.len(),
            "requiredEvidence": {
                "workspaceSkillToolCall": workspace_skill_tool_call_count > 0,
                "artifactOrTimeline": !request.artifacts.is_empty() || !request.events.is_empty()
            },
            "notes": [
                "App Server current evidence/export generated a basic audit summary without Desktop legacy evidence writer."
            ],
        })),
        artifacts: evidence_artifacts,
    }
}

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
    recovery_request_count: usize,
    output_refs: Vec<String>,
    diff_refs: Vec<String>,
    checkpoint_refs: Vec<String>,
    artifact_refs: Vec<String>,
    evidence_refs: Vec<String>,
    source_event_ids: Vec<String>,
}

fn coding_evidence_summary(events: &[AgentEvent]) -> Value {
    let mut summary = CodingEvidenceSummary::default();
    for event in events {
        collect_common_coding_refs(&mut summary, event);
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
                push_unique(&mut summary.source_event_ids, event.event_id.clone());
            }
            "action.resolved" => {
                summary.action_resolved_count += 1;
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
        "recoveryRequestCount": summary.recovery_request_count,
        "outputRefs": summary.output_refs,
        "diffRefs": summary.diff_refs,
        "checkpointRefs": summary.checkpoint_refs,
        "artifactRefs": summary.artifact_refs,
        "evidenceRefs": summary.evidence_refs,
        "sourceEventIds": summary.source_event_ids,
    })
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

fn push_value_strings(target: &mut Vec<String>, value: &Value, keys: &[&str]) {
    for key in keys {
        if let Some(text) = value.get(*key).and_then(value_string) {
            push_unique(target, text);
        }
    }
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

fn push_unique(target: &mut Vec<String>, value: String) {
    if !target.iter().any(|existing| existing == &value) {
        target.push(value);
    }
}

fn evidence_pack_artifacts(request: &EvidencePackRequest) -> Vec<EvidencePackArtifact> {
    let mut artifacts = Vec::new();
    for artifact in &request.artifacts {
        artifacts.push(EvidencePackArtifact {
            kind: "artifact".to_string(),
            title: artifact
                .title
                .clone()
                .unwrap_or_else(|| artifact.artifact_ref.clone()),
            relative_path: artifact
                .path
                .clone()
                .unwrap_or_else(|| artifact.artifact_ref.clone()),
            absolute_path: None,
            bytes: 0,
        });
        artifacts.extend(snapshot_evidence_artifacts_from_metadata(
            artifact.metadata.as_ref(),
            artifact.artifact_ref.as_str(),
        ));
    }
    for event in &request.events {
        artifacts.extend(snapshot_evidence_artifacts_from_metadata(
            Some(&event.payload),
            event.event_id.as_str(),
        ));
    }
    artifacts.extend(browser_evidence_artifacts(
        &request.events,
        &request.artifacts,
    ));
    artifacts.extend(browser_file_evidence_artifacts(
        &request.events,
        &request.artifacts,
    ));
    dedupe_evidence_artifacts(artifacts)
}

fn snapshot_evidence_artifacts_from_metadata(
    metadata: Option<&Value>,
    title_scope: &str,
) -> Vec<EvidencePackArtifact> {
    let mut artifacts = Vec::new();
    if let Some(path) = metadata_string(metadata, &["outputSnapshotFile", "output_snapshot_file"]) {
        artifacts.push(EvidencePackArtifact {
            kind: "tool_output_snapshot".to_string(),
            title: format!("{title_scope} output snapshot"),
            relative_path: path,
            absolute_path: None,
            bytes: metadata_usize(metadata, &["outputBytes", "output_bytes"]).unwrap_or(0),
        });
    }
    if let Some(sidecar_ref) = metadata_object(metadata)
        .and_then(|metadata| metadata.get("sidecarRef"))
        .or_else(|| nested_metadata_value(metadata, "file_change", "sidecarRef"))
        .or_else(|| nested_metadata_value(metadata, "change", "sidecarRef"))
    {
        if let Some(path) = sidecar_ref
            .get("relativePath")
            .and_then(Value::as_str)
            .map(str::to_string)
        {
            artifacts.push(EvidencePackArtifact {
                kind: sidecar_ref
                    .get("kind")
                    .and_then(Value::as_str)
                    .unwrap_or("sidecar")
                    .to_string(),
                title: format!("{title_scope} sidecar ref"),
                relative_path: path,
                absolute_path: None,
                bytes: sidecar_ref
                    .get("bytes")
                    .and_then(Value::as_u64)
                    .and_then(|value| usize::try_from(value).ok())
                    .unwrap_or(0),
            });
        }
    }
    if let Some(path) = metadata_string(
        metadata,
        &["checkpointSnapshotFile", "checkpoint_snapshot_file"],
    )
    .or_else(|| {
        nested_metadata_string(
            metadata,
            "file_change",
            &[
                "previousContentSnapshotFile",
                "previous_content_snapshot_file",
                "checkpointSnapshotFile",
                "checkpoint_snapshot_file",
            ],
        )
    })
    .or_else(|| {
        nested_metadata_string(
            metadata,
            "change",
            &[
                "previousContentSnapshotFile",
                "previous_content_snapshot_file",
                "checkpointSnapshotFile",
                "checkpoint_snapshot_file",
            ],
        )
    }) {
        artifacts.push(EvidencePackArtifact {
            kind: "file_checkpoint_snapshot".to_string(),
            title: format!("{title_scope} checkpoint snapshot"),
            relative_path: path,
            absolute_path: None,
            bytes: 0,
        });
    }
    artifacts
}

fn dedupe_evidence_artifacts(artifacts: Vec<EvidencePackArtifact>) -> Vec<EvidencePackArtifact> {
    let mut deduped = Vec::new();
    for artifact in artifacts {
        if deduped.iter().any(|existing: &EvidencePackArtifact| {
            existing.kind == artifact.kind && existing.relative_path == artifact.relative_path
        }) {
            continue;
        }
        deduped.push(artifact);
    }
    deduped
}

fn metadata_string(metadata: Option<&Value>, keys: &[&str]) -> Option<String> {
    let metadata = metadata?;
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(value_string)
}

fn metadata_object(metadata: Option<&Value>) -> Option<&Map<String, Value>> {
    metadata?.as_object()
}

fn nested_metadata_value<'a>(
    metadata: Option<&'a Value>,
    parent: &str,
    key: &str,
) -> Option<&'a Value> {
    metadata
        .and_then(Value::as_object)
        .and_then(|metadata| metadata.get(parent))
        .and_then(Value::as_object)
        .and_then(|object| object.get(key))
}

fn nested_metadata_string(metadata: Option<&Value>, parent: &str, keys: &[&str]) -> Option<String> {
    let parent = metadata?.get(parent)?;
    keys.iter()
        .filter_map(|key| parent.get(*key))
        .find_map(value_string)
}

fn metadata_usize(metadata: Option<&Value>, keys: &[&str]) -> Option<usize> {
    let metadata = metadata?;
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
}

fn value_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
