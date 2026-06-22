use super::*;

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
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "call_mcp_docs",
                    "toolName": "mcp__docs__search_docs",
                    "arguments": {
                        "query": "mcp structured content"
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "call_mcp_docs",
                    "toolName": "mcp__docs__search_docs",
                    "success": true,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": "docs found"
                            }
                        ],
                        "structuredContent": {
                            "answer": "ok",
                            "ids": ["doc-1"]
                        },
                        "isError": false
                    }
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
    let mcp_docs = tool_calls
        .iter()
        .find(|call| call["id"] == "call_mcp_docs")
        .expect("mcp docs call");
    assert_eq!(mcp_docs["tool_name"], "mcp__docs__search_docs");
    assert_eq!(mcp_docs["status"], "completed");
    assert_eq!(mcp_docs["success"], true);
    assert_eq!(mcp_docs["structured_content"]["answer"], "ok");
    assert_eq!(mcp_docs["structured_content"]["ids"][0], "doc-1");
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
