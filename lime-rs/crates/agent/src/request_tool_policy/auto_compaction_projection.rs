use crate::protocol::AgentEvent as RuntimeAgentEvent;
use aster::agents::AgentEvent as AsterAgentEvent;
use aster::conversation::message::{Message, MessageContent, SystemNotificationType};

const ASTER_AUTO_COMPACTION_START_PREFIX: &str = "Exceeded auto-compact threshold of ";
pub(crate) const ASTER_AUTO_COMPACTION_COMPLETE_TEXT: &str = "Compaction complete";
pub(crate) const ASTER_AUTO_COMPACTION_THINKING_TEXT: &str =
    "aster is compacting the conversation...";
const ASTER_AUTO_COMPACTION_ERROR_PREFIX: &str = "Ran into this error trying to compact:";
pub(crate) const ASTER_AUTO_COMPACTION_DISABLED_TEXT: &str = "Automatic compaction is disabled for this turn. The conversation reached the context limit. Compact the session manually or start a new session before retrying.";

#[derive(Debug, Default)]
pub(crate) struct AutoCompactionProjectionState;

impl AutoCompactionProjectionState {
    pub(crate) fn project_event(
        &mut self,
        agent_event: &AsterAgentEvent,
    ) -> Option<Vec<RuntimeAgentEvent>> {
        match agent_event {
            AsterAgentEvent::Message(message) => self.project_message(message),
            _ => None,
        }
    }

    fn project_message(&mut self, message: &Message) -> Option<Vec<RuntimeAgentEvent>> {
        let Some((notification_type, notification_text)) =
            extract_single_system_notification(message)
        else {
            let error_message = extract_auto_compaction_failure(message)?;
            return Some(vec![RuntimeAgentEvent::Error {
                message: error_message,
            }]);
        };

        match notification_type {
            SystemNotificationType::InlineMessage
                if notification_text.starts_with(ASTER_AUTO_COMPACTION_START_PREFIX) =>
            {
                Some(vec![])
            }
            SystemNotificationType::ThinkingMessage
                if notification_text == ASTER_AUTO_COMPACTION_THINKING_TEXT =>
            {
                Some(vec![])
            }
            SystemNotificationType::InlineMessage
                if notification_text == ASTER_AUTO_COMPACTION_COMPLETE_TEXT =>
            {
                Some(vec![])
            }
            SystemNotificationType::InlineMessage
                if notification_text == ASTER_AUTO_COMPACTION_DISABLED_TEXT =>
            {
                Some(vec![RuntimeAgentEvent::Error {
                    message:
                        "当前会话已达到上下文上限，但当前工作区已关闭自动压缩。请先手动压缩上下文或新建会话后重试。"
                            .to_string(),
                }])
            }
            _ => None,
        }
    }
}

fn extract_single_system_notification(message: &Message) -> Option<(SystemNotificationType, &str)> {
    if message.content.len() != 1 {
        return None;
    }

    match message.content.first()? {
        MessageContent::SystemNotification(notification) => Some((
            notification.notification_type.clone(),
            notification.msg.trim(),
        )),
        _ => None,
    }
}

fn extract_auto_compaction_failure(message: &Message) -> Option<String> {
    let text = message.as_concat_text();
    let trimmed = text.trim();
    if !trimmed.starts_with(ASTER_AUTO_COMPACTION_ERROR_PREFIX) {
        return None;
    }

    let detail = trimmed
        .trim_start_matches(ASTER_AUTO_COMPACTION_ERROR_PREFIX)
        .trim()
        .split_once("\n\nPlease try again or create a new session")
        .map(|(left, _)| left.trim())
        .unwrap_or_else(|| {
            trimmed
                .trim_start_matches(ASTER_AUTO_COMPACTION_ERROR_PREFIX)
                .trim()
        })
        .trim_end_matches('.');

    let message = if detail.is_empty() {
        "自动压缩上下文失败，请重试或新建会话。".to_string()
    } else {
        format!("自动压缩上下文失败，请重试或新建会话：{detail}")
    };

    Some(message)
}
