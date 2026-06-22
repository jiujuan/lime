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
        .read_session_projection("sess_1")
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
