//! 运行时协议投影边界
//!
//! 这里是业务层消费的 current 入口。
//! 旧 `event_converter` 仅保留 compat converter 语义，不再作为生产调用入口暴露。

use agent_runtime::runtime_timeline::{
    RuntimeTimelineItemPayload, RuntimeTimelineItemProjection, RuntimeTimelineItemStatus,
    RuntimeTimelineRequestOption, RuntimeTimelineRequestQuestion, RuntimeTimelineTurnProjection,
    RuntimeTimelineTurnStatus,
};
use lime_core::database::dao::agent_timeline::{
    AgentRequestOption, AgentRequestQuestion, AgentThreadItem, AgentThreadItemPayload,
    AgentThreadItemStatus, AgentThreadTurn, AgentThreadTurnStatus,
};

use crate::protocol::AgentTurnContextSummary as RuntimeTurnContextSummary;
use crate::turn_context_configuration::AgentTurnContext;

pub type RuntimeTurnProjection = RuntimeTimelineTurnProjection;
pub type RuntimeItemProjection = RuntimeTimelineItemProjection;

pub fn project_turn_runtime(turn: RuntimeTurnProjection) -> AgentThreadTurn {
    AgentThreadTurn {
        id: turn.id,
        thread_id: turn.thread_id,
        prompt_text: turn.prompt_text,
        status: project_turn_status(turn.status),
        started_at: turn.started_at,
        completed_at: turn.completed_at,
        error_message: turn.error_message,
        created_at: turn.created_at,
        updated_at: turn.updated_at,
    }
}

pub fn project_item_runtime(item: RuntimeItemProjection) -> AgentThreadItem {
    AgentThreadItem {
        id: item.id,
        thread_id: item.thread_id,
        turn_id: item.turn_id,
        sequence: item.sequence,
        status: project_item_status(item.status),
        started_at: item.started_at,
        completed_at: item.completed_at,
        updated_at: item.updated_at,
        payload: project_item_payload(item.payload),
    }
}

pub fn project_turn_context_summary(
    turn_context: Option<&AgentTurnContext>,
) -> Option<RuntimeTurnContextSummary> {
    crate::protocol_context_projection::project_turn_context_summary(turn_context)
}

pub fn project_turn_context_summary_with_active_context_tokens(
    turn_context: Option<&AgentTurnContext>,
    active_context_tokens: Option<u32>,
) -> Option<RuntimeTurnContextSummary> {
    crate::protocol_context_projection::project_turn_context_summary_with_active_context_tokens(
        turn_context,
        active_context_tokens,
    )
}

fn project_turn_status(status: RuntimeTimelineTurnStatus) -> AgentThreadTurnStatus {
    match status {
        RuntimeTimelineTurnStatus::Running => AgentThreadTurnStatus::Running,
        RuntimeTimelineTurnStatus::Completed => AgentThreadTurnStatus::Completed,
        RuntimeTimelineTurnStatus::Failed => AgentThreadTurnStatus::Failed,
        RuntimeTimelineTurnStatus::Aborted => AgentThreadTurnStatus::Aborted,
    }
}

fn project_item_status(status: RuntimeTimelineItemStatus) -> AgentThreadItemStatus {
    match status {
        RuntimeTimelineItemStatus::InProgress => AgentThreadItemStatus::InProgress,
        RuntimeTimelineItemStatus::Completed => AgentThreadItemStatus::Completed,
        RuntimeTimelineItemStatus::Failed => AgentThreadItemStatus::Failed,
    }
}

fn project_item_payload(payload: RuntimeTimelineItemPayload) -> AgentThreadItemPayload {
    match payload {
        RuntimeTimelineItemPayload::UserMessage { content } => {
            AgentThreadItemPayload::UserMessage { content }
        }
        RuntimeTimelineItemPayload::AgentMessage { text, phase } => {
            AgentThreadItemPayload::AgentMessage { text, phase }
        }
        RuntimeTimelineItemPayload::Plan { text } => AgentThreadItemPayload::Plan { text },
        RuntimeTimelineItemPayload::Reasoning {
            text,
            summary,
            metadata,
        } => AgentThreadItemPayload::Reasoning {
            text,
            summary,
            metadata,
        },
        RuntimeTimelineItemPayload::ToolCall {
            tool_name,
            arguments,
            output,
            success,
            error,
            metadata,
        } => AgentThreadItemPayload::ToolCall {
            tool_name,
            arguments,
            output,
            success,
            error,
            metadata,
        },
        RuntimeTimelineItemPayload::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        } => AgentThreadItemPayload::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        },
        RuntimeTimelineItemPayload::RequestUserInput {
            request_id,
            action_type,
            prompt,
            questions,
            response,
        } => AgentThreadItemPayload::RequestUserInput {
            request_id,
            action_type,
            prompt,
            questions: questions.map(project_request_questions),
            response,
        },
        RuntimeTimelineItemPayload::FileArtifact {
            path,
            source,
            content,
            metadata,
        } => AgentThreadItemPayload::FileArtifact {
            path,
            source,
            content,
            metadata,
        },
        RuntimeTimelineItemPayload::TurnSummary { text, metadata } => {
            AgentThreadItemPayload::TurnSummary { text, metadata }
        }
    }
}

fn project_request_questions(
    questions: Vec<RuntimeTimelineRequestQuestion>,
) -> Vec<AgentRequestQuestion> {
    questions
        .into_iter()
        .map(|question| AgentRequestQuestion {
            question: question.question,
            header: question.header,
            options: question.options.map(project_request_options),
            multi_select: question.multi_select,
        })
        .collect()
}

fn project_request_options(options: Vec<RuntimeTimelineRequestOption>) -> Vec<AgentRequestOption> {
    options
        .into_iter()
        .map(|option| AgentRequestOption {
            label: option.label,
            description: option.description,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_runtime_timeline_statuses_to_gui_timeline_statuses() {
        let turn = project_turn_runtime(RuntimeTimelineTurnProjection {
            id: "turn-1".to_string(),
            thread_id: "thread-1".to_string(),
            prompt_text: "hi".to_string(),
            status: RuntimeTimelineTurnStatus::Failed,
            started_at: "2026-07-06T00:00:00Z".to_string(),
            completed_at: None,
            error_message: Some("failed".to_string()),
            created_at: "2026-07-06T00:00:00Z".to_string(),
            updated_at: "2026-07-06T00:00:01Z".to_string(),
        });
        let item = project_item_runtime(RuntimeTimelineItemProjection {
            id: "item-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: RuntimeTimelineItemStatus::InProgress,
            started_at: "2026-07-06T00:00:00Z".to_string(),
            completed_at: None,
            updated_at: "2026-07-06T00:00:01Z".to_string(),
            payload: RuntimeTimelineItemPayload::Plan {
                text: "plan".to_string(),
            },
        });

        assert_eq!(turn.status, AgentThreadTurnStatus::Failed);
        assert_eq!(item.status, AgentThreadItemStatus::InProgress);
    }
}
