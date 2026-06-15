use super::read_model;
use super::*;
use app_server_protocol::*;
use serde_json::json;
use std::collections::{HashMap, HashSet};

fn stored_session_to_overview(stored: &StoredSession) -> AgentSessionOverview {
    let session = &stored.session;
    AgentSessionOverview {
        session_id: session.session_id.clone(),
        thread_id: Some(session.thread_id.clone()),
        title: session
            .business_object_ref
            .as_ref()
            .and_then(|reference| reference.title.clone())
            .or_else(|| {
                session
                    .business_object_ref
                    .as_ref()
                    .and_then(|reference| metadata_string(reference.metadata.as_ref(), "title"))
            }),
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

        let workspace_id = params
            .workspace_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        state
            .sessions
            .values()
            .filter(|stored| !stored_session_hidden_from_user_recents(stored))
            .filter(|stored| {
                workspace_id
                    .map(|workspace_id| {
                        stored.session.workspace_id.as_deref() == Some(workspace_id)
                    })
                    .unwrap_or(true)
            })
            .map(stored_session_to_overview)
            .collect()
    }

    pub async fn list_agent_sessions(
        &self,
        params: AgentSessionListParams,
    ) -> Result<AgentSessionListResponse, RuntimeCoreError> {
        self.backfill_legacy_agent_messages_for_list(&params)
            .await?;
        let mut sessions = self
            .app_data_source
            .list_current_timeline_sessions(params.clone())
            .await?
            .sessions;
        let mut persisted_session_ids: HashSet<String> = sessions
            .iter()
            .map(|session| session.session_id.clone())
            .collect();
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
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(&params.session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
        let detail = read_model::runtime_session_read_detail(stored);

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
        self.app_data_source
            .update_current_timeline_session(AgentSessionUpdateParams {
                session_id: normalized_session_id,
                title: params.title,
                archived: params.archived,
                provider_selector: params.provider_selector,
                provider_name: params.provider_name,
                model_name: params.model_name,
                execution_strategy: params.execution_strategy,
                recent_access_mode: params.recent_access_mode,
                recent_preferences: params.recent_preferences,
                recent_team_selection: params.recent_team_selection,
            })
            .await
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
            let response = self
                .app_data_source
                .archive_many_current_timeline_sessions(AgentSessionArchiveManyParams {
                    session_ids: remaining_persisted_session_ids,
                })
                .await?;
            sessions.extend(response.sessions);
        }

        sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        Ok(AgentSessionArchiveManyResponse { sessions })
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
                "agentSession/update archived is only supported for persisted current timeline sessions"
                    .to_string(),
            ));
        }
        Ok(Some(stored_session_to_overview(stored)))
    }

    pub(in crate::runtime) async fn ensure_current_timeline_session_hydrated(
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
            stored.turn_inputs.insert(turn.turn_id, input);
        }
    }
}
