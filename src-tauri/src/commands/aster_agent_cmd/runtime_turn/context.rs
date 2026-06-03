use super::*;

pub(super) fn build_artifact_document_warning_message(
    status: &str,
    fallback_used: bool,
    issues: &[String],
) -> String {
    if status == "failed" {
        return "结构化文稿未完整生成，已保留一份可继续编辑的恢复稿。".to_string();
    }

    if fallback_used
        || issues
            .iter()
            .any(|issue| issue.contains("Markdown 正文自动恢复"))
    {
        return "已根据正文整理出一份可继续编辑的草稿。".to_string();
    }

    if issues
        .iter()
        .any(|issue| issue.contains("不完整的 ArtifactDocument JSON"))
    {
        return "已补全文稿结构，可继续查看和编辑。".to_string();
    }

    "已整理为可继续编辑的文稿。".to_string()
}

pub(super) fn merge_turn_context_with_artifact_output_schema(
    turn_context: Option<TurnContextOverride>,
    request_metadata: Option<&serde_json::Value>,
) -> Option<TurnContextOverride> {
    crate::services::artifact_output_schema_service::merge_turn_context_with_artifact_output_schema(
        turn_context,
        request_metadata,
    )
}

pub(crate) fn merge_turn_context_with_workspace_auto_compaction(
    turn_context: Option<TurnContextOverride>,
    workspace_settings: &WorkspaceSettings,
) -> Option<TurnContextOverride> {
    if workspace_settings.auto_compact {
        return turn_context;
    }

    let mut turn_context = turn_context.unwrap_or_default();
    let runtime_metadata = turn_context
        .metadata
        .entry(LIME_RUNTIME_METADATA_KEY.to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    if !runtime_metadata.is_object() {
        *runtime_metadata = serde_json::Value::Object(serde_json::Map::new());
    }
    if let serde_json::Value::Object(runtime_metadata_map) = runtime_metadata {
        runtime_metadata_map.insert(
            LIME_RUNTIME_AUTO_COMPACT_KEY.to_string(),
            serde_json::Value::Bool(false),
        );
    }

    Some(turn_context)
}

pub(super) fn build_runtime_turn_context_override(
    turn_context: Option<TurnContextOverride>,
    request_metadata: Option<&serde_json::Value>,
    workspace_settings: &WorkspaceSettings,
) -> Option<TurnContextOverride> {
    merge_turn_context_with_workspace_auto_compaction(
        merge_turn_context_with_artifact_output_schema(turn_context, request_metadata),
        workspace_settings,
    )
}

fn normalized_collaboration_mode(value: &str) -> Option<String> {
    match value.trim() {
        "plan" => Some("plan".to_string()),
        "default" => Some("default".to_string()),
        _ => None,
    }
}

fn extract_request_collaboration_mode(
    request_metadata: Option<&serde_json::Value>,
) -> Option<String> {
    extract_harness_nested_object(
        request_metadata,
        &["collaboration_mode", "collaborationMode"],
    )
    .and_then(|metadata| {
        ["mode", "kind"]
            .iter()
            .filter_map(|key| metadata.get(*key))
            .find_map(serde_json::Value::as_str)
            .and_then(normalized_collaboration_mode)
    })
    .or_else(|| {
        extract_harness_string(
            request_metadata,
            &["collaboration_mode", "collaborationMode", "mode"],
        )
        .and_then(|value| normalized_collaboration_mode(&value))
    })
    .or_else(|| {
        extract_harness_bool(request_metadata, &["task_mode_enabled", "taskModeEnabled"])
            .filter(|enabled| *enabled)
            .map(|_| "plan".to_string())
    })
}

pub(crate) fn build_runtime_turn_context_snapshot(
    request_metadata: Option<&serde_json::Value>,
    workspace_settings: &WorkspaceSettings,
) -> TurnContextOverride {
    let seed_turn_context =
        request_metadata
            .and_then(serde_json::Value::as_object)
            .map(|metadata| {
                let mut turn_context = TurnContextOverride {
                    metadata: metadata.clone().into_iter().collect(),
                    ..TurnContextOverride::default()
                };
                turn_context.collaboration_mode =
                    extract_request_collaboration_mode(request_metadata);
                turn_context
            });

    build_runtime_turn_context_override(seed_turn_context, request_metadata, workspace_settings)
        .unwrap_or_default()
}

pub(super) fn build_runtime_turn_context_metadata_value(
    turn_context: &TurnContextOverride,
) -> Option<serde_json::Value> {
    if turn_context.metadata.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(
            turn_context.metadata.clone().into_iter().collect(),
        ))
    }
}

pub(super) fn build_runtime_session_config(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    system_prompt: Option<&str>,
    system_prompt_override: bool,
    include_context_trace: Option<bool>,
    turn_context: Option<TurnContextOverride>,
) -> aster::agents::types::SessionConfig {
    let mut session_config_builder = SessionConfigBuilder::new(session_id)
        .thread_id(thread_id.to_string())
        .turn_id(turn_id.to_string());
    if let Some(system_prompt) = system_prompt {
        session_config_builder = session_config_builder.system_prompt(system_prompt.to_string());
    }
    if system_prompt_override {
        session_config_builder = session_config_builder.system_prompt_override(true);
    }
    if let Some(include_context_trace) = include_context_trace {
        session_config_builder =
            session_config_builder.include_context_trace(include_context_trace);
    }
    if let Some(turn_context) = turn_context {
        session_config_builder = session_config_builder.turn_context(turn_context);
    }
    session_config_builder.build()
}

pub(super) fn insert_serialized_run_metadata<T: serde::Serialize>(
    metadata: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    value: &T,
) {
    if let Ok(serialized) = serde_json::to_value(value) {
        metadata.insert(key.to_string(), serialized);
    }
}

pub(super) fn build_runtime_run_start_metadata(
    request: &AsterChatRequest,
    workspace_id: &str,
    effective_strategy: AsterExecutionStrategy,
    request_tool_policy: &RequestToolPolicy,
    auto_continue_enabled: bool,
    auto_continue_metadata: Option<&AutoContinuePayload>,
    session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
    session_state_snapshot: &SessionStateSnapshot,
    runtime_projection_snapshot: &RuntimeProjectionSnapshot,
    turn_state: &TurnState,
    turn_input_diagnostics: &lime_agent::TurnDiagnosticsSnapshot,
    service_skill_preload: Option<&ServiceSkillLaunchPreloadExecution>,
) -> serde_json::Map<String, serde_json::Value> {
    let mut metadata = build_chat_run_metadata_base(
        request,
        workspace_id,
        effective_strategy,
        request_tool_policy,
        auto_continue_enabled,
        auto_continue_metadata,
        session_recent_preferences,
    );
    insert_serialized_run_metadata(&mut metadata, "session_state", session_state_snapshot);
    insert_serialized_run_metadata(
        &mut metadata,
        "runtime_projection",
        runtime_projection_snapshot,
    );
    insert_serialized_run_metadata(&mut metadata, "turn_state", turn_state);
    insert_serialized_run_metadata(&mut metadata, "turn_input", turn_input_diagnostics);

    if let Some(preload) = service_skill_preload {
        metadata.insert(
            "service_skill_launch_preload".to_string(),
            serde_json::json!({
                "executed": true,
                "adapter_name": preload.request.adapter_name,
                "ok": preload.result.ok,
                "error_code": preload.result.error_code,
                "saved_content_id": preload
                    .result
                    .saved_content
                    .as_ref()
                    .map(|content| content.content_id.clone()),
            }),
        );
    }

    metadata
}
