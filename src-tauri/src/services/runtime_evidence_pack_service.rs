//! Runtime evidence pack 导出服务
//!
//! 将当前 Lime 会话的 runtime / timeline / artifact 事实，
//! 导出为最小可复盘的问题证据包。

use crate::agent::SessionDetail;
use crate::commands::aster_agent_cmd::AgentRuntimeThreadReadModel;
use crate::database::DbConnection;
use crate::services::runtime_evidence_artifact_index_service::collect_recent_artifacts;
use crate::services::runtime_evidence_auxiliary_runtime_service::collect_auxiliary_runtime_snapshots;
use crate::services::runtime_evidence_completion_audit_service::{
    build_completion_audit_summary_json, collect_capability_draft_controlled_get_evidence,
};
use crate::services::runtime_evidence_gap_service::build_known_gaps;
use crate::services::runtime_evidence_json_utils_service::normalize_optional_text;
use crate::services::runtime_evidence_markdown_locale_service::runtime_evidence_pack_markdown_copy;
use crate::services::runtime_evidence_modality_contract_service::collect_modality_runtime_contract_snapshots;
#[cfg(test)]
use crate::services::runtime_evidence_observability_service::permission_state_signal_coverage;
use crate::services::runtime_evidence_observability_service::{
    build_runtime_observability_summary_json, build_signal_coverage,
};
use crate::services::runtime_evidence_pack_output_service::{
    build_artifacts_json, build_runtime_json, build_summary_markdown, build_timeline_json,
    collect_latest_turn_summary, write_evidence_file, ARTIFACTS_FILE_NAME, EVIDENCE_DIR_NAME,
    RUNTIME_FILE_NAME, SESSION_RELATIVE_ROOT, SUMMARY_FILE_NAME, TIMELINE_FILE_NAME,
};
pub use crate::services::runtime_evidence_pack_output_service::{
    RuntimeEvidenceArtifact, RuntimeEvidenceArtifactKind,
};
use crate::services::runtime_evidence_request_telemetry_service::collect_request_telemetry;
#[cfg(test)]
use crate::services::runtime_evidence_verification_service::collect_requested_fix_execution_results;
use crate::services::runtime_evidence_verification_service::{
    collect_runtime_verification, extract_verification_failure_outcomes,
};
use crate::services::runtime_file_checkpoint_service::list_file_checkpoints;
use crate::services::workspace_health_service::ensure_workspace_ready_with_auto_relocate;
use crate::workspace::WorkspaceManager;
use chrono::Utc;
use lime_core::database::dao::agent_run::AgentRun;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEvidencePackExportResult {
    pub session_id: String,
    pub thread_id: String,
    pub workspace_id: Option<String>,
    pub workspace_root: String,
    pub pack_relative_root: String,
    pub pack_absolute_root: String,
    pub exported_at: String,
    pub thread_status: String,
    pub latest_turn_status: Option<String>,
    pub turn_count: usize,
    pub item_count: usize,
    pub pending_request_count: usize,
    pub queued_turn_count: usize,
    pub recent_artifact_count: usize,
    pub known_gaps: Vec<String>,
    pub observability_summary: Value,
    pub completion_audit_summary: Value,
    pub artifacts: Vec<RuntimeEvidenceArtifact>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct RuntimeEvidenceSceneAppSnapshot {
    pub recent_artifact_paths: Vec<String>,
    pub workspace_root: Option<String>,
    pub known_gaps: Vec<String>,
    pub verification_failure_outcomes: Vec<String>,
    pub request_telemetry_available: bool,
    pub request_telemetry_matched_count: usize,
    pub artifact_validator_applicable: bool,
    pub artifact_validator_issue_count: usize,
    pub artifact_validator_recovered_count: usize,
}

pub fn export_runtime_evidence_pack(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    workspace_root: &Path,
) -> Result<RuntimeEvidencePackExportResult, String> {
    export_runtime_evidence_pack_with_owner_runs(detail, thread_read, workspace_root, &[])
}

pub fn export_runtime_evidence_pack_with_owner_runs(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    workspace_root: &Path,
    owner_runs: &[AgentRun],
) -> Result<RuntimeEvidencePackExportResult, String> {
    export_runtime_evidence_pack_with_owner_runs_and_locale(
        detail,
        thread_read,
        workspace_root,
        owner_runs,
        Some("zh-CN"),
    )
}

pub fn export_runtime_evidence_pack_with_owner_runs_and_locale(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    workspace_root: &Path,
    owner_runs: &[AgentRun],
    locale: Option<&str>,
) -> Result<RuntimeEvidencePackExportResult, String> {
    let session_id = detail.id.trim();
    if session_id.is_empty() {
        return Err("session_id 不能为空，无法导出问题证据包".to_string());
    }

    let thread_id = detail.thread_id.trim();
    if thread_id.is_empty() {
        return Err("thread_id 不能为空，无法导出问题证据包".to_string());
    }

    let workspace_root = workspace_root
        .canonicalize()
        .unwrap_or_else(|_| workspace_root.to_path_buf());
    let exported_at = Utc::now().to_rfc3339();
    let pack_relative_root = format!("{SESSION_RELATIVE_ROOT}/{session_id}/{EVIDENCE_DIR_NAME}");
    let pack_absolute_root =
        workspace_root.join(pack_relative_root.replace('/', std::path::MAIN_SEPARATOR_STR));

    fs::create_dir_all(&pack_absolute_root).map_err(|error| {
        format!(
            "创建 evidence pack 目录失败 {}: {error}",
            pack_absolute_root.display()
        )
    })?;

    let recent_artifacts = collect_recent_artifacts(detail);
    let recent_artifact_paths = recent_artifacts
        .iter()
        .map(|artifact| artifact.path.clone())
        .collect::<Vec<_>>();
    let file_checkpoints = list_file_checkpoints(detail);
    let latest_turn_summary = collect_latest_turn_summary(detail);
    let request_telemetry = collect_request_telemetry(detail, workspace_root.as_path());
    let controlled_get_evidence =
        collect_capability_draft_controlled_get_evidence(workspace_root.as_path(), session_id);
    let verification =
        collect_runtime_verification(detail, Some(workspace_root.as_path()), &recent_artifacts);
    let auxiliary_runtime =
        collect_auxiliary_runtime_snapshots(Some(workspace_root.as_path()), &recent_artifacts);
    let modality_runtime_contracts = collect_modality_runtime_contract_snapshots(
        detail,
        Some(workspace_root.as_path()),
        &recent_artifacts,
    );
    let signal_coverage = build_signal_coverage(
        thread_read,
        &recent_artifacts,
        &request_telemetry,
        &auxiliary_runtime,
        &modality_runtime_contracts,
        &verification,
    );
    let known_gaps = build_known_gaps(&recent_artifacts, &signal_coverage, thread_read);
    let observability_summary = build_runtime_observability_summary_json(
        detail,
        thread_read,
        &recent_artifact_paths,
        owner_runs,
        &request_telemetry,
        &auxiliary_runtime,
        &modality_runtime_contracts,
        &verification,
        &signal_coverage,
        &known_gaps,
    );
    let markdown_copy = runtime_evidence_pack_markdown_copy(locale);

    let artifacts = vec![
        write_evidence_file(
            &pack_absolute_root,
            session_id,
            SUMMARY_FILE_NAME,
            RuntimeEvidenceArtifactKind::Summary,
            markdown_copy.summary_artifact_title,
            build_summary_markdown(
                detail,
                thread_read,
                &recent_artifact_paths,
                latest_turn_summary.as_deref(),
                &observability_summary,
                &controlled_get_evidence,
                owner_runs,
                &known_gaps,
                exported_at.as_str(),
                locale,
            ),
        )?,
        write_evidence_file(
            &pack_absolute_root,
            session_id,
            RUNTIME_FILE_NAME,
            RuntimeEvidenceArtifactKind::Runtime,
            markdown_copy.runtime_artifact_title,
            build_runtime_json(
                detail,
                thread_read,
                workspace_root.as_path(),
                &recent_artifact_paths,
                &file_checkpoints.checkpoints,
                &auxiliary_runtime,
                &modality_runtime_contracts,
                &observability_summary,
                &controlled_get_evidence,
                owner_runs,
                &known_gaps,
                exported_at.as_str(),
            )?,
        )?,
        write_evidence_file(
            &pack_absolute_root,
            session_id,
            TIMELINE_FILE_NAME,
            RuntimeEvidenceArtifactKind::Timeline,
            markdown_copy.timeline_artifact_title,
            build_timeline_json(detail, exported_at.as_str())?,
        )?,
        write_evidence_file(
            &pack_absolute_root,
            session_id,
            ARTIFACTS_FILE_NAME,
            RuntimeEvidenceArtifactKind::Artifacts,
            markdown_copy.artifacts_artifact_title,
            build_artifacts_json(
                detail,
                thread_read,
                &recent_artifact_paths,
                &file_checkpoints.checkpoints,
                &auxiliary_runtime,
                &modality_runtime_contracts,
                &observability_summary,
                &controlled_get_evidence,
                &request_telemetry,
                &verification,
                owner_runs,
                &known_gaps,
                exported_at.as_str(),
            )?,
        )?,
    ];

    Ok(RuntimeEvidencePackExportResult {
        session_id: session_id.to_string(),
        thread_id: thread_id.to_string(),
        workspace_id: normalize_optional_text(detail.workspace_id.clone()),
        workspace_root: workspace_root.to_string_lossy().to_string(),
        pack_relative_root,
        pack_absolute_root: pack_absolute_root.to_string_lossy().to_string(),
        exported_at,
        thread_status: thread_read.status.trim().to_string(),
        latest_turn_status: thread_read
            .diagnostics
            .as_ref()
            .and_then(|value| normalize_optional_text(value.latest_turn_status.clone())),
        turn_count: detail.turns.len(),
        item_count: detail.items.len(),
        pending_request_count: thread_read.pending_requests.len(),
        queued_turn_count: thread_read.queued_turns.len(),
        recent_artifact_count: recent_artifact_paths.len(),
        known_gaps,
        observability_summary,
        completion_audit_summary: build_completion_audit_summary_json(
            owner_runs,
            detail,
            &recent_artifact_paths,
            &controlled_get_evidence,
        ),
        artifacts,
    })
}

pub(crate) fn resolve_runtime_export_workspace_root(
    db: &DbConnection,
    detail: &SessionDetail,
) -> Result<PathBuf, String> {
    if let Some(workspace_id) = detail
        .workspace_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let manager = WorkspaceManager::new(db.clone());
        let workspace_id = workspace_id.to_string();
        let workspace = manager
            .get(&workspace_id)
            .map_err(|error| format!("读取 workspace 失败: {error}"))?
            .ok_or_else(|| format!("Workspace 不存在: {workspace_id}"))?;
        let ensured = ensure_workspace_ready_with_auto_relocate(&manager, &workspace)?;
        return Ok(ensured.root_path);
    }

    if let Some(working_dir) = detail
        .working_dir
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(PathBuf::from(working_dir));
    }

    Err("当前会话缺少 workspace / working_dir，无法导出运行时制品".to_string())
}

pub(crate) fn build_runtime_evidence_sceneapp_snapshot(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    workspace_root: Option<&Path>,
) -> RuntimeEvidenceSceneAppSnapshot {
    let recent_artifacts = collect_recent_artifacts(detail);
    let request_telemetry = workspace_root
        .map(|root| collect_request_telemetry(detail, root))
        .unwrap_or_default();
    let auxiliary_runtime = collect_auxiliary_runtime_snapshots(workspace_root, &recent_artifacts);
    let modality_runtime_contracts =
        collect_modality_runtime_contract_snapshots(detail, workspace_root, &recent_artifacts);
    let verification = collect_runtime_verification(detail, workspace_root, &recent_artifacts);
    let signal_coverage = build_signal_coverage(
        thread_read,
        &recent_artifacts,
        &request_telemetry,
        &auxiliary_runtime,
        &modality_runtime_contracts,
        &verification,
    );
    let known_gaps = build_known_gaps(&recent_artifacts, &signal_coverage, thread_read);

    RuntimeEvidenceSceneAppSnapshot {
        recent_artifact_paths: recent_artifacts
            .into_iter()
            .map(|artifact| artifact.path)
            .collect(),
        workspace_root: workspace_root.map(|path| path.to_string_lossy().to_string()),
        known_gaps,
        verification_failure_outcomes: extract_verification_failure_outcomes(&verification),
        request_telemetry_available: !request_telemetry.searched_roots.is_empty(),
        request_telemetry_matched_count: request_telemetry.matched_request_count,
        artifact_validator_applicable: verification.artifact_validator.applicable,
        artifact_validator_issue_count: verification
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
            .sum(),
        artifact_validator_recovered_count: verification
            .artifact_validator
            .records
            .iter()
            .filter(|record| {
                record
                    .get("repaired")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
            })
            .count(),
    }
}

#[cfg(test)]
#[path = "runtime_evidence_pack_service_tests.rs"]
mod tests;
