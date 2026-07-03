//! Aster runtime timeline adapter.
//!
//! Aster DTOs must stay behind this migration boundary; current projection APIs
//! consume Lime-owned timeline shapes.

use agent_protocol::turn_context::{
    TurnOutputSchemaRuntime, TurnOutputSchemaSource, TurnOutputSchemaStrategy,
};
use aster::agents::AgentEvent as AsterAgentEvent;
use aster::conversation::message::{
    Message as AsterMessage, MessageContent as AsterMessageContent,
    SystemNotificationType as AsterSystemNotificationType,
};
use aster::session::{
    ExtensionState, ItemRuntime, ItemRuntimePayload, Session as AsterSession,
    SessionRuntimeSnapshot, TurnRuntime,
};
use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadTurn};

use crate::protocol::{
    AgentEvent as RuntimeAgentEvent, AgentMessage as RuntimeAgentMessage, AgentTokenUsage,
};
use crate::protocol_projection::{project_item_runtime, project_turn_runtime};
use crate::request_tool_policy::auto_compaction_projection::{
    AutoCompactionEventProjection, AutoCompactionSystemNotificationKind,
};
use crate::session_execution_runtime::{
    extract_recent_access_mode_from_metadata, extract_recent_harness_context_from_metadata,
    normalize_optional_text, RecentHarnessContext, SessionExecutionRuntimeAccessMode,
    SessionExecutionRuntimePreferences, SessionExecutionRuntimeRecentTeamSelection,
    SessionExecutionRuntimeSessionProjection, SessionExecutionRuntimeSnapshotProjection,
    SessionExecutionRuntimeTurnProjection,
};
use crate::subagent_control::{SubagentLatestTurnProjection, SubagentTurnStatus};
use crate::turn_context_configuration::to_agent_turn_context;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct RuntimeTimelineSnapshotProjection {
    pub thread_id: Option<String>,
    pub turns: Vec<AgentThreadTurn>,
    pub items: Vec<AgentThreadItem>,
}

pub(crate) fn project_aster_runtime_event(event: AsterAgentEvent) -> Vec<RuntimeAgentEvent> {
    crate::event_converter::convert_agent_event(event)
}

pub(crate) fn project_aster_message(message: &AsterMessage) -> RuntimeAgentMessage {
    crate::event_converter::convert_to_tauri_message(message)
}

pub(crate) fn project_aster_auto_compaction_event(
    event: &AsterAgentEvent,
) -> Option<AutoCompactionEventProjection> {
    match event {
        AsterAgentEvent::Message(message) => project_aster_auto_compaction_message(message),
        _ => None,
    }
}

fn project_aster_auto_compaction_message(
    message: &AsterMessage,
) -> Option<AutoCompactionEventProjection> {
    if message.content.len() == 1 {
        if let Some(AsterMessageContent::SystemNotification(notification)) = message.content.first()
        {
            return Some(AutoCompactionEventProjection::SystemNotification {
                notification_type: project_aster_auto_compaction_notification_type(
                    &notification.notification_type,
                ),
                text: notification.msg.trim().to_string(),
            });
        }
    }

    Some(AutoCompactionEventProjection::Text {
        text: message.as_concat_text(),
    })
}

fn project_aster_auto_compaction_notification_type(
    notification_type: &AsterSystemNotificationType,
) -> AutoCompactionSystemNotificationKind {
    match notification_type {
        AsterSystemNotificationType::InlineMessage => {
            AutoCompactionSystemNotificationKind::InlineMessage
        }
        AsterSystemNotificationType::ThinkingMessage => {
            AutoCompactionSystemNotificationKind::ThinkingMessage
        }
    }
}

pub(crate) fn project_aster_turn_runtime(turn: TurnRuntime) -> AgentThreadTurn {
    project_turn_runtime(crate::event_converter::convert_turn_runtime(turn))
}

pub(crate) fn project_aster_item_runtime(item: ItemRuntime) -> Option<AgentThreadItem> {
    crate::event_converter::convert_item_runtime(item).map(project_item_runtime)
}

pub(crate) fn project_aster_runtime_snapshot(
    snapshot: &SessionRuntimeSnapshot,
) -> RuntimeTimelineSnapshotProjection {
    let thread_id = snapshot
        .threads
        .first()
        .map(|thread| thread.thread.id.clone());
    let turns = snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.turns.iter().cloned().map(project_aster_turn_runtime))
        .collect();
    let items = snapshot
        .threads
        .iter()
        .flat_map(|thread| {
            thread
                .items
                .iter()
                .cloned()
                .filter_map(project_aster_item_runtime)
        })
        .collect();

    RuntimeTimelineSnapshotProjection {
        thread_id,
        turns,
        items,
    }
}

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

pub(crate) fn project_aster_subagent_latest_turn(
    snapshot: &SessionRuntimeSnapshot,
) -> Option<SubagentLatestTurnProjection> {
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
        .map(|turn| {
            let turn_id = turn.id.clone();
            SubagentLatestTurnProjection {
                tool_count: count_aster_tool_items_for_turn(snapshot, &turn_id),
                duration_ms: resolve_aster_turn_duration_ms(turn),
                result_ref: resolve_aster_worker_result_ref(snapshot, &turn.thread_id, &turn_id),
                turn_id,
                status: project_aster_subagent_turn_status(turn.status),
            }
        })
}

fn project_aster_subagent_turn_status(status: aster::session::TurnStatus) -> SubagentTurnStatus {
    match status {
        aster::session::TurnStatus::Queued => SubagentTurnStatus::Queued,
        aster::session::TurnStatus::Running => SubagentTurnStatus::Running,
        aster::session::TurnStatus::Completed => SubagentTurnStatus::Completed,
        aster::session::TurnStatus::Failed => SubagentTurnStatus::Failed,
        aster::session::TurnStatus::Aborted => SubagentTurnStatus::Aborted,
    }
}

fn resolve_aster_turn_duration_ms(turn: &TurnRuntime) -> Option<u64> {
    let started_at = turn.started_at.unwrap_or(turn.created_at);
    let finished_at = turn.completed_at.unwrap_or(turn.updated_at);
    let duration_ms = finished_at
        .signed_duration_since(started_at)
        .num_milliseconds();
    (duration_ms >= 0).then_some(duration_ms as u64)
}

fn count_aster_tool_items_for_turn(snapshot: &SessionRuntimeSnapshot, turn_id: &str) -> usize {
    snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.items.iter())
        .filter(|item| {
            item.turn_id == turn_id && matches!(&item.payload, ItemRuntimePayload::ToolCall { .. })
        })
        .count()
}

fn build_runtime_item_ref(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    item_id: &str,
) -> String {
    format!("agent-runtime://session/{session_id}/thread/{thread_id}/turn/{turn_id}/item/{item_id}")
}

fn resolve_aster_worker_result_ref(
    snapshot: &SessionRuntimeSnapshot,
    thread_id: &str,
    turn_id: &str,
) -> Option<String> {
    snapshot
        .threads
        .iter()
        .filter(|thread| thread.thread.id == thread_id)
        .flat_map(|thread| {
            thread
                .items
                .iter()
                .filter(move |item| {
                    item.turn_id == turn_id
                        && matches!(&item.payload, ItemRuntimePayload::AgentMessage { .. })
                })
                .map(move |item| (thread.thread.session_id.as_str(), item))
        })
        .max_by(|(_, left), (_, right)| {
            left.sequence
                .cmp(&right.sequence)
                .then_with(|| left.updated_at.cmp(&right.updated_at))
                .then_with(|| left.id.cmp(&right.id))
        })
        .map(|(session_id, item)| {
            build_runtime_item_ref(session_id, &item.thread_id, &item.turn_id, &item.id)
        })
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

#[cfg(test)]
mod tests {
    use super::project_aster_subagent_latest_turn;
    use crate::subagent_control::SubagentTurnStatus;
    use aster::session::{
        ItemRuntime, ItemRuntimePayload, ItemStatus, SessionRuntimeSnapshot, ThreadRuntime,
        ThreadRuntimeSnapshot, TurnRuntime, TurnStatus,
    };
    use chrono::Utc;

    #[test]
    fn project_aster_subagent_latest_turn_should_include_duration_tool_count_and_result_ref() {
        let started_at = Utc::now();
        let completed_at = started_at + chrono::Duration::milliseconds(1_250);
        let turn = TurnRuntime {
            id: "turn-1".to_string(),
            session_id: "child-1".to_string(),
            thread_id: "thread-1".to_string(),
            status: TurnStatus::Completed,
            input_text: Some("整理结果".to_string()),
            error_message: None,
            context_override: None,
            output_schema_runtime: None,
            created_at: started_at,
            started_at: Some(started_at),
            completed_at: Some(completed_at),
            updated_at: completed_at,
        };
        let tool_item = ItemRuntime {
            id: "item-tool-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: ItemStatus::Completed,
            started_at,
            completed_at: Some(completed_at),
            updated_at: completed_at,
            payload: ItemRuntimePayload::ToolCall {
                tool_name: "read_file".to_string(),
                arguments: None,
                output: None,
                success: Some(true),
                error: None,
                metadata: None,
            },
        };
        let text_item = ItemRuntime {
            id: "item-text-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 2,
            status: ItemStatus::Completed,
            started_at,
            completed_at: Some(completed_at),
            updated_at: completed_at,
            payload: ItemRuntimePayload::AgentMessage {
                text: "完成".to_string(),
            },
        };
        let snapshot = SessionRuntimeSnapshot {
            session_id: "child-1".to_string(),
            threads: vec![ThreadRuntimeSnapshot {
                thread: ThreadRuntime::new("thread-1", "child-1", std::path::PathBuf::from("/tmp")),
                turns: vec![turn],
                items: vec![tool_item, text_item],
            }],
        };

        let projection = project_aster_subagent_latest_turn(&snapshot).expect("应存在最新 turn");

        assert_eq!(projection.turn_id, "turn-1");
        assert_eq!(projection.status, SubagentTurnStatus::Completed);
        assert_eq!(projection.duration_ms, Some(1_250));
        assert_eq!(projection.tool_count, 1);
        assert_eq!(
            projection.result_ref.as_deref(),
            Some("agent-runtime://session/child-1/thread/thread-1/turn/turn-1/item/item-text-1")
        );
    }
}
