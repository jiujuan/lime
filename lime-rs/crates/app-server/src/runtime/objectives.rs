use super::status::agent_turn_is_terminal;
use super::*;
use app_server_protocol::*;
use chrono::Utc;
use serde_json::json;

#[derive(Default)]
struct RuntimeContinuationPreferences {
    provider_preference: Option<String>,
    model_preference: Option<String>,
    provider_config: Option<serde_json::Value>,
    approval_policy: Option<String>,
    sandbox_policy: Option<String>,
    execution_strategy: Option<String>,
}

fn normalized_optional_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn runtime_provider_config_from_host_options(
    host_options: &serde_json::Value,
) -> Option<serde_json::Value> {
    let aster_request = host_options.get("asterChatRequest")?;
    aster_request
        .pointer("/turn_config/provider_config")
        .or_else(|| aster_request.pointer("/turn_config/providerConfig"))
        .or_else(|| aster_request.pointer("/turnConfig/provider_config"))
        .or_else(|| aster_request.pointer("/turnConfig/providerConfig"))
        .or_else(|| aster_request.get("provider_config"))
        .or_else(|| aster_request.get("providerConfig"))
        .filter(|value| value.is_object())
        .cloned()
}

impl RuntimeContinuationPreferences {
    fn has_any_context(&self) -> bool {
        self.provider_preference.is_some()
            || self.model_preference.is_some()
            || self.provider_config.is_some()
            || self.approval_policy.is_some()
            || self.sandbox_policy.is_some()
            || self.execution_strategy.is_some()
    }

    fn with_fallback(mut self, fallback: RuntimeContinuationPreferences) -> Self {
        if self.provider_preference.is_none() {
            self.provider_preference = fallback.provider_preference;
        }
        if self.model_preference.is_none() {
            self.model_preference = fallback.model_preference;
        }
        if self.provider_config.is_none() {
            self.provider_config = fallback.provider_config;
        }
        if self.approval_policy.is_none() {
            self.approval_policy = fallback.approval_policy;
        }
        if self.sandbox_policy.is_none() {
            self.sandbox_policy = fallback.sandbox_policy;
        }
        if self.execution_strategy.is_none() {
            self.execution_strategy = fallback.execution_strategy;
        }
        self
    }

    fn provider_preference_for_runtime_options(&self) -> Option<String> {
        if self.provider_config.is_some() {
            None
        } else {
            self.provider_preference.clone()
        }
    }

    fn model_preference_for_runtime_options(&self) -> Option<String> {
        if self.provider_config.is_some() {
            None
        } else {
            self.model_preference.clone()
        }
    }
}

fn continuation_runtime_preferences_from_read(
    read: &AgentSessionReadResponse,
) -> RuntimeContinuationPreferences {
    let execution_runtime = read
        .detail
        .as_ref()
        .and_then(|detail| detail.get("execution_runtime"))
        .filter(|value| value.is_object());
    RuntimeContinuationPreferences {
        provider_preference: string_field_from_optional_value(
            execution_runtime,
            &[
                "provider_selector",
                "providerSelector",
                "provider_name",
                "providerName",
            ],
        ),
        model_preference: string_field_from_optional_value(
            execution_runtime,
            &["model_name", "modelName"],
        ),
        provider_config: None,
        approval_policy: None,
        sandbox_policy: None,
        execution_strategy: string_field_from_optional_value(
            read.session
                .business_object_ref
                .as_ref()
                .and_then(|reference| reference.metadata.as_ref()),
            &["executionStrategy", "execution_strategy"],
        ),
    }
}

fn runtime_string_from_host_options(
    host_options: &serde_json::Value,
    turn_config_keys: &[&str],
    flat_keys: &[&str],
) -> Option<String> {
    let aster_request = host_options.get("asterChatRequest")?;
    aster_request
        .get("turn_config")
        .or_else(|| aster_request.get("turnConfig"))
        .and_then(|turn_config| string_field_from_value(turn_config, turn_config_keys))
        .or_else(|| string_field_from_value(aster_request, flat_keys))
}

fn build_objective_continuation_host_options(
    message: &str,
    session_id: &str,
    event_name: &str,
    workspace_id: &str,
    turn_id: &str,
    queued_turn_id: &str,
    metadata: &serde_json::Value,
    runtime_preferences: &RuntimeContinuationPreferences,
) -> serde_json::Value {
    let turn_config = json!({
        "provider_config": runtime_preferences.provider_config.clone(),
        "provider_preference": runtime_preferences.provider_preference.clone(),
        "model_preference": runtime_preferences.model_preference.clone(),
        "reasoning_effort": null,
        "approval_policy": runtime_preferences.approval_policy.clone(),
        "sandbox_policy": runtime_preferences.sandbox_policy.clone(),
        "metadata": metadata.clone(),
        "execution_strategy": runtime_preferences.execution_strategy.clone(),
    });
    json!({
        "asterChatRequest": {
            "message": message,
            "session_id": session_id,
            "event_name": event_name,
            "images": null,
            "provider_config": runtime_preferences.provider_config.clone(),
            "provider_preference": runtime_preferences.provider_preference.clone(),
            "model_preference": runtime_preferences.model_preference.clone(),
            "reasoning_effort": null,
            "thinking_enabled": null,
            "approval_policy": runtime_preferences.approval_policy.clone(),
            "sandbox_policy": runtime_preferences.sandbox_policy.clone(),
            "project_id": null,
            "workspace_id": workspace_id,
            "web_search": null,
            "search_mode": null,
            "execution_strategy": runtime_preferences.execution_strategy.clone(),
            "auto_continue": null,
            "system_prompt": null,
            "metadata": metadata,
            "turn_id": turn_id,
            "queue_if_busy": false,
            "queued_turn_id": queued_turn_id,
            "turn_config": turn_config,
        }
    })
}

impl RuntimeCore {
    fn resolve_continuation_runtime_preferences(
        &self,
        read: &AgentSessionReadResponse,
    ) -> RuntimeContinuationPreferences {
        self.latest_turn_runtime_preferences(&read.session.session_id)
            .unwrap_or_else(|| continuation_runtime_preferences_from_read(read))
    }

    fn latest_turn_runtime_preferences(
        &self,
        session_id: &str,
    ) -> Option<RuntimeContinuationPreferences> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state.sessions.get(session_id)?;
        stored.turns.iter().rev().find_map(|turn| {
            let runtime_options = stored.turn_runtime_options.get(&turn.turn_id)?;
            let host_preferences = runtime_options
                .host_options
                .as_ref()
                .map(|host_options| RuntimeContinuationPreferences {
                    provider_preference: runtime_string_from_host_options(
                        host_options,
                        &["provider_preference", "providerPreference"],
                        &["provider_preference", "providerPreference"],
                    ),
                    model_preference: runtime_string_from_host_options(
                        host_options,
                        &["model_preference", "modelPreference"],
                        &["model_preference", "modelPreference"],
                    ),
                    provider_config: runtime_provider_config_from_host_options(host_options),
                    approval_policy: runtime_string_from_host_options(
                        host_options,
                        &["approval_policy", "approvalPolicy"],
                        &["approval_policy", "approvalPolicy"],
                    ),
                    sandbox_policy: runtime_string_from_host_options(
                        host_options,
                        &["sandbox_policy", "sandboxPolicy"],
                        &["sandbox_policy", "sandboxPolicy"],
                    ),
                    execution_strategy: runtime_string_from_host_options(
                        host_options,
                        &["execution_strategy", "executionStrategy"],
                        &["execution_strategy", "executionStrategy"],
                    ),
                })
                .unwrap_or_default();
            let runtime_preferences = RuntimeContinuationPreferences {
                provider_preference: normalized_optional_string(
                    runtime_options.provider_preference.as_deref(),
                ),
                model_preference: normalized_optional_string(
                    runtime_options.model_preference.as_deref(),
                ),
                provider_config: runtime_options
                    .host_options
                    .as_ref()
                    .and_then(runtime_provider_config_from_host_options),
                approval_policy: None,
                sandbox_policy: None,
                execution_strategy: None,
            };
            let preferences = host_preferences.with_fallback(runtime_preferences);
            preferences.has_any_context().then_some(preferences)
        })
    }

    pub(in crate::runtime) async fn maybe_submit_managed_objective_auto_continuation(
        &self,
        session_id: &str,
        host: RuntimeHostContext,
    ) {
        if let Err(error) = self
            .submit_managed_objective_auto_continuation_until_stopped(session_id, host)
            .await
        {
            tracing::warn!(
                "[AppServer][Objective] managed objective auto-continuation skipped: session_id={}, error={}",
                session_id,
                error
            );
        }
    }

    async fn submit_managed_objective_auto_continuation_until_stopped(
        &self,
        session_id: &str,
        host: RuntimeHostContext,
    ) -> Result<(), RuntimeCoreError> {
        const MAX_AUTO_CONTINUATION_ITERATIONS: usize = 8;
        for _ in 0..MAX_AUTO_CONTINUATION_ITERATIONS {
            let Some(turn) = self
                .submit_managed_objective_auto_continuation_once(session_id, host.clone())
                .await?
            else {
                return Ok(());
            };
            if !agent_turn_is_terminal(turn.status) {
                return Ok(());
            }
        }
        Err(RuntimeCoreError::Backend(
            "managed objective auto-continuation exceeded safety iteration limit".to_string(),
        ))
    }

    async fn submit_managed_objective_auto_continuation_once(
        &self,
        session_id: &str,
        host: RuntimeHostContext,
    ) -> Result<Option<AgentTurn>, RuntimeCoreError> {
        let objective = self
            .app_data_source
            .read_managed_objective_by_owner(
                crate::objective::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                session_id.to_string(),
            )
            .await?;
        let Some(objective) = objective else {
            return Ok(None);
        };
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let run_summary =
            self.auto_continuation_run_summary(session_id, &objective.objective_id)?;
        let (decision, policy) = crate::objective::resolve_auto_continuation_guard(
            crate::objective::AutoContinuationGuardInput {
                objective: &objective,
                read: &read,
                run_summary: run_summary.clone(),
                now: Utc::now(),
            },
        );

        match decision {
            crate::objective::AutoContinuationGuardDecision::Allow => {
                let queued_turn_id = new_id("queued");
                let turn_id = new_id("turn");
                let workspace_id = self
                    .resolve_objective_workspace_id(session_id, &objective)
                    .await?;
                let message = crate::objective::managed_objective_continuation_message(&objective);
                let event_name = crate::objective::managed_objective_auto_event_name(&objective);
                let metadata = crate::objective::managed_objective_auto_metadata(
                    &objective,
                    &run_summary,
                    &policy,
                );
                let runtime_preferences = self.resolve_continuation_runtime_preferences(&read);
                let runtime_provider_preference =
                    runtime_preferences.provider_preference_for_runtime_options();
                let runtime_model_preference =
                    runtime_preferences.model_preference_for_runtime_options();
                let host_options = build_objective_continuation_host_options(
                    &message,
                    session_id,
                    &event_name,
                    &workspace_id,
                    &turn_id,
                    &queued_turn_id,
                    &metadata,
                    &runtime_preferences,
                );
                self.persist_auto_continuation_guard_audit(
                    session_id,
                    &objective,
                    &crate::objective::AutoContinuationGuardDecision::Allow,
                    &run_summary,
                    &policy,
                    Some(queued_turn_id.as_str()),
                )
                .await?;
                let output = Box::pin(self.start_turn_inner(
                    AgentSessionTurnStartParams {
                        session_id: session_id.to_string(),
                        turn_id: Some(turn_id),
                        input: AgentInput {
                            text: message,
                            attachments: Vec::new(),
                        },
                        runtime_options: Some(app_server_protocol::RuntimeOptions {
                            capability_id: None,
                            stream: true,
                            event_name: Some(event_name),
                            provider_preference: runtime_provider_preference,
                            model_preference: runtime_model_preference,
                            metadata: Some(metadata),
                            queued_turn_id: Some(queued_turn_id.clone()),
                            host_options: Some(host_options),
                            ..app_server_protocol::RuntimeOptions::default()
                        }),
                        queue_if_busy: false,
                        skip_pre_submit_resume: true,
                    },
                    host,
                    None,
                    false,
                ))
                .await?;
                Ok(Some(output.response.turn))
            }
            crate::objective::AutoContinuationGuardDecision::BudgetLimited(_) => {
                self.persist_auto_continuation_guard_audit(
                    session_id,
                    &objective,
                    &decision,
                    &run_summary,
                    &policy,
                    None,
                )
                .await?;
                Ok(None)
            }
            crate::objective::AutoContinuationGuardDecision::Skip(_) => {
                self.persist_auto_continuation_guard_audit(
                    session_id,
                    &objective,
                    &decision,
                    &run_summary,
                    &policy,
                    None,
                )
                .await?;
                Ok(None)
            }
        }
    }

    async fn persist_auto_continuation_guard_audit(
        &self,
        session_id: &str,
        objective: &ManagedObjective,
        decision: &crate::objective::AutoContinuationGuardDecision,
        run_summary: &crate::objective::AutoContinuationRunSummary,
        policy: &crate::objective::AutoContinuationPolicy,
        queued_turn_id: Option<&str>,
    ) -> Result<(), RuntimeCoreError> {
        let Some(update) = crate::objective::build_auto_continuation_guard_audit_update(
            objective,
            decision,
            run_summary,
            policy,
            queued_turn_id,
        ) else {
            return Ok(());
        };
        self.app_data_source
            .audit_agent_session_objective(
                crate::objective::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                session_id.to_string(),
                update,
            )
            .await?;
        Ok(())
    }

    fn auto_continuation_run_summary(
        &self,
        session_id: &str,
        objective_id: &str,
    ) -> Result<crate::objective::AutoContinuationRunSummary, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        let mut summary = crate::objective::AutoContinuationRunSummary::default();
        for turn in stored.turns.iter().filter(|turn| {
            matches!(
                turn.status,
                AgentTurnStatus::Completed | AgentTurnStatus::Failed | AgentTurnStatus::Canceled
            )
        }) {
            let Some(metadata) = stored
                .turn_runtime_options
                .get(&turn.turn_id)
                .and_then(|options| options.metadata.as_ref())
            else {
                continue;
            };
            let Some(managed_objective) = managed_objective_metadata_from_turn(metadata) else {
                continue;
            };
            if string_field_from_value(managed_objective, &["objective_id", "objectiveId"])
                .as_deref()
                != Some(objective_id)
            {
                continue;
            }
            if string_field_from_value(
                managed_objective,
                &["continuation_source", "continuationSource"],
            )
            .as_deref()
                == Some("auto_idle")
            {
                summary.auto_turn_count += 1;
            }
            if let Some(cost) = estimated_total_cost_from_metadata(metadata) {
                summary.estimated_total_cost += cost;
            }
        }
        Ok(summary)
    }
}

fn managed_objective_metadata_from_turn(
    metadata: &serde_json::Value,
) -> Option<&serde_json::Value> {
    metadata
        .pointer("/request_metadata/harness/managed_objective")
        .or_else(|| metadata.pointer("/request_metadata/managed_objective"))
        .or_else(|| metadata.pointer("/harness/managed_objective"))
        .or_else(|| metadata.get("managed_objective"))
}

fn estimated_total_cost_from_metadata(metadata: &serde_json::Value) -> Option<f64> {
    metadata
        .pointer("/cost_state/estimatedTotalCost")
        .or_else(|| metadata.pointer("/cost_state/estimated_total_cost"))
        .or_else(|| {
            metadata.pointer("/request_metadata/lime_runtime/cost_state/estimatedTotalCost")
        })
        .or_else(|| {
            metadata.pointer("/request_metadata/lime_runtime/cost_state/estimated_total_cost")
        })
        .and_then(serde_json::Value::as_f64)
}

fn string_field_from_value(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn string_field_from_optional_value(
    value: Option<&serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    value.and_then(|value| string_field_from_value(value, keys))
}

impl RuntimeCore {
    pub async fn read_agent_session_objective(
        &self,
        params: AgentSessionObjectiveReadParams,
    ) -> Result<AgentSessionObjectiveReadResponse, RuntimeCoreError> {
        self.app_data_source
            .read_agent_session_objective(params)
            .await
    }

    pub async fn read_agent_session_tool_inventory(
        &self,
        params: AgentSessionToolInventoryReadParams,
    ) -> Result<AgentSessionToolInventoryReadResponse, RuntimeCoreError> {
        let inventory = self
            .backend
            .read_tool_inventory(ToolInventoryReadRequest {
                caller: params.caller,
                workbench: params.workbench,
                browser_assist: params.browser_assist,
                metadata: params.metadata,
            })
            .await?;
        Ok(AgentSessionToolInventoryReadResponse { inventory })
    }

    pub async fn set_agent_session_objective(
        &self,
        params: AgentSessionObjectiveSetParams,
    ) -> Result<AgentSessionObjectiveSetResponse, RuntimeCoreError> {
        self.app_data_source
            .set_agent_session_objective(params)
            .await
    }

    pub async fn update_agent_session_objective_status(
        &self,
        params: AgentSessionObjectiveStatusUpdateParams,
    ) -> Result<AgentSessionObjectiveStatusUpdateResponse, RuntimeCoreError> {
        self.app_data_source
            .update_agent_session_objective_status(params)
            .await
    }

    pub async fn clear_agent_session_objective(
        &self,
        params: AgentSessionObjectiveClearParams,
    ) -> Result<AgentSessionObjectiveClearResponse, RuntimeCoreError> {
        self.app_data_source
            .clear_agent_session_objective(params)
            .await
    }

    pub async fn continue_agent_session_objective(
        &self,
        params: AgentSessionObjectiveContinueParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionObjectiveContinueResponse>, RuntimeCoreError> {
        let session_id = crate::objective::normalize_required_id(
            &params.session_id,
            "sessionId is required for agentSession/objective/continue",
        )?;
        let owner = crate::objective::resolve_managed_objective_owner(
            &session_id,
            params.owner_kind.as_deref(),
            params.owner_id.as_deref(),
        )?;
        crate::objective::ensure_agent_session_objective_owner(&owner, &session_id)?;

        let objective = self
            .read_agent_session_objective(AgentSessionObjectiveReadParams {
                session_id: session_id.clone(),
            })
            .await?
            .objective
            .ok_or_else(|| RuntimeCoreError::Backend("当前会话还没有目标".to_string()))?;
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        crate::objective::ensure_objective_can_continue(&objective, &read)?;
        let turn_id = new_id("turn");
        let queued_turn_id = new_id("queued");
        let workspace_id = self
            .resolve_objective_workspace_id(&session_id, &objective)
            .await?;
        let message = crate::objective::managed_objective_continuation_message(&objective);
        let event_name = crate::objective::managed_objective_event_name(&objective);
        let metadata = crate::objective::managed_objective_continuation_metadata(&objective);
        let runtime_preferences = self.resolve_continuation_runtime_preferences(&read);
        let runtime_provider_preference =
            runtime_preferences.provider_preference_for_runtime_options();
        let runtime_model_preference = runtime_preferences.model_preference_for_runtime_options();
        let host_options = build_objective_continuation_host_options(
            &message,
            &session_id,
            &event_name,
            &workspace_id,
            &turn_id,
            &queued_turn_id,
            &metadata,
            &runtime_preferences,
        );

        let output = self
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: session_id.clone(),
                    turn_id: Some(turn_id),
                    input: AgentInput {
                        text: message,
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(app_server_protocol::RuntimeOptions {
                        capability_id: None,
                        stream: true,
                        event_name: Some(event_name),
                        provider_preference: runtime_provider_preference,
                        model_preference: runtime_model_preference,
                        metadata: Some(metadata),
                        queued_turn_id: Some(queued_turn_id.clone()),
                        host_options: Some(host_options),
                        ..app_server_protocol::RuntimeOptions::default()
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                host,
            )
            .await?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionObjectiveContinueResponse {
                submitted: true,
                queued_turn_id,
                objective,
                turn: output.response.turn,
            },
            events: output.events,
        })
    }

    pub async fn audit_agent_session_objective(
        &self,
        params: AgentSessionObjectiveAuditParams,
    ) -> Result<AgentSessionObjectiveAuditResponse, RuntimeCoreError> {
        let session_id = crate::objective::normalize_required_id(
            &params.session_id,
            "sessionId is required for agentSession/objective/audit",
        )?;
        let owner = crate::objective::resolve_managed_objective_owner(
            &session_id,
            params.owner_kind.as_deref(),
            params.owner_id.as_deref(),
        )?;
        let objective = self
            .app_data_source
            .read_managed_objective_by_owner(owner.owner_kind.clone(), owner.owner_id.clone())
            .await?
            .ok_or_else(|| {
                if owner.owner_kind == crate::objective::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION {
                    RuntimeCoreError::Backend("当前会话还没有目标".to_string())
                } else {
                    RuntimeCoreError::Backend("当前目标 owner 还没有目标".to_string())
                }
            })?;
        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let evidence = self
            .export_evidence(EvidenceExportParams {
                session_id,
                turn_id: None,
                include_events: Some(true),
                include_artifacts: Some(true),
                include_evidence_pack: Some(true),
            })
            .await
            .ok();
        let audit_update = crate::objective::build_managed_objective_audit_update(
            &objective,
            &read,
            evidence
                .as_ref()
                .and_then(|response| response.evidence_pack.as_ref()),
        );
        let objective = self
            .app_data_source
            .audit_agent_session_objective(owner.owner_kind, owner.owner_id, audit_update)
            .await?
            .ok_or_else(|| RuntimeCoreError::Backend("保存目标审计结果后读取失败".to_string()))?;
        Ok(AgentSessionObjectiveAuditResponse { objective })
    }

    async fn resolve_objective_workspace_id(
        &self,
        session_id: &str,
        objective: &ManagedObjective,
    ) -> Result<String, RuntimeCoreError> {
        if let Some(workspace_id) = objective
            .workspace_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Ok(workspace_id.to_string());
        }

        let read = self
            .read_session_current(AgentSessionReadParams {
                session_id: session_id.to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        read.session
            .workspace_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "agentSession/objective/continue requires a workspaceId".to_string(),
                )
            })
    }
}
