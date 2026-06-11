mod project_git;

use crate::AppServerError;
use crate::RuntimeCore;
use crate::RuntimeCoreError;
use crate::RuntimeHostContext;
use app_server_protocol::error_codes;
use app_server_protocol::AgentAppFetchCloudPackageParams;
use app_server_protocol::AgentAppInstalledDisabledSetParams;
use app_server_protocol::AgentAppInstalledSaveParams;
use app_server_protocol::AgentAppLocalPackageInspectParams;
use app_server_protocol::AgentAppShellPrepareParams;
use app_server_protocol::AgentAppUiRuntimeStartParams;
use app_server_protocol::AgentAppUiRuntimeStatusParams;
use app_server_protocol::AgentAppUiRuntimeStopParams;
use app_server_protocol::AgentAppUninstallParams;
use app_server_protocol::AgentAppUninstallRehearsalParams;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSessionActionReplayParams;
use app_server_protocol::AgentSessionActionRespondParams;
use app_server_protocol::AgentSessionAnalysisHandoffExportParams;
use app_server_protocol::AgentSessionCompactParams;
use app_server_protocol::AgentSessionEventParams;
use app_server_protocol::AgentSessionFileCheckpointDiffParams;
use app_server_protocol::AgentSessionFileCheckpointGetParams;
use app_server_protocol::AgentSessionFileCheckpointListParams;
use app_server_protocol::AgentSessionFileCheckpointRestoreParams;
use app_server_protocol::AgentSessionHandoffBundleExportParams;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::AgentSessionObjectiveAuditParams;
use app_server_protocol::AgentSessionObjectiveClearParams;
use app_server_protocol::AgentSessionObjectiveContinueParams;
use app_server_protocol::AgentSessionObjectiveReadParams;
use app_server_protocol::AgentSessionObjectiveSetParams;
use app_server_protocol::AgentSessionObjectiveStatusUpdateParams;
use app_server_protocol::AgentSessionQueuedTurnPromoteParams;
use app_server_protocol::AgentSessionQueuedTurnRemoveParams;
use app_server_protocol::AgentSessionReplayCaseExportParams;
use app_server_protocol::AgentSessionReviewDecisionSaveParams;
use app_server_protocol::AgentSessionReviewDecisionTemplateExportParams;
use app_server_protocol::AgentSessionThreadResumeParams;
use app_server_protocol::AgentSessionUpdateParams;
use app_server_protocol::ArtifactReadParams;
use app_server_protocol::AutomationJobCreateParams;
use app_server_protocol::AutomationJobHealthParams;
use app_server_protocol::AutomationJobIdParams;
use app_server_protocol::AutomationJobRunHistoryParams;
use app_server_protocol::AutomationJobUpdateParams;
use app_server_protocol::AutomationScheduleParams;
use app_server_protocol::AutomationSchedulerConfigUpdateParams;
use app_server_protocol::CapabilityListParams;
use app_server_protocol::ChannelProbeParams;
use app_server_protocol::ClientInfo;
use app_server_protocol::ConnectCallbackSendParams;
use app_server_protocol::ConnectDeepLinkResolveParams;
use app_server_protocol::ConnectOpenDeepLinkResolveParams;
use app_server_protocol::ConnectRelayApiKeySaveParams;
use app_server_protocol::EvidenceExportParams;
use app_server_protocol::FileSystemCreateDirectoryParams;
use app_server_protocol::FileSystemCreateFileParams;
use app_server_protocol::FileSystemDeleteFileParams;
use app_server_protocol::FileSystemListDirectoryParams;
use app_server_protocol::FileSystemReadFilePreviewParams;
use app_server_protocol::FileSystemRenameFileParams;
use app_server_protocol::GalleryMaterialFilterParams;
use app_server_protocol::GalleryMaterialLookupParams;
use app_server_protocol::GalleryMaterialMetadataCreateParams;
use app_server_protocol::GalleryMaterialMetadataUpdateParams;
use app_server_protocol::GatewayChannelStartParams;
use app_server_protocol::GatewayChannelStatusParams;
use app_server_protocol::GatewayChannelStopParams;
use app_server_protocol::GatewayTunnelCloudflaredInstallParams;
use app_server_protocol::GatewayTunnelCreateParams;
use app_server_protocol::GatewayTunnelSyncWebhookUrlParams;
use app_server_protocol::InitializeParams;
use app_server_protocol::InitializeResponse;
use app_server_protocol::JsonRpcError;
use app_server_protocol::JsonRpcErrorResponse;
use app_server_protocol::JsonRpcMessage;
use app_server_protocol::JsonRpcNotification;
use app_server_protocol::JsonRpcRequest;
use app_server_protocol::JsonRpcResponse;
use app_server_protocol::KnowledgeCompilePackParams;
use app_server_protocol::KnowledgeImportSourceParams;
use app_server_protocol::KnowledgeListPacksParams;
use app_server_protocol::KnowledgeReadPackParams;
use app_server_protocol::KnowledgeResolveContextParams;
use app_server_protocol::KnowledgeSetDefaultPackParams;
use app_server_protocol::KnowledgeUpdatePackStatusParams;
use app_server_protocol::KnowledgeValidateContextRunParams;
use app_server_protocol::LogPersistedTailParams;
use app_server_protocol::McpPromptGetParams;
use app_server_protocol::McpResourceReadParams;
use app_server_protocol::McpServerCreateParams;
use app_server_protocol::McpServerDeleteParams;
use app_server_protocol::McpServerEnabledSetParams;
use app_server_protocol::McpServerImportFromAppParams;
use app_server_protocol::McpServerStartParams;
use app_server_protocol::McpServerStopParams;
use app_server_protocol::McpServerUpdateParams;
use app_server_protocol::McpToolCallParams;
use app_server_protocol::McpToolCallWithCallerParams;
use app_server_protocol::McpToolListForContextParams;
use app_server_protocol::McpToolSearchParams;
use app_server_protocol::MediaTaskArtifactAudioCompleteParams;
use app_server_protocol::MediaTaskArtifactAudioCreateParams;
use app_server_protocol::MediaTaskArtifactImageCreateParams;
use app_server_protocol::MediaTaskArtifactListParams;
use app_server_protocol::MediaTaskArtifactLookupParams;
use app_server_protocol::MediaTaskArtifactVideoCreateParams;
use app_server_protocol::ModelListParams;
use app_server_protocol::ModelProviderAliasReadParams;
use app_server_protocol::ModelProviderConfigExportParams;
use app_server_protocol::ModelProviderConfigImportParams;
use app_server_protocol::ModelProviderCreateParams;
use app_server_protocol::ModelProviderDeleteParams;
use app_server_protocol::ModelProviderFetchModelsParams;
use app_server_protocol::ModelProviderKeyCreateParams;
use app_server_protocol::ModelProviderKeyDeleteParams;
use app_server_protocol::ModelProviderKeyEventParams;
use app_server_protocol::ModelProviderKeyNextParams;
use app_server_protocol::ModelProviderKeyUpdateParams;
use app_server_protocol::ModelProviderReadParams;
use app_server_protocol::ModelProviderSortOrdersUpdateParams;
use app_server_protocol::ModelProviderTestChatParams;
use app_server_protocol::ModelProviderTestConnectionParams;
use app_server_protocol::ModelProviderUiStateReadParams;
use app_server_protocol::ModelProviderUiStateWriteParams;
use app_server_protocol::ModelProviderUpdateParams;
use app_server_protocol::PlatformInfo;
// ProjectGit* 类型已移至 processor/project_git.rs
use app_server_protocol::ProjectMaterialImportFromUrlParams;
use app_server_protocol::ProjectMaterialListParams;
use app_server_protocol::ProjectMaterialLookupParams;
use app_server_protocol::ProjectMaterialUpdateParams;
use app_server_protocol::ProjectMaterialUploadParams;
use app_server_protocol::ProjectMemoryReadParams;
use app_server_protocol::ServerCapabilities;
use app_server_protocol::ServerInfo;
use app_server_protocol::SessionFileGetOrCreateParams;
use app_server_protocol::SessionFileIdParams;
use app_server_protocol::SessionFileSaveParams;
use app_server_protocol::SessionFileUpdateMetaParams;
use app_server_protocol::SkillDownloadInstallParams;
use app_server_protocol::SkillLocalDetailInspectParams;
use app_server_protocol::SkillLocalImportParams;
use app_server_protocol::SkillLocalInspectParams;
use app_server_protocol::SkillLocalRenameParams;
use app_server_protocol::SkillManagementInstallParams;
use app_server_protocol::SkillManagementListParams;
use app_server_protocol::SkillManagementUninstallParams;
use app_server_protocol::SkillMarketplaceInstallParams;
use app_server_protocol::SkillPackageExportParams;
use app_server_protocol::SkillPackageLocalInspectParams;
use app_server_protocol::SkillPackageLocalInstallParams;
use app_server_protocol::SkillPackageLocalReplaceParams;
use app_server_protocol::SkillReadParams;
use app_server_protocol::SkillRemoteInspectParams;
use app_server_protocol::SkillRepositoryDeleteParams;
use app_server_protocol::SkillRepositorySaveParams;
use app_server_protocol::SkillScaffoldCreateParams;
use app_server_protocol::UnifiedMemoryAnalyzeParams;
use app_server_protocol::UnifiedMemoryCreateParams;
use app_server_protocol::UnifiedMemoryDeleteParams;
use app_server_protocol::UnifiedMemoryGetParams;
use app_server_protocol::UnifiedMemoryHybridSearchParams;
use app_server_protocol::UnifiedMemoryListParams;
use app_server_protocol::UnifiedMemorySearchParams;
use app_server_protocol::UnifiedMemorySemanticSearchParams;
use app_server_protocol::UnifiedMemoryUpdateParams;
use app_server_protocol::UsageStatsRangeParams;
use app_server_protocol::VoiceAsrCredentialCreateParams;
use app_server_protocol::VoiceAsrCredentialIdParams;
use app_server_protocol::VoiceAsrCredentialUpdateParams;
use app_server_protocol::VoiceInstructionIdParams;
use app_server_protocol::VoiceInstructionSaveParams;
use app_server_protocol::VoiceModelDefaultSetParams;
use app_server_protocol::VoiceModelTestTranscribeFileParams;
use app_server_protocol::WechatChannelAccountRemoveParams;
use app_server_protocol::WechatLoginStartParams;
use app_server_protocol::WechatLoginWaitParams;
use app_server_protocol::WechatRuntimeModelSetParams;
use app_server_protocol::WorkspaceEnsureParams;
use app_server_protocol::WorkspaceEnsureProjectParams;
use app_server_protocol::WorkspacePathReadParams;
use app_server_protocol::WorkspaceProjectPathResolveParams;
use app_server_protocol::WorkspaceReadParams;
use app_server_protocol::WorkspaceRegisteredSkillsListParams;
use app_server_protocol::WorkspaceSkillBindingsListParams;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_DISABLED_SET;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_LIST;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_SAVE;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_UNINSTALL;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL;
use app_server_protocol::METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT;
use app_server_protocol::METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD;
use app_server_protocol::METHOD_AGENT_APP_SHELL_PREPARE;
use app_server_protocol::METHOD_AGENT_APP_UI_RUNTIME_START;
use app_server_protocol::METHOD_AGENT_APP_UI_RUNTIME_STATUS;
use app_server_protocol::METHOD_AGENT_APP_UI_RUNTIME_STOP;
use app_server_protocol::METHOD_AGENT_SESSION_ACTION_REPLAY;
use app_server_protocol::METHOD_AGENT_SESSION_ACTION_RESPOND;
use app_server_protocol::METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT;
use app_server_protocol::METHOD_AGENT_SESSION_COMPACT;
use app_server_protocol::METHOD_AGENT_SESSION_EVENT;
use app_server_protocol::METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF;
use app_server_protocol::METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET;
use app_server_protocol::METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST;
use app_server_protocol::METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE;
use app_server_protocol::METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT;
use app_server_protocol::METHOD_AGENT_SESSION_LIST;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_AUDIT;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_CLEAR;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_READ;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_SET;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE;
use app_server_protocol::METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE;
use app_server_protocol::METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE;
use app_server_protocol::METHOD_AGENT_SESSION_READ;
use app_server_protocol::METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT;
use app_server_protocol::METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE;
use app_server_protocol::METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT;
use app_server_protocol::METHOD_AGENT_SESSION_START;
use app_server_protocol::METHOD_AGENT_SESSION_THREAD_RESUME;
use app_server_protocol::METHOD_AGENT_SESSION_TURN_CANCEL;
use app_server_protocol::METHOD_AGENT_SESSION_TURN_START;
use app_server_protocol::METHOD_AGENT_SESSION_UPDATE;
use app_server_protocol::METHOD_ARTIFACT_READ;
use app_server_protocol::METHOD_AUTOMATION_JOB_CREATE;
use app_server_protocol::METHOD_AUTOMATION_JOB_DELETE;
use app_server_protocol::METHOD_AUTOMATION_JOB_HEALTH;
use app_server_protocol::METHOD_AUTOMATION_JOB_LIST;
use app_server_protocol::METHOD_AUTOMATION_JOB_READ;
use app_server_protocol::METHOD_AUTOMATION_JOB_RUN_HISTORY;
use app_server_protocol::METHOD_AUTOMATION_JOB_RUN_NOW;
use app_server_protocol::METHOD_AUTOMATION_JOB_UPDATE;
use app_server_protocol::METHOD_AUTOMATION_SCHEDULER_CONFIG_READ;
use app_server_protocol::METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE;
use app_server_protocol::METHOD_AUTOMATION_SCHEDULER_STATUS;
use app_server_protocol::METHOD_AUTOMATION_SCHEDULE_PREVIEW;
use app_server_protocol::METHOD_AUTOMATION_SCHEDULE_VALIDATE;
use app_server_protocol::METHOD_CAPABILITY_LIST;
use app_server_protocol::METHOD_CONNECT_CALLBACK_SEND;
use app_server_protocol::METHOD_CONNECT_DEEP_LINK_RESOLVE;
use app_server_protocol::METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE;
use app_server_protocol::METHOD_CONNECT_RELAY_API_KEY_SAVE;
use app_server_protocol::METHOD_DIAGNOSTICS_LOG_STORAGE_READ;
use app_server_protocol::METHOD_DIAGNOSTICS_SERVER_READ;
use app_server_protocol::METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT;
use app_server_protocol::METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ;
use app_server_protocol::METHOD_DISCORD_CHANNEL_PROBE;
use app_server_protocol::METHOD_EVIDENCE_EXPORT;
use app_server_protocol::METHOD_FEISHU_CHANNEL_PROBE;
use app_server_protocol::METHOD_FILE_SYSTEM_CREATE_DIRECTORY;
use app_server_protocol::METHOD_FILE_SYSTEM_CREATE_FILE;
use app_server_protocol::METHOD_FILE_SYSTEM_DELETE_FILE;
use app_server_protocol::METHOD_FILE_SYSTEM_LIST_DIRECTORY;
use app_server_protocol::METHOD_FILE_SYSTEM_READ_FILE_PREVIEW;
use app_server_protocol::METHOD_FILE_SYSTEM_RENAME_FILE;
use app_server_protocol::METHOD_GALLERY_MATERIAL_GET;
use app_server_protocol::METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY;
use app_server_protocol::METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY;
use app_server_protocol::METHOD_GALLERY_MATERIAL_LIST_BY_MOOD;
use app_server_protocol::METHOD_GALLERY_MATERIAL_METADATA_CREATE;
use app_server_protocol::METHOD_GALLERY_MATERIAL_METADATA_DELETE;
use app_server_protocol::METHOD_GALLERY_MATERIAL_METADATA_GET;
use app_server_protocol::METHOD_GALLERY_MATERIAL_METADATA_UPDATE;
use app_server_protocol::METHOD_GATEWAY_CHANNEL_START;
use app_server_protocol::METHOD_GATEWAY_CHANNEL_STATUS;
use app_server_protocol::METHOD_GATEWAY_CHANNEL_STOP;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_CREATE;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_PROBE;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_RESTART;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_START;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_STATUS;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_STOP;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL;
use app_server_protocol::METHOD_INITIALIZE;
use app_server_protocol::METHOD_INITIALIZED;
use app_server_protocol::METHOD_KNOWLEDGE_CONTEXT_RESOLVE;
use app_server_protocol::METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_COMPILE;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_DEFAULT_SET;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_LIST;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_READ;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_STATUS_UPDATE;
use app_server_protocol::METHOD_KNOWLEDGE_SOURCE_IMPORT;
use app_server_protocol::METHOD_LOG_CLEAR;
use app_server_protocol::METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR;
use app_server_protocol::METHOD_LOG_LIST;
use app_server_protocol::METHOD_LOG_PERSISTED_TAIL;
use app_server_protocol::METHOD_MCP_PROMPT_GET;
use app_server_protocol::METHOD_MCP_PROMPT_LIST;
use app_server_protocol::METHOD_MCP_RESOURCE_LIST;
use app_server_protocol::METHOD_MCP_RESOURCE_READ;
use app_server_protocol::METHOD_MCP_SERVER_CREATE;
use app_server_protocol::METHOD_MCP_SERVER_DELETE;
use app_server_protocol::METHOD_MCP_SERVER_ENABLED_SET;
use app_server_protocol::METHOD_MCP_SERVER_IMPORT_FROM_APP;
use app_server_protocol::METHOD_MCP_SERVER_LIST;
use app_server_protocol::METHOD_MCP_SERVER_START;
use app_server_protocol::METHOD_MCP_SERVER_STATUS_LIST;
use app_server_protocol::METHOD_MCP_SERVER_STOP;
use app_server_protocol::METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE;
use app_server_protocol::METHOD_MCP_SERVER_UPDATE;
use app_server_protocol::METHOD_MCP_TOOL_CALL;
use app_server_protocol::METHOD_MCP_TOOL_CALL_WITH_CALLER;
use app_server_protocol::METHOD_MCP_TOOL_LIST;
use app_server_protocol::METHOD_MCP_TOOL_LIST_FOR_CONTEXT;
use app_server_protocol::METHOD_MCP_TOOL_SEARCH;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_CANCEL;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_GET;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_LIST;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE;
use app_server_protocol::METHOD_MODEL_LIST;
use app_server_protocol::METHOD_MODEL_PREFERENCES_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_ALIAS_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_ALIAS_READ;
use app_server_protocol::METHOD_MODEL_PROVIDER_CATALOG_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_CONFIG_EXPORT;
use app_server_protocol::METHOD_MODEL_PROVIDER_CONFIG_IMPORT;
use app_server_protocol::METHOD_MODEL_PROVIDER_CREATE;
use app_server_protocol::METHOD_MODEL_PROVIDER_DELETE;
use app_server_protocol::METHOD_MODEL_PROVIDER_FETCH_MODELS;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_CREATE;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_DELETE;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_NEXT;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_UPDATE;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD;
use app_server_protocol::METHOD_MODEL_PROVIDER_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_READ;
use app_server_protocol::METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE;
use app_server_protocol::METHOD_MODEL_PROVIDER_TEST_CHAT;
use app_server_protocol::METHOD_MODEL_PROVIDER_TEST_CONNECTION;
use app_server_protocol::METHOD_MODEL_PROVIDER_UI_STATE_READ;
use app_server_protocol::METHOD_MODEL_PROVIDER_UI_STATE_WRITE;
use app_server_protocol::METHOD_MODEL_PROVIDER_UPDATE;
use app_server_protocol::METHOD_MODEL_SYNC_STATE_READ;
use app_server_protocol::METHOD_PROJECT_GIT_BRANCH_CHECKOUT;
use app_server_protocol::METHOD_PROJECT_GIT_BRANCH_CREATE;
use app_server_protocol::METHOD_PROJECT_GIT_STATUS;
use app_server_protocol::METHOD_PROJECT_GIT_WORKTREE_CREATE;
use app_server_protocol::METHOD_PROJECT_MATERIAL_CONTENT;
use app_server_protocol::METHOD_PROJECT_MATERIAL_COUNT;
use app_server_protocol::METHOD_PROJECT_MATERIAL_DELETE;
use app_server_protocol::METHOD_PROJECT_MATERIAL_GET;
use app_server_protocol::METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL;
use app_server_protocol::METHOD_PROJECT_MATERIAL_LIST;
use app_server_protocol::METHOD_PROJECT_MATERIAL_UPDATE;
use app_server_protocol::METHOD_PROJECT_MATERIAL_UPLOAD;
use app_server_protocol::METHOD_PROJECT_MEMORY_READ;
use app_server_protocol::METHOD_SESSION_FILE_DELETE;
use app_server_protocol::METHOD_SESSION_FILE_GET_OR_CREATE;
use app_server_protocol::METHOD_SESSION_FILE_LIST;
use app_server_protocol::METHOD_SESSION_FILE_READ;
use app_server_protocol::METHOD_SESSION_FILE_RESOLVE_PATH;
use app_server_protocol::METHOD_SESSION_FILE_SAVE;
use app_server_protocol::METHOD_SESSION_FILE_UPDATE_META;
use app_server_protocol::METHOD_SKILL_CACHE_REFRESH;
use app_server_protocol::METHOD_SKILL_INSTALLED_DIRECTORIES_LIST;
use app_server_protocol::METHOD_SKILL_LIST;
use app_server_protocol::METHOD_SKILL_LOCAL_DETAIL_INSPECT;
use app_server_protocol::METHOD_SKILL_LOCAL_IMPORT;
use app_server_protocol::METHOD_SKILL_LOCAL_INSPECT;
use app_server_protocol::METHOD_SKILL_LOCAL_RENAME;
use app_server_protocol::METHOD_SKILL_LOCAL_SCAFFOLD_CREATE;
use app_server_protocol::METHOD_SKILL_MANAGEMENT_INSTALL;
use app_server_protocol::METHOD_SKILL_MANAGEMENT_LIST;
use app_server_protocol::METHOD_SKILL_MANAGEMENT_UNINSTALL;
use app_server_protocol::METHOD_SKILL_MARKETPLACE_INSTALL;
use app_server_protocol::METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL;
use app_server_protocol::METHOD_SKILL_PACKAGE_EXPORT;
use app_server_protocol::METHOD_SKILL_PACKAGE_LOCAL_INSPECT;
use app_server_protocol::METHOD_SKILL_PACKAGE_LOCAL_INSTALL;
use app_server_protocol::METHOD_SKILL_PACKAGE_LOCAL_REPLACE;
use app_server_protocol::METHOD_SKILL_READ;
use app_server_protocol::METHOD_SKILL_REMOTE_INSPECT;
use app_server_protocol::METHOD_SKILL_REPOSITORY_DELETE;
use app_server_protocol::METHOD_SKILL_REPOSITORY_LIST;
use app_server_protocol::METHOD_SKILL_REPOSITORY_SAVE;
use app_server_protocol::METHOD_TELEGRAM_CHANNEL_PROBE;
use app_server_protocol::METHOD_UNIFIED_MEMORY_ANALYZE;
use app_server_protocol::METHOD_UNIFIED_MEMORY_CREATE;
use app_server_protocol::METHOD_UNIFIED_MEMORY_DELETE;
use app_server_protocol::METHOD_UNIFIED_MEMORY_GET;
use app_server_protocol::METHOD_UNIFIED_MEMORY_HYBRID_SEARCH;
use app_server_protocol::METHOD_UNIFIED_MEMORY_LIST;
use app_server_protocol::METHOD_UNIFIED_MEMORY_SEARCH;
use app_server_protocol::METHOD_UNIFIED_MEMORY_SEMANTIC_SEARCH;
use app_server_protocol::METHOD_UNIFIED_MEMORY_STATS;
use app_server_protocol::METHOD_UNIFIED_MEMORY_UPDATE;
use app_server_protocol::METHOD_USAGE_STATS_DAILY_TRENDS_LIST;
use app_server_protocol::METHOD_USAGE_STATS_MODEL_RANKING_LIST;
use app_server_protocol::METHOD_USAGE_STATS_READ;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_CREATE;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_DELETE;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_LIST;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_TEST;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_UPDATE;
use app_server_protocol::METHOD_VOICE_INSTRUCTION_DELETE;
use app_server_protocol::METHOD_VOICE_INSTRUCTION_LIST;
use app_server_protocol::METHOD_VOICE_INSTRUCTION_SAVE;
use app_server_protocol::METHOD_VOICE_MODEL_DEFAULT_SET;
use app_server_protocol::METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE;
use app_server_protocol::METHOD_WECHAT_CHANNEL_ACCOUNT_LIST;
use app_server_protocol::METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE;
use app_server_protocol::METHOD_WECHAT_CHANNEL_LOGIN_START;
use app_server_protocol::METHOD_WECHAT_CHANNEL_LOGIN_WAIT;
use app_server_protocol::METHOD_WECHAT_CHANNEL_PROBE;
use app_server_protocol::METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET;
use app_server_protocol::METHOD_WORKSPACE_BY_PATH_READ;
use app_server_protocol::METHOD_WORKSPACE_DEFAULT_ENSURE;
use app_server_protocol::METHOD_WORKSPACE_DEFAULT_READ;
use app_server_protocol::METHOD_WORKSPACE_ENSURE;
use app_server_protocol::METHOD_WORKSPACE_ENSURE_READY;
use app_server_protocol::METHOD_WORKSPACE_LIST;
use app_server_protocol::METHOD_WORKSPACE_PROJECTS_ROOT_READ;
use app_server_protocol::METHOD_WORKSPACE_PROJECT_PATH_RESOLVE;
use app_server_protocol::METHOD_WORKSPACE_READ;
use app_server_protocol::METHOD_WORKSPACE_REGISTERED_SKILLS_LIST;
use app_server_protocol::METHOD_WORKSPACE_SKILL_BINDINGS_LIST;
use app_server_protocol::PROTOCOL_VERSION;
use app_server_protocol::SERVER_NAME;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::sync::Arc;
use std::sync::Mutex;

#[derive(Clone)]
pub struct RequestProcessor {
    state: Arc<Mutex<ProcessorState>>,
    runtime: RuntimeCore,
}

#[derive(Debug, Default)]
struct ProcessorState {
    initialize_accepted: bool,
    initialized: bool,
    client_info: Option<ClientInfo>,
}

impl RequestProcessor {
    pub fn new(runtime: RuntimeCore) -> Self {
        Self {
            state: Arc::new(Mutex::new(ProcessorState::default())),
            runtime,
        }
    }

    pub fn runtime(&self) -> &RuntimeCore {
        &self.runtime
    }

    pub async fn handle_request(
        &self,
        request: JsonRpcRequest,
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        self.handle_request_inner(request, None).await
    }

    pub async fn handle_request_streaming(
        &self,
        request: JsonRpcRequest,
        event_callback: &mut (dyn FnMut(JsonRpcMessage) + Send),
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        self.handle_request_inner(request, Some(event_callback))
            .await
    }

    async fn handle_request_inner(
        &self,
        request: JsonRpcRequest,
        event_callback: Option<&mut (dyn FnMut(JsonRpcMessage) + Send)>,
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        let JsonRpcRequest { id, method, params } = request;
        let result = match method.as_str() {
            METHOD_INITIALIZE => self.initialize(params).map(RpcDispatch::single),
            METHOD_CAPABILITY_LIST => self.handle_capability_list(params),
            METHOD_ARTIFACT_READ => self.handle_artifact_read(params),
            METHOD_FILE_SYSTEM_LIST_DIRECTORY => {
                self.handle_file_system_list_directory(params).await
            }
            METHOD_FILE_SYSTEM_READ_FILE_PREVIEW => {
                self.handle_file_system_read_file_preview(params).await
            }
            METHOD_FILE_SYSTEM_CREATE_FILE => self.handle_file_system_create_file(params).await,
            METHOD_FILE_SYSTEM_CREATE_DIRECTORY => {
                self.handle_file_system_create_directory(params).await
            }
            METHOD_FILE_SYSTEM_RENAME_FILE => self.handle_file_system_rename_file(params).await,
            METHOD_FILE_SYSTEM_DELETE_FILE => self.handle_file_system_delete_file(params).await,
            METHOD_PROJECT_GIT_STATUS => self.handle_project_git_status_impl(params).await,
            METHOD_PROJECT_GIT_BRANCH_CHECKOUT => {
                self.handle_project_git_branch_checkout_impl(params).await
            }
            METHOD_PROJECT_GIT_BRANCH_CREATE => self.handle_project_git_branch_create_impl(params).await,
            METHOD_PROJECT_GIT_WORKTREE_CREATE => {
                self.handle_project_git_worktree_create_impl(params).await
            }
            METHOD_EVIDENCE_EXPORT => self.handle_evidence_export(params).await,
            METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT => {
                self.handle_handoff_bundle_export(params).await
            }
            METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT => self.handle_replay_case_export(params).await,
            METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT => {
                self.handle_analysis_handoff_export(params).await
            }
            METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT => {
                self.handle_review_decision_template_export(params).await
            }
            METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE => {
                self.handle_review_decision_save(params).await
            }
            METHOD_AGENT_SESSION_LIST => self.handle_session_list(params).await,
            METHOD_AGENT_SESSION_UPDATE => self.handle_session_update(params).await,
            METHOD_AGENT_SESSION_OBJECTIVE_READ => self.handle_objective_read(params).await,
            METHOD_AGENT_SESSION_OBJECTIVE_SET => self.handle_objective_set(params).await,
            METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE => {
                self.handle_objective_status_update(params).await
            }
            METHOD_AGENT_SESSION_OBJECTIVE_CLEAR => self.handle_objective_clear(params).await,
            METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE => self.handle_objective_continue(params).await,
            METHOD_AGENT_SESSION_OBJECTIVE_AUDIT => self.handle_objective_audit(params).await,
            METHOD_AGENT_SESSION_COMPACT => self.handle_session_compact(params).await,
            METHOD_AGENT_SESSION_THREAD_RESUME => self.handle_session_thread_resume(params).await,
            METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE => {
                self.handle_session_queued_turn_remove(params).await
            }
            METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE => {
                self.handle_session_queued_turn_promote(params).await
            }
            METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST => {
                self.handle_file_checkpoint_list(params).await
            }
            METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET => {
                self.handle_file_checkpoint_get(params).await
            }
            METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF => {
                self.handle_file_checkpoint_diff(params).await
            }
            METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE => {
                self.handle_file_checkpoint_restore(params).await
            }
            METHOD_SESSION_FILE_GET_OR_CREATE => {
                self.handle_session_file_get_or_create(params).await
            }
            METHOD_SESSION_FILE_UPDATE_META => self.handle_session_file_update_meta(params).await,
            METHOD_SESSION_FILE_SAVE => self.handle_session_file_save(params).await,
            METHOD_SESSION_FILE_READ => self.handle_session_file_read(params).await,
            METHOD_SESSION_FILE_RESOLVE_PATH => self.handle_session_file_resolve_path(params).await,
            METHOD_SESSION_FILE_DELETE => self.handle_session_file_delete(params).await,
            METHOD_SESSION_FILE_LIST => self.handle_session_file_list(params).await,
            METHOD_AGENT_SESSION_START => self.handle_session_start(params),
            METHOD_AGENT_SESSION_READ => self.handle_session_read(params).await,
            METHOD_WORKSPACE_LIST => self.handle_workspace_list().await,
            METHOD_WORKSPACE_READ => self.handle_workspace_read(params).await,
            METHOD_WORKSPACE_ENSURE => self.handle_workspace_ensure(params).await,
            METHOD_WORKSPACE_BY_PATH_READ => self.handle_workspace_by_path_read(params).await,
            METHOD_WORKSPACE_DEFAULT_READ => self.handle_workspace_default_read().await,
            METHOD_WORKSPACE_DEFAULT_ENSURE => self.handle_workspace_default_ensure().await,
            METHOD_WORKSPACE_PROJECTS_ROOT_READ => self.handle_workspace_projects_root_read().await,
            METHOD_WORKSPACE_PROJECT_PATH_RESOLVE => {
                self.handle_workspace_project_path_resolve(params).await
            }
            METHOD_WORKSPACE_ENSURE_READY => self.handle_workspace_ensure_ready(params).await,
            METHOD_SKILL_LIST => self.handle_skill_list().await,
            METHOD_SKILL_READ => self.handle_skill_read(params).await,
            METHOD_SKILL_MANAGEMENT_LIST => self.handle_skill_management_list(params).await,
            METHOD_SKILL_MANAGEMENT_INSTALL => self.handle_skill_management_install(params).await,
            METHOD_SKILL_MANAGEMENT_UNINSTALL => {
                self.handle_skill_management_uninstall(params).await
            }
            METHOD_SKILL_REPOSITORY_LIST => self.handle_skill_repository_list().await,
            METHOD_SKILL_REPOSITORY_SAVE => self.handle_skill_repository_save(params).await,
            METHOD_SKILL_REPOSITORY_DELETE => self.handle_skill_repository_delete(params).await,
            METHOD_SKILL_CACHE_REFRESH => self.handle_skill_cache_refresh().await,
            METHOD_SKILL_INSTALLED_DIRECTORIES_LIST => {
                self.handle_skill_installed_directories_list().await
            }
            METHOD_SKILL_LOCAL_INSPECT => self.handle_skill_local_inspect(params).await,
            METHOD_SKILL_LOCAL_DETAIL_INSPECT => {
                self.handle_skill_local_detail_inspect(params).await
            }
            METHOD_SKILL_LOCAL_SCAFFOLD_CREATE => {
                self.handle_skill_local_scaffold_create(params).await
            }
            METHOD_SKILL_LOCAL_IMPORT => self.handle_skill_local_import(params).await,
            METHOD_SKILL_LOCAL_RENAME => self.handle_skill_local_rename(params).await,
            METHOD_SKILL_REMOTE_INSPECT => self.handle_skill_remote_inspect(params).await,
            METHOD_SKILL_PACKAGE_LOCAL_INSPECT => {
                self.handle_skill_package_local_inspect(params).await
            }
            METHOD_SKILL_PACKAGE_LOCAL_INSTALL => {
                self.handle_skill_package_local_install(params).await
            }
            METHOD_SKILL_PACKAGE_LOCAL_REPLACE => {
                self.handle_skill_package_local_replace(params).await
            }
            METHOD_SKILL_PACKAGE_EXPORT => self.handle_skill_package_export(params).await,
            METHOD_SKILL_MARKETPLACE_INSTALL => self.handle_skill_marketplace_install(params).await,
            METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL => {
                self.handle_skill_download_install(params).await
            }
            METHOD_GATEWAY_CHANNEL_START => self.handle_gateway_channel_start(params).await,
            METHOD_GATEWAY_CHANNEL_STOP => self.handle_gateway_channel_stop(params).await,
            METHOD_GATEWAY_CHANNEL_STATUS => self.handle_gateway_channel_status(params).await,
            METHOD_GATEWAY_TUNNEL_PROBE => self.handle_gateway_tunnel_probe().await,
            METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT => {
                self.handle_gateway_tunnel_cloudflared_detect().await
            }
            METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL => {
                self.handle_gateway_tunnel_cloudflared_install(params).await
            }
            METHOD_GATEWAY_TUNNEL_CREATE => self.handle_gateway_tunnel_create(params).await,
            METHOD_GATEWAY_TUNNEL_START => self.handle_gateway_tunnel_start().await,
            METHOD_GATEWAY_TUNNEL_STOP => self.handle_gateway_tunnel_stop().await,
            METHOD_GATEWAY_TUNNEL_RESTART => self.handle_gateway_tunnel_restart().await,
            METHOD_GATEWAY_TUNNEL_STATUS => self.handle_gateway_tunnel_status().await,
            METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL => {
                self.handle_gateway_tunnel_sync_webhook_url(params).await
            }
            METHOD_TELEGRAM_CHANNEL_PROBE => self.handle_telegram_channel_probe(params).await,
            METHOD_FEISHU_CHANNEL_PROBE => self.handle_feishu_channel_probe(params).await,
            METHOD_DISCORD_CHANNEL_PROBE => self.handle_discord_channel_probe(params).await,
            METHOD_WECHAT_CHANNEL_PROBE => self.handle_wechat_channel_probe(params).await,
            METHOD_WECHAT_CHANNEL_LOGIN_START => {
                self.handle_wechat_channel_login_start(params).await
            }
            METHOD_WECHAT_CHANNEL_LOGIN_WAIT => self.handle_wechat_channel_login_wait(params).await,
            METHOD_WECHAT_CHANNEL_ACCOUNT_LIST => self.handle_wechat_channel_account_list().await,
            METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE => {
                self.handle_wechat_channel_account_remove(params).await
            }
            METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET => {
                self.handle_wechat_channel_runtime_model_set(params).await
            }
            METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE => {
                self.handle_media_task_artifact_image_create(params).await
            }
            METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE => {
                self.handle_media_task_artifact_audio_create(params).await
            }
            METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE => {
                self.handle_media_task_artifact_video_create(params).await
            }
            METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE => {
                self.handle_media_task_artifact_audio_complete(params).await
            }
            METHOD_MEDIA_TASK_ARTIFACT_GET => self.handle_media_task_artifact_get(params).await,
            METHOD_MEDIA_TASK_ARTIFACT_LIST => self.handle_media_task_artifact_list(params).await,
            METHOD_MEDIA_TASK_ARTIFACT_CANCEL => {
                self.handle_media_task_artifact_cancel(params).await
            }
            METHOD_GALLERY_MATERIAL_GET => self.handle_gallery_material_get(params).await,
            METHOD_GALLERY_MATERIAL_METADATA_CREATE => {
                self.handle_gallery_material_metadata_create(params).await
            }
            METHOD_GALLERY_MATERIAL_METADATA_GET => {
                self.handle_gallery_material_metadata_get(params).await
            }
            METHOD_GALLERY_MATERIAL_METADATA_UPDATE => {
                self.handle_gallery_material_metadata_update(params).await
            }
            METHOD_GALLERY_MATERIAL_METADATA_DELETE => {
                self.handle_gallery_material_metadata_delete(params).await
            }
            METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY => {
                self.handle_gallery_material_list_by_image_category(params)
                    .await
            }
            METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY => {
                self.handle_gallery_material_list_by_layout_category(params)
                    .await
            }
            METHOD_GALLERY_MATERIAL_LIST_BY_MOOD => {
                self.handle_gallery_material_list_by_mood(params).await
            }
            METHOD_PROJECT_MATERIAL_LIST => self.handle_project_material_list(params).await,
            METHOD_PROJECT_MATERIAL_GET => self.handle_project_material_get(params).await,
            METHOD_PROJECT_MATERIAL_COUNT => self.handle_project_material_count(params).await,
            METHOD_PROJECT_MATERIAL_UPLOAD => self.handle_project_material_upload(params).await,
            METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL => {
                self.handle_project_material_import_from_url(params).await
            }
            METHOD_PROJECT_MATERIAL_UPDATE => self.handle_project_material_update(params).await,
            METHOD_PROJECT_MATERIAL_DELETE => self.handle_project_material_delete(params).await,
            METHOD_PROJECT_MATERIAL_CONTENT => self.handle_project_material_content(params).await,
            METHOD_VOICE_ASR_CREDENTIAL_LIST => self.handle_voice_asr_credential_list().await,
            METHOD_VOICE_ASR_CREDENTIAL_CREATE => {
                self.handle_voice_asr_credential_create(params).await
            }
            METHOD_VOICE_ASR_CREDENTIAL_UPDATE => {
                self.handle_voice_asr_credential_update(params).await
            }
            METHOD_VOICE_ASR_CREDENTIAL_DELETE => {
                self.handle_voice_asr_credential_delete(params).await
            }
            METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET => {
                self.handle_voice_asr_credential_default_set(params).await
            }
            METHOD_VOICE_ASR_CREDENTIAL_TEST => self.handle_voice_asr_credential_test(params).await,
            METHOD_VOICE_INSTRUCTION_LIST => self.handle_voice_instruction_list().await,
            METHOD_VOICE_INSTRUCTION_SAVE => self.handle_voice_instruction_save(params).await,
            METHOD_VOICE_INSTRUCTION_DELETE => self.handle_voice_instruction_delete(params).await,
            METHOD_VOICE_MODEL_DEFAULT_SET => self.handle_voice_model_default_set(params).await,
            METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE => {
                self.handle_voice_model_test_transcribe_file(params).await
            }
            METHOD_WORKSPACE_SKILL_BINDINGS_LIST => {
                self.handle_workspace_skill_bindings_list(params).await
            }
            METHOD_WORKSPACE_REGISTERED_SKILLS_LIST => {
                self.handle_workspace_registered_skills_list(params).await
            }
            METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT => {
                self.handle_agent_app_local_package_inspect(params).await
            }
            METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD => {
                self.handle_agent_app_package_fetch_cloud(params).await
            }
            METHOD_AGENT_APP_INSTALLED_SAVE => self.handle_agent_app_installed_save(params).await,
            METHOD_AGENT_APP_INSTALLED_LIST => self.handle_agent_app_installed_list().await,
            METHOD_AGENT_APP_INSTALLED_DISABLED_SET => {
                self.handle_agent_app_installed_disabled_set(params).await
            }
            METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL => {
                self.handle_agent_app_installed_uninstall_rehearsal(params)
                    .await
            }
            METHOD_AGENT_APP_INSTALLED_UNINSTALL => {
                self.handle_agent_app_installed_uninstall(params).await
            }
            METHOD_AGENT_APP_SHELL_PREPARE => self.handle_agent_app_shell_prepare(params).await,
            METHOD_AGENT_APP_UI_RUNTIME_START => {
                self.handle_agent_app_ui_runtime_start(params).await
            }
            METHOD_AGENT_APP_UI_RUNTIME_STATUS => {
                self.handle_agent_app_ui_runtime_status(params).await
            }
            METHOD_AGENT_APP_UI_RUNTIME_STOP => self.handle_agent_app_ui_runtime_stop(params).await,
            METHOD_KNOWLEDGE_PACK_LIST => self.handle_knowledge_pack_list(params).await,
            METHOD_KNOWLEDGE_PACK_READ => self.handle_knowledge_pack_read(params).await,
            METHOD_KNOWLEDGE_SOURCE_IMPORT => self.handle_knowledge_source_import(params).await,
            METHOD_KNOWLEDGE_PACK_COMPILE => self.handle_knowledge_pack_compile(params).await,
            METHOD_KNOWLEDGE_PACK_DEFAULT_SET => {
                self.handle_knowledge_pack_default_set(params).await
            }
            METHOD_KNOWLEDGE_PACK_STATUS_UPDATE => {
                self.handle_knowledge_pack_status_update(params).await
            }
            METHOD_KNOWLEDGE_CONTEXT_RESOLVE => self.handle_knowledge_context_resolve(params).await,
            METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE => {
                self.handle_knowledge_context_run_validate(params).await
            }
            METHOD_AUTOMATION_SCHEDULER_CONFIG_READ => {
                self.handle_automation_scheduler_config_read().await
            }
            METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE => {
                self.handle_automation_scheduler_config_update(params).await
            }
            METHOD_AUTOMATION_SCHEDULER_STATUS => self.handle_automation_scheduler_status().await,
            METHOD_AUTOMATION_JOB_LIST => self.handle_automation_job_list().await,
            METHOD_AUTOMATION_JOB_READ => self.handle_automation_job_read(params).await,
            METHOD_AUTOMATION_JOB_CREATE => self.handle_automation_job_create(params).await,
            METHOD_AUTOMATION_JOB_UPDATE => self.handle_automation_job_update(params).await,
            METHOD_AUTOMATION_JOB_DELETE => self.handle_automation_job_delete(params).await,
            METHOD_AUTOMATION_JOB_RUN_NOW => self.handle_automation_job_run_now(params).await,
            METHOD_AUTOMATION_JOB_HEALTH => self.handle_automation_job_health(params).await,
            METHOD_AUTOMATION_JOB_RUN_HISTORY => {
                self.handle_automation_job_run_history(params).await
            }
            METHOD_AUTOMATION_SCHEDULE_PREVIEW => {
                self.handle_automation_schedule_preview(params).await
            }
            METHOD_AUTOMATION_SCHEDULE_VALIDATE => {
                self.handle_automation_schedule_validate(params).await
            }
            METHOD_MCP_SERVER_LIST => self.handle_mcp_server_list().await,
            METHOD_MCP_SERVER_STATUS_LIST => self.handle_mcp_server_status_list().await,
            METHOD_MCP_SERVER_CREATE => self.handle_mcp_server_create(params).await,
            METHOD_MCP_SERVER_UPDATE => self.handle_mcp_server_update(params).await,
            METHOD_MCP_SERVER_DELETE => self.handle_mcp_server_delete(params).await,
            METHOD_MCP_SERVER_ENABLED_SET => self.handle_mcp_server_enabled_set(params).await,
            METHOD_MCP_SERVER_IMPORT_FROM_APP => {
                self.handle_mcp_server_import_from_app(params).await
            }
            METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE => self.handle_mcp_server_sync_all_to_live().await,
            METHOD_MCP_SERVER_START => self.handle_mcp_server_start(params).await,
            METHOD_MCP_SERVER_STOP => self.handle_mcp_server_stop(params).await,
            METHOD_MCP_TOOL_LIST => self.handle_mcp_tool_list().await,
            METHOD_MCP_TOOL_LIST_FOR_CONTEXT => self.handle_mcp_tool_list_for_context(params).await,
            METHOD_MCP_TOOL_SEARCH => self.handle_mcp_tool_search(params).await,
            METHOD_MCP_TOOL_CALL => self.handle_mcp_tool_call(params).await,
            METHOD_MCP_TOOL_CALL_WITH_CALLER => self.handle_mcp_tool_call_with_caller(params).await,
            METHOD_MCP_PROMPT_LIST => self.handle_mcp_prompt_list().await,
            METHOD_MCP_PROMPT_GET => self.handle_mcp_prompt_get(params).await,
            METHOD_MCP_RESOURCE_LIST => self.handle_mcp_resource_list().await,
            METHOD_MCP_RESOURCE_READ => self.handle_mcp_resource_read(params).await,
            METHOD_PROJECT_MEMORY_READ => self.handle_project_memory_read(params).await,
            METHOD_UNIFIED_MEMORY_LIST => self.handle_unified_memory_list(params).await,
            METHOD_UNIFIED_MEMORY_GET => self.handle_unified_memory_get(params).await,
            METHOD_UNIFIED_MEMORY_CREATE => self.handle_unified_memory_create(params).await,
            METHOD_UNIFIED_MEMORY_UPDATE => self.handle_unified_memory_update(params).await,
            METHOD_UNIFIED_MEMORY_DELETE => self.handle_unified_memory_delete(params).await,
            METHOD_UNIFIED_MEMORY_SEARCH => self.handle_unified_memory_search(params).await,
            METHOD_UNIFIED_MEMORY_STATS => self.handle_unified_memory_stats().await,
            METHOD_UNIFIED_MEMORY_ANALYZE => self.handle_unified_memory_analyze(params).await,
            METHOD_UNIFIED_MEMORY_SEMANTIC_SEARCH => {
                self.handle_unified_memory_semantic_search(params).await
            }
            METHOD_UNIFIED_MEMORY_HYBRID_SEARCH => {
                self.handle_unified_memory_hybrid_search(params).await
            }
            METHOD_LOG_LIST => self.handle_log_list().await,
            METHOD_LOG_PERSISTED_TAIL => self.handle_log_persisted_tail(params).await,
            METHOD_LOG_CLEAR => self.handle_log_clear().await,
            METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR => self.handle_log_diagnostic_history_clear().await,
            METHOD_DIAGNOSTICS_LOG_STORAGE_READ => self.handle_diagnostics_log_storage_read().await,
            METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT => {
                self.handle_diagnostics_support_bundle_export().await
            }
            METHOD_DIAGNOSTICS_SERVER_READ => self.handle_diagnostics_server_read().await,
            METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ => {
                self.handle_diagnostics_windows_startup_read().await
            }
            METHOD_USAGE_STATS_READ => self.handle_usage_stats_read(params).await,
            METHOD_USAGE_STATS_MODEL_RANKING_LIST => {
                self.handle_usage_stats_model_ranking_list(params).await
            }
            METHOD_USAGE_STATS_DAILY_TRENDS_LIST => {
                self.handle_usage_stats_daily_trends_list(params).await
            }
            METHOD_MODEL_LIST => self.handle_model_list(params).await,
            METHOD_MODEL_PREFERENCES_LIST => self.handle_model_preferences_list().await,
            METHOD_MODEL_SYNC_STATE_READ => self.handle_model_sync_state_read().await,
            METHOD_MODEL_PROVIDER_LIST => self.handle_model_provider_list().await,
            METHOD_MODEL_PROVIDER_CATALOG_LIST => self.handle_model_provider_catalog_list().await,
            METHOD_MODEL_PROVIDER_READ => self.handle_model_provider_read(params).await,
            METHOD_MODEL_PROVIDER_CREATE => self.handle_model_provider_create(params).await,
            METHOD_MODEL_PROVIDER_UPDATE => self.handle_model_provider_update(params).await,
            METHOD_MODEL_PROVIDER_DELETE => self.handle_model_provider_delete(params).await,
            METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE => {
                self.handle_model_provider_sort_orders_update(params).await
            }
            METHOD_MODEL_PROVIDER_CONFIG_EXPORT => {
                self.handle_model_provider_config_export(params).await
            }
            METHOD_MODEL_PROVIDER_CONFIG_IMPORT => {
                self.handle_model_provider_config_import(params).await
            }
            METHOD_MODEL_PROVIDER_TEST_CONNECTION => {
                self.handle_model_provider_test_connection(params).await
            }
            METHOD_MODEL_PROVIDER_TEST_CHAT => self.handle_model_provider_test_chat(params).await,
            METHOD_MODEL_PROVIDER_FETCH_MODELS => {
                self.handle_model_provider_fetch_models(params).await
            }
            METHOD_MODEL_PROVIDER_KEY_CREATE => self.handle_model_provider_key_create(params).await,
            METHOD_MODEL_PROVIDER_KEY_UPDATE => self.handle_model_provider_key_update(params).await,
            METHOD_MODEL_PROVIDER_KEY_DELETE => self.handle_model_provider_key_delete(params).await,
            METHOD_MODEL_PROVIDER_KEY_NEXT => self.handle_model_provider_key_next(params).await,
            METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD => {
                self.handle_model_provider_key_usage_record(params).await
            }
            METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD => {
                self.handle_model_provider_key_error_record(params).await
            }
            METHOD_MODEL_PROVIDER_UI_STATE_READ => {
                self.handle_model_provider_ui_state_read(params).await
            }
            METHOD_MODEL_PROVIDER_UI_STATE_WRITE => {
                self.handle_model_provider_ui_state_write(params).await
            }
            METHOD_MODEL_PROVIDER_ALIAS_READ => self.handle_model_provider_alias_read(params).await,
            METHOD_MODEL_PROVIDER_ALIAS_LIST => self.handle_model_provider_alias_list().await,
            METHOD_CONNECT_DEEP_LINK_RESOLVE => self.handle_connect_deep_link_resolve(params).await,
            METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE => {
                self.handle_connect_open_deep_link_resolve(params).await
            }
            METHOD_CONNECT_RELAY_API_KEY_SAVE => {
                self.handle_connect_relay_api_key_save(params).await
            }
            METHOD_CONNECT_CALLBACK_SEND => self.handle_connect_callback_send(params).await,
            METHOD_AGENT_SESSION_TURN_START => self.handle_turn_start(params, event_callback).await,
            METHOD_AGENT_SESSION_TURN_CANCEL => self.handle_turn_cancel(params).await,
            METHOD_AGENT_SESSION_ACTION_REPLAY => self.handle_action_replay(params).await,
            METHOD_AGENT_SESSION_ACTION_RESPOND => self.handle_action_respond(params).await,
            _ => Err(JsonRpcError::new(
                error_codes::METHOD_NOT_FOUND,
                format!("method not found: {method}"),
            )),
        };

        match result {
            Ok(dispatch) => {
                let mut messages = Vec::with_capacity(dispatch.events.len() + 1);
                messages.push(JsonRpcMessage::Response(JsonRpcResponse {
                    id,
                    result: dispatch.result,
                }));
                for event in dispatch.events {
                    messages.push(event_notification(event)?);
                }
                Ok(messages)
            }
            Err(error) => Ok(vec![JsonRpcMessage::Error(JsonRpcErrorResponse {
                id,
                error,
            })]),
        }
    }

    pub fn handle_notification(&self, notification: JsonRpcNotification) {
        if notification.method != METHOD_INITIALIZED {
            return;
        }

        let mut state = self.state.lock().expect("app-server state mutex poisoned");
        if state.initialize_accepted {
            state.initialized = true;
        }
    }

    fn handle_session_start(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params = parse_params(params)?;
        let response = self
            .runtime
            .start_session(params)
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    fn handle_capability_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: CapabilityListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_capabilities(params)
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_agent_sessions(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_session_current(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_objective_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_objective_set(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_objective_status_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveStatusUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_agent_session_objective_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_objective_clear(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveClearParams = parse_params(params)?;
        let response = self
            .runtime
            .clear_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_objective_continue(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveContinueParams = parse_params(params)?;
        let host = self.runtime_host_context();
        let output = self
            .runtime
            .continue_agent_session_objective(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    async fn handle_objective_audit(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveAuditParams = parse_params(params)?;
        let response = self
            .runtime
            .audit_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_compact(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionCompactParams = parse_params(params)?;
        let output = self
            .runtime
            .compact_agent_session(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    async fn handle_session_thread_resume(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionThreadResumeParams = parse_params(params)?;
        let host = self.runtime_host_context();
        let output = self
            .runtime
            .resume_agent_session_thread(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    async fn handle_session_queued_turn_remove(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionQueuedTurnRemoveParams = parse_params(params)?;
        let output = self
            .runtime
            .remove_agent_session_queued_turn(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    async fn handle_session_queued_turn_promote(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionQueuedTurnPromoteParams = parse_params(params)?;
        let output = self
            .runtime
            .promote_agent_session_queued_turn(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    async fn handle_file_checkpoint_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_agent_session_file_checkpoints(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_checkpoint_get(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointGetParams = parse_params(params)?;
        let response = self
            .runtime
            .get_agent_session_file_checkpoint(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_checkpoint_diff(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointDiffParams = parse_params(params)?;
        let response = self
            .runtime
            .diff_agent_session_file_checkpoint(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_checkpoint_restore(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointRestoreParams = parse_params(params)?;
        let response = self
            .runtime
            .restore_agent_session_file_checkpoint(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_file_get_or_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SessionFileGetOrCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .get_or_create_session_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_file_update_meta(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SessionFileUpdateMetaParams = parse_params(params)?;
        let response = self
            .runtime
            .update_session_file_meta(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_file_save(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SessionFileSaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_session_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_file_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SessionFileIdParams = parse_params(params)?;
        let response = self
            .runtime
            .read_session_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_file_resolve_path(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SessionFileIdParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_session_file_path(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_file_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SessionFileIdParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_session_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_file_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SessionFileGetOrCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .list_session_files(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params = parse_params(params)?;
        let response = self
            .runtime
            .read_session_current(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_workspaces()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_workspace(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_by_path_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspacePathReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_workspace_by_path(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_ensure(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceEnsureProjectParams = parse_params(params)?;
        let response = self
            .runtime
            .ensure_project_workspace(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_default_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_default_workspace()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_default_ensure(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .ensure_default_workspace()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_projects_root_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_workspace_projects_root()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_project_path_resolve(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceProjectPathResolveParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_workspace_project_path(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_ensure_ready(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceEnsureParams = parse_params(params)?;
        let response = self
            .runtime
            .ensure_workspace_ready(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self.runtime.list_skills().await.map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_skill(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_management_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillManagementListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_management_skills(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_management_install(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillManagementInstallParams = parse_params(params)?;
        let response = self
            .runtime
            .install_management_skill(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_management_uninstall(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillManagementUninstallParams = parse_params(params)?;
        let response = self
            .runtime
            .uninstall_management_skill(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_repository_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_skill_repositories()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_repository_save(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillRepositorySaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_skill_repository(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_repository_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillRepositoryDeleteParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_skill_repository(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_cache_refresh(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .refresh_skill_cache()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_installed_directories_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_installed_skill_directories()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_local_inspect(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillLocalInspectParams = parse_params(params)?;
        let response = self
            .runtime
            .inspect_local_skill(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_package_local_inspect(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillPackageLocalInspectParams = parse_params(params)?;
        let response = self
            .runtime
            .inspect_local_skill_package(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_local_detail_inspect(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillLocalDetailInspectParams = parse_params(params)?;
        let response = self
            .runtime
            .inspect_local_skill_detail(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_local_scaffold_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillScaffoldCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_skill_scaffold(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_local_import(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillLocalImportParams = parse_params(params)?;
        let response = self
            .runtime
            .import_local_skill(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_local_rename(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillLocalRenameParams = parse_params(params)?;
        let response = self
            .runtime
            .rename_local_skill(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_remote_inspect(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillRemoteInspectParams = parse_params(params)?;
        let response = self
            .runtime
            .inspect_remote_skill(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_package_local_install(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillPackageLocalInstallParams = parse_params(params)?;
        let response = self
            .runtime
            .install_local_skill_package(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_package_local_replace(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillPackageLocalReplaceParams = parse_params(params)?;
        let response = self
            .runtime
            .replace_local_skill_package(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_package_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillPackageExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_local_skill_package(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_marketplace_install(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillMarketplaceInstallParams = parse_params(params)?;
        let response = self
            .runtime
            .install_marketplace_skill(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_download_install(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillDownloadInstallParams = parse_params(params)?;
        let response = self
            .runtime
            .install_skill_from_download_url(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_channel_status(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayChannelStatusParams = parse_params(params)?;
        let response = self
            .runtime
            .read_gateway_channel_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_channel_start(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayChannelStartParams = parse_params(params)?;
        let response = self
            .runtime
            .start_gateway_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_channel_stop(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayChannelStopParams = parse_params(params)?;
        let response = self
            .runtime
            .stop_gateway_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_tunnel_probe(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .probe_gateway_tunnel()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_tunnel_cloudflared_detect(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .detect_gateway_tunnel_cloudflared()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_tunnel_cloudflared_install(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayTunnelCloudflaredInstallParams = parse_params(params)?;
        let response = self
            .runtime
            .install_gateway_tunnel_cloudflared(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_tunnel_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayTunnelCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_gateway_tunnel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_tunnel_start(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .start_gateway_tunnel()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_tunnel_stop(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .stop_gateway_tunnel()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_tunnel_restart(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .restart_gateway_tunnel()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_tunnel_status(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_gateway_tunnel_status()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gateway_tunnel_sync_webhook_url(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayTunnelSyncWebhookUrlParams = parse_params(params)?;
        let response = self
            .runtime
            .sync_gateway_tunnel_webhook_url(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_telegram_channel_probe(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ChannelProbeParams = parse_params(params)?;
        let response = self
            .runtime
            .probe_telegram_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_feishu_channel_probe(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ChannelProbeParams = parse_params(params)?;
        let response = self
            .runtime
            .probe_feishu_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_discord_channel_probe(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ChannelProbeParams = parse_params(params)?;
        let response = self
            .runtime
            .probe_discord_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_wechat_channel_probe(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ChannelProbeParams = parse_params(params)?;
        let response = self
            .runtime
            .probe_wechat_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_wechat_channel_login_start(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WechatLoginStartParams = parse_params(params)?;
        let response = self
            .runtime
            .start_wechat_channel_login(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_wechat_channel_login_wait(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WechatLoginWaitParams = parse_params(params)?;
        let response = self
            .runtime
            .wait_wechat_channel_login(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_wechat_channel_account_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_wechat_channel_accounts()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_wechat_channel_account_remove(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WechatChannelAccountRemoveParams = parse_params(params)?;
        let response = self
            .runtime
            .remove_wechat_channel_account(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_wechat_channel_runtime_model_set(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WechatRuntimeModelSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_wechat_channel_runtime_model(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_media_task_artifact_image_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MediaTaskArtifactImageCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_image_media_task_artifact(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_media_task_artifact_audio_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MediaTaskArtifactAudioCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_audio_media_task_artifact(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_media_task_artifact_video_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MediaTaskArtifactVideoCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_video_media_task_artifact(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_media_task_artifact_audio_complete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MediaTaskArtifactAudioCompleteParams = parse_params(params)?;
        let response = self
            .runtime
            .complete_audio_media_task_artifact(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_media_task_artifact_get(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MediaTaskArtifactLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .get_media_task_artifact(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_media_task_artifact_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MediaTaskArtifactListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_media_task_artifacts(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_media_task_artifact_cancel(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MediaTaskArtifactLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .cancel_media_task_artifact(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gallery_material_get(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .get_gallery_material(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gallery_material_metadata_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialMetadataCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_gallery_material_metadata(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gallery_material_metadata_get(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .get_gallery_material_metadata(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gallery_material_metadata_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialMetadataUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_gallery_material_metadata(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gallery_material_metadata_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_gallery_material_metadata(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gallery_material_list_by_image_category(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialFilterParams = parse_params(params)?;
        let response = self
            .runtime
            .list_gallery_materials_by_image_category(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gallery_material_list_by_layout_category(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialFilterParams = parse_params(params)?;
        let response = self
            .runtime
            .list_gallery_materials_by_layout_category(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_gallery_material_list_by_mood(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialFilterParams = parse_params(params)?;
        let response = self
            .runtime
            .list_gallery_materials_by_mood(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_project_material_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_project_materials(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_project_material_get(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .get_project_material(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_project_material_count(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialListParams = parse_params(params)?;
        let response = self
            .runtime
            .count_project_materials(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_project_material_upload(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialUploadParams = parse_params(params)?;
        let response = self
            .runtime
            .upload_project_material(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_project_material_import_from_url(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialImportFromUrlParams = parse_params(params)?;
        let response = self
            .runtime
            .import_project_material_from_url(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_project_material_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_project_material(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_project_material_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_project_material(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_project_material_content(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .read_project_material_content(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_asr_credential_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_voice_asr_credentials()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_asr_credential_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: VoiceAsrCredentialCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_voice_asr_credential(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_asr_credential_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: VoiceAsrCredentialUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_voice_asr_credential(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_asr_credential_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: VoiceAsrCredentialIdParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_voice_asr_credential(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_asr_credential_default_set(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: VoiceAsrCredentialIdParams = parse_params(params)?;
        let response = self
            .runtime
            .set_default_voice_asr_credential(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_asr_credential_test(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: VoiceAsrCredentialIdParams = parse_params(params)?;
        let response = self
            .runtime
            .test_voice_asr_credential(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_model_test_transcribe_file(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: VoiceModelTestTranscribeFileParams = parse_params(params)?;
        let response = self
            .runtime
            .test_transcribe_voice_model_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_instruction_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_voice_instructions()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_instruction_save(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: VoiceInstructionSaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_voice_instruction(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_instruction_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: VoiceInstructionIdParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_voice_instruction(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_voice_model_default_set(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: VoiceModelDefaultSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_default_voice_model(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_skill_bindings_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceSkillBindingsListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_workspace_skill_bindings(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_registered_skills_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceRegisteredSkillsListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_workspace_registered_skills(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_installed_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_agent_app_installed()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_local_package_inspect(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppLocalPackageInspectParams = parse_params(params)?;
        let response = self
            .runtime
            .inspect_agent_app_local_package(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_package_fetch_cloud(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppFetchCloudPackageParams = parse_params(params)?;
        let response = self
            .runtime
            .fetch_agent_app_cloud_package(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_installed_save(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppInstalledSaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_agent_app_installed(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_installed_disabled_set(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppInstalledDisabledSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_agent_app_installed_disabled(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_installed_uninstall_rehearsal(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUninstallRehearsalParams = parse_params(params)?;
        let response = self
            .runtime
            .preview_agent_app_uninstall(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_installed_uninstall(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUninstallParams = parse_params(params)?;
        let response = self
            .runtime
            .uninstall_agent_app(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_shell_prepare(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppShellPrepareParams = parse_params(params)?;
        let response = self
            .runtime
            .prepare_agent_app_shell(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_ui_runtime_start(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUiRuntimeStartParams = parse_params(params)?;
        let response = self
            .runtime
            .start_agent_app_ui_runtime(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_ui_runtime_status(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUiRuntimeStatusParams = parse_params(params)?;
        let response = self
            .runtime
            .agent_app_ui_runtime_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_ui_runtime_stop(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUiRuntimeStopParams = parse_params(params)?;
        let response = self
            .runtime
            .stop_agent_app_ui_runtime(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_pack_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeListPacksParams = parse_params(params)?;
        let response = self
            .runtime
            .list_knowledge_packs(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_pack_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeReadPackParams = parse_params(params)?;
        let response = self
            .runtime
            .read_knowledge_pack(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_source_import(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeImportSourceParams = parse_params(params)?;
        let response = self
            .runtime
            .import_knowledge_source(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_pack_compile(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeCompilePackParams = parse_params(params)?;
        let response = self
            .runtime
            .compile_knowledge_pack(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_pack_default_set(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeSetDefaultPackParams = parse_params(params)?;
        let response = self
            .runtime
            .set_default_knowledge_pack(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_pack_status_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeUpdatePackStatusParams = parse_params(params)?;
        let response = self
            .runtime
            .update_knowledge_pack_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_context_resolve(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeResolveContextParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_knowledge_context(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_context_run_validate(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeValidateContextRunParams = parse_params(params)?;
        let response = self
            .runtime
            .validate_knowledge_context_run(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_automation_jobs()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_scheduler_config_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_automation_scheduler_config()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_scheduler_config_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationSchedulerConfigUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_automation_scheduler_config(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_scheduler_status(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_automation_scheduler_status()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobIdParams = parse_params(params)?;
        let response = self
            .runtime
            .read_automation_job(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_automation_job(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_automation_job(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobIdParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_automation_job(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_run_now(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobIdParams = parse_params(params)?;
        let response = self
            .runtime
            .run_automation_job_now(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_health(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobHealthParams = parse_params(params)?;
        let response = self
            .runtime
            .read_automation_health(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_run_history(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobRunHistoryParams = parse_params(params)?;
        let response = self
            .runtime
            .read_automation_run_history(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_schedule_preview(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationScheduleParams = parse_params(params)?;
        let response = self
            .runtime
            .preview_automation_schedule(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_schedule_validate(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationScheduleParams = parse_params(params)?;
        let response = self
            .runtime
            .validate_automation_schedule(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_project_memory_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMemoryReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_project_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_unified_memory_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_unified_memories(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_unified_memory_get(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryGetParams = parse_params(params)?;
        let response = self
            .runtime
            .get_unified_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_unified_memory_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_unified_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_unified_memory_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_unified_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_unified_memory_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryDeleteParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_unified_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_unified_memory_search(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemorySearchParams = parse_params(params)?;
        let response = self
            .runtime
            .search_unified_memories(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_unified_memory_stats(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_unified_memory_stats()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_unified_memory_analyze(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryAnalyzeParams = parse_params(params)?;
        let response = self
            .runtime
            .analyze_unified_memories(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_unified_memory_semantic_search(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemorySemanticSearchParams = parse_params(params)?;
        let response = self
            .runtime
            .semantic_search_unified_memories(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_unified_memory_hybrid_search(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryHybridSearchParams = parse_params(params)?;
        let response = self
            .runtime
            .hybrid_search_unified_memories(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_mcp_servers()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_status_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_mcp_servers_with_status()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_mcp_server(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_mcp_server(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerDeleteParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_mcp_server(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_enabled_set(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerEnabledSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_mcp_server_enabled(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_import_from_app(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerImportFromAppParams = parse_params(params)?;
        let response = self
            .runtime
            .import_mcp_servers_from_app(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_sync_all_to_live(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .sync_all_mcp_servers_to_live()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_start(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerStartParams = parse_params(params)?;
        let response = self
            .runtime
            .start_mcp_server(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_stop(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerStopParams = parse_params(params)?;
        let response = self
            .runtime
            .stop_mcp_server(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_tool_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_mcp_tools()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_tool_list_for_context(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpToolListForContextParams = parse_params(params)?;
        let response = self
            .runtime
            .list_mcp_tools_for_context(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_tool_search(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpToolSearchParams = parse_params(params)?;
        let response = self
            .runtime
            .search_mcp_tools(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_tool_call(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpToolCallParams = parse_params(params)?;
        let response = self
            .runtime
            .call_mcp_tool(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_tool_call_with_caller(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpToolCallWithCallerParams = parse_params(params)?;
        let response = self
            .runtime
            .call_mcp_tool_with_caller(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_prompt_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_mcp_prompts()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_prompt_get(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpPromptGetParams = parse_params(params)?;
        let response = self
            .runtime
            .get_mcp_prompt(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_resource_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_mcp_resources()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_resource_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpResourceReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_mcp_resource(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_log_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self.runtime.list_logs().await.map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_log_persisted_tail(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: LogPersistedTailParams = parse_params(params)?;
        let response = self
            .runtime
            .read_persisted_log_tail(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_log_clear(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self.runtime.clear_logs().await.map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_log_diagnostic_history_clear(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .clear_diagnostic_log_history()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_diagnostics_log_storage_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_log_storage_diagnostics()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_diagnostics_support_bundle_export(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .export_support_bundle()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_diagnostics_server_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_server_diagnostics()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_diagnostics_windows_startup_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_windows_startup_diagnostics()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_usage_stats_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UsageStatsRangeParams = parse_params(params)?;
        let response = self
            .runtime
            .read_usage_stats(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_usage_stats_model_ranking_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UsageStatsRangeParams = parse_params(params)?;
        let response = self
            .runtime
            .list_usage_stats_model_ranking(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_usage_stats_daily_trends_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UsageStatsRangeParams = parse_params(params)?;
        let response = self
            .runtime
            .list_usage_stats_daily_trends(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_models(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_preferences_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_model_preferences()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_sync_state_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_model_sync_state()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_model_providers()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_catalog_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_model_provider_catalog()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_model_provider(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_model_provider(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_model_provider(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderDeleteParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_model_provider(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_sort_orders_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderSortOrdersUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_model_provider_sort_orders(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_config_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderConfigExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_model_provider_config(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_config_import(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderConfigImportParams = parse_params(params)?;
        let response = self
            .runtime
            .import_model_provider_config(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_test_connection(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderTestConnectionParams = parse_params(params)?;
        let response = self
            .runtime
            .test_model_provider_connection(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_test_chat(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderTestChatParams = parse_params(params)?;
        let response = self
            .runtime
            .test_model_provider_chat(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_fetch_models(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderFetchModelsParams = parse_params(params)?;
        let response = self
            .runtime
            .fetch_model_provider_models(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_model_provider_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_model_provider_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyDeleteParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_model_provider_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_next(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyNextParams = parse_params(params)?;
        let response = self
            .runtime
            .read_next_model_provider_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_usage_record(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyEventParams = parse_params(params)?;
        let response = self
            .runtime
            .record_model_provider_key_usage(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_error_record(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyEventParams = parse_params(params)?;
        let response = self
            .runtime
            .record_model_provider_key_error(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_ui_state_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderUiStateReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_model_provider_ui_state(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_ui_state_write(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderUiStateWriteParams = parse_params(params)?;
        let response = self
            .runtime
            .write_model_provider_ui_state(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_alias_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderAliasReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_model_provider_alias(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_alias_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_model_provider_aliases()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_connect_deep_link_resolve(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectDeepLinkResolveParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_connect_deep_link(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_connect_open_deep_link_resolve(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectOpenDeepLinkResolveParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_connect_open_deep_link(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_connect_relay_api_key_save(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectRelayApiKeySaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_connect_relay_api_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_connect_callback_send(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectCallbackSendParams = parse_params(params)?;
        let response = self
            .runtime
            .deliver_connect_callback(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    fn handle_artifact_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ArtifactReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_artifacts(params)
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_list_directory(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemListDirectoryParams = parse_params(params)?;
        let response = self
            .runtime
            .list_directory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_read_file_preview(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemReadFilePreviewParams = parse_params(params)?;
        let response = self
            .runtime
            .read_file_preview(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_create_file(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemCreateFileParams = parse_params(params)?;
        let response = self
            .runtime
            .create_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_create_directory(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemCreateDirectoryParams = parse_params(params)?;
        let response = self
            .runtime
            .create_directory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_rename_file(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemRenameFileParams = parse_params(params)?;
        let response = self
            .runtime
            .rename_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_delete_file(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemDeleteFileParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    // project_git handlers 已提取到 processor/project_git.rs

    async fn handle_evidence_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: EvidenceExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_evidence(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_handoff_bundle_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionHandoffBundleExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_handoff_bundle(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_replay_case_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionReplayCaseExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_replay_case(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_analysis_handoff_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionAnalysisHandoffExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_analysis_handoff(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_review_decision_template_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionReviewDecisionTemplateExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_review_decision_template(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_review_decision_save(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionReviewDecisionSaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_review_decision(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_turn_start(
        &self,
        params: Option<serde_json::Value>,
        event_callback: Option<&mut (dyn FnMut(JsonRpcMessage) + Send)>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params = parse_params(params)?;
        let host = self.runtime_host_context();
        if let Some(event_callback) = event_callback {
            let mut runtime_event_callback = |event: AgentEvent| {
                let message = event_notification_jsonrpc(event).map_err(|error| {
                    RuntimeCoreError::Backend(format!(
                        "failed to serialize streaming event notification: {}",
                        error.message
                    ))
                })?;
                event_callback(message);
                Ok(())
            };
            let output = self
                .runtime
                .start_turn_with_event_callback(params, host, &mut runtime_event_callback)
                .await
                .map_err(to_jsonrpc_error)?;
            dispatch_result(output.response)
        } else {
            let output = self
                .runtime
                .start_turn(params, host)
                .await
                .map_err(to_jsonrpc_error)?;
            dispatch_result_with_events(output.response, output.events)
        }
    }

    async fn handle_turn_cancel(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params = parse_params(params)?;
        let host = self.runtime_host_context();
        let output = self
            .runtime
            .cancel_turn(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    async fn handle_action_respond(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionActionRespondParams = parse_params(params)?;
        let host = self.runtime_host_context();
        let output = self
            .runtime
            .respond_action(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    async fn handle_action_replay(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionActionReplayParams = parse_params(params)?;
        let output = self
            .runtime
            .replay_action(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    fn initialize(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, JsonRpcError> {
        let params: InitializeParams = parse_params(params)?;
        let mut state = self.state.lock().expect("app-server state mutex poisoned");
        if state.initialize_accepted {
            return Err(JsonRpcError::new(
                error_codes::ALREADY_INITIALIZED,
                "initialize has already been accepted",
            ));
        }

        state.initialize_accepted = true;
        state.client_info = Some(params.client_info);

        serialize_result(InitializeResponse {
            server_info: ServerInfo {
                name: SERVER_NAME.to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                protocol_version: PROTOCOL_VERSION.to_string(),
            },
            platform: PlatformInfo {
                family: "desktop".to_string(),
                os: std::env::consts::OS.to_string(),
            },
            capabilities: ServerCapabilities {
                agent_session: true,
                capability_discovery: true,
                artifact: true,
                evidence: true,
                workspace: false,
            },
        })
    }

    fn ensure_initialized(&self) -> Result<(), JsonRpcError> {
        let initialized = self
            .state
            .lock()
            .expect("app-server state mutex poisoned")
            .initialized;
        if !initialized {
            return Err(JsonRpcError::new(
                error_codes::NOT_INITIALIZED,
                "initialize and initialized must complete before business methods",
            ));
        }
        Ok(())
    }

    fn runtime_host_context(&self) -> RuntimeHostContext {
        let client_info = self
            .state
            .lock()
            .expect("app-server state mutex poisoned")
            .client_info
            .clone();
        RuntimeHostContext::from(client_info)
    }
}

pub fn event_notification_jsonrpc(event: AgentEvent) -> Result<JsonRpcMessage, JsonRpcError> {
    let params = serde_json::to_value(AgentSessionEventParams { event }).map_err(|error| {
        JsonRpcError::new(
            error_codes::RUNTIME_ERROR,
            format!("failed to serialize event notification: {error}"),
        )
    })?;
    Ok(JsonRpcMessage::Notification(JsonRpcNotification::new(
        METHOD_AGENT_SESSION_EVENT,
        Some(params),
    )))
}

pub(super) fn parse_params<T>(params: Option<serde_json::Value>) -> Result<T, JsonRpcError>
where
    T: DeserializeOwned,
{
    serde_json::from_value(params.unwrap_or_else(|| serde_json::json!({}))).map_err(|error| {
        JsonRpcError::new(
            error_codes::INVALID_PARAMS,
            format!("invalid params: {error}"),
        )
    })
}

fn serialize_result(value: impl Serialize) -> Result<serde_json::Value, JsonRpcError> {
    serde_json::to_value(value).map_err(|error| {
        JsonRpcError::new(
            error_codes::RUNTIME_ERROR,
            format!("failed to serialize response: {error}"),
        )
    })
}

pub(super) struct RpcDispatch {
    result: serde_json::Value,
    events: Vec<AgentEvent>,
}

impl RpcDispatch {
    fn single(result: serde_json::Value) -> Self {
        Self {
            result,
            events: Vec::new(),
        }
    }
}

pub(super) fn dispatch_result(value: impl Serialize) -> Result<RpcDispatch, JsonRpcError> {
    Ok(RpcDispatch::single(serialize_result(value)?))
}

fn dispatch_result_with_events(
    value: impl Serialize,
    events: Vec<AgentEvent>,
) -> Result<RpcDispatch, JsonRpcError> {
    Ok(RpcDispatch {
        result: serialize_result(value)?,
        events,
    })
}

fn event_notification(event: AgentEvent) -> Result<JsonRpcMessage, AppServerError> {
    Ok(JsonRpcMessage::Notification(JsonRpcNotification::new(
        METHOD_AGENT_SESSION_EVENT,
        Some(serde_json::to_value(AgentSessionEventParams { event })?),
    )))
}

pub(super) fn to_jsonrpc_error(error: RuntimeCoreError) -> JsonRpcError {
    error.into_jsonrpc_error()
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentSessionStartParams;
    use app_server_protocol::CapabilityDescriptor;
    use app_server_protocol::ClientCapabilities;
    use app_server_protocol::JsonRpcMessage;
    use app_server_protocol::RequestId;
    use serde_json::json;
    use std::sync::Arc;

    struct ScopedCapabilitySource;

    impl crate::CapabilitySource for ScopedCapabilitySource {
        fn list_capabilities(
            &self,
            context: &crate::CapabilityListContext,
        ) -> Vec<CapabilityDescriptor> {
            vec![CapabilityDescriptor {
                id: format!("scoped.{}", context.app_id.as_deref().unwrap_or("unscoped")),
                title: "Scoped Capability".to_string(),
                description: context.workspace_id.clone(),
                methods: vec![METHOD_AGENT_SESSION_START.to_string()],
            }]
        }
    }

    #[tokio::test]
    async fn capability_list_requires_initialized_and_returns_minimal_descriptors() {
        let runtime = RuntimeCore::with_backend_and_capability_source(
            Arc::new(crate::MockBackend),
            Arc::new(ScopedCapabilitySource),
        );
        let processor = RequestProcessor::new(runtime);

        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_CAPABILITY_LIST,
                Some(json!({})),
            ))
            .await
            .expect("blocked response");
        assert!(matches!(
            &blocked[0],
            JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
        ));

        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "test-client".to_string(),
                            title: None,
                            version: None,
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            ))
            .await
            .expect("initialize");
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));

        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_CAPABILITY_LIST,
                Some(json!({
                    "appId": "content-studio",
                    "workspaceId": "workspace-main",
                })),
            ))
            .await
            .expect("capability list response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(
                    response.result["capabilities"][0]["id"],
                    "scoped.content-studio"
                );
                assert_eq!(
                    response.result["capabilities"][0]["description"],
                    "workspace-main"
                );
                assert_eq!(
                    response.result["capabilities"][0]["methods"][0],
                    METHOD_AGENT_SESSION_START
                );
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn artifact_read_requires_initialized_and_returns_artifact_summaries() {
        let runtime = RuntimeCore::default();
        runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_artifact".to_string()),
                thread_id: Some("thread_artifact".to_string()),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");
        runtime
            .append_external_runtime_events(
                "sess_artifact",
                None,
                vec![crate::RuntimeEvent::new(
                    "artifact.snapshot",
                    json!({
                        "artifactId": "artifact-report",
                        "filePath": ".app-server/artifacts/report.md",
                        "title": "Report",
                        "kind": "markdown",
                        "status": "ready",
                        "content": "# Report",
                    }),
                )],
            )
            .expect("artifact event");

        let processor = RequestProcessor::new(runtime);
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_ARTIFACT_READ,
                Some(json!({ "sessionId": "sess_artifact" })),
            ))
            .await
            .expect("blocked response");
        assert!(matches!(
            &blocked[0],
            JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
        ));

        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "test-client".to_string(),
                            title: None,
                            version: None,
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            ))
            .await
            .expect("initialize");
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));

        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_ARTIFACT_READ,
                Some(json!({
                    "sessionId": "sess_artifact",
                    "artifactRef": "artifact-report",
                })),
            ))
            .await
            .expect("artifact read response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(
                    response.result["artifacts"][0]["artifactRef"],
                    "artifact-report"
                );
                assert_eq!(
                    response.result["artifacts"][0]["path"],
                    ".app-server/artifacts/report.md"
                );
                assert_eq!(response.result["artifacts"][0]["title"], "Report");
                assert_eq!(
                    response.result["artifacts"][0]["contentStatus"],
                    "notRequested"
                );
                assert!(response.result["artifacts"][0].get("content").is_none());
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn app_server_file_system_methods_require_initialized_and_return_current_results() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_FILE_SYSTEM_CREATE_FILE,
                Some(json!({ "path": "." })),
            ))
            .await
            .expect("blocked response");
        assert!(matches!(
            &blocked[0],
            JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
        ));

        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "test-client".to_string(),
                            title: None,
                            version: None,
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            ))
            .await
            .expect("initialize");
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));

        let temp_dir = tempfile::tempdir().expect("temp dir");
        let file_path = temp_dir.path().join("README.md");
        std::fs::write(&file_path, "# Lime").expect("write file");
        let created_file_path = temp_dir.path().join("created.txt");
        let created_dir_path = temp_dir.path().join("created-dir");
        let renamed_file_path = temp_dir.path().join("renamed.txt");
        let expected_dir_path = std::fs::canonicalize(temp_dir.path())
            .expect("canonical temp dir")
            .to_string_lossy()
            .into_owned();
        let expected_file_path = std::fs::canonicalize(&file_path)
            .expect("canonical file")
            .to_string_lossy()
            .into_owned();

        let listing_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_FILE_SYSTEM_LIST_DIRECTORY,
                Some(json!({ "path": temp_dir.path() })),
            ))
            .await
            .expect("directory listing response");
        match &listing_messages[0] {
            JsonRpcMessage::Response(response) => {
                let actual_dir_path =
                    std::fs::canonicalize(response.result["path"].as_str().expect("listing path"))
                        .expect("canonical response dir")
                        .to_string_lossy()
                        .into_owned();
                assert_eq!(actual_dir_path.as_str(), expected_dir_path.as_str());
                assert_eq!(response.result["entries"][0]["name"], "README.md");
            }
            other => panic!("expected response, got {other:?}"),
        }

        let create_file_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(5),
                METHOD_FILE_SYSTEM_CREATE_FILE,
                Some(json!({ "path": created_file_path })),
            ))
            .await
            .expect("create file response");
        assert!(matches!(
            &create_file_messages[0],
            JsonRpcMessage::Response(response)
                if response.result == serde_json::json!({})
        ));
        assert!(created_file_path.is_file());

        let create_directory_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(6),
                METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
                Some(json!({ "path": created_dir_path })),
            ))
            .await
            .expect("create directory response");
        assert!(matches!(
            &create_directory_messages[0],
            JsonRpcMessage::Response(response)
                if response.result == serde_json::json!({})
        ));
        assert!(created_dir_path.is_dir());

        let rename_file_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(7),
                METHOD_FILE_SYSTEM_RENAME_FILE,
                Some(json!({
                    "oldPath": created_file_path,
                    "newPath": renamed_file_path,
                })),
            ))
            .await
            .expect("rename file response");
        assert!(matches!(
            &rename_file_messages[0],
            JsonRpcMessage::Response(response)
                if response.result == serde_json::json!({})
        ));
        assert!(!created_file_path.exists());
        assert!(renamed_file_path.is_file());

        let delete_file_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(8),
                METHOD_FILE_SYSTEM_DELETE_FILE,
                Some(json!({
                    "path": renamed_file_path,
                    "recursive": false,
                })),
            ))
            .await
            .expect("delete file response");
        assert!(matches!(
            &delete_file_messages[0],
            JsonRpcMessage::Response(response)
                if response.result == serde_json::json!({})
        ));
        assert!(!renamed_file_path.exists());

        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(9),
                METHOD_FILE_SYSTEM_DELETE_FILE,
                Some(json!({
                    "path": created_dir_path,
                    "recursive": true,
                })),
            ))
            .await
            .expect("delete directory response");
        assert!(!created_dir_path.exists());

        let preview_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(10),
                METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
                Some(json!({
                    "path": file_path,
                    "maxSize": 1024,
                })),
            ))
            .await
            .expect("file preview response");
        match &preview_messages[0] {
            JsonRpcMessage::Response(response) => {
                let actual_file_path =
                    std::fs::canonicalize(response.result["path"].as_str().expect("preview path"))
                        .expect("canonical response file")
                        .to_string_lossy()
                        .into_owned();
                assert_eq!(actual_file_path.as_str(), expected_file_path.as_str());
                assert_eq!(response.result["content"], "# Lime");
                assert_eq!(response.result["isBinary"], false);
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn project_git_status_requires_initialized_and_returns_local_mode_for_plain_directory() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_PROJECT_GIT_STATUS,
                Some(json!({ "rootPath": "." })),
            ))
            .await
            .expect("blocked response");
        assert!(matches!(
            &blocked[0],
            JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
        ));

        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "test-client".to_string(),
                            title: None,
                            version: None,
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            ))
            .await
            .expect("initialize");
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));

        let temp_dir = tempfile::tempdir().expect("temp dir");
        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_PROJECT_GIT_STATUS,
                Some(json!({ "rootPath": temp_dir.path() })),
            ))
            .await
            .expect("project git status response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["hasGitRepository"], false);
                assert_eq!(response.result["branches"], serde_json::json!([]));
                assert_eq!(response.result["uncommittedFileCount"], 0);
                assert!(response.result.get("currentBranch").is_none());
                assert!(response.result.get("repositoryRoot").is_none());
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn mcp_list_methods_require_initialized_and_return_current_empty_state() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_MCP_TOOL_LIST,
                Some(json!({})),
            ))
            .await
            .expect("blocked response");
        assert!(matches!(
            &blocked[0],
            JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
        ));

        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "test-client".to_string(),
                            title: None,
                            version: None,
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            ))
            .await
            .expect("initialize");
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));

        let cases = [
            (RequestId::Integer(3), METHOD_MCP_SERVER_LIST, "servers"),
            (
                RequestId::Integer(4),
                METHOD_MCP_SERVER_STATUS_LIST,
                "servers",
            ),
            (RequestId::Integer(5), METHOD_MCP_TOOL_LIST, "tools"),
            (RequestId::Integer(6), METHOD_MCP_PROMPT_LIST, "prompts"),
            (RequestId::Integer(7), METHOD_MCP_RESOURCE_LIST, "resources"),
        ];

        for (id, method, field) in cases {
            let messages = processor
                .handle_request(JsonRpcRequest::new(id, method, Some(json!({}))))
                .await
                .expect("mcp list response");

            match &messages[0] {
                JsonRpcMessage::Response(response) => {
                    assert_eq!(response.result[field], json!([]));
                }
                other => panic!("expected response, got {other:?}"),
            }
        }
    }

    #[tokio::test]
    async fn mcp_runtime_methods_require_initialized_and_fail_closed_without_manager() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_MCP_TOOL_CALL,
                Some(json!({
                    "toolName": "mcp__docs__search",
                    "arguments": {},
                })),
            ))
            .await
            .expect("blocked response");
        assert!(matches!(
            &blocked[0],
            JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
        ));

        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "test-client".to_string(),
                            title: None,
                            version: None,
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            ))
            .await
            .expect("initialize");
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));

        let cases = [
            (
                RequestId::Integer(3),
                METHOD_MCP_SERVER_CREATE,
                json!({
                    "server": {
                        "id": "server-1",
                        "name": "docs",
                        "server_config": { "command": "node" },
                        "enabled_lime": true,
                        "enabled_claude": false,
                        "enabled_codex": true,
                        "enabled_gemini": false,
                    }
                }),
            ),
            (
                RequestId::Integer(4),
                METHOD_MCP_SERVER_UPDATE,
                json!({
                    "server": {
                        "id": "server-1",
                        "name": "docs",
                        "server_config": { "command": "node" },
                        "enabled_lime": true,
                        "enabled_claude": false,
                        "enabled_codex": true,
                        "enabled_gemini": false,
                    }
                }),
            ),
            (
                RequestId::Integer(5),
                METHOD_MCP_SERVER_DELETE,
                json!({ "id": "server-1" }),
            ),
            (
                RequestId::Integer(6),
                METHOD_MCP_SERVER_ENABLED_SET,
                json!({ "id": "server-1", "appType": "codex", "enabled": true }),
            ),
            (
                RequestId::Integer(7),
                METHOD_MCP_SERVER_IMPORT_FROM_APP,
                json!({ "appType": "codex" }),
            ),
            (
                RequestId::Integer(8),
                METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
                json!({}),
            ),
            (
                RequestId::Integer(9),
                METHOD_MCP_SERVER_START,
                json!({ "name": "docs" }),
            ),
            (
                RequestId::Integer(10),
                METHOD_MCP_SERVER_STOP,
                json!({ "name": "docs" }),
            ),
            (
                RequestId::Integer(11),
                METHOD_MCP_TOOL_CALL,
                json!({ "toolName": "mcp__docs__search", "arguments": {} }),
            ),
            (
                RequestId::Integer(12),
                METHOD_MCP_TOOL_CALL_WITH_CALLER,
                json!({
                    "toolName": "mcp__docs__search",
                    "arguments": {},
                    "caller": "assistant",
                }),
            ),
            (
                RequestId::Integer(13),
                METHOD_MCP_PROMPT_GET,
                json!({ "name": "docs_prompt", "arguments": {} }),
            ),
            (
                RequestId::Integer(14),
                METHOD_MCP_RESOURCE_READ,
                json!({ "uri": "docs://readme" }),
            ),
        ];

        for (id, method, params) in cases {
            let messages = processor
                .handle_request(JsonRpcRequest::new(id, method, Some(params)))
                .await
                .expect("mcp runtime response");

            match &messages[0] {
                JsonRpcMessage::Error(error) => {
                    assert_eq!(error.error.code, error_codes::RUNTIME_ERROR);
                }
                other => panic!("expected runtime error, got {other:?}"),
            }
        }
    }

    #[tokio::test]
    async fn usage_stats_methods_require_initialized_and_return_current_dto() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_USAGE_STATS_READ,
                Some(json!({ "timeRange": "month" })),
            ))
            .await
            .expect("blocked response");
        assert!(matches!(
            &blocked[0],
            JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
        ));

        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "test-client".to_string(),
                            title: None,
                            version: None,
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            ))
            .await
            .expect("initialize");
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));

        let cases = [
            (
                RequestId::Integer(3),
                METHOD_USAGE_STATS_READ,
                "stats",
                "object",
            ),
            (
                RequestId::Integer(4),
                METHOD_USAGE_STATS_MODEL_RANKING_LIST,
                "ranking",
                "array",
            ),
            (
                RequestId::Integer(5),
                METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
                "trends",
                "array",
            ),
        ];

        for (id, method, field, expected_kind) in cases {
            let messages = processor
                .handle_request(JsonRpcRequest::new(
                    id,
                    method,
                    Some(json!({ "timeRange": "month" })),
                ))
                .await
                .expect("usage stats response");

            match &messages[0] {
                JsonRpcMessage::Response(response) => {
                    let value = response.result.get(field).expect("response field");
                    match expected_kind {
                        "object" => assert!(value.is_object()),
                        "array" => assert!(value.is_array()),
                        other => panic!("unexpected expected kind {other}"),
                    }
                }
                other => panic!("expected response, got {other:?}"),
            }
        }
    }

    #[tokio::test]
    async fn evidence_export_requires_initialized_and_returns_read_model_snapshot() {
        let runtime = RuntimeCore::default();
        runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_evidence".to_string()),
                thread_id: Some("thread_evidence".to_string()),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");
        runtime
            .start_turn(
                app_server_protocol::AgentSessionTurnStartParams {
                    session_id: "sess_evidence".to_string(),
                    turn_id: Some("turn_evidence".to_string()),
                    input: app_server_protocol::AgentInput {
                        text: "draft".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("turn");
        runtime
            .append_external_runtime_events(
                "sess_evidence",
                Some("turn_evidence"),
                vec![
                    crate::RuntimeEvent::new(
                        "message.delta",
                        json!({
                            "text": "draft",
                            "evidenceRefs": ["evidence://sess_evidence/runtime"]
                        }),
                    ),
                    crate::RuntimeEvent::new(
                        "artifact.snapshot",
                        json!({
                            "artifactId": "artifact-report",
                            "path": ".app-server/artifacts/report.md",
                            "content": "# Report"
                        }),
                    ),
                ],
            )
            .expect("evidence events");

        let processor = RequestProcessor::new(runtime);
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_EVIDENCE_EXPORT,
                Some(json!({ "sessionId": "sess_evidence" })),
            ))
            .await
            .expect("blocked response");
        assert!(matches!(
            &blocked[0],
            JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
        ));

        let initialize = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "test-client".to_string(),
                            title: None,
                            version: None,
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            ))
            .await
            .expect("initialize");
        match &initialize[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["capabilities"]["evidence"], true);
            }
            other => panic!("expected initialize response, got {other:?}"),
        }
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));

        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_EVIDENCE_EXPORT,
                Some(json!({
                    "sessionId": "sess_evidence",
                    "turnId": "turn_evidence",
                    "includeEvents": true,
                    "includeArtifacts": true
                })),
            ))
            .await
            .expect("evidence export response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["session"]["sessionId"], "sess_evidence");
                assert_eq!(response.result["events"].as_array().unwrap().len(), 3);
                assert_eq!(
                    response.result["artifacts"][0]["artifactRef"],
                    "artifact-report"
                );
                assert!(response.result["artifacts"][0].get("content").is_none());
                assert!(!response.result["exportedAt"].as_str().unwrap().is_empty());
                assert!(response.result.get("threadStatus").is_none());
                assert!(response.result.get("completionAuditSummary").is_none());
            }
            other => panic!("expected response, got {other:?}"),
        }
    }
}
