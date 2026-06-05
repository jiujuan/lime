use crate::AppDataSource;
use crate::RuntimeCoreError;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::AgentSessionListResponse;
use app_server_protocol::AgentSessionOverview;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::BusinessObjectRef;
use app_server_protocol::ModelListParams;
use app_server_protocol::ModelListResponse;
use app_server_protocol::ModelPreferencesListResponse;
use app_server_protocol::ModelProviderAliasListResponse;
use app_server_protocol::ModelProviderAliasReadParams;
use app_server_protocol::ModelProviderAliasReadResponse;
use app_server_protocol::ModelProviderCatalogListResponse;
use app_server_protocol::ModelProviderListResponse;
use app_server_protocol::ModelSyncStateReadResponse;
use app_server_protocol::SkillListResponse;
use app_server_protocol::SkillReadParams;
use app_server_protocol::SkillReadResponse;
use app_server_protocol::WorkspaceEnsureParams;
use app_server_protocol::WorkspaceEnsureReadyResponse;
use app_server_protocol::WorkspaceListResponse;
use app_server_protocol::WorkspacePathReadParams;
use app_server_protocol::WorkspaceProjectPathResolveParams;
use app_server_protocol::WorkspaceProjectPathResolveResponse;
use app_server_protocol::WorkspaceProjectsRootReadResponse;
use app_server_protocol::WorkspaceReadParams;
use app_server_protocol::WorkspaceReadResponse;
use app_server_protocol::WorkspaceSkillBindingsListParams;
use app_server_protocol::WorkspaceSkillBindingsListResponse;
use async_trait::async_trait;
use chrono::DateTime;
use chrono::Utc;
use lime_core::app_paths;
use lime_core::database;
use lime_core::database::dao::agent_timeline::AgentThreadItem;
use lime_core::database::dao::agent_timeline::AgentThreadTurn;
use lime_core::database::dao::agent_timeline::AgentThreadTurnStatus;
use lime_core::database::dao::agent_timeline::AgentTimelineDao;
use lime_core::database::dao::api_key_provider::ApiKeyEntry;
use lime_core::database::dao::api_key_provider::ProviderWithKeys;
use lime_core::database::system_providers::get_system_providers;
use lime_core::database::system_providers::SystemProviderDef;
use lime_core::database::DbConnection;
use lime_core::models::model_registry::ModelTier;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use lime_services::model_registry_service::ModelRegistryService;
use lime_skills::find_skill_by_name;
use lime_skills::get_skill_roots;
use lime_skills::load_skill_from_file;
use lime_skills::load_skills_from_directory;
use lime_skills::LoadedSkillDefinition;
use rusqlite::params;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use uuid::Uuid;

const CURRENT_TIMELINE_LIST_MAX_LIMIT: usize = 1_000;
const CURRENT_TIMELINE_HISTORY_DEFAULT_LIMIT: usize = 320;
const CURRENT_TIMELINE_HISTORY_MAX_LIMIT: usize = 1_000;
const APP_ID_AGENT_RUNTIME: &str = "agent-runtime";
const LEGACY_DEFAULT_WORKSPACE_ID: &str = "workspace-default";
const DEFAULT_PROJECT_NAME: &str = "默认项目";

pub struct LocalAppDataSource {
    db: DbConnection,
    api_key_provider_service: ApiKeyProviderService,
    model_registry_service: ModelRegistryService,
}

impl LocalAppDataSource {
    pub async fn initialize() -> Result<Self, String> {
        let db = database::init_database()?;
        let api_key_provider_service = ApiKeyProviderService::new();
        let model_registry_service = ModelRegistryService::new(db.clone());
        model_registry_service.initialize().await?;
        Ok(Self {
            db,
            api_key_provider_service,
            model_registry_service,
        })
    }
}

#[async_trait]
impl AppDataSource for LocalAppDataSource {
    async fn list_current_timeline_sessions(
        &self,
        params: AgentSessionListParams,
    ) -> Result<AgentSessionListResponse, RuntimeCoreError> {
        let workspace_id = normalize_workspace_filter(params.workspace_id.as_deref());
        let limit = params
            .limit
            .map(|value| (value as usize).min(CURRENT_TIMELINE_LIST_MAX_LIMIT));
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let sessions = query_current_timeline_session_overviews(
            &conn,
            params.include_archived.unwrap_or(false),
            params.archived_only.unwrap_or(false),
            workspace_id,
            limit,
        )
        .map_err(data_error)?;
        Ok(AgentSessionListResponse { sessions })
    }

    async fn read_current_timeline_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError> {
        let history_limit = params
            .history_limit
            .map(|value| (value as usize).min(CURRENT_TIMELINE_HISTORY_MAX_LIMIT))
            .unwrap_or(CURRENT_TIMELINE_HISTORY_DEFAULT_LIMIT);
        let history_offset = params.history_offset.unwrap_or(0) as usize;
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let Some(session) =
            query_current_timeline_session(&conn, &params.session_id).map_err(data_error)?
        else {
            return Ok(None);
        };
        let has_timeline =
            current_timeline_session_has_entries(&conn, &params.session_id).map_err(data_error)?;
        if !has_timeline {
            return Ok(None);
        }

        let timeline_turns = AgentTimelineDao::list_turns_by_thread_tail_page(
            &conn,
            &params.session_id,
            history_limit,
            history_offset,
        )
        .map_err(data_error)?;
        let turns = timeline_turns
            .iter()
            .cloned()
            .into_iter()
            .map(agent_thread_turn_to_protocol)
            .collect::<Vec<_>>();
        let items = AgentTimelineDao::list_items_by_thread_tail_page(
            &conn,
            &params.session_id,
            history_limit,
            history_offset,
        )
        .map_err(data_error)?;
        let messages_count =
            current_timeline_item_count(&conn, &params.session_id).map_err(data_error)?;
        let detail = current_timeline_detail_value(
            &session,
            &timeline_turns,
            &items,
            messages_count,
            history_limit,
            history_offset,
        )?;

        Ok(Some(AgentSessionReadResponse {
            session: current_timeline_session_to_protocol(&session),
            turns,
            detail: Some(detail),
        }))
    }

    async fn list_workspaces(&self) -> Result<WorkspaceListResponse, RuntimeCoreError> {
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, workspace_type, root_path, is_default, settings_json,
                        created_at, updated_at, icon, color, is_favorite, is_archived,
                        tags_json, default_persona_id
                 FROM workspaces
                 ORDER BY updated_at DESC",
            )
            .map_err(data_error)?;
        let workspaces = stmt
            .query_map([], row_to_workspace_value)
            .map_err(data_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(data_error)?;
        Ok(WorkspaceListResponse { workspaces })
    }

    async fn read_workspace(
        &self,
        params: WorkspaceReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let workspace = read_workspace_by_id(&conn, &params.id).map_err(data_error)?;
        Ok(WorkspaceReadResponse { workspace })
    }

    async fn read_workspace_by_path(
        &self,
        params: WorkspacePathReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let workspace =
            read_workspace_by_root_path(&conn, Path::new(&params.root_path)).map_err(data_error)?;
        Ok(WorkspaceReadResponse { workspace })
    }

    async fn read_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let workspace = read_current_default_workspace(&conn).map_err(data_error)?;
        Ok(WorkspaceReadResponse { workspace })
    }

    async fn ensure_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let workspace = ensure_current_default_workspace(&conn).map_err(data_error)?;
        Ok(WorkspaceReadResponse {
            workspace: Some(workspace),
        })
    }

    async fn ensure_workspace_ready(
        &self,
        params: WorkspaceEnsureParams,
    ) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError> {
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let workspace = read_workspace_by_id(&conn, &params.id)
            .map_err(data_error)?
            .ok_or_else(|| data_error(format!("workspace not found: {}", params.id)))?;
        let root_path = workspace
            .get("root_path")
            .and_then(Value::as_str)
            .ok_or_else(|| data_error("workspace root_path missing"))?;
        let root = PathBuf::from(root_path);
        let existed = root.is_dir();
        fs::create_dir_all(&root).map_err(data_error)?;
        Ok(WorkspaceEnsureReadyResponse {
            result: json!({
                "workspaceId": params.id,
                "rootPath": root.to_string_lossy(),
                "existed": existed,
                "created": !existed,
                "repaired": !existed,
                "relocated": false,
                "previousRootPath": null,
                "warning": null,
            }),
        })
    }

    async fn read_workspace_projects_root(
        &self,
    ) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError> {
        let root_path = app_paths::resolve_projects_dir().map_err(data_error)?;
        Ok(WorkspaceProjectsRootReadResponse {
            root_path: root_path.to_string_lossy().to_string(),
        })
    }

    async fn resolve_workspace_project_path(
        &self,
        params: WorkspaceProjectPathResolveParams,
    ) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError> {
        let root_dir = match params
            .parent_root_path
            .as_deref()
            .map(str::trim)
            .filter(|path| !path.is_empty())
        {
            Some(path) => PathBuf::from(path),
            None => app_paths::resolve_projects_dir().map_err(data_error)?,
        };
        Ok(WorkspaceProjectPathResolveResponse {
            root_path: root_dir
                .join(sanitize_project_dir_name(&params.name))
                .to_string_lossy()
                .to_string(),
        })
    }

    async fn list_skills(&self) -> Result<SkillListResponse, RuntimeCoreError> {
        let mut skills = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for root in get_skill_roots() {
            for skill in load_skills_from_directory(&root) {
                if !skill.disable_model_invocation && seen.insert(skill.skill_name.clone()) {
                    skills.push(skill_to_executable_value(skill));
                }
            }
        }
        Ok(SkillListResponse { skills })
    }

    async fn read_skill(
        &self,
        params: SkillReadParams,
    ) -> Result<SkillReadResponse, RuntimeCoreError> {
        let skill = find_skill_by_name(&params.skill_name).map_err(data_error)?;
        if !skill.standard_compliance.validation_errors.is_empty() {
            return Err(data_error(format!(
                "skill '{}' failed standard validation: {}",
                params.skill_name,
                skill.standard_compliance.validation_errors.join("; ")
            )));
        }
        if skill.disable_model_invocation {
            return Err(data_error(format!(
                "skill '{}' disabled model invocation",
                params.skill_name
            )));
        }
        Ok(SkillReadResponse {
            skill: skill_to_detail_value(skill),
        })
    }

    async fn list_workspace_skill_bindings(
        &self,
        params: WorkspaceSkillBindingsListParams,
    ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError> {
        Ok(WorkspaceSkillBindingsListResponse {
            bindings: list_workspace_skill_bindings_value(params).map_err(data_error)?,
        })
    }

    async fn list_models(
        &self,
        params: ModelListParams,
    ) -> Result<ModelListResponse, RuntimeCoreError> {
        let models = if let Some(provider_id) = params.provider_id.as_deref() {
            self.model_registry_service
                .get_models_by_provider(provider_id)
                .await
        } else if let Some(tier) = params.tier.as_deref() {
            let tier = tier.parse::<ModelTier>().map_err(data_error)?;
            self.model_registry_service.get_models_by_tier(tier).await
        } else {
            self.model_registry_service.get_all_models().await
        };
        Ok(ModelListResponse {
            models: values_from_serializable_vec(models)?,
        })
    }

    async fn list_model_preferences(
        &self,
    ) -> Result<ModelPreferencesListResponse, RuntimeCoreError> {
        let preferences = self
            .model_registry_service
            .get_all_preferences()
            .await
            .map_err(data_error)?;
        Ok(ModelPreferencesListResponse {
            preferences: values_from_serializable_vec(preferences)?,
        })
    }

    async fn read_model_sync_state(&self) -> Result<ModelSyncStateReadResponse, RuntimeCoreError> {
        Ok(ModelSyncStateReadResponse {
            sync_state: serde_json::to_value(self.model_registry_service.get_sync_state().await)
                .map_err(data_error)?,
        })
    }

    async fn list_model_providers(&self) -> Result<ModelProviderListResponse, RuntimeCoreError> {
        let providers = self
            .api_key_provider_service
            .get_all_providers(&self.db)
            .map_err(data_error)?
            .iter()
            .map(|provider| provider_with_keys_to_value(provider, &self.api_key_provider_service))
            .collect();
        Ok(ModelProviderListResponse { providers })
    }

    async fn list_model_provider_catalog(
        &self,
    ) -> Result<ModelProviderCatalogListResponse, RuntimeCoreError> {
        Ok(ModelProviderCatalogListResponse {
            providers: get_system_providers()
                .into_iter()
                .map(system_provider_to_value)
                .collect(),
        })
    }

    async fn read_model_provider_alias(
        &self,
        params: ModelProviderAliasReadParams,
    ) -> Result<ModelProviderAliasReadResponse, RuntimeCoreError> {
        Ok(ModelProviderAliasReadResponse {
            config: self
                .model_registry_service
                .get_provider_alias_config(&params.provider)
                .await
                .map(serde_json::to_value)
                .transpose()
                .map_err(data_error)?,
        })
    }

    async fn list_model_provider_aliases(
        &self,
    ) -> Result<ModelProviderAliasListResponse, RuntimeCoreError> {
        let mut configs = Map::new();
        for (provider, config) in self.model_registry_service.get_all_alias_configs().await {
            configs.insert(provider, serde_json::to_value(config).map_err(data_error)?);
        }
        Ok(ModelProviderAliasListResponse { configs })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CurrentTimelineSessionRow {
    id: String,
    model: String,
    title: Option<String>,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
    working_dir: Option<String>,
    execution_strategy: Option<String>,
    workspace_id: Option<String>,
    timeline_item_count: usize,
    timeline_turn_count: usize,
    latest_turn_status: Option<AgentThreadTurnStatus>,
}

fn normalize_workspace_filter(value: Option<&str>) -> Option<&str> {
    let value = value?.trim();
    if value.is_empty() || value == LEGACY_DEFAULT_WORKSPACE_ID {
        None
    } else {
        Some(value)
    }
}

fn query_current_timeline_session_overviews(
    conn: &rusqlite::Connection,
    include_archived: bool,
    archived_only: bool,
    workspace_id: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<AgentSessionOverview>, String> {
    let limit = limit.unwrap_or(CURRENT_TIMELINE_LIST_MAX_LIMIT);
    let mut stmt = conn
        .prepare(
            "SELECT
                s.id,
                s.model,
                s.title,
                s.created_at,
                COALESCE(
                    (
                        SELECT activity.updated_at
                        FROM (
                            SELECT i.updated_at
                            FROM agent_thread_items i
                            WHERE i.session_id = s.id
                            UNION ALL
                            SELECT t.updated_at
                            FROM agent_thread_turns t
                            WHERE t.session_id = s.id
                        ) activity
                        ORDER BY activity.updated_at DESC
                        LIMIT 1
                    ),
                    s.updated_at
                ) AS updated_at,
                s.archived_at,
                s.working_dir,
                s.execution_strategy,
                w.id AS workspace_id,
                (SELECT COUNT(1) FROM agent_thread_items i WHERE i.session_id = s.id)
                    AS timeline_item_count,
                (SELECT COUNT(1) FROM agent_thread_turns t WHERE t.session_id = s.id)
                    AS timeline_turn_count,
                (
                    SELECT t.status
                    FROM agent_thread_turns t
                    WHERE t.session_id = s.id
                    ORDER BY t.started_at DESC, t.id DESC
                    LIMIT 1
                ) AS latest_turn_status
             FROM agent_sessions s
             LEFT JOIN workspaces w ON w.root_path = s.working_dir
             WHERE (
                    (?1 = 1 AND s.archived_at IS NOT NULL)
                    OR (?1 = 0 AND (?2 = 1 OR s.archived_at IS NULL))
                )
               AND (?3 IS NULL OR w.id = ?3)
               AND (
                    EXISTS (SELECT 1 FROM agent_thread_turns t WHERE t.session_id = s.id)
                    OR EXISTS (SELECT 1 FROM agent_thread_items i WHERE i.session_id = s.id)
                )
             ORDER BY updated_at DESC, s.id DESC
             LIMIT ?4",
        )
        .map_err(|error| format!("prepare current timeline session list failed: {error}"))?;

    let rows = stmt
        .query_map(
            params![archived_only, include_archived, workspace_id, limit as i64,],
            current_timeline_session_row,
        )
        .map_err(|error| format!("query current timeline session list failed: {error}"))?;
    rows.map(|row| row.map(current_timeline_session_overview))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read current timeline session list failed: {error}"))
}

fn query_current_timeline_session(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Option<CurrentTimelineSessionRow>, String> {
    conn.query_row(
        "SELECT
            s.id,
            s.model,
            s.title,
            s.created_at,
                COALESCE(
                    (
                        SELECT activity.updated_at
                        FROM (
                            SELECT i.updated_at
                            FROM agent_thread_items i
                            WHERE i.session_id = s.id
                            UNION ALL
                            SELECT t.updated_at
                            FROM agent_thread_turns t
                            WHERE t.session_id = s.id
                        ) activity
                        ORDER BY activity.updated_at DESC
                        LIMIT 1
                    ),
                s.updated_at
            ) AS updated_at,
            s.archived_at,
            s.working_dir,
            s.execution_strategy,
            w.id AS workspace_id,
            (SELECT COUNT(1) FROM agent_thread_items i WHERE i.session_id = s.id)
                AS timeline_item_count,
            (SELECT COUNT(1) FROM agent_thread_turns t WHERE t.session_id = s.id)
                AS timeline_turn_count,
            (
                SELECT t.status
                FROM agent_thread_turns t
                WHERE t.session_id = s.id
                ORDER BY t.started_at DESC, t.id DESC
                LIMIT 1
            ) AS latest_turn_status
         FROM agent_sessions s
         LEFT JOIN workspaces w ON w.root_path = s.working_dir
         WHERE s.id = ?1",
        params![session_id],
        current_timeline_session_row,
    )
    .optional()
    .map_err(|error| format!("read current timeline session failed: {error}"))
}

fn current_timeline_session_row(
    row: &Row<'_>,
) -> Result<CurrentTimelineSessionRow, rusqlite::Error> {
    let latest_turn_status = row
        .get::<_, Option<String>>(11)?
        .as_deref()
        .map(AgentThreadTurnStatus::try_from)
        .transpose()
        .map_err(|_| {
            rusqlite::Error::InvalidColumnType(
                11,
                "latest_turn_status".into(),
                rusqlite::types::Type::Text,
            )
        })?;
    let timeline_item_count = row.get::<_, i64>(9)?.max(0) as usize;
    let timeline_turn_count = row.get::<_, i64>(10)?.max(0) as usize;

    Ok(CurrentTimelineSessionRow {
        id: row.get(0)?,
        model: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        archived_at: row.get(5)?,
        working_dir: row.get(6)?,
        execution_strategy: row.get(7)?,
        workspace_id: row.get(8)?,
        timeline_item_count,
        timeline_turn_count,
        latest_turn_status,
    })
}

fn current_timeline_session_overview(row: CurrentTimelineSessionRow) -> AgentSessionOverview {
    let messages_count = timeline_message_count(&row);
    AgentSessionOverview {
        session_id: row.id.clone(),
        thread_id: Some(row.id),
        title: normalized_title(row.title),
        model: row.model,
        created_at: row.created_at,
        updated_at: row.updated_at,
        archived_at: row.archived_at,
        workspace_id: row.workspace_id,
        working_dir: row.working_dir,
        execution_strategy: row.execution_strategy,
        messages_count,
    }
}

fn current_timeline_session_has_entries(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM agent_thread_turns WHERE session_id = ?1)
                OR EXISTS(SELECT 1 FROM agent_thread_items WHERE session_id = ?1)",
        params![session_id],
        |row| row.get::<_, bool>(0),
    )
    .map_err(|error| format!("check current timeline entries failed: {error}"))
}

fn current_timeline_item_count(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<usize, String> {
    conn.query_row(
        "SELECT
            (SELECT COUNT(1) FROM agent_thread_items WHERE session_id = ?1),
            (SELECT COUNT(1) FROM agent_thread_turns WHERE session_id = ?1)",
        params![session_id],
        |row| {
            let item_count = row.get::<_, i64>(0)?.max(0) as usize;
            let turn_count = row.get::<_, i64>(1)?.max(0) as usize;
            Ok(if item_count > 0 {
                item_count
            } else {
                turn_count
            })
        },
    )
    .map_err(|error| format!("count current timeline items failed: {error}"))
}

fn current_timeline_session_to_protocol(row: &CurrentTimelineSessionRow) -> AgentSession {
    let metadata = json!({
        "title": normalized_title(row.title.clone()),
        "model": row.model,
        "workingDir": row.working_dir,
        "executionStrategy": row.execution_strategy,
        "timelineItemCount": row.timeline_item_count,
        "timelineTurnCount": row.timeline_turn_count,
    });
    AgentSession {
        session_id: row.id.clone(),
        thread_id: row.id.clone(),
        app_id: APP_ID_AGENT_RUNTIME.to_string(),
        workspace_id: row.workspace_id.clone(),
        business_object_ref: Some(BusinessObjectRef {
            kind: "agent_session".to_string(),
            id: row.id.clone(),
            title: normalized_title(row.title.clone()),
            uri: None,
            metadata: Some(metadata),
        }),
        status: current_timeline_session_status(row.latest_turn_status.as_ref()),
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
    }
}

fn current_timeline_session_status(status: Option<&AgentThreadTurnStatus>) -> AgentSessionStatus {
    match status {
        Some(AgentThreadTurnStatus::Running) => AgentSessionStatus::Running,
        Some(AgentThreadTurnStatus::Failed) => AgentSessionStatus::Failed,
        Some(AgentThreadTurnStatus::Aborted) => AgentSessionStatus::Canceled,
        _ => AgentSessionStatus::Idle,
    }
}

fn agent_thread_turn_to_protocol(turn: AgentThreadTurn) -> AgentTurn {
    AgentTurn {
        turn_id: turn.id,
        session_id: turn.thread_id.clone(),
        thread_id: turn.thread_id,
        status: match turn.status {
            AgentThreadTurnStatus::Running => AgentTurnStatus::Running,
            AgentThreadTurnStatus::Completed => AgentTurnStatus::Completed,
            AgentThreadTurnStatus::Failed => AgentTurnStatus::Failed,
            AgentThreadTurnStatus::Aborted => AgentTurnStatus::Canceled,
        },
        started_at: Some(turn.started_at),
        completed_at: turn.completed_at,
    }
}

fn current_timeline_detail_value(
    session: &CurrentTimelineSessionRow,
    turns: &[AgentThreadTurn],
    items: &[AgentThreadItem],
    messages_count: usize,
    history_limit: usize,
    history_offset: usize,
) -> Result<Value, RuntimeCoreError> {
    let loaded_count = items.len();
    let start_index = messages_count.saturating_sub(history_offset + loaded_count);
    Ok(json!({
        "id": session.id,
        "thread_id": session.id,
        "name": normalized_title(session.title.clone()),
        "created_at": timestamp_millis(&session.created_at),
        "updated_at": timestamp_millis(&session.updated_at),
        "model": session.model,
        "workspace_id": session.workspace_id,
        "working_dir": session.working_dir,
        "execution_strategy": session.execution_strategy,
        "messages_count": messages_count,
        "history_limit": history_limit,
        "history_offset": history_offset,
        "history_cursor": {
            "oldest_message_id": null,
            "start_index": start_index,
            "loaded_count": loaded_count,
        },
        "history_truncated": history_offset + loaded_count < messages_count,
        "messages": [],
        "turns": serde_json::to_value(turns).map_err(data_error)?,
        "items": serde_json::to_value(items).map_err(data_error)?,
        "queued_turns": [],
        "thread_read": null,
        "todo_items": [],
        "child_subagent_sessions": [],
    }))
}

fn normalized_title(value: Option<String>) -> Option<String> {
    value
        .map(|title| title.trim().to_string())
        .filter(|title| !title.is_empty())
}

fn timeline_message_count(row: &CurrentTimelineSessionRow) -> usize {
    if row.timeline_item_count > 0 {
        row.timeline_item_count
    } else {
        row.timeline_turn_count
    }
}

fn timestamp_millis(value: &str) -> i64 {
    if let Ok(timestamp) = DateTime::parse_from_rfc3339(value) {
        return timestamp.timestamp_millis();
    }
    if let Ok(timestamp) = value.parse::<i64>() {
        return if timestamp.abs() < 10_000_000_000 {
            timestamp.saturating_mul(1000)
        } else {
            timestamp
        };
    }
    0
}

fn row_to_workspace_value(row: &Row<'_>) -> Result<Value, rusqlite::Error> {
    let id: String = row.get(0)?;
    let name: String = row.get(1)?;
    let workspace_type: String = row.get(2)?;
    let root_path: String = row.get(3)?;
    let is_default: bool = row.get(4)?;
    let settings_json: String = row.get(5)?;
    let created_at: i64 = row.get(6)?;
    let updated_at: i64 = row.get(7)?;
    let icon: Option<String> = row.get(8)?;
    let color: Option<String> = row.get(9)?;
    let is_favorite: bool = row.get::<_, Option<bool>>(10)?.unwrap_or(false);
    let is_archived: bool = row.get::<_, Option<bool>>(11)?.unwrap_or(false);
    let tags_json: Option<String> = row.get(12)?;
    let default_persona_id: Option<String> = row.get(13)?;
    let settings: Value = serde_json::from_str(&settings_json).unwrap_or_else(|_| json!({}));
    let tags: Vec<String> = tags_json
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default();

    Ok(json!({
        "id": id,
        "name": name,
        "workspace_type": workspace_type,
        "root_path": root_path,
        "is_default": is_default,
        "settings": settings,
        "created_at": created_at,
        "updated_at": updated_at,
        "icon": icon,
        "color": color,
        "is_favorite": is_favorite,
        "is_archived": is_archived,
        "tags": tags,
        "default_persona_id": default_persona_id,
    }))
}

fn read_workspace_by_id(conn: &rusqlite::Connection, id: &str) -> Result<Option<Value>, String> {
    conn.query_row(
        "SELECT id, name, workspace_type, root_path, is_default, settings_json,
                created_at, updated_at, icon, color, is_favorite, is_archived,
                tags_json, default_persona_id
         FROM workspaces WHERE id = ?",
        params![id],
        row_to_workspace_value,
    )
    .optional()
    .map_err(|error| format!("read workspace failed: {error}"))
}

fn read_workspace_by_root_path(
    conn: &rusqlite::Connection,
    root_path: &Path,
) -> Result<Option<Value>, String> {
    let root_path = root_path
        .to_str()
        .ok_or_else(|| "invalid workspace root path".to_string())?;
    conn.query_row(
        "SELECT id, name, workspace_type, root_path, is_default, settings_json,
                created_at, updated_at, icon, color, is_favorite, is_archived,
                tags_json, default_persona_id
         FROM workspaces WHERE root_path = ?",
        params![root_path],
        row_to_workspace_value,
    )
    .optional()
    .map_err(|error| format!("read workspace by path failed: {error}"))
}

fn read_default_workspace_value(conn: &rusqlite::Connection) -> Result<Option<Value>, String> {
    conn.query_row(
        "SELECT id, name, workspace_type, root_path, is_default, settings_json,
                created_at, updated_at, icon, color, is_favorite, is_archived,
                tags_json, default_persona_id
         FROM workspaces WHERE is_default = 1",
        [],
        row_to_workspace_value,
    )
    .optional()
    .map_err(|error| format!("read default workspace failed: {error}"))
}

fn read_current_default_workspace(conn: &rusqlite::Connection) -> Result<Option<Value>, String> {
    match read_default_workspace_value(conn)? {
        Some(workspace) if workspace_id(&workspace) != Some(LEGACY_DEFAULT_WORKSPACE_ID) => {
            Ok(Some(workspace))
        }
        _ => Ok(None),
    }
}

fn ensure_current_default_workspace(conn: &rusqlite::Connection) -> Result<Value, String> {
    if let Some(workspace) = read_current_default_workspace(conn)? {
        return Ok(workspace);
    }

    let default_project_path = app_paths::resolve_default_project_dir()?;
    if let Some(existing) = read_workspace_by_root_path(conn, &default_project_path)? {
        if workspace_id(&existing) != Some(LEGACY_DEFAULT_WORKSPACE_ID) {
            set_default_workspace(conn, workspace_id(&existing).unwrap_or_default())?;
            return read_workspace_by_root_path(conn, &default_project_path)?
                .ok_or_else(|| "failed to reload default workspace".to_string());
        }
    }

    let creation_path = if read_workspace_by_root_path(conn, &default_project_path)?.is_some() {
        let file_name = default_project_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("default");
        default_project_path.with_file_name(format!("{file_name}-current"))
    } else {
        default_project_path
    };
    fs::create_dir_all(&creation_path)
        .map_err(|error| format!("create default project directory failed: {error}"))?;

    if let Some(existing) = read_workspace_by_root_path(conn, &creation_path)? {
        set_default_workspace(conn, workspace_id(&existing).unwrap_or_default())?;
        return read_workspace_by_root_path(conn, &creation_path)?
            .ok_or_else(|| "failed to reload default workspace".to_string());
    }

    let now = Utc::now().timestamp_millis();
    let id = Uuid::new_v4().to_string();
    let root_path = creation_path
        .to_str()
        .ok_or_else(|| "invalid default project path".to_string())?
        .to_string();
    conn.execute(
        "INSERT INTO workspaces (
            id, name, workspace_type, root_path, is_default, settings_json,
            icon, color, is_favorite, is_archived, tags_json, default_persona_id,
            created_at, updated_at
         )
         VALUES (?, ?, ?, ?, 1, '{}', NULL, NULL, 0, 0, '[]', NULL, ?, ?)",
        params![id, DEFAULT_PROJECT_NAME, "persistent", root_path, now, now],
    )
    .map_err(|error| format!("create default workspace failed: {error}"))?;
    set_default_workspace(conn, &id)?;
    read_workspace_by_id(conn, &id)?.ok_or_else(|| "failed to load default workspace".to_string())
}

fn set_default_workspace(conn: &rusqlite::Connection, id: &str) -> Result<(), String> {
    conn.execute("UPDATE workspaces SET is_default = 0", [])
        .map_err(|error| format!("clear default workspace failed: {error}"))?;
    let updated_at = Utc::now().timestamp_millis();
    let affected = conn
        .execute(
            "UPDATE workspaces SET is_default = 1, updated_at = ? WHERE id = ?",
            params![updated_at, id],
        )
        .map_err(|error| format!("set default workspace failed: {error}"))?;
    if affected == 0 {
        return Err(format!("workspace not found: {id}"));
    }
    Ok(())
}

fn workspace_id(value: &Value) -> Option<&str> {
    value.get("id").and_then(Value::as_str)
}

fn sanitize_project_dir_name(name: &str) -> String {
    let sanitized: String = name
        .trim()
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ if ch.is_control() => '_',
            _ => ch,
        })
        .collect();
    let trimmed = sanitized.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed
    }
}

fn skill_to_executable_value(skill: LoadedSkillDefinition) -> Value {
    json!({
        "name": skill.skill_name,
        "display_name": skill.display_name,
        "description": skill.description,
        "execution_mode": skill.execution_mode,
        "has_workflow": skill.execution_mode == "workflow",
        "provider": skill.provider,
        "model": skill.model,
        "argument_hint": skill.argument_hint,
    })
}

fn skill_to_detail_value(skill: LoadedSkillDefinition) -> Value {
    let workflow_steps = if skill.workflow_steps.is_empty() {
        Value::Null
    } else {
        Value::Array(
            skill
                .workflow_steps
                .iter()
                .map(|step| {
                    json!({
                        "id": step.id,
                        "name": step.name,
                        "dependencies": [],
                    })
                })
                .collect(),
        )
    };
    json!({
        "name": skill.skill_name,
        "display_name": skill.display_name,
        "description": skill.description,
        "execution_mode": skill.execution_mode,
        "has_workflow": skill.execution_mode == "workflow",
        "provider": skill.provider,
        "model": skill.model,
        "argument_hint": skill.argument_hint,
        "markdown_content": skill.markdown_content,
        "workflow_steps": workflow_steps,
        "allowed_tools": skill.allowed_tools,
        "when_to_use": skill.when_to_use,
    })
}

fn list_workspace_skill_bindings_value(
    params: WorkspaceSkillBindingsListParams,
) -> Result<Value, String> {
    let caller = lime_core::tool_calling::normalize_tool_caller(params.caller.as_deref())
        .unwrap_or_else(|| "assistant".to_string());
    let workspace_root = PathBuf::from(params.workspace_root.trim());
    if !workspace_root.is_absolute() {
        return Err(format!(
            "workspaceRoot must be absolute: {}",
            workspace_root.display()
        ));
    }
    let skills_root = workspace_root.join(".agents").join("skills");
    let mut bindings = Vec::new();
    if skills_root.is_dir() {
        let mut entries = fs::read_dir(&skills_root)
            .map_err(|error| format!("read workspace skills failed: {error}"))?
            .flatten()
            .collect::<Vec<_>>();
        entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_string());
        for entry in entries {
            let skill_dir = entry.path();
            if !skill_dir.is_dir() {
                continue;
            }
            let skill_file = skill_dir.join("SKILL.md");
            let registration_file = skill_dir.join(".lime").join("registration.json");
            if !skill_file.is_file() || !registration_file.is_file() {
                continue;
            }
            let directory = entry.file_name().to_string_lossy().to_string();
            let skill = load_skill_from_file(&directory, &skill_file)?;
            let registration: Value = fs::read_to_string(&registration_file)
                .map_err(|error| format!("read skill registration failed: {error}"))
                .and_then(|content| {
                    serde_json::from_str(&content)
                        .map_err(|error| format!("parse skill registration failed: {error}"))
                })?;
            let source_verification_report_id = registration
                .get("sourceVerificationReportId")
                .or_else(|| registration.get("source_verification_report_id"))
                .and_then(Value::as_str);
            let standard_compliance = serde_json::to_value(&skill.standard_compliance)
                .map_err(|error| format!("serialize skill standard compliance failed: {error}"))?;
            let resource_summary = skill_resource_summary(&skill_dir)?;
            let permission_summary = registration
                .get("permissionSummary")
                .or_else(|| registration.get("permission_summary"))
                .and_then(Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(Value::as_str)
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let allowed_tools = skill.allowed_tools.clone().unwrap_or_default();
            let binding_status = if skill.standard_compliance.validation_errors.is_empty()
                && source_verification_report_id.is_some()
            {
                "ready_for_manual_enable"
            } else {
                "blocked"
            };
            let binding_status_reason = if binding_status == "ready_for_manual_enable" {
                "已具备 workspace skill runtime binding 候选资格；当前仍未注入默认工具面。"
            } else if !skill.standard_compliance.validation_errors.is_empty() {
                "Agent Skills 标准检查仍有问题，不能进入 runtime binding。"
            } else {
                "缺少来源 verification report，不能证明该 Skill 通过注册前验证。"
            };
            bindings.push(json!({
                "key": format!("workspace_skill:{directory}"),
                "name": skill.display_name,
                "description": skill.description,
                "directory": directory,
                "registered_skill_directory": skill_dir.to_string_lossy().to_string(),
                "registration": registration,
                "permission_summary": permission_summary,
                "metadata": skill.metadata,
                "allowed_tools": allowed_tools,
                "resource_summary": resource_summary,
                "standard_compliance": standard_compliance,
                "runtime_binding_target": "workspace_skill",
                "binding_status": binding_status,
                "binding_status_reason": binding_status_reason,
                "next_gate": if binding_status == "ready_for_manual_enable" {
                    "manual_runtime_enable"
                } else {
                    "restore_verification_provenance"
                },
                "query_loop_visible": false,
                "tool_runtime_visible": false,
                "launch_enabled": false,
                "runtime_gate": "等待显式 session enable 与 tool_runtime 授权裁剪。",
            }));
        }
    }

    bindings.sort_by(|left, right| {
        let left_key = left
            .get("directory")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let right_key = right
            .get("directory")
            .and_then(Value::as_str)
            .unwrap_or_default();
        left_key.cmp(right_key)
    });
    let ready_total = bindings
        .iter()
        .filter(|binding| {
            binding.get("binding_status").and_then(Value::as_str) == Some("ready_for_manual_enable")
        })
        .count();
    let blocked_total = bindings.len().saturating_sub(ready_total);
    Ok(json!({
        "request": {
            "workspace_root": workspace_root.to_string_lossy().to_string(),
            "caller": caller,
            "surface": {
                "workbench": params.workbench,
                "browser_assist": params.browser_assist,
            },
        },
        "warnings": [
            "当前只返回 workspace 本地注册 Skill 的只读 readiness；不会 reload Skill，也不会注入默认工具面。"
        ],
        "counts": {
            "registered_total": bindings.len(),
            "ready_for_manual_enable_total": ready_total,
            "blocked_total": blocked_total,
            "query_loop_visible_total": 0,
            "tool_runtime_visible_total": 0,
            "launch_enabled_total": 0,
        },
        "bindings": bindings,
    }))
}

fn skill_resource_summary(skill_dir: &Path) -> Result<Value, String> {
    let references = skill_dir.join("references");
    let scripts = skill_dir.join("scripts");
    let assets = skill_dir.join("assets");
    Ok(json!({
        "hasScripts": scripts.is_dir(),
        "hasReferences": references.is_dir(),
        "hasAssets": assets.is_dir(),
    }))
}

fn values_from_serializable_vec<T: serde::Serialize>(
    values: Vec<T>,
) -> Result<Vec<Value>, RuntimeCoreError> {
    values
        .into_iter()
        .map(|value| serde_json::to_value(value).map_err(data_error))
        .collect()
}

fn provider_with_keys_to_value(
    provider_with_keys: &ProviderWithKeys,
    service: &ApiKeyProviderService,
) -> Value {
    let provider = &provider_with_keys.provider;
    let api_keys: Vec<Value> = provider_with_keys
        .api_keys
        .iter()
        .map(|api_key| api_key_to_value(api_key, service))
        .collect();
    json!({
        "id": provider.id,
        "name": provider.name,
        "type": provider.effective_provider_type().to_string(),
        "api_host": provider.api_host,
        "is_system": provider.is_system,
        "group": provider.group.to_string(),
        "enabled": provider.enabled,
        "sort_order": provider.sort_order,
        "api_version": provider.api_version,
        "project": provider.project,
        "location": provider.location,
        "region": provider.region,
        "custom_models": provider.custom_models,
        "prompt_cache_mode": provider.effective_prompt_cache_mode().map(|mode| mode.to_string()),
        "api_key_count": provider_with_keys.api_keys.len(),
        "created_at": provider.created_at.to_rfc3339(),
        "updated_at": provider.updated_at.to_rfc3339(),
        "api_keys": api_keys,
    })
}

fn api_key_to_value(api_key: &ApiKeyEntry, service: &ApiKeyProviderService) -> Value {
    let api_key_masked = service
        .decrypt_api_key(&api_key.api_key_encrypted)
        .map(|decrypted| mask_api_key(&decrypted))
        .unwrap_or_else(|_| "****".to_string());
    json!({
        "id": api_key.id,
        "provider_id": api_key.provider_id,
        "api_key_masked": api_key_masked,
        "alias": api_key.alias,
        "enabled": api_key.enabled,
        "usage_count": api_key.usage_count,
        "error_count": api_key.error_count,
        "last_used_at": api_key.last_used_at.map(|value| value.to_rfc3339()),
        "created_at": api_key.created_at.to_rfc3339(),
    })
}

fn mask_api_key(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 12 {
        "****".to_string()
    } else {
        let prefix: String = chars[..6].iter().collect();
        let suffix: String = chars[chars.len() - 4..].iter().collect();
        format!("{prefix}****{suffix}")
    }
}

fn system_provider_to_value(provider: SystemProviderDef) -> Value {
    json!({
        "id": provider.id,
        "name": provider.name,
        "type": provider.provider_type.to_string(),
        "api_host": provider.api_host,
        "group": provider.group.to_string(),
        "sort_order": provider.sort_order,
        "api_version": provider.api_version,
        "legacy_ids": legacy_provider_ids(provider.id),
    })
}

fn legacy_provider_ids(provider_id: &str) -> Vec<String> {
    match provider_id {
        "lime-hub" => vec![format!("{}{}", "lobe", "hub")],
        "google" => vec!["gemini".to_string()],
        "zhipuai" => vec!["zhipu".to_string()],
        "alibaba" => vec!["dashscope".to_string(), "qwen".to_string()],
        "moonshotai" => vec!["moonshot".to_string()],
        "xai" => vec!["grok".to_string()],
        "github-models" => vec!["github".to_string()],
        "github-copilot" => vec!["copilot".to_string()],
        "google-vertex" => vec!["vertexai".to_string()],
        "azure-openai" => vec!["azure".to_string()],
        "amazon-bedrock" => vec!["aws-bedrock".to_string(), "bedrock".to_string()],
        "togetherai" => vec!["together".to_string()],
        "fireworks-ai" => vec!["fireworks".to_string(), "fireworksai".to_string()],
        "xiaomi" => vec!["mimo".to_string(), "xiaomimimo".to_string()],
        "siliconflow" => vec!["silicon".to_string(), "siliconcloud".to_string()],
        "302ai" => vec!["ai302".to_string()],
        "new-api" => vec!["newapi".to_string()],
        "vercel-gateway" => vec!["vercelaigateway".to_string()],
        "fal" => vec!["falai".to_string()],
        "yi" => vec!["zeroone".to_string()],
        "infini" => vec!["infiniai".to_string()],
        "doubao" => vec!["volcengine".to_string()],
        "airgate-openai-images" => vec!["airgate".to_string(), "k8ray".to_string()],
        "baidu-cloud" => vec!["wenxin".to_string()],
        "tencent-cloud-ti" => vec!["tencentcloud".to_string()],
        _ => vec![],
    }
}

fn data_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::database::dao::agent_timeline::AgentThreadItemPayload;
    use lime_core::database::dao::agent_timeline::AgentThreadItemStatus;
    use lime_core::database::schema::create_tables;
    use rusqlite::Connection;
    use std::sync::Arc;
    use std::sync::Mutex;

    const WORKSPACE_ID: &str = "workspace-current";
    const WORKSPACE_ROOT: &str = "/tmp/lime-current-workspace";
    const NOW: &str = "2026-03-13T01:00:00Z";

    fn setup_data_source() -> LocalAppDataSource {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        create_tables(&conn).expect("create schema");
        conn.execute(
            "INSERT INTO workspaces (
                id, name, workspace_type, root_path, is_default, settings_json,
                created_at, updated_at, icon, color, is_favorite, is_archived,
                tags_json, default_persona_id
             )
             VALUES (?1, '当前工作区', 'persistent', ?2, 1, '{}', 1, 1,
                     NULL, NULL, 0, 0, '[]', NULL)",
            params![WORKSPACE_ID, WORKSPACE_ROOT],
        )
        .expect("insert workspace");
        LocalAppDataSource {
            db: Arc::new(Mutex::new(conn)),
            api_key_provider_service: ApiKeyProviderService::new(),
            model_registry_service: ModelRegistryService::new(Arc::new(Mutex::new(
                Connection::open_in_memory().expect("open model db"),
            ))),
        }
    }

    fn insert_session(conn: &Connection, id: &str, title: &str, updated_at: &str) {
        conn.execute(
            "INSERT INTO agent_sessions (
                id, model, system_prompt, title, created_at, updated_at,
                working_dir, execution_strategy
             )
             VALUES (?1, 'agent:default', NULL, ?2, ?3, ?4, ?5, 'react')",
            params![id, title, NOW, updated_at, WORKSPACE_ROOT],
        )
        .expect("insert session");
    }

    fn insert_legacy_message_only_session(conn: &Connection) {
        insert_session(conn, "legacy-session", "旧消息会话", "2026-03-13T01:00:01Z");
        conn.execute(
            "INSERT INTO agent_messages (
                session_id, role, content_json, timestamp
             )
             VALUES ('legacy-session', 'user', '[{\"type\":\"text\",\"text\":\"旧消息\"}]', ?1)",
            params![NOW],
        )
        .expect("insert legacy message");
    }

    fn insert_current_timeline_session(conn: &Connection) {
        insert_session(
            conn,
            "current-session",
            "Current Timeline 会话",
            "2026-03-13T01:00:03Z",
        );
        let turn = AgentThreadTurn {
            id: "turn-current".to_string(),
            thread_id: "current-session".to_string(),
            prompt_text: "帮我检查 current timeline".to_string(),
            status: AgentThreadTurnStatus::Completed,
            started_at: "2026-03-13T01:00:02Z".to_string(),
            completed_at: Some("2026-03-13T01:00:03Z".to_string()),
            error_message: None,
            created_at: "2026-03-13T01:00:02Z".to_string(),
            updated_at: "2026-03-13T01:00:03Z".to_string(),
        };
        AgentTimelineDao::create_turn(conn, &turn).expect("insert turn");
        AgentTimelineDao::upsert_item(
            conn,
            &AgentThreadItem {
                id: "item-user".to_string(),
                thread_id: "current-session".to_string(),
                turn_id: "turn-current".to_string(),
                sequence: 1,
                status: AgentThreadItemStatus::Completed,
                started_at: "2026-03-13T01:00:02Z".to_string(),
                completed_at: Some("2026-03-13T01:00:02Z".to_string()),
                updated_at: "2026-03-13T01:00:02Z".to_string(),
                payload: AgentThreadItemPayload::UserMessage {
                    content: "帮我检查 current timeline".to_string(),
                },
            },
        )
        .expect("insert user item");
        AgentTimelineDao::upsert_item(
            conn,
            &AgentThreadItem {
                id: "item-agent".to_string(),
                thread_id: "current-session".to_string(),
                turn_id: "turn-current".to_string(),
                sequence: 2,
                status: AgentThreadItemStatus::Completed,
                started_at: "2026-03-13T01:00:03Z".to_string(),
                completed_at: Some("2026-03-13T01:00:03Z".to_string()),
                updated_at: "2026-03-13T01:00:03Z".to_string(),
                payload: AgentThreadItemPayload::AgentMessage {
                    text: "已完成".to_string(),
                    phase: None,
                },
            },
        )
        .expect("insert agent item");
    }

    #[tokio::test]
    async fn list_current_timeline_sessions_excludes_legacy_message_only_sessions() {
        let data_source = setup_data_source();
        {
            let conn = database::lock_db(&data_source.db).expect("lock db");
            insert_legacy_message_only_session(&conn);
            insert_current_timeline_session(&conn);
        }

        let response = data_source
            .list_current_timeline_sessions(AgentSessionListParams {
                workspace_id: Some(WORKSPACE_ID.to_string()),
                limit: Some(20),
                ..AgentSessionListParams::default()
            })
            .await
            .expect("list sessions");

        assert_eq!(response.sessions.len(), 1);
        assert_eq!(response.sessions[0].session_id, "current-session");
        assert_eq!(
            response.sessions[0].title.as_deref(),
            Some("Current Timeline 会话")
        );
        assert_eq!(
            response.sessions[0].workspace_id.as_deref(),
            Some(WORKSPACE_ID)
        );
        assert_eq!(response.sessions[0].messages_count, 2);
    }

    #[tokio::test]
    async fn list_current_timeline_sessions_orders_by_latest_timeline_activity() {
        let data_source = setup_data_source();
        {
            let conn = database::lock_db(&data_source.db).expect("lock db");
            insert_session(
                &conn,
                "older-metadata-newer-timeline",
                "Timeline 最新",
                "2026-03-13T01:00:00Z",
            );
            let turn = AgentThreadTurn {
                id: "turn-newer".to_string(),
                thread_id: "older-metadata-newer-timeline".to_string(),
                prompt_text: "新 timeline".to_string(),
                status: AgentThreadTurnStatus::Completed,
                started_at: "2026-03-13T02:00:00Z".to_string(),
                completed_at: Some("2026-03-13T02:00:01Z".to_string()),
                error_message: None,
                created_at: "2026-03-13T02:00:00Z".to_string(),
                updated_at: "2026-03-13T02:00:01Z".to_string(),
            };
            AgentTimelineDao::create_turn(&conn, &turn).expect("insert newer turn");
            AgentTimelineDao::upsert_item(
                &conn,
                &AgentThreadItem {
                    id: "item-newer".to_string(),
                    thread_id: "older-metadata-newer-timeline".to_string(),
                    turn_id: "turn-newer".to_string(),
                    sequence: 1,
                    status: AgentThreadItemStatus::Completed,
                    started_at: "2026-03-13T02:00:00Z".to_string(),
                    completed_at: Some("2026-03-13T02:00:01Z".to_string()),
                    updated_at: "2026-03-13T02:00:01Z".to_string(),
                    payload: AgentThreadItemPayload::AgentMessage {
                        text: "新结果".to_string(),
                        phase: None,
                    },
                },
            )
            .expect("insert newer item");

            insert_session(
                &conn,
                "newer-metadata-older-timeline",
                "元数据更新但 timeline 更旧",
                "2026-03-13T03:00:00Z",
            );
            let older_turn = AgentThreadTurn {
                id: "turn-older".to_string(),
                thread_id: "newer-metadata-older-timeline".to_string(),
                prompt_text: "旧 timeline".to_string(),
                status: AgentThreadTurnStatus::Completed,
                started_at: "2026-03-13T01:30:00Z".to_string(),
                completed_at: Some("2026-03-13T01:30:01Z".to_string()),
                error_message: None,
                created_at: "2026-03-13T01:30:00Z".to_string(),
                updated_at: "2026-03-13T01:30:01Z".to_string(),
            };
            AgentTimelineDao::create_turn(&conn, &older_turn).expect("insert older turn");
        }

        let response = data_source
            .list_current_timeline_sessions(AgentSessionListParams {
                workspace_id: Some(WORKSPACE_ID.to_string()),
                limit: Some(20),
                ..AgentSessionListParams::default()
            })
            .await
            .expect("list sessions");

        assert_eq!(
            response.sessions[0].session_id,
            "older-metadata-newer-timeline"
        );
        assert_eq!(response.sessions[0].updated_at, "2026-03-13T02:00:01Z");
    }

    #[tokio::test]
    async fn read_current_timeline_session_returns_compat_detail_with_turns_and_items() {
        let data_source = setup_data_source();
        {
            let conn = database::lock_db(&data_source.db).expect("lock db");
            insert_legacy_message_only_session(&conn);
            insert_current_timeline_session(&conn);
        }

        let missing_legacy = data_source
            .read_current_timeline_session(AgentSessionReadParams {
                session_id: "legacy-session".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await
            .expect("read legacy session");
        assert!(missing_legacy.is_none());

        let response = data_source
            .read_current_timeline_session(AgentSessionReadParams {
                session_id: "current-session".to_string(),
                history_limit: Some(10),
                history_offset: Some(0),
                history_before_message_id: None,
            })
            .await
            .expect("read current session")
            .expect("current session detail");

        assert_eq!(response.session.session_id, "current-session");
        assert_eq!(response.turns.len(), 1);
        assert_eq!(response.turns[0].turn_id, "turn-current");
        let detail = response.detail.expect("compat detail");
        assert_eq!(detail["id"], "current-session");
        assert_eq!(detail["messages_count"], 2);
        assert_eq!(detail["messages"].as_array().expect("messages").len(), 0);
        assert_eq!(detail["turns"].as_array().expect("turns").len(), 1);
        assert_eq!(detail["items"].as_array().expect("items").len(), 2);
        assert_eq!(detail["history_cursor"]["loaded_count"], 2);
    }
}
