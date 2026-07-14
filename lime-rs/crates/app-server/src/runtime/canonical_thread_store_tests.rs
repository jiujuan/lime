use agent_protocol::{
    ItemId, ItemStatus, SessionId, SortDirection, Thread, ThreadHistoryChangeSet, ThreadId,
    ThreadItem, ThreadItemPayload, ThreadStatus, ThreadTurnsView, Turn, TurnAdmissionState,
    TurnApprovalState, TurnId, TurnItemsView, TurnQueueState, TurnStatus,
};
use futures::executor::block_on;
use serde_json::json;
use std::collections::HashMap;
use thread_store::{
    ApplyThreadHistoryParams, ArchiveThreadParams, CreateThreadParams, ListItemsParams,
    ListThreadsParams, ListTurnsParams, PageRequest, ReadThreadParams, ThreadMetadataPatch,
    ThreadStore, UpdateThreadMetadataParams,
};

use super::{ProjectionStore, StoredSession};

fn store() -> (tempfile::TempDir, ProjectionStore) {
    let temp = tempfile::tempdir().expect("tempdir");
    let store = ProjectionStore::initialize(temp.path().join("projection.sqlite"))
        .expect("projection store");
    (temp, store)
}

fn thread(id: &str, updated_at_ms: i64) -> Thread {
    Thread {
        session_id: SessionId::new(format!("session-{id}")),
        thread_id: ThreadId::new(id),
        status: ThreadStatus::Idle,
        created_at_ms: updated_at_ms,
        updated_at_ms,
        archived: false,
        recency_at_ms: None,
        parent_thread_id: None,
        forked_from_id: None,
        preview: format!("preview-{id}"),
        model_provider: "test".to_string(),
        product: None,
        name: None,
        metadata: json!({}),
        turns: Vec::new(),
        turns_view: ThreadTurnsView::NotLoaded,
    }
}

fn turn(thread: &Thread, id: &str, status: TurnStatus) -> Turn {
    Turn {
        session_id: thread.session_id.clone(),
        thread_id: thread.thread_id.clone(),
        turn_id: TurnId::new(id),
        status,
        admission: TurnAdmissionState::Accepted,
        queue: TurnQueueState::Running,
        approval: TurnApprovalState::NotRequired,
        items: Vec::new(),
        items_view: TurnItemsView::NotLoaded,
        error: None,
        created_at_ms: 10,
        updated_at_ms: 10,
        started_at_ms: Some(10),
        completed_at_ms: status.is_terminal().then_some(11),
        duration_ms: status.is_terminal().then_some(1),
    }
}

fn item(thread: &Thread, turn_id: &str, id: &str, sequence: u64, ordinal: u64) -> ThreadItem {
    ThreadItem {
        session_id: thread.session_id.clone(),
        thread_id: thread.thread_id.clone(),
        turn_id: TurnId::new(turn_id),
        item_id: ItemId::new(id),
        sequence,
        ordinal,
        created_at_ms: sequence as i64,
        updated_at_ms: sequence as i64,
        completed_at_ms: Some(sequence as i64),
        kind: agent_protocol::ItemKind::AgentMessage,
        status: ItemStatus::Completed,
        payload: ThreadItemPayload::AgentMessage {
            text: id.to_string(),
            phase: None,
        },
        metadata: json!({}),
    }
}

fn create(store: &ProjectionStore, thread: &Thread) {
    block_on(store.create_thread(CreateThreadParams {
        thread: thread.clone(),
    }))
    .expect("create thread");
}

fn page(direction: SortDirection, limit: u32) -> PageRequest {
    PageRequest {
        cursor: None,
        limit,
        sort_direction: direction,
    }
}

#[test]
fn projection_store_is_the_canonical_thread_store_owner() {
    let (_temp, store) = store();
    let source = thread("thread-1", 1);
    create(&store, &source);

    let updated = block_on(store.update_thread_metadata(UpdateThreadMetadataParams {
        thread_id: source.thread_id.clone(),
        patch: ThreadMetadataPatch {
            name: Some(Some("renamed".to_string())),
            preview: Some("next".to_string()),
            advance_recency_at_ms: Some(9),
            metadata: Some(Some(json!({"source": "test"}))),
            ..Default::default()
        },
        include_archived: false,
    }))
    .expect("update metadata");
    assert_eq!(updated.name.as_deref(), Some("renamed"));
    assert_eq!(updated.preview, "next");
    assert_eq!(updated.recency_at_ms, Some(9));

    block_on(store.archive_thread(ArchiveThreadParams {
        thread_id: source.thread_id.clone(),
    }))
    .expect("archive");
    let archived = block_on(store.list_threads(ListThreadsParams {
        include_archived: true,
        page: page(SortDirection::Asc, 10),
    }))
    .expect("list archived threads");
    assert!(archived.data[0].archived);
    assert!(block_on(store.read_thread(ReadThreadParams {
        thread_id: source.thread_id.clone(),
        include_archived: false,
        turns_view: ThreadTurnsView::NotLoaded,
    }))
    .expect("read hidden archive")
    .is_none());
    let restored = block_on(store.unarchive_thread(ArchiveThreadParams {
        thread_id: source.thread_id.clone(),
    }))
    .expect("unarchive");
    assert!(!restored.archived);
    assert_eq!(restored.name.as_deref(), Some("renamed"));
}

#[test]
fn history_apply_is_typed_atomic_idempotent_and_rollback_capable() {
    let (_temp, store) = store();
    let source = thread("thread-1", 1);
    create(&store, &source);
    let first_turn = turn(&source, "turn-1", TurnStatus::InProgress);
    let first_item = item(&source, "turn-1", "message-1", 1, 1);
    let first = ApplyThreadHistoryParams {
        session_id: source.session_id.clone(),
        thread_id: source.thread_id.clone(),
        changes: ThreadHistoryChangeSet {
            sequence: 1,
            changed_turns: vec![first_turn],
            changed_items: vec![first_item.clone()],
            ..Default::default()
        },
    };
    assert!(
        block_on(store.apply_history(first.clone()))
            .expect("first apply")
            .applied
    );
    assert!(
        !block_on(store.apply_history(first.clone()))
            .expect("exact retry")
            .applied
    );

    let mut collision = first;
    collision
        .changes
        .removed_item_ids
        .push(first_item.item_id.clone());
    assert!(block_on(store.apply_history(collision))
        .expect_err("collision")
        .to_string()
        .contains("sequence collision"));

    let second = ApplyThreadHistoryParams {
        session_id: source.session_id.clone(),
        thread_id: source.thread_id.clone(),
        changes: ThreadHistoryChangeSet {
            sequence: 2,
            changed_turns: vec![turn(&source, "turn-2", TurnStatus::Completed)],
            changed_items: vec![item(&source, "turn-2", "message-2", 2, 2)],
            ..Default::default()
        },
    };
    block_on(store.apply_history(second)).expect("second apply");

    let rollback = ApplyThreadHistoryParams {
        session_id: source.session_id.clone(),
        thread_id: source.thread_id.clone(),
        changes: ThreadHistoryChangeSet {
            sequence: 3,
            removed_turn_ids: vec![TurnId::new("turn-2")],
            rollback_to_sequence: Some(1),
            ..Default::default()
        },
    };
    block_on(store.apply_history(rollback)).expect("rollback");
    assert_eq!(
        block_on(store.history_sequence(source.thread_id.clone())).expect("sequence"),
        Some(3)
    );
    let read = block_on(store.read_thread(ReadThreadParams {
        thread_id: source.thread_id.clone(),
        include_archived: false,
        turns_view: ThreadTurnsView::Full,
    }))
    .expect("read")
    .expect("thread");
    assert_eq!(read.turns.len(), 1);
    assert_eq!(read.turns[0].items, vec![first_item]);
}

#[test]
fn failed_history_apply_rolls_back_without_advancing_sequence() {
    let (_temp, store) = store();
    let source = thread("thread-1", 1);
    create(&store, &source);
    let orphan = item(&source, "missing-turn", "orphan", 1, 1);

    let error = block_on(store.apply_history(ApplyThreadHistoryParams {
        session_id: source.session_id.clone(),
        thread_id: source.thread_id.clone(),
        changes: ThreadHistoryChangeSet {
            sequence: 1,
            changed_items: vec![orphan],
            ..Default::default()
        },
    }))
    .expect_err("missing turn must fail atomically");
    assert!(error.to_string().contains("FOREIGN KEY constraint failed"));
    assert_eq!(
        block_on(store.history_sequence(source.thread_id.clone())).expect("history sequence"),
        None
    );
    assert!(block_on(store.list_items(ListItemsParams {
        thread_id: source.thread_id,
        turn_id: None,
        include_archived: false,
        page: page(SortDirection::Asc, 10),
    }))
    .expect("items after rollback")
    .data
    .is_empty());
}

#[test]
fn opaque_cursors_page_threads_turns_and_items_stably() {
    let (_temp, store) = store();
    for index in 1..=3 {
        create(&store, &thread(&format!("thread-{index}"), index));
    }
    let first = block_on(store.list_threads(ListThreadsParams {
        include_archived: false,
        page: page(SortDirection::Asc, 2),
    }))
    .expect("first thread page");
    assert_eq!(first.data.len(), 2);
    assert!(first.next_cursor.is_some());
    let second = block_on(store.list_threads(ListThreadsParams {
        include_archived: false,
        page: PageRequest {
            cursor: first.next_cursor,
            limit: 2,
            sort_direction: SortDirection::Asc,
        },
    }))
    .expect("second thread page");
    assert_eq!(second.data.len(), 1);
    assert!(second.backwards_cursor.is_some());

    let source = thread("history", 10);
    create(&store, &source);
    block_on(store.apply_history(ApplyThreadHistoryParams {
        session_id: source.session_id.clone(),
        thread_id: source.thread_id.clone(),
        changes: ThreadHistoryChangeSet {
            sequence: 2,
            changed_turns: vec![
                turn(&source, "turn-1", TurnStatus::Completed),
                turn(&source, "turn-2", TurnStatus::Completed),
            ],
            changed_items: vec![
                item(&source, "turn-1", "item-1", 1, 1),
                item(&source, "turn-2", "item-2", 2, 2),
            ],
            ..Default::default()
        },
    }))
    .expect("apply history");
    let turns = block_on(store.list_turns(ListTurnsParams {
        thread_id: source.thread_id.clone(),
        include_archived: false,
        page: page(SortDirection::Asc, 1),
        items_view: TurnItemsView::NotLoaded,
    }))
    .expect("turn page");
    assert_eq!(turns.data[0].turn_id.as_str(), "turn-1");
    assert!(turns.next_cursor.is_some());
    let items = block_on(store.list_items(ListItemsParams {
        thread_id: source.thread_id,
        turn_id: None,
        include_archived: false,
        page: page(SortDirection::Desc, 1),
    }))
    .expect("item page");
    assert_eq!(items.data[0].item_id.as_str(), "item_item-2");
    assert!(items.next_cursor.is_some());
}

#[test]
fn production_event_batches_create_and_incrementally_update_canonical_history() {
    let (_temp, store) = store();
    let stored = StoredSession {
        session: app_server_protocol::AgentSession {
            session_id: "session-production".to_string(),
            thread_id: "thread-production".to_string(),
            app_id: "agent-chat".to_string(),
            workspace_id: None,
            business_object_ref: Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: "session-production".to_string(),
                title: Some("Production thread".to_string()),
                uri: None,
                metadata: Some(json!({"providerName": "openai"})),
            }),
            status: app_server_protocol::AgentSessionStatus::Running,
            created_at: "2026-07-12T00:00:00Z".to_string(),
            updated_at: "2026-07-12T00:00:01Z".to_string(),
        },
        turns: Vec::new(),
        turn_inputs: HashMap::new(),
        turn_runtime_options: HashMap::new(),
        events: Vec::new(),
        output_blobs: HashMap::new(),
    };
    let event = |sequence, text: &str| app_server_protocol::AgentEvent {
        event_id: format!("event-{sequence}"),
        sequence,
        session_id: stored.session.session_id.clone(),
        thread_id: Some(stored.session.thread_id.clone()),
        turn_id: Some("turn-production".to_string()),
        event_type: "message.delta".to_string(),
        timestamp: format!("2026-07-12T00:00:0{sequence}Z"),
        payload: json!({
            "id": "message-production",
            "text": text,
        }),
    };

    store
        .apply_canonical_events(&stored, &[event(1, "hello")])
        .expect("first canonical batch");
    store
        .apply_canonical_events(&stored, &[event(2, " world")])
        .expect("second canonical batch");

    let thread = block_on(store.read_thread(ReadThreadParams {
        thread_id: ThreadId::new("thread-production"),
        include_archived: false,
        turns_view: ThreadTurnsView::Full,
    }))
    .expect("read canonical production thread")
    .expect("canonical production thread");
    assert_eq!(thread.name.as_deref(), Some("Production thread"));
    assert_eq!(thread.model_provider, "openai");
    assert_eq!(thread.turns.len(), 1);
    assert_eq!(thread.turns[0].items.len(), 1);
    assert!(matches!(
        &thread.turns[0].items[0].payload,
        ThreadItemPayload::AgentMessage { text, .. } if text == "hello world"
    ));
}

#[test]
fn approval_session_cache_hit_stays_audit_only_after_restart_read() {
    let temp = tempfile::tempdir().expect("tempdir");
    let database_path = temp.path().join("projection.sqlite");
    let stored = StoredSession {
        session: app_server_protocol::AgentSession {
            session_id: "session-approval-cache".to_string(),
            thread_id: "thread-approval-cache".to_string(),
            app_id: "agent-chat".to_string(),
            workspace_id: None,
            business_object_ref: None,
            status: app_server_protocol::AgentSessionStatus::Running,
            created_at: "2026-07-13T00:00:00Z".to_string(),
            updated_at: "2026-07-13T00:00:01Z".to_string(),
        },
        turns: Vec::new(),
        turn_inputs: HashMap::new(),
        turn_runtime_options: HashMap::new(),
        events: Vec::new(),
        output_blobs: HashMap::new(),
    };
    let event = |sequence: u64, event_type: &str, payload| app_server_protocol::AgentEvent {
        event_id: format!("approval-cache-event-{sequence}"),
        sequence,
        session_id: stored.session.session_id.clone(),
        thread_id: Some(stored.session.thread_id.clone()),
        turn_id: Some("turn-approval-cache".to_string()),
        event_type: event_type.to_string(),
        timestamp: format!("2026-07-13T00:00:{sequence:02}Z"),
        payload,
    };
    let read_full = |store: &ProjectionStore| {
        block_on(store.read_thread(ReadThreadParams {
            thread_id: ThreadId::new("thread-approval-cache"),
            include_archived: false,
            turns_view: ThreadTurnsView::Full,
        }))
        .expect("read canonical approval thread")
        .expect("canonical approval thread")
    };

    let store = ProjectionStore::initialize(&database_path).expect("projection store");
    store
        .apply_canonical_events(
            &stored,
            &[
                event(
                    1,
                    "approval.session_cache.hit",
                    json!({
                        "request_id": "provider-request-1",
                        "sourceRequestId": "approval-turn-initial",
                        "decision": "allow_for_session",
                        "decisionScope": "session",
                    }),
                ),
                event(
                    2,
                    "action.resolved",
                    json!({
                        "requestId": "permission-turn-approval-cache",
                        "actionId": "permission-turn-approval-cache",
                        "actionType": "tool_confirmation",
                        "source": "approval_session_cache",
                        "decision": "allow_for_session",
                        "decisionScope": "session",
                    }),
                ),
            ],
        )
        .expect("apply cache-backed approval resolution");

    let assert_terminal_approval = |thread: &Thread| {
        assert_eq!(thread.turns.len(), 1);
        assert_eq!(thread.turns[0].items.len(), 1);
        assert_eq!(thread.turns[0].approval, TurnApprovalState::Approved);
        assert_eq!(thread.turns[0].items[0].status, ItemStatus::Completed);
        assert!(matches!(
            &thread.turns[0].items[0].payload,
            ThreadItemPayload::Approval {
                request_id,
                decision: Some(agent_protocol::ApprovalDecision::ApprovedForSession),
                ..
            } if request_id == "permission-turn-approval-cache"
        ));
    };

    assert_terminal_approval(&read_full(&store));
    drop(store);

    let restarted = ProjectionStore::initialize(&database_path).expect("reopen projection store");
    assert_terminal_approval(&read_full(&restarted));
}

#[test]
fn canonical_queue_state_survives_incremental_apply_restart_remove_and_start() {
    let temp = tempfile::tempdir().expect("tempdir");
    let database_path = temp.path().join("projection.sqlite");
    let stored = StoredSession {
        session: app_server_protocol::AgentSession {
            session_id: "session-queue".to_string(),
            thread_id: "thread-queue".to_string(),
            app_id: "agent-chat".to_string(),
            workspace_id: None,
            business_object_ref: None,
            status: app_server_protocol::AgentSessionStatus::Running,
            created_at: "2026-07-12T00:00:00Z".to_string(),
            updated_at: "2026-07-12T00:00:01Z".to_string(),
        },
        turns: Vec::new(),
        turn_inputs: HashMap::new(),
        turn_runtime_options: HashMap::new(),
        events: Vec::new(),
        output_blobs: HashMap::new(),
    };
    let event = |sequence: u64,
                 event_type: &str,
                 turn_id: Option<&str>,
                 queued_turn_id: Option<&str>| app_server_protocol::AgentEvent {
        event_id: format!("queue-event-{sequence}"),
        sequence,
        session_id: stored.session.session_id.clone(),
        thread_id: Some(stored.session.thread_id.clone()),
        turn_id: turn_id.map(str::to_string),
        event_type: event_type.to_string(),
        timestamp: format!("2026-07-12T00:00:{sequence:02}Z"),
        payload: queued_turn_id
            .map(|queued_turn_id| json!({"queuedTurnId": queued_turn_id}))
            .unwrap_or_else(|| json!({})),
    };
    let read_full = |store: &ProjectionStore| {
        block_on(store.read_thread(ReadThreadParams {
            thread_id: ThreadId::new("thread-queue"),
            include_archived: false,
            turns_view: ThreadTurnsView::Full,
        }))
        .expect("read canonical queue thread")
        .expect("canonical queue thread")
    };

    let store = ProjectionStore::initialize(&database_path).expect("projection store");
    store
        .apply_canonical_events(
            &stored,
            &[event(1, "turn.started", Some("turn-active"), None)],
        )
        .expect("apply active turn");
    store
        .apply_canonical_events(
            &stored,
            &[event(
                2,
                "queue.added",
                Some("turn-queued"),
                Some("turn-queued"),
            )],
        )
        .expect("apply queued turn");

    let initial = read_full(&store);
    let active = initial
        .turns
        .iter()
        .find(|turn| turn.turn_id.as_str() == "turn-active")
        .expect("active turn");
    assert_eq!(active.status, TurnStatus::InProgress);
    assert_eq!(active.queue, TurnQueueState::Running);
    let queued = initial
        .turns
        .iter()
        .find(|turn| turn.turn_id.as_str() == "turn-queued")
        .expect("queued turn");
    assert_eq!(queued.status, TurnStatus::InProgress);
    assert!(matches!(queued.queue, TurnQueueState::Queued { .. }));

    drop(store);
    let store = ProjectionStore::initialize(&database_path).expect("reopen projection store");
    let restarted = read_full(&store);
    assert_eq!(restarted.turns.len(), 2);
    assert!(restarted.turns.iter().any(|turn| {
        turn.turn_id.as_str() == "turn-queued"
            && turn.status == TurnStatus::InProgress
            && matches!(turn.queue, TurnQueueState::Queued { .. })
    }));

    store
        .apply_canonical_events(
            &stored,
            &[event(3, "queue.promoted", None, Some("turn-queued"))],
        )
        .expect("apply queue promotion");
    let promoted = read_full(&store);
    assert!(promoted.turns.iter().any(|turn| {
        turn.turn_id.as_str() == "turn-queued"
            && turn.status == TurnStatus::InProgress
            && matches!(turn.queue, TurnQueueState::Queued { .. })
    }));

    store
        .apply_canonical_events(
            &stored,
            &[event(4, "turn.completed", Some("turn-active"), None)],
        )
        .expect("complete active turn");
    store
        .apply_canonical_events(
            &stored,
            &[event(5, "turn.started", Some("turn-queued"), None)],
        )
        .expect("start promoted turn");
    let started = read_full(&store);
    let promoted = started
        .turns
        .iter()
        .find(|turn| turn.turn_id.as_str() == "turn-queued")
        .expect("started promoted turn");
    assert_eq!(promoted.status, TurnStatus::InProgress);
    assert_eq!(promoted.queue, TurnQueueState::Running);

    store
        .apply_canonical_events(
            &stored,
            &[event(
                6,
                "queue.added",
                Some("turn-remove"),
                Some("turn-remove"),
            )],
        )
        .expect("apply removable queued turn");
    store
        .apply_canonical_events(
            &stored,
            &[event(
                7,
                "queue.removed",
                Some("wrong-outer-turn"),
                Some("turn-remove"),
            )],
        )
        .expect("remove queued turn by payload identity");
    assert!(!read_full(&store)
        .turns
        .iter()
        .any(|turn| turn.turn_id.as_str() == "turn-remove"));
}

#[test]
fn canonical_read_keeps_active_turn_when_long_stream_precedes_queue() {
    let temp = tempfile::tempdir().expect("tempdir");
    let stored = StoredSession {
        session: app_server_protocol::AgentSession {
            session_id: "session-active-read".to_string(),
            thread_id: "thread-active-read".to_string(),
            app_id: "agent-chat".to_string(),
            workspace_id: None,
            business_object_ref: None,
            status: app_server_protocol::AgentSessionStatus::Running,
            created_at: "2026-07-13T00:00:00Z".to_string(),
            updated_at: "2026-07-13T00:00:01Z".to_string(),
        },
        turns: Vec::new(),
        turn_inputs: HashMap::new(),
        turn_runtime_options: HashMap::new(),
        events: Vec::new(),
        output_blobs: HashMap::new(),
    };
    let event = |sequence: u64,
                 event_type: &str,
                 turn_id: Option<&str>,
                 payload: serde_json::Value|
     -> app_server_protocol::AgentEvent {
        app_server_protocol::AgentEvent {
            event_id: format!("active-read-event-{sequence}"),
            sequence,
            session_id: stored.session.session_id.clone(),
            thread_id: Some(stored.session.thread_id.clone()),
            turn_id: turn_id.map(str::to_string),
            event_type: event_type.to_string(),
            timestamp: format!("2026-07-13T00:00:{sequence:02}Z"),
            payload,
        }
    };
    let store = ProjectionStore::initialize(temp.path().join("projection.sqlite"))
        .expect("projection store");

    store
        .apply_canonical_events(
            &stored,
            &[event(
                1,
                "turn.accepted",
                Some("turn-active"),
                json!({"source": "agentSession/turn/start"}),
            )],
        )
        .expect("apply active admission");
    store
        .apply_canonical_events(
            &stored,
            &[event(
                2,
                "message.delta",
                Some("turn-active"),
                json!({"itemId": "message-active", "role": "assistant", "text": "stream"}),
            )],
        )
        .expect("apply active stream");
    store
        .apply_canonical_events(
            &stored,
            &[event(
                3,
                "queue.added",
                Some("turn-queued"),
                json!({"queuedTurnId": "turn-queued", "position": 0}),
            )],
        )
        .expect("apply queued turn");

    let thread = block_on(store.read_thread(ReadThreadParams {
        thread_id: ThreadId::new("thread-active-read"),
        include_archived: false,
        turns_view: ThreadTurnsView::Full,
    }))
    .expect("read canonical active thread")
    .expect("canonical active thread");
    assert_eq!(thread.turns.len(), 2);
    let active = thread
        .turns
        .iter()
        .find(|turn| turn.turn_id.as_str() == "turn-active")
        .expect("active turn is durable");
    assert_eq!(active.status, TurnStatus::InProgress);
    assert_eq!(active.queue, TurnQueueState::Running);
    assert!(thread
        .turns
        .iter()
        .any(|turn| turn.turn_id.as_str() == "turn-queued"
            && matches!(turn.queue, TurnQueueState::Queued { .. })));
}
