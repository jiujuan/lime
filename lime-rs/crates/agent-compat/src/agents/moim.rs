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
