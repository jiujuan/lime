use super::*;

pub(crate) fn build_runtime_run_finish_decision<T>(
    result: &Result<T, String>,
    run_start_metadata: &serde_json::Map<String, serde_json::Value>,
    run_observation: &Arc<Mutex<ChatRunObservation>>,
) -> RunFinishDecision {
    let observation = match run_observation.lock() {
        Ok(guard) => guard.clone(),
        Err(error) => {
            tracing::warn!("[AsterAgent] finalize run metadata 时 observation lock 已 poisoned");
            error.into_inner().clone()
        }
    };
    let metadata = build_chat_run_finish_metadata(run_start_metadata, &observation);

    match result {
        Ok(_) => RunFinishDecision {
            status: lime_core::database::dao::agent_run::AgentRunStatus::Success,
            error_code: None,
            error_message: None,
            metadata: Some(metadata),
        },
        Err(error) => RunFinishDecision {
            status: lime_core::database::dao::agent_run::AgentRunStatus::Error,
            error_code: Some("chat_stream_failed".to_string()),
            error_message: Some(error.clone()),
            metadata: Some(metadata),
        },
    }
}

pub(super) fn is_runtime_turn_cancelled_error(error: &str) -> bool {
    error.trim() == RUNTIME_TURN_CANCELLED_MESSAGE
}

pub(crate) async fn finalize_runtime_turn_result(
    agent: &Agent,
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    event_name: &str,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    workspace_root: &str,
    runtime_status_session_config: &aster::agents::types::SessionConfig,
    profile_stream: &AgentRuntimeProfileStream,
    task_profile_refs: &RuntimeTurnTaskProfileRefs,
    session_id: &str,
    request_metadata: Option<&serde_json::Value>,
    result: Result<String, String>,
) -> Result<(), String> {
    complete_runtime_status_projection(
        agent,
        app,
        event_name,
        timeline_recorder,
        workspace_root,
        runtime_status_session_config,
    )
    .await;

    let terminal_events = {
        let mut recorder = match timeline_recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        match result.as_ref() {
            Ok(_) => recorder.complete_turn_success(),
            Err(error) if is_runtime_turn_cancelled_error(error) => recorder.abort_turn(error),
            Err(error) => recorder.fail_turn(error),
        }
    };
    if let Err(error) = &terminal_events {
        let message = match result.as_ref() {
            Ok(_) => "完成 turn 时间线失败",
            Err(_) => "记录失败 turn 时间线失败",
        };
        tracing::warn!("[AsterAgent] {}（已降级继续）: {}", message, error);
    }
    if let Ok(events) = terminal_events {
        emit_runtime_events(app, event_name, events);
    }
    match result.as_ref() {
        Ok(_) => {
            emit_agent_runtime_profile_event(
                app,
                event_name,
                build_runtime_task_completed_profile_event(profile_stream, task_profile_refs),
            );
            emit_agent_runtime_profile_event(app, event_name, profile_stream.turn_completed());
            emit_agent_runtime_profile_event(
                app,
                event_name,
                profile_stream.snapshot_updated("completed"),
            );
        }
        Err(error) => {
            let failure_category = profile_failure_category(error);
            for event in build_runtime_task_failed_profile_events(
                profile_stream,
                task_profile_refs,
                failure_category,
                error,
                false,
            ) {
                emit_agent_runtime_profile_event(app, event_name, event);
            }
            emit_agent_runtime_profile_event(
                app,
                event_name,
                profile_stream.turn_failed(failure_category, error),
            );
            emit_agent_runtime_profile_event(
                app,
                event_name,
                profile_stream.snapshot_updated("failed"),
            );
        }
    }

    match result {
        Ok(assistant_output) => {
            let unsupported_stop_warning = run_runtime_stop_project_hooks_for_session_with_runtime(
                db,
                state,
                app.state::<crate::mcp::McpManagerState>().inner(),
                session_id,
                false,
                Some(assistant_output.as_str()),
            )
            .await;
            if let Some(message) = unsupported_stop_warning {
                emit_runtime_side_event(
                    app,
                    event_name,
                    timeline_recorder,
                    workspace_root,
                    RuntimeAgentEvent::Warning {
                        code: Some(STOP_HOOK_CONTINUATION_UNSUPPORTED_WARNING_CODE.to_string()),
                        message,
                    },
                );
            }
            let done_event = resolve_runtime_final_done_event(session_id, Some(db)).await;
            if let RuntimeAgentEvent::FinalDone {
                usage: Some(ref usage),
            } = done_event
            {
                if let Err(error) = persist_latest_assistant_message_usage(db, session_id, usage) {
                    tracing::warn!(
                        "[AsterAgent] 持久化消息 usage 失败（已降级继续）: {}",
                        error
                    );
                }

                if let Some(cost_state) = extract_runtime_resolution_payload::<
                    lime_agent::SessionExecutionRuntimeCostState,
                >(request_metadata, "cost_state")
                {
                    emit_runtime_side_event(
                        app,
                        event_name,
                        timeline_recorder,
                        workspace_root,
                        RuntimeAgentEvent::CostRecorded {
                            cost_state: lime_agent::apply_usage_to_cost_state(cost_state, usage),
                        },
                    );
                }
            }
            if let Err(error) = app.emit(event_name, &done_event) {
                tracing::error!("[AsterAgent] 发送完成事件失败: {}", error);
            }
            emit_agent_app_runtime_event_projection(app, event_name, &done_event);
            emit_subagent_status_changed_events(app, session_id).await;
            Ok(())
        }
        Err(error) => {
            if is_runtime_turn_cancelled_error(&error) {
                let final_done_event = RuntimeAgentEvent::FinalDone { usage: None };
                if let Err(emit_error) = app.emit(event_name, &final_done_event) {
                    tracing::error!("[AsterAgent] 发送中断完成事件失败: {}", emit_error);
                }
                emit_agent_app_runtime_event_projection(app, event_name, &final_done_event);
                emit_subagent_status_changed_events(app, session_id).await;
                return Ok(());
            }
            if let Some(limit_event) = lime_agent::detect_runtime_limit_event(Some(&error)) {
                let event = map_runtime_limit_event_to_runtime_agent_event(limit_event);
                emit_runtime_side_event(app, event_name, timeline_recorder, workspace_root, event);
            }
            let error_event = RuntimeAgentEvent::Error {
                message: error.clone(),
            };
            if let Err(emit_error) = app.emit(event_name, &error_event) {
                tracing::error!("[AsterAgent] 发送错误事件失败: {}", emit_error);
            }
            emit_agent_app_runtime_event_projection(app, event_name, &error_event);
            emit_subagent_status_changed_events(app, session_id).await;
            Err(error)
        }
    }
}
