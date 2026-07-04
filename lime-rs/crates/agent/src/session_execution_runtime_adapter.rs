//! Aster session execution runtime adapter.
//!
//! Aster session and runtime snapshot DTOs stay in this compat boundary; the
//! session execution runtime builder consumes Lime-owned projection structs.

use agent_protocol::turn_context::{
    TurnOutputSchemaRuntime, TurnOutputSchemaSource, TurnOutputSchemaStrategy,
};
use aster::session::{
    ExtensionState, Session as AsterSession, SessionRuntimeSnapshot, TurnRuntime,
};

use crate::protocol::AgentTokenUsage;
use crate::session_execution_runtime::{
    extract_recent_access_mode_from_metadata, extract_recent_harness_context_from_metadata,
    normalize_optional_text, RecentHarnessContext, SessionExecutionRuntimeAccessMode,
    SessionExecutionRuntimePreferences, SessionExecutionRuntimeRecentTeamSelection,
    SessionExecutionRuntimeSessionProjection, SessionExecutionRuntimeSnapshotProjection,
    SessionExecutionRuntimeTurnProjection,
};
use crate::turn_context_configuration::to_agent_turn_context;

pub(crate) fn project_aster_session_usage(session: &AsterSession) -> Option<AgentTokenUsage> {
    match (session.input_tokens, session.output_tokens) {
        (Some(input_tokens), Some(output_tokens)) if input_tokens >= 0 && output_tokens >= 0 => {
            Some(AgentTokenUsage {
                input_tokens: input_tokens as u32,
                output_tokens: output_tokens as u32,
                cached_input_tokens: session
                    .cached_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
                cache_creation_input_tokens: session
                    .cache_creation_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
            })
        }
        _ => None,
    }
}

pub(crate) fn project_aster_output_schema_runtime(
    runtime: &aster::session::TurnOutputSchemaRuntime,
) -> TurnOutputSchemaRuntime {
    TurnOutputSchemaRuntime {
        source: match runtime.source {
            aster::session::TurnOutputSchemaSource::Session => TurnOutputSchemaSource::Session,
            aster::session::TurnOutputSchemaSource::Turn => TurnOutputSchemaSource::Turn,
        },
        strategy: match runtime.strategy {
            aster::session::TurnOutputSchemaStrategy::Native => TurnOutputSchemaStrategy::Native,
            aster::session::TurnOutputSchemaStrategy::FinalOutputTool => {
                TurnOutputSchemaStrategy::FinalOutputTool
            }
        },
        provider_name: runtime.provider_name.clone(),
        model_name: runtime.model_name.clone(),
    }
}

pub(crate) fn project_aster_session_execution_runtime_session(
    session: &AsterSession,
) -> SessionExecutionRuntimeSessionProjection {
    SessionExecutionRuntimeSessionProjection {
        provider_name: normalize_optional_text(session.provider_name.clone()),
        model_name: session
            .model_config
            .as_ref()
            .and_then(|config| normalize_optional_text(Some(config.model_name.clone()))),
        usage: project_aster_session_usage(session),
        recent_access_mode:
            <SessionExecutionRuntimeAccessMode as ExtensionState>::from_extension_data(
                &session.extension_data,
            ),
        recent_preferences:
            <SessionExecutionRuntimePreferences as ExtensionState>::from_extension_data(
                &session.extension_data,
            ),
        recent_team_selection:
            <SessionExecutionRuntimeRecentTeamSelection as ExtensionState>::from_extension_data(
                &session.extension_data,
            )
            .and_then(SessionExecutionRuntimeRecentTeamSelection::normalize),
    }
}

pub(crate) fn project_aster_session_execution_runtime_snapshot(
    snapshot: &SessionRuntimeSnapshot,
) -> SessionExecutionRuntimeSnapshotProjection {
    let recent_harness_context = project_recent_harness_context_from_aster_snapshot(snapshot);
    let recent_access_mode = project_recent_access_mode_from_aster_snapshot(snapshot);
    let latest_turn = resolve_latest_aster_turn(snapshot).map(project_aster_execution_runtime_turn);

    SessionExecutionRuntimeSnapshotProjection {
        recent_harness_context,
        recent_access_mode,
        latest_turn,
    }
}

fn project_aster_execution_runtime_turn(
    turn: &TurnRuntime,
) -> SessionExecutionRuntimeTurnProjection {
    SessionExecutionRuntimeTurnProjection {
        id: turn.id.clone(),
        status: map_aster_turn_status(turn.status),
        context: turn.context_override.clone().map(to_agent_turn_context),
        output_schema_runtime: turn
            .output_schema_runtime
            .as_ref()
            .map(project_aster_output_schema_runtime),
        error_message: turn.error_message.clone(),
    }
}

fn resolve_latest_aster_turn(snapshot: &SessionRuntimeSnapshot) -> Option<&TurnRuntime> {
    snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.turns.iter())
        .max_by(|left, right| {
            left.updated_at
                .cmp(&right.updated_at)
                .then_with(|| left.created_at.cmp(&right.created_at))
                .then_with(|| left.id.cmp(&right.id))
        })
}

fn map_aster_turn_status(status: aster::session::TurnStatus) -> String {
    match status {
        aster::session::TurnStatus::Queued => "queued".to_string(),
        aster::session::TurnStatus::Running => "running".to_string(),
        aster::session::TurnStatus::Completed => "completed".to_string(),
        aster::session::TurnStatus::Failed => "failed".to_string(),
        aster::session::TurnStatus::Aborted => "aborted".to_string(),
    }
}

fn project_recent_access_mode_from_aster_snapshot(
    snapshot: &SessionRuntimeSnapshot,
) -> Option<SessionExecutionRuntimeAccessMode> {
    snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.turns.iter())
        .filter_map(|turn| {
            let context = turn.context_override.as_ref()?;
            let access_mode = SessionExecutionRuntimeAccessMode::from_runtime_policies(
                context.approval_policy.as_deref(),
                context.sandbox_policy.as_deref(),
            )
            .or_else(|| extract_recent_access_mode_from_metadata(&context.metadata))?;
            Some((turn.updated_at, access_mode))
        })
        .max_by_key(|(updated_at, _)| *updated_at)
        .map(|(_, access_mode)| access_mode)
}

fn project_recent_harness_context_from_aster_snapshot(
    snapshot: &SessionRuntimeSnapshot,
) -> RecentHarnessContext {
    let from_turn = snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.turns.iter())
        .filter_map(|turn| {
            let context = turn
                .context_override
                .as_ref()
                .map(|value| extract_recent_harness_context_from_metadata(&value.metadata))?;
            Some((turn.updated_at, context))
        })
        .max_by_key(|(updated_at, _)| *updated_at)
        .map(|(_, context)| context)
        .unwrap_or_default();

    if recent_harness_context_is_complete(&from_turn) {
        return from_turn;
    }

    let from_thread = snapshot
        .threads
        .iter()
        .filter_map(|thread| {
            let context = extract_recent_harness_context_from_metadata(&thread.thread.metadata);
            if recent_harness_context_is_empty(&context) {
                return None;
            }
            Some((thread.thread.updated_at, context))
        })
        .max_by_key(|(updated_at, _)| *updated_at)
        .map(|(_, context)| context)
        .unwrap_or_default();

    RecentHarnessContext {
        theme: from_turn.theme.or(from_thread.theme),
        session_mode: from_turn.session_mode.or(from_thread.session_mode),
        gate_key: from_turn.gate_key.or(from_thread.gate_key),
        run_title: from_turn.run_title.or(from_thread.run_title),
        content_id: from_turn.content_id.or(from_thread.content_id),
        response_language: from_turn
            .response_language
            .or(from_thread.response_language),
    }
}

fn recent_harness_context_is_complete(context: &RecentHarnessContext) -> bool {
    context.theme.is_some()
        && context.session_mode.is_some()
        && context.gate_key.is_some()
        && context.run_title.is_some()
        && context.content_id.is_some()
        && context.response_language.is_some()
}

fn recent_harness_context_is_empty(context: &RecentHarnessContext) -> bool {
    context.theme.is_none()
        && context.session_mode.is_none()
        && context.gate_key.is_none()
        && context.run_title.is_none()
        && context.content_id.is_none()
        && context.response_language.is_none()
}
