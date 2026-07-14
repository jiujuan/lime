use super::*;
use agent_protocol::{
    ItemId, ItemStatus, SessionId, SubAgentActivityKind, Thread, ThreadHistoryChangeSet, ThreadId,
    ThreadItem, ThreadItemPayload, ThreadStatus, ThreadTurnsView, Turn, TurnAdmissionState,
    TurnApprovalState, TurnId, TurnItemsView, TurnQueueState, TurnStatus,
};
use app_server_protocol::{AgentEvent, AgentSession, AgentTurn, AgentTurnStatus};
use futures::executor::block_on;
use serde_json::json;
use thread_store::{ApplyThreadHistoryParams, CreateThreadParams, ThreadStore};

fn stored_running_session(started_at: &str, latest_event_at: &str) -> StoredSession {
    let session_id = "sess_read_model_orphan_running".to_string();
    let thread_id = "thread_read_model_orphan_running".to_string();
    let turn_id = "turn_read_model_orphan_running".to_string();
    StoredSession {
        session: AgentSession {
            session_id: session_id.clone(),
            thread_id: thread_id.clone(),
            app_id: "agent-chat".to_string(),
            workspace_id: Some("workspace-current".to_string()),
            business_object_ref: None,
            status: app_server_protocol::AgentSessionStatus::Running,
            created_at: started_at.to_string(),
            updated_at: latest_event_at.to_string(),
        },
        turns: vec![AgentTurn {
            turn_id: turn_id.clone(),
            session_id: session_id.clone(),
            thread_id: thread_id.clone(),
            status: AgentTurnStatus::Running,
            started_at: Some(started_at.to_string()),
            completed_at: None,
        }],
        turn_inputs: std::collections::HashMap::new(),
        turn_runtime_options: std::collections::HashMap::new(),
        events: vec![AgentEvent {
            event_id: "event-read-model-running".to_string(),
            sequence: 1,
            session_id,
            thread_id: Some(thread_id),
            turn_id: Some(turn_id),
            event_type: "turn.started".to_string(),
            timestamp: latest_event_at.to_string(),
            payload: json!({}),
        }],
        output_blobs: std::collections::HashMap::new(),
    }
}

#[test]
fn thread_read_downgrades_stale_orphan_running_turn() {
    let stored = stored_running_session("2026-03-29T00:00:00.000Z", "2026-03-29T00:00:01.000Z");

    let thread_read =
        runtime_thread_read_from_stored_session_with_usage_events(&stored, None, Vec::new(), &[]);

    assert_eq!(thread_read["status"], "idle");
    assert_eq!(thread_read["active_turn_id"], serde_json::Value::Null);
    assert_eq!(thread_read["diagnostics"]["latest_turn_status"], "running");
}

#[test]
fn thread_read_keeps_recent_running_turn_active() {
    let now = chrono::Utc::now().to_rfc3339();
    let stored = stored_running_session(now.as_str(), now.as_str());

    let thread_read =
        runtime_thread_read_from_stored_session_with_usage_events(&stored, None, Vec::new(), &[]);

    assert_eq!(thread_read["status"], "running");
    assert_eq!(
        thread_read["active_turn_id"],
        "turn_read_model_orphan_running"
    );
}

#[test]
fn read_detail_projects_thread_items_into_thread_read() {
    let session_id = "sess_read_model_thread_items".to_string();
    let thread_id = "thread_read_model_thread_items".to_string();
    let turn_id = "turn_read_model_thread_items".to_string();
    let stored = StoredSession {
        session: AgentSession {
            session_id: session_id.clone(),
            thread_id: thread_id.clone(),
            app_id: "agent-chat".to_string(),
            workspace_id: Some("workspace-current".to_string()),
            business_object_ref: None,
            status: app_server_protocol::AgentSessionStatus::Completed,
            created_at: "2026-03-29T00:00:00.000Z".to_string(),
            updated_at: "2026-03-29T00:00:02.000Z".to_string(),
        },
        turns: vec![AgentTurn {
            turn_id: turn_id.clone(),
            session_id: session_id.clone(),
            thread_id: thread_id.clone(),
            status: AgentTurnStatus::Completed,
            started_at: Some("2026-03-29T00:00:00.000Z".to_string()),
            completed_at: Some("2026-03-29T00:00:02.000Z".to_string()),
        }],
        turn_inputs: std::collections::HashMap::new(),
        turn_runtime_options: std::collections::HashMap::new(),
        events: vec![
            AgentEvent {
                event_id: "evt-read-model-user-message".to_string(),
                sequence: 0,
                session_id: session_id.clone(),
                thread_id: Some(thread_id.clone()),
                turn_id: Some(turn_id.clone()),
                event_type: "message.created".to_string(),
                timestamp: "2026-03-29T00:00:00.500Z".to_string(),
                payload: json!({
                    "role": "user",
                    "visibility": "user_visible",
                    "input": {
                        "text": "恢复历史用户输入",
                        "attachments": []
                    },
                    "content": {
                        "kind": "inline_text",
                        "text": "恢复历史用户输入"
                    },
                    "textElements": [
                        {
                            "type": "text",
                            "text": "保留富文本输入片段"
                        }
                    ],
                    "text_elements": [
                        {
                            "type": "text",
                            "text": "保留富文本输入片段"
                        }
                    ]
                }),
            },
            AgentEvent {
                event_id: "evt-read-model-reasoning-item".to_string(),
                sequence: 1,
                session_id,
                thread_id: Some(thread_id),
                turn_id: Some(turn_id),
                event_type: "item.started".to_string(),
                timestamp: "2026-03-29T00:00:01.000Z".to_string(),
                payload: json!({
                    "item": {
                        "id": "reasoning-read-model-thread-items",
                        "thread_id": "thread_read_model_thread_items",
                        "turn_id": "turn_read_model_thread_items",
                        "sequence": 1,
                        "status": "completed",
                        "type": "reasoning",
                        "text": "先恢复历史推理项",
                        "summary": ["先恢复历史推理项"]
                    }
                }),
            },
        ],
        output_blobs: std::collections::HashMap::new(),
    };

    let detail =
        runtime_session_read_detail_with_options(&stored, ReadDetailOptions::default(), &[]);

    assert_eq!(detail["items"], detail["thread_read"]["thread_items"]);
    assert_eq!(
        detail["thread_read"]["thread_items"][0]["id"],
        "reasoning-read-model-thread-items"
    );
    assert_eq!(
        detail["messages"][0]["textElements"][0]["text"],
        "保留富文本输入片段"
    );
    assert_eq!(
        detail["messages"][0]["text_elements"][0]["text"],
        "保留富文本输入片段"
    );
    assert!(detail["messages"][0]["content"]
        .as_array()
        .expect("message content")
        .iter()
        .any(|part| part["text"] == "保留富文本输入片段"));
}

#[test]
fn read_detail_prefers_canonical_thread_store_items_after_restart() {
    let temp = tempfile::tempdir().expect("tempdir");
    let database_path = temp.path().join("projection.sqlite");
    let projection_store = ProjectionStore::initialize(database_path.clone()).expect("store");
    let stored = stored_running_session("2026-03-29T00:00:00.000Z", "2026-03-29T00:00:01.000Z");
    let thread = Thread {
        session_id: SessionId::new(stored.session.session_id.clone()),
        thread_id: ThreadId::new(stored.session.thread_id.clone()),
        status: ThreadStatus::Idle,
        created_at_ms: 1,
        updated_at_ms: 2,
        archived: false,
        recency_at_ms: Some(2),
        parent_thread_id: None,
        agent_path: None,
        agent_nickname: None,
        agent_role: None,
        last_task_message: None,
        agent_state: None,
        forked_from_id: None,
        preview: String::new(),
        model_provider: "test".to_string(),
        product: None,
        name: None,
        metadata: json!({}),
        turns: Vec::new(),
        turns_view: ThreadTurnsView::NotLoaded,
    };
    block_on(projection_store.create_thread(CreateThreadParams {
        thread: thread.clone(),
    }))
    .expect("create thread");
    let turn = Turn {
        session_id: thread.session_id.clone(),
        thread_id: thread.thread_id.clone(),
        turn_id: TurnId::new("turn-read-model-canonical"),
        status: TurnStatus::Completed,
        admission: TurnAdmissionState::Accepted,
        queue: TurnQueueState::Running,
        approval: TurnApprovalState::NotRequired,
        items: Vec::new(),
        items_view: TurnItemsView::NotLoaded,
        error: None,
        created_at_ms: 1,
        updated_at_ms: 2,
        started_at_ms: Some(1),
        completed_at_ms: Some(2),
        duration_ms: Some(1),
    };
    let item = ThreadItem {
        session_id: thread.session_id.clone(),
        thread_id: thread.thread_id.clone(),
        turn_id: turn.turn_id.clone(),
        item_id: ItemId::new("message-read-model-canonical"),
        sequence: 2,
        ordinal: 1,
        created_at_ms: 1,
        updated_at_ms: 2,
        completed_at_ms: Some(2),
        kind: agent_protocol::ItemKind::AgentMessage,
        status: ItemStatus::Completed,
        payload: ThreadItemPayload::AgentMessage {
            text: "canonical item".to_string(),
            phase: None,
        },
        metadata: json!({}),
    };
    let subagent_item =
        |item_id: &str, sequence: u64, ordinal: u64, activity: SubAgentActivityKind| ThreadItem {
            session_id: thread.session_id.clone(),
            thread_id: thread.thread_id.clone(),
            turn_id: turn.turn_id.clone(),
            item_id: ItemId::new(item_id),
            sequence,
            ordinal,
            created_at_ms: sequence as i64,
            updated_at_ms: sequence as i64,
            completed_at_ms: Some(sequence as i64),
            kind: agent_protocol::ItemKind::SubAgent,
            status: ItemStatus::Completed,
            payload: ThreadItemPayload::SubAgent {
                child_thread_id: ThreadId::new("thread-child"),
                activity,
                detail: Some(format!("activity:{item_id}")),
            },
            metadata: json!({}),
        };
    let started = subagent_item("subagent-started", 3, 2, SubAgentActivityKind::Started);
    let interacted = subagent_item(
        "subagent-interacted",
        4,
        3,
        SubAgentActivityKind::Interacted,
    );
    let interrupted = subagent_item(
        "subagent-interrupted",
        5,
        4,
        SubAgentActivityKind::Interrupted,
    );
    block_on(projection_store.apply_history(ApplyThreadHistoryParams {
        session_id: thread.session_id.clone(),
        thread_id: thread.thread_id.clone(),
        changes: ThreadHistoryChangeSet {
            sequence: 5,
            changed_turns: vec![turn],
            changed_items: vec![item, started, interacted, interrupted],
            ..Default::default()
        },
    }))
    .expect("apply canonical history");
    drop(projection_store);
    let projection_store = ProjectionStore::initialize(database_path).expect("reopen store");

    let detail = block_on(runtime_session_read_detail_from_thread_store(
        &stored,
        ReadDetailOptions::default(),
        &[],
        &projection_store,
    ))
    .expect("canonical detail");

    assert_eq!(detail["items"], detail["thread_read"]["thread_items"]);
    assert_eq!(
        detail["items"][0]["id"],
        "item_message-read-model-canonical"
    );
    assert_eq!(detail["items"][0]["type"], "agent_message");
    assert_eq!(detail["items"][0]["status"], "completed");
    assert_eq!(detail["items"][0]["text"], "canonical item");
    assert_eq!(detail["items"][0]["started_at"], "1970-01-01T00:00:00.001Z");
    assert_ne!(detail["items"][0]["id"], "event-read-model-running");
    let activities = detail["items"]
        .as_array()
        .expect("items")
        .iter()
        .filter(|item| item["type"] == "subagent_activity")
        .map(|item| {
            assert_eq!(item["session_id"], "thread-child");
            assert_eq!(item["status"], "completed");
            (
                item["id"].as_str().expect("item id").to_string(),
                item["status_label"].as_str().expect("activity").to_string(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(
        activities,
        vec![
            ("item_subagent-started".to_string(), "started".to_string()),
            (
                "item_subagent-interacted".to_string(),
                "interacted".to_string()
            ),
            (
                "item_subagent-interrupted".to_string(),
                "interrupted".to_string()
            ),
        ]
    );
}
