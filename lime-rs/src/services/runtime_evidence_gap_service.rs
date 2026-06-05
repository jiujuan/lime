//! Runtime evidence pack 已知缺口归因。
//!
//! 将 signal coverage 与运行时阻断态转换成可直接展示在 evidence pack 中的 known gaps。

use crate::commands::aster_agent_cmd::AgentRuntimeThreadReadModel;
use crate::services::runtime_evidence_artifact_index_service::RuntimeRecentArtifact;
use crate::services::runtime_evidence_observability_service::{
    unresolved_permission_confirmation_blocking_detail, RuntimeEvidenceSignalCoverageEntry,
};

pub(crate) fn build_known_gaps(
    recent_artifacts: &[RuntimeRecentArtifact],
    signal_coverage: &[RuntimeEvidenceSignalCoverageEntry],
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<String> {
    let mut gaps = signal_coverage
        .iter()
        .filter(|entry| entry.status != "exported")
        .map(|entry| entry.detail.clone())
        .collect::<Vec<_>>();

    if let Some(gap) = permission_confirmation_known_gap(thread_read) {
        gaps.push(gap);
    }
    if let Some(gap) = user_locked_capability_known_gap(thread_read) {
        gaps.push(gap);
    }

    if recent_artifacts.is_empty() {
        gaps.push("当前未检测到最近产物路径，Artifact 证据为空。".to_string());
    }

    gaps.dedup();
    gaps
}

fn user_locked_capability_known_gap(thread_read: &AgentRuntimeThreadReadModel) -> Option<String> {
    let limit_state = thread_read.limit_state.as_ref()?;
    if limit_state.status != "user_locked_capability_gap" {
        return None;
    }
    let capability_gap = limit_state
        .capability_gap
        .as_deref()
        .or(thread_read.capability_gap.as_deref())
        .unwrap_or("未记录 capabilityGap");
    Some(format!(
        "显式用户模型锁定不满足当前 execution profile，当前证据包不能作为成功交付证据：capabilityGap={}。",
        capability_gap
    ))
}

fn permission_confirmation_known_gap(thread_read: &AgentRuntimeThreadReadModel) -> Option<String> {
    let permission_state = thread_read.permission_state.as_ref()?;
    if permission_state.confirmation_status.as_deref() != Some("denied") {
        return unresolved_permission_confirmation_blocking_detail(permission_state);
    }

    Some(format!(
        "运行时权限确认已被拒绝，当前证据包不能作为成功交付证据：request_id={}，source={}。",
        permission_state
            .confirmation_request_id
            .as_deref()
            .unwrap_or("未记录 confirmationRequestId"),
        permission_state
            .confirmation_source
            .as_deref()
            .unwrap_or("未记录 confirmationSource")
    ))
}
