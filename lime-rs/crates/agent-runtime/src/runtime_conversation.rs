#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeConversationMessageSource<Message> {
    pub message: Message,
    pub user_visible: bool,
}

pub fn project_runtime_conversation_window<Message>(
    sources: impl IntoIterator<Item = RuntimeConversationMessageSource<Message>>,
    history_limit: Option<usize>,
    history_offset: usize,
) -> Vec<Message> {
    let messages = sources
        .into_iter()
        .filter_map(|source| source.user_visible.then_some(source.message))
        .collect::<Vec<_>>();

    let Some(limit) = history_limit else {
        return messages;
    };

    let len = messages.len();
    let end = len.saturating_sub(history_offset.min(len));
    let start = end.saturating_sub(limit);
    messages.into_iter().skip(start).take(end - start).collect()
}

#[cfg(test)]
mod tests {
    use super::{project_runtime_conversation_window, RuntimeConversationMessageSource};

    fn source(message: &str, user_visible: bool) -> RuntimeConversationMessageSource<String> {
        RuntimeConversationMessageSource {
            message: message.to_string(),
            user_visible,
        }
    }

    #[test]
    fn project_runtime_conversation_window_filters_visibility_and_applies_page_window() {
        let messages = project_runtime_conversation_window(
            [
                source("first-user", true),
                source("agent-only", false),
                source("first-assistant", true),
                source("second-user", true),
            ],
            Some(2),
            0,
        );

        assert_eq!(messages, vec!["first-assistant", "second-user"]);

        let previous = project_runtime_conversation_window(
            [
                source("first-user", true),
                source("agent-only", false),
                source("first-assistant", true),
                source("second-user", true),
            ],
            Some(1),
            1,
        );

        assert_eq!(previous, vec!["first-assistant"]);
    }

    #[test]
    fn project_runtime_conversation_window_keeps_legacy_offset_behavior_without_limit() {
        let messages = project_runtime_conversation_window(
            [source("first-user", true), source("second-user", true)],
            None,
            1,
        );

        assert_eq!(messages, vec!["first-user", "second-user"]);
    }
}
