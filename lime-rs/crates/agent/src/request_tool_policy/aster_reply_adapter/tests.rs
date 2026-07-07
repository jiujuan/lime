use super::*;
use agent_protocol::turn_context::TurnContextOverride;
use aster::providers::formats::openai_responses::PROVIDER_STREAM_EVENT_NOTIFICATION_PREFIX;
use model_provider::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol};
use model_provider::safety::ProviderSafetyBufferingRetryModelSource;
use serde_json::json;
use std::collections::HashMap;

fn empty_session_config(turn_context: Option<TurnContextOverride>) -> AgentSessionConfig {
    AgentSessionConfig {
        id: "session_native_policy".to_string(),
        thread_id: None,
        turn_id: None,
        schedule_id: None,
        max_turns: None,
        system_prompt: None,
        system_prompt_override: None,
        include_context_trace: None,
        turn_context,
    }
}

#[test]
fn attach_native_tool_policy_scope_disallows_unsupported_native_tools() {
    let mut config = empty_session_config(Some(TurnContextOverride {
        metadata: HashMap::from([
            (
                "runtime_options".to_string(),
                json!({
                    "harness": {
                        "model_request_policy": {
                            "native_tool_policy": {
                                "shell_type": "unified_exec",
                                "apply_patch_tool_enabled": true
                            }
                        }
                    }
                }),
            ),
            (
                "tool_scope".to_string(),
                json!({ "disallowed_tools": ["Read", "Bash"] }),
            ),
        ]),
        ..TurnContextOverride::default()
    }));

    attach_native_tool_policy_scope(&mut config);

    let turn_context = config.turn_context.expect("turn context");
    let disallowed_tools = turn_context
        .metadata
        .get("tool_scope")
        .and_then(|value| value.get("disallowed_tools"))
        .and_then(serde_json::Value::as_array)
        .expect("disallowed tools");
    let names = disallowed_tools
        .iter()
        .filter_map(serde_json::Value::as_str)
        .collect::<Vec<_>>();

    assert_eq!(names, vec!["Read", "Bash", "PowerShell", "apply_patch"]);
}

#[test]
fn provider_stream_notification_projects_safety_buffering_event() {
    let payload = json!({
        "eventKind": PROVIDER_STREAM_EVENT_KIND_SAFETY_BUFFERING,
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
                "name": "x-codex-safety-buffering-enabled",
                "value": "true"
            },
            {
                "name": "x-codex-safety-buffering-faster-model",
                "value": "legacy-fast"
            }
        ]
    });
    let message = Message::assistant()
        .with_system_notification(
            aster::conversation::message::SystemNotificationType::InlineMessage,
            format!("{PROVIDER_STREAM_EVENT_NOTIFICATION_PREFIX}{payload}"),
        )
        .with_metadata(aster::conversation::message::MessageMetadata::invisible());
    let config = RuntimeProviderConfig {
        provider_name: "openai".to_string(),
        provider_selector: Some("openai".to_string()),
        model_name: "gpt-5-codex".to_string(),
        api_key: None,
        base_url: Some("https://api.openai.com".to_string()),
        credential_uuid: "credential-1".to_string(),
        reasoning_effort: None,
        protocol: Some(RuntimeProviderProtocol::Responses),
        toolshim: false,
        toolshim_model: None,
    };
    let stream_request = RuntimeReplyStreamRequest::new(
        "session-1",
        model_provider::provider_stream::RuntimeReplyInputKind::UserMessage,
        10,
        Some(RuntimeReplyProviderHandle::from_config(
            &config,
            RuntimeProviderBackend::AsterCompat,
        )),
    );

    let event = provider_stream_event_from_aster_message(&stream_request, &message)
        .expect("provider stream event");

    let RuntimeReplyProviderStreamEvent::SafetyBuffering(payload) = event;
    assert_eq!(payload.provider.as_deref(), Some("openai"));
    assert_eq!(payload.model.as_deref(), Some("gpt-5-codex"));
    assert_eq!(payload.use_cases, ["cyber"]);
    assert_eq!(payload.reasons, ["policy"]);
    assert!(payload.show_buffering_ui);
    assert_eq!(payload.retry_model.as_deref(), Some("gpt-5-mini"));
    assert_eq!(
        payload.source,
        ProviderSafetyBufferingRetryModelSource::PayloadRetryModel
    );
    assert_eq!(payload.fallback_header_model, None);
}
