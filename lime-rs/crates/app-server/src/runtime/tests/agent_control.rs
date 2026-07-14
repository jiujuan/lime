use super::*;
use agent_protocol::ThreadTurnsView;
use app_server_protocol::{AgentSessionReadParams, AgentSessionTurnStartParams};
use futures::executor::block_on;
use std::sync::Arc;
use thread_store::{
    AgentGraphStore, AgentIdentityStore, AgentMailboxDeliveryMode, AgentMailboxStore,
    ReadThreadParams, ThreadSpawnEdgeStatus, ThreadStore,
};
use tool_runtime::agent_control::{
    AgentControlCaller, AgentControlCommand, AgentControlGatewayRequest, SubAgentProjectionActivity,
};

#[path = "agent_control/restart.rs"]
mod restart;

fn start_params(session_id: &str, thread_id: &str) -> AgentSessionStartParams {
    AgentSessionStartParams {
        session_id: Some(session_id.to_string()),
        thread_id: Some(thread_id.to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-control".to_string()),
        business_object_ref: None,
        locale: None,
    }
}

fn core() -> (tempfile::TempDir, RuntimeCore, Arc<ProjectionStore>) {
    let temp = tempfile::tempdir().expect("tempdir");
    let store = Arc::new(
        ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("projection store"),
    );
    let core = RuntimeCore::default().with_projection_store(store.clone());
    (temp, core, store)
}

async fn spawned_child_identity(
    store: &ProjectionStore,
    root_thread_id: &str,
    task_name: &str,
) -> thread_store::AgentIdentity {
    store
        .list_agent_identities(ThreadId::new(root_thread_id))
        .await
        .expect("list durable identities")
        .into_iter()
        .find(|identity| identity.agent_path == format!("/root/{task_name}"))
        .expect("spawned child identity")
}

#[test]
fn spawn_creates_canonical_child_and_open_edge() {
    let (_temp, core, store) = core();
    core.start_session(start_params("parent-session", "parent-thread"))
        .expect("parent");

    let response = block_on(core.spawn_agent_controlled(AgentControlSpawnRequest {
        parent_session_id: "parent-session".to_string(),
        child_session_id: Some("child-session".to_string()),
        child_thread_id: Some("child-thread".to_string()),
    }))
    .expect("spawn child");

    assert_eq!(response.parent_thread_id, "parent-thread");
    assert_eq!(response.session.session_id, "child-session");
    assert_eq!(response.session.thread_id, "child-thread");
    assert_eq!(
        block_on(store.list_thread_spawn_children(
            ThreadId::new("parent-thread"),
            Some(ThreadSpawnEdgeStatus::Open),
        ))
        .expect("children"),
        vec![ThreadId::new("child-thread")]
    );
}

#[test]
fn spawn_fails_closed_without_projection_store() {
    let core = RuntimeCore::default();
    core.start_session(start_params("parent-session", "parent-thread"))
        .expect("parent");

    let error = block_on(core.spawn_agent_controlled(AgentControlSpawnRequest {
        parent_session_id: "parent-session".to_string(),
        child_session_id: None,
        child_thread_id: None,
    }))
    .expect_err("projection store is required");
    assert!(error
        .to_string()
        .contains("agent control requires canonical ProjectionStore"));
}

#[test]
fn spawn_graph_failure_removes_unlinked_child_session_and_thread() {
    let (_temp, core, store) = core();
    core.start_session(start_params("parent-session", "parent-thread"))
        .expect("parent");
    block_on(store.upsert_thread_spawn_edge(
        ThreadId::new("ancestor-thread"),
        ThreadId::new("parent-thread"),
        ThreadSpawnEdgeStatus::Open,
    ))
    .expect("precondition edge");

    let error = block_on(core.spawn_agent_controlled(AgentControlSpawnRequest {
        parent_session_id: "parent-session".to_string(),
        child_session_id: Some("unlinked-child-session".to_string()),
        child_thread_id: Some("ancestor-thread".to_string()),
    }))
    .expect_err("cyclic graph must reject child edge");
    assert!(error
        .to_string()
        .contains("failed to persist canonical child thread edge"));
    assert!(matches!(
        core.read_session(AgentSessionReadParams {
            session_id: "unlinked-child-session".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        }),
        Err(RuntimeCoreError::SessionNotFound(session_id)) if session_id == "unlinked-child-session"
    ));
    assert!(block_on(store.read_thread(ReadThreadParams {
        thread_id: ThreadId::new("ancestor-thread"),
        include_archived: false,
        turns_view: ThreadTurnsView::NotLoaded,
    }))
    .expect("read failed child thread")
    .is_none());
}

#[test]
fn unloaded_parent_fails_without_legacy_session_fallback() {
    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("projection.sqlite");
    let store = Arc::new(ProjectionStore::initialize(&path).expect("store"));
    let core = RuntimeCore::default().with_projection_store(store);
    core.start_session(start_params("parent-session", "parent-thread"))
        .expect("parent");
    drop(core);

    let restarted = RuntimeCore::default().with_projection_store(Arc::new(
        ProjectionStore::initialize(path).expect("reopen store"),
    ));
    assert!(matches!(
        block_on(restarted.spawn_agent_controlled(AgentControlSpawnRequest {
            parent_session_id: "parent-session".to_string(),
            child_session_id: None,
            child_thread_id: None,
        })),
        Err(RuntimeCoreError::SessionNotFound(session_id)) if session_id == "parent-session"
    ));
}

#[tokio::test]
async fn gateway_rejects_caller_outside_its_bound_turn() {
    let (_temp, core, _store) = core();
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
                    text: "work".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
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

    let error = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                session_id: session.session_id.clone(),
                thread_id: session.thread_id.clone(),
                turn_id: "other-turn".to_string(),
                call_id: "call-1".to_string(),
            },
            command: AgentControlCommand::ListAgents { path_prefix: None },
            cancel_token: None,
        })
        .await
        .expect_err("bound gateway must reject another turn");

    assert!(error
        .to_string()
        .contains("outside its per-turn gateway scope"));
}

#[tokio::test]
async fn spawn_gateway_projects_and_starts_the_initial_child_task_before_success() {
    let (_temp, core, store) = core();
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
                runtime_options: None,
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

    let result = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                session_id: session.session_id.clone(),
                thread_id: session.thread_id.clone(),
                turn_id: turn.turn_id.clone(),
                call_id: "spawn-call".to_string(),
            },
            command: AgentControlCommand::SpawnAgent {
                task_name: "research".to_string(),
                message: "inspect the current owner".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect("spawn result");

    let child_identity = spawned_child_identity(&store, "parent-thread", "research").await;
    let child_thread_id = child_identity.thread_id.clone();
    let child_session_id = store
        .read_thread(ReadThreadParams {
            thread_id: child_thread_id.clone(),
            include_archived: true,
            turns_view: ThreadTurnsView::NotLoaded,
        })
        .await
        .expect("child thread")
        .expect("child thread exists")
        .session_id
        .to_string();
    let message_id = result.output["message_id"].as_str().expect("message id");
    assert_eq!(result.output["task_name"], "research");
    assert_eq!(result.projection_facts.len(), 1);
    assert_eq!(result.projection_facts[0].target_thread_id, child_thread_id);
    assert_eq!(
        result.projection_facts[0].activity,
        SubAgentProjectionActivity::Started
    );
    assert_eq!(
        result.projection_facts[0].detail.as_deref(),
        Some("/root/research")
    );
    assert!(block_on(store.read_agent_identity(child_thread_id.clone()))
        .expect("child identity")
        .is_some());
    let child = core
        .read_session(AgentSessionReadParams {
            session_id: child_session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("child session");
    let initial_turn_id = super::super::agent_mailbox_delivery::mailbox_turn_id(message_id);
    assert!(child
        .turns
        .iter()
        .any(|child_turn| child_turn.turn_id == initial_turn_id));
    let thread = block_on(store.read_thread(ReadThreadParams {
        thread_id: child_thread_id,
        include_archived: true,
        turns_view: ThreadTurnsView::Full,
    }))
    .expect("child thread")
    .expect("child thread exists");
    let initial_item_id = super::super::agent_mailbox_delivery::mailbox_item_id(message_id);
    let item_turn_ids = thread
        .turns
        .iter()
        .filter(|child_turn| {
            child_turn
                .items
                .iter()
                .any(|item| item.item_id.as_str() == initial_item_id)
        })
        .map(|child_turn| child_turn.turn_id.to_string())
        .collect::<Vec<_>>();
    assert_eq!(item_turn_ids, vec![initial_turn_id], "{thread:#?}");
}

#[tokio::test]
async fn wait_gateway_returns_interrupted_when_the_turn_is_cancelled() {
    let (_temp, core, _store) = core();
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
                    text: "wait".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
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
    let cancel_token = tokio_util::sync::CancellationToken::new();
    cancel_token.cancel();

    let result = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                session_id: session.session_id,
                thread_id: session.thread_id,
                turn_id: turn.turn_id,
                call_id: "wait-call".to_string(),
            },
            command: AgentControlCommand::WaitAgent { timeout_ms: 1_000 },
            cancel_token: Some(cancel_token),
        })
        .await
        .expect("wait result");

    assert_eq!(result.output["message"], "Wait interrupted.");
    assert_eq!(result.output["timed_out"], false);
    assert!(result.projection_facts.is_empty());
}

#[tokio::test]
async fn wait_agent_wakes_for_new_runtimecore_queued_steer() {
    let (_temp, core, _store) = core();
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
                    text: "work".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
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
        call_id: "call-wait".to_string(),
    };
    let wait_task = tokio::spawn(async move {
        gateway
            .gateway()
            .execute(AgentControlGatewayRequest {
                caller,
                command: AgentControlCommand::WaitAgent { timeout_ms: 500 },
                cancel_token: None,
            })
            .await
    });
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session.session_id.clone(),
            turn_id: Some("queued-steer".to_string()),
            input: AgentInput {
                text: "steer".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: true,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("queued steer");
    let result = tokio::time::timeout(std::time::Duration::from_secs(1), wait_task)
        .await
        .expect("wait must observe the new steer")
        .expect("wait task")
        .expect("wait result");

    assert_eq!(result.output["timed_out"], false);
    assert!(result.projection_facts.is_empty());
}

#[tokio::test]
async fn gateway_persists_root_identity_and_hides_closed_child_targets() {
    let (_temp, core, store) = core();
    let session = core
        .start_session(start_params("root-session", "root-thread"))
        .expect("root")
        .session;
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("root-turn".to_string()),
                input: AgentInput {
                    text: "work".to_string(),
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
    let gateway =
        core.agent_control_gateway_for_turn(&session, &turn, RuntimeHostContext::default());
    let caller = AgentControlCaller {
        session_id: session.session_id.clone(),
        thread_id: session.thread_id.clone(),
        turn_id: turn.turn_id.clone(),
        call_id: "call-list".to_string(),
    };

    gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: caller.clone(),
            command: AgentControlCommand::ListAgents { path_prefix: None },
            cancel_token: None,
        })
        .await
        .expect("list root");
    assert_eq!(
        store
            .read_agent_identity(ThreadId::new("root-thread"))
            .await
            .expect("read durable root identity")
            .expect("root identity")
            .agent_path,
        "/root"
    );

    core.spawn_agent_controlled(AgentControlSpawnRequest {
        parent_session_id: session.session_id.clone(),
        child_session_id: Some("child-session".to_string()),
        child_thread_id: Some("child-thread".to_string()),
    })
    .await
    .expect("child");
    store
        .upsert_agent_identity(thread_store::AgentIdentity {
            root_thread_id: ThreadId::new("root-thread"),
            thread_id: ThreadId::new("child-thread"),
            agent_path: "/root/child".to_string(),
            nickname: None,
            role: None,
            last_task_message: Some("work".to_string()),
        })
        .await
        .expect("child identity");
    store
        .set_thread_spawn_edge_status(ThreadId::new("child-thread"), ThreadSpawnEdgeStatus::Closed)
        .await
        .expect("close child");

    let error = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller,
            command: AgentControlCommand::SendMessage {
                target: "child".to_string(),
                message: "continue".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect_err("closed child must not be addressable");
    assert!(error
        .to_string()
        .contains("not in the current durable root-thread tree"));
    assert!(store
        .list_pending_agent_mailbox_messages(
            ThreadId::new("root-thread"),
            ThreadId::new("child-thread"),
        )
        .await
        .expect("pending child mail")
        .is_empty());
}

#[tokio::test]
async fn gateway_queue_followup_and_interrupt_keep_the_durable_contract() {
    let (_temp, core, store) = core();
    let session = core
        .start_session(start_params("root-session", "root-thread"))
        .expect("root")
        .session;
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
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
    let gateway =
        core.agent_control_gateway_for_turn(&session, &turn, RuntimeHostContext::default());
    let caller = AgentControlCaller {
        session_id: session.session_id.clone(),
        thread_id: session.thread_id.clone(),
        turn_id: turn.turn_id.clone(),
        call_id: "spawn-call".to_string(),
    };
    gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: caller.clone(),
            command: AgentControlCommand::SpawnAgent {
                task_name: "research".to_string(),
                message: "inspect the current owner".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect("spawn child");

    let child_identity = spawned_child_identity(&store, "root-thread", "research").await;
    let child_thread_id = child_identity.thread_id.clone();
    let child_session_id = store
        .read_thread(ReadThreadParams {
            thread_id: child_thread_id.clone(),
            include_archived: true,
            turns_view: ThreadTurnsView::NotLoaded,
        })
        .await
        .expect("child thread")
        .expect("child thread exists")
        .session_id
        .to_string();
    let initial_turn_count = core
        .read_session(AgentSessionReadParams {
            session_id: child_session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("child session")
        .turns
        .len();
    assert!(initial_turn_count > 0);

    let queued = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                call_id: "send-call".to_string(),
                ..caller.clone()
            },
            command: AgentControlCommand::SendMessage {
                target: "research".to_string(),
                message: "wait for the review".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect("queue-only message");
    let queued_message_id = queued.output["message_id"].as_str().expect("message id");
    assert_eq!(queued.projection_facts.len(), 1);
    assert_eq!(queued.projection_facts[0].target_thread_id, child_thread_id);
    assert_eq!(
        queued.projection_facts[0].activity,
        SubAgentProjectionActivity::Interacted
    );
    assert_eq!(
        queued.projection_facts[0].detail.as_deref(),
        Some("/root/research")
    );
    let child_after_queue = core
        .read_session(AgentSessionReadParams {
            session_id: child_session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("child session after queue");
    assert_eq!(child_after_queue.turns.len(), initial_turn_count);
    assert!(store
        .list_pending_agent_mailbox_messages(ThreadId::new("root-thread"), child_thread_id.clone(),)
        .await
        .expect("pending mailbox")
        .iter()
        .any(|message| {
            message.message_id == queued_message_id
                && message.delivery_mode == AgentMailboxDeliveryMode::QueueOnly
        }));

    let root_followup = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                call_id: "followup-root-call".to_string(),
                ..caller.clone()
            },
            command: AgentControlCommand::FollowupTask {
                target: "/root".to_string(),
                message: "forbidden".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect_err("followup must not target root");
    assert!(root_followup
        .to_string()
        .contains("followup_task cannot target the root agent"));

    let interrupted = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                call_id: "interrupt-call".to_string(),
                ..caller.clone()
            },
            command: AgentControlCommand::InterruptAgent {
                target: "research".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect("interrupt child");
    assert_eq!(interrupted.output["previous_status"], "pending_init");
    assert_eq!(interrupted.projection_facts.len(), 1);
    assert_eq!(
        interrupted.projection_facts[0].target_thread_id,
        child_thread_id
    );
    assert_eq!(
        interrupted.projection_facts[0].activity,
        SubAgentProjectionActivity::Interrupted
    );
    assert_eq!(
        interrupted.projection_facts[0].detail.as_deref(),
        Some("/root/research")
    );
    assert_eq!(
        store
            .list_thread_spawn_children(
                ThreadId::new("root-thread"),
                Some(ThreadSpawnEdgeStatus::Open),
            )
            .await
            .expect("open child edge"),
        vec![child_thread_id.clone()]
    );

    let followup = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: AgentControlCaller {
                call_id: "followup-child-call".to_string(),
                ..caller
            },
            command: AgentControlCommand::FollowupTask {
                target: "/root/research".to_string(),
                message: "continue after the interrupt".to_string(),
            },
            cancel_token: None,
        })
        .await
        .expect("followup child");
    assert_eq!(followup.projection_facts.len(), 1);
    assert_eq!(
        followup.projection_facts[0].target_thread_id,
        child_thread_id
    );
    assert_eq!(
        followup.projection_facts[0].activity,
        SubAgentProjectionActivity::Interacted
    );
    assert_eq!(
        followup.projection_facts[0].detail.as_deref(),
        Some("/root/research")
    );
}

#[tokio::test]
async fn list_gateway_sorts_prefixes_and_isolates_root_trees() {
    let (_temp, core, store) = core();
    let session = core
        .start_session(start_params("root-session", "root-thread"))
        .expect("root")
        .session;
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("root-turn".to_string()),
                input: AgentInput {
                    text: "list".to_string(),
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
    for (task_name, child_session_id, child_thread_id) in [
        ("zeta", "zeta-session", "zeta-thread"),
        ("alpha", "alpha-session", "alpha-thread"),
    ] {
        core.spawn_agent_controlled(AgentControlSpawnRequest {
            parent_session_id: session.session_id.clone(),
            child_session_id: Some(child_session_id.to_string()),
            child_thread_id: Some(child_thread_id.to_string()),
        })
        .await
        .expect("child");
        store
            .upsert_agent_identity(thread_store::AgentIdentity {
                root_thread_id: ThreadId::new("root-thread"),
                thread_id: ThreadId::new(child_thread_id),
                agent_path: format!("/root/{task_name}"),
                nickname: None,
                role: None,
                last_task_message: None,
            })
            .await
            .expect("child identity");
    }
    core.start_session(start_params("other-session", "other-thread"))
        .expect("other root");
    store
        .upsert_agent_identity(thread_store::AgentIdentity {
            root_thread_id: ThreadId::new("other-thread"),
            thread_id: ThreadId::new("other-thread"),
            agent_path: "/root".to_string(),
            nickname: None,
            role: None,
            last_task_message: None,
        })
        .await
        .expect("other identity");

    let gateway =
        core.agent_control_gateway_for_turn(&session, &turn, RuntimeHostContext::default());
    let caller = AgentControlCaller {
        session_id: session.session_id,
        thread_id: session.thread_id,
        turn_id: turn.turn_id,
        call_id: "list-call".to_string(),
    };
    let listed = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller: caller.clone(),
            command: AgentControlCommand::ListAgents { path_prefix: None },
            cancel_token: None,
        })
        .await
        .expect("list root tree");
    assert!(listed.projection_facts.is_empty());
    assert_eq!(
        listed.output["agents"]
            .as_array()
            .expect("agents")
            .iter()
            .filter_map(|entry| entry["agent_name"].as_str())
            .collect::<Vec<_>>(),
        vec!["/root", "/root/alpha", "/root/zeta"]
    );

    let prefixed = gateway
        .gateway()
        .execute(AgentControlGatewayRequest {
            caller,
            command: AgentControlCommand::ListAgents {
                path_prefix: Some("alpha".to_string()),
            },
            cancel_token: None,
        })
        .await
        .expect("list relative prefix");
    assert!(prefixed.projection_facts.is_empty());
    assert_eq!(
        prefixed.output["agents"]
            .as_array()
            .expect("agents")
            .iter()
            .filter_map(|entry| entry["agent_name"].as_str())
            .collect::<Vec<_>>(),
        vec!["/root/alpha"]
    );
}
