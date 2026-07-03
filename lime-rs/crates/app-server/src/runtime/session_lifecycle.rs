use super::article_workspace_edited_draft;
use super::read_model;
use super::session_list_scope::normalize_cwd_values;
use super::session_list_scope::SessionListScope;
use super::session_title;
use super::*;
use app_server_protocol::*;
use serde_json::json;
use std::collections::{HashMap, HashSet};

fn stored_session_to_overview(stored: &StoredSession) -> AgentSessionOverview {
    let session = &stored.session;
    let explicit_title = session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.title.clone())
        .or_else(|| {
            session
                .business_object_ref
                .as_ref()
                .and_then(|reference| metadata_string(reference.metadata.as_ref(), "title"))
        });
    let first_user_message = first_user_message_from_stored_session(stored);
    AgentSessionOverview {
        session_id: session.session_id.clone(),
        thread_id: Some(session.thread_id.clone()),
        title: session_title::resolve_session_title(explicit_title, first_user_message),
        business_object_ref_metadata: session
            .business_object_ref
            .as_ref()
            .and_then(|reference| reference.metadata.clone()),
        model: session
            .business_object_ref
            .as_ref()
            .and_then(|reference| metadata_string(reference.metadata.as_ref(), "model"))
            .or_else(|| {
                session
                    .business_object_ref
                    .as_ref()
                    .and_then(|reference| metadata_string(reference.metadata.as_ref(), "modelName"))
            })
            .unwrap_or_default(),
        created_at: session.created_at.clone(),
        updated_at: session.updated_at.clone(),
        archived_at: None,
        workspace_id: session.workspace_id.clone(),
        working_dir: session
            .business_object_ref
            .as_ref()
            .and_then(|reference| metadata_string(reference.metadata.as_ref(), "workingDir"))
            .or_else(|| {
                session.business_object_ref.as_ref().and_then(|reference| {
                    metadata_string(reference.metadata.as_ref(), "working_dir")
                })
            }),
        execution_strategy: session
            .business_object_ref
            .as_ref()
            .and_then(|reference| metadata_string(reference.metadata.as_ref(), "executionStrategy"))
            .or_else(|| {
                session.business_object_ref.as_ref().and_then(|reference| {
                    metadata_string(reference.metadata.as_ref(), "execution_strategy")
                })
            }),
        messages_count: read_model::runtime_session_messages(stored).len(),
    }
}

fn first_user_message_from_stored_session(stored: &StoredSession) -> Option<String> {
    stored
        .turns
        .iter()
        .find_map(|turn| {
            stored
                .turn_inputs
                .get(&turn.turn_id)
                .and_then(session_title::first_user_message_from_agent_input)
        })
        .or_else(|| {
            stored
                .events
                .iter()
                .filter(|event| event.event_type == turn_input_events::TURN_INPUT_EVENT_TYPE)
                .find_map(|event| {
                    session_title::first_user_message_from_runtime_payload(&event.payload)
                })
        })
}

fn stored_session_hidden_from_user_recents(stored: &StoredSession) -> bool {
    stored
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .is_some_and(metadata_hidden_from_user_recents)
}

fn update_session_business_object_title(session: &mut AgentSession, title: &str) {
    let title = title.trim();
    if title.is_empty() {
        return;
    }
    match session.business_object_ref.as_mut() {
        Some(reference) => {
            reference.title = Some(title.to_string());
            match reference.metadata.take() {
                Some(serde_json::Value::Object(mut metadata)) => {
                    metadata.insert(
                        "title".to_string(),
                        serde_json::Value::String(title.to_string()),
                    );
                    reference.metadata = Some(serde_json::Value::Object(metadata));
                }
                Some(metadata) => {
                    reference.metadata = Some(json!({
                        "title": title,
                        "previousMetadata": metadata,
                    }));
                }
                None => {
                    reference.metadata = Some(json!({ "title": title }));
                }
            }
        }
        None => {
            session.business_object_ref = Some(app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: session.session_id.clone(),
                title: Some(title.to_string()),
                uri: None,
                metadata: Some(json!({ "title": title })),
            });
        }
    }
}

fn update_session_business_object_metadata(
    session: &mut AgentSession,
    params: &AgentSessionUpdateParams,
) {
    let existing_article_workspace_edited_draft = session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .and_then(serde_json::Value::as_object)
        .and_then(article_workspace_edited_draft::metadata_edited_draft);
    let mut updates = serde_json::Map::new();
    insert_trimmed_metadata_string(
        &mut updates,
        "providerSelector",
        params.provider_selector.as_deref(),
    );
    insert_trimmed_metadata_string(
        &mut updates,
        "providerName",
        params.provider_name.as_deref(),
    );
    insert_trimmed_metadata_string(&mut updates, "modelName", params.model_name.as_deref());
    insert_trimmed_metadata_string(
        &mut updates,
        "executionStrategy",
        params.execution_strategy.as_deref(),
    );
    insert_trimmed_metadata_string(
        &mut updates,
        "recentAccessMode",
        params.recent_access_mode.as_deref(),
    );
    if let Some(value) = params.recent_preferences.as_ref() {
        updates.insert("recentPreferences".to_string(), value.clone());
    }
    if let Some(value) = params.recent_team_selection.as_ref() {
        updates.insert("recentTeamSelection".to_string(), value.clone());
    }
    if let Some(value) = params.article_workspace_selected_object_ref.as_ref() {
        updates.insert(
            "articleWorkspaceSelectedObjectRef".to_string(),
            value.clone(),
        );
    }
    if let Some(value) = params.article_workspace_edited_draft.as_ref() {
        if !article_workspace_edited_draft::should_reject_edited_draft_update(
            existing_article_workspace_edited_draft,
            value,
        ) {
            updates.insert("articleWorkspaceEditedDraft".to_string(), value.clone());
        }
    }
    if updates.is_empty() {
        return;
    }

    let session_id = session.session_id.clone();
    let reference =
        session
            .business_object_ref
            .get_or_insert_with(|| app_server_protocol::BusinessObjectRef {
                kind: "agent.session".to_string(),
                id: session_id,
                title: None,
                uri: None,
                metadata: None,
            });
    match reference.metadata.take() {
        Some(serde_json::Value::Object(mut metadata)) => {
            metadata.extend(updates);
            reference.metadata = Some(serde_json::Value::Object(metadata));
        }
        Some(metadata) => {
            updates.insert("previousMetadata".to_string(), metadata);
            reference.metadata = Some(serde_json::Value::Object(updates));
        }
        None => {
            reference.metadata = Some(serde_json::Value::Object(updates));
        }
    }
}

fn insert_trimmed_metadata_string(
    metadata: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    value: Option<&str>,
) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    metadata.insert(
        key.to_string(),
        serde_json::Value::String(value.to_string()),
    );
}

fn metadata_hidden_from_user_recents(metadata: &serde_json::Value) -> bool {
    metadata_bool(metadata, "hiddenFromUserRecents")
        .or_else(|| metadata_bool(metadata, "hidden_from_user_recents"))
        .or_else(|| metadata_nested_bool(metadata, "harness", "hiddenFromUserRecents"))
        .or_else(|| metadata_nested_bool(metadata, "harness", "hidden_from_user_recents"))
        .unwrap_or(false)
}

fn metadata_bool(metadata: &serde_json::Value, key: &str) -> Option<bool> {
    metadata.get(key).and_then(serde_json::Value::as_bool)
}

fn metadata_nested_bool(metadata: &serde_json::Value, parent: &str, key: &str) -> Option<bool> {
    metadata
        .get(parent)
        .and_then(|value| value.get(key))
        .and_then(serde_json::Value::as_bool)
}

impl RuntimeCore {
    fn list_runtime_core_session_overviews(
        &self,
        params: &AgentSessionListParams,
    ) -> Vec<AgentSessionOverview> {
        if params.archived_only.unwrap_or(false) {
            return Vec::new();
        }

        let scope = SessionListScope::from_params(params);
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        state
            .sessions
            .values()
            .filter(|stored| !stored_session_hidden_from_user_recents(stored))
            .map(stored_session_to_overview)
            .filter(|overview| {
                scope.matches_session(
                    overview.workspace_id.as_deref(),
                    overview.working_dir.as_deref(),
                )
            })
            .collect()
    }

    pub async fn list_agent_sessions(
        &self,
        params: AgentSessionListParams,
    ) -> Result<AgentSessionListResponse, RuntimeCoreError> {
        let params = self.normalize_agent_session_list_params(params).await?;
        let mut sessions = Vec::new();
        let mut persisted_session_ids = HashSet::new();
        if let Some(projection_store) = self.projection_store.as_ref() {
            let projected = projection_store
                .list_session_overviews(&params)
                .map_err(RuntimeCoreError::Backend)?;
            for session in projected {
                if persisted_session_ids.insert(session.session_id.clone()) {
                    sessions.push(session);
                }
            }
        }
        sessions.extend(
            self.list_runtime_core_session_overviews(&params)
                .into_iter()
                .filter(|session| persisted_session_ids.insert(session.session_id.clone())),
        );
        sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        if let Some(limit) = params.limit.map(|value| value as usize) {
            sessions.truncate(limit);
        }
        Ok(AgentSessionListResponse { sessions })
    }

    async fn normalize_agent_session_list_params(
        &self,
        mut params: AgentSessionListParams,
    ) -> Result<AgentSessionListParams, RuntimeCoreError> {
        if params.cwd.is_some() {
            params.workspace_id = None;
            return Ok(params);
        }

        let Some(workspace_id) = params
            .workspace_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return Ok(params);
        };

        let response = self
            .app_data_source
            .read_workspace(WorkspaceReadParams {
                id: workspace_id.to_string(),
            })
            .await?;
        let root_path = response.workspace.as_ref().and_then(workspace_root_path);
        let cwd_filters = normalize_cwd_values(root_path);
        if !cwd_filters.is_empty() {
            params.cwd = Some(AgentSessionCwdFilter::Many(cwd_filters));
        }
        Ok(params)
    }

    pub fn start_session(
        &self,
        params: AgentSessionStartParams,
    ) -> Result<AgentSessionStartResponse, RuntimeCoreError> {
        let now = timestamp();
        let session_id = optional_id_or_new(params.session_id, "sess");
        let thread_id = optional_id_or_new(params.thread_id, "thread");
        let session = AgentSession {
            session_id: session_id.clone(),
            thread_id,
            app_id: params.app_id,
            workspace_id: params.workspace_id,
            business_object_ref: params.business_object_ref,
            status: AgentSessionStatus::Idle,
            created_at: now.clone(),
            updated_at: now,
        };

        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        if state.sessions.contains_key(&session_id) {
            return Err(RuntimeCoreError::SessionAlreadyExists(session_id));
        }
        state.sessions.insert(
            session_id,
            StoredSession {
                session: session.clone(),
                turns: Vec::new(),
                turn_inputs: HashMap::new(),
                turn_runtime_options: HashMap::new(),
                events: Vec::new(),
                output_blobs: HashMap::new(),
            },
        );

        Ok(AgentSessionStartResponse { session })
    }

    pub fn read_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<AgentSessionReadResponse, RuntimeCoreError> {
        let stored = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            state
                .sessions
                .get(&params.session_id)
                .cloned()
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?
        };
        let workflow_audit_events =
            self.read_workflow_audit_events_for_session(&params.session_id)?;
        let detail = read_model::runtime_session_read_detail_with_options(
            &stored,
            read_model::ReadDetailOptions::from_params(&params),
            &workflow_audit_events,
        );

        Ok(AgentSessionReadResponse {
            session: stored.session.clone(),
            turns: stored.turns.clone(),
            detail: Some(detail),
        })
    }

    pub async fn read_session_current(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<AgentSessionReadResponse, RuntimeCoreError> {
        self.load_session_current(params)
            .await
            .map(|context| context.response)
    }

    pub async fn update_session_current(
        &self,
        params: AgentSessionUpdateParams,
    ) -> Result<AgentSessionUpdateResponse, RuntimeCoreError> {
        let normalized_session_id = params.session_id.trim().to_string();
        if normalized_session_id.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "sessionId is required for agentSession/update".to_string(),
            ));
        }
        if let Some(session) =
            self.update_runtime_core_session_overview(params.clone(), &normalized_session_id)?
        {
            return Ok(AgentSessionUpdateResponse { session });
        }
        if let Some(projection_store) = self.projection_store.as_ref() {
            if let Some(response) = projection_store
                .update_session_overview(
                    AgentSessionUpdateParams {
                        session_id: normalized_session_id.clone(),
                        title: params.title.clone(),
                        archived: params.archived,
                        provider_selector: params.provider_selector.clone(),
                        provider_name: params.provider_name.clone(),
                        model_name: params.model_name.clone(),
                        execution_strategy: params.execution_strategy.clone(),
                        recent_access_mode: params.recent_access_mode.clone(),
                        recent_preferences: params.recent_preferences.clone(),
                        recent_team_selection: params.recent_team_selection.clone(),
                        article_workspace_selected_object_ref: params
                            .article_workspace_selected_object_ref
                            .clone(),
                        article_workspace_edited_draft: params
                            .article_workspace_edited_draft
                            .clone(),
                    },
                    timestamp().as_str(),
                )
                .map_err(RuntimeCoreError::Backend)?
            {
                return Ok(response);
            }
        }
        Err(RuntimeCoreError::SessionNotFound(normalized_session_id))
    }

    pub async fn archive_many_agent_sessions(
        &self,
        params: AgentSessionArchiveManyParams,
    ) -> Result<AgentSessionArchiveManyResponse, RuntimeCoreError> {
        let mut seen = HashSet::new();
        let mut normalized_session_ids = Vec::new();
        for session_id in params.session_ids {
            let normalized = session_id.trim().to_string();
            if normalized.is_empty() || !seen.insert(normalized.clone()) {
                continue;
            }
            normalized_session_ids.push(normalized);
        }

        if normalized_session_ids.is_empty() {
            return Ok(AgentSessionArchiveManyResponse::default());
        }

        let mut sessions = Vec::new();
        let mut remaining_persisted_session_ids = Vec::new();
        for session_id in normalized_session_ids {
            match self.update_runtime_core_session_overview(
                AgentSessionUpdateParams {
                    session_id: session_id.clone(),
                    archived: Some(true),
                    ..AgentSessionUpdateParams::default()
                },
                &session_id,
            )? {
                Some(session) => sessions.push(session),
                None => remaining_persisted_session_ids.push(session_id),
            }
        }

        if !remaining_persisted_session_ids.is_empty() {
            if let Some(projection_store) = self.projection_store.as_ref() {
                let (response, _missing_session_ids) = projection_store
                    .archive_many_sessions(
                        AgentSessionArchiveManyParams {
                            session_ids: remaining_persisted_session_ids,
                        },
                        timestamp().as_str(),
                    )
                    .map_err(RuntimeCoreError::Backend)?;
                sessions.extend(response.sessions);
            }
        }

        sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        Ok(AgentSessionArchiveManyResponse { sessions })
    }

    pub async fn delete_agent_session(
        &self,
        params: AgentSessionDeleteParams,
    ) -> Result<AgentSessionDeleteResponse, RuntimeCoreError> {
        let session_id = params.session_id.trim().to_string();
        if session_id.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "sessionId is required for agentSession/delete".to_string(),
            ));
        }

        let mut deleted = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            state.sessions.remove(&session_id).is_some()
        };

        if let Some(projection_store) = self.projection_store.as_ref() {
            if projection_store
                .read_session_projection(
                    &session_id,
                    super::projection_store::ProjectionReadWindow::default(),
                )
                .map_err(RuntimeCoreError::Backend)?
                .is_some()
            {
                deleted = true;
            }
            projection_store
                .clear_session(&session_id)
                .map_err(RuntimeCoreError::Backend)?;
        }
        if let Some(event_log_writer) = self.event_log_writer.as_ref() {
            if !event_log_writer
                .read_session_events(&session_id)
                .map_err(RuntimeCoreError::Backend)?
                .is_empty()
            {
                deleted = true;
            }
            event_log_writer
                .clear_session(&session_id)
                .map_err(RuntimeCoreError::Backend)?;
        }
        if let Some(sidecar_store) = self.sidecar_store.as_ref() {
            sidecar_store
                .clear_session(&session_id)
                .map_err(RuntimeCoreError::Backend)?;
        }

        if !deleted {
            return Err(RuntimeCoreError::SessionNotFound(session_id));
        }

        Ok(AgentSessionDeleteResponse {
            session_id,
            deleted: true,
        })
    }

    fn update_runtime_core_session_overview(
        &self,
        params: AgentSessionUpdateParams,
        session_id: &str,
    ) -> Result<Option<AgentSessionOverview>, RuntimeCoreError> {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let Some(stored) = state.sessions.get_mut(session_id) else {
            return Ok(None);
        };
        if let Some(title) = params.title.as_deref().map(str::trim) {
            if !title.is_empty() {
                update_session_business_object_title(&mut stored.session, title);
            }
        }
        update_session_business_object_metadata(&mut stored.session, &params);
        stored.session.updated_at = timestamp();
        if params.archived.unwrap_or(false) {
            return Err(RuntimeCoreError::Backend(
                "agentSession/update archived is only supported for persisted sessions".to_string(),
            ));
        }
        Ok(Some(stored_session_to_overview(stored)))
    }

    pub(in crate::runtime) async fn ensure_current_session_hydrated(
        &self,
        session_id: &str,
    ) -> Result<(), RuntimeCoreError> {
        if self.has_runtime_core_session(session_id) {
            return Ok(());
        }

        let context = self
            .load_session_current(AgentSessionReadParams {
                session_id: session_id.to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        self.insert_hydrated_session(context.response);
        Ok(())
    }

    fn has_runtime_core_session(&self, session_id: &str) -> bool {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        state.sessions.contains_key(session_id)
    }

    fn insert_hydrated_session(&self, response: AgentSessionReadResponse) {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let session_id = response.session.session_id.clone();
        state
            .sessions
            .entry(session_id)
            .or_insert_with(|| session_hydration::hydrated_stored_session_from_response(response));
    }

    pub(in crate::runtime) fn stored_turn(
        &self,
        session_id: &str,
        turn_id: &str,
    ) -> Result<Option<AgentTurn>, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        Ok(stored
            .turns
            .iter()
            .find(|turn| turn.turn_id == turn_id)
            .cloned())
    }

    pub(in crate::runtime) fn session_snapshot(
        &self,
        session_id: &str,
    ) -> Result<(AgentSession, Vec<AgentTurn>), RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        Ok((stored.session.clone(), stored.turns.clone()))
    }

    pub(in crate::runtime) fn rollback_started_turn(
        &self,
        session_id: &str,
        turn_id: &str,
        previous_session: AgentSession,
    ) {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        if let Some(stored) = state.sessions.get_mut(session_id) {
            stored.turns.retain(|turn| turn.turn_id != turn_id);
            stored.turn_inputs.remove(turn_id);
            stored.turn_runtime_options.remove(turn_id);
            stored.session = previous_session;
        }
    }

    pub(in crate::runtime) fn restore_queued_turn_if_missing(
        &self,
        session_id: &str,
        index: usize,
        turn: AgentTurn,
        input: AgentInput,
        runtime_options: Option<RuntimeOptions>,
    ) {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        if let Some(stored) = state.sessions.get_mut(session_id) {
            if stored.turns.iter().any(|stored_turn| {
                stored_turn.turn_id == turn.turn_id
                    && !matches!(stored_turn.status, AgentTurnStatus::Queued)
            }) {
                return;
            }
            if !stored.turns.iter().any(|stored_turn| {
                stored_turn.turn_id == turn.turn_id
                    && matches!(stored_turn.status, AgentTurnStatus::Queued)
            }) {
                let insert_at = index.min(stored.turns.len());
                stored.turns.insert(insert_at, turn.clone());
            }
            let turn_id = turn.turn_id;
            stored.turn_inputs.insert(turn_id.clone(), input);
            match runtime_options {
                Some(runtime_options) => {
                    stored.turn_runtime_options.insert(turn_id, runtime_options);
                }
                None => {
                    stored.turn_runtime_options.remove(&turn_id);
                }
            }
        }
    }
}

fn workspace_root_path(workspace: &serde_json::Value) -> Option<&str> {
    workspace
        .get("rootPath")
        .or_else(|| workspace.get("root_path"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}
