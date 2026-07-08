use crate::otel_trace::set_parent_from_w3c_trace_context;
use crate::trace_context::W3cTraceContext;
use crate::trace_context::W3cTraceContextParse;
use crate::trace_context::parse_w3c_trace_context;
use app_server_protocol::ClientInfo;
use app_server_protocol::JsonRpcRequest;
use app_server_protocol::METHOD_AGENT_SESSION_TURN_START;
use serde_json::Map;
use serde_json::Value;
use tracing::Span;
use tracing::field;
use tracing::info_span;

const TRACE_METADATA_KEYS: &[&str] = &["agentUiPerformanceTrace", "agent_ui_performance_trace"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RequestTraceContext {
    pub(super) request_id: Option<String>,
    pub(super) run_id: Option<String>,
    pub(super) session_id: Option<String>,
    pub(super) trace_id: Option<String>,
    pub(super) turn_id: Option<String>,
    pub(super) w3c_trace_context: Option<W3cTraceContext>,
    pub(super) w3c_traceparent_valid: Option<bool>,
}

pub(super) fn request_span(request: &JsonRpcRequest, client_info: Option<&ClientInfo>) -> Span {
    let trace_context = request_trace_context(request);
    let span = info_span!(
        "app_server.request",
        otel.kind = "server",
        otel.name = request.method.as_str(),
        rpc.system = "jsonrpc",
        rpc.method = request.method.as_str(),
        rpc.transport = "json-lines",
        rpc.request_id = %request.id,
        app_server.client_name = field::Empty,
        app_server.client_version = field::Empty,
        agent.session_id = field::Empty,
        agent.turn_id = field::Empty,
        claw.trace_id = field::Empty,
        claw.run_id = field::Empty,
        claw.request_id = field::Empty,
        w3c.trace_id = field::Empty,
        w3c.parent_span_id = field::Empty,
        w3c.trace_flags = field::Empty,
        w3c.traceparent.valid = field::Empty,
    );

    if let Some(client_info) = client_info {
        span.record("app_server.client_name", client_info.name.as_str());
        if let Some(version) = client_info.version.as_deref() {
            span.record("app_server.client_version", version);
        }
    }

    if let Some(context) = trace_context.as_ref() {
        context.record_on_span(&span);
        if let Some(w3c) = context.w3c_trace_context.as_ref() {
            if !set_parent_from_w3c_trace_context(&span, w3c) {
                span.in_scope(|| {
                    tracing::warn!(
                        rpc.method = request.method.as_str(),
                        rpc.request_id = %request.id,
                        "ignoring invalid inbound request trace carrier"
                    );
                });
            }
        }
        if context.w3c_traceparent_valid == Some(false) {
            span.in_scope(|| {
                tracing::warn!(
                    rpc.method = request.method.as_str(),
                    rpc.request_id = %request.id,
                    "ignoring invalid inbound request trace carrier"
                );
            });
        }
    }

    span
}

pub(super) fn request_trace_context(request: &JsonRpcRequest) -> Option<RequestTraceContext> {
    if request.method != METHOD_AGENT_SESSION_TURN_START {
        return None;
    }
    let params = request.params.as_ref()?.as_object()?;
    let trace = trace_metadata(params);
    let w3c = trace.map(parse_w3c_trace_context);
    let w3c_trace_context = match w3c.as_ref() {
        Some(W3cTraceContextParse::Valid(context)) => Some(context.clone()),
        Some(W3cTraceContextParse::Missing | W3cTraceContextParse::InvalidTraceparent) | None => {
            None
        }
    };
    let w3c_traceparent_valid = match w3c {
        Some(W3cTraceContextParse::Valid(_)) => Some(true),
        Some(W3cTraceContextParse::InvalidTraceparent) => Some(false),
        Some(W3cTraceContextParse::Missing) | None => None,
    };

    let context = RequestTraceContext {
        request_id: trace.and_then(|trace| string_field(trace, &["requestId", "request_id"])),
        run_id: trace.and_then(|trace| string_field(trace, &["runId", "run_id"])),
        session_id: string_field(params, &["sessionId", "session_id"])
            .or_else(|| trace.and_then(|trace| string_field(trace, &["sessionId", "session_id"]))),
        trace_id: trace.and_then(|trace| string_field(trace, &["traceId", "trace_id"])),
        turn_id: string_field(params, &["turnId", "turn_id"])
            .or_else(|| trace.and_then(|trace| string_field(trace, &["turnId", "turn_id"]))),
        w3c_trace_context,
        w3c_traceparent_valid,
    };

    context.has_identity().then_some(context)
}

impl RequestTraceContext {
    fn has_identity(&self) -> bool {
        self.request_id.is_some()
            || self.run_id.is_some()
            || self.session_id.is_some()
            || self.trace_id.is_some()
            || self.turn_id.is_some()
            || self.w3c_trace_context.is_some()
            || self.w3c_traceparent_valid.is_some()
    }

    fn record_on_span(&self, span: &Span) {
        record_string(span, "agent.session_id", self.session_id.as_deref());
        record_string(span, "agent.turn_id", self.turn_id.as_deref());
        record_string(span, "claw.trace_id", self.trace_id.as_deref());
        record_string(span, "claw.run_id", self.run_id.as_deref());
        record_string(span, "claw.request_id", self.request_id.as_deref());
        if let Some(w3c) = self.w3c_trace_context.as_ref() {
            span.record("w3c.trace_id", w3c.trace_id.as_str());
            span.record("w3c.parent_span_id", w3c.parent_span_id.as_str());
            span.record("w3c.trace_flags", w3c.trace_flags.as_str());
        }
        if let Some(valid) = self.w3c_traceparent_valid {
            span.record("w3c.traceparent.valid", valid);
        }
    }
}

fn trace_metadata(params: &Map<String, Value>) -> Option<&Map<String, Value>> {
    let runtime_options = object_field(params, &["runtimeOptions", "runtime_options"])?;
    let metadata = object_field(runtime_options, &["metadata"])?;
    TRACE_METADATA_KEYS
        .iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(Value::as_object)
}

fn object_field<'a>(
    payload: &'a Map<String, Value>,
    keys: &[&str],
) -> Option<&'a Map<String, Value>> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_object)
}

fn string_field(payload: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn record_string(span: &Span, key: &'static str, value: Option<&str>) {
    let Some(value) = value else {
        return;
    };
    span.record(key, value);
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::RequestId;
    use opentelemetry::Value as OtelValue;
    use opentelemetry::trace::SpanId;
    use opentelemetry::trace::SpanKind;
    use opentelemetry::trace::TraceId;
    use opentelemetry::trace::TracerProvider as _;
    use opentelemetry_sdk::export::trace::ExportResult;
    use opentelemetry_sdk::export::trace::SpanData;
    use opentelemetry_sdk::export::trace::SpanExporter;
    use opentelemetry_sdk::trace::TracerProvider;
    use serde_json::json;
    use std::future::Future;
    use std::pin::Pin;
    use std::sync::Arc;
    use std::sync::Mutex;
    use tracing::Dispatch;
    use tracing_subscriber::layer::SubscriberExt;

    #[test]
    fn extracts_turn_start_trace_context_from_runtime_metadata() {
        let request = JsonRpcRequest::new(
            RequestId::String("rpc-1".to_string()),
            METHOD_AGENT_SESSION_TURN_START,
            Some(json!({
                "sessionId": "sess-a",
                "turnId": "turn-a",
                "input": { "text": "hello", "attachments": [] },
                "runtimeOptions": {
                    "metadata": {
                        "agentUiPerformanceTrace": {
                            "requestId": "request-a",
                            "runId": "run-a",
                            "traceId": "trace-a",
                            "w3cTraceContext": {
                                "traceparent": "00-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-BBBBBBBBBBBBBBBB-01"
                            }
                        }
                    }
                }
            })),
        );

        let context = request_trace_context(&request).expect("trace context");

        assert_eq!(context.session_id.as_deref(), Some("sess-a"));
        assert_eq!(context.turn_id.as_deref(), Some("turn-a"));
        assert_eq!(context.trace_id.as_deref(), Some("trace-a"));
        assert_eq!(context.run_id.as_deref(), Some("run-a"));
        assert_eq!(context.request_id.as_deref(), Some("request-a"));
        assert_eq!(context.w3c_traceparent_valid, Some(true));
        let w3c = context.w3c_trace_context.expect("w3c");
        assert_eq!(w3c.trace_id, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        assert_eq!(w3c.parent_span_id, "bbbbbbbbbbbbbbbb");
    }

    #[test]
    fn flags_invalid_w3c_traceparent_without_dropping_lime_trace_identity() {
        let request = JsonRpcRequest::new(
            RequestId::String("rpc-2".to_string()),
            METHOD_AGENT_SESSION_TURN_START,
            Some(json!({
                "sessionId": "sess-invalid",
                "input": { "text": "hello", "attachments": [] },
                "runtimeOptions": {
                    "metadata": {
                        "agentUiPerformanceTrace": {
                            "traceId": "trace-invalid",
                            "w3cTraceContext": {
                                "traceparent": "00-00000000000000000000000000000000-bbbbbbbbbbbbbbbb-01"
                            }
                        }
                    }
                }
            })),
        );

        let context = request_trace_context(&request).expect("trace context");

        assert_eq!(context.trace_id.as_deref(), Some("trace-invalid"));
        assert_eq!(context.w3c_traceparent_valid, Some(false));
        assert!(context.w3c_trace_context.is_none());
    }

    #[test]
    fn ignores_non_turn_start_methods() {
        let request = JsonRpcRequest::new(
            RequestId::String("rpc-3".to_string()),
            "agentSession/read",
            Some(json!({ "sessionId": "sess-a" })),
        );

        assert!(request_trace_context(&request).is_none());
    }

    #[test]
    fn request_span_exports_with_w3c_remote_parent() {
        let remote_trace_id =
            TraceId::from_hex("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").expect("trace id");
        let remote_parent_span_id = SpanId::from_hex("bbbbbbbbbbbbbbbb").expect("parent span id");
        let request = JsonRpcRequest::new(
            RequestId::String("rpc-otel".to_string()),
            METHOD_AGENT_SESSION_TURN_START,
            Some(json!({
                "sessionId": "sess-otel",
                "turnId": "turn-otel",
                "input": { "text": "hello", "attachments": [] },
                "runtimeOptions": {
                    "metadata": {
                        "agentUiPerformanceTrace": {
                            "requestId": "request-otel",
                            "runId": "run-otel",
                            "traceId": "trace-otel",
                            "w3cTraceContext": {
                                "traceparent": "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
                                "tracestate": "vendor=value"
                            }
                        }
                    }
                }
            })),
        );

        let spans = export_request_span(&request);
        let span = find_request_span(&spans, METHOD_AGENT_SESSION_TURN_START);

        assert_eq!(span.span_kind, SpanKind::Server);
        assert_eq!(span.span_context.trace_id(), remote_trace_id);
        assert_eq!(span.parent_span_id, remote_parent_span_id);
        assert_eq!(string_attr(span, "claw.trace_id"), Some("trace-otel"));
        assert_eq!(string_attr(span, "claw.run_id"), Some("run-otel"));
        assert_eq!(string_attr(span, "claw.request_id"), Some("request-otel"));
        assert_eq!(string_attr(span, "agent.session_id"), Some("sess-otel"));
        assert_eq!(string_attr(span, "agent.turn_id"), Some("turn-otel"));
        assert_eq!(
            string_attr(span, "w3c.trace_id"),
            Some("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        );
        assert_eq!(
            string_attr(span, "w3c.parent_span_id"),
            Some("bbbbbbbbbbbbbbbb")
        );
        assert_eq!(bool_attr(span, "w3c.traceparent.valid"), Some(true));
        assert!(
            span.attributes
                .iter()
                .all(|kv| kv.key.as_str() != "tracestate")
        );
    }

    #[test]
    fn invalid_w3c_traceparent_is_not_exported_as_remote_parent() {
        let request = JsonRpcRequest::new(
            RequestId::String("rpc-invalid-otel".to_string()),
            METHOD_AGENT_SESSION_TURN_START,
            Some(json!({
                "sessionId": "sess-invalid-otel",
                "runtimeOptions": {
                    "metadata": {
                        "agentUiPerformanceTrace": {
                            "traceId": "trace-invalid-otel",
                            "w3cTraceContext": {
                                "traceparent": "00-00000000000000000000000000000000-bbbbbbbbbbbbbbbb-01"
                            }
                        }
                    }
                }
            })),
        );

        let spans = export_request_span(&request);
        let span = find_request_span(&spans, METHOD_AGENT_SESSION_TURN_START);

        assert_ne!(
            span.span_context.trace_id(),
            TraceId::from_hex("00000000000000000000000000000000").expect("trace id")
        );
        assert_eq!(span.parent_span_id, SpanId::INVALID);
        assert_eq!(
            string_attr(span, "claw.trace_id"),
            Some("trace-invalid-otel")
        );
        assert_eq!(bool_attr(span, "w3c.traceparent.valid"), Some(false));
    }

    fn export_request_span(request: &JsonRpcRequest) -> Vec<SpanData> {
        let exporter = TestSpanExporter::default();
        let provider = TracerProvider::builder()
            .with_simple_exporter(exporter.clone())
            .build();
        let tracer = provider.tracer("app-server-request-trace-tests");
        let subscriber =
            tracing_subscriber::registry().with(tracing_opentelemetry::layer().with_tracer(tracer));
        let dispatch = Dispatch::new(subscriber);

        tracing::dispatcher::with_default(&dispatch, || {
            let span = request_span(request, None);
            let _entered = span.enter();
            tracing::info!("request span test body");
        });
        provider
            .force_flush()
            .into_iter()
            .for_each(|result| result.expect("force flush"));

        exporter.spans()
    }

    fn find_request_span<'a>(spans: &'a [SpanData], method: &str) -> &'a SpanData {
        spans
            .iter()
            .find(|span| {
                span.span_kind == SpanKind::Server
                    && string_attr(span, "rpc.system") == Some("jsonrpc")
                    && string_attr(span, "rpc.method") == Some(method)
            })
            .unwrap_or_else(|| panic!("missing app_server.request span: {spans:#?}"))
    }

    fn string_attr<'a>(span: &'a SpanData, key: &str) -> Option<&'a str> {
        span.attributes
            .iter()
            .find(|kv| kv.key.as_str() == key)
            .and_then(|kv| match &kv.value {
                OtelValue::String(value) => Some(value.as_str()),
                _ => None,
            })
    }

    fn bool_attr(span: &SpanData, key: &str) -> Option<bool> {
        span.attributes
            .iter()
            .find(|kv| kv.key.as_str() == key)
            .and_then(|kv| match &kv.value {
                OtelValue::Bool(value) => Some(*value),
                _ => None,
            })
    }

    #[derive(Clone, Default, Debug)]
    struct TestSpanExporter {
        spans: Arc<Mutex<Vec<SpanData>>>,
    }

    impl TestSpanExporter {
        fn spans(&self) -> Vec<SpanData> {
            self.spans.lock().expect("spans lock").clone()
        }
    }

    impl SpanExporter for TestSpanExporter {
        fn export(
            &mut self,
            mut batch: Vec<SpanData>,
        ) -> Pin<Box<dyn Future<Output = ExportResult> + Send + 'static>> {
            let spans = Arc::clone(&self.spans);
            Box::pin(async move {
                spans.lock().expect("spans lock").append(&mut batch);
                Ok(())
            })
        }
    }
}
