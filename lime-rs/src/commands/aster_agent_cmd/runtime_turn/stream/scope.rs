use super::*;

pub(in crate::commands::aster_agent_cmd::runtime_turn) async fn with_runtime_turn_session_scope<
    F,
    Fut,
>(
    state: &AsterAgentState,
    session_id: &str,
    skill_tool_access_enabled: bool,
    skill_tool_allowed_skill_names: Option<Vec<String>>,
    skill_tool_allowed_skill_sources: Option<Vec<lime_agent::tools::SkillToolSessionSkillSource>>,
    run: F,
) -> Result<(), String>
where
    F: FnOnce(CancellationToken) -> Fut,
    Fut: std::future::Future<Output = Result<(), String>>,
{
    let cancel_token = state.create_cancel_token(session_id).await;
    if let Some(allowed_skill_sources) = skill_tool_allowed_skill_sources {
        lime_agent::tools::set_skill_tool_session_allowed_skill_sources(
            session_id,
            allowed_skill_sources,
        );
    } else if let Some(allowed_skill_names) = skill_tool_allowed_skill_names {
        lime_agent::tools::set_skill_tool_session_allowed_skills(session_id, allowed_skill_names);
    } else {
        lime_agent::tools::set_skill_tool_session_access(session_id, skill_tool_access_enabled);
    }

    let result = run(cancel_token).await;

    lime_agent::tools::clear_skill_tool_session_access(session_id);
    state.remove_cancel_token(session_id).await;
    state.clear_interrupt_marker(session_id).await;
    result
}
