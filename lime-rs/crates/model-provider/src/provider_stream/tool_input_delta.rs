use super::RuntimeReplyResponseEvent;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RuntimeReplyProviderToolInputDelta<'a> {
    pub call_id: &'a str,
    pub tool_name: Option<&'a str>,
    pub delta: &'a str,
    pub accumulated_arguments: Option<&'a str>,
    pub provider: Option<&'a str>,
}

impl<'a> RuntimeReplyProviderToolInputDelta<'a> {
    pub fn new(
        call_id: &'a str,
        tool_name: Option<&'a str>,
        delta: &'a str,
        accumulated_arguments: Option<&'a str>,
        provider: Option<&'a str>,
    ) -> Self {
        Self {
            call_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        }
    }
}

pub fn provider_stream_tool_input_delta_events<'a>(
    content: impl IntoIterator<Item = Option<RuntimeReplyProviderToolInputDelta<'a>>>,
) -> Option<Vec<RuntimeReplyResponseEvent>> {
    let mut seen_content = false;
    let mut events = Vec::new();

    for item in content {
        seen_content = true;
        let delta = item?;
        if delta.call_id.trim().is_empty() || delta.delta.is_empty() {
            continue;
        }
        events.push(RuntimeReplyResponseEvent::ToolCallInputDelta {
            call_id: delta.call_id.to_string(),
            tool_name: delta.tool_name.map(str::to_string),
            delta: delta.delta.to_string(),
            accumulated_arguments: delta.accumulated_arguments.map(str::to_string),
            provider: delta.provider.map(str::to_string),
        });
    }

    seen_content.then_some(events)
}
