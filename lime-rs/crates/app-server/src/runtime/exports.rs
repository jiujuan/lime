mod builders;
mod files;
mod metrics;

use self::builders::*;
use self::files::*;
use self::metrics::*;
use super::artifact_projection;
use super::timestamp;
use super::EvidencePackRequest;
use super::RuntimeCore;
use super::RuntimeCoreError;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionAnalysisHandoffExportParams;
use app_server_protocol::AgentSessionAnalysisHandoffExportResponse;
use app_server_protocol::AgentSessionHandoffBundleExportParams;
use app_server_protocol::AgentSessionHandoffBundleExportResponse;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionReplayCaseExportParams;
use app_server_protocol::AgentSessionReplayCaseExportResponse;
use app_server_protocol::AgentSessionReviewDecision;
use app_server_protocol::AgentSessionReviewDecisionSaveParams;
use app_server_protocol::AgentSessionReviewDecisionTemplateExportParams;
use app_server_protocol::AgentSessionReviewDecisionTemplateExportResponse;
use app_server_protocol::AgentTurn;
use app_server_protocol::ArtifactSummary;
use app_server_protocol::EvidenceExportParams;
use app_server_protocol::EvidenceExportResponse;
use app_server_protocol::EvidencePackSummary;
use app_server_protocol::MemoryStoreRootParams;
use app_server_protocol::MemoryStoreScope;
use lime_infra::telemetry::RequestLog;
use std::collections::BTreeMap;
use std::fs;

const HANDOFF_BUNDLE_RELATIVE_ROOT: &str = ".lime/harness/sessions";
const HANDOFF_PLAN_FILE_NAME: &str = "plan.md";
const HANDOFF_PROGRESS_FILE_NAME: &str = "progress.json";
const HANDOFF_FILE_NAME: &str = "handoff.md";
const HANDOFF_REVIEW_SUMMARY_FILE_NAME: &str = "review-summary.md";
const HANDOFF_RECENT_ARTIFACT_LIMIT: usize = 8;
const REPLAY_CASE_INPUT_FILE_NAME: &str = "input.json";
const REPLAY_CASE_EXPECTED_FILE_NAME: &str = "expected.json";
const REPLAY_CASE_GRADER_FILE_NAME: &str = "grader.md";
const REPLAY_CASE_EVIDENCE_LINKS_FILE_NAME: &str = "evidence-links.json";
const ANALYSIS_BRIEF_FILE_NAME: &str = "analysis-brief.md";
const ANALYSIS_CONTEXT_FILE_NAME: &str = "analysis-context.json";
const REVIEW_DECISION_MARKDOWN_FILE_NAME: &str = "review-decision.md";
const REVIEW_DECISION_JSON_FILE_NAME: &str = "review-decision.json";

impl RuntimeCore {
    pub async fn export_evidence(
        &self,
        params: EvidenceExportParams,
    ) -> Result<EvidenceExportResponse, RuntimeCoreError> {
        let context = self
            .load_session_current(AgentSessionReadParams {
                session_id: params.session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let stored = context.stored;
        let session = stored.session.clone();
        let turns = match params.turn_id.as_deref() {
            Some(turn_id) => stored
                .turns
                .iter()
                .filter(|turn| turn.turn_id == turn_id)
                .cloned()
                .collect(),
            None => stored.turns.clone(),
        };
        let events = if params.include_events.unwrap_or(true) {
            artifact_projection::events_for_turn(&stored.events, params.turn_id.as_deref())
        } else {
            Vec::new()
        };
        let artifacts = if params.include_artifacts.unwrap_or(true) {
            artifact_projection::stored_artifact_summaries_for_turn(
                &stored,
                params.turn_id.as_deref(),
            )
        } else {
            Vec::new()
        };

        if let Some(turn_id) = params.turn_id.as_deref() {
            if turns.is_empty() {
                return Err(RuntimeCoreError::TurnNotActive(turn_id.to_string()));
            }
        }
        let request_logs =
            self.request_logs_for_evidence(&session.session_id, params.turn_id.as_deref());
        let workflow_audit_events =
            self.workflow_audit_events_for_evidence(&session.session_id, params.turn_id.as_deref());
        let turn_runtime_metadata = turns
            .iter()
            .filter_map(|turn| {
                stored
                    .turn_runtime_options
                    .get(&turn.turn_id)
                    .and_then(|options| options.metadata.clone())
                    .map(|metadata| (turn.turn_id.clone(), metadata))
            })
            .collect::<BTreeMap<_, _>>();
        let evidence_pack = if params.include_evidence_pack.unwrap_or(true) {
            let evidence_pack = self
                .evidence_export_provider
                .export_evidence_pack(&EvidencePackRequest {
                    session: session.clone(),
                    turns: turns.clone(),
                    events: events.clone(),
                    artifacts: artifacts.clone(),
                    turn_runtime_metadata,
                    request_logs: request_logs.clone(),
                    workflow_audit_events: workflow_audit_events.clone(),
                })
                .await?;
            self.with_current_objective_completion_audit_summary(
                evidence_pack,
                &session,
                &turns,
                &events,
                &artifacts,
            )
            .await
        } else {
            None
        };

        Ok(EvidenceExportResponse {
            session,
            turns,
            events,
            artifacts,
            exported_at: timestamp(),
            evidence_pack,
        })
    }

    fn request_logs_for_evidence(
        &self,
        session_id: &str,
        turn_id: Option<&str>,
    ) -> Vec<RequestLog> {
        let Some(telemetry_store) = &self.telemetry_store else {
            return Vec::new();
        };

        let result = match turn_id {
            Some(turn_id) => {
                telemetry_store.read_request_logs_for_session_turn(session_id, Some(turn_id))
            }
            None => telemetry_store.read_request_logs_for_session(session_id),
        };

        match result {
            Ok(logs) => logs,
            Err(error) => {
                tracing::warn!(
                    "failed to read request telemetry for evidence export session={} turn={:?}: {}",
                    session_id,
                    turn_id,
                    error
                );
                Vec::new()
            }
        }
    }

    fn workflow_audit_events_for_evidence(
        &self,
        session_id: &str,
        turn_id: Option<&str>,
    ) -> Vec<AgentEvent> {
        let Some(event_log_writer) = self.event_log_writer.as_ref() else {
            return Vec::new();
        };

        match event_log_writer.read_session_workflow_audit_events(session_id) {
            Ok(records) => records
                .into_iter()
                .map(|record| record.event)
                .filter(|event| {
                    turn_id.is_none()
                        || event
                            .turn_id
                            .as_deref()
                            .is_some_and(|event_turn_id| Some(event_turn_id) == turn_id)
                })
                .collect(),
            Err(error) => {
                tracing::warn!(
                    "failed to read workflow audit events for evidence export session={} turn={:?}: {}",
                    session_id,
                    turn_id,
                    error
                );
                Vec::new()
            }
        }
    }

    async fn with_current_objective_completion_audit_summary(
        &self,
        evidence_pack: Option<EvidencePackSummary>,
        session: &AgentSession,
        turns: &[AgentTurn],
        events: &[AgentEvent],
        artifacts: &[ArtifactSummary],
    ) -> Option<EvidencePackSummary> {
        let Some(objective) = self
            .app_data_source
            .read_managed_objective_by_owner(
                crate::objective::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                session.session_id.clone(),
            )
            .await
            .ok()
            .flatten()
        else {
            return evidence_pack;
        };
        let Some(completion_audit_summary) = current_objective_completion_audit_summary(&objective)
        else {
            return evidence_pack;
        };
        let mut pack = evidence_pack.unwrap_or_else(|| {
            build_runtime_evidence_pack_summary(
                session,
                turns,
                events,
                artifacts,
                "current_objective_projection",
            )
        });
        pack.completion_audit_summary = Some(completion_audit_summary);
        Some(pack)
    }

    pub async fn export_handoff_bundle(
        &self,
        params: AgentSessionHandoffBundleExportParams,
    ) -> Result<AgentSessionHandoffBundleExportResponse, RuntimeCoreError> {
        let session_id = params.session_id.trim().to_string();
        if session_id.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "sessionId is required for agentSession/handoffBundle/export".to_string(),
            ));
        }
        validate_handoff_session_id(&session_id)?;

        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let workspace_root = resolve_handoff_workspace_root(&read)?;
        let workspace_root = workspace_root
            .canonicalize()
            .map_err(|error| RuntimeCoreError::Backend(format!(
                "workspaceRoot must be an existing directory for agentSession/handoffBundle/export: {} ({error})",
                workspace_root.display()
            )))?;
        if !workspace_root.is_dir() {
            return Err(RuntimeCoreError::Backend(format!(
                "workspaceRoot must be a directory for agentSession/handoffBundle/export: {}",
                workspace_root.display()
            )));
        }

        let copy = handoff_copy(params.locale.as_deref());
        let exported_at = timestamp();
        let bundle_relative_root = format!("{HANDOFF_BUNDLE_RELATIVE_ROOT}/{session_id}");
        let bundle_absolute_root = workspace_root
            .join(".lime")
            .join("harness")
            .join("sessions")
            .join(&session_id);
        fs::create_dir_all(&bundle_absolute_root).map_err(|error| {
            RuntimeCoreError::Backend(format!(
                "failed to create handoff bundle directory {}: {error}",
                bundle_absolute_root.display()
            ))
        })?;

        let metrics = handoff_metrics(&read);
        let recent_artifacts = handoff_recent_artifacts(&read);
        let artifacts = vec![
            write_handoff_bundle_file(
                &bundle_absolute_root,
                &bundle_relative_root,
                HANDOFF_PLAN_FILE_NAME,
                "plan",
                copy.plan_title,
                build_handoff_plan_markdown(&read, &metrics, &recent_artifacts, &exported_at, copy),
            )?,
            write_handoff_bundle_file(
                &bundle_absolute_root,
                &bundle_relative_root,
                HANDOFF_PROGRESS_FILE_NAME,
                "progress",
                copy.progress_title,
                build_handoff_progress_json(
                    &read,
                    &metrics,
                    &recent_artifacts,
                    &workspace_root,
                    &exported_at,
                )?,
            )?,
            write_handoff_bundle_file(
                &bundle_absolute_root,
                &bundle_relative_root,
                HANDOFF_FILE_NAME,
                "handoff",
                copy.handoff_title,
                build_handoff_markdown(&read, &metrics, &recent_artifacts, &exported_at, copy),
            )?,
            write_handoff_bundle_file(
                &bundle_absolute_root,
                &bundle_relative_root,
                HANDOFF_REVIEW_SUMMARY_FILE_NAME,
                "review_summary",
                copy.review_summary_title,
                build_handoff_review_summary_markdown(
                    &read,
                    &metrics,
                    &recent_artifacts,
                    &exported_at,
                    copy,
                ),
            )?,
        ];

        self.write_export_rollout_summary_candidate(
            &read,
            &metrics,
            &recent_artifacts,
            &workspace_root,
            &exported_at,
            &bundle_relative_root,
            "handoff_bundle",
            "agentSession/handoffBundle/export",
        )
        .await?;

        Ok(AgentSessionHandoffBundleExportResponse {
            session_id: read.session.session_id,
            thread_id: read.session.thread_id,
            workspace_id: read.session.workspace_id,
            workspace_root: workspace_root.to_string_lossy().to_string(),
            bundle_relative_root,
            bundle_absolute_root: bundle_absolute_root.to_string_lossy().to_string(),
            exported_at,
            thread_status: metrics.thread_status,
            latest_turn_status: metrics.latest_turn_status,
            pending_request_count: metrics.pending_request_count,
            queued_turn_count: metrics.queued_turn_count,
            active_subagent_count: metrics.active_subagent_count,
            todo_total: metrics.todo_total,
            todo_pending: metrics.todo_pending,
            todo_in_progress: metrics.todo_in_progress,
            todo_completed: metrics.todo_completed,
            artifacts,
        })
    }

    pub async fn export_replay_case(
        &self,
        params: AgentSessionReplayCaseExportParams,
    ) -> Result<AgentSessionReplayCaseExportResponse, RuntimeCoreError> {
        const METHOD: &str = "agentSession/replayCase/export";
        let session_id = required_runtime_export_session_id(&params.session_id, METHOD)?;
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let workspace_root = canonical_runtime_export_workspace_root(&read, METHOD)?;
        let exported_at = timestamp();
        let metrics = handoff_metrics(&read);
        let recent_artifacts = handoff_recent_artifacts(&read);
        let (handoff_relative_root, evidence_relative_root, _) =
            runtime_export_base_roots(&session_id);
        let (replay_relative_root, replay_absolute_root) =
            runtime_export_root(&workspace_root, &session_id, "replay");
        ensure_runtime_export_root(&replay_absolute_root)?;

        let artifacts = vec![
            write_runtime_export_file(
                &replay_absolute_root,
                &replay_relative_root,
                REPLAY_CASE_INPUT_FILE_NAME,
                "input",
                "Replay input",
                build_replay_input_json(&read, &metrics, &recent_artifacts, &exported_at)?,
            )?,
            write_runtime_export_file(
                &replay_absolute_root,
                &replay_relative_root,
                REPLAY_CASE_EXPECTED_FILE_NAME,
                "expected",
                "Replay expected result",
                build_replay_expected_json(&read, &metrics, &exported_at)?,
            )?,
            write_runtime_export_file(
                &replay_absolute_root,
                &replay_relative_root,
                REPLAY_CASE_GRADER_FILE_NAME,
                "grader",
                "Replay grader",
                build_replay_grader_markdown(&read, &metrics, &exported_at),
            )?,
            write_runtime_export_file(
                &replay_absolute_root,
                &replay_relative_root,
                REPLAY_CASE_EVIDENCE_LINKS_FILE_NAME,
                "evidence_links",
                "Replay evidence links",
                build_replay_evidence_links_json(
                    &session_id,
                    &handoff_relative_root,
                    &evidence_relative_root,
                    &recent_artifacts,
                    &exported_at,
                )?,
            )?,
        ];

        self.write_export_rollout_summary_candidate(
            &read,
            &metrics,
            &recent_artifacts,
            &workspace_root,
            &exported_at,
            &replay_relative_root,
            "replay_case",
            METHOD,
        )
        .await?;

        Ok(AgentSessionReplayCaseExportResponse {
            session_id: read.session.session_id,
            thread_id: read.session.thread_id,
            workspace_id: read.session.workspace_id,
            workspace_root: workspace_root.to_string_lossy().to_string(),
            replay_relative_root,
            replay_absolute_root: replay_absolute_root.to_string_lossy().to_string(),
            handoff_bundle_relative_root: handoff_relative_root,
            evidence_pack_relative_root: evidence_relative_root,
            exported_at,
            thread_status: metrics.thread_status,
            latest_turn_status: metrics.latest_turn_status,
            pending_request_count: metrics.pending_request_count,
            queued_turn_count: metrics.queued_turn_count,
            linked_handoff_artifact_count: 0,
            linked_evidence_artifact_count: recent_artifacts.len(),
            recent_artifact_count: recent_artifacts.len(),
            artifacts,
        })
    }

    pub async fn export_analysis_handoff(
        &self,
        params: AgentSessionAnalysisHandoffExportParams,
    ) -> Result<AgentSessionAnalysisHandoffExportResponse, RuntimeCoreError> {
        const METHOD: &str = "agentSession/analysisHandoff/export";
        let session_id = required_runtime_export_session_id(&params.session_id, METHOD)?;
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let workspace_root = canonical_runtime_export_workspace_root(&read, METHOD)?;
        let exported_at = timestamp();
        let metrics = handoff_metrics(&read);
        let recent_artifacts = handoff_recent_artifacts(&read);
        let (handoff_relative_root, evidence_relative_root, replay_relative_root) =
            runtime_export_base_roots(&session_id);
        let (analysis_relative_root, analysis_absolute_root) =
            runtime_export_root(&workspace_root, &session_id, "analysis");
        ensure_runtime_export_root(&analysis_absolute_root)?;

        let title = "External Analysis Handoff".to_string();
        let copy_prompt =
            build_analysis_copy_prompt(&read, &analysis_relative_root, &replay_relative_root);
        let artifacts = vec![
            write_runtime_export_file(
                &analysis_absolute_root,
                &analysis_relative_root,
                ANALYSIS_BRIEF_FILE_NAME,
                "analysis_brief",
                "Analysis brief",
                build_analysis_brief_markdown(&read, &metrics, &recent_artifacts, &exported_at),
            )?,
            write_runtime_export_file(
                &analysis_absolute_root,
                &analysis_relative_root,
                ANALYSIS_CONTEXT_FILE_NAME,
                "analysis_context",
                "Analysis context",
                build_analysis_context_json(
                    &read,
                    &metrics,
                    &workspace_root,
                    &replay_relative_root,
                    &handoff_relative_root,
                    &evidence_relative_root,
                    &exported_at,
                )?,
            )?,
        ];

        self.write_export_rollout_summary_candidate(
            &read,
            &metrics,
            &recent_artifacts,
            &workspace_root,
            &exported_at,
            &analysis_relative_root,
            "analysis_handoff",
            METHOD,
        )
        .await?;

        Ok(AgentSessionAnalysisHandoffExportResponse {
            session_id: read.session.session_id,
            thread_id: read.session.thread_id,
            workspace_id: read.session.workspace_id,
            workspace_root: workspace_root.to_string_lossy().to_string(),
            sanitized_workspace_root: sanitized_workspace_root(&workspace_root),
            analysis_relative_root,
            analysis_absolute_root: analysis_absolute_root.to_string_lossy().to_string(),
            handoff_bundle_relative_root: handoff_relative_root,
            evidence_pack_relative_root: evidence_relative_root,
            replay_case_relative_root: replay_relative_root,
            exported_at,
            thread_status: metrics.thread_status,
            latest_turn_status: metrics.latest_turn_status,
            pending_request_count: metrics.pending_request_count,
            queued_turn_count: metrics.queued_turn_count,
            title,
            copy_prompt,
            artifacts,
        })
    }

    async fn write_export_rollout_summary_candidate(
        &self,
        read: &app_server_protocol::AgentSessionReadResponse,
        metrics: &HandoffMetrics,
        recent_artifacts: &[HandoffRecentArtifact],
        workspace_root: &std::path::Path,
        exported_at: &str,
        export_relative_root: &str,
        export_kind: &str,
        source_method: &str,
    ) -> Result<(), RuntimeCoreError> {
        self.app_data_source
            .write_memory_rollout_summary(crate::RolloutSummaryWriteParams {
                root: MemoryStoreRootParams {
                    scope: MemoryStoreScope::Workspace,
                    workspace_root: Some(workspace_root.to_string_lossy().to_string()),
                },
                title: format!("{export_kind}-{}", read.session.session_id),
                source: source_method.to_string(),
                exported_at: exported_at.to_string(),
                content: build_rollout_summary_candidate_markdown(
                    read,
                    metrics,
                    recent_artifacts,
                    exported_at,
                    export_relative_root,
                    export_kind,
                ),
            })
            .await?;
        Ok(())
    }

    pub async fn export_review_decision_template(
        &self,
        params: AgentSessionReviewDecisionTemplateExportParams,
    ) -> Result<AgentSessionReviewDecisionTemplateExportResponse, RuntimeCoreError> {
        self.sync_review_decision(
            params.session_id,
            params.locale,
            default_review_decision(),
            false,
        )
        .await
    }

    pub async fn save_review_decision(
        &self,
        params: AgentSessionReviewDecisionSaveParams,
    ) -> Result<AgentSessionReviewDecisionTemplateExportResponse, RuntimeCoreError> {
        let decision = review_decision_from_save_params(&params);
        self.sync_review_decision(params.session_id, params.locale, decision, true)
            .await
    }

    async fn sync_review_decision(
        &self,
        session_id: String,
        _locale: Option<String>,
        decision: AgentSessionReviewDecision,
        saving: bool,
    ) -> Result<AgentSessionReviewDecisionTemplateExportResponse, RuntimeCoreError> {
        let method = if saving {
            "agentSession/reviewDecision/save"
        } else {
            "agentSession/reviewDecisionTemplate/export"
        };
        let session_id = required_runtime_export_session_id(&session_id, method)?;
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let workspace_root = canonical_runtime_export_workspace_root(&read, method)?;
        let exported_at = timestamp();
        let metrics = handoff_metrics(&read);
        let recent_artifacts = handoff_recent_artifacts(&read);
        let (handoff_relative_root, evidence_relative_root, replay_relative_root) =
            runtime_export_base_roots(&session_id);
        let (analysis_relative_root, analysis_absolute_root) =
            runtime_export_root(&workspace_root, &session_id, "analysis");
        ensure_runtime_export_root(&analysis_absolute_root)?;
        let (review_relative_root, review_absolute_root) =
            runtime_export_root(&workspace_root, &session_id, "review");
        ensure_runtime_export_root(&review_absolute_root)?;

        let analysis_artifacts = vec![
            write_runtime_export_file(
                &analysis_absolute_root,
                &analysis_relative_root,
                ANALYSIS_CONTEXT_FILE_NAME,
                "analysis_context",
                "Analysis context",
                build_analysis_context_json(
                    &read,
                    &metrics,
                    &workspace_root,
                    &replay_relative_root,
                    &handoff_relative_root,
                    &evidence_relative_root,
                    &exported_at,
                )?,
            )?,
            write_runtime_export_file(
                &analysis_absolute_root,
                &analysis_relative_root,
                ANALYSIS_BRIEF_FILE_NAME,
                "analysis_brief",
                "Analysis brief",
                build_analysis_brief_markdown(&read, &metrics, &recent_artifacts, &exported_at),
            )?,
        ];
        let artifacts = vec![
            write_runtime_export_file(
                &review_absolute_root,
                &review_relative_root,
                REVIEW_DECISION_MARKDOWN_FILE_NAME,
                "review_decision_markdown",
                "Review decision",
                build_review_decision_markdown(
                    &read,
                    &decision,
                    &analysis_relative_root,
                    &replay_relative_root,
                    &exported_at,
                ),
            )?,
            write_runtime_export_file(
                &review_absolute_root,
                &review_relative_root,
                REVIEW_DECISION_JSON_FILE_NAME,
                "review_decision_json",
                "Review decision JSON",
                build_review_decision_json(
                    &read,
                    &decision,
                    &analysis_relative_root,
                    &replay_relative_root,
                    &exported_at,
                )?,
            )?,
        ];

        if saving {
            self.write_export_rollout_summary_candidate(
                &read,
                &metrics,
                &recent_artifacts,
                &workspace_root,
                &exported_at,
                &review_relative_root,
                "review_decision",
                method,
            )
            .await?;
        }

        Ok(AgentSessionReviewDecisionTemplateExportResponse {
            session_id: read.session.session_id,
            thread_id: read.session.thread_id,
            workspace_id: read.session.workspace_id,
            workspace_root: workspace_root.to_string_lossy().to_string(),
            review_relative_root,
            review_absolute_root: review_absolute_root.to_string_lossy().to_string(),
            analysis_relative_root,
            analysis_absolute_root: analysis_absolute_root.to_string_lossy().to_string(),
            handoff_bundle_relative_root: handoff_relative_root,
            evidence_pack_relative_root: evidence_relative_root,
            replay_case_relative_root: replay_relative_root,
            exported_at,
            thread_status: metrics.thread_status,
            latest_turn_status: metrics.latest_turn_status,
            pending_request_count: metrics.pending_request_count,
            queued_turn_count: metrics.queued_turn_count,
            title: "Review Decision".to_string(),
            default_decision_status: "pending_review".to_string(),
            decision,
            decision_status_options: vec![
                "pending_review".to_string(),
                "accepted".to_string(),
                "deferred".to_string(),
                "rejected".to_string(),
                "needs_more_evidence".to_string(),
            ],
            risk_level_options: vec![
                "unknown".to_string(),
                "low".to_string(),
                "medium".to_string(),
                "high".to_string(),
            ],
            review_checklist: vec![
                "Confirm current App Server path evidence.".to_string(),
                "Confirm no legacy agent_runtime_* production fallback is required.".to_string(),
                "Run targeted regression before accepting.".to_string(),
            ],
            analysis_artifacts,
            artifacts,
        })
    }
}
