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
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub(in crate::runtime) struct SessionLoadContext {
    pub response: AgentSessionReadResponse,
    pub stored: StoredSession,
    pub workflow_audit_events: Vec<AgentEvent>,
}

impl RuntimeCore {
    pub(in crate::runtime) async fn load_session_current(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<SessionLoadContext, RuntimeCoreError> {
        if let Some(context) = self.load_runtime_core_session(&params)? {
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
    ) -> Result<Option<SessionLoadContext>, RuntimeCoreError> {
        let stored = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            state.sessions.get(&params.session_id).cloned()
        };
        let Some(stored) = stored else {
            return Ok(None);
        };
        let workflow_audit_events =
            self.read_workflow_audit_events_for_session(&params.session_id)?;
        let detail = read_model::runtime_session_read_detail_with_options(
            &stored,
            read_model::ReadDetailOptions::from_params(params),
            &workflow_audit_events,
        );
        let response = AgentSessionReadResponse {
            session: stored.session.clone(),
            turns: stored.turns.clone(),
            detail: Some(detail),
        };
        Ok(Some(SessionLoadContext {
            response,
            stored,
            workflow_audit_events,
        }))
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
        let workflow_audit_events =
            self.read_workflow_audit_events_for_session(&params.session_id)?;
        Ok(Some(projection_load_context(
            projection,
            events,
            params,
            workflow_audit_events,
        )))
    }

    async fn load_app_data_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<Option<SessionLoadContext>, RuntimeCoreError> {
        let session_id = params.session_id.clone();
        let Some(response) = self.app_data_source.read_agent_session(params).await? else {
            return Ok(None);
        };
        let stored =
            super::session_hydration::hydrated_stored_session_from_response(response.clone());
        let workflow_audit_events = self.read_workflow_audit_events_for_session(&session_id)?;
        Ok(Some(SessionLoadContext {
            response,
            stored,
            workflow_audit_events,
        }))
    }

    pub(in crate::runtime) fn read_workflow_audit_events_for_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
        self.event_log_writer
            .as_ref()
            .map(|writer| {
                writer
                    .read_session_workflow_audit_events(session_id)
                    .map(|records| {
                        records
                            .into_iter()
                            .map(|record| record.event)
                            .collect::<Vec<_>>()
                    })
                    .map_err(RuntimeCoreError::Backend)
            })
            .transpose()
            .map(|events| events.unwrap_or_default())
    }
}

pub(in crate::runtime) fn projection_load_context(
    projection: ProjectionReadSession,
    events: Vec<AgentEvent>,
    params: &AgentSessionReadParams,
    workflow_audit_events: Vec<AgentEvent>,
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
        projection_summary_detail(&stored, &projection, params, &workflow_audit_events)
    } else {
        read_model::runtime_session_read_detail_with_options(
            &stored,
            read_model::ReadDetailOptions::from_params(params),
            &workflow_audit_events,
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
    SessionLoadContext {
        response,
        stored,
        workflow_audit_events,
    }
}

fn projection_summary_detail(
    stored: &StoredSession,
    projection: &ProjectionReadSession,
    params: &AgentSessionReadParams,
    workflow_audit_events: &[AgentEvent],
) -> serde_json::Value {
    let messages = projection.messages.clone();
    let process_detail = projection_process_detail(stored, projection);
    let process_thread_read = process_detail
        .as_ref()
        .and_then(|detail| detail.get("thread_read"))
        .and_then(Value::as_object);
    let items = process_detail_array(process_detail.as_ref(), "items");
    let thread_items = items.clone();
    let artifacts = process_detail_array(process_detail.as_ref(), "artifacts");
    let outputs = process_detail_array(process_detail.as_ref(), "outputs");
    let pending_requests = process_thread_read_array(process_thread_read, "pending_requests");
    let tool_calls = process_thread_read_array(process_thread_read, "tool_calls");
    let commands = process_thread_read_array(process_thread_read, "commands");
    let tests = process_thread_read_array(process_thread_read, "tests");
    let active_turn_id = process_thread_read_value(process_thread_read, "active_turn_id");
    let change_summary = process_thread_read_value(process_thread_read, "change_summary");
    let active_command_id = process_thread_read_value(process_thread_read, "active_command_id");
    let active_test_run_id = process_thread_read_value(process_thread_read, "active_test_run_id");
    let active_action_id = process_thread_read_value(process_thread_read, "active_action_id");
    let model_routing = process_thread_read_value(process_thread_read, "model_routing");
    let service_model_slot = process_thread_read_value(process_thread_read, "service_model_slot");
    let diagnostics =
        process_thread_read_value(process_thread_read, "diagnostics").unwrap_or_else(|| {
            json!({
                "latest_turn_status": stored.turns.last().map(|turn| super::status::agent_turn_status_label(turn.status)),
                "latest_turn_error_message": null,
                "pending_request_count": 0,
                "command_count": 0,
                "test_count": 0,
                "changed_file_count": 0,
                "patch_count": 0,
            })
        });
    let runtime_summary = process_thread_read_value(process_thread_read, "runtime_summary")
        .unwrap_or_else(|| json!({}));
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
    let mut thread_read = serde_json::json!({
        "session_id": stored.session.session_id,
        "thread_id": stored.session.thread_id,
        "status": status,
        "turns": stored.turns,
        "pending_requests": pending_requests,
        "queued_turns": [],
        "active_turn_id": active_turn_id,
        "thread_items": thread_items,
        "tool_calls": tool_calls,
        "commands": commands,
        "tests": tests,
        "active_command_id": active_command_id,
        "active_test_run_id": active_test_run_id,
        "active_action_id": active_action_id,
        "change_summary": change_summary,
        "model_routing": model_routing,
        "service_model_slot": service_model_slot,
        "artifacts": process_thread_read_array(process_thread_read, "artifacts"),
        "outputs": process_thread_read_array(process_thread_read, "outputs"),
        "diagnostics": diagnostics,
        "runtime_summary": runtime_summary,
    });
    let workflow_read_model =
        read_model::workflow_read_model_from_stored_session(stored, workflow_audit_events);
    read_model::insert_workflow_read_model_into_thread_read(&mut thread_read, &workflow_read_model);
    let mut detail = serde_json::json!({
        "id": stored.session.session_id,
        "session_id": stored.session.session_id,
        "thread_id": stored.session.thread_id,
        "workspace_id": stored.session.workspace_id,
        "status": status,
        "working_dir": process_detail_value(process_detail.as_ref(), "working_dir"),
        "archived_at": process_detail_value(process_detail.as_ref(), "archived_at"),
        "execution_strategy": process_detail_value(process_detail.as_ref(), "execution_strategy"),
        "execution_runtime": process_detail_value(process_detail.as_ref(), "execution_runtime"),
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
        "items": items,
        "queued_turns": [],
        "artifacts": artifacts,
        "outputs": outputs,
        "thread_read": thread_read,
    });
    merge_process_detail_value(&mut detail, process_detail.as_ref(), "article_workspace");
    merge_process_detail_value(&mut detail, process_detail.as_ref(), "articleWorkspace");
    merge_process_thread_read_value(&mut detail, process_thread_read, "article_workspace");
    merge_process_thread_read_value(&mut detail, process_thread_read, "articleWorkspace");
    merge_process_thread_read_value(
        &mut detail,
        process_thread_read,
        "article_workspace_actions",
    );
    merge_process_thread_read_value(&mut detail, process_thread_read, "articleWorkspaceActions");
    detail
}

fn projection_process_detail(
    stored: &StoredSession,
    projection: &ProjectionReadSession,
) -> Option<Value> {
    if projection.item_events.is_empty() {
        return None;
    }
    let process_stored = StoredSession {
        session: stored.session.clone(),
        turns: stored.turns.clone(),
        turn_inputs: HashMap::new(),
        turn_runtime_options: HashMap::new(),
        events: projection.item_events.clone(),
        output_blobs: HashMap::new(),
    };
    Some(read_model::runtime_session_read_detail_with_options(
        &process_stored,
        read_model::ReadDetailOptions::default(),
        &[],
    ))
}

fn process_detail_array(detail: Option<&Value>, key: &str) -> Value {
    detail
        .and_then(|detail| detail.get(key))
        .filter(|value| value.is_array())
        .cloned()
        .unwrap_or_else(|| json!([]))
}

fn process_detail_value(detail: Option<&Value>, key: &str) -> Value {
    detail
        .and_then(|detail| detail.get(key))
        .cloned()
        .unwrap_or(Value::Null)
}

fn process_thread_read_array(
    thread_read: Option<&serde_json::Map<String, Value>>,
    key: &str,
) -> Value {
    process_thread_read_value(thread_read, key)
        .filter(|value| value.is_array())
        .unwrap_or_else(|| json!([]))
}

fn process_thread_read_value(
    thread_read: Option<&serde_json::Map<String, Value>>,
    key: &str,
) -> Option<Value> {
    thread_read
        .and_then(|thread_read| thread_read.get(key))
        .cloned()
}

fn merge_process_detail_value(detail: &mut Value, process_detail: Option<&Value>, key: &str) {
    let Some(value) = process_detail.and_then(|detail| detail.get(key)).cloned() else {
        return;
    };
    let Some(detail_object) = detail.as_object_mut() else {
        return;
    };
    detail_object.insert(key.to_string(), value);
}

fn merge_process_thread_read_value(
    detail: &mut Value,
    process_thread_read: Option<&serde_json::Map<String, Value>>,
    key: &str,
) {
    let Some(value) = process_thread_read
        .and_then(|thread_read| thread_read.get(key))
        .cloned()
    else {
        return;
    };
    let Some(thread_read) = detail.get_mut("thread_read").and_then(Value::as_object_mut) else {
        return;
    };
    thread_read.insert(key.to_string(), value);
}
