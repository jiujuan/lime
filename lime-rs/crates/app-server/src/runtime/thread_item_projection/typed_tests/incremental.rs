use super::super::materializer::IncrementalMaterializer;
use super::{event, materialize_events};
use serde_json::json;

#[test]
fn incremental_item_snapshot_matches_full_history_materialization() {
    let first = event(
        "event-1",
        1,
        "message.delta",
        "turn-1",
        json!({"itemId": "msg-1", "role": "assistant", "text": "hel"}),
    );
    let second = event(
        "event-2",
        2,
        "message.delta",
        "turn-1",
        json!({"itemId": "msg-1", "role": "assistant", "text": "hello"}),
    );
    let expected = materialize_events(&[first.clone(), second.clone()], "session-1", "thread-1")
        .expect("full history materialization");

    let mut incremental = IncrementalMaterializer::from_events(&[], "session-1", "thread-1")
        .expect("incremental materializer");
    incremental.apply(&first).expect("first event");
    let entities = incremental.apply(&second).expect("second event");

    assert_eq!(entities.item.as_ref(), expected.changed_items.first());
    assert_eq!(entities.turn.as_ref(), expected.changed_turns.first());
}

#[test]
fn incremental_materializer_does_not_revive_removed_item_identity() {
    let started = event(
        "event-started",
        1,
        "item.started",
        "turn-1",
        json!({"item": {"id": "agent-1", "type": "agent_message", "text": "hello"}}),
    );
    let removed = event(
        "event-removed",
        2,
        "item.removed",
        "turn-1",
        json!({"itemId": "agent-1"}),
    );
    let completed = event(
        "event-completed",
        3,
        "item.completed",
        "turn-1",
        json!({"item": {"id": "agent-1", "type": "agent_message", "text": "late"}}),
    );
    let expected = materialize_events(
        &[started.clone(), removed.clone(), completed.clone()],
        "session-1",
        "thread-1",
    )
    .expect("full history materialization");

    let mut incremental =
        IncrementalMaterializer::from_events(&[started, removed], "session-1", "thread-1")
            .expect("incremental materializer");
    let entities = incremental.apply(&completed).expect("late item event");

    assert!(expected.changed_items.is_empty());
    assert!(entities.item.is_none());
}
