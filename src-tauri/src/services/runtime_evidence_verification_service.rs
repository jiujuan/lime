//! Runtime evidence verification 投影与验证摘要。
//!
//! 负责从 timeline / artifact metadata 中收集 artifact validator、浏览器验证、GUI smoke
//! 和 requested-fix 执行结果，保持 evidence pack 主服务只负责编排导出。

use crate::agent::SessionDetail;
use crate::services::artifact_document_validator::ARTIFACT_DOCUMENT_SCHEMA_VERSION;
use crate::services::runtime_evidence_artifact_index_service::RuntimeRecentArtifact;
use crate::services::runtime_evidence_json_utils_service::{
    find_json_value, read_json_string, read_json_string_array, read_json_usize,
};
use crate::services::runtime_evidence_path_service::resolve_workspace_path;
use crate::services::runtime_evidence_tool_classifier_service::{
    is_browser_command, is_browser_tool_name, is_gui_smoke_command,
};
use lime_core::database::dao::agent_timeline::AgentThreadItemPayload;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::Path;

const MAX_PREVIEW_CHARS: usize = 200;
const MAX_BROWSER_EVIDENCE_ITEMS: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RuntimeVerificationOutcome {
    Success,
    BlockingFailure,
    AdvisoryFailure,
    Recovered,
}

impl RuntimeVerificationOutcome {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::BlockingFailure => "blocking_failure",
            Self::AdvisoryFailure => "advisory_failure",
            Self::Recovered => "recovered",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct RuntimeArtifactValidatorSummary {
    pub(crate) applicable: bool,
    pub(crate) records: Vec<Value>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct RuntimeEvidenceVerificationSummary {
    pub(crate) artifact_validator: RuntimeArtifactValidatorSummary,
    pub(crate) browser_evidence: Vec<Value>,
    pub(crate) gui_smoke: Option<Value>,
    pub(crate) requested_fix_execution_results: Vec<Value>,
}

pub(crate) fn collect_runtime_verification(
    detail: &SessionDetail,
    workspace_root: Option<&Path>,
    recent_artifacts: &[RuntimeRecentArtifact],
) -> RuntimeEvidenceVerificationSummary {
    RuntimeEvidenceVerificationSummary {
        artifact_validator: collect_artifact_validator_summary(workspace_root, recent_artifacts),
        browser_evidence: collect_browser_evidence(detail),
        gui_smoke: collect_gui_smoke_result(detail),
        requested_fix_execution_results: collect_requested_fix_execution_results(recent_artifacts),
    }
}

fn normalize_requested_fix_execution_status(value: Option<String>) -> &'static str {
    match value.as_deref() {
        Some("assigned") => "assigned",
        Some("running") => "running",
        Some("completed") => "completed",
        Some("failed") => "failed",
        Some("blocked") => "blocked",
        Some("cancelled") => "cancelled",
        _ => "pending",
    }
}

fn normalize_requested_fix_regression_outcome(value: Option<String>) -> Option<&'static str> {
    match value.as_deref() {
        Some("success") => Some("success"),
        Some("blocking_failure") => Some("blocking_failure"),
        Some("advisory_failure") => Some("advisory_failure"),
        Some("recovered") => Some("recovered"),
        _ => None,
    }
}

fn normalize_requested_fix_execution_result(
    value: &Value,
    source_artifact_path: &str,
) -> Option<Value> {
    if !value.is_object() {
        return None;
    }

    let requested_fix = read_json_string(value, &[&["requestedFix"][..], &["requested_fix"][..]]);
    let requested_fix_index = read_json_usize(
        value,
        &[&["requestedFixIndex"][..], &["requested_fix_index"][..]],
    );
    let execution_status = normalize_requested_fix_execution_status(read_json_string(
        value,
        &[&["executionStatus"][..], &["execution_status"][..]],
    ));
    let regression_outcome = normalize_requested_fix_regression_outcome(read_json_string(
        value,
        &[&["regressionOutcome"][..], &["regression_outcome"][..]],
    ));
    let summary_preview =
        read_json_string(value, &[&["summaryPreview"][..], &["summary_preview"][..]]);
    let result_ref = read_json_string(value, &[&["resultRef"][..], &["result_ref"][..]]);
    let artifact_ids =
        read_json_string_array(value, &[&["artifactIds"][..], &["artifact_ids"][..]]);
    let mut artifact_paths =
        read_json_string_array(value, &[&["artifactPaths"][..], &["artifact_paths"][..]]);

    if requested_fix.is_none()
        && requested_fix_index.is_none()
        && result_ref.is_none()
        && summary_preview.is_none()
        && artifact_paths.is_empty()
    {
        return None;
    }

    if artifact_paths.is_empty() {
        artifact_paths.push(source_artifact_path.to_string());
    }

    Some(json!({
        "requestedFix": requested_fix,
        "requestedFixIndex": requested_fix_index,
        "executionStatus": execution_status,
        "regressionOutcome": regression_outcome,
        "summaryPreview": summary_preview,
        "resultRef": result_ref,
        "artifactIds": artifact_ids,
        "artifactPaths": artifact_paths,
        "sourceArtifactPath": source_artifact_path
    }))
}

fn collect_requested_fix_execution_results_from_metadata(
    artifact: &RuntimeRecentArtifact,
) -> Vec<Value> {
    let Some(metadata) = artifact.metadata.as_ref() else {
        return Vec::new();
    };

    let mut results = Vec::new();
    for path in [
        &["requestedFixExecutionResults"][..],
        &["requested_fix_execution_results"][..],
        &["review", "requestedFixExecutionResults"][..],
        &["review", "requested_fix_execution_results"][..],
    ] {
        if let Some(Value::Array(items)) = find_json_value(metadata, path) {
            results.extend(items.iter().filter_map(|item| {
                normalize_requested_fix_execution_result(item, artifact.path.as_str())
            }));
        }
    }

    for path in [
        &["requestedFixExecutionResult"][..],
        &["requested_fix_execution_result"][..],
        &["review", "requestedFixExecutionResult"][..],
        &["review", "requested_fix_execution_result"][..],
    ] {
        if let Some(item) = find_json_value(metadata, path) {
            if let Some(result) =
                normalize_requested_fix_execution_result(item, artifact.path.as_str())
            {
                results.push(result);
            }
        }
    }

    results
}

pub(crate) fn collect_requested_fix_execution_results(
    recent_artifacts: &[RuntimeRecentArtifact],
) -> Vec<Value> {
    recent_artifacts
        .iter()
        .flat_map(collect_requested_fix_execution_results_from_metadata)
        .collect()
}

fn collect_artifact_validator_summary(
    workspace_root: Option<&Path>,
    recent_artifacts: &[RuntimeRecentArtifact],
) -> RuntimeArtifactValidatorSummary {
    let mut summary = RuntimeArtifactValidatorSummary::default();

    for artifact in recent_artifacts {
        let mut applicable = is_artifact_validator_applicable(artifact);
        let mut candidates = Vec::new();

        if let Some(metadata) = artifact.metadata.as_ref() {
            candidates.push(metadata.clone());
            if let Some(document) = metadata.get("artifactDocument") {
                candidates.push(document.clone());
            }
        }

        if artifact.path.ends_with(".artifact.json") {
            applicable = true;
            if let Some(workspace_root) = workspace_root {
                let absolute_path = resolve_workspace_path(workspace_root, artifact.path.as_str());
                if let Ok(raw) = fs::read_to_string(&absolute_path) {
                    if let Ok(document) = serde_json::from_str::<Value>(raw.as_str()) {
                        candidates.push(document);
                    }
                }
            }
        }

        summary.applicable |= applicable;

        for candidate in candidates {
            if let Some(record) =
                extract_artifact_validator_record(candidate, artifact.path.as_str())
            {
                summary.records.push(record);
                break;
            }
        }
    }

    summary
}

fn collect_browser_evidence(detail: &SessionDetail) -> Vec<Value> {
    let mut evidence = Vec::new();

    for item in detail.items.iter().rev() {
        let record = match &item.payload {
            AgentThreadItemPayload::ToolCall {
                tool_name,
                success,
                error,
                ..
            } if is_browser_tool_name(tool_name.as_str()) => Some(json!({
                "kind": "tool_call",
                "itemId": item.id,
                "turnId": item.turn_id,
                "toolName": tool_name,
                "success": success,
                "error": error,
                "updatedAt": item.updated_at
            })),
            AgentThreadItemPayload::CommandExecution {
                command,
                exit_code,
                error,
                ..
            } if is_browser_command(command.as_str()) => Some(json!({
                "kind": "command_execution",
                "itemId": item.id,
                "turnId": item.turn_id,
                "command": command,
                "exitCode": exit_code,
                "error": error,
                "updatedAt": item.updated_at
            })),
            _ => None,
        };

        if let Some(record) = record {
            evidence.push(record);
        }
        if evidence.len() >= MAX_BROWSER_EVIDENCE_ITEMS {
            break;
        }
    }

    evidence.reverse();
    evidence
}

fn collect_gui_smoke_result(detail: &SessionDetail) -> Option<Value> {
    detail
        .items
        .iter()
        .rev()
        .find_map(|item| match &item.payload {
            AgentThreadItemPayload::CommandExecution {
                command,
                cwd,
                aggregated_output,
                exit_code,
                error,
            } if is_gui_smoke_command(command.as_str()) => Some(json!({
                "itemId": item.id,
                "turnId": item.turn_id,
                "status": item.status.as_str(),
                "command": command,
                "cwd": cwd,
                "exitCode": exit_code,
                "error": error,
                "updatedAt": item.updated_at,
                "outputPreview": aggregated_output
                    .as_ref()
                    .map(|value| truncate_text(value.as_str()))
            })),
            _ => None,
        })
}

fn truncate_text(value: &str) -> String {
    let normalized = value.trim();
    if normalized.chars().count() <= MAX_PREVIEW_CHARS {
        return normalized.to_string();
    }

    normalized
        .chars()
        .take(MAX_PREVIEW_CHARS)
        .collect::<String>()
        + "..."
}

pub(crate) fn build_verification_json(
    verification: &RuntimeEvidenceVerificationSummary,
) -> Option<Map<String, Value>> {
    let mut payload = Map::new();

    if verification.artifact_validator.applicable {
        payload.insert(
            "artifactValidatorIssues".to_string(),
            Value::Array(verification.artifact_validator.records.clone()),
        );
    }

    if !verification.browser_evidence.is_empty() {
        payload.insert(
            "browserEvidence".to_string(),
            Value::Array(verification.browser_evidence.clone()),
        );
    }

    if let Some(gui_smoke) = verification.gui_smoke.clone() {
        payload.insert("guiSmoke".to_string(), gui_smoke);
    }

    (!payload.is_empty()).then_some(payload)
}

pub(crate) fn build_observability_verification_summary_json(
    verification: &RuntimeEvidenceVerificationSummary,
) -> Option<Value> {
    let mut payload = Map::new();
    let mut blocking_failure = Vec::new();
    let mut advisory_failure = Vec::new();
    let mut recovered = Vec::new();

    if verification.artifact_validator.applicable {
        let issue_count = verification
            .artifact_validator
            .records
            .iter()
            .map(|record| {
                record
                    .get("issues")
                    .and_then(Value::as_array)
                    .map(|issues| issues.len())
                    .unwrap_or(0)
            })
            .sum::<usize>();
        let repaired_count = verification
            .artifact_validator
            .records
            .iter()
            .filter(|record| {
                record
                    .get("repaired")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
            })
            .count();
        let fallback_used_count = verification
            .artifact_validator
            .records
            .iter()
            .filter(|record| {
                record
                    .get("fallbackUsed")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
            })
            .count();
        let record_count = verification.artifact_validator.records.len();
        let outcome = if issue_count == 0 {
            if repaired_count > 0 || fallback_used_count > 0 {
                RuntimeVerificationOutcome::Recovered
            } else {
                RuntimeVerificationOutcome::Success
            }
        } else if record_count > 0 && repaired_count == record_count {
            RuntimeVerificationOutcome::Recovered
        } else {
            RuntimeVerificationOutcome::BlockingFailure
        };

        match outcome {
            RuntimeVerificationOutcome::BlockingFailure => blocking_failure.push(format!(
                "Artifact 校验存在 {} 条未恢复 issues。",
                issue_count
            )),
            RuntimeVerificationOutcome::Recovered => recovered.push(format!(
                "Artifact 校验已恢复 {} 个产物，fallback {} 次。",
                repaired_count, fallback_used_count
            )),
            RuntimeVerificationOutcome::Success => {}
            RuntimeVerificationOutcome::AdvisoryFailure => {}
        }

        payload.insert(
            "artifactValidator".to_string(),
            json!({
                "applicable": true,
                "recordCount": record_count,
                "issueCount": issue_count,
                "repairedCount": repaired_count,
                "fallbackUsedCount": fallback_used_count,
                "outcome": outcome.as_str()
            }),
        );
    }

    if !verification.browser_evidence.is_empty() {
        let mut success_count = 0usize;
        let mut failure_count = 0usize;
        let mut unknown_count = 0usize;
        let mut latest_updated_at: Option<String> = None;

        for record in &verification.browser_evidence {
            if let Some(updated_at) = record.get("updatedAt").and_then(Value::as_str) {
                if latest_updated_at
                    .as_ref()
                    .map(|current| updated_at > current.as_str())
                    .unwrap_or(true)
                {
                    latest_updated_at = Some(updated_at.to_string());
                }
            }

            match browser_evidence_record_outcome(record) {
                Some(true) => success_count += 1,
                Some(false) => failure_count += 1,
                None => unknown_count += 1,
            }
        }
        let outcome = if failure_count > 0 {
            RuntimeVerificationOutcome::BlockingFailure
        } else if unknown_count > 0 {
            RuntimeVerificationOutcome::AdvisoryFailure
        } else {
            RuntimeVerificationOutcome::Success
        };

        match outcome {
            RuntimeVerificationOutcome::BlockingFailure => {
                blocking_failure.push(format!("浏览器验证存在 {} 条失败线索。", failure_count))
            }
            RuntimeVerificationOutcome::AdvisoryFailure => {
                advisory_failure.push(format!("浏览器验证仍有 {} 条未判定线索。", unknown_count))
            }
            RuntimeVerificationOutcome::Success => {}
            RuntimeVerificationOutcome::Recovered => {}
        }

        payload.insert(
            "browserVerification".to_string(),
            json!({
                "recordCount": verification.browser_evidence.len(),
                "successCount": success_count,
                "failureCount": failure_count,
                "unknownCount": unknown_count,
                "latestUpdatedAt": latest_updated_at,
                "outcome": outcome.as_str()
            }),
        );
    }

    if let Some(gui_smoke) = verification.gui_smoke.as_ref() {
        let exit_code = gui_smoke.get("exitCode").and_then(Value::as_i64);
        let has_error = gui_smoke
            .get("error")
            .and_then(Value::as_str)
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);
        let passed = exit_code == Some(0) && !has_error;
        let outcome = if passed {
            RuntimeVerificationOutcome::Success
        } else {
            RuntimeVerificationOutcome::BlockingFailure
        };

        if !passed {
            let exit_code_text = exit_code
                .map(|value| value.to_string())
                .unwrap_or_else(|| "未知".to_string());
            blocking_failure.push(format!("GUI smoke 未通过，exit_code={}。", exit_code_text));
        }

        payload.insert(
            "guiSmoke".to_string(),
            json!({
                "status": gui_smoke.get("status").cloned().unwrap_or(Value::Null),
                "exitCode": exit_code,
                "passed": passed,
                "updatedAt": gui_smoke.get("updatedAt").cloned().unwrap_or(Value::Null),
                "hasOutputPreview": gui_smoke.get("outputPreview").is_some(),
                "outcome": outcome.as_str()
            }),
        );
    }

    if !verification.requested_fix_execution_results.is_empty() {
        payload.insert(
            "requestedFixExecutionResults".to_string(),
            Value::Array(verification.requested_fix_execution_results.clone()),
        );
    }

    if !blocking_failure.is_empty() || !advisory_failure.is_empty() || !recovered.is_empty() {
        payload.insert(
            "observabilityVerificationOutcomes".to_string(),
            json!({
                "blockingFailure": blocking_failure,
                "advisoryFailure": advisory_failure,
                "recovered": recovered
            }),
        );
        payload.insert(
            "focusVerificationFailureOutcomes".to_string(),
            json!(blocking_failure
                .iter()
                .chain(advisory_failure.iter())
                .cloned()
                .collect::<Vec<_>>()),
        );
        payload.insert(
            "focusVerificationRecoveredOutcomes".to_string(),
            json!(recovered),
        );
    }

    (!payload.is_empty()).then(|| Value::Object(payload))
}

fn browser_evidence_record_outcome(record: &Value) -> Option<bool> {
    if let Some(success) = record.get("success").and_then(Value::as_bool) {
        return Some(success);
    }

    if let Some(exit_code) = record.get("exitCode").and_then(Value::as_i64) {
        let has_error = record
            .get("error")
            .and_then(Value::as_str)
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);
        return Some(exit_code == 0 && !has_error);
    }

    None
}

pub(crate) fn is_artifact_validator_applicable(artifact: &RuntimeRecentArtifact) -> bool {
    artifact.path.ends_with(".artifact.json")
        || artifact
            .metadata
            .as_ref()
            .map(value_looks_like_artifact_document)
            .unwrap_or(false)
}

fn value_looks_like_artifact_document(value: &Value) -> bool {
    let Some(record) = value.as_object() else {
        return false;
    };

    record
        .get("schemaVersion")
        .and_then(Value::as_str)
        .map(str::trim)
        == Some(ARTIFACT_DOCUMENT_SCHEMA_VERSION)
        || record
            .get("artifactSchema")
            .and_then(Value::as_str)
            .map(str::trim)
            == Some(ARTIFACT_DOCUMENT_SCHEMA_VERSION)
        || record.get("artifactDocument").is_some()
        || record
            .get("metadata")
            .and_then(Value::as_object)
            .and_then(|metadata| metadata.get("artifactSchema"))
            .and_then(Value::as_str)
            .map(str::trim)
            == Some(ARTIFACT_DOCUMENT_SCHEMA_VERSION)
}

fn extract_artifact_validator_record(candidate: Value, path: &str) -> Option<Value> {
    let metadata = locate_artifact_validation_metadata(&candidate)?;
    let issues = metadata
        .get("artifactValidationIssues")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let repaired = metadata
        .get("artifactValidationRepaired")
        .and_then(Value::as_bool);
    let fallback_used = metadata
        .get("artifactFallbackUsed")
        .and_then(Value::as_bool);

    if issues.is_empty() && repaired.is_none() && fallback_used.is_none() {
        return None;
    }

    Some(json!({
        "path": path,
        "issues": issues,
        "repaired": repaired,
        "fallbackUsed": fallback_used
    }))
}

fn locate_artifact_validation_metadata(candidate: &Value) -> Option<&Map<String, Value>> {
    let record = candidate.as_object()?;
    if has_artifact_validation_fields(record) {
        return Some(record);
    }

    if let Some(metadata) = record.get("metadata").and_then(Value::as_object) {
        if has_artifact_validation_fields(metadata) {
            return Some(metadata);
        }
    }

    if let Some(document_metadata) = record
        .get("artifactDocument")
        .and_then(Value::as_object)
        .and_then(|document| document.get("metadata"))
        .and_then(Value::as_object)
    {
        if has_artifact_validation_fields(document_metadata) {
            return Some(document_metadata);
        }
    }

    None
}

fn has_artifact_validation_fields(record: &Map<String, Value>) -> bool {
    record.contains_key("artifactValidationIssues")
        || record.contains_key("artifactValidationRepaired")
        || record.contains_key("artifactFallbackUsed")
}
