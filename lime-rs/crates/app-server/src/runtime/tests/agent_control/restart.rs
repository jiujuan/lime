use super::*;

fn persistent_core(
    temp: &tempfile::TempDir,
) -> (Arc<EventLogWriter>, Arc<ProjectionStore>, RuntimeCore) {
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("storage roots");
    let event_log_writer =
        Arc::new(EventLogWriter::new(&roots.event_log_root).expect("event log writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection store"));
    let core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());
    (event_log_writer, projection_store, core)
}

fn assert_session_unloaded(core: &RuntimeCore, session_id: &str) {
    assert!(matches!(
        core.read_session(AgentSessionReadParams {
            session_id: session_id.to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        }),
        Err(RuntimeCoreError::SessionNotFound(missing)) if missing == session_id
    ));
}

async fn session_id_for_thread(store: &ProjectionStore, thread_id: ThreadId) -> String {
    store
        .read_thread(ReadThreadParams {
            thread_id,
            include_archived: true,
            turns_view: ThreadTurnsView::NotLoaded,
        })
        .await
        .expect("read child thread")
        .expect("child thread exists")
        .session_id
        .to_string()
}

async fn agent_identity_for_path(
    store: &ProjectionStore,
    root_thread_id: &str,
    agent_path: &str,
) -> thread_store::AgentIdentity {
    store
        .list_agent_identities(ThreadId::new(root_thread_id))
        .await
        .expect("list durable identities")
        .into_iter()
        .find(|identity| identity.agent_path == agent_path)
        .expect("agent identity")
}

#[tokio::test]
async fn restart_hydrates_only_the_exact_open_child_on_demand() {
    let temp = tempfile::tempdir().expect("tempdir");
    let (event_log_writer, store, core) = persistent_core(&temp);
    let root = core
        .start_session(start_params("root-session", "root-thread"))
        .expect("root")
        .session;
    let root_turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: root.session_id.clone(),
                turn_id: Some("root-turn".to_string()),
                input: AgentInput {
                    text: "delegate".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("root turn")
        .response
        .turn;
    store
        .upsert_agent_identity(thread_store::AgentIdentity {
            root_thread_id: ThreadId::new("root-thread"),
            thread_id: ThreadId::new("root-thread"),
            agent_path: "/root".to_string(),
            nickname: None,
            role: None,
            last_task_message: None,
        })
        .await
        .expect("root identity");

    let seed_gateway =
        core.agent_control_gateway_for_turn(&root, &root_turn, RuntimeHostContext::default());
    let seed_caller = AgentControlCaller {
        session_id: root.session_id.clone(),
        thread_id: root.thread_id.clone(),
        turn_id: root_turn.turn_id.clone(),
        call_id: String::new(),
    };
    for task_name in ["followup", "interrupt", "closed"] {
        seed_gateway
            .gateway()
            .execute(AgentControlGatewayRequest {
                caller: AgentControlCaller {
                    call_id: format!("spawn-{task_name}"),
                    ..seed_caller.clone()
                },
                command: AgentControlCommand::SpawnAgent {
                    task_name: task_name.to_string(),
                    message: format!("initial {task_name} task"),
                },
                cancel_token: None,
            })
            .await
            .expect("spawn child through current gateway");
    }
    let followup_identity = spawned_child_identity(&store, "root-thread", "followup").await;
    let interrupt_identity = spawned_child_identity(&store, "root-thread", "interrupt").await;
    let closed_identity = spawned_child_identity(&store, "root-thread", "closed").await;
    let followup_session_id =
        session_id_for_thread(&store, followup_identity.thread_id.clone()).await;
    let interrupt_session_id =
        session_id_for_thread(&store, interrupt_identity.thread_id.clone()).await;
    let closed_session_id = session_id_for_thread(&store, closed_identity.thread_id.clone()).await;

    let followup_before_restart = core
        .read_session(AgentSessionReadParams {
            session_id: followup_session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("followup child before restart");
    let followup_turn = followup_before_restart
        .turns
        .first()
        .expect("followup child initial turn")
        .clone();
    let followup_gateway = core.agent_control_gateway_for_turn(
        &followup_before_restart.session,
        &followup_turn,
        RuntimeHostContext::default(),
    );
    followup_gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                session_id: followup_before_restart.session.session_id,
                thread_id: followup_before_restart.session.thread_id,
                turn_id: followup_turn.turn_id,
                call_id: "spawn-reviewer".to_string(),
            },
            command: AgentControlCommand::SpawnAgent {
                task_name: "reviewer".to_string(),
                message: "review the child work".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect("spawn grandchild through current gateway");
    let reviewer_identity =
        agent_identity_for_path(&store, "root-thread", "/root/followup/reviewer").await;
    let reviewer_session_id =
        session_id_for_thread(&store, reviewer_identity.thread_id.clone()).await;
    let interrupt_turn_id = core
        .read_session(AgentSessionReadParams {
            session_id: interrupt_session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("interrupt child before restart")
        .turns
        .first()
        .expect("interrupt child initial turn")
        .turn_id
        .clone();
    store
        .set_thread_spawn_edge_status(
            closed_identity.thread_id.clone(),
            ThreadSpawnEdgeStatus::Closed,
        )
        .await
        .expect("close child");
    drop(followup_gateway);
    drop(seed_gateway);
    drop(core);

    let restarted = RuntimeCore::default()
        .with_event_log_writer(event_log_writer)
        .with_projection_store(store.clone());
    assert_session_unloaded(&restarted, "root-session");
    assert_session_unloaded(&restarted, &followup_session_id);
    assert_session_unloaded(&restarted, &interrupt_session_id);
    assert_session_unloaded(&restarted, &closed_session_id);
    assert_session_unloaded(&restarted, &reviewer_session_id);

    restarted
        .ensure_current_session_hydrated("root-session")
        .await
        .expect("hydrate root");
    assert_session_unloaded(&restarted, &followup_session_id);
    assert_session_unloaded(&restarted, &interrupt_session_id);
    assert_session_unloaded(&restarted, &closed_session_id);
    assert_session_unloaded(&restarted, &reviewer_session_id);

    let gateway =
        restarted.agent_control_gateway_for_turn(&root, &root_turn, RuntimeHostContext::default());
    let caller = AgentControlCaller {
        session_id: root.session_id,
        thread_id: root.thread_id,
        turn_id: root_turn.turn_id,
        call_id: "queue-after-restart".to_string(),
    };
    let queued = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: caller.clone(),
            command: AgentControlCommand::SendMessage {
                target: "followup".to_string(),
                message: "queue only".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect("queue message");
    let queued_message_id = queued.output["message_id"].as_str().expect("message id");
    assert_session_unloaded(&restarted, &followup_session_id);
    assert!(store
        .list_pending_agent_mailbox_messages(
            ThreadId::new("root-thread"),
            followup_identity.thread_id.clone(),
        )
        .await
        .expect("pending queue")
        .iter()
        .any(|message| {
            message.message_id == queued_message_id
                && message.delivery_mode == AgentMailboxDeliveryMode::QueueOnly
        }));

    let closed = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                call_id: "closed-after-restart".to_string(),
                ..caller.clone()
            },
            command: AgentControlCommand::SendMessage {
                target: "closed".to_string(),
                message: "must stay closed".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect_err("closed child must stay unaddressable");
    assert!(closed
        .to_string()
        .contains("not in the current durable root-thread tree"));
    assert_session_unloaded(&restarted, &closed_session_id);
    assert_eq!(
        store
            .read_thread_spawn_parent(closed_identity.thread_id.clone())
            .await
            .expect("closed edge audit"),
        Some(thread_store::ThreadSpawnParent {
            parent_thread_id: ThreadId::new("root-thread"),
            status: ThreadSpawnEdgeStatus::Closed,
        })
    );
    assert!(store
        .read_agent_identity(closed_identity.thread_id.clone())
        .await
        .expect("closed identity audit")
        .is_some());
    assert!(store
        .read_thread(ReadThreadParams {
            thread_id: closed_identity.thread_id.clone(),
            include_archived: true,
            turns_view: ThreadTurnsView::NotLoaded,
        })
        .await
        .expect("closed thread audit")
        .is_some());

    gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                call_id: "followup-after-restart".to_string(),
                ..caller.clone()
            },
            command: AgentControlCommand::FollowupTask {
                target: "followup".to_string(),
                message: "start exact child".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect("followup exact child");
    restarted
        .read_session(AgentSessionReadParams {
            session_id: followup_session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("followup child hydrated");
    assert_session_unloaded(&restarted, &interrupt_session_id);
    assert_session_unloaded(&restarted, &closed_session_id);
    assert_session_unloaded(&restarted, &reviewer_session_id);

    let interrupted = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                call_id: "interrupt-after-restart".to_string(),
                ..caller
            },
            command: AgentControlCommand::InterruptAgent {
                target: "interrupt".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect("interrupt exact child");
    assert_eq!(interrupted.output["previous_status"], "pending_init");
    let interrupted_child = restarted
        .read_session(AgentSessionReadParams {
            session_id: interrupt_session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("interrupt child hydrated");
    assert_eq!(
        interrupted_child
            .turns
            .iter()
            .find(|turn| turn.turn_id == interrupt_turn_id)
            .expect("interrupted initial turn")
            .status,
        app_server_protocol::AgentTurnStatus::Canceled
    );
    assert_session_unloaded(&restarted, &closed_session_id);
    assert_session_unloaded(&restarted, &reviewer_session_id);
}
