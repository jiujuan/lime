//! 运行态 timeline / usage 到持久会话详情的投影。

use aster::session::{Session as AsterSession, SessionRuntimeSnapshot};
use lime_core::database::agent_session_repository::SessionRecordOverview;
use lime_core::database::dao::agent_timeline::{
    AgentThreadItem, AgentThreadTurn, AgentThreadTurnStatus,
};
use std::collections::HashMap;

use super::session_store_types::{SessionDetail, SessionInfo};
use crate::protocol::AgentMessage as RuntimeAgentMessage;
use crate::protocol_projection::{project_item_runtime, project_turn_runtime};

fn sort_runtime_turns(turns: &mut [AgentThreadTurn]) {
    turns.sort_by(|left, right| {
        left.started_at
            .cmp(&right.started_at)
            .then(left.created_at.cmp(&right.created_at))
            .then(left.id.cmp(&right.id))
    });
}

fn sort_runtime_items(items: &mut [AgentThreadItem], turn_started_at: &HashMap<String, String>) {
    items.sort_by(|left, right| {
        let left_turn_started = turn_started_at
            .get(&left.turn_id)
            .map(String::as_str)
            .unwrap_or(left.started_at.as_str());
        let right_turn_started = turn_started_at
            .get(&right.turn_id)
            .map(String::as_str)
            .unwrap_or(right.started_at.as_str());

        left_turn_started
            .cmp(right_turn_started)
            .then(left.sequence.cmp(&right.sequence))
            .then(left.turn_id.cmp(&right.turn_id))
            .then(left.started_at.cmp(&right.started_at))
            .then(left.id.cmp(&right.id))
    });
}

fn should_preserve_persisted_terminal_turn(
    persisted: &AgentThreadTurn,
    runtime: &AgentThreadTurn,
) -> bool {
    matches!(
        persisted.status,
        AgentThreadTurnStatus::Completed
            | AgentThreadTurnStatus::Failed
            | AgentThreadTurnStatus::Aborted
    ) && matches!(runtime.status, AgentThreadTurnStatus::Running)
}

pub(super) fn apply_aster_runtime_snapshot(detail: &mut SessionDetail, snapshot: &SessionRuntimeSnapshot) {
    if let Some(thread) = snapshot.threads.first() {
        detail.thread_id = thread.thread.id.clone();
    }

    if snapshot.threads.is_empty() {
        return;
    }

    let mut turns_by_id = detail
        .turns
        .drain(..)
        .map(|turn| (turn.id.clone(), turn))
        .collect::<HashMap<_, _>>();
    for thread in &snapshot.threads {
        for turn in &thread.turns {
            let runtime_turn = project_turn_runtime(turn.clone());
            if turns_by_id
                .get(&runtime_turn.id)
                .map(|persisted| should_preserve_persisted_terminal_turn(persisted, &runtime_turn))
                .unwrap_or(false)
            {
                continue;
            }
            turns_by_id.insert(runtime_turn.id.clone(), runtime_turn);
        }
    }
    detail.turns = turns_by_id.into_values().collect();
    sort_runtime_turns(&mut detail.turns);

    let turn_started_at = detail
        .turns
        .iter()
        .map(|turn| (turn.id.clone(), turn.started_at.clone()))
        .collect::<HashMap<_, _>>();

    let mut items_by_id = detail
        .items
        .drain(..)
        .map(|item| (item.id.clone(), item))
        .collect::<HashMap<_, _>>();
    for thread in &snapshot.threads {
        for item in &thread.items {
            items_by_id.insert(item.id.clone(), project_item_runtime(item.clone()));
        }
    }
    detail.items = items_by_id.into_values().collect();
    sort_runtime_items(&mut detail.items, &turn_started_at);
}

pub(super) fn build_runtime_session_info(overview: SessionRecordOverview) -> SessionInfo {
    let working_dir = overview.working_dir;
    let workspace_id = overview.workspace_id;
    let archived_at = overview.archived_at.and_then(|value| {
        chrono::DateTime::parse_from_rfc3339(&value)
            .map(|dt| dt.timestamp())
            .ok()
    });

    SessionInfo {
        id: overview.id,
        name: overview.title.unwrap_or_else(|| "未命名".to_string()),
        created_at: chrono::DateTime::parse_from_rfc3339(&overview.created_at)
            .map(|dt| dt.timestamp())
            .unwrap_or(0),
        updated_at: chrono::DateTime::parse_from_rfc3339(&overview.updated_at)
            .map(|dt| dt.timestamp())
            .unwrap_or(0),
        archived_at,
        messages_count: overview.messages_count,
        execution_strategy: overview.execution_strategy,
        model: Some(overview.model),
        working_dir,
        workspace_id,
    }
}

fn resolve_runtime_usage_from_aster_session(
    session: &AsterSession,
) -> Option<crate::protocol::AgentTokenUsage> {
    match (session.input_tokens, session.output_tokens) {
        (Some(input_tokens), Some(output_tokens)) if input_tokens >= 0 && output_tokens >= 0 => {
            Some(crate::protocol::AgentTokenUsage {
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

pub(super) fn apply_runtime_usage_fallback_to_latest_assistant_message(
    messages: &mut [RuntimeAgentMessage],
    session: &AsterSession,
) -> Option<crate::protocol::AgentTokenUsage> {
    let usage = resolve_runtime_usage_from_aster_session(session)?;
    let latest_assistant_message = messages
        .iter_mut()
        .rev()
        .find(|message| message.role.eq_ignore_ascii_case("assistant"))?;

    if latest_assistant_message.usage.is_some() {
        return None;
    }

    latest_assistant_message.usage = Some(usage.clone());
    Some(usage)
}
