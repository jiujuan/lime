use crate::protocol::AgentEvent as RuntimeAgentEvent;

const ASTER_AUTO_COMPACTION_START_PREFIX: &str = "Exceeded auto-compact threshold of ";
pub(crate) const ASTER_AUTO_COMPACTION_COMPLETE_TEXT: &str = "Compaction complete";
pub(crate) const ASTER_AUTO_COMPACTION_THINKING_TEXT: &str =
    "aster is compacting the conversation...";
const ASTER_AUTO_COMPACTION_ERROR_PREFIX: &str = "Ran into this error trying to compact:";
pub(crate) const ASTER_AUTO_COMPACTION_DISABLED_TEXT: &str = "Automatic compaction is disabled for this turn. The conversation reached the context limit. Compact the session manually or start a new session before retrying.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AutoCompactionSystemNotificationKind {
    InlineMessage,
    ThinkingMessage,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AutoCompactionEventProjection {
    SystemNotification {
        notification_type: AutoCompactionSystemNotificationKind,
        text: String,
    },
    Text {
        text: String,
    },
}

#[derive(Debug, Default)]
pub(crate) struct AutoCompactionProjectionState;

impl AutoCompactionProjectionState {
    pub(crate) fn project_event(
        &mut self,
        agent_event: &AutoCompactionEventProjection,
    ) -> Option<Vec<RuntimeAgentEvent>> {
        match agent_event {
            AutoCompactionEventProjection::SystemNotification {
                notification_type,
                text,
            } => self.project_system_notification(*notification_type, text),
            AutoCompactionEventProjection::Text { text } => {
                let error_message = extract_auto_compaction_failure(text)?;
                Some(vec![RuntimeAgentEvent::Error {
                    message: error_message,
                }])
            }
        }
    }

    fn project_system_notification(
        &mut self,
        notification_type: AutoCompactionSystemNotificationKind,
        notification_text: &str,
    ) -> Option<Vec<RuntimeAgentEvent>> {
        match notification_type {
            AutoCompactionSystemNotificationKind::InlineMessage
                if notification_text.starts_with(ASTER_AUTO_COMPACTION_START_PREFIX) =>
            {
                Some(vec![])
            }
            AutoCompactionSystemNotificationKind::ThinkingMessage
                if notification_text == ASTER_AUTO_COMPACTION_THINKING_TEXT =>
            {
                Some(vec![])
            }
            AutoCompactionSystemNotificationKind::InlineMessage
                if notification_text == ASTER_AUTO_COMPACTION_COMPLETE_TEXT =>
            {
                Some(vec![])
            }
            AutoCompactionSystemNotificationKind::InlineMessage
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

fn extract_auto_compaction_failure(text: &str) -> Option<String> {
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
