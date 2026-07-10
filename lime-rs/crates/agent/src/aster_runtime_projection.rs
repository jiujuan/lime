//! Aster runtime projection facade.
//!
//! Aster DTOs must stay behind this migration boundary; current projection APIs
//! consume Lime-owned shapes.

use aster::AgentEvent as AsterAgentEvent;
use aster::{
    Message as AsterMessage, MessageContent as AsterMessageContent,
    SystemNotificationType as AsterSystemNotificationType,
};

use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::request_tool_policy::auto_compaction_projection::{
    AutoCompactionEventProjection, AutoCompactionSystemNotificationKind,
};
use crate::turn_context_configuration::AgentTurnContext;

pub(crate) fn project_aster_runtime_event_with_turn_context(
    event: AsterAgentEvent,
    active_turn_context: Option<&AgentTurnContext>,
) -> Vec<RuntimeAgentEvent> {
    crate::event_converter::convert_agent_event_with_turn_context(event, active_turn_context)
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
