pub use agent_protocol::provider_trace::ProviderTraceResponseContext as RuntimeReplyProviderResponseContext;

const PROVIDER_REQUEST_ID_HEADERS: &[&str] = &[
    "x-request-id",
    "x-oai-request-id",
    "x-openai-request-id",
    "request-id",
    "x-amzn-requestid",
    "x-amz-request-id",
    "x-goog-request-id",
    "x-ms-request-id",
];
const MAX_PROVIDER_REQUEST_ID_LEN: usize = 256;

pub fn provider_stream_response_context_from_header_pairs<I, N, V>(
    headers: I,
) -> Option<RuntimeReplyProviderResponseContext>
where
    I: IntoIterator<Item = (N, V)>,
    N: AsRef<str>,
    V: AsRef<str>,
{
    let headers = headers
        .into_iter()
        .map(|(name, value)| (name.as_ref().to_string(), value.as_ref().to_string()))
        .collect::<Vec<_>>();

    PROVIDER_REQUEST_ID_HEADERS.iter().find_map(|allowed| {
        headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(allowed))
            .and_then(|(_, value)| normalize_provider_request_id(value))
            .map(|value| {
                RuntimeReplyProviderResponseContext::new(Some(value), Some((*allowed).to_string()))
            })
    })
}

fn normalize_provider_request_id(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > MAX_PROVIDER_REQUEST_ID_LEN {
        return None;
    }
    value
        .bytes()
        .all(|byte| matches!(byte, b'!'..=b'~'))
        .then(|| value.to_string())
}
