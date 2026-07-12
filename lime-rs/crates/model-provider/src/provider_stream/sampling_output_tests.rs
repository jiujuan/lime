use super::*;
use futures::stream::{self, BoxStream, StreamExt};

type TestSampleStream = BoxStream<'static, Result<(Option<String>, Option<i32>), String>>;

#[derive(Default)]
struct TestPlaintextNormalizer {
    pending: Option<String>,
}

impl RuntimeReplyProviderPlaintextMessageNormalizer<String> for TestPlaintextNormalizer {
    fn process(&mut self, message: String) -> Vec<String> {
        if message == "pending-start" {
            self.pending = Some("pending-flush".to_string());
            Vec::new()
        } else {
            vec![message]
        }
    }

    fn finish(&mut self) -> Option<String> {
        self.pending.take()
    }
}

fn test_stream_item(message: Option<&str>, usage: Option<i32>) -> TestSampleStream {
    let message = message.map(str::to_string);
    stream::once(async move { Ok((message, usage)) }).boxed()
}

fn test_error_stream(error: &str) -> TestSampleStream {
    let error = error.to_string();
    stream::once(async move { Err(error) }).boxed()
}

fn test_response_content(message: &String) -> Vec<RuntimeReplyProviderResponseContent<'_>> {
    vec![RuntimeReplyProviderResponseContent::text(message.as_str())]
}

fn test_sampling_session(supports_streaming: bool) -> RuntimeReplyProviderSamplingSession {
    RuntimeReplyProviderSamplingSession::start(RuntimeReplyProviderSamplingRequest::new(
        "provider",
        "model",
        1,
        0,
        0,
        None,
        supports_streaming,
    ))
}

#[tokio::test]
async fn sampled_outputs_keep_direct_answer_usage_attached() {
    let stream = provider_stream_open_sampled_message_outputs(
        test_sampling_session(true),
        || async { Ok(test_stream_item(Some("answer"), Some(3))) },
        || async { Ok(("fallback".to_string(), 9)) },
        |(message, usage)| test_stream_item(Some(&message), Some(usage)),
        |_| RuntimeReplyProviderSamplingFailureLogLevel::Warn,
        test_response_content,
        TestPlaintextNormalizer::default(),
        true,
    )
    .await
    .expect("sampled stream");

    let outputs = stream.collect::<Vec<_>>().await;

    assert_eq!(outputs, vec![Ok((Some("answer".to_string()), Some(3)))]);
}

#[tokio::test]
async fn sampled_outputs_retry_empty_first_stream_with_non_stream_fallback() {
    let stream = provider_stream_open_sampled_message_outputs(
        test_sampling_session(true),
        || async { Ok(test_error_stream(PROVIDER_EMPTY_STREAM_RETRY_MARKER)) },
        || async { Ok(("fallback".to_string(), 9)) },
        |(message, usage)| test_stream_item(Some(&message), Some(usage)),
        |_| RuntimeReplyProviderSamplingFailureLogLevel::Warn,
        test_response_content,
        TestPlaintextNormalizer::default(),
        false,
    )
    .await
    .expect("sampled stream");

    let outputs = stream.collect::<Vec<_>>().await;

    assert_eq!(outputs, vec![Ok((Some("fallback".to_string()), Some(9)))]);
}

#[tokio::test]
async fn sampled_outputs_flush_pending_plaintext_message_with_usage() {
    let stream = provider_stream_open_sampled_message_outputs(
        test_sampling_session(true),
        || async { Ok(test_stream_item(Some("pending-start"), Some(7))) },
        || async { Ok(("fallback".to_string(), 9)) },
        |(message, usage)| test_stream_item(Some(&message), Some(usage)),
        |_| RuntimeReplyProviderSamplingFailureLogLevel::Warn,
        test_response_content,
        TestPlaintextNormalizer::default(),
        false,
    )
    .await
    .expect("sampled stream");

    let outputs = stream.collect::<Vec<_>>().await;

    assert_eq!(
        outputs,
        vec![Ok((Some("pending-flush".to_string()), Some(7)))]
    );
}
