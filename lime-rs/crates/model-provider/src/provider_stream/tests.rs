use super::*;
use crate::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol};
use crate::safety::{
    ProviderSafetyBufferingRetryModelSource, SAFETY_BUFFERING_ENABLED_HEADER,
    SAFETY_BUFFERING_FASTER_MODEL_HEADER,
};
use serde_json::json;

fn runtime_config() -> RuntimeProviderConfig {
    RuntimeProviderConfig {
        provider_name: "openai".to_string(),
        provider_selector: Some("codex".to_string()),
        model_name: "gpt-5.3-codex".to_string(),
        api_key: None,
        base_url: Some("https://example.com/openai".to_string()),
        credential_uuid: "credential-1".to_string(),
        reasoning_effort: Some("medium".to_string()),
        protocol: Some(RuntimeProviderProtocol::Responses),
        toolshim: true,
        toolshim_model: Some("gpt-4o-mini".to_string()),
    }
}

#[test]
fn provider_handle_projects_runtime_config_without_provider_trait() {
    let handle = RuntimeReplyProviderHandle::from_config(
        &runtime_config(),
        RuntimeProviderBackend::AsterCompat,
    )
    .with_capabilities(RuntimeReplyProviderCapabilities {
        supports_streaming: true,
        supports_embeddings: false,
        active_model_name: Some("gpt-5.3-codex".to_string()),
    });

    assert_eq!(handle.provider_name(), "openai");
    assert_eq!(handle.model_name(), "gpt-5.3-codex");
    assert_eq!(handle.backend, RuntimeProviderBackend::AsterCompat);
    assert_eq!(
        handle.identity.protocol,
        Some(ModelProviderProtocol::Responses)
    );
    assert!(handle.capabilities.supports_streaming);
}

#[test]
fn stream_request_carries_current_provider_handle() {
    let handle = RuntimeReplyProviderHandle::from_config(
        &runtime_config(),
        RuntimeProviderBackend::AsterCompat,
    );
    let request = RuntimeReplyStreamRequest::new(
        "session-1",
        RuntimeReplyInputKind::UserMessage,
        42,
        Some(handle),
    );

    assert_eq!(request.session_id, "session-1");
    assert_eq!(
        request.provider_backend(),
        Some(RuntimeProviderBackend::AsterCompat)
    );
    assert_eq!(request.provider_name(), Some("openai"));
    assert_eq!(request.model_name(), Some("gpt-5.3-codex"));
}

#[test]
fn provider_stream_start_accepts_matching_handle() {
    let handle = RuntimeReplyProviderHandle::from_config(
        &runtime_config(),
        RuntimeProviderBackend::AsterCompat,
    );
    let request = RuntimeReplyStreamRequest::new(
        "session-1",
        RuntimeReplyInputKind::UserMessage,
        42,
        Some(handle.clone()),
    );

    let start =
        RuntimeReplyProviderStreamStart::new(request, &handle).expect("provider stream start");

    assert_eq!(start.stream_request().provider_name(), Some("openai"));
    assert_eq!(start.stream_request().model_name(), Some("gpt-5.3-codex"));
    let trace = start.trace();
    assert_eq!(trace.session_id, "session-1");
    assert_eq!(trace.input_kind, RuntimeReplyInputKind::UserMessage);
    assert_eq!(trace.message_chars, 42);
    assert_eq!(
        trace.provider_backend,
        Some(RuntimeProviderBackend::AsterCompat)
    );
    assert_eq!(trace.provider_name, Some("openai"));
    assert_eq!(trace.model_name, Some("gpt-5.3-codex"));
}

#[test]
fn provider_stream_start_rejects_missing_handle() {
    let expected = RuntimeReplyProviderHandle::from_config(
        &runtime_config(),
        RuntimeProviderBackend::AsterCompat,
    );
    let request =
        RuntimeReplyStreamRequest::new("session-1", RuntimeReplyInputKind::UserMessage, 42, None);

    let error = RuntimeReplyProviderStreamStart::new(request, &expected)
        .expect_err("missing provider handle");

    assert!(error
        .message
        .contains("requires a configured provider handle"));
}

#[test]
fn provider_stream_start_rejects_mismatched_handle() {
    let expected = RuntimeReplyProviderHandle::from_config(
        &runtime_config(),
        RuntimeProviderBackend::AsterCompat,
    );
    let mut other_config = runtime_config();
    other_config.provider_name = "anthropic".to_string();
    other_config.model_name = "claude-sonnet-4.5".to_string();
    let actual =
        RuntimeReplyProviderHandle::from_config(&other_config, RuntimeProviderBackend::AsterCompat);
    let request = RuntimeReplyStreamRequest::new(
        "session-1",
        RuntimeReplyInputKind::UserMessage,
        42,
        Some(actual),
    );

    let error = RuntimeReplyProviderStreamStart::new(request, &expected)
        .expect_err("mismatched provider handle");

    assert!(error.message.contains("Provider stream handle mismatch"));
    assert!(error.message.contains("openai/gpt-5.3-codex"));
    assert!(error.message.contains("anthropic/claude-sonnet-4.5"));
}

#[test]
fn stream_event_projects_safety_buffering_payload_from_response_event() {
    let request = RuntimeReplyStreamRequest::new(
        "session-1",
        RuntimeReplyInputKind::UserMessage,
        42,
        Some(RuntimeReplyProviderHandle::from_config(
            &runtime_config(),
            RuntimeProviderBackend::AsterCompat,
        )),
    );
    let response_event = json!({
        "type": "response.output_text.delta",
        "safety_buffering": {
            "use_cases": ["cyber"],
            "reasons": ["user_risk"],
        },
    });

    let event = RuntimeReplyProviderStreamEvent::safety_buffering_from_response_event(
        &request,
        &response_event,
        [
            (SAFETY_BUFFERING_ENABLED_HEADER, "true"),
            (SAFETY_BUFFERING_FASTER_MODEL_HEADER, " retry-target "),
        ],
    )
    .expect("safety buffering event");

    assert_eq!(
        event.runtime_event_kind(),
        SAFETY_BUFFERING_RUNTIME_EVENT_KIND
    );
    let RuntimeReplyProviderStreamEvent::SafetyBuffering(payload) = &event;
    assert_eq!(payload.provider.as_deref(), Some("openai"));
    assert_eq!(payload.model.as_deref(), Some("gpt-5.3-codex"));
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

    let payload_json = event.payload_json_value();
    assert_eq!(payload_json["source"], json!("legacy_header"));
    assert!(payload_json.get("retry_model").is_none());
    assert!(payload_json.get("faster_model").is_none());
}

#[test]
fn stream_event_projects_safety_buffering_payload_from_notification_payload() {
    let request = RuntimeReplyStreamRequest::new(
        "session-1",
        RuntimeReplyInputKind::UserMessage,
        42,
        Some(RuntimeReplyProviderHandle::from_config(
            &runtime_config(),
            RuntimeProviderBackend::AsterCompat,
        )),
    );
    let payload = json!({
        "eventKind": RuntimeReplyProviderStreamEvent::NOTIFICATION_KIND_SAFETY_BUFFERING,
        "responseEvent": {
            "type": "response.output_text.delta",
            "safety_buffering": {
                "use_cases": ["cyber"],
                "reasons": ["policy"],
                "retry_model": "gpt-5-mini"
            }
        },
        "headers": [
            {
                "name": SAFETY_BUFFERING_ENABLED_HEADER,
                "value": "true"
            },
            {
                "name": SAFETY_BUFFERING_FASTER_MODEL_HEADER,
                "value": "legacy-fast"
            }
        ]
    });

    let event = RuntimeReplyProviderStreamEvent::from_notification_payload(&request, &payload)
        .expect("safety buffering event");

    let RuntimeReplyProviderStreamEvent::SafetyBuffering(payload) = &event;
    assert_eq!(payload.provider.as_deref(), Some("openai"));
    assert_eq!(payload.model.as_deref(), Some("gpt-5.3-codex"));
    assert_eq!(payload.use_cases, ["cyber"]);
    assert_eq!(payload.reasons, ["policy"]);
    assert_eq!(payload.retry_model.as_deref(), Some("gpt-5-mini"));
    assert_eq!(payload.fallback_header_model, None);
    assert_eq!(
        payload.source,
        ProviderSafetyBufferingRetryModelSource::PayloadRetryModel
    );
}

#[test]
fn stream_event_ignores_unknown_notification_payload_kind() {
    let request =
        RuntimeReplyStreamRequest::new("session-1", RuntimeReplyInputKind::UserMessage, 42, None);
    let payload = json!({
        "eventKind": "vendor.unknown",
        "responseEvent": {
            "type": "response.output_text.delta",
            "safety_buffering": {
                "use_cases": ["cyber"],
                "reasons": ["policy"]
            }
        }
    });

    assert!(
        RuntimeReplyProviderStreamEvent::from_notification_payload(&request, &payload).is_none()
    );
}

#[test]
fn stream_event_ignores_false_safety_buffering_response_field() {
    let request = RuntimeReplyStreamRequest::new(
        "session-1",
        RuntimeReplyInputKind::UserMessage,
        42,
        Some(RuntimeReplyProviderHandle::from_config(
            &runtime_config(),
            RuntimeProviderBackend::AsterCompat,
        )),
    );
    let response_event = json!({
        "type": "response.created",
        "safety_buffering": false,
    });

    assert!(
        RuntimeReplyProviderStreamEvent::safety_buffering_from_response_event(
            &request,
            &response_event,
            [(SAFETY_BUFFERING_ENABLED_HEADER, "true")],
        )
        .is_none()
    );
}

#[test]
fn stream_request_carries_model_request_policy() {
    let request =
        RuntimeReplyStreamRequest::new("session-1", RuntimeReplyInputKind::UserMessage, 42, None)
            .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
                Some(RuntimeReplyResponsesPolicy {
                    use_responses_lite: true,
                    request_mode: "responses_lite".to_string(),
                    instructions_location: "input_prefix".to_string(),
                    tools_location: "input_prefix".to_string(),
                    reasoning_context: "all_turns".to_string(),
                    parallel_tool_calls_allowed: false,
                    requires_responses_lite_header: true,
                }),
                Some(RuntimeReplyToolCallPolicy {
                    supports_parallel_tool_calls: true,
                    parallel_tool_calls: false,
                }),
                None,
            ));

    let policy = request.model_request_policy.as_ref().expect("policy");
    assert!(policy.use_responses_lite());
    assert_eq!(policy.reasoning_context(), Some("all_turns"));
    assert!(policy.requires_responses_lite_header());
    assert_eq!(policy.parallel_tool_calls(), Some(false));
}

#[test]
fn stream_request_projects_responses_lite_wire_shape() {
    let request =
        RuntimeReplyStreamRequest::new("session-1", RuntimeReplyInputKind::UserMessage, 42, None)
            .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
                Some(RuntimeReplyResponsesPolicy {
                    use_responses_lite: true,
                    request_mode: "responses_lite".to_string(),
                    instructions_location: "input_prefix".to_string(),
                    tools_location: "input_prefix".to_string(),
                    reasoning_context: "all_turns".to_string(),
                    parallel_tool_calls_allowed: false,
                    requires_responses_lite_header: true,
                }),
                Some(RuntimeReplyToolCallPolicy {
                    supports_parallel_tool_calls: true,
                    parallel_tool_calls: false,
                }),
                None,
            ));

    let wire_shape = request.provider_request_wire_shape();

    assert!(wire_shape.use_responses_lite);
    assert_eq!(wire_shape.reasoning_context.as_deref(), Some("all_turns"));
    assert_eq!(wire_shape.parallel_tool_calls, Some(false));
    assert_eq!(
        wire_shape.headers,
        vec![RuntimeReplyProviderRequestHeader {
            name: RuntimeReplyProviderRequestWireShape::RESPONSES_LITE_HEADER_NAME.to_string(),
            value: RuntimeReplyProviderRequestWireShape::RESPONSES_LITE_HEADER_VALUE.to_string(),
        }]
    );
    assert!(wire_shape.requires_responses_lite_wire_support());
}

#[test]
fn stream_request_accepts_responses_lite_wire_for_current_backend() {
    let handle =
        RuntimeReplyProviderHandle::from_config(&runtime_config(), RuntimeProviderBackend::Current);
    let request = RuntimeReplyStreamRequest::new(
        "session-1",
        RuntimeReplyInputKind::UserMessage,
        42,
        Some(handle),
    )
    .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
        Some(RuntimeReplyResponsesPolicy {
            use_responses_lite: true,
            request_mode: "responses_lite".to_string(),
            instructions_location: "input_prefix".to_string(),
            tools_location: "input_prefix".to_string(),
            reasoning_context: "all_turns".to_string(),
            parallel_tool_calls_allowed: false,
            requires_responses_lite_header: true,
        }),
        None,
        None,
    ));

    assert!(request.provider_request_wire_support_issue().is_none());
}

#[test]
fn stream_request_accepts_responses_lite_wire_for_openai_responses_compat() {
    let handle = RuntimeReplyProviderHandle::from_config(
        &runtime_config(),
        RuntimeProviderBackend::AsterCompat,
    );
    let request = RuntimeReplyStreamRequest::new(
        "session-1",
        RuntimeReplyInputKind::UserMessage,
        42,
        Some(handle),
    )
    .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
        Some(RuntimeReplyResponsesPolicy {
            use_responses_lite: true,
            request_mode: "responses_lite".to_string(),
            instructions_location: "input_prefix".to_string(),
            tools_location: "input_prefix".to_string(),
            reasoning_context: "all_turns".to_string(),
            parallel_tool_calls_allowed: false,
            requires_responses_lite_header: true,
        }),
        None,
        None,
    ));

    assert!(request.provider_request_wire_support_issue().is_none());
}

#[test]
fn stream_request_rejects_responses_lite_wire_for_chat_compat() {
    let mut config = runtime_config();
    config.protocol = Some(RuntimeProviderProtocol::ChatCompletions);
    let handle =
        RuntimeReplyProviderHandle::from_config(&config, RuntimeProviderBackend::AsterCompat);
    let request = RuntimeReplyStreamRequest::new(
        "session-1",
        RuntimeReplyInputKind::UserMessage,
        42,
        Some(handle),
    )
    .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
        Some(RuntimeReplyResponsesPolicy {
            use_responses_lite: true,
            request_mode: "responses_lite".to_string(),
            instructions_location: "input_prefix".to_string(),
            tools_location: "input_prefix".to_string(),
            reasoning_context: "all_turns".to_string(),
            parallel_tool_calls_allowed: false,
            requires_responses_lite_header: true,
        }),
        None,
        None,
    ));

    let issue = request
        .provider_request_wire_support_issue()
        .expect("wire support issue");

    assert_eq!(
        issue.provider_backend,
        Some(RuntimeProviderBackend::AsterCompat)
    );
    assert_eq!(issue.provider_name.as_deref(), Some("openai"));
    assert_eq!(issue.model_name.as_deref(), Some("gpt-5.3-codex"));
    assert!(issue.wire_shape.requires_responses_lite_wire_support());
    assert_eq!(
        issue.message(),
        RuntimeReplyProviderWireSupportIssue::MESSAGE
    );
}

#[test]
fn stream_request_projects_plain_responses_parallel_tool_calls_without_lite_header() {
    let request =
        RuntimeReplyStreamRequest::new("session-1", RuntimeReplyInputKind::UserMessage, 42, None)
            .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
                Some(RuntimeReplyResponsesPolicy {
                    use_responses_lite: false,
                    request_mode: "responses".to_string(),
                    instructions_location: "request_field".to_string(),
                    tools_location: "request_field".to_string(),
                    reasoning_context: "default".to_string(),
                    parallel_tool_calls_allowed: true,
                    requires_responses_lite_header: false,
                }),
                Some(RuntimeReplyToolCallPolicy {
                    supports_parallel_tool_calls: true,
                    parallel_tool_calls: true,
                }),
                None,
            ));

    let wire_shape = request.provider_request_wire_shape();

    assert!(!wire_shape.use_responses_lite);
    assert_eq!(wire_shape.reasoning_context.as_deref(), Some("default"));
    assert_eq!(wire_shape.parallel_tool_calls, Some(true));
    assert!(wire_shape.headers.is_empty());
    assert!(!wire_shape.requires_responses_lite_wire_support());
}

#[test]
fn stream_request_projects_reasoning_output_wire_shape() {
    let request =
        RuntimeReplyStreamRequest::new("session-1", RuntimeReplyInputKind::UserMessage, 42, None)
            .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
                None,
                None,
                Some(RuntimeReplyReasoningOutputPolicy {
                    default_reasoning_summary: "detailed".to_string(),
                    support_verbosity: true,
                    default_verbosity: Some("low".to_string()),
                    can_set_verbosity: true,
                }),
            ));

    let wire_shape = request.provider_request_wire_shape();

    assert_eq!(wire_shape.reasoning_summary.as_deref(), Some("detailed"));
    assert_eq!(wire_shape.text_verbosity.as_deref(), Some("low"));
}

#[test]
fn reasoning_output_wire_shape_omits_none_summary_and_unsupported_verbosity() {
    let request =
        RuntimeReplyStreamRequest::new("session-1", RuntimeReplyInputKind::UserMessage, 42, None)
            .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
                None,
                None,
                Some(RuntimeReplyReasoningOutputPolicy {
                    default_reasoning_summary: "none".to_string(),
                    support_verbosity: false,
                    default_verbosity: Some("high".to_string()),
                    can_set_verbosity: false,
                }),
            ));

    let wire_shape = request.provider_request_wire_shape();

    assert_eq!(wire_shape.reasoning_summary, None);
    assert_eq!(wire_shape.text_verbosity, None);
}
