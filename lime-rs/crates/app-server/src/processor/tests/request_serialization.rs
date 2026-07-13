use super::super::request_serialization::{
    request_serialization_scope, RequestSerializationAccess, RequestSerializationQueueKey,
    RequestSerializationQueues, RequestSerializationScope,
};
use super::super::RequestProcessor;
use super::tests_support::initialize_processor;
use crate::{
    ActionRespondRequest, CancelExecutionRequest, ExecutionBackend, ExecutionRequest, RuntimeCore,
    RuntimeCoreError, RuntimeEvent, RuntimeEventSink,
};
use app_server_protocol::{
    AgentSessionStartParams, JsonRpcMessage, JsonRpcRequest, RequestId,
    METHOD_AGENT_SESSION_THREAD_RESUME, METHOD_AGENT_SESSION_TURN_START,
    METHOD_BROWSER_SESSION_READ, METHOD_CAPABILITY_LIST, METHOD_THREAD_READ,
};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Notify;
use tokio::sync::{mpsc, oneshot};
use tokio::time::{timeout, Duration};

struct BlockingTurnBackend {
    started: Arc<Notify>,
    release: Arc<Notify>,
}

#[async_trait::async_trait]
impl ExecutionBackend for BlockingTurnBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        self.started.notify_one();
        self.release.notified().await;
        sink.emit(RuntimeEvent::new("turn.completed", json!({})))
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

fn scope(key: &str, access: RequestSerializationAccess) -> RequestSerializationScope {
    RequestSerializationScope {
        key: RequestSerializationQueueKey::Thread(key.to_string()),
        access,
    }
}

fn start_session(runtime: &RuntimeCore, session_id: &str, thread_id: &str) {
    runtime
        .start_session(AgentSessionStartParams {
            session_id: Some(session_id.to_string()),
            thread_id: Some(thread_id.to_string()),
            app_id: "agent-chat".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
}

#[tokio::test]
async fn same_scope_exclusive_requests_run_fifo() {
    let queues = RequestSerializationQueues::default();
    let (events_tx, mut events_rx) = mpsc::unbounded_channel();
    let (release_first_tx, release_first_rx) = oneshot::channel();

    let first_queues = queues.clone();
    let first_events = events_tx.clone();
    let first = tokio::spawn(async move {
        first_queues
            .run(
                Some(scope("thread-a", RequestSerializationAccess::Exclusive)),
                async move {
                    first_events
                        .send("first-start")
                        .expect("record first start");
                    release_first_rx.await.expect("release first request");
                    first_events.send("first-end").expect("record first end");
                },
            )
            .await;
    });
    assert_eq!(events_rx.recv().await, Some("first-start"));

    let second_queues = queues.clone();
    let second_events = events_tx.clone();
    let second = tokio::spawn(async move {
        second_queues
            .run(
                Some(scope("thread-a", RequestSerializationAccess::Exclusive)),
                async move {
                    second_events
                        .send("second-start")
                        .expect("record second start");
                    second_events.send("second-end").expect("record second end");
                },
            )
            .await;
    });

    assert!(timeout(Duration::from_millis(25), events_rx.recv())
        .await
        .is_err());
    release_first_tx.send(()).expect("release first request");
    assert_eq!(events_rx.recv().await, Some("first-end"));
    assert_eq!(events_rx.recv().await, Some("second-start"));
    assert_eq!(events_rx.recv().await, Some("second-end"));
    first.await.expect("first request task");
    second.await.expect("second request task");
}

#[tokio::test]
async fn different_scopes_run_concurrently() {
    let queues = RequestSerializationQueues::default();
    let (first_started_tx, first_started_rx) = oneshot::channel();
    let (release_first_tx, release_first_rx) = oneshot::channel();

    let first_queues = queues.clone();
    let first = tokio::spawn(async move {
        first_queues
            .run(
                Some(scope("thread-a", RequestSerializationAccess::Exclusive)),
                async move {
                    first_started_tx.send(()).expect("record first start");
                    release_first_rx.await.expect("release first request");
                },
            )
            .await;
    });
    first_started_rx.await.expect("first request started");

    let second = timeout(
        Duration::from_millis(100),
        queues.run(
            Some(scope("thread-b", RequestSerializationAccess::Exclusive)),
            async { "second-completed" },
        ),
    )
    .await
    .expect("different scope should not wait");
    assert_eq!(second, "second-completed");

    release_first_tx.send(()).expect("release first request");
    first.await.expect("first request task");
}

#[tokio::test]
async fn shared_read_does_not_overtake_queued_exclusive_request() {
    let queues = RequestSerializationQueues::default();
    let (events_tx, mut events_rx) = mpsc::unbounded_channel();
    let (release_reader_tx, release_reader_rx) = oneshot::channel();
    let shared_scope = scope("thread-a", RequestSerializationAccess::SharedRead);

    let first_queues = queues.clone();
    let first_events = events_tx.clone();
    let first_reader = tokio::spawn(async move {
        first_queues
            .run(Some(shared_scope), async move {
                first_events
                    .send("reader-one-start")
                    .expect("record reader start");
                release_reader_rx.await.expect("release first reader");
                first_events
                    .send("reader-one-end")
                    .expect("record reader end");
            })
            .await;
    });
    assert_eq!(events_rx.recv().await, Some("reader-one-start"));

    let writer_events = events_tx.clone();
    let writer = queues.run(
        Some(scope("thread-a", RequestSerializationAccess::Exclusive)),
        async move {
            writer_events
                .send("writer-start")
                .expect("record writer start");
            writer_events.send("writer-end").expect("record writer end");
        },
    );
    tokio::pin!(writer);
    tokio::select! {
        biased;
        _ = &mut writer => panic!("writer must wait for the active reader"),
        _ = async {} => {}
    }

    let second_reader_events = events_tx.clone();
    let second_reader = queues.run(
        Some(scope("thread-a", RequestSerializationAccess::SharedRead)),
        async move {
            second_reader_events
                .send("reader-two-start")
                .expect("record second reader start");
        },
    );
    tokio::pin!(second_reader);
    tokio::select! {
        biased;
        _ = &mut second_reader => panic!("later reader must wait behind the queued writer"),
        _ = async {} => {}
    }

    assert!(timeout(Duration::from_millis(25), events_rx.recv())
        .await
        .is_err());
    release_reader_tx.send(()).expect("release first reader");
    assert_eq!(events_rx.recv().await, Some("reader-one-end"));
    writer.await;
    assert_eq!(events_rx.recv().await, Some("writer-start"));
    assert_eq!(events_rx.recv().await, Some("writer-end"));
    second_reader.await;
    assert_eq!(events_rx.recv().await, Some("reader-two-start"));

    first_reader.await.expect("first reader task");
}

#[tokio::test]
async fn request_scope_uses_catalog_domain_key_and_access_policy() {
    let runtime = RuntimeCore::default();
    start_session(&runtime, "session-a", "thread-a");
    let turn = JsonRpcRequest::new(
        RequestId::Integer(1),
        METHOD_AGENT_SESSION_TURN_START,
        Some(json!({
            "sessionId": "session-a",
            "threadId": "thread-a"
        })),
    );
    assert_eq!(
        request_serialization_scope(&runtime, &turn).await,
        Ok(Some(RequestSerializationScope {
            key: RequestSerializationQueueKey::Thread("thread-a".to_string()),
            access: RequestSerializationAccess::Exclusive,
        }))
    );

    let browser_read = JsonRpcRequest::new(
        RequestId::Integer(2),
        METHOD_BROWSER_SESSION_READ,
        Some(json!({ "sessionId": "browser-a" })),
    );
    assert_eq!(
        request_serialization_scope(&runtime, &browser_read).await,
        Ok(Some(RequestSerializationScope {
            key: RequestSerializationQueueKey::BrowserSession("browser-a".to_string()),
            access: RequestSerializationAccess::SharedRead,
        }))
    );

    let thread_read = JsonRpcRequest::new(
        RequestId::Integer(3),
        METHOD_THREAD_READ,
        Some(json!({ "threadId": "thread-a" })),
    );
    assert_eq!(
        request_serialization_scope(&runtime, &thread_read).await,
        Ok(Some(RequestSerializationScope {
            key: RequestSerializationQueueKey::Thread("thread-a".to_string()),
            access: RequestSerializationAccess::SharedRead,
        }))
    );

    let unscoped = JsonRpcRequest::new(
        RequestId::Integer(4),
        METHOD_CAPABILITY_LIST,
        Some(json!({})),
    );
    assert_eq!(
        request_serialization_scope(&runtime, &unscoped).await,
        Ok(None)
    );
}

#[tokio::test]
async fn different_sessions_for_same_thread_share_fifo_scope() {
    let runtime = RuntimeCore::default();
    start_session(&runtime, "session-a", "thread-shared");
    start_session(&runtime, "session-b", "thread-shared");

    let first_scope = request_serialization_scope(
        &runtime,
        &JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_AGENT_SESSION_TURN_START,
            Some(json!({ "sessionId": "session-a" })),
        ),
    )
    .await
    .expect("first scope")
    .expect("first scoped request");
    let second_scope = request_serialization_scope(
        &runtime,
        &JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_AGENT_SESSION_TURN_START,
            Some(json!({ "sessionId": "session-b" })),
        ),
    )
    .await
    .expect("second scope")
    .expect("second scoped request");
    assert_eq!(first_scope, second_scope);
    assert_eq!(
        first_scope.key,
        RequestSerializationQueueKey::Thread("thread-shared".to_string())
    );

    let queues = RequestSerializationQueues::default();
    let (events_tx, mut events_rx) = mpsc::unbounded_channel();
    let (release_first_tx, release_first_rx) = oneshot::channel();
    let first_queues = queues.clone();
    let first_events = events_tx.clone();
    let first = tokio::spawn(async move {
        first_queues
            .run(Some(first_scope), async move {
                first_events.send("first-start").expect("first start");
                release_first_rx.await.expect("release first");
                first_events.send("first-end").expect("first end");
            })
            .await;
    });
    assert_eq!(events_rx.recv().await, Some("first-start"));

    let second_events = events_tx.clone();
    let second = tokio::spawn(async move {
        queues
            .run(Some(second_scope), async move {
                second_events.send("second-start").expect("second start");
            })
            .await;
    });
    assert!(timeout(Duration::from_millis(25), events_rx.recv())
        .await
        .is_err());

    release_first_tx.send(()).expect("release first request");
    assert_eq!(events_rx.recv().await, Some("first-end"));
    assert_eq!(events_rx.recv().await, Some("second-start"));
    first.await.expect("first request task");
    second.await.expect("second request task");
}

#[tokio::test]
async fn missing_scope_key_executes_without_serialization() {
    let runtime = RuntimeCore::default();
    let request = JsonRpcRequest::new(
        RequestId::Integer(1),
        METHOD_AGENT_SESSION_TURN_START,
        Some(json!({})),
    );

    assert_eq!(
        request_serialization_scope(&runtime, &request).await,
        Ok(None)
    );
}

#[tokio::test]
async fn conflicting_thread_and_session_scope_fails_closed() {
    let runtime = RuntimeCore::default();
    start_session(&runtime, "session-b", "thread-b");
    let request = JsonRpcRequest::new(
        RequestId::Integer(1),
        METHOD_AGENT_SESSION_TURN_START,
        Some(json!({
            "threadId": "thread-a",
            "sessionId": "session-b"
        })),
    );

    let error = request_serialization_scope(&runtime, &request)
        .await
        .expect_err("conflicting scope must fail");
    assert_eq!(error.code, app_server_protocol::error_codes::INVALID_PARAMS);
    assert_eq!(
        error.message,
        "invalid params: sessionId session-b belongs to threadId thread-b, not thread-a"
    );
}

#[tokio::test]
async fn missing_session_scope_preserves_session_not_found_error() {
    let runtime = RuntimeCore::default();
    let request = JsonRpcRequest::new(
        RequestId::Integer(1),
        METHOD_AGENT_SESSION_TURN_START,
        Some(json!({ "sessionId": "missing-session" })),
    );

    let error = request_serialization_scope(&runtime, &request)
        .await
        .expect_err("missing session scope must fail");
    assert_eq!(
        error.code,
        app_server_protocol::error_codes::SESSION_NOT_FOUND
    );
    assert_eq!(error.message, "session not found: missing-session");
}

#[tokio::test]
async fn processor_rejects_conflicting_thread_and_session_scope() {
    let runtime = RuntimeCore::default();
    start_session(&runtime, "session-b", "thread-b");
    let processor = RequestProcessor::new(runtime);
    initialize_processor(&processor).await;

    let messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_AGENT_SESSION_TURN_START,
            Some(json!({
                "threadId": "thread-a",
                "sessionId": "session-b",
                "input": { "text": "must not dispatch" }
            })),
        ))
        .await
        .expect("scope validation response");
    let [JsonRpcMessage::Error(error)] = messages.as_slice() else {
        panic!("expected invalid params response, got {messages:?}");
    };
    assert_eq!(
        error.error.code,
        app_server_protocol::error_codes::INVALID_PARAMS
    );
}

#[tokio::test]
async fn unscoped_request_does_not_wait_for_scoped_work() {
    let queues = RequestSerializationQueues::default();
    let (started_tx, started_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();
    let scoped_queues = queues.clone();
    let scoped = tokio::spawn(async move {
        scoped_queues
            .run(
                Some(scope("thread-a", RequestSerializationAccess::Exclusive)),
                async move {
                    started_tx.send(()).expect("record scoped start");
                    release_rx.await.expect("release scoped request");
                },
            )
            .await;
    });
    started_rx.await.expect("scoped request started");

    let value = timeout(Duration::from_millis(100), queues.run(None, async { 7 }))
        .await
        .expect("unscoped request should execute directly");
    assert_eq!(value, 7);

    release_tx.send(()).expect("release scoped request");
    scoped.await.expect("scoped request task");
}

#[tokio::test]
async fn admission_release_keeps_long_running_future_outside_scope_lock() {
    let queues = RequestSerializationQueues::default();
    let (admitted_tx, admitted_rx) = oneshot::channel();
    let (release_turn_tx, release_turn_rx) = oneshot::channel();
    let (turn_finished_tx, mut turn_finished_rx) = mpsc::unbounded_channel();
    let first_queues = queues.clone();
    let first = tokio::spawn(async move {
        first_queues
            .run_until_released(
                Some(scope("thread-a", RequestSerializationAccess::Exclusive)),
                async move {
                    admitted_rx.await.expect("turn admission signal");
                },
                async move {
                    release_turn_rx.await.expect("release long-running turn");
                    turn_finished_tx.send(()).expect("record turn completion");
                },
            )
            .await;
    });

    admitted_tx.send(()).expect("admit turn");
    let second = timeout(
        Duration::from_millis(100),
        queues.run(
            Some(scope("thread-a", RequestSerializationAccess::Exclusive)),
            async { "control-request-completed" },
        ),
    )
    .await
    .expect("control request should run after admission");
    assert_eq!(second, "control-request-completed");
    assert!(timeout(Duration::from_millis(25), turn_finished_rx.recv())
        .await
        .is_err());

    release_turn_tx.send(()).expect("release long-running turn");
    first.await.expect("long-running turn task");
    assert_eq!(turn_finished_rx.recv().await, Some(()));
}

#[tokio::test]
async fn non_streaming_turn_releases_thread_scope_after_admission() {
    let started = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let runtime = RuntimeCore::with_backend(Arc::new(BlockingTurnBackend {
        started: started.clone(),
        release: release.clone(),
    }));
    runtime
        .start_session(AgentSessionStartParams {
            session_id: Some("session-non-streaming".to_string()),
            thread_id: Some("thread-non-streaming".to_string()),
            app_id: "agent-chat".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
    let processor = RequestProcessor::new(runtime);
    initialize_processor(&processor).await;

    let turn_processor = processor.clone();
    let turn = tokio::spawn(async move {
        turn_processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(20),
                METHOD_AGENT_SESSION_TURN_START,
                Some(json!({
                    "sessionId": "session-non-streaming",
                    "input": { "text": "hold the backend" }
                })),
            ))
            .await
    });
    timeout(Duration::from_secs(1), started.notified())
        .await
        .expect("turn backend should start after admission");

    let resume_messages = timeout(
        Duration::from_millis(250),
        processor.handle_request(JsonRpcRequest::new(
            RequestId::Integer(21),
            METHOD_AGENT_SESSION_THREAD_RESUME,
            Some(json!({ "sessionId": "session-non-streaming" })),
        )),
    )
    .await
    .expect("same-thread request should run after turn admission")
    .expect("resume request");
    let [JsonRpcMessage::Response(response)] = resume_messages.as_slice() else {
        panic!("expected resume response, got {resume_messages:?}");
    };
    assert_eq!(response.result["resumed"], false);

    let queued_messages = timeout(
        Duration::from_millis(250),
        processor.handle_request(JsonRpcRequest::new(
            RequestId::Integer(22),
            METHOD_AGENT_SESSION_TURN_START,
            Some(json!({
                "sessionId": "session-non-streaming",
                "input": { "text": "queue behind the active turn" },
                "queueIfBusy": true
            })),
        )),
    )
    .await
    .expect("queued turn should be admitted after the active turn admission")
    .expect("queued turn request");
    assert!(matches!(
        queued_messages.first(),
        Some(JsonRpcMessage::Response(response))
            if response.result["turn"]["status"] == "queued"
    ));
    assert!(queued_messages.iter().any(|message| matches!(
        message,
        JsonRpcMessage::Notification(notification)
            if notification
                .params
                .as_ref()
                .is_some_and(|params| params["event"]["type"] == "queue.added")
    )));

    release.notify_one();
    let turn_messages = timeout(Duration::from_secs(1), turn)
        .await
        .expect("turn should finish after backend release")
        .expect("turn task")
        .expect("turn request");
    assert!(matches!(
        turn_messages.first(),
        Some(JsonRpcMessage::Response(_))
    ));
}

#[tokio::test]
async fn completed_scope_locks_are_reclaimed() {
    let queues = RequestSerializationQueues::default();
    queues
        .run(
            Some(scope("thread-a", RequestSerializationAccess::Exclusive)),
            async {},
        )
        .await;

    assert_eq!(queues.active_scope_count().await, 0);
}

#[tokio::test]
async fn aborted_scope_task_reclaims_lock_entry() {
    let queues = RequestSerializationQueues::default();
    let (started_tx, started_rx) = oneshot::channel();
    let task_queues = queues.clone();
    let task = tokio::spawn(async move {
        task_queues
            .run(
                Some(scope(
                    "thread-aborted",
                    RequestSerializationAccess::Exclusive,
                )),
                async move {
                    started_tx.send(()).expect("record scope start");
                    std::future::pending::<()>().await;
                },
            )
            .await;
    });

    started_rx.await.expect("scope should acquire before abort");
    task.abort();
    let _ = task.await;

    assert_eq!(queues.active_scope_count().await, 0);
}

#[tokio::test]
async fn panicked_scope_task_reclaims_lock_entry() {
    let queues = RequestSerializationQueues::default();
    let task_queues = queues.clone();
    let task = tokio::spawn(async move {
        task_queues
            .run(
                Some(scope(
                    "thread-panicked",
                    RequestSerializationAccess::Exclusive,
                )),
                async move {
                    panic!("scope task panic fixture");
                },
            )
            .await;
    });

    let error = task.await.expect_err("scope task should panic");
    assert!(error.is_panic());
    assert_eq!(queues.active_scope_count().await, 0);
}
