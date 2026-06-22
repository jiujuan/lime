use super::*;

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
