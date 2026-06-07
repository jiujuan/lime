//! Runtime evidence observability summary 投影。
//!
//! 负责 signal coverage、runtime facts、correlation 与 summary markdown formatter 的纯函数，
//! evidence pack 主服务只负责调用这些投影结果并写入文件。

use crate::agent::SessionDetail;
use crate::commands::aster_agent_cmd::{
    AgentRuntimeThreadReadModel, LIME_AGENT_RUNTIME_ID, LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION,
};
use crate::services::runtime_agent_profile_projection_service::{
    agent_runtime_remote_task_ids, build_agent_runtime_remote_channels_json,
};
use crate::services::runtime_evidence_artifact_index_service::RuntimeRecentArtifact;
use crate::services::runtime_evidence_auxiliary_runtime_service::RuntimeAuxiliaryRuntimeSnapshotSummary;
use crate::services::runtime_evidence_json_utils_service::normalize_optional_text;
use crate::services::runtime_evidence_modality_contract_service::{
    build_modality_runtime_contracts_observability_summary_json,
    RuntimeModalityContractSnapshotSummary,
};
use crate::services::runtime_evidence_request_telemetry_service::{
    build_request_telemetry_json, RuntimeRequestTelemetrySummary,
};
use crate::services::runtime_evidence_verification_service::{
    build_observability_verification_summary_json, is_artifact_validator_applicable,
    RuntimeEvidenceVerificationSummary,
};
use lime_core::database::dao::agent_run::AgentRun;
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RuntimeEvidenceSignalCoverageEntry {
    pub(crate) signal: &'static str,
    pub(crate) status: &'static str,
    pub(crate) source: &'static str,
    pub(crate) detail: String,
}

pub(crate) fn unresolved_permission_confirmation_blocking_detail(
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
) -> Option<String> {
    let confirmation_status = permission_state.confirmation_status.as_deref();
    if permission_state.status != "requires_confirmation"
        || matches!(confirmation_status, Some("resolved" | "denied"))
    {
        return None;
    }

    let ask_profile_keys =
        format_permission_profile_keys(&permission_state.ask_profile_keys, "未记录 askProfileKeys");
    let confirmation_source = permission_state
        .confirmation_source
        .as_deref()
        .unwrap_or("未记录 confirmationSource");
    let confirmation_request_id = permission_state
        .confirmation_request_id
        .as_deref()
        .unwrap_or("未记录 confirmationRequestId");

    Some(match confirmation_status {
        Some("not_requested") => format!(
            "声明态权限需要真实确认但尚未发起 ApprovalRequest，当前证据包不能作为成功交付证据：askProfileKeys={}，source={}。",
            ask_profile_keys, confirmation_source
        ),
        Some("requested") => format!(
            "真实权限确认正在等待处理，当前证据包不能作为成功交付证据：askProfileKeys={}，request_id={}，source={}。",
            ask_profile_keys, confirmation_request_id, confirmation_source
        ),
        Some(other) => format!(
            "运行时权限确认状态尚未解决，当前证据包不能作为成功交付证据：confirmationStatus={}，askProfileKeys={}，source={}。",
            other, ask_profile_keys, confirmation_source
        ),
        None => format!(
            "运行时权限声明仍需确认但缺少 confirmationStatus，当前证据包不能作为成功交付证据：askProfileKeys={}，source={}。",
            ask_profile_keys, confirmation_source
        ),
    })
}

fn format_permission_profile_keys(values: &[String], fallback: &str) -> String {
    if values.is_empty() {
        fallback.to_string()
    } else {
        values.join(", ")
    }
}

fn is_connector_authorization_runtime_secret_key(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|ch| *ch != '_' && *ch != '-')
        .collect::<String>()
        .to_ascii_lowercase();
    if matches!(
        normalized.as_str(),
        "secretbinding" | "tokenexposed" | "sessionscoped"
    ) {
        return false;
    }
    normalized.contains("token")
        || normalized.contains("secret")
        || normalized.contains("apikey")
        || normalized.contains("credential")
        || normalized.contains("authorization")
        || normalized.contains("oauth")
        || normalized.contains("password")
}

fn sanitize_connector_authorization_runtime_value(
    value: &Value,
    key: Option<&str>,
    depth: usize,
) -> Value {
    if key.is_some_and(is_connector_authorization_runtime_secret_key) {
        return json!("[redacted:host_managed_secret]");
    }
    if depth >= 8 {
        return json!("[redacted:depth_limit]");
    }
    match value {
        Value::Array(items) => Value::Array(
            items
                .iter()
                .map(|item| sanitize_connector_authorization_runtime_value(item, key, depth + 1))
                .collect(),
        ),
        Value::Object(object) => Value::Object(
            object
                .iter()
                .map(|(item_key, item_value)| {
                    (
                        item_key.clone(),
                        sanitize_connector_authorization_runtime_value(
                            item_value,
                            Some(item_key.as_str()),
                            depth + 1,
                        ),
                    )
                })
                .collect(),
        ),
        _ => value.clone(),
    }
}

fn sanitize_runtime_summary_for_evidence_pack(runtime_summary: Option<&Value>) -> Option<Value> {
    let mut sanitized = runtime_summary?.clone();
    let Some(object) = sanitized.as_object_mut() else {
        return Some(sanitized);
    };

    for key in [
        "agent_app_connector_authorization",
        "agentAppConnectorAuthorization",
    ] {
        if let Some(value) = object.get(key).cloned() {
            object.insert(
                key.to_string(),
                sanitize_connector_authorization_runtime_value(&value, None, 0),
            );
        }
    }

    Some(sanitized)
}

pub(crate) fn build_thread_runtime_facts_json(thread_read: &AgentRuntimeThreadReadModel) -> Value {
    json!({
        "profileStatus": thread_read.profile_status,
        "turns": thread_read.turns,
        "toolCalls": thread_read.tool_calls,
        "modelRouting": thread_read.model_routing,
        "contextSummary": thread_read.context_summary,
        "evidenceSummary": thread_read.evidence_summary,
        "telemetrySummary": thread_read.telemetry_summary,
        "taskKind": thread_read.task_kind,
        "serviceModelSlot": thread_read.service_model_slot,
        "routingMode": thread_read.routing_mode,
        "decisionSource": thread_read.decision_source,
        "candidateCount": thread_read.candidate_count,
        "capabilityGap": thread_read.capability_gap,
        "singleCandidateOnly": thread_read.single_candidate_only,
        "decisionReason": thread_read.decision_reason,
        "fallbackChain": thread_read.fallback_chain,
        "estimatedCostClass": thread_read.estimated_cost_class,
        "limitState": thread_read.limit_state,
        "costState": thread_read.cost_state,
        "limitEvent": thread_read.limit_event,
        "runtimeSummary": sanitize_runtime_summary_for_evidence_pack(thread_read.runtime_summary.as_ref()),
        "permissionState": thread_read.permission_state,
        "oemPolicy": thread_read.oem_policy,
        "auxiliaryTaskRuntime": thread_read.auxiliary_task_runtime
    })
}

pub(crate) fn permission_state_signal_coverage(
    thread_read: &AgentRuntimeThreadReadModel,
) -> RuntimeEvidenceSignalCoverageEntry {
    let Some(permission_state) = thread_read.permission_state.as_ref() else {
        return RuntimeEvidenceSignalCoverageEntry {
            signal: "permissionState",
            status: "missing",
            source: "thread_read.permission_state",
            detail: "thread_read 缺少 permission_state。".to_string(),
        };
    };

    let confirmation_status = permission_state.confirmation_status.as_deref();
    let confirmation_request_id = permission_state
        .confirmation_request_id
        .as_deref()
        .unwrap_or("未记录 confirmationRequestId");
    let confirmation_source = permission_state
        .confirmation_source
        .as_deref()
        .unwrap_or("未记录 confirmationSource");

    if confirmation_status == Some("denied") {
        return RuntimeEvidenceSignalCoverageEntry {
            signal: "permissionState",
            status: "blocked",
            source: "thread_read.permission_state",
            detail: format!(
                "thread_read 已导出 permission_state，但真实权限确认已被拒绝：request_id={confirmation_request_id}, source={confirmation_source}。"
            ),
        };
    }

    if let Some(detail) = unresolved_permission_confirmation_blocking_detail(permission_state) {
        return RuntimeEvidenceSignalCoverageEntry {
            signal: "permissionState",
            status: "blocked",
            source: "thread_read.permission_state",
            detail: format!("thread_read 已导出 permission_state，但{detail}"),
        };
    }

    let detail = match confirmation_status {
        Some("resolved") => format!(
            "thread_read 已导出 permission_state，真实权限确认已通过：request_id={confirmation_request_id}, source={confirmation_source}。"
        ),
        Some("requested") => format!(
            "thread_read 已导出 permission_state，真实权限确认正在等待处理：request_id={confirmation_request_id}, source={confirmation_source}。"
        ),
        Some("not_requested") => {
            "thread_read 已导出 permission_state，声明态权限尚未发起真实审批请求。".to_string()
        }
        Some(other) => format!(
            "thread_read 已导出 permission_state，confirmationStatus={other}, source={confirmation_source}。"
        ),
        None => "thread_read 已导出 permission_state。".to_string(),
    };

    RuntimeEvidenceSignalCoverageEntry {
        signal: "permissionState",
        status: "exported",
        source: "thread_read.permission_state",
        detail,
    }
}

fn build_runtime_fact_signal_coverage(
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<RuntimeEvidenceSignalCoverageEntry> {
    vec![
        RuntimeEvidenceSignalCoverageEntry {
            signal: "decisionReason",
            status: if normalize_optional_text(thread_read.decision_reason.clone()).is_some() {
                "exported"
            } else {
                "missing"
            },
            source: "thread_read.decision_reason",
            detail: if normalize_optional_text(thread_read.decision_reason.clone()).is_some() {
                "thread_read 已导出 decision_reason。".to_string()
            } else {
                "thread_read 缺少 decision_reason。".to_string()
            },
        },
        RuntimeEvidenceSignalCoverageEntry {
            signal: "fallbackChain",
            status: if thread_read
                .fallback_chain
                .as_ref()
                .is_some_and(|items| !items.is_empty())
            {
                "exported"
            } else {
                "missing"
            },
            source: "thread_read.fallback_chain",
            detail: if thread_read
                .fallback_chain
                .as_ref()
                .is_some_and(|items| !items.is_empty())
            {
                "thread_read 已导出 fallback_chain。".to_string()
            } else {
                "thread_read 缺少 fallback_chain。".to_string()
            },
        },
        RuntimeEvidenceSignalCoverageEntry {
            signal: "oemPolicy",
            status: if thread_read.oem_policy.is_some() {
                "exported"
            } else {
                "missing"
            },
            source: "thread_read.oem_policy",
            detail: if thread_read.oem_policy.is_some() {
                "thread_read 已导出 oem_policy。".to_string()
            } else {
                "thread_read 缺少 oem_policy。".to_string()
            },
        },
        RuntimeEvidenceSignalCoverageEntry {
            signal: "runtimeSummary",
            status: if thread_read.runtime_summary.is_some() {
                "exported"
            } else {
                "missing"
            },
            source: "thread_read.runtime_summary",
            detail: if thread_read.runtime_summary.is_some() {
                "thread_read 已导出 runtime_summary。".to_string()
            } else {
                "thread_read 缺少 runtime_summary。".to_string()
            },
        },
        permission_state_signal_coverage(thread_read),
        RuntimeEvidenceSignalCoverageEntry {
            signal: "auxiliaryTaskRuntime",
            status: if thread_read
                .auxiliary_task_runtime
                .as_ref()
                .is_some_and(|items| !items.is_empty())
            {
                "exported"
            } else {
                "missing"
            },
            source: "thread_read.auxiliary_task_runtime",
            detail: if thread_read
                .auxiliary_task_runtime
                .as_ref()
                .is_some_and(|items| !items.is_empty())
            {
                "thread_read 已导出 auxiliary_task_runtime。".to_string()
            } else {
                "thread_read 缺少 auxiliary_task_runtime。".to_string()
            },
        },
    ]
}

pub(crate) fn build_runtime_observability_summary_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    recent_artifacts: &[String],
    owner_runs: &[AgentRun],
    request_telemetry: &RuntimeRequestTelemetrySummary,
    auxiliary_runtime: &RuntimeAuxiliaryRuntimeSnapshotSummary,
    modality_runtime_contracts: &RuntimeModalityContractSnapshotSummary,
    verification: &RuntimeEvidenceVerificationSummary,
    signal_coverage: &[RuntimeEvidenceSignalCoverageEntry],
    known_gaps: &[String],
) -> Value {
    let diagnostics = thread_read.diagnostics.as_ref();
    let remote_task_ids = agent_runtime_remote_task_ids(owner_runs);
    let remote_channels = build_agent_runtime_remote_channels_json(owner_runs);
    let remote_channel_count = remote_channels
        .get("count")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let mut signal_coverage = signal_coverage.to_vec();
    signal_coverage.extend(build_runtime_fact_signal_coverage(thread_read));
    let mut payload = json!({
        "schemaVersion": "v1",
        "correlation": {
            "correlationKeys": [
                "runtime_id",
                "profile_schema_version",
                "session_id",
                "thread_id",
                "turn_id",
                "tool_call_id",
                "trace_id",
                "evidence_ref",
                "pending_request_id",
                "queued_turn_id",
                "subagent_session_id",
                "remote_task_id"
            ],
            "runtimeId": LIME_AGENT_RUNTIME_ID,
            "profileSchemaVersion": LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION,
            "sessionId": detail.id,
            "threadId": detail.thread_id,
            "activeTurnId": thread_read.active_turn_id,
            "turnIds": thread_read.turns.iter().map(|turn| turn.turn_id.clone()).collect::<Vec<_>>(),
            "toolCallIds": thread_read.tool_calls.iter().map(|tool| tool.tool_call_id.clone()).collect::<Vec<_>>(),
            "traceIds": thread_read.telemetry_summary.trace_ids,
            "evidenceRefs": thread_read.evidence_summary.evidence_refs,
            "pendingRequestIds": thread_read.pending_requests.iter().map(|item| item.id.clone()).collect::<Vec<_>>(),
            "queuedTurnIds": thread_read.queued_turns.iter().map(|item| item.queued_turn_id.clone()).collect::<Vec<_>>(),
            "subagentSessionIds": detail.child_subagent_sessions.iter().map(|item| item.id.clone()).collect::<Vec<_>>(),
            "remoteTaskIds": remote_task_ids
        },
        "counts": {
            "turnCount": detail.turns.len(),
            "itemCount": detail.items.len(),
            "pendingRequestCount": thread_read.pending_requests.len(),
            "queuedTurnCount": thread_read.queued_turns.len(),
            "warningCount": diagnostics.map(|value| value.warning_count).unwrap_or(0),
            "failedToolCallCount": diagnostics.map(|value| value.failed_tool_call_count).unwrap_or(0),
            "failedCommandCount": diagnostics.map(|value| value.failed_command_count).unwrap_or(0),
            "subagentCount": detail.child_subagent_sessions.len(),
            "remoteChannelCount": remote_channel_count,
            "recentArtifactCount": recent_artifacts.len(),
            "auxiliaryRuntimeSnapshotCount": auxiliary_runtime.snapshots.len(),
            "modalityRuntimeContractCount": modality_runtime_contracts.snapshots.len()
        },
        "remoteChannels": remote_channels,
        "modalityRuntimeContracts": build_modality_runtime_contracts_observability_summary_json(modality_runtime_contracts),
        "latest": {
            "warning": latest_warning_json(diagnostics),
            "failedTool": latest_failed_tool_json(diagnostics),
            "failedCommand": latest_failed_command_json(diagnostics)
        },
        "runtimeFacts": build_thread_runtime_facts_json(thread_read),
        "requestTelemetry": build_request_telemetry_json(request_telemetry),
        "signalCoverage": signal_coverage.iter().map(|entry| json!({
            "signal": entry.signal,
            "status": entry.status,
            "source": entry.source,
            "detail": entry.detail
        })).collect::<Vec<_>>(),
        "knownGaps": known_gaps
    });

    if let Some(verification_summary) = build_observability_verification_summary_json(verification)
    {
        payload
            .as_object_mut()
            .expect("observability summary must be object")
            .insert("verificationSummary".to_string(), verification_summary);
    }

    payload
}

pub(crate) fn build_signal_coverage(
    thread_read: &AgentRuntimeThreadReadModel,
    recent_artifacts: &[RuntimeRecentArtifact],
    request_telemetry: &RuntimeRequestTelemetrySummary,
    auxiliary_runtime: &RuntimeAuxiliaryRuntimeSnapshotSummary,
    modality_runtime_contracts: &RuntimeModalityContractSnapshotSummary,
    verification: &RuntimeEvidenceVerificationSummary,
) -> Vec<RuntimeEvidenceSignalCoverageEntry> {
    let diagnostics = thread_read.diagnostics.as_ref();
    let request_telemetry_entry = if request_telemetry.searched_roots.is_empty() {
        RuntimeEvidenceSignalCoverageEntry {
            signal: "requestTelemetry",
            status: "known_gap",
            source: "lime_infra.telemetry.request_logs",
            detail: "当前环境未找到可读取的 request telemetry 日志目录，Evidence Pack 无法导出会话级请求遥测。".to_string(),
        }
    } else if request_telemetry.matched_request_count == 0 {
        RuntimeEvidenceSignalCoverageEntry {
            signal: "requestTelemetry",
            status: "exported",
            source: "lime_infra.telemetry.request_logs",
            detail: "当前证据包已扫描 request telemetry 日志目录，但当前会话未匹配到 provider request 记录。".to_string(),
        }
    } else {
        RuntimeEvidenceSignalCoverageEntry {
            signal: "requestTelemetry",
            status: "exported",
            source: "lime_infra.telemetry.request_logs",
            detail: format!(
                "当前证据包已导出 {} 条按 session/thread/turn 关联的 request telemetry 记录。",
                request_telemetry.matched_request_count
            ),
        }
    };
    let mut coverage = vec![
        RuntimeEvidenceSignalCoverageEntry {
            signal: "correlation",
            status: "exported",
            source: "runtime thread identity",
            detail: "当前证据包已导出 session/thread/turn/pending request/subagent 关联键。"
                .to_string(),
        },
        RuntimeEvidenceSignalCoverageEntry {
            signal: "timeline",
            status: "exported",
            source: "timeline.json",
            detail: "当前证据包已导出最近 turn 与 item 时间线。".to_string(),
        },
        RuntimeEvidenceSignalCoverageEntry {
            signal: "warnings",
            status: "exported",
            source: "thread.diagnostics",
            detail: if diagnostics.is_some() {
                "当前证据包已导出 warning / failed tool / failed command 摘要。".to_string()
            } else {
                "当前线程没有 diagnostics，但 warning 通道已保留在导出结构中。".to_string()
            },
        },
        request_telemetry_entry,
    ];

    if auxiliary_runtime.applicable_count > 0 {
        coverage.push(RuntimeEvidenceSignalCoverageEntry {
            signal: "auxiliaryTaskRuntime",
            status: if auxiliary_runtime.snapshots.is_empty() {
                "known_gap"
            } else {
                "exported"
            },
            source: "image_task.title_generation_result",
            detail: if auxiliary_runtime.snapshots.is_empty() {
                format!(
                    "当前检测到 {} 个图片任务工件，但未从稳定 task artifact 中提取到 title_generation_result.execution_runtime 快照。",
                    auxiliary_runtime.applicable_count
                )
            } else {
                format!(
                    "当前证据包已从 {} 个图片任务工件中导出 {} 条辅助标题生成 runtime 快照。",
                    auxiliary_runtime.applicable_count,
                    auxiliary_runtime.snapshots.len()
                )
            },
        });
    }

    if modality_runtime_contracts.applicable_count > 0 {
        coverage.push(RuntimeEvidenceSignalCoverageEntry {
            signal: "modalityRuntimeContract",
            status: if modality_runtime_contracts.snapshots.is_empty() {
                "known_gap"
            } else {
                "exported"
            },
            source: "task_or_tool_trace.modality_runtime_contract",
            detail: if modality_runtime_contracts.snapshots.is_empty() {
                format!(
                    "当前检测到 {} 个多模态任务或工具 trace，但未从稳定事实源中提取到底层 ModalityRuntimeContract 快照。",
                    modality_runtime_contracts.applicable_count
                )
            } else {
                format!(
                    "当前证据包已从 {} 个多模态任务或工具 trace 中导出 {} 条 ModalityRuntimeContract / routing 决策快照。",
                    modality_runtime_contracts.applicable_count,
                    modality_runtime_contracts.snapshots.len()
                )
            },
        });
    }

    if verification.artifact_validator.applicable {
        coverage.push(RuntimeEvidenceSignalCoverageEntry {
            signal: "artifactValidator",
            status: if verification.artifact_validator.records.is_empty() {
                "known_gap"
            } else {
                "exported"
            },
            source: "artifact_document_validator",
            detail: if verification.artifact_validator.records.is_empty() {
                format!(
                    "当前检测到 {} 个 ArtifactDocument 产物，但 validator outcome 尚未回挂到当前 evidence pack。",
                    recent_artifacts
                        .iter()
                        .filter(|artifact| is_artifact_validator_applicable(artifact))
                        .count()
                )
            } else {
                format!(
                    "当前证据包已为 {} 个 ArtifactDocument 产物导出 validator outcome。",
                    verification.artifact_validator.records.len()
                )
            },
        });
    }

    if !verification.browser_evidence.is_empty() {
        coverage.push(RuntimeEvidenceSignalCoverageEntry {
            signal: "browserVerification",
            status: "exported",
            source: "browser runtime",
            detail: format!(
                "当前证据包已导出 {} 条浏览器验证线索。",
                verification.browser_evidence.len()
            ),
        });
    }

    if verification.gui_smoke.is_some() {
        coverage.push(RuntimeEvidenceSignalCoverageEntry {
            signal: "guiSmoke",
            status: "exported",
            source: "verify:gui-smoke",
            detail: "当前证据包已导出 GUI smoke 运行结果。".to_string(),
        });
    }

    coverage
}

fn latest_warning_json(
    diagnostics: Option<&crate::commands::aster_agent_cmd::AgentRuntimeThreadDiagnostics>,
) -> Option<Value> {
    diagnostics.and_then(|value| {
        value.latest_warning.as_ref().map(|warning| {
            json!({
                "code": warning.code,
                "message": warning.message,
                "updatedAt": warning.updated_at
            })
        })
    })
}

fn latest_failed_tool_json(
    diagnostics: Option<&crate::commands::aster_agent_cmd::AgentRuntimeThreadDiagnostics>,
) -> Option<Value> {
    diagnostics.and_then(|value| {
        value.latest_failed_tool.as_ref().map(|tool| {
            json!({
                "toolName": tool.tool_name,
                "error": tool.error,
                "updatedAt": tool.updated_at
            })
        })
    })
}

fn latest_failed_command_json(
    diagnostics: Option<&crate::commands::aster_agent_cmd::AgentRuntimeThreadDiagnostics>,
) -> Option<Value> {
    diagnostics.and_then(|value| {
        value.latest_failed_command.as_ref().map(|command| {
            json!({
                "command": command.command,
                "exitCode": command.exit_code,
                "error": command.error,
                "updatedAt": command.updated_at
            })
        })
    })
}

pub(crate) fn format_observability_signal_list(
    observability_summary: &Value,
    status: &str,
) -> String {
    let signals = observability_summary
        .pointer("/signalCoverage")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter(|value| {
                    value
                        .get("status")
                        .and_then(Value::as_str)
                        .map(|value| value == status)
                        .unwrap_or(false)
                })
                .filter_map(|value| value.get("signal").and_then(Value::as_str))
                .map(|value| format!("`{value}`"))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if signals.is_empty() {
        "无".to_string()
    } else {
        signals.join("、")
    }
}

pub(crate) fn format_observability_gap_list(observability_summary: &Value) -> String {
    let signals = observability_summary
        .pointer("/signalCoverage")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|value| {
                    let signal = value.get("signal").and_then(Value::as_str)?;
                    let status = value.get("status").and_then(Value::as_str)?;
                    if status == "exported" {
                        return None;
                    }
                    Some(format!("`{signal}` ({status})"))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if signals.is_empty() {
        "无".to_string()
    } else {
        signals.join("、")
    }
}
