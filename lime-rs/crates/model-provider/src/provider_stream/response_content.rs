use super::{
    provider_stream_first_text_delta_chars, provider_stream_has_notification_text,
    provider_stream_model_change, provider_stream_tool_input_delta_events,
    RuntimeReplyProviderModelChange, RuntimeReplyProviderStreamProgress,
    RuntimeReplyProviderToolInputDelta, RuntimeReplyResponseEvent,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeReplyProviderResponseContent<'a> {
    Text(&'a str),
    SystemNotification(&'a str),
    ToolInputDelta(RuntimeReplyProviderToolInputDelta<'a>),
    StructuredToolRequest,
    Other,
}

#[derive(Clone, Debug, PartialEq)]
pub enum RuntimeReplyProviderResponseRoute {
    ToolInputDeltaEvents(Vec<RuntimeReplyResponseEvent>),
    Notification,
    DirectAnswer,
    ToolExecution,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RuntimeReplyProviderLeadWorkerModels<'a> {
    pub lead_model: &'a str,
    pub worker_model: &'a str,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeReplyProviderResponseOutcome {
    pub first_event_received: bool,
    pub first_text_delta_chars: Option<usize>,
    pub model_change: Option<RuntimeReplyProviderModelChange>,
    pub route: Option<RuntimeReplyProviderResponseRoute>,
}

#[derive(Debug, Default)]
pub struct RuntimeReplyProviderResponseSession {
    progress: RuntimeReplyProviderStreamProgress,
}

impl<'a> RuntimeReplyProviderResponseContent<'a> {
    pub fn text(text: &'a str) -> Self {
        Self::Text(text)
    }

    pub fn system_notification(text: &'a str) -> Self {
        Self::SystemNotification(text)
    }

    pub fn tool_input_delta(
        call_id: &'a str,
        tool_name: Option<&'a str>,
        delta: &'a str,
        accumulated_arguments: Option<&'a str>,
        provider: Option<&'a str>,
    ) -> Self {
        Self::ToolInputDelta(RuntimeReplyProviderToolInputDelta::new(
            call_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        ))
    }

    pub fn structured_tool_request() -> Self {
        Self::StructuredToolRequest
    }
}

impl<'a> RuntimeReplyProviderLeadWorkerModels<'a> {
    pub fn new(lead_model: &'a str, worker_model: &'a str) -> Self {
        Self {
            lead_model,
            worker_model,
        }
    }
}

impl RuntimeReplyProviderResponseSession {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn stream_progress(&self) -> &RuntimeReplyProviderStreamProgress {
        &self.progress
    }

    pub fn accept_response<'a, I>(
        &mut self,
        content: Option<I>,
        active_model: Option<&str>,
        lead_worker_models: Option<RuntimeReplyProviderLeadWorkerModels<'_>>,
        direct_answer_surface: bool,
        tools_available: bool,
    ) -> RuntimeReplyProviderResponseOutcome
    where
        I: IntoIterator<Item = RuntimeReplyProviderResponseContent<'a>>,
    {
        provider_stream_response_outcome(
            &mut self.progress,
            content,
            active_model,
            lead_worker_models,
            direct_answer_surface,
            tools_available,
        )
    }
}

pub fn provider_stream_response_text_chars<'a>(
    content: impl IntoIterator<Item = RuntimeReplyProviderResponseContent<'a>>,
) -> Option<usize> {
    provider_stream_first_text_delta_chars(content.into_iter().filter_map(
        |content| match content {
            RuntimeReplyProviderResponseContent::Text(text) => Some(text),
            _ => None,
        },
    ))
}

pub fn provider_stream_response_first_text_delta_chars<'a>(
    progress: &mut RuntimeReplyProviderStreamProgress,
    content: impl IntoIterator<Item = RuntimeReplyProviderResponseContent<'a>>,
) -> Option<usize> {
    progress.note_first_text_delta(provider_stream_response_text_chars(content))
}

pub fn provider_stream_response_has_notification_text<'a>(
    content: impl IntoIterator<Item = RuntimeReplyProviderResponseContent<'a>>,
) -> bool {
    provider_stream_has_notification_text(content.into_iter().filter_map(|content| match content {
        RuntimeReplyProviderResponseContent::SystemNotification(text) => Some(text),
        _ => None,
    }))
}

pub fn provider_stream_response_tool_input_delta_events<'a>(
    content: impl IntoIterator<Item = RuntimeReplyProviderResponseContent<'a>>,
) -> Option<Vec<RuntimeReplyResponseEvent>> {
    provider_stream_tool_input_delta_events(content.into_iter().map(|content| match content {
        RuntimeReplyProviderResponseContent::ToolInputDelta(delta) => Some(delta),
        _ => None,
    }))
}

pub fn provider_stream_response_route<'a>(
    content: impl IntoIterator<Item = RuntimeReplyProviderResponseContent<'a>>,
    direct_answer_surface: bool,
    tools_available: bool,
) -> RuntimeReplyProviderResponseRoute {
    let content = content.into_iter().collect::<Vec<_>>();

    if let Some(events) = provider_stream_response_tool_input_delta_events(content.iter().copied())
    {
        return RuntimeReplyProviderResponseRoute::ToolInputDeltaEvents(events);
    }

    if provider_stream_response_has_notification_text(content.iter().copied()) {
        return RuntimeReplyProviderResponseRoute::Notification;
    }

    if provider_stream_direct_answer_should_bypass_tool_execution(
        direct_answer_surface,
        tools_available,
    ) {
        return RuntimeReplyProviderResponseRoute::DirectAnswer;
    }

    RuntimeReplyProviderResponseRoute::ToolExecution
}

pub fn provider_stream_response_outcome<'a, I>(
    progress: &mut RuntimeReplyProviderStreamProgress,
    content: Option<I>,
    active_model: Option<&str>,
    lead_worker_models: Option<RuntimeReplyProviderLeadWorkerModels<'_>>,
    direct_answer_surface: bool,
    tools_available: bool,
) -> RuntimeReplyProviderResponseOutcome
where
    I: IntoIterator<Item = RuntimeReplyProviderResponseContent<'a>>,
{
    let content = content.map(|content| content.into_iter().collect::<Vec<_>>());
    let first_event_received = progress.note_first_event();
    let first_text_delta_chars = content.as_ref().and_then(|content| {
        progress.note_first_text_delta(provider_stream_response_text_chars(content.iter().copied()))
    });
    let route = content.as_ref().map(|content| {
        provider_stream_response_route(
            content.iter().copied(),
            direct_answer_surface,
            tools_available,
        )
    });
    let model_change = active_model.and_then(|active_model| {
        lead_worker_models.map(|models| {
            provider_stream_model_change(active_model, models.lead_model, models.worker_model)
        })
    });

    RuntimeReplyProviderResponseOutcome {
        first_event_received,
        first_text_delta_chars,
        model_change,
        route,
    }
}

pub fn provider_stream_direct_answer_should_bypass_tool_execution(
    direct_answer_surface: bool,
    tools_available: bool,
) -> bool {
    direct_answer_surface && !tools_available
}

pub fn provider_stream_direct_answer_should_strip_response_content(
    content: RuntimeReplyProviderResponseContent<'_>,
) -> bool {
    matches!(
        content,
        RuntimeReplyProviderResponseContent::StructuredToolRequest
    )
}
