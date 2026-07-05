use aster::session::{
    query_child_subagent_sessions, query_session, resolve_subagent_session_metadata,
    Session as AsterSession,
};

use super::session_store_subagent_context::{
    SubagentPresentationProjection, SubagentSessionProjection,
};
use super::session_store_types::{normalize_optional_nonempty_body, normalize_optional_text};
use crate::subagent_profiles_aster_adapter::subagent_customization_from_session;

fn resolve_subagent_model_name(session: &AsterSession) -> Option<String> {
    session
        .model_config
        .as_ref()
        .map(|config| config.model_name.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| normalize_optional_text(session.provider_name.clone()))
}

pub(super) fn project_aster_subagent_session(
    session: &AsterSession,
) -> Option<SubagentSessionProjection> {
    let metadata = resolve_subagent_session_metadata(&session.extension_data)?;
    let customization = subagent_customization_from_session(session).unwrap_or_default();
    Some(SubagentSessionProjection {
        id: session.id.clone(),
        name: normalize_optional_text(Some(session.name.clone()))
            .unwrap_or_else(|| "子代理会话".to_string()),
        created_at: session.created_at.timestamp(),
        updated_at: session.updated_at.timestamp(),
        session_type: session.session_type.to_string(),
        model: resolve_subagent_model_name(session),
        provider_name: normalize_optional_text(session.provider_name.clone()),
        working_dir: normalize_optional_text(Some(
            session.working_dir.to_string_lossy().to_string(),
        )),
        presentation: SubagentPresentationProjection {
            parent_session_id: metadata.parent_session_id,
            task_summary: normalize_optional_nonempty_body(metadata.task_summary),
            role_hint: normalize_optional_text(metadata.role_hint),
            origin_tool: normalize_optional_text(Some(metadata.origin_tool)),
            created_from_turn_id: normalize_optional_text(metadata.created_from_turn_id),
            blueprint_role_id: customization.blueprint_role_id,
            blueprint_role_label: customization.blueprint_role_label,
            profile_id: customization.profile_id,
            profile_name: customization.profile_name,
            role_key: customization.role_key,
            team_preset_id: customization.team_preset_id,
            theme: customization.theme,
            output_contract: customization.output_contract,
            skill_ids: customization.skill_ids,
            skills: customization.skills,
        },
    })
}

pub(super) async fn load_child_subagent_session_projections(
    parent_session_id: &str,
) -> Result<Vec<SubagentSessionProjection>, String> {
    let sessions = query_child_subagent_sessions(parent_session_id)
        .await
        .map_err(|error| format!("读取 child subagent sessions 失败: {error}"))?;
    Ok(sessions
        .iter()
        .filter_map(project_aster_subagent_session)
        .collect())
}

pub(super) async fn read_subagent_session_projection(
    session_id: &str,
    error_context: &str,
) -> Result<Option<SubagentSessionProjection>, String> {
    let session = query_session(session_id, false)
        .await
        .map_err(|error| format!("{error_context}: {error}"))?;
    Ok(project_aster_subagent_session(&session))
}

pub(super) async fn read_session_name_projection(
    session_id: &str,
    error_context: &str,
) -> Result<Option<String>, String> {
    let session = query_session(session_id, false)
        .await
        .map_err(|error| format!("{error_context}: {error}"))?;
    Ok(normalize_optional_text(Some(session.name)))
}
