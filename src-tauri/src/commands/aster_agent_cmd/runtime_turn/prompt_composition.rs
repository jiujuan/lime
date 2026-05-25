use super::*;

#[path = "prompt_composition/knowledge.rs"]
mod knowledge;

pub(super) use self::knowledge::{
    extract_knowledge_pack_metadata, merge_system_prompt_with_knowledge_context_projection,
};

pub(super) fn apply_turn_prompt_stage<F>(
    turn_input_builder: &mut TurnInputEnvelopeBuilder,
    stage: TurnPromptAugmentationStageKind,
    prompt: Option<String>,
    apply: F,
) -> Option<String>
where
    F: FnOnce(Option<String>) -> Option<String>,
{
    let prompt = apply(prompt);
    turn_input_builder.apply_prompt_stage(stage, prompt.clone());
    prompt
}

pub(super) fn apply_turn_metadata_prompt_stage<F>(
    turn_input_builder: &mut TurnInputEnvelopeBuilder,
    stage: TurnPromptAugmentationStageKind,
    prompt: Option<String>,
    request_metadata: Option<&serde_json::Value>,
    apply: F,
) -> Option<String>
where
    F: FnOnce(Option<String>, Option<&serde_json::Value>) -> Option<String>,
{
    apply_turn_prompt_stage(turn_input_builder, stage, prompt, |prompt| {
        apply(prompt, request_metadata)
    })
}

pub(super) fn merge_system_prompt_with_turn_memory_prefetch(
    prompt: Option<String>,
    runtime_config: &lime_core::config::Config,
    db: &DbConnection,
    session_id: &str,
    workspace_root: &str,
    request: &AsterChatRequest,
) -> Option<String> {
    if !runtime_config.memory.enabled {
        return prompt;
    }

    let prefetch_request = crate::commands::memory_management_cmd::TurnMemoryPrefetchRequest {
        session_id: session_id.to_string(),
        working_dir: Some(workspace_root.to_string()),
        user_message: request.message.clone(),
        request_metadata: request.metadata.clone(),
        max_durable_entries: None,
        max_working_chars: None,
    };

    match db.lock() {
        Ok(conn) => {
            match crate::commands::memory_management_cmd::build_turn_memory_prefetch_result(
                runtime_config,
                &conn,
                Path::new(workspace_root),
                &prefetch_request,
            ) {
                Ok(prefetch) => {
                    merge_runtime_memory_prefetch_prompt(prompt, prefetch.prompt.as_deref())
                }
                Err(error) => {
                    tracing::warn!(
                        "[AsterAgent] 单回合记忆预取失败，已降级继续: session_id={}, error={}",
                        session_id,
                        error
                    );
                    prompt
                }
            }
        }
        Err(error) => {
            tracing::warn!(
                "[AsterAgent] 记忆预取无法获取数据库锁，已降级继续: session_id={}, error={}",
                session_id,
                error
            );
            prompt
        }
    }
}

pub(super) fn build_full_runtime_system_prompt(
    turn_input_builder: &mut TurnInputEnvelopeBuilder,
    prompt_with_local_path_focus: Option<String>,
    runtime_config: &lime_core::config::Config,
    db: &DbConnection,
    session_id: &str,
    workspace_root: &str,
    request: &AsterChatRequest,
    request_tool_policy: &RequestToolPolicy,
    session_recent_team_selection: Option<&lime_agent::SessionExecutionRuntimeRecentTeamSelection>,
    session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
    auto_continue_config: Option<&AutoContinuePayload>,
) -> Option<String> {
    let request_metadata = request.metadata.as_ref();
    let mut prompt = apply_turn_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::Memory,
        prompt_with_local_path_focus,
        |prompt| {
            let prompt = merge_system_prompt_with_memory_context(
                prompt,
                runtime_config,
                MemoryPromptContext::with_working_dir(Path::new(workspace_root)),
            );
            merge_system_prompt_with_turn_memory_prefetch(
                prompt,
                runtime_config,
                db,
                session_id,
                workspace_root,
                request,
            )
        },
    );

    let (knowledge_prompt, agentui_context) = merge_system_prompt_with_knowledge_context_projection(
        prompt,
        request_metadata,
        workspace_root,
        &request.message,
    );
    turn_input_builder.apply_prompt_stage(
        TurnPromptAugmentationStageKind::KnowledgePack,
        knowledge_prompt.clone(),
    );
    if let Some(agentui_context) = agentui_context {
        turn_input_builder
            .upsert_turn_context_metadata(AGENTUI_CONTEXT_METADATA_KEY, agentui_context);
    }
    prompt = knowledge_prompt;
    prompt = apply_turn_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::WebSearch,
        prompt,
        |prompt| merge_system_prompt_with_web_search(prompt, runtime_config),
    );
    prompt = apply_turn_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::RequestToolPolicy,
        prompt,
        |prompt| merge_system_prompt_with_request_tool_policy(prompt, request_tool_policy),
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::ResponseLanguage,
        prompt,
        request_metadata,
        merge_system_prompt_with_response_language,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::Artifact,
        prompt,
        request_metadata,
        merge_system_prompt_with_artifact_context,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::ImageSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_image_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::CoverSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_cover_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::VideoSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_video_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::BroadcastSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_broadcast_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::ResourceSearchSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_resource_search_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::ResearchSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_research_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::ReportSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_report_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::DeepSearchSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_deep_search_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::SiteSearchSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_site_search_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::PdfReadSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_pdf_read_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::PresentationSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_presentation_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::FormSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_form_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::SummarySkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_summary_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::TranslationSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_translation_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::AnalysisSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_analysis_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::TranscriptionSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_transcription_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::UrlParseSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_url_parse_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::TypesettingSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_typesetting_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::WebpageSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_webpage_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::ServiceSkillLaunch,
        prompt,
        request_metadata,
        merge_system_prompt_with_service_skill_launch,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::WorkspaceSkillBindings,
        prompt,
        request_metadata,
        merge_system_prompt_with_workspace_skill_bindings,
    );
    prompt = apply_turn_metadata_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::Elicitation,
        prompt,
        request_metadata,
        merge_system_prompt_with_elicitation_context,
    );

    let subagent_mode_enabled = resolve_recent_preference_from_sources(
        request_metadata,
        &["subagent_mode_enabled", "subagentModeEnabled"],
        session_recent_preferences.map(|preferences| preferences.subagent),
    )
    .unwrap_or(false);
    prompt = apply_turn_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::TeamPreference,
        prompt,
        |prompt| {
            merge_system_prompt_with_team_preference(
                prompt,
                request_metadata,
                session_recent_team_selection,
                subagent_mode_enabled,
            )
        },
    );

    apply_turn_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::AutoContinue,
        prompt,
        |prompt| merge_system_prompt_with_auto_continue(prompt, auto_continue_config),
    )
}

pub(super) fn build_fast_chat_system_prompt(
    turn_input_builder: &mut TurnInputEnvelopeBuilder,
    prompt_with_local_path_focus: Option<String>,
    request_tool_policy: &RequestToolPolicy,
) -> Option<String> {
    apply_turn_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::RequestToolPolicy,
        prompt_with_local_path_focus,
        |prompt| merge_system_prompt_with_request_tool_policy(prompt, request_tool_policy),
    )
}

pub(super) fn merge_system_prompt_with_response_language(
    prompt: Option<String>,
    request_metadata: Option<&serde_json::Value>,
) -> Option<String> {
    let Some(response_language) = extract_harness_string(
        request_metadata,
        &[
            "agent_response_language",
            "agentResponseLanguage",
            "response_language",
            "responseLanguage",
        ],
    ) else {
        return prompt;
    };

    let response_language = response_language.trim();
    if response_language.is_empty()
        || prompt
            .as_ref()
            .is_some_and(|base| base.contains(TURN_RESPONSE_LANGUAGE_PROMPT_MARKER))
    {
        return prompt;
    }

    let guidance = if response_language.eq_ignore_ascii_case("auto") {
        format!(
            "{TURN_RESPONSE_LANGUAGE_PROMPT_MARKER}\n\
- 默认根据用户最近输入语言与当前上下文自然回复。\n\
- 如果用户显式要求其他语言，优先遵循当前消息。\n\
- 不要把 UI locale 当成唯一回复语言事实源。"
        )
    } else {
        format!(
            "{TURN_RESPONSE_LANGUAGE_PROMPT_MARKER}\n\
- 默认使用 {response_language} 回复。\n\
- 如果当前消息显式要求其他语言，优先遵循当前消息。\n\
- 不要把 UI locale、浏览器环境语言或内容产物语言当成同一个字段。"
        )
    };

    match prompt {
        Some(base) => Some(format!("{base}\n\n{guidance}")),
        None => Some(guidance),
    }
}
