use super::{
    normalize_fast_model, normalize_provider_tool_messages, parse_safety_buffering_response_event,
    parse_safety_buffering_retry_model, parse_safety_buffering_runtime_event_payload,
    parse_safety_buffering_update, safety_buffering_enabled_header,
    safety_buffering_legacy_faster_model_header, should_disable_provider_default_fast_model,
    truncate_provider_text, ProviderSafetyBufferingRetryModelSource, ProviderToolContentProjection,
    ProviderToolMessageProjection, ProviderToolMessageRole, SAFETY_BUFFERING_ENABLED_HEADER,
    SAFETY_BUFFERING_FASTER_MODEL_HEADER, SAFETY_BUFFERING_RUNTIME_EVENT_KIND,
};
use crate::ModelProviderProtocol;
use serde_json::json;

fn assistant(contents: Vec<ProviderToolContentProjection>) -> ProviderToolMessageProjection {
    ProviderToolMessageProjection {
        role: ProviderToolMessageRole::Assistant,
        contents,
    }
}

fn user(contents: Vec<ProviderToolContentProjection>) -> ProviderToolMessageProjection {
    ProviderToolMessageProjection {
        role: ProviderToolMessageRole::User,
        contents,
    }
}

fn text() -> ProviderToolContentProjection {
    ProviderToolContentProjection::Other
}

#[test]
fn provider_default_fast_model_policy_should_keep_first_party_openai() {
    assert!(!should_disable_provider_default_fast_model(
        "openai",
        Some("openai"),
        Some("https://api.openai.com/v1"),
        None,
    ));
}

#[test]
fn provider_default_fast_model_policy_should_disable_openai_compatible_proxy() {
    assert!(should_disable_provider_default_fast_model(
        "openai",
        Some("ollama"),
        Some("http://localhost:11434/v1"),
        None,
    ));
}

#[test]
fn provider_default_fast_model_policy_should_keep_responses_route() {
    assert!(!should_disable_provider_default_fast_model(
        "openai",
        Some("ollama"),
        Some("http://localhost:11434/v1"),
        Some(&ModelProviderProtocol::Responses),
    ));
}

#[test]
fn provider_default_fast_model_policy_should_disable_anthropic_compatible_proxy() {
    assert!(should_disable_provider_default_fast_model(
        "anthropic",
        Some("anthropic-compatible"),
        Some("https://proxy.example.com"),
        None,
    ));
}

fn tool_request(id: &str) -> ProviderToolContentProjection {
    ProviderToolContentProjection::ToolRequest {
        id: id.to_string(),
        valid: true,
    }
}

fn invalid_tool_request(id: &str) -> ProviderToolContentProjection {
    ProviderToolContentProjection::ToolRequest {
        id: id.to_string(),
        valid: false,
    }
}

fn invalid_frontend_tool_request(id: &str) -> ProviderToolContentProjection {
    ProviderToolContentProjection::FrontendToolRequest {
        id: id.to_string(),
        valid: false,
    }
}

fn tool_response(id: &str) -> ProviderToolContentProjection {
    ProviderToolContentProjection::ToolResponse { id: id.to_string() }
}

#[test]
fn normalize_provider_tool_messages_should_preserve_valid_tool_chain() {
    let messages = vec![
        user(vec![text()]),
        assistant(vec![text(), tool_request("tool-1")]),
        user(vec![tool_response("tool-1")]),
        assistant(vec![text()]),
    ];

    let normalized = normalize_provider_tool_messages(&messages);

    assert_eq!(
        normalized
            .messages
            .iter()
            .map(|message| message.retained_content_indices.as_slice())
            .collect::<Vec<_>>(),
        vec![&[0][..], &[0, 1][..], &[0][..], &[0][..]]
    );
    assert_eq!(normalized.removed_invalid_requests, 0);
    assert_eq!(normalized.removed_invalid_responses, 0);
}

#[test]
fn normalize_provider_tool_messages_should_remove_orphan_response() {
    let messages = vec![
        user(vec![text()]),
        user(vec![tool_response("orphan-tool")]),
        assistant(vec![text()]),
    ];

    let normalized = normalize_provider_tool_messages(&messages);

    assert_eq!(
        normalized
            .messages
            .iter()
            .map(|message| message.retained_content_indices.as_slice())
            .collect::<Vec<_>>(),
        vec![&[0][..], &[][..], &[0][..]]
    );
    assert_eq!(normalized.removed_invalid_responses, 1);
}

#[test]
fn normalize_provider_tool_messages_should_drop_invalid_request_and_response() {
    let messages = vec![
        assistant(vec![text(), invalid_tool_request("broken-tool")]),
        user(vec![tool_response("broken-tool")]),
        assistant(vec![text()]),
    ];

    let normalized = normalize_provider_tool_messages(&messages);

    assert_eq!(
        normalized
            .messages
            .iter()
            .map(|message| message.retained_content_indices.as_slice())
            .collect::<Vec<_>>(),
        vec![&[0][..], &[][..], &[0][..]]
    );
    assert_eq!(normalized.removed_invalid_requests, 1);
    assert_eq!(normalized.removed_invalid_responses, 1);
}

#[test]
fn normalize_provider_tool_messages_should_drop_invalid_frontend_request_and_response() {
    let messages = vec![
        assistant(vec![text(), invalid_frontend_tool_request("frontend-tool")]),
        user(vec![tool_response("frontend-tool")]),
        assistant(vec![text()]),
    ];

    let normalized = normalize_provider_tool_messages(&messages);

    assert_eq!(
        normalized
            .messages
            .iter()
            .map(|message| message.retained_content_indices.as_slice())
            .collect::<Vec<_>>(),
        vec![&[0][..], &[][..], &[0][..]]
    );
    assert_eq!(normalized.removed_invalid_requests, 1);
    assert_eq!(normalized.removed_invalid_responses, 1);
}

#[test]
fn normalize_provider_tool_messages_should_drop_duplicate_response() {
    let messages = vec![
        assistant(vec![tool_request("tool-1")]),
        user(vec![tool_response("tool-1")]),
        user(vec![tool_response("tool-1")]),
    ];

    let normalized = normalize_provider_tool_messages(&messages);

    assert_eq!(
        normalized
            .messages
            .iter()
            .map(|message| message.retained_content_indices.as_slice())
            .collect::<Vec<_>>(),
        vec![&[0][..], &[0][..], &[][..]]
    );
    assert_eq!(normalized.removed_invalid_responses, 1);
}

#[test]
fn normalize_fast_model_should_strip_when_disabled() {
    let normalized = normalize_fast_model(Some("gpt-4o-mini".to_string()), true);

    assert_eq!(normalized, None);
}

#[test]
fn normalize_fast_model_should_preserve_when_allowed() {
    let normalized = normalize_fast_model(Some("gpt-4o-mini".to_string()), false);

    assert_eq!(normalized.as_deref(), Some("gpt-4o-mini"));
}

#[test]
fn parse_safety_buffering_retry_model_prefers_payload_retry_model() {
    let payload = json!({ "retry_model": "gpt-5-mini" });
    let parsed = parse_safety_buffering_retry_model(
        Some(&payload),
        [(SAFETY_BUFFERING_FASTER_MODEL_HEADER, "legacy-fast")],
    );

    assert_eq!(parsed.retry_model.as_deref(), Some("gpt-5-mini"));
    assert_eq!(parsed.fallback_header_model, None);
    assert_eq!(
        parsed.source,
        ProviderSafetyBufferingRetryModelSource::PayloadRetryModel
    );
}

#[test]
fn parse_safety_buffering_retry_model_explicit_null_does_not_fallback_to_header() {
    let payload = json!({ "retry_model": null });
    let parsed = parse_safety_buffering_retry_model(
        Some(&payload),
        [(SAFETY_BUFFERING_FASTER_MODEL_HEADER, "legacy-fast")],
    );

    assert_eq!(parsed.retry_model, None);
    assert_eq!(parsed.fallback_header_model, None);
    assert_eq!(
        parsed.source,
        ProviderSafetyBufferingRetryModelSource::ExplicitNull
    );
}

#[test]
fn parse_safety_buffering_retry_model_missing_payload_uses_legacy_header() {
    let payload = json!({ "use_cases": ["safety"] });
    let parsed = parse_safety_buffering_retry_model(
        Some(&payload),
        [("X-Codex-Safety-Buffering-Faster-Model", " legacy-fast ")],
    );

    assert_eq!(parsed.retry_model.as_deref(), Some("legacy-fast"));
    assert_eq!(parsed.fallback_header_model.as_deref(), Some("legacy-fast"));
    assert_eq!(
        parsed.source,
        ProviderSafetyBufferingRetryModelSource::LegacyHeader
    );
}

#[test]
fn parse_safety_buffering_retry_model_ignores_payload_faster_model() {
    let payload = json!({ "faster_model": "legacy-payload-name" });
    let parsed = parse_safety_buffering_retry_model(Some(&payload), []);

    assert_eq!(parsed.retry_model, None);
    assert_eq!(parsed.fallback_header_model, None);
    assert_eq!(
        parsed.source,
        ProviderSafetyBufferingRetryModelSource::Missing
    );
}

#[test]
fn parse_safety_buffering_update_builds_runtime_payload_from_retry_model() {
    let payload = json!({
        "use_cases": ["cyber", " "],
        "reasons": ["policy-check"],
        "retry_model": "gpt-5-mini",
    });
    let parsed = parse_safety_buffering_update(
        Some(&payload),
        [
            (SAFETY_BUFFERING_ENABLED_HEADER, "true"),
            (SAFETY_BUFFERING_FASTER_MODEL_HEADER, "legacy-fast"),
        ],
    )
    .expect("safety buffering update");

    assert_eq!(parsed.use_cases, ["cyber"]);
    assert_eq!(parsed.reasons, ["policy-check"]);
    assert!(parsed.show_buffering_ui);
    assert_eq!(
        parsed.retry_model.retry_model.as_deref(),
        Some("gpt-5-mini")
    );
    assert_eq!(parsed.retry_model.fallback_header_model, None);
    assert_eq!(
        parsed.retry_model.source,
        ProviderSafetyBufferingRetryModelSource::PayloadRetryModel
    );

    let typed_payload = parsed.runtime_event_payload(Some("openai"), Some("gpt-5-codex"));
    assert_eq!(typed_payload.kind, SAFETY_BUFFERING_RUNTIME_EVENT_KIND);
    assert_eq!(typed_payload.provider.as_deref(), Some("openai"));
    assert_eq!(typed_payload.model.as_deref(), Some("gpt-5-codex"));
    assert_eq!(typed_payload.retry_model.as_deref(), Some("gpt-5-mini"));
    assert_eq!(typed_payload.fallback_header_model, None);
    assert_eq!(
        typed_payload.source,
        ProviderSafetyBufferingRetryModelSource::PayloadRetryModel
    );

    let runtime_payload = parsed.to_runtime_event_payload(Some("openai"), Some("gpt-5-codex"));
    assert_eq!(runtime_payload["kind"], json!("provider_safety_buffering"));
    assert_eq!(runtime_payload["provider"], json!("openai"));
    assert_eq!(runtime_payload["model"], json!("gpt-5-codex"));
    assert_eq!(runtime_payload["retryModel"], json!("gpt-5-mini"));
    assert_eq!(
        runtime_payload["fallbackHeaderModel"],
        serde_json::Value::Null
    );
    assert_eq!(runtime_payload["source"], json!("payload_retry_model"));
    assert!(runtime_payload.get("retry_model").is_none());
    assert!(runtime_payload.get("faster_model").is_none());
    assert!(runtime_payload.get("fasterModel").is_none());
}

#[test]
fn safety_buffering_runtime_payload_keeps_explicit_null_as_typed_null() {
    let payload = json!({
        "use_cases": ["cyber"],
        "retry_model": null,
    });
    let parsed = parse_safety_buffering_update(
        Some(&payload),
        [
            (SAFETY_BUFFERING_ENABLED_HEADER, "true"),
            (SAFETY_BUFFERING_FASTER_MODEL_HEADER, "legacy-fast"),
        ],
    )
    .expect("safety buffering update");

    let typed_payload = parsed.runtime_event_payload(None, None);
    assert_eq!(typed_payload.kind, SAFETY_BUFFERING_RUNTIME_EVENT_KIND);
    assert_eq!(typed_payload.provider, None);
    assert_eq!(typed_payload.model, None);
    assert_eq!(typed_payload.retry_model, None);
    assert_eq!(typed_payload.fallback_header_model, None);
    assert_eq!(
        typed_payload.source,
        ProviderSafetyBufferingRetryModelSource::ExplicitNull
    );

    let runtime_payload = parsed.to_runtime_event_payload(None, None);
    assert_eq!(runtime_payload["provider"], serde_json::Value::Null);
    assert_eq!(runtime_payload["model"], serde_json::Value::Null);
    assert_eq!(runtime_payload["retryModel"], serde_json::Value::Null);
    assert_eq!(
        runtime_payload["fallbackHeaderModel"],
        serde_json::Value::Null
    );
    assert_eq!(runtime_payload["source"], json!("explicit_null"));
    assert!(runtime_payload.get("retry_model").is_none());
    assert!(runtime_payload.get("faster_model").is_none());
}

#[test]
fn parse_safety_buffering_update_uses_legacy_header_when_retry_model_missing() {
    let payload = json!({
        "use_cases": ["cyber"],
        "reasons": ["policy-check"],
    });
    let parsed = parse_safety_buffering_update(
        Some(&payload),
        [
            (SAFETY_BUFFERING_ENABLED_HEADER, "TRUE"),
            (SAFETY_BUFFERING_FASTER_MODEL_HEADER, " legacy-fast "),
        ],
    )
    .expect("safety buffering update");

    assert_eq!(
        parsed.retry_model.retry_model.as_deref(),
        Some("legacy-fast")
    );
    assert_eq!(
        parsed.retry_model.fallback_header_model.as_deref(),
        Some("legacy-fast")
    );
    assert_eq!(
        parsed.retry_model.source,
        ProviderSafetyBufferingRetryModelSource::LegacyHeader
    );
}

#[test]
fn parse_safety_buffering_update_ignores_non_object_payload() {
    assert!(parse_safety_buffering_update(Some(&json!(false)), []).is_none());
    assert!(parse_safety_buffering_update(None, []).is_none());
}

#[test]
fn parse_safety_buffering_response_event_extracts_safety_buffering_object() {
    let response_event = json!({
        "type": "response.created",
        "safety_buffering": {
            "use_cases": ["cyber"],
            "reasons": ["policy-check"],
            "retry_model": "gpt-5-mini",
        },
    });
    let parsed = parse_safety_buffering_response_event(
        &response_event,
        [(SAFETY_BUFFERING_ENABLED_HEADER, "true")],
    )
    .expect("safety buffering update");

    assert_eq!(parsed.use_cases, ["cyber"]);
    assert_eq!(parsed.reasons, ["policy-check"]);
    assert!(parsed.show_buffering_ui);
    assert_eq!(
        parsed.retry_model.retry_model.as_deref(),
        Some("gpt-5-mini")
    );
    assert_eq!(
        parsed.retry_model.source,
        ProviderSafetyBufferingRetryModelSource::PayloadRetryModel
    );
}

#[test]
fn parse_safety_buffering_runtime_event_payload_projects_stream_ready_payload() {
    let response_event = json!({
        "type": "response.output_text.delta",
        "safety_buffering": {
            "use_cases": ["cyber"],
            "reasons": ["user_risk"],
        },
    });
    let payload = parse_safety_buffering_runtime_event_payload(
        &response_event,
        [
            (SAFETY_BUFFERING_ENABLED_HEADER, "true"),
            (SAFETY_BUFFERING_FASTER_MODEL_HEADER, " retry-target "),
        ],
        Some("openai"),
        Some("gpt-5-codex"),
    )
    .expect("runtime event payload");

    assert_eq!(payload.kind, SAFETY_BUFFERING_RUNTIME_EVENT_KIND);
    assert_eq!(payload.provider.as_deref(), Some("openai"));
    assert_eq!(payload.model.as_deref(), Some("gpt-5-codex"));
    assert_eq!(payload.use_cases, ["cyber"]);
    assert_eq!(payload.reasons, ["user_risk"]);
    assert!(payload.show_buffering_ui);
    assert_eq!(payload.retry_model.as_deref(), Some("retry-target"));
    assert_eq!(
        payload.fallback_header_model.as_deref(),
        Some("retry-target")
    );
    assert_eq!(
        payload.source,
        ProviderSafetyBufferingRetryModelSource::LegacyHeader
    );
}

#[test]
fn parse_safety_buffering_runtime_event_payload_ignores_false_response_event_field() {
    let response_event = json!({
        "type": "response.created",
        "safety_buffering": false,
    });

    assert!(parse_safety_buffering_runtime_event_payload(
        &response_event,
        [(SAFETY_BUFFERING_ENABLED_HEADER, "true")],
        Some("openai"),
        Some("gpt-5-codex"),
    )
    .is_none());
}

#[test]
fn parse_safety_buffering_response_event_ignores_absent_or_non_object_updates() {
    assert!(parse_safety_buffering_response_event(&json!({}), []).is_none());
    assert!(
        parse_safety_buffering_response_event(&json!({ "safety_buffering": false }), [],).is_none()
    );
}

#[test]
fn safety_buffering_enabled_header_requires_true_value() {
    assert!(safety_buffering_enabled_header([(
        SAFETY_BUFFERING_ENABLED_HEADER,
        " true ",
    )]));
    assert!(!safety_buffering_enabled_header([(
        SAFETY_BUFFERING_ENABLED_HEADER,
        "false",
    )]));
    assert!(!safety_buffering_enabled_header([]));
}

#[test]
fn safety_buffering_legacy_faster_model_header_ignores_empty_values() {
    let parsed =
        safety_buffering_legacy_faster_model_header([(SAFETY_BUFFERING_FASTER_MODEL_HEADER, " ")]);

    assert_eq!(parsed, None);
}

#[test]
fn truncate_provider_text_should_preserve_utf8_boundary_and_ellipsis() {
    assert_eq!(truncate_provider_text("hello world", 8), "hello...");
    assert_eq!(truncate_provider_text("こんにちは世界", 5), "こん...");
    assert_eq!(truncate_provider_text("hello", 5), "hello");
}
