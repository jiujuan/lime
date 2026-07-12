use super::message_output::{
    provider_stream_message_outputs, provider_stream_single_message_output,
    RuntimeReplyProviderMessageOutput,
};
use super::response_content::RuntimeReplyProviderResponseContent;
use super::sampling::{
    RuntimeReplyProviderSamplingFailureLogLevel, RuntimeReplyProviderSamplingSession,
    RuntimeReplyProviderSamplingStreamItem,
};
use async_stream::try_stream;
use futures::stream::{BoxStream, Stream, StreamExt};
use std::future::Future;

pub type RuntimeReplyProviderSampledMessageStream<Message, Usage, Error> =
    BoxStream<'static, Result<(Option<Message>, Option<Usage>), Error>>;

pub trait RuntimeReplyProviderPlaintextMessageNormalizer<Message> {
    fn process(&mut self, message: Message) -> Vec<Message>;
    fn finish(&mut self) -> Option<Message>;
}

#[allow(clippy::too_many_arguments)]
pub async fn provider_stream_open_sampled_message_outputs<
    ProviderStream,
    OpenStream,
    OpenStreamFuture,
    Complete,
    CompleteFuture,
    StreamFromComplete,
    FailureLogLevel,
    ResponseContent,
    PlaintextNormalizer,
    Message,
    Usage,
    Error,
>(
    sampling_session: RuntimeReplyProviderSamplingSession,
    open_stream: OpenStream,
    complete: Complete,
    stream_from_complete: StreamFromComplete,
    failure_log_level: FailureLogLevel,
    response_content: ResponseContent,
    plaintext_normalizer: PlaintextNormalizer,
    direct_answer_surface: bool,
) -> Result<RuntimeReplyProviderSampledMessageStream<Message, Usage, Error>, Error>
where
    ProviderStream:
        Stream<Item = Result<(Option<Message>, Option<Usage>), Error>> + Send + Unpin + 'static,
    OpenStream: FnOnce() -> OpenStreamFuture + Send + 'static,
    OpenStreamFuture: Future<Output = Result<ProviderStream, Error>> + Send + 'static,
    Complete: Fn() -> CompleteFuture + Clone + Send + Sync + 'static,
    CompleteFuture: Future<Output = Result<(Message, Usage), Error>> + Send + 'static,
    StreamFromComplete: FnOnce((Message, Usage)) -> ProviderStream + Send + 'static,
    FailureLogLevel: Fn(&Error) -> RuntimeReplyProviderSamplingFailureLogLevel + Send + 'static,
    ResponseContent:
        for<'a> Fn(&'a Message) -> Vec<RuntimeReplyProviderResponseContent<'a>> + Send + 'static,
    PlaintextNormalizer: RuntimeReplyProviderPlaintextMessageNormalizer<Message> + Send + 'static,
    Message: Send + 'static,
    Usage: Send + 'static,
    Error: std::fmt::Display + Send + 'static,
{
    let complete_for_open = complete.clone();
    let stream = sampling_session
        .open_stream(
            open_stream,
            move || complete_for_open(),
            stream_from_complete,
            failure_log_level,
        )
        .await?;

    Ok(provider_stream_sampled_message_outputs(
        stream,
        sampling_session,
        complete,
        response_content,
        plaintext_normalizer,
        direct_answer_surface,
    ))
}

pub fn provider_stream_sampled_message_outputs<
    ProviderStream,
    Complete,
    CompleteFuture,
    ResponseContent,
    PlaintextNormalizer,
    Message,
    Usage,
    Error,
>(
    mut stream: ProviderStream,
    mut sampling_session: RuntimeReplyProviderSamplingSession,
    complete: Complete,
    response_content: ResponseContent,
    mut plaintext_normalizer: PlaintextNormalizer,
    direct_answer_surface: bool,
) -> RuntimeReplyProviderSampledMessageStream<Message, Usage, Error>
where
    ProviderStream:
        Stream<Item = Result<(Option<Message>, Option<Usage>), Error>> + Send + Unpin + 'static,
    Complete: Fn() -> CompleteFuture + Clone + Send + Sync + 'static,
    CompleteFuture: Future<Output = Result<(Message, Usage), Error>> + Send + 'static,
    ResponseContent:
        for<'a> Fn(&'a Message) -> Vec<RuntimeReplyProviderResponseContent<'a>> + Send + 'static,
    PlaintextNormalizer: RuntimeReplyProviderPlaintextMessageNormalizer<Message> + Send + 'static,
    Message: Send + 'static,
    Usage: Send + 'static,
    Error: std::fmt::Display + Send + 'static,
{
    Box::pin(try_stream! {
        while let Some(next) = stream.next().await {
            let (mut message, usage) = match sampling_session.accept_stream_item(next) {
                RuntimeReplyProviderSamplingStreamItem::Item { message, usage } => {
                    (message, usage)
                }
                RuntimeReplyProviderSamplingStreamItem::RetryEmptyFirstContent(_error) => {
                    let (message, usage) = complete().await?;
                    (Some(message), Some(usage))
                }
                RuntimeReplyProviderSamplingStreamItem::Error(error) => Err(error)?,
            };
            if let Some(response) = message.take() {
                if direct_answer_surface {
                    sampling_session.accept_response_text_delta(response_content(&response));
                    for output in provider_stream_single_message_output(response, usage) {
                        yield sampled_message_output(output);
                    }
                    continue;
                }

                let normalized_messages = plaintext_normalizer.process(response);
                let pending_message = if normalized_messages.is_empty() && usage.is_some() {
                    plaintext_normalizer.finish()
                } else {
                    None
                };
                for output in provider_stream_message_outputs(
                    normalized_messages,
                    pending_message,
                    usage,
                ) {
                    match output {
                        RuntimeReplyProviderMessageOutput::Message { ref message, .. } => {
                            sampling_session.accept_response_text_delta(response_content(message));
                        }
                        RuntimeReplyProviderMessageOutput::Usage(_) => {}
                    }
                    yield sampled_message_output(output);
                }
                continue;
            }

            yield (message, usage);
        }
        if let Some(pending_message) = plaintext_normalizer.finish() {
            sampling_session.accept_response_text_delta(response_content(&pending_message));
            yield (Some(pending_message), None);
        }
    })
}

fn sampled_message_output<Message, Usage>(
    output: RuntimeReplyProviderMessageOutput<Message, Usage>,
) -> (Option<Message>, Option<Usage>) {
    match output {
        RuntimeReplyProviderMessageOutput::Message { message, usage } => (Some(message), usage),
        RuntimeReplyProviderMessageOutput::Usage(usage) => (None, Some(usage)),
    }
}
