use crate::lime_session_repository::LimeSessionRepository;
use crate::turn_context_configuration::AgentTurnContext;
use crate::{
    resolve_request_tool_policy_with_mode, stream_reply_with_policy, AgentEvent, AgentTokenUsage,
    AsterAgentState, RequestToolPolicyMode, SessionConfigBuilder,
};
use agent_protocol::SessionId;
use aster::agents::Agent as AsterAgent;
use aster::session::{query_session, Session as AsterSession};
use lime_core::database::DbConnection;
use thread_store::session_repository::{SessionDetail, SessionRepository};

#[derive(Debug, Clone)]
pub struct DirectTextGenerationRequest {
    pub session_id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub system_prompt: String,
    pub user_prompt: String,
    pub turn_context: Option<AgentTurnContext>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirectTextGenerationResult {
    pub text: String,
    pub usage: Option<AgentTokenUsage>,
}

pub async fn run_direct_text_generation(
    agent_state: &AsterAgentState,
    request: DirectTextGenerationRequest,
) -> Result<DirectTextGenerationResult, String> {
    run_direct_text_generation_with_optional_db(agent_state, request, None).await
}

pub async fn run_direct_text_generation_with_db(
    agent_state: &AsterAgentState,
    request: DirectTextGenerationRequest,
    db: &DbConnection,
) -> Result<DirectTextGenerationResult, String> {
    run_direct_text_generation_with_optional_db(agent_state, request, Some(db.clone())).await
}

async fn run_direct_text_generation_with_optional_db(
    agent_state: &AsterAgentState,
    request: DirectTextGenerationRequest,
    repository_db: Option<DbConnection>,
) -> Result<DirectTextGenerationResult, String> {
    let session_id = request.session_id.clone();
    let agent_arc = agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard
        .as_ref()
        .ok_or_else(|| "Aster agent is not initialized".to_string())?;
    let request_tool_policy =
        resolve_request_tool_policy_with_mode(Some(false), Some(RequestToolPolicyMode::Disabled));
    let mut session_config = SessionConfigBuilder::new(request.session_id)
        .thread_id(request.thread_id)
        .turn_id(request.turn_id)
        .system_prompt(request.system_prompt)
        .include_context_trace(false);
    if let Some(turn_context) = request.turn_context {
        session_config = session_config.turn_context(turn_context);
    }
    let session_config = session_config.build();
    let mut text = String::new();
    let mut usage: Option<AgentTokenUsage> = None;
    let execution = stream_reply_with_policy(
        agent,
        &request.user_prompt,
        None,
        session_config,
        None,
        &request_tool_policy,
        |event| collect_model_text(event, &mut text, &mut usage),
    )
    .await;
    execution.map_err(|error| error.message)?;
    if usage.is_none() {
        let (usage_source, resolved_usage) = match repository_db.as_ref() {
            Some(db) => (
                "session_repository",
                resolve_session_usage_from_repository(db, &session_id),
            ),
            None => (
                "aster_session",
                resolve_session_usage_from_aster(agent, &session_id).await,
            ),
        };
        usage = resolved_usage;
        match usage.as_ref() {
            Some(usage) => tracing::info!(
                session_id = %session_id,
                source = usage_source,
                input_tokens = usage.input_tokens,
                output_tokens = usage.output_tokens,
                "[AsterAgent] direct text generation usage recovered from persisted session stats"
            ),
            None => tracing::info!(
                session_id = %session_id,
                "[AsterAgent] direct text generation completed without usage stats"
            ),
        }
    }
    Ok(DirectTextGenerationResult { text, usage })
}

fn resolve_session_usage_from_repository(
    db: &DbConnection,
    session_id: &str,
) -> Option<AgentTokenUsage> {
    let repository = LimeSessionRepository::new(db.clone());
    let session = repository
        .get_session(&SessionId::new(session_id))
        .ok()
        .flatten()?;
    resolve_usage_from_session_detail(&session)
}

async fn resolve_session_usage_from_aster(
    agent: &AsterAgent,
    session_id: &str,
) -> Option<AgentTokenUsage> {
    let session = match agent.session_store() {
        Some(store) => store.get_session(session_id, false).await.ok()?,
        None => query_session(session_id, false).await.ok()?,
    };
    resolve_usage_from_session(&session)
}

fn resolve_usage_from_session_detail(session: &SessionDetail) -> Option<AgentTokenUsage> {
    resolve_usage_from_token_stats(
        session.input_tokens,
        session.output_tokens,
        session.cached_input_tokens,
        session.cache_creation_input_tokens,
    )
}

fn resolve_usage_from_session(session: &AsterSession) -> Option<AgentTokenUsage> {
    resolve_usage_from_token_stats(
        session.input_tokens,
        session.output_tokens,
        session.cached_input_tokens,
        session.cache_creation_input_tokens,
    )
}

fn resolve_usage_from_token_stats(
    input_tokens: Option<i32>,
    output_tokens: Option<i32>,
    cached_input_tokens: Option<i32>,
    cache_creation_input_tokens: Option<i32>,
) -> Option<AgentTokenUsage> {
    match (input_tokens, output_tokens) {
        (Some(input_tokens), Some(output_tokens)) if input_tokens >= 0 && output_tokens >= 0 => {
            Some(AgentTokenUsage {
                input_tokens: input_tokens as u32,
                output_tokens: output_tokens as u32,
                cached_input_tokens: cached_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
                cache_creation_input_tokens: cache_creation_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
            })
        }
        _ => None,
    }
}

fn collect_model_text(
    event: &AgentEvent,
    output: &mut String,
    usage: &mut Option<AgentTokenUsage>,
) {
    match event {
        AgentEvent::TextDelta { text } => output.push_str(text),
        AgentEvent::TextDeltaBatch { text, .. } => output.push_str(text),
        AgentEvent::Done { usage: event_usage } | AgentEvent::FinalDone { usage: event_usage } => {
            if event_usage.is_some() {
                *usage = event_usage.clone();
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_model_text_retains_text_and_final_usage() {
        let mut text = String::new();
        let mut usage = None;

        collect_model_text(
            &AgentEvent::TextDelta {
                text: "好啊，".to_string(),
            },
            &mut text,
            &mut usage,
        );
        collect_model_text(
            &AgentEvent::FinalDone {
                usage: Some(AgentTokenUsage {
                    input_tokens: 31_000,
                    output_tokens: 0,
                    cached_input_tokens: Some(1_000),
                    cache_creation_input_tokens: None,
                }),
            },
            &mut text,
            &mut usage,
        );

        assert_eq!(text, "好啊，");
        assert_eq!(
            usage,
            Some(AgentTokenUsage {
                input_tokens: 31_000,
                output_tokens: 0,
                cached_input_tokens: Some(1_000),
                cache_creation_input_tokens: None,
            })
        );
    }

    #[test]
    fn resolve_usage_from_session_detail_reads_repository_token_stats() {
        let session = SessionDetail {
            metadata: thread_store::session_repository::SessionMetadata {
                id: SessionId::new("session-1"),
                title: "测试会话".to_string(),
                model: "gpt-5.2".to_string(),
                session_type: "chat".to_string(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
                working_dir: None,
                user_set_name: false,
                provider_name: None,
                extension_data: serde_json::Value::Null,
            },
            total_tokens: Some(43),
            input_tokens: Some(31),
            output_tokens: Some(12),
            cached_input_tokens: Some(7),
            cache_creation_input_tokens: None,
            accumulated_total_tokens: None,
            accumulated_input_tokens: None,
            accumulated_output_tokens: None,
            message_count: 0,
            schedule_id: None,
            recipe_json: None,
            user_recipe_values_json: None,
            model_config_json: None,
        };

        assert_eq!(
            resolve_usage_from_session_detail(&session),
            Some(AgentTokenUsage {
                input_tokens: 31,
                output_tokens: 12,
                cached_input_tokens: Some(7),
                cache_creation_input_tokens: None,
            })
        );
    }

    #[test]
    fn resolve_usage_from_token_stats_ignores_negative_optional_cache_values() {
        assert_eq!(
            resolve_usage_from_token_stats(Some(31_000), Some(0), Some(-1), Some(512)),
            Some(AgentTokenUsage {
                input_tokens: 31_000,
                output_tokens: 0,
                cached_input_tokens: None,
                cache_creation_input_tokens: Some(512),
            })
        );
    }

    #[test]
    fn resolve_usage_from_token_stats_requires_non_negative_input_and_output() {
        assert_eq!(
            resolve_usage_from_token_stats(Some(31_000), None, None, None),
            None
        );
        assert_eq!(
            resolve_usage_from_token_stats(Some(-1), Some(0), None, None),
            None
        );
    }
}
