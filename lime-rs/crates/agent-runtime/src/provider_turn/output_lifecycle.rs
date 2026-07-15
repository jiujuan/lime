use super::CurrentProviderTurnEvent;
use crate::reply_execution::RuntimeReplyAttemptError;

#[derive(Clone, Copy)]
pub(super) enum ProviderOutputFamily {
    Text,
    Reasoning,
}

impl ProviderOutputFamily {
    fn label(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Reasoning => "reasoning",
        }
    }

    fn started_event(self, item_id: String) -> CurrentProviderTurnEvent {
        match self {
            Self::Text => CurrentProviderTurnEvent::TextStart { item_id },
            Self::Reasoning => CurrentProviderTurnEvent::ReasoningStart { item_id },
        }
    }

    fn ended_event(self, item_id: String) -> CurrentProviderTurnEvent {
        match self {
            Self::Text => CurrentProviderTurnEvent::TextEnd { item_id },
            Self::Reasoning => CurrentProviderTurnEvent::ReasoningEnd { item_id },
        }
    }
}

pub(super) fn provider_output_item_id(
    turn_id: &str,
    attempt: u32,
    family: ProviderOutputFamily,
    source_item_id: &str,
) -> String {
    format!(
        "provider:{turn_id}:{attempt}:{}:{source_item_id}",
        family.label()
    )
}

pub(super) fn start_output_item<F>(
    active_item_id: &mut Option<String>,
    item_id: String,
    family: ProviderOutputFamily,
    on_event: &mut F,
    emitted_any: bool,
) -> Result<(), RuntimeReplyAttemptError>
where
    F: FnMut(CurrentProviderTurnEvent),
{
    match active_item_id.as_deref() {
        Some(active) if active == item_id => Ok(()),
        Some(active) => Err(RuntimeReplyAttemptError::new(
            format!(
                "Provider {} Item {} started while {} is still active",
                family.label(),
                item_id,
                active
            ),
            emitted_any,
        )),
        None => {
            *active_item_id = Some(item_id.clone());
            on_event(family.started_event(item_id));
            Ok(())
        }
    }
}

pub(super) fn end_output_item<F>(
    active_item_id: &mut Option<String>,
    item_id: String,
    family: ProviderOutputFamily,
    on_event: &mut F,
    emitted_any: bool,
) -> Result<(), RuntimeReplyAttemptError>
where
    F: FnMut(CurrentProviderTurnEvent),
{
    if active_item_id.is_none() {
        start_output_item(
            active_item_id,
            item_id.clone(),
            family,
            on_event,
            emitted_any,
        )?;
    }
    match active_item_id.as_deref() {
        Some(active) if active == item_id => {
            active_item_id.take();
            on_event(family.ended_event(item_id));
            Ok(())
        }
        Some(active) => Err(RuntimeReplyAttemptError::new(
            format!(
                "Provider {} Item {} ended while {} is still active",
                family.label(),
                item_id,
                active
            ),
            emitted_any,
        )),
        None => unreachable!("output item was started above"),
    }
}

pub(super) fn finish_active_output_items<F>(
    active_reasoning_item_id: &mut Option<String>,
    active_text_item_id: &mut Option<String>,
    on_event: &mut F,
) where
    F: FnMut(CurrentProviderTurnEvent),
{
    if let Some(item_id) = active_reasoning_item_id.take() {
        on_event(CurrentProviderTurnEvent::ReasoningEnd { item_id });
    }
    if let Some(item_id) = active_text_item_id.take() {
        on_event(CurrentProviderTurnEvent::TextEnd { item_id });
    }
}
