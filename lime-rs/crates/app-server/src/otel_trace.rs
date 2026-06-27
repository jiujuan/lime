use crate::trace_context::W3cTraceContext;
use opentelemetry::global;
use opentelemetry::propagation::TextMapPropagator;
use opentelemetry::trace::TraceContextExt;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry::Context;
use opentelemetry::KeyValue;
use opentelemetry_otlp::OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::runtime;
use opentelemetry_sdk::trace::RandomIdGenerator;
use opentelemetry_sdk::trace::Sampler;
use opentelemetry_sdk::trace::TracerProvider;
use opentelemetry_sdk::Resource;
use std::collections::HashMap;
use std::env;
use tracing::Span;
use tracing_opentelemetry::OpenTelemetrySpanExt;
use tracing_subscriber::layer::SubscriberExt;

const APP_SERVER_OTEL_EXPORTER_ENV: &str = "APP_SERVER_OTEL_EXPORTER";
const OTEL_TRACES_EXPORTER_ENV: &str = "OTEL_TRACES_EXPORTER";
const OTEL_EXPORTER_OTLP_ENDPOINT_ENV: &str = "OTEL_EXPORTER_OTLP_ENDPOINT";

pub struct AppServerOtelGuard {
    provider: TracerProvider,
}

impl Drop for AppServerOtelGuard {
    fn drop(&mut self) {
        let _ = self.provider.shutdown();
    }
}

pub fn init_app_server_otel_from_env() -> anyhow::Result<Option<AppServerOtelGuard>> {
    if !otel_export_requested_from_env() {
        return Ok(None);
    }

    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .build()?;
    let provider = TracerProvider::builder()
        .with_batch_exporter(exporter, runtime::Tokio)
        .with_id_generator(RandomIdGenerator::default())
        .with_sampler(Sampler::ParentBased(Box::new(Sampler::AlwaysOn)))
        .with_resource(Resource::new(vec![
            KeyValue::new("service.name", "app-server"),
            KeyValue::new("service.version", env!("CARGO_PKG_VERSION")),
        ]))
        .build();
    let tracer = provider.tracer("app-server");
    let subscriber =
        tracing_subscriber::registry().with(tracing_opentelemetry::layer().with_tracer(tracer));

    tracing::subscriber::set_global_default(subscriber)
        .map_err(|_| anyhow::anyhow!("global tracing subscriber is already installed"))?;
    global::set_text_map_propagator(TraceContextPropagator::new());
    let _ = global::set_tracer_provider(provider.clone());

    Ok(Some(AppServerOtelGuard { provider }))
}

pub(crate) fn context_from_w3c_trace_context(trace: &W3cTraceContext) -> Option<Context> {
    context_from_trace_headers(
        Some(trace.traceparent.as_str()),
        trace.tracestate.as_deref(),
    )
}

pub(crate) fn set_parent_from_w3c_trace_context(span: &Span, trace: &W3cTraceContext) -> bool {
    let Some(context) = context_from_w3c_trace_context(trace) else {
        return false;
    };
    set_parent_from_context(span, context);
    true
}

fn set_parent_from_context(span: &Span, context: Context) {
    let _ = span.set_parent(context);
}

fn context_from_trace_headers(
    traceparent: Option<&str>,
    tracestate: Option<&str>,
) -> Option<Context> {
    let traceparent = traceparent?;
    let mut headers = HashMap::new();
    headers.insert("traceparent".to_string(), traceparent.to_string());
    if let Some(tracestate) = tracestate {
        headers.insert("tracestate".to_string(), tracestate.to_string());
    }

    let context = TraceContextPropagator::new().extract(&headers);
    context.span().span_context().is_valid().then_some(context)
}

fn otel_export_requested_from_env() -> bool {
    env_value(APP_SERVER_OTEL_EXPORTER_ENV)
        .as_deref()
        .is_some_and(is_otlp_exporter)
        || env_value(OTEL_TRACES_EXPORTER_ENV)
            .as_deref()
            .is_some_and(is_otlp_exporter)
        || env_value(OTEL_EXPORTER_OTLP_ENDPOINT_ENV).is_some()
        || env_value(OTEL_EXPORTER_OTLP_TRACES_ENDPOINT).is_some()
}

fn is_otlp_exporter(value: &str) -> bool {
    value
        .split(',')
        .map(str::trim)
        .any(|part| part.eq_ignore_ascii_case("otlp"))
}

fn env_value(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn converts_valid_w3c_trace_context_to_remote_parent_context() {
        let payload = json!({
            "w3cTraceContext": {
                "traceparent": "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
                "tracestate": "vendor=value"
            }
        });
        let trace = crate::trace_context::w3c_trace_context(payload.as_object().expect("object"))
            .expect("trace context");

        let context = context_from_w3c_trace_context(&trace).expect("otel context");
        let span = context.span();
        let span_context = span.span_context();

        assert!(span_context.is_valid());
        assert!(span_context.is_remote());
        assert_eq!(
            span_context.trace_id().to_string(),
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );
        assert_eq!(span_context.span_id().to_string(), "bbbbbbbbbbbbbbbb");
    }
}
