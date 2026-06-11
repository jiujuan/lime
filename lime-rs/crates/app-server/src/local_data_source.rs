use crate::gateway_tunnel;
use crate::AppDataSource;
use crate::ManagedObjectiveAuditUpdate;
use crate::RuntimeCoreError;
mod agent_apps;
mod automation;
mod channels;
mod connect;
mod current_timeline;
mod diagnostics;
mod gallery_materials;
mod knowledge;
mod mcp;
mod media_tasks;
mod model_providers;
mod project_materials;
mod session_files;
mod session_objectives;
mod skills;
mod unified_memory;
mod usage_stats;
mod voice_asr_credentials;
mod voice_instructions;
mod workspaces;
use app_server_protocol::AgentAppFetchCloudPackageParams;
use app_server_protocol::AgentAppInstalledDisabledSetParams;
use app_server_protocol::AgentAppInstalledListResponse;
use app_server_protocol::AgentAppInstalledSaveParams;
use app_server_protocol::AgentAppLocalPackageInspectParams;
use app_server_protocol::AgentAppLocalPackageInspectResponse;
use app_server_protocol::AgentAppPackageCacheEntry;
use app_server_protocol::AgentAppUninstallParams;
use app_server_protocol::AgentAppUninstallRehearsalParams;
use app_server_protocol::AgentAppUninstallRehearsalResponse;
use app_server_protocol::AgentAppUninstallResponse;
use app_server_protocol::AgentSessionArchiveManyParams;
use app_server_protocol::AgentSessionArchiveManyResponse;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::AgentSessionListResponse;
use app_server_protocol::AgentSessionObjectiveClearParams;
use app_server_protocol::AgentSessionObjectiveClearResponse;
use app_server_protocol::AgentSessionObjectiveReadParams;
use app_server_protocol::AgentSessionObjectiveReadResponse;
use app_server_protocol::AgentSessionObjectiveSetParams;
use app_server_protocol::AgentSessionObjectiveSetResponse;
use app_server_protocol::AgentSessionObjectiveStatusUpdateParams;
use app_server_protocol::AgentSessionObjectiveStatusUpdateResponse;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentSessionUpdateParams;
use app_server_protocol::AgentSessionUpdateResponse;
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
use app_server_protocol::ChannelProbeParams;
use app_server_protocol::ChannelProbeResponse;
use app_server_protocol::ConnectCallbackSendParams;
use app_server_protocol::ConnectCallbackSendResponse;
use app_server_protocol::ConnectDeepLinkResolveParams;
use app_server_protocol::ConnectDeepLinkResolveResponse;
use app_server_protocol::ConnectOpenDeepLinkResolveParams;
use app_server_protocol::ConnectOpenDeepLinkResolveResponse;
use app_server_protocol::ConnectRelayApiKeySaveParams;
use app_server_protocol::ConnectRelayApiKeySaveResponse;
use app_server_protocol::GalleryMaterialDeleteResponse;
use app_server_protocol::GalleryMaterialFilterParams;
use app_server_protocol::GalleryMaterialListResponse;
use app_server_protocol::GalleryMaterialLookupParams;
use app_server_protocol::GalleryMaterialMetadataCreateParams;
use app_server_protocol::GalleryMaterialMetadataResponse;
use app_server_protocol::GalleryMaterialMetadataUpdateParams;
use app_server_protocol::GalleryMaterialResponse;
use app_server_protocol::GatewayChannelStartParams;
use app_server_protocol::GatewayChannelStatusParams;
use app_server_protocol::GatewayChannelStatusResponse;
use app_server_protocol::GatewayChannelStopParams;
use app_server_protocol::GatewayTunnelCloudflaredDetectResponse;
use app_server_protocol::GatewayTunnelCloudflaredInstallParams;
use app_server_protocol::GatewayTunnelCloudflaredInstallResponse;
use app_server_protocol::GatewayTunnelCreateParams;
use app_server_protocol::GatewayTunnelCreateResponse;
use app_server_protocol::GatewayTunnelProbeResponse;
use app_server_protocol::GatewayTunnelStatusResponse;
use app_server_protocol::GatewayTunnelSyncWebhookUrlParams;
use app_server_protocol::GatewayTunnelSyncWebhookUrlResponse;
use app_server_protocol::KnowledgeCompilePackResponse;
use app_server_protocol::KnowledgeContextResolutionResponse;
use app_server_protocol::KnowledgeImportSourceParams;
use app_server_protocol::KnowledgeImportSourceResponse;
use app_server_protocol::KnowledgeListPacksParams;
use app_server_protocol::KnowledgeListPacksResponse;
use app_server_protocol::KnowledgeReadPackParams;
use app_server_protocol::KnowledgeReadPackResponse;
use app_server_protocol::KnowledgeResolveContextParams;
use app_server_protocol::KnowledgeSetDefaultPackParams;
use app_server_protocol::KnowledgeSetDefaultPackResponse;
use app_server_protocol::KnowledgeUpdatePackStatusParams;
use app_server_protocol::KnowledgeUpdatePackStatusResponse;
use app_server_protocol::KnowledgeValidateContextRunParams;
use app_server_protocol::KnowledgeValidateContextRunResponse;
use app_server_protocol::LogClearResponse;
use app_server_protocol::LogListResponse;
use app_server_protocol::LogPersistedTailParams;
use app_server_protocol::LogPersistedTailResponse;
use app_server_protocol::LogStorageDiagnosticsResponse;
use app_server_protocol::ManagedObjective;
use app_server_protocol::McpPromptGetParams;
use app_server_protocol::McpPromptGetResponse;
use app_server_protocol::McpPromptListResponse;
use app_server_protocol::McpResourceListResponse;
use app_server_protocol::McpResourceReadParams;
use app_server_protocol::McpResourceReadResponse;
use app_server_protocol::McpServerCreateParams;
use app_server_protocol::McpServerDeleteParams;
use app_server_protocol::McpServerEnabledSetParams;
use app_server_protocol::McpServerImportFromAppParams;
use app_server_protocol::McpServerImportFromAppResponse;
use app_server_protocol::McpServerLifecycleResponse;
use app_server_protocol::McpServerListResponse;
use app_server_protocol::McpServerStartParams;
use app_server_protocol::McpServerStatusListResponse;
use app_server_protocol::McpServerStopParams;
use app_server_protocol::McpServerUpdateParams;
use app_server_protocol::McpToolCallParams;
use app_server_protocol::McpToolCallResponse;
use app_server_protocol::McpToolCallWithCallerParams;
use app_server_protocol::McpToolListForContextParams;
use app_server_protocol::McpToolListResponse;
use app_server_protocol::McpToolSearchParams;
use app_server_protocol::MediaTaskArtifactAudioCompleteParams;
use app_server_protocol::MediaTaskArtifactAudioCreateParams;
use app_server_protocol::MediaTaskArtifactImageCreateParams;
use app_server_protocol::MediaTaskArtifactListParams;
use app_server_protocol::MediaTaskArtifactListResponse;
use app_server_protocol::MediaTaskArtifactLookupParams;
use app_server_protocol::MediaTaskArtifactResponse;
use app_server_protocol::MediaTaskArtifactVideoCreateParams;
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
use app_server_protocol::ProjectMaterialContentResponse;
use app_server_protocol::ProjectMaterialCountResponse;
use app_server_protocol::ProjectMaterialDeleteResponse;
use app_server_protocol::ProjectMaterialImportFromUrlParams;
use app_server_protocol::ProjectMaterialListParams;
use app_server_protocol::ProjectMaterialListResponse;
use app_server_protocol::ProjectMaterialLookupParams;
use app_server_protocol::ProjectMaterialResponse;
use app_server_protocol::ProjectMaterialUpdateParams;
use app_server_protocol::ProjectMaterialUploadParams;
use app_server_protocol::ProjectMemoryReadParams;
use app_server_protocol::ProjectMemoryReadResponse;
use app_server_protocol::SessionFileEntryResponse;
use app_server_protocol::SessionFileGetOrCreateParams;
use app_server_protocol::SessionFileIdParams;
use app_server_protocol::SessionFileListResponse;
use app_server_protocol::SessionFileMetaResponse;
use app_server_protocol::SessionFileMutationResponse;
use app_server_protocol::SessionFileReadResponse;
use app_server_protocol::SessionFileResolvePathResponse;
use app_server_protocol::SessionFileSaveParams;
use app_server_protocol::SessionFileUpdateMetaParams;
use app_server_protocol::SkillDownloadInstallParams;
use app_server_protocol::SkillDownloadInstallResponse;
use app_server_protocol::SkillInstalledDirectoriesListResponse;
use app_server_protocol::SkillListResponse;
use app_server_protocol::SkillLocalDetailInspectParams;
use app_server_protocol::SkillLocalDetailInspectResponse;
use app_server_protocol::SkillLocalImportParams;
use app_server_protocol::SkillLocalImportResponse;
use app_server_protocol::SkillLocalInspectParams;
use app_server_protocol::SkillLocalInspectResponse;
use app_server_protocol::SkillLocalRenameParams;
use app_server_protocol::SkillLocalRenameResponse;
use app_server_protocol::SkillManagementInstallParams;
use app_server_protocol::SkillManagementListParams;
use app_server_protocol::SkillManagementUninstallParams;
use app_server_protocol::SkillManagementWriteResponse;
use app_server_protocol::SkillMarketplaceInstallParams;
use app_server_protocol::SkillMarketplaceInstallResponse;
use app_server_protocol::SkillPackageExportParams;
use app_server_protocol::SkillPackageExportResponse;
use app_server_protocol::SkillPackageLocalInspectParams;
use app_server_protocol::SkillPackageLocalInspectResponse;
use app_server_protocol::SkillPackageLocalInstallParams;
use app_server_protocol::SkillPackageLocalInstallResponse;
use app_server_protocol::SkillPackageLocalReplaceParams;
use app_server_protocol::SkillPackageLocalReplaceResponse;
use app_server_protocol::SkillReadParams;
use app_server_protocol::SkillReadResponse;
use app_server_protocol::SkillRemoteInspectParams;
use app_server_protocol::SkillRemoteInspectResponse;
use app_server_protocol::SkillRepositoryDeleteParams;
use app_server_protocol::SkillRepositoryListResponse;
use app_server_protocol::SkillRepositorySaveParams;
use app_server_protocol::SkillScaffoldCreateParams;
use app_server_protocol::SkillScaffoldCreateResponse;
use app_server_protocol::SupportBundleExportResponse;
use app_server_protocol::UnifiedMemoryAnalysisResponse;
use app_server_protocol::UnifiedMemoryAnalyzeParams;
use app_server_protocol::UnifiedMemoryCreateParams;
use app_server_protocol::UnifiedMemoryDeleteParams;
use app_server_protocol::UnifiedMemoryDeleteResponse;
use app_server_protocol::UnifiedMemoryGetParams;
use app_server_protocol::UnifiedMemoryGetResponse;
use app_server_protocol::UnifiedMemoryHybridSearchParams;
use app_server_protocol::UnifiedMemoryListParams;
use app_server_protocol::UnifiedMemoryListResponse;
use app_server_protocol::UnifiedMemorySearchParams;
use app_server_protocol::UnifiedMemorySemanticSearchParams;
use app_server_protocol::UnifiedMemoryStatsResponse;
use app_server_protocol::UnifiedMemoryUpdateParams;
use app_server_protocol::UnifiedMemoryWriteResponse;
use app_server_protocol::UsageStatsDailyTrendsListResponse;
use app_server_protocol::UsageStatsModelRankingListResponse;
use app_server_protocol::UsageStatsRangeParams;
use app_server_protocol::UsageStatsReadResponse;
use app_server_protocol::VoiceAsrCredentialCreateParams;
use app_server_protocol::VoiceAsrCredentialIdParams;
use app_server_protocol::VoiceAsrCredentialListResponse;
use app_server_protocol::VoiceAsrCredentialMutationResponse;
use app_server_protocol::VoiceAsrCredentialTestResponse;
use app_server_protocol::VoiceAsrCredentialUpdateParams;
use app_server_protocol::VoiceAsrCredentialWriteResponse;
use app_server_protocol::VoiceInstructionIdParams;
use app_server_protocol::VoiceInstructionListResponse;
use app_server_protocol::VoiceInstructionMutationResponse;
use app_server_protocol::VoiceInstructionSaveParams;
use app_server_protocol::VoiceModelDefaultSetParams;
use app_server_protocol::VoiceModelDefaultSetResponse;
use app_server_protocol::VoiceModelTestTranscribeFileParams;
use app_server_protocol::VoiceModelTestTranscribeFileResponse;
use app_server_protocol::WechatChannelAccountListResponse;
use app_server_protocol::WechatChannelAccountRemoveParams;
use app_server_protocol::WechatChannelAccountRemoveResponse;
use app_server_protocol::WechatLoginStartParams;
use app_server_protocol::WechatLoginStartResponse;
use app_server_protocol::WechatLoginWaitParams;
use app_server_protocol::WechatLoginWaitResponse;
use app_server_protocol::WechatRuntimeModelSetParams;
use app_server_protocol::WechatRuntimeModelSetResponse;
use app_server_protocol::WindowsStartupDiagnosticsResponse;
use app_server_protocol::WorkspaceDeleteParams;
use app_server_protocol::WorkspaceDeleteResponse;
use app_server_protocol::WorkspaceEnsureParams;
use app_server_protocol::WorkspaceEnsureProjectParams;
use app_server_protocol::WorkspaceEnsureProjectResponse;
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
use app_server_protocol::WorkspaceUpdateParams;
use app_server_protocol::WorkspaceUpdateResponse;
use async_trait::async_trait;
use lime_agent::initialize_aster_runtime;
use lime_agent::AsterAgentState;
use lime_core::config::load_config;
use lime_core::database;
use lime_core::database::DbConnection;
use lime_core::logger;
use lime_gateway::discord::DiscordGatewayState;
use lime_gateway::feishu::FeishuGatewayState;
use lime_gateway::telegram::TelegramGatewayState;
use lime_gateway::tunnel::GatewayTunnelState;
use lime_gateway::wechat::WechatGatewayState;
use lime_gateway::wechat::WechatLoginState;
use lime_mcp::McpClientManager;
use lime_mcp::McpManagerState;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use lime_services::model_registry_service::ModelRegistryService;
use lime_services::skill_service::SkillService;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

pub struct LocalAppDataSource {
    db: DbConnection,
    logs: std::sync::Arc<tokio::sync::RwLock<lime_core::logger::LogStore>>,
    aster_agent_state: AsterAgentState,
    api_key_provider_service: ApiKeyProviderService,
    model_registry_service: ModelRegistryService,
    mcp_manager: McpManagerState,
    telegram_gateway_state: TelegramGatewayState,
    feishu_gateway_state: FeishuGatewayState,
    discord_gateway_state: DiscordGatewayState,
    wechat_gateway_state: WechatGatewayState,
    gateway_tunnel_state: GatewayTunnelState,
    wechat_login_state: WechatLoginState,
}

impl LocalAppDataSource {
    pub async fn initialize() -> Result<Self, String> {
        let db = database::init_database()?;
        Self::initialize_with_db(db).await
    }

    pub async fn initialize_with_db(db: DbConnection) -> Result<Self, String> {
        unified_memory::ensure_unified_memory_schema(&db)?;
        initialize_aster_runtime(db.clone())
            .map_err(|error| format!("初始化 App Server Channels Aster runtime 失败: {error}"))?;
        let config = load_config().map_err(|error| error.to_string())?;
        let logs = std::sync::Arc::new(tokio::sync::RwLock::new(
            logger::create_log_store_from_config(&config.logging),
        ));
        let api_key_provider_service = ApiKeyProviderService::new();
        let model_registry_service = ModelRegistryService::new(db.clone());
        model_registry_service.initialize().await?;
        let gateway_tunnel_state = GatewayTunnelState::default();
        gateway_tunnel::spawn_gateway_tunnel_daemon(gateway_tunnel_state.clone(), logs.clone());
        Ok(Self {
            db,
            logs,
            aster_agent_state: AsterAgentState::new(),
            api_key_provider_service,
            model_registry_service,
            mcp_manager: Arc::new(TokioMutex::new(McpClientManager::new(None))),
            telegram_gateway_state: TelegramGatewayState::default(),
            feishu_gateway_state: FeishuGatewayState::default(),
            discord_gateway_state: DiscordGatewayState::default(),
            wechat_gateway_state: WechatGatewayState::default(),
            gateway_tunnel_state,
            wechat_login_state: WechatLoginState::default(),
        })
    }
}

#[async_trait]
impl AppDataSource for LocalAppDataSource {
    async fn list_current_timeline_sessions(
        &self,
        params: AgentSessionListParams,
    ) -> Result<AgentSessionListResponse, RuntimeCoreError> {
        current_timeline::list_current_timeline_sessions(&self.db, params)
    }

    async fn read_current_timeline_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError> {
        current_timeline::read_current_timeline_session(&self.db, params)
    }

    async fn update_current_timeline_session(
        &self,
        params: AgentSessionUpdateParams,
    ) -> Result<AgentSessionUpdateResponse, RuntimeCoreError> {
        current_timeline::update_current_timeline_session(&self.db, params)
    }

    async fn archive_many_current_timeline_sessions(
        &self,
        params: AgentSessionArchiveManyParams,
    ) -> Result<AgentSessionArchiveManyResponse, RuntimeCoreError> {
        current_timeline::archive_many_current_timeline_sessions(&self.db, params)
    }

    async fn read_agent_session_objective(
        &self,
        params: AgentSessionObjectiveReadParams,
    ) -> Result<AgentSessionObjectiveReadResponse, RuntimeCoreError> {
        session_objectives::read_agent_session_objective(&self.db, params)
    }

    async fn set_agent_session_objective(
        &self,
        params: AgentSessionObjectiveSetParams,
    ) -> Result<AgentSessionObjectiveSetResponse, RuntimeCoreError> {
        session_objectives::set_agent_session_objective(&self.db, params)
    }

    async fn update_agent_session_objective_status(
        &self,
        params: AgentSessionObjectiveStatusUpdateParams,
    ) -> Result<AgentSessionObjectiveStatusUpdateResponse, RuntimeCoreError> {
        session_objectives::update_agent_session_objective_status(&self.db, params)
    }

    async fn clear_agent_session_objective(
        &self,
        params: AgentSessionObjectiveClearParams,
    ) -> Result<AgentSessionObjectiveClearResponse, RuntimeCoreError> {
        session_objectives::clear_agent_session_objective(&self.db, params)
    }

    async fn read_managed_objective_by_owner(
        &self,
        owner_kind: String,
        owner_id: String,
    ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
        session_objectives::read_managed_objective_by_owner(&self.db, owner_kind, owner_id)
    }

    async fn audit_agent_session_objective(
        &self,
        owner_kind: String,
        owner_id: String,
        update: ManagedObjectiveAuditUpdate,
    ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
        session_objectives::audit_agent_session_objective(&self.db, owner_kind, owner_id, update)
    }

    async fn get_or_create_session_file(
        &self,
        params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        session_files::get_or_create_session_file(params).await
    }

    async fn update_session_file_meta(
        &self,
        params: SessionFileUpdateMetaParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        session_files::update_session_file_meta(params).await
    }

    async fn save_session_file(
        &self,
        params: SessionFileSaveParams,
    ) -> Result<SessionFileEntryResponse, RuntimeCoreError> {
        session_files::save_session_file(params).await
    }

    async fn read_session_file(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileReadResponse, RuntimeCoreError> {
        session_files::read_session_file(params).await
    }

    async fn resolve_session_file_path(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileResolvePathResponse, RuntimeCoreError> {
        session_files::resolve_session_file_path(params).await
    }

    async fn delete_session_file(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileMutationResponse, RuntimeCoreError> {
        session_files::delete_session_file(params).await
    }

    async fn list_session_files(
        &self,
        params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileListResponse, RuntimeCoreError> {
        session_files::list_session_files(params).await
    }

    async fn list_workspaces(&self) -> Result<WorkspaceListResponse, RuntimeCoreError> {
        workspaces::list_workspaces(&self.db)
    }

    async fn read_workspace(
        &self,
        params: WorkspaceReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        workspaces::read_workspace(&self.db, params)
    }

    async fn update_workspace(
        &self,
        params: WorkspaceUpdateParams,
    ) -> Result<WorkspaceUpdateResponse, RuntimeCoreError> {
        workspaces::update_workspace(&self.db, params)
    }

    async fn delete_workspace(
        &self,
        params: WorkspaceDeleteParams,
    ) -> Result<WorkspaceDeleteResponse, RuntimeCoreError> {
        workspaces::delete_workspace(&self.db, params)
    }

    async fn read_workspace_by_path(
        &self,
        params: WorkspacePathReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        workspaces::read_workspace_by_path(&self.db, params)
    }

    async fn ensure_project_workspace(
        &self,
        params: WorkspaceEnsureProjectParams,
    ) -> Result<WorkspaceEnsureProjectResponse, RuntimeCoreError> {
        workspaces::ensure_project_workspace(&self.db, params)
    }

    async fn read_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        workspaces::read_default_workspace(&self.db)
    }

    async fn ensure_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        workspaces::ensure_default_workspace(&self.db)
    }

    async fn ensure_workspace_ready(
        &self,
        params: WorkspaceEnsureParams,
    ) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError> {
        workspaces::ensure_workspace_ready(&self.db, params)
    }

    async fn read_workspace_projects_root(
        &self,
    ) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError> {
        workspaces::read_workspace_projects_root()
    }

    async fn resolve_workspace_project_path(
        &self,
        params: WorkspaceProjectPathResolveParams,
    ) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError> {
        workspaces::resolve_workspace_project_path(params)
    }

    async fn list_skills(&self) -> Result<SkillListResponse, RuntimeCoreError> {
        Ok(skills::catalog::list_skills())
    }

    async fn read_skill(
        &self,
        params: SkillReadParams,
    ) -> Result<SkillReadResponse, RuntimeCoreError> {
        skills::catalog::read_skill(params).map_err(data_error)
    }

    async fn list_management_skills(
        &self,
        params: SkillManagementListParams,
    ) -> Result<SkillListResponse, RuntimeCoreError> {
        skills::management::list_management_skills(self.db.clone(), params)
            .await
            .map_err(data_error)
    }

    async fn install_management_skill(
        &self,
        params: SkillManagementInstallParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        skills::management::install_management_skill(self.db.clone(), params)
            .await
            .map_err(data_error)
    }

    async fn uninstall_management_skill(
        &self,
        params: SkillManagementUninstallParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        skills::management::uninstall_management_skill(self.db.clone(), params).map_err(data_error)
    }

    async fn list_skill_repositories(
        &self,
    ) -> Result<SkillRepositoryListResponse, RuntimeCoreError> {
        skills::management::list_skill_repositories(self.db.clone()).map_err(data_error)
    }

    async fn save_skill_repository(
        &self,
        params: SkillRepositorySaveParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        skills::management::save_skill_repository(self.db.clone(), params).map_err(data_error)
    }

    async fn delete_skill_repository(
        &self,
        params: SkillRepositoryDeleteParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        skills::management::delete_skill_repository(self.db.clone(), params).map_err(data_error)
    }

    async fn refresh_skill_cache(&self) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        SkillService::new()
            .map_err(|error| data_error(error.to_string()))?
            .refresh_cache();
        Ok(SkillManagementWriteResponse { success: true })
    }

    async fn list_installed_skill_directories(
        &self,
    ) -> Result<SkillInstalledDirectoriesListResponse, RuntimeCoreError> {
        skills::local::list_installed_skill_directories().map_err(data_error)
    }

    async fn inspect_local_skill(
        &self,
        params: SkillLocalInspectParams,
    ) -> Result<SkillLocalInspectResponse, RuntimeCoreError> {
        skills::local::inspect_local_skill(params).map_err(data_error)
    }

    async fn inspect_local_skill_detail(
        &self,
        params: SkillLocalDetailInspectParams,
    ) -> Result<SkillLocalDetailInspectResponse, RuntimeCoreError> {
        skills::package::inspect_local_skill_detail(params).map_err(data_error)
    }

    async fn create_skill_scaffold(
        &self,
        params: SkillScaffoldCreateParams,
    ) -> Result<SkillScaffoldCreateResponse, RuntimeCoreError> {
        skills::local::create_skill_scaffold(params).map_err(data_error)
    }

    async fn import_local_skill(
        &self,
        params: SkillLocalImportParams,
    ) -> Result<SkillLocalImportResponse, RuntimeCoreError> {
        skills::local::import_local_skill(params).map_err(data_error)
    }

    async fn rename_local_skill(
        &self,
        params: SkillLocalRenameParams,
    ) -> Result<SkillLocalRenameResponse, RuntimeCoreError> {
        skills::local::rename_local_skill(params).map_err(data_error)
    }

    async fn inspect_remote_skill(
        &self,
        params: SkillRemoteInspectParams,
    ) -> Result<SkillRemoteInspectResponse, RuntimeCoreError> {
        skills::local::inspect_remote_skill(params)
            .await
            .map_err(data_error)
    }

    async fn inspect_local_skill_package(
        &self,
        params: SkillPackageLocalInspectParams,
    ) -> Result<SkillPackageLocalInspectResponse, RuntimeCoreError> {
        skills::package::inspect_local_skill_package(params).map_err(data_error)
    }

    async fn install_local_skill_package(
        &self,
        params: SkillPackageLocalInstallParams,
    ) -> Result<SkillPackageLocalInstallResponse, RuntimeCoreError> {
        skills::package::install_local_skill_package(params).map_err(data_error)
    }

    async fn replace_local_skill_package(
        &self,
        params: SkillPackageLocalReplaceParams,
    ) -> Result<SkillPackageLocalReplaceResponse, RuntimeCoreError> {
        skills::package::replace_local_skill_package(params).map_err(data_error)
    }

    async fn export_local_skill_package(
        &self,
        params: SkillPackageExportParams,
    ) -> Result<SkillPackageExportResponse, RuntimeCoreError> {
        skills::package::export_local_skill_package(params).map_err(data_error)
    }

    async fn install_marketplace_skill(
        &self,
        params: SkillMarketplaceInstallParams,
    ) -> Result<SkillMarketplaceInstallResponse, RuntimeCoreError> {
        skills::marketplace::install_marketplace_skill(params).map_err(data_error)
    }

    async fn install_skill_from_download_url(
        &self,
        params: SkillDownloadInstallParams,
    ) -> Result<SkillDownloadInstallResponse, RuntimeCoreError> {
        skills::package::install_skill_from_download_url(params)
            .await
            .map_err(data_error)
    }

    async fn start_gateway_channel(
        &self,
        params: GatewayChannelStartParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        channels::start_gateway_channel(
            channels::GatewayChannelStates {
                db: &self.db,
                logs: &self.logs,
                aster_agent_state: &self.aster_agent_state,
                telegram_gateway_state: &self.telegram_gateway_state,
                feishu_gateway_state: &self.feishu_gateway_state,
                discord_gateway_state: &self.discord_gateway_state,
                wechat_gateway_state: &self.wechat_gateway_state,
            },
            params,
        )
        .await
    }

    async fn stop_gateway_channel(
        &self,
        params: GatewayChannelStopParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        channels::stop_gateway_channel(
            channels::GatewayChannelStates {
                db: &self.db,
                logs: &self.logs,
                aster_agent_state: &self.aster_agent_state,
                telegram_gateway_state: &self.telegram_gateway_state,
                feishu_gateway_state: &self.feishu_gateway_state,
                discord_gateway_state: &self.discord_gateway_state,
                wechat_gateway_state: &self.wechat_gateway_state,
            },
            params,
        )
        .await
    }

    async fn read_gateway_channel_status(
        &self,
        params: GatewayChannelStatusParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        channels::read_gateway_channel_status(
            channels::GatewayChannelStates {
                db: &self.db,
                logs: &self.logs,
                aster_agent_state: &self.aster_agent_state,
                telegram_gateway_state: &self.telegram_gateway_state,
                feishu_gateway_state: &self.feishu_gateway_state,
                discord_gateway_state: &self.discord_gateway_state,
                wechat_gateway_state: &self.wechat_gateway_state,
            },
            params,
        )
        .await
    }

    async fn probe_gateway_tunnel(&self) -> Result<GatewayTunnelProbeResponse, RuntimeCoreError> {
        channels::probe_gateway_tunnel().await
    }

    async fn detect_gateway_tunnel_cloudflared(
        &self,
    ) -> Result<GatewayTunnelCloudflaredDetectResponse, RuntimeCoreError> {
        channels::detect_gateway_tunnel_cloudflared().await
    }

    async fn install_gateway_tunnel_cloudflared(
        &self,
        params: GatewayTunnelCloudflaredInstallParams,
    ) -> Result<GatewayTunnelCloudflaredInstallResponse, RuntimeCoreError> {
        channels::install_gateway_tunnel_cloudflared(params).await
    }

    async fn create_gateway_tunnel(
        &self,
        params: GatewayTunnelCreateParams,
    ) -> Result<GatewayTunnelCreateResponse, RuntimeCoreError> {
        channels::create_gateway_tunnel(&self.gateway_tunnel_state, self.logs.clone(), params).await
    }

    async fn start_gateway_tunnel(&self) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        channels::start_gateway_tunnel(&self.gateway_tunnel_state, self.logs.clone()).await
    }

    async fn stop_gateway_tunnel(&self) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        channels::stop_gateway_tunnel(&self.gateway_tunnel_state, self.logs.clone()).await
    }

    async fn restart_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        channels::restart_gateway_tunnel(&self.gateway_tunnel_state, self.logs.clone()).await
    }

    async fn read_gateway_tunnel_status(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        channels::read_gateway_tunnel_status(&self.gateway_tunnel_state, self.logs.clone()).await
    }

    async fn sync_gateway_tunnel_webhook_url(
        &self,
        params: GatewayTunnelSyncWebhookUrlParams,
    ) -> Result<GatewayTunnelSyncWebhookUrlResponse, RuntimeCoreError> {
        channels::sync_gateway_tunnel_webhook_url(params).await
    }

    async fn probe_telegram_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        channels::probe_telegram_channel(params).await
    }

    async fn probe_feishu_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        channels::probe_feishu_channel(params).await
    }

    async fn probe_discord_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        channels::probe_discord_channel(params).await
    }

    async fn probe_wechat_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        channels::probe_wechat_channel(params).await
    }

    async fn start_wechat_channel_login(
        &self,
        params: WechatLoginStartParams,
    ) -> Result<WechatLoginStartResponse, RuntimeCoreError> {
        channels::start_wechat_channel_login(&self.wechat_login_state, &self.logs, params).await
    }

    async fn wait_wechat_channel_login(
        &self,
        params: WechatLoginWaitParams,
    ) -> Result<WechatLoginWaitResponse, RuntimeCoreError> {
        channels::wait_wechat_channel_login(
            channels::WechatLoginRuntime {
                db: &self.db,
                logs: &self.logs,
                aster_agent_state: &self.aster_agent_state,
                wechat_gateway_state: &self.wechat_gateway_state,
                wechat_login_state: &self.wechat_login_state,
            },
            params,
        )
        .await
    }

    async fn list_wechat_channel_accounts(
        &self,
    ) -> Result<WechatChannelAccountListResponse, RuntimeCoreError> {
        channels::list_wechat_channel_accounts()
    }

    async fn remove_wechat_channel_account(
        &self,
        params: WechatChannelAccountRemoveParams,
    ) -> Result<WechatChannelAccountRemoveResponse, RuntimeCoreError> {
        channels::remove_wechat_channel_account(&self.wechat_gateway_state, params).await
    }

    async fn set_wechat_channel_runtime_model(
        &self,
        params: WechatRuntimeModelSetParams,
    ) -> Result<WechatRuntimeModelSetResponse, RuntimeCoreError> {
        channels::set_wechat_channel_runtime_model(&self.logs, params).await
    }

    async fn create_image_media_task_artifact(
        &self,
        params: MediaTaskArtifactImageCreateParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        media_tasks::create_image_media_task_artifact(params).map_err(data_error)
    }

    async fn create_audio_media_task_artifact(
        &self,
        params: MediaTaskArtifactAudioCreateParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        media_tasks::create_audio_media_task_artifact(params).map_err(data_error)
    }

    async fn create_video_media_task_artifact(
        &self,
        params: MediaTaskArtifactVideoCreateParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        media_tasks::create_video_media_task_artifact(params).map_err(data_error)
    }

    async fn complete_audio_media_task_artifact(
        &self,
        params: MediaTaskArtifactAudioCompleteParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        media_tasks::complete_audio_media_task_artifact(params).map_err(data_error)
    }

    async fn get_media_task_artifact(
        &self,
        params: MediaTaskArtifactLookupParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        media_tasks::get_media_task_artifact(params).map_err(data_error)
    }

    async fn list_media_task_artifacts(
        &self,
        params: MediaTaskArtifactListParams,
    ) -> Result<MediaTaskArtifactListResponse, RuntimeCoreError> {
        media_tasks::list_media_task_artifacts(params).map_err(data_error)
    }

    async fn cancel_media_task_artifact(
        &self,
        params: MediaTaskArtifactLookupParams,
    ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
        media_tasks::cancel_media_task_artifact(params).map_err(data_error)
    }

    async fn get_gallery_material(
        &self,
        params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialResponse, RuntimeCoreError> {
        gallery_materials::get_gallery_material(&self.db, params).map_err(data_error)
    }

    async fn create_gallery_material_metadata(
        &self,
        params: GalleryMaterialMetadataCreateParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        gallery_materials::create_gallery_material_metadata(&self.db, params).map_err(data_error)
    }

    async fn get_gallery_material_metadata(
        &self,
        params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        gallery_materials::get_gallery_material_metadata(&self.db, params).map_err(data_error)
    }

    async fn update_gallery_material_metadata(
        &self,
        params: GalleryMaterialMetadataUpdateParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        gallery_materials::update_gallery_material_metadata(&self.db, params).map_err(data_error)
    }

    async fn delete_gallery_material_metadata(
        &self,
        params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialDeleteResponse, RuntimeCoreError> {
        gallery_materials::delete_gallery_material_metadata(&self.db, params).map_err(data_error)
    }

    async fn list_gallery_materials_by_image_category(
        &self,
        params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        gallery_materials::list_gallery_materials_by_image_category(&self.db, params)
            .map_err(data_error)
    }

    async fn list_gallery_materials_by_layout_category(
        &self,
        params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        gallery_materials::list_gallery_materials_by_layout_category(&self.db, params)
            .map_err(data_error)
    }

    async fn list_gallery_materials_by_mood(
        &self,
        params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        gallery_materials::list_gallery_materials_by_mood(&self.db, params).map_err(data_error)
    }

    async fn list_project_materials(
        &self,
        params: ProjectMaterialListParams,
    ) -> Result<ProjectMaterialListResponse, RuntimeCoreError> {
        project_materials::list_project_materials(&self.db, params).map_err(data_error)
    }

    async fn get_project_material(
        &self,
        params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        project_materials::get_project_material(&self.db, params).map_err(data_error)
    }

    async fn count_project_materials(
        &self,
        params: ProjectMaterialListParams,
    ) -> Result<ProjectMaterialCountResponse, RuntimeCoreError> {
        project_materials::count_project_materials(&self.db, params).map_err(data_error)
    }

    async fn upload_project_material(
        &self,
        params: ProjectMaterialUploadParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        project_materials::upload_project_material(&self.db, params).map_err(data_error)
    }

    async fn import_project_material_from_url(
        &self,
        params: ProjectMaterialImportFromUrlParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        project_materials::import_project_material_from_url(&self.db, params)
            .await
            .map_err(data_error)
    }

    async fn update_project_material(
        &self,
        params: ProjectMaterialUpdateParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        project_materials::update_project_material(&self.db, params).map_err(data_error)
    }

    async fn delete_project_material(
        &self,
        params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialDeleteResponse, RuntimeCoreError> {
        project_materials::delete_project_material(&self.db, params).map_err(data_error)
    }

    async fn read_project_material_content(
        &self,
        params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialContentResponse, RuntimeCoreError> {
        project_materials::read_project_material_content(&self.db, params).map_err(data_error)
    }

    async fn list_voice_asr_credentials(
        &self,
    ) -> Result<VoiceAsrCredentialListResponse, RuntimeCoreError> {
        voice_asr_credentials::list_voice_asr_credentials()
    }

    async fn create_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialCreateParams,
    ) -> Result<VoiceAsrCredentialWriteResponse, RuntimeCoreError> {
        voice_asr_credentials::create_voice_asr_credential(params)
    }

    async fn update_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialUpdateParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        voice_asr_credentials::update_voice_asr_credential(params)
    }

    async fn delete_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        voice_asr_credentials::delete_voice_asr_credential(params)
    }

    async fn set_default_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        voice_asr_credentials::set_default_voice_asr_credential(params)
    }

    async fn test_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialTestResponse, RuntimeCoreError> {
        voice_asr_credentials::test_voice_asr_credential(params)
    }

    async fn test_transcribe_voice_model_file(
        &self,
        params: VoiceModelTestTranscribeFileParams,
    ) -> Result<VoiceModelTestTranscribeFileResponse, RuntimeCoreError> {
        voice_asr_credentials::test_transcribe_voice_model_file(params).await
    }

    async fn list_voice_instructions(
        &self,
    ) -> Result<VoiceInstructionListResponse, RuntimeCoreError> {
        voice_instructions::list_voice_instructions()
    }

    async fn save_voice_instruction(
        &self,
        params: VoiceInstructionSaveParams,
    ) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
        voice_instructions::save_voice_instruction(params)
    }

    async fn delete_voice_instruction(
        &self,
        params: VoiceInstructionIdParams,
    ) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
        voice_instructions::delete_voice_instruction(params)
    }

    async fn set_default_voice_model(
        &self,
        params: VoiceModelDefaultSetParams,
    ) -> Result<VoiceModelDefaultSetResponse, RuntimeCoreError> {
        voice_asr_credentials::set_default_voice_model(params)
    }

    async fn list_workspace_skill_bindings(
        &self,
        params: WorkspaceSkillBindingsListParams,
    ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError> {
        Ok(WorkspaceSkillBindingsListResponse {
            bindings: skills::workspace::list_workspace_skill_bindings_value(params)
                .map_err(data_error)?,
        })
    }

    async fn list_workspace_registered_skills(
        &self,
        params: WorkspaceRegisteredSkillsListParams,
    ) -> Result<WorkspaceRegisteredSkillsListResponse, RuntimeCoreError> {
        Ok(WorkspaceRegisteredSkillsListResponse {
            skills: skills::workspace::list_workspace_registered_skills_value(params)
                .map_err(data_error)?,
        })
    }

    async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        agent_apps::list_agent_app_installed_state().map_err(data_error)
    }

    async fn inspect_agent_app_local_package(
        &self,
        params: AgentAppLocalPackageInspectParams,
    ) -> Result<AgentAppLocalPackageInspectResponse, RuntimeCoreError> {
        agent_apps::inspect_agent_app_local_package(params).map_err(data_error)
    }

    async fn fetch_agent_app_cloud_package(
        &self,
        params: AgentAppFetchCloudPackageParams,
    ) -> Result<AgentAppPackageCacheEntry, RuntimeCoreError> {
        agent_apps::fetch_agent_app_cloud_package(params)
            .await
            .map_err(data_error)
    }

    async fn save_agent_app_installed(
        &self,
        params: AgentAppInstalledSaveParams,
    ) -> Result<Value, RuntimeCoreError> {
        agent_apps::save_agent_app_installed_state(params).map_err(data_error)
    }

    async fn set_agent_app_installed_disabled(
        &self,
        params: AgentAppInstalledDisabledSetParams,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        agent_apps::set_agent_app_installed_disabled(params).map_err(data_error)
    }

    async fn preview_agent_app_uninstall(
        &self,
        params: AgentAppUninstallRehearsalParams,
    ) -> Result<AgentAppUninstallRehearsalResponse, RuntimeCoreError> {
        agent_apps::build_agent_app_uninstall_rehearsal(params.app_id, params.mode)
            .map_err(data_error)
    }

    async fn uninstall_agent_app(
        &self,
        params: AgentAppUninstallParams,
    ) -> Result<AgentAppUninstallResponse, RuntimeCoreError> {
        agent_apps::uninstall_agent_app(params).map_err(data_error)
    }

    async fn list_knowledge_packs(
        &self,
        params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
        knowledge::list_knowledge_packs(params)
    }

    async fn read_knowledge_pack(
        &self,
        params: KnowledgeReadPackParams,
    ) -> Result<KnowledgeReadPackResponse, RuntimeCoreError> {
        knowledge::read_knowledge_pack(params)
    }

    async fn import_knowledge_source(
        &self,
        params: KnowledgeImportSourceParams,
    ) -> Result<KnowledgeImportSourceResponse, RuntimeCoreError> {
        knowledge::import_knowledge_source(params)
    }

    async fn compile_knowledge_pack(
        &self,
        request: lime_knowledge::KnowledgeCompilePackRequest,
    ) -> Result<KnowledgeCompilePackResponse, RuntimeCoreError> {
        knowledge::compile_knowledge_pack(request)
    }

    async fn set_default_knowledge_pack(
        &self,
        params: KnowledgeSetDefaultPackParams,
    ) -> Result<KnowledgeSetDefaultPackResponse, RuntimeCoreError> {
        knowledge::set_default_knowledge_pack(params)
    }

    async fn update_knowledge_pack_status(
        &self,
        params: KnowledgeUpdatePackStatusParams,
    ) -> Result<KnowledgeUpdatePackStatusResponse, RuntimeCoreError> {
        knowledge::update_knowledge_pack_status(params)
    }

    async fn resolve_knowledge_context(
        &self,
        params: KnowledgeResolveContextParams,
    ) -> Result<KnowledgeContextResolutionResponse, RuntimeCoreError> {
        knowledge::resolve_knowledge_context(params)
    }

    async fn validate_knowledge_context_run(
        &self,
        params: KnowledgeValidateContextRunParams,
    ) -> Result<KnowledgeValidateContextRunResponse, RuntimeCoreError> {
        knowledge::validate_knowledge_context_run(params)
    }

    async fn list_automation_jobs(&self) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        automation::list_automation_jobs(&self.db)
    }

    async fn list_mcp_servers(&self) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::list_mcp_servers(&self.db)
    }

    async fn list_mcp_servers_with_status(
        &self,
    ) -> Result<McpServerStatusListResponse, RuntimeCoreError> {
        mcp::list_mcp_servers_with_status(&self.db, &self.mcp_manager).await
    }

    async fn create_mcp_server(
        &self,
        params: McpServerCreateParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::create_mcp_server(&self.db, params)
    }

    async fn update_mcp_server(
        &self,
        params: McpServerUpdateParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::update_mcp_server(&self.db, params)
    }

    async fn delete_mcp_server(
        &self,
        params: McpServerDeleteParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::delete_mcp_server(&self.db, params)
    }

    async fn set_mcp_server_enabled(
        &self,
        params: McpServerEnabledSetParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::set_mcp_server_enabled(&self.db, params)
    }

    async fn import_mcp_servers_from_app(
        &self,
        params: McpServerImportFromAppParams,
    ) -> Result<McpServerImportFromAppResponse, RuntimeCoreError> {
        mcp::import_mcp_servers_from_app(&self.db, params)
    }

    async fn sync_all_mcp_servers_to_live(
        &self,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::sync_all_mcp_servers_to_live(&self.db)
    }

    async fn start_mcp_server(
        &self,
        params: McpServerStartParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        mcp::start_mcp_server(&self.db, &self.mcp_manager, params).await
    }

    async fn stop_mcp_server(
        &self,
        params: McpServerStopParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        mcp::stop_mcp_server(&self.mcp_manager, params).await
    }

    async fn list_mcp_tools(&self) -> Result<McpToolListResponse, RuntimeCoreError> {
        mcp::list_mcp_tools(&self.mcp_manager).await
    }

    async fn list_mcp_tools_for_context(
        &self,
        params: McpToolListForContextParams,
    ) -> Result<McpToolListResponse, RuntimeCoreError> {
        mcp::list_mcp_tools_for_context(&self.mcp_manager, params).await
    }

    async fn search_mcp_tools(
        &self,
        params: McpToolSearchParams,
    ) -> Result<McpToolListResponse, RuntimeCoreError> {
        mcp::search_mcp_tools(&self.mcp_manager, params).await
    }

    async fn call_mcp_tool(
        &self,
        params: McpToolCallParams,
    ) -> Result<McpToolCallResponse, RuntimeCoreError> {
        mcp::call_mcp_tool(&self.mcp_manager, params).await
    }

    async fn call_mcp_tool_with_caller(
        &self,
        params: McpToolCallWithCallerParams,
    ) -> Result<McpToolCallResponse, RuntimeCoreError> {
        mcp::call_mcp_tool_with_caller(&self.mcp_manager, params).await
    }

    async fn list_mcp_prompts(&self) -> Result<McpPromptListResponse, RuntimeCoreError> {
        mcp::list_mcp_prompts(&self.mcp_manager).await
    }

    async fn get_mcp_prompt(
        &self,
        params: McpPromptGetParams,
    ) -> Result<McpPromptGetResponse, RuntimeCoreError> {
        mcp::get_mcp_prompt(&self.mcp_manager, params).await
    }

    async fn list_mcp_resources(&self) -> Result<McpResourceListResponse, RuntimeCoreError> {
        mcp::list_mcp_resources(&self.mcp_manager).await
    }

    async fn read_mcp_resource(
        &self,
        params: McpResourceReadParams,
    ) -> Result<McpResourceReadResponse, RuntimeCoreError> {
        mcp::read_mcp_resource(&self.mcp_manager, params).await
    }

    async fn read_automation_scheduler_config(
        &self,
    ) -> Result<AutomationSchedulerConfigReadResponse, RuntimeCoreError> {
        automation::read_automation_scheduler_config()
    }

    async fn update_automation_scheduler_config(
        &self,
        params: AutomationSchedulerConfigUpdateParams,
    ) -> Result<AutomationSchedulerConfigUpdateResponse, RuntimeCoreError> {
        automation::update_automation_scheduler_config(params)
    }

    async fn read_automation_scheduler_status(
        &self,
    ) -> Result<AutomationSchedulerStatusResponse, RuntimeCoreError> {
        automation::read_automation_scheduler_status()
    }

    async fn read_automation_job(
        &self,
        params: AutomationJobIdParams,
    ) -> Result<AutomationJobReadResponse, RuntimeCoreError> {
        automation::read_automation_job(&self.db, params)
    }

    async fn create_automation_job(
        &self,
        params: AutomationJobCreateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        automation::create_automation_job(&self.db, params)
    }

    async fn update_automation_job(
        &self,
        params: AutomationJobUpdateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        automation::update_automation_job(&self.db, params)
    }

    async fn delete_automation_job(
        &self,
        params: AutomationJobIdParams,
    ) -> Result<AutomationJobDeleteResponse, RuntimeCoreError> {
        automation::delete_automation_job(&self.db, params)
    }

    async fn run_automation_job_now(
        &self,
        params: AutomationJobIdParams,
    ) -> Result<AutomationJobRunNowResponse, RuntimeCoreError> {
        automation::run_automation_job_now(params)
    }

    async fn read_automation_health(
        &self,
        params: AutomationJobHealthParams,
    ) -> Result<AutomationJobHealthResponse, RuntimeCoreError> {
        automation::read_automation_health(&self.db, params)
    }

    async fn read_automation_run_history(
        &self,
        params: AutomationJobRunHistoryParams,
    ) -> Result<AutomationJobRunHistoryResponse, RuntimeCoreError> {
        automation::read_automation_run_history(&self.db, params)
    }

    async fn preview_automation_schedule(
        &self,
        params: AutomationScheduleParams,
    ) -> Result<AutomationSchedulePreviewResponse, RuntimeCoreError> {
        automation::preview_automation_schedule(params)
    }

    async fn validate_automation_schedule(
        &self,
        params: AutomationScheduleParams,
    ) -> Result<AutomationScheduleValidateResponse, RuntimeCoreError> {
        automation::validate_automation_schedule(params)
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

    async fn list_unified_memories(
        &self,
        params: UnifiedMemoryListParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        unified_memory::list_unified_memories(&self.db, params).map_err(data_error)
    }

    async fn get_unified_memory(
        &self,
        params: UnifiedMemoryGetParams,
    ) -> Result<UnifiedMemoryGetResponse, RuntimeCoreError> {
        unified_memory::get_unified_memory(&self.db, params).map_err(data_error)
    }

    async fn create_unified_memory(
        &self,
        params: UnifiedMemoryCreateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        unified_memory::create_unified_memory(&self.db, params).map_err(data_error)
    }

    async fn update_unified_memory(
        &self,
        params: UnifiedMemoryUpdateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        unified_memory::update_unified_memory(&self.db, params).map_err(data_error)
    }

    async fn delete_unified_memory(
        &self,
        params: UnifiedMemoryDeleteParams,
    ) -> Result<UnifiedMemoryDeleteResponse, RuntimeCoreError> {
        unified_memory::delete_unified_memory(&self.db, params).map_err(data_error)
    }

    async fn search_unified_memories(
        &self,
        params: UnifiedMemorySearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        unified_memory::search_unified_memories(&self.db, params).map_err(data_error)
    }

    async fn read_unified_memory_stats(
        &self,
    ) -> Result<UnifiedMemoryStatsResponse, RuntimeCoreError> {
        unified_memory::read_unified_memory_stats(&self.db).map_err(data_error)
    }

    async fn analyze_unified_memories(
        &self,
        params: UnifiedMemoryAnalyzeParams,
    ) -> Result<UnifiedMemoryAnalysisResponse, RuntimeCoreError> {
        unified_memory::analyze_unified_memories(params).map_err(data_error)
    }

    async fn semantic_search_unified_memories(
        &self,
        params: UnifiedMemorySemanticSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        unified_memory::semantic_search_unified_memories(params).map_err(data_error)
    }

    async fn hybrid_search_unified_memories(
        &self,
        params: UnifiedMemoryHybridSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        unified_memory::hybrid_search_unified_memories(params).map_err(data_error)
    }

    async fn list_logs(&self) -> Result<LogListResponse, RuntimeCoreError> {
        Ok(LogListResponse {
            entries: diagnostics::read_persisted_logs_tail(1_000).map_err(data_error)?,
        })
    }

    async fn read_persisted_log_tail(
        &self,
        params: LogPersistedTailParams,
    ) -> Result<LogPersistedTailResponse, RuntimeCoreError> {
        let limit = params.lines.unwrap_or(200).clamp(20, 1_000);
        Ok(LogPersistedTailResponse {
            entries: diagnostics::read_persisted_logs_tail(limit).map_err(data_error)?,
        })
    }

    async fn clear_logs(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        diagnostics::clear_persisted_log_artifacts().map_err(data_error)?;
        Ok(LogClearResponse { cleared: true })
    }

    async fn clear_diagnostic_log_history(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        diagnostics::clear_diagnostic_log_artifacts().map_err(data_error)?;
        Ok(LogClearResponse { cleared: true })
    }

    async fn read_log_storage_diagnostics(
        &self,
    ) -> Result<LogStorageDiagnosticsResponse, RuntimeCoreError> {
        Ok(diagnostics::read_log_storage_diagnostics().map_err(data_error)?)
    }

    async fn export_support_bundle(&self) -> Result<SupportBundleExportResponse, RuntimeCoreError> {
        diagnostics::export_support_bundle().map_err(data_error)
    }

    async fn read_windows_startup_diagnostics(
        &self,
    ) -> Result<WindowsStartupDiagnosticsResponse, RuntimeCoreError> {
        diagnostics::read_windows_startup_diagnostics().map_err(data_error)
    }

    async fn read_usage_stats(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsReadResponse, RuntimeCoreError> {
        usage_stats::read_usage_stats(&self.db, params).map_err(data_error)
    }

    async fn list_usage_stats_model_ranking(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsModelRankingListResponse, RuntimeCoreError> {
        usage_stats::list_usage_stats_model_ranking(&self.db, params).map_err(data_error)
    }

    async fn list_usage_stats_daily_trends(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsDailyTrendsListResponse, RuntimeCoreError> {
        usage_stats::list_usage_stats_daily_trends(&self.db, params).map_err(data_error)
    }

    async fn list_models(
        &self,
        params: ModelListParams,
    ) -> Result<ModelListResponse, RuntimeCoreError> {
        model_providers::list_models(&self.model_registry_service, params).await
    }

    async fn list_model_preferences(
        &self,
    ) -> Result<ModelPreferencesListResponse, RuntimeCoreError> {
        model_providers::list_model_preferences(&self.model_registry_service).await
    }

    async fn read_model_sync_state(&self) -> Result<ModelSyncStateReadResponse, RuntimeCoreError> {
        model_providers::read_model_sync_state(&self.model_registry_service).await
    }

    async fn list_model_providers(&self) -> Result<ModelProviderListResponse, RuntimeCoreError> {
        model_providers::list_model_providers(&self.db, &self.api_key_provider_service)
    }

    async fn list_model_provider_catalog(
        &self,
    ) -> Result<ModelProviderCatalogListResponse, RuntimeCoreError> {
        model_providers::list_model_provider_catalog()
    }

    async fn read_model_provider(
        &self,
        params: ModelProviderReadParams,
    ) -> Result<ModelProviderReadResponse, RuntimeCoreError> {
        model_providers::read_model_provider(&self.db, &self.api_key_provider_service, params)
    }

    async fn create_model_provider(
        &self,
        params: ModelProviderCreateParams,
    ) -> Result<ModelProviderWriteResponse, RuntimeCoreError> {
        model_providers::create_model_provider(&self.db, &self.api_key_provider_service, params)
    }

    async fn update_model_provider(
        &self,
        params: ModelProviderUpdateParams,
    ) -> Result<ModelProviderWriteResponse, RuntimeCoreError> {
        model_providers::update_model_provider(&self.db, &self.api_key_provider_service, params)
    }

    async fn delete_model_provider(
        &self,
        params: ModelProviderDeleteParams,
    ) -> Result<ModelProviderDeleteResponse, RuntimeCoreError> {
        model_providers::delete_model_provider(&self.db, &self.api_key_provider_service, params)
    }

    async fn update_model_provider_sort_orders(
        &self,
        params: ModelProviderSortOrdersUpdateParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        model_providers::update_model_provider_sort_orders(
            &self.db,
            &self.api_key_provider_service,
            params,
        )
    }

    async fn export_model_provider_config(
        &self,
        params: ModelProviderConfigExportParams,
    ) -> Result<ModelProviderConfigExportResponse, RuntimeCoreError> {
        model_providers::export_model_provider_config(
            &self.db,
            &self.api_key_provider_service,
            params,
        )
    }

    async fn import_model_provider_config(
        &self,
        params: ModelProviderConfigImportParams,
    ) -> Result<ModelProviderConfigImportResponse, RuntimeCoreError> {
        model_providers::import_model_provider_config(
            &self.db,
            &self.api_key_provider_service,
            params,
        )
    }

    async fn test_model_provider_connection(
        &self,
        params: ModelProviderTestConnectionParams,
    ) -> Result<ModelProviderTestConnectionResponse, RuntimeCoreError> {
        model_providers::test_model_provider_connection(
            &self.db,
            &self.api_key_provider_service,
            params,
        )
        .await
    }

    async fn test_model_provider_chat(
        &self,
        params: ModelProviderTestChatParams,
    ) -> Result<ModelProviderTestChatResponse, RuntimeCoreError> {
        model_providers::test_model_provider_chat(&self.db, &self.api_key_provider_service, params)
            .await
    }

    async fn fetch_model_provider_models(
        &self,
        params: ModelProviderFetchModelsParams,
    ) -> Result<ModelProviderFetchModelsResponse, RuntimeCoreError> {
        model_providers::fetch_model_provider_models(
            &self.db,
            &self.api_key_provider_service,
            &self.model_registry_service,
            params,
        )
        .await
    }

    async fn create_model_provider_key(
        &self,
        params: ModelProviderKeyCreateParams,
    ) -> Result<ModelProviderKeyWriteResponse, RuntimeCoreError> {
        model_providers::create_model_provider_key(&self.db, &self.api_key_provider_service, params)
    }

    async fn update_model_provider_key(
        &self,
        params: ModelProviderKeyUpdateParams,
    ) -> Result<ModelProviderKeyWriteResponse, RuntimeCoreError> {
        model_providers::update_model_provider_key(&self.db, &self.api_key_provider_service, params)
    }

    async fn delete_model_provider_key(
        &self,
        params: ModelProviderKeyDeleteParams,
    ) -> Result<ModelProviderKeyDeleteResponse, RuntimeCoreError> {
        model_providers::delete_model_provider_key(&self.db, &self.api_key_provider_service, params)
    }

    async fn read_next_model_provider_key(
        &self,
        params: ModelProviderKeyNextParams,
    ) -> Result<ModelProviderKeyNextResponse, RuntimeCoreError> {
        model_providers::read_next_model_provider_key(
            &self.db,
            &self.api_key_provider_service,
            params,
        )
    }

    async fn record_model_provider_key_usage(
        &self,
        params: ModelProviderKeyEventParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        model_providers::record_model_provider_key_usage(
            &self.db,
            &self.api_key_provider_service,
            params,
        )
    }

    async fn record_model_provider_key_error(
        &self,
        params: ModelProviderKeyEventParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        model_providers::record_model_provider_key_error(
            &self.db,
            &self.api_key_provider_service,
            params,
        )
    }

    async fn read_model_provider_ui_state(
        &self,
        params: ModelProviderUiStateReadParams,
    ) -> Result<ModelProviderUiStateReadResponse, RuntimeCoreError> {
        model_providers::read_model_provider_ui_state(
            &self.db,
            &self.api_key_provider_service,
            params,
        )
    }

    async fn write_model_provider_ui_state(
        &self,
        params: ModelProviderUiStateWriteParams,
    ) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
        model_providers::write_model_provider_ui_state(
            &self.db,
            &self.api_key_provider_service,
            params,
        )
    }

    async fn read_model_provider_alias(
        &self,
        params: ModelProviderAliasReadParams,
    ) -> Result<ModelProviderAliasReadResponse, RuntimeCoreError> {
        model_providers::read_model_provider_alias(&self.model_registry_service, params).await
    }

    async fn list_model_provider_aliases(
        &self,
    ) -> Result<ModelProviderAliasListResponse, RuntimeCoreError> {
        model_providers::list_model_provider_aliases(&self.model_registry_service).await
    }

    async fn resolve_connect_deep_link(
        &self,
        params: ConnectDeepLinkResolveParams,
    ) -> Result<ConnectDeepLinkResolveResponse, RuntimeCoreError> {
        connect::resolve_deep_link(params).await
    }

    async fn resolve_connect_open_deep_link(
        &self,
        params: ConnectOpenDeepLinkResolveParams,
    ) -> Result<ConnectOpenDeepLinkResolveResponse, RuntimeCoreError> {
        connect::resolve_open_deep_link(params)
    }

    async fn save_connect_relay_api_key(
        &self,
        params: ConnectRelayApiKeySaveParams,
    ) -> Result<ConnectRelayApiKeySaveResponse, RuntimeCoreError> {
        connect::save_relay_api_key(&self.db, &self.api_key_provider_service, params).await
    }

    async fn deliver_connect_callback(
        &self,
        params: ConnectCallbackSendParams,
    ) -> Result<ConnectCallbackSendResponse, RuntimeCoreError> {
        connect::deliver_callback(params).await
    }
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

fn data_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

#[cfg(test)]
mod tests;
