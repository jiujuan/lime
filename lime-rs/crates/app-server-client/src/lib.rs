pub use app_server_protocol::is_app_server_notification_method;
pub use app_server_protocol::is_app_server_request_method;
pub use app_server_protocol::AgentAppFetchCloudPackageParams;
pub use app_server_protocol::AgentAppInstalledDisabledSetParams;
pub use app_server_protocol::AgentAppInstalledListResponse;
pub use app_server_protocol::AgentAppInstalledSaveParams;
pub use app_server_protocol::AgentAppLocalPackageInspectParams;
pub use app_server_protocol::AgentAppUninstallParams;
pub use app_server_protocol::AgentAppUninstallRehearsalParams;
pub use app_server_protocol::AgentAppUiRuntimeStartParams;
pub use app_server_protocol::AgentAppUiRuntimeStatusParams;
pub use app_server_protocol::AgentAppUiRuntimeStatusResponse;
pub use app_server_protocol::AgentAppUiRuntimeStopParams;
pub use app_server_protocol::AgentSessionActionRespondParams;
pub use app_server_protocol::AgentSessionListParams;
pub use app_server_protocol::AgentSessionReadParams;
pub use app_server_protocol::AgentSessionStartParams;
pub use app_server_protocol::AgentSessionTurnCancelParams;
pub use app_server_protocol::AgentSessionTurnStartParams;
pub use app_server_protocol::AppServerMethodKind;
pub use app_server_protocol::AppServerMethodSpec;
pub use app_server_protocol::ArtifactReadParams;
pub use app_server_protocol::AutomationJobCreateParams;
pub use app_server_protocol::AutomationJobDeleteResponse;
pub use app_server_protocol::AutomationJobHealthParams;
pub use app_server_protocol::AutomationJobHealthResponse;
pub use app_server_protocol::AutomationJobIdParams;
pub use app_server_protocol::AutomationJobListResponse;
pub use app_server_protocol::AutomationJobReadResponse;
pub use app_server_protocol::AutomationJobRunHistoryParams;
pub use app_server_protocol::AutomationJobRunHistoryResponse;
pub use app_server_protocol::AutomationJobRunNowResponse;
pub use app_server_protocol::AutomationJobUpdateParams;
pub use app_server_protocol::AutomationJobWriteResponse;
pub use app_server_protocol::AutomationScheduleParams;
pub use app_server_protocol::AutomationSchedulePreviewResponse;
pub use app_server_protocol::AutomationScheduleValidateResponse;
pub use app_server_protocol::AutomationSchedulerConfigReadResponse;
pub use app_server_protocol::AutomationSchedulerConfigUpdateParams;
pub use app_server_protocol::AutomationSchedulerConfigUpdateResponse;
pub use app_server_protocol::AutomationSchedulerStatusResponse;
pub use app_server_protocol::CapabilityListParams;
pub use app_server_protocol::EvidenceExportParams;
pub use app_server_protocol::FileSystemCreateDirectoryParams;
pub use app_server_protocol::FileSystemCreateFileParams;
pub use app_server_protocol::FileSystemDeleteFileParams;
pub use app_server_protocol::FileSystemDirectoryListing;
pub use app_server_protocol::FileSystemFileEntry;
pub use app_server_protocol::FileSystemFilePreview;
pub use app_server_protocol::FileSystemListDirectoryParams;
pub use app_server_protocol::FileSystemMutationResponse;
pub use app_server_protocol::FileSystemReadFilePreviewParams;
pub use app_server_protocol::FileSystemRenameFileParams;
pub use app_server_protocol::InitializeParams;
use app_server_protocol::JsonRpcErrorResponse;
use app_server_protocol::JsonRpcMessage;
use app_server_protocol::JsonRpcNotification;
use app_server_protocol::JsonRpcRequest;
use app_server_protocol::JsonRpcResponse;
pub use app_server_protocol::KnowledgeCompilePackParams;
pub use app_server_protocol::KnowledgeCompilePackResponse;
pub use app_server_protocol::KnowledgeContextResolutionResponse;
pub use app_server_protocol::KnowledgeImportSourceParams;
pub use app_server_protocol::KnowledgeImportSourceResponse;
pub use app_server_protocol::KnowledgeListPacksParams;
pub use app_server_protocol::KnowledgeListPacksResponse;
pub use app_server_protocol::KnowledgeReadPackParams;
pub use app_server_protocol::KnowledgeReadPackResponse;
pub use app_server_protocol::KnowledgeResolveContextParams;
pub use app_server_protocol::KnowledgeSetDefaultPackParams;
pub use app_server_protocol::KnowledgeSetDefaultPackResponse;
pub use app_server_protocol::KnowledgeUpdatePackStatusParams;
pub use app_server_protocol::KnowledgeUpdatePackStatusResponse;
pub use app_server_protocol::KnowledgeValidateContextRunParams;
pub use app_server_protocol::KnowledgeValidateContextRunResponse;
pub use app_server_protocol::McpPromptListResponse;
pub use app_server_protocol::McpResourceListResponse;
pub use app_server_protocol::McpServerListResponse;
pub use app_server_protocol::McpServerStatusListResponse;
pub use app_server_protocol::McpToolListResponse;
pub use app_server_protocol::ModelListParams;
pub use app_server_protocol::ModelProviderAliasReadParams;
pub use app_server_protocol::ProjectMemoryReadParams;
pub use app_server_protocol::ProjectMemoryReadResponse;
use app_server_protocol::RequestId;
pub use app_server_protocol::SkillListResponse;
pub use app_server_protocol::SkillReadParams;
pub use app_server_protocol::SkillReadResponse;
pub use app_server_protocol::UsageStatsDailyTrendsListResponse;
pub use app_server_protocol::UsageStatsDailyUsage;
pub use app_server_protocol::UsageStatsModelRankingListResponse;
pub use app_server_protocol::UsageStatsModelUsage;
pub use app_server_protocol::UsageStatsRangeParams;
pub use app_server_protocol::UsageStatsReadResponse;
pub use app_server_protocol::UsageStatsSummary;
pub use app_server_protocol::WorkspaceEnsureParams;
pub use app_server_protocol::WorkspaceEnsureReadyResponse;
pub use app_server_protocol::WorkspaceListResponse;
pub use app_server_protocol::WorkspacePathReadParams;
pub use app_server_protocol::WorkspaceProjectPathResolveParams;
pub use app_server_protocol::WorkspaceProjectPathResolveResponse;
pub use app_server_protocol::WorkspaceProjectsRootReadResponse;
pub use app_server_protocol::WorkspaceReadParams;
pub use app_server_protocol::WorkspaceReadResponse;
pub use app_server_protocol::WorkspaceSkillBindingsListParams;
pub use app_server_protocol::WorkspaceSkillBindingsListResponse;
pub use app_server_protocol::APP_SERVER_METHODS;
pub use app_server_protocol::METHOD_AGENT_APP_INSTALLED_LIST;
pub use app_server_protocol::METHOD_AGENT_APP_UI_RUNTIME_START;
pub use app_server_protocol::METHOD_AGENT_APP_UI_RUNTIME_STATUS;
pub use app_server_protocol::METHOD_AGENT_APP_UI_RUNTIME_STOP;
pub use app_server_protocol::METHOD_AGENT_SESSION_ACTION_RESPOND;
pub use app_server_protocol::METHOD_AGENT_SESSION_EVENT;
pub use app_server_protocol::METHOD_AGENT_SESSION_LIST;
pub use app_server_protocol::METHOD_AGENT_SESSION_READ;
pub use app_server_protocol::METHOD_AGENT_SESSION_START;
pub use app_server_protocol::METHOD_AGENT_SESSION_TURN_CANCEL;
pub use app_server_protocol::METHOD_AGENT_SESSION_TURN_START;
pub use app_server_protocol::METHOD_ARTIFACT_READ;
pub use app_server_protocol::METHOD_AUTOMATION_JOB_CREATE;
pub use app_server_protocol::METHOD_AUTOMATION_JOB_DELETE;
pub use app_server_protocol::METHOD_AUTOMATION_JOB_HEALTH;
pub use app_server_protocol::METHOD_AUTOMATION_JOB_LIST;
pub use app_server_protocol::METHOD_AUTOMATION_JOB_READ;
pub use app_server_protocol::METHOD_AUTOMATION_JOB_RUN_HISTORY;
pub use app_server_protocol::METHOD_AUTOMATION_JOB_RUN_NOW;
pub use app_server_protocol::METHOD_AUTOMATION_JOB_UPDATE;
pub use app_server_protocol::METHOD_AUTOMATION_SCHEDULER_CONFIG_READ;
pub use app_server_protocol::METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE;
pub use app_server_protocol::METHOD_AUTOMATION_SCHEDULER_STATUS;
pub use app_server_protocol::METHOD_AUTOMATION_SCHEDULE_PREVIEW;
pub use app_server_protocol::METHOD_AUTOMATION_SCHEDULE_VALIDATE;
pub use app_server_protocol::METHOD_CAPABILITY_LIST;
pub use app_server_protocol::METHOD_EVIDENCE_EXPORT;
pub use app_server_protocol::METHOD_FILE_SYSTEM_CREATE_DIRECTORY;
pub use app_server_protocol::METHOD_FILE_SYSTEM_CREATE_FILE;
pub use app_server_protocol::METHOD_FILE_SYSTEM_DELETE_FILE;
pub use app_server_protocol::METHOD_FILE_SYSTEM_LIST_DIRECTORY;
pub use app_server_protocol::METHOD_FILE_SYSTEM_READ_FILE_PREVIEW;
pub use app_server_protocol::METHOD_FILE_SYSTEM_RENAME_FILE;
pub use app_server_protocol::METHOD_INITIALIZE;
pub use app_server_protocol::METHOD_INITIALIZED;
pub use app_server_protocol::METHOD_KNOWLEDGE_CONTEXT_RESOLVE;
pub use app_server_protocol::METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE;
pub use app_server_protocol::METHOD_KNOWLEDGE_PACK_COMPILE;
pub use app_server_protocol::METHOD_KNOWLEDGE_PACK_DEFAULT_SET;
pub use app_server_protocol::METHOD_KNOWLEDGE_PACK_LIST;
pub use app_server_protocol::METHOD_KNOWLEDGE_PACK_READ;
pub use app_server_protocol::METHOD_KNOWLEDGE_PACK_STATUS_UPDATE;
pub use app_server_protocol::METHOD_KNOWLEDGE_SOURCE_IMPORT;
pub use app_server_protocol::METHOD_MCP_PROMPT_LIST;
pub use app_server_protocol::METHOD_MCP_RESOURCE_LIST;
pub use app_server_protocol::METHOD_MCP_SERVER_LIST;
pub use app_server_protocol::METHOD_MCP_SERVER_STATUS_LIST;
pub use app_server_protocol::METHOD_MCP_TOOL_LIST;
pub use app_server_protocol::METHOD_MODEL_LIST;
pub use app_server_protocol::METHOD_MODEL_PREFERENCES_LIST;
pub use app_server_protocol::METHOD_MODEL_PROVIDER_ALIAS_LIST;
pub use app_server_protocol::METHOD_MODEL_PROVIDER_ALIAS_READ;
pub use app_server_protocol::METHOD_MODEL_PROVIDER_CATALOG_LIST;
pub use app_server_protocol::METHOD_MODEL_PROVIDER_LIST;
pub use app_server_protocol::METHOD_MODEL_SYNC_STATE_READ;
pub use app_server_protocol::METHOD_PROJECT_MEMORY_READ;
pub use app_server_protocol::METHOD_SKILL_LIST;
pub use app_server_protocol::METHOD_SKILL_READ;
pub use app_server_protocol::METHOD_USAGE_STATS_DAILY_TRENDS_LIST;
pub use app_server_protocol::METHOD_USAGE_STATS_MODEL_RANKING_LIST;
pub use app_server_protocol::METHOD_USAGE_STATS_READ;
pub use app_server_protocol::METHOD_WORKSPACE_BY_PATH_READ;
pub use app_server_protocol::METHOD_WORKSPACE_DEFAULT_ENSURE;
pub use app_server_protocol::METHOD_WORKSPACE_DEFAULT_READ;
pub use app_server_protocol::METHOD_WORKSPACE_ENSURE_READY;
pub use app_server_protocol::METHOD_WORKSPACE_LIST;
pub use app_server_protocol::METHOD_WORKSPACE_PROJECTS_ROOT_READ;
pub use app_server_protocol::METHOD_WORKSPACE_PROJECT_PATH_RESOLVE;
pub use app_server_protocol::METHOD_WORKSPACE_READ;
pub use app_server_protocol::METHOD_WORKSPACE_SKILL_BINDINGS_LIST;
use app_server_transport::encode_message;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ClientError {
    #[error("failed to serialize request params: {0}")]
    Serialize(#[from] serde_json::Error),
    #[error(transparent)]
    Transport(#[from] app_server_transport::TransportError),
}

#[derive(Debug, Clone, PartialEq)]
pub struct TypedRequest<P> {
    method: &'static str,
    params: P,
}

impl<P> TypedRequest<P> {
    pub fn new(method: &'static str, params: P) -> Self {
        Self { method, params }
    }

    pub fn method(&self) -> &'static str {
        self.method
    }

    pub fn params(&self) -> &P {
        &self.params
    }

    pub fn into_parts(self) -> (&'static str, P) {
        (self.method, self.params)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ClientEvent {
    AgentSession(JsonRpcNotification),
    Notification(JsonRpcNotification),
    Request(JsonRpcRequest),
    Response(JsonRpcResponse),
    Error(JsonRpcErrorResponse),
}

impl From<JsonRpcMessage> for ClientEvent {
    fn from(message: JsonRpcMessage) -> Self {
        match message {
            JsonRpcMessage::Notification(notification)
                if notification.method == METHOD_AGENT_SESSION_EVENT =>
            {
                Self::AgentSession(notification)
            }
            JsonRpcMessage::Notification(notification) => Self::Notification(notification),
            JsonRpcMessage::Request(request) => Self::Request(request),
            JsonRpcMessage::Response(response) => Self::Response(response),
            JsonRpcMessage::Error(error) => Self::Error(error),
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppServerClient {
    next_request_id: i64,
}

impl Default for AppServerClient {
    fn default() -> Self {
        Self { next_request_id: 1 }
    }
}

impl AppServerClient {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn initialize(&mut self, params: InitializeParams) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::initialize(params))
    }

    pub fn initialized(&self) -> JsonRpcNotification {
        JsonRpcNotification::new(METHOD_INITIALIZED, Some(serde_json::json!({})))
    }

    pub fn list_capabilities(
        &mut self,
        params: CapabilityListParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_capabilities(params))
    }

    pub fn list_capabilities_default(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.list_capabilities(CapabilityListParams::default())
    }

    pub fn list_sessions(
        &mut self,
        params: AgentSessionListParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_sessions(params))
    }

    pub fn start_session(
        &mut self,
        params: AgentSessionStartParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::start_session(params))
    }

    pub fn read_session(
        &mut self,
        params: AgentSessionReadParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_session(params))
    }

    pub fn list_workspaces(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_workspaces())
    }

    pub fn read_workspace(
        &mut self,
        params: WorkspaceReadParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_workspace(params))
    }

    pub fn read_workspace_by_path(
        &mut self,
        params: WorkspacePathReadParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_workspace_by_path(params))
    }

    pub fn read_default_workspace(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_default_workspace())
    }

    pub fn ensure_default_workspace(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::ensure_default_workspace())
    }

    pub fn read_workspace_projects_root(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_workspace_projects_root())
    }

    pub fn resolve_workspace_project_path(
        &mut self,
        params: WorkspaceProjectPathResolveParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::resolve_workspace_project_path(params))
    }

    pub fn ensure_workspace_ready(
        &mut self,
        params: WorkspaceEnsureParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::ensure_workspace_ready(params))
    }

    pub fn list_skills(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_skills())
    }

    pub fn read_skill(&mut self, params: SkillReadParams) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_skill(params))
    }

    pub fn list_workspace_skill_bindings(
        &mut self,
        params: WorkspaceSkillBindingsListParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_workspace_skill_bindings(params))
    }

    pub fn inspect_agent_app_local_package(
        &mut self,
        params: AgentAppLocalPackageInspectParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::inspect_agent_app_local_package(params))
    }

    pub fn fetch_agent_app_cloud_package(
        &mut self,
        params: AgentAppFetchCloudPackageParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::fetch_agent_app_cloud_package(params))
    }

    pub fn save_agent_app_installed(
        &mut self,
        params: AgentAppInstalledSaveParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::save_agent_app_installed(params))
    }

    pub fn list_agent_app_installed(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_agent_app_installed())
    }

    pub fn set_agent_app_installed_disabled(
        &mut self,
        params: AgentAppInstalledDisabledSetParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::set_agent_app_installed_disabled(params))
    }

    pub fn preview_agent_app_uninstall(
        &mut self,
        params: AgentAppUninstallRehearsalParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::preview_agent_app_uninstall(params))
    }

    pub fn uninstall_agent_app(
        &mut self,
        params: AgentAppUninstallParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::uninstall_agent_app(params))
    }

    pub fn start_agent_app_ui_runtime(
        &mut self,
        params: AgentAppUiRuntimeStartParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::start_agent_app_ui_runtime(params))
    }

    pub fn agent_app_ui_runtime_status(
        &mut self,
        params: AgentAppUiRuntimeStatusParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::agent_app_ui_runtime_status(params))
    }

    pub fn stop_agent_app_ui_runtime(
        &mut self,
        params: AgentAppUiRuntimeStopParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::stop_agent_app_ui_runtime(params))
    }

    pub fn list_knowledge_packs(
        &mut self,
        params: KnowledgeListPacksParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_knowledge_packs(params))
    }

    pub fn read_knowledge_pack(
        &mut self,
        params: KnowledgeReadPackParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_knowledge_pack(params))
    }

    pub fn import_knowledge_source(
        &mut self,
        params: KnowledgeImportSourceParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::import_knowledge_source(params))
    }

    pub fn compile_knowledge_pack(
        &mut self,
        params: KnowledgeCompilePackParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::compile_knowledge_pack(params))
    }

    pub fn set_default_knowledge_pack(
        &mut self,
        params: KnowledgeSetDefaultPackParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::set_default_knowledge_pack(params))
    }

    pub fn update_knowledge_pack_status(
        &mut self,
        params: KnowledgeUpdatePackStatusParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::update_knowledge_pack_status(params))
    }

    pub fn resolve_knowledge_context(
        &mut self,
        params: KnowledgeResolveContextParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::resolve_knowledge_context(params))
    }

    pub fn validate_knowledge_context_run(
        &mut self,
        params: KnowledgeValidateContextRunParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::validate_knowledge_context_run(params))
    }

    pub fn list_automation_jobs(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_automation_jobs())
    }

    pub fn read_automation_scheduler_config(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_automation_scheduler_config())
    }

    pub fn update_automation_scheduler_config(
        &mut self,
        params: AutomationSchedulerConfigUpdateParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::update_automation_scheduler_config(params))
    }

    pub fn read_automation_scheduler_status(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_automation_scheduler_status())
    }

    pub fn read_automation_job(
        &mut self,
        params: AutomationJobIdParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_automation_job(params))
    }

    pub fn create_automation_job(
        &mut self,
        params: AutomationJobCreateParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::create_automation_job(params))
    }

    pub fn update_automation_job(
        &mut self,
        params: AutomationJobUpdateParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::update_automation_job(params))
    }

    pub fn delete_automation_job(
        &mut self,
        params: AutomationJobIdParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::delete_automation_job(params))
    }

    pub fn run_automation_job_now(
        &mut self,
        params: AutomationJobIdParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::run_automation_job_now(params))
    }

    pub fn read_automation_health(
        &mut self,
        params: AutomationJobHealthParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_automation_health(params))
    }

    pub fn read_automation_run_history(
        &mut self,
        params: AutomationJobRunHistoryParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_automation_run_history(params))
    }

    pub fn preview_automation_schedule(
        &mut self,
        params: AutomationScheduleParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::preview_automation_schedule(params))
    }

    pub fn validate_automation_schedule(
        &mut self,
        params: AutomationScheduleParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::validate_automation_schedule(params))
    }

    pub fn list_mcp_servers(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_mcp_servers())
    }

    pub fn list_mcp_servers_with_status(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_mcp_servers_with_status())
    }

    pub fn list_mcp_tools(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_mcp_tools())
    }

    pub fn list_mcp_prompts(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_mcp_prompts())
    }

    pub fn list_mcp_resources(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_mcp_resources())
    }

    pub fn read_project_memory(
        &mut self,
        params: ProjectMemoryReadParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_project_memory(params))
    }

    pub fn read_usage_stats(
        &mut self,
        params: UsageStatsRangeParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_usage_stats(params))
    }

    pub fn list_usage_stats_model_ranking(
        &mut self,
        params: UsageStatsRangeParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_usage_stats_model_ranking(params))
    }

    pub fn list_usage_stats_daily_trends(
        &mut self,
        params: UsageStatsRangeParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_usage_stats_daily_trends(params))
    }

    pub fn list_models(&mut self, params: ModelListParams) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_models(params))
    }

    pub fn list_model_preferences(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_model_preferences())
    }

    pub fn read_model_sync_state(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_model_sync_state())
    }

    pub fn list_model_providers(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_model_providers())
    }

    pub fn list_model_provider_catalog(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_model_provider_catalog())
    }

    pub fn read_model_provider_alias(
        &mut self,
        params: ModelProviderAliasReadParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_model_provider_alias(params))
    }

    pub fn list_model_provider_aliases(&mut self) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_model_provider_aliases())
    }

    pub fn read_artifacts(
        &mut self,
        params: ArtifactReadParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_artifacts(params))
    }

    pub fn list_directory(
        &mut self,
        params: FileSystemListDirectoryParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::list_directory(params))
    }

    pub fn read_file_preview(
        &mut self,
        params: FileSystemReadFilePreviewParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::read_file_preview(params))
    }

    pub fn create_file(
        &mut self,
        params: FileSystemCreateFileParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::create_file(params))
    }

    pub fn create_directory(
        &mut self,
        params: FileSystemCreateDirectoryParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::create_directory(params))
    }

    pub fn rename_file(
        &mut self,
        params: FileSystemRenameFileParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::rename_file(params))
    }

    pub fn delete_file(
        &mut self,
        params: FileSystemDeleteFileParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::delete_file(params))
    }

    pub fn export_evidence(
        &mut self,
        params: EvidenceExportParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::export_evidence(params))
    }

    pub fn start_turn(
        &mut self,
        params: AgentSessionTurnStartParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::start_turn(params))
    }

    pub fn cancel_turn(
        &mut self,
        params: AgentSessionTurnCancelParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::cancel_turn(params))
    }

    pub fn respond_action(
        &mut self,
        params: AgentSessionActionRespondParams,
    ) -> Result<JsonRpcRequest, ClientError> {
        self.typed_request(typed::respond_action(params))
    }

    pub fn typed_request<P: Serialize>(
        &mut self,
        request: TypedRequest<P>,
    ) -> Result<JsonRpcRequest, ClientError> {
        let (method, params) = request.into_parts();
        self.request(method, params)
    }

    pub fn request(
        &mut self,
        method: impl Into<String>,
        params: impl Serialize,
    ) -> Result<JsonRpcRequest, ClientError> {
        let id = self.next_id();
        Ok(JsonRpcRequest::new(
            id,
            method,
            Some(serde_json::to_value(params)?),
        ))
    }

    pub fn encode_request(request: JsonRpcRequest) -> Result<String, ClientError> {
        Ok(encode_message(&JsonRpcMessage::Request(request))?)
    }

    pub fn encode_notification(notification: JsonRpcNotification) -> Result<String, ClientError> {
        Ok(encode_message(&JsonRpcMessage::Notification(notification))?)
    }

    pub fn event(message: JsonRpcMessage) -> ClientEvent {
        ClientEvent::from(message)
    }

    fn next_id(&mut self) -> RequestId {
        let id = self.next_request_id;
        self.next_request_id += 1;
        RequestId::Integer(id)
    }
}

pub mod typed {
    use super::*;

    pub fn initialize(params: InitializeParams) -> TypedRequest<InitializeParams> {
        TypedRequest::new(METHOD_INITIALIZE, params)
    }

    pub fn list_capabilities(params: CapabilityListParams) -> TypedRequest<CapabilityListParams> {
        TypedRequest::new(METHOD_CAPABILITY_LIST, params)
    }

    pub fn list_sessions(params: AgentSessionListParams) -> TypedRequest<AgentSessionListParams> {
        TypedRequest::new(METHOD_AGENT_SESSION_LIST, params)
    }

    pub fn start_session(params: AgentSessionStartParams) -> TypedRequest<AgentSessionStartParams> {
        TypedRequest::new(METHOD_AGENT_SESSION_START, params)
    }

    pub fn read_session(params: AgentSessionReadParams) -> TypedRequest<AgentSessionReadParams> {
        TypedRequest::new(METHOD_AGENT_SESSION_READ, params)
    }

    pub fn list_workspaces() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_WORKSPACE_LIST, serde_json::json!({}))
    }

    pub fn read_workspace(params: WorkspaceReadParams) -> TypedRequest<WorkspaceReadParams> {
        TypedRequest::new(METHOD_WORKSPACE_READ, params)
    }

    pub fn read_workspace_by_path(
        params: WorkspacePathReadParams,
    ) -> TypedRequest<WorkspacePathReadParams> {
        TypedRequest::new(METHOD_WORKSPACE_BY_PATH_READ, params)
    }

    pub fn read_default_workspace() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_WORKSPACE_DEFAULT_READ, serde_json::json!({}))
    }

    pub fn ensure_default_workspace() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_WORKSPACE_DEFAULT_ENSURE, serde_json::json!({}))
    }

    pub fn read_workspace_projects_root() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_WORKSPACE_PROJECTS_ROOT_READ, serde_json::json!({}))
    }

    pub fn resolve_workspace_project_path(
        params: WorkspaceProjectPathResolveParams,
    ) -> TypedRequest<WorkspaceProjectPathResolveParams> {
        TypedRequest::new(METHOD_WORKSPACE_PROJECT_PATH_RESOLVE, params)
    }

    pub fn ensure_workspace_ready(
        params: WorkspaceEnsureParams,
    ) -> TypedRequest<WorkspaceEnsureParams> {
        TypedRequest::new(METHOD_WORKSPACE_ENSURE_READY, params)
    }

    pub fn list_skills() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_SKILL_LIST, serde_json::json!({}))
    }

    pub fn read_skill(params: SkillReadParams) -> TypedRequest<SkillReadParams> {
        TypedRequest::new(METHOD_SKILL_READ, params)
    }

    pub fn list_workspace_skill_bindings(
        params: WorkspaceSkillBindingsListParams,
    ) -> TypedRequest<WorkspaceSkillBindingsListParams> {
        TypedRequest::new(METHOD_WORKSPACE_SKILL_BINDINGS_LIST, params)
    }

    pub fn inspect_agent_app_local_package(
        params: AgentAppLocalPackageInspectParams,
    ) -> TypedRequest<AgentAppLocalPackageInspectParams> {
        TypedRequest::new(METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT, params)
    }

    pub fn fetch_agent_app_cloud_package(
        params: AgentAppFetchCloudPackageParams,
    ) -> TypedRequest<AgentAppFetchCloudPackageParams> {
        TypedRequest::new(METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD, params)
    }

    pub fn save_agent_app_installed(
        params: AgentAppInstalledSaveParams,
    ) -> TypedRequest<AgentAppInstalledSaveParams> {
        TypedRequest::new(METHOD_AGENT_APP_INSTALLED_SAVE, params)
    }

    pub fn list_agent_app_installed() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_AGENT_APP_INSTALLED_LIST, serde_json::json!({}))
    }

    pub fn set_agent_app_installed_disabled(
        params: AgentAppInstalledDisabledSetParams,
    ) -> TypedRequest<AgentAppInstalledDisabledSetParams> {
        TypedRequest::new(METHOD_AGENT_APP_INSTALLED_DISABLED_SET, params)
    }

    pub fn preview_agent_app_uninstall(
        params: AgentAppUninstallRehearsalParams,
    ) -> TypedRequest<AgentAppUninstallRehearsalParams> {
        TypedRequest::new(METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL, params)
    }

    pub fn uninstall_agent_app(
        params: AgentAppUninstallParams,
    ) -> TypedRequest<AgentAppUninstallParams> {
        TypedRequest::new(METHOD_AGENT_APP_INSTALLED_UNINSTALL, params)
    }

    pub fn start_agent_app_ui_runtime(
        params: AgentAppUiRuntimeStartParams,
    ) -> TypedRequest<AgentAppUiRuntimeStartParams> {
        TypedRequest::new(METHOD_AGENT_APP_UI_RUNTIME_START, params)
    }

    pub fn agent_app_ui_runtime_status(
        params: AgentAppUiRuntimeStatusParams,
    ) -> TypedRequest<AgentAppUiRuntimeStatusParams> {
        TypedRequest::new(METHOD_AGENT_APP_UI_RUNTIME_STATUS, params)
    }

    pub fn stop_agent_app_ui_runtime(
        params: AgentAppUiRuntimeStopParams,
    ) -> TypedRequest<AgentAppUiRuntimeStopParams> {
        TypedRequest::new(METHOD_AGENT_APP_UI_RUNTIME_STOP, params)
    }

    pub fn list_knowledge_packs(
        params: KnowledgeListPacksParams,
    ) -> TypedRequest<KnowledgeListPacksParams> {
        TypedRequest::new(METHOD_KNOWLEDGE_PACK_LIST, params)
    }

    pub fn read_knowledge_pack(
        params: KnowledgeReadPackParams,
    ) -> TypedRequest<KnowledgeReadPackParams> {
        TypedRequest::new(METHOD_KNOWLEDGE_PACK_READ, params)
    }

    pub fn import_knowledge_source(
        params: KnowledgeImportSourceParams,
    ) -> TypedRequest<KnowledgeImportSourceParams> {
        TypedRequest::new(METHOD_KNOWLEDGE_SOURCE_IMPORT, params)
    }

    pub fn compile_knowledge_pack(
        params: KnowledgeCompilePackParams,
    ) -> TypedRequest<KnowledgeCompilePackParams> {
        TypedRequest::new(METHOD_KNOWLEDGE_PACK_COMPILE, params)
    }

    pub fn set_default_knowledge_pack(
        params: KnowledgeSetDefaultPackParams,
    ) -> TypedRequest<KnowledgeSetDefaultPackParams> {
        TypedRequest::new(METHOD_KNOWLEDGE_PACK_DEFAULT_SET, params)
    }

    pub fn update_knowledge_pack_status(
        params: KnowledgeUpdatePackStatusParams,
    ) -> TypedRequest<KnowledgeUpdatePackStatusParams> {
        TypedRequest::new(METHOD_KNOWLEDGE_PACK_STATUS_UPDATE, params)
    }

    pub fn resolve_knowledge_context(
        params: KnowledgeResolveContextParams,
    ) -> TypedRequest<KnowledgeResolveContextParams> {
        TypedRequest::new(METHOD_KNOWLEDGE_CONTEXT_RESOLVE, params)
    }

    pub fn validate_knowledge_context_run(
        params: KnowledgeValidateContextRunParams,
    ) -> TypedRequest<KnowledgeValidateContextRunParams> {
        TypedRequest::new(METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE, params)
    }

    pub fn list_automation_jobs() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_AUTOMATION_JOB_LIST, serde_json::json!({}))
    }

    pub fn read_automation_scheduler_config() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(
            METHOD_AUTOMATION_SCHEDULER_CONFIG_READ,
            serde_json::json!({}),
        )
    }

    pub fn update_automation_scheduler_config(
        params: AutomationSchedulerConfigUpdateParams,
    ) -> TypedRequest<AutomationSchedulerConfigUpdateParams> {
        TypedRequest::new(METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE, params)
    }

    pub fn read_automation_scheduler_status() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_AUTOMATION_SCHEDULER_STATUS, serde_json::json!({}))
    }

    pub fn read_automation_job(
        params: AutomationJobIdParams,
    ) -> TypedRequest<AutomationJobIdParams> {
        TypedRequest::new(METHOD_AUTOMATION_JOB_READ, params)
    }

    pub fn create_automation_job(
        params: AutomationJobCreateParams,
    ) -> TypedRequest<AutomationJobCreateParams> {
        TypedRequest::new(METHOD_AUTOMATION_JOB_CREATE, params)
    }

    pub fn update_automation_job(
        params: AutomationJobUpdateParams,
    ) -> TypedRequest<AutomationJobUpdateParams> {
        TypedRequest::new(METHOD_AUTOMATION_JOB_UPDATE, params)
    }

    pub fn delete_automation_job(
        params: AutomationJobIdParams,
    ) -> TypedRequest<AutomationJobIdParams> {
        TypedRequest::new(METHOD_AUTOMATION_JOB_DELETE, params)
    }

    pub fn run_automation_job_now(
        params: AutomationJobIdParams,
    ) -> TypedRequest<AutomationJobIdParams> {
        TypedRequest::new(METHOD_AUTOMATION_JOB_RUN_NOW, params)
    }

    pub fn read_automation_health(
        params: AutomationJobHealthParams,
    ) -> TypedRequest<AutomationJobHealthParams> {
        TypedRequest::new(METHOD_AUTOMATION_JOB_HEALTH, params)
    }

    pub fn read_automation_run_history(
        params: AutomationJobRunHistoryParams,
    ) -> TypedRequest<AutomationJobRunHistoryParams> {
        TypedRequest::new(METHOD_AUTOMATION_JOB_RUN_HISTORY, params)
    }

    pub fn preview_automation_schedule(
        params: AutomationScheduleParams,
    ) -> TypedRequest<AutomationScheduleParams> {
        TypedRequest::new(METHOD_AUTOMATION_SCHEDULE_PREVIEW, params)
    }

    pub fn validate_automation_schedule(
        params: AutomationScheduleParams,
    ) -> TypedRequest<AutomationScheduleParams> {
        TypedRequest::new(METHOD_AUTOMATION_SCHEDULE_VALIDATE, params)
    }

    pub fn list_mcp_servers() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_MCP_SERVER_LIST, serde_json::json!({}))
    }

    pub fn list_mcp_servers_with_status() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_MCP_SERVER_STATUS_LIST, serde_json::json!({}))
    }

    pub fn list_mcp_tools() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_MCP_TOOL_LIST, serde_json::json!({}))
    }

    pub fn list_mcp_prompts() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_MCP_PROMPT_LIST, serde_json::json!({}))
    }

    pub fn list_mcp_resources() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_MCP_RESOURCE_LIST, serde_json::json!({}))
    }

    pub fn read_project_memory(
        params: ProjectMemoryReadParams,
    ) -> TypedRequest<ProjectMemoryReadParams> {
        TypedRequest::new(METHOD_PROJECT_MEMORY_READ, params)
    }

    pub fn read_usage_stats(params: UsageStatsRangeParams) -> TypedRequest<UsageStatsRangeParams> {
        TypedRequest::new(METHOD_USAGE_STATS_READ, params)
    }

    pub fn list_usage_stats_model_ranking(
        params: UsageStatsRangeParams,
    ) -> TypedRequest<UsageStatsRangeParams> {
        TypedRequest::new(METHOD_USAGE_STATS_MODEL_RANKING_LIST, params)
    }

    pub fn list_usage_stats_daily_trends(
        params: UsageStatsRangeParams,
    ) -> TypedRequest<UsageStatsRangeParams> {
        TypedRequest::new(METHOD_USAGE_STATS_DAILY_TRENDS_LIST, params)
    }

    pub fn list_models(params: ModelListParams) -> TypedRequest<ModelListParams> {
        TypedRequest::new(METHOD_MODEL_LIST, params)
    }

    pub fn list_model_preferences() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_MODEL_PREFERENCES_LIST, serde_json::json!({}))
    }

    pub fn read_model_sync_state() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_MODEL_SYNC_STATE_READ, serde_json::json!({}))
    }

    pub fn list_model_providers() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_MODEL_PROVIDER_LIST, serde_json::json!({}))
    }

    pub fn list_model_provider_catalog() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_MODEL_PROVIDER_CATALOG_LIST, serde_json::json!({}))
    }

    pub fn read_model_provider_alias(
        params: ModelProviderAliasReadParams,
    ) -> TypedRequest<ModelProviderAliasReadParams> {
        TypedRequest::new(METHOD_MODEL_PROVIDER_ALIAS_READ, params)
    }

    pub fn list_model_provider_aliases() -> TypedRequest<serde_json::Value> {
        TypedRequest::new(METHOD_MODEL_PROVIDER_ALIAS_LIST, serde_json::json!({}))
    }

    pub fn read_artifacts(params: ArtifactReadParams) -> TypedRequest<ArtifactReadParams> {
        TypedRequest::new(METHOD_ARTIFACT_READ, params)
    }

    pub fn list_directory(
        params: FileSystemListDirectoryParams,
    ) -> TypedRequest<FileSystemListDirectoryParams> {
        TypedRequest::new(METHOD_FILE_SYSTEM_LIST_DIRECTORY, params)
    }

    pub fn read_file_preview(
        params: FileSystemReadFilePreviewParams,
    ) -> TypedRequest<FileSystemReadFilePreviewParams> {
        TypedRequest::new(METHOD_FILE_SYSTEM_READ_FILE_PREVIEW, params)
    }

    pub fn create_file(
        params: FileSystemCreateFileParams,
    ) -> TypedRequest<FileSystemCreateFileParams> {
        TypedRequest::new(METHOD_FILE_SYSTEM_CREATE_FILE, params)
    }

    pub fn create_directory(
        params: FileSystemCreateDirectoryParams,
    ) -> TypedRequest<FileSystemCreateDirectoryParams> {
        TypedRequest::new(METHOD_FILE_SYSTEM_CREATE_DIRECTORY, params)
    }

    pub fn rename_file(
        params: FileSystemRenameFileParams,
    ) -> TypedRequest<FileSystemRenameFileParams> {
        TypedRequest::new(METHOD_FILE_SYSTEM_RENAME_FILE, params)
    }

    pub fn delete_file(
        params: FileSystemDeleteFileParams,
    ) -> TypedRequest<FileSystemDeleteFileParams> {
        TypedRequest::new(METHOD_FILE_SYSTEM_DELETE_FILE, params)
    }

    pub fn export_evidence(params: EvidenceExportParams) -> TypedRequest<EvidenceExportParams> {
        TypedRequest::new(METHOD_EVIDENCE_EXPORT, params)
    }

    pub fn start_turn(
        params: AgentSessionTurnStartParams,
    ) -> TypedRequest<AgentSessionTurnStartParams> {
        TypedRequest::new(METHOD_AGENT_SESSION_TURN_START, params)
    }

    pub fn cancel_turn(
        params: AgentSessionTurnCancelParams,
    ) -> TypedRequest<AgentSessionTurnCancelParams> {
        TypedRequest::new(METHOD_AGENT_SESSION_TURN_CANCEL, params)
    }

    pub fn respond_action(
        params: AgentSessionActionRespondParams,
    ) -> TypedRequest<AgentSessionActionRespondParams> {
        TypedRequest::new(METHOD_AGENT_SESSION_ACTION_RESPOND, params)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentEvent;
    use app_server_protocol::AgentSessionActionScope;
    use app_server_protocol::AgentSessionActionType;
    use app_server_protocol::AgentSessionEventParams;
    use app_server_protocol::ClientCapabilities;
    use app_server_protocol::ClientInfo;
    use app_server_protocol::JsonRpcError;
    use serde_json::json;

    #[test]
    fn initialize_request_uses_stable_method_and_incrementing_id() {
        let mut client = AppServerClient::new();

        let request = client
            .initialize(InitializeParams {
                client_info: ClientInfo {
                    name: "content-studio".to_string(),
                    title: None,
                    version: Some("0.1.0".to_string()),
                },
                capabilities: ClientCapabilities::default(),
            })
            .expect("request");

        assert_eq!(request.id, RequestId::Integer(1));
        assert_eq!(request.method, METHOD_INITIALIZE);
        assert!(AppServerClient::encode_request(request)
            .expect("line")
            .ends_with('\n'));
    }

    #[test]
    fn typed_request_helper_binds_method_to_protocol_params() {
        let typed = typed::read_session(AgentSessionReadParams {
            session_id: "sess_1".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        });

        assert_eq!(typed.method(), METHOD_AGENT_SESSION_READ);
        assert_eq!(typed.params().session_id, "sess_1");

        let mut client = AppServerClient::new();
        let request = client.typed_request(typed).expect("request");

        assert_eq!(request.id, RequestId::Integer(1));
        assert_eq!(request.method, METHOD_AGENT_SESSION_READ);
        assert_eq!(request.params.expect("params")["sessionId"], "sess_1");
    }

    #[test]
    fn list_capabilities_uses_default_params_and_stable_method() {
        let mut client = AppServerClient::new();

        let request = client.list_capabilities_default().expect("request");

        assert_eq!(request.id, RequestId::Integer(1));
        assert_eq!(request.method, METHOD_CAPABILITY_LIST);
        assert_eq!(request.params.expect("params"), json!({}));
    }

    #[test]
    fn mcp_list_helpers_use_current_methods_and_empty_params() {
        let mut client = AppServerClient::new();

        let servers = client.list_mcp_servers().expect("servers");
        let status = client
            .list_mcp_servers_with_status()
            .expect("server status");
        let tools = client.list_mcp_tools().expect("tools");
        let prompts = client.list_mcp_prompts().expect("prompts");
        let resources = client.list_mcp_resources().expect("resources");

        assert_eq!(servers.method, METHOD_MCP_SERVER_LIST);
        assert_eq!(servers.params.expect("params"), json!({}));
        assert_eq!(status.method, METHOD_MCP_SERVER_STATUS_LIST);
        assert_eq!(status.params.expect("params"), json!({}));
        assert_eq!(tools.method, METHOD_MCP_TOOL_LIST);
        assert_eq!(tools.params.expect("params"), json!({}));
        assert_eq!(prompts.method, METHOD_MCP_PROMPT_LIST);
        assert_eq!(prompts.params.expect("params"), json!({}));
        assert_eq!(resources.method, METHOD_MCP_RESOURCE_LIST);
        assert_eq!(resources.params.expect("params"), json!({}));
    }

    #[test]
    fn list_capabilities_preserves_optional_scope_params() {
        let mut client = AppServerClient::new();

        let request = client
            .list_capabilities(CapabilityListParams {
                app_id: Some("content-studio".to_string()),
                workspace_id: Some("workspace-main".to_string()),
                session_id: Some("sess_1".to_string()),
                cursor: Some("2".to_string()),
                limit: Some(25),
            })
            .expect("request");

        assert_eq!(request.id, RequestId::Integer(1));
        assert_eq!(request.method, METHOD_CAPABILITY_LIST);
        assert_eq!(
            request.params.expect("params"),
            json!({
                "appId": "content-studio",
                "workspaceId": "workspace-main",
                "sessionId": "sess_1",
                "cursor": "2",
                "limit": 25,
            })
        );
    }

    #[test]
    fn list_sessions_preserves_filters_and_stable_method() {
        let mut client = AppServerClient::new();

        let request = client
            .list_sessions(AgentSessionListParams {
                include_archived: Some(true),
                archived_only: Some(false),
                workspace_id: Some("workspace-main".to_string()),
                limit: Some(50),
            })
            .expect("request");

        assert_eq!(request.id, RequestId::Integer(1));
        assert_eq!(request.method, METHOD_AGENT_SESSION_LIST);
        assert_eq!(
            request.params.expect("params"),
            json!({
                "includeArchived": true,
                "archivedOnly": false,
                "workspaceId": "workspace-main",
                "limit": 50,
            })
        );
    }

    #[test]
    fn model_read_helpers_use_current_methods() {
        let mut client = AppServerClient::new();

        let models = client
            .list_models(ModelListParams {
                provider_id: Some("openai".to_string()),
                tier: None,
            })
            .expect("models");
        let preferences = client.list_model_preferences().expect("preferences");
        let sync_state = client.read_model_sync_state().expect("sync state");
        let providers = client.list_model_providers().expect("providers");
        let catalog = client
            .list_model_provider_catalog()
            .expect("provider catalog");
        let alias = client
            .read_model_provider_alias(ModelProviderAliasReadParams {
                provider: "openai".to_string(),
            })
            .expect("alias");
        let aliases = client.list_model_provider_aliases().expect("aliases");

        assert_eq!(models.method, METHOD_MODEL_LIST);
        assert_eq!(
            models.params.expect("params"),
            json!({ "providerId": "openai" })
        );
        assert_eq!(preferences.method, METHOD_MODEL_PREFERENCES_LIST);
        assert_eq!(sync_state.method, METHOD_MODEL_SYNC_STATE_READ);
        assert_eq!(providers.method, METHOD_MODEL_PROVIDER_LIST);
        assert_eq!(catalog.method, METHOD_MODEL_PROVIDER_CATALOG_LIST);
        assert_eq!(alias.method, METHOD_MODEL_PROVIDER_ALIAS_READ);
        assert_eq!(
            alias.params.expect("params"),
            json!({ "provider": "openai" })
        );
        assert_eq!(aliases.method, METHOD_MODEL_PROVIDER_ALIAS_LIST);
    }

    #[test]
    fn workspace_helpers_use_current_methods() {
        let mut client = AppServerClient::new();

        let workspaces = client.list_workspaces().expect("workspaces");
        let workspace = client
            .read_workspace(WorkspaceReadParams {
                id: "workspace-main".to_string(),
            })
            .expect("workspace");
        let workspace_by_path = client
            .read_workspace_by_path(WorkspacePathReadParams {
                root_path: "/workspace/project".to_string(),
            })
            .expect("workspace by path");
        let default_workspace = client.read_default_workspace().expect("default workspace");
        let ensured_default = client
            .ensure_default_workspace()
            .expect("ensure default workspace");
        let projects_root = client
            .read_workspace_projects_root()
            .expect("projects root");
        let project_path = client
            .resolve_workspace_project_path(WorkspaceProjectPathResolveParams {
                name: "content-studio".to_string(),
                parent_root_path: Some("/workspace".to_string()),
            })
            .expect("project path");
        let ready = client
            .ensure_workspace_ready(WorkspaceEnsureParams {
                id: "workspace-main".to_string(),
            })
            .expect("ready");

        assert_eq!(workspaces.method, METHOD_WORKSPACE_LIST);
        assert_eq!(workspaces.params.expect("params"), json!({}));
        assert_eq!(workspace.method, METHOD_WORKSPACE_READ);
        assert_eq!(
            workspace.params.expect("params"),
            json!({ "id": "workspace-main" })
        );
        assert_eq!(workspace_by_path.method, METHOD_WORKSPACE_BY_PATH_READ);
        assert_eq!(
            workspace_by_path.params.expect("params"),
            json!({ "rootPath": "/workspace/project" })
        );
        assert_eq!(default_workspace.method, METHOD_WORKSPACE_DEFAULT_READ);
        assert_eq!(ensured_default.method, METHOD_WORKSPACE_DEFAULT_ENSURE);
        assert_eq!(projects_root.method, METHOD_WORKSPACE_PROJECTS_ROOT_READ);
        assert_eq!(project_path.method, METHOD_WORKSPACE_PROJECT_PATH_RESOLVE);
        assert_eq!(
            project_path.params.expect("params"),
            json!({
                "name": "content-studio",
                "parentRootPath": "/workspace",
            })
        );
        assert_eq!(ready.method, METHOD_WORKSPACE_ENSURE_READY);
        assert_eq!(
            ready.params.expect("params"),
            json!({ "id": "workspace-main" })
        );
    }

    #[test]
    fn skill_helpers_use_current_methods() {
        let mut client = AppServerClient::new();

        let skills = client.list_skills().expect("skills");
        let skill = client
            .read_skill(SkillReadParams {
                skill_name: "article-writer".to_string(),
            })
            .expect("skill");
        let bindings = client
            .list_workspace_skill_bindings(WorkspaceSkillBindingsListParams {
                workspace_root: "/workspace/project".to_string(),
                caller: Some("agent-chat".to_string()),
                workbench: true,
                browser_assist: false,
            })
            .expect("bindings");

        assert_eq!(skills.method, METHOD_SKILL_LIST);
        assert_eq!(skills.params.expect("params"), json!({}));
        assert_eq!(skill.method, METHOD_SKILL_READ);
        assert_eq!(
            skill.params.expect("params"),
            json!({ "skillName": "article-writer" })
        );
        assert_eq!(bindings.method, METHOD_WORKSPACE_SKILL_BINDINGS_LIST);
        assert_eq!(
            bindings.params.expect("params"),
            json!({
                "workspaceRoot": "/workspace/project",
                "caller": "agent-chat",
                "workbench": true,
                "browserAssist": false,
            })
        );
    }

    #[test]
    fn app_data_surface_helpers_use_current_methods() {
        let mut client = AppServerClient::new();

        let installed = client
            .list_agent_app_installed()
            .expect("installed agent apps");
        let knowledge = client
            .list_knowledge_packs(KnowledgeListPacksParams {
                working_dir: "/workspace/project".to_string(),
                include_archived: true,
            })
            .expect("knowledge packs");
        let knowledge_detail = client
            .read_knowledge_pack(KnowledgeReadPackParams {
                working_dir: "/workspace/project".to_string(),
                name: "sample-product".to_string(),
            })
            .expect("knowledge pack detail");
        let imported_knowledge_source = client
            .import_knowledge_source(KnowledgeImportSourceParams {
                working_dir: "/workspace/project".to_string(),
                pack_name: "sample-product".to_string(),
                description: None,
                pack_type: None,
                language: None,
                source_file_name: None,
                source_text: Some("示例产品事实".to_string()),
            })
            .expect("knowledge source import");
        let compiled_knowledge_pack = client
            .compile_knowledge_pack(KnowledgeCompilePackParams {
                working_dir: "/workspace/project".to_string(),
                name: "sample-product".to_string(),
                builder_runtime: Some(json!({ "enabled": true })),
            })
            .expect("knowledge pack compile");
        let default_knowledge_pack = client
            .set_default_knowledge_pack(KnowledgeSetDefaultPackParams {
                working_dir: "/workspace/project".to_string(),
                name: "sample-product".to_string(),
            })
            .expect("knowledge pack default");
        let updated_knowledge_pack_status = client
            .update_knowledge_pack_status(KnowledgeUpdatePackStatusParams {
                working_dir: "/workspace/project".to_string(),
                name: "sample-product".to_string(),
                status: "ready".to_string(),
            })
            .expect("knowledge pack status");
        let knowledge_context = client
            .resolve_knowledge_context(KnowledgeResolveContextParams {
                working_dir: "/workspace/project".to_string(),
                name: "sample-product".to_string(),
                packs: Vec::new(),
                task: Some("写产品介绍".to_string()),
                max_chars: None,
                activation: None,
                write_run: true,
                run_reason: None,
            })
            .expect("knowledge context");
        let knowledge_context_validation = client
            .validate_knowledge_context_run(KnowledgeValidateContextRunParams {
                working_dir: "/workspace/project".to_string(),
                name: "sample-product".to_string(),
                run_path: "runs/context.json".to_string(),
            })
            .expect("knowledge context validation");
        let scheduler_config = client
            .read_automation_scheduler_config()
            .expect("automation scheduler config");
        let scheduler_config_update = client
            .update_automation_scheduler_config(AutomationSchedulerConfigUpdateParams {
                config: json!({
                    "enabled": true,
                    "poll_interval_secs": 60,
                    "enable_history": true,
                }),
            })
            .expect("automation scheduler config update");
        let scheduler_status = client
            .read_automation_scheduler_status()
            .expect("automation scheduler status");
        let jobs = client.list_automation_jobs().expect("automation jobs");
        let job = client
            .read_automation_job(AutomationJobIdParams {
                id: "job-1".to_string(),
            })
            .expect("automation job");
        let created_job = client
            .create_automation_job(AutomationJobCreateParams {
                request: json!({
                    "name": "每日简报",
                    "workspace_id": "workspace-main",
                    "schedule": {
                        "kind": "every",
                        "every_secs": 3600,
                    },
                    "payload": {
                        "kind": "agent_turn",
                        "prompt": "总结今天重点",
                        "web_search": false,
                    },
                }),
            })
            .expect("automation job create");
        let updated_job = client
            .update_automation_job(AutomationJobUpdateParams {
                id: "job-1".to_string(),
                request: json!({
                    "enabled": false,
                }),
            })
            .expect("automation job update");
        let deleted_job = client
            .delete_automation_job(AutomationJobIdParams {
                id: "job-1".to_string(),
            })
            .expect("automation job delete");
        let run_now = client
            .run_automation_job_now(AutomationJobIdParams {
                id: "job-1".to_string(),
            })
            .expect("automation job run now");
        let health = client
            .read_automation_health(AutomationJobHealthParams {
                query: Some(json!({
                    "top_limit": 3,
                })),
            })
            .expect("automation health");
        let history = client
            .read_automation_run_history(AutomationJobRunHistoryParams {
                id: "job-1".to_string(),
                limit: Some(10),
            })
            .expect("automation run history");
        let preview = client
            .preview_automation_schedule(AutomationScheduleParams {
                schedule: json!({
                    "kind": "every",
                    "every_secs": 3600,
                }),
            })
            .expect("automation schedule preview");
        let validate = client
            .validate_automation_schedule(AutomationScheduleParams {
                schedule: json!({
                    "kind": "every",
                    "every_secs": 3600,
                }),
            })
            .expect("automation schedule validate");
        let memory = client
            .read_project_memory(ProjectMemoryReadParams {
                project_id: "workspace-main".to_string(),
            })
            .expect("project memory");

        assert_eq!(installed.method, METHOD_AGENT_APP_INSTALLED_LIST);
        assert_eq!(installed.params.expect("params"), json!({}));
        assert_eq!(knowledge.method, METHOD_KNOWLEDGE_PACK_LIST);
        assert_eq!(
            knowledge.params.expect("params"),
            json!({
                "workingDir": "/workspace/project",
                "includeArchived": true,
            })
        );
        assert_eq!(knowledge_detail.method, METHOD_KNOWLEDGE_PACK_READ);
        assert_eq!(
            knowledge_detail.params.expect("params"),
            json!({
                "workingDir": "/workspace/project",
                "name": "sample-product",
            })
        );
        assert_eq!(
            imported_knowledge_source.method,
            METHOD_KNOWLEDGE_SOURCE_IMPORT
        );
        assert_eq!(
            imported_knowledge_source.params.expect("params"),
            json!({
                "workingDir": "/workspace/project",
                "packName": "sample-product",
                "sourceText": "示例产品事实",
            })
        );
        assert_eq!(
            compiled_knowledge_pack.method,
            METHOD_KNOWLEDGE_PACK_COMPILE
        );
        assert_eq!(
            compiled_knowledge_pack.params.expect("params"),
            json!({
                "workingDir": "/workspace/project",
                "name": "sample-product",
                "builderRuntime": {
                    "enabled": true,
                },
            })
        );
        assert_eq!(
            default_knowledge_pack.method,
            METHOD_KNOWLEDGE_PACK_DEFAULT_SET
        );
        assert_eq!(
            default_knowledge_pack.params.expect("params"),
            json!({
                "workingDir": "/workspace/project",
                "name": "sample-product",
            })
        );
        assert_eq!(
            updated_knowledge_pack_status.method,
            METHOD_KNOWLEDGE_PACK_STATUS_UPDATE
        );
        assert_eq!(
            updated_knowledge_pack_status.params.expect("params"),
            json!({
                "workingDir": "/workspace/project",
                "name": "sample-product",
                "status": "ready",
            })
        );
        assert_eq!(knowledge_context.method, METHOD_KNOWLEDGE_CONTEXT_RESOLVE);
        assert_eq!(
            knowledge_context.params.expect("params"),
            json!({
                "workingDir": "/workspace/project",
                "name": "sample-product",
                "task": "写产品介绍",
                "writeRun": true,
            })
        );
        assert_eq!(
            knowledge_context_validation.method,
            METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE
        );
        assert_eq!(
            knowledge_context_validation.params.expect("params"),
            json!({
                "workingDir": "/workspace/project",
                "name": "sample-product",
                "runPath": "runs/context.json",
            })
        );
        assert_eq!(
            scheduler_config.method,
            METHOD_AUTOMATION_SCHEDULER_CONFIG_READ
        );
        assert_eq!(
            scheduler_config_update.method,
            METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE
        );
        assert_eq!(
            scheduler_config_update.params.expect("params"),
            json!({
                "config": {
                    "enabled": true,
                    "poll_interval_secs": 60,
                    "enable_history": true,
                },
            })
        );
        assert_eq!(scheduler_status.method, METHOD_AUTOMATION_SCHEDULER_STATUS);
        assert_eq!(jobs.method, METHOD_AUTOMATION_JOB_LIST);
        assert_eq!(jobs.params.expect("params"), json!({}));
        assert_eq!(job.method, METHOD_AUTOMATION_JOB_READ);
        assert_eq!(job.params.expect("params"), json!({ "id": "job-1" }));
        assert_eq!(created_job.method, METHOD_AUTOMATION_JOB_CREATE);
        assert_eq!(
            created_job.params.expect("params"),
            json!({
                "request": {
                    "name": "每日简报",
                    "workspace_id": "workspace-main",
                    "schedule": {
                        "kind": "every",
                        "every_secs": 3600,
                    },
                    "payload": {
                        "kind": "agent_turn",
                        "prompt": "总结今天重点",
                        "web_search": false,
                    },
                },
            })
        );
        assert_eq!(updated_job.method, METHOD_AUTOMATION_JOB_UPDATE);
        assert_eq!(
            updated_job.params.expect("params"),
            json!({
                "id": "job-1",
                "request": {
                    "enabled": false,
                },
            })
        );
        assert_eq!(deleted_job.method, METHOD_AUTOMATION_JOB_DELETE);
        assert_eq!(run_now.method, METHOD_AUTOMATION_JOB_RUN_NOW);
        assert_eq!(health.method, METHOD_AUTOMATION_JOB_HEALTH);
        assert_eq!(
            health.params.expect("params"),
            json!({
                "query": {
                    "top_limit": 3,
                },
            })
        );
        assert_eq!(history.method, METHOD_AUTOMATION_JOB_RUN_HISTORY);
        assert_eq!(
            history.params.expect("params"),
            json!({
                "id": "job-1",
                "limit": 10,
            })
        );
        assert_eq!(preview.method, METHOD_AUTOMATION_SCHEDULE_PREVIEW);
        assert_eq!(
            preview.params.expect("params"),
            json!({
                "schedule": {
                    "kind": "every",
                    "every_secs": 3600,
                },
            })
        );
        assert_eq!(validate.method, METHOD_AUTOMATION_SCHEDULE_VALIDATE);
        assert_eq!(memory.method, METHOD_PROJECT_MEMORY_READ);
        assert_eq!(
            memory.params.expect("params"),
            json!({ "projectId": "workspace-main" })
        );
    }

    #[test]
    fn read_artifacts_preserves_filter_and_stable_method() {
        let mut client = AppServerClient::new();

        let request = client
            .read_artifacts(ArtifactReadParams {
                session_id: "sess_1".to_string(),
                turn_id: Some("turn_1".to_string()),
                artifact_ref: Some("artifact-report".to_string()),
                include_content: Some(true),
                cursor: Some("1".to_string()),
                limit: Some(5),
            })
            .expect("request");

        assert_eq!(request.id, RequestId::Integer(1));
        assert_eq!(request.method, METHOD_ARTIFACT_READ);
        assert_eq!(
            request.params.expect("params"),
            json!({
                "sessionId": "sess_1",
                "turnId": "turn_1",
                "artifactRef": "artifact-report",
                "includeContent": true,
                "cursor": "1",
                "limit": 5,
            })
        );
    }

    #[test]
    fn file_system_helpers_use_current_methods() {
        let mut client = AppServerClient::new();

        let listing = client
            .list_directory(FileSystemListDirectoryParams {
                path: "/workspace".to_string(),
            })
            .expect("listing");
        let preview = client
            .read_file_preview(FileSystemReadFilePreviewParams {
                path: "/workspace/README.md".to_string(),
                max_size: Some(1024),
            })
            .expect("preview");
        let create_file = client
            .create_file(FileSystemCreateFileParams {
                path: "/workspace/new.md".to_string(),
            })
            .expect("create file");
        let create_directory = client
            .create_directory(FileSystemCreateDirectoryParams {
                path: "/workspace/new-dir".to_string(),
            })
            .expect("create directory");
        let rename_file = client
            .rename_file(FileSystemRenameFileParams {
                old_path: "/workspace/new.md".to_string(),
                new_path: "/workspace/renamed.md".to_string(),
            })
            .expect("rename file");
        let delete_file = client
            .delete_file(FileSystemDeleteFileParams {
                path: "/workspace/renamed.md".to_string(),
                recursive: Some(false),
            })
            .expect("delete file");

        assert_eq!(listing.id, RequestId::Integer(1));
        assert_eq!(listing.method, METHOD_FILE_SYSTEM_LIST_DIRECTORY);
        assert_eq!(
            listing.params.expect("params"),
            json!({
                "path": "/workspace",
            })
        );
        assert_eq!(preview.id, RequestId::Integer(2));
        assert_eq!(preview.method, METHOD_FILE_SYSTEM_READ_FILE_PREVIEW);
        assert_eq!(
            preview.params.expect("params"),
            json!({
                "path": "/workspace/README.md",
                "maxSize": 1024,
            })
        );
        assert_eq!(create_file.id, RequestId::Integer(3));
        assert_eq!(create_file.method, METHOD_FILE_SYSTEM_CREATE_FILE);
        assert_eq!(
            create_file.params.expect("params"),
            json!({
                "path": "/workspace/new.md",
            })
        );
        assert_eq!(create_directory.id, RequestId::Integer(4));
        assert_eq!(create_directory.method, METHOD_FILE_SYSTEM_CREATE_DIRECTORY);
        assert_eq!(
            create_directory.params.expect("params"),
            json!({
                "path": "/workspace/new-dir",
            })
        );
        assert_eq!(rename_file.id, RequestId::Integer(5));
        assert_eq!(rename_file.method, METHOD_FILE_SYSTEM_RENAME_FILE);
        assert_eq!(
            rename_file.params.expect("params"),
            json!({
                "oldPath": "/workspace/new.md",
                "newPath": "/workspace/renamed.md",
            })
        );
        assert_eq!(delete_file.id, RequestId::Integer(6));
        assert_eq!(delete_file.method, METHOD_FILE_SYSTEM_DELETE_FILE);
        assert_eq!(
            delete_file.params.expect("params"),
            json!({
                "path": "/workspace/renamed.md",
                "recursive": false,
            })
        );
    }

    #[test]
    fn export_evidence_preserves_scope_and_stable_method() {
        let mut client = AppServerClient::new();

        let request = client
            .export_evidence(EvidenceExportParams {
                session_id: "sess_1".to_string(),
                turn_id: Some("turn_1".to_string()),
                include_events: Some(true),
                include_artifacts: Some(false),
                include_evidence_pack: Some(false),
            })
            .expect("request");

        assert_eq!(request.id, RequestId::Integer(1));
        assert_eq!(request.method, METHOD_EVIDENCE_EXPORT);
        assert_eq!(
            request.params.expect("params"),
            json!({
                "sessionId": "sess_1",
                "turnId": "turn_1",
                "includeEvents": true,
                "includeArtifacts": false,
                "includeEvidencePack": false,
            })
        );
    }

    #[test]
    fn respond_action_preserves_action_scope_and_stable_method() {
        let mut client = AppServerClient::new();

        let request = client
            .respond_action(AgentSessionActionRespondParams {
                session_id: "sess_1".to_string(),
                request_id: "req_confirm_1".to_string(),
                action_type: AgentSessionActionType::ToolConfirmation,
                confirmed: true,
                response: Some("allow".to_string()),
                user_data: Some(json!({ "reason": "approved" })),
                metadata: Some(json!({ "source": "content-studio" })),
                event_name: Some("agentSession/event/sess_1".to_string()),
                action_scope: Some(AgentSessionActionScope {
                    session_id: Some("sess_1".to_string()),
                    thread_id: Some("thread_1".to_string()),
                    turn_id: Some("turn_1".to_string()),
                }),
            })
            .expect("request");

        assert_eq!(request.id, RequestId::Integer(1));
        assert_eq!(request.method, METHOD_AGENT_SESSION_ACTION_RESPOND);
        assert_eq!(
            request.params.expect("params"),
            json!({
                "sessionId": "sess_1",
                "requestId": "req_confirm_1",
                "actionType": "tool_confirmation",
                "confirmed": true,
                "response": "allow",
                "userData": {
                    "reason": "approved",
                },
                "metadata": {
                    "source": "content-studio",
                },
                "eventName": "agentSession/event/sess_1",
                "actionScope": {
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "turnId": "turn_1",
                },
            })
        );
    }

    #[test]
    fn typed_facade_preserves_request_id_sequence() {
        let mut client = AppServerClient::new();

        let first = client
            .read_session(AgentSessionReadParams {
                session_id: "sess_1".to_string(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("first");
        let second = client
            .cancel_turn(AgentSessionTurnCancelParams {
                session_id: "sess_1".to_string(),
                turn_id: "turn_1".to_string(),
            })
            .expect("second");

        assert_eq!(first.id, RequestId::Integer(1));
        assert_eq!(second.id, RequestId::Integer(2));
        assert_eq!(second.method, METHOD_AGENT_SESSION_TURN_CANCEL);
    }

    #[test]
    fn event_classifies_agent_session_notification_without_deserializing_payload() {
        let notification = JsonRpcNotification::new(
            METHOD_AGENT_SESSION_EVENT,
            Some(
                serde_json::to_value(AgentSessionEventParams {
                    event: AgentEvent {
                        event_id: "evt_1".to_string(),
                        sequence: 1,
                        session_id: "sess_1".to_string(),
                        thread_id: Some("thread_1".to_string()),
                        turn_id: Some("turn_1".to_string()),
                        event_type: "turn.started".to_string(),
                        timestamp: "2026-06-04T00:00:00Z".to_string(),
                        payload: json!({ "status": "running" }),
                    },
                })
                .expect("params"),
            ),
        );

        let event = AppServerClient::event(JsonRpcMessage::Notification(notification.clone()));

        assert_eq!(event, ClientEvent::AgentSession(notification));
    }

    #[test]
    fn event_keeps_non_session_messages_available_to_caller() {
        let response =
            JsonRpcResponse::new(RequestId::Integer(1), json!({ "ok": true })).expect("response");
        let error = JsonRpcErrorResponse {
            id: RequestId::Integer(2),
            error: JsonRpcError::new(-32000, "runtime error"),
        };

        assert_eq!(
            AppServerClient::event(JsonRpcMessage::Response(response.clone())),
            ClientEvent::Response(response)
        );
        assert_eq!(
            AppServerClient::event(JsonRpcMessage::Error(error.clone())),
            ClientEvent::Error(error)
        );
    }

    #[test]
    fn reexports_protocol_method_catalog_for_consumers() {
        let methods: Vec<&str> = APP_SERVER_METHODS.iter().map(|spec| spec.method).collect();

        assert!(methods.contains(&METHOD_INITIALIZE));
        assert!(methods.contains(&METHOD_ARTIFACT_READ));
        assert!(methods.contains(&METHOD_FILE_SYSTEM_LIST_DIRECTORY));
        assert!(methods.contains(&METHOD_FILE_SYSTEM_READ_FILE_PREVIEW));
        assert!(methods.contains(&METHOD_FILE_SYSTEM_CREATE_FILE));
        assert!(methods.contains(&METHOD_FILE_SYSTEM_CREATE_DIRECTORY));
        assert!(methods.contains(&METHOD_FILE_SYSTEM_RENAME_FILE));
        assert!(methods.contains(&METHOD_FILE_SYSTEM_DELETE_FILE));
        assert!(methods.contains(&METHOD_EVIDENCE_EXPORT));
        assert!(methods.contains(&METHOD_AGENT_SESSION_TURN_START));
        assert!(methods.contains(&METHOD_WORKSPACE_LIST));
        assert!(methods.contains(&METHOD_WORKSPACE_READ));
        assert!(methods.contains(&METHOD_WORKSPACE_BY_PATH_READ));
        assert!(methods.contains(&METHOD_WORKSPACE_DEFAULT_READ));
        assert!(methods.contains(&METHOD_WORKSPACE_DEFAULT_ENSURE));
        assert!(methods.contains(&METHOD_WORKSPACE_PROJECTS_ROOT_READ));
        assert!(methods.contains(&METHOD_WORKSPACE_PROJECT_PATH_RESOLVE));
        assert!(methods.contains(&METHOD_WORKSPACE_ENSURE_READY));
        assert!(methods.contains(&METHOD_SKILL_LIST));
        assert!(methods.contains(&METHOD_SKILL_READ));
        assert!(methods.contains(&METHOD_WORKSPACE_SKILL_BINDINGS_LIST));
        assert!(methods.contains(&METHOD_AGENT_APP_INSTALLED_LIST));
        assert!(methods.contains(&METHOD_KNOWLEDGE_PACK_LIST));
        assert!(methods.contains(&METHOD_KNOWLEDGE_PACK_READ));
        assert!(methods.contains(&METHOD_AUTOMATION_SCHEDULER_CONFIG_READ));
        assert!(methods.contains(&METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE));
        assert!(methods.contains(&METHOD_AUTOMATION_SCHEDULER_STATUS));
        assert!(methods.contains(&METHOD_AUTOMATION_JOB_LIST));
        assert!(methods.contains(&METHOD_AUTOMATION_JOB_READ));
        assert!(methods.contains(&METHOD_AUTOMATION_JOB_CREATE));
        assert!(methods.contains(&METHOD_AUTOMATION_JOB_UPDATE));
        assert!(methods.contains(&METHOD_AUTOMATION_JOB_DELETE));
        assert!(methods.contains(&METHOD_AUTOMATION_JOB_RUN_NOW));
        assert!(methods.contains(&METHOD_AUTOMATION_JOB_HEALTH));
        assert!(methods.contains(&METHOD_AUTOMATION_JOB_RUN_HISTORY));
        assert!(methods.contains(&METHOD_AUTOMATION_SCHEDULE_PREVIEW));
        assert!(methods.contains(&METHOD_AUTOMATION_SCHEDULE_VALIDATE));
        assert!(methods.contains(&METHOD_PROJECT_MEMORY_READ));
        assert!(methods.contains(&METHOD_AGENT_SESSION_EVENT));
        assert!(is_app_server_request_method(METHOD_CAPABILITY_LIST));
        assert!(is_app_server_request_method(METHOD_ARTIFACT_READ));
        assert!(is_app_server_request_method(
            METHOD_FILE_SYSTEM_LIST_DIRECTORY
        ));
        assert!(is_app_server_request_method(
            METHOD_FILE_SYSTEM_READ_FILE_PREVIEW
        ));
        assert!(is_app_server_request_method(METHOD_FILE_SYSTEM_CREATE_FILE));
        assert!(is_app_server_request_method(
            METHOD_FILE_SYSTEM_CREATE_DIRECTORY
        ));
        assert!(is_app_server_request_method(METHOD_FILE_SYSTEM_RENAME_FILE));
        assert!(is_app_server_request_method(METHOD_FILE_SYSTEM_DELETE_FILE));
        assert!(is_app_server_request_method(METHOD_EVIDENCE_EXPORT));
        assert!(is_app_server_request_method(METHOD_WORKSPACE_LIST));
        assert!(is_app_server_request_method(METHOD_SKILL_LIST));
        assert!(is_app_server_request_method(
            METHOD_AGENT_APP_INSTALLED_LIST
        ));
        assert!(is_app_server_request_method(METHOD_KNOWLEDGE_PACK_LIST));
        assert!(is_app_server_request_method(METHOD_KNOWLEDGE_PACK_READ));
        assert!(is_app_server_request_method(
            METHOD_AUTOMATION_SCHEDULER_CONFIG_READ
        ));
        assert!(is_app_server_request_method(
            METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE
        ));
        assert!(is_app_server_request_method(
            METHOD_AUTOMATION_SCHEDULER_STATUS
        ));
        assert!(is_app_server_request_method(METHOD_AUTOMATION_JOB_LIST));
        assert!(is_app_server_request_method(METHOD_AUTOMATION_JOB_CREATE));
        assert!(is_app_server_request_method(
            METHOD_AUTOMATION_SCHEDULE_VALIDATE
        ));
        assert!(is_app_server_request_method(METHOD_PROJECT_MEMORY_READ));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_TURN_CANCEL
        ));
        assert!(!is_app_server_request_method(METHOD_INITIALIZED));
        assert!(is_app_server_notification_method(METHOD_INITIALIZED));
        assert!(is_app_server_notification_method(
            METHOD_AGENT_SESSION_EVENT
        ));
    }
}
