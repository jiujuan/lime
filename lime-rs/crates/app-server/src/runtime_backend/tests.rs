use super::request_context::{
    host_reasoning_effort, host_thinking_enabled, request_workspace_scope,
    selection_from_explicit_preferences, selection_from_host_provider_config,
    selection_from_session_default, turn_context_from_request,
};
use super::*;
use crate::RuntimeHostContext;
use app_server_protocol::AgentInput;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionActionScope;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::BusinessObjectRef;
use app_server_protocol::RuntimeOptions;
use lime_agent::{AgentEvent as RuntimeAgentEvent, AgentToolResult, RequestToolPolicyMode};
use std::collections::HashMap;
use tempfile::TempDir;

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

#[tokio::test]
async fn respond_action_emits_resolved_fact_with_action_identity() {
    let backend = RuntimeBackend::new();
    let request = request_for_test("hello", None, None);
    let mut sink = TestRuntimeEventSink::default();

    ExecutionBackend::respond_action(
        &backend,
        ActionRespondRequest {
            host: RuntimeHostContext::default(),
            session: request.session,
            turn: Some(request.turn),
            request_id: "ask-1".to_string(),
            action_type: AgentSessionActionType::AskUser,
            confirmed: false,
            response: None,
            user_data: None,
            metadata: None,
            event_name: None,
            action_scope: Some(AgentSessionActionScope {
                session_id: Some("session-1".to_string()),
                thread_id: Some("thread-1".to_string()),
                turn_id: Some("turn-1".to_string()),
            }),
        },
        &mut sink,
    )
    .await
    .expect("denied ask_user action should emit a resolved fact");

    assert_eq!(sink.events.len(), 1);
    let event = &sink.events[0];
    assert_eq!(event.event_type, "action.resolved");
    assert_eq!(event.payload["requestId"].as_str(), Some("ask-1"));
    assert_eq!(event.payload["actionId"].as_str(), Some("ask-1"));
    assert_eq!(event.payload["actionType"].as_str(), Some("ask_user"));
    assert_eq!(event.payload["confirmed"].as_bool(), Some(false));
    assert_eq!(event.payload["decision"].as_str(), Some("deny"));
    assert_eq!(event.payload["scope"]["turnId"].as_str(), Some("turn-1"));
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
fn runtime_options_metadata_reasoning_flows_to_selection_and_turn_context() {
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            "turn_config": {
                "reasoning_effort": "medium"
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    assert_eq!(selection.reasoning_effort.as_deref(), Some("medium"));

    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");

    assert_eq!(turn_context.effort.as_deref(), Some("medium"));
}

#[test]
fn metadata_reasoning_aliases_flow_to_selection_and_turn_context() {
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            "turnConfig": {
                "modelReasoningEffort": "low"
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1-mini".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    assert_eq!(selection.reasoning_effort.as_deref(), Some("low"));

    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");
    assert_eq!(turn_context.effort.as_deref(), Some("low"));
}

#[test]
fn injected_tool_execution_config_flows_to_turn_context_metadata() {
    let mut request = request_for_test("hello", None, None);
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1-mini".to_string());
    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");

    let turn_context = turn_context_from_request(
        &request,
        None,
        &scope,
        &selection,
        Some(json!({
            "agent": {
                "toolExecution": {
                    "toolOverrides": {
                        "bash": {
                            "warningPolicy": "none"
                        }
                    }
                }
            }
        })),
    )
    .expect("turn context");

    assert_eq!(
        turn_context
            .metadata
            .get("config")
            .and_then(|value| value.pointer("/agent/toolExecution/toolOverrides/bash/warningPolicy"))
            .and_then(Value::as_str),
        Some("none")
    );
}

#[test]
fn injected_workspace_sandbox_config_flows_to_turn_context_metadata() {
    let mut request = request_for_test("hello", None, None);
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1-mini".to_string());
    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");

    let turn_context = turn_context_from_request(
        &request,
        None,
        &scope,
        &selection,
        Some(json!({
            "agent": {
                "workspaceSandbox": {
                    "enabled": true,
                    "strict": true,
                    "notifyOnFallback": false
                }
            }
        })),
    )
    .expect("turn context");

    assert_eq!(
        turn_context
            .metadata
            .get("config")
            .and_then(|value| value.pointer("/agent/workspaceSandbox/enabled"))
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        turn_context
            .metadata
            .get("config")
            .and_then(|value| value.pointer("/agent/workspaceSandbox/strict"))
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn top_level_request_metadata_reasoning_is_used_when_runtime_metadata_omits_it() {
    let mut request = request_for_test("hello", None, Some(json!({ "trace": "runtime-only" })));
    request.metadata = Some(json!({
        "harness": {
            "modelReasoningEffort": "high"
        }
    }));
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");

    assert_eq!(selection.reasoning_effort.as_deref(), Some("high"));
}

#[test]
fn turn_config_provider_config_and_reasoning_override_host_top_level() {
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "reasoning_effort": "low",
                "provider_config": {
                    "provider_id": "top-openai",
                    "provider_name": "openai",
                    "model_name": "top-model",
                    "api_key": "top-key",
                    "base_url": "http://127.0.0.1:56598"
                },
                "turn_config": {
                    "reasoning_effort": "high",
                    "provider_config": {
                        "provider_id": "turn-openai",
                        "provider_name": "openai",
                        "model_name": "turn-model",
                        "api_key": "turn-key",
                        "base_url": "http://127.0.0.1:56599",
                        "tool_call_strategy": "tool_shim",
                        "toolshim_model": "turn-toolshim-model"
                    }
                }
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

    assert_eq!(selection.provider, "turn-openai");
    assert_eq!(selection.model, "turn-model");
    assert_eq!(selection.reasoning_effort.as_deref(), Some("high"));
    assert_eq!(
        direct_config.provider_selector.as_deref(),
        Some("turn-openai")
    );
    assert_eq!(direct_config.model_name, "turn-model");
    assert_eq!(direct_config.api_key.as_deref(), Some("turn-key"));
    assert_eq!(
        direct_config.base_url.as_deref(),
        Some("http://127.0.0.1:56599")
    );
    assert_eq!(direct_config.reasoning_effort.as_deref(), Some("high"));
    assert!(direct_config.toolshim);
    assert_eq!(
        direct_config.toolshim_model.as_deref(),
        Some("turn-toolshim-model")
    );
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
fn runtime_agent_tool_events_are_mirrored_to_coding_facts() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();

    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-test".to_string(),
            arguments: Some(
                json!({ "command": "cargo test -p app-server coding_events" }).to_string(),
            ),
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool start should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolOutputDelta {
            tool_id: "tool-test".to_string(),
            delta: "running tests".to_string(),
            output_kind: Some("stdout".to_string()),
            metadata: None,
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool output should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-test".to_string(),
            result: AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                images: None,
                metadata: Some(HashMap::from([
                    ("exit_code".to_string(), json!(0)),
                    (
                        "command".to_string(),
                        json!("cargo test -p app-server coding_events"),
                    ),
                ])),
            },
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool end should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "tool.started",
            "tool.args",
            "command.started",
            "test.started",
            "tool.output.delta",
            "command.output",
            "tool.result",
            "command.exited",
            "test.completed"
        ]
    );
    let args_event = sink
        .events
        .iter()
        .find(|event| event.event_type == "tool.args")
        .expect("tool args event");
    assert_eq!(args_event.payload["toolCallId"].as_str(), Some("tool-test"));
    assert_eq!(
        args_event.payload["args"]["command"].as_str(),
        Some("cargo test -p app-server coding_events")
    );
    assert_eq!(
        args_event.payload["source"].as_str(),
        Some("runtime_tool_start")
    );
}

#[test]
fn runtime_agent_failed_shell_tool_is_mirrored_to_coding_facts() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();

    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-failed".to_string(),
            arguments: Some(json!({ "command": "cargo test -p app-server missing" }).to_string()),
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool start should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-failed".to_string(),
            result: AgentToolResult {
                success: false,
                output: "test failed".to_string(),
                error: Some("exit code 101".to_string()),
                images: None,
                metadata: Some(HashMap::from([
                    ("exit_code".to_string(), json!(101)),
                    ("failureCategory".to_string(), json!("test_failed")),
                    (
                        "command".to_string(),
                        json!("cargo test -p app-server missing"),
                    ),
                ])),
            },
        },
        &mut sink,
        &mut mirror,
    )
    .expect("failed tool end should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "tool.started",
            "tool.args",
            "command.started",
            "test.started",
            "tool.failed",
            "command.output",
            "command.exited",
            "test.completed"
        ]
    );
    let failed_event = sink
        .events
        .iter()
        .find(|event| event.event_type == "tool.failed")
        .expect("tool failed event");
    assert_eq!(
        failed_event.payload["toolCallId"].as_str(),
        Some("tool-failed")
    );
    assert_eq!(failed_event.payload["status"].as_str(), Some("failed"));
    assert_eq!(
        failed_event.payload["failureCategory"].as_str(),
        Some("test_failed")
    );
    assert_eq!(
        failed_event.payload["error"].as_str(),
        Some("exit code 101")
    );
    assert_eq!(failed_event.payload["output"].as_str(), Some("test failed"));
}

#[test]
fn runtime_agent_permission_denied_fact_precedes_tool_failed_terminal() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();

    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-denied".to_string(),
            arguments: Some(json!({ "command": "rm -rf important" }).to_string()),
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool start should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-denied".to_string(),
            result: AgentToolResult {
                success: false,
                output: String::new(),
                error: Some("policy denied this command".to_string()),
                images: None,
                metadata: Some(HashMap::from([(
                    "reasonCode".to_string(),
                    json!("dangerous_command"),
                )])),
            },
        },
        &mut sink,
        &mut mirror,
    )
    .expect("failed tool end should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "tool.started",
            "tool.args",
            "command.started",
            "permission.denied",
            "tool.failed",
            "command.exited"
        ]
    );
    let denied = sink
        .events
        .iter()
        .find(|event| event.event_type == "permission.denied")
        .expect("permission denied event");
    assert_eq!(denied.payload["toolCallId"].as_str(), Some("tool-denied"));
    assert_eq!(
        denied.payload["reasonCode"].as_str(),
        Some("dangerous_command")
    );
}

#[test]
fn runtime_agent_read_tool_result_is_mirrored_to_file_read() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();

    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Read".to_string(),
            tool_id: "tool-read".to_string(),
            arguments: Some(json!({ "path": "src/App.tsx" }).to_string()),
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool start should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-read".to_string(),
            result: AgentToolResult {
                success: true,
                output: "1 | export {}".to_string(),
                error: None,
                images: None,
                metadata: Some(HashMap::from([("file_type".to_string(), json!("text"))])),
            },
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool end should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec!["tool.started", "tool.args", "tool.result", "file.read"]
    );
    assert_eq!(
        sink.events.last().expect("file read event").payload["path"].as_str(),
        Some("src/App.tsx")
    );
}

#[test]
fn runtime_agent_shell_apply_patch_is_mirrored_to_patch_lifecycle() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();

    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-patch-shell".to_string(),
            arguments: Some(
                json!({
                    "command": "apply_patch <<'PATCH'\n*** Begin Patch\n*** Add File: notes/live.md\n+hello\n*** End Patch\nPATCH"
                })
                .to_string(),
            ),
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool start should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-patch-shell".to_string(),
            result: AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                images: None,
                metadata: Some(HashMap::from([
                    ("exit_code".to_string(), json!(0)),
                    ("command".to_string(), json!("apply_patch <<'PATCH'")),
                ])),
            },
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool end should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "tool.started",
            "tool.args",
            "patch.started",
            "command.started",
            "tool.result",
            "command.output",
            "command.exited",
            "patch.applied",
        ]
    );
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

#[test]
fn request_working_dir_uses_host_turn_config_absolute_directory() {
    let workspace = TempDir::new().expect("create workspace");
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "turn_config": {
                    "working_dir": workspace.path().to_string_lossy()
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    let working_dir = request_workspace_scope(&request, host_request.as_ref())
        .working_dir
        .expect("working dir");

    assert_eq!(working_dir, workspace.path());
}

#[test]
fn request_working_dir_prefers_turn_config_over_host_top_level() {
    let top_level_workspace = TempDir::new().expect("create top-level workspace");
    let turn_workspace = TempDir::new().expect("create turn workspace");
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "working_dir": top_level_workspace.path().to_string_lossy(),
                "turn_config": {
                    "working_dir": turn_workspace.path().to_string_lossy()
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    let working_dir = request_workspace_scope(&request, host_request.as_ref())
        .working_dir
        .expect("working dir");

    assert_eq!(working_dir, turn_workspace.path());
}

#[test]
fn request_working_dir_rejects_relative_directory() {
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "working_dir": "relative-workspace"
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    assert!(request_workspace_scope(&request, host_request.as_ref())
        .working_dir
        .is_none());
}

#[test]
fn request_workspace_scope_keeps_project_root_and_working_dir_distinct() {
    let workspace = TempDir::new().expect("create workspace");
    let repo = workspace.path().join("repo");
    let nested = repo.join("apps").join("writer");
    std::fs::create_dir_all(&nested).expect("create nested");
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "projectRoot": repo.to_string_lossy(),
                "turnConfig": {
                    "workingDir": nested.to_string_lossy()
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    let scope = request_workspace_scope(&request, host_request.as_ref());

    assert_eq!(scope.working_dir.as_deref(), Some(nested.as_path()));
    assert_eq!(scope.project_root.as_deref(), Some(repo.as_path()));
}

#[test]
fn request_workspace_scope_falls_back_to_project_root_when_working_dir_missing() {
    let workspace = TempDir::new().expect("create workspace");
    let request = request_for_test(
        "hello",
        None,
        Some(json!({
            "workspaceRoot": workspace.path().to_string_lossy()
        })),
    );

    let scope = request_workspace_scope(&request, None);

    assert_eq!(scope.working_dir.as_deref(), Some(workspace.path()));
    assert_eq!(scope.project_root.as_deref(), Some(workspace.path()));
}

#[test]
fn session_config_merges_turn_prompt_runtime_agents_and_tool_policy() {
    let workspace = TempDir::new().expect("create workspace");
    let runtime_agents_path = workspace.path().join(".lime").join("AGENTS.md");
    std::fs::create_dir_all(runtime_agents_path.parent().expect("runtime agents parent"))
        .expect("create runtime agents parent");
    std::fs::write(&runtime_agents_path, "- 工作区动态指令").expect("write runtime agents");
    let request = request_for_test(
        "需要联网核实最新信息",
        Some(json!({
            "asterChatRequest": {
                "turn_config": {
                    "system_prompt": "请求级系统提示",
                    "working_dir": workspace.path().to_string_lossy(),
                    "web_search": true,
                    "search_mode": "required"
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("scope");
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-4.1".to_string(),
        source: "test",
        reasoning_effort: Some("high".to_string()),
    };
    let policy = request_tool_policy_from_request(host_request.as_ref());

    let config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &scope,
        &selection,
        &policy,
        None,
    );
    let system_prompt = config.system_prompt.expect("system prompt");

    assert!(system_prompt.contains("请求级系统提示"));
    assert!(system_prompt.contains("【Lime Runtime AGENTS 指令】"));
    assert!(system_prompt.contains("工作区动态指令"));
    assert!(system_prompt.contains("【请求级工具策略】"));
}

#[test]
fn session_config_merges_hierarchical_runtime_agents_layers() {
    let workspace = TempDir::new().expect("create workspace");
    let repo = workspace.path().join("repo");
    let nested = repo.join("apps").join("writer");
    std::fs::create_dir_all(nested.join(".lime")).expect("create nested runtime agents dir");
    std::fs::create_dir_all(repo.join(".lime")).expect("create root runtime agents dir");
    std::fs::write(repo.join(".git"), "").expect("write project marker");
    std::fs::write(repo.join(".lime").join("AGENTS.md"), "- 根共享规则")
        .expect("write root shared runtime agents");
    std::fs::write(repo.join(".lime").join("AGENTS.local.md"), "- 根本地规则")
        .expect("write root local runtime agents");
    std::fs::write(nested.join(".lime").join("AGENTS.md"), "- 子目录共享规则")
        .expect("write nested shared runtime agents");
    std::fs::write(
        nested.join(".lime").join("AGENTS.local.md"),
        "- 子目录本地规则",
    )
    .expect("write nested local runtime agents");
    let request = request_for_test(
        "请按项目规则处理",
        Some(json!({
            "asterChatRequest": {
                "turn_config": {
                    "system_prompt": "请求级系统提示",
                    "working_dir": nested.to_string_lossy()
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("scope");
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-4.1".to_string(),
        source: "test",
        reasoning_effort: None,
    };
    let policy = request_tool_policy_from_request(host_request.as_ref());

    let config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &scope,
        &selection,
        &policy,
        None,
    );
    let system_prompt = config.system_prompt.expect("system prompt");
    let root_shared = system_prompt.find("根共享规则").expect("root shared");
    let root_local = system_prompt.find("根本地规则").expect("root local");
    let nested_shared = system_prompt.find("子目录共享规则").expect("nested shared");
    let nested_local = system_prompt.find("子目录本地规则").expect("nested local");

    assert!(system_prompt.contains("请求级系统提示"));
    assert!(root_shared < root_local);
    assert!(root_local < nested_shared);
    assert!(nested_shared < nested_local);
}

#[test]
fn session_config_uses_explicit_project_root_for_runtime_agents_boundary() {
    let workspace = TempDir::new().expect("create workspace");
    let parent = workspace.path().join("parent");
    let repo = parent.join("repo");
    let nested = repo.join("apps").join("writer");
    std::fs::create_dir_all(parent.join(".lime")).expect("create parent runtime agents dir");
    std::fs::create_dir_all(repo.join(".lime")).expect("create root runtime agents dir");
    std::fs::create_dir_all(nested.join(".lime")).expect("create nested runtime agents dir");
    std::fs::write(
        parent.join(".lime").join("AGENTS.md"),
        "- 父目录规则不应出现",
    )
    .expect("write parent runtime agents");
    std::fs::write(repo.join(".lime").join("AGENTS.md"), "- 显式根规则")
        .expect("write root runtime agents");
    std::fs::write(
        nested.join(".lime").join("AGENTS.override.md"),
        "- 子目录覆盖规则",
    )
    .expect("write nested override runtime agents");
    std::fs::write(
        nested.join(".lime").join("AGENTS.local.md"),
        "- 子目录本地规则",
    )
    .expect("write nested local runtime agents");
    let request = request_for_test(
        "请按项目规则处理",
        Some(json!({
            "asterChatRequest": {
                "projectRoot": repo.to_string_lossy(),
                "turnConfig": {
                    "systemPrompt": "请求级系统提示",
                    "workingDir": nested.to_string_lossy()
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("scope");
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-4.1".to_string(),
        source: "test",
        reasoning_effort: None,
    };
    let policy = request_tool_policy_from_request(host_request.as_ref());

    let config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &scope,
        &selection,
        &policy,
        None,
    );
    let system_prompt = config.system_prompt.expect("system prompt");
    let root_rule = system_prompt.find("显式根规则").expect("root rule");
    let nested_override = system_prompt
        .find("子目录覆盖规则")
        .expect("nested override rule");
    let nested_local = system_prompt
        .find("子目录本地规则")
        .expect("nested local rule");
    let turn_context = config.turn_context.expect("turn context");
    let runtime_metadata = turn_context
        .metadata
        .get("app_server_runtime_backend")
        .expect("runtime metadata");
    let nested_string = nested.to_string_lossy().to_string();
    let repo_string = repo.to_string_lossy().to_string();

    assert!(system_prompt.contains("# AGENTS.md instructions"));
    assert!(system_prompt.contains("<INSTRUCTIONS>"));
    assert!(root_rule < nested_override);
    assert!(nested_override < nested_local);
    assert!(!system_prompt.contains("父目录规则不应出现"));
    assert_eq!(turn_context.cwd.as_deref(), Some(nested.as_path()));
    assert_eq!(
        runtime_metadata["workingDir"].as_str(),
        Some(nested_string.as_str()),
    );
    assert_eq!(
        runtime_metadata["projectRoot"].as_str(),
        Some(repo_string.as_str()),
    );
}

#[test]
fn host_turn_config_reasoning_and_thinking_are_preserved() {
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "reasoning_effort": "low",
                "thinking_enabled": false,
                "turn_config": {
                    "reasoning_effort": "high",
                    "thinking_enabled": true
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request).expect("host request");

    assert_eq!(
        host_reasoning_effort(&host_request).as_deref(),
        Some("high")
    );
    assert_eq!(host_thinking_enabled(&host_request), Some(true));

    let scope = session_scope_from_request(&request).expect("scope");
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-4.1".to_string(),
        source: "test",
        reasoning_effort: Some("high".to_string()),
    };
    let turn_context =
        turn_context_from_request(&request, Some(&host_request), &scope, &selection, None)
            .expect("turn context");
    let runtime_metadata = turn_context
        .metadata
        .get("app_server_runtime_backend")
        .expect("runtime metadata");

    assert_eq!(runtime_metadata["thinkingEnabled"], true);
}
