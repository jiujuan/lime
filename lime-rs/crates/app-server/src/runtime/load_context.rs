use super::projection_repair::ProjectionRepair;
use super::projection_store::ProjectionReadSession;
use super::projection_store::ProjectionReadWindow;
use super::read_model;
use super::turn_input_events;
use super::RuntimeCore;
use super::RuntimeCoreError;
use super::StoredSession;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionReadResponse;
use serde_json::json;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub(in crate::runtime) struct SessionLoadContext {
    pub response: AgentSessionReadResponse,
    pub stored: StoredSession,
}

impl RuntimeCore {
    pub(in crate::runtime) async fn load_session_current(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<SessionLoadContext, RuntimeCoreError> {
        if let Some(context) = self.load_runtime_core_session(&params) {
            return Ok(context);
        }
        if let Some(context) = self.load_projection_session(&params)? {
            return Ok(context);
        }
        if let Some(context) = self.load_app_data_session(params.clone()).await? {
            return Ok(context);
        }
        Err(RuntimeCoreError::SessionNotFound(params.session_id))
    }

    fn load_runtime_core_session(
        &self,
        params: &AgentSessionReadParams,
    ) -> Option<SessionLoadContext> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state.sessions.get(&params.session_id)?.clone();
        let detail = read_model::runtime_session_read_detail_with_options(
            &stored,
            read_model::ReadDetailOptions::from_params(params),
        );
        let response = AgentSessionReadResponse {
            session: stored.session.clone(),
            turns: stored.turns.clone(),
            detail: Some(detail),
        };
        Some(SessionLoadContext { response, stored })
    }

    fn load_projection_session(
        &self,
        params: &AgentSessionReadParams,
    ) -> Result<Option<SessionLoadContext>, RuntimeCoreError> {
        let (Some(event_log_writer), Some(projection_store)) = (
            self.event_log_writer.as_ref(),
            self.projection_store.as_ref(),
        ) else {
            return Ok(None);
        };
        let repair =
            ProjectionRepair::new((**event_log_writer).clone(), (**projection_store).clone());
        let Some((projection, events)) = repair
            .read_repaired_session(
                &params.session_id,
                params
                    .history_limit
                    .map(|_| ProjectionReadWindow::from_read_params(params)),
            )
            .map_err(RuntimeCoreError::Backend)?
        else {
            return Ok(None);
        };
        Ok(Some(projection_load_context(projection, events, params)))
    }

    async fn load_app_data_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<Option<SessionLoadContext>, RuntimeCoreError> {
        let Some(response) = self.app_data_source.read_agent_session(params).await? else {
            return Ok(None);
        };
        let stored =
            super::session_hydration::hydrated_stored_session_from_response(response.clone());
        Ok(Some(SessionLoadContext { response, stored }))
    }
}

pub(in crate::runtime) fn projection_load_context(
    projection: ProjectionReadSession,
    events: Vec<AgentEvent>,
    params: &AgentSessionReadParams,
) -> SessionLoadContext {
    let stored = StoredSession {
        session: projection.session.clone(),
        turns: projection.turns.clone(),
        turn_inputs: turn_input_events::turn_inputs_from_events(&events),
        turn_runtime_options: HashMap::new(),
        events,
        output_blobs: HashMap::new(),
    };
    let mut detail = if stored.events.is_empty() && params.history_limit.is_some() {
        projection_summary_detail(&stored, &projection, params)
    } else {
        read_model::runtime_session_read_detail_with_options(
            &stored,
            read_model::ReadDetailOptions::from_params(params),
        )
    };
    if let Some(detail_object) = detail.as_object_mut() {
        detail_object.insert(
            "projection_source".to_string(),
            json!("runtime.projection_1"),
        );
        detail_object.insert(
            "projection_item_count".to_string(),
            json!(projection.item_count),
        );
        detail_object.insert(
            "projection_last_event_sequence".to_string(),
            json!(projection.last_event_sequence),
        );
    }
    let response = AgentSessionReadResponse {
        session: stored.session.clone(),
        turns: stored.turns.clone(),
        detail: Some(detail),
    };
    SessionLoadContext { response, stored }
}

fn projection_summary_detail(
    stored: &StoredSession,
    projection: &ProjectionReadSession,
    params: &AgentSessionReadParams,
) -> serde_json::Value {
    let messages = projection.messages.clone();
    let loaded_count = messages.len();
    let messages_count = projection.messages_count;
    let history_limit = params
        .history_limit
        .map(|value| value as usize)
        .unwrap_or(messages_count);
    let history_offset = params.history_offset.unwrap_or_default() as usize;
    let start_index = projection.messages_start_index;
    let oldest_message_id = messages.first().and_then(|message| {
        message.get("id").and_then(|value| match value {
            serde_json::Value::Number(number) => number.as_i64(),
            serde_json::Value::String(value) => value.parse::<i64>().ok(),
            _ => None,
        })
    });
    let status = super::status::agent_session_status_label(stored.session.status);
    serde_json::json!({
        "id": stored.session.session_id,
        "session_id": stored.session.session_id,
        "thread_id": stored.session.thread_id,
        "workspace_id": stored.session.workspace_id,
        "status": status,
        "working_dir": null,
        "archived_at": null,
        "execution_strategy": null,
        "execution_runtime": null,
        "messages_count": messages_count,
        "history_limit": history_limit,
        "history_offset": history_offset,
        "history_cursor": {
            "oldest_message_id": oldest_message_id,
            "start_index": start_index,
            "loaded_count": loaded_count,
        },
        "history_truncated": loaded_count < messages_count,
        "messages": messages,
        "turns": stored.turns,
        "items": [],
        "queued_turns": [],
        "artifacts": [],
        "outputs": [],
        "thread_read": {
            "session_id": stored.session.session_id,
            "thread_id": stored.session.thread_id,
            "status": status,
            "turns": stored.turns,
            "pending_requests": [],
            "queued_turns": [],
            "tool_calls": [],
            "commands": [],
            "tests": [],
            "artifacts": [],
            "outputs": [],
            "diagnostics": {
                "latest_turn_status": stored.turns.last().map(|turn| super::status::agent_turn_status_label(turn.status)),
                "latest_turn_error_message": null,
                "pending_request_count": 0,
                "command_count": 0,
                "test_count": 0,
                "changed_file_count": 0,
                "patch_count": 0,
            },
            "runtime_summary": {},
        },
    })
}
