use super::output_contract::resolve_agent_app_runtime_metadata_text;
use super::workspace_patch::{
    agent_app_output_contract_slug, build_agent_app_output_contract_workspace_patch,
    json_object_has_any_key, persist_agent_app_output_contract_workspace_patch,
};
use super::*;
use serde_json::json;
use std::collections::HashMap;

#[allow(clippy::too_many_arguments)]
pub(crate) fn materialize_agent_app_output_contract_artifact_after_stream(
    app: &AppHandle,
    event_name: &str,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    run_observation: &Arc<Mutex<ChatRunObservation>>,
    workspace_root: &str,
    thread_id: &str,
    turn_id: &str,
    request_metadata: Option<&serde_json::Value>,
    final_text_output: &str,
) {
    let Some(workspace_patch) =
        build_agent_app_output_contract_workspace_patch(request_metadata, final_text_output)
    else {
        return;
    };
    if json_object_has_any_key(
        &workspace_patch,
        &["contentFactoryWorkspacePatch", "workspacePatch"],
        0,
    ) {
        return;
    }
    let artifact_kind = workspace_patch
        .get("artifactKind")
        .or_else(|| workspace_patch.get("artifact_kind"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or("workspace_patch");
    let task_id = resolve_agent_app_runtime_metadata_text(request_metadata, "task_id", "taskId")
        .unwrap_or_else(|| thread_id.to_string());
    let (relative_path, serialized_patch) = match persist_agent_app_output_contract_workspace_patch(
        workspace_root,
        task_id.as_str(),
        turn_id,
        artifact_kind,
        &workspace_patch,
    ) {
        Ok(result) => result,
        Err(error) => {
            emit_runtime_side_event(
                app,
                event_name,
                timeline_recorder,
                workspace_root,
                RuntimeAgentEvent::Warning {
                    code: Some("agent_app_output_contract_materialization_failed".to_string()),
                    message: error,
                },
            );
            return;
        }
    };

    {
        let mut observation = match run_observation.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        observation.record_artifact_path(relative_path.clone(), request_metadata);
    }

    emit_runtime_side_event(
        app,
        event_name,
        timeline_recorder,
        workspace_root,
        RuntimeAgentEvent::ArtifactSnapshot {
            artifact: lime_agent::AgentArtifactSignal {
                artifact_id: format!(
                    "agent-app-output-contract:{}:{}",
                    agent_app_output_contract_slug(task_id.as_str()),
                    agent_app_output_contract_slug(turn_id)
                ),
                file_path: relative_path,
                content: Some(serialized_patch),
                metadata: Some(HashMap::from([
                    ("kind".to_string(), json!("content_factory.workspace_patch")),
                    (
                        "artifactType".to_string(),
                        json!("content_factory.workspace_patch"),
                    ),
                    ("artifactKind".to_string(), json!(artifact_kind)),
                    (
                        "source".to_string(),
                        json!("agent_app_output_contract_materialization"),
                    ),
                    (
                        "contentFactoryWorkspacePatch".to_string(),
                        workspace_patch.clone(),
                    ),
                    ("workspacePatch".to_string(), workspace_patch),
                    (
                        "agent_app_output_contract_materialized".to_string(),
                        json!(true),
                    ),
                ])),
            },
        },
    );
}
