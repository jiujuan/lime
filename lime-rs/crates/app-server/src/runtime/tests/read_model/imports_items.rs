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
                "item.started",
                canonical_tool_item_event_payload(
                    "sess_imported_web_search",
                    "call_search",
                    "thread_imported_web_search",
                    &turn.turn_id,
                    1,
                    "inProgress",
                    "web_search",
                    json!({
                        "action": "search_query",
                        "query": "codex imported query"
                    }),
                    None,
                ),
            ),
            RuntimeEvent::new(
                "item.completed",
                canonical_tool_item_event_payload(
                    "sess_imported_web_search",
                    "call_search",
                    "thread_imported_web_search",
                    &turn.turn_id,
                    1,
                    "completed",
                    "web_search",
                    json!({}),
                    Some(json!({
                        "text": "codex imported query",
                        "structured_content": {
                            "type": "search_query",
                            "query": "codex imported query"
                        }
                    })),
                ),
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
async fn read_session_preserves_canonical_tool_sequence_around_reasoning_item() {
    let (core, turn) = start_read_model_test_turn(
        "sess_canonical_item_sequence",
        "thread_canonical_item_sequence",
        "turn_canonical_item_sequence",
    )
    .await;

    core.append_external_runtime_events(
        "sess_canonical_item_sequence",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "item.started",
                canonical_tool_item_event_payload(
                    "sess_canonical_item_sequence",
                    "tool-search-sequence",
                    "thread_canonical_item_sequence",
                    &turn.turn_id,
                    3,
                    "inProgress",
                    "WebSearch",
                    json!({ "query": "Lime WebSearch rendering" }),
                    None,
                ),
            ),
            RuntimeEvent::new(
                "item.completed",
                canonical_tool_item_event_payload(
                    "sess_canonical_item_sequence",
                    "tool-search-sequence",
                    "thread_canonical_item_sequence",
                    &turn.turn_id,
                    3,
                    "completed",
                    "WebSearch",
                    json!({ "query": "Lime WebSearch rendering" }),
                    Some(json!({ "text": "search result" })),
                ),
            ),
            RuntimeEvent::new(
                "item.updated",
                json!({
                    "item": {
                        "id": "reasoning-sequence",
                        "thread_id": "thread_canonical_item_sequence",
                        "turn_id": turn.turn_id,
                        "sequence": 5,
                        "type": "reasoning",
                        "text": "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
                        "status": "in_progress",
                        "started_at": "2026-06-20T11:00:00.500Z",
                        "updated_at": "2026-06-20T11:00:00.800Z"
                    }
                }),
            ),
            RuntimeEvent::new(
                "item.started",
                canonical_tool_item_event_payload(
                    "sess_canonical_item_sequence",
                    "tool-fetch-sequence",
                    "thread_canonical_item_sequence",
                    &turn.turn_id,
                    6,
                    "inProgress",
                    "WebFetch",
                    json!({ "url": "https://example.com/lime-websearch-rendering" }),
                    None,
                ),
            ),
            RuntimeEvent::new(
                "item.completed",
                canonical_tool_item_event_payload(
                    "sess_canonical_item_sequence",
                    "tool-fetch-sequence",
                    "thread_canonical_item_sequence",
                    &turn.turn_id,
                    6,
                    "completed",
                    "WebFetch",
                    json!({ "url": "https://example.com/lime-websearch-rendering" }),
                    Some(json!({ "text": "fetched page" })),
                ),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append canonical item lifecycle events");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_canonical_item_sequence".to_string(),
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
        ],
        "{items:#?}"
    );
    assert_eq!(
        items
            .iter()
            .find(|item| item["id"] == "tool-search-sequence")
            .expect("search item")["sequence"],
        3
    );
    assert_eq!(
        items
            .iter()
            .find(|item| item["id"] == "reasoning-sequence")
            .expect("reasoning item")["sequence"],
        5
    );
    assert_eq!(
        items
            .iter()
            .find(|item| item["id"] == "tool-fetch-sequence")
            .expect("fetch item")["sequence"],
        6
    );
}

#[allow(clippy::too_many_arguments)]
fn canonical_tool_item_event_payload(
    session_id: &str,
    item_id: &str,
    thread_id: &str,
    turn_id: &str,
    sequence: u64,
    status: &str,
    tool_name: &str,
    arguments: serde_json::Value,
    output: Option<serde_json::Value>,
) -> serde_json::Value {
    let arguments = match arguments {
        serde_json::Value::Object(arguments) => arguments
            .into_iter()
            .map(|(name, value)| {
                json!({
                    "name": name,
                    "value": value.as_str().map(str::to_string).unwrap_or_else(|| value.to_string())
                })
            })
            .collect::<Vec<_>>(),
        serde_json::Value::Array(arguments) => arguments,
        serde_json::Value::Null => Vec::new(),
        value => vec![json!({ "name": "value", "value": value.to_string() })],
    };
    let terminal = matches!(status, "completed" | "failed" | "interrupted" | "cancelled");
    json!({
        "item": {
            "sessionId": session_id,
            "threadId": thread_id,
            "turnId": turn_id,
            "itemId": format!("item_{item_id}"),
            "sequence": sequence,
            "ordinal": sequence,
            "createdAtMs": 1_784_000_000_000_i64,
            "updatedAtMs": 1_784_000_000_000_i64 + sequence as i64,
            "completedAtMs": terminal.then_some(1_784_000_000_000_i64 + sequence as i64),
            "kind": "tool",
            "status": status,
            "payload": {
                "type": "tool",
                "call_id": item_id,
                "name": tool_name,
                "arguments": arguments,
                "output": output
            },
            "metadata": {
                "source": "native_item_runtime"
            }
        }
    })
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
