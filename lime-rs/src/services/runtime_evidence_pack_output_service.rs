//! Runtime evidence pack 输出制品渲染。
//!
//! 只负责 summary/runtime/timeline/artifacts 四类文件的序列化与落盘，
//! 不再承载 evidence pack 的采集编排。

use crate::agent::SessionDetail;
use crate::commands::aster_agent_cmd::{
    AgentRuntimeFileCheckpointSummary, AgentRuntimeThreadReadModel,
};
use crate::services::runtime_agent_profile_projection_service::{
    build_agent_runtime_profile_spine_json, build_agent_runtime_remote_channels_json,
};
use crate::services::runtime_evidence_auxiliary_runtime_service::{
    build_auxiliary_runtime_snapshots_json, RuntimeAuxiliaryRuntimeSnapshotSummary,
};
use crate::services::runtime_evidence_completion_audit_service::{
    build_automation_owner_runs_json, build_capability_draft_controlled_get_evidence_json,
    build_completion_audit_summary_json, RuntimeCapabilityDraftControlledGetEvidenceSummary,
};
use crate::services::runtime_evidence_json_utils_service::normalize_optional_text;
use crate::services::runtime_evidence_markdown_locale_service::runtime_evidence_pack_markdown_copy;
use crate::services::runtime_evidence_modality_contract_service::{
    build_modality_runtime_contracts_json, RuntimeModalityContractSnapshotSummary,
};
use crate::services::runtime_evidence_observability_service::{
    build_thread_runtime_facts_json, format_observability_gap_list,
    format_observability_signal_list,
};
use crate::services::runtime_evidence_request_telemetry_service::{
    build_request_telemetry_json, RuntimeRequestTelemetrySummary,
};
use crate::services::runtime_evidence_verification_service::{
    build_verification_json, RuntimeEvidenceVerificationSummary,
};
use lime_core::database::dao::agent_run::AgentRun;
use lime_core::database::dao::agent_timeline::AgentThreadItemPayload;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

pub(crate) const SESSION_RELATIVE_ROOT: &str = ".lime/harness/sessions";
pub(crate) const EVIDENCE_DIR_NAME: &str = "evidence";
pub(crate) const SUMMARY_FILE_NAME: &str = "summary.md";
pub(crate) const RUNTIME_FILE_NAME: &str = "runtime.json";
pub(crate) const TIMELINE_FILE_NAME: &str = "timeline.json";
pub(crate) const ARTIFACTS_FILE_NAME: &str = "artifacts.json";
const MAX_PREVIEW_CHARS: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeEvidenceArtifactKind {
    Summary,
    Runtime,
    Timeline,
    Artifacts,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEvidenceArtifact {
    pub kind: RuntimeEvidenceArtifactKind,
    pub title: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub bytes: usize,
}

pub(crate) fn write_evidence_file(
    pack_root: &Path,
    session_id: &str,
    file_name: &str,
    kind: RuntimeEvidenceArtifactKind,
    title: &str,
    content: String,
) -> Result<RuntimeEvidenceArtifact, String> {
    let absolute_path = pack_root.join(file_name);
    fs::write(&absolute_path, content.as_bytes()).map_err(|error| {
        format!(
            "写入 evidence pack 文件失败 {}: {error}",
            absolute_path.display()
        )
    })?;

    Ok(RuntimeEvidenceArtifact {
        kind,
        title: title.to_string(),
        relative_path: format!(
            "{SESSION_RELATIVE_ROOT}/{session_id}/{EVIDENCE_DIR_NAME}/{file_name}"
        ),
        absolute_path: absolute_path.to_string_lossy().to_string(),
        bytes: content.len(),
    })
}

pub(crate) fn build_summary_markdown(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    recent_artifacts: &[String],
    latest_turn_summary: Option<&str>,
    observability_summary: &Value,
    controlled_get_evidence: &RuntimeCapabilityDraftControlledGetEvidenceSummary,
    owner_runs: &[AgentRun],
    known_gaps: &[String],
    exported_at: &str,
    locale: Option<&str>,
) -> String {
    let copy = runtime_evidence_pack_markdown_copy(locale);
    let mut markdown = String::new();
    let _ = writeln!(markdown, "# {}", copy.title);
    let _ = writeln!(markdown);
    let _ = writeln!(markdown, "> {}", copy.intro);
    let _ = writeln!(markdown);
    let _ = writeln!(markdown, "- {}：`{}`", copy.session, detail.id);
    let _ = writeln!(markdown, "- {}：`{}`", copy.thread, detail.thread_id);
    let _ = writeln!(markdown, "- {}：{exported_at}", copy.exported_at);
    let _ = writeln!(markdown, "- {}：{}", copy.thread_status, thread_read.status);
    let _ = writeln!(
        markdown,
        "- {}：{} · {}：{}",
        copy.pending_request,
        thread_read.pending_requests.len(),
        copy.queued_turn,
        thread_read.queued_turns.len()
    );
    let _ = writeln!(markdown);
    let _ = writeln!(markdown, "## {}", copy.latest_summary);
    let _ = writeln!(markdown);
    let _ = writeln!(
        markdown,
        "{}",
        latest_turn_summary.unwrap_or(copy.no_latest_summary)
    );
    let _ = writeln!(markdown);
    let _ = writeln!(markdown, "## {}", copy.evidence_overview);
    let _ = writeln!(markdown);
    let _ = writeln!(markdown, "- {}：{}", copy.turns, detail.turns.len());
    let _ = writeln!(
        markdown,
        "- {}：{}",
        copy.timeline_items,
        detail.items.len()
    );
    let _ = writeln!(
        markdown,
        "- {}：{}",
        copy.recent_artifacts,
        recent_artifacts.len()
    );
    let _ = writeln!(
        markdown,
        "- {}：{}",
        copy.controlled_get_evidence,
        controlled_get_evidence.artifacts.len()
    );
    if let Some(blocking_summary) = thread_read
        .diagnostics
        .as_ref()
        .and_then(|value| value.primary_blocking_summary.clone())
    {
        let _ = writeln!(markdown, "- {}：{blocking_summary}", copy.primary_blocking);
    }
    let _ = writeln!(markdown);
    let _ = writeln!(markdown, "## {}", copy.observability_coverage);
    let _ = writeln!(markdown);
    let _ = writeln!(
        markdown,
        "- {}：{}",
        copy.correlation_keys,
        observability_summary
            .pointer("/correlation/correlationKeys")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(|value| format!("`{value}`"))
                    .collect::<Vec<_>>()
                    .join("、")
            })
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| copy.no_correlation_keys.to_string())
    );
    let _ = writeln!(
        markdown,
        "- {}：{}",
        copy.exported_signals,
        format_observability_signal_list(observability_summary, "exported")
    );
    let _ = writeln!(
        markdown,
        "- {}：{}",
        copy.evidence_gaps,
        format_observability_gap_list(observability_summary)
    );
    let _ = writeln!(
        markdown,
        "- {}：{}",
        copy.blocked_signals,
        format_observability_signal_list(observability_summary, "blocked")
    );
    let _ = writeln!(markdown);
    let completion_audit_summary = build_completion_audit_summary_json(
        owner_runs,
        detail,
        recent_artifacts,
        controlled_get_evidence,
    );
    let completion_decision = completion_audit_summary
        .get("decision")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let completion_blocking_reasons = completion_audit_summary
        .get("blockingReasons")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(|value| format!("`{value}`"))
                .collect::<Vec<_>>()
                .join("、")
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| copy.none.to_string());
    let _ = writeln!(markdown, "## {}", copy.completion_audit);
    let _ = writeln!(markdown);
    let _ = writeln!(markdown, "- {}：`{completion_decision}`", copy.decision);
    let _ = writeln!(
        markdown,
        "- {}：{} / {} success",
        copy.automation_owner,
        completion_audit_summary
            .get("successfulOwnerRunCount")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        completion_audit_summary
            .get("ownerRunCount")
            .and_then(Value::as_u64)
            .unwrap_or(0)
    );
    let _ = writeln!(
        markdown,
        "- {}：{}",
        copy.workspace_skill_tool_call,
        completion_audit_summary
            .get("workspaceSkillToolCallCount")
            .and_then(Value::as_u64)
            .unwrap_or(0)
    );
    let _ = writeln!(
        markdown,
        "- {}：{}",
        copy.artifact_evidence,
        completion_audit_summary
            .get("artifactCount")
            .and_then(Value::as_u64)
            .unwrap_or(0)
    );
    let _ = writeln!(
        markdown,
        "- {}：{} / {} {}",
        copy.controlled_get_evidence,
        completion_audit_summary
            .get("controlledGetEvidenceExecutedCount")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        completion_audit_summary
            .get("controlledGetEvidenceArtifactCount")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        copy.controlled_get_executed_suffix
    );
    if !controlled_get_evidence.artifacts.is_empty() {
        let _ = writeln!(
            markdown,
            "- {}：{}",
            copy.controlled_get_artifact,
            controlled_get_evidence.artifacts.len()
        );
    }
    let _ = writeln!(
        markdown,
        "- {}：{completion_blocking_reasons}",
        copy.blocking_reasons
    );
    let _ = writeln!(
        markdown,
        "- {}：{}",
        copy.audit_principle_label, copy.audit_principle
    );
    let _ = writeln!(markdown);
    let _ = writeln!(markdown, "## {}", copy.reading_order);
    let _ = writeln!(markdown);
    let _ = writeln!(markdown, "1. {}", copy.read_summary);
    let _ = writeln!(markdown, "2. {}", copy.read_runtime);
    let _ = writeln!(markdown, "3. {}", copy.read_timeline);
    let _ = writeln!(markdown, "4. {}", copy.read_artifacts);
    let _ = writeln!(markdown);
    let _ = writeln!(markdown, "## {}", copy.known_gaps);
    let _ = writeln!(markdown);
    for gap in known_gaps {
        let _ = writeln!(markdown, "- {gap}");
    }

    markdown
}

pub(crate) fn build_runtime_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    workspace_root: &Path,
    recent_artifacts: &[String],
    file_checkpoints: &[AgentRuntimeFileCheckpointSummary],
    auxiliary_runtime: &RuntimeAuxiliaryRuntimeSnapshotSummary,
    modality_runtime_contracts: &RuntimeModalityContractSnapshotSummary,
    observability_summary: &Value,
    controlled_get_evidence: &RuntimeCapabilityDraftControlledGetEvidenceSummary,
    owner_runs: &[AgentRun],
    known_gaps: &[String],
    exported_at: &str,
) -> Result<String, String> {
    let profile_spine = build_agent_runtime_profile_spine_json(detail, thread_read, owner_runs);
    let payload = json!({
        "schemaVersion": "v1",
        "source": {
            "contractShape": "codex_trace_evidence_pack",
            "runtimeSubstrate": "aster_session_thread_runtime",
            "productSurface": "lime_workspace_evidence_pack"
        },
        "agentRuntimeProfile": profile_spine,
        "session": {
            "sessionId": detail.id,
            "threadId": detail.thread_id,
            "name": detail.name,
            "workspaceId": detail.workspace_id,
            "workspaceRoot": workspace_root.to_string_lossy().to_string(),
            "exportedAt": exported_at,
            "updatedAt": detail.updated_at,
            "executionStrategy": detail.execution_strategy,
            "model": detail.model
        },
        "thread": {
            "status": thread_read.status,
            "runtimeFacts": build_thread_runtime_facts_json(thread_read),
            "activeTurnId": thread_read.active_turn_id,
            "interruptState": thread_read.interrupt_state,
            "latestTurnStatus": thread_read.diagnostics.as_ref().and_then(|value| value.latest_turn_status.clone()),
            "pendingRequestCount": thread_read.pending_requests.len(),
            "queuedTurnCount": thread_read.queued_turns.len(),
            "diagnostics": {
                "warningCount": thread_read.diagnostics.as_ref().map(|value| value.warning_count).unwrap_or(0),
                "contextCompactionCount": thread_read.diagnostics.as_ref().map(|value| value.context_compaction_count).unwrap_or(0),
                "failedToolCallCount": thread_read.diagnostics.as_ref().map(|value| value.failed_tool_call_count).unwrap_or(0),
                "failedCommandCount": thread_read.diagnostics.as_ref().map(|value| value.failed_command_count).unwrap_or(0),
                "primaryBlockingKind": thread_read.diagnostics.as_ref().and_then(|value| value.primary_blocking_kind.clone()),
                "primaryBlockingSummary": thread_read.diagnostics.as_ref().and_then(|value| value.primary_blocking_summary.clone()),
                "latestWarning": thread_read.diagnostics.as_ref().and_then(|value| value.latest_warning.as_ref().map(|warning| json!({
                    "code": warning.code,
                    "message": warning.message,
                    "updatedAt": warning.updated_at
                }))),
                "latestFailedTool": thread_read.diagnostics.as_ref().and_then(|value| value.latest_failed_tool.as_ref().map(|tool| json!({
                    "toolName": tool.tool_name,
                    "error": tool.error,
                    "updatedAt": tool.updated_at
                }))),
                "latestFailedCommand": thread_read.diagnostics.as_ref().and_then(|value| value.latest_failed_command.as_ref().map(|command| json!({
                    "command": command.command,
                    "exitCode": command.exit_code,
                    "error": command.error,
                    "updatedAt": command.updated_at
                })))
            }
        },
        "pendingRequests": thread_read.pending_requests.iter().map(|item| {
            json!({
                "id": item.id,
                "type": item.request_type,
                "status": item.status,
                "title": item.title,
                "turnId": item.turn_id
            })
        }).collect::<Vec<_>>(),
        "queuedTurns": thread_read.queued_turns.iter().map(|item| {
            json!({
                "id": item.queued_turn_id,
                "position": item.position,
                "preview": item.message_preview,
                "createdAt": item.created_at
            })
        }).collect::<Vec<_>>(),
        "subagents": detail.child_subagent_sessions.iter().map(|session| {
            json!({
                "id": session.id,
                "name": session.name,
                "runtimeStatus": session.runtime_status,
                "latestTurnStatus": session.latest_turn_status,
                "taskSummary": session.task_summary,
                "roleHint": session.role_hint,
                "updatedAt": session.updated_at
            })
        }).collect::<Vec<_>>(),
        "remoteChannels": build_agent_runtime_remote_channels_json(owner_runs),
        "observabilitySummary": observability_summary,
        "capabilityDraftControlledGetEvidence": build_capability_draft_controlled_get_evidence_json(
            controlled_get_evidence
        ),
        "automationOwners": build_automation_owner_runs_json(owner_runs),
        "completionAuditSummary": build_completion_audit_summary_json(
            owner_runs,
            detail,
            recent_artifacts,
            controlled_get_evidence
        ),
        "auxiliaryRuntimeSnapshots": build_auxiliary_runtime_snapshots_json(auxiliary_runtime),
        "modalityRuntimeContracts": build_modality_runtime_contracts_json(modality_runtime_contracts),
        "recentArtifacts": recent_artifacts,
        "fileCheckpointCount": file_checkpoints.len(),
        "fileCheckpoints": file_checkpoints,
        "knownGaps": known_gaps
    });

    serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("序列化 runtime.json 失败: {error}"))
}

pub(crate) fn build_timeline_json(
    detail: &SessionDetail,
    exported_at: &str,
) -> Result<String, String> {
    let payload = json!({
        "schemaVersion": "v1",
        "exportedAt": exported_at,
        "turns": detail.turns.iter().map(|turn| {
            json!({
                "id": turn.id,
                "status": serialize_enum_as_string(&turn.status, "unknown"),
                "promptPreview": truncate_text(turn.prompt_text.as_str()),
                "startedAt": turn.started_at,
                "completedAt": turn.completed_at,
                "updatedAt": turn.updated_at
            })
        }).collect::<Vec<_>>(),
        "items": detail.items.iter().map(|item| {
            let (payload_kind, payload_summary) = summarize_item_payload(&item.payload);
            let mut item_json = json!({
                "id": item.id,
                "turnId": item.turn_id,
                "sequence": item.sequence,
                "status": serialize_enum_as_string(&item.status, "unknown"),
                "payloadKind": payload_kind,
                "payloadSummary": payload_summary,
                "updatedAt": item.updated_at
            });
            if let Some(workspace_skill_tool_call) =
                build_workspace_skill_tool_call_timeline_json(&item.payload)
            {
                if let Some(object) = item_json.as_object_mut() {
                    object.insert(
                        "workspaceSkillToolCall".to_string(),
                        workspace_skill_tool_call,
                    );
                }
            }
            item_json
        }).collect::<Vec<_>>()
    });

    serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("序列化 timeline.json 失败: {error}"))
}

fn build_workspace_skill_tool_call_timeline_json(
    payload: &AgentThreadItemPayload,
) -> Option<Value> {
    let AgentThreadItemPayload::ToolCall {
        tool_name,
        success,
        metadata,
        ..
    } = payload
    else {
        return None;
    };

    let metadata = metadata.as_ref()?;
    let workspace_skill_source = metadata.get("workspace_skill_source").cloned();
    let workspace_skill_runtime_enable = metadata.get("workspace_skill_runtime_enable").cloned();
    if workspace_skill_source.is_none() && workspace_skill_runtime_enable.is_none() {
        return None;
    }

    Some(json!({
        "toolName": tool_name,
        "success": success,
        "workspaceSkillSource": workspace_skill_source,
        "workspaceSkillRuntimeEnable": workspace_skill_runtime_enable
    }))
}

pub(crate) fn build_artifacts_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    recent_artifacts: &[String],
    file_checkpoints: &[AgentRuntimeFileCheckpointSummary],
    auxiliary_runtime: &RuntimeAuxiliaryRuntimeSnapshotSummary,
    modality_runtime_contracts: &RuntimeModalityContractSnapshotSummary,
    observability_summary: &Value,
    controlled_get_evidence: &RuntimeCapabilityDraftControlledGetEvidenceSummary,
    request_telemetry: &RuntimeRequestTelemetrySummary,
    verification: &RuntimeEvidenceVerificationSummary,
    owner_runs: &[AgentRun],
    known_gaps: &[String],
    exported_at: &str,
) -> Result<String, String> {
    let mut payload = json!({
        "schemaVersion": "v1",
        "exportedAt": exported_at,
        "recentArtifacts": recent_artifacts,
        "artifactCount": recent_artifacts.len(),
        "fileCheckpointCount": file_checkpoints.len(),
        "fileCheckpoints": file_checkpoints,
        "auxiliaryRuntimeSnapshots": build_auxiliary_runtime_snapshots_json(auxiliary_runtime),
        "modalityRuntimeContracts": build_modality_runtime_contracts_json(modality_runtime_contracts),
        "observabilitySummary": observability_summary,
        "capabilityDraftControlledGetEvidence": build_capability_draft_controlled_get_evidence_json(
            controlled_get_evidence
        ),
        "threadRuntimeFacts": build_thread_runtime_facts_json(thread_read),
        "requests": {
            "pending": thread_read.pending_requests.iter().map(|item| {
                json!({
                    "id": item.id,
                    "type": item.request_type,
                    "title": item.title,
                    "status": item.status
                })
            }).collect::<Vec<_>>(),
            "telemetry": build_request_telemetry_json(request_telemetry)
        },
        "workspace": {
            "workspaceId": detail.workspace_id,
            "workingDir": detail.working_dir
        },
        "automationOwners": build_automation_owner_runs_json(owner_runs),
        "completionAuditSummary": build_completion_audit_summary_json(
            owner_runs,
            detail,
            recent_artifacts,
            controlled_get_evidence
        ),
        "knownGaps": known_gaps
    });

    if let Some(verification_payload) = build_verification_json(verification) {
        payload
            .as_object_mut()
            .expect("artifacts payload must be object")
            .insert(
                "verification".to_string(),
                Value::Object(verification_payload),
            );
    }

    serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("序列化 artifacts.json 失败: {error}"))
}

pub(crate) fn collect_latest_turn_summary(detail: &SessionDetail) -> Option<String> {
    detail
        .items
        .iter()
        .rev()
        .find_map(|item| match &item.payload {
            AgentThreadItemPayload::TurnSummary { text, .. } => {
                normalize_optional_text(Some(text.clone()))
            }
            _ => None,
        })
}

fn summarize_item_payload(payload: &AgentThreadItemPayload) -> (&'static str, Option<String>) {
    match payload {
        AgentThreadItemPayload::Plan { text } => {
            ("plan", normalize_optional_text(Some(truncate_text(text))))
        }
        AgentThreadItemPayload::TurnSummary { text, .. } => (
            "turn_summary",
            normalize_optional_text(Some(truncate_text(text))),
        ),
        AgentThreadItemPayload::FileArtifact { path, .. } => {
            ("file_artifact", normalize_optional_text(Some(path.clone())))
        }
        _ => ("other", None),
    }
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

fn serialize_enum_as_string<T: Serialize>(value: &T, fallback: &str) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|item| item.as_str().map(str::to_string))
        .unwrap_or_else(|| fallback.to_string())
}
