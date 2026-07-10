use super::*;
use app_server_protocol::{AgentEvent, AgentSession, AgentTurn, AgentTurnStatus};
use serde_json::json;

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
