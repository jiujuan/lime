use super::projection_repair::ProjectionRepair;
use super::projection_store::ProjectionReadSession;
use super::read_model;
use super::session_hydration;
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
        let response = self
            .app_data_source
            .read_current_timeline_session(params.clone())
            .await?;
        if let Some(response) = response {
            let stored = session_hydration::hydrated_stored_session_from_response(response.clone());
            return Ok(SessionLoadContext { response, stored });
        }
        self.backfill_legacy_agent_messages_for_session(&params.session_id)
            .await?;
        if let Some(context) = self.load_projection_session(&params)? {
            return Ok(context);
        }
        return Err(RuntimeCoreError::SessionNotFound(params.session_id));
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
        let detail = read_model::runtime_session_read_detail(&stored);
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
            .read_repaired_session(&params.session_id)
            .map_err(RuntimeCoreError::Backend)?
        else {
            return Ok(None);
        };
        Ok(Some(projection_load_context(projection, events)))
    }
}

pub(in crate::runtime) fn projection_load_context(
    projection: ProjectionReadSession,
    events: Vec<AgentEvent>,
) -> SessionLoadContext {
    let stored = StoredSession {
        session: projection.session,
        turns: projection.turns,
        turn_inputs: turn_input_events::turn_inputs_from_events(&events),
        turn_runtime_options: HashMap::new(),
        events,
        output_blobs: HashMap::new(),
    };
    let mut detail = read_model::runtime_session_read_detail(&stored);
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
