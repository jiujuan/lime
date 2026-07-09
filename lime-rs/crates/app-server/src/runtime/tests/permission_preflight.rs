use super::*;
use crate::RuntimeBackend;
use std::sync::Arc;

const SESSION_ID: &str = "sess_permission_preflight";
const THREAD_ID: &str = "thread_permission_preflight";
const TURN_ID: &str = "turn_permission_preflight";
const DEFAULT_BROWSER_LAUNCH_URL: &str =
    "https://example.com/approval-session-cache?token=SHOULD_NOT_BE_IN_KEY";
const DEFAULT_WORKING_DIR: &str = "/tmp/lime-approval/workspace/app";
const DEFAULT_PROJECT_ROOT: &str = "/tmp/lime-approval/workspace";

#[tokio::test]
async fn action_respond_requires_decision_only_for_tool_confirmation() {
    let core = RuntimeCore::with_backend(Arc::new(RuntimeBackend::new()));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_approval_contract".to_string()),
        thread_id: Some("thread_approval_contract".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-permission".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let missing_decision = match core
        .respond_action(
            AgentSessionActionRespondParams {
                session_id: "sess_approval_contract".to_string(),
                request_id: "approval-missing-decision".to_string(),
                action_type: AgentSessionActionType::ToolConfirmation,
                decision: None,
                confirmed: Some(true),
                response: None,
                user_data: None,
                metadata: None,
                event_name: None,
                action_scope: None,
            },
            RuntimeHostContext::default(),
        )
        .await
    {
        Ok(_) => panic!("tool confirmation without decision must fail closed"),
        Err(error) => error,
    };
    assert!(missing_decision
        .to_string()
        .contains("tool_confirmation action/respond requires decision"));

    let non_approval_decision = match core
        .respond_action(
            AgentSessionActionRespondParams {
                session_id: "sess_approval_contract".to_string(),
                request_id: "ask-with-approval-decision".to_string(),
                action_type: AgentSessionActionType::AskUser,
                decision: Some(AgentSessionApprovalDecision::AllowOnce),
                confirmed: Some(true),
                response: Some("继续".to_string()),
                user_data: None,
                metadata: None,
                event_name: None,
                action_scope: None,
            },
            RuntimeHostContext::default(),
        )
        .await
    {
        Ok(_) => panic!("ask_user with approval decision must fail closed"),
        Err(error) => error,
    };
    assert!(non_approval_decision
        .to_string()
        .contains("approval decision is only valid for tool_confirmation"));
}

#[tokio::test]
async fn browser_control_preflight_requests_permission_without_provider() {
    let core = RuntimeCore::with_backend(Arc::new(RuntimeBackend::new()));
    core.start_session(AgentSessionStartParams {
        session_id: Some(SESSION_ID.to_string()),
        thread_id: Some(THREAD_ID.to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-permission".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let started = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: SESSION_ID.to_string(),
                turn_id: Some(TURN_ID.to_string()),
                input: AgentInput {
                    text: "打开浏览器并执行需要权限的操作".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(browser_control_runtime_options()),
                queue_if_busy: false,
                skip_pre_submit_resume: true,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("preflight should not require provider selection");

    assert_eq!(started.response.turn.status, AgentTurnStatus::WaitingAction);
    assert!(started
        .events
        .iter()
        .any(|event| event.event_type == "action.required"));
    assert!(!started
        .events
        .iter()
        .any(|event| event.event_type == "routing.decision.made"));

    let before = read_thread(&core);
    assert_eq!(before["status"].as_str(), Some("waitingAction"));
    assert_eq!(
        before["runtime_summary"]["latestTurnStatus"].as_str(),
        Some("waitingAction")
    );
    assert_eq!(
        before["permission_state"]["confirmation_status"].as_str(),
        Some("requested")
    );
    let request_id = before["permission_state"]["confirmation_request_id"]
        .as_str()
        .expect("confirmation request id");
    assert!(request_id.contains(TURN_ID));
    assert_eq!(
        before["pending_requests"]
            .as_array()
            .expect("pending requests")
            .len(),
        1
    );
    assert_eq!(
        before["pending_requests"][0]["availableDecisions"]
            .as_array()
            .expect("available decisions")
            .iter()
            .filter_map(|decision| decision.as_str())
            .collect::<Vec<_>>(),
        vec!["allow_once", "allow_for_session", "decline", "cancel"]
    );

    let responded = core
        .respond_action(
            AgentSessionActionRespondParams {
                session_id: SESSION_ID.to_string(),
                request_id: request_id.to_string(),
                action_type: AgentSessionActionType::ToolConfirmation,
                decision: Some(AgentSessionApprovalDecision::Decline),
                confirmed: None,
                response: Some("{\"answer\":\"拒绝\"}".to_string()),
                user_data: Some(json!({ "answer": "拒绝" })),
                metadata: None,
                event_name: None,
                action_scope: Some(AgentSessionActionScope {
                    session_id: Some(SESSION_ID.to_string()),
                    thread_id: Some(THREAD_ID.to_string()),
                    turn_id: Some(TURN_ID.to_string()),
                }),
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("decline permission");

    assert_eq!(responded.events[0].event_type, "action.resolved");
    assert!(responded
        .events
        .iter()
        .all(|event| event.event_type != "turn.canceled"));

    let after = read_thread(&core);
    assert_ne!(after["status"].as_str(), Some("canceled"));
    assert_eq!(
        after["permission_state"]["confirmation_status"].as_str(),
        Some("denied")
    );
    assert_eq!(
        after["pending_requests"]
            .as_array()
            .expect("pending requests")
            .len(),
        0
    );
}

#[tokio::test]
async fn browser_control_allow_for_session_records_session_cache() {
    let session_id = format!("{SESSION_ID}_session_cache");
    let thread_id = format!("{THREAD_ID}_session_cache");
    let turn_id = format!("{TURN_ID}_session_cache");
    let core = RuntimeCore::with_backend(Arc::new(RuntimeBackend::new()));
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.clone()),
        thread_id: Some(thread_id.clone()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-permission".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session_id.clone(),
            turn_id: Some(turn_id.clone()),
            input: AgentInput {
                text: "打开浏览器并执行需要权限的操作".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(browser_control_runtime_options_for(&session_id, &turn_id)),
            queue_if_busy: false,
            skip_pre_submit_resume: true,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("preflight should not require provider selection");

    let before = read_thread_for(&core, &session_id);
    let request_id = before["permission_state"]["confirmation_request_id"]
        .as_str()
        .expect("confirmation request id");

    core.respond_action(
        AgentSessionActionRespondParams {
            session_id: session_id.clone(),
            request_id: request_id.to_string(),
            action_type: AgentSessionActionType::ToolConfirmation,
            decision: Some(AgentSessionApprovalDecision::AllowForSession),
            confirmed: None,
            response: Some("{\"answer\":\"本会话允许\"}".to_string()),
            user_data: Some(json!({ "answer": "本会话允许" })),
            metadata: None,
            event_name: None,
            action_scope: Some(AgentSessionActionScope {
                session_id: Some(session_id.clone()),
                thread_id: Some(thread_id.clone()),
                turn_id: Some(turn_id.clone()),
            }),
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("allow for session");

    let state = core
        .state
        .lock()
        .expect("runtime core state mutex poisoned");
    let cache_entries = state
        .session_approval_cache
        .get(&session_id)
        .expect("session approval cache");
    assert_eq!(cache_entries.len(), 1);
    assert_eq!(
        cache_entries[0].decision,
        AgentSessionApprovalDecision::AllowForSession
    );
    assert_eq!(cache_entries[0].key.tool_family, "browser_control");
    assert_eq!(cache_entries[0].key.contract_key, "browser_control");
    assert_eq!(cache_entries[0].key.approval_policy, "on-request");
    assert_eq!(cache_entries[0].key.sandbox_policy, "workspace-write");
    assert_eq!(cache_entries[0].key.scope.risk_class, "browser_control");
    assert_eq!(
        cache_entries[0].key.scope.workspace_id.as_deref(),
        Some("workspace-permission")
    );
    assert_eq!(
        cache_entries[0].key.scope.network_host.as_deref(),
        Some("https://example.com")
    );
    assert!(cache_entries[0]
        .key
        .scope
        .working_dir_hash
        .as_deref()
        .is_some_and(|hash| hash.starts_with("sha256:")));
    assert!(cache_entries[0]
        .key
        .scope
        .project_root_hash
        .as_deref()
        .is_some_and(|hash| hash.starts_with("sha256:")));
    drop(state);

    let after = read_session_detail_for(&core, &session_id);
    let approval_item = after["items"]
        .as_array()
        .expect("items")
        .iter()
        .find(|item| item["request_id"].as_str() == Some(request_id))
        .expect("approval item");
    assert_eq!(approval_item["type"].as_str(), Some("approval_request"));
    assert_eq!(
        approval_item["response"]["decision"].as_str(),
        Some("allow_for_session")
    );
    assert_eq!(
        approval_item["response"]["decision_scope"].as_str(),
        Some("session")
    );
}

#[tokio::test]
async fn browser_control_session_cache_does_not_cross_network_host_scope() {
    let session_id = format!("{SESSION_ID}_host_scope");
    let thread_id = format!("{THREAD_ID}_host_scope");
    let first_turn_id = format!("{TURN_ID}_host_scope_first");
    let second_turn_id = format!("{TURN_ID}_host_scope_second");
    let core = RuntimeCore::with_backend(Arc::new(RuntimeBackend::new()));
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.clone()),
        thread_id: Some(thread_id.clone()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-permission".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session_id.clone(),
            turn_id: Some(first_turn_id.clone()),
            input: AgentInput {
                text: "打开 example.com".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(browser_control_runtime_options_for_target(
                &session_id,
                &first_turn_id,
                "https://example.com/approval-session-cache?secret=hidden",
                DEFAULT_WORKING_DIR,
                DEFAULT_PROJECT_ROOT,
            )),
            queue_if_busy: false,
            skip_pre_submit_resume: true,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("first preflight should request permission");

    let before = read_thread_for(&core, &session_id);
    let request_id = before["permission_state"]["confirmation_request_id"]
        .as_str()
        .expect("confirmation request id");
    core.respond_action(
        AgentSessionActionRespondParams {
            session_id: session_id.clone(),
            request_id: request_id.to_string(),
            action_type: AgentSessionActionType::ToolConfirmation,
            decision: Some(AgentSessionApprovalDecision::AllowForSession),
            confirmed: None,
            response: Some("{\"answer\":\"本会话允许\"}".to_string()),
            user_data: Some(json!({ "answer": "本会话允许" })),
            metadata: None,
            event_name: None,
            action_scope: Some(AgentSessionActionScope {
                session_id: Some(session_id.clone()),
                thread_id: Some(thread_id.clone()),
                turn_id: Some(first_turn_id.clone()),
            }),
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("allow for session");
    complete_turn(&core, &session_id, &first_turn_id);

    let second = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session_id.clone(),
                turn_id: Some(second_turn_id.clone()),
                input: AgentInput {
                    text: "打开 other.example.com".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(browser_control_runtime_options_for_target(
                    &session_id,
                    &second_turn_id,
                    "https://other.example.com/approval-session-cache",
                    DEFAULT_WORKING_DIR,
                    DEFAULT_PROJECT_ROOT,
                )),
                queue_if_busy: false,
                skip_pre_submit_resume: true,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("different host must request permission again");

    assert_eq!(second.response.turn.status, AgentTurnStatus::WaitingAction);
    assert!(second
        .events
        .iter()
        .any(|event| event.event_type == "action.required"));
    assert!(!second
        .events
        .iter()
        .any(|event| event.event_type == "approval.session_cache.hit"));
    assert!(!second.events.iter().any(|event| {
        event.event_type == "action.resolved"
            && event.payload["source"].as_str() == Some("approval_session_cache")
    }));
}

#[tokio::test]
async fn browser_control_cancel_clears_session_cache() {
    let session_id = format!("{SESSION_ID}_cancel_cache");
    let thread_id = format!("{THREAD_ID}_cancel_cache");
    let turn_id = format!("{TURN_ID}_cancel_cache");
    let core = RuntimeCore::with_backend(Arc::new(RuntimeBackend::new()));
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.clone()),
        thread_id: Some(thread_id.clone()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-permission".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session_id.clone(),
            turn_id: Some(turn_id.clone()),
            input: AgentInput {
                text: "打开浏览器并执行需要权限的操作".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(browser_control_runtime_options_for(&session_id, &turn_id)),
            queue_if_busy: false,
            skip_pre_submit_resume: true,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("preflight should request permission");

    let before = read_thread_for(&core, &session_id);
    let request_id = before["permission_state"]["confirmation_request_id"]
        .as_str()
        .expect("confirmation request id");
    core.respond_action(
        AgentSessionActionRespondParams {
            session_id: session_id.clone(),
            request_id: request_id.to_string(),
            action_type: AgentSessionActionType::ToolConfirmation,
            decision: Some(AgentSessionApprovalDecision::AllowForSession),
            confirmed: None,
            response: Some("{\"answer\":\"本会话允许\"}".to_string()),
            user_data: Some(json!({ "answer": "本会话允许" })),
            metadata: None,
            event_name: None,
            action_scope: Some(AgentSessionActionScope {
                session_id: Some(session_id.clone()),
                thread_id: Some(thread_id.clone()),
                turn_id: Some(turn_id.clone()),
            }),
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("allow for session");
    {
        let state = core
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        assert!(state.session_approval_cache.contains_key(&session_id));
    }

    core.cancel_turn(
        AgentSessionTurnCancelParams {
            session_id: session_id.clone(),
            turn_id: turn_id.clone(),
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("cancel turn");

    let state = core
        .state
        .lock()
        .expect("runtime core state mutex poisoned");
    assert!(!state.session_approval_cache.contains_key(&session_id));
}

#[tokio::test]
async fn browser_control_preflight_cancel_stops_turn() {
    let core = RuntimeCore::with_backend(Arc::new(RuntimeBackend::new()));
    core.start_session(AgentSessionStartParams {
        session_id: Some(format!("{SESSION_ID}_cancel")),
        thread_id: Some(format!("{THREAD_ID}_cancel")),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-permission".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let started = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: format!("{SESSION_ID}_cancel"),
                turn_id: Some(format!("{TURN_ID}_cancel")),
                input: AgentInput {
                    text: "打开浏览器并执行需要权限的操作".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(browser_control_runtime_options_for(
                    &format!("{SESSION_ID}_cancel"),
                    &format!("{TURN_ID}_cancel"),
                )),
                queue_if_busy: false,
                skip_pre_submit_resume: true,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("preflight should not require provider selection");

    assert_eq!(started.response.turn.status, AgentTurnStatus::WaitingAction);

    let before = read_thread_for(&core, &format!("{SESSION_ID}_cancel"));
    let request_id = before["permission_state"]["confirmation_request_id"]
        .as_str()
        .expect("confirmation request id");

    let responded = core
        .respond_action(
            AgentSessionActionRespondParams {
                session_id: format!("{SESSION_ID}_cancel"),
                request_id: request_id.to_string(),
                action_type: AgentSessionActionType::ToolConfirmation,
                decision: Some(AgentSessionApprovalDecision::Cancel),
                confirmed: None,
                response: Some("{\"answer\":\"取消\"}".to_string()),
                user_data: Some(json!({ "answer": "取消" })),
                metadata: None,
                event_name: None,
                action_scope: Some(AgentSessionActionScope {
                    session_id: Some(format!("{SESSION_ID}_cancel")),
                    thread_id: Some(format!("{THREAD_ID}_cancel")),
                    turn_id: Some(format!("{TURN_ID}_cancel")),
                }),
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("cancel permission");

    assert_eq!(responded.events[0].event_type, "action.resolved");
    assert!(responded
        .events
        .iter()
        .any(|event| event.event_type == "turn.canceled"));

    let after = read_thread_for(&core, &format!("{SESSION_ID}_cancel"));
    assert_eq!(after["status"].as_str(), Some("canceled"));
    assert_eq!(
        after["runtime_summary"]["latestTurnStatus"].as_str(),
        Some("canceled")
    );
    assert_eq!(
        after["permission_state"]["confirmation_status"].as_str(),
        Some("denied")
    );
}

fn browser_control_runtime_options() -> RuntimeOptions {
    browser_control_runtime_options_for(SESSION_ID, TURN_ID)
}

fn browser_control_runtime_options_for(session_id: &str, turn_id: &str) -> RuntimeOptions {
    browser_control_runtime_options_for_target(
        session_id,
        turn_id,
        DEFAULT_BROWSER_LAUNCH_URL,
        DEFAULT_WORKING_DIR,
        DEFAULT_PROJECT_ROOT,
    )
}

fn browser_control_runtime_options_for_target(
    session_id: &str,
    turn_id: &str,
    launch_url: &str,
    working_dir: &str,
    project_root: &str,
) -> RuntimeOptions {
    let metadata = json!({
        "harness": {
            "browser_launch_url": launch_url,
            "browser_assist": {
                "runtime_contract": {
                    "contract_key": "browser_control",
                    "routing_slot": "browser_reasoning_model",
                    "execution_profile": {
                        "profile_key": "browser_control_profile"
                    },
                    "executor_adapter": {
                        "adapter_key": "browser:browser_assist"
                    },
                    "executor_binding": {
                        "executor_kind": "browser",
                        "binding_key": "browser_assist"
                    }
                }
            }
        }
    });
    RuntimeOptions {
        stream: true,
        event_name: Some(format!("aster_stream_{}_{}", session_id, turn_id)),
        metadata: Some(metadata.clone()),
        host_options: Some(json!({
            "asterChatRequest": {
                "message": "打开浏览器并执行需要权限的操作",
                "session_id": session_id,
                "workspace_id": "workspace-permission",
                "workingDir": working_dir,
                "projectRoot": project_root,
                "event_name": format!("aster_stream_{}_{}", session_id, turn_id),
                "turn_id": turn_id,
                "approval_policy": "on-request",
                "sandbox_policy": "workspace-write",
                "metadata": metadata,
                "execution_strategy": "react"
            }
        })),
        ..RuntimeOptions::default()
    }
}

fn complete_turn(core: &RuntimeCore, session_id: &str, turn_id: &str) {
    core.append_external_runtime_events(
        session_id,
        Some(turn_id),
        vec![RuntimeEvent::new(
            "turn.completed",
            json!({ "backend": "test" }),
        )],
    )
    .expect("complete turn");
}

fn read_thread(core: &RuntimeCore) -> serde_json::Value {
    read_thread_for(core, SESSION_ID)
}

fn read_thread_for(core: &RuntimeCore, session_id: &str) -> serde_json::Value {
    read_session_detail_for(core, session_id)["thread_read"].clone()
}

fn read_session_detail_for(core: &RuntimeCore, session_id: &str) -> serde_json::Value {
    core.read_session(AgentSessionReadParams {
        session_id: session_id.to_string(),
        history_limit: None,
        history_offset: None,
        history_before_message_id: None,
    })
    .expect("read session")
    .detail
    .expect("detail")
}
