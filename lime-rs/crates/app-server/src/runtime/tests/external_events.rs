use super::*;

async fn runtime_with_active_turn(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> (RuntimeCore, String, String) {
    let core = RuntimeCore::default();
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
                    text: "hello".to_string(),
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

fn assert_runtime_state_unchanged(
    core: &RuntimeCore,
    session_id: &str,
    before: &AgentSessionReadResponse,
    before_event_count: usize,
) {
    let after = core
        .read_session(AgentSessionReadParams {
            session_id: session_id.to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read after");
    let after_event_count = core
        .events_for_session(session_id)
        .expect("events after")
        .len();

    assert_eq!(after_event_count, before_event_count);
    assert_eq!(after.turns[0].status, before.turns[0].status);
    assert_eq!(after.session.status, before.session.status);
}

mod actions;
mod owner_terminal;
mod sequence;
mod tool_lifecycle;
