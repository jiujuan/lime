use super::projection_payload_summary::{bounded_payload_summary, PAYLOAD_TEXT_SUMMARY_MAX_BYTES};
use super::projection_store::*;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentTurnStatus;
use serde_json::json;

fn event(
    sequence: u64,
    event_type: &str,
    session_id: &str,
    thread_id: &str,
    turn_id: Option<&str>,
) -> AgentEvent {
    AgentEvent {
        event_id: format!("evt-{sequence}"),
        sequence,
        session_id: session_id.to_string(),
        thread_id: Some(thread_id.to_string()),
        turn_id: turn_id.map(str::to_string),
        event_type: event_type.to_string(),
        timestamp: "2026-06-14T00:00:00.000Z".to_string(),
        payload: json!({ "text": format!("hello-{sequence}") }),
    }
}

#[test]
fn apply_event_updates_session_turn_item_and_watermark() {
    let temp = tempfile::tempdir().expect("tempdir");
    let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
        .expect("projection store");
    let event = event(1, "turn.accepted", "sess_1", "thread_1", Some("turn_1"));

    projection.apply_event(&event).expect("apply event");

    let session = projection
        .read_session("sess_1")
        .expect("read projection")
        .expect("session");
    assert_eq!(session.session_id, "sess_1");
    assert_eq!(session.thread_id, "thread_1");
    assert_eq!(session.status, "running");
    assert_eq!(session.last_event_sequence, 1);
}

#[test]
fn apply_events_updates_projection_in_one_batch() {
    let temp = tempfile::tempdir().expect("tempdir");
    let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
        .expect("projection store");
    let accepted = event(1, "turn.accepted", "sess_1", "thread_1", Some("turn_1"));
    let message = event(2, "message.completed", "sess_1", "thread_1", Some("turn_1"));
    let completed = event(3, "turn.completed", "sess_1", "thread_1", Some("turn_1"));

    let count = projection
        .apply_events(&[accepted, message, completed])
        .expect("apply events");

    assert_eq!(count, 3);
    let session = projection
        .read_session_projection("sess_1", ProjectionReadWindow::default())
        .expect("read projection")
        .expect("session");
    assert_eq!(session.session.session_id, "sess_1");
    assert_eq!(session.session.status, AgentSessionStatus::Completed);
    assert_eq!(session.turns.len(), 1);
    assert_eq!(session.turns[0].status, AgentTurnStatus::Completed);
    assert_eq!(session.item_count, 3);
    assert_eq!(session.last_event_sequence, 3);
    let watermark = projection
        .read_watermark("sess_1")
        .expect("read watermark")
        .expect("watermark");
    assert_eq!(watermark.last_sequence, 3);
}

#[test]
fn clear_session_removes_projected_rows() {
    let temp = tempfile::tempdir().expect("tempdir");
    let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
        .expect("projection store");
    let event = event(1, "turn.accepted", "sess_1", "thread_1", Some("turn_1"));

    projection.apply_event(&event).expect("apply event");
    assert!(projection
        .read_session("sess_1")
        .expect("read session")
        .is_some());

    projection.clear_session("sess_1").expect("clear session");
    assert!(projection
        .read_session("sess_1")
        .expect("read session")
        .is_none());
}

#[test]
fn repair_session_replays_events_after_clear() {
    let temp = tempfile::tempdir().expect("tempdir");
    let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
        .expect("projection store");
    let accepted = event(1, "turn.accepted", "sess_1", "thread_1", Some("turn_1"));
    let completed = event(2, "turn.completed", "sess_1", "thread_1", Some("turn_1"));

    projection.apply_event(&accepted).expect("apply accepted");
    projection.clear_session("sess_1").expect("clear session");
    projection
        .repair_session("sess_1", &[accepted, completed])
        .expect("repair session");

    let session = projection
        .read_session("sess_1")
        .expect("read session")
        .expect("session");
    assert_eq!(session.status, "completed");
    assert_eq!(session.last_event_sequence, 2);
}

#[test]
fn repair_session_with_empty_event_log_clears_stale_projection() {
    let temp = tempfile::tempdir().expect("tempdir");
    let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
        .expect("projection store");
    let event = event(1, "turn.accepted", "sess_1", "thread_1", Some("turn_1"));

    projection.apply_event(&event).expect("apply event");
    let count = projection
        .repair_session("sess_1", &[])
        .expect("repair empty session");

    assert_eq!(count, 0);
    assert!(projection
        .read_session("sess_1")
        .expect("read session")
        .is_none());
}

#[test]
fn bounded_payload_summary_truncates_multibyte_text_on_char_boundary() {
    let text = format!("{}服务流程", "a".repeat(PAYLOAD_TEXT_SUMMARY_MAX_BYTES - 1));
    let summary = bounded_payload_summary(&json!({ "text": text }));
    let value: serde_json::Value =
        serde_json::from_str(&summary).expect("summary should stay valid JSON");
    let truncated = value["text"].as_str().expect("truncated text");

    assert!(truncated.ends_with("..."));
    assert!(truncated.len() <= PAYLOAD_TEXT_SUMMARY_MAX_BYTES + 3);
    assert!(!truncated.contains("服"));
}

#[test]
fn apply_event_stores_multibyte_long_text_summary_without_panic() {
    let temp = tempfile::tempdir().expect("tempdir");
    let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
        .expect("projection store");
    let mut event = event(1, "message.delta", "sess_1", "thread_1", Some("turn_1"));
    event.payload = json!({
        "text": format!("{}服务流程", "a".repeat(PAYLOAD_TEXT_SUMMARY_MAX_BYTES - 1)),
    });

    projection.apply_event(&event).expect("apply event");

    let summary = projection
        .read_item_summary_for_test("evt-1")
        .expect("read item summary")
        .expect("item summary");
    let value: serde_json::Value =
        serde_json::from_str(&summary).expect("summary should stay valid JSON");
    assert!(value["text"].as_str().expect("text").ends_with("..."));
}

#[test]
fn read_session_projection_groups_message_deltas_by_turn() {
    let temp = tempfile::tempdir().expect("tempdir");
    let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
        .expect("projection store");
    let mut user = event(1, "message.created", "sess_1", "thread_1", Some("turn_1"));
    user.payload = json!({
        "input": {
            "text": "你好",
            "attachments": []
        }
    });
    let mut delta_1 = event(2, "message.delta", "sess_1", "thread_1", Some("turn_1"));
    delta_1.payload = json!({ "text": "你" });
    let mut delta_2 = event(3, "message.delta", "sess_1", "thread_1", Some("turn_1"));
    delta_2.payload = json!({ "text": "好" });

    projection
        .apply_events(&[user, delta_1, delta_2])
        .expect("apply events");

    let session = projection
        .read_session_projection("sess_1", ProjectionReadWindow::tail(Some(10)))
        .expect("read projection")
        .expect("session");
    assert_eq!(session.messages_count, 2);
    assert_eq!(session.messages.len(), 2);
    assert_eq!(session.messages[0]["role"].as_str(), Some("user"));
    assert_eq!(session.messages[1]["role"].as_str(), Some("assistant"));
    assert_eq!(
        session.messages[1]["content"][0]["text"].as_str(),
        Some("你好")
    );
    assert_eq!(
        session.messages[1]["metadata"]["source_event_count"].as_u64(),
        Some(2)
    );
    assert!(session.messages[1]["timestamp"].as_f64().is_some());
}

#[test]
fn read_session_projection_tail_keeps_multiple_turns_when_last_turn_has_many_deltas() {
    let temp = tempfile::tempdir().expect("tempdir");
    let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
        .expect("projection store");
    let mut events = Vec::new();
    for turn_index in 0..3 {
        let base = (turn_index * 100) as u64;
        let turn_id = format!("turn_{turn_index}");
        let mut user = event(
            base + 1,
            "message.created",
            "sess_1",
            "thread_1",
            Some(turn_id.as_str()),
        );
        user.payload = json!({
            "input": {
                "text": format!("user-{turn_index}"),
                "attachments": []
            }
        });
        events.push(user);
        for delta_index in 0..80 {
            let mut delta = event(
                base + 2 + delta_index,
                "message.delta",
                "sess_1",
                "thread_1",
                Some(turn_id.as_str()),
            );
            delta.payload = json!({ "text": format!("{turn_index}{}", "x".repeat(30)) });
            events.push(delta);
        }
    }
    projection.apply_events(&events).expect("apply events");

    let session = projection
        .read_session_projection("sess_1", ProjectionReadWindow::tail(Some(6)))
        .expect("read projection")
        .expect("session");

    assert_eq!(session.messages_count, 6);
    assert_eq!(session.messages_start_index, 0);
    assert_eq!(session.messages.len(), 6);
    assert_eq!(
        session.messages[0]["content"][0]["text"].as_str(),
        Some("user-0")
    );
    assert_eq!(session.messages[5]["role"].as_str(), Some("assistant"));
    assert_eq!(
        session.messages[5]["content"][0]["text"]
            .as_str()
            .expect("assistant text")
            .chars()
            .count(),
        2001
    );
    assert_eq!(
        session.messages[5]["content"][0]["text"]
            .as_str()
            .expect("assistant text")
            .len(),
        2003
    );
    assert!(session.messages[5]["content"][0]["text"]
        .as_str()
        .expect("assistant text")
        .ends_with('…'));
}

#[test]
fn read_session_projection_pages_messages_with_offset_and_cursor() {
    let temp = tempfile::tempdir().expect("tempdir");
    let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
        .expect("projection store");
    let mut events = Vec::new();
    for turn_index in 0..4 {
        let base = (turn_index * 10) as u64;
        let turn_id = format!("turn_{turn_index}");
        let mut user = event(
            base + 1,
            "message.created",
            "sess_1",
            "thread_1",
            Some(turn_id.as_str()),
        );
        user.payload = json!({
            "input": {
                "text": format!("user-{turn_index}"),
                "attachments": []
            }
        });
        let mut delta = event(
            base + 2,
            "message.delta",
            "sess_1",
            "thread_1",
            Some(turn_id.as_str()),
        );
        delta.payload = json!({ "text": format!("assistant-{turn_index}") });
        events.push(user);
        events.push(delta);
    }
    projection.apply_events(&events).expect("apply events");

    let tail = projection
        .read_session_projection("sess_1", ProjectionReadWindow::tail(Some(2)))
        .expect("read tail")
        .expect("tail session");
    assert_eq!(tail.messages_count, 8);
    assert_eq!(tail.messages_start_index, 6);
    assert_eq!(
        tail.messages[0]["content"][0]["text"].as_str(),
        Some("user-3")
    );
    assert_eq!(
        tail.messages[1]["content"][0]["text"].as_str(),
        Some("assistant-3")
    );

    let offset_page = projection
        .read_session_projection(
            "sess_1",
            ProjectionReadWindow {
                history_limit: Some(2),
                history_offset: 2,
                history_before_message_id: None,
            },
        )
        .expect("read offset page")
        .expect("offset session");
    assert_eq!(offset_page.messages_start_index, 4);
    assert_eq!(
        offset_page.messages[0]["content"][0]["text"].as_str(),
        Some("user-2")
    );
    assert_eq!(
        offset_page.messages[1]["content"][0]["text"].as_str(),
        Some("assistant-2")
    );

    let cursor_page = projection
        .read_session_projection(
            "sess_1",
            ProjectionReadWindow {
                history_limit: Some(2),
                history_offset: 0,
                history_before_message_id: Some(31),
            },
        )
        .expect("read cursor page")
        .expect("cursor session");
    assert_eq!(cursor_page.messages_start_index, 4);
    assert_eq!(
        cursor_page.messages[0]["content"][0]["text"].as_str(),
        Some("user-2")
    );
    assert_eq!(
        cursor_page.messages[1]["content"][0]["text"].as_str(),
        Some("assistant-2")
    );
}

#[test]
fn read_session_projection_cursor_page_keeps_large_previous_assistant_summary() {
    let temp = tempfile::tempdir().expect("tempdir");
    let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
        .expect("projection store");
    let mut events = Vec::new();
    let mut first_user = event(1, "message.created", "sess_1", "thread_1", Some("turn_1"));
    first_user.payload = json!({
        "input": {
            "text": "user-1",
            "attachments": []
        }
    });
    events.push(first_user);
    for delta_index in 0..5_000 {
        let mut delta = event(
            2 + delta_index,
            "message.delta",
            "sess_1",
            "thread_1",
            Some("turn_1"),
        );
        delta.payload = json!({ "text": "长" });
        events.push(delta);
    }
    let mut second_user = event(
        6_000,
        "message.created",
        "sess_1",
        "thread_1",
        Some("turn_2"),
    );
    second_user.payload = json!({
        "input": {
            "text": "user-2",
            "attachments": []
        }
    });
    events.push(second_user);
    let mut second_delta = event(6_001, "message.delta", "sess_1", "thread_1", Some("turn_2"));
    second_delta.payload = json!({ "text": "assistant-2" });
    events.push(second_delta);
    projection.apply_events(&events).expect("apply events");

    let page = projection
        .read_session_projection(
            "sess_1",
            ProjectionReadWindow {
                history_limit: Some(2),
                history_offset: 0,
                history_before_message_id: Some(6_000),
            },
        )
        .expect("read cursor page")
        .expect("cursor session");

    assert_eq!(page.messages_count, 4);
    assert_eq!(page.messages_start_index, 0);
    assert_eq!(page.messages.len(), 2);
    assert_eq!(
        page.messages[0]["content"][0]["text"].as_str(),
        Some("user-1")
    );
    let assistant_text = page.messages[1]["content"][0]["text"]
        .as_str()
        .expect("assistant text");
    assert_eq!(assistant_text.chars().count(), 2001);
    assert!(assistant_text.ends_with('…'));
    assert_eq!(
        page.messages[1]["metadata"]["source_event_count"].as_u64(),
        Some(5_000)
    );
}
