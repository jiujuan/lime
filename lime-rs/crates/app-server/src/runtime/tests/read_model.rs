use super::support::*;
use super::*;

struct RoutingDecisionReadModelBackend;

#[async_trait]
impl ExecutionBackend for RoutingDecisionReadModelBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new(
            "routing.decision.made",
            json!({
                "backend": "runtime",
                "routingDecision": {
                    "routingMode": "profile_slot",
                    "decisionSource": "profile_model_slot",
                    "decisionReason": "profile_slot_selected",
                    "settingsSource": "workspace_profile",
                    "serviceModelSlot": "coding",
                    "selectedProvider": "custom-coding",
                    "selectedModel": "coder-large",
                    "requestedProvider": "custom-coding",
                    "requestedModel": "coder-large",
                    "fallbackChain": []
                },
                "modelSlot": {
                    "serviceModelSlot": "coding",
                    "slots": [
                        {
                            "slot": "coding",
                            "provider": "custom-coding",
                            "model": "coder-large"
                        },
                        {
                            "slot": "review",
                            "provider": "custom-review",
                            "model": "review-small"
                        }
                    ]
                },
                "providerReadiness": {
                    "ready": true,
                    "status": "ready",
                    "source": "provider_store",
                    "enabledKeyCount": 1
                },
                "modelRegistry": {
                    "source": "provider_declared_model",
                    "status": "matched",
                    "reasonCode": "matched_provider_custom_models",
                    "modelCapabilities": {
                        "capabilities": {
                            "tools": true,
                            "streaming": true,
                            "reasoning": true
                        },
                        "taskFamilies": ["chat", "reasoning"],
                        "runtimeFeatures": ["streaming", "tool_calling", "reasoning"]
                    },
                    "modelAlias": {
                        "canonicalModelId": "coder-large",
                        "providerModelId": "coder-large",
                        "aliasSource": "local"
                    },
                    "reasoning": {
                        "supported": true
                    }
                },
                "modelTaskRequest": {
                    "taskKind": "chat",
                    "source": "agent_turn",
                    "modelRef": {
                        "providerId": "custom-coding",
                        "modelId": "coder-large",
                        "routingSlot": "coding",
                        "source": "profile_slot"
                    },
                    "modalityContractKey": "chat",
                    "routingSlot": "coding",
                    "requirements": {
                        "taskFamilies": ["chat"],
                        "inputModalities": ["text"],
                        "outputModalities": ["text"],
                        "runtimeFeatures": ["streaming"],
                        "capabilities": ["tools", "streaming"]
                    },
                    "sessionId": "sess_routing_read",
                    "threadId": "thread_routing_read",
                    "turnId": "turn_routing_read"
                },
                "resolvedRoute": {
                    "modelRef": {
                        "providerId": "custom-coding",
                        "modelId": "coder-large",
                        "routingSlot": "coding",
                        "source": "profile_slot"
                    },
                    "protocol": "openai_chat",
                    "endpoint": {
                        "kind": "openai_compatible",
                        "baseUrl": "https://coding.example.com/v1"
                    },
                    "auth": {
                        "kind": "api_key_ref",
                        "providerId": "custom-coding",
                        "credentialRef": "runtime-api-key-key-1"
                    },
                    "transport": "http",
                    "framing": "sse",
                    "defaults": {},
                    "capabilitySnapshot": {
                        "taskFamilies": ["chat", "reasoning"],
                        "inputModalities": ["text"],
                        "outputModalities": ["text"],
                        "runtimeFeatures": ["streaming", "tool_calling", "reasoning"],
                        "capabilities": {
                            "vision": false,
                            "tools": true,
                            "streaming": true,
                            "jsonMode": false,
                            "functionCalling": false,
                            "reasoning": true
                        },
                        "source": "provider_declared_model",
                        "reasonCode": "matched_provider_custom_models"
                    },
                    "decision": {
                        "routingMode": "profile_slot",
                        "decisionSource": "profile_model_slot",
                        "decisionReason": "profile_slot_selected",
                        "settingsSource": "workspace_profile",
                        "serviceModelSlot": "coding",
                        "fallbackChain": [],
                        "candidateCount": 1
                    }
                }
            }),
        ))?;
        sink.emit(RuntimeEvent::new("turn.completed", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

async fn start_read_model_test_turn(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> (RuntimeCore, AgentTurn) {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.to_string()),
        thread_id: Some(thread_id.to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session_id.to_string(),
                turn_id: Some(turn_id.to_string()),
                input: AgentInput {
                    text: "测试工具生命周期".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;
    (core, turn)
}

fn tool_item_event_payload(
    item_id: &str,
    thread_id: &str,
    turn_id: &str,
    sequence: i64,
    status: &str,
    tool_name: &str,
    arguments: serde_json::Value,
    output: Option<&str>,
    success: Option<bool>,
) -> serde_json::Value {
    json!({
        "item": {
            "id": item_id,
            "thread_id": thread_id,
            "turn_id": turn_id,
            "sequence": sequence,
            "status": status,
            "started_at": "2026-06-18T00:00:00.000Z",
            "updated_at": "2026-06-18T00:00:01.000Z",
            "completed_at": if status == "completed" { Some("2026-06-18T00:00:01.000Z") } else { None },
            "type": "tool_call",
            "tool_name": tool_name,
            "arguments": arguments,
            "output": output,
            "success": success,
            "metadata": {
                "source": "native_item_runtime"
            }
        }
    })
}

#[tokio::test]
async fn read_session_projects_runtime_turns_into_gui_messages() {
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_messages".to_string()),
        thread_id: Some("thread_messages".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_messages".to_string(),
            title: Some("Messages Read".to_string()),
            uri: None,
            metadata: None,
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_messages".to_string(),
            turn_id: Some("turn_messages".to_string()),
            input: AgentInput {
                text: "你好，帮我整理今天的计划".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("turn");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_messages".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let messages = detail["messages"].as_array().expect("messages");

    assert_eq!(detail["messages_count"], 2);
    assert_eq!(detail["history_cursor"]["loaded_count"], 2);
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0]["id"], "turn_messages:user");
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["runtimeTurnId"], "turn_messages");
    assert_eq!(messages[0]["runtime_turn_id"], "turn_messages");
    assert_eq!(
        messages[0]["content"][0]["text"],
        "你好，帮我整理今天的计划"
    );
    assert_eq!(messages[1]["id"], "turn_messages:assistant");
    assert_eq!(messages[1]["role"], "assistant");
    assert_eq!(messages[1]["runtimeTurnId"], "turn_messages");
    assert_eq!(messages[1]["runtime_turn_id"], "turn_messages");
    assert_eq!(
        messages[1]["content"][0]["text"],
        "你好！有什么可以帮你的吗？"
    );
}

#[tokio::test]
async fn read_session_projects_failed_runtime_event_into_diagnostics_and_error_item() {
    let core = RuntimeCore::with_backend(Arc::new(PartialFailureBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_failed_read".to_string()),
        thread_id: Some("thread_failed_read".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_failed_read".to_string(),
            title: Some("Failed Read".to_string()),
            uri: None,
            metadata: None,
        }),
        locale: None,
    })
    .expect("session");

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_failed_read".to_string(),
                turn_id: Some("turn_failed_read".to_string()),
                input: AgentInput {
                    text: "整理今天的国际新闻".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("backend failure should propagate");
    let expected_error_message = error.to_string();
    assert!(expected_error_message.contains("provider stream timed out"));

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_failed_read".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read failed session");
    let detail = read.detail.expect("session detail");

    assert_eq!(
        detail["thread_read"]["diagnostics"]["latest_turn_status"],
        "failed"
    );
    assert_eq!(
        detail["thread_read"]["diagnostics"]["latest_turn_error_message"].as_str(),
        Some(expected_error_message.as_str())
    );
    assert_eq!(
        detail["thread_read"]["runtime_summary"]["latestTurnErrorMessage"].as_str(),
        Some(expected_error_message.as_str())
    );

    let messages = detail["messages"].as_array().expect("messages");
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["content"][0]["text"], "整理今天的国际新闻");

    let items = detail["items"].as_array().expect("items");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["type"], "error");
    assert_eq!(items[0]["status"], "failed");
    assert_eq!(
        items[0]["message"].as_str(),
        Some(expected_error_message.as_str())
    );
}

#[tokio::test]
async fn read_session_projects_model_routing_into_thread_read() {
    let core = RuntimeCore::with_backend(Arc::new(RoutingDecisionReadModelBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_routing_read".to_string()),
        thread_id: Some("thread_routing_read".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_routing_read".to_string(),
            title: Some("Routing Read".to_string()),
            uri: None,
            metadata: None,
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_routing_read".to_string(),
            turn_id: Some("turn_routing_read".to_string()),
            input: AgentInput {
                text: "帮我修改代码".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("turn");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_routing_read".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let routing = &detail["thread_read"]["model_routing"];

    assert_eq!(
        detail["thread_read"]["service_model_slot"].as_str(),
        Some("coding")
    );
    assert_eq!(
        routing["decisionSource"].as_str(),
        Some("profile_model_slot")
    );
    assert_eq!(
        routing["decisionReason"].as_str(),
        Some("profile_slot_selected")
    );
    assert_eq!(routing["serviceModelSlot"].as_str(), Some("coding"));
    assert_eq!(routing["selectedProvider"].as_str(), Some("custom-coding"));
    assert_eq!(routing["selectedModel"].as_str(), Some("coder-large"));
    assert_eq!(
        routing["providerReadiness"]["status"].as_str(),
        Some("ready")
    );
    assert_eq!(
        routing["modelRegistry"]["reasonCode"].as_str(),
        Some("matched_provider_custom_models")
    );
    assert_eq!(
        routing["modelRegistry"]["modelCapabilities"]["capabilities"]["reasoning"].as_bool(),
        Some(true)
    );
    assert_eq!(
        routing["modelRegistry"]["modelAlias"]["providerModelId"].as_str(),
        Some("coder-large")
    );
    assert_eq!(
        routing["modelSlot"]["slots"][1]["slot"].as_str(),
        Some("review")
    );
    assert_eq!(
        routing["modelTaskRequest"]["requirements"]["taskFamilies"][0].as_str(),
        Some("chat")
    );
    assert_eq!(
        routing["resolvedRoute"]["protocol"].as_str(),
        Some("openai_chat")
    );
    assert_eq!(
        routing["resolvedRoute"]["modelRef"]["providerId"].as_str(),
        Some("custom-coding")
    );
    assert_eq!(
        routing["resolvedRoute"]["decision"]["serviceModelSlot"].as_str(),
        Some("coding")
    );
    assert_eq!(
        detail["thread_read"]["runtime_summary"]["decisionSource"].as_str(),
        Some("profile_model_slot")
    );
}

#[tokio::test]
async fn read_session_projects_runtime_events_into_thread_read_tool_calls() {
    let core = RuntimeCore::with_backend(Arc::new(ToolReadModelBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_tool_read".to_string()),
        thread_id: Some("thread_tool_read".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_tool_read".to_string(),
            title: Some("Tool Read".to_string()),
            uri: None,
            metadata: Some(json!({
                "executionStrategy": "react"
            })),
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_tool_read".to_string(),
            turn_id: Some("turn_tool_read".to_string()),
            input: AgentInput {
                text: "整理今天的国际新闻".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("turn");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_tool_read".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    assert_eq!(detail["execution_strategy"], "react");
    assert_eq!(detail["thread_read"]["status"], "completed");
    assert_eq!(detail["thread_read"]["execution_strategy"], "react");
    let tool_calls = detail["thread_read"]["tool_calls"]
        .as_array()
        .expect("tool calls");
    assert_eq!(tool_calls.len(), 2);
    let web_fetch = tool_calls
        .iter()
        .find(|call| call["tool_name"] == "WebFetch")
        .expect("WebFetch call");
    assert_eq!(web_fetch["status"], "completed");
    assert_eq!(web_fetch["success"], true);
    assert_eq!(web_fetch["output_preview"], "fetched https://example.com");

    let web_search = tool_calls
        .iter()
        .find(|call| call["tool_name"] == "WebSearch")
        .expect("WebSearch call");
    assert_eq!(web_search["id"], "search-call-1");
    assert_eq!(web_search["status"], "completed");
    assert_eq!(web_search["success"], true);
    assert_eq!(web_search["output_preview"], "search results");
}

#[tokio::test]
async fn read_session_merges_tool_started_arguments_into_completed_tool_calls() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_tool_arguments".to_string()),
        thread_id: Some("thread_tool_arguments".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_tool_arguments".to_string(),
                turn_id: Some("turn_tool_arguments".to_string()),
                input: AgentInput {
                    text: "打开导入文件".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;

    core.append_external_runtime_events(
        "sess_tool_arguments",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "call_read_md",
                    "toolName": "read_file",
                    "arguments": {
                        "path": "/workspace/docs/imported-preview.md"
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "call_read_md",
                    "status": "completed",
                    "success": true,
                    "output": "导入会话 Markdown 预览内容"
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append tool events");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_tool_arguments".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let tool_calls = detail["thread_read"]["tool_calls"]
        .as_array()
        .expect("tool calls");
    let read_file = tool_calls
        .iter()
        .find(|call| call["id"] == "call_read_md")
        .expect("read_file call");

    assert_eq!(read_file["tool_name"], "read_file");
    assert_eq!(read_file["status"], "completed");
    assert_eq!(read_file["success"], true);
    assert_eq!(
        read_file["arguments"]["path"],
        "/workspace/docs/imported-preview.md"
    );
    assert_eq!(read_file["output_preview"], "导入会话 Markdown 预览内容");
}

#[tokio::test]
async fn read_session_prefers_item_lifecycle_over_conflicting_legacy_tool_events() {
    let (core, turn) = start_read_model_test_turn(
        "sess_item_first_tool_read",
        "thread_item_first_tool_read",
        "turn_item_first_tool_read",
    )
    .await;

    core.append_external_runtime_events(
        "sess_item_first_tool_read",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool-web-fetch-1",
                    "toolName": "WebFetch"
                }),
            ),
            RuntimeEvent::new(
                "item.started",
                tool_item_event_payload(
                    "tool-web-fetch-1",
                    "thread_item_first_tool_read",
                    &turn.turn_id,
                    3,
                    "in_progress",
                    "WebFetch",
                    json!({ "url": "https://example.com/a" }),
                    None,
                    None,
                ),
            ),
            RuntimeEvent::new(
                "item.completed",
                tool_item_event_payload(
                    "tool-web-fetch-1",
                    "thread_item_first_tool_read",
                    &turn.turn_id,
                    3,
                    "completed",
                    "WebFetch",
                    json!({ "url": "https://example.com/a" }),
                    Some("fetched current item result"),
                    Some(true),
                ),
            ),
            RuntimeEvent::new(
                "tool.failed",
                json!({
                    "toolCallId": "tool-web-fetch-1",
                    "toolName": "WebFetch",
                    "error": "legacy terminal arrived late"
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append item lifecycle events");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_item_first_tool_read".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let tool_calls = detail["thread_read"]["tool_calls"]
        .as_array()
        .expect("tool calls");
    assert_eq!(
        tool_calls
            .iter()
            .filter(|call| call["id"] == "tool-web-fetch-1")
            .count(),
        1
    );
    let tool_call = tool_calls
        .iter()
        .find(|call| call["id"] == "tool-web-fetch-1")
        .expect("tool call");
    assert_eq!(tool_call["status"], "completed");
    assert_eq!(tool_call["success"], true);
    assert_eq!(tool_call["output_preview"], "fetched current item result");
    assert_eq!(
        tool_call["diagnostics"]["status_conflicts"][0]["ignored_status"],
        "failed"
    );

    let items = detail["items"].as_array().expect("items");
    assert_eq!(
        items
            .iter()
            .filter(|item| item["id"] == "tool-web-fetch-1" && item["type"] == "tool_call")
            .count(),
        1
    );
    let item = items
        .iter()
        .find(|item| item["id"] == "tool-web-fetch-1")
        .expect("tool item");
    assert_eq!(item["status"], "completed");
    assert_eq!(item["output"], "fetched current item result");
}

#[tokio::test]
async fn read_session_keeps_legacy_only_tool_events_as_synthetic_items() {
    let (core, turn) = start_read_model_test_turn(
        "sess_legacy_tool_synthetic",
        "thread_legacy_tool_synthetic",
        "turn_legacy_tool_synthetic",
    )
    .await;

    core.append_external_runtime_events(
        "sess_legacy_tool_synthetic",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "legacy-search-1",
                    "toolName": "WebSearch",
                    "arguments": {
                        "query": "codex turn item lifecycle"
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "legacy-search-1",
                    "toolName": "WebSearch",
                    "success": true,
                    "outputPreview": "legacy search result"
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append legacy tool events");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_legacy_tool_synthetic".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let tool_calls = detail["thread_read"]["tool_calls"]
        .as_array()
        .expect("tool calls");
    let tool_call = tool_calls
        .iter()
        .find(|call| call["id"] == "legacy-search-1")
        .expect("legacy synthetic tool call");
    assert_eq!(tool_call["status"], "completed");
    assert_eq!(
        tool_call["metadata"]["source"].as_str(),
        Some("legacy_tool_event")
    );

    let items = detail["items"].as_array().expect("items");
    let item = items
        .iter()
        .find(|item| item["id"] == "legacy-search-1")
        .expect("legacy synthetic item");
    assert_eq!(item["type"], "web_search");
    assert_eq!(item["status"], "completed");
    assert_eq!(item["turn_id"], turn.turn_id);
    assert_eq!(item["query"], "codex turn item lifecycle");
    assert_eq!(item["metadata"]["source"], "legacy_tool_event");
}

#[tokio::test]
async fn read_session_projects_imported_web_search_tool_result_as_timeline_item() {
    let (core, turn) = start_read_model_test_turn(
        "sess_imported_web_search",
        "thread_imported_web_search",
        "turn_imported_web_search",
    )
    .await;

    core.append_external_runtime_events(
        "sess_imported_web_search",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "call_search",
                    "toolName": "web_search",
                    "name": "web_search",
                    "sourceClient": "codex",
                    "sourceEventType": "synthetic_tool_started",
                    "importedSynthetic": true
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "call_search",
                    "toolName": "web_search",
                    "name": "web_search",
                    "status": "completed",
                    "success": true,
                    "action": "search_query",
                    "result": "search_query",
                    "sourceClient": "codex",
                    "sourceEventType": "web_search_call"
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append imported web search");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_imported_web_search".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let items = detail["items"].as_array().expect("items");
    let item = items
        .iter()
        .find(|item| item["id"] == "call_search")
        .expect("imported web search item");
    assert_eq!(item["type"], "web_search");
    assert_eq!(item["turn_id"], turn.turn_id);
    assert_eq!(item["action"], "search_query");
    assert_eq!(item["status"], "completed");
}

#[tokio::test]
async fn read_session_does_not_downgrade_completed_item_with_late_item_update() {
    let (core, turn) = start_read_model_test_turn(
        "sess_item_terminal_priority",
        "thread_item_terminal_priority",
        "turn_item_terminal_priority",
    )
    .await;

    core.append_external_runtime_events(
        "sess_item_terminal_priority",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "item.completed",
                tool_item_event_payload(
                    "tool-read-1",
                    "thread_item_terminal_priority",
                    &turn.turn_id,
                    2,
                    "completed",
                    "read_file",
                    json!({ "path": "README.md" }),
                    Some("file contents"),
                    Some(true),
                ),
            ),
            RuntimeEvent::new(
                "item.updated",
                tool_item_event_payload(
                    "tool-read-1",
                    "thread_item_terminal_priority",
                    &turn.turn_id,
                    2,
                    "in_progress",
                    "read_file",
                    json!({ "path": "README.md" }),
                    None,
                    None,
                ),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append current item lifecycle events");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_item_terminal_priority".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let tool_call = detail["thread_read"]["tool_calls"]
        .as_array()
        .expect("tool calls")
        .iter()
        .find(|call| call["id"] == "tool-read-1")
        .cloned()
        .expect("tool-read-1 call");
    assert_eq!(tool_call["status"], "completed");
    assert_eq!(tool_call["output_preview"], "file contents");
}

#[tokio::test]
async fn read_session_projects_runtime_events_into_thread_read_artifacts() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_thread_read_artifacts".to_string()),
        thread_id: Some("thread_read_artifacts".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_thread_read_artifacts".to_string(),
                turn_id: Some("turn_thread_read_artifacts".to_string()),
                input: AgentInput {
                    text: "生成内容工厂产物".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;
    core.append_external_runtime_events(
        "sess_thread_read_artifacts",
        Some(&turn.turn_id),
        vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifact": {
                    "artifactId": "artifact-content-batch",
                    "path": ".lime/artifacts/content-batch.json",
                    "title": "Content Batch",
                    "kind": "content_factory.workspace_patch",
                    "status": "ready",
                    "metadata": {
                        "contentFactoryWorkspacePatch": {
                            "kind": "content_batch",
                            "contentBatch": {
                                "count": 1
                            }
                        }
                    }
                }
            }),
        )],
    )
    .expect("append artifact event");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_thread_read_artifacts".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let artifacts = detail["thread_read"]["artifacts"]
        .as_array()
        .expect("thread read artifacts");

    assert_eq!(artifacts.len(), 1);
    assert_eq!(detail["artifacts"], detail["thread_read"]["artifacts"]);
    assert_eq!(artifacts[0]["artifactRef"], "artifact-content-batch");
    assert_eq!(artifacts[0]["path"], ".lime/artifacts/content-batch.json");
    assert_eq!(artifacts[0]["kind"], "content_factory.workspace_patch");
    assert_eq!(artifacts[0]["status"], "ready");
    assert_eq!(
        artifacts[0]["metadata"]["contentFactoryWorkspacePatch"]["kind"],
        "content_batch"
    );
    assert!(artifacts[0]["content"].is_null());
    assert_eq!(artifacts[0]["contentStatus"], "notRequested");
}
