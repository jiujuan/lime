use super::{
    provider_stream_first_text_delta_chars, provider_stream_has_notification_text,
    provider_stream_tool_input_delta_events, RuntimeReplyProviderToolInputDelta,
    RuntimeReplyResponseEvent,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeReplyProviderResponseContent<'a> {
    Text(&'a str),
    SystemNotification(&'a str),
    ToolInputDelta(RuntimeReplyProviderToolInputDelta<'a>),
    Other,
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
