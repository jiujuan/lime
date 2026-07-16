use super::*;

struct RecordingChildBackend {
    child_started: tokio::sync::mpsc::UnboundedSender<ExecutionRequest>,
}

#[async_trait::async_trait]
impl ExecutionBackend for RecordingChildBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        if request.session.session_id == "parent-session" {
            return Ok(());
        }
        self.child_started
            .send(request)
            .map_err(|_| RuntimeCoreError::Backend("child start observer dropped".to_string()))?;
        sink.emit(RuntimeEvent::new("turn.completed", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.canceled", json!({})))
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

#[tokio::test]
async fn gateway_reads_preflight_route_from_canonical_turn_options() {
    let (child_started_tx, mut child_started_rx) = tokio::sync::mpsc::unbounded_channel();
    let (child_release_tx, child_release_rx) = tokio::sync::oneshot::channel();
    let backend = Arc::new(BlockingChildBackend {
        child_started: child_started_tx,
        child_release: tokio::sync::Mutex::new(Some(child_release_rx)),
    });
    let temp = tempfile::tempdir().expect("tempdir");
    let store = Arc::new(
        ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("projection store"),
    );
    let core = RuntimeCore::with_backend(backend).with_projection_store(store);
    let session = core
        .start_session(start_params("parent-session", "parent-thread"))
        .expect("parent")
        .session;
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("parent-turn".to_string()),
                input: AgentInput {
                    text: "delegate".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(app_server_protocol::RuntimeOptions {
                    event_name: Some("parent-event".to_string()),
                    queued_turn_id: Some("parent-queue".to_string()),
                    runtime_request: Some(app_server_protocol::RuntimeRequest {
                        metadata: Some(json!({ "fixture": "effective-child-route" })),
                        ..app_server_protocol::RuntimeRequest::default()
                    }),
                    expected_output: Some(json!({ "type": "parent-only" })),
                    structured_output: Some(
                        app_server_protocol::StructuredOutputContract::default(),
                    ),
                    output_schema: Some(json!({ "type": "object" })),
                    ..app_server_protocol::RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("parent turn")
        .response
        .turn;
    let gateway =
        core.agent_control_gateway_for_turn(&session, &turn, RuntimeHostContext::default());

    gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                session_id: session.session_id,
                thread_id: session.thread_id,
                turn_id: turn.turn_id,
                call_id: "effective-route-call".to_string(),
            },
            command: AgentControlCommand::SpawnAgent {
                task_name: "route_check".to_string(),
                message: "inspect the effective route".to_string(),
                fork_mode: SpawnAgentForkMode::None,
            },
            cancel_token: None,
        })
        .await
        .expect("spawn child");

    let child_request = tokio::time::timeout(Duration::from_secs(1), child_started_rx.recv())
        .await
        .expect("child turn should start")
        .expect("child request");
    let child_options = child_request
        .runtime_options
        .expect("child runtime options");
    assert_eq!(child_options.event_name, None);
    assert_eq!(child_options.queued_turn_id, None);
    assert_eq!(child_options.expected_output, None);
    assert_eq!(child_options.structured_output, None);
    assert_eq!(child_options.output_schema, None);
    let child_runtime_request = child_options
        .runtime_request
        .expect("child runtime request");
    assert_eq!(
        child_runtime_request.provider_preference.as_deref(),
        Some("resolved-provider")
    );
    assert_eq!(
        child_runtime_request.model_preference.as_deref(),
        Some("resolved-model")
    );
    assert_eq!(
        child_runtime_request.reasoning_effort.as_deref(),
        Some("high")
    );
    assert_eq!(
        child_runtime_request.working_dir.as_deref(),
        Some("/tmp/effective-child-route")
    );

    child_release_tx.send(()).expect("release child");
}

#[tokio::test]
async fn warm_followup_keeps_the_target_effective_route() {
    let (child_started_tx, mut child_started_rx) = tokio::sync::mpsc::unbounded_channel();
    let backend = Arc::new(RecordingChildBackend {
        child_started: child_started_tx,
    });
    let temp = tempfile::tempdir().expect("tempdir");
    let store = Arc::new(
        ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("projection store"),
    );
    let core = RuntimeCore::with_backend(backend).with_projection_store(store.clone());
    let session = core
        .start_session(start_params("parent-session", "parent-thread"))
        .expect("parent")
        .session;
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("parent-turn".to_string()),
                input: AgentInput {
                    text: "delegate".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(app_server_protocol::RuntimeOptions {
                    runtime_request: Some(app_server_protocol::RuntimeRequest {
                        provider_preference: Some("parent-provider".to_string()),
                        model_preference: Some("parent-model".to_string()),
                        ..app_server_protocol::RuntimeRequest::default()
                    }),
                    ..app_server_protocol::RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("parent turn")
        .response
        .turn;
    let gateway =
        core.agent_control_gateway_for_turn(&session, &turn, RuntimeHostContext::default());
    let caller = AgentControlCaller {
        session_id: session.session_id.clone(),
        thread_id: session.thread_id.clone(),
        turn_id: turn.turn_id.clone(),
        call_id: "spawn-route-target".to_string(),
    };
    gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: caller.clone(),
            command: AgentControlCommand::SpawnAgent {
                task_name: "route_target".to_string(),
                message: "start with the parent route".to_string(),
                fork_mode: SpawnAgentForkMode::None,
            },
            cancel_token: None,
        })
        .await
        .expect("spawn child");

    let initial_child_request =
        tokio::time::timeout(Duration::from_secs(1), child_started_rx.recv())
            .await
            .expect("initial child should start")
            .expect("initial child request");
    assert_eq!(
        initial_child_request.provider_preference(),
        Some("parent-provider")
    );
    let child_identity = spawned_child_identity(&store, "parent-thread", "route_target").await;
    let child_session_id = initial_child_request.session.session_id;
    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            let child = core
                .read_session(AgentSessionReadParams {
                    session_id: child_session_id.clone(),
                    history_limit: None,
                    history_offset: None,
                    history_before_message_id: None,
                })
                .expect("child session");
            if child
                .turns
                .iter()
                .any(|turn| turn.status == app_server_protocol::AgentTurnStatus::Completed)
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("initial child should complete");
    {
        let mut state = core
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let child = state
            .sessions
            .get_mut(&child_session_id)
            .expect("warm child session");
        let latest_turn_id = child
            .turns
            .last()
            .expect("initial child turn")
            .turn_id
            .clone();
        let options = child
            .turn_runtime_options
            .get_mut(&latest_turn_id)
            .expect("initial child effective options");
        options.event_name = Some("target-only-event".to_string());
        options.expected_output = Some(json!({ "type": "target-only" }));
        let runtime_request = options.runtime_request_mut();
        runtime_request.provider_preference = Some("target-provider".to_string());
        runtime_request.model_preference = Some("target-model".to_string());
    }

    gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                call_id: "followup-route-target".to_string(),
                ..caller
            },
            command: AgentControlCommand::FollowupTask {
                target: child_identity.agent_path,
                message: "continue with your own route".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect("followup child");

    let followup_request = tokio::time::timeout(Duration::from_secs(1), child_started_rx.recv())
        .await
        .expect("followup child should start")
        .expect("followup child request");
    assert_eq!(
        followup_request.provider_preference(),
        Some("target-provider")
    );
    assert_eq!(followup_request.model_preference(), Some("target-model"));
    let followup_options = followup_request
        .runtime_options
        .expect("followup runtime options");
    assert_eq!(followup_options.event_name, None);
    assert_eq!(followup_options.expected_output, None);
}
