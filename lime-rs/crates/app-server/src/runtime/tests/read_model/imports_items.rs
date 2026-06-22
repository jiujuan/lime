use super::*;

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
                    "action": {
                        "type": "search_query",
                        "query": "codex imported query"
                    },
                    "query": "codex imported query",
                    "arguments": {
                        "action": {
                            "type": "search_query",
                            "query": "codex imported query"
                        },
                        "query": "codex imported query"
                    },
                    "result": {
                        "type": "search_query",
                        "query": "codex imported query"
                    },
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
    assert_eq!(item["query"], "codex imported query");
    assert_eq!(item["status"], "completed");
    assert!(!item["action"].to_string().contains("codex imported query"));
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
async fn read_session_preserves_current_tool_item_sequence_when_legacy_events_merge() {
    let (core, turn) = start_read_model_test_turn(
        "sess_tool_item_sequence_merge",
        "thread_tool_item_sequence_merge",
        "turn_tool_item_sequence_merge",
    )
    .await;

    core.append_external_runtime_events(
        "sess_tool_item_sequence_merge",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool-search-sequence",
                    "toolName": "WebSearch",
                    "arguments": { "query": "Lime WebSearch rendering" }
                }),
            ),
            RuntimeEvent::new(
                "item.completed",
                tool_item_event_payload(
                    "tool-search-sequence",
                    "thread_tool_item_sequence_merge",
                    &turn.turn_id,
                    2,
                    "completed",
                    "WebSearch",
                    json!({ "query": "Lime WebSearch rendering" }),
                    Some("search result"),
                    Some(true),
                ),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "tool-search-sequence",
                    "toolName": "WebSearch",
                    "success": true,
                    "outputPreview": "search result"
                }),
            ),
            RuntimeEvent::new(
                "item.updated",
                json!({
                    "item": {
                        "id": "reasoning-sequence",
                        "thread_id": "thread_tool_item_sequence_merge",
                        "turn_id": turn.turn_id,
                        "sequence": 3,
                        "type": "reasoning",
                        "text": "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
                        "status": "in_progress",
                        "started_at": "2026-06-20T11:00:00.500Z",
                        "updated_at": "2026-06-20T11:00:00.800Z"
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool-fetch-sequence",
                    "toolName": "WebFetch",
                    "arguments": { "url": "https://example.com/lime-websearch-rendering" }
                }),
            ),
            RuntimeEvent::new(
                "item.completed",
                tool_item_event_payload(
                    "tool-fetch-sequence",
                    "thread_tool_item_sequence_merge",
                    &turn.turn_id,
                    4,
                    "completed",
                    "WebFetch",
                    json!({ "url": "https://example.com/lime-websearch-rendering" }),
                    Some("fetched page"),
                    Some(true),
                ),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "tool-fetch-sequence",
                    "toolName": "WebFetch",
                    "success": true,
                    "outputPreview": "fetched page"
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append mixed tool item and legacy events");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_tool_item_sequence_merge".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let items = detail["items"].as_array().expect("items");
    let ordered_ids = items
        .iter()
        .filter_map(|item| {
            let id = item["id"].as_str()?;
            matches!(
                id,
                "tool-search-sequence" | "reasoning-sequence" | "tool-fetch-sequence"
            )
            .then_some(id)
        })
        .collect::<Vec<_>>();

    assert_eq!(
        ordered_ids,
        vec![
            "tool-search-sequence",
            "reasoning-sequence",
            "tool-fetch-sequence"
        ]
    );
    assert_eq!(
        items
            .iter()
            .find(|item| item["id"] == "tool-search-sequence")
            .expect("search item")["sequence"],
        2
    );
    assert_eq!(
        items
            .iter()
            .find(|item| item["id"] == "tool-fetch-sequence")
            .expect("fetch item")["sequence"],
        4
    );
}

#[tokio::test]
async fn read_session_projects_item_lifecycle_reasoning_into_thread_items() {
    let (core, turn) = start_read_model_test_turn(
        "sess_item_reasoning",
        "thread_item_reasoning",
        "turn_item_reasoning",
    )
    .await;

    core.append_external_runtime_events(
        "sess_item_reasoning",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "item.updated",
                json!({
                    "item": {
                        "id": "reasoning-web-tools",
                        "thread_id": "thread_item_reasoning",
                        "turn_id": turn.turn_id,
                        "sequence": 3,
                        "type": "reasoning",
                        "text": "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
                        "status": "in_progress",
                        "started_at": "2026-06-20T11:00:00.500Z",
                        "updated_at": "2026-06-20T11:00:00.800Z"
                    }
                }),
            ),
            RuntimeEvent::new(
                "item.completed",
                json!({
                    "item": {
                        "id": "reasoning-web-tools",
                        "thread_id": "thread_item_reasoning",
                        "turn_id": turn.turn_id,
                        "sequence": 3,
                        "type": "reasoning",
                        "status": "completed",
                        "started_at": "2026-06-20T11:00:00.500Z",
                        "updated_at": "2026-06-20T11:00:01.200Z",
                        "completed_at": "2026-06-20T11:00:01.200Z"
                    }
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append reasoning item lifecycle events");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_item_reasoning".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let items = detail["items"].as_array().expect("items");
    assert_eq!(
        items
            .iter()
            .filter(|item| item["id"] == "reasoning-web-tools")
            .count(),
        1
    );
    let reasoning = items
        .iter()
        .find(|item| item["id"] == "reasoning-web-tools")
        .expect("reasoning item");
    assert_eq!(reasoning["type"], "reasoning");
    assert_eq!(reasoning["status"], "completed");
    assert_eq!(reasoning["turn_id"], turn.turn_id);
    assert_eq!(
        reasoning["text"],
        "搜索结果还需要继续筛掉广告软文，我先读取有效来源。"
    );
    assert_eq!(reasoning["completed_at"], "2026-06-20T11:00:01.200Z");
}
