use crate::agents::extension_manager::ExtensionManager;
use crate::conversation::message::Message;
use crate::conversation::{fix_conversation, Conversation};
use rmcp::model::Role;

// Test-only utility. Do not use in production code. No `test` directive due to call outside crate.
thread_local! {
    pub static SKIP: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

pub async fn inject_moim(
    conversation: Conversation,
    extension_manager: &ExtensionManager,
) -> Conversation {
    if SKIP.with(|f| f.get()) {
        return conversation;
    }

    if let Some(moim) = extension_manager.collect_moim().await {
        let mut messages = conversation.messages().clone();
        let idx = messages
            .iter()
            .rposition(|m| m.role == Role::Assistant)
            .unwrap_or(0);
        messages.insert(idx, Message::user().with_text(moim).agent_only());

        let (fixed, issues) = fix_conversation(Conversation::new_unvalidated(messages));

        let has_unexpected_issues = issues
            .iter()
            .any(|issue| !issue.contains("Merged consecutive assistant messages"));

        if has_unexpected_issues {
            tracing::warn!("MOIM injection caused unexpected issues: {:?}", issues);
            return conversation;
        }

        return fixed;
    }
    conversation
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::CallToolRequestParam;

    #[tokio::test]
    async fn test_moim_injection_before_assistant() {
        let em = ExtensionManager::new_without_provider();

        let conv = Conversation::new_unvalidated(vec![
            Message::user().with_text("Hello"),
            Message::assistant().with_text("Hi"),
            Message::user().with_text("Bye"),
        ]);
        let result = inject_moim(conv, &em).await;
        let msgs = result.messages();

        assert_eq!(msgs.len(), 4);
        assert_eq!(msgs[0].content[0].as_text().unwrap(), "Hello");
        assert!(msgs[1].content[0]
            .as_text()
            .unwrap()
            .starts_with("<info-msg>\nIt is currently "));
        assert!(!msgs[1].is_user_visible());
        assert!(msgs[1].is_agent_visible());
        assert_eq!(msgs[2].content[0].as_text().unwrap(), "Hi");
    }

    #[tokio::test]
    async fn test_moim_injection_no_assistant() {
        let em = ExtensionManager::new_without_provider();

        let conv = Conversation::new_unvalidated(vec![Message::user().with_text("Hello")]);
        let result = inject_moim(conv, &em).await;

        assert_eq!(result.messages().len(), 2);

        assert!(result.messages()[0].content[0]
            .as_text()
            .unwrap()
            .starts_with("<info-msg>\nIt is currently "));
        assert!(!result.messages()[0].is_user_visible());
        assert!(result.messages()[0].is_agent_visible());
        assert_eq!(result.messages()[1].content[0].as_text().unwrap(), "Hello");
    }

    #[tokio::test]
    async fn test_moim_with_tool_calls() {
        let em = ExtensionManager::new_without_provider();

        let conv = Conversation::new_unvalidated(vec![
            Message::user().with_text("Search for something"),
            Message::assistant()
                .with_text("I'll search for you")
                .with_tool_request(
                    "search_1",
                    Ok(CallToolRequestParam {
                        name: "search".into(),
                        arguments: None,
                    }),
                ),
            Message::user().with_tool_response(
                "search_1",
                Ok(rmcp::model::CallToolResult {
                    content: vec![],
                    structured_content: None,
                    is_error: Some(false),
                    meta: None,
                }),
            ),
            Message::assistant()
                .with_text("I need to search more")
                .with_tool_request(
                    "search_2",
                    Ok(CallToolRequestParam {
                        name: "search".into(),
                        arguments: None,
                    }),
                ),
            Message::user().with_tool_response(
                "search_2",
                Ok(rmcp::model::CallToolResult {
                    content: vec![],
                    structured_content: None,
                    is_error: Some(false),
                    meta: None,
                }),
            ),
        ]);

        let result = inject_moim(conv, &em).await;
        let msgs = result.messages();

        assert_eq!(msgs.len(), 6);

        let moim_msg = &msgs[3];
        let has_moim = moim_msg
            .content
            .iter()
            .any(|c| c.as_text().is_some_and(|t| t.contains("<info-msg>")));

        assert!(
            has_moim,
            "MOIM should be in message before latest assistant message"
        );
    }
}
