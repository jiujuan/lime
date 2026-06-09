use super::*;
use crate::RuntimeHostContext;
use app_server_protocol::AgentInput;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::BusinessObjectRef;
use app_server_protocol::RuntimeOptions;

#[derive(Default)]
struct TestRuntimeEventSink {
    events: Vec<RuntimeEvent>,
}

impl RuntimeEventSink for TestRuntimeEventSink {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        self.events.push(event);
        Ok(())
    }
}

fn request_for_test(
    message: &str,
    host_options: Option<Value>,
    metadata: Option<Value>,
) -> ExecutionRequest {
    ExecutionRequest {
        host: RuntimeHostContext::default(),
        session: AgentSession {
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            status: AgentSessionStatus::Running,
            created_at: "2026-06-07T00:00:00.000Z".to_string(),
            updated_at: "2026-06-07T00:00:00.000Z".to_string(),
        },
        turn: AgentTurn {
            turn_id: "turn-1".to_string(),
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            status: AgentTurnStatus::Accepted,
            started_at: None,
            completed_at: None,
        },
        input: AgentInput {
            text: message.to_string(),
            attachments: Vec::new(),
        },
        runtime_options: Some(RuntimeOptions {
            capability_id: None,
            stream: true,
            event_name: None,
            provider_preference: None,
            model_preference: None,
            metadata,
            queued_turn_id: None,
            host_options,
        }),
        event_name: None,
        provider_preference: None,
        model_preference: None,
        metadata: None,
        queued_turn_id: None,
        queue_if_busy: false,
        skip_pre_submit_resume: false,
    }
}

fn request_with_session_metadata(metadata: Value) -> ExecutionRequest {
    let mut request = request_for_test("hello", None, None);
    request.session.business_object_ref = Some(BusinessObjectRef {
        kind: "current_timeline".to_string(),
        id: "session-1".to_string(),
        title: None,
        uri: None,
        metadata: Some(metadata),
    });
    request.runtime_options = None;
    request
}

#[tokio::test]
async fn cancel_turn_cancels_runtime_stream_token() {
    let backend = RuntimeBackend::new();
    let request = request_for_test("请持续输出", None, None);
    let cancel_token = backend
        .agent_state
        .create_cancel_token(&request.session.session_id)
        .await;
    let mut sink = TestRuntimeEventSink::default();

    ExecutionBackend::cancel_turn(
        &backend,
        CancelExecutionRequest {
            host: RuntimeHostContext::default(),
            session: request.session,
            turn: request.turn,
        },
        &mut sink,
    )
    .await
    .expect("cancel should emit a runtime event");

    assert!(cancel_token.is_cancelled());
    assert_eq!(sink.events.len(), 1);
    assert_eq!(sink.events[0].event_type, "turn.canceled");
}

#[test]
fn explicit_runtime_preferences_win() {
    let mut request = request_for_test("hello", None, None);
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("deepseek".to_string());
    options.model_preference = Some("deepseek-chat".to_string());
    request.provider_preference = options.provider_preference.clone();
    request.model_preference = options.model_preference.clone();

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    assert_eq!(
        selection,
        RuntimeModelSelection {
            provider: "deepseek".to_string(),
            model: "deepseek-chat".to_string(),
            source: "runtime_options",
            reasoning_effort: None,
        }
    );
}

#[test]
fn host_provider_config_without_direct_credentials_stays_database_backed() {
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "provider_config": {
                    "provider_id": "database-openai",
                    "provider_name": "openai",
                    "model_name": "gpt-4.1"
                },
                "provider_preference": "database-openai",
                "model_preference": "gpt-4.1"
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let selection = selection_from_host_provider_config(&request).expect("selection");

    let direct_config = direct_provider_config_from_request(
        host_request.as_ref(),
        &selection,
        selection.reasoning_effort.clone(),
    );

    assert!(direct_config.is_none());
    assert_eq!(selection.provider, "database-openai");
    assert_eq!(selection.model, "gpt-4.1");
    assert_eq!(selection.source, "host_options_provider_config");
}

#[test]
fn direct_host_provider_config_allows_localhost_fixture_without_database_provider() {
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "provider_config": {
                    "provider_id": "fixture-openai",
                    "provider_name": "openai",
                    "model_name": "lime-fixture-chat",
                    "api_key": "fixture-key",
                    "base_url": "http://127.0.0.1:56599",
                    "tool_call_strategy": "native"
                },
                "provider_preference": "fixture-openai",
                "model_preference": "lime-fixture-chat",
                "reasoning_effort": "high"
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let selection = selection_from_host_provider_config(&request).expect("selection");

    let direct_config = direct_provider_config_from_request(
        host_request.as_ref(),
        &selection,
        selection.reasoning_effort.clone(),
    )
    .expect("direct provider config");

    assert_eq!(direct_config.provider_name, "openai");
    assert_eq!(
        direct_config.provider_selector.as_deref(),
        Some("fixture-openai")
    );
    assert_eq!(direct_config.model_name, "lime-fixture-chat");
    assert_eq!(direct_config.api_key.as_deref(), Some("fixture-key"));
    assert_eq!(
        direct_config.base_url.as_deref(),
        Some("http://127.0.0.1:56599")
    );
    assert_eq!(direct_config.reasoning_effort.as_deref(), Some("high"));
    assert!(!direct_config.toolshim);
}

#[test]
fn session_default_provider_model_is_used_after_frontend_compaction() {
    let request = request_with_session_metadata(json!({
        "providerSelector": "openai-compatible",
        "modelName": "gpt-4.1-mini"
    }));

    let selection = selection_from_session_default(&request).expect("selection");

    assert_eq!(selection.provider, "openai-compatible");
    assert_eq!(selection.model, "gpt-4.1-mini");
    assert_eq!(selection.source, "session_default");
}

#[test]
fn incomplete_session_default_is_not_a_runtime_selection() {
    let missing_model = request_with_session_metadata(json!({
        "providerSelector": "openai-compatible"
    }));
    let missing_provider = request_with_session_metadata(json!({
        "modelName": "gpt-4.1-mini"
    }));

    assert!(selection_from_session_default(&missing_model).is_none());
    assert!(selection_from_session_default(&missing_provider).is_none());
}

#[test]
fn current_timeline_extension_data_provider_routing_is_used_as_session_default() {
    let request = request_with_session_metadata(json!({
        "model": "claude-sonnet-4",
        "extensionData": {
            "lime_provider_routing.v0": {
                "providerSelector": "lime-hub"
            }
        }
    }));

    let selection = selection_from_session_default(&request).expect("selection");

    assert_eq!(selection.provider, "lime-hub");
    assert_eq!(selection.model, "claude-sonnet-4");
    assert_eq!(selection.source, "session_default");
}

#[test]
fn natural_language_news_turn_leaves_search_mode_to_model_tool_choice() {
    let request = request_for_test("整理今天的国际新闻", None, None);
    let host_request = aster_chat_request_from_request(&request);

    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert!(policy.effective_web_search);
    assert_eq!(policy.search_mode, RequestToolPolicyMode::Allowed);
    assert!(!policy.requires_web_search());
}

#[test]
fn explicit_web_search_false_keeps_search_disabled() {
    let request = request_for_test(
        "整理今天的国际新闻",
        Some(json!({
            "asterChatRequest": {
                "web_search": false
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert!(!policy.effective_web_search);
    assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
}
