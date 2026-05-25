use super::runtime_turn_prompt_composition::extract_knowledge_pack_metadata;
use super::*;

pub(super) fn normalize_runtime_turn_request_metadata(
    request: &mut AsterChatRequest,
    session_recent_theme: Option<&str>,
    session_recent_session_mode: Option<&str>,
    session_recent_gate_key: Option<&str>,
    session_recent_run_title: Option<&str>,
    session_recent_content_id: Option<&str>,
    enable_artifact_defaults: bool,
) {
    request.metadata = crate::services::artifact_request_metadata_service::
        normalize_request_metadata_with_artifact_options(
            request.metadata.take(),
            session_recent_theme,
            session_recent_session_mode,
            session_recent_gate_key,
            session_recent_run_title,
            session_recent_content_id,
            crate::services::artifact_request_metadata_service::
                ArtifactRequestMetadataNormalizationOptions {
                    enable_artifact_defaults,
                },
        );
}

pub(super) fn has_root_object_key(request_metadata: Option<&serde_json::Value>, key: &str) -> bool {
    request_metadata
        .and_then(serde_json::Value::as_object)
        .and_then(|object| object.get(key))
        .and_then(serde_json::Value::as_object)
        .is_some()
}

pub(super) fn request_metadata_contains_full_runtime_context(
    request_metadata: Option<&serde_json::Value>,
) -> bool {
    const FULL_RUNTIME_HARNESS_OBJECT_KEYS: [(&str, &str); 20] = [
        ("image_skill_launch", "imageSkillLaunch"),
        ("service_skill_launch", "serviceSkillLaunch"),
        ("service_scene_launch", "serviceSceneLaunch"),
        ("cover_skill_launch", "coverSkillLaunch"),
        ("video_skill_launch", "videoSkillLaunch"),
        ("broadcast_skill_launch", "broadcastSkillLaunch"),
        ("resource_search_skill_launch", "resourceSearchSkillLaunch"),
        ("research_skill_launch", "researchSkillLaunch"),
        ("report_skill_launch", "reportSkillLaunch"),
        ("deep_search_skill_launch", "deepSearchSkillLaunch"),
        ("site_search_skill_launch", "siteSearchSkillLaunch"),
        ("pdf_read_skill_launch", "pdfReadSkillLaunch"),
        ("presentation_skill_launch", "presentationSkillLaunch"),
        ("form_skill_launch", "formSkillLaunch"),
        ("summary_skill_launch", "summarySkillLaunch"),
        ("translation_skill_launch", "translationSkillLaunch"),
        ("analysis_skill_launch", "analysisSkillLaunch"),
        ("workspace_skill_bindings", "workspaceSkillBindings"),
        (
            "workspace_skill_runtime_enable",
            "workspaceSkillRuntimeEnable",
        ),
        ("team_memory_shadow", "teamMemoryShadow"),
    ];
    const FULL_RUNTIME_HARNESS_OBJECT_KEYS_EXTRA: [(&str, &str); 4] = [
        ("transcription_skill_launch", "transcriptionSkillLaunch"),
        ("url_parse_skill_launch", "urlParseSkillLaunch"),
        ("typesetting_skill_launch", "typesettingSkillLaunch"),
        ("webpage_skill_launch", "webpageSkillLaunch"),
    ];

    if has_root_object_key(request_metadata, "artifact")
        || extract_knowledge_pack_metadata(request_metadata).is_some()
        || has_root_object_key(request_metadata, "elicitation_context")
    {
        return true;
    }

    if FULL_RUNTIME_HARNESS_OBJECT_KEYS
        .iter()
        .chain(FULL_RUNTIME_HARNESS_OBJECT_KEYS_EXTRA.iter())
        .any(|(snake_case, camel_case)| {
            extract_harness_nested_object(request_metadata, &[*snake_case, *camel_case]).is_some()
        })
    {
        return true;
    }

    extract_harness_string(
        request_metadata,
        &[
            "content_id",
            "contentId",
            "turn_purpose",
            "turnPurpose",
            "purpose",
        ],
    )
    .is_some()
        || extract_harness_string(
            request_metadata,
            &[
                "preferred_team_preset_id",
                "preferredTeamPresetId",
                "selected_team_id",
                "selectedTeamId",
            ],
        )
        .is_some()
        || extract_harness_string(
            request_metadata,
            &["browser_requirement", "browserRequirement"],
        )
        .is_some()
        || extract_harness_bool(request_metadata, &["task_mode_enabled", "taskModeEnabled"])
            .unwrap_or(false)
        || extract_harness_bool(
            request_metadata,
            &["subagent_mode_enabled", "subagentModeEnabled"],
        )
        .unwrap_or(false)
}

pub(super) fn request_has_non_search_full_runtime_reason(
    request: &AsterChatRequest,
    runtime_chat_mode: RuntimeChatMode,
) -> bool {
    let has_images = request
        .images
        .as_ref()
        .is_some_and(|images| !images.is_empty());

    has_images
        || request.project_id.is_some()
        || !matches!(runtime_chat_mode, RuntimeChatMode::General)
        || request_metadata_contains_full_runtime_context(request.metadata.as_ref())
        || extract_harness_bool(
            request.metadata.as_ref(),
            &["allow_model_skills", "allowModelSkills"],
        )
        .unwrap_or(false)
}

pub(super) fn is_web_search_only_runtime(
    request: &AsterChatRequest,
    runtime_chat_mode: RuntimeChatMode,
    request_tool_policy: &RequestToolPolicy,
) -> bool {
    request_tool_policy.allows_web_search()
        && !request_has_non_search_full_runtime_reason(request, runtime_chat_mode)
}

pub(super) fn should_prewarm_mcp_runtime(
    request: &AsterChatRequest,
    execution_profile: TurnExecutionProfile,
    runtime_chat_mode: RuntimeChatMode,
    request_tool_policy: &RequestToolPolicy,
) -> bool {
    matches!(execution_profile, TurnExecutionProfile::FullRuntime)
        && !is_web_search_only_runtime(request, runtime_chat_mode, request_tool_policy)
}

pub(super) fn resolve_mcp_prewarm_skip_reason(
    request: &AsterChatRequest,
    execution_profile: TurnExecutionProfile,
    runtime_chat_mode: RuntimeChatMode,
    request_tool_policy: &RequestToolPolicy,
) -> Option<&'static str> {
    if !matches!(execution_profile, TurnExecutionProfile::FullRuntime) {
        return Some("fast_chat");
    }

    if is_web_search_only_runtime(request, runtime_chat_mode, request_tool_policy) {
        return Some("web_search_only_native_tools");
    }

    None
}

pub(super) fn resolve_fast_chat_tool_surface_mode(
    request: &AsterChatRequest,
    execution_profile: TurnExecutionProfile,
    request_tool_policy: &RequestToolPolicy,
) -> Option<&'static str> {
    if !matches!(execution_profile, TurnExecutionProfile::FastChat)
        || request_tool_policy.allows_web_search()
    {
        return None;
    }

    if !extract_explicit_local_focus_paths_from_message(&request.message).is_empty() {
        Some(FAST_CHAT_TOOL_SURFACE_LOCAL_WORKSPACE)
    } else {
        Some(FAST_CHAT_TOOL_SURFACE_DIRECT_ANSWER)
    }
}

pub(super) fn merge_runtime_turn_tool_surface_metadata(
    request_metadata: Option<serde_json::Value>,
    tool_surface_mode: Option<&str>,
) -> Option<serde_json::Value> {
    let Some(tool_surface_mode) = tool_surface_mode
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return request_metadata;
    };

    let mut root = match request_metadata {
        Some(serde_json::Value::Object(object)) => object,
        Some(_) | None => serde_json::Map::new(),
    };
    let runtime_entry = root
        .entry(LIME_RUNTIME_METADATA_KEY.to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    let runtime_object = runtime_entry
        .as_object_mut()
        .expect("lime_runtime metadata should be an object");
    runtime_object.insert(
        LIME_RUNTIME_TOOL_SURFACE_KEY.to_string(),
        serde_json::Value::String(tool_surface_mode.to_string()),
    );

    Some(serde_json::Value::Object(root))
}

pub(super) fn merge_runtime_turn_default_tool_surface_metadata(
    request_metadata: Option<serde_json::Value>,
    tool_surface_mode: &str,
) -> Option<serde_json::Value> {
    let tool_surface_mode = tool_surface_mode.trim();
    if tool_surface_mode.is_empty() {
        return request_metadata;
    }

    let mut root = match request_metadata {
        Some(serde_json::Value::Object(object)) => object,
        Some(_) | None => serde_json::Map::new(),
    };
    let runtime_entry = root
        .entry(LIME_RUNTIME_METADATA_KEY.to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    let runtime_object = runtime_entry
        .as_object_mut()
        .expect("lime_runtime metadata should be an object");

    let existing_tool_surface = runtime_object
        .get(LIME_RUNTIME_TOOL_SURFACE_KEY)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if existing_tool_surface.is_none() {
        runtime_object.insert(
            LIME_RUNTIME_TOOL_SURFACE_KEY.to_string(),
            serde_json::Value::String(tool_surface_mode.to_string()),
        );
    }

    Some(serde_json::Value::Object(root))
}

pub(super) fn resolve_turn_execution_profile(
    request: &AsterChatRequest,
    runtime_chat_mode: RuntimeChatMode,
    request_tool_policy: &RequestToolPolicy,
    auto_continue_enabled: bool,
) -> TurnExecutionProfile {
    if request_has_non_search_full_runtime_reason(request, runtime_chat_mode)
        || auto_continue_enabled
        || request_tool_policy.requires_web_search()
    {
        TurnExecutionProfile::FullRuntime
    } else {
        TurnExecutionProfile::FastChat
    }
}

pub(crate) fn resolve_workspace_id_from_sources(
    request_workspace_id: Option<String>,
    session_workspace_id: Option<String>,
) -> Option<String> {
    normalize_optional_text(request_workspace_id)
        .or_else(|| normalize_optional_text(session_workspace_id))
}

pub(super) fn resolve_runtime_turn_workspace_id(
    db: &DbConnection,
    request: &AsterChatRequest,
) -> Result<String, String> {
    if let Some(workspace_id) =
        resolve_workspace_id_from_sources(Some(request.workspace_id.clone()), None)
    {
        return Ok(workspace_id);
    }

    let session_workspace_id =
        AsterAgentWrapper::get_session_sync(db, &request.session_id)?.workspace_id;

    resolve_workspace_id_from_sources(None, session_workspace_id)
        .ok_or_else(|| "workspace_id 必填，请先选择项目工作区".to_string())
}

pub(crate) fn resolve_request_web_search_preference_from_sources(
    request_web_search: Option<bool>,
    request_metadata: Option<&serde_json::Value>,
    session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
) -> Option<bool> {
    request_web_search.or_else(|| {
        resolve_recent_preference_from_sources(
            request_metadata,
            &["web_search_enabled", "webSearchEnabled"],
            session_recent_preferences.map(|preferences| preferences.web_search),
        )
    })
}

pub(super) fn resolve_runtime_access_mode_from_request(
    request: &AsterChatRequest,
) -> Option<lime_agent::SessionExecutionRuntimeAccessMode> {
    lime_agent::SessionExecutionRuntimeAccessMode::from_runtime_policies(
        request.approval_policy.as_deref(),
        request.sandbox_policy.as_deref(),
    )
    .or_else(|| {
        let access_mode =
            extract_harness_string(request.metadata.as_ref(), &["access_mode", "accessMode"]);
        lime_agent::SessionExecutionRuntimeAccessMode::from_access_mode_text(access_mode.as_deref())
    })
}

pub(super) fn backfill_runtime_access_policies(request: &mut AsterChatRequest) {
    let access_mode = resolve_runtime_access_mode_from_request(request).or_else(|| {
        if request.approval_policy.is_none() && request.sandbox_policy.is_none() {
            Some(lime_agent::SessionExecutionRuntimeAccessMode::default_for_session())
        } else {
            None
        }
    });
    let Some(access_mode) = access_mode else {
        return;
    };

    if request.approval_policy.is_none() {
        request.approval_policy = Some(access_mode.approval_policy().to_string());
    }
    if request.sandbox_policy.is_none() {
        request.sandbox_policy = Some(access_mode.sandbox_policy().to_string());
    }
}

pub(super) fn should_skip_artifact_document_autopersist(
    run_observation: &Arc<Mutex<ChatRunObservation>>,
    final_text_output: &str,
) -> bool {
    if final_text_output.trim().is_empty() {
        return true;
    }

    let observation = match run_observation.lock() {
        Ok(guard) => guard,
        Err(error) => error.into_inner(),
    };
    // 只允许根据运行期 artifact observation 决定是否跳过 autopersist，
    // 不再从最终文本中的 `<write_file>` 片段反推 artifact 状态。
    !observation.artifact_paths.is_empty()
}
