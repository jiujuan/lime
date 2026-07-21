use agent_runtime::session_loop::RuntimeSessionTraceContext;
use serde_json::Value;

const TRACE_METADATA_KEYS: &[&str] = &["agentUiPerformanceTrace", "agent_ui_performance_trace"];

pub(super) fn metadata(
    runtime_metadata: Option<&Value>,
) -> (Option<String>, Option<RuntimeSessionTraceContext>) {
    let Some(metadata) = runtime_metadata else {
        return (None, None);
    };
    let client_user_message_id =
        string_field(metadata, &["clientUserMessageId", "client_user_message_id"]);
    let trace = metadata
        .as_object()
        .and_then(|metadata| {
            TRACE_METADATA_KEYS
                .iter()
                .filter_map(|key| metadata.get(*key))
                .find_map(Value::as_object)
        })
        .and_then(crate::trace_context::w3c_trace_context)
        .map(|trace| RuntimeSessionTraceContext {
            traceparent: Some(trace.traceparent),
            tracestate: trace.tracestate,
        });
    (client_user_message_id, trace)
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_client_identity_and_normalized_trace() {
        let payload = json!({
            "clientUserMessageId": " client-1 ",
            "agentUiPerformanceTrace": {
                "w3cTraceContext": {
                    "traceparent": "00-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-BBBBBBBBBBBBBBBB-01",
                    "tracestate": " vendor=value "
                }
            }
        });

        let (client_id, trace) = metadata(Some(&payload));
        assert_eq!(client_id.as_deref(), Some("client-1"));
        assert_eq!(
            trace,
            Some(RuntimeSessionTraceContext {
                traceparent: Some(
                    "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01".to_string()
                ),
                tracestate: Some("vendor=value".to_string()),
            })
        );
    }

    #[test]
    fn invalid_trace_is_dropped_without_losing_client_identity() {
        let payload = json!({
            "client_user_message_id": "client-2",
            "agent_ui_performance_trace": {
                "w3c_trace_context": {
                    "traceparent": "invalid"
                }
            }
        });

        let (client_id, trace) = metadata(Some(&payload));
        assert_eq!(client_id.as_deref(), Some("client-2"));
        assert_eq!(trace, None);
    }
}
