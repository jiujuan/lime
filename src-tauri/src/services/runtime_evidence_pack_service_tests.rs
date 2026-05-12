//! runtime_evidence_pack_service 的定向单元测试。
//!
//! 从主 service 文件拆出，避免导出编排与大量 fixture 继续耦合。

use super::*;
use crate::agent::QueuedTurnSnapshot;
use crate::commands::aster_agent_cmd::{
    LIME_AGENT_RUNTIME_ID, LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION,
};
use crate::commands::modality_runtime_contracts::{
    AUDIO_TRANSCRIPTION_CONTRACT_KEY, AUDIO_TRANSCRIPTION_ROUTING_SLOT,
    BROWSER_CONTROL_CONTRACT_KEY, BROWSER_CONTROL_ROUTING_SLOT, IMAGE_GENERATION_CONTRACT_KEY,
    IMAGE_GENERATION_LIMECORE_POLICY_REFS, IMAGE_GENERATION_ROUTING_SLOT,
    LIMECORE_POLICY_DECISION_ALLOW, LIMECORE_POLICY_DECISION_REASON_NO_LOCAL_DENY,
    LIMECORE_POLICY_DECISION_REASON_POLICY_INPUTS_MISSING,
    LIMECORE_POLICY_DECISION_SCOPE_LOCAL_DEFAULTS_ONLY,
    LIMECORE_POLICY_DECISION_SOURCE_LOCAL_DEFAULT,
    LIMECORE_POLICY_DECISION_SOURCE_POLICY_INPUT_EVALUATOR, LIMECORE_POLICY_INPUT_STATUS_RESOLVED,
    LIMECORE_POLICY_SNAPSHOT_STATUS_LOCAL_DEFAULTS_EVALUATED, PDF_EXTRACT_CONTRACT_KEY,
    PDF_EXTRACT_ROUTING_SLOT, TEXT_TRANSFORM_CONTRACT_KEY, TEXT_TRANSFORM_ROUTING_SLOT,
    VOICE_GENERATION_CONTRACT_KEY, VOICE_GENERATION_ROUTING_SLOT, WEB_RESEARCH_CONTRACT_KEY,
    WEB_RESEARCH_ROUTING_SLOT,
};
use crate::services::artifact_document_validator::ARTIFACT_DOCUMENT_SCHEMA_VERSION;
use crate::services::runtime_evidence_artifact_index_service::RuntimeRecentArtifact;
use crate::services::runtime_evidence_completion_audit_service::RuntimeCapabilityDraftControlledGetEvidenceSummary;
use crate::services::runtime_evidence_modality_contract_service::{
    extract_runtime_contract_limecore_policy_refs,
    extract_runtime_contract_limecore_policy_snapshot,
};
use crate::services::runtime_evidence_verification_service::build_observability_verification_summary_json;
use crate::services::runtime_evidence_verification_service::RuntimeEvidenceVerificationSummary;
use lime_core::database::dao::agent_run::AgentRunStatus;
use lime_core::database::dao::agent_timeline::{
    AgentThreadItem, AgentThreadItemPayload, AgentThreadItemStatus, AgentThreadTurn,
    AgentThreadTurnStatus,
};
use lime_infra::telemetry::RequestLog;
use serde_json::{json, Value};
use tempfile::TempDir;

#[test]
fn extract_limecore_policy_snapshot_should_derive_pending_refs_from_policy_value_hits() {
    let document = json!({
        "runtime_contract": {
            "contract_key": IMAGE_GENERATION_CONTRACT_KEY,
            "limecore_policy_refs": [
                "model_catalog",
                "provider_offer",
                "tenant_feature_flags"
            ],
            "limecore_policy_snapshot": {
                "refs": [
                    "model_catalog",
                    "provider_offer",
                    "tenant_feature_flags"
                ],
                "policy_value_hits": [
                    {
                        "ref_key": "model_catalog",
                        "status": "resolved",
                        "source": "limecore_policy_hit_resolver",
                        "value_source": "local_model_catalog",
                        "value": {
                            "model_id": "gpt-image-1",
                            "capability": "image_generation"
                        }
                    }
                ]
            }
        }
    });
    let refs =
        extract_runtime_contract_limecore_policy_refs(&document, IMAGE_GENERATION_CONTRACT_KEY);
    let snapshot = extract_runtime_contract_limecore_policy_snapshot(&document, &refs)
        .expect("limecore policy snapshot");

    assert_eq!(snapshot["evaluated_refs"], json!(["model_catalog"]));
    assert_eq!(
        snapshot["pending_hit_refs"],
        json!(["provider_offer", "tenant_feature_flags"])
    );
    assert_eq!(
        snapshot["missing_inputs"],
        json!(["provider_offer", "tenant_feature_flags"])
    );
    assert_eq!(snapshot["policy_value_hit_count"], json!(1));
    assert_eq!(
        snapshot["policy_inputs"][0]["status"],
        json!(LIMECORE_POLICY_INPUT_STATUS_RESOLVED)
    );
    assert_eq!(
        snapshot["policy_inputs"][0]["value_source"],
        json!("local_model_catalog")
    );
}

#[test]
fn requested_fix_execution_results_should_come_from_artifact_metadata() {
    let recent_artifacts = vec![RuntimeRecentArtifact {
        path: ".lime/harness/sessions/session-1/evidence/runtime.json".to_string(),
        metadata: Some(json!({
            "requestedFixExecutionResults": [
                {
                    "requestedFix": "补齐 evidence pack",
                    "requestedFixIndex": 1,
                    "executionStatus": "completed",
                    "regressionOutcome": "recovered",
                    "summaryPreview": "已重新导出 evidence pack。",
                    "resultRef": "agent-runtime://session/session-1/thread/thread-1/turn/turn-1/item/item-fix-1",
                    "artifactPaths": [
                        ".lime/harness/sessions/session-1/evidence/runtime.json"
                    ]
                }
            ]
        })),
    }];
    let results = collect_requested_fix_execution_results(&recent_artifacts);
    let verification = RuntimeEvidenceVerificationSummary {
        requested_fix_execution_results: results,
        ..RuntimeEvidenceVerificationSummary::default()
    };
    let summary =
        build_observability_verification_summary_json(&verification).expect("verification summary");

    assert_eq!(
        summary
            .pointer("/requestedFixExecutionResults/0/executionStatus")
            .and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        summary
            .pointer("/requestedFixExecutionResults/0/regressionOutcome")
            .and_then(Value::as_str),
        Some("recovered")
    );
    assert_eq!(
        summary
            .pointer("/requestedFixExecutionResults/0/resultRef")
            .and_then(Value::as_str),
        Some("agent-runtime://session/session-1/thread/thread-1/turn/turn-1/item/item-fix-1")
    );
}

fn build_detail() -> SessionDetail {
    SessionDetail {
        id: "session-1".to_string(),
        name: "P2 evidence".to_string(),
        created_at: 1,
        updated_at: 2,
        thread_id: "thread-1".to_string(),
        model: Some("gpt-5.4".to_string()),
        working_dir: Some("/tmp/workspace".to_string()),
        workspace_id: Some("workspace-1".to_string()),
        messages: Vec::new(),
        execution_strategy: Some("react".to_string()),
        execution_runtime: None,
        turns: vec![AgentThreadTurn {
            id: "turn-1".to_string(),
            thread_id: "thread-1".to_string(),
            prompt_text: "继续推进 evidence pack".to_string(),
            status: AgentThreadTurnStatus::Completed,
            started_at: "2026-03-27T10:00:00Z".to_string(),
            completed_at: Some("2026-03-27T10:01:00Z".to_string()),
            error_message: None,
            created_at: "2026-03-27T10:00:00Z".to_string(),
            updated_at: "2026-03-27T10:01:00Z".to_string(),
        }],
        items: vec![
            AgentThreadItem {
                id: "plan-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                sequence: 1,
                status: AgentThreadItemStatus::Completed,
                started_at: "2026-03-27T10:00:05Z".to_string(),
                completed_at: Some("2026-03-27T10:00:05Z".to_string()),
                updated_at: "2026-03-27T10:00:05Z".to_string(),
                payload: AgentThreadItemPayload::Plan {
                    text: "先导出 handoff，再导出 evidence pack".to_string(),
                },
            },
            AgentThreadItem {
                id: "artifact-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                sequence: 2,
                status: AgentThreadItemStatus::Completed,
                started_at: "2026-03-27T10:00:20Z".to_string(),
                completed_at: Some("2026-03-27T10:00:20Z".to_string()),
                updated_at: "2026-03-27T10:00:20Z".to_string(),
                payload: AgentThreadItemPayload::FileArtifact {
                    path: ".lime/artifacts/thread-1/report.md".to_string(),
                    source: "artifact_snapshot".to_string(),
                    content: None,
                    metadata: None,
                },
            },
            AgentThreadItem {
                id: "summary-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                sequence: 3,
                status: AgentThreadItemStatus::Completed,
                started_at: "2026-03-27T10:00:30Z".to_string(),
                completed_at: Some("2026-03-27T10:00:30Z".to_string()),
                updated_at: "2026-03-27T10:00:30Z".to_string(),
                payload: AgentThreadItemPayload::TurnSummary {
                    text: "已拿到 handoff 四件套，下一步补问题证据包。".to_string(),
                    metadata: None,
                },
            },
        ],
        todo_items: Vec::new(),
        child_subagent_sessions: Vec::new(),
        subagent_parent_context: None,
    }
}

fn build_thread_read() -> AgentRuntimeThreadReadModel {
    AgentRuntimeThreadReadModel {
        thread_id: "thread-1".to_string(),
        status: "running".to_string(),
        profile_status: "running".to_string(),
        active_turn_id: Some("turn-1".to_string()),
        turns: vec![
            crate::commands::aster_agent_cmd::AgentRuntimeThreadTurnProfileView {
                turn_id: "turn-1".to_string(),
                status: "running".to_string(),
                native_status: "running".to_string(),
            },
        ],
        pending_requests: vec![crate::commands::aster_agent_cmd::AgentRuntimeRequestView {
            id: "req-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: Some("turn-1".to_string()),
            item_id: None,
            request_type: "ask_user".to_string(),
            status: "pending".to_string(),
            title: Some("确认是否导出问题证据包".to_string()),
            payload: None,
            decision: None,
            scope: None,
            created_at: None,
            resolved_at: None,
        }],
        last_outcome: None,
        incidents: Vec::new(),
        queued_turns: vec![QueuedTurnSnapshot {
            queued_turn_id: "queued-1".to_string(),
            message_preview: "继续补证据包 UI".to_string(),
            message_text: "继续补证据包 UI".to_string(),
            created_at: 3,
            image_count: 0,
            position: 1,
        }],
        tool_calls: vec![
            crate::commands::aster_agent_cmd::AgentRuntimeThreadToolCallView {
                tool_call_id: "tool-1".to_string(),
                turn_id: "turn-1".to_string(),
                tool_name: "Read".to_string(),
                status: "completed".to_string(),
                success: Some(true),
                error: None,
            },
        ],
        model_routing: Some(json!({
            "taskKind": "translation",
            "serviceModelSlot": "translation",
            "routingMode": "single_candidate",
            "decisionSource": "service_model_setting",
            "selectedModel": "gpt-5.4-mini",
            "candidateCount": 1,
            "estimatedCostClass": "low",
            "singleCandidateOnly": true
        })),
        evidence_summary: crate::commands::aster_agent_cmd::AgentRuntimeThreadEvidenceSummary {
            evidence_refs: vec!["evidence://session-1/runtime".to_string()],
            verification_outcomes: Vec::new(),
        },
        telemetry_summary: crate::commands::aster_agent_cmd::AgentRuntimeThreadTelemetrySummary {
            trace_ids: vec!["trace-turn-1".to_string()],
            join_status: "matched".to_string(),
        },
        context_summary: Some(json!({
            "owner": "AgentContext",
            "source": "turn_context",
            "retrieval_refs": [
                {
                    "source_id": "knowledge_pack:brief",
                    "kind": "knowledge_pack"
                }
            ]
        })),
        interrupt_state: None,
        updated_at: Some("2026-03-27T10:01:00Z".to_string()),
        latest_compaction_boundary: None,
        file_checkpoint_summary: None,
        diagnostics: Some(
            crate::commands::aster_agent_cmd::AgentRuntimeThreadDiagnostics {
                latest_turn_status: Some("running".to_string()),
                latest_turn_started_at: None,
                latest_turn_completed_at: None,
                latest_turn_updated_at: None,
                latest_turn_elapsed_seconds: None,
                latest_turn_stalled_seconds: None,
                latest_turn_error_message: None,
                interrupt_reason: None,
                runtime_interrupt_source: None,
                runtime_interrupt_requested_at: None,
                runtime_interrupt_wait_seconds: None,
                warning_count: 1,
                context_compaction_count: 0,
                failed_tool_call_count: 0,
                failed_command_count: 0,
                pending_request_count: 1,
                oldest_pending_request_wait_seconds: None,
                primary_blocking_kind: Some("pending_request".to_string()),
                primary_blocking_summary: Some("等待用户确认是否导出问题证据包".to_string()),
                latest_warning: Some(
                    crate::commands::aster_agent_cmd::AgentRuntimeDiagnosticWarningSample {
                        item_id: "warning-1".to_string(),
                        turn_id: Some("turn-1".to_string()),
                        code: Some("runtime.pending".to_string()),
                        message: "存在待处理请求".to_string(),
                        updated_at: "2026-03-27T10:01:00Z".to_string(),
                    },
                ),
                latest_context_compaction: None,
                latest_failed_tool: None,
                latest_failed_command: None,
                latest_pending_request: None,
            },
        ),
        task_kind: Some("generation_topic".to_string()),
        service_model_slot: Some("planner".to_string()),
        routing_mode: Some("fallback_chain".to_string()),
        decision_source: Some("model_router".to_string()),
        candidate_count: Some(2),
        capability_gap: Some("vision".to_string()),
        single_candidate_only: Some(false),
        oem_policy: Some(json!({
            "quotaStatus": "low_credit",
            "defaultModel": "oem/gpt-5.4-mini",
            "offerState": "managed"
        })),
        runtime_summary: Some(json!({
            "decisionReason": "主路由能力不足，切到回退模型",
            "capabilityGap": "vision",
            "limitStatus": "soft_limited",
            "estimatedCostClass": "low"
        })),
        decision_reason: Some("主路由能力不足，切到回退模型".to_string()),
        fallback_chain: Some(vec![
            "openai:gpt-5.4".to_string(),
            "openai:gpt-5.4-mini".to_string(),
        ]),
        auxiliary_task_runtime: Some(vec![
            json!({"route": "auxiliary.generate_title", "taskKind": "generation_topic"}),
        ]),
        limit_state: Some(lime_agent::SessionExecutionRuntimeLimitState {
            status: "soft_limited".to_string(),
            single_candidate_only: false,
            provider_locked: false,
            settings_locked: false,
            oem_locked: false,
            candidate_count: 2,
            capability_gap: Some("vision".to_string()),
            notes: vec!["需要回退链".to_string()],
        }),
        estimated_cost_class: Some("low".to_string()),
        permission_state: Some(lime_agent::SessionExecutionRuntimePermissionState {
            status: "requires_confirmation".to_string(),
            required_profile_keys: vec!["read_files".to_string(), "write_artifacts".to_string()],
            ask_profile_keys: vec!["read_files".to_string(), "write_artifacts".to_string()],
            blocking_profile_keys: Vec::new(),
            decision_source: "modality_execution_profile".to_string(),
            decision_scope: "declared_profile".to_string(),
            confirmation_status: Some("not_requested".to_string()),
            confirmation_request_id: None,
            confirmation_source: Some("declared_profile_only".to_string()),
            notes: vec!["声明态权限摘要，未执行真实授权。".to_string()],
        }),
        cost_state: Some(lime_agent::SessionExecutionRuntimeCostState {
            status: "estimated".to_string(),
            estimated_cost_class: Some("low".to_string()),
            input_per_million: None,
            output_per_million: None,
            cache_read_per_million: None,
            cache_write_per_million: None,
            currency: None,
            estimated_total_cost: None,
            input_tokens: None,
            output_tokens: None,
            total_tokens: None,
            cached_input_tokens: None,
            cache_creation_input_tokens: None,
        }),
        limit_event: Some(lime_agent::SessionExecutionRuntimeLimitEvent {
            event_kind: "fallback_applied".to_string(),
            message: "因能力缺口触发回退链".to_string(),
            retryable: true,
        }),
    }
}

fn find_agent_runtime_profile_event<'a>(runtime: &'a Value, event_type: &str) -> &'a Value {
    runtime
        .pointer("/agentRuntimeProfile/events")
        .and_then(Value::as_array)
        .and_then(|events| {
            events
                .iter()
                .find(|event| event.get("type").and_then(Value::as_str) == Some(event_type))
        })
        .unwrap_or_else(|| panic!("missing AgentRuntime profile event {event_type}"))
}

fn build_completion_audit_owner_run(status: AgentRunStatus, metadata: Option<Value>) -> AgentRun {
    AgentRun {
        id: "run-automation-1".to_string(),
        source: "automation".to_string(),
        source_ref: Some("job-1".to_string()),
        session_id: Some("session-1".to_string()),
        status,
        started_at: "2026-05-06T10:00:00Z".to_string(),
        finished_at: Some("2026-05-06T10:01:00Z".to_string()),
        duration_ms: Some(60_000),
        error_code: None,
        error_message: None,
        metadata: metadata.map(|value| value.to_string()),
        created_at: "2026-05-06T10:00:00Z".to_string(),
        updated_at: "2026-05-06T10:01:00Z".to_string(),
    }
}

fn build_remote_owner_run(run_id: &str, status: AgentRunStatus, metadata: Value) -> AgentRun {
    AgentRun {
        id: run_id.to_string(),
        source: "chat".to_string(),
        source_ref: Some("agent.run".to_string()),
        session_id: Some("session-1".to_string()),
        status,
        started_at: "2026-05-06T10:00:00Z".to_string(),
        finished_at: Some("2026-05-06T10:01:00Z".to_string()),
        duration_ms: Some(60_000),
        error_code: None,
        error_message: None,
        metadata: Some(metadata.to_string()),
        created_at: "2026-05-06T10:00:00Z".to_string(),
        updated_at: "2026-05-06T10:01:00Z".to_string(),
    }
}

fn build_completion_audit_owner_metadata() -> Value {
    json!({
        "job_id": "job-1",
        "job_name": "只读 CLI 报告｜Managed Agent 草案",
        "harness": {
            "agent_envelope": {
                "source": "skill_forge_p4_agent_envelope",
                "skill": "project:capability-report",
                "source_draft_id": "capdraft-1",
                "source_verification_report_id": "capver-1"
            },
            "managed_objective": {
                "source": "skill_forge_p4_managed_execution",
                "owner_type": "automation_job",
                "completion_audit": "artifact_or_evidence_required"
            },
            "workspace_skill_runtime_enable": {
                "source": "agent_envelope_scheduled_run",
                "approval": "manual",
                "workspace_root": "/tmp/work",
                "bindings": [
                    {
                        "directory": "capability-report",
                        "skill": "project:capability-report",
                        "source_draft_id": "capdraft-1",
                        "source_verification_report_id": "capver-1"
                    }
                ]
            }
        }
    })
}

fn build_completion_audit_owner_metadata_requiring_controlled_get() -> Value {
    let mut metadata = build_completion_audit_owner_metadata();
    if let Some(managed_objective) = metadata.pointer_mut("/harness/managed_objective") {
        managed_objective["completion_evidence_policy"] = json!({
            "controlled_get_evidence_required": true,
            "controlled_get_evidence_source": "capability_draft_controlled_get_evidence"
        });
        managed_objective["required_external_evidence"] = json!(["controlled_get_evidence"]);
    }
    metadata
}

fn write_controlled_get_evidence_fixture(workspace_root: &Path, session_id: &str) {
    let evidence_dir = workspace_root
        .join(".lime")
        .join("capability-drafts")
        .join("controlled-get-evidence");
    fs::create_dir_all(evidence_dir.as_path()).expect("create controlled get evidence dir");
    let artifact_id = format!("controlled-get-fixture-{session_id}");
    let artifact = json!({
        "artifactId": artifact_id,
        "artifactKind": "capability_draft_controlled_get_evidence",
        "schemaVersion": 1,
        "approvalId": "approval-readonly-api",
        "sessionId": session_id,
        "status": "executed",
        "scope": "session",
        "gateId": "readonly_http_controlled_get_execution",
        "method": "GET",
        "methodAllowed": true,
        "requestUrlHash": "request-url-hash-fixture",
        "requestUrlHashAlgorithm": "sha256",
        "responseStatus": 200,
        "responseSha256": "response-sha256-fixture",
        "responseBytes": 17,
        "responsePreviewTruncated": false,
        "executedAt": "2026-05-07T10:00:00Z",
        "networkRequestSent": true,
        "responseCaptured": true,
        "endpointValueReturned": false,
        "endpointInputPersisted": false,
        "credentialReferenceId": "readonly_api_session",
        "credentialResolved": false,
        "tokenPersisted": false,
        "runtimeExecutionEnabled": false,
        "valueRetention": "hash_and_metadata_only",
        "containsEndpointValue": false,
        "containsTokenValue": false,
        "containsResponsePreview": false,
        "endpointValue": "https://api.example.com/secret",
        "tokenValue": "secret-token",
        "responsePreview": "{\"ok\":true}",
        "evidence": [
            {"key": "request_url_hash", "value": "request-url-hash-fixture"},
            {"key": "response_sha256", "value": "response-sha256-fixture"},
            {"key": "response_preview_sha256", "value": "preview-sha256-fixture"}
        ]
    });
    fs::write(
        evidence_dir.join(format!("controlled-get-fixture-{session_id}.json")),
        serde_json::to_string_pretty(&artifact).expect("serialize controlled get artifact"),
    )
    .expect("write controlled get artifact");
}

#[test]
fn timeline_should_preserve_workspace_skill_source_metadata_for_agent_envelope() {
    let mut detail = build_detail();
    detail.items.push(AgentThreadItem {
        id: "workspace-skill-tool-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-05-06T10:00:40Z".to_string(),
        completed_at: Some("2026-05-06T10:00:41Z".to_string()),
        updated_at: "2026-05-06T10:00:41Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "project:capability-report".to_string(),
            arguments: Some(json!({
                "input": "daily report"
            })),
            output: Some("ok".to_string()),
            success: Some(true),
            error: None,
            metadata: Some(json!({
                "tool_family": "skill",
                "skill_name": "project:capability-report",
                "workspace_skill_source": {
                    "workspaceRoot": "/tmp/work",
                    "source": "manual_session_enable",
                    "approval": "manual",
                    "authorizationScope": "session",
                    "directory": "capability-report",
                    "registeredSkillDirectory": "/tmp/work/.agents/skills/capability-report",
                    "skillName": "project:capability-report",
                    "sourceDraftId": "capdraft-1",
                    "sourceVerificationReportId": "capver-1",
                    "permissionSummary": ["Level 0 只读发现"]
                },
                "workspace_skill_runtime_enable": {
                    "source": "manual_session_enable",
                    "approval": "manual",
                    "authorization_scope": "session",
                    "workspace_root": "/tmp/work",
                    "directory": "capability-report",
                    "skill": "project:capability-report",
                    "registered_skill_directory": "/tmp/work/.agents/skills/capability-report",
                    "source_draft_id": "capdraft-1",
                    "source_verification_report_id": "capver-1",
                    "permission_summary": ["Level 0 只读发现"]
                }
            })),
        },
    });

    let timeline = build_timeline_json(&detail, "2026-05-06T10:01:00Z").expect("timeline json");
    let value = serde_json::from_str::<Value>(&timeline).expect("parse timeline");
    let tool_item = value["items"]
        .as_array()
        .and_then(|items| {
            items.iter().find(|item| {
                item.get("id").and_then(Value::as_str) == Some("workspace-skill-tool-1")
            })
        })
        .expect("workspace skill timeline item");

    assert_eq!(
        tool_item.pointer("/workspaceSkillToolCall/toolName"),
        Some(&json!("project:capability-report"))
    );
    assert_eq!(
        tool_item.pointer("/workspaceSkillToolCall/workspaceSkillSource/sourceDraftId"),
        Some(&json!("capdraft-1"))
    );
    assert_eq!(
        tool_item.pointer("/workspaceSkillToolCall/workspaceSkillRuntimeEnable/source_draft_id"),
        Some(&json!("capdraft-1"))
    );
    assert_eq!(
        tool_item.pointer("/workspaceSkillToolCall/workspaceSkillSource/authorizationScope"),
        Some(&json!("session"))
    );
}

#[test]
fn evidence_pack_should_export_automation_owner_agent_envelope_metadata() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    detail.items.push(AgentThreadItem {
        id: "workspace-skill-tool-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-05-06T10:00:40Z".to_string(),
        completed_at: Some("2026-05-06T10:00:41Z".to_string()),
        updated_at: "2026-05-06T10:00:41Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "project:capability-report".to_string(),
            arguments: Some(json!({
                "input": "daily report"
            })),
            output: Some("ok".to_string()),
            success: Some(true),
            error: None,
            metadata: Some(json!({
                "workspace_skill_source": {
                    "workspaceRoot": "/tmp/work",
                    "authorizationScope": "session",
                    "sourceDraftId": "capdraft-1"
                },
                "workspace_skill_runtime_enable": {
                    "source": "agent_envelope_scheduled_run",
                    "skill": "project:capability-report",
                    "source_draft_id": "capdraft-1"
                }
            })),
        },
    });
    let thread_read = build_thread_read();
    let owner_runs = vec![build_completion_audit_owner_run(
        AgentRunStatus::Success,
        Some(build_completion_audit_owner_metadata()),
    )];

    let export_result = export_runtime_evidence_pack_with_owner_runs(
        &detail,
        &thread_read,
        temp_dir.path(),
        &owner_runs,
    )
    .expect("export");
    assert_eq!(
        export_result.completion_audit_summary.pointer("/decision"),
        Some(&json!("completed"))
    );

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime = fs::read_to_string(runtime_path).expect("runtime");
    let runtime = serde_json::from_str::<Value>(&runtime).expect("runtime json");

    assert_eq!(runtime.pointer("/automationOwners/count"), Some(&json!(1)));
    assert_eq!(
        runtime.pointer("/automationOwners/runs/0/sourceRef"),
        Some(&json!("job-1"))
    );
    assert_eq!(
        runtime.pointer("/automationOwners/runs/0/agentEnvelope/source_draft_id"),
        Some(&json!("capdraft-1"))
    );
    assert_eq!(
        runtime.pointer("/automationOwners/runs/0/managedObjective/owner_type"),
        Some(&json!("automation_job"))
    );
    assert_eq!(
        runtime.pointer("/automationOwners/runs/0/workspaceSkillRuntimeEnable/bindings/0/skill"),
        Some(&json!("project:capability-report"))
    );
    assert_eq!(
        runtime.pointer("/automationOwners/runs/0/completionAudit/status"),
        Some(&json!("audit_input_ready"))
    );
    assert_eq!(
        runtime.pointer("/automationOwners/runs/0/completionAudit/completionDecision"),
        Some(&json!("not_completed"))
    );
    assert_eq!(
        runtime.pointer(
            "/automationOwners/runs/0/completionAudit/evidenceInputs/workspaceSkillRuntimeEnable"
        ),
        Some(&json!(true))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/decision"),
        Some(&json!("completed"))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/requiredEvidence/automationOwner"),
        Some(&json!(true))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/requiredEvidence/workspaceSkillToolCall"),
        Some(&json!(true))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/requiredEvidence/artifactOrTimeline"),
        Some(&json!(true))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/requiredEvidence/controlledGetEvidence"),
        Some(&json!(false))
    );

    let artifacts_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/artifacts.json");
    let artifacts = fs::read_to_string(artifacts_path).expect("artifacts");
    let artifacts = serde_json::from_str::<Value>(&artifacts).expect("artifacts json");

    assert_eq!(
        artifacts.pointer("/completionAuditSummary/decision"),
        Some(&json!("completed"))
    );

    let summary_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/summary.md");
    let summary = fs::read_to_string(summary_path).expect("summary");
    assert!(summary.contains("## Completion Audit"));
    assert!(summary.contains("- 判定：`completed`"));
    assert!(summary.contains("- Workspace Skill ToolCall evidence：1"));
}

#[test]
fn evidence_pack_should_project_controlled_get_evidence_without_sensitive_values() {
    let temp_dir = TempDir::new().expect("temp dir");
    let detail = build_detail();
    let mut thread_read = build_thread_read();
    if let Some(permission_state) = thread_read.permission_state.as_mut() {
        permission_state.confirmation_status = Some("resolved".to_string());
        permission_state.confirmation_request_id = Some("approval-resolved".to_string());
    }
    write_controlled_get_evidence_fixture(temp_dir.path(), "session-1");
    write_controlled_get_evidence_fixture(temp_dir.path(), "other-session");

    export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime_raw = fs::read_to_string(runtime_path).expect("runtime");
    assert!(!runtime_raw.contains("https://api.example.com/secret"));
    assert!(!runtime_raw.contains("secret-token"));
    assert!(!runtime_raw.contains("{\\\"ok\\\":true}"));
    let runtime = serde_json::from_str::<Value>(&runtime_raw).expect("runtime json");
    assert_eq!(
        runtime.pointer("/capabilityDraftControlledGetEvidence/artifactCount"),
        Some(&json!(1))
    );
    assert_eq!(
        runtime.pointer("/capabilityDraftControlledGetEvidence/artifacts/0/requestUrlHash"),
        Some(&json!("request-url-hash-fixture"))
    );
    assert_eq!(
        runtime.pointer(
            "/capabilityDraftControlledGetEvidence/artifacts/0/safety/containsEndpointValue"
        ),
        Some(&json!(false))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/requiredEvidence/controlledGetEvidence"),
        Some(&json!(true))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/controlledGetEvidenceExecutedCount"),
        Some(&json!(1))
    );

    let artifacts_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/artifacts.json");
    let artifacts = fs::read_to_string(artifacts_path).expect("artifacts");
    assert!(artifacts.contains("\"capabilityDraftControlledGetEvidence\""));
    assert!(artifacts.contains("\"response_preview_sha256\""));
    assert!(!artifacts.contains("https://api.example.com/secret"));
    assert!(!artifacts.contains("secret-token"));
    assert!(!artifacts.contains("{\\\"ok\\\":true}"));

    let summary_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/summary.md");
    let summary = fs::read_to_string(summary_path).expect("summary");
    assert!(summary.contains("- 受控 GET evidence：1"));
    assert!(summary.contains("- 受控 GET evidence artifact：1"));
}

#[test]
fn evidence_pack_should_complete_readonly_http_policy_only_with_controlled_get_evidence() {
    let mut detail = build_detail();
    add_successful_workspace_skill_tool_call(&mut detail);
    let thread_read = build_thread_read();
    let owner_runs = vec![build_completion_audit_owner_run(
        AgentRunStatus::Success,
        Some(build_completion_audit_owner_metadata_requiring_controlled_get()),
    )];

    let missing_evidence_dir = TempDir::new().expect("missing evidence temp dir");
    let missing_result = export_runtime_evidence_pack_with_owner_runs(
        &detail,
        &thread_read,
        missing_evidence_dir.path(),
        &owner_runs,
    )
    .expect("export without controlled get evidence");
    assert_eq!(
        missing_result.completion_audit_summary.pointer("/decision"),
        Some(&json!("verifying"))
    );
    assert_eq!(
        missing_result
            .completion_audit_summary
            .pointer("/controlledGetEvidenceRequired"),
        Some(&json!(true))
    );
    assert!(missing_result
        .completion_audit_summary
        .pointer("/blockingReasons")
        .and_then(Value::as_array)
        .expect("blocking reasons")
        .contains(&json!("missing_controlled_get_evidence")));

    let completed_dir = TempDir::new().expect("completed evidence temp dir");
    write_controlled_get_evidence_fixture(completed_dir.path(), "session-1");
    let completed_result = export_runtime_evidence_pack_with_owner_runs(
        &detail,
        &thread_read,
        completed_dir.path(),
        &owner_runs,
    )
    .expect("export with controlled get evidence");
    assert_eq!(
        completed_result
            .completion_audit_summary
            .pointer("/decision"),
        Some(&json!("completed"))
    );
    assert_eq!(
        completed_result
            .completion_audit_summary
            .pointer("/requiredEvidence/controlledGetEvidence"),
        Some(&json!(true))
    );

    let runtime_path = completed_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime_raw = fs::read_to_string(runtime_path).expect("runtime");
    assert!(!runtime_raw.contains("https://api.example.com/secret"));
    assert!(!runtime_raw.contains("secret-token"));
    assert!(!runtime_raw.contains("{\\\"ok\\\":true}"));
    let runtime = serde_json::from_str::<Value>(&runtime_raw).expect("runtime json");
    assert_eq!(
        runtime.pointer("/completionAuditSummary/decision"),
        Some(&json!("completed"))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/controlledGetEvidenceRequired"),
        Some(&json!(true))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/controlledGetEvidenceExecutedCount"),
        Some(&json!(1))
    );
    assert_eq!(
        runtime.pointer("/capabilityDraftControlledGetEvidence/artifactCount"),
        Some(&json!(1))
    );

    let summary_path = completed_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/summary.md");
    let summary = fs::read_to_string(summary_path).expect("summary");
    assert!(summary.contains("- 判定：`completed`"));
    assert!(summary.contains("- 受控 GET evidence：1 / 1 executed"));
}

#[test]
fn skill_forge_p5_readonly_report_artifact_should_complete_agent_envelope_audit() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    detail.name = "P5 只读 CLI 每日报告".to_string();
    if let AgentThreadItemPayload::FileArtifact { path, metadata, .. } =
        &mut detail.items[1].payload
    {
        *path = ".lime/artifacts/thread-1/daily-readonly-cli-report.md".to_string();
        *metadata = Some(json!({
            "source": "skill_forge_p5_prompt_to_artifact_smoke",
            "artifactKind": "markdown_report",
            "permissionLevel": "read_only",
            "title": "只读 CLI 每日报告"
        }));
    }
    detail.items.push(AgentThreadItem {
        id: "workspace-skill-tool-p5".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-05-06T10:00:40Z".to_string(),
        completed_at: Some("2026-05-06T10:00:41Z".to_string()),
        updated_at: "2026-05-06T10:00:41Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "project:capability-report".to_string(),
            arguments: Some(json!({
                "topic": "AI Agent adoption",
                "fixture_path": "tests/fixture.json"
            })),
            output: Some("已生成 Markdown 趋势摘要。".to_string()),
            success: Some(true),
            error: None,
            metadata: Some(json!({
                "workspace_skill_source": {
                    "workspaceRoot": "/tmp/work",
                    "authorizationScope": "session",
                    "directory": "capability-report",
                    "registeredSkillDirectory": "/tmp/work/.agents/skills/capability-report",
                    "skillName": "project:capability-report",
                    "sourceDraftId": "capdraft-1",
                    "sourceVerificationReportId": "capver-1",
                    "permissionSummary": ["Level 0 只读发现"]
                },
                "workspace_skill_runtime_enable": {
                    "source": "agent_envelope_scheduled_run",
                    "approval": "manual",
                    "authorization_scope": "session",
                    "workspace_root": "/tmp/work",
                    "directory": "capability-report",
                    "skill": "project:capability-report",
                    "registered_skill_directory": "/tmp/work/.agents/skills/capability-report",
                    "source_draft_id": "capdraft-1",
                    "source_verification_report_id": "capver-1",
                    "permission_summary": ["Level 0 只读发现"]
                }
            })),
        },
    });
    let owner_runs = vec![build_completion_audit_owner_run(
        AgentRunStatus::Success,
        Some(build_completion_audit_owner_metadata()),
    )];

    let export_result = export_runtime_evidence_pack_with_owner_runs(
        &detail,
        &build_thread_read(),
        temp_dir.path(),
        &owner_runs,
    )
    .expect("export");

    assert_eq!(
        export_result.completion_audit_summary.pointer("/decision"),
        Some(&json!("completed"))
    );
    assert_eq!(
        export_result
            .completion_audit_summary
            .pointer("/requiredEvidence/automationOwner"),
        Some(&json!(true))
    );
    assert_eq!(
        export_result
            .completion_audit_summary
            .pointer("/requiredEvidence/workspaceSkillToolCall"),
        Some(&json!(true))
    );
    assert_eq!(
        export_result
            .completion_audit_summary
            .pointer("/requiredEvidence/artifactOrTimeline"),
        Some(&json!(true))
    );

    let artifacts_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/artifacts.json");
    let artifacts = fs::read_to_string(artifacts_path).expect("artifacts");
    let artifacts = serde_json::from_str::<Value>(&artifacts).expect("artifacts json");
    assert_eq!(
        artifacts.pointer("/recentArtifacts/0"),
        Some(&json!(
            ".lime/artifacts/thread-1/daily-readonly-cli-report.md"
        ))
    );

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime = fs::read_to_string(runtime_path).expect("runtime");
    let runtime = serde_json::from_str::<Value>(&runtime).expect("runtime json");
    assert_eq!(
        runtime.pointer("/automationOwners/runs/0/completionAudit/status"),
        Some(&json!("audit_input_ready"))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/decision"),
        Some(&json!("completed"))
    );

    let timeline_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/timeline.json");
    let timeline = fs::read_to_string(timeline_path).expect("timeline");
    let timeline = serde_json::from_str::<Value>(&timeline).expect("timeline json");
    let tool_item = timeline["items"]
        .as_array()
        .and_then(|items| {
            items.iter().find(|item| {
                item.get("id").and_then(Value::as_str) == Some("workspace-skill-tool-p5")
            })
        })
        .expect("workspace skill timeline item");
    assert_eq!(
        tool_item.pointer("/workspaceSkillToolCall/workspaceSkillSource/sourceDraftId"),
        Some(&json!("capdraft-1"))
    );
}

#[test]
fn completion_audit_summary_should_classify_negative_paths() {
    let detail = build_detail();
    let recent_artifacts = vec![".lime/artifacts/thread-1/report.md".to_string()];
    let controlled_get_evidence = RuntimeCapabilityDraftControlledGetEvidenceSummary::default();

    let missing_owner = build_completion_audit_summary_json(
        &[],
        &detail,
        &recent_artifacts,
        &controlled_get_evidence,
    );
    assert_eq!(
        missing_owner.pointer("/decision"),
        Some(&json!("needs_input"))
    );
    assert!(missing_owner["blockingReasons"]
        .as_array()
        .expect("blocking reasons")
        .contains(&json!("missing_automation_owner")));

    let blocked_run = build_completion_audit_summary_json(
        &[build_completion_audit_owner_run(
            AgentRunStatus::Error,
            Some(build_completion_audit_owner_metadata()),
        )],
        &detail,
        &recent_artifacts,
        &controlled_get_evidence,
    );
    assert_eq!(blocked_run.pointer("/decision"), Some(&json!("blocked")));
    assert!(blocked_run["blockingReasons"]
        .as_array()
        .expect("blocking reasons")
        .contains(&json!("blocked_by_automation_owner_run_status")));

    let missing_inputs = build_completion_audit_summary_json(
        &[build_completion_audit_owner_run(
            AgentRunStatus::Success,
            None,
        )],
        &detail,
        &recent_artifacts,
        &controlled_get_evidence,
    );
    assert_eq!(
        missing_inputs.pointer("/decision"),
        Some(&json!("needs_input"))
    );
    assert!(missing_inputs["blockingReasons"]
        .as_array()
        .expect("blocking reasons")
        .contains(&json!("missing_automation_owner_audit_inputs")));

    let missing_tool_evidence = build_completion_audit_summary_json(
        &[build_completion_audit_owner_run(
            AgentRunStatus::Success,
            Some(build_completion_audit_owner_metadata()),
        )],
        &detail,
        &recent_artifacts,
        &controlled_get_evidence,
    );
    assert_eq!(
        missing_tool_evidence.pointer("/decision"),
        Some(&json!("verifying"))
    );
    assert_eq!(
        missing_tool_evidence.pointer("/requiredEvidence/workspaceSkillToolCall"),
        Some(&json!(false))
    );
    assert!(missing_tool_evidence["blockingReasons"]
        .as_array()
        .expect("blocking reasons")
        .contains(&json!("missing_workspace_skill_tool_call_evidence")));
}

fn build_executed_controlled_get_evidence_summary_fixture(
) -> RuntimeCapabilityDraftControlledGetEvidenceSummary {
    RuntimeCapabilityDraftControlledGetEvidenceSummary {
        scanned_artifact_count: 1,
        skipped_unsafe_artifact_count: 0,
        artifacts: vec![json!({
            "artifactId": "controlled-get-fixture-session-1",
            "artifactKind": "capability_draft_controlled_get_evidence",
            "relativePath": ".lime/capability-drafts/controlled-get-evidence/controlled-get-fixture-session-1.json",
            "contentSha256": "content-sha256-fixture",
            "status": "executed",
            "requestUrlHash": "request-url-hash-fixture",
            "responseSha256": "response-sha256-fixture",
            "networkRequestSent": true,
            "responseCaptured": true,
            "endpointValue": "https://api.example.com/secret",
            "tokenValue": "secret-token",
            "responsePreview": "{\"ok\":true}"
        })],
    }
}

fn add_successful_workspace_skill_tool_call(detail: &mut SessionDetail) {
    detail.items.push(AgentThreadItem {
        id: "workspace-skill-tool-controlled-get".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-05-06T10:00:40Z".to_string(),
        completed_at: Some("2026-05-06T10:00:41Z".to_string()),
        updated_at: "2026-05-06T10:00:41Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "project:capability-report".to_string(),
            arguments: Some(json!({
                "input": "readonly api report"
            })),
            output: Some("ok".to_string()),
            success: Some(true),
            error: None,
            metadata: Some(json!({
                "workspace_skill_source": {
                    "sourceDraftId": "capdraft-1",
                    "sourceVerificationReportId": "capver-1"
                },
                "workspace_skill_runtime_enable": {
                    "source": "agent_envelope_scheduled_run",
                    "skill": "project:capability-report"
                }
            })),
        },
    });
}

#[test]
fn completion_audit_should_track_controlled_get_evidence_without_completing_alone() {
    let mut detail = build_detail();
    detail.items.retain(|item| {
        !matches!(item.payload, AgentThreadItemPayload::FileArtifact { .. })
            && !matches!(item.payload, AgentThreadItemPayload::ToolCall { .. })
    });
    let recent_artifacts = Vec::<String>::new();
    let controlled_get_evidence = build_executed_controlled_get_evidence_summary_fixture();

    let summary = build_completion_audit_summary_json(
        &[build_completion_audit_owner_run(
            AgentRunStatus::Success,
            Some(build_completion_audit_owner_metadata()),
        )],
        &detail,
        &recent_artifacts,
        &controlled_get_evidence,
    );

    assert_eq!(summary.pointer("/decision"), Some(&json!("verifying")));
    assert_eq!(
        summary.pointer("/controlledGetEvidenceArtifactCount"),
        Some(&json!(1))
    );
    assert_eq!(
        summary.pointer("/controlledGetEvidenceExecutedCount"),
        Some(&json!(1))
    );
    assert_eq!(
        summary.pointer("/controlledGetEvidenceStatusCounts/executed"),
        Some(&json!(1))
    );
    assert_eq!(
        summary.pointer("/requiredEvidence/controlledGetEvidence"),
        Some(&json!(true))
    );
    assert_eq!(
        summary.pointer("/requiredEvidence/workspaceSkillToolCall"),
        Some(&json!(false))
    );
    assert!(summary["blockingReasons"]
        .as_array()
        .expect("blocking reasons")
        .contains(&json!("missing_workspace_skill_tool_call_evidence")));

    let serialized = serde_json::to_string(&summary).expect("serialize completion audit summary");
    assert!(!serialized.contains("https://api.example.com/secret"));
    assert!(!serialized.contains("secret-token"));
    assert!(!serialized.contains("{\"ok\":true}"));
}

#[test]
fn completion_audit_should_require_controlled_get_evidence_when_owner_declares_policy() {
    let mut detail = build_detail();
    add_successful_workspace_skill_tool_call(&mut detail);
    let recent_artifacts = vec![".lime/artifacts/thread-1/report.md".to_string()];

    let missing_controlled_get = build_completion_audit_summary_json(
        &[build_completion_audit_owner_run(
            AgentRunStatus::Success,
            Some(build_completion_audit_owner_metadata_requiring_controlled_get()),
        )],
        &detail,
        &recent_artifacts,
        &RuntimeCapabilityDraftControlledGetEvidenceSummary::default(),
    );

    assert_eq!(
        missing_controlled_get.pointer("/decision"),
        Some(&json!("verifying"))
    );
    assert_eq!(
        missing_controlled_get.pointer("/controlledGetEvidenceRequired"),
        Some(&json!(true))
    );
    assert_eq!(
        missing_controlled_get.pointer("/requiredEvidence/controlledGetEvidence"),
        Some(&json!(false))
    );
    assert!(missing_controlled_get["blockingReasons"]
        .as_array()
        .expect("blocking reasons")
        .contains(&json!("missing_controlled_get_evidence")));

    let with_controlled_get = build_completion_audit_summary_json(
        &[build_completion_audit_owner_run(
            AgentRunStatus::Success,
            Some(build_completion_audit_owner_metadata_requiring_controlled_get()),
        )],
        &detail,
        &recent_artifacts,
        &build_executed_controlled_get_evidence_summary_fixture(),
    );

    assert_eq!(
        with_controlled_get.pointer("/decision"),
        Some(&json!("completed"))
    );
    assert_eq!(
        with_controlled_get.pointer("/controlledGetEvidenceRequired"),
        Some(&json!(true))
    );
    assert_eq!(
        with_controlled_get.pointer("/requiredEvidence/controlledGetEvidence"),
        Some(&json!(true))
    );
}

fn write_request_telemetry_fixture(root: &Path) {
    let request_logs_dir = root.join("request_logs");
    fs::create_dir_all(&request_logs_dir).expect("create request logs dir");

    let mut log = RequestLog::new(
        "req-log-1".to_string(),
        lime_core::ProviderType::OpenAI,
        "gpt-5.4".to_string(),
        false,
    );
    log.session_id = Some("session-1".to_string());
    log.thread_id = Some("thread-1".to_string());
    log.turn_id = Some("turn-1".to_string());
    log.pending_request_id = Some("req-1".to_string());
    log.queued_turn_id = Some("queued-1".to_string());
    log.mark_success(420, 200);
    log.set_tokens(Some(128), Some(64));

    fs::write(
        request_logs_dir.join("requests_2026-03-27.jsonl"),
        format!(
            "{}\n",
            serde_json::to_string(&log).expect("serialize request log")
        ),
    )
    .expect("write request log");
}

fn write_unmatched_request_telemetry_fixture(root: &Path) {
    let request_logs_dir = root.join("request_logs");
    fs::create_dir_all(&request_logs_dir).expect("create request logs dir");

    let mut log = RequestLog::new(
        "req-log-unmatched".to_string(),
        lime_core::ProviderType::Anthropic,
        "claude-sonnet-4.5".to_string(),
        false,
    );
    log.session_id = Some("other-session".to_string());
    log.thread_id = Some("other-thread".to_string());
    log.turn_id = Some("other-turn".to_string());
    log.mark_success(180, 200);

    fs::write(
        request_logs_dir.join("requests_2026-03-28.jsonl"),
        format!(
            "{}\n",
            serde_json::to_string(&log).expect("serialize unmatched request log")
        ),
    )
    .expect("write unmatched request log");
}

#[test]
fn permission_state_signal_coverage_should_surface_denied_confirmation_as_blocked() {
    let mut thread_read = build_thread_read();
    let mut permission_state = thread_read
        .permission_state
        .clone()
        .expect("permission state");
    permission_state.confirmation_status = Some("denied".to_string());
    permission_state.confirmation_request_id = Some("approval-denied".to_string());
    permission_state.confirmation_source = Some("runtime_action_required".to_string());
    thread_read.permission_state = Some(permission_state);

    let coverage = permission_state_signal_coverage(&thread_read);

    assert_eq!(coverage.signal, "permissionState");
    assert_eq!(coverage.status, "blocked");
    assert!(coverage.detail.contains("approval-denied"));
    assert!(coverage.detail.contains("真实权限确认已被拒绝"));
}

#[test]
fn permission_state_signal_coverage_should_surface_resolved_confirmation_as_exported() {
    let mut thread_read = build_thread_read();
    let mut permission_state = thread_read
        .permission_state
        .clone()
        .expect("permission state");
    permission_state.confirmation_status = Some("resolved".to_string());
    permission_state.confirmation_request_id = Some("approval-resolved".to_string());
    permission_state.confirmation_source = Some("runtime_action_required".to_string());
    thread_read.permission_state = Some(permission_state);

    let coverage = permission_state_signal_coverage(&thread_read);

    assert_eq!(coverage.signal, "permissionState");
    assert_eq!(coverage.status, "exported");
    assert!(coverage.detail.contains("approval-resolved"));
    assert!(coverage.detail.contains("真实权限确认已通过"));
}

#[test]
fn permission_state_signal_coverage_should_surface_not_requested_confirmation_as_blocked() {
    let thread_read = build_thread_read();

    let coverage = permission_state_signal_coverage(&thread_read);

    assert_eq!(coverage.signal, "permissionState");
    assert_eq!(coverage.status, "blocked");
    assert!(coverage.detail.contains("尚未发起 ApprovalRequest"));
    assert!(coverage.detail.contains("read_files"));
    assert!(coverage.detail.contains("write_artifacts"));
}

#[test]
fn permission_state_signal_coverage_should_surface_requested_confirmation_as_blocked() {
    let mut thread_read = build_thread_read();
    let mut permission_state = thread_read
        .permission_state
        .clone()
        .expect("permission state");
    permission_state.confirmation_status = Some("requested".to_string());
    permission_state.confirmation_request_id = Some("approval-pending".to_string());
    permission_state.confirmation_source = Some("runtime_action_required".to_string());
    thread_read.permission_state = Some(permission_state);

    let coverage = permission_state_signal_coverage(&thread_read);

    assert_eq!(coverage.signal, "permissionState");
    assert_eq!(coverage.status, "blocked");
    assert!(coverage.detail.contains("真实权限确认正在等待处理"));
    assert!(coverage.detail.contains("approval-pending"));
}

#[test]
fn known_gaps_should_surface_denied_permission_confirmation() {
    let mut thread_read = build_thread_read();
    let mut permission_state = thread_read
        .permission_state
        .clone()
        .expect("permission state");
    permission_state.confirmation_status = Some("denied".to_string());
    permission_state.confirmation_request_id = Some("approval-denied".to_string());
    permission_state.confirmation_source = Some("runtime_action_required".to_string());
    thread_read.permission_state = Some(permission_state);

    let gaps = build_known_gaps(&[], &[], &thread_read);

    assert!(gaps.iter().any(|gap| gap.contains("approval-denied")));
    assert!(gaps.iter().any(|gap| gap.contains("权限确认已被拒绝")));
}

#[test]
fn known_gaps_should_surface_not_requested_permission_confirmation() {
    let thread_read = build_thread_read();

    let gaps = build_known_gaps(&[], &[], &thread_read);

    assert!(gaps
        .iter()
        .any(|gap| gap.contains("尚未发起 ApprovalRequest")));
    assert!(gaps.iter().any(|gap| gap.contains("read_files")));
}

#[test]
fn known_gaps_should_surface_user_locked_capability_gap() {
    let mut thread_read = build_thread_read();
    thread_read.permission_state = None;
    thread_read.capability_gap = Some("browser_reasoning_candidate_missing".to_string());
    thread_read.limit_state = Some(lime_agent::SessionExecutionRuntimeLimitState {
        status: "user_locked_capability_gap".to_string(),
        single_candidate_only: true,
        provider_locked: false,
        settings_locked: true,
        oem_locked: false,
        candidate_count: 1,
        capability_gap: Some("browser_reasoning_candidate_missing".to_string()),
        notes: vec!["显式模型锁定不满足 browser_reasoning routingSlot".to_string()],
    });

    let gaps = build_known_gaps(&[], &[], &thread_read);

    assert!(gaps.iter().any(|gap| gap.contains("显式用户模型锁定")));
    assert!(gaps
        .iter()
        .any(|gap| gap.contains("browser_reasoning_candidate_missing")));
}

#[test]
fn known_gaps_should_not_surface_resolved_permission_confirmation() {
    let mut thread_read = build_thread_read();
    let mut permission_state = thread_read
        .permission_state
        .clone()
        .expect("permission state");
    permission_state.confirmation_status = Some("resolved".to_string());
    permission_state.confirmation_request_id = Some("approval-resolved".to_string());
    permission_state.confirmation_source = Some("runtime_action_required".to_string());
    thread_read.permission_state = Some(permission_state);

    let gaps = build_known_gaps(&[], &[], &thread_read);

    assert!(!gaps.iter().any(|gap| gap.contains("approval-resolved")));
    assert!(!gaps.iter().any(|gap| gap.contains("权限确认已被拒绝")));
}

fn write_image_task_fixture(root: &Path, relative_path: &str) {
    let absolute_path = root.join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    fs::create_dir_all(
        absolute_path
            .parent()
            .expect("image task path should have parent"),
    )
    .expect("create image task dir");
    fs::write(
            absolute_path,
            serde_json::to_string_pretty(&json!({
                "task_id": "task-image-1",
                "task_type": "image_generate",
                "task_family": "image",
                "title": "城市夜景主视觉",
                    "summary": "城市夜景图片任务",
                    "payload": {
                        "prompt": "赛博朋克风城市夜景主视觉",
                        "provider_id": "openai",
                        "model": "gpt-image-1",
                        "modality_contract_key": IMAGE_GENERATION_CONTRACT_KEY,
                        "modality": "image",
                        "required_capabilities": ["text_generation", "image_generation", "vision_input"],
                        "routing_slot": IMAGE_GENERATION_ROUTING_SLOT,
                        "runtime_contract": {
                            "contract_key": IMAGE_GENERATION_CONTRACT_KEY,
                            "modality": "image",
                            "required_capabilities": ["text_generation", "image_generation", "vision_input"],
                            "routing_slot": IMAGE_GENERATION_ROUTING_SLOT,
                            "executor_binding": {
                                "executor_kind": "skill",
                                "binding_key": "image_generate"
                            },
                            "truth_source": ["image_task_artifact", "runtime_timeline_event"]
                        },
                        "title_generation_result": {
                            "title": "城市夜景主视觉",
                        "sessionId": "title-gen-1",
                        "usedFallback": false,
                        "fallbackReason": null,
                        "executionRuntime": {
                            "route": "auxiliary.generate_title",
                            "session_id": "title-gen-1",
                            "task_profile": {
                                "kind": "generation_topic",
                                "source": "auxiliary_generation_topic"
                            },
                            "routing_decision": {
                                "routingMode": "single_candidate",
                                "decisionSource": "service_model_setting",
                                "candidateCount": 1
                            },
                            "cost_state": {
                                "status": "estimated",
                                "estimatedCostClass": "low"
                            }
                        }
                    }
                },
                "status": "pending_submit",
                "normalized_status": "pending",
                "created_at": "2026-04-24T10:00:00Z",
                "updated_at": null,
                "submitted_at": null,
                "started_at": null,
                "completed_at": null,
                "cancelled_at": null,
                "idempotency_key": null,
                "retry_count": 0,
                "source_task_id": null,
                "result": null,
                "last_error": null,
                "current_attempt_id": "attempt-1",
                "attempts": [],
                "relationships": {},
                "progress": {},
                "ui_hints": {}
            }))
            .expect("serialize image task"),
        )
        .expect("write image task");
}

fn write_failed_image_contract_task_fixture(root: &Path, relative_path: &str) {
    let absolute_path = root.join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    fs::create_dir_all(
        absolute_path
            .parent()
            .expect("image task path should have parent"),
    )
    .expect("create image task dir");
    fs::write(
            absolute_path,
            serde_json::to_string_pretty(&json!({
                "task_id": "task-image-failed",
                "task_type": "image_generate",
                "task_family": "image",
                "title": "图片模型路由失败",
                "summary": "图片任务被 contract preflight 阻止",
                "payload": {
                    "prompt": "生成一张产品海报",
                    "provider_id": "openai",
                    "model": "gpt-5.2",
                    "model_capability_assessment": {
                        "model_id": "gpt-5.2",
                        "provider_id": "openai",
                        "source": "model_registry",
                        "supports_image_generation": false,
                        "reason": "registry_missing_image_generation_capability"
                    },
                    "modality_contract_key": IMAGE_GENERATION_CONTRACT_KEY,
                    "modality": "image",
                    "required_capabilities": ["text_generation", "image_generation", "vision_input"],
                    "routing_slot": IMAGE_GENERATION_ROUTING_SLOT,
                    "runtime_contract": {
                        "contract_key": IMAGE_GENERATION_CONTRACT_KEY,
                        "modality": "image",
                        "required_capabilities": ["text_generation", "image_generation", "vision_input"],
                        "routing_slot": IMAGE_GENERATION_ROUTING_SLOT,
                        "executor_binding": {
                            "executor_kind": "skill",
                            "binding_key": "image_generate"
                        },
                        "execution_profile": {
                            "profile_key": "image_generation_profile"
                        },
                        "executor_adapter": {
                            "adapter_key": "skill:image_generate"
                        },
                        "limecore_policy_refs": IMAGE_GENERATION_LIMECORE_POLICY_REFS,
                        "limecore_policy_snapshot": {
                            "status": LIMECORE_POLICY_SNAPSHOT_STATUS_LOCAL_DEFAULTS_EVALUATED,
                            "decision": LIMECORE_POLICY_DECISION_ALLOW,
                            "source": "modality_runtime_contract",
                            "decision_source": LIMECORE_POLICY_DECISION_SOURCE_LOCAL_DEFAULT,
                            "decision_scope": LIMECORE_POLICY_DECISION_SCOPE_LOCAL_DEFAULTS_ONLY,
                            "decision_reason": LIMECORE_POLICY_DECISION_REASON_NO_LOCAL_DENY,
                            "refs": IMAGE_GENERATION_LIMECORE_POLICY_REFS,
                            "evaluated_refs": [],
                            "unresolved_refs": IMAGE_GENERATION_LIMECORE_POLICY_REFS,
                            "missing_inputs": IMAGE_GENERATION_LIMECORE_POLICY_REFS,
                            "pending_hit_refs": IMAGE_GENERATION_LIMECORE_POLICY_REFS,
                            "policy_value_hits": [],
                            "policy_value_hit_count": 0,
                            "policy_evaluation": {
                                "status": "input_gap",
                                "decision": "ask",
                                "decision_source": LIMECORE_POLICY_DECISION_SOURCE_POLICY_INPUT_EVALUATOR,
                                "decision_scope": "pending_policy_inputs",
                                "decision_reason": LIMECORE_POLICY_DECISION_REASON_POLICY_INPUTS_MISSING,
                                "blocking_refs": [],
                                "ask_refs": IMAGE_GENERATION_LIMECORE_POLICY_REFS,
                                "pending_refs": IMAGE_GENERATION_LIMECORE_POLICY_REFS
                            }
                        },
                        "truth_source": ["image_task_artifact", "runtime_timeline_event"]
                    }
                },
                "status": "failed",
                "normalized_status": "failed",
                "created_at": "2026-04-24T10:00:00Z",
                "updated_at": "2026-04-24T10:00:05Z",
                "submitted_at": null,
                "started_at": null,
                "completed_at": "2026-04-24T10:00:05Z",
                "cancelled_at": null,
                "idempotency_key": null,
                "retry_count": 0,
                "source_task_id": null,
                "result": null,
                "last_error": {
                    "code": "image_generation_model_capability_gap",
                    "message": "image_generation contract 要求图片生成模型，但当前模型 gpt-5.2 看起来是文本模型。",
                    "retryable": false,
                    "stage": "routing",
                    "provider_code": null,
                    "occurred_at": "2026-04-24T10:00:05Z"
                },
                "current_attempt_id": "attempt-1",
                "attempts": [],
                "relationships": {},
                "progress": {},
                "ui_hints": {}
            }))
            .expect("serialize failed image task"),
        )
        .expect("write failed image task");
}

fn write_audio_task_fixture(root: &Path, relative_path: &str) {
    let absolute_path = root.join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    fs::create_dir_all(
        absolute_path
            .parent()
            .expect("audio task path should have parent"),
    )
    .expect("create audio task dir");
    fs::write(
        absolute_path,
        serde_json::to_string_pretty(&json!({
            "task_id": "task-audio-1",
            "task_type": "audio_generate",
            "task_family": "audio",
            "title": "发布旁白",
            "summary": "发布旁白音频任务",
            "payload": {
                "prompt": "请为这段文案生成温暖旁白",
                "source_text": "请为这段文案生成温暖旁白",
                "voice": "warm_narrator",
                "provider_id": "limecore",
                "model": "voice-pro",
                "entry_source": "at_voice_command",
                "modality_contract_key": VOICE_GENERATION_CONTRACT_KEY,
                "modality": "audio",
                "required_capabilities": ["text_generation", "voice_generation"],
                "routing_slot": VOICE_GENERATION_ROUTING_SLOT,
                "runtime_contract": {
                    "contract_key": VOICE_GENERATION_CONTRACT_KEY,
                    "modality": "audio",
                    "required_capabilities": ["text_generation", "voice_generation"],
                    "routing_slot": VOICE_GENERATION_ROUTING_SLOT,
                    "executor_binding": {
                        "executor_kind": "service_skill",
                        "binding_key": "voice_runtime"
                    },
                    "truth_source": ["audio_task_artifact", "runtime_timeline_event"]
                },
                "audio_output": {
                    "kind": "audio_output",
                    "status": "completed",
                    "audio_path": ".lime/runtime/audio/task-audio-1.mp3",
                    "mime_type": "audio/mpeg",
                    "duration_ms": 128000,
                    "source_text": "请为这段文案生成温暖旁白",
                    "voice": "warm_narrator",
                    "provider_id": "limecore",
                    "model": "voice-pro"
                }
            },
            "status": "succeeded",
            "normalized_status": "succeeded",
            "created_at": "2026-04-30T10:00:00Z",
            "updated_at": "2026-04-30T10:00:05Z",
            "submitted_at": null,
            "started_at": "2026-04-30T10:00:01Z",
            "completed_at": "2026-04-30T10:00:05Z",
            "cancelled_at": null,
            "idempotency_key": null,
            "retry_count": 0,
            "source_task_id": null,
            "result": {
                "kind": "audio_generation_result",
                "status": "completed",
                "audio_output": {
                    "kind": "audio_output",
                    "status": "completed",
                    "audio_path": ".lime/runtime/audio/task-audio-1.mp3",
                    "mime_type": "audio/mpeg",
                    "duration_ms": 128000,
                    "provider_id": "limecore",
                    "model": "voice-pro"
                }
            },
            "last_error": null,
            "current_attempt_id": "attempt-audio-1",
            "current_attempt_worker_id": "lime-audio-worker",
            "attempts": [],
            "relationships": {},
            "progress": {},
            "ui_hints": {}
        }))
        .expect("serialize audio task"),
    )
    .expect("write audio task");
}

fn write_transcription_task_fixture(root: &Path, relative_path: &str) {
    let absolute_path = root.join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    fs::create_dir_all(
        absolute_path
            .parent()
            .expect("transcription task path should have parent"),
    )
    .expect("create transcription task dir");
    fs::write(
        absolute_path,
        serde_json::to_string_pretty(&json!({
            "task_id": "task-transcription-1",
            "task_type": "transcription_generate",
            "task_family": "document",
            "title": "会议转写",
            "summary": "会议音频转写任务",
            "payload": {
                "prompt": "生成逐字稿",
                "source_path": "/tmp/interview.wav",
                "language": "zh-CN",
                "output_format": "srt",
                "speaker_labels": true,
                "timestamps": true,
                "provider_id": "limecore",
                "model": "asr-pro",
                "entry_source": "at_transcription_command",
                "modality_contract_key": AUDIO_TRANSCRIPTION_CONTRACT_KEY,
                "modality": "audio",
                "required_capabilities": ["text_generation", "audio_transcription"],
                "routing_slot": AUDIO_TRANSCRIPTION_ROUTING_SLOT,
                "runtime_contract": {
                    "contract_key": AUDIO_TRANSCRIPTION_CONTRACT_KEY,
                    "modality": "audio",
                    "required_capabilities": ["text_generation", "audio_transcription"],
                    "routing_slot": AUDIO_TRANSCRIPTION_ROUTING_SLOT,
                    "executor_binding": {
                        "executor_kind": "skill",
                        "binding_key": "transcription_generate"
                    },
                    "truth_source": ["transcript_artifact", "runtime_timeline_event"]
                },
                "transcript": {
                    "kind": "transcript",
                    "status": "pending",
                    "source_path": "/tmp/interview.wav",
                    "language": "zh-CN",
                    "output_format": "srt",
                    "speaker_labels": true,
                    "timestamps": true,
                    "provider_id": "limecore",
                    "model": "asr-pro"
                }
            },
            "status": "pending_submit",
            "normalized_status": "pending",
            "created_at": "2026-04-30T10:00:00Z",
            "updated_at": "2026-04-30T10:00:05Z",
            "submitted_at": null,
            "started_at": null,
            "completed_at": null,
            "cancelled_at": null,
            "idempotency_key": null,
            "retry_count": 0,
            "source_task_id": null,
            "result": null,
            "last_error": null,
            "current_attempt_id": "attempt-transcription-1",
            "current_attempt_worker_id": "lime-transcription-worker",
            "attempts": [],
            "relationships": {},
            "progress": {},
            "ui_hints": {}
        }))
        .expect("serialize transcription task"),
    )
    .expect("write transcription task");
}

#[allow(dead_code)]
fn write_auxiliary_runtime_projection_fixture(
    root: &Path,
    relative_path: &str,
    projection_kind: &str,
) {
    let absolute_path = root.join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    fs::create_dir_all(
        absolute_path
            .parent()
            .expect("auxiliary projection path should have parent"),
    )
    .expect("create auxiliary projection dir");

    let document = if projection_kind == "persona_generation" {
        json!({
            "schemaVersion": 1,
            "artifactType": "auxiliary_runtime_projection",
            "projectionKind": "persona_generation",
            "source": "auxiliary.generate_persona",
            "parentSessionId": "session-1",
            "auxiliarySessionId": "persona-gen-1",
            "executionRuntime": {
                "route": "auxiliary.generate_persona",
                "session_id": "persona-gen-1",
                "source": "runtime_snapshot",
                "task_profile": {
                    "kind": "agent_meta",
                    "source": "auxiliary_agent_meta"
                },
                "routing_decision": {
                    "routingMode": "single_candidate",
                    "decisionSource": "service_model_setting",
                    "candidateCount": 1
                },
                "cost_state": {
                    "status": "estimated",
                    "estimatedCostClass": "low"
                }
            },
            "personaGenerationResult": {
                "sessionId": "persona-gen-1",
                "persona": {
                    "name": "理性产品经理",
                    "description": "强调问题拆解与收益平衡",
                    "style": "结构化",
                    "tone": "克制",
                    "targetAudience": "团队负责人",
                    "forbiddenWords": ["绝对"],
                    "preferredWords": ["权衡"]
                }
            }
        })
    } else {
        json!({
            "schemaVersion": 1,
            "artifactType": "auxiliary_runtime_projection",
            "projectionKind": "title_generation",
            "source": "auxiliary.title_generation_result",
            "parentSessionId": "session-1",
            "auxiliarySessionId": "title-gen-2",
            "executionRuntime": {
                "route": "auxiliary.generate_title",
                "session_id": "title-gen-2",
                "source": "runtime_snapshot",
                "task_profile": {
                    "kind": "topic",
                    "source": "auxiliary_title_generation"
                },
                "routing_decision": {
                    "routingMode": "single_candidate",
                    "decisionSource": "service_model_setting",
                    "candidateCount": 1
                },
                "cost_state": {
                    "status": "estimated",
                    "estimatedCostClass": "low"
                }
            },
            "titleGenerationResult": {
                "title": "多模型调度方案",
                "sessionId": "title-gen-2",
                "usedFallback": false,
                "fallbackReason": null
            }
        })
    };

    fs::write(
        absolute_path,
        serde_json::to_string_pretty(&document).expect("serialize auxiliary projection"),
    )
    .expect("write auxiliary projection");
}

#[test]
fn should_export_runtime_evidence_pack_to_workspace() {
    let temp_dir = TempDir::new().expect("temp dir");
    let detail = build_detail();
    let mut thread_read = build_thread_read();
    if let Some(permission_state) = thread_read.permission_state.as_mut() {
        permission_state.confirmation_status = Some("resolved".to_string());
        permission_state.confirmation_request_id = Some("approval-resolved".to_string());
        permission_state.confirmation_source = Some("runtime_action_required".to_string());
    }
    write_request_telemetry_fixture(temp_dir.path());

    let result =
        export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    assert_eq!(
        result.pack_relative_root,
        ".lime/harness/sessions/session-1/evidence"
    );
    assert_eq!(result.artifacts.len(), 4);
    assert_eq!(result.turn_count, 1);
    assert_eq!(result.item_count, 3);
    assert_eq!(result.pending_request_count, 1);
    assert_eq!(result.queued_turn_count, 1);
    assert_eq!(result.recent_artifact_count, 1);
    assert!(result.known_gaps.is_empty());
    assert_eq!(
        result
            .observability_summary
            .get("schemaVersion")
            .and_then(Value::as_str),
        Some("v1")
    );

    let summary_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/summary.md");
    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let timeline_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/timeline.json");
    let artifacts_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/artifacts.json");

    assert!(summary_path.exists());
    assert!(runtime_path.exists());
    assert!(timeline_path.exists());
    assert!(artifacts_path.exists());

    let summary = fs::read_to_string(summary_path).expect("summary");
    assert!(summary.contains("问题证据包"));
    assert!(summary.contains("等待用户确认是否导出问题证据包"));
    assert!(summary.contains("证据关联与可观测覆盖"));
    assert!(summary.contains("requestTelemetry"));
    assert!(!summary.contains("artifactValidator"));
    assert!(!summary.contains("browserVerification"));
    assert!(!summary.contains("guiSmoke"));

    let runtime = fs::read_to_string(runtime_path).expect("runtime");
    assert!(runtime.contains("\"sessionId\": \"session-1\""));
    assert!(runtime.contains("\"pendingRequestCount\": 1"));
    assert!(runtime.contains("\"observabilitySummary\""));
    assert!(runtime.contains("\"permissionState\""));
    assert!(runtime.contains("\"status\": \"requires_confirmation\""));
    assert!(runtime.contains("\"askProfileKeys\""));
    assert!(runtime.contains("\"fileCheckpointCount\": 1"));
    assert!(runtime.contains("\"fileCheckpoints\""));
    assert!(runtime.contains("\"checkpoint_id\": \"artifact-1\""));
    assert!(runtime.contains("\"path\": \".lime/artifacts/thread-1/report.md\""));
    assert!(runtime.contains("\"requestTelemetry\""));
    assert!(runtime.contains("\"matchedRequestCount\": 1"));
    assert!(!runtime.contains("\"verificationSummary\""));
    assert!(!runtime.contains("\"artifactValidator\""));
    assert!(!runtime.contains("\"browserVerification\""));
    assert!(!runtime.contains("\"guiSmoke\""));

    let timeline = fs::read_to_string(timeline_path).expect("timeline");
    assert!(timeline.contains("\"payloadKind\": \"plan\""));
    assert!(timeline.contains("\"status\": \"completed\""));

    let artifacts = fs::read_to_string(artifacts_path).expect("artifacts");
    assert!(artifacts.contains("\"observabilitySummary\""));
    assert!(artifacts.contains("\"telemetry\""));
    assert!(artifacts.contains("\"permissionState\""));
    assert!(artifacts.contains("\"fileCheckpointCount\": 1"));
    assert!(artifacts.contains("\"fileCheckpoints\""));
    assert!(artifacts.contains("\"checkpoint_id\": \"artifact-1\""));
    assert!(artifacts.contains("\"matchedRequestCount\": 1"));
    assert!(!artifacts.contains("\"verification\""));
}

#[test]
fn evidence_pack_summary_markdown_should_follow_requested_locale() {
    let temp_dir = TempDir::new().expect("temp dir");
    let detail = build_detail();
    let mut thread_read = build_thread_read();
    if let Some(permission_state) = thread_read.permission_state.as_mut() {
        permission_state.confirmation_status = Some("resolved".to_string());
        permission_state.confirmation_request_id = Some("approval-resolved".to_string());
        permission_state.confirmation_source = Some("runtime_action_required".to_string());
    }

    let result = export_runtime_evidence_pack_with_owner_runs_and_locale(
        &detail,
        &thread_read,
        temp_dir.path(),
        &[],
        Some("en-US"),
    )
    .expect("export");

    assert_eq!(result.artifacts[0].title, "Issue Summary");

    let summary_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/summary.md");
    let summary = fs::read_to_string(summary_path).expect("summary");

    assert!(summary.contains("# Issue Evidence Pack"));
    assert!(summary.contains("Evidence Correlation and Observability Coverage"));
    assert!(summary.contains("Recommended Reading Order"));
    assert!(!summary.contains("## 建议读取顺序"));
}

#[test]
fn evidence_runtime_should_export_agent_runtime_profile_spine() {
    let temp_dir = TempDir::new().expect("temp dir");
    let detail = build_detail();
    let thread_read = build_thread_read();

    let result =
        export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    assert_eq!(
        result
            .observability_summary
            .pointer("/correlation/runtimeId")
            .and_then(Value::as_str),
        Some(LIME_AGENT_RUNTIME_ID)
    );
    assert_eq!(
        result
            .observability_summary
            .pointer("/correlation/profileSchemaVersion")
            .and_then(Value::as_str),
        Some(LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION)
    );
    assert_eq!(
        result
            .observability_summary
            .pointer("/correlation/turnIds/0")
            .and_then(Value::as_str),
        Some("turn-1")
    );
    assert_eq!(
        result
            .observability_summary
            .pointer("/correlation/toolCallIds/0")
            .and_then(Value::as_str),
        Some("tool-1")
    );
    assert_eq!(
        result
            .observability_summary
            .pointer("/correlation/traceIds/0")
            .and_then(Value::as_str),
        Some("trace-turn-1")
    );

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime_raw = fs::read_to_string(runtime_path).expect("runtime");
    let runtime = serde_json::from_str::<Value>(&runtime_raw).expect("parse runtime json");

    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/schemaVersion")
            .and_then(Value::as_str),
        Some(LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION)
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/runtimeId")
            .and_then(Value::as_str),
        Some(LIME_AGENT_RUNTIME_ID)
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/correlationRefs/evidenceRefs/0")
            .and_then(Value::as_str),
        Some("evidence://session-1/runtime")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/actions/0/actionId")
            .and_then(Value::as_str),
        Some("req-1")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/0/type")
            .and_then(Value::as_str),
        Some("permission.evaluated")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/0/payload/owner")
            .and_then(Value::as_str),
        Some("AgentPolicy")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/1/type")
            .and_then(Value::as_str),
        Some("action.required")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/1/payload/actionId")
            .and_then(Value::as_str),
        Some("req-1")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/2/type")
            .and_then(Value::as_str),
        Some("tool.started")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/2/payload/toolCallId")
            .and_then(Value::as_str),
        Some("tool-1")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/3/type")
            .and_then(Value::as_str),
        Some("tool.result")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/3/payload/success")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/4/type")
            .and_then(Value::as_str),
        Some("task.profile.resolved")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/4/payload/taskKind")
            .and_then(Value::as_str),
        Some("translation")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/5/type")
            .and_then(Value::as_str),
        Some("routing.single_candidate")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/5/payload/selectedModel")
            .and_then(Value::as_str),
        Some("gpt-5.4-mini")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/6/type")
            .and_then(Value::as_str),
        Some("cost.estimated")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/6/payload/estimatedCostClass")
            .and_then(Value::as_str),
        Some("low")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/7/type")
            .and_then(Value::as_str),
        Some("limit.changed")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/7/payload/singleCandidateOnly")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/8/type")
            .and_then(Value::as_str),
        Some("task.created")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/8/payload/taskId")
            .and_then(Value::as_str),
        Some("task_thread-1")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/9/type")
            .and_then(Value::as_str),
        Some("task.attempt.started")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/events/9/payload/attemptId")
            .and_then(Value::as_str),
        Some("attempt_turn-1")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/actions/0/policyRefs/owner")
            .and_then(Value::as_str),
        Some("AgentPolicy")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/actions/0/policyRefs/decisionKind")
            .and_then(Value::as_str),
        Some("ask")
    );
    assert_eq!(
        runtime
            .pointer("/agentRuntimeProfile/actions/0/policyRefs/approvalRequestId")
            .and_then(Value::as_str),
        Some("req-1")
    );
    assert_eq!(
        runtime
            .pointer("/thread/runtimeFacts/contextSummary/owner")
            .and_then(Value::as_str),
        Some("AgentContext")
    );
}

#[test]
fn evidence_runtime_should_export_routing_not_possible_profile_event() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let mut thread_read = build_thread_read();
    detail.turns[0].status = AgentThreadTurnStatus::Failed;
    detail.turns[0].error_message =
        Some("No candidate model can satisfy image generation capability.".to_string());
    thread_read.status = "failed".to_string();
    thread_read.profile_status = "failed".to_string();
    thread_read.turns[0].status = "failed".to_string();
    thread_read.turns[0].native_status = "failed".to_string();
    thread_read.model_routing = Some(json!({
        "taskKind": "image_generation",
        "serviceModelSlot": "image_generation",
        "routingMode": "no_candidate",
        "decisionSource": "capability_filter",
        "candidateCount": 0,
        "capabilityGap": "image_generation_model_capability_gap",
        "singleCandidateOnly": false
    }));
    thread_read.routing_mode = Some("no_candidate".to_string());
    thread_read.decision_source = Some("capability_filter".to_string());
    thread_read.candidate_count = Some(0);
    thread_read.capability_gap = Some("image_generation_model_capability_gap".to_string());
    thread_read.single_candidate_only = Some(false);
    thread_read.limit_state = Some(lime_agent::SessionExecutionRuntimeLimitState {
        status: "no_candidate".to_string(),
        single_candidate_only: false,
        provider_locked: false,
        settings_locked: false,
        oem_locked: false,
        candidate_count: 0,
        capability_gap: Some("image_generation_model_capability_gap".to_string()),
        notes: Vec::new(),
    });

    export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");
    let event = find_agent_runtime_profile_event(&runtime, "routing.not_possible");

    assert_eq!(
        event.pointer("/payload/status").and_then(Value::as_str),
        Some("blocked")
    );
    assert_eq!(
        event
            .pointer("/payload/candidateCount")
            .and_then(Value::as_u64),
        Some(0)
    );
    assert_eq!(
        event.pointer("/payload/reasonCode").and_then(Value::as_str),
        Some("image_generation_model_capability_gap")
    );
    assert!(runtime
        .pointer("/agentRuntimeProfile/events")
        .and_then(Value::as_array)
        .is_some_and(|events| events.iter().all(|event| {
            event.get("type").and_then(Value::as_str) != Some("routing.single_candidate")
        })));
}

#[test]
fn evidence_runtime_should_export_multi_candidate_routing_decided_profile_event() {
    let temp_dir = TempDir::new().expect("temp dir");
    let detail = build_detail();
    let mut thread_read = build_thread_read();
    thread_read.model_routing = Some(json!({
        "taskKind": "deep_research",
        "serviceModelSlot": "deep_research",
        "routingMode": "fallback_chain",
        "decisionSource": "model_router",
        "selectedProvider": "openai",
        "selectedModel": "gpt-5.4",
        "candidateCount": 2,
        "fallbackChain": ["openai:gpt-5.4", "openai:gpt-5.4-mini"],
        "estimatedCostClass": "medium",
        "singleCandidateOnly": false
    }));
    thread_read.routing_mode = Some("fallback_chain".to_string());
    thread_read.decision_source = Some("model_router".to_string());
    thread_read.candidate_count = Some(2);
    thread_read.fallback_chain = Some(vec![
        "openai:gpt-5.4".to_string(),
        "openai:gpt-5.4-mini".to_string(),
    ]);
    thread_read.single_candidate_only = Some(false);

    export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");
    let event = find_agent_runtime_profile_event(&runtime, "routing.decided");

    assert_eq!(
        event.pointer("/payload/status").and_then(Value::as_str),
        Some("selected")
    );
    assert_eq!(
        event
            .pointer("/payload/candidateCount")
            .and_then(Value::as_u64),
        Some(2)
    );
    assert_eq!(
        event
            .pointer("/payload/routingMode")
            .and_then(Value::as_str),
        Some("fallback_chain")
    );
    assert_eq!(
        event
            .pointer("/payload/selectedModel")
            .and_then(Value::as_str),
        Some("gpt-5.4")
    );
    assert!(runtime
        .pointer("/agentRuntimeProfile/events")
        .and_then(Value::as_array)
        .is_some_and(|events| events.iter().all(|event| {
            event.get("type").and_then(Value::as_str) != Some("routing.single_candidate")
        })));
}

#[test]
fn evidence_runtime_should_export_subagent_parent_child_profile_events() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();
    detail.child_subagent_sessions = vec![crate::agent::ChildSubagentSession {
        id: "child-session-1".to_string(),
        name: "Verifier".to_string(),
        created_at: 10,
        updated_at: 20,
        session_type: "subagent".to_string(),
        model: Some("gpt-5.4-mini".to_string()),
        provider_name: Some("openai".to_string()),
        working_dir: Some("/tmp/workspace".to_string()),
        workspace_id: Some("workspace-1".to_string()),
        task_summary: Some("验证证据包".to_string()),
        role_hint: Some("verifier".to_string()),
        origin_tool: Some("SpawnAgent".to_string()),
        created_from_turn_id: Some("turn-1".to_string()),
        blueprint_role_id: None,
        blueprint_role_label: None,
        profile_id: Some("profile-verifier".to_string()),
        profile_name: Some("Verifier".to_string()),
        role_key: Some("verifier".to_string()),
        team_preset_id: Some("team-default".to_string()),
        theme: None,
        output_contract: None,
        skill_ids: Vec::new(),
        skills: Vec::new(),
        runtime_status: Some(crate::agent::ChildSubagentRuntimeStatus::Completed),
        latest_turn_status: Some(crate::agent::ChildSubagentRuntimeStatus::Completed),
        queued_turn_count: 0,
        team_phase: Some("completed".to_string()),
        team_parallel_budget: Some(2),
        team_active_count: Some(0),
        team_queued_count: Some(0),
        provider_concurrency_group: Some("openai:gpt-5.4-mini".to_string()),
        provider_parallel_budget: Some(2),
        queue_reason: None,
        retryable_overload: false,
    }];

    export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");
    let spawned = find_agent_runtime_profile_event(&runtime, "subagent.spawned");
    let status = find_agent_runtime_profile_event(&runtime, "subagent.status");
    let completed = find_agent_runtime_profile_event(&runtime, "subagent.completed");

    assert_eq!(
        runtime
            .pointer("/observabilitySummary/correlation/subagentSessionIds/0")
            .and_then(Value::as_str),
        Some("child-session-1")
    );
    assert_eq!(
        spawned
            .pointer("/payload/subagentSessionId")
            .and_then(Value::as_str),
        Some("child-session-1")
    );
    assert_eq!(
        spawned
            .pointer("/payload/parentSessionId")
            .and_then(Value::as_str),
        Some("session-1")
    );
    assert_eq!(
        spawned
            .pointer("/payload/createdFromTurnId")
            .and_then(Value::as_str),
        Some("turn-1")
    );
    assert_eq!(
        spawned
            .pointer("/payload/parentTaskId")
            .and_then(Value::as_str),
        Some("task_thread-1")
    );
    assert_eq!(
        status
            .pointer("/payload/runtimeStatus")
            .and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        completed.pointer("/payload/status").and_then(Value::as_str),
        Some("completed")
    );
}

#[test]
fn evidence_runtime_should_export_job_profile_events_from_owner_runs() {
    let temp_dir = TempDir::new().expect("temp dir");
    let detail = build_detail();
    let thread_read = build_thread_read();
    let owner_runs = vec![build_completion_audit_owner_run(
        AgentRunStatus::Success,
        None,
    )];

    export_runtime_evidence_pack_with_owner_runs(
        &detail,
        &thread_read,
        temp_dir.path(),
        &owner_runs,
    )
    .expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");
    let created = find_agent_runtime_profile_event(&runtime, "job.created");
    let status = find_agent_runtime_profile_event(&runtime, "job.status");
    let item_started = find_agent_runtime_profile_event(&runtime, "job.item.started");
    let completed = find_agent_runtime_profile_event(&runtime, "job.completed");

    assert_eq!(
        created.pointer("/payload/jobId").and_then(Value::as_str),
        Some("run-automation-1")
    );
    assert_eq!(
        created.pointer("/payload/source").and_then(Value::as_str),
        Some("automation")
    );
    assert_eq!(
        created
            .pointer("/payload/sourceRef")
            .and_then(Value::as_str),
        Some("job-1")
    );
    assert_eq!(
        status
            .pointer("/payload/runtimeStatus")
            .and_then(Value::as_str),
        Some("success")
    );
    assert_eq!(
        item_started
            .pointer("/payload/itemId")
            .and_then(Value::as_str),
        Some("run-automation-1:execution")
    );
    assert_eq!(
        item_started
            .pointer("/payload/itemKind")
            .and_then(Value::as_str),
        Some("agent_run_execution")
    );
    assert_eq!(
        completed.pointer("/payload/status").and_then(Value::as_str),
        Some("completed")
    );
}

#[test]
fn evidence_runtime_should_export_job_item_profile_events_from_owner_run_metadata() {
    let temp_dir = TempDir::new().expect("temp dir");
    let detail = build_detail();
    let thread_read = build_thread_read();
    let mut owner_run = build_completion_audit_owner_run(
        AgentRunStatus::Error,
        Some(json!({
            "job_id": "job-1",
            "job_item_id": "job-item-1",
            "payload_kind": "agent_turn"
        })),
    );
    owner_run.error_code = Some("automation_job_failed".to_string());
    let owner_runs = vec![owner_run];

    export_runtime_evidence_pack_with_owner_runs(
        &detail,
        &thread_read,
        temp_dir.path(),
        &owner_runs,
    )
    .expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");
    let item_started = find_agent_runtime_profile_event(&runtime, "job.item.started");
    let item_failed = find_agent_runtime_profile_event(&runtime, "job.item.failed");

    assert_eq!(
        item_started
            .pointer("/payload/itemId")
            .and_then(Value::as_str),
        Some("job-item-1")
    );
    assert_eq!(
        item_started
            .pointer("/payload/itemKind")
            .and_then(Value::as_str),
        Some("agent_turn")
    );
    assert_eq!(
        item_failed
            .pointer("/payload/failureCategory")
            .and_then(Value::as_str),
        Some("runtime_error")
    );
    assert_eq!(
        item_failed
            .pointer("/payload/errorCode")
            .and_then(Value::as_str),
        Some("automation_job_failed")
    );
    assert_eq!(
        item_failed
            .pointer("/payload/retryable")
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn evidence_runtime_should_export_remote_channel_resume_repair_profile_events() {
    let temp_dir = TempDir::new().expect("temp dir");
    let detail = build_detail();
    let thread_read = build_thread_read();
    let owner_runs = vec![
        build_remote_owner_run(
            "run-remote-disconnected",
            AgentRunStatus::Error,
            json!({
                "source_metadata": {
                    "remote_task": {
                        "source": "gateway_channel",
                        "channel": "telegram",
                        "accountId": "default",
                        "remoteTaskId": "gateway:telegram:default:message-1",
                        "remoteEvent": "disconnected",
                        "remoteStatus": "offline",
                        "reasonCode": "connection_lost"
                    }
                }
            }),
        ),
        build_remote_owner_run(
            "run-remote-resumed",
            AgentRunStatus::Success,
            json!({
                "source_metadata": {
                    "remote_task": {
                        "source": "gateway_channel",
                        "channel": "telegram",
                        "accountId": "default",
                        "remoteTaskId": "gateway:telegram:default:message-1",
                        "remoteEvent": "resumed",
                        "remoteStatus": "running",
                        "snapshotStatus": "repaired",
                        "snapshotRef": "agent-runtime://snapshot/remote-1",
                        "replayRef": "agent-runtime://replay/remote-1"
                    }
                }
            }),
        ),
    ];

    export_runtime_evidence_pack_with_owner_runs(
        &detail,
        &thread_read,
        temp_dir.path(),
        &owner_runs,
    )
    .expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");
    let connected = find_agent_runtime_profile_event(&runtime, "channel.connected");
    let disconnected = find_agent_runtime_profile_event(&runtime, "channel.disconnected");
    let resumed = find_agent_runtime_profile_event(&runtime, "channel.resumed");
    let repaired = find_agent_runtime_profile_event(&runtime, "snapshot.repaired");

    assert_eq!(
        connected
            .pointer("/payload/remoteTaskId")
            .and_then(Value::as_str),
        Some("gateway:telegram:default:message-1")
    );
    assert_eq!(
        disconnected
            .pointer("/payload/reasonCode")
            .and_then(Value::as_str),
        Some("connection_lost")
    );
    assert_eq!(
        resumed
            .pointer("/payload/snapshotRef")
            .and_then(Value::as_str),
        Some("agent-runtime://snapshot/remote-1")
    );
    assert_eq!(
        repaired
            .pointer("/payload/repairStatus")
            .and_then(Value::as_str),
        Some("repaired")
    );
    assert_eq!(
        runtime
            .pointer("/observabilitySummary/correlation/remoteTaskIds/0")
            .and_then(Value::as_str),
        Some("gateway:telegram:default:message-1")
    );
    assert_eq!(
        runtime
            .pointer("/remoteChannels/tasks/1/snapshotRepaired")
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn evidence_runtime_should_export_task_retry_profile_events() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    detail.turns = vec![AgentThreadTurn {
        id: "turn-failed".to_string(),
        thread_id: "thread-1".to_string(),
        prompt_text: "继续重试 provider 请求".to_string(),
        status: AgentThreadTurnStatus::Failed,
        started_at: "2026-03-27T10:00:00Z".to_string(),
        completed_at: Some("2026-03-27T10:00:05Z".to_string()),
        error_message: Some("Provider 错误: rate limit".to_string()),
        created_at: "2026-03-27T10:00:00Z".to_string(),
        updated_at: "2026-03-27T10:00:05Z".to_string(),
    }];
    detail.items = Vec::new();
    let queued_turns = vec![QueuedTurnSnapshot {
        queued_turn_id: "queued-retry-1".to_string(),
        message_preview: "继续重试".to_string(),
        message_text: "继续重试 provider 请求".to_string(),
        created_at: 1_774_607_210,
        image_count: 0,
        position: 1,
    }];
    let thread_read = AgentRuntimeThreadReadModel::from_session_detail(&detail, &queued_turns);

    export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime_raw = fs::read_to_string(runtime_path).expect("runtime");
    let runtime = serde_json::from_str::<Value>(&runtime_raw).expect("parse runtime json");
    let events = runtime
        .pointer("/agentRuntimeProfile/events")
        .and_then(Value::as_array)
        .expect("profile events");
    let event_types = events
        .iter()
        .filter_map(|event| event.get("type").and_then(Value::as_str))
        .collect::<Vec<_>>();

    assert!(event_types.contains(&"task.created"));
    assert!(event_types.contains(&"task.attempt.started"));
    assert!(event_types.contains(&"task.attempt.failed"));
    assert!(event_types.contains(&"task.retrying"));
    assert!(!event_types.contains(&"task.failed"));

    let attempt_failed = events
        .iter()
        .find(|event| event.get("type").and_then(Value::as_str) == Some("task.attempt.failed"))
        .expect("attempt failed event");
    assert_eq!(
        attempt_failed
            .pointer("/payload/failureCategory")
            .and_then(Value::as_str),
        Some("provider_error")
    );
    assert_eq!(
        attempt_failed
            .pointer("/payload/retryable")
            .and_then(Value::as_bool),
        Some(true)
    );

    let retrying = events
        .iter()
        .find(|event| event.get("type").and_then(Value::as_str) == Some("task.retrying"))
        .expect("retrying event");
    assert_eq!(
        retrying
            .pointer("/payload/failedAttemptId")
            .and_then(Value::as_str),
        Some("attempt_turn-failed")
    );
    assert_eq!(
        retrying
            .pointer("/payload/queuedTurnId")
            .and_then(Value::as_str),
        Some("queued-retry-1")
    );
    assert_eq!(
        retrying
            .pointer("/payload/nextAttemptIndex")
            .and_then(Value::as_u64),
        Some(2)
    );
}

#[test]
fn should_export_runtime_verification_when_signal_is_applicable() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();
    write_request_telemetry_fixture(temp_dir.path());
    let artifact_relative_path = ".lime/artifacts/thread-1/report.artifact.json";
    let artifact_absolute_path = temp_dir
        .path()
        .join(artifact_relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));

    fs::create_dir_all(
        artifact_absolute_path
            .parent()
            .expect("artifact path should have parent"),
    )
    .expect("create artifact dir");
    fs::write(
        &artifact_absolute_path,
        serde_json::to_string_pretty(&json!({
            "schemaVersion": ARTIFACT_DOCUMENT_SCHEMA_VERSION,
            "title": "Harness Evidence",
            "kind": "analysis",
            "status": "ready",
            "blocks": [
                {
                    "id": "block-1",
                    "type": "rich_text",
                    "content": "test"
                }
            ],
            "metadata": {
                "artifactValidationIssues": ["title 缺失或为空，已使用兜底标题。"],
                "artifactValidationRepaired": true,
                "artifactFallbackUsed": false
            }
        }))
        .expect("serialize artifact document"),
    )
    .expect("write artifact document");

    if let AgentThreadItemPayload::FileArtifact { path, .. } = &mut detail.items[1].payload {
        *path = artifact_relative_path.to_string();
    }

    detail.items.push(AgentThreadItem {
        id: "browser-tool-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-03-27T10:00:40Z".to_string(),
        completed_at: Some("2026-03-27T10:00:40Z".to_string()),
        updated_at: "2026-03-27T10:00:40Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "browser_snapshot".to_string(),
            arguments: None,
            output: None,
            success: Some(true),
            error: None,
            metadata: None,
        },
    });
    detail.items.push(AgentThreadItem {
        id: "gui-smoke-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 5,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-03-27T10:00:50Z".to_string(),
        completed_at: Some("2026-03-27T10:00:50Z".to_string()),
        updated_at: "2026-03-27T10:00:50Z".to_string(),
        payload: AgentThreadItemPayload::CommandExecution {
            command: "npm run verify:gui-smoke".to_string(),
            cwd: temp_dir.path().to_string_lossy().to_string(),
            aggregated_output: Some("GUI smoke finished successfully".to_string()),
            exit_code: Some(0),
            error: None,
        },
    });

    let result =
        export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    assert!(result
        .known_gaps
        .iter()
        .all(|gap| !gap.contains("ArtifactDocument")));
    assert!(result
        .observability_summary
        .get("verificationSummary")
        .is_some());

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let artifacts_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/artifacts.json");

    let runtime = fs::read_to_string(runtime_path).expect("runtime");
    assert!(runtime.contains("\"artifactValidator\""));
    assert!(runtime.contains("\"browserVerification\""));
    assert!(runtime.contains("\"guiSmoke\""));
    assert!(runtime.contains("\"status\": \"exported\""));
    assert!(runtime.contains("\"verificationSummary\""));
    assert!(runtime.contains("\"recordCount\": 1"));
    assert!(runtime.contains("\"issueCount\": 1"));
    assert!(runtime.contains("\"repairedCount\": 1"));
    assert!(runtime.contains("\"successCount\": 1"));
    assert!(runtime.contains("\"passed\": true"));
    assert!(runtime.contains("\"outcome\": \"recovered\""));
    assert!(runtime.contains("\"outcome\": \"success\""));
    assert!(runtime.contains("\"focusVerificationRecoveredOutcomes\""));

    let artifacts = fs::read_to_string(artifacts_path).expect("artifacts");
    assert!(artifacts.contains("\"verification\""));
    assert!(artifacts.contains("\"artifactValidatorIssues\""));
    assert!(artifacts.contains("\"browserEvidence\""));
    assert!(artifacts.contains("\"guiSmoke\""));
    assert!(artifacts.contains("title 缺失或为空"));
}

#[test]
fn should_export_empty_request_telemetry_summary_when_no_request_matches_current_thread() {
    let temp_dir = TempDir::new().expect("temp dir");
    let detail = build_detail();
    let thread_read = build_thread_read();
    write_unmatched_request_telemetry_fixture(temp_dir.path());

    let result =
        export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    assert!(result
        .known_gaps
        .iter()
        .all(|gap| !gap.contains("request telemetry")));

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let artifacts_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/artifacts.json");

    let runtime = fs::read_to_string(runtime_path).expect("runtime");
    assert!(runtime.contains("\"requestTelemetry\""));
    assert!(runtime.contains("\"searchedRoots\": ["));
    assert!(runtime.contains("\"matchedRequestCount\": 0"));
    assert!(runtime.contains("\"providers\": []"));
    assert!(runtime.contains("\"models\": []"));
    assert!(runtime.contains("\"requests\": []"));
    assert!(runtime.contains("\"signal\": \"requestTelemetry\""));
    assert!(runtime.contains("\"status\": \"exported\""));
    assert!(runtime.contains("当前会话未匹配到 provider request 记录"));
    assert!(!runtime.contains("\"verificationSummary\""));

    let artifacts = fs::read_to_string(artifacts_path).expect("artifacts");
    assert!(artifacts.contains("\"telemetry\""));
    assert!(artifacts.contains("\"matchedRequestCount\": 0"));
}

#[test]
fn should_export_auxiliary_runtime_snapshots_from_image_task_artifact() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();
    let image_task_relative_path = ".lime/tasks/image_generate/task-image-1.json";

    write_request_telemetry_fixture(temp_dir.path());
    write_image_task_fixture(temp_dir.path(), image_task_relative_path);

    if let AgentThreadItemPayload::FileArtifact { path, metadata, .. } =
        &mut detail.items[1].payload
    {
        *path = image_task_relative_path.to_string();
        *metadata = Some(json!({
            "task_type": "image_generate"
        }));
    }

    let result =
        export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    assert!(result
        .known_gaps
        .iter()
        .all(|gap| !gap.contains("title_generation_result.execution_runtime")));

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let artifacts_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/artifacts.json");

    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");
    let runtime_snapshots = runtime
        .pointer("/auxiliaryRuntimeSnapshots/snapshots")
        .and_then(Value::as_array)
        .expect("runtime snapshots should exist");
    assert_eq!(
        runtime
            .pointer("/auxiliaryRuntimeSnapshots/applicableArtifactCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/auxiliaryRuntimeSnapshots/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/observabilitySummary/counts/auxiliaryRuntimeSnapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    let runtime_snapshot = runtime_snapshots
        .first()
        .expect("runtime snapshot should exist");
    assert_eq!(
        runtime_snapshot.get("artifactPath").and_then(Value::as_str),
        Some(image_task_relative_path)
    );
    assert_eq!(
        runtime_snapshot.get("source").and_then(Value::as_str),
        Some("image_task.title_generation_result")
    );
    assert_eq!(
        runtime_snapshot.get("title").and_then(Value::as_str),
        Some("城市夜景主视觉")
    );
    assert_eq!(
        runtime_snapshot.get("sessionId").and_then(Value::as_str),
        Some("title-gen-1")
    );
    assert_eq!(
        runtime_snapshot.get("route").and_then(Value::as_str),
        Some("auxiliary.generate_title")
    );
    assert_eq!(
        runtime_snapshot.get("taskKind").and_then(Value::as_str),
        Some("generation_topic")
    );
    assert_eq!(
        runtime_snapshot.get("routingMode").and_then(Value::as_str),
        Some("single_candidate")
    );
    assert_eq!(
        runtime_snapshot
            .get("decisionSource")
            .and_then(Value::as_str),
        Some("service_model_setting")
    );
    assert_eq!(
        runtime_snapshot
            .get("estimatedCostClass")
            .and_then(Value::as_str),
        Some("low")
    );
    assert_eq!(
        runtime
            .pointer("/observabilitySummary/signalCoverage")
            .and_then(Value::as_array)
            .and_then(|items| {
                items.iter().find(|item| {
                    item.get("signal").and_then(Value::as_str) == Some("auxiliaryTaskRuntime")
                })
            })
            .and_then(|item| item.get("status"))
            .and_then(Value::as_str),
        Some("exported")
    );

    let artifacts = serde_json::from_str::<Value>(
        fs::read_to_string(artifacts_path)
            .expect("artifacts")
            .as_str(),
    )
    .expect("parse artifacts json");
    assert_eq!(
        artifacts
            .pointer("/auxiliaryRuntimeSnapshots/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        artifacts
            .pointer("/auxiliaryRuntimeSnapshots/snapshots/0/route")
            .and_then(Value::as_str),
        Some("auxiliary.generate_title")
    );
}

#[test]
fn should_export_modality_runtime_contract_snapshot_from_failed_image_task() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();
    let image_task_relative_path = ".lime/tasks/image_generate/task-image-failed.json";

    write_request_telemetry_fixture(temp_dir.path());
    write_failed_image_contract_task_fixture(temp_dir.path(), image_task_relative_path);

    if let AgentThreadItemPayload::FileArtifact { path, metadata, .. } =
        &mut detail.items[1].payload
    {
        *path = image_task_relative_path.to_string();
        *metadata = Some(json!({
            "task_type": "image_generate"
        }));
    }

    let result =
        export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    assert!(result
        .known_gaps
        .iter()
        .all(|gap| !gap.contains("ModalityRuntimeContract")));

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let artifacts_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/artifacts.json");

    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/observabilitySummary/counts/modalityRuntimeContractCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractKey")
            .and_then(Value::as_str),
        Some(IMAGE_GENERATION_CONTRACT_KEY)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/model")
            .and_then(Value::as_str),
        Some("gpt-5.2")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingEvent")
            .and_then(Value::as_str),
        Some("routing_not_possible")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingOutcome")
            .and_then(Value::as_str),
        Some("blocked")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/failureCode")
            .and_then(Value::as_str),
        Some("image_generation_model_capability_gap")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/executionProfileKey")
            .and_then(Value::as_str),
        Some("image_generation_profile")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/executorAdapterKey")
            .and_then(Value::as_str),
        Some("skill:image_generate")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/executionProfileKeys/0")
            .and_then(Value::as_str),
        Some("image_generation_profile")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/executorAdapterKeys/0")
            .and_then(Value::as_str),
        Some("skill:image_generate")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/limecorePolicyRefs/0")
            .and_then(Value::as_str),
        Some("model_catalog")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/limecorePolicySnapshot/status")
            .and_then(Value::as_str),
        Some("local_defaults_evaluated")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/limecorePolicySnapshot/decision")
            .and_then(Value::as_str),
        Some("allow")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/limecorePolicySnapshot/decision_source")
            .and_then(Value::as_str),
        Some("local_default_policy")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/limecorePolicySnapshot/decision_scope")
            .and_then(Value::as_str),
        Some("local_defaults_only")
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/decisionSource"
            )
            .and_then(Value::as_str),
        Some("local_default_policy")
    );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/policyEvaluation/status"
                )
                .and_then(Value::as_str),
            Some("input_gap")
        );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/policyEvaluation/decision_source"
                )
                .and_then(Value::as_str),
            Some("policy_input_evaluator")
        );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/policyEvaluation/pending_refs/0"
                )
                .and_then(Value::as_str),
            Some("model_catalog")
        );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/unresolvedRefs/0"
                )
                .and_then(Value::as_str),
            Some("model_catalog")
        );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/missingInputs/0"
                )
                .and_then(Value::as_str),
            Some("model_catalog")
        );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/policyInputs/0/ref_key"
                )
                .and_then(Value::as_str),
            Some("model_catalog")
        );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/policyInputs/0/value_source"
                )
                .and_then(Value::as_str),
            Some("limecore_pending")
        );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/pendingHitRefs/0"
                )
                .and_then(Value::as_str),
            Some("model_catalog")
        );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/policyValueHitCount"
                )
                .and_then(Value::as_u64),
            Some(0)
        );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/items/0/policyValueHits"
                )
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(0)
        );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/missingInputs/0")
            .and_then(Value::as_str),
        Some("model_catalog")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/pendingHitRefs/0")
            .and_then(Value::as_str),
        Some("model_catalog")
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/policyValueHitCount"
            )
            .and_then(Value::as_u64),
        Some(0)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/limecorePolicyRefs/0")
            .and_then(Value::as_str),
        Some("model_catalog")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/limecorePolicyIndex/statusCounts/0/status"
            )
            .and_then(Value::as_str),
        Some("local_defaults_evaluated")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/modelCapabilityAssessment/source")
            .and_then(Value::as_str),
        Some("model_registry")
    );
    assert_eq!(
            runtime
                .pointer("/modalityRuntimeContracts/snapshots/0/modelCapabilityAssessment/supports_image_generation")
                .and_then(Value::as_bool),
            Some(false)
        );
    assert_eq!(
        runtime
            .pointer("/observabilitySummary/signalCoverage")
            .and_then(Value::as_array)
            .and_then(|items| {
                items.iter().find(|item| {
                    item.get("signal").and_then(Value::as_str) == Some("modalityRuntimeContract")
                })
            })
            .and_then(|item| item.get("status"))
            .and_then(Value::as_str),
        Some("exported")
    );

    let artifacts = serde_json::from_str::<Value>(
        fs::read_to_string(artifacts_path)
            .expect("artifacts")
            .as_str(),
    )
    .expect("parse artifacts json");
    assert_eq!(
        artifacts
            .pointer("/modalityRuntimeContracts/snapshots/0/failureStage")
            .and_then(Value::as_str),
        Some("routing")
    );
    assert_eq!(
        artifacts
            .pointer("/modalityRuntimeContracts/snapshots/0/runtimeContract/contract_key")
            .and_then(Value::as_str),
        Some(IMAGE_GENERATION_CONTRACT_KEY)
    );
}

#[test]
fn should_export_browser_control_contract_snapshot_from_tool_metadata() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();

    detail.items.push(AgentThreadItem {
        id: "browser-contract-tool-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-03-27T10:00:40Z".to_string(),
        completed_at: Some("2026-03-27T10:00:40Z".to_string()),
        updated_at: "2026-03-27T10:00:40Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "mcp__lime-browser__navigate".to_string(),
            arguments: Some(json!({
                "url": "https://example.com"
            })),
            output: Some("ok".to_string()),
            success: Some(true),
            error: None,
            metadata: Some(json!({
                "tool_family": "browser",
                "modality_contract_key": BROWSER_CONTROL_CONTRACT_KEY,
                "modality": "browser",
                "content_id": "content-browser-1",
                "model_id": "gpt-5.2-browser",
                "cost_state": {
                    "status": "estimated",
                    "estimatedCostClass": "low"
                },
                "limit_state": {
                    "status": "within_limit"
                },
                "limit_event": {
                    "eventKind": "quota_low"
                },
                "required_capabilities": [
                    "text_generation",
                    "browser_reasoning",
                    "browser_control_planning"
                ],
                "routing_slot": BROWSER_CONTROL_ROUTING_SLOT,
                "runtime_contract": {
                    "contract_key": BROWSER_CONTROL_CONTRACT_KEY,
                    "routing_slot": BROWSER_CONTROL_ROUTING_SLOT,
                    "executor_binding": {
                        "executor_kind": "browser_action",
                        "binding_key": "lime_browser_mcp"
                    }
                },
                "entry_source": "at_browser_command",
                "action": "navigate",
                "selected_backend": "cdp_direct",
                "attempt_count": 1,
                "result": {
                    "success": true,
                    "action": "navigate",
                    "request_id": "browser-request-1",
                    "session_id": "browser-session-1",
                    "target_id": "target-1",
                    "data": {
                        "browser_session": {
                            "session_id": "browser-session-1",
                            "profile_key": "general_browser_assist",
                            "target_id": "target-1",
                            "target_title": "Example",
                            "target_url": "https://example.com/"
                        }
                    }
                }
            })),
        },
    });

    let result =
        export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    assert!(result
        .known_gaps
        .iter()
        .all(|gap| !gap.contains("ModalityRuntimeContract")));

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");

    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractKey")
            .and_then(Value::as_str),
        Some(BROWSER_CONTROL_CONTRACT_KEY)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/source")
            .and_then(Value::as_str),
        Some("browser_action_trace.modality_runtime_contract")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingEvent")
            .and_then(Value::as_str),
        Some("browser_action_requested")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingOutcome")
            .and_then(Value::as_str),
        Some("accepted")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/expectedRoutingSlot")
            .and_then(Value::as_str),
        Some(BROWSER_CONTROL_ROUTING_SLOT)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/browserAction/artifactKind")
            .and_then(Value::as_str),
        Some("browser_session")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/browserAction/sessionId")
            .and_then(Value::as_str),
        Some("browser-session-1")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/threadId")
            .and_then(Value::as_str),
        Some("thread-1")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/turnId")
            .and_then(Value::as_str),
        Some("turn-1")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contentId")
            .and_then(Value::as_str),
        Some("content-browser-1")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/entryKey")
            .and_then(Value::as_str),
        Some("at_browser_command")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/modelId")
            .and_then(Value::as_str),
        Some("gpt-5.2-browser")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/executorKind")
            .and_then(Value::as_str),
        Some("browser_action")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/executorBindingKey")
            .and_then(Value::as_str),
        Some("lime_browser_mcp")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/costState")
            .and_then(Value::as_str),
        Some("estimated")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/limitState")
            .and_then(Value::as_str),
        Some("within_limit")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/estimatedCostClass")
            .and_then(Value::as_str),
        Some("low")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/limitEventKind")
            .and_then(Value::as_str),
        Some("quota_low")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/quotaLow")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/taskIndex/threadIds/0")
            .and_then(Value::as_str),
        Some("thread-1")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/taskIndex/contentIds/0")
            .and_then(Value::as_str),
        Some("content-browser-1")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/taskIndex/entryKeys/0")
            .and_then(Value::as_str),
        Some("at_browser_command")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/taskIndex/modelIds/0")
            .and_then(Value::as_str),
        Some("gpt-5.2-browser")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/taskIndex/executorKinds/0")
            .and_then(Value::as_str),
        Some("browser_action")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/taskIndex/costStates/0")
            .and_then(Value::as_str),
        Some("estimated")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/taskIndex/limitStates/0")
            .and_then(Value::as_str),
        Some("within_limit")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/taskIndex/quotaLowCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/browserActionIndex/actionCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/browserActionIndex/sessionCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/browserActionIndex/lastUrl")
            .and_then(Value::as_str),
        Some("https://example.com/")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/browserActionIndex/items/0/action")
            .and_then(Value::as_str),
        Some("navigate")
    );
    assert_eq!(
        result
            .observability_summary
            .pointer("/modalityRuntimeContracts/snapshotIndex/taskIndex/threadIds/0")
            .and_then(Value::as_str),
        Some("thread-1")
    );
    assert_eq!(
        result
            .observability_summary
            .pointer("/modalityRuntimeContracts/snapshotIndex/browserActionIndex/actionCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        result
            .observability_summary
            .pointer("/modalityRuntimeContracts/snapshotIndex/browserActionIndex/lastUrl")
            .and_then(Value::as_str),
        Some("https://example.com/")
    );
}

#[test]
fn should_index_browser_snapshot_observation_from_tool_metadata() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();

    detail.items.push(AgentThreadItem {
        id: "browser-snapshot-tool-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-03-27T10:00:40Z".to_string(),
        completed_at: Some("2026-03-27T10:00:40Z".to_string()),
        updated_at: "2026-03-27T10:00:40Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "mcp__lime-browser__get_page_info".to_string(),
            arguments: Some(json!({})),
            output: Some("ok".to_string()),
            success: Some(true),
            error: None,
            metadata: Some(json!({
                "tool_family": "browser",
                "modality_contract_key": BROWSER_CONTROL_CONTRACT_KEY,
                "modality": "browser",
                "required_capabilities": [
                    "text_generation",
                    "browser_reasoning",
                    "browser_control_planning"
                ],
                "routing_slot": BROWSER_CONTROL_ROUTING_SLOT,
                "runtime_contract": {
                    "contract_key": BROWSER_CONTROL_CONTRACT_KEY,
                    "routing_slot": BROWSER_CONTROL_ROUTING_SLOT,
                    "executor_binding": {
                        "executor_kind": "browser_action",
                        "binding_key": "lime_browser_mcp"
                    }
                },
                "entry_source": "at_browser_agent_command",
                "action": "get_page_info",
                "selected_backend": "lime_extension_bridge",
                "result": {
                    "success": true,
                    "action": "get_page_info",
                    "request_id": "browser-request-2",
                    "data": {
                        "title": "Example",
                        "url": "https://example.com/",
                        "screenshot_path": ".lime/runtime/browser/browser-snapshot-1.png",
                        "browser_session": {
                            "session_id": "browser-session-1",
                            "profile_key": "general_browser_assist",
                            "target_id": "target-1",
                            "target_title": "Example",
                            "target_url": "https://example.com/"
                        }
                    }
                }
            })),
        },
    });

    let result =
        export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");

    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/browserAction/artifactKind")
            .and_then(Value::as_str),
        Some("browser_snapshot")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/browserActionIndex/observationCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/browserActionIndex/screenshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/browserActionIndex/items/0/artifactKind"
            )
            .and_then(Value::as_str),
        Some("browser_snapshot")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/browserActionIndex/items/0/backend")
            .and_then(Value::as_str),
        Some("lime_extension_bridge")
    );
    assert_eq!(
        result
            .observability_summary
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/browserActionIndex/items/0/artifactKind"
            )
            .and_then(Value::as_str),
        Some("browser_snapshot")
    );
    assert_eq!(
        result
            .observability_summary
            .pointer("/modalityRuntimeContracts/snapshotIndex/browserActionIndex/observationCount")
            .and_then(Value::as_u64),
        Some(1)
    );
}

#[test]
fn should_export_pdf_extract_contract_snapshot_from_skill_metadata() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();

    detail.items.push(AgentThreadItem {
        id: "pdf-contract-skill-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-03-27T10:00:40Z".to_string(),
        completed_at: Some("2026-03-27T10:00:40Z".to_string()),
        updated_at: "2026-03-27T10:00:40Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "Skill".to_string(),
            arguments: Some(json!({
                "skill": "pdf_read",
                "args": {
                    "pdf_read_request": {
                        "source_path": "/tmp/agent-report.pdf"
                    }
                }
            })),
            output: Some("ok".to_string()),
            success: Some(true),
            error: None,
            metadata: Some(json!({
                "modality_contract_key": PDF_EXTRACT_CONTRACT_KEY,
                "modality": "document",
                "required_capabilities": [
                    "text_generation",
                    "local_file_read",
                    "long_context"
                ],
                "routing_slot": PDF_EXTRACT_ROUTING_SLOT,
                "runtime_contract": {
                    "contract_key": PDF_EXTRACT_CONTRACT_KEY,
                    "routing_slot": PDF_EXTRACT_ROUTING_SLOT,
                    "executor_binding": {
                        "executor_kind": "skill",
                        "binding_key": "pdf_read"
                    }
                },
                "entry_source": "at_pdf_read_command"
            })),
        },
    });

    let result =
        export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    assert!(result
        .known_gaps
        .iter()
        .all(|gap| !gap.contains("ModalityRuntimeContract")));

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");

    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractKey")
            .and_then(Value::as_str),
        Some(PDF_EXTRACT_CONTRACT_KEY)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/source")
            .and_then(Value::as_str),
        Some("pdf_read_skill_trace.modality_runtime_contract")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingEvent")
            .and_then(Value::as_str),
        Some("executor_invoked")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingOutcome")
            .and_then(Value::as_str),
        Some("accepted")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/expectedRoutingSlot")
            .and_then(Value::as_str),
        Some(PDF_EXTRACT_ROUTING_SLOT)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractMatchedExpected")
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn should_export_voice_generation_contract_snapshot_from_service_scene_trace() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();

    detail.items.push(AgentThreadItem {
        id: "voice-contract-service-scene-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-03-27T10:00:40Z".to_string(),
        completed_at: Some("2026-03-27T10:00:40Z".to_string()),
        updated_at: "2026-03-27T10:00:40Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "voice_runtime".to_string(),
            arguments: Some(json!({
                "service_scene_launch": {
                    "kind": "local_service_skill",
                    "service_scene_run": {
                        "skill_id": "voice-runtime",
                        "scene_key": "voice_runtime",
                        "user_input": "请为这段文案生成温暖旁白",
                        "entry_source": "at_voice_command",
                        "preferred_provider_id": "limecore",
                        "preferred_model_id": "voice-pro",
                        "modality_contract_key": VOICE_GENERATION_CONTRACT_KEY,
                        "modality": "audio",
                        "required_capabilities": [
                            "text_generation",
                            "voice_generation"
                        ],
                        "routing_slot": VOICE_GENERATION_ROUTING_SLOT,
                        "runtime_contract": {
                            "contract_key": VOICE_GENERATION_CONTRACT_KEY,
                            "routing_slot": VOICE_GENERATION_ROUTING_SLOT,
                            "executor_binding": {
                                "executor_kind": "service_skill",
                                "binding_key": "voice_runtime"
                            }
                        }
                    }
                }
            })),
            output: Some("ok".to_string()),
            success: Some(true),
            error: None,
            metadata: None,
        },
    });

    export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");

    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractKey")
            .and_then(Value::as_str),
        Some(VOICE_GENERATION_CONTRACT_KEY)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/source")
            .and_then(Value::as_str),
        Some("voice_generation_service_scene_trace.modality_runtime_contract")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingEvent")
            .and_then(Value::as_str),
        Some("executor_invoked")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/expectedRoutingSlot")
            .and_then(Value::as_str),
        Some(VOICE_GENERATION_ROUTING_SLOT)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/entrySource")
            .and_then(Value::as_str),
        Some("at_voice_command")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/traceCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/items/0/executorBindingKey"
            )
            .and_then(Value::as_str),
        Some("voice_runtime")
    );
}

#[test]
fn should_export_voice_generation_contract_snapshot_from_audio_task_artifact() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();
    let audio_task_relative_path = ".lime/tasks/audio_generate/task-audio-1.json";

    write_audio_task_fixture(temp_dir.path(), audio_task_relative_path);

    if let AgentThreadItemPayload::FileArtifact { path, metadata, .. } =
        &mut detail.items[1].payload
    {
        *path = audio_task_relative_path.to_string();
        *metadata = Some(json!({
            "task_type": "audio_generate"
        }));
    }

    export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");

    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/source")
            .and_then(Value::as_str),
        Some("audio_task.modality_runtime_contract")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractKey")
            .and_then(Value::as_str),
        Some(VOICE_GENERATION_CONTRACT_KEY)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/taskType")
            .and_then(Value::as_str),
        Some("audio_generate")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/entrySource")
            .and_then(Value::as_str),
        Some("at_voice_command")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingEvent")
            .and_then(Value::as_str),
        Some("executor_invoked")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/audioOutput/status")
            .and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/audioOutput/audioPath")
            .and_then(Value::as_str),
        Some(".lime/runtime/audio/task-audio-1.mp3")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/audioOutput/workerId")
            .and_then(Value::as_str),
        Some("lime-audio-worker")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/audioOutputIndex/outputCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/audioOutputIndex/statusCounts/0/status"
            )
            .and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/items/0/executorBindingKey"
            )
            .and_then(Value::as_str),
        Some("voice_runtime")
    );
}

#[test]
fn should_export_audio_transcription_contract_snapshot_from_transcription_task_artifact() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();
    let transcription_task_relative_path =
        ".lime/tasks/transcription_generate/task-transcription-1.json";

    write_transcription_task_fixture(temp_dir.path(), transcription_task_relative_path);

    if let AgentThreadItemPayload::FileArtifact { path, metadata, .. } =
        &mut detail.items[1].payload
    {
        *path = transcription_task_relative_path.to_string();
        *metadata = Some(json!({
            "task_type": "transcription_generate"
        }));
    }

    export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");

    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/source")
            .and_then(Value::as_str),
        Some("transcription_task.modality_runtime_contract")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractKey")
            .and_then(Value::as_str),
        Some(AUDIO_TRANSCRIPTION_CONTRACT_KEY)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/taskType")
            .and_then(Value::as_str),
        Some("transcription_generate")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/expectedRoutingSlot")
            .and_then(Value::as_str),
        Some(AUDIO_TRANSCRIPTION_ROUTING_SLOT)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingEvent")
            .and_then(Value::as_str),
        Some("executor_invoked")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/transcript/status")
            .and_then(Value::as_str),
        Some("pending")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/transcript/sourcePath")
            .and_then(Value::as_str),
        Some("/tmp/interview.wav")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/transcriptIndex/transcriptCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/transcriptIndex/statusCounts/0/status"
            )
            .and_then(Value::as_str),
        Some("pending")
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/items/0/executorBindingKey"
            )
            .and_then(Value::as_str),
        Some("transcription_generate")
    );
}

#[test]
fn should_export_web_research_contract_snapshot_from_skill_args() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();

    detail.items.push(AgentThreadItem {
        id: "web-research-contract-skill-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-03-27T10:00:40Z".to_string(),
        completed_at: Some("2026-03-27T10:00:40Z".to_string()),
        updated_at: "2026-03-27T10:00:40Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "Skill".to_string(),
            arguments: Some(json!({
                "skill": "research",
                "args": serde_json::to_string(&json!({
                    "research_request": {
                        "query": "AI Agent 融资",
                        "modality_contract_key": WEB_RESEARCH_CONTRACT_KEY,
                        "modality": "mixed",
                        "required_capabilities": [
                            "text_generation",
                            "web_search",
                            "structured_document_generation",
                            "long_context"
                        ],
                        "routing_slot": WEB_RESEARCH_ROUTING_SLOT,
                        "runtime_contract": {
                            "contract_key": WEB_RESEARCH_CONTRACT_KEY,
                            "routing_slot": WEB_RESEARCH_ROUTING_SLOT,
                        "executor_binding": {
                            "executor_kind": "skill",
                            "binding_key": "research"
                        },
                        "execution_profile": {
                            "profile_key": "web_research_profile"
                        },
                        "executor_adapter": {
                            "adapter_key": "skill:research"
                        }
                    },
                        "entry_source": "at_search_command"
                    }
                })).expect("serialize args")
            })),
            output: Some("ok".to_string()),
            success: Some(true),
            error: None,
            metadata: None,
        },
    });

    let result =
        export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    assert!(result
        .known_gaps
        .iter()
        .all(|gap| !gap.contains("ModalityRuntimeContract")));

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");

    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractKey")
            .and_then(Value::as_str),
        Some(WEB_RESEARCH_CONTRACT_KEY)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/source")
            .and_then(Value::as_str),
        Some("web_research_skill_trace.modality_runtime_contract")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingEvent")
            .and_then(Value::as_str),
        Some("executor_invoked")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/routingOutcome")
            .and_then(Value::as_str),
        Some("accepted")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/expectedRoutingSlot")
            .and_then(Value::as_str),
        Some(WEB_RESEARCH_ROUTING_SLOT)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/executionProfileKey")
            .and_then(Value::as_str),
        Some("web_research_profile")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/executorAdapterKey")
            .and_then(Value::as_str),
        Some("skill:research")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/contractKeys/0")
            .and_then(Value::as_str),
        Some(WEB_RESEARCH_CONTRACT_KEY)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/sourceCounts/0/source")
            .and_then(Value::as_str),
        Some("web_research_skill_trace.modality_runtime_contract")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/routingOutcomeCounts/0/outcome")
            .and_then(Value::as_str),
        Some("accepted")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/traceCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/items/0/entrySource",)
            .and_then(Value::as_str),
        Some("at_search_command")
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/items/0/executorBindingKey",
            )
            .and_then(Value::as_str),
        Some("research")
    );
    assert_eq!(
            runtime
                .pointer(
                    "/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/items/0/executionProfileKey",
                )
                .and_then(Value::as_str),
            Some("web_research_profile")
        );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/items/0/executorAdapterKey",
            )
            .and_then(Value::as_str),
        Some("skill:research")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractMatchedExpected")
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn should_export_web_research_contract_snapshot_from_report_skill_args() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();

    detail.items.push(AgentThreadItem {
        id: "web-research-contract-report-skill-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-03-27T10:00:40Z".to_string(),
        completed_at: Some("2026-03-27T10:00:40Z".to_string()),
        updated_at: "2026-03-27T10:00:40Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "Skill".to_string(),
            arguments: Some(json!({
                "skill": "report_generate",
                "args": serde_json::to_string(&json!({
                    "report_request": {
                        "query": "AI Agent 融资",
                        "modality_contract_key": WEB_RESEARCH_CONTRACT_KEY,
                        "modality": "mixed",
                        "required_capabilities": [
                            "text_generation",
                            "web_search",
                            "structured_document_generation",
                            "long_context"
                        ],
                        "routing_slot": WEB_RESEARCH_ROUTING_SLOT,
                        "runtime_contract": {
                            "contract_key": WEB_RESEARCH_CONTRACT_KEY,
                            "routing_slot": WEB_RESEARCH_ROUTING_SLOT,
                            "executor_binding": {
                                "executor_kind": "skill",
                                "binding_key": "research"
                            }
                        },
                        "entry_source": "at_report_command"
                    }
                })).expect("serialize args")
            })),
            output: Some("ok".to_string()),
            success: Some(true),
            error: None,
            metadata: None,
        },
    });

    export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");

    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotCount")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractKey")
            .and_then(Value::as_str),
        Some(WEB_RESEARCH_CONTRACT_KEY)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/entrySource")
            .and_then(Value::as_str),
        Some("at_report_command")
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/items/0/executorBindingKey"
            )
            .and_then(Value::as_str),
        Some("research")
    );
}

#[test]
fn should_export_text_transform_contract_snapshot_from_summary_skill_args() {
    let temp_dir = TempDir::new().expect("temp dir");
    let mut detail = build_detail();
    let thread_read = build_thread_read();

    detail.items.push(AgentThreadItem {
        id: "text-transform-contract-summary-skill-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        sequence: 4,
        status: AgentThreadItemStatus::Completed,
        started_at: "2026-03-27T10:00:40Z".to_string(),
        completed_at: Some("2026-03-27T10:00:40Z".to_string()),
        updated_at: "2026-03-27T10:00:40Z".to_string(),
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "Skill".to_string(),
            arguments: Some(json!({
                "skill": "summary",
                "args": serde_json::to_string(&json!({
                    "summary_request": {
                        "content": "AI Agent 融资长文",
                        "modality_contract_key": TEXT_TRANSFORM_CONTRACT_KEY,
                        "modality": "document",
                        "required_capabilities": [
                            "text_generation",
                            "local_file_read",
                            "long_context"
                        ],
                        "routing_slot": TEXT_TRANSFORM_ROUTING_SLOT,
                        "runtime_contract": {
                            "contract_key": TEXT_TRANSFORM_CONTRACT_KEY,
                            "routing_slot": TEXT_TRANSFORM_ROUTING_SLOT,
                            "executor_binding": {
                                "executor_kind": "skill",
                                "binding_key": "text_transform"
                            }
                        },
                        "entry_source": "at_summary_command"
                    }
                })).expect("serialize args")
            })),
            output: Some("ok".to_string()),
            success: Some(true),
            error: None,
            metadata: None,
        },
    });

    export_runtime_evidence_pack(&detail, &thread_read, temp_dir.path()).expect("export");

    let runtime_path = temp_dir
        .path()
        .join(".lime/harness/sessions/session-1/evidence/runtime.json");
    let runtime =
        serde_json::from_str::<Value>(fs::read_to_string(runtime_path).expect("runtime").as_str())
            .expect("parse runtime json");

    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/contractKey")
            .and_then(Value::as_str),
        Some(TEXT_TRANSFORM_CONTRACT_KEY)
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshots/0/source")
            .and_then(Value::as_str),
        Some("text_transform_skill_trace.modality_runtime_contract")
    );
    assert_eq!(
        runtime
            .pointer("/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/items/0/entrySource")
            .and_then(Value::as_str),
        Some("at_summary_command")
    );
    assert_eq!(
        runtime
            .pointer(
                "/modalityRuntimeContracts/snapshotIndex/toolTraceIndex/items/0/executorBindingKey"
            )
            .and_then(Value::as_str),
        Some("text_transform")
    );
}
