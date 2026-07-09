//! Context management compatibility stub.

use anyhow::Result;

use crate::conversation::Conversation;
use crate::providers::base::{Provider, ProviderUsage, Usage};
use crate::session::Session;

pub const DEFAULT_COMPACTION_THRESHOLD: f64 = 1.0;

pub fn automatic_compaction_enabled_for_current_turn() -> bool {
    false
}

pub async fn check_if_compaction_needed(
    _provider: &dyn Provider,
    _conversation: &Conversation,
    _threshold: Option<f64>,
    _session: &Session,
) -> Result<bool> {
    Ok(false)
}

pub async fn compact_messages_with_summary(
    provider: &dyn Provider,
    conversation: &Conversation,
    _manual_compact: bool,
) -> Result<(Conversation, ProviderUsage, String)> {
    Ok((
        conversation.clone(),
        ProviderUsage::new(
            provider.get_model_config().model_name.clone(),
            Usage::default(),
        ),
        String::new(),
    ))
}
