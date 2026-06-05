use super::*;

pub(super) fn request_metadata_has_explicit_artifact_intent(
    request_metadata: Option<&serde_json::Value>,
) -> bool {
    let Some(root) = request_metadata.and_then(serde_json::Value::as_object) else {
        return false;
    };

    if root
        .get("artifact")
        .and_then(serde_json::Value::as_object)
        .is_some_and(|artifact| !artifact.is_empty())
    {
        return true;
    }

    [
        "artifact_mode",
        "artifactMode",
        "artifact_stage",
        "artifactStage",
        "artifact_kind",
        "artifactKind",
        "artifact_request_id",
        "artifactRequestId",
    ]
    .iter()
    .any(|key| {
        root.get(*key)
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .is_some_and(|value| !value.is_empty())
    })
}

pub(crate) fn should_skip_default_fast_chat_artifact_autopersist(
    execution_profile: TurnExecutionProfile,
    request_metadata: Option<&serde_json::Value>,
) -> bool {
    if !matches!(execution_profile, TurnExecutionProfile::FastChat) {
        return false;
    }

    if request_metadata_has_explicit_artifact_intent(request_metadata)
        || extract_harness_string(request_metadata, &["content_id", "contentId"]).is_some()
    {
        return false;
    }

    !matches!(
        extract_harness_string(request_metadata, &["session_mode", "sessionMode"]).as_deref(),
        Some("general_workbench")
    )
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn maybe_persist_artifact_document_after_stream(
    app: &AppHandle,
    db: &DbConnection,
    event_name: &str,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    run_observation: &Arc<Mutex<ChatRunObservation>>,
    workspace_root: &str,
    workspace_id: &str,
    thread_id: &str,
    turn_id: &str,
    execution_profile: TurnExecutionProfile,
    request_metadata: Option<&serde_json::Value>,
    final_text_output: &str,
) {
    let host = RuntimeArtifactMaterializationHostContext::new(
        app,
        event_name,
        timeline_recorder,
        workspace_root,
    );
    maybe_persist_artifact_document_after_stream_with_host(
        host,
        db,
        run_observation,
        workspace_id,
        thread_id,
        turn_id,
        execution_profile,
        request_metadata,
        final_text_output,
    );
}

#[allow(clippy::too_many_arguments)]
pub(super) fn maybe_persist_artifact_document_after_stream_with_host(
    host: RuntimeArtifactMaterializationHostContext<'_>,
    db: &DbConnection,
    run_observation: &Arc<Mutex<ChatRunObservation>>,
    workspace_id: &str,
    thread_id: &str,
    turn_id: &str,
    execution_profile: TurnExecutionProfile,
    request_metadata: Option<&serde_json::Value>,
    final_text_output: &str,
) {
    if should_skip_default_fast_chat_artifact_autopersist(execution_profile, request_metadata) {
        return;
    }
    if !crate::services::artifact_document_service::should_attempt_artifact_document_autopersist(
        request_metadata,
    ) {
        return;
    }
    if should_skip_artifact_document_autopersist(run_observation, final_text_output) {
        return;
    }

    let persist_params =
        crate::services::artifact_document_service::ArtifactDocumentPersistParams {
            workspace_root: PathBuf::from(host.workspace_root()),
            workspace_id: Some(workspace_id.to_string()),
            thread_id: thread_id.to_string(),
            turn_id: turn_id.to_string(),
            request_metadata: request_metadata.cloned(),
        };

    match crate::services::artifact_document_service::persist_artifact_document_from_text(
        final_text_output,
        &persist_params,
    ) {
        Ok(persisted) => {
            {
                let mut observation = match run_observation.lock() {
                    Ok(guard) => guard,
                    Err(error) => error.into_inner(),
                };
                observation.record_artifact_path(persisted.relative_path.clone(), request_metadata);
            }

            host.emit_side_event(RuntimeAgentEvent::ArtifactSnapshot {
                artifact: lime_agent::AgentArtifactSignal {
                    artifact_id: persisted.artifact_id.clone(),
                    file_path: persisted.relative_path.clone(),
                    content: Some(persisted.serialized_document.clone()),
                    metadata: Some(
                        persisted
                            .snapshot_metadata
                            .iter()
                            .map(|(key, value)| (key.clone(), value.clone()))
                            .collect(),
                    ),
                },
            });

            if let Err(error) =
                crate::services::artifact_document_service::sync_persisted_artifact_document_to_content(
                    db,
                    request_metadata,
                    &persisted,
                )
            {
                tracing::warn!(
                    "[AsterAgent] ArtifactDocument 已落盘，但同步内容版本状态失败: {}",
                    error
                );
            }

            if persisted.repaired || persisted.status == "failed" {
                let (code, prefix) = if persisted.status == "failed" {
                    (
                        ARTIFACT_DOCUMENT_FAILED_WARNING_CODE,
                        "ArtifactDocument 已落盘",
                    )
                } else {
                    (
                        ARTIFACT_DOCUMENT_REPAIRED_WARNING_CODE,
                        "ArtifactDocument 已落盘",
                    )
                };
                let detail = build_artifact_document_warning_message(
                    persisted.status.as_str(),
                    persisted.fallback_used,
                    &persisted.issues,
                );
                host.emit_side_event(RuntimeAgentEvent::Warning {
                    code: Some(code.to_string()),
                    message: format!("{prefix}: {detail}"),
                });
            }
        }
        Err(error) => {
            host.emit_side_event(RuntimeAgentEvent::Warning {
                code: Some(ARTIFACT_DOCUMENT_PERSIST_FAILED_WARNING_CODE.to_string()),
                message: format!("ArtifactDocument 自动落盘失败，已保留消息区结果：{error}"),
            });
        }
    }
}
