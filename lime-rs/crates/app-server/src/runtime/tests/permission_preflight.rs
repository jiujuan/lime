use super::*;
use crate::RuntimeBackend;
use std::sync::Arc;

const SESSION_ID: &str = "sess_permission_preflight";
const THREAD_ID: &str = "thread_permission_preflight";
const TURN_ID: &str = "turn_permission_preflight";

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

    let responded = core
        .respond_action(
            AgentSessionActionRespondParams {
                session_id: SESSION_ID.to_string(),
                request_id: request_id.to_string(),
                action_type: AgentSessionActionType::Elicitation,
                confirmed: false,
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
        .expect("deny permission");

    assert_eq!(responded.events[0].event_type, "action.resolved");
    assert_eq!(responded.events[1].event_type, "turn.canceled");

    let after = read_thread(&core);
    assert_eq!(after["status"].as_str(), Some("canceled"));
    assert_eq!(
        after["runtime_summary"]["latestTurnStatus"].as_str(),
        Some("canceled")
    );
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

fn browser_control_runtime_options() -> RuntimeOptions {
    let metadata = json!({
        "harness": {
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
        event_name: Some(format!("aster_stream_{}_{}", SESSION_ID, TURN_ID)),
        metadata: Some(metadata.clone()),
        host_options: Some(json!({
            "asterChatRequest": {
                "message": "打开浏览器并执行需要权限的操作",
                "session_id": SESSION_ID,
                "workspace_id": "workspace-permission",
                "event_name": format!("aster_stream_{}_{}", SESSION_ID, TURN_ID),
                "turn_id": TURN_ID,
                "approval_policy": "on-request",
                "sandbox_policy": "workspace-write",
                "metadata": metadata,
                "execution_strategy": "react"
            }
        })),
        ..RuntimeOptions::default()
    }
}

fn read_thread(core: &RuntimeCore) -> serde_json::Value {
    core.read_session(AgentSessionReadParams {
        session_id: SESSION_ID.to_string(),
        history_limit: None,
        history_offset: None,
        history_before_message_id: None,
    })
    .expect("read session")
    .detail
    .expect("detail")["thread_read"]
        .clone()
}
