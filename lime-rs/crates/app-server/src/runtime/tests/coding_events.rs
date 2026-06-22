use super::support::*;
use super::*;
use app_server_protocol::AgentSessionFileCheckpointDiffParams;
use app_server_protocol::AgentSessionFileCheckpointGetParams;
use app_server_protocol::AgentSessionFileCheckpointListParams;
use app_server_protocol::AgentSessionFileCheckpointRestoreParams;
use app_server_protocol::ArtifactContentStatus;
use app_server_protocol::ArtifactReadParams;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

async fn runtime_with_active_turn(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> (RuntimeCore, String, String) {
    runtime_with_active_turn_using_core(RuntimeCore::default(), session_id, thread_id, turn_id)
        .await
}

async fn runtime_with_active_turn_using_core(
    core: RuntimeCore,
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> (RuntimeCore, String, String) {
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some(session_id.to_string()),
            thread_id: Some(thread_id.to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;
    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some(turn_id.to_string()),
                input: AgentInput {
                    text: "update the project".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn");

    (core, session.session_id, output.response.turn.turn_id)
}

fn unique_temp_dir(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "{name}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos()
    ))
}

fn read_session(core: &RuntimeCore, session_id: &str) -> AgentSessionReadResponse {
    core.read_session(AgentSessionReadParams {
        session_id: session_id.to_string(),
        history_limit: None,
        history_offset: None,
        history_before_message_id: None,
    })
    .expect("read session")
}

fn event_count(core: &RuntimeCore, session_id: &str) -> usize {
    core.events_for_session(session_id)
        .expect("events for session")
        .len()
}

mod checkpoint_api;
mod lifecycle;
mod output_snapshots;
mod validation;
