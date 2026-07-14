use super::*;
use crate::runtime::agent_mailbox_delivery::{
    canonical_mailbox_item_exists, mailbox_item_id, mailbox_message_runtime_event, mailbox_turn_id,
};
use agent_protocol::{ThreadId, ThreadTurnsView, TurnStatus};
use app_server_protocol::AgentSessionStartParams;
use async_trait::async_trait;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use thread_store::{
    AgentIdentity, AgentIdentityStore, AgentMailboxDeliveryMode, AgentMailboxDeliveryStatus,
    AgentMailboxMessage, AgentMailboxMessageKind, AgentMailboxStore,
    AppendAgentMailboxMessageParams, ReadThreadParams, ThreadStore,
};

#[derive(Default)]
struct RecordingBackend {
    requests: Mutex<Vec<ExecutionRequest>>,
    histories: Mutex<Vec<Vec<model_provider::current_client::CurrentProviderMessage>>>,
}

#[async_trait]
impl ExecutionBackend for RecordingBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.requests
            .lock()
            .expect("requests mutex poisoned")
            .push(request);
        sink.emit(RuntimeEvent::new("turn.accepted", json!({})))
    }

    async fn start_turn_with_provider_history(
        &self,
        request: ExecutionRequest,
        provider_history: Vec<model_provider::current_client::CurrentProviderMessage>,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.requests
            .lock()
            .expect("requests mutex poisoned")
            .push(request);
        self.histories
            .lock()
            .expect("histories mutex poisoned")
            .push(provider_history);
        sink.emit(RuntimeEvent::new("turn.accepted", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

fn setup() -> (
    tempfile::TempDir,
    RuntimeCore,
    Arc<ProjectionStore>,
    Arc<RecordingBackend>,
) {
    let temp = tempfile::tempdir().expect("tempdir");
    let store = Arc::new(
        ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("projection store"),
    );
    let backend = Arc::new(RecordingBackend::default());
    let event_log_writer =
        Arc::new(EventLogWriter::new(temp.path().join("event-log")).expect("event log writer"));
    let core = RuntimeCore::with_backend(backend.clone())
        .with_event_log_writer(event_log_writer)
        .with_projection_store(store.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("root-session".to_string()),
        thread_id: Some("root-thread".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("root session");
    core.start_session(AgentSessionStartParams {
        session_id: Some("child-session".to_string()),
        thread_id: Some("child-thread".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("child session");
    futures::executor::block_on(store.upsert_agent_identity(AgentIdentity {
        root_thread_id: ThreadId::new("root-thread"),
        thread_id: ThreadId::new("root-thread"),
        agent_path: "/root".to_string(),
        nickname: None,
        role: None,
        last_task_message: None,
    }))
    .expect("root identity");
    futures::executor::block_on(store.upsert_agent_identity(AgentIdentity {
        root_thread_id: ThreadId::new("root-thread"),
        thread_id: ThreadId::new("child-thread"),
        agent_path: "/root/child".to_string(),
        nickname: Some("child".to_string()),
        role: Some("worker".to_string()),
        last_task_message: None,
    }))
    .expect("child identity");
    (temp, core, store, backend)
}

fn message(id: &str, mode: AgentMailboxDeliveryMode) -> AgentMailboxMessage {
    AgentMailboxMessage {
        message_id: id.to_string(),
        root_thread_id: ThreadId::new("root-thread"),
        sender_thread_id: ThreadId::new("root-thread"),
        recipient_thread_id: ThreadId::new("child-thread"),
        content: format!("content-{id}"),
        kind: AgentMailboxMessageKind::Message,
        source_turn_id: None,
        result_status: None,
        delivery_mode: mode,
        delivery_status: AgentMailboxDeliveryStatus::Pending,
        created_at_ms: 1,
        delivered_at_ms: None,
    }
}

fn append(store: &ProjectionStore, message: AgentMailboxMessage) {
    futures::executor::block_on(
        store.append_agent_mailbox_message(AppendAgentMailboxMessageParams { message }),
    )
    .expect("append mailbox");
}

async fn pending(store: &ProjectionStore) -> Vec<AgentMailboxMessage> {
    store
        .list_pending_agent_mailbox_messages(
            ThreadId::new("root-thread"),
            ThreadId::new("child-thread"),
        )
        .await
        .expect("list pending")
}

async fn has_item(store: &ProjectionStore, message_id: &str) -> bool {
    canonical_mailbox_item_exists(
        store,
        &ThreadId::new("child-thread"),
        &mailbox_item_id(message_id),
    )
    .await
    .expect("read canonical item")
}

async fn canonical_turn_status(store: &ProjectionStore, turn_id: &str) -> Option<TurnStatus> {
    store
        .read_thread(ReadThreadParams {
            thread_id: ThreadId::new("child-thread"),
            include_archived: true,
            turns_view: ThreadTurnsView::Full,
        })
        .await
        .expect("read canonical thread")
        .and_then(|thread| {
            thread
                .turns
                .into_iter()
                .find(|turn| turn.turn_id.as_str() == turn_id)
                .map(|turn| turn.status)
        })
}

#[tokio::test]
async fn trigger_turn_appends_canonical_item_before_ack_and_starts_recipient() {
    let (_temp, core, store, backend) = setup();
    append(
        &store,
        message("trigger-1", AgentMailboxDeliveryMode::TriggerTurn),
    );

    assert_eq!(
        core.process_pending_agent_mailbox_triggers("child-session", RuntimeHostContext::default())
            .await
            .expect("process trigger"),
        1
    );

    assert!(pending(&store).await.is_empty());
    assert!(has_item(&store, "trigger-1").await);
    let requests = backend.requests.lock().expect("requests mutex poisoned");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].input.text, "content-trigger-1");
    assert_eq!(requests[0].turn.turn_id, mailbox_turn_id("trigger-1"));
    let histories = backend.histories.lock().expect("histories mutex poisoned");
    assert!(
        histories[0].is_empty(),
        "trigger input must not be duplicated in history"
    );
    let mailbox_events = core
        .events_for_session("child-session")
        .expect("events")
        .into_iter()
        .filter(|event| event.payload["mailbox"]["messageId"] == "trigger-1")
        .collect::<Vec<_>>();
    assert_eq!(mailbox_events.len(), 1);
    assert_eq!(
        mailbox_events[0].payload["itemId"],
        mailbox_item_id("trigger-1")
    );
}

#[tokio::test]
async fn queue_only_stays_pending_until_a_real_turn_without_starting_one() {
    let (_temp, core, store, backend) = setup();
    append(
        &store,
        message("queue-1", AgentMailboxDeliveryMode::QueueOnly),
    );

    assert_eq!(
        core.process_pending_agent_mailbox_triggers("child-session", RuntimeHostContext::default())
            .await
            .expect("process queue only"),
        0
    );
    assert_eq!(
        backend
            .requests
            .lock()
            .expect("requests mutex poisoned")
            .len(),
        0
    );
    assert!(core
        .has_pending_agent_mailbox_activity("child-session")
        .await
        .expect("mailbox activity"));

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "child-session".to_string(),
            turn_id: Some("user-turn".to_string()),
            input: AgentInput {
                text: "real user turn".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("start real turn");

    assert!(pending(&store).await.is_empty());
    assert!(has_item(&store, "queue-1").await);
    assert!(!core
        .has_pending_agent_mailbox_activity("child-session")
        .await
        .expect("mailbox activity after delivery"));
    let requests = backend.requests.lock().expect("requests mutex poisoned");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].input.text, "real user turn");
    let histories = backend.histories.lock().expect("histories mutex poisoned");
    assert_eq!(histories.len(), 1);
    assert_eq!(
        histories[0]
            .iter()
            .flat_map(|message| message.content.iter())
            .filter_map(|content| match content {
                model_provider::current_client::CurrentProviderContent::Text(text) => {
                    Some(text.as_str())
                }
                _ => None,
            })
            .collect::<Vec<_>>(),
        vec!["content-queue-1"]
    );
}

#[tokio::test]
async fn existing_canonical_item_is_acknowledged_without_a_duplicate_visible_item() {
    let (_temp, core, store, _backend) = setup();
    let message = message("retry-1", AgentMailboxDeliveryMode::TriggerTurn);
    let turn_id = mailbox_turn_id(&message.message_id);
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "child-session".to_string(),
            turn_id: Some(turn_id),
            input: AgentInput {
                text: "placeholder".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("start turn before mailbox append");
    append(&store, message.clone());
    let (session, turns) = core.session_snapshot("child-session").expect("session");
    let turn = turns
        .into_iter()
        .find(|turn| turn.turn_id == mailbox_turn_id(&message.message_id))
        .expect("turn");
    core.append_external_runtime_events(
        &session.session_id,
        Some(&turn.turn_id),
        vec![mailbox_message_runtime_event(
            &message,
            &mailbox_item_id(&message.message_id),
            true,
        )],
    )
    .expect("persist mailbox item before simulated crash");

    let retry = core
        .deliver_pending_agent_mailbox_for_turn(
            &session,
            &turn,
            &AgentInput {
                text: message.content.clone(),
                attachments: Vec::new(),
            },
        )
        .await
        .expect("retry delivery");
    assert!(retry.events.is_empty());
    assert!(pending(&store).await.is_empty());
    let mailbox_events = core
        .events_for_session("child-session")
        .expect("events")
        .into_iter()
        .filter(|event| event.payload["mailbox"]["messageId"] == "retry-1")
        .collect::<Vec<_>>();
    assert_eq!(mailbox_events.len(), 1);
}

#[tokio::test]
async fn canonical_mailbox_item_failure_keeps_message_pending_and_rolls_back_turn() {
    let (_temp, core, store, backend) = setup();
    append(
        &store,
        message("canonical-failure", AgentMailboxDeliveryMode::TriggerTurn),
    );
    let connection = Connection::open(store.path()).expect("open projection database");
    connection
        .execute(
            "UPDATE canonical_threads SET last_sequence = 9999 WHERE thread_id = ?1",
            ["child-thread"],
        )
        .expect("force canonical sequence conflict");

    let error = core
        .process_pending_agent_mailbox_triggers("child-session", RuntimeHostContext::default())
        .await
        .expect_err("canonical mailbox item must fail closed");
    assert!(error
        .to_string()
        .contains("canonical mailbox Item must persist before delivery acknowledgement"));
    assert_eq!(pending(&store).await.len(), 1);
    assert!(backend
        .requests
        .lock()
        .expect("requests mutex poisoned")
        .is_empty());
    assert!(core
        .session_snapshot("child-session")
        .expect("child session")
        .1
        .is_empty());
    assert!(core
        .events_for_session("child-session")
        .expect("child events")
        .is_empty());
}

#[tokio::test]
async fn event_log_first_queue_only_retry_recovers_canonical_item_before_ack() {
    let (temp, core, store, backend) = setup();
    append(
        &store,
        message("event-log-retry", AgentMailboxDeliveryMode::QueueOnly),
    );
    let connection = Connection::open(store.path()).expect("open projection database");
    connection
        .execute(
            "UPDATE canonical_threads SET last_sequence = 9999 WHERE thread_id = ?1",
            ["child-thread"],
        )
        .expect("force canonical sequence conflict");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "child-session".to_string(),
            turn_id: Some("first-user-turn".to_string()),
            input: AgentInput {
                text: "first user input".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect_err("first canonical projection must fail after EventLog append");
    assert_eq!(pending(&store).await.len(), 1);
    assert!(backend
        .requests
        .lock()
        .expect("requests mutex poisoned")
        .is_empty());
    assert!(core
        .events_for_session("child-session")
        .expect("child events")
        .is_empty());
    let event_log_writer =
        EventLogWriter::new(temp.path().join("event-log")).expect("reopen event log writer");
    assert_eq!(
        event_log_writer
            .read_session_events("child-session")
            .expect("durable mailbox event")
            .len(),
        2
    );

    connection
        .execute(
            "UPDATE canonical_threads SET last_sequence = NULL WHERE thread_id = ?1",
            ["child-thread"],
        )
        .expect("repair canonical sequence");

    let retry = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "child-session".to_string(),
                turn_id: Some("second-user-turn".to_string()),
                input: AgentInput {
                    text: "second user input".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("retry mailbox delivery");
    assert_eq!(retry.response.turn.turn_id, "second-user-turn");
    assert!(pending(&store).await.is_empty());
    assert!(has_item(&store, "event-log-retry").await);
    assert_eq!(
        backend
            .requests
            .lock()
            .expect("requests mutex poisoned")
            .len(),
        1
    );
    let child_events = core
        .events_for_session("child-session")
        .expect("child events");
    let mailbox_events = child_events
        .iter()
        .filter(|event| event.payload["mailbox"]["messageId"] == "event-log-retry")
        .collect::<Vec<_>>();
    assert_eq!(mailbox_events.len(), 1);
    assert!(child_events.iter().any(|event| {
        event.turn_id.as_deref() == Some("second-user-turn")
            && event.payload.pointer("/input/text") == Some(&json!("second user input"))
    }));
    assert!(child_events.iter().any(|event| {
        event.turn_id.as_deref() == Some("first-user-turn")
            && event.event_type == "turn.canceled"
            && event.payload["reason"] == "mailbox_projection_recovery"
    }));
    assert_eq!(
        canonical_turn_status(&store, "first-user-turn").await,
        Some(TurnStatus::Interrupted)
    );
}

#[tokio::test]
async fn event_log_first_trigger_retry_recovers_the_deterministic_turn_before_ack() {
    let (temp, core, store, backend) = setup();
    append(
        &store,
        message("trigger-log-retry", AgentMailboxDeliveryMode::TriggerTurn),
    );
    let connection = Connection::open(store.path()).expect("open projection database");
    connection
        .execute(
            "UPDATE canonical_threads SET last_sequence = 9999 WHERE thread_id = ?1",
            ["child-thread"],
        )
        .expect("force canonical sequence conflict");

    core.process_pending_agent_mailbox_triggers("child-session", RuntimeHostContext::default())
        .await
        .expect_err("first canonical projection must fail after EventLog append");
    assert_eq!(pending(&store).await.len(), 1);
    assert!(backend
        .requests
        .lock()
        .expect("requests mutex poisoned")
        .is_empty());
    let event_log_writer =
        EventLogWriter::new(temp.path().join("event-log")).expect("reopen event log writer");
    assert_eq!(
        event_log_writer
            .read_session_events("child-session")
            .expect("durable mailbox event")
            .len(),
        1
    );

    connection
        .execute(
            "UPDATE canonical_threads SET last_sequence = NULL WHERE thread_id = ?1",
            ["child-thread"],
        )
        .expect("repair canonical sequence");

    assert_eq!(
        core.process_pending_agent_mailbox_triggers("child-session", RuntimeHostContext::default())
            .await
            .expect("retry mailbox delivery"),
        1
    );
    assert!(pending(&store).await.is_empty());
    assert!(has_item(&store, "trigger-log-retry").await);
    let requests = backend.requests.lock().expect("requests mutex poisoned");
    assert_eq!(requests.len(), 1);
    assert_eq!(
        requests[0].turn.turn_id,
        mailbox_turn_id("trigger-log-retry")
    );
}
