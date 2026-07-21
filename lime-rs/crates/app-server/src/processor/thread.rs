mod projection;

use super::{
    dispatch_result, parse_params, to_jsonrpc_error, ConnectionRequestId, RequestProcessor,
    RpcDispatch,
};
use app_server_protocol::protocol::v2::{
    ServerNotification, SortDirection, Thread, ThreadArchiveParams, ThreadArchiveResponse,
    ThreadArchivedNotification, ThreadHistoryMode, ThreadItem, ThreadItemsListParams,
    ThreadListParams, ThreadReadParams, ThreadResumeParams, ThreadResumeResponse,
    ThreadStartParams, ThreadStartResponse, ThreadStatus, ThreadTurnsListParams,
    ThreadUnarchiveParams, ThreadUnarchiveResponse, ThreadUnarchivedNotification, Turn,
    TurnItemsView, TurnStatus, TurnsPage,
};
use app_server_protocol::{
    error_codes, AgentSessionStartParams, BusinessObjectRef, JsonRpcError, JsonRpcNotification,
};
use projection::{
    lower_thread_items_list_params, lower_thread_list_params, lower_thread_read_params,
    lower_thread_turns_list_params, project_thread_items_list_response,
    project_thread_list_response, project_thread_read_response, project_thread_turns_list_response,
};
use serde_json::json;
use uuid::Uuid;

pub(super) enum ProjectedEvent {
    Thread(Thread),
    Turn(Turn),
    Item(ThreadItem),
}

pub(super) fn project_event(event: &app_server_protocol::AgentEvent) -> Option<ProjectedEvent> {
    projection::project_event(event)
}

impl RequestProcessor {
    pub(super) async fn handle_thread_archive_v2(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadArchiveParams = parse_params(params)?;
        let thread_id = required_thread_value(&params.thread_id, "thread/archive")?;
        let changed = self
            .runtime
            .archive_thread(agent_protocol::ThreadId::new(thread_id.clone()))
            .await
            .map_err(to_jsonrpc_error)?;
        let dispatch = dispatch_result(ThreadArchiveResponse {})?;
        if !changed {
            return Ok(dispatch);
        }
        let notification: JsonRpcNotification =
            ServerNotification::ThreadArchived(ThreadArchivedNotification { thread_id }).into();
        Ok(dispatch.with_notification(notification))
    }

    pub(super) async fn handle_thread_unarchive_v2(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadUnarchiveParams = parse_params(params)?;
        let thread_id = required_thread_value(&params.thread_id, "thread/unarchive")?;
        let (thread, changed) = self
            .runtime
            .unarchive_thread(agent_protocol::ThreadId::new(thread_id.clone()))
            .await
            .map_err(to_jsonrpc_error)?;
        let thread =
            project_thread_read_response(agent_protocol::thread::ThreadReadResponse { thread })?
                .thread;
        let dispatch = dispatch_result(ThreadUnarchiveResponse { thread })?;
        if !changed {
            return Ok(dispatch);
        }
        let notification: JsonRpcNotification =
            ServerNotification::ThreadUnarchived(ThreadUnarchivedNotification { thread_id }).into();
        Ok(dispatch.with_notification(notification))
    }

    pub(super) async fn handle_thread_start_v2(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadStartParams = parse_params(params)?;
        let model = required_thread_start_value(params.model.as_deref(), "model")?;
        let model_provider =
            required_thread_start_value(params.model_provider.as_deref(), "modelProvider")?;
        let cwd = params.cwd.clone().unwrap_or_default();
        let history_mode = params.history_mode.clone().unwrap_or_default();
        let source = params
            .thread_source
            .clone()
            .unwrap_or_else(|| "appServer".to_string());
        let session_id = format!("sess_{}", Uuid::new_v4().simple());
        let thread_id = format!("thread_{}", Uuid::new_v4().simple());
        let metadata = json!({
            "providerSelector": model_provider.clone(),
            "providerName": model_provider.clone(),
            "modelName": model.clone(),
            "workingDir": cwd.clone(),
            "historyMode": history_mode,
            "source": source,
            "threadSource": params.thread_source,
            "ephemeral": params.ephemeral.unwrap_or(false),
            "runtimeWorkspaceRoots": params.runtime_workspace_roots,
            "serviceTier": params.service_tier,
            "approvalPolicy": params.approval_policy,
            "approvalsReviewer": params.approvals_reviewer,
            "sandbox": params.sandbox,
            "permissions": params.permissions,
            "config": params.config,
            "baseInstructions": params.base_instructions,
            "developerInstructions": params.developer_instructions,
            "personality": params.personality,
            "multiAgentMode": params.multi_agent_mode,
            "sessionStartSource": params.session_start_source,
            "environments": params.environments,
            "dynamicTools": params.dynamic_tools,
            "selectedCapabilityRoots": params.selected_capability_roots,
            "allowProviderModelFallback": params.allow_provider_model_fallback,
            "experimentalRawEvents": params.experimental_raw_events,
            "cliVersion": env!("CARGO_PKG_VERSION"),
        });
        self.runtime
            .start_session(AgentSessionStartParams {
                session_id: Some(session_id.clone()),
                thread_id: Some(thread_id.clone()),
                app_id: "agent-chat".to_string(),
                workspace_id: None,
                business_object_ref: Some(BusinessObjectRef {
                    kind: "agent.thread".to_string(),
                    id: thread_id.clone(),
                    title: params.service_name.clone(),
                    uri: None,
                    metadata: Some(metadata.clone()),
                }),
                locale: None,
            })
            .map_err(to_jsonrpc_error)?;
        let thread = self
            .runtime
            .read_thread(agent_protocol::thread::ThreadReadParams {
                thread_id: agent_protocol::ThreadId::new(thread_id),
                turns_view: agent_protocol::ThreadTurnsView::NotLoaded,
            })
            .await
            .map_err(to_jsonrpc_error)?;
        let thread = project_thread_read_response(thread)?.thread;
        let thread_started = JsonRpcNotification::new(
            "thread/started",
            Some(serde_json::json!({ "thread": thread.clone() })),
        );
        dispatch_result(ThreadStartResponse {
            thread,
            model,
            model_provider,
            service_tier: metadata_optional_string(&metadata, "serviceTier"),
            cwd,
            runtime_workspace_roots: metadata_string_array(&metadata, "runtimeWorkspaceRoots"),
            instruction_sources: Vec::new(),
            approval_policy: metadata
                .get("approvalPolicy")
                .cloned()
                .unwrap_or(serde_json::Value::Null),
            approvals_reviewer: metadata
                .get("approvalsReviewer")
                .cloned()
                .unwrap_or(serde_json::Value::Null),
            sandbox: metadata
                .get("sandbox")
                .cloned()
                .unwrap_or(serde_json::Value::Null),
            active_permission_profile: None,
            reasoning_effort: None,
            multi_agent_mode: metadata
                .get("multiAgentMode")
                .cloned()
                .unwrap_or(serde_json::Value::Null),
        })
        .map(|dispatch| dispatch.with_notification(thread_started))
    }

    pub(super) async fn handle_thread_resume_v2(
        &self,
        params: Option<serde_json::Value>,
        _connection_request_id: Option<ConnectionRequestId>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadResumeParams = parse_params(params)?;
        validate_thread_resume_params(&params)?;
        let thread_id = required_thread_resume_value(&params.thread_id, "threadId")?;
        let resumed = self
            .runtime
            .resume_thread(agent_protocol::ThreadId::new(thread_id.clone()))
            .await
            .map_err(to_jsonrpc_error)?;
        if resumed.thread.archived {
            return Err(invalid_request(format!(
                "thread/resume cannot resume archived thread {thread_id}"
            )));
        }

        let active_turn_id = resumed
            .active_turn_id
            .as_ref()
            .map(agent_protocol::TurnId::as_str);
        let mut metadata_only =
            project_thread_read_response(agent_protocol::thread::ThreadReadResponse {
                thread: resumed.thread,
            })?
            .thread;
        normalize_thread_resume_snapshot(&mut metadata_only, active_turn_id);
        if matches!(metadata_only.history_mode, ThreadHistoryMode::Paginated) {
            if !params.exclude_turns {
                return Err(invalid_request(
                    "thread/resume requires excludeTurns=true for paginated history",
                ));
            }
            if params.initial_turns_page.is_some() {
                return Err(invalid_request(
                    "thread/resume initialTurnsPage is not supported for paginated history",
                ));
            }
        }

        let mut thread = if params.exclude_turns {
            metadata_only
        } else {
            let response = self
                .runtime
                .read_thread(agent_protocol::thread::ThreadReadParams {
                    thread_id: agent_protocol::ThreadId::new(thread_id.clone()),
                    turns_view: agent_protocol::ThreadTurnsView::Full,
                })
                .await
                .map_err(to_jsonrpc_error)?;
            project_thread_read_response(response)?.thread
        };
        normalize_thread_resume_snapshot(&mut thread, active_turn_id);
        let mut initial_turns_page = self
            .build_thread_resume_initial_turns_page(&thread_id, params.initial_turns_page.as_ref())
            .await?;
        if let Some(page) = initial_turns_page.as_mut() {
            normalize_resume_turns(&mut page.data, active_turn_id);
        }
        let metadata = thread.extra.as_ref().unwrap_or(&serde_json::Value::Null);
        let model = required_metadata_string(metadata, &["modelName", "model"], "model")?;
        let model_provider = required_thread_resume_value(&thread.model_provider, "modelProvider")?;

        dispatch_result(ThreadResumeResponse {
            service_tier: metadata_optional_string(metadata, "serviceTier"),
            cwd: thread.cwd.clone(),
            runtime_workspace_roots: metadata_string_array(metadata, "runtimeWorkspaceRoots"),
            instruction_sources: metadata_string_array(metadata, "instructionSources"),
            approval_policy: metadata_value(metadata, "approvalPolicy"),
            approvals_reviewer: metadata_value(metadata, "approvalsReviewer"),
            sandbox: metadata_value(metadata, "sandbox"),
            active_permission_profile: metadata
                .get("activePermissionProfile")
                .filter(|value| !value.is_null())
                .cloned(),
            reasoning_effort: metadata_optional_string(metadata, "reasoningEffort"),
            multi_agent_mode: metadata_value(metadata, "multiAgentMode"),
            initial_turns_page,
            turns_backwards_cursor: None,
            items_backwards_cursor: None,
            thread,
            model,
            model_provider,
        })
    }

    async fn build_thread_resume_initial_turns_page(
        &self,
        thread_id: &str,
        params: Option<&app_server_protocol::protocol::v2::ThreadResumeInitialTurnsPageParams>,
    ) -> Result<Option<TurnsPage>, JsonRpcError> {
        let Some(params) = params else {
            return Ok(None);
        };
        let response = self
            .runtime
            .list_thread_turns(lower_thread_turns_list_params(&ThreadTurnsListParams {
                thread_id: thread_id.to_string(),
                cursor: None,
                limit: Some(params.limit.unwrap_or(25).clamp(1, 100)),
                sort_direction: Some(params.sort_direction.unwrap_or(SortDirection::Desc)),
                items_view: Some(params.items_view.unwrap_or(TurnItemsView::Summary)),
            })?)
            .await
            .map_err(to_jsonrpc_error)?;
        let response = project_thread_turns_list_response(response)?;
        Ok(Some(TurnsPage {
            data: response.data,
            next_cursor: response.next_cursor,
            backwards_cursor: response.backwards_cursor,
        }))
    }

    pub(super) async fn handle_thread_read_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_thread(lower_thread_read_params(&params)?)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(project_thread_read_response(response)?)
    }

    pub(super) async fn handle_thread_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_threads(lower_thread_list_params(&params)?)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(project_thread_list_response(response, &params)?)
    }

    pub(super) async fn handle_thread_turns_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadTurnsListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_thread_turns(lower_thread_turns_list_params(&params)?)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(project_thread_turns_list_response(response)?)
    }

    pub(super) async fn handle_thread_items_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadItemsListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_thread_items(lower_thread_items_list_params(&params)?)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(project_thread_items_list_response(response)?)
    }
}

fn normalize_thread_resume_snapshot(thread: &mut Thread, active_turn_id: Option<&str>) {
    let active_flags = match thread.status.as_ref() {
        Some(ThreadStatus::Active { active_flags }) => active_flags.clone(),
        _ => Vec::new(),
    };
    thread.status = match active_turn_id {
        Some(_) => Some(ThreadStatus::Active { active_flags }),
        None if matches!(thread.status, Some(ThreadStatus::SystemError)) => {
            Some(ThreadStatus::SystemError)
        }
        None => Some(ThreadStatus::Idle),
    };
    normalize_resume_turns(&mut thread.turns, active_turn_id);
}

fn normalize_resume_turns(turns: &mut [Turn], active_turn_id: Option<&str>) {
    for turn in turns {
        if active_turn_id == Some(turn.id.as_str()) {
            turn.status = TurnStatus::InProgress;
        } else if matches!(turn.status, TurnStatus::InProgress) {
            turn.status = TurnStatus::Interrupted;
        }
    }
}

fn required_thread_start_value(value: Option<&str>, field: &str) -> Result<String, JsonRpcError> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| {
            JsonRpcError::new(
                error_codes::INVALID_PARAMS,
                format!("thread/start requires a non-empty {field}"),
            )
        })
}

fn required_thread_value(value: &str, method: &str) -> Result<String, JsonRpcError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(JsonRpcError::new(
            error_codes::INVALID_PARAMS,
            format!("{method} requires a non-empty threadId"),
        ));
    }
    Ok(value.to_string())
}

fn validate_thread_resume_params(params: &ThreadResumeParams) -> Result<(), JsonRpcError> {
    required_thread_resume_value(&params.thread_id, "threadId")?;
    if params.permissions.is_some() && params.sandbox.is_some() {
        return Err(invalid_request(
            "thread/resume cannot specify both permissions and sandbox",
        ));
    }
    if let Some(history) = params.history.as_ref() {
        if history.is_empty() {
            return Err(invalid_request(
                "thread/resume history must contain at least one item",
            ));
        }
        return Err(invalid_request(
            "thread/resume history is not implemented by the current runtime boundary",
        ));
    }
    if params
        .path
        .as_deref()
        .is_some_and(|path| !path.trim().is_empty())
    {
        return Err(invalid_request(
            "thread/resume path is not implemented by the current runtime boundary",
        ));
    }

    let unsupported = [
        (params.model.is_some(), "model"),
        (params.model_provider.is_some(), "modelProvider"),
        (params.service_tier.is_some(), "serviceTier"),
        (params.cwd.is_some(), "cwd"),
        (
            params.runtime_workspace_roots.is_some(),
            "runtimeWorkspaceRoots",
        ),
        (params.approval_policy.is_some(), "approvalPolicy"),
        (params.approvals_reviewer.is_some(), "approvalsReviewer"),
        (params.sandbox.is_some(), "sandbox"),
        (params.permissions.is_some(), "permissions"),
        (params.config.is_some(), "config"),
        (params.base_instructions.is_some(), "baseInstructions"),
        (
            params.developer_instructions.is_some(),
            "developerInstructions",
        ),
        (params.personality.is_some(), "personality"),
    ];
    if let Some((_, field)) = unsupported.into_iter().find(|(present, _)| *present) {
        return Err(invalid_request(format!(
            "thread/resume {field} override is not implemented by the current runtime boundary"
        )));
    }
    Ok(())
}

fn required_thread_resume_value(value: &str, field: &str) -> Result<String, JsonRpcError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(JsonRpcError::new(
            error_codes::INVALID_PARAMS,
            format!("thread/resume requires a non-empty {field}"),
        ));
    }
    Ok(value.to_string())
}

fn required_metadata_string(
    metadata: &serde_json::Value,
    keys: &[&str],
    field: &str,
) -> Result<String, JsonRpcError> {
    keys.iter()
        .find_map(|key| metadata_optional_string(metadata, key))
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            invalid_request(format!(
                "thread/resume persisted thread is missing a non-empty {field}"
            ))
        })
}

fn invalid_request(message: impl Into<String>) -> JsonRpcError {
    JsonRpcError::new(error_codes::INVALID_REQUEST, message)
}

fn metadata_optional_string(metadata: &serde_json::Value, key: &str) -> Option<String> {
    metadata
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(ToString::to_string)
}

fn metadata_string_array(metadata: &serde_json::Value, key: &str) -> Vec<String> {
    metadata
        .get(key)
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .map(ToString::to_string)
        .collect()
}

fn metadata_value(metadata: &serde_json::Value, key: &str) -> serde_json::Value {
    metadata
        .get(key)
        .cloned()
        .unwrap_or(serde_json::Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thread(status: Option<ThreadStatus>, turns: Vec<Turn>) -> Thread {
        Thread {
            id: "thread-1".to_string(),
            extra: None,
            session_id: "session-1".to_string(),
            forked_from_id: None,
            parent_thread_id: None,
            preview: String::new(),
            ephemeral: false,
            history_mode: ThreadHistoryMode::Legacy,
            model_provider: "provider".to_string(),
            created_at: 1,
            updated_at: 1,
            recency_at: None,
            status,
            path: None,
            cwd: String::new(),
            cli_version: String::new(),
            source: "appServer".to_string(),
            thread_source: None,
            agent_nickname: None,
            agent_role: None,
            git_info: None,
            name: None,
            turns,
        }
    }

    fn turn(id: &str, status: TurnStatus) -> Turn {
        Turn {
            id: id.to_string(),
            items: Vec::new(),
            items_view: TurnItemsView::NotLoaded,
            status,
            error: None,
            started_at: None,
            completed_at: None,
            duration_ms: None,
        }
    }

    #[test]
    fn resume_snapshot_keeps_live_turn_in_progress_and_thread_active() {
        let mut snapshot = thread(
            Some(ThreadStatus::Idle),
            vec![turn("turn-live", TurnStatus::InProgress)],
        );

        normalize_thread_resume_snapshot(&mut snapshot, Some("turn-live"));

        assert_eq!(
            snapshot.status,
            Some(ThreadStatus::Active {
                active_flags: Vec::new(),
            })
        );
        assert_eq!(snapshot.turns[0].status, TurnStatus::InProgress);
    }

    #[test]
    fn resume_snapshot_interrupts_non_active_stale_turn() {
        let mut snapshot = thread(
            Some(ThreadStatus::Active {
                active_flags: Vec::new(),
            }),
            vec![
                turn("turn-stale", TurnStatus::InProgress),
                turn("turn-live", TurnStatus::InProgress),
            ],
        );

        normalize_thread_resume_snapshot(&mut snapshot, Some("turn-live"));

        assert_eq!(snapshot.turns[0].status, TurnStatus::Interrupted);
        assert_eq!(snapshot.turns[1].status, TurnStatus::InProgress);
    }

    #[test]
    fn resume_snapshot_without_live_turn_is_idle_but_preserves_system_error() {
        let mut idle_snapshot = thread(
            Some(ThreadStatus::Active {
                active_flags: Vec::new(),
            }),
            vec![turn("turn-stale", TurnStatus::InProgress)],
        );
        let mut error_snapshot = thread(Some(ThreadStatus::SystemError), Vec::new());

        normalize_thread_resume_snapshot(&mut idle_snapshot, None);
        normalize_thread_resume_snapshot(&mut error_snapshot, None);

        assert_eq!(idle_snapshot.status, Some(ThreadStatus::Idle));
        assert_eq!(idle_snapshot.turns[0].status, TurnStatus::Interrupted);
        assert_eq!(error_snapshot.status, Some(ThreadStatus::SystemError));
    }
}
