use crate::AppDataSource;
use crate::RuntimeCoreError;
use app_server_protocol::AgentAppCloudReleaseDescriptor;
use app_server_protocol::AgentAppFetchCloudPackageParams;
use app_server_protocol::AgentAppInstalledDisabledSetParams;
use app_server_protocol::AgentAppInstalledListResponse;
use app_server_protocol::AgentAppInstalledSaveParams;
use app_server_protocol::AgentAppLocalPackageInspectParams;
use app_server_protocol::AgentAppLocalPackageInspectResponse;
use app_server_protocol::AgentAppPackageCacheEntry;
use app_server_protocol::AgentAppPackageIdentity;
use app_server_protocol::AgentAppUninstallParams;
use app_server_protocol::AgentAppUninstallRehearsalParams;
use app_server_protocol::AgentAppUninstallRehearsalResponse;
use app_server_protocol::AgentAppUninstallRehearsalTarget;
use app_server_protocol::AgentAppUninstallResponse;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::AgentSessionListResponse;
use app_server_protocol::AgentSessionOverview;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentSessionUpdateParams;
use app_server_protocol::AgentSessionUpdateResponse;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::AutomationJobCreateParams;
use app_server_protocol::AutomationJobDeleteResponse;
use app_server_protocol::AutomationJobHealthParams;
use app_server_protocol::AutomationJobHealthResponse;
use app_server_protocol::AutomationJobIdParams;
use app_server_protocol::AutomationJobListResponse;
use app_server_protocol::AutomationJobReadResponse;
use app_server_protocol::AutomationJobRunHistoryParams;
use app_server_protocol::AutomationJobRunHistoryResponse;
use app_server_protocol::AutomationJobRunNowResponse;
use app_server_protocol::AutomationJobUpdateParams;
use app_server_protocol::AutomationJobWriteResponse;
use app_server_protocol::AutomationScheduleParams;
use app_server_protocol::AutomationSchedulePreviewResponse;
use app_server_protocol::AutomationScheduleValidateResponse;
use app_server_protocol::AutomationSchedulerConfigReadResponse;
use app_server_protocol::AutomationSchedulerConfigUpdateParams;
use app_server_protocol::AutomationSchedulerConfigUpdateResponse;
use app_server_protocol::AutomationSchedulerStatusResponse;
use app_server_protocol::BusinessObjectRef;
use app_server_protocol::ConnectCallbackSendParams;
use app_server_protocol::ConnectCallbackSendResponse;
use app_server_protocol::ConnectCallbackStatus;
use app_server_protocol::ConnectDeepLinkResolveParams;
use app_server_protocol::ConnectDeepLinkResolveResponse;
use app_server_protocol::ConnectOpenDeepLinkResolveParams;
use app_server_protocol::ConnectOpenDeepLinkResolveResponse;
use app_server_protocol::ConnectPayload;
use app_server_protocol::ConnectRelayApiKeySaveParams;
use app_server_protocol::ConnectRelayApiKeySaveResponse;
use app_server_protocol::KnowledgeCompilePackResponse;
use app_server_protocol::KnowledgeContextResolutionResponse;
use app_server_protocol::KnowledgeImportSourceParams;
use app_server_protocol::KnowledgeImportSourceResponse;
use app_server_protocol::KnowledgeListPacksParams;
use app_server_protocol::KnowledgeListPacksResponse;
use app_server_protocol::KnowledgeReadPackParams;
use app_server_protocol::KnowledgeReadPackResponse;
use app_server_protocol::KnowledgeResolveContextPackParams;
use app_server_protocol::KnowledgeResolveContextParams;
use app_server_protocol::KnowledgeSetDefaultPackParams;
use app_server_protocol::KnowledgeSetDefaultPackResponse;
use app_server_protocol::KnowledgeUpdatePackStatusParams;
use app_server_protocol::KnowledgeUpdatePackStatusResponse;
use app_server_protocol::KnowledgeValidateContextRunParams;
use app_server_protocol::KnowledgeValidateContextRunResponse;
use app_server_protocol::McpPromptListResponse;
use app_server_protocol::McpResourceListResponse;
use app_server_protocol::McpServerListResponse;
use app_server_protocol::McpServerStatusListResponse;
use app_server_protocol::McpToolListResponse;
use app_server_protocol::ModelListParams;
use app_server_protocol::ModelListResponse;
use app_server_protocol::ModelPreferencesListResponse;
use app_server_protocol::ModelProviderAliasListResponse;
use app_server_protocol::ModelProviderAliasReadParams;
use app_server_protocol::ModelProviderAliasReadResponse;
use app_server_protocol::ModelProviderCatalogListResponse;
use app_server_protocol::ModelProviderConfigExportParams;
use app_server_protocol::ModelProviderConfigExportResponse;
use app_server_protocol::ModelProviderConfigImportParams;
use app_server_protocol::ModelProviderConfigImportResponse;
use app_server_protocol::ModelProviderCreateParams;
use app_server_protocol::ModelProviderDeleteParams;
use app_server_protocol::ModelProviderDeleteResponse;
use app_server_protocol::ModelProviderFetchModelsParams;
use app_server_protocol::ModelProviderFetchModelsResponse;
use app_server_protocol::ModelProviderKeyCreateParams;
use app_server_protocol::ModelProviderKeyDeleteParams;
use app_server_protocol::ModelProviderKeyDeleteResponse;
use app_server_protocol::ModelProviderKeyEventParams;
use app_server_protocol::ModelProviderKeyNextParams;
use app_server_protocol::ModelProviderKeyNextResponse;
use app_server_protocol::ModelProviderKeyUpdateParams;
use app_server_protocol::ModelProviderKeyWriteResponse;
use app_server_protocol::ModelProviderListResponse;
use app_server_protocol::ModelProviderMutationResponse;
use app_server_protocol::ModelProviderReadParams;
use app_server_protocol::ModelProviderReadResponse;
use app_server_protocol::ModelProviderSortOrdersUpdateParams;
use app_server_protocol::ModelProviderTestChatParams;
use app_server_protocol::ModelProviderTestChatResponse;
use app_server_protocol::ModelProviderTestConnectionParams;
use app_server_protocol::ModelProviderTestConnectionResponse;
use app_server_protocol::ModelProviderUiStateReadParams;
use app_server_protocol::ModelProviderUiStateReadResponse;
use app_server_protocol::ModelProviderUiStateWriteParams;
use app_server_protocol::ModelProviderUpdateParams;
use app_server_protocol::ModelProviderWriteResponse;
use app_server_protocol::ModelSyncStateReadResponse;
use app_server_protocol::OpenDeepLinkPayload;
use app_server_protocol::ProjectMemoryReadParams;
use app_server_protocol::ProjectMemoryReadResponse;
use app_server_protocol::SkillListResponse;
use app_server_protocol::SkillReadParams;
use app_server_protocol::SkillReadResponse;
use app_server_protocol::UsageStatsDailyTrendsListResponse;
use app_server_protocol::UsageStatsDailyUsage;
use app_server_protocol::UsageStatsModelRankingListResponse;
use app_server_protocol::UsageStatsModelUsage;
use app_server_protocol::UsageStatsRangeParams;
use app_server_protocol::UsageStatsReadResponse;
use app_server_protocol::UsageStatsSummary;
use app_server_protocol::WorkspaceEnsureParams;
use app_server_protocol::WorkspaceEnsureReadyResponse;
use app_server_protocol::WorkspaceListResponse;
use app_server_protocol::WorkspacePathReadParams;
use app_server_protocol::WorkspaceProjectPathResolveParams;
use app_server_protocol::WorkspaceProjectPathResolveResponse;
use app_server_protocol::WorkspaceProjectsRootReadResponse;
use app_server_protocol::WorkspaceReadParams;
use app_server_protocol::WorkspaceReadResponse;
use app_server_protocol::WorkspaceRegisteredSkillsListParams;
use app_server_protocol::WorkspaceRegisteredSkillsListResponse;
use app_server_protocol::WorkspaceSkillBindingsListParams;
use app_server_protocol::WorkspaceSkillBindingsListResponse;
use async_trait::async_trait;
use chrono::DateTime;
use chrono::Duration;
use chrono::Timelike;
use chrono::Utc;
use lime_core::app_paths;
use lime_core::config::load_config;
use lime_core::config::save_config;
use lime_core::config::AutomationExecutionMode;
use lime_core::config::AutomationSettings;
use lime_core::config::DeliveryConfig;
use lime_core::config::TaskSchedule;
use lime_core::connect;
use lime_core::database;
use lime_core::database::dao::agent_run::AgentRun;
use lime_core::database::dao::agent_run::AgentRunDao;
use lime_core::database::dao::agent_run::AgentRunStatus;
use lime_core::database::dao::agent_timeline::AgentThreadItem;
use lime_core::database::dao::agent_timeline::AgentThreadTurn;
use lime_core::database::dao::agent_timeline::AgentThreadTurnStatus;
use lime_core::database::dao::agent_timeline::AgentTimelineDao;
use lime_core::database::dao::api_key_provider::ApiKeyEntry;
use lime_core::database::dao::api_key_provider::ApiKeyProvider;
use lime_core::database::dao::api_key_provider::ApiProviderPromptCacheMode;
use lime_core::database::dao::api_key_provider::ApiProviderType;
use lime_core::database::dao::api_key_provider::ProviderWithKeys;
use lime_core::database::dao::automation_job::AutomationJob;
use lime_core::database::dao::automation_job::AutomationJobDao;
use lime_core::database::system_providers::get_system_providers;
use lime_core::database::system_providers::SystemProviderDef;
use lime_core::database::DbConnection;
use lime_core::models::model_registry::ModelTier;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use lime_services::mcp_service::McpService;
use lime_services::model_registry_service::FetchModelsResult;
use lime_services::model_registry_service::ModelRegistryService;
use lime_services::usage_statistics_service;
use lime_skills::find_skill_by_name;
use lime_skills::get_skill_roots;
use lime_skills::load_skill_from_file;
use lime_skills::load_skills_from_directory;
use lime_skills::LoadedSkillDefinition;
use rusqlite::params;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use serde::Deserialize;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use sha2::Digest;
use sha2::Sha256;
use std::fs;
use std::io;
use std::io::Cursor;
use std::path::Path;
use std::path::PathBuf;
use std::str::FromStr;
use url::Url;
use uuid::Uuid;
use zip::ZipArchive;

const CURRENT_TIMELINE_LIST_MAX_LIMIT: usize = 1_000;
const CURRENT_TIMELINE_HISTORY_DEFAULT_LIMIT: usize = 320;
const CURRENT_TIMELINE_HISTORY_MAX_LIMIT: usize = 1_000;
const APP_ID_AGENT_RUNTIME: &str = "agent-runtime";
const LEGACY_DEFAULT_WORKSPACE_ID: &str = "workspace-default";
const DEFAULT_PROJECT_NAME: &str = "默认项目";
const AGENT_APP_DATA_DIR: &str = "agent-apps";
const INSTALLED_AGENT_APP_STATE_SCHEMA_VERSION: u64 = 1;
const AGENT_APP_ARRAY_LAYER_FILES: &[(&str, &str)] = &[
    ("app.entries.yaml", "entries"),
    ("app.permissions.yaml", "permissions"),
];
const AGENT_APP_VALUE_LAYER_FILES: &[(&str, &str, &str)] = &[
    ("app.capabilities.yaml", "capabilities", "capabilityConfig"),
    ("app.errors.yaml", "errors", "errors"),
    ("app.i18n.yaml", "i18n", "i18n"),
    ("app.signature.yaml", "signature", "signature"),
    ("app.runtime.yaml", "agentRuntime", "agentRuntime"),
    ("app.install.yaml", "install", "install"),
    ("evals/readiness.yaml", "readiness", "readiness"),
    ("evals/health.yaml", "health", "health"),
];

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
        let include_archived = params.include_archived.unwrap_or(false);
        let archived_only = params.archived_only.unwrap_or(false);
        let limit = params
            .limit
            .map(|value| (value as usize).min(CURRENT_TIMELINE_LIST_MAX_LIMIT));
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let sessions = query_current_timeline_session_overviews(
            &conn,
            include_archived,
            archived_only,
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
        let current_response = {
            let conn = database::lock_db(&self.db).map_err(data_error)?;
            let Some(session) =
                query_current_timeline_session(&conn, &params.session_id).map_err(data_error)?
            else {
                return Ok(None);
            };
            let has_timeline = current_timeline_session_has_entries(&conn, &params.session_id)
                .map_err(data_error)?;
            if !has_timeline {
                return Ok(None);
            } else {
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

                Some(AgentSessionReadResponse {
                    session: current_timeline_session_to_protocol(&session),
                    turns,
                    detail: Some(detail),
                })
            }
        };

        if let Some(response) = current_response {
            return Ok(Some(response));
        }

        Ok(None)
    }

    async fn update_current_timeline_session(
        &self,
        params: AgentSessionUpdateParams,
    ) -> Result<AgentSessionUpdateResponse, RuntimeCoreError> {
        let session_id = params.session_id.trim();
        if session_id.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "sessionId is required for agentSession/update".to_string(),
            ));
        }

        let title = params
            .title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let provider_selector = params
            .provider_selector
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let provider_name = params
            .provider_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let model_name = params
            .model_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let execution_strategy = params
            .execution_strategy
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let recent_access_mode = params
            .recent_access_mode
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        update_current_timeline_session_row(
            &conn,
            session_id,
            title,
            provider_selector,
            provider_name,
            model_name,
            execution_strategy,
            params.archived,
            recent_access_mode,
            params.recent_preferences.as_ref(),
            params.recent_team_selection.as_ref(),
        )
        .map_err(data_error)?;
        let session = query_current_timeline_session(&conn, session_id)
            .map_err(data_error)?
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;

        Ok(AgentSessionUpdateResponse {
            session: current_timeline_session_overview(session),
        })
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

    async fn list_workspace_registered_skills(
        &self,
        params: WorkspaceRegisteredSkillsListParams,
    ) -> Result<WorkspaceRegisteredSkillsListResponse, RuntimeCoreError> {
        Ok(WorkspaceRegisteredSkillsListResponse {
            skills: list_workspace_registered_skills_value(params).map_err(data_error)?,
        })
    }

    async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        list_agent_app_installed_state().map_err(data_error)
    }

    async fn inspect_agent_app_local_package(
        &self,
        params: AgentAppLocalPackageInspectParams,
    ) -> Result<AgentAppLocalPackageInspectResponse, RuntimeCoreError> {
        inspect_agent_app_local_package(params).map_err(data_error)
    }

    async fn fetch_agent_app_cloud_package(
        &self,
        params: AgentAppFetchCloudPackageParams,
    ) -> Result<AgentAppPackageCacheEntry, RuntimeCoreError> {
        fetch_agent_app_cloud_package(params)
            .await
            .map_err(data_error)
    }

    async fn save_agent_app_installed(
        &self,
        params: AgentAppInstalledSaveParams,
    ) -> Result<Value, RuntimeCoreError> {
        save_agent_app_installed_state(params).map_err(data_error)
    }

    async fn set_agent_app_installed_disabled(
        &self,
        params: AgentAppInstalledDisabledSetParams,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        set_agent_app_installed_disabled(params).map_err(data_error)
    }

    async fn preview_agent_app_uninstall(
        &self,
        params: AgentAppUninstallRehearsalParams,
    ) -> Result<AgentAppUninstallRehearsalResponse, RuntimeCoreError> {
        build_agent_app_uninstall_rehearsal(params.app_id, params.mode).map_err(data_error)
    }

    async fn uninstall_agent_app(
        &self,
        params: AgentAppUninstallParams,
    ) -> Result<AgentAppUninstallResponse, RuntimeCoreError> {
        uninstall_agent_app(params).map_err(data_error)
    }

    async fn list_knowledge_packs(
        &self,
        params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
        let response =
            lime_knowledge::list_knowledge_packs(lime_knowledge::KnowledgeListPacksRequest {
                working_dir: params.working_dir,
                include_archived: params.include_archived,
            })
            .map_err(data_error)?;
        Ok(KnowledgeListPacksResponse {
            working_dir: response.working_dir,
            root_path: response.root_path,
            packs: values_from_serializable_vec(response.packs)?,
        })
    }

    async fn read_knowledge_pack(
        &self,
        params: KnowledgeReadPackParams,
    ) -> Result<KnowledgeReadPackResponse, RuntimeCoreError> {
        let pack = lime_knowledge::get_knowledge_pack(lime_knowledge::KnowledgeGetPackRequest {
            working_dir: params.working_dir,
            name: params.name,
        })
        .map_err(data_error)?;

        Ok(KnowledgeReadPackResponse {
            pack: value_from_serializable(pack)?,
        })
    }

    async fn import_knowledge_source(
        &self,
        params: KnowledgeImportSourceParams,
    ) -> Result<KnowledgeImportSourceResponse, RuntimeCoreError> {
        let response =
            lime_knowledge::import_knowledge_source(lime_knowledge::KnowledgeImportSourceRequest {
                working_dir: params.working_dir,
                pack_name: params.pack_name,
                description: params.description,
                pack_type: params.pack_type,
                language: params.language,
                source_file_name: params.source_file_name,
                source_text: params.source_text,
            })
            .map_err(data_error)?;

        Ok(KnowledgeImportSourceResponse {
            pack: value_from_serializable(response.pack)?,
            source: value_from_serializable(response.source)?,
        })
    }

    async fn compile_knowledge_pack(
        &self,
        request: lime_knowledge::KnowledgeCompilePackRequest,
    ) -> Result<KnowledgeCompilePackResponse, RuntimeCoreError> {
        let response = lime_knowledge::compile_knowledge_pack(request).map_err(data_error)?;

        Ok(KnowledgeCompilePackResponse {
            pack: value_from_serializable(response.pack)?,
            selected_source_count: response.selected_source_count,
            compiled_view: value_from_serializable(response.compiled_view)?,
            run: value_from_serializable(response.run)?,
            warnings: response.warnings,
        })
    }

    async fn set_default_knowledge_pack(
        &self,
        params: KnowledgeSetDefaultPackParams,
    ) -> Result<KnowledgeSetDefaultPackResponse, RuntimeCoreError> {
        let response = lime_knowledge::set_default_knowledge_pack(
            lime_knowledge::KnowledgeSetDefaultPackRequest {
                working_dir: params.working_dir,
                name: params.name,
            },
        )
        .map_err(data_error)?;

        Ok(KnowledgeSetDefaultPackResponse {
            default_pack_name: response.default_pack_name,
            default_marker_path: response.default_marker_path,
        })
    }

    async fn update_knowledge_pack_status(
        &self,
        params: KnowledgeUpdatePackStatusParams,
    ) -> Result<KnowledgeUpdatePackStatusResponse, RuntimeCoreError> {
        let response = lime_knowledge::update_knowledge_pack_status(
            lime_knowledge::KnowledgeUpdatePackStatusRequest {
                working_dir: params.working_dir,
                name: params.name,
                status: params.status,
            },
        )
        .map_err(data_error)?;

        Ok(KnowledgeUpdatePackStatusResponse {
            pack: value_from_serializable(response.pack)?,
            previous_status: response.previous_status,
            cleared_default: response.cleared_default,
        })
    }

    async fn resolve_knowledge_context(
        &self,
        params: KnowledgeResolveContextParams,
    ) -> Result<KnowledgeContextResolutionResponse, RuntimeCoreError> {
        let response = lime_knowledge::resolve_knowledge_context(
            lime_knowledge::KnowledgeResolveContextRequest {
                working_dir: params.working_dir,
                name: params.name,
                packs: params
                    .packs
                    .into_iter()
                    .map(to_lime_knowledge_context_pack_request)
                    .collect(),
                task: params.task,
                max_chars: params.max_chars,
                activation: params.activation,
                write_run: params.write_run,
                run_reason: params.run_reason,
            },
        )
        .map_err(data_error)?;

        Ok(KnowledgeContextResolutionResponse {
            pack_name: response.pack_name,
            status: response.status,
            grounding: response.grounding,
            selected_views: values_from_serializable_vec(response.selected_views)?,
            selected_files: response.selected_files,
            source_anchors: response.source_anchors,
            warnings: values_from_serializable_vec(response.warnings)?,
            missing: response.missing,
            token_estimate: response.token_estimate,
            fenced_context: response.fenced_context,
            run_id: response.run_id,
            run_path: response.run_path,
        })
    }

    async fn validate_knowledge_context_run(
        &self,
        params: KnowledgeValidateContextRunParams,
    ) -> Result<KnowledgeValidateContextRunResponse, RuntimeCoreError> {
        let response = lime_knowledge::validate_knowledge_context_run(
            lime_knowledge::KnowledgeValidateContextRunRequest {
                working_dir: params.working_dir,
                name: params.name,
                run_path: params.run_path,
            },
        )
        .map_err(data_error)?;

        Ok(KnowledgeValidateContextRunResponse {
            valid: response.valid,
            run_id: response.run_id,
            status: response.status,
            errors: response.errors,
            warnings: response.warnings,
        })
    }

    async fn list_automation_jobs(&self) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let jobs = AutomationJobDao::list(&conn).map_err(data_error)?;
        Ok(AutomationJobListResponse {
            jobs: values_from_serializable_vec(jobs)?,
        })
    }

    async fn list_mcp_servers(&self) -> Result<McpServerListResponse, RuntimeCoreError> {
        Ok(McpServerListResponse {
            servers: values_from_serializable_vec(
                McpService::get_all(&self.db).map_err(data_error)?,
            )?,
        })
    }

    async fn list_mcp_servers_with_status(
        &self,
    ) -> Result<McpServerStatusListResponse, RuntimeCoreError> {
        let servers = McpService::get_all(&self.db).map_err(data_error)?;
        Ok(McpServerStatusListResponse {
            servers: servers
                .into_iter()
                .map(|server| {
                    json!({
                        "id": server.id,
                        "name": server.name,
                        "description": server.description,
                        "config": server.parse_config(),
                        "is_running": false,
                        "server_info": null,
                        "enabled_lime": server.enabled_lime,
                        "enabled_claude": server.enabled_claude,
                        "enabled_codex": server.enabled_codex,
                        "enabled_gemini": server.enabled_gemini,
                    })
                })
                .collect(),
        })
    }

    async fn list_mcp_tools(&self) -> Result<McpToolListResponse, RuntimeCoreError> {
        Ok(McpToolListResponse::default())
    }

    async fn list_mcp_prompts(&self) -> Result<McpPromptListResponse, RuntimeCoreError> {
        Ok(McpPromptListResponse::default())
    }

    async fn list_mcp_resources(&self) -> Result<McpResourceListResponse, RuntimeCoreError> {
        Ok(McpResourceListResponse::default())
    }

    async fn read_automation_scheduler_config(
        &self,
    ) -> Result<AutomationSchedulerConfigReadResponse, RuntimeCoreError> {
        Ok(AutomationSchedulerConfigReadResponse {
            config: automation_scheduler_config_value(
                load_config().map_err(data_error)?.automation,
            ),
        })
    }

    async fn update_automation_scheduler_config(
        &self,
        params: AutomationSchedulerConfigUpdateParams,
    ) -> Result<AutomationSchedulerConfigUpdateResponse, RuntimeCoreError> {
        let input: AutomationSchedulerConfigRequest =
            serde_json::from_value(params.config).map_err(data_error)?;
        let mut config = load_config().map_err(data_error)?;
        config.automation = AutomationSettings {
            enabled: input.enabled,
            poll_interval_secs: input.poll_interval_secs.max(5),
            enable_history: input.enable_history,
        };
        save_config(&config).map_err(data_error)?;
        Ok(AutomationSchedulerConfigUpdateResponse {
            config: automation_scheduler_config_value(config.automation),
        })
    }

    async fn read_automation_scheduler_status(
        &self,
    ) -> Result<AutomationSchedulerStatusResponse, RuntimeCoreError> {
        Ok(AutomationSchedulerStatusResponse {
            status: json!({
                "running": false,
                "last_polled_at": null,
                "next_poll_at": null,
                "last_job_count": 0,
                "total_executions": 0,
                "active_job_id": null,
                "active_job_name": null,
            }),
        })
    }

    async fn read_automation_job(
        &self,
        params: AutomationJobIdParams,
    ) -> Result<AutomationJobReadResponse, RuntimeCoreError> {
        let id = normalize_automation_job_id(&params.id)?;
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let job = AutomationJobDao::get(&conn, &id).map_err(data_error)?;
        Ok(AutomationJobReadResponse {
            job: job
                .map(serde_json::to_value)
                .transpose()
                .map_err(data_error)?,
        })
    }

    async fn create_automation_job(
        &self,
        params: AutomationJobCreateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        let request: AutomationJobCreateRequest =
            serde_json::from_value(params.request).map_err(data_error)?;
        validate_automation_job_create_request(&request)?;
        let now = Utc::now().to_rfc3339();
        let next_run_at = if request.enabled.unwrap_or(true) {
            preview_next_automation_run(&request.schedule).map_err(data_error)?
        } else {
            None
        };
        let job = AutomationJob {
            id: Uuid::new_v4().to_string(),
            name: request.name.trim().to_string(),
            description: normalize_optional_string(request.description),
            enabled: request.enabled.unwrap_or(true),
            workspace_id: request.workspace_id.trim().to_string(),
            execution_mode: request
                .execution_mode
                .unwrap_or(AutomationExecutionMode::Intelligent),
            schedule: request.schedule,
            payload: request.payload,
            delivery: request.delivery.unwrap_or_default(),
            timeout_secs: request.timeout_secs,
            max_retries: request.max_retries.unwrap_or(3).max(1),
            next_run_at,
            last_status: None,
            last_error: None,
            last_run_at: None,
            last_finished_at: None,
            running_started_at: None,
            consecutive_failures: 0,
            last_retry_count: 0,
            auto_disabled_until: None,
            last_delivery: None,
            created_at: now.clone(),
            updated_at: now,
        };
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        AutomationJobDao::create(&conn, &job).map_err(data_error)?;
        Ok(AutomationJobWriteResponse {
            job: serde_json::to_value(job).map_err(data_error)?,
        })
    }

    async fn update_automation_job(
        &self,
        params: AutomationJobUpdateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        let id = normalize_automation_job_id(&params.id)?;
        let request: AutomationJobUpdateRequest =
            serde_json::from_value(params.request).map_err(data_error)?;
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let mut job = AutomationJobDao::get(&conn, &id)
            .map_err(data_error)?
            .ok_or_else(|| RuntimeCoreError::Backend(format!("自动化任务不存在: {id}")))?;

        if let Some(name) = request.name {
            if name.trim().is_empty() {
                return Err(RuntimeCoreError::Backend("任务名称不能为空".to_string()));
            }
            job.name = name.trim().to_string();
        }
        if request.description.is_some() {
            job.description = normalize_optional_string(request.description);
        }
        if let Some(enabled) = request.enabled {
            job.enabled = enabled;
        }
        if let Some(workspace_id) = request.workspace_id {
            if workspace_id.trim().is_empty() {
                return Err(RuntimeCoreError::Backend("workspace_id 必填".to_string()));
            }
            job.workspace_id = workspace_id.trim().to_string();
        }
        if let Some(execution_mode) = request.execution_mode {
            job.execution_mode = execution_mode;
        }
        if let Some(schedule) = request.schedule {
            validate_automation_schedule_value(&schedule, Utc::now()).map_err(data_error)?;
            job.schedule = schedule;
        }
        if let Some(payload) = request.payload {
            validate_automation_payload(&payload)?;
            job.payload = payload;
        }
        if let Some(delivery) = request.delivery {
            job.delivery = delivery;
        }
        if request.clear_timeout_secs.unwrap_or(false) {
            job.timeout_secs = None;
        } else if request.timeout_secs.is_some() {
            job.timeout_secs = request.timeout_secs;
        }
        if let Some(max_retries) = request.max_retries {
            job.max_retries = max_retries.max(1);
        }
        job.next_run_at = if job.enabled && job.running_started_at.is_none() {
            preview_next_automation_run(&job.schedule).map_err(data_error)?
        } else {
            None
        };
        job.updated_at = Utc::now().to_rfc3339();

        validate_automation_job_record(&job)?;
        AutomationJobDao::update(&conn, &job).map_err(data_error)?;
        Ok(AutomationJobWriteResponse {
            job: serde_json::to_value(job).map_err(data_error)?,
        })
    }

    async fn delete_automation_job(
        &self,
        params: AutomationJobIdParams,
    ) -> Result<AutomationJobDeleteResponse, RuntimeCoreError> {
        let id = normalize_automation_job_id(&params.id)?;
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let deleted = AutomationJobDao::delete(&conn, &id).map_err(data_error)?;
        Ok(AutomationJobDeleteResponse { deleted })
    }

    async fn run_automation_job_now(
        &self,
        _params: AutomationJobIdParams,
    ) -> Result<AutomationJobRunNowResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "automationJob/runNow 尚未迁移到 App Server 执行器，已拒绝回退旧 Tauri 命令"
                .to_string(),
        ))
    }

    async fn read_automation_health(
        &self,
        params: AutomationJobHealthParams,
    ) -> Result<AutomationJobHealthResponse, RuntimeCoreError> {
        let query = params
            .query
            .map(serde_json::from_value::<AutomationHealthQuery>)
            .transpose()
            .map_err(data_error)?
            .unwrap_or_default();
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let health = query_automation_health_value(&conn, query).map_err(data_error)?;
        Ok(AutomationJobHealthResponse { health })
    }

    async fn read_automation_run_history(
        &self,
        params: AutomationJobRunHistoryParams,
    ) -> Result<AutomationJobRunHistoryResponse, RuntimeCoreError> {
        let id = normalize_automation_job_id(&params.id)?;
        let limit = params.limit.unwrap_or(20).clamp(1, 200);
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let runs = AgentRunDao::list_runs_by_source_ref(&conn, "automation", &id, limit)
            .map_err(data_error)?;
        Ok(AutomationJobRunHistoryResponse {
            runs: values_from_serializable_vec(runs)?,
        })
    }

    async fn preview_automation_schedule(
        &self,
        params: AutomationScheduleParams,
    ) -> Result<AutomationSchedulePreviewResponse, RuntimeCoreError> {
        let schedule: TaskSchedule = serde_json::from_value(params.schedule).map_err(data_error)?;
        Ok(AutomationSchedulePreviewResponse {
            next_run_at: preview_next_automation_run(&schedule).map_err(data_error)?,
        })
    }

    async fn validate_automation_schedule(
        &self,
        params: AutomationScheduleParams,
    ) -> Result<AutomationScheduleValidateResponse, RuntimeCoreError> {
        let schedule: TaskSchedule = serde_json::from_value(params.schedule).map_err(data_error)?;
        Ok(
            match validate_automation_schedule_value(&schedule, Utc::now()) {
                Ok(()) => AutomationScheduleValidateResponse {
                    valid: true,
                    error: None,
                },
                Err(error) => AutomationScheduleValidateResponse {
                    valid: false,
                    error: Some(error),
                },
            },
        )
    }

    async fn read_project_memory(
        &self,
        params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
        let memory = lime_core::memory::read_project_memory(self.db.clone(), &params.project_id)
            .map_err(data_error)?;
        Ok(ProjectMemoryReadResponse {
            memory: serde_json::to_value(memory).map_err(data_error)?,
        })
    }

    async fn read_usage_stats(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsReadResponse, RuntimeCoreError> {
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let stats = usage_statistics_service::get_usage_stats_from_db(&params.time_range, &conn)
            .map_err(data_error)?;
        Ok(UsageStatsReadResponse {
            stats: UsageStatsSummary {
                total_conversations: stats.total_conversations,
                total_messages: stats.total_messages,
                total_tokens: stats.total_tokens,
                total_time_minutes: stats.total_time_minutes,
                monthly_conversations: stats.monthly_conversations,
                monthly_messages: stats.monthly_messages,
                monthly_tokens: stats.monthly_tokens,
                today_conversations: stats.today_conversations,
                today_messages: stats.today_messages,
                today_tokens: stats.today_tokens,
            },
        })
    }

    async fn list_usage_stats_model_ranking(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsModelRankingListResponse, RuntimeCoreError> {
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let ranking =
            usage_statistics_service::get_model_usage_ranking_from_db(&params.time_range, &conn)
                .map_err(data_error)?
                .into_iter()
                .map(|item| UsageStatsModelUsage {
                    model: item.model,
                    conversations: item.conversations,
                    tokens: item.tokens,
                    percentage: item.percentage,
                })
                .collect();
        Ok(UsageStatsModelRankingListResponse { ranking })
    }

    async fn list_usage_stats_daily_trends(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsDailyTrendsListResponse, RuntimeCoreError> {
        let conn = database::lock_db(&self.db).map_err(data_error)?;
        let trends =
            usage_statistics_service::get_daily_usage_trends_from_db(&params.time_range, &conn)
                .map_err(data_error)?
                .into_iter()
                .map(|item| UsageStatsDailyUsage {
                    date: item.date,
                    conversations: item.conversations,
                    tokens: item.tokens,
                })
                .collect();
        Ok(UsageStatsDailyTrendsListResponse { trends })
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

    async fn read_model_provider(
        &self,
        params: ModelProviderReadParams,
    ) -> Result<ModelProviderReadResponse, RuntimeCoreError> {
        let provider = self
            .api_key_provider_service
            .get_provider(&self.db, &params.provider_id)
            .map_err(data_error)?
            .map(|provider| provider_with_keys_to_value(&provider, &self.api_key_provider_service));
        Ok(ModelProviderReadResponse { provider })
    }

    async fn create_model_provider(
        &self,
        params: ModelProviderCreateParams,
    ) -> Result<ModelProviderWriteResponse, RuntimeCoreError> {
        let provider = params.provider;
        let provider_type = required_string_field(&provider, "type")?
            .parse::<ApiProviderType>()
            .map_err(data_error)?;
        let provider = self
            .api_key_provider_service
            .add_custom_provider(
                &self.db,
                required_string_field(&provider, "name")?,
                provider_type,
                required_string_field(&provider, "api_host")?,
                optional_string_field(&provider, "api_version"),
                optional_string_field(&provider, "project"),
                optional_string_field(&provider, "location"),
                optional_string_field(&provider, "region"),
                optional_prompt_cache_mode(&provider)?,
            )
            .map_err(data_error)?;
        Ok(ModelProviderWriteResponse {
            provider: provider_to_value(&provider, 0),
        })
    }

    async fn update_model_provider(
        &self,
        params: ModelProviderUpdateParams,
    ) -> Result<ModelProviderWriteResponse, RuntimeCoreError> {
        let patch = params.patch;
        let provider_type = optional_string_field(&patch, "type")
            .map(|value| value.parse::<ApiProviderType>())
            .transpose()
            .map_err(data_error)?;
        let provider = self
            .api_key_provider_service
            .update_provider(
                &self.db,
                &params.provider_id,
                optional_string_field(&patch, "name"),
                provider_type,
                optional_string_field(&patch, "api_host"),
                optional_bool_field(&patch, "enabled"),
                optional_i32_field(&patch, "sort_order")?,
                optional_string_field(&patch, "api_version"),
                optional_string_field(&patch, "project"),
                optional_string_field(&patch, "location"),
                optional_string_field(&patch, "region"),
                optional_prompt_cache_mode(&patch)?,
                optional_string_vec_field(&patch, "custom_models")?,
            )
            .map_err(data_error)?;
        let api_key_count = self
            .api_key_provider_service
            .get_provider(&self.db, &params.provider_id)
            .map_err(data_error)?
            .map(|provider| provider.api_keys.len())
            .unwrap_or(0);
        Ok(ModelProviderWriteResponse {
            provider: provider_to_value(&provider, api_key_count),
        })
    }

    async fn delete_model_provider(
        &self,
        params: ModelProviderDeleteParams,
    ) -> Result<ModelProviderDeleteResponse, RuntimeCoreError> {
        let deleted = self
            .api_key_provider_service
            .delete_custom_provider(&self.db, &params.provider_id)
            .map_err(data_error)?;
        Ok(ModelProviderDeleteResponse { deleted })
    }

    async fn update_model_provider_sort_orders(
        &self,
        params: ModelProviderSortOrdersUpdateParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        let sort_orders = params
            .sort_orders
            .into_iter()
            .map(|item| (item.provider_id, item.sort_order))
            .collect();
        self.api_key_provider_service
            .update_provider_sort_orders(&self.db, sort_orders)
            .map_err(data_error)?;
        Ok(ModelProviderMutationResponse::default())
    }

    async fn export_model_provider_config(
        &self,
        params: ModelProviderConfigExportParams,
    ) -> Result<ModelProviderConfigExportResponse, RuntimeCoreError> {
        let config = self
            .api_key_provider_service
            .export_config(&self.db, params.include_keys.unwrap_or(false))
            .map_err(data_error)?;
        let config_json = serde_json::to_string_pretty(&config).map_err(data_error)?;
        Ok(ModelProviderConfigExportResponse { config_json })
    }

    async fn import_model_provider_config(
        &self,
        params: ModelProviderConfigImportParams,
    ) -> Result<ModelProviderConfigImportResponse, RuntimeCoreError> {
        let result = self
            .api_key_provider_service
            .import_config(&self.db, &params.config_json)
            .map_err(data_error)?;
        Ok(ModelProviderConfigImportResponse {
            success: result.success,
            imported_providers: result.imported_providers,
            imported_api_keys: result.imported_api_keys,
            skipped_providers: result.skipped_providers,
            errors: result.errors,
        })
    }

    async fn test_model_provider_connection(
        &self,
        params: ModelProviderTestConnectionParams,
    ) -> Result<ModelProviderTestConnectionResponse, RuntimeCoreError> {
        let result = self
            .api_key_provider_service
            .test_connection_with_fallback_models(
                &self.db,
                &params.provider_id,
                params.model_name,
                Vec::new(),
            )
            .await
            .map_err(data_error)?;
        Ok(ModelProviderTestConnectionResponse {
            success: result.success,
            latency_ms: result.latency_ms,
            error: result.error,
            models: result.models,
        })
    }

    async fn test_model_provider_chat(
        &self,
        params: ModelProviderTestChatParams,
    ) -> Result<ModelProviderTestChatResponse, RuntimeCoreError> {
        let result = self
            .api_key_provider_service
            .test_chat_with_fallback_models(
                &self.db,
                &params.provider_id,
                params.model_name,
                params.prompt,
                Vec::new(),
            )
            .await
            .map_err(data_error)?;
        Ok(ModelProviderTestChatResponse {
            success: result.success,
            latency_ms: result.latency_ms,
            error: result.error,
            content: result.content,
            raw: result.raw,
        })
    }

    async fn fetch_model_provider_models(
        &self,
        params: ModelProviderFetchModelsParams,
    ) -> Result<ModelProviderFetchModelsResponse, RuntimeCoreError> {
        let provider = self
            .api_key_provider_service
            .get_provider(&self.db, &params.provider_id)
            .map_err(data_error)?
            .ok_or_else(|| data_error(format!("Provider 不存在: {}", params.provider_id)))?;
        let api_host = provider.provider.api_host.clone();
        if api_host.trim().is_empty() {
            return Err(data_error("Provider 没有配置 API Host"));
        }
        let provider_type = provider.provider.effective_provider_type();
        let requires_api_key = ModelRegistryService::requires_api_key_for_model_fetch(
            &params.provider_id,
            &api_host,
            provider_type,
        );
        let api_key = if requires_api_key {
            self.api_key_provider_service
                .get_next_api_key(&self.db, &params.provider_id)
                .map_err(data_error)?
                .ok_or_else(|| {
                    data_error(format!(
                        "Provider {} 没有可用的 API Key",
                        params.provider_id
                    ))
                })?
        } else {
            self.api_key_provider_service
                .get_next_api_key(&self.db, &params.provider_id)
                .map_err(data_error)?
                .unwrap_or_default()
        };
        let result = self
            .model_registry_service
            .fetch_models_from_api_with_hints(
                &params.provider_id,
                &api_host,
                &api_key,
                Some(provider_type),
                &provider.provider.custom_models,
            )
            .await
            .map_err(data_error)?;
        fetch_models_result_to_response(result)
    }

    async fn create_model_provider_key(
        &self,
        params: ModelProviderKeyCreateParams,
    ) -> Result<ModelProviderKeyWriteResponse, RuntimeCoreError> {
        let key = self
            .api_key_provider_service
            .add_api_key(
                &self.db,
                &params.provider_id,
                &params.api_key,
                params.alias,
                params.replace_existing.unwrap_or(false),
            )
            .map_err(data_error)?;
        Ok(ModelProviderKeyWriteResponse {
            key: api_key_to_value(&key, &self.api_key_provider_service),
        })
    }

    async fn update_model_provider_key(
        &self,
        params: ModelProviderKeyUpdateParams,
    ) -> Result<ModelProviderKeyWriteResponse, RuntimeCoreError> {
        let key = if let Some(enabled) = params.enabled {
            self.api_key_provider_service
                .toggle_api_key(&self.db, &params.key_id, enabled)
                .map_err(data_error)?
        } else {
            self.api_key_provider_service
                .update_api_key_alias(&self.db, &params.key_id, params.alias.clone())
                .map_err(data_error)?
        };
        let key = if params.enabled.is_some() && params.alias.is_some() {
            self.api_key_provider_service
                .update_api_key_alias(&self.db, &params.key_id, params.alias)
                .map_err(data_error)?
        } else {
            key
        };
        Ok(ModelProviderKeyWriteResponse {
            key: api_key_to_value(&key, &self.api_key_provider_service),
        })
    }

    async fn delete_model_provider_key(
        &self,
        params: ModelProviderKeyDeleteParams,
    ) -> Result<ModelProviderKeyDeleteResponse, RuntimeCoreError> {
        let deleted = self
            .api_key_provider_service
            .delete_api_key(&self.db, &params.key_id)
            .map_err(data_error)?;
        Ok(ModelProviderKeyDeleteResponse { deleted })
    }

    async fn read_next_model_provider_key(
        &self,
        params: ModelProviderKeyNextParams,
    ) -> Result<ModelProviderKeyNextResponse, RuntimeCoreError> {
        let next = self
            .api_key_provider_service
            .get_next_api_key_entry(&self.db, &params.provider_id)
            .map_err(data_error)?;
        Ok(match next {
            Some((key_id, api_key)) => ModelProviderKeyNextResponse {
                api_key: Some(api_key),
                key_id: Some(key_id),
            },
            None => ModelProviderKeyNextResponse::default(),
        })
    }

    async fn record_model_provider_key_usage(
        &self,
        params: ModelProviderKeyEventParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        self.api_key_provider_service
            .record_usage(&self.db, &params.key_id)
            .map_err(data_error)?;
        Ok(ModelProviderMutationResponse::default())
    }

    async fn record_model_provider_key_error(
        &self,
        params: ModelProviderKeyEventParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        self.api_key_provider_service
            .record_error(&self.db, &params.key_id)
            .map_err(data_error)?;
        Ok(ModelProviderMutationResponse::default())
    }

    async fn read_model_provider_ui_state(
        &self,
        params: ModelProviderUiStateReadParams,
    ) -> Result<ModelProviderUiStateReadResponse, RuntimeCoreError> {
        let value = self
            .api_key_provider_service
            .get_ui_state(&self.db, &params.key)
            .map_err(data_error)?;
        Ok(ModelProviderUiStateReadResponse { value })
    }

    async fn write_model_provider_ui_state(
        &self,
        params: ModelProviderUiStateWriteParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        self.api_key_provider_service
            .set_ui_state(&self.db, &params.key, &params.value)
            .map_err(data_error)?;
        Ok(ModelProviderMutationResponse::default())
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

    async fn resolve_connect_deep_link(
        &self,
        params: ConnectDeepLinkResolveParams,
    ) -> Result<ConnectDeepLinkResolveResponse, RuntimeCoreError> {
        let payload = connect::parse_deep_link(&params.url).map_err(connect_deep_link_error)?;
        let relay_info = match load_connect_registry_best_effort().await {
            Some(registry) => registry.get(&payload.relay),
            None => None,
        };
        let is_verified = relay_info.is_some();
        Ok(ConnectDeepLinkResolveResponse {
            payload: connect_payload_to_protocol(payload),
            relay_info: relay_info
                .map(serde_json::to_value)
                .transpose()
                .map_err(data_error)?,
            is_verified,
        })
    }

    async fn resolve_connect_open_deep_link(
        &self,
        params: ConnectOpenDeepLinkResolveParams,
    ) -> Result<ConnectOpenDeepLinkResolveResponse, RuntimeCoreError> {
        let payload =
            connect::parse_open_deep_link(&params.url).map_err(connect_deep_link_error)?;
        Ok(ConnectOpenDeepLinkResolveResponse {
            payload: open_deep_link_payload_to_protocol(payload),
        })
    }

    async fn save_connect_relay_api_key(
        &self,
        params: ConnectRelayApiKeySaveParams,
    ) -> Result<ConnectRelayApiKeySaveResponse, RuntimeCoreError> {
        let relay_id = params.relay_id.trim();
        if relay_id.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "relayId is required for connectRelayApiKey/save".to_string(),
            ));
        }
        if params.api_key.trim().is_empty() {
            return Err(RuntimeCoreError::Backend(
                "apiKey is required for connectRelayApiKey/save".to_string(),
            ));
        }

        let registry = load_connect_registry_required().await?;
        let relay_info = registry
            .get(relay_id)
            .ok_or_else(|| RuntimeCoreError::Backend(format!("中转商 {relay_id} 不在注册表中")))?;
        let provider_type = connect_protocol_to_provider_type(&relay_info.api.protocol);
        let provider_id = format!("connect-{relay_id}");
        let existing_provider = self
            .api_key_provider_service
            .get_provider(&self.db, &provider_id)
            .map_err(data_error)?;

        let (final_provider_id, is_new_provider) = if existing_provider.is_some() {
            (provider_id, false)
        } else {
            let provider_name = params
                .name
                .clone()
                .unwrap_or_else(|| format!("[Connect] {}", relay_info.name));
            let provider = self
                .api_key_provider_service
                .add_custom_provider(
                    &self.db,
                    provider_name,
                    provider_type,
                    relay_info.api.base_url.clone(),
                    None,
                    None,
                    None,
                    None,
                    None,
                )
                .map_err(data_error)?;
            (provider.id, true)
        };

        let key_alias = params
            .name
            .clone()
            .or_else(|| Some(format!("[Connect] {}", relay_info.name)));
        let api_key_entry = self
            .api_key_provider_service
            .add_api_key(
                &self.db,
                &final_provider_id,
                &params.api_key,
                key_alias.clone(),
                false,
            )
            .map_err(data_error)?;

        Ok(ConnectRelayApiKeySaveResponse {
            provider_id: final_provider_id,
            key_id: api_key_entry.id,
            provider_name: key_alias.unwrap_or_else(|| relay_info.name.clone()),
            is_new_provider,
        })
    }

    async fn deliver_connect_callback(
        &self,
        params: ConnectCallbackSendParams,
    ) -> Result<ConnectCallbackSendResponse, RuntimeCoreError> {
        let relay_id = params.relay_id.trim();
        if relay_id.is_empty() || params.api_key.trim().is_empty() {
            return Ok(ConnectCallbackSendResponse { delivered: false });
        }

        let Some(registry) = load_connect_registry_best_effort().await else {
            return Ok(ConnectCallbackSendResponse { delivered: false });
        };
        let Some(relay_info) = registry.get(relay_id) else {
            return Ok(ConnectCallbackSendResponse { delivered: false });
        };
        let Some(webhook) = relay_info.webhook else {
            return Ok(ConnectCallbackSendResponse { delivered: false });
        };
        let Some(callback_url) = webhook.callback_url else {
            return Ok(ConnectCallbackSendResponse { delivered: false });
        };

        match params.status {
            ConnectCallbackStatus::Success => connect::send_success_callback(
                &callback_url,
                relay_id,
                &params.api_key,
                params.ref_code,
            ),
            ConnectCallbackStatus::Cancelled => connect::send_cancelled_callback(
                &callback_url,
                relay_id,
                &params.api_key,
                params.ref_code,
            ),
            ConnectCallbackStatus::Error => connect::send_error_callback(
                &callback_url,
                relay_id,
                &params.api_key,
                params.ref_code,
                params.error_code.as_deref().unwrap_or("UNKNOWN"),
                params.error_message.as_deref().unwrap_or("未知错误"),
            ),
        }

        Ok(ConnectCallbackSendResponse { delivered: true })
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
    provider_name: Option<String>,
    model_config_json: Option<String>,
    session_type: String,
    extension_data_json: String,
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
                s.provider_name,
                s.model_config_json,
                s.session_type,
                s.extension_data_json,
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
               AND NOT (
                    s.model = 'lime-fixture-chat'
                    OR s.title LIKE 'Agent QC approval %'
                    OR s.title LIKE 'Code runtime fixture %'
                    OR s.title LIKE 'Tool execution fixture %'
                    OR CASE
                        WHEN json_valid(s.extension_data_json) THEN
                            COALESCE(json_extract(s.extension_data_json, '$.\"lime_harness.v0\".hiddenFromUserRecents') = 1, 0)
                            OR COALESCE(json_extract(s.extension_data_json, '$.\"lime_harness.v0\".hidden_from_user_recents') = 1, 0)
                        ELSE 0
                    END
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
            s.provider_name,
            s.model_config_json,
            s.session_type,
            s.extension_data_json,
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
        .get::<_, Option<String>>(15)?
        .as_deref()
        .map(AgentThreadTurnStatus::try_from)
        .transpose()
        .map_err(|_| {
            rusqlite::Error::InvalidColumnType(
                15,
                "latest_turn_status".into(),
                rusqlite::types::Type::Text,
            )
        })?;
    let timeline_item_count = row.get::<_, i64>(13)?.max(0) as usize;
    let timeline_turn_count = row.get::<_, i64>(14)?.max(0) as usize;

    Ok(CurrentTimelineSessionRow {
        id: row.get(0)?,
        model: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        archived_at: row.get(5)?,
        working_dir: row.get(6)?,
        execution_strategy: row.get(7)?,
        provider_name: row.get(8)?,
        model_config_json: row.get(9)?,
        session_type: row.get(10)?,
        extension_data_json: row.get(11)?,
        workspace_id: row.get(12)?,
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

fn update_current_timeline_session_row(
    conn: &rusqlite::Connection,
    session_id: &str,
    title: Option<&str>,
    provider_selector: Option<&str>,
    provider_name: Option<&str>,
    model_name: Option<&str>,
    execution_strategy: Option<&str>,
    archived: Option<bool>,
    recent_access_mode: Option<&str>,
    recent_preferences: Option<&Value>,
    recent_team_selection: Option<&Value>,
) -> Result<(), String> {
    let Some(existing) = query_current_timeline_session(conn, session_id)? else {
        return Err(format!("session not found: {session_id}"));
    };

    let now = Utc::now().to_rfc3339();
    if let Some(title) = title {
        conn.execute(
            "UPDATE agent_sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now, session_id],
        )
        .map_err(|error| format!("update current timeline session title failed: {error}"))?;
    }
    if let Some(execution_strategy) = execution_strategy {
        conn.execute(
            "UPDATE agent_sessions SET execution_strategy = ?1, updated_at = ?2 WHERE id = ?3",
            params![execution_strategy, now, session_id],
        )
        .map_err(|error| {
            format!("update current timeline session execution strategy failed: {error}")
        })?;
    }
    if provider_name.is_some() || model_name.is_some() {
        let model_config_json =
            model_name.map(|model_name| json!({ "model_name": model_name }).to_string());
        conn.execute(
            "UPDATE agent_sessions SET
                provider_name = COALESCE(?1, provider_name),
                model = COALESCE(?2, model),
                model_config_json = CASE WHEN ?3 IS NULL THEN model_config_json ELSE ?3 END,
                updated_at = ?4
             WHERE id = ?5",
            params![
                provider_name,
                model_name,
                model_config_json,
                now,
                session_id
            ],
        )
        .map_err(|error| {
            format!("update current timeline session provider/model failed: {error}")
        })?;
    }
    if let Some(archived) = archived {
        let archived_at = archived.then_some(now.as_str());
        conn.execute(
            "UPDATE agent_sessions SET archived_at = ?1, updated_at = ?2 WHERE id = ?3",
            params![archived_at, now, session_id],
        )
        .map_err(|error| {
            format!("update current timeline session archive state failed: {error}")
        })?;
    }
    let routing_provider_selector = provider_selector.or(provider_name);
    if routing_provider_selector.is_some()
        || recent_access_mode.is_some()
        || recent_preferences.is_some()
        || recent_team_selection.is_some()
    {
        let extension_data_json = merge_session_runtime_extension_data(
            &existing.extension_data_json,
            routing_provider_selector,
            recent_access_mode,
            recent_preferences,
            recent_team_selection,
        )?;
        conn.execute(
            "UPDATE agent_sessions SET extension_data_json = ?1, updated_at = ?2 WHERE id = ?3",
            params![extension_data_json, now, session_id],
        )
        .map_err(|error| {
            format!("update current timeline session extension data failed: {error}")
        })?;
    }
    Ok(())
}

fn merge_session_runtime_extension_data(
    existing: &str,
    provider_selector: Option<&str>,
    recent_access_mode: Option<&str>,
    recent_preferences: Option<&Value>,
    recent_team_selection: Option<&Value>,
) -> Result<String, String> {
    let mut extension_data = match serde_json::from_str::<Value>(existing) {
        Ok(Value::Object(map)) => map,
        Ok(_) | Err(_) => Map::new(),
    };
    if let Some(provider_selector) = normalized_text(provider_selector) {
        extension_data.insert(
            "lime_provider_routing.v0".to_string(),
            json!({ "providerSelector": provider_selector }),
        );
    }
    if let Some(recent_access_mode) = normalized_text(recent_access_mode) {
        extension_data.insert(
            "lime_recent_access_mode.v0".to_string(),
            Value::String(recent_access_mode),
        );
    }
    if let Some(recent_preferences) = recent_preferences {
        extension_data.insert(
            "lime_recent_preferences.v0".to_string(),
            recent_preferences.clone(),
        );
    }
    if let Some(recent_team_selection) = recent_team_selection {
        extension_data.insert(
            "lime_recent_team_selection.v0".to_string(),
            recent_team_selection.clone(),
        );
    }
    serde_json::to_string(&Value::Object(extension_data))
        .map_err(|error| format!("serialize current timeline extension data failed: {error}"))
}

fn normalized_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
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
        "sessionType": row.session_type,
        "extensionData": extension_data_json_value(&row.extension_data_json),
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

fn extension_data_json_value(value: &str) -> Value {
    serde_json::from_str(value).unwrap_or_else(|_| json!({}))
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
    let execution_runtime = current_timeline_execution_runtime(session);
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
        "execution_runtime": execution_runtime,
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

fn current_timeline_execution_runtime(session: &CurrentTimelineSessionRow) -> Value {
    let extension_data = extension_data_json_value(&session.extension_data_json);
    let provider_selector = extension_data
        .pointer("/lime_provider_routing.v0/providerSelector")
        .and_then(Value::as_str)
        .or_else(|| {
            extension_data
                .pointer("/lime_provider_routing.v0/provider_selector")
                .and_then(Value::as_str)
        });
    let recent_access_mode = extension_data
        .get("lime_recent_access_mode.v0")
        .and_then(Value::as_str);
    json!({
        "session_id": session.id,
        "provider_selector": normalized_text(provider_selector),
        "provider_name": normalized_text(session.provider_name.as_deref()),
        "model_name": current_timeline_model_name(session),
        "execution_strategy": normalized_text(session.execution_strategy.as_deref()),
        "source": "session",
        "recent_access_mode": normalized_text(recent_access_mode),
        "recent_preferences": extension_data
            .get("lime_recent_preferences.v0")
            .cloned()
            .unwrap_or(Value::Null),
        "recent_team_selection": extension_data
            .get("lime_recent_team_selection.v0")
            .cloned()
            .unwrap_or(Value::Null),
    })
}

fn current_timeline_model_name(session: &CurrentTimelineSessionRow) -> Option<String> {
    session
        .model_config_json
        .as_deref()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .and_then(|value| model_name_from_config_value(&value))
        .or_else(|| normalized_text(Some(&session.model)))
}

fn model_name_from_config_value(value: &Value) -> Option<String> {
    value
        .get("modelName")
        .or_else(|| value.get("model_name"))
        .or_else(|| value.get("model"))
        .or_else(|| value.get("name"))
        .and_then(Value::as_str)
        .and_then(|value| normalized_text(Some(value)))
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
    let workspace_root = workspace_root_path(&params.workspace_root)?;
    let registered_skills =
        list_workspace_registered_skills_value(WorkspaceRegisteredSkillsListParams {
            workspace_root: params.workspace_root,
        })?;
    let mut bindings = registered_skills
        .into_iter()
        .map(workspace_registered_skill_to_binding_value)
        .collect::<Vec<_>>();

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

fn list_workspace_registered_skills_value(
    params: WorkspaceRegisteredSkillsListParams,
) -> Result<Vec<Value>, String> {
    let workspace_root = workspace_root_path(&params.workspace_root)?;
    let skills_root = workspace_root.join(".agents").join("skills");
    let mut skills = Vec::new();
    if !skills_root.exists() {
        return Ok(skills);
    }
    let skills_root_metadata = fs::symlink_metadata(&skills_root)
        .map_err(|error| format!("read workspace skills root failed: {error}"))?;
    if skills_root_metadata.file_type().is_symlink() {
        return Err(format!(
            "workspace skills root must not be a symlink: {}",
            skills_root.display()
        ));
    }
    if !skills_root_metadata.is_dir() {
        return Err(format!(
            "workspace skills root must be a directory: {}",
            skills_root.display()
        ));
    }
    let canonical_skills_root = fs::canonicalize(&skills_root)
        .map_err(|error| format!("canonicalize workspace skills root failed: {error}"))?;

    let mut entries = fs::read_dir(&skills_root)
        .map_err(|error| format!("read workspace skills failed: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read workspace skill entry failed: {error}"))?;
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_string());
    for entry in entries {
        let skill_dir = entry.path();
        let skill_dir_metadata = fs::symlink_metadata(&skill_dir)
            .map_err(|error| format!("read workspace skill metadata failed: {error}"))?;
        if skill_dir_metadata.file_type().is_symlink() {
            return Err(format!(
                "workspace registered skill must not be a symlink: {}",
                skill_dir.display()
            ));
        }
        if !skill_dir_metadata.is_dir() {
            continue;
        }
        let skill_file = skill_dir.join("SKILL.md");
        let registration_file = skill_dir.join(".lime").join("registration.json");
        let skill_file_metadata = match fs::symlink_metadata(&skill_file) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let registration_file_metadata = match fs::symlink_metadata(&registration_file) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if skill_file_metadata.file_type().is_symlink()
            || registration_file_metadata.file_type().is_symlink()
        {
            return Err(format!(
                "workspace registered skill files must not be symlinks: {}",
                skill_dir.display()
            ));
        }
        if !skill_file_metadata.is_file() || !registration_file_metadata.is_file() {
            continue;
        }
        let canonical_skill_dir = fs::canonicalize(&skill_dir)
            .map_err(|error| format!("canonicalize workspace skill directory failed: {error}"))?;
        let canonical_skill_file = fs::canonicalize(&skill_file)
            .map_err(|error| format!("canonicalize workspace skill file failed: {error}"))?;
        let canonical_registration_file =
            fs::canonicalize(&registration_file).map_err(|error| {
                format!("canonicalize workspace skill registration failed: {error}")
            })?;
        if !canonical_skill_dir.starts_with(&canonical_skills_root)
            || !canonical_skill_file.starts_with(&canonical_skill_dir)
            || !canonical_registration_file.starts_with(&canonical_skill_dir)
        {
            return Err(format!(
                "workspace registered skill path escaped workspace root: {}",
                skill_dir.display()
            ));
        }
        let directory = entry.file_name().to_string_lossy().to_string();
        let skill = load_skill_from_file(&directory, &skill_file)?;
        let registration: Value = fs::read_to_string(&registration_file)
            .map_err(|error| format!("read skill registration failed: {error}"))
            .and_then(|content| {
                serde_json::from_str(&content)
                    .map_err(|error| format!("parse skill registration failed: {error}"))
            })?;
        let standard_compliance = serde_json::to_value(&skill.standard_compliance)
            .map_err(|error| format!("serialize skill standard compliance failed: {error}"))?;
        let permission_summary = registration_permission_summary(&registration);
        let allowed_tools = skill.allowed_tools.clone().unwrap_or_default();
        skills.push(json!({
            "key": format!("workspace:{directory}"),
            "name": skill.display_name,
            "description": skill.description,
            "directory": directory,
            "registered_skill_directory": skill_dir.to_string_lossy().to_string(),
            "registration": registration,
            "permission_summary": permission_summary,
            "metadata": skill.metadata,
            "allowed_tools": allowed_tools,
            "resource_summary": skill_resource_summary(&skill_dir)?,
            "standard_compliance": standard_compliance,
            "launch_enabled": false,
            "runtime_gate": "已注册为 Workspace 本地 Skill 包；进入运行前还需要 P3C runtime binding 与 tool_runtime 授权。",
        }));
    }

    Ok(skills)
}

fn workspace_registered_skill_to_binding_value(skill: Value) -> Value {
    let directory = skill
        .get("directory")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let registration = skill.get("registration").cloned().unwrap_or(Value::Null);
    let source_verification_report_id = registration
        .get("sourceVerificationReportId")
        .or_else(|| registration.get("source_verification_report_id"))
        .and_then(Value::as_str);
    let validation_errors = skill
        .pointer("/standard_compliance/validation_errors")
        .or_else(|| skill.pointer("/standard_compliance/validationErrors"))
        .or_else(|| skill.pointer("/standardCompliance/validationErrors"))
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    let binding_status = if validation_errors == 0 && source_verification_report_id.is_some() {
        "ready_for_manual_enable"
    } else {
        "blocked"
    };
    let binding_status_reason = if binding_status == "ready_for_manual_enable" {
        "已具备 workspace skill runtime binding 候选资格；当前仍未注入默认工具面。"
    } else if validation_errors > 0 {
        "Agent Skills 标准检查仍有问题，不能进入 runtime binding。"
    } else {
        "缺少来源 verification report，不能证明该 Skill 通过注册前验证。"
    };

    json!({
        "key": format!("workspace_skill:{directory}"),
        "name": skill.get("name").cloned().unwrap_or(Value::Null),
        "description": skill.get("description").cloned().unwrap_or(Value::Null),
        "directory": skill.get("directory").cloned().unwrap_or(Value::Null),
        "registered_skill_directory": skill
            .get("registered_skill_directory")
            .cloned()
            .unwrap_or(Value::Null),
        "registration": registration,
        "permission_summary": skill
            .get("permission_summary")
            .cloned()
            .unwrap_or_else(|| json!([])),
        "metadata": skill.get("metadata").cloned().unwrap_or_else(|| json!({})),
        "allowed_tools": skill
            .get("allowed_tools")
            .cloned()
            .unwrap_or_else(|| json!([])),
        "resource_summary": skill
            .get("resource_summary")
            .cloned()
            .unwrap_or_else(|| json!({})),
        "standard_compliance": skill
            .get("standard_compliance")
            .cloned()
            .unwrap_or_else(|| json!({})),
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
    })
}

fn registration_permission_summary(registration: &Value) -> Vec<String> {
    registration
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
        .unwrap_or_default()
}

fn workspace_root_path(workspace_root: &str) -> Result<PathBuf, String> {
    let workspace_root = PathBuf::from(workspace_root.trim());
    if !workspace_root.is_absolute() {
        return Err(format!(
            "workspaceRoot must be absolute: {}",
            workspace_root.display()
        ));
    }
    Ok(workspace_root)
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

fn value_from_serializable<T: serde::Serialize>(value: T) -> Result<Value, RuntimeCoreError> {
    serde_json::to_value(value).map_err(data_error)
}

fn to_lime_knowledge_context_pack_request(
    params: KnowledgeResolveContextPackParams,
) -> lime_knowledge::KnowledgeResolveContextPackRequest {
    lime_knowledge::KnowledgeResolveContextPackRequest {
        name: params.name,
        activation: params.activation,
    }
}

async fn load_connect_registry_best_effort() -> Option<connect::RelayRegistry> {
    let registry = connect::RelayRegistry::new(connect_registry_cache_path());
    if registry.load_from_cache().is_ok() {
        return Some(registry);
    }
    if registry.load_from_remote().await.is_ok() {
        return Some(registry);
    }
    None
}

async fn load_connect_registry_required() -> Result<connect::RelayRegistry, RuntimeCoreError> {
    load_connect_registry_best_effort()
        .await
        .ok_or_else(|| RuntimeCoreError::Backend("无法加载中转商注册表".to_string()))
}

fn connect_registry_cache_path() -> PathBuf {
    app_paths::best_effort_data_dir()
        .join("connect")
        .join("registry.json")
}

fn connect_payload_to_protocol(payload: connect::ConnectPayload) -> ConnectPayload {
    ConnectPayload {
        relay: payload.relay,
        key: payload.key,
        name: payload.name,
        ref_code: payload.ref_code,
    }
}

fn open_deep_link_payload_to_protocol(
    payload: connect::OpenDeepLinkPayload,
) -> OpenDeepLinkPayload {
    let kind = match payload.kind {
        connect::OpenDeepLinkKind::Skill => "skill",
        connect::OpenDeepLinkKind::Prompt => "prompt",
    };
    OpenDeepLinkPayload {
        kind: kind.to_string(),
        slug: payload.slug,
        source: payload.source,
        version: payload.version,
        action: payload.action,
    }
}

fn connect_protocol_to_provider_type(protocol: &str) -> ApiProviderType {
    match protocol.trim().to_ascii_lowercase().as_str() {
        "anthropic" | "claude" => ApiProviderType::Anthropic,
        _ => ApiProviderType::Openai,
    }
}

fn connect_deep_link_error(error: connect::DeepLinkError) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn list_agent_app_installed_state() -> Result<AgentAppInstalledListResponse, String> {
    let installed_dir = app_paths::preferred_data_dir()?
        .join(AGENT_APP_DATA_DIR)
        .join("installed");
    fs::create_dir_all(&installed_dir)
        .map_err(|error| format!("创建 Agent App installed 目录失败: {error}"))?;

    let mut states = Vec::new();
    let mut issues = Vec::new();
    let entries = fs::read_dir(&installed_dir)
        .map_err(|error| format!("读取 Agent App installed 目录失败: {error}"))?;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                issues.push(agent_app_persistence_issue(
                    "READ_FAILED",
                    installed_dir.to_string_lossy(),
                    format!("读取 installed 条目失败: {error}"),
                    None,
                ));
                continue;
            }
        };
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        match read_agent_app_installed_state_path(&path) {
            Ok(Some(state)) => states.push(state),
            Ok(None) => {}
            Err(error) => issues.push(agent_app_persistence_issue(
                "PARSE_FAILED",
                path.to_string_lossy(),
                error,
                None,
            )),
        }
    }

    states.sort_by(|left, right| {
        read_json_string(left, &["appId"])
            .unwrap_or_default()
            .cmp(&read_json_string(right, &["appId"]).unwrap_or_default())
    });

    Ok(AgentAppInstalledListResponse { states, issues })
}

fn read_agent_app_installed_state_path(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(path).map_err(|error| format!("读取 installed state 失败: {error}"))?;
    let envelope: Value = serde_json::from_str(&content)
        .map_err(|error| format!("解析 installed state 失败: {error}"))?;
    let schema_version = envelope
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Installed Agent App state 缺少 schemaVersion。".to_string())?;
    if schema_version != INSTALLED_AGENT_APP_STATE_SCHEMA_VERSION {
        return Err(format!(
            "不支持的 Agent App installed state schemaVersion: {schema_version}",
        ));
    }
    Ok(envelope.get("state").cloned())
}

fn agent_app_persistence_issue(
    code: impl Into<String>,
    path: impl ToString,
    message: impl Into<String>,
    app_id: Option<String>,
) -> Value {
    json!({
        "code": code.into(),
        "path": path.to_string(),
        "message": message.into(),
        "appId": app_id,
    })
}

fn inspect_agent_app_local_package(
    params: AgentAppLocalPackageInspectParams,
) -> Result<AgentAppLocalPackageInspectResponse, String> {
    let app_dir_path = canonicalize_existing_agent_app_dir_path(&params.app_dir)?;
    let app_markdown_path = app_dir_path.join("APP.md");
    let app_markdown = fs::read_to_string(&app_markdown_path)
        .map_err(|error| format!("读取 Agent App APP.md 失败: {error}"))?;
    let manifest = resolve_agent_app_manifest(&app_dir_path, &app_markdown)?;
    let inspected_at = now_iso();
    let manifest_hash = sha256_json_value(&manifest)?;
    let package_hash = sha256_package(&app_dir_path, &manifest)?;

    Ok(AgentAppLocalPackageInspectResponse {
        source_kind: "local_folder".to_string(),
        source_uri: app_dir_path.to_string_lossy().to_string(),
        app_dir: app_dir_path.to_string_lossy().to_string(),
        app_markdown,
        manifest,
        manifest_hash,
        package_hash,
        inspected_at,
    })
}

async fn fetch_agent_app_cloud_package(
    params: AgentAppFetchCloudPackageParams,
) -> Result<AgentAppPackageCacheEntry, String> {
    let descriptor = params.descriptor;
    validate_cloud_release_descriptor(&descriptor)?;
    let bytes = download_agent_app_package(&descriptor.package_url).await?;
    let actual_package_hash = sha256_prefixed(&bytes);
    if actual_package_hash != descriptor.package_hash {
        return Err(format!(
            "Agent App package hash mismatch for {}@{}: expected {}, got {}",
            descriptor.app_id, descriptor.version, descriptor.package_hash, actual_package_hash
        ));
    }

    let data_root = agent_app_data_dir()?;
    let cache_dir = agent_app_package_cache_dir(&descriptor.package_hash)?;
    let staging_dir = data_root.join("staging").join(format!(
        "{}-{}",
        descriptor.app_id,
        safe_hash_path_segment(&descriptor.package_hash)
    ));
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(|error| {
            format!(
                "清理 Agent App package staging 目录失败 {}: {error}",
                staging_dir.display()
            )
        })?;
    }
    fs::create_dir_all(&staging_dir)
        .map_err(|error| format!("创建 Agent App package staging 目录失败: {error}"))?;
    let staging_cleanup_dir = staging_dir.clone();
    scopeguard::defer! {
        if staging_cleanup_dir.exists() {
            let _ = fs::remove_dir_all(&staging_cleanup_dir);
        }
    }

    extract_agent_app_package_archive(&bytes, &staging_dir)?;
    let extracted_root = find_agent_app_package_root(&staging_dir)?;
    let app_markdown_path = extracted_root.join("APP.md");
    let app_markdown_bytes = fs::read(&app_markdown_path).map_err(|error| {
        format!(
            "读取 Agent App package APP.md 失败 {}: {error}",
            app_markdown_path.display()
        )
    })?;
    let actual_manifest_hash = sha256_prefixed(&app_markdown_bytes);
    if actual_manifest_hash != descriptor.manifest_hash {
        return Err(format!(
            "Agent App manifest hash mismatch for {}@{}: expected {}, got {}",
            descriptor.app_id, descriptor.version, descriptor.manifest_hash, actual_manifest_hash
        ));
    }
    let app_markdown = String::from_utf8(app_markdown_bytes)
        .map_err(|error| format!("Agent App APP.md 必须是 UTF-8: {error}"))?;
    let manifest = resolve_agent_app_manifest(&extracted_root, &app_markdown)?;
    ensure_manifest_matches_cloud_release(&manifest, &descriptor)?;

    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|error| {
            format!(
                "清理旧 Agent App package cache 目录失败 {}: {error}",
                cache_dir.display()
            )
        })?;
    }
    if let Some(parent) = cache_dir.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "创建 Agent App package cache 目录失败 {}: {error}",
                parent.display()
            )
        })?;
    }
    fs::rename(&extracted_root, &cache_dir).map_err(|error| {
        format!(
            "写入 Agent App package cache 失败 {} -> {}: {error}",
            extracted_root.display(),
            cache_dir.display()
        )
    })?;

    let cached_at = now_iso();
    Ok(AgentAppPackageCacheEntry {
        app_id: descriptor.app_id.clone(),
        identity: AgentAppPackageIdentity {
            source_kind: "cloud_release".to_string(),
            source_uri: descriptor.source_uri.clone(),
            app_id: descriptor.app_id.clone(),
            app_version: descriptor.version.clone(),
            package_hash: descriptor.package_hash.clone(),
            manifest_hash: descriptor.manifest_hash.clone(),
            loaded_at: descriptor.loaded_at.clone(),
            release_id: descriptor.release_id.clone(),
            tenant_id: descriptor.tenant_id.clone(),
            tenant_enablement_ref: descriptor.tenant_enablement_ref.clone(),
            channel: descriptor.channel.clone(),
            signature_ref: descriptor.signature_ref.clone(),
        },
        manifest_snapshot: manifest,
        package_hash: descriptor.package_hash,
        manifest_hash: descriptor.manifest_hash,
        cache_path: cache_dir.to_string_lossy().to_string(),
        cached_at,
    })
}

fn save_agent_app_installed_state(params: AgentAppInstalledSaveParams) -> Result<Value, String> {
    let app_id = read_state_app_id(&params.state)?;
    validate_agent_app_id_for_storage(&app_id)?;
    let saved_at = now_iso();
    write_installed_agent_app_state(&app_id, &params.state, &saved_at)?;
    Ok(params.state)
}

fn set_agent_app_installed_disabled(
    params: AgentAppInstalledDisabledSetParams,
) -> Result<AgentAppInstalledListResponse, String> {
    validate_agent_app_id_for_storage(&params.app_id)?;
    let path = installed_agent_app_state_path(&params.app_id)?;
    let Some(mut state) = read_agent_app_installed_state_path(&path)? else {
        return Err(format!("Agent App 未安装: {}", params.app_id));
    };
    let updated_at = params.updated_at.unwrap_or_else(now_iso);
    set_object_field(&mut state, "disabled", Value::Bool(params.disabled))?;
    set_object_field(&mut state, "updatedAt", Value::String(updated_at.clone()))?;
    write_installed_agent_app_state(&params.app_id, &state, &updated_at)?;
    list_agent_app_installed_state()
}

fn uninstall_agent_app(
    params: AgentAppUninstallParams,
) -> Result<AgentAppUninstallResponse, String> {
    let rehearsal = build_agent_app_uninstall_rehearsal(params.app_id, params.mode)?;
    let mut blocker_codes = if rehearsal.mode == "delete-data" {
        let expected = build_agent_app_delete_data_confirmation_phrase(
            &rehearsal.app_id,
            rehearsal
                .package_hash
                .as_deref()
                .unwrap_or("unknown-package"),
        );
        if params.confirmation_phrase.as_deref() == Some(expected.as_str()) {
            vec!["DELETE_DATA_NOT_ENABLED_IN_CURRENT_PHASE".to_string()]
        } else {
            vec!["CONFIRMATION_MISMATCH".to_string()]
        }
    } else {
        Vec::new()
    };

    let (removed_target_count, missing_target_count) =
        if rehearsal.mode == "keep-data" && blocker_codes.is_empty() {
            remove_agent_app_install_references(&rehearsal.app_id)?
        } else {
            (0, 0)
        };

    let status = if !blocker_codes.is_empty() {
        "blocked"
    } else if rehearsal.mode == "keep-data" {
        if removed_target_count == 0 {
            blocker_codes.push("INSTALL_REFERENCE_NOT_FOUND".to_string());
            "blocked"
        } else {
            "uninstalled"
        }
    } else {
        "rehearsal_only"
    };

    Ok(AgentAppUninstallResponse {
        status: status.to_string(),
        rehearsal,
        list: list_agent_app_installed_state()?,
        removed_target_count,
        missing_target_count,
        blocker_codes,
        delete_evidence: None,
    })
}

fn build_agent_app_uninstall_rehearsal(
    app_id: String,
    mode: String,
) -> Result<AgentAppUninstallRehearsalResponse, String> {
    validate_agent_app_id_for_storage(&app_id)?;
    let mode = match mode.as_str() {
        "keep-data" | "delete-data" => mode,
        other => return Err(format!("不支持的 Agent App 卸载演练模式: {other}")),
    };
    let path = installed_agent_app_state_path(&app_id)?;
    let Some(state) = read_agent_app_installed_state_path(&path)? else {
        return Err(format!("Agent App 未安装: {}", app_id));
    };

    let package_hash = read_json_string(&state, &["identity", "packageHash"])
        .unwrap_or_else(|| "unknown-package".to_string());
    let package_hash_path_segment = safe_hash_path_segment(&package_hash);
    let storage_namespace = read_json_string(&state, &["projection", "storage", "namespace"])
        .unwrap_or_else(|| app_id.clone());
    let base = agent_app_data_dir()?.to_string_lossy().to_string();

    let install_reference_action = "delete";
    let derived_runtime_action = if mode == "delete-data" {
        "delete"
    } else {
        "retain"
    };
    let mut targets = vec![
        agent_app_uninstall_target(
            "path",
            format!("{base}/installed/{app_id}.json"),
            true,
            install_reference_action,
            "Installed Agent App state snapshot.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/setup/{app_id}.json"),
            true,
            install_reference_action,
            "Installed setup binding state.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/packages/{package_hash_path_segment}"),
            true,
            derived_runtime_action,
            "Cached runtime package for this Agent App.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/package-index/{app_id}.json"),
            true,
            derived_runtime_action,
            "Package cache index.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/projections/{app_id}.json"),
            true,
            derived_runtime_action,
            "Generated projection snapshot.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/readiness/{app_id}.json"),
            true,
            derived_runtime_action,
            "Readiness snapshot.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/logs/{app_id}"),
            true,
            derived_runtime_action,
            "Agent App host logs.",
        ),
    ];
    let data_action = if mode == "delete-data" {
        "delete"
    } else {
        "retain"
    };
    targets.push(agent_app_uninstall_target(
        "namespace",
        format!("{base}/storage/{storage_namespace}"),
        true,
        data_action,
        "App storage namespace declared by manifest.",
    ));
    targets.push(agent_app_uninstall_target(
        "path",
        format!("{base}/exports/{app_id}"),
        true,
        data_action,
        "Optional user exports for this Agent App.",
    ));

    let deleted_target_count = targets
        .iter()
        .filter(|target| target.action == "delete")
        .count();
    let retained_target_count = targets
        .iter()
        .filter(|target| target.action == "retain")
        .count();

    Ok(AgentAppUninstallRehearsalResponse {
        app_id,
        package_hash: Some(package_hash),
        mode,
        generated_at: now_iso(),
        deleted_target_count,
        retained_target_count,
        targets,
        warnings: vec!["DRY_RUN_ONLY".to_string()],
    })
}

fn build_agent_app_delete_data_confirmation_phrase(app_id: &str, package_hash: &str) -> String {
    format!("DELETE_AGENT_APP_DATA {app_id} {package_hash}")
}

fn remove_agent_app_install_references(app_id: &str) -> Result<(usize, usize), String> {
    let paths = [
        installed_agent_app_state_path(app_id)?,
        setup_agent_app_state_path(app_id)?,
    ];
    remove_agent_app_install_reference_paths(&paths)
}

fn remove_agent_app_install_reference_paths(paths: &[PathBuf]) -> Result<(usize, usize), String> {
    let mut removed = 0;
    let mut missing = 0;
    for path in paths {
        if !path.exists() {
            missing += 1;
            continue;
        }
        fs::remove_file(path).map_err(|error| {
            format!(
                "移除 Agent App 安装引用文件 {} 失败: {error}",
                path.display()
            )
        })?;
        removed += 1;
    }
    Ok((removed, missing))
}

fn agent_app_uninstall_target(
    kind: impl Into<String>,
    value: impl Into<String>,
    safe_to_delete: bool,
    action: impl Into<String>,
    reason: impl Into<String>,
) -> AgentAppUninstallRehearsalTarget {
    AgentAppUninstallRehearsalTarget {
        kind: kind.into(),
        value: value.into(),
        safe_to_delete,
        action: action.into(),
        reason: reason.into(),
    }
}

fn canonicalize_existing_agent_app_dir_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    let canonical = fs::canonicalize(&path)
        .map_err(|error| format!("无法解析 Agent App 目录 {}: {error}", path.display()))?;
    if !canonical.is_dir() {
        return Err(format!("Agent App 路径不是目录: {}", canonical.display()));
    }
    Ok(canonical)
}

fn parse_app_markdown_frontmatter(markdown: &str) -> Result<Value, String> {
    let normalized = markdown.strip_prefix('\u{feff}').unwrap_or(markdown);
    let Some(rest) = normalized.strip_prefix("---") else {
        return Err("Agent App APP.md 缺少 YAML frontmatter。".to_string());
    };
    let rest = rest
        .strip_prefix('\n')
        .or_else(|| rest.strip_prefix("\r\n"))
        .unwrap_or(rest);
    let Some(end_index) = rest.find("\n---") else {
        return Err("Agent App APP.md frontmatter 未正确结束。".to_string());
    };
    let frontmatter = &rest[..end_index];
    let yaml_value: serde_yaml::Value = serde_yaml::from_str(frontmatter)
        .map_err(|error| format!("解析 Agent App frontmatter 失败: {error}"))?;
    serde_json::to_value(yaml_value)
        .map_err(|error| format!("转换 Agent App manifest 失败: {error}"))
}

fn resolve_agent_app_manifest(app_dir: &Path, markdown: &str) -> Result<Value, String> {
    let mut manifest = parse_app_markdown_frontmatter(markdown)?;
    apply_layered_manifest_files(app_dir, &mut manifest)?;
    Ok(manifest)
}

fn apply_layered_manifest_files(app_dir: &Path, manifest: &mut Value) -> Result<(), String> {
    for (relative_path, field) in AGENT_APP_ARRAY_LAYER_FILES {
        apply_named_array_layer(app_dir, manifest, relative_path, field)?;
    }
    for (relative_path, source_field, target_field) in AGENT_APP_VALUE_LAYER_FILES {
        apply_value_layer(app_dir, manifest, relative_path, source_field, target_field)?;
    }
    Ok(())
}

fn read_layered_yaml(app_dir: &Path, relative_path: &str) -> Result<Option<Value>, String> {
    let path = app_dir.join(relative_path);
    if !path.is_file() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|error| {
        format!(
            "读取 Agent App 分层 manifest 文件失败 {}: {error}",
            path.display()
        )
    })?;
    let yaml_value: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|error| {
        format!(
            "解析 Agent App 分层 manifest 文件失败 {}: {error}",
            path.display()
        )
    })?;
    serde_json::to_value(yaml_value)
        .map(Some)
        .map_err(|error| format!("转换 Agent App 分层 manifest 文件失败: {error}"))
}

fn apply_value_layer(
    app_dir: &Path,
    manifest: &mut Value,
    relative_path: &str,
    source_field: &str,
    target_field: &str,
) -> Result<(), String> {
    let Some(layer) = read_layered_yaml(app_dir, relative_path)? else {
        return Ok(());
    };
    let Some(value) = layer.get(source_field).cloned() else {
        return Ok(());
    };
    manifest_object_mut(manifest)?.insert(target_field.to_string(), value);
    Ok(())
}

fn apply_named_array_layer(
    app_dir: &Path,
    manifest: &mut Value,
    relative_path: &str,
    field: &str,
) -> Result<(), String> {
    let Some(layer) = read_layered_yaml(app_dir, relative_path)? else {
        return Ok(());
    };
    let Some(layer_items) = layer.get(field).and_then(Value::as_array) else {
        return Ok(());
    };
    let mut merged = manifest
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for layer_item in layer_items {
        let Some(layer_key) = layered_item_key(layer_item) else {
            merged.push(layer_item.clone());
            continue;
        };
        if let Some(existing) = merged
            .iter_mut()
            .find(|item| layered_item_key(item).as_deref() == Some(layer_key.as_str()))
        {
            merge_json_object(existing, layer_item.clone())?;
        } else {
            merged.push(layer_item.clone());
        }
    }

    manifest_object_mut(manifest)?.insert(field.to_string(), Value::Array(merged));
    Ok(())
}

fn layered_item_key(value: &Value) -> Option<String> {
    value
        .get("key")
        .or_else(|| value.get("id"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn merge_json_object(target: &mut Value, overlay: Value) -> Result<(), String> {
    match (target.as_object_mut(), overlay) {
        (Some(target_object), Value::Object(overlay_object)) => {
            for (key, value) in overlay_object {
                target_object.insert(key, value);
            }
        }
        (_, value) => {
            *target = value;
        }
    }
    Ok(())
}

fn manifest_object_mut(manifest: &mut Value) -> Result<&mut Map<String, Value>, String> {
    manifest
        .as_object_mut()
        .ok_or_else(|| "Agent App manifest 必须是对象。".to_string())
}

fn validate_cloud_release_descriptor(
    descriptor: &AgentAppCloudReleaseDescriptor,
) -> Result<(), String> {
    validate_agent_app_id_for_storage(&descriptor.app_id)?;
    let url = Url::parse(&descriptor.package_url)
        .map_err(|error| format!("Agent App packageUrl 非法: {error}"))?;
    if url.scheme() != "https" {
        return Err("Agent App packageUrl 必须使用 https。".to_string());
    }
    if descriptor.source_uri != descriptor.package_url {
        return Err("Agent App release descriptor sourceUri 必须等于 packageUrl。".to_string());
    }
    validate_sha256_hash("packageHash", &descriptor.package_hash)?;
    validate_sha256_hash("manifestHash", &descriptor.manifest_hash)?;
    Ok(())
}

fn validate_sha256_hash(field: &str, value: &str) -> Result<(), String> {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return Err(format!("Agent App {field} 必须使用 sha256:<64 hex> 格式。"));
    };
    if hex.len() == 64 && hex.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Ok(());
    }
    Err(format!("Agent App {field} 必须使用 sha256:<64 hex> 格式。"))
}

async fn download_agent_app_package(package_url: &str) -> Result<Vec<u8>, String> {
    let response = reqwest::get(package_url)
        .await
        .map_err(|error| format!("下载 Agent App package 失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载 Agent App package 失败，HTTP 状态: {}",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取 Agent App package 响应失败: {error}"))?;
    Ok(bytes.to_vec())
}

fn extract_agent_app_package_archive(bytes: &[u8], staging_dir: &Path) -> Result<(), String> {
    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader)
        .map_err(|error| format!("Agent App package 必须是 zip/lapp 格式: {error}"))?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取 Agent App package 条目失败: {error}"))?;
        let enclosed = file
            .enclosed_name()
            .map(PathBuf::from)
            .ok_or_else(|| format!("Agent App package 包含不安全路径: {}", file.name()))?;
        let out_path = staging_dir.join(enclosed);
        if file.name().ends_with('/') {
            fs::create_dir_all(&out_path).map_err(|error| {
                format!(
                    "创建 Agent App package 目录失败 {}: {error}",
                    out_path.display()
                )
            })?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "创建 Agent App package 父目录失败 {}: {error}",
                    out_path.display()
                )
            })?;
        }
        let mut output = fs::File::create(&out_path).map_err(|error| {
            format!(
                "写入 Agent App package 文件失败 {}: {error}",
                out_path.display()
            )
        })?;
        io::copy(&mut file, &mut output).map_err(|error| {
            format!(
                "解压 Agent App package 文件失败 {}: {error}",
                out_path.display()
            )
        })?;
    }
    Ok(())
}

fn find_agent_app_package_root(staging_dir: &Path) -> Result<PathBuf, String> {
    if staging_dir.join("APP.md").is_file() {
        return Ok(staging_dir.to_path_buf());
    }
    let mut matches = Vec::new();
    collect_agent_app_roots(staging_dir, &mut matches)?;
    matches.sort();
    matches.dedup();
    match matches.len() {
        0 => Err("Agent App package 缺少 APP.md。".to_string()),
        1 => Ok(matches.remove(0)),
        _ => Err("Agent App package 包含多个 APP.md，无法确定 package root。".to_string()),
    }
}

fn collect_agent_app_roots(dir: &Path, matches: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(dir)
        .map_err(|error| format!("读取 Agent App package 目录失败 {}: {error}", dir.display()))?
    {
        let entry = entry.map_err(|error| format!("读取 Agent App package 条目失败: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            if path.join("APP.md").is_file() {
                matches.push(path.clone());
            }
            collect_agent_app_roots(&path, matches)?;
        }
    }
    Ok(())
}

fn ensure_manifest_matches_cloud_release(
    manifest: &Value,
    descriptor: &AgentAppCloudReleaseDescriptor,
) -> Result<(), String> {
    let manifest_app_id =
        read_json_string(manifest, &["name"]).or_else(|| read_json_string(manifest, &["appId"]));
    if manifest_app_id.as_deref() != Some(descriptor.app_id.as_str()) {
        return Err(format!(
            "Agent App package manifest appId 与 release descriptor 不一致: expected {}",
            descriptor.app_id
        ));
    }
    let manifest_version = read_json_string(manifest, &["version"]);
    if manifest_version.as_deref() != Some(descriptor.version.as_str()) {
        return Err(format!(
            "Agent App package manifest version 与 release descriptor 不一致: expected {}",
            descriptor.version
        ));
    }
    Ok(())
}

fn sha256_json_value(value: &Value) -> Result<String, String> {
    let bytes =
        serde_json::to_vec(value).map_err(|error| format!("序列化 manifest 失败: {error}"))?;
    Ok(format!("sha256:{}", sha256_hex(&bytes)))
}

fn sha256_package(app_dir: &Path, manifest: &Value) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(
        serde_json::to_vec(manifest).map_err(|error| format!("序列化 manifest 失败: {error}"))?,
    );
    for file in list_agent_app_package_files(app_dir)? {
        let relative = file.strip_prefix(app_dir).map_err(|error| {
            format!(
                "计算 Agent App package hash 时无法生成相对路径 {}: {error}",
                file.display()
            )
        })?;
        hasher.update(relative.to_string_lossy().as_bytes());
        hasher.update([0]);
        hasher.update(fs::read(&file).map_err(|error| {
            format!(
                "读取 Agent App package 文件失败 {}: {error}",
                file.display()
            )
        })?);
        hasher.update([0]);
    }
    Ok(format!("sha256:{}", hex::encode(hasher.finalize())))
}

fn list_agent_app_package_files(app_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut result = Vec::new();
    collect_agent_app_package_files(app_dir, &mut result)?;
    result.sort();
    Ok(result)
}

fn collect_agent_app_package_files(path: &Path, result: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries =
        fs::read_dir(path).map_err(|error| format!("读取 Agent App package 目录失败: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取 Agent App package 条目失败: {error}"))?;
        let entry_path = entry.path();
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if matches!(
            file_name.as_ref(),
            ".git" | "node_modules" | ".local" | ".lime"
        ) {
            continue;
        }
        let metadata = entry
            .metadata()
            .map_err(|error| format!("读取 Agent App package 元数据失败: {error}"))?;
        if metadata.is_dir() {
            collect_agent_app_package_files(&entry_path, result)?;
        } else if metadata.is_file() {
            result.push(entry_path);
        }
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn sha256_prefixed(bytes: &[u8]) -> String {
    format!("sha256:{}", sha256_hex(bytes))
}

fn safe_hash_path_segment(hash: &str) -> String {
    hash.replace(':', "_")
}

fn agent_app_data_dir() -> Result<PathBuf, String> {
    Ok(app_paths::preferred_data_dir()?.join(AGENT_APP_DATA_DIR))
}

fn agent_app_package_cache_dir(package_hash: &str) -> Result<PathBuf, String> {
    validate_sha256_hash("packageHash", package_hash)?;
    Ok(agent_app_data_dir()?
        .join("packages")
        .join(safe_hash_path_segment(package_hash)))
}

fn installed_agent_app_dir() -> Result<PathBuf, String> {
    Ok(agent_app_data_dir()?.join("installed"))
}

fn setup_agent_app_dir() -> Result<PathBuf, String> {
    Ok(agent_app_data_dir()?.join("setup"))
}

fn installed_agent_app_state_path(app_id: &str) -> Result<PathBuf, String> {
    validate_agent_app_id_for_storage(app_id)?;
    Ok(installed_agent_app_dir()?.join(format!("{app_id}.json")))
}

fn setup_agent_app_state_path(app_id: &str) -> Result<PathBuf, String> {
    validate_agent_app_id_for_storage(app_id)?;
    Ok(setup_agent_app_dir()?.join(format!("{app_id}.json")))
}

fn validate_agent_app_id_for_storage(app_id: &str) -> Result<(), String> {
    if app_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
        && !app_id.is_empty()
    {
        return Ok(());
    }
    Err(format!("Agent App id 不安全: {app_id}"))
}

fn read_state_app_id(state: &Value) -> Result<String, String> {
    read_json_string(state, &["appId"])
        .ok_or_else(|| "Installed Agent App state 缺少 appId。".to_string())
}

fn write_installed_agent_app_state(
    app_id: &str,
    state: &Value,
    saved_at: &str,
) -> Result<(), String> {
    fs::create_dir_all(installed_agent_app_dir()?)
        .map_err(|error| format!("创建 Agent App installed 目录失败: {error}"))?;
    fs::create_dir_all(setup_agent_app_dir()?)
        .map_err(|error| format!("创建 Agent App setup 目录失败: {error}"))?;

    let envelope = json!({
        "schemaVersion": INSTALLED_AGENT_APP_STATE_SCHEMA_VERSION,
        "savedAt": saved_at,
        "state": state,
    });
    fs::write(
        installed_agent_app_state_path(app_id)?,
        serde_json::to_string_pretty(&envelope)
            .map_err(|error| format!("序列化 installed state 失败: {error}"))?,
    )
    .map_err(|error| format!("写入 installed state 失败: {error}"))?;

    let setup_content = json!({
        "schemaVersion": INSTALLED_AGENT_APP_STATE_SCHEMA_VERSION,
        "appId": app_id,
        "savedAt": saved_at,
        "setup": state.get("setup").cloned().unwrap_or_else(|| json!({})),
    });
    fs::write(
        setup_agent_app_state_path(app_id)?,
        serde_json::to_string_pretty(&setup_content)
            .map_err(|error| format!("序列化 setup state 失败: {error}"))?,
    )
    .map_err(|error| format!("写入 setup state 失败: {error}"))?;
    Ok(())
}

fn set_object_field(value: &mut Value, key: &str, next: Value) -> Result<(), String> {
    let Some(object) = value.as_object_mut() else {
        return Err("Installed Agent App state 必须是对象。".to_string());
    };
    object.insert(key.to_string(), next);
    Ok(())
}

fn read_json_string(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str().map(str::to_string)
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

fn provider_to_value(provider: &ApiKeyProvider, api_key_count: usize) -> Value {
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
        "api_key_count": api_key_count,
        "created_at": provider.created_at.to_rfc3339(),
        "updated_at": provider.updated_at.to_rfc3339(),
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

fn fetch_models_result_to_response(
    result: FetchModelsResult,
) -> Result<ModelProviderFetchModelsResponse, RuntimeCoreError> {
    Ok(ModelProviderFetchModelsResponse {
        models: values_from_serializable_vec(result.models)?,
        source: serde_json::to_value(result.source)
            .map_err(data_error)?
            .as_str()
            .unwrap_or("Error")
            .to_string(),
        error: result.error,
        request_url: result.request_url,
        diagnostic_hint: result.diagnostic_hint,
        error_kind: result
            .error_kind
            .map(serde_json::to_value)
            .transpose()
            .map_err(data_error)?
            .and_then(|value| value.as_str().map(str::to_string)),
        should_prompt_error: result.should_prompt_error,
        from_cache: result.from_cache,
    })
}

fn required_string_field(value: &Value, key: &str) -> Result<String, RuntimeCoreError> {
    optional_string_field(value, key).ok_or_else(|| data_error(format!("{key} is required")))
}

fn optional_string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .or_else(|| value.get(to_camel_case(key).as_str()))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn optional_bool_field(value: &Value, key: &str) -> Option<bool> {
    value
        .get(key)
        .or_else(|| value.get(to_camel_case(key).as_str()))
        .and_then(Value::as_bool)
}

fn optional_i32_field(value: &Value, key: &str) -> Result<Option<i32>, RuntimeCoreError> {
    value
        .get(key)
        .or_else(|| value.get(to_camel_case(key).as_str()))
        .map(|value| {
            value
                .as_i64()
                .and_then(|number| i32::try_from(number).ok())
                .ok_or_else(|| data_error(format!("{key} must be a 32-bit integer")))
        })
        .transpose()
}

fn optional_string_vec_field(
    value: &Value,
    key: &str,
) -> Result<Option<Vec<String>>, RuntimeCoreError> {
    value
        .get(key)
        .or_else(|| value.get(to_camel_case(key).as_str()))
        .map(|value| {
            value
                .as_array()
                .ok_or_else(|| data_error(format!("{key} must be an array")))?
                .iter()
                .map(|item| {
                    item.as_str()
                        .map(str::to_string)
                        .ok_or_else(|| data_error(format!("{key} must contain only strings")))
                })
                .collect()
        })
        .transpose()
}

fn optional_prompt_cache_mode(
    value: &Value,
) -> Result<Option<ApiProviderPromptCacheMode>, RuntimeCoreError> {
    optional_string_field(value, "prompt_cache_mode")
        .map(|mode| {
            mode.parse::<ApiProviderPromptCacheMode>()
                .map_err(data_error)
        })
        .transpose()
}

fn to_camel_case(key: &str) -> String {
    let mut result = String::new();
    let mut uppercase_next = false;
    for ch in key.chars() {
        if ch == '_' {
            uppercase_next = true;
        } else if uppercase_next {
            result.extend(ch.to_uppercase());
            uppercase_next = false;
        } else {
            result.push(ch);
        }
    }
    result
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

#[derive(Debug, Deserialize)]
struct AutomationSchedulerConfigRequest {
    #[serde(default)]
    enabled: bool,
    #[serde(default = "default_automation_poll_interval_secs")]
    poll_interval_secs: u64,
    #[serde(default = "default_automation_enable_history")]
    enable_history: bool,
}

#[derive(Debug, Deserialize)]
struct AutomationJobCreateRequest {
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    enabled: Option<bool>,
    workspace_id: String,
    #[serde(default)]
    execution_mode: Option<AutomationExecutionMode>,
    schedule: TaskSchedule,
    payload: Value,
    #[serde(default)]
    delivery: Option<DeliveryConfig>,
    #[serde(default)]
    timeout_secs: Option<u64>,
    #[serde(default)]
    max_retries: Option<u32>,
}

#[derive(Debug, Deserialize, Default)]
struct AutomationJobUpdateRequest {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    workspace_id: Option<String>,
    #[serde(default)]
    execution_mode: Option<AutomationExecutionMode>,
    #[serde(default)]
    schedule: Option<TaskSchedule>,
    #[serde(default)]
    payload: Option<Value>,
    #[serde(default)]
    delivery: Option<DeliveryConfig>,
    #[serde(default)]
    timeout_secs: Option<u64>,
    #[serde(default)]
    clear_timeout_secs: Option<bool>,
    #[serde(default)]
    max_retries: Option<u32>,
}

#[derive(Debug, Deserialize, Default)]
struct AutomationHealthQuery {
    #[serde(default)]
    running_timeout_minutes: Option<u64>,
    #[serde(default)]
    top_limit: Option<usize>,
    #[serde(default)]
    cooldown_alert_threshold: Option<usize>,
    #[serde(default)]
    stale_running_alert_threshold: Option<usize>,
    #[serde(default)]
    failed_24h_alert_threshold: Option<usize>,
}

fn default_automation_poll_interval_secs() -> u64 {
    30
}

fn default_automation_enable_history() -> bool {
    true
}

fn automation_scheduler_config_value(config: AutomationSettings) -> Value {
    json!({
        "enabled": config.enabled,
        "poll_interval_secs": config.poll_interval_secs,
        "enable_history": config.enable_history,
    })
}

fn normalize_automation_job_id(id: &str) -> Result<String, RuntimeCoreError> {
    let id = id.trim();
    if id.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "automation job id is required".to_string(),
        ));
    }
    Ok(id.to_string())
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn validate_automation_job_create_request(
    request: &AutomationJobCreateRequest,
) -> Result<(), RuntimeCoreError> {
    if request.name.trim().is_empty() {
        return Err(RuntimeCoreError::Backend("任务名称不能为空".to_string()));
    }
    if request.workspace_id.trim().is_empty() {
        return Err(RuntimeCoreError::Backend("workspace_id 必填".to_string()));
    }
    validate_automation_schedule_value(&request.schedule, Utc::now()).map_err(data_error)?;
    validate_automation_payload(&request.payload)?;
    Ok(())
}

fn validate_automation_job_record(job: &AutomationJob) -> Result<(), RuntimeCoreError> {
    if job.name.trim().is_empty() {
        return Err(RuntimeCoreError::Backend("任务名称不能为空".to_string()));
    }
    if job.workspace_id.trim().is_empty() {
        return Err(RuntimeCoreError::Backend("workspace_id 必填".to_string()));
    }
    validate_automation_schedule_value(&job.schedule, Utc::now()).map_err(data_error)?;
    validate_automation_payload(&job.payload)?;
    Ok(())
}

fn validate_automation_payload(payload: &Value) -> Result<(), RuntimeCoreError> {
    let Some(payload) = payload.as_object() else {
        return Err(RuntimeCoreError::Backend(
            "自动化任务 payload 必须为对象".to_string(),
        ));
    };
    let kind = payload
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match kind {
        "agent_turn" => {
            let prompt = payload
                .get("prompt")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if prompt.trim().is_empty() {
                return Err(RuntimeCoreError::Backend(
                    "自动化任务内容不能为空".to_string(),
                ));
            }
            if let Some(content_id) = payload
                .get("content_id")
                .or_else(|| payload.get("contentId"))
            {
                if content_id
                    .as_str()
                    .map(str::trim)
                    .unwrap_or_default()
                    .is_empty()
                {
                    return Err(RuntimeCoreError::Backend(
                        "自动化任务 content_id 不能为空字符串".to_string(),
                    ));
                }
            }
            if let Some(metadata) = payload
                .get("request_metadata")
                .or_else(|| payload.get("requestMetadata"))
            {
                if !metadata.is_object() {
                    return Err(RuntimeCoreError::Backend(
                        "自动化任务 request_metadata 必须为对象".to_string(),
                    ));
                }
                validate_automation_managed_objective_metadata(metadata)?;
            }
            Ok(())
        }
        "browser_session" => Err(RuntimeCoreError::Backend(
            "浏览器自动化任务已下线，不再允许创建或执行".to_string(),
        )),
        _ => Err(RuntimeCoreError::Backend(format!(
            "不支持的自动化任务 payload.kind: {kind}"
        ))),
    }
}

fn validate_automation_managed_objective_metadata(
    metadata: &Value,
) -> Result<(), RuntimeCoreError> {
    let Some(harness) = metadata.get("harness").and_then(Value::as_object) else {
        return Ok(());
    };
    let Some(managed_objective) = harness
        .get("managed_objective")
        .or_else(|| harness.get("managedObjective"))
        .and_then(Value::as_object)
    else {
        return Ok(());
    };

    let owner_type = managed_objective
        .get("owner_type")
        .or_else(|| managed_objective.get("ownerType"))
        .or_else(|| managed_objective.get("owner_kind"))
        .or_else(|| managed_objective.get("ownerKind"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(owner_type) = owner_type {
        if owner_type != "automation_job" {
            return Err(RuntimeCoreError::Backend(format!(
                "自动化任务 managed_objective.owner_type 必须为 automation_job，当前为 {owner_type}"
            )));
        }
    }

    let objective_text = managed_objective
        .get("objective_text")
        .or_else(|| managed_objective.get("objectiveText"))
        .or_else(|| managed_objective.get("objective"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if objective_text.is_none() {
        return Err(RuntimeCoreError::Backend(
            "自动化任务 managed_objective.objective 必填".to_string(),
        ));
    }
    Ok(())
}

fn preview_next_automation_run(schedule: &TaskSchedule) -> Result<Option<String>, String> {
    Ok(next_run_for_automation_schedule(schedule, Utc::now())?.map(|value| value.to_rfc3339()))
}

fn next_run_for_automation_schedule(
    schedule: &TaskSchedule,
    from: DateTime<Utc>,
) -> Result<Option<DateTime<Utc>>, String> {
    match schedule {
        TaskSchedule::Every { every_secs } => {
            let secs = (*every_secs).max(60);
            Ok(Some(from + Duration::seconds(secs as i64)))
        }
        TaskSchedule::Cron { expr, tz } => {
            let normalized = normalize_cron_expression(expr);
            let cron_schedule = cron::Schedule::from_str(&normalized)
                .map_err(|error| format!("无效的 Cron 表达式: {error}"))?;
            let next = if let Some(tz_str) = tz
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                let timezone: chrono_tz::Tz = tz_str
                    .parse()
                    .map_err(|_| format!("无效的时区: {tz_str}"))?;
                cron_schedule
                    .after(&from.with_timezone(&timezone))
                    .next()
                    .map(|value| value.with_timezone(&Utc))
            } else {
                cron_schedule.after(&from).next()
            };
            Ok(next)
        }
        TaskSchedule::At { at } => {
            let target = DateTime::parse_from_rfc3339(at)
                .map_err(|error| format!("无效的时间格式（需要 RFC3339）: {error}"))?
                .with_timezone(&Utc);
            if target > from {
                Ok(Some(target))
            } else {
                Ok(None)
            }
        }
    }
}

fn validate_automation_schedule_value(
    schedule: &TaskSchedule,
    now: DateTime<Utc>,
) -> Result<(), String> {
    match schedule {
        TaskSchedule::Every { every_secs } => {
            if *every_secs < 60 {
                return Err("间隔时间不能小于 60 秒".to_string());
            }
            Ok(())
        }
        TaskSchedule::Cron { expr, tz } => {
            let normalized = normalize_cron_expression(expr);
            cron::Schedule::from_str(&normalized)
                .map_err(|error| format!("无效的 Cron 表达式: {error}"))?;
            if let Some(tz_str) = tz
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                let _: chrono_tz::Tz = tz_str
                    .parse()
                    .map_err(|_| format!("无效的时区: {tz_str}"))?;
            }
            Ok(())
        }
        TaskSchedule::At { at } => {
            let target = DateTime::parse_from_rfc3339(at)
                .map_err(|error| format!("无效的时间格式: {error}"))?
                .with_timezone(&Utc);
            if target <= now {
                return Err("指定时间已过期".to_string());
            }
            Ok(())
        }
    }
}

fn normalize_cron_expression(expr: &str) -> String {
    let parts = expr.split_whitespace().collect::<Vec<_>>();
    if parts.len() == 5 {
        format!("0 {}", expr.trim())
    } else {
        expr.trim().to_string()
    }
}

fn query_automation_health_value(
    conn: &rusqlite::Connection,
    query: AutomationHealthQuery,
) -> Result<Value, String> {
    let running_timeout_minutes = query.running_timeout_minutes.unwrap_or(10);
    let top_limit = query.top_limit.unwrap_or(5);
    let cooldown_alert_threshold = query.cooldown_alert_threshold.unwrap_or(1);
    let stale_running_alert_threshold = query.stale_running_alert_threshold.unwrap_or(1);
    let failed_24h_alert_threshold = query.failed_24h_alert_threshold.unwrap_or(3);
    let jobs =
        AutomationJobDao::list(conn).map_err(|error| format!("查询自动化任务失败: {error}"))?;
    let now = Utc::now();
    let stale_deadline = now - Duration::minutes(running_timeout_minutes as i64);

    let total_jobs = jobs.len();
    let enabled_jobs = jobs.iter().filter(|job| job.enabled).count();
    let pending_jobs = jobs
        .iter()
        .filter(|job| job.enabled)
        .filter(|job| job.running_started_at.is_none())
        .filter(|job| !automation_job_in_cooldown(job, now))
        .filter(|job| {
            job.next_run_at
                .as_deref()
                .and_then(parse_rfc3339_utc)
                .map(|value| value <= now)
                .unwrap_or(false)
        })
        .count();
    let running_jobs = jobs
        .iter()
        .filter(|job| job.running_started_at.is_some())
        .count();
    let failed_jobs = jobs
        .iter()
        .filter(|job| matches!(job.last_status.as_deref(), Some("error" | "timeout")))
        .count();
    let cooldown_jobs = jobs
        .iter()
        .filter(|job| automation_job_in_cooldown(job, now))
        .count();
    let stale_running_jobs = jobs
        .iter()
        .filter(|job| {
            job.running_started_at
                .as_deref()
                .and_then(parse_rfc3339_utc)
                .map(|value| value < stale_deadline)
                .unwrap_or(false)
        })
        .count();

    let recent_runs_by_job = jobs
        .iter()
        .map(|job| {
            let runs = AgentRunDao::list_runs_by_source_ref(conn, "automation", &job.id, 200)
                .unwrap_or_default();
            (job.id.clone(), runs)
        })
        .collect::<std::collections::HashMap<_, _>>();
    let recent_runs = recent_runs_by_job
        .values()
        .flat_map(|runs| runs.iter().cloned())
        .collect::<Vec<_>>();
    let failure_trend_24h = build_automation_failure_trend_24h(&recent_runs, now);
    let failed_last_24h = failure_trend_24h
        .iter()
        .map(|item| {
            item.get("error_count").and_then(Value::as_u64).unwrap_or(0)
                + item
                    .get("timeout_count")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
        })
        .sum::<u64>() as usize;

    let mut risky_jobs = jobs
        .iter()
        .filter(|job| {
            job.consecutive_failures > 0
                || automation_job_in_cooldown(job, now)
                || matches!(
                    job.last_status.as_deref(),
                    Some("waiting_for_human" | "human_controlling" | "error" | "timeout")
                )
        })
        .map(|job| {
            json!({
                "job_id": job.id,
                "name": job.name,
                "status": job.last_status.clone().unwrap_or_else(|| "idle".to_string()),
                "consecutive_failures": job.consecutive_failures,
                "retry_count": job.last_retry_count,
                "detail_message": recent_runs_by_job
                    .get(&job.id)
                    .and_then(|runs| resolve_automation_risky_job_detail(job, runs)),
                "auto_disabled_until": job.auto_disabled_until,
                "updated_at": job.updated_at,
            })
        })
        .collect::<Vec<_>>();
    risky_jobs.sort_by(|left, right| {
        let left_failures = left
            .get("consecutive_failures")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let right_failures = right
            .get("consecutive_failures")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let left_retries = left.get("retry_count").and_then(Value::as_u64).unwrap_or(0);
        let right_retries = right
            .get("retry_count")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        right_failures
            .cmp(&left_failures)
            .then_with(|| right_retries.cmp(&left_retries))
    });
    risky_jobs.truncate(top_limit);

    Ok(json!({
        "total_jobs": total_jobs,
        "enabled_jobs": enabled_jobs,
        "pending_jobs": pending_jobs,
        "running_jobs": running_jobs,
        "failed_jobs": failed_jobs,
        "cooldown_jobs": cooldown_jobs,
        "stale_running_jobs": stale_running_jobs,
        "failed_last_24h": failed_last_24h,
        "failure_trend_24h": failure_trend_24h,
        "alerts": build_automation_alerts(
            cooldown_jobs,
            stale_running_jobs,
            failed_last_24h,
            cooldown_alert_threshold,
            stale_running_alert_threshold,
            failed_24h_alert_threshold,
        ),
        "risky_jobs": risky_jobs,
        "generated_at": now.to_rfc3339(),
    }))
}

fn resolve_automation_risky_job_detail(job: &AutomationJob, runs: &[AgentRun]) -> Option<String> {
    runs.first()
        .and_then(resolve_automation_run_detail_message)
        .or_else(|| job.last_error.as_deref().and_then(normalize_non_empty_text))
}

fn resolve_automation_run_detail_message(run: &AgentRun) -> Option<String> {
    let human_reason = run
        .metadata
        .as_deref()
        .and_then(|metadata| extract_json_string(metadata, "human_reason"));
    if let Some(reason) = human_reason {
        if run.error_message.as_deref().map(str::trim) != Some(reason.as_str()) {
            return Some(reason);
        }
    }
    run.error_message
        .as_deref()
        .and_then(normalize_non_empty_text)
}

fn extract_json_string(metadata: &str, key: &str) -> Option<String> {
    let parsed = serde_json::from_str::<Value>(metadata).ok()?;
    parsed.get(key)?.as_str().and_then(normalize_non_empty_text)
}

fn normalize_non_empty_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_rfc3339_utc(raw: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn automation_job_in_cooldown(job: &AutomationJob, now: DateTime<Utc>) -> bool {
    job.auto_disabled_until
        .as_deref()
        .and_then(parse_rfc3339_utc)
        .map(|value| value > now)
        .unwrap_or(false)
}

fn build_automation_failure_trend_24h(runs: &[AgentRun], now: DateTime<Utc>) -> Vec<Value> {
    let mut points = Vec::with_capacity(24);
    let end_hour = floor_to_hour(now);
    let start_hour = end_hour - Duration::hours(23);

    for offset in 0..24 {
        let bucket = start_hour + Duration::hours(offset as i64);
        let bucket_end = bucket + Duration::hours(1);
        let mut error_count = 0usize;
        let mut timeout_count = 0usize;

        for run in runs {
            let Some(started_at) = parse_rfc3339_utc(run.started_at.as_str()) else {
                continue;
            };
            if started_at < bucket || started_at >= bucket_end {
                continue;
            }
            match run.status {
                AgentRunStatus::Error => error_count += 1,
                AgentRunStatus::Timeout => timeout_count += 1,
                _ => {}
            }
        }

        points.push(json!({
            "bucket_start": bucket.to_rfc3339(),
            "label": bucket.format("%H:%M").to_string(),
            "error_count": error_count,
            "timeout_count": timeout_count,
        }));
    }

    points
}

fn floor_to_hour(now: DateTime<Utc>) -> DateTime<Utc> {
    now.with_minute(0)
        .and_then(|value| value.with_second(0))
        .and_then(|value| value.with_nanosecond(0))
        .unwrap_or(now)
}

fn build_automation_alerts(
    cooldown_jobs: usize,
    stale_running_jobs: usize,
    failed_last_24h: usize,
    cooldown_threshold: usize,
    stale_threshold: usize,
    failed_threshold: usize,
) -> Vec<Value> {
    let mut alerts = Vec::new();

    if cooldown_jobs >= cooldown_threshold {
        alerts.push(json!({
            "code": "cooldown_jobs",
            "severity": "warning",
            "message": format!("当前有 {cooldown_jobs} 个任务处于冷却中"),
            "current_value": cooldown_jobs,
            "threshold": cooldown_threshold,
        }));
    }
    if stale_running_jobs >= stale_threshold {
        alerts.push(json!({
            "code": "stale_running_jobs",
            "severity": "critical",
            "message": format!("检测到 {stale_running_jobs} 个悬挂中的运行任务"),
            "current_value": stale_running_jobs,
            "threshold": stale_threshold,
        }));
    }
    if failed_last_24h >= failed_threshold {
        alerts.push(json!({
            "code": "failed_runs_24h",
            "severity": "warning",
            "message": format!("最近 24 小时失败或超时 {failed_last_24h} 次"),
            "current_value": failed_last_24h,
            "threshold": failed_threshold,
        }));
    }

    alerts
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
    use tempfile::TempDir;

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

    fn insert_hidden_harness_timeline_session(conn: &Connection) {
        insert_session(
            conn,
            "hidden-harness-session",
            "内部 Smoke 会话",
            "2026-03-13T01:00:04Z",
        );
        conn.execute(
            "UPDATE agent_sessions
             SET extension_data_json = ?1
             WHERE id = 'hidden-harness-session'",
            params![json!({
                "lime_harness.v0": {
                    "hiddenFromUserRecents": true,
                    "source": "smoke-fixture"
                }
            })
            .to_string()],
        )
        .expect("mark hidden harness session");
        let turn = AgentThreadTurn {
            id: "turn-hidden-harness".to_string(),
            thread_id: "hidden-harness-session".to_string(),
            prompt_text: "内部 smoke".to_string(),
            status: AgentThreadTurnStatus::Completed,
            started_at: "2026-03-13T01:00:04Z".to_string(),
            completed_at: Some("2026-03-13T01:00:05Z".to_string()),
            error_message: None,
            created_at: "2026-03-13T01:00:04Z".to_string(),
            updated_at: "2026-03-13T01:00:05Z".to_string(),
        };
        AgentTimelineDao::create_turn(conn, &turn).expect("insert hidden turn");
    }

    fn insert_smoke_title_timeline_session(conn: &Connection) {
        insert_session(
            conn,
            "smoke-title-session",
            "Code runtime fixture 2026-03-13T01:00:06Z",
            "2026-03-13T01:00:06Z",
        );
        let turn = AgentThreadTurn {
            id: "turn-smoke-title".to_string(),
            thread_id: "smoke-title-session".to_string(),
            prompt_text: "历史 smoke 标题".to_string(),
            status: AgentThreadTurnStatus::Completed,
            started_at: "2026-03-13T01:00:06Z".to_string(),
            completed_at: Some("2026-03-13T01:00:07Z".to_string()),
            error_message: None,
            created_at: "2026-03-13T01:00:06Z".to_string(),
            updated_at: "2026-03-13T01:00:07Z".to_string(),
        };
        AgentTimelineDao::create_turn(conn, &turn).expect("insert smoke title turn");
    }

    fn write_registered_skill(workspace_root: &Path, directory: &str) -> PathBuf {
        let skill_dir = workspace_root
            .join(".agents")
            .join("skills")
            .join(directory);
        fs::create_dir_all(skill_dir.join(".lime")).expect("create registered skill dir");
        fs::write(
            skill_dir.join("SKILL.md"),
            [
                "---",
                "name: 只读报告",
                "description: 读取本地数据并生成报告。",
                "allowed-tools: Read",
                "---",
                "",
                "# 只读报告",
            ]
            .join("\n"),
        )
        .expect("write skill");
        fs::write(
            skill_dir.join(".lime").join("registration.json"),
            json!({
                "registrationId": "capreg-1",
                "registeredAt": "2026-06-06T00:00:00.000Z",
                "skillDirectory": directory,
                "registeredSkillDirectory": skill_dir.to_string_lossy(),
                "sourceDraftId": "capdraft-1",
                "sourceVerificationReportId": "capver-1",
                "generatedFileCount": 2,
                "permissionSummary": ["Level 0 只读发现"]
            })
            .to_string(),
        )
        .expect("write registration");
        skill_dir
    }

    #[test]
    fn list_workspace_registered_skills_value_discovers_registered_skill() {
        let temp = TempDir::new().expect("temp dir");
        let skill_dir = write_registered_skill(temp.path(), "readonly-report");

        let skills = list_workspace_registered_skills_value(WorkspaceRegisteredSkillsListParams {
            workspace_root: temp.path().to_string_lossy().to_string(),
        })
        .expect("list registered skills");

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0]["key"], json!("workspace:readonly-report"));
        assert_eq!(skills[0]["name"], json!("只读报告"));
        assert_eq!(
            skills[0]["registered_skill_directory"],
            json!(skill_dir.to_string_lossy().to_string())
        );
        assert_eq!(
            skills[0]["registration"]["sourceVerificationReportId"],
            json!("capver-1")
        );
        assert_eq!(skills[0]["permission_summary"], json!(["Level 0 只读发现"]));
        assert_eq!(skills[0]["launch_enabled"], json!(false));
    }

    #[test]
    fn list_workspace_registered_skills_value_ignores_standard_skill_without_registration() {
        let temp = TempDir::new().expect("temp dir");
        let skill_dir = temp
            .path()
            .join(".agents")
            .join("skills")
            .join("manual-standard-skill");
        fs::create_dir_all(&skill_dir).expect("create standard skill dir");
        fs::write(
            skill_dir.join("SKILL.md"),
            [
                "---",
                "name: 手工标准 Skill",
                "description: 没有 P3A provenance。",
                "---",
                "",
                "# 手工标准 Skill",
            ]
            .join("\n"),
        )
        .expect("write skill");

        let skills = list_workspace_registered_skills_value(WorkspaceRegisteredSkillsListParams {
            workspace_root: temp.path().to_string_lossy().to_string(),
        })
        .expect("list registered skills");

        assert!(skills.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn list_workspace_registered_skills_value_rejects_symlink_skill_directory() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().expect("temp dir");
        let skills_root = temp.path().join(".agents").join("skills");
        let outside = temp.path().join("outside-skill");
        fs::create_dir_all(&outside).expect("create outside skill");
        fs::create_dir_all(&skills_root).expect("create skills root");
        fs::write(
            outside.join("SKILL.md"),
            [
                "---",
                "name: 外部 Skill",
                "description: 不应通过 symlink 暴露。",
                "---",
                "",
                "# 外部 Skill",
            ]
            .join("\n"),
        )
        .expect("write outside skill");
        symlink(&outside, skills_root.join("outside-skill")).expect("symlink skill");

        let error = list_workspace_registered_skills_value(WorkspaceRegisteredSkillsListParams {
            workspace_root: temp.path().to_string_lossy().to_string(),
        })
        .expect_err("reject symlink skill directory");

        assert!(error.contains("must not be a symlink"));
    }

    #[test]
    fn remove_agent_app_install_reference_paths_removes_only_reference_files() {
        let temp = TempDir::new().expect("temp dir");
        let installed = temp.path().join("installed").join("content-factory-app.json");
        let setup = temp.path().join("setup").join("content-factory-app.json");
        let storage = temp
            .path()
            .join("storage")
            .join("content-factory-app")
            .join("user-data.json");

        fs::create_dir_all(installed.parent().expect("installed parent")).expect("installed dir");
        fs::create_dir_all(setup.parent().expect("setup parent")).expect("setup dir");
        fs::create_dir_all(storage.parent().expect("storage parent")).expect("storage dir");
        fs::write(&installed, "{}").expect("installed state");
        fs::write(&setup, "{}").expect("setup state");
        fs::write(&storage, "{}").expect("storage data");

        let (removed, missing) =
            remove_agent_app_install_reference_paths(&[installed.clone(), setup.clone()])
                .expect("remove install refs");

        assert_eq!(removed, 2);
        assert_eq!(missing, 0);
        assert!(!installed.exists());
        assert!(!setup.exists());
        assert!(storage.exists());
    }

    #[test]
    fn remove_agent_app_install_reference_paths_counts_missing_reference_files() {
        let temp = TempDir::new().expect("temp dir");
        let installed = temp.path().join("installed").join("content-factory-app.json");
        let setup = temp.path().join("setup").join("content-factory-app.json");

        fs::create_dir_all(installed.parent().expect("installed parent")).expect("installed dir");
        fs::write(&installed, "{}").expect("installed state");

        let (removed, missing) =
            remove_agent_app_install_reference_paths(&[installed.clone(), setup.clone()])
                .expect("remove install refs");

        assert_eq!(removed, 1);
        assert_eq!(missing, 1);
        assert!(!installed.exists());
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
                workspace_id: None,
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
    async fn list_current_timeline_sessions_excludes_harness_hidden_sessions() {
        let data_source = setup_data_source();
        {
            let conn = database::lock_db(&data_source.db).expect("lock db");
            insert_current_timeline_session(&conn);
            insert_hidden_harness_timeline_session(&conn);
            insert_smoke_title_timeline_session(&conn);
        }

        let response = data_source
            .list_current_timeline_sessions(AgentSessionListParams {
                workspace_id: Some(WORKSPACE_ID.to_string()),
                limit: Some(20),
                ..AgentSessionListParams::default()
            })
            .await
            .expect("list sessions");

        let ids = response
            .sessions
            .iter()
            .map(|session| session.session_id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(ids, vec!["current-session"]);

        let hidden = data_source
            .read_current_timeline_session(AgentSessionReadParams {
                session_id: "hidden-harness-session".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await
            .expect("read hidden session")
            .expect("hidden session remains readable by id");
        assert_eq!(hidden.session.session_id, "hidden-harness-session");
    }

    #[tokio::test]
    async fn update_current_timeline_session_updates_title_and_archive_state() {
        let data_source = setup_data_source();
        {
            let conn = database::lock_db(&data_source.db).expect("lock db");
            insert_current_timeline_session(&conn);
        }

        let updated = data_source
            .update_current_timeline_session(AgentSessionUpdateParams {
                session_id: "current-session".to_string(),
                title: Some("更新后的对话".to_string()),
                archived: Some(true),
                provider_selector: Some("custom-provider".to_string()),
                provider_name: Some("OpenAI Compatible".to_string()),
                model_name: Some("gpt-5.4".to_string()),
                execution_strategy: Some("react".to_string()),
                recent_access_mode: Some("full-access".to_string()),
                recent_preferences: Some(json!({
                    "task": true,
                    "subagent": false
                })),
                recent_team_selection: Some(json!({
                    "disabled": true
                })),
                ..AgentSessionUpdateParams::default()
            })
            .await
            .expect("update current session");

        assert_eq!(updated.session.session_id, "current-session");
        assert_eq!(updated.session.title.as_deref(), Some("更新后的对话"));
        assert!(updated.session.archived_at.is_some());

        let recent = data_source
            .list_current_timeline_sessions(AgentSessionListParams {
                workspace_id: Some(WORKSPACE_ID.to_string()),
                limit: Some(20),
                ..AgentSessionListParams::default()
            })
            .await
            .expect("list recent sessions");
        assert!(recent.sessions.is_empty());

        let archived = data_source
            .list_current_timeline_sessions(AgentSessionListParams {
                archived_only: Some(true),
                workspace_id: Some(WORKSPACE_ID.to_string()),
                limit: Some(20),
                ..AgentSessionListParams::default()
            })
            .await
            .expect("list archived sessions");
        assert_eq!(archived.sessions.len(), 1);
        assert_eq!(archived.sessions[0].session_id, "current-session");
        assert_eq!(archived.sessions[0].model, "gpt-5.4");
        assert_eq!(
            archived.sessions[0].execution_strategy.as_deref(),
            Some("react")
        );

        let detail = data_source
            .read_current_timeline_session(AgentSessionReadParams {
                session_id: "current-session".to_string(),
                history_limit: Some(10),
                history_offset: Some(0),
                history_before_message_id: None,
            })
            .await
            .expect("read updated session")
            .expect("updated session detail")
            .detail
            .expect("compat detail");
        assert_eq!(
            detail.pointer("/execution_runtime/provider_selector"),
            Some(&json!("custom-provider"))
        );
        assert_eq!(
            detail.pointer("/execution_runtime/provider_name"),
            Some(&json!("OpenAI Compatible"))
        );
        assert_eq!(
            detail.pointer("/execution_runtime/model_name"),
            Some(&json!("gpt-5.4"))
        );
        assert_eq!(
            detail.pointer("/execution_runtime/recent_access_mode"),
            Some(&json!("full-access"))
        );
        assert_eq!(
            detail.pointer("/execution_runtime/recent_preferences/task"),
            Some(&json!(true))
        );
        assert_eq!(
            detail.pointer("/execution_runtime/recent_team_selection/disabled"),
            Some(&json!(true))
        );
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
