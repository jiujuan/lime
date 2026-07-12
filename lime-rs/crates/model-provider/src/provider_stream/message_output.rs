#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuntimeReplyProviderMessageOutput<Message, Usage> {
    Message {
        message: Message,
        usage: Option<Usage>,
    },
    Usage(Usage),
}

pub fn provider_stream_single_message_output<Message, Usage>(
    message: Message,
    usage: Option<Usage>,
) -> Vec<RuntimeReplyProviderMessageOutput<Message, Usage>> {
    vec![RuntimeReplyProviderMessageOutput::Message { message, usage }]
}

pub fn provider_stream_message_outputs<Message, Usage>(
    messages: impl IntoIterator<Item = Message>,
    pending_message: Option<Message>,
    usage: Option<Usage>,
) -> Vec<RuntimeReplyProviderMessageOutput<Message, Usage>> {
    let mut outputs = Vec::new();
    let mut usage_to_emit = usage;
    let mut emitted_message = false;

    for message in messages {
        emitted_message = true;
        outputs.push(RuntimeReplyProviderMessageOutput::Message {
            message,
            usage: usage_to_emit.take(),
        });
    }

    if usage_to_emit.is_some() {
        if let Some(message) = pending_message {
            emitted_message = true;
            outputs.push(RuntimeReplyProviderMessageOutput::Message {
                message,
                usage: usage_to_emit.take(),
            });
        }
    }

    if !emitted_message {
        if let Some(usage) = usage_to_emit {
            outputs.push(RuntimeReplyProviderMessageOutput::Usage(usage));
        }
    }

    outputs
}
