//! Runtime evidence completion audit 投影。
//!
//! 只负责把 automation owner run、workspace skill tool call 和受控 GET evidence
//! 归并为 completion audit 机器事实，避免 evidence pack 主服务继续膨胀。

use crate::agent::SessionDetail;
use lime_core::database::dao::agent_run::AgentRun;
use lime_core::database::dao::agent_timeline::AgentThreadItemPayload;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

const CAPABILITY_DRAFTS_RELATIVE_ROOT: &str = ".lime/capability-drafts";
const CONTROLLED_GET_EVIDENCE_DIR_NAME: &str = "controlled-get-evidence";
const CONTROLLED_GET_EVIDENCE_ARTIFACT_KIND: &str = "capability_draft_controlled_get_evidence";
const MAX_CONTROLLED_GET_EVIDENCE_ARTIFACTS: usize = 8;

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct RuntimeCapabilityDraftControlledGetEvidenceSummary {
    pub(crate) scanned_artifact_count: usize,
    pub(crate) skipped_unsafe_artifact_count: usize,
    pub(crate) artifacts: Vec<Value>,
}

fn parse_agent_run_metadata(run: &AgentRun) -> Option<Value> {
    run.metadata
        .as_deref()
        .and_then(|metadata| serde_json::from_str::<Value>(metadata).ok())
        .filter(Value::is_object)
}

pub(crate) fn build_automation_owner_runs_json(owner_runs: &[AgentRun]) -> Value {
    let runs = owner_runs
        .iter()
        .filter(|run| run.source == "automation")
        .map(|run| {
            let metadata = parse_agent_run_metadata(run);
            json!({
                "runId": run.id,
                "source": run.source,
                "sourceRef": run.source_ref,
                "sessionId": run.session_id,
                "status": run.status.as_str(),
                "startedAt": run.started_at,
                "finishedAt": run.finished_at,
                "durationMs": run.duration_ms,
                "jobId": metadata
                    .as_ref()
                    .and_then(|value| value.get("job_id"))
                    .cloned()
                    .or_else(|| run.source_ref.as_ref().map(|value| json!(value))),
                "jobName": metadata
                    .as_ref()
                    .and_then(|value| value.get("job_name"))
                    .cloned(),
                "agentEnvelope": metadata
                    .as_ref()
                    .and_then(|value| value.pointer("/harness/agent_envelope"))
                    .cloned(),
                "managedObjective": metadata
                    .as_ref()
                    .and_then(|value| value.pointer("/harness/managed_objective"))
                    .cloned(),
                "workspaceSkillRuntimeEnable": metadata
                    .as_ref()
                    .and_then(|value| value.pointer("/harness/workspace_skill_runtime_enable"))
                    .cloned(),
                "completionAudit": build_automation_owner_completion_audit_json(run, metadata.as_ref()),
                "metadata": metadata,
            })
        })
        .collect::<Vec<_>>();

    json!({
        "source": "agent_runs",
        "ownerType": "automation_job",
        "count": runs.len(),
        "runs": runs,
    })
}

fn build_automation_owner_completion_audit_json(run: &AgentRun, metadata: Option<&Value>) -> Value {
    let agent_envelope = metadata
        .and_then(|value| value.pointer("/harness/agent_envelope"))
        .filter(|value| value.is_object());
    let managed_objective = metadata
        .and_then(|value| value.pointer("/harness/managed_objective"))
        .filter(|value| value.is_object());
    let workspace_skill_runtime_enable = metadata
        .and_then(|value| value.pointer("/harness/workspace_skill_runtime_enable"))
        .filter(|value| value.is_object());
    let has_artifact_or_evidence_requirement = managed_objective
        .and_then(|value| value.get("completion_audit"))
        .and_then(Value::as_str)
        .map(|value| value == "artifact_or_evidence_required")
        .unwrap_or(false);

    let mut missing_inputs = Vec::new();
    if agent_envelope.is_none() {
        missing_inputs.push("agent_envelope");
    }
    if managed_objective.is_none() {
        missing_inputs.push("managed_objective");
    }
    if workspace_skill_runtime_enable.is_none() {
        missing_inputs.push("workspace_skill_runtime_enable");
    }
    if !has_artifact_or_evidence_requirement {
        missing_inputs.push("managed_objective.completion_audit");
    }

    let audit_status = if run.status.as_str() != "success" {
        "blocked_by_run_status"
    } else if missing_inputs.is_empty() {
        "audit_input_ready"
    } else {
        "missing_inputs"
    };

    json!({
        "source": "automation_owner_run",
        "status": audit_status,
        "runStatus": run.status.as_str(),
        "completionDecision": "not_completed",
        "requiresArtifactOrEvidence": has_artifact_or_evidence_requirement,
        "missingInputs": missing_inputs,
        "evidenceInputs": {
            "agentEnvelope": agent_envelope.is_some(),
            "managedObjective": managed_objective.is_some(),
            "workspaceSkillRuntimeEnable": workspace_skill_runtime_enable.is_some(),
        },
        "note": "automation success 只提供 completion audit 输入；completed 必须由 artifact / timeline / evidence 审计产生。"
    })
}

pub(crate) fn build_completion_audit_summary_json(
    owner_runs: &[AgentRun],
    detail: &SessionDetail,
    recent_artifacts: &[String],
    controlled_get_evidence: &RuntimeCapabilityDraftControlledGetEvidenceSummary,
) -> Value {
    let automation_owner_runs = owner_runs
        .iter()
        .filter(|run| run.source == "automation")
        .collect::<Vec<_>>();
    let owner_run_count = automation_owner_runs.len();
    let successful_owner_run_count = automation_owner_runs
        .iter()
        .filter(|run| run.status.as_str() == "success")
        .count();
    let workspace_skill_tool_call_count = detail
        .items
        .iter()
        .filter(|item| is_successful_workspace_skill_tool_call(&item.payload))
        .count();
    let artifact_count = recent_artifacts.len();
    let controlled_get_evidence_artifact_count = controlled_get_evidence.artifacts.len();
    let controlled_get_evidence_executed_count = controlled_get_evidence
        .artifacts
        .iter()
        .filter(|artifact| is_executed_controlled_get_evidence_summary_artifact(artifact))
        .count();
    let controlled_get_evidence_status_counts =
        build_controlled_get_evidence_status_counts(controlled_get_evidence);

    let mut owner_audit_statuses = Vec::new();
    let mut has_blocked_owner_run = false;
    let mut has_missing_owner_inputs = false;
    let mut has_controlled_get_evidence_requirement = false;
    for run in &automation_owner_runs {
        let metadata = parse_agent_run_metadata(run);
        let audit = build_automation_owner_completion_audit_json(run, metadata.as_ref());
        if let Some(status) = audit.get("status").and_then(Value::as_str) {
            owner_audit_statuses.push(status.to_string());
            has_blocked_owner_run |= status == "blocked_by_run_status";
            has_missing_owner_inputs |= status == "missing_inputs";
        }
        has_controlled_get_evidence_requirement |=
            requires_controlled_get_evidence(metadata.as_ref());
    }

    let has_automation_owner = owner_run_count > 0;
    let has_successful_owner = successful_owner_run_count > 0;
    let has_workspace_skill_tool_call = workspace_skill_tool_call_count > 0;
    let has_artifact_or_timeline = artifact_count > 0 || has_workspace_skill_tool_call;
    let has_controlled_get_evidence = controlled_get_evidence_executed_count > 0;

    let mut blocking_reasons = Vec::new();
    if !has_automation_owner {
        blocking_reasons.push("missing_automation_owner");
    }
    if has_automation_owner && !has_successful_owner {
        blocking_reasons.push("missing_successful_automation_owner");
    }
    if has_blocked_owner_run {
        blocking_reasons.push("blocked_by_automation_owner_run_status");
    }
    if has_missing_owner_inputs {
        blocking_reasons.push("missing_automation_owner_audit_inputs");
    }
    if has_successful_owner && !has_workspace_skill_tool_call {
        blocking_reasons.push("missing_workspace_skill_tool_call_evidence");
    }
    if has_successful_owner && !has_artifact_or_timeline {
        blocking_reasons.push("missing_artifact_or_timeline_evidence");
    }
    if has_successful_owner
        && has_controlled_get_evidence_requirement
        && !has_controlled_get_evidence
    {
        blocking_reasons.push("missing_controlled_get_evidence");
    }

    let decision = if !has_automation_owner {
        "needs_input"
    } else if has_blocked_owner_run || (has_automation_owner && !has_successful_owner) {
        "blocked"
    } else if has_missing_owner_inputs {
        "needs_input"
    } else if has_successful_owner
        && has_workspace_skill_tool_call
        && has_artifact_or_timeline
        && (!has_controlled_get_evidence_requirement || has_controlled_get_evidence)
    {
        "completed"
    } else {
        "verifying"
    };

    let mut notes = vec![
        "completed 只由 automation owner、workspace skill tool call、artifact/timeline 证据共同判定，不读取模型自报。"
            .to_string(),
    ];
    if decision == "completed" {
        notes.push(
            "automation success 已被提升为 completion audit 输入，并由 evidence pack 完成审计。"
                .to_string(),
        );
    } else {
        notes.push(
            "automation success 仍停留在 verifying / audit input，需补齐证据后才能 completed。"
                .to_string(),
        );
    }
    if has_controlled_get_evidence {
        notes.push(
            "受控 GET evidence 已纳入 completion audit 可见输入，但不能单独触发 completed。"
                .to_string(),
        );
    } else if has_controlled_get_evidence_requirement {
        notes.push(
            "当前目标要求受控 GET evidence；缺少 executed evidence 时不能 completed。".to_string(),
        );
    } else {
        notes.push(
            "当前没有可计入审计输入的 executed 受控 GET evidence；该信号暂不作为通用 completed 阻断项。"
                .to_string(),
        );
    }

    json!({
        "source": "runtime_evidence_pack_completion_audit",
        "decision": decision,
        "ownerRunCount": owner_run_count,
        "successfulOwnerRunCount": successful_owner_run_count,
        "workspaceSkillToolCallCount": workspace_skill_tool_call_count,
        "artifactCount": artifact_count,
        "controlledGetEvidenceArtifactCount": controlled_get_evidence_artifact_count,
        "controlledGetEvidenceExecutedCount": controlled_get_evidence_executed_count,
        "controlledGetEvidenceScannedArtifactCount": controlled_get_evidence.scanned_artifact_count,
        "controlledGetEvidenceSkippedUnsafeArtifactCount": controlled_get_evidence.skipped_unsafe_artifact_count,
        "controlledGetEvidenceStatusCounts": controlled_get_evidence_status_counts,
        "controlledGetEvidenceRequired": has_controlled_get_evidence_requirement,
        "ownerAuditStatuses": owner_audit_statuses,
        "requiredEvidence": {
            "automationOwner": has_successful_owner,
            "workspaceSkillToolCall": has_workspace_skill_tool_call,
            "artifactOrTimeline": has_artifact_or_timeline,
            "controlledGetEvidence": has_controlled_get_evidence,
        },
        "blockingReasons": blocking_reasons,
        "notes": notes,
    })
}

fn requires_controlled_get_evidence(metadata: Option<&Value>) -> bool {
    let Some(metadata) = metadata else {
        return false;
    };
    let Some(managed_objective) = metadata
        .pointer("/harness/managed_objective")
        .filter(|value| value.is_object())
    else {
        return false;
    };

    let completion_policy = managed_objective
        .get("completion_evidence_policy")
        .filter(|value| value.is_object());
    let explicit_policy_required = completion_policy
        .and_then(|value| value.get("controlled_get_evidence_required"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let objective_required = managed_objective
        .get("controlled_get_evidence_required")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let external_evidence_required = managed_objective
        .get("required_external_evidence")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .any(is_controlled_get_evidence_requirement)
        })
        .unwrap_or(false);

    explicit_policy_required || objective_required || external_evidence_required
}

fn is_controlled_get_evidence_requirement(value: &str) -> bool {
    matches!(
        value.trim(),
        "controlled_get"
            | "controlled_get_evidence"
            | "capability_draft_controlled_get_evidence"
            | "readonly_http_controlled_get_execution"
    )
}

fn is_executed_controlled_get_evidence_summary_artifact(artifact: &Value) -> bool {
    artifact.get("status").and_then(Value::as_str) == Some("executed")
        && artifact
            .get("networkRequestSent")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        && artifact
            .get("responseCaptured")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        && artifact
            .get("requestUrlHash")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .is_some()
        && artifact
            .get("responseSha256")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .is_some()
}

pub(crate) fn build_controlled_get_evidence_status_counts(
    summary: &RuntimeCapabilityDraftControlledGetEvidenceSummary,
) -> BTreeMap<String, usize> {
    let mut status_counts = BTreeMap::<String, usize>::new();
    for artifact in &summary.artifacts {
        let status = artifact
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        *status_counts.entry(status.to_string()).or_insert(0) += 1;
    }
    status_counts
}

pub(crate) fn collect_capability_draft_controlled_get_evidence(
    workspace_root: &Path,
    session_id: &str,
) -> RuntimeCapabilityDraftControlledGetEvidenceSummary {
    let evidence_dir = workspace_root
        .join(CAPABILITY_DRAFTS_RELATIVE_ROOT.replace('/', std::path::MAIN_SEPARATOR_STR))
        .join(CONTROLLED_GET_EVIDENCE_DIR_NAME);
    let mut summary = RuntimeCapabilityDraftControlledGetEvidenceSummary::default();
    let Ok(entries) = fs::read_dir(evidence_dir.as_path()) else {
        return summary;
    };

    let mut artifacts = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let Ok(raw) = fs::read_to_string(path.as_path()) else {
            continue;
        };
        let Ok(document) = serde_json::from_str::<Value>(raw.as_str()) else {
            continue;
        };
        if document.get("artifactKind").and_then(Value::as_str)
            != Some(CONTROLLED_GET_EVIDENCE_ARTIFACT_KIND)
        {
            continue;
        }
        if document.get("sessionId").and_then(Value::as_str) != Some(session_id) {
            continue;
        }

        summary.scanned_artifact_count += 1;
        if !is_safe_controlled_get_evidence_artifact(&document) {
            summary.skipped_unsafe_artifact_count += 1;
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown.json");
        let relative_path = format!(
            "{CAPABILITY_DRAFTS_RELATIVE_ROOT}/{CONTROLLED_GET_EVIDENCE_DIR_NAME}/{file_name}"
        );
        let sort_key = document
            .get("executedAt")
            .and_then(Value::as_str)
            .unwrap_or(file_name)
            .to_string();
        artifacts.push((
            sort_key,
            build_controlled_get_evidence_artifact_summary(
                &document,
                relative_path,
                raw.as_bytes(),
            ),
        ));
    }

    artifacts.sort_by(|left, right| right.0.cmp(&left.0));
    summary.artifacts = artifacts
        .into_iter()
        .map(|(_, artifact)| artifact)
        .take(MAX_CONTROLLED_GET_EVIDENCE_ARTIFACTS)
        .collect();
    summary
}

fn is_safe_controlled_get_evidence_artifact(document: &Value) -> bool {
    document.get("valueRetention").and_then(Value::as_str) == Some("hash_and_metadata_only")
        && document
            .get("containsEndpointValue")
            .and_then(Value::as_bool)
            == Some(false)
        && document.get("containsTokenValue").and_then(Value::as_bool) == Some(false)
        && document
            .get("containsResponsePreview")
            .and_then(Value::as_bool)
            == Some(false)
        && document
            .get("endpointValueReturned")
            .and_then(Value::as_bool)
            == Some(false)
        && document
            .get("endpointInputPersisted")
            .and_then(Value::as_bool)
            == Some(false)
        && document.get("tokenPersisted").and_then(Value::as_bool) == Some(false)
}

fn build_controlled_get_evidence_artifact_summary(
    document: &Value,
    relative_path: String,
    raw: &[u8],
) -> Value {
    json!({
        "artifactId": document.get("artifactId").and_then(Value::as_str),
        "artifactKind": CONTROLLED_GET_EVIDENCE_ARTIFACT_KIND,
        "relativePath": relative_path,
        "contentSha256": sha256_bytes_hex(raw),
        "approvalId": document.get("approvalId").and_then(Value::as_str),
        "sessionId": document.get("sessionId").and_then(Value::as_str),
        "status": document.get("status").and_then(Value::as_str),
        "scope": document.get("scope").and_then(Value::as_str),
        "gateId": document.get("gateId").and_then(Value::as_str),
        "method": document.get("method").and_then(Value::as_str),
        "requestUrlHash": document.get("requestUrlHash").and_then(Value::as_str),
        "requestUrlHashAlgorithm": document
            .get("requestUrlHashAlgorithm")
            .and_then(Value::as_str),
        "responseStatus": document.get("responseStatus").cloned().unwrap_or(Value::Null),
        "responseSha256": document.get("responseSha256").and_then(Value::as_str),
        "responseBytes": document.get("responseBytes").cloned().unwrap_or(Value::Null),
        "responsePreviewTruncated": document
            .get("responsePreviewTruncated")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        "executedAt": document.get("executedAt").and_then(Value::as_str),
        "networkRequestSent": document
            .get("networkRequestSent")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        "responseCaptured": document
            .get("responseCaptured")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        "credentialReferenceId": document
            .get("credentialReferenceId")
            .and_then(Value::as_str),
        "valueRetention": "hash_and_metadata_only",
        "safety": {
            "containsEndpointValue": false,
            "containsTokenValue": false,
            "containsResponsePreview": false,
            "endpointValueReturned": false,
            "endpointInputPersisted": false,
            "tokenPersisted": false,
            "runtimeExecutionEnabled": false
        },
        "evidenceKeys": collect_controlled_get_evidence_keys(document),
    })
}

fn collect_controlled_get_evidence_keys(document: &Value) -> Vec<String> {
    document
        .get("evidence")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("key").and_then(Value::as_str))
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn build_capability_draft_controlled_get_evidence_json(
    summary: &RuntimeCapabilityDraftControlledGetEvidenceSummary,
) -> Value {
    json!({
        "source": CONTROLLED_GET_EVIDENCE_ARTIFACT_KIND,
        "artifactRoot": format!(
            "{CAPABILITY_DRAFTS_RELATIVE_ROOT}/{CONTROLLED_GET_EVIDENCE_DIR_NAME}"
        ),
        "valueRetention": "hash_and_metadata_only",
        "scannedArtifactCount": summary.scanned_artifact_count,
        "artifactCount": summary.artifacts.len(),
        "skippedUnsafeArtifactCount": summary.skipped_unsafe_artifact_count,
        "statusCounts": build_controlled_get_evidence_status_counts(summary),
        "artifacts": summary.artifacts.clone(),
        "notes": [
            "该摘要只消费当前 session 的受控 GET evidence artifact。",
            "摘要只保留 hash / status / response metadata / evidence keys，不复制 endpoint、token 或 response preview。"
        ]
    })
}

fn sha256_bytes_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{digest:x}")
}

fn is_successful_workspace_skill_tool_call(payload: &AgentThreadItemPayload) -> bool {
    let AgentThreadItemPayload::ToolCall {
        success, metadata, ..
    } = payload
    else {
        return false;
    };

    if *success != Some(true) {
        return false;
    }

    metadata
        .as_ref()
        .map(|value| {
            value.get("workspace_skill_source").is_some()
                || value.get("workspace_skill_runtime_enable").is_some()
        })
        .unwrap_or(false)
}
