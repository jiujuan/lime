use serde_json::Map;
use serde_json::Value;

const W3C_TRACE_CONTEXT_KEYS: &[&str] = &["w3cTraceContext", "w3c_trace_context"];
const MAX_TRACESTATE_LEN: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct W3cTraceContext {
    pub(crate) trace_id: String,
    pub(crate) parent_span_id: String,
    pub(crate) trace_flags: String,
    pub(crate) traceparent: String,
    pub(crate) tracestate: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum W3cTraceContextParse {
    Missing,
    InvalidTraceparent,
    Valid(W3cTraceContext),
}

pub(crate) fn parse_w3c_trace_context(payload: &Map<String, Value>) -> W3cTraceContextParse {
    let Some(record) = W3C_TRACE_CONTEXT_KEYS
        .iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_object)
    else {
        return W3cTraceContextParse::Missing;
    };

    let Some(traceparent) = string_field(record, &["traceparent"]) else {
        return W3cTraceContextParse::Missing;
    };
    let Some(parts) = normalize_traceparent(&traceparent) else {
        return W3cTraceContextParse::InvalidTraceparent;
    };

    W3cTraceContextParse::Valid(W3cTraceContext {
        trace_id: parts.trace_id,
        parent_span_id: parts.parent_span_id,
        trace_flags: parts.trace_flags,
        traceparent: parts.traceparent,
        tracestate: string_field(record, &["tracestate"]).and_then(normalize_tracestate),
    })
}

pub(crate) fn w3c_trace_context(payload: &Map<String, Value>) -> Option<W3cTraceContext> {
    match parse_w3c_trace_context(payload) {
        W3cTraceContextParse::Valid(context) => Some(context),
        W3cTraceContextParse::Missing | W3cTraceContextParse::InvalidTraceparent => None,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TraceparentParts {
    trace_id: String,
    parent_span_id: String,
    trace_flags: String,
    traceparent: String,
}

fn normalize_traceparent(value: &str) -> Option<TraceparentParts> {
    let normalized = value.trim().to_ascii_lowercase();
    let mut parts = normalized.split('-');
    let version = parts.next()?;
    let trace_id = parts.next()?;
    let parent_span_id = parts.next()?;
    let trace_flags = parts.next()?;
    if parts.next().is_some()
        || version != "00"
        || trace_id.len() != 32
        || parent_span_id.len() != 16
        || trace_flags.len() != 2
        || !is_non_zero_hex(trace_id)
        || !is_non_zero_hex(parent_span_id)
        || !is_lowercase_hex(trace_flags)
    {
        return None;
    }
    Some(TraceparentParts {
        trace_id: trace_id.to_string(),
        parent_span_id: parent_span_id.to_string(),
        trace_flags: trace_flags.to_string(),
        traceparent: format!("{version}-{trace_id}-{parent_span_id}-{trace_flags}"),
    })
}

fn normalize_tracestate(value: String) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > MAX_TRACESTATE_LEN {
        return None;
    }
    value
        .bytes()
        .all(|byte| matches!(byte, b' '..=b'~'))
        .then(|| value.to_string())
}

fn string_field(payload: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn is_non_zero_hex(value: &str) -> bool {
    is_lowercase_hex(value) && value.bytes().any(|byte| byte != b'0')
}

fn is_lowercase_hex(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_and_normalizes_valid_w3c_trace_context() {
        let payload = json!({
            "w3cTraceContext": {
                "traceparent": "00-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-BBBBBBBBBBBBBBBB-01",
                "tracestate": " vendor=value "
            }
        });
        let context = w3c_trace_context(payload.as_object().expect("object")).expect("context");

        assert_eq!(context.trace_id, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        assert_eq!(context.parent_span_id, "bbbbbbbbbbbbbbbb");
        assert_eq!(context.trace_flags, "01");
        assert_eq!(
            context.traceparent,
            "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01"
        );
        assert_eq!(context.tracestate.as_deref(), Some("vendor=value"));
    }

    #[test]
    fn rejects_zero_trace_id_or_parent_span_id() {
        for traceparent in [
            "00-00000000000000000000000000000000-bbbbbbbbbbbbbbbb-01",
            "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-0000000000000000-01",
        ] {
            let payload = json!({
                "w3cTraceContext": {
                    "traceparent": traceparent
                }
            });
            assert_eq!(
                parse_w3c_trace_context(payload.as_object().expect("object")),
                W3cTraceContextParse::InvalidTraceparent
            );
        }
    }
}
