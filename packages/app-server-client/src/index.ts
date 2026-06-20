import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createInterface,
  type Interface as ReadlineInterface,
} from "node:readline";

import {
  APP_SERVER_METHODS,
  JSONRPC_VERSION,
  METHOD_AGENT_APP_INSTALLED_DISABLED_SET,
  METHOD_AGENT_APP_INSTALLED_LIST,
  METHOD_AGENT_APP_INSTALLED_SAVE,
  METHOD_AGENT_APP_INSTALLED_UNINSTALL,
  METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
  METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT,
  METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD,
  METHOD_AGENT_APP_SHELL_PREPARE,
  METHOD_AGENT_APP_UI_RUNTIME_START,
  METHOD_AGENT_APP_UI_RUNTIME_STATUS,
  METHOD_AGENT_APP_UI_RUNTIME_STOP,
  METHOD_AGENT_SESSION_ACTION_REPLAY,
  METHOD_AGENT_SESSION_ACTION_RESPOND,
  METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
  METHOD_AGENT_SESSION_ARCHIVE_MANY,
  METHOD_AGENT_SESSION_COMPACT,
  METHOD_AGENT_SESSION_DELETE,
  METHOD_AGENT_SESSION_EVENT,
  METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
  METHOD_AGENT_SESSION_LIST,
  METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
  METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
  METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST,
  METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE,
  METHOD_AGENT_SESSION_OBJECTIVE_READ,
  METHOD_AGENT_SESSION_OBJECTIVE_SET,
  METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
  METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE,
  METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE,
  METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT,
  METHOD_AGENT_SESSION_READ,
  METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE,
  METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
  METHOD_AGENT_SESSION_START,
  METHOD_AGENT_SESSION_THREAD_RESUME,
  METHOD_AGENT_SESSION_TOOL_INVENTORY_READ,
  METHOD_AGENT_SESSION_TURN_CANCEL,
  METHOD_AGENT_SESSION_TURN_START,
  METHOD_AGENT_SESSION_UPDATE,
  METHOD_ARTIFACT_READ,
  METHOD_AUTOMATION_JOB_CREATE,
  METHOD_AUTOMATION_JOB_DELETE,
  METHOD_AUTOMATION_JOB_HEALTH,
  METHOD_AUTOMATION_JOB_LIST,
  METHOD_AUTOMATION_JOB_READ,
  METHOD_AUTOMATION_JOB_RUN_HISTORY,
  METHOD_AUTOMATION_JOB_RUN_NOW,
  METHOD_AUTOMATION_JOB_UPDATE,
  METHOD_AUTOMATION_SCHEDULER_CONFIG_READ,
  METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE,
  METHOD_AUTOMATION_SCHEDULER_STATUS,
  METHOD_AUTOMATION_SCHEDULE_PREVIEW,
  METHOD_AUTOMATION_SCHEDULE_VALIDATE,
  METHOD_CAPABILITY_LIST,
  METHOD_CONNECT_CALLBACK_SEND,
  METHOD_CONNECT_DEEP_LINK_RESOLVE,
  METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
  METHOD_CONNECT_RELAY_API_KEY_SAVE,
  METHOD_CONVERSATION_IMPORT_SOURCE_SCAN,
  METHOD_CONVERSATION_IMPORT_THREAD_COMMIT,
  METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW,
  METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ,
  METHOD_EVIDENCE_EXPORT,
  METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT,
  METHOD_EXECUTION_PROCESS_INTERRUPT,
  METHOD_EXECUTION_PROCESS_START,
  METHOD_EXECUTION_PROCESS_STATUS,
  METHOD_EXECUTION_PROCESS_TERMINATE,
  METHOD_EXECUTION_PROCESS_WRITE_STDIN,
  METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
  METHOD_FILE_SYSTEM_CREATE_FILE,
  METHOD_FILE_SYSTEM_DELETE_FILE,
  METHOD_FILE_SYSTEM_LIST_DIRECTORY,
  METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
  METHOD_FILE_SYSTEM_RENAME_FILE,
  METHOD_PROJECT_GIT_BRANCH_CHECKOUT,
  METHOD_PROJECT_GIT_BRANCH_CREATE,
  METHOD_PROJECT_GIT_COMMITS_LIST,
  METHOD_PROJECT_GIT_DIFF,
  METHOD_PROJECT_GIT_STATUS,
  METHOD_PROJECT_GIT_WORKTREE_CREATE,
  METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
  METHOD_PROJECT_SHELL_SESSION_KILL,
  METHOD_PROJECT_SHELL_SESSION_RESIZE,
  METHOD_PROJECT_SHELL_SESSION_START,
  METHOD_PROJECT_SHELL_SESSION_WRITE,
  METHOD_GALLERY_MATERIAL_GET,
  METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY,
  METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY,
  METHOD_GALLERY_MATERIAL_LIST_BY_MOOD,
  METHOD_GALLERY_MATERIAL_METADATA_CREATE,
  METHOD_GALLERY_MATERIAL_METADATA_DELETE,
  METHOD_GALLERY_MATERIAL_METADATA_GET,
  METHOD_GALLERY_MATERIAL_METADATA_UPDATE,
  METHOD_PROJECT_MATERIAL_CONTENT,
  METHOD_PROJECT_MATERIAL_COUNT,
  METHOD_PROJECT_MATERIAL_DELETE,
  METHOD_PROJECT_MATERIAL_GET,
  METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL,
  METHOD_PROJECT_MATERIAL_LIST,
  METHOD_PROJECT_MATERIAL_UPDATE,
  METHOD_PROJECT_MATERIAL_UPLOAD,
  METHOD_GATEWAY_CHANNEL_START,
  METHOD_GATEWAY_CHANNEL_STOP,
  METHOD_GATEWAY_CHANNEL_STATUS,
  METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
  METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
  METHOD_GATEWAY_TUNNEL_CREATE,
  METHOD_GATEWAY_TUNNEL_PROBE,
  METHOD_GATEWAY_TUNNEL_RESTART,
  METHOD_GATEWAY_TUNNEL_START,
  METHOD_GATEWAY_TUNNEL_STATUS,
  METHOD_GATEWAY_TUNNEL_STOP,
  METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
  METHOD_DISCORD_CHANNEL_PROBE,
  METHOD_FEISHU_CHANNEL_PROBE,
  METHOD_TELEGRAM_CHANNEL_PROBE,
  METHOD_DIAGNOSTICS_LOG_STORAGE_READ,
  METHOD_DIAGNOSTICS_SERVER_READ,
  METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT,
  METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ,
  METHOD_INITIALIZE,
  METHOD_INITIALIZED,
  METHOD_KNOWLEDGE_CONTEXT_RESOLVE,
  METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE,
  METHOD_KNOWLEDGE_PACK_COMPILE,
  METHOD_KNOWLEDGE_PACK_DEFAULT_SET,
  METHOD_KNOWLEDGE_PACK_LIST,
  METHOD_KNOWLEDGE_PACK_READ,
  METHOD_KNOWLEDGE_PACK_STATUS_UPDATE,
  METHOD_KNOWLEDGE_SOURCE_IMPORT,
  METHOD_LOG_CLEAR,
  METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR,
  METHOD_LOG_LIST,
  METHOD_LOG_PERSISTED_TAIL,
  METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE,
  METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE,
  METHOD_MEDIA_TASK_ARTIFACT_CANCEL,
  METHOD_MEDIA_TASK_ARTIFACT_GET,
  METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
  METHOD_MEDIA_TASK_ARTIFACT_LIST,
  METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE,
  METHOD_MODEL_LIST,
  METHOD_MODEL_PREFERENCES_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_READ,
  METHOD_MODEL_PROVIDER_CATALOG_LIST,
  METHOD_MODEL_PROVIDER_CONFIG_EXPORT,
  METHOD_MODEL_PROVIDER_CONFIG_IMPORT,
  METHOD_MODEL_PROVIDER_CREATE,
  METHOD_MODEL_PROVIDER_DELETE,
  METHOD_MODEL_PROVIDER_FETCH_MODELS,
  METHOD_MODEL_PROVIDER_KEY_CREATE,
  METHOD_MODEL_PROVIDER_KEY_DELETE,
  METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD,
  METHOD_MODEL_PROVIDER_KEY_NEXT,
  METHOD_MODEL_PROVIDER_KEY_UPDATE,
  METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD,
  METHOD_MODEL_PROVIDER_LIST,
  METHOD_MODEL_PROVIDER_READ,
  METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE,
  METHOD_MODEL_PROVIDER_TEST_CHAT,
  METHOD_MODEL_PROVIDER_TEST_CONNECTION,
  METHOD_MODEL_PROVIDER_UI_STATE_READ,
  METHOD_MODEL_PROVIDER_UI_STATE_WRITE,
  METHOD_MODEL_PROVIDER_UPDATE,
  METHOD_MODEL_SYNC_STATE_READ,
  METHOD_MCP_PROMPT_LIST,
  METHOD_MCP_PROMPT_GET,
  METHOD_MCP_RESOURCE_LIST,
  METHOD_MCP_RESOURCE_READ,
  METHOD_MCP_SERVER_CREATE,
  METHOD_MCP_SERVER_DELETE,
  METHOD_MCP_SERVER_ENABLED_SET,
  METHOD_MCP_SERVER_IMPORT_FROM_APP,
  METHOD_MCP_SERVER_LIST,
  METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
  METHOD_MCP_SERVER_START,
  METHOD_MCP_SERVER_STATUS_LIST,
  METHOD_MCP_SERVER_STOP,
  METHOD_MCP_SERVER_UPDATE,
  METHOD_MCP_TOOL_CALL,
  METHOD_MCP_TOOL_CALL_WITH_CALLER,
  METHOD_MCP_TOOL_LIST,
  METHOD_MCP_TOOL_LIST_FOR_CONTEXT,
  METHOD_MCP_TOOL_SEARCH,
  METHOD_MEMORY_STORE_ADD_NOTE,
  METHOD_MEMORY_STORE_CONSOLIDATE,
  METHOD_MEMORY_STORE_HEALTH,
  METHOD_MEMORY_STORE_INDEX_REBUILD,
  METHOD_MEMORY_STORE_LIST,
  METHOD_MEMORY_STORE_READ,
  METHOD_MEMORY_STORE_REVIEW_LIST,
  METHOD_MEMORY_STORE_REVIEW_RESOLVE,
  METHOD_MEMORY_STORE_RESET,
  METHOD_MEMORY_STORE_SEARCH,
  METHOD_PROJECT_MEMORY_READ,
  METHOD_SESSION_FILE_DELETE,
  METHOD_SESSION_FILE_GET_OR_CREATE,
  METHOD_SESSION_FILE_LIST,
  METHOD_SESSION_FILE_READ,
  METHOD_SESSION_FILE_RESOLVE_PATH,
  METHOD_SESSION_FILE_SAVE,
  METHOD_SESSION_FILE_UPDATE_META,
  METHOD_SKILL_CACHE_REFRESH,
  METHOD_SKILL_INSTALLED_DIRECTORIES_LIST,
  METHOD_SKILL_LOCAL_IMPORT,
  METHOD_SKILL_LOCAL_INSPECT,
  METHOD_SKILL_LOCAL_DETAIL_INSPECT,
  METHOD_SKILL_LOCAL_RENAME,
  METHOD_SKILL_LOCAL_SCAFFOLD_CREATE,
  METHOD_SKILL_MANAGEMENT_INSTALL,
  METHOD_SKILL_MANAGEMENT_LIST,
  METHOD_SKILL_MANAGEMENT_UNINSTALL,
  METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL,
  METHOD_SKILL_LIST,
  METHOD_SKILL_MARKETPLACE_INSTALL,
  METHOD_SKILL_PACKAGE_EXPORT,
  METHOD_SKILL_PACKAGE_LOCAL_INSPECT,
  METHOD_SKILL_PACKAGE_LOCAL_INSTALL,
  METHOD_SKILL_PACKAGE_LOCAL_REPLACE,
  METHOD_SKILL_REMOTE_INSPECT,
  METHOD_SKILL_REPOSITORY_DELETE,
  METHOD_SKILL_REPOSITORY_LIST,
  METHOD_SKILL_REPOSITORY_SAVE,
  METHOD_SKILL_READ,
  METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
  METHOD_USAGE_STATS_MODEL_RANKING_LIST,
  METHOD_USAGE_STATS_READ,
  METHOD_VOICE_ASR_CREDENTIAL_CREATE,
  METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET,
  METHOD_VOICE_ASR_CREDENTIAL_DELETE,
  METHOD_VOICE_ASR_CREDENTIAL_LIST,
  METHOD_VOICE_ASR_CREDENTIAL_TEST,
  METHOD_VOICE_ASR_CREDENTIAL_UPDATE,
  METHOD_VOICE_INSTRUCTION_DELETE,
  METHOD_VOICE_INSTRUCTION_LIST,
  METHOD_VOICE_INSTRUCTION_SAVE,
  METHOD_VOICE_MODEL_DEFAULT_SET,
  METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE,
  METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
  METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
  METHOD_WECHAT_CHANNEL_LOGIN_START,
  METHOD_WECHAT_CHANNEL_LOGIN_WAIT,
  METHOD_WECHAT_CHANNEL_PROBE,
  METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
  METHOD_WORKSPACE_BY_PATH_READ,
  METHOD_WORKSPACE_DELETE,
  METHOD_WORKSPACE_DEFAULT_ENSURE,
  METHOD_WORKSPACE_DEFAULT_READ,
  METHOD_WORKSPACE_ENSURE,
  METHOD_WORKSPACE_ENSURE_READY,
  METHOD_WORKSPACE_LIST,
  METHOD_WORKSPACE_PROJECTS_ROOT_READ,
  METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
  METHOD_WORKSPACE_READ,
  METHOD_WORKSPACE_REGISTERED_SKILLS_LIST,
  METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
  METHOD_WORKSPACE_UPDATE,
  PROTOCOL_VERSION,
  agentSessionEventNotification,
  decodeMessage,
  encodeMessage,
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcResponse,
  notification,
  request,
  type AgentEvent,
  type AgentSessionAnalysisHandoffExportParams,
  type AgentSessionAnalysisHandoffExportResponse,
  type AgentSessionActionReplayParams,
  type AgentSessionActionReplayResponse,
  type AgentSessionActionRespondParams,
  type AgentSessionActionRespondResponse,
  type AgentSessionArchiveManyParams,
  type AgentSessionArchiveManyResponse,
  type AgentSessionDeleteParams,
  type AgentSessionDeleteResponse,
  type AgentSessionCompactParams,
  type AgentSessionCompactResponse,
  type AgentSessionEventNotification,
  type AgentSessionHandoffBundleExportParams,
  type AgentSessionHandoffBundleExportResponse,
  type AgentSessionListParams,
  type AgentSessionListResponse,
  type AgentSessionObjectiveClearParams,
  type AgentSessionObjectiveClearResponse,
  type AgentSessionObjectiveAuditParams,
  type AgentSessionObjectiveAuditResponse,
  type AgentSessionObjectiveContinueParams,
  type AgentSessionObjectiveContinueResponse,
  type AgentSessionFileCheckpointDetail,
  type AgentSessionFileCheckpointDiffParams,
  type AgentSessionFileCheckpointDiffResponse,
  type AgentSessionFileCheckpointGetParams,
  type AgentSessionFileCheckpointListParams,
  type AgentSessionFileCheckpointListResponse,
  type AgentSessionFileCheckpointRestoreParams,
  type AgentSessionFileCheckpointRestoreResponse,
  type AgentSessionFileCheckpointSummary,
  type AgentSessionFileCheckpointThreadSummary,
  type AgentSessionObjectiveReadParams,
  type AgentSessionObjectiveReadResponse,
  type AgentSessionObjectiveSetParams,
  type AgentSessionObjectiveSetResponse,
  type AgentSessionObjectiveStatusUpdateParams,
  type AgentSessionObjectiveStatusUpdateResponse,
  type AgentSessionQueuedTurnPromoteParams,
  type AgentSessionQueuedTurnPromoteResponse,
  type AgentSessionQueuedTurnRemoveParams,
  type AgentSessionQueuedTurnRemoveResponse,
  type AgentSessionReadParams,
  type AgentSessionReadResponse,
  type AgentSessionReplayCaseExportParams,
  type AgentSessionReplayCaseExportResponse,
  type AgentSessionReviewDecisionSaveParams,
  type AgentSessionReviewDecisionTemplateExportParams,
  type AgentSessionReviewDecisionTemplateExportResponse,
  type AgentSessionStartParams,
  type AgentSessionStartResponse,
  type AgentSessionThreadResumeParams,
  type AgentSessionThreadResumeResponse,
  type AgentSessionToolInventoryReadParams,
  type AgentSessionToolInventoryReadResponse,
  type AgentSessionTurnCancelParams,
  type AgentSessionTurnCancelResponse,
  type AgentSessionTurnStartParams,
  type AgentSessionTurnStartResponse,
  type AgentSessionUpdateParams,
  type AgentSessionUpdateResponse,
  type AgentAppFetchCloudPackageParams,
  type AgentAppInstalledDisabledSetParams,
  type AgentAppInstalledListResponse,
  type AgentAppInstalledSaveParams,
  type AgentAppLocalPackageInspectParams,
  type AgentAppLocalPackageInspectResponse,
  type AgentAppPackageCacheEntry,
  type AgentAppShellPrepareParams,
  type AgentAppShellPrepareResponse,
  type AgentAppUninstallParams,
  type AgentAppUninstallRehearsalParams,
  type AgentAppUninstallRehearsalResponse,
  type AgentAppUninstallResponse,
  type AgentAppUiRuntimeStartParams,
  type AgentAppUiRuntimeStatusParams,
  type AgentAppUiRuntimeStatusResponse,
  type AgentAppUiRuntimeStopParams,
  type AppServerMethodSpec,
  type AppServerProtocolSchemaManifest,
  type ArtifactReadParams,
  type ArtifactReadResponse,
  type ArtifactSummary,
  type AutomationJobCreateParams,
  type AutomationJobDeleteResponse,
  type AutomationJobHealthParams,
  type AutomationJobHealthResponse,
  type AutomationJobIdParams,
  type AutomationJobListResponse,
  type AutomationJobReadResponse,
  type AutomationJobRunHistoryParams,
  type AutomationJobRunHistoryResponse,
  type AutomationJobRunNowResponse,
  type AutomationJobUpdateParams,
  type AutomationJobWriteResponse,
  type AutomationScheduleParams,
  type AutomationSchedulePreviewResponse,
  type AutomationScheduleValidateResponse,
  type AutomationSchedulerConfigReadResponse,
  type AutomationSchedulerConfigUpdateParams,
  type AutomationSchedulerConfigUpdateResponse,
  type AutomationSchedulerStatusResponse,
  type CapabilityListParams,
  type CapabilityListResponse,
  type ConnectCallbackSendParams,
  type ConnectCallbackSendResponse,
  type ConnectDeepLinkResolveParams,
  type ConnectDeepLinkResolveResponse,
  type ConnectOpenDeepLinkResolveParams,
  type ConnectOpenDeepLinkResolveResponse,
  type ConnectRelayApiKeySaveParams,
  type ConnectRelayApiKeySaveResponse,
  type ConversationImportSourceScanParams,
  type ConversationImportSourceScanResponse,
  type ConversationImportThreadRuntimeEventsReadParams,
  type ConversationImportThreadRuntimeEventsReadResponse,
  type ConversationImportThreadCommitParams,
  type ConversationImportThreadCommitResponse,
  type ConversationImportThreadPreviewParams,
  type ConversationImportThreadPreviewResponse,
  type ExecutionProcessDrainOutputParams,
  type ExecutionProcessDrainOutputResponse,
  type ExecutionProcessEmptyResponse,
  type ExecutionProcessIdParams,
  type ExecutionProcessStartParams,
  type ExecutionProcessStartResponse,
  type ExecutionProcessStatusResponse,
  type ExecutionProcessWriteStdinParams,
  type EvidenceExportParams,
  type EvidenceExportResponse,
  type FileSystemCreateDirectoryParams,
  type FileSystemCreateFileParams,
  type FileSystemDeleteFileParams,
  type FileSystemDirectoryListing,
  type FileSystemFilePreview,
  type FileSystemListDirectoryParams,
  type FileSystemMutationResponse,
  type FileSystemReadFilePreviewParams,
  type FileSystemRenameFileParams,
  type ProjectGitBranchCheckoutParams,
  type ProjectGitBranchCheckoutResponse,
  type ProjectGitBranchCreateParams,
  type ProjectGitBranchCreateResponse,
  type ProjectGitCommitListParams,
  type ProjectGitCommitListResponse,
  type ProjectGitDiffParams,
  type ProjectGitDiffResponse,
  type ProjectGitStatusParams,
  type ProjectGitStatusResponse,
  type ProjectGitWorktreeCreateParams,
  type ProjectGitWorktreeCreateResponse,
  type ProjectShellEmptyResponse,
  type ProjectShellSessionDrainEventsParams,
  type ProjectShellSessionDrainEventsResponse,
  type ProjectShellSessionKillParams,
  type ProjectShellSessionResizeParams,
  type ProjectShellSessionStartParams,
  type ProjectShellSessionStartResponse,
  type ProjectShellSessionWriteParams,
  type GalleryMaterialDeleteResponse,
  type GalleryMaterialFilterParams,
  type GalleryMaterialListResponse,
  type GalleryMaterialLookupParams,
  type GalleryMaterialMetadataCreateParams,
  type GalleryMaterialMetadataResponse,
  type GalleryMaterialMetadataUpdateParams,
  type GalleryMaterialResponse,
  type ProjectMaterialContentResponse,
  type ProjectMaterialCountResponse,
  type ProjectMaterialDeleteResponse,
  type ProjectMaterialImportFromUrlParams,
  type ProjectMaterialListParams,
  type ProjectMaterialListResponse,
  type ProjectMaterialLookupParams,
  type ProjectMaterialResponse,
  type ProjectMaterialUpdateParams,
  type ProjectMaterialUploadParams,
  type GatewayChannelStartParams,
  type GatewayChannelStopParams,
  type GatewayChannelStatusParams,
  type GatewayChannelStatusResponse,
  type GatewayTunnelCloudflaredDetectResponse,
  type GatewayTunnelCloudflaredInstallParams,
  type GatewayTunnelCloudflaredInstallResponse,
  type GatewayTunnelCreateParams,
  type GatewayTunnelCreateResponse,
  type GatewayTunnelProbeResponse,
  type GatewayTunnelStatusResponse,
  type GatewayTunnelSyncWebhookUrlParams,
  type GatewayTunnelSyncWebhookUrlResponse,
  type ChannelProbeParams,
  type ChannelProbeResponse,
  type InitializeParams,
  type InitializeResponse,
  type JsonRpcErrorResponse,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type KnowledgeCompilePackParams,
  type KnowledgeCompilePackResponse,
  type KnowledgeContextResolutionResponse,
  type KnowledgeImportSourceParams,
  type KnowledgeImportSourceResponse,
  type KnowledgeListPacksParams,
  type KnowledgeListPacksResponse,
  type KnowledgeReadPackParams,
  type KnowledgeReadPackResponse,
  type KnowledgeResolveContextParams,
  type KnowledgeSetDefaultPackParams,
  type KnowledgeSetDefaultPackResponse,
  type KnowledgeUpdatePackStatusParams,
  type KnowledgeUpdatePackStatusResponse,
  type KnowledgeValidateContextRunParams,
  type KnowledgeValidateContextRunResponse,
  type LogClearResponse,
  type LogStorageDiagnosticsResponse,
  type LogListResponse,
  type LogPersistedTailParams,
  type LogPersistedTailResponse,
  type ServerDiagnosticsResponse,
  type SessionFileEntryResponse,
  type SessionFileGetOrCreateParams,
  type SessionFileIdParams,
  type SessionFileListResponse,
  type SessionFileMetaResponse,
  type SessionFileMutationResponse,
  type SessionFileReadResponse,
  type SessionFileResolvePathResponse,
  type SessionFileSaveParams,
  type SessionFileUpdateMetaParams,
  type SupportBundleExportResponse,
  type WindowsStartupDiagnosticsResponse,
  type MediaTaskArtifactAudioCompleteParams,
  type MediaTaskArtifactAudioCreateParams,
  type MediaTaskArtifactImageCreateParams,
  type MediaTaskArtifactListParams,
  type MediaTaskArtifactListResponse,
  type MediaTaskArtifactLookupParams,
  type MediaTaskArtifactResponse,
  type MediaTaskArtifactVideoCreateParams,
  type ModelListParams,
  type ModelListResponse,
  type ModelPreferencesListResponse,
  type ModelProviderAliasListResponse,
  type ModelProviderAliasReadParams,
  type ModelProviderAliasReadResponse,
  type ModelProviderCatalogListResponse,
  type ModelProviderConfigExportParams,
  type ModelProviderConfigImportParams,
  type ModelProviderCreateParams,
  type ModelProviderDeleteParams,
  type ModelProviderFetchModelsParams,
  type ModelProviderKeyCreateParams,
  type ModelProviderKeyDeleteParams,
  type ModelProviderKeyEventParams,
  type ModelProviderKeyNextParams,
  type ModelProviderKeyUpdateParams,
  type ModelProviderListResponse,
  type ModelProviderReadParams,
  type ModelProviderSortOrdersUpdateParams,
  type ModelProviderTestChatParams,
  type ModelProviderTestConnectionParams,
  type ModelProviderUiStateReadParams,
  type ModelProviderUiStateWriteParams,
  type ModelProviderUpdateParams,
  type ModelSyncStateReadResponse,
  type McpPromptListResponse,
  type McpPromptGetParams,
  type McpPromptGetResponse,
  type McpResourceListResponse,
  type McpResourceReadParams,
  type McpResourceReadResponse,
  type McpServerCreateParams,
  type McpServerDeleteParams,
  type McpServerEnabledSetParams,
  type McpServerImportFromAppParams,
  type McpServerImportFromAppResponse,
  type McpServerListResponse,
  type McpServerLifecycleResponse,
  type McpServerStartParams,
  type McpServerStatusListResponse,
  type McpServerStopParams,
  type McpServerUpdateParams,
  type McpToolCallParams,
  type McpToolCallResponse,
  type McpToolCallWithCallerParams,
  type McpToolListForContextParams,
  type McpToolListResponse,
  type McpToolSearchParams,
  type MemoryStoreAddNoteParams,
  type MemoryStoreAddNoteResponse,
  type MemoryStoreConsolidateParams,
  type MemoryStoreConsolidateResponse,
  type MemoryStoreHealthResponse,
  type MemoryStoreIndexRebuildResponse,
  type MemoryStoreListParams,
  type MemoryStoreListResponse,
  type MemoryStoreReadParams,
  type MemoryStoreReadResponse,
  type MemoryStoreReviewListParams,
  type MemoryStoreReviewListResponse,
  type MemoryStoreReviewResolveParams,
  type MemoryStoreReviewResolveResponse,
  type MemoryStoreResetParams,
  type MemoryStoreResetResponse,
  type MemoryStoreRootParams,
  type MemoryStoreSearchParams,
  type MemoryStoreSearchResponse,
  type ProtocolSchemaFile,
  type ProtocolSchemaGroup,
  type ProjectMemoryReadParams,
  type ProjectMemoryReadResponse,
  type RequestId,
  type SkillDownloadInstallParams,
  type SkillDownloadInstallResponse,
  type SkillInstalledDirectoriesListResponse,
  type SkillLocalImportParams,
  type SkillLocalImportResponse,
  type SkillLocalInspectParams,
  type SkillLocalInspectResponse,
  type SkillLocalDetailInspectParams,
  type SkillLocalDetailInspectResponse,
  type SkillLocalRenameParams,
  type SkillLocalRenameResponse,
  type SkillManagementInstallParams,
  type SkillManagementListParams,
  type SkillManagementUninstallParams,
  type SkillManagementWriteResponse,
  type SkillListResponse,
  type SkillMarketplaceInstallParams,
  type SkillMarketplaceInstallResponse,
  type SkillPackageExportParams,
  type SkillPackageExportResponse,
  type SkillPackageLocalInspectParams,
  type SkillPackageLocalInspectResponse,
  type SkillPackageLocalInstallParams,
  type SkillPackageLocalInstallResponse,
  type SkillPackageLocalReplaceParams,
  type SkillPackageLocalReplaceResponse,
  type SkillRemoteInspectParams,
  type SkillRemoteInspectResponse,
  type SkillRepositoryDeleteParams,
  type SkillRepositoryListResponse,
  type SkillRepositorySaveParams,
  type SkillReadParams,
  type SkillReadResponse,
  type SkillScaffoldCreateParams,
  type SkillScaffoldCreateResponse,
  type UsageStatsDailyTrendsListResponse,
  type UsageStatsModelRankingListResponse,
  type UsageStatsRangeParams,
  type UsageStatsReadResponse,
  type VoiceAsrCredentialCreateParams,
  type VoiceAsrCredentialIdParams,
  type VoiceAsrCredentialListResponse,
  type VoiceAsrCredentialMutationResponse,
  type VoiceAsrCredentialTestResponse,
  type VoiceAsrCredentialUpdateParams,
  type VoiceAsrCredentialWriteResponse,
  type VoiceInstructionIdParams,
  type VoiceInstructionListResponse,
  type VoiceInstructionMutationResponse,
  type VoiceInstructionSaveParams,
  type VoiceModelDefaultSetParams,
  type VoiceModelDefaultSetResponse,
  type VoiceModelTestTranscribeFileParams,
  type VoiceModelTestTranscribeFileResponse,
  type WechatChannelAccountRemoveParams,
  type WechatChannelAccountRemoveResponse,
  type WechatChannelAccountListResponse,
  type WechatLoginStartParams,
  type WechatLoginStartResponse,
  type WechatLoginWaitParams,
  type WechatLoginWaitResponse,
  type WechatRuntimeModelSetParams,
  type WechatRuntimeModelSetResponse,
  type WorkspaceDeleteParams,
  type WorkspaceDeleteResponse,
  type WorkspaceEnsureParams,
  type WorkspaceEnsureProjectParams,
  type WorkspaceEnsureProjectResponse,
  type WorkspaceEnsureReadyResponse,
  type WorkspaceListResponse,
  type WorkspacePathReadParams,
  type WorkspaceProjectPathResolveParams,
  type WorkspaceProjectPathResolveResponse,
  type WorkspaceProjectsRootReadResponse,
  type WorkspaceReadParams,
  type WorkspaceReadResponse,
  type WorkspaceRegisteredSkillsListParams,
  type WorkspaceRegisteredSkillsListResponse,
  type WorkspaceSkillBindingsListParams,
  type WorkspaceSkillBindingsListResponse,
  type WorkspaceUpdateParams,
  type WorkspaceUpdateResponse,
} from "./protocol.js";

export * from "./protocol.js";

export const DEFAULT_LISTEN_URL = "stdio://";
export const DEFAULT_RELEASE_MANIFEST_NAME = "app-server.release.json";
export const DEFAULT_PROTOCOL_SCHEMA_MANIFEST_NAME = "manifest.json";

export type SidecarLaunchConfig = {
  binaryPath: string;
  listenUrl: string;
  dataDir?: string;
  productDbMigrationCleanup?:
    | "retain"
    | "clear-rows"
    | "drop-tables"
    | "delete-file";
  backendMode?: "external" | "runtime" | "mock" | "unavailable";
  backendCommand?: string;
  backendArgs?: string[];
  backendTimeoutMs?: number;
  appPolicyPath?: string;
  expectedSha256?: string;
  artifact?: AppServerReleaseArtifact;
};

export type SidecarBinaryPathSource = "env" | "resources" | "dev";

export type SidecarBinaryPathResolution = {
  binaryPath: string;
  source: SidecarBinaryPathSource;
};

export type ResolveSidecarBinaryPathOptions = {
  env?: NodeJS.ProcessEnv;
  envVarName?: string;
  allowEnvOverride?: boolean;
  resourcesPath?: string;
  resourceRelativePath?: string;
  devBinaryPath?: string;
  platform?: NodeJS.Platform | string;
  arch?: NodeJS.Architecture | string;
};

export type ResolveSidecarFromManifestOptions =
  ResolveSidecarBinaryPathOptions & {
    listenUrl?: string;
    backendMode?: SidecarLaunchConfig["backendMode"];
    backendCommand?: string;
    backendArgs?: string[];
    backendTimeoutMs?: number;
    appPolicyPath?: string;
    dataDir?: string;
    productDbMigrationCleanup?: SidecarLaunchConfig["productDbMigrationCleanup"];
    expectedProtocolVersion?: string;
  };

export const DEFAULT_STANDALONE_BACKEND_MODE: NonNullable<
  SidecarLaunchConfig["backendMode"]
> = "unavailable";

export type ResolvedSidecarLaunchConfig = {
  config: SidecarLaunchConfig;
  artifact: AppServerReleaseArtifact;
  binaryPathSource: SidecarBinaryPathSource;
};

export type SidecarProcessOptions = {
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  verifySha256?: boolean;
  spawnOptions?: Omit<SpawnOptionsWithoutStdio, "stdio" | "cwd" | "env">;
};

export type ConnectSidecarOptions = SidecarProcessOptions & {
  client?: AppServerClient;
  initializeTimeoutMs?: number;
  expectedProtocolVersion?: string;
};

export type SidecarRestartPolicy = {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
};

export type SidecarExitEvent = {
  attempt: number;
  code: number | null;
  signal: NodeJS.Signals | null;
  stderrLines: string[];
};

export type SidecarRestartScheduledEvent = SidecarExitEvent & {
  delayMs: number;
};

export type SidecarRestartFailedEvent = {
  attempt: number;
  error: unknown;
  stderrLines?: string[];
};

export type SidecarLifecycleOptions = ConnectSidecarOptions & {
  restartPolicy?: SidecarRestartPolicy;
  sleep?: (delayMs: number) => Promise<void>;
  onExit?: (event: SidecarExitEvent) => void;
  onRestartScheduled?: (event: SidecarRestartScheduledEvent) => void;
  onRestarted?: (connected: ConnectedAppServerSidecar, attempt: number) => void;
  onRestartFailed?: (event: SidecarRestartFailedEvent) => void;
};

export type PackagedSidecarLifecycleOptions = SidecarLifecycleOptions &
  ResolveSidecarFromManifestOptions & {
    resourcesPath: string;
    manifestPath?: string;
    manifestRelativePath?: string;
  };

export type ConnectedAppServerSidecar = {
  client: AppServerClient;
  connection: AppServerConnection;
  sidecar: AppServerSidecar;
  initializeResponse: InitializeResponse;
};

export type StartedPackagedAppServerSidecar = {
  resolved: ResolvedSidecarLaunchConfig;
  lifecycle: AppServerSidecarLifecycle;
  connected: ConnectedAppServerSidecar;
};

export type AppServerMessageTransport = {
  send(message: JsonRpcMessage): void;
  nextMessage(timeoutMs?: number): Promise<JsonRpcMessage>;
};

export type AgentEventListener = (
  event: AgentEvent,
  notification: AgentSessionEventNotification,
) => void | Promise<void>;

export type AgentRuntimeEventListener = AgentEventListener;

export type AgentRuntimeClientOptions = {
  request?: AppServerRequestOptions;
};

export type AgentRuntimeClientSubscription = {
  unsubscribe(): void;
};

export interface AgentRuntimeClient {
  startTurn(
    params: AgentSessionTurnStartParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionTurnStartResponse>>;
  cancelTurn(
    params: AgentSessionTurnCancelParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionTurnCancelResponse>>;
  respondAction(
    params: AgentSessionActionRespondParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionActionRespondResponse>>;
  readThread(
    params: AgentSessionReadParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionReadResponse>>;
  readToolInventory(
    params?: AgentSessionToolInventoryReadParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AgentSessionToolInventoryReadResponse>>;
  exportEvidence(
    params: EvidenceExportParams,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<EvidenceExportResponse>>;
  subscribeEvents(
    listener: AgentRuntimeEventListener,
  ): AgentRuntimeClientSubscription;
  dispatchEvent(message: JsonRpcMessage): Promise<boolean>;
  nextEvent(timeoutMs?: number): Promise<AgentSessionEventNotification>;
}

export type AppServerRequestOptions = {
  timeoutMs?: number;
};

const APP_SERVER_TRANSPORT_READ_SLICE_MS = 250;

export type AppServerRequestResult<T> = {
  id: RequestId;
  result: T;
  response: JsonRpcResponse;
  notifications: JsonRpcNotification[];
  messages: JsonRpcMessage[];
};

export type AppServerRequestFirstMessageResult<T> =
  | (AppServerRequestResult<T> & { completed: true })
  | {
      id: RequestId;
      completed: false;
      notifications: JsonRpcNotification[];
      messages: JsonRpcMessage[];
    };

export class AppServerRequestError extends Error {
  readonly id: RequestId;
  readonly method: string;
  readonly response: JsonRpcErrorResponse;
  readonly notifications: JsonRpcNotification[];
  readonly messages: JsonRpcMessage[];

  constructor(
    method: string,
    response: JsonRpcErrorResponse,
    notifications: JsonRpcNotification[],
    messages: JsonRpcMessage[],
  ) {
    super(`${method} failed: ${response.error.message}`);
    this.name = "AppServerRequestError";
    this.id = response.id;
    this.method = method;
    this.response = response;
    this.notifications = notifications;
    this.messages = messages;
  }
}

export type AppServerArtifactPlatform =
  | "darwin-arm64"
  | "darwin-x64"
  | "win32-x64"
  | "linux-x64"
  | string;

export type AppServerReleaseArtifact = {
  platform: AppServerArtifactPlatform;
  url: string;
  sha256: string;
};

export type AppServerReleaseManifest = {
  version: string;
  protocolVersion: string;
  artifacts: AppServerReleaseArtifact[];
};

export class AppServerClient {
  #nextRequestId: number;

  constructor(options: { initialRequestId?: number } = {}) {
    this.#nextRequestId = options.initialRequestId ?? 1;
  }

  initialize(params: InitializeParams): JsonRpcRequest {
    return this.request(METHOD_INITIALIZE, params);
  }

  initialized(): JsonRpcNotification {
    return notification(METHOD_INITIALIZED, {});
  }

  listCapabilities(params: CapabilityListParams = {}): JsonRpcRequest {
    return this.request(METHOD_CAPABILITY_LIST, params);
  }

  listSessions(params: AgentSessionListParams = {}): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_LIST, params);
  }

  updateSession(params: AgentSessionUpdateParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_UPDATE, params);
  }

  archiveManySessions(params: AgentSessionArchiveManyParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_ARCHIVE_MANY, params);
  }

  deleteSession(params: AgentSessionDeleteParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_DELETE, params);
  }

  readAgentSessionObjective(
    params: AgentSessionObjectiveReadParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_OBJECTIVE_READ, params);
  }

  setAgentSessionObjective(
    params: AgentSessionObjectiveSetParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_OBJECTIVE_SET, params);
  }

  updateAgentSessionObjectiveStatus(
    params: AgentSessionObjectiveStatusUpdateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE, params);
  }

  clearAgentSessionObjective(
    params: AgentSessionObjectiveClearParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_OBJECTIVE_CLEAR, params);
  }

  continueAgentSessionObjective(
    params: AgentSessionObjectiveContinueParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE, params);
  }

  auditAgentSessionObjective(
    params: AgentSessionObjectiveAuditParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_OBJECTIVE_AUDIT, params);
  }

  compactAgentSession(params: AgentSessionCompactParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_COMPACT, params);
  }

  resumeAgentSessionThread(
    params: AgentSessionThreadResumeParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_THREAD_RESUME, params);
  }

  removeAgentSessionQueuedTurn(
    params: AgentSessionQueuedTurnRemoveParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE, params);
  }

  promoteAgentSessionQueuedTurn(
    params: AgentSessionQueuedTurnPromoteParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE, params);
  }

  listAgentSessionFileCheckpoints(
    params: AgentSessionFileCheckpointListParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST, params);
  }

  getAgentSessionFileCheckpoint(
    params: AgentSessionFileCheckpointGetParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET, params);
  }

  diffAgentSessionFileCheckpoint(
    params: AgentSessionFileCheckpointDiffParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF, params);
  }

  restoreAgentSessionFileCheckpoint(
    params: AgentSessionFileCheckpointRestoreParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE, params);
  }

  getOrCreateSessionFile(params: SessionFileGetOrCreateParams): JsonRpcRequest {
    return this.request(METHOD_SESSION_FILE_GET_OR_CREATE, params);
  }

  updateSessionFileMeta(params: SessionFileUpdateMetaParams): JsonRpcRequest {
    return this.request(METHOD_SESSION_FILE_UPDATE_META, params);
  }

  saveSessionFile(params: SessionFileSaveParams): JsonRpcRequest {
    return this.request(METHOD_SESSION_FILE_SAVE, params);
  }

  readSessionFile(params: SessionFileIdParams): JsonRpcRequest {
    return this.request(METHOD_SESSION_FILE_READ, params);
  }

  resolveSessionFilePath(params: SessionFileIdParams): JsonRpcRequest {
    return this.request(METHOD_SESSION_FILE_RESOLVE_PATH, params);
  }

  deleteSessionFile(params: SessionFileIdParams): JsonRpcRequest {
    return this.request(METHOD_SESSION_FILE_DELETE, params);
  }

  listSessionFiles(params: SessionFileGetOrCreateParams): JsonRpcRequest {
    return this.request(METHOD_SESSION_FILE_LIST, params);
  }

  listWorkspaces(): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_LIST, {});
  }

  readWorkspace(params: WorkspaceReadParams): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_READ, params);
  }

  updateWorkspace(params: WorkspaceUpdateParams): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_UPDATE, params);
  }

  deleteWorkspace(params: WorkspaceDeleteParams): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_DELETE, params);
  }

  ensureWorkspace(params: WorkspaceEnsureProjectParams): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_ENSURE, params);
  }

  readWorkspaceByPath(params: WorkspacePathReadParams): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_BY_PATH_READ, params);
  }

  readDefaultWorkspace(): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_DEFAULT_READ, {});
  }

  ensureDefaultWorkspace(): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_DEFAULT_ENSURE, {});
  }

  readWorkspaceProjectsRoot(): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_PROJECTS_ROOT_READ, {});
  }

  resolveWorkspaceProjectPath(
    params: WorkspaceProjectPathResolveParams,
  ): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_PROJECT_PATH_RESOLVE, params);
  }

  ensureWorkspaceReady(params: WorkspaceEnsureParams): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_ENSURE_READY, params);
  }

  listSkills(): JsonRpcRequest {
    return this.request(METHOD_SKILL_LIST, {});
  }

  readSkill(params: SkillReadParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_READ, params);
  }

  listManagementSkills(params: SkillManagementListParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_MANAGEMENT_LIST, params);
  }

  installManagementSkill(params: SkillManagementInstallParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_MANAGEMENT_INSTALL, params);
  }

  uninstallManagementSkill(
    params: SkillManagementUninstallParams,
  ): JsonRpcRequest {
    return this.request(METHOD_SKILL_MANAGEMENT_UNINSTALL, params);
  }

  listSkillRepositories(): JsonRpcRequest {
    return this.request(METHOD_SKILL_REPOSITORY_LIST, {});
  }

  saveSkillRepository(params: SkillRepositorySaveParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_REPOSITORY_SAVE, params);
  }

  deleteSkillRepository(params: SkillRepositoryDeleteParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_REPOSITORY_DELETE, params);
  }

  refreshSkillCache(): JsonRpcRequest {
    return this.request(METHOD_SKILL_CACHE_REFRESH, {});
  }

  listInstalledSkillDirectories(): JsonRpcRequest {
    return this.request(METHOD_SKILL_INSTALLED_DIRECTORIES_LIST, {});
  }

  inspectLocalSkill(params: SkillLocalInspectParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_LOCAL_INSPECT, params);
  }

  inspectLocalSkillDetail(
    params: SkillLocalDetailInspectParams,
  ): JsonRpcRequest {
    return this.request(METHOD_SKILL_LOCAL_DETAIL_INSPECT, params);
  }

  createSkillScaffold(params: SkillScaffoldCreateParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_LOCAL_SCAFFOLD_CREATE, params);
  }

  importLocalSkill(params: SkillLocalImportParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_LOCAL_IMPORT, params);
  }

  renameLocalSkill(params: SkillLocalRenameParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_LOCAL_RENAME, params);
  }

  inspectRemoteSkill(params: SkillRemoteInspectParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_REMOTE_INSPECT, params);
  }

  inspectLocalSkillPackage(
    params: SkillPackageLocalInspectParams,
  ): JsonRpcRequest {
    return this.request(METHOD_SKILL_PACKAGE_LOCAL_INSPECT, params);
  }

  installLocalSkillPackage(
    params: SkillPackageLocalInstallParams,
  ): JsonRpcRequest {
    return this.request(METHOD_SKILL_PACKAGE_LOCAL_INSTALL, params);
  }

  replaceLocalSkillPackage(
    params: SkillPackageLocalReplaceParams,
  ): JsonRpcRequest {
    return this.request(METHOD_SKILL_PACKAGE_LOCAL_REPLACE, params);
  }

  exportSkillPackage(params: SkillPackageExportParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_PACKAGE_EXPORT, params);
  }

  installMarketplaceSkill(
    params: SkillMarketplaceInstallParams,
  ): JsonRpcRequest {
    return this.request(METHOD_SKILL_MARKETPLACE_INSTALL, params);
  }

  installSkillFromDownload(params: SkillDownloadInstallParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL, params);
  }

  listWorkspaceSkillBindings(
    params: WorkspaceSkillBindingsListParams,
  ): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_SKILL_BINDINGS_LIST, params);
  }

  listWorkspaceRegisteredSkills(
    params: WorkspaceRegisteredSkillsListParams,
  ): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_REGISTERED_SKILLS_LIST, params);
  }

  inspectAgentAppLocalPackage(
    params: AgentAppLocalPackageInspectParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT, params);
  }

  fetchAgentAppCloudPackage(
    params: AgentAppFetchCloudPackageParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD, params);
  }

  saveAgentAppInstalled(params: AgentAppInstalledSaveParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_INSTALLED_SAVE, params);
  }

  listAgentAppInstalled(): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_INSTALLED_LIST, {});
  }

  setAgentAppInstalledDisabled(
    params: AgentAppInstalledDisabledSetParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_INSTALLED_DISABLED_SET, params);
  }

  previewAgentAppUninstall(
    params: AgentAppUninstallRehearsalParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL, params);
  }

  uninstallAgentApp(params: AgentAppUninstallParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_INSTALLED_UNINSTALL, params);
  }

  prepareAgentAppShell(params: AgentAppShellPrepareParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_SHELL_PREPARE, params);
  }

  startAgentAppUiRuntime(params: AgentAppUiRuntimeStartParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_UI_RUNTIME_START, params);
  }

  getAgentAppUiRuntimeStatus(
    params: AgentAppUiRuntimeStatusParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_UI_RUNTIME_STATUS, params);
  }

  stopAgentAppUiRuntime(params: AgentAppUiRuntimeStopParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_UI_RUNTIME_STOP, params);
  }

  listKnowledgePacks(params: KnowledgeListPacksParams): JsonRpcRequest {
    return this.request(METHOD_KNOWLEDGE_PACK_LIST, params);
  }

  readKnowledgePack(params: KnowledgeReadPackParams): JsonRpcRequest {
    return this.request(METHOD_KNOWLEDGE_PACK_READ, params);
  }

  importKnowledgeSource(params: KnowledgeImportSourceParams): JsonRpcRequest {
    return this.request(METHOD_KNOWLEDGE_SOURCE_IMPORT, params);
  }

  compileKnowledgePack(params: KnowledgeCompilePackParams): JsonRpcRequest {
    return this.request(METHOD_KNOWLEDGE_PACK_COMPILE, params);
  }

  setDefaultKnowledgePack(
    params: KnowledgeSetDefaultPackParams,
  ): JsonRpcRequest {
    return this.request(METHOD_KNOWLEDGE_PACK_DEFAULT_SET, params);
  }

  updateKnowledgePackStatus(
    params: KnowledgeUpdatePackStatusParams,
  ): JsonRpcRequest {
    return this.request(METHOD_KNOWLEDGE_PACK_STATUS_UPDATE, params);
  }

  resolveKnowledgeContext(
    params: KnowledgeResolveContextParams,
  ): JsonRpcRequest {
    return this.request(METHOD_KNOWLEDGE_CONTEXT_RESOLVE, params);
  }

  validateKnowledgeContextRun(
    params: KnowledgeValidateContextRunParams,
  ): JsonRpcRequest {
    return this.request(METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE, params);
  }

  listAutomationJobs(): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_JOB_LIST, {});
  }

  readAutomationSchedulerConfig(): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_SCHEDULER_CONFIG_READ, {});
  }

  updateAutomationSchedulerConfig(
    params: AutomationSchedulerConfigUpdateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE, params);
  }

  readAutomationSchedulerStatus(): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_SCHEDULER_STATUS, {});
  }

  readAutomationJob(params: AutomationJobIdParams): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_JOB_READ, params);
  }

  createAutomationJob(params: AutomationJobCreateParams): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_JOB_CREATE, params);
  }

  updateAutomationJob(params: AutomationJobUpdateParams): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_JOB_UPDATE, params);
  }

  deleteAutomationJob(params: AutomationJobIdParams): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_JOB_DELETE, params);
  }

  runAutomationJobNow(params: AutomationJobIdParams): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_JOB_RUN_NOW, params);
  }

  readAutomationHealth(params: AutomationJobHealthParams = {}): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_JOB_HEALTH, params);
  }

  readAutomationRunHistory(
    params: AutomationJobRunHistoryParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_JOB_RUN_HISTORY, params);
  }

  previewAutomationSchedule(params: AutomationScheduleParams): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_SCHEDULE_PREVIEW, params);
  }

  validateAutomationSchedule(params: AutomationScheduleParams): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_SCHEDULE_VALIDATE, params);
  }

  listMcpServers(): JsonRpcRequest {
    return this.request(METHOD_MCP_SERVER_LIST, {});
  }

  listMcpServersWithStatus(): JsonRpcRequest {
    return this.request(METHOD_MCP_SERVER_STATUS_LIST, {});
  }

  createMcpServer(params: McpServerCreateParams): JsonRpcRequest {
    return this.request(METHOD_MCP_SERVER_CREATE, params);
  }

  updateMcpServer(params: McpServerUpdateParams): JsonRpcRequest {
    return this.request(METHOD_MCP_SERVER_UPDATE, params);
  }

  deleteMcpServer(params: McpServerDeleteParams): JsonRpcRequest {
    return this.request(METHOD_MCP_SERVER_DELETE, params);
  }

  setMcpServerEnabled(params: McpServerEnabledSetParams): JsonRpcRequest {
    return this.request(METHOD_MCP_SERVER_ENABLED_SET, params);
  }

  importMcpServersFromApp(
    params: McpServerImportFromAppParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MCP_SERVER_IMPORT_FROM_APP, params);
  }

  syncAllMcpServersToLive(): JsonRpcRequest {
    return this.request(METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE, {});
  }

  startMcpServer(params: McpServerStartParams): JsonRpcRequest {
    return this.request(METHOD_MCP_SERVER_START, params);
  }

  stopMcpServer(params: McpServerStopParams): JsonRpcRequest {
    return this.request(METHOD_MCP_SERVER_STOP, params);
  }

  listMcpTools(): JsonRpcRequest {
    return this.request(METHOD_MCP_TOOL_LIST, {});
  }

  listMcpToolsForContext(params: McpToolListForContextParams): JsonRpcRequest {
    return this.request(METHOD_MCP_TOOL_LIST_FOR_CONTEXT, params);
  }

  searchMcpTools(params: McpToolSearchParams): JsonRpcRequest {
    return this.request(METHOD_MCP_TOOL_SEARCH, params);
  }

  callMcpTool(params: McpToolCallParams): JsonRpcRequest {
    return this.request(METHOD_MCP_TOOL_CALL, params);
  }

  callMcpToolWithCaller(params: McpToolCallWithCallerParams): JsonRpcRequest {
    return this.request(METHOD_MCP_TOOL_CALL_WITH_CALLER, params);
  }

  listMcpPrompts(): JsonRpcRequest {
    return this.request(METHOD_MCP_PROMPT_LIST, {});
  }

  getMcpPrompt(params: McpPromptGetParams): JsonRpcRequest {
    return this.request(METHOD_MCP_PROMPT_GET, params);
  }

  listMcpResources(): JsonRpcRequest {
    return this.request(METHOD_MCP_RESOURCE_LIST, {});
  }

  readMcpResource(params: McpResourceReadParams): JsonRpcRequest {
    return this.request(METHOD_MCP_RESOURCE_READ, params);
  }

  readProjectMemory(params: ProjectMemoryReadParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_MEMORY_READ, params);
  }

  listMemoryStore(params: MemoryStoreListParams): JsonRpcRequest {
    return this.request(METHOD_MEMORY_STORE_LIST, params);
  }

  readMemoryStore(params: MemoryStoreReadParams): JsonRpcRequest {
    return this.request(METHOD_MEMORY_STORE_READ, params);
  }

  searchMemoryStore(params: MemoryStoreSearchParams): JsonRpcRequest {
    return this.request(METHOD_MEMORY_STORE_SEARCH, params);
  }

  addMemoryStoreNote(params: MemoryStoreAddNoteParams): JsonRpcRequest {
    return this.request(METHOD_MEMORY_STORE_ADD_NOTE, params);
  }

  consolidateMemoryStore(params: MemoryStoreConsolidateParams): JsonRpcRequest {
    return this.request(METHOD_MEMORY_STORE_CONSOLIDATE, params);
  }

  listMemoryStoreReviewNotes(
    params: MemoryStoreReviewListParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MEMORY_STORE_REVIEW_LIST, params);
  }

  resolveMemoryStoreReviewNote(
    params: MemoryStoreReviewResolveParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MEMORY_STORE_REVIEW_RESOLVE, params);
  }

  healthMemoryStore(params: MemoryStoreRootParams): JsonRpcRequest {
    return this.request(METHOD_MEMORY_STORE_HEALTH, params);
  }

  resetMemoryStore(params: MemoryStoreResetParams): JsonRpcRequest {
    return this.request(METHOD_MEMORY_STORE_RESET, params);
  }

  rebuildMemoryStoreIndex(params: MemoryStoreRootParams): JsonRpcRequest {
    return this.request(METHOD_MEMORY_STORE_INDEX_REBUILD, params);
  }

  listLogs(): JsonRpcRequest {
    return this.request(METHOD_LOG_LIST, {});
  }

  readPersistedLogTail(params: LogPersistedTailParams): JsonRpcRequest {
    return this.request(METHOD_LOG_PERSISTED_TAIL, params);
  }

  clearLogs(): JsonRpcRequest {
    return this.request(METHOD_LOG_CLEAR, {});
  }

  clearDiagnosticLogHistory(): JsonRpcRequest {
    return this.request(METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR, {});
  }

  readLogStorageDiagnostics(): JsonRpcRequest {
    return this.request(METHOD_DIAGNOSTICS_LOG_STORAGE_READ, {});
  }

  exportSupportBundle(): JsonRpcRequest {
    return this.request(METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT, {});
  }

  readServerDiagnostics(): JsonRpcRequest {
    return this.request(METHOD_DIAGNOSTICS_SERVER_READ, {});
  }

  readWindowsStartupDiagnostics(): JsonRpcRequest {
    return this.request(METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ, {});
  }

  readGatewayChannelStatus(params: GatewayChannelStatusParams): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_CHANNEL_STATUS, params);
  }

  startGatewayChannel(params: GatewayChannelStartParams): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_CHANNEL_START, params);
  }

  stopGatewayChannel(params: GatewayChannelStopParams): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_CHANNEL_STOP, params);
  }

  probeTelegramChannel(params: ChannelProbeParams = {}): JsonRpcRequest {
    return this.request(METHOD_TELEGRAM_CHANNEL_PROBE, params);
  }

  probeFeishuChannel(params: ChannelProbeParams = {}): JsonRpcRequest {
    return this.request(METHOD_FEISHU_CHANNEL_PROBE, params);
  }

  probeDiscordChannel(params: ChannelProbeParams = {}): JsonRpcRequest {
    return this.request(METHOD_DISCORD_CHANNEL_PROBE, params);
  }

  probeWechatChannel(params: ChannelProbeParams = {}): JsonRpcRequest {
    return this.request(METHOD_WECHAT_CHANNEL_PROBE, params);
  }

  startWechatChannelLogin(params: WechatLoginStartParams = {}): JsonRpcRequest {
    return this.request(METHOD_WECHAT_CHANNEL_LOGIN_START, params);
  }

  waitWechatChannelLogin(params: WechatLoginWaitParams): JsonRpcRequest {
    return this.request(METHOD_WECHAT_CHANNEL_LOGIN_WAIT, params);
  }

  listWechatChannelAccounts(): JsonRpcRequest {
    return this.request(METHOD_WECHAT_CHANNEL_ACCOUNT_LIST, {});
  }

  removeWechatChannelAccount(
    params: WechatChannelAccountRemoveParams,
  ): JsonRpcRequest {
    return this.request(METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE, params);
  }

  setWechatChannelRuntimeModel(
    params: WechatRuntimeModelSetParams,
  ): JsonRpcRequest {
    return this.request(METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET, params);
  }

  probeGatewayTunnel(): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_TUNNEL_PROBE, {});
  }

  detectGatewayTunnelCloudflared(): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT, {});
  }

  installGatewayTunnelCloudflared(
    params: GatewayTunnelCloudflaredInstallParams,
  ): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL, params);
  }

  createGatewayTunnel(params: GatewayTunnelCreateParams): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_TUNNEL_CREATE, params);
  }

  startGatewayTunnel(): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_TUNNEL_START, {});
  }

  stopGatewayTunnel(): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_TUNNEL_STOP, {});
  }

  restartGatewayTunnel(): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_TUNNEL_RESTART, {});
  }

  readGatewayTunnelStatus(): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_TUNNEL_STATUS, {});
  }

  syncGatewayTunnelWebhookUrl(
    params: GatewayTunnelSyncWebhookUrlParams,
  ): JsonRpcRequest {
    return this.request(METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL, params);
  }

  createImageMediaTaskArtifact(
    params: MediaTaskArtifactImageCreateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE, params);
  }

  createAudioMediaTaskArtifact(
    params: MediaTaskArtifactAudioCreateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE, params);
  }

  createVideoMediaTaskArtifact(
    params: MediaTaskArtifactVideoCreateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE, params);
  }

  completeAudioMediaTaskArtifact(
    params: MediaTaskArtifactAudioCompleteParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE, params);
  }

  getMediaTaskArtifact(params: MediaTaskArtifactLookupParams): JsonRpcRequest {
    return this.request(METHOD_MEDIA_TASK_ARTIFACT_GET, params);
  }

  listMediaTaskArtifacts(params: MediaTaskArtifactListParams): JsonRpcRequest {
    return this.request(METHOD_MEDIA_TASK_ARTIFACT_LIST, params);
  }

  cancelMediaTaskArtifact(
    params: MediaTaskArtifactLookupParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MEDIA_TASK_ARTIFACT_CANCEL, params);
  }

  getGalleryMaterial(params: GalleryMaterialLookupParams): JsonRpcRequest {
    return this.request(METHOD_GALLERY_MATERIAL_GET, params);
  }

  createGalleryMaterialMetadata(
    params: GalleryMaterialMetadataCreateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_GALLERY_MATERIAL_METADATA_CREATE, params);
  }

  getGalleryMaterialMetadata(
    params: GalleryMaterialLookupParams,
  ): JsonRpcRequest {
    return this.request(METHOD_GALLERY_MATERIAL_METADATA_GET, params);
  }

  updateGalleryMaterialMetadata(
    params: GalleryMaterialMetadataUpdateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_GALLERY_MATERIAL_METADATA_UPDATE, params);
  }

  deleteGalleryMaterialMetadata(
    params: GalleryMaterialLookupParams,
  ): JsonRpcRequest {
    return this.request(METHOD_GALLERY_MATERIAL_METADATA_DELETE, params);
  }

  listGalleryMaterialsByImageCategory(
    params: GalleryMaterialFilterParams,
  ): JsonRpcRequest {
    return this.request(METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY, params);
  }

  listGalleryMaterialsByLayoutCategory(
    params: GalleryMaterialFilterParams,
  ): JsonRpcRequest {
    return this.request(
      METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY,
      params,
    );
  }

  listGalleryMaterialsByMood(
    params: GalleryMaterialFilterParams,
  ): JsonRpcRequest {
    return this.request(METHOD_GALLERY_MATERIAL_LIST_BY_MOOD, params);
  }

  listProjectMaterials(params: ProjectMaterialListParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_MATERIAL_LIST, params);
  }

  getProjectMaterial(params: ProjectMaterialLookupParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_MATERIAL_GET, params);
  }

  countProjectMaterials(params: ProjectMaterialListParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_MATERIAL_COUNT, params);
  }

  uploadProjectMaterial(params: ProjectMaterialUploadParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_MATERIAL_UPLOAD, params);
  }

  importProjectMaterialFromUrl(
    params: ProjectMaterialImportFromUrlParams,
  ): JsonRpcRequest {
    return this.request(METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL, params);
  }

  updateProjectMaterial(params: ProjectMaterialUpdateParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_MATERIAL_UPDATE, params);
  }

  deleteProjectMaterial(params: ProjectMaterialLookupParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_MATERIAL_DELETE, params);
  }

  readProjectMaterialContent(
    params: ProjectMaterialLookupParams,
  ): JsonRpcRequest {
    return this.request(METHOD_PROJECT_MATERIAL_CONTENT, params);
  }

  listVoiceAsrCredentials(): JsonRpcRequest {
    return this.request(METHOD_VOICE_ASR_CREDENTIAL_LIST, {});
  }

  createVoiceAsrCredential(
    params: VoiceAsrCredentialCreateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_VOICE_ASR_CREDENTIAL_CREATE, params);
  }

  updateVoiceAsrCredential(
    params: VoiceAsrCredentialUpdateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_VOICE_ASR_CREDENTIAL_UPDATE, params);
  }

  deleteVoiceAsrCredential(params: VoiceAsrCredentialIdParams): JsonRpcRequest {
    return this.request(METHOD_VOICE_ASR_CREDENTIAL_DELETE, params);
  }

  setDefaultVoiceAsrCredential(
    params: VoiceAsrCredentialIdParams,
  ): JsonRpcRequest {
    return this.request(METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET, params);
  }

  testVoiceAsrCredential(params: VoiceAsrCredentialIdParams): JsonRpcRequest {
    return this.request(METHOD_VOICE_ASR_CREDENTIAL_TEST, params);
  }

  listVoiceInstructions(): JsonRpcRequest {
    return this.request(METHOD_VOICE_INSTRUCTION_LIST, {});
  }

  saveVoiceInstruction(params: VoiceInstructionSaveParams): JsonRpcRequest {
    return this.request(METHOD_VOICE_INSTRUCTION_SAVE, params);
  }

  deleteVoiceInstruction(params: VoiceInstructionIdParams): JsonRpcRequest {
    return this.request(METHOD_VOICE_INSTRUCTION_DELETE, params);
  }

  setDefaultVoiceModel(params: VoiceModelDefaultSetParams): JsonRpcRequest {
    return this.request(METHOD_VOICE_MODEL_DEFAULT_SET, params);
  }

  testTranscribeVoiceModelFile(
    params: VoiceModelTestTranscribeFileParams,
  ): JsonRpcRequest {
    return this.request(METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE, params);
  }

  readUsageStats(params: UsageStatsRangeParams): JsonRpcRequest {
    return this.request(METHOD_USAGE_STATS_READ, params);
  }

  listUsageStatsModelRanking(params: UsageStatsRangeParams): JsonRpcRequest {
    return this.request(METHOD_USAGE_STATS_MODEL_RANKING_LIST, params);
  }

  listUsageStatsDailyTrends(params: UsageStatsRangeParams): JsonRpcRequest {
    return this.request(METHOD_USAGE_STATS_DAILY_TRENDS_LIST, params);
  }

  readArtifacts(params: ArtifactReadParams): JsonRpcRequest {
    return this.request(METHOD_ARTIFACT_READ, params);
  }

  listDirectory(params: FileSystemListDirectoryParams): JsonRpcRequest {
    return this.request(METHOD_FILE_SYSTEM_LIST_DIRECTORY, params);
  }

  readFilePreview(params: FileSystemReadFilePreviewParams): JsonRpcRequest {
    return this.request(METHOD_FILE_SYSTEM_READ_FILE_PREVIEW, params);
  }

  createFile(params: FileSystemCreateFileParams): JsonRpcRequest {
    return this.request(METHOD_FILE_SYSTEM_CREATE_FILE, params);
  }

  createDirectory(params: FileSystemCreateDirectoryParams): JsonRpcRequest {
    return this.request(METHOD_FILE_SYSTEM_CREATE_DIRECTORY, params);
  }

  renameFile(params: FileSystemRenameFileParams): JsonRpcRequest {
    return this.request(METHOD_FILE_SYSTEM_RENAME_FILE, params);
  }

  deleteFile(params: FileSystemDeleteFileParams): JsonRpcRequest {
    return this.request(METHOD_FILE_SYSTEM_DELETE_FILE, params);
  }

  readProjectGitStatus(params: ProjectGitStatusParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_GIT_STATUS, params);
  }

  readProjectGitDiff(params: ProjectGitDiffParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_GIT_DIFF, params);
  }

  listProjectGitCommits(params: ProjectGitCommitListParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_GIT_COMMITS_LIST, params);
  }

  checkoutProjectGitBranch(
    params: ProjectGitBranchCheckoutParams,
  ): JsonRpcRequest {
    return this.request(METHOD_PROJECT_GIT_BRANCH_CHECKOUT, params);
  }

  createProjectGitBranch(params: ProjectGitBranchCreateParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_GIT_BRANCH_CREATE, params);
  }

  createProjectGitWorktree(
    params: ProjectGitWorktreeCreateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_PROJECT_GIT_WORKTREE_CREATE, params);
  }

  startProjectShellSession(
    params: ProjectShellSessionStartParams,
  ): JsonRpcRequest {
    return this.request(METHOD_PROJECT_SHELL_SESSION_START, params);
  }

  writeProjectShellSession(
    params: ProjectShellSessionWriteParams,
  ): JsonRpcRequest {
    return this.request(METHOD_PROJECT_SHELL_SESSION_WRITE, params);
  }

  resizeProjectShellSession(
    params: ProjectShellSessionResizeParams,
  ): JsonRpcRequest {
    return this.request(METHOD_PROJECT_SHELL_SESSION_RESIZE, params);
  }

  killProjectShellSession(
    params: ProjectShellSessionKillParams,
  ): JsonRpcRequest {
    return this.request(METHOD_PROJECT_SHELL_SESSION_KILL, params);
  }

  drainProjectShellSessionEvents(
    params: ProjectShellSessionDrainEventsParams = {},
  ): JsonRpcRequest {
    return this.request(METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS, params);
  }

  startExecutionProcess(params: ExecutionProcessStartParams): JsonRpcRequest {
    return this.request(METHOD_EXECUTION_PROCESS_START, params);
  }

  writeExecutionProcessStdin(
    params: ExecutionProcessWriteStdinParams,
  ): JsonRpcRequest {
    return this.request(METHOD_EXECUTION_PROCESS_WRITE_STDIN, params);
  }

  interruptExecutionProcess(params: ExecutionProcessIdParams): JsonRpcRequest {
    return this.request(METHOD_EXECUTION_PROCESS_INTERRUPT, params);
  }

  terminateExecutionProcess(params: ExecutionProcessIdParams): JsonRpcRequest {
    return this.request(METHOD_EXECUTION_PROCESS_TERMINATE, params);
  }

  readExecutionProcessStatus(params: ExecutionProcessIdParams): JsonRpcRequest {
    return this.request(METHOD_EXECUTION_PROCESS_STATUS, params);
  }

  drainExecutionProcessOutput(
    params: ExecutionProcessDrainOutputParams = {},
  ): JsonRpcRequest {
    return this.request(METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT, params);
  }

  exportEvidence(params: EvidenceExportParams): JsonRpcRequest {
    return this.request(METHOD_EVIDENCE_EXPORT, params);
  }

  exportHandoffBundle(
    params: AgentSessionHandoffBundleExportParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT, params);
  }

  exportReplayCase(params: AgentSessionReplayCaseExportParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT, params);
  }

  exportAnalysisHandoff(
    params: AgentSessionAnalysisHandoffExportParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT, params);
  }

  exportReviewDecisionTemplate(
    params: AgentSessionReviewDecisionTemplateExportParams,
  ): JsonRpcRequest {
    return this.request(
      METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
      params,
    );
  }

  saveReviewDecision(
    params: AgentSessionReviewDecisionSaveParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE, params);
  }

  startSession(params: AgentSessionStartParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_START, params);
  }

  readSession(params: AgentSessionReadParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_READ, params);
  }

  readAgentSessionToolInventory(
    params: AgentSessionToolInventoryReadParams = {},
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_TOOL_INVENTORY_READ, params);
  }

  listModels(params: ModelListParams = {}): JsonRpcRequest {
    return this.request(METHOD_MODEL_LIST, params);
  }

  listModelPreferences(): JsonRpcRequest {
    return this.request(METHOD_MODEL_PREFERENCES_LIST, {});
  }

  readModelSyncState(): JsonRpcRequest {
    return this.request(METHOD_MODEL_SYNC_STATE_READ, {});
  }

  listModelProviders(): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_LIST, {});
  }

  listModelProviderCatalog(): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_CATALOG_LIST, {});
  }

  readModelProvider(params: ModelProviderReadParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_READ, params);
  }

  createModelProvider(params: ModelProviderCreateParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_CREATE, params);
  }

  updateModelProvider(params: ModelProviderUpdateParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_UPDATE, params);
  }

  deleteModelProvider(params: ModelProviderDeleteParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_DELETE, params);
  }

  updateModelProviderSortOrders(
    params: ModelProviderSortOrdersUpdateParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE, params);
  }

  exportModelProviderConfig(
    params: ModelProviderConfigExportParams = {},
  ): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_CONFIG_EXPORT, params);
  }

  importModelProviderConfig(
    params: ModelProviderConfigImportParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_CONFIG_IMPORT, params);
  }

  testModelProviderConnection(
    params: ModelProviderTestConnectionParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_TEST_CONNECTION, params);
  }

  testModelProviderChat(params: ModelProviderTestChatParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_TEST_CHAT, params);
  }

  fetchModelProviderModels(
    params: ModelProviderFetchModelsParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_FETCH_MODELS, params);
  }

  createModelProviderKey(params: ModelProviderKeyCreateParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_KEY_CREATE, params);
  }

  updateModelProviderKey(params: ModelProviderKeyUpdateParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_KEY_UPDATE, params);
  }

  deleteModelProviderKey(params: ModelProviderKeyDeleteParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_KEY_DELETE, params);
  }

  readNextModelProviderKey(params: ModelProviderKeyNextParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_KEY_NEXT, params);
  }

  recordModelProviderKeyUsage(
    params: ModelProviderKeyEventParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD, params);
  }

  recordModelProviderKeyError(
    params: ModelProviderKeyEventParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD, params);
  }

  readModelProviderUiState(
    params: ModelProviderUiStateReadParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_UI_STATE_READ, params);
  }

  writeModelProviderUiState(
    params: ModelProviderUiStateWriteParams,
  ): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_UI_STATE_WRITE, params);
  }

  readModelProviderAlias(params: ModelProviderAliasReadParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_ALIAS_READ, params);
  }

  listModelProviderAliases(): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_ALIAS_LIST, {});
  }

  resolveConnectDeepLink(params: ConnectDeepLinkResolveParams): JsonRpcRequest {
    return this.request(METHOD_CONNECT_DEEP_LINK_RESOLVE, params);
  }

  resolveConnectOpenDeepLink(
    params: ConnectOpenDeepLinkResolveParams,
  ): JsonRpcRequest {
    return this.request(METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE, params);
  }

  saveConnectRelayApiKey(params: ConnectRelayApiKeySaveParams): JsonRpcRequest {
    return this.request(METHOD_CONNECT_RELAY_API_KEY_SAVE, params);
  }

  sendConnectCallback(params: ConnectCallbackSendParams): JsonRpcRequest {
    return this.request(METHOD_CONNECT_CALLBACK_SEND, params);
  }

  scanConversationImportSource(
    params: ConversationImportSourceScanParams = {},
  ): JsonRpcRequest {
    return this.request(METHOD_CONVERSATION_IMPORT_SOURCE_SCAN, params);
  }

  previewConversationImportThread(
    params: ConversationImportThreadPreviewParams,
  ): JsonRpcRequest {
    return this.request(METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW, params);
  }

  commitConversationImportThread(
    params: ConversationImportThreadCommitParams,
  ): JsonRpcRequest {
    return this.request(METHOD_CONVERSATION_IMPORT_THREAD_COMMIT, params);
  }

  readConversationImportRuntimeEvents(
    params: ConversationImportThreadRuntimeEventsReadParams,
  ): JsonRpcRequest {
    return this.request(
      METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ,
      params,
    );
  }

  startTurn(params: AgentSessionTurnStartParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_TURN_START, params);
  }

  cancelTurn(params: AgentSessionTurnCancelParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_TURN_CANCEL, params);
  }

  replayAction(params: AgentSessionActionReplayParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_ACTION_REPLAY, params);
  }

  respondAction(params: AgentSessionActionRespondParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_ACTION_RESPOND, params);
  }

  request(method: string, params: unknown): JsonRpcRequest {
    return request(this.nextId(), method, params);
  }

  nextId(): RequestId {
    const id = this.#nextRequestId;
    this.#nextRequestId += 1;
    return id;
  }
}

function remainingRequestTimeoutMs(
  timeoutMs: number | undefined,
  startedAt: number,
): number | undefined {
  if (timeoutMs === undefined) {
    return undefined;
  }
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= timeoutMs) {
    throw new Error(
      `timed out waiting for app-server message after ${timeoutMs}ms`,
    );
  }
  return Math.max(1, timeoutMs - elapsedMs);
}

export class AppServerConnection {
  readonly client: AppServerClient;
  readonly transport: AppServerMessageTransport;

  #bufferedMessages: JsonRpcMessage[] = [];
  #mirroredNotifications: JsonRpcNotification[] = [];
  #detachedRequestIds = new Set<RequestId>();
  #transportReadLock: Promise<void> = Promise.resolve();

  constructor(
    transport: AppServerMessageTransport,
    client: AppServerClient = new AppServerClient(),
  ) {
    this.transport = transport;
    this.client = client;
  }

  async startSession(
    params: AgentSessionStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionStartResponse>> {
    return await this.request<AgentSessionStartResponse>(
      this.client.startSession(params),
      METHOD_AGENT_SESSION_START,
      options,
    );
  }

  async listCapabilities(
    params: CapabilityListParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<CapabilityListResponse>> {
    return await this.request<CapabilityListResponse>(
      this.client.listCapabilities(params),
      METHOD_CAPABILITY_LIST,
      options,
    );
  }

  async listSessions(
    params: AgentSessionListParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionListResponse>> {
    return await this.request<AgentSessionListResponse>(
      this.client.listSessions(params),
      METHOD_AGENT_SESSION_LIST,
      options,
    );
  }

  async updateSession(
    params: AgentSessionUpdateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionUpdateResponse>> {
    return await this.request<AgentSessionUpdateResponse>(
      this.client.updateSession(params),
      METHOD_AGENT_SESSION_UPDATE,
      options,
    );
  }

  async archiveManySessions(
    params: AgentSessionArchiveManyParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionArchiveManyResponse>> {
    return await this.request<AgentSessionArchiveManyResponse>(
      this.client.archiveManySessions(params),
      METHOD_AGENT_SESSION_ARCHIVE_MANY,
      options,
    );
  }

  async deleteSession(
    params: AgentSessionDeleteParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionDeleteResponse>> {
    return await this.request<AgentSessionDeleteResponse>(
      this.client.deleteSession(params),
      METHOD_AGENT_SESSION_DELETE,
      options,
    );
  }

  async readAgentSessionObjective(
    params: AgentSessionObjectiveReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionObjectiveReadResponse>> {
    return await this.request<AgentSessionObjectiveReadResponse>(
      this.client.readAgentSessionObjective(params),
      METHOD_AGENT_SESSION_OBJECTIVE_READ,
      options,
    );
  }

  async setAgentSessionObjective(
    params: AgentSessionObjectiveSetParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionObjectiveSetResponse>> {
    return await this.request<AgentSessionObjectiveSetResponse>(
      this.client.setAgentSessionObjective(params),
      METHOD_AGENT_SESSION_OBJECTIVE_SET,
      options,
    );
  }

  async updateAgentSessionObjectiveStatus(
    params: AgentSessionObjectiveStatusUpdateParams,
    options: AppServerRequestOptions = {},
  ): Promise<
    AppServerRequestResult<AgentSessionObjectiveStatusUpdateResponse>
  > {
    return await this.request<AgentSessionObjectiveStatusUpdateResponse>(
      this.client.updateAgentSessionObjectiveStatus(params),
      METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
      options,
    );
  }

  async clearAgentSessionObjective(
    params: AgentSessionObjectiveClearParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionObjectiveClearResponse>> {
    return await this.request<AgentSessionObjectiveClearResponse>(
      this.client.clearAgentSessionObjective(params),
      METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
      options,
    );
  }

  async continueAgentSessionObjective(
    params: AgentSessionObjectiveContinueParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionObjectiveContinueResponse>> {
    return await this.request<AgentSessionObjectiveContinueResponse>(
      this.client.continueAgentSessionObjective(params),
      METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
      options,
    );
  }

  async auditAgentSessionObjective(
    params: AgentSessionObjectiveAuditParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionObjectiveAuditResponse>> {
    return await this.request<AgentSessionObjectiveAuditResponse>(
      this.client.auditAgentSessionObjective(params),
      METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
      options,
    );
  }

  async compactAgentSession(
    params: AgentSessionCompactParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionCompactResponse>> {
    return await this.request<AgentSessionCompactResponse>(
      this.client.compactAgentSession(params),
      METHOD_AGENT_SESSION_COMPACT,
      options,
    );
  }

  async resumeAgentSessionThread(
    params: AgentSessionThreadResumeParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionThreadResumeResponse>> {
    return await this.request<AgentSessionThreadResumeResponse>(
      this.client.resumeAgentSessionThread(params),
      METHOD_AGENT_SESSION_THREAD_RESUME,
      options,
    );
  }

  async removeAgentSessionQueuedTurn(
    params: AgentSessionQueuedTurnRemoveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionQueuedTurnRemoveResponse>> {
    return await this.request<AgentSessionQueuedTurnRemoveResponse>(
      this.client.removeAgentSessionQueuedTurn(params),
      METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE,
      options,
    );
  }

  async promoteAgentSessionQueuedTurn(
    params: AgentSessionQueuedTurnPromoteParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionQueuedTurnPromoteResponse>> {
    return await this.request<AgentSessionQueuedTurnPromoteResponse>(
      this.client.promoteAgentSessionQueuedTurn(params),
      METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE,
      options,
    );
  }

  async listAgentSessionFileCheckpoints(
    params: AgentSessionFileCheckpointListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionFileCheckpointListResponse>> {
    return await this.request<AgentSessionFileCheckpointListResponse>(
      this.client.listAgentSessionFileCheckpoints(params),
      METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST,
      options,
    );
  }

  async getAgentSessionFileCheckpoint(
    params: AgentSessionFileCheckpointGetParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionFileCheckpointDetail>> {
    return await this.request<AgentSessionFileCheckpointDetail>(
      this.client.getAgentSessionFileCheckpoint(params),
      METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET,
      options,
    );
  }

  async diffAgentSessionFileCheckpoint(
    params: AgentSessionFileCheckpointDiffParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionFileCheckpointDiffResponse>> {
    return await this.request<AgentSessionFileCheckpointDiffResponse>(
      this.client.diffAgentSessionFileCheckpoint(params),
      METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF,
      options,
    );
  }

  async restoreAgentSessionFileCheckpoint(
    params: AgentSessionFileCheckpointRestoreParams,
    options: AppServerRequestOptions = {},
  ): Promise<
    AppServerRequestResult<AgentSessionFileCheckpointRestoreResponse>
  > {
    return await this.request<AgentSessionFileCheckpointRestoreResponse>(
      this.client.restoreAgentSessionFileCheckpoint(params),
      METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE,
      options,
    );
  }

  async getOrCreateSessionFile(
    params: SessionFileGetOrCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SessionFileMetaResponse>> {
    return await this.request<SessionFileMetaResponse>(
      this.client.getOrCreateSessionFile(params),
      METHOD_SESSION_FILE_GET_OR_CREATE,
      options,
    );
  }

  async updateSessionFileMeta(
    params: SessionFileUpdateMetaParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SessionFileMetaResponse>> {
    return await this.request<SessionFileMetaResponse>(
      this.client.updateSessionFileMeta(params),
      METHOD_SESSION_FILE_UPDATE_META,
      options,
    );
  }

  async saveSessionFile(
    params: SessionFileSaveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SessionFileEntryResponse>> {
    return await this.request<SessionFileEntryResponse>(
      this.client.saveSessionFile(params),
      METHOD_SESSION_FILE_SAVE,
      options,
    );
  }

  async readSessionFile(
    params: SessionFileIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SessionFileReadResponse>> {
    return await this.request<SessionFileReadResponse>(
      this.client.readSessionFile(params),
      METHOD_SESSION_FILE_READ,
      options,
    );
  }

  async resolveSessionFilePath(
    params: SessionFileIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SessionFileResolvePathResponse>> {
    return await this.request<SessionFileResolvePathResponse>(
      this.client.resolveSessionFilePath(params),
      METHOD_SESSION_FILE_RESOLVE_PATH,
      options,
    );
  }

  async deleteSessionFile(
    params: SessionFileIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SessionFileMutationResponse>> {
    return await this.request<SessionFileMutationResponse>(
      this.client.deleteSessionFile(params),
      METHOD_SESSION_FILE_DELETE,
      options,
    );
  }

  async listSessionFiles(
    params: SessionFileGetOrCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SessionFileListResponse>> {
    return await this.request<SessionFileListResponse>(
      this.client.listSessionFiles(params),
      METHOD_SESSION_FILE_LIST,
      options,
    );
  }

  async listWorkspaces(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceListResponse>> {
    return await this.request<WorkspaceListResponse>(
      this.client.listWorkspaces(),
      METHOD_WORKSPACE_LIST,
      options,
    );
  }

  async readWorkspace(
    params: WorkspaceReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceReadResponse>> {
    return await this.request<WorkspaceReadResponse>(
      this.client.readWorkspace(params),
      METHOD_WORKSPACE_READ,
      options,
    );
  }

  async updateWorkspace(
    params: WorkspaceUpdateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceUpdateResponse>> {
    return await this.request<WorkspaceUpdateResponse>(
      this.client.updateWorkspace(params),
      METHOD_WORKSPACE_UPDATE,
      options,
    );
  }

  async deleteWorkspace(
    params: WorkspaceDeleteParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceDeleteResponse>> {
    return await this.request<WorkspaceDeleteResponse>(
      this.client.deleteWorkspace(params),
      METHOD_WORKSPACE_DELETE,
      options,
    );
  }

  async ensureWorkspace(
    params: WorkspaceEnsureProjectParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceEnsureProjectResponse>> {
    return await this.request<WorkspaceEnsureProjectResponse>(
      this.client.ensureWorkspace(params),
      METHOD_WORKSPACE_ENSURE,
      options,
    );
  }

  async readWorkspaceByPath(
    params: WorkspacePathReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceReadResponse>> {
    return await this.request<WorkspaceReadResponse>(
      this.client.readWorkspaceByPath(params),
      METHOD_WORKSPACE_BY_PATH_READ,
      options,
    );
  }

  async readDefaultWorkspace(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceReadResponse>> {
    return await this.request<WorkspaceReadResponse>(
      this.client.readDefaultWorkspace(),
      METHOD_WORKSPACE_DEFAULT_READ,
      options,
    );
  }

  async ensureDefaultWorkspace(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceReadResponse>> {
    return await this.request<WorkspaceReadResponse>(
      this.client.ensureDefaultWorkspace(),
      METHOD_WORKSPACE_DEFAULT_ENSURE,
      options,
    );
  }

  async readWorkspaceProjectsRoot(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceProjectsRootReadResponse>> {
    return await this.request<WorkspaceProjectsRootReadResponse>(
      this.client.readWorkspaceProjectsRoot(),
      METHOD_WORKSPACE_PROJECTS_ROOT_READ,
      options,
    );
  }

  async resolveWorkspaceProjectPath(
    params: WorkspaceProjectPathResolveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceProjectPathResolveResponse>> {
    return await this.request<WorkspaceProjectPathResolveResponse>(
      this.client.resolveWorkspaceProjectPath(params),
      METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
      options,
    );
  }

  async ensureWorkspaceReady(
    params: WorkspaceEnsureParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceEnsureReadyResponse>> {
    return await this.request<WorkspaceEnsureReadyResponse>(
      this.client.ensureWorkspaceReady(params),
      METHOD_WORKSPACE_ENSURE_READY,
      options,
    );
  }

  async listSkills(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillListResponse>> {
    return await this.request<SkillListResponse>(
      this.client.listSkills(),
      METHOD_SKILL_LIST,
      options,
    );
  }

  async readSkill(
    params: SkillReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillReadResponse>> {
    return await this.request<SkillReadResponse>(
      this.client.readSkill(params),
      METHOD_SKILL_READ,
      options,
    );
  }

  async listManagementSkills(
    params: SkillManagementListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillListResponse>> {
    return await this.request<SkillListResponse>(
      this.client.listManagementSkills(params),
      METHOD_SKILL_MANAGEMENT_LIST,
      options,
    );
  }

  async installManagementSkill(
    params: SkillManagementInstallParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillManagementWriteResponse>> {
    return await this.request<SkillManagementWriteResponse>(
      this.client.installManagementSkill(params),
      METHOD_SKILL_MANAGEMENT_INSTALL,
      options,
    );
  }

  async uninstallManagementSkill(
    params: SkillManagementUninstallParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillManagementWriteResponse>> {
    return await this.request<SkillManagementWriteResponse>(
      this.client.uninstallManagementSkill(params),
      METHOD_SKILL_MANAGEMENT_UNINSTALL,
      options,
    );
  }

  async listSkillRepositories(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillRepositoryListResponse>> {
    return await this.request<SkillRepositoryListResponse>(
      this.client.listSkillRepositories(),
      METHOD_SKILL_REPOSITORY_LIST,
      options,
    );
  }

  async saveSkillRepository(
    params: SkillRepositorySaveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillManagementWriteResponse>> {
    return await this.request<SkillManagementWriteResponse>(
      this.client.saveSkillRepository(params),
      METHOD_SKILL_REPOSITORY_SAVE,
      options,
    );
  }

  async deleteSkillRepository(
    params: SkillRepositoryDeleteParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillManagementWriteResponse>> {
    return await this.request<SkillManagementWriteResponse>(
      this.client.deleteSkillRepository(params),
      METHOD_SKILL_REPOSITORY_DELETE,
      options,
    );
  }

  async refreshSkillCache(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillManagementWriteResponse>> {
    return await this.request<SkillManagementWriteResponse>(
      this.client.refreshSkillCache(),
      METHOD_SKILL_CACHE_REFRESH,
      options,
    );
  }

  async listInstalledSkillDirectories(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillInstalledDirectoriesListResponse>> {
    return await this.request<SkillInstalledDirectoriesListResponse>(
      this.client.listInstalledSkillDirectories(),
      METHOD_SKILL_INSTALLED_DIRECTORIES_LIST,
      options,
    );
  }

  async inspectLocalSkill(
    params: SkillLocalInspectParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillLocalInspectResponse>> {
    return await this.request<SkillLocalInspectResponse>(
      this.client.inspectLocalSkill(params),
      METHOD_SKILL_LOCAL_INSPECT,
      options,
    );
  }

  async inspectLocalSkillPackage(
    params: SkillPackageLocalInspectParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillPackageLocalInspectResponse>> {
    return await this.request<SkillPackageLocalInspectResponse>(
      this.client.inspectLocalSkillPackage(params),
      METHOD_SKILL_PACKAGE_LOCAL_INSPECT,
      options,
    );
  }

  async inspectLocalSkillDetail(
    params: SkillLocalDetailInspectParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillLocalDetailInspectResponse>> {
    return await this.request<SkillLocalDetailInspectResponse>(
      this.client.inspectLocalSkillDetail(params),
      METHOD_SKILL_LOCAL_DETAIL_INSPECT,
      options,
    );
  }

  async createSkillScaffold(
    params: SkillScaffoldCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillScaffoldCreateResponse>> {
    return await this.request<SkillScaffoldCreateResponse>(
      this.client.createSkillScaffold(params),
      METHOD_SKILL_LOCAL_SCAFFOLD_CREATE,
      options,
    );
  }

  async importLocalSkill(
    params: SkillLocalImportParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillLocalImportResponse>> {
    return await this.request<SkillLocalImportResponse>(
      this.client.importLocalSkill(params),
      METHOD_SKILL_LOCAL_IMPORT,
      options,
    );
  }

  async renameLocalSkill(
    params: SkillLocalRenameParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillLocalRenameResponse>> {
    return await this.request<SkillLocalRenameResponse>(
      this.client.renameLocalSkill(params),
      METHOD_SKILL_LOCAL_RENAME,
      options,
    );
  }

  async inspectRemoteSkill(
    params: SkillRemoteInspectParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillRemoteInspectResponse>> {
    return await this.request<SkillRemoteInspectResponse>(
      this.client.inspectRemoteSkill(params),
      METHOD_SKILL_REMOTE_INSPECT,
      options,
    );
  }

  async installLocalSkillPackage(
    params: SkillPackageLocalInstallParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillPackageLocalInstallResponse>> {
    return await this.request<SkillPackageLocalInstallResponse>(
      this.client.installLocalSkillPackage(params),
      METHOD_SKILL_PACKAGE_LOCAL_INSTALL,
      options,
    );
  }

  async replaceLocalSkillPackage(
    params: SkillPackageLocalReplaceParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillPackageLocalReplaceResponse>> {
    return await this.request<SkillPackageLocalReplaceResponse>(
      this.client.replaceLocalSkillPackage(params),
      METHOD_SKILL_PACKAGE_LOCAL_REPLACE,
      options,
    );
  }

  async exportSkillPackage(
    params: SkillPackageExportParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillPackageExportResponse>> {
    return await this.request<SkillPackageExportResponse>(
      this.client.exportSkillPackage(params),
      METHOD_SKILL_PACKAGE_EXPORT,
      options,
    );
  }

  async installMarketplaceSkill(
    params: SkillMarketplaceInstallParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillMarketplaceInstallResponse>> {
    return await this.request<SkillMarketplaceInstallResponse>(
      this.client.installMarketplaceSkill(params),
      METHOD_SKILL_MARKETPLACE_INSTALL,
      options,
    );
  }

  async installSkillFromDownload(
    params: SkillDownloadInstallParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillDownloadInstallResponse>> {
    return await this.request<SkillDownloadInstallResponse>(
      this.client.installSkillFromDownload(params),
      METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL,
      options,
    );
  }

  async listWorkspaceSkillBindings(
    params: WorkspaceSkillBindingsListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceSkillBindingsListResponse>> {
    return await this.request<WorkspaceSkillBindingsListResponse>(
      this.client.listWorkspaceSkillBindings(params),
      METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
      options,
    );
  }

  async listWorkspaceRegisteredSkills(
    params: WorkspaceRegisteredSkillsListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceRegisteredSkillsListResponse>> {
    return await this.request<WorkspaceRegisteredSkillsListResponse>(
      this.client.listWorkspaceRegisteredSkills(params),
      METHOD_WORKSPACE_REGISTERED_SKILLS_LIST,
      options,
    );
  }

  async inspectAgentAppLocalPackage(
    params: AgentAppLocalPackageInspectParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppLocalPackageInspectResponse>> {
    return await this.request<AgentAppLocalPackageInspectResponse>(
      this.client.inspectAgentAppLocalPackage(params),
      METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT,
      options,
    );
  }

  async fetchAgentAppCloudPackage(
    params: AgentAppFetchCloudPackageParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppPackageCacheEntry>> {
    return await this.request<AgentAppPackageCacheEntry>(
      this.client.fetchAgentAppCloudPackage(params),
      METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD,
      options,
    );
  }

  async saveAgentAppInstalled(
    params: AgentAppInstalledSaveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<unknown>> {
    return await this.request<unknown>(
      this.client.saveAgentAppInstalled(params),
      METHOD_AGENT_APP_INSTALLED_SAVE,
      options,
    );
  }

  async listAgentAppInstalled(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppInstalledListResponse>> {
    return await this.request<AgentAppInstalledListResponse>(
      this.client.listAgentAppInstalled(),
      METHOD_AGENT_APP_INSTALLED_LIST,
      options,
    );
  }

  async setAgentAppInstalledDisabled(
    params: AgentAppInstalledDisabledSetParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppInstalledListResponse>> {
    return await this.request<AgentAppInstalledListResponse>(
      this.client.setAgentAppInstalledDisabled(params),
      METHOD_AGENT_APP_INSTALLED_DISABLED_SET,
      options,
    );
  }

  async previewAgentAppUninstall(
    params: AgentAppUninstallRehearsalParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppUninstallRehearsalResponse>> {
    return await this.request<AgentAppUninstallRehearsalResponse>(
      this.client.previewAgentAppUninstall(params),
      METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
      options,
    );
  }

  async uninstallAgentApp(
    params: AgentAppUninstallParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppUninstallResponse>> {
    return await this.request<AgentAppUninstallResponse>(
      this.client.uninstallAgentApp(params),
      METHOD_AGENT_APP_INSTALLED_UNINSTALL,
      options,
    );
  }

  async prepareAgentAppShell(
    params: AgentAppShellPrepareParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppShellPrepareResponse>> {
    return await this.request<AgentAppShellPrepareResponse>(
      this.client.prepareAgentAppShell(params),
      METHOD_AGENT_APP_SHELL_PREPARE,
      options,
    );
  }

  async startAgentAppUiRuntime(
    params: AgentAppUiRuntimeStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppUiRuntimeStatusResponse>> {
    return await this.request<AgentAppUiRuntimeStatusResponse>(
      this.client.startAgentAppUiRuntime(params),
      METHOD_AGENT_APP_UI_RUNTIME_START,
      options,
    );
  }

  async getAgentAppUiRuntimeStatus(
    params: AgentAppUiRuntimeStatusParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppUiRuntimeStatusResponse>> {
    return await this.request<AgentAppUiRuntimeStatusResponse>(
      this.client.getAgentAppUiRuntimeStatus(params),
      METHOD_AGENT_APP_UI_RUNTIME_STATUS,
      options,
    );
  }

  async stopAgentAppUiRuntime(
    params: AgentAppUiRuntimeStopParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppUiRuntimeStatusResponse>> {
    return await this.request<AgentAppUiRuntimeStatusResponse>(
      this.client.stopAgentAppUiRuntime(params),
      METHOD_AGENT_APP_UI_RUNTIME_STOP,
      options,
    );
  }

  async listKnowledgePacks(
    params: KnowledgeListPacksParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<KnowledgeListPacksResponse>> {
    return await this.request<KnowledgeListPacksResponse>(
      this.client.listKnowledgePacks(params),
      METHOD_KNOWLEDGE_PACK_LIST,
      options,
    );
  }

  async readKnowledgePack(
    params: KnowledgeReadPackParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<KnowledgeReadPackResponse>> {
    return await this.request<KnowledgeReadPackResponse>(
      this.client.readKnowledgePack(params),
      METHOD_KNOWLEDGE_PACK_READ,
      options,
    );
  }

  async importKnowledgeSource(
    params: KnowledgeImportSourceParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<KnowledgeImportSourceResponse>> {
    return await this.request<KnowledgeImportSourceResponse>(
      this.client.importKnowledgeSource(params),
      METHOD_KNOWLEDGE_SOURCE_IMPORT,
      options,
    );
  }

  async compileKnowledgePack(
    params: KnowledgeCompilePackParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<KnowledgeCompilePackResponse>> {
    return await this.request<KnowledgeCompilePackResponse>(
      this.client.compileKnowledgePack(params),
      METHOD_KNOWLEDGE_PACK_COMPILE,
      options,
    );
  }

  async setDefaultKnowledgePack(
    params: KnowledgeSetDefaultPackParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<KnowledgeSetDefaultPackResponse>> {
    return await this.request<KnowledgeSetDefaultPackResponse>(
      this.client.setDefaultKnowledgePack(params),
      METHOD_KNOWLEDGE_PACK_DEFAULT_SET,
      options,
    );
  }

  async updateKnowledgePackStatus(
    params: KnowledgeUpdatePackStatusParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<KnowledgeUpdatePackStatusResponse>> {
    return await this.request<KnowledgeUpdatePackStatusResponse>(
      this.client.updateKnowledgePackStatus(params),
      METHOD_KNOWLEDGE_PACK_STATUS_UPDATE,
      options,
    );
  }

  async resolveKnowledgeContext(
    params: KnowledgeResolveContextParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<KnowledgeContextResolutionResponse>> {
    return await this.request<KnowledgeContextResolutionResponse>(
      this.client.resolveKnowledgeContext(params),
      METHOD_KNOWLEDGE_CONTEXT_RESOLVE,
      options,
    );
  }

  async validateKnowledgeContextRun(
    params: KnowledgeValidateContextRunParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<KnowledgeValidateContextRunResponse>> {
    return await this.request<KnowledgeValidateContextRunResponse>(
      this.client.validateKnowledgeContextRun(params),
      METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE,
      options,
    );
  }

  async listAutomationJobs(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationJobListResponse>> {
    return await this.request<AutomationJobListResponse>(
      this.client.listAutomationJobs(),
      METHOD_AUTOMATION_JOB_LIST,
      options,
    );
  }

  async readAutomationSchedulerConfig(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationSchedulerConfigReadResponse>> {
    return await this.request<AutomationSchedulerConfigReadResponse>(
      this.client.readAutomationSchedulerConfig(),
      METHOD_AUTOMATION_SCHEDULER_CONFIG_READ,
      options,
    );
  }

  async updateAutomationSchedulerConfig(
    params: AutomationSchedulerConfigUpdateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationSchedulerConfigUpdateResponse>> {
    return await this.request<AutomationSchedulerConfigUpdateResponse>(
      this.client.updateAutomationSchedulerConfig(params),
      METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE,
      options,
    );
  }

  async readAutomationSchedulerStatus(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationSchedulerStatusResponse>> {
    return await this.request<AutomationSchedulerStatusResponse>(
      this.client.readAutomationSchedulerStatus(),
      METHOD_AUTOMATION_SCHEDULER_STATUS,
      options,
    );
  }

  async readAutomationJob(
    params: AutomationJobIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationJobReadResponse>> {
    return await this.request<AutomationJobReadResponse>(
      this.client.readAutomationJob(params),
      METHOD_AUTOMATION_JOB_READ,
      options,
    );
  }

  async createAutomationJob(
    params: AutomationJobCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationJobWriteResponse>> {
    return await this.request<AutomationJobWriteResponse>(
      this.client.createAutomationJob(params),
      METHOD_AUTOMATION_JOB_CREATE,
      options,
    );
  }

  async updateAutomationJob(
    params: AutomationJobUpdateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationJobWriteResponse>> {
    return await this.request<AutomationJobWriteResponse>(
      this.client.updateAutomationJob(params),
      METHOD_AUTOMATION_JOB_UPDATE,
      options,
    );
  }

  async deleteAutomationJob(
    params: AutomationJobIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationJobDeleteResponse>> {
    return await this.request<AutomationJobDeleteResponse>(
      this.client.deleteAutomationJob(params),
      METHOD_AUTOMATION_JOB_DELETE,
      options,
    );
  }

  async runAutomationJobNow(
    params: AutomationJobIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationJobRunNowResponse>> {
    return await this.request<AutomationJobRunNowResponse>(
      this.client.runAutomationJobNow(params),
      METHOD_AUTOMATION_JOB_RUN_NOW,
      options,
    );
  }

  async readAutomationHealth(
    params: AutomationJobHealthParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationJobHealthResponse>> {
    return await this.request<AutomationJobHealthResponse>(
      this.client.readAutomationHealth(params),
      METHOD_AUTOMATION_JOB_HEALTH,
      options,
    );
  }

  async readAutomationRunHistory(
    params: AutomationJobRunHistoryParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationJobRunHistoryResponse>> {
    return await this.request<AutomationJobRunHistoryResponse>(
      this.client.readAutomationRunHistory(params),
      METHOD_AUTOMATION_JOB_RUN_HISTORY,
      options,
    );
  }

  async previewAutomationSchedule(
    params: AutomationScheduleParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationSchedulePreviewResponse>> {
    return await this.request<AutomationSchedulePreviewResponse>(
      this.client.previewAutomationSchedule(params),
      METHOD_AUTOMATION_SCHEDULE_PREVIEW,
      options,
    );
  }

  async validateAutomationSchedule(
    params: AutomationScheduleParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationScheduleValidateResponse>> {
    return await this.request<AutomationScheduleValidateResponse>(
      this.client.validateAutomationSchedule(params),
      METHOD_AUTOMATION_SCHEDULE_VALIDATE,
      options,
    );
  }

  async listMcpServers(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpServerListResponse>> {
    return await this.request<McpServerListResponse>(
      this.client.listMcpServers(),
      METHOD_MCP_SERVER_LIST,
      options,
    );
  }

  async listMcpServersWithStatus(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpServerStatusListResponse>> {
    return await this.request<McpServerStatusListResponse>(
      this.client.listMcpServersWithStatus(),
      METHOD_MCP_SERVER_STATUS_LIST,
      options,
    );
  }

  async createMcpServer(
    params: McpServerCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpServerListResponse>> {
    return await this.request<McpServerListResponse>(
      this.client.createMcpServer(params),
      METHOD_MCP_SERVER_CREATE,
      options,
    );
  }

  async updateMcpServer(
    params: McpServerUpdateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpServerListResponse>> {
    return await this.request<McpServerListResponse>(
      this.client.updateMcpServer(params),
      METHOD_MCP_SERVER_UPDATE,
      options,
    );
  }

  async deleteMcpServer(
    params: McpServerDeleteParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpServerListResponse>> {
    return await this.request<McpServerListResponse>(
      this.client.deleteMcpServer(params),
      METHOD_MCP_SERVER_DELETE,
      options,
    );
  }

  async setMcpServerEnabled(
    params: McpServerEnabledSetParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpServerListResponse>> {
    return await this.request<McpServerListResponse>(
      this.client.setMcpServerEnabled(params),
      METHOD_MCP_SERVER_ENABLED_SET,
      options,
    );
  }

  async importMcpServersFromApp(
    params: McpServerImportFromAppParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpServerImportFromAppResponse>> {
    return await this.request<McpServerImportFromAppResponse>(
      this.client.importMcpServersFromApp(params),
      METHOD_MCP_SERVER_IMPORT_FROM_APP,
      options,
    );
  }

  async syncAllMcpServersToLive(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpServerListResponse>> {
    return await this.request<McpServerListResponse>(
      this.client.syncAllMcpServersToLive(),
      METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
      options,
    );
  }

  async startMcpServer(
    params: McpServerStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpServerLifecycleResponse>> {
    return await this.request<McpServerLifecycleResponse>(
      this.client.startMcpServer(params),
      METHOD_MCP_SERVER_START,
      options,
    );
  }

  async stopMcpServer(
    params: McpServerStopParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpServerLifecycleResponse>> {
    return await this.request<McpServerLifecycleResponse>(
      this.client.stopMcpServer(params),
      METHOD_MCP_SERVER_STOP,
      options,
    );
  }

  async listMcpTools(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpToolListResponse>> {
    return await this.request<McpToolListResponse>(
      this.client.listMcpTools(),
      METHOD_MCP_TOOL_LIST,
      options,
    );
  }

  async listMcpToolsForContext(
    params: McpToolListForContextParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpToolListResponse>> {
    return await this.request<McpToolListResponse>(
      this.client.listMcpToolsForContext(params),
      METHOD_MCP_TOOL_LIST_FOR_CONTEXT,
      options,
    );
  }

  async searchMcpTools(
    params: McpToolSearchParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpToolListResponse>> {
    return await this.request<McpToolListResponse>(
      this.client.searchMcpTools(params),
      METHOD_MCP_TOOL_SEARCH,
      options,
    );
  }

  async callMcpTool(
    params: McpToolCallParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpToolCallResponse>> {
    return await this.request<McpToolCallResponse>(
      this.client.callMcpTool(params),
      METHOD_MCP_TOOL_CALL,
      options,
    );
  }

  async callMcpToolWithCaller(
    params: McpToolCallWithCallerParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpToolCallResponse>> {
    return await this.request<McpToolCallResponse>(
      this.client.callMcpToolWithCaller(params),
      METHOD_MCP_TOOL_CALL_WITH_CALLER,
      options,
    );
  }

  async listMcpPrompts(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpPromptListResponse>> {
    return await this.request<McpPromptListResponse>(
      this.client.listMcpPrompts(),
      METHOD_MCP_PROMPT_LIST,
      options,
    );
  }

  async getMcpPrompt(
    params: McpPromptGetParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpPromptGetResponse>> {
    return await this.request<McpPromptGetResponse>(
      this.client.getMcpPrompt(params),
      METHOD_MCP_PROMPT_GET,
      options,
    );
  }

  async listMcpResources(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpResourceListResponse>> {
    return await this.request<McpResourceListResponse>(
      this.client.listMcpResources(),
      METHOD_MCP_RESOURCE_LIST,
      options,
    );
  }

  async readMcpResource(
    params: McpResourceReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<McpResourceReadResponse>> {
    return await this.request<McpResourceReadResponse>(
      this.client.readMcpResource(params),
      METHOD_MCP_RESOURCE_READ,
      options,
    );
  }

  async readProjectMemory(
    params: ProjectMemoryReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectMemoryReadResponse>> {
    return await this.request<ProjectMemoryReadResponse>(
      this.client.readProjectMemory(params),
      METHOD_PROJECT_MEMORY_READ,
      options,
    );
  }

  async listMemoryStore(
    params: MemoryStoreListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MemoryStoreListResponse>> {
    return await this.request<MemoryStoreListResponse>(
      this.client.listMemoryStore(params),
      METHOD_MEMORY_STORE_LIST,
      options,
    );
  }

  async readMemoryStore(
    params: MemoryStoreReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MemoryStoreReadResponse>> {
    return await this.request<MemoryStoreReadResponse>(
      this.client.readMemoryStore(params),
      METHOD_MEMORY_STORE_READ,
      options,
    );
  }

  async searchMemoryStore(
    params: MemoryStoreSearchParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MemoryStoreSearchResponse>> {
    return await this.request<MemoryStoreSearchResponse>(
      this.client.searchMemoryStore(params),
      METHOD_MEMORY_STORE_SEARCH,
      options,
    );
  }

  async addMemoryStoreNote(
    params: MemoryStoreAddNoteParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MemoryStoreAddNoteResponse>> {
    return await this.request<MemoryStoreAddNoteResponse>(
      this.client.addMemoryStoreNote(params),
      METHOD_MEMORY_STORE_ADD_NOTE,
      options,
    );
  }

  async consolidateMemoryStore(
    params: MemoryStoreConsolidateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MemoryStoreConsolidateResponse>> {
    return await this.request<MemoryStoreConsolidateResponse>(
      this.client.consolidateMemoryStore(params),
      METHOD_MEMORY_STORE_CONSOLIDATE,
      options,
    );
  }

  async listMemoryStoreReviewNotes(
    params: MemoryStoreReviewListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MemoryStoreReviewListResponse>> {
    return await this.request<MemoryStoreReviewListResponse>(
      this.client.listMemoryStoreReviewNotes(params),
      METHOD_MEMORY_STORE_REVIEW_LIST,
      options,
    );
  }

  async resolveMemoryStoreReviewNote(
    params: MemoryStoreReviewResolveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MemoryStoreReviewResolveResponse>> {
    return await this.request<MemoryStoreReviewResolveResponse>(
      this.client.resolveMemoryStoreReviewNote(params),
      METHOD_MEMORY_STORE_REVIEW_RESOLVE,
      options,
    );
  }

  async healthMemoryStore(
    params: MemoryStoreRootParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MemoryStoreHealthResponse>> {
    return await this.request<MemoryStoreHealthResponse>(
      this.client.healthMemoryStore(params),
      METHOD_MEMORY_STORE_HEALTH,
      options,
    );
  }

  async resetMemoryStore(
    params: MemoryStoreResetParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MemoryStoreResetResponse>> {
    return await this.request<MemoryStoreResetResponse>(
      this.client.resetMemoryStore(params),
      METHOD_MEMORY_STORE_RESET,
      options,
    );
  }

  async rebuildMemoryStoreIndex(
    params: MemoryStoreRootParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MemoryStoreIndexRebuildResponse>> {
    return await this.request<MemoryStoreIndexRebuildResponse>(
      this.client.rebuildMemoryStoreIndex(params),
      METHOD_MEMORY_STORE_INDEX_REBUILD,
      options,
    );
  }

  async listLogs(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<LogListResponse>> {
    return await this.request<LogListResponse>(
      this.client.listLogs(),
      METHOD_LOG_LIST,
      options,
    );
  }

  async readPersistedLogTail(
    params: LogPersistedTailParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<LogPersistedTailResponse>> {
    return await this.request<LogPersistedTailResponse>(
      this.client.readPersistedLogTail(params),
      METHOD_LOG_PERSISTED_TAIL,
      options,
    );
  }

  async clearLogs(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<LogClearResponse>> {
    return await this.request<LogClearResponse>(
      this.client.clearLogs(),
      METHOD_LOG_CLEAR,
      options,
    );
  }

  async clearDiagnosticLogHistory(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<LogClearResponse>> {
    return await this.request<LogClearResponse>(
      this.client.clearDiagnosticLogHistory(),
      METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR,
      options,
    );
  }

  async readLogStorageDiagnostics(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<LogStorageDiagnosticsResponse>> {
    return await this.request<LogStorageDiagnosticsResponse>(
      this.client.readLogStorageDiagnostics(),
      METHOD_DIAGNOSTICS_LOG_STORAGE_READ,
      options,
    );
  }

  async exportSupportBundle(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SupportBundleExportResponse>> {
    return await this.request<SupportBundleExportResponse>(
      this.client.exportSupportBundle(),
      METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT,
      options,
    );
  }

  async readServerDiagnostics(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ServerDiagnosticsResponse>> {
    return await this.request<ServerDiagnosticsResponse>(
      this.client.readServerDiagnostics(),
      METHOD_DIAGNOSTICS_SERVER_READ,
      options,
    );
  }

  async readWindowsStartupDiagnostics(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WindowsStartupDiagnosticsResponse>> {
    return await this.request<WindowsStartupDiagnosticsResponse>(
      this.client.readWindowsStartupDiagnostics(),
      METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ,
      options,
    );
  }

  async readGatewayChannelStatus(
    params: GatewayChannelStatusParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayChannelStatusResponse>> {
    return await this.request<GatewayChannelStatusResponse>(
      this.client.readGatewayChannelStatus(params),
      METHOD_GATEWAY_CHANNEL_STATUS,
      options,
    );
  }

  async startGatewayChannel(
    params: GatewayChannelStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayChannelStatusResponse>> {
    return await this.request<GatewayChannelStatusResponse>(
      this.client.startGatewayChannel(params),
      METHOD_GATEWAY_CHANNEL_START,
      options,
    );
  }

  async stopGatewayChannel(
    params: GatewayChannelStopParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayChannelStatusResponse>> {
    return await this.request<GatewayChannelStatusResponse>(
      this.client.stopGatewayChannel(params),
      METHOD_GATEWAY_CHANNEL_STOP,
      options,
    );
  }

  async probeTelegramChannel(
    params: ChannelProbeParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ChannelProbeResponse>> {
    return await this.request<ChannelProbeResponse>(
      this.client.probeTelegramChannel(params),
      METHOD_TELEGRAM_CHANNEL_PROBE,
      options,
    );
  }

  async probeFeishuChannel(
    params: ChannelProbeParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ChannelProbeResponse>> {
    return await this.request<ChannelProbeResponse>(
      this.client.probeFeishuChannel(params),
      METHOD_FEISHU_CHANNEL_PROBE,
      options,
    );
  }

  async probeDiscordChannel(
    params: ChannelProbeParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ChannelProbeResponse>> {
    return await this.request<ChannelProbeResponse>(
      this.client.probeDiscordChannel(params),
      METHOD_DISCORD_CHANNEL_PROBE,
      options,
    );
  }

  async probeWechatChannel(
    params: ChannelProbeParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ChannelProbeResponse>> {
    return await this.request<ChannelProbeResponse>(
      this.client.probeWechatChannel(params),
      METHOD_WECHAT_CHANNEL_PROBE,
      options,
    );
  }

  async startWechatChannelLogin(
    params: WechatLoginStartParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WechatLoginStartResponse>> {
    return await this.request<WechatLoginStartResponse>(
      this.client.startWechatChannelLogin(params),
      METHOD_WECHAT_CHANNEL_LOGIN_START,
      options,
    );
  }

  async waitWechatChannelLogin(
    params: WechatLoginWaitParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WechatLoginWaitResponse>> {
    return await this.request<WechatLoginWaitResponse>(
      this.client.waitWechatChannelLogin(params),
      METHOD_WECHAT_CHANNEL_LOGIN_WAIT,
      options,
    );
  }

  async listWechatChannelAccounts(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WechatChannelAccountListResponse>> {
    return await this.request<WechatChannelAccountListResponse>(
      this.client.listWechatChannelAccounts(),
      METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
      options,
    );
  }

  async removeWechatChannelAccount(
    params: WechatChannelAccountRemoveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WechatChannelAccountRemoveResponse>> {
    return await this.request<WechatChannelAccountRemoveResponse>(
      this.client.removeWechatChannelAccount(params),
      METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
      options,
    );
  }

  async setWechatChannelRuntimeModel(
    params: WechatRuntimeModelSetParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WechatRuntimeModelSetResponse>> {
    return await this.request<WechatRuntimeModelSetResponse>(
      this.client.setWechatChannelRuntimeModel(params),
      METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
      options,
    );
  }

  async probeGatewayTunnel(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayTunnelProbeResponse>> {
    return await this.request<GatewayTunnelProbeResponse>(
      this.client.probeGatewayTunnel(),
      METHOD_GATEWAY_TUNNEL_PROBE,
      options,
    );
  }

  async detectGatewayTunnelCloudflared(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayTunnelCloudflaredDetectResponse>> {
    return await this.request<GatewayTunnelCloudflaredDetectResponse>(
      this.client.detectGatewayTunnelCloudflared(),
      METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
      options,
    );
  }

  async installGatewayTunnelCloudflared(
    params: GatewayTunnelCloudflaredInstallParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayTunnelCloudflaredInstallResponse>> {
    return await this.request<GatewayTunnelCloudflaredInstallResponse>(
      this.client.installGatewayTunnelCloudflared(params),
      METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
      options,
    );
  }

  async createGatewayTunnel(
    params: GatewayTunnelCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayTunnelCreateResponse>> {
    return await this.request<GatewayTunnelCreateResponse>(
      this.client.createGatewayTunnel(params),
      METHOD_GATEWAY_TUNNEL_CREATE,
      options,
    );
  }

  async startGatewayTunnel(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayTunnelStatusResponse>> {
    return await this.request<GatewayTunnelStatusResponse>(
      this.client.startGatewayTunnel(),
      METHOD_GATEWAY_TUNNEL_START,
      options,
    );
  }

  async stopGatewayTunnel(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayTunnelStatusResponse>> {
    return await this.request<GatewayTunnelStatusResponse>(
      this.client.stopGatewayTunnel(),
      METHOD_GATEWAY_TUNNEL_STOP,
      options,
    );
  }

  async restartGatewayTunnel(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayTunnelStatusResponse>> {
    return await this.request<GatewayTunnelStatusResponse>(
      this.client.restartGatewayTunnel(),
      METHOD_GATEWAY_TUNNEL_RESTART,
      options,
    );
  }

  async readGatewayTunnelStatus(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayTunnelStatusResponse>> {
    return await this.request<GatewayTunnelStatusResponse>(
      this.client.readGatewayTunnelStatus(),
      METHOD_GATEWAY_TUNNEL_STATUS,
      options,
    );
  }

  async syncGatewayTunnelWebhookUrl(
    params: GatewayTunnelSyncWebhookUrlParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GatewayTunnelSyncWebhookUrlResponse>> {
    return await this.request<GatewayTunnelSyncWebhookUrlResponse>(
      this.client.syncGatewayTunnelWebhookUrl(params),
      METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
      options,
    );
  }

  async createImageMediaTaskArtifact(
    params: MediaTaskArtifactImageCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MediaTaskArtifactResponse>> {
    return await this.request<MediaTaskArtifactResponse>(
      this.client.createImageMediaTaskArtifact(params),
      METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
      options,
    );
  }

  async createAudioMediaTaskArtifact(
    params: MediaTaskArtifactAudioCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MediaTaskArtifactResponse>> {
    return await this.request<MediaTaskArtifactResponse>(
      this.client.createAudioMediaTaskArtifact(params),
      METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE,
      options,
    );
  }

  async createVideoMediaTaskArtifact(
    params: MediaTaskArtifactVideoCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MediaTaskArtifactResponse>> {
    return await this.request<MediaTaskArtifactResponse>(
      this.client.createVideoMediaTaskArtifact(params),
      METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE,
      options,
    );
  }

  async completeAudioMediaTaskArtifact(
    params: MediaTaskArtifactAudioCompleteParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MediaTaskArtifactResponse>> {
    return await this.request<MediaTaskArtifactResponse>(
      this.client.completeAudioMediaTaskArtifact(params),
      METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE,
      options,
    );
  }

  async getMediaTaskArtifact(
    params: MediaTaskArtifactLookupParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MediaTaskArtifactResponse>> {
    return await this.request<MediaTaskArtifactResponse>(
      this.client.getMediaTaskArtifact(params),
      METHOD_MEDIA_TASK_ARTIFACT_GET,
      options,
    );
  }

  async listMediaTaskArtifacts(
    params: MediaTaskArtifactListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MediaTaskArtifactListResponse>> {
    return await this.request<MediaTaskArtifactListResponse>(
      this.client.listMediaTaskArtifacts(params),
      METHOD_MEDIA_TASK_ARTIFACT_LIST,
      options,
    );
  }

  async cancelMediaTaskArtifact(
    params: MediaTaskArtifactLookupParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<MediaTaskArtifactResponse>> {
    return await this.request<MediaTaskArtifactResponse>(
      this.client.cancelMediaTaskArtifact(params),
      METHOD_MEDIA_TASK_ARTIFACT_CANCEL,
      options,
    );
  }

  async getGalleryMaterial(
    params: GalleryMaterialLookupParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GalleryMaterialResponse>> {
    return await this.request<GalleryMaterialResponse>(
      this.client.getGalleryMaterial(params),
      METHOD_GALLERY_MATERIAL_GET,
      options,
    );
  }

  async createGalleryMaterialMetadata(
    params: GalleryMaterialMetadataCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GalleryMaterialMetadataResponse>> {
    return await this.request<GalleryMaterialMetadataResponse>(
      this.client.createGalleryMaterialMetadata(params),
      METHOD_GALLERY_MATERIAL_METADATA_CREATE,
      options,
    );
  }

  async getGalleryMaterialMetadata(
    params: GalleryMaterialLookupParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GalleryMaterialMetadataResponse>> {
    return await this.request<GalleryMaterialMetadataResponse>(
      this.client.getGalleryMaterialMetadata(params),
      METHOD_GALLERY_MATERIAL_METADATA_GET,
      options,
    );
  }

  async updateGalleryMaterialMetadata(
    params: GalleryMaterialMetadataUpdateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GalleryMaterialMetadataResponse>> {
    return await this.request<GalleryMaterialMetadataResponse>(
      this.client.updateGalleryMaterialMetadata(params),
      METHOD_GALLERY_MATERIAL_METADATA_UPDATE,
      options,
    );
  }

  async deleteGalleryMaterialMetadata(
    params: GalleryMaterialLookupParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GalleryMaterialDeleteResponse>> {
    return await this.request<GalleryMaterialDeleteResponse>(
      this.client.deleteGalleryMaterialMetadata(params),
      METHOD_GALLERY_MATERIAL_METADATA_DELETE,
      options,
    );
  }

  async listGalleryMaterialsByImageCategory(
    params: GalleryMaterialFilterParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GalleryMaterialListResponse>> {
    return await this.request<GalleryMaterialListResponse>(
      this.client.listGalleryMaterialsByImageCategory(params),
      METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY,
      options,
    );
  }

  async listGalleryMaterialsByLayoutCategory(
    params: GalleryMaterialFilterParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GalleryMaterialListResponse>> {
    return await this.request<GalleryMaterialListResponse>(
      this.client.listGalleryMaterialsByLayoutCategory(params),
      METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY,
      options,
    );
  }

  async listGalleryMaterialsByMood(
    params: GalleryMaterialFilterParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<GalleryMaterialListResponse>> {
    return await this.request<GalleryMaterialListResponse>(
      this.client.listGalleryMaterialsByMood(params),
      METHOD_GALLERY_MATERIAL_LIST_BY_MOOD,
      options,
    );
  }

  async listProjectMaterials(
    params: ProjectMaterialListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectMaterialListResponse>> {
    return await this.request<ProjectMaterialListResponse>(
      this.client.listProjectMaterials(params),
      METHOD_PROJECT_MATERIAL_LIST,
      options,
    );
  }

  async getProjectMaterial(
    params: ProjectMaterialLookupParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectMaterialResponse>> {
    return await this.request<ProjectMaterialResponse>(
      this.client.getProjectMaterial(params),
      METHOD_PROJECT_MATERIAL_GET,
      options,
    );
  }

  async countProjectMaterials(
    params: ProjectMaterialListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectMaterialCountResponse>> {
    return await this.request<ProjectMaterialCountResponse>(
      this.client.countProjectMaterials(params),
      METHOD_PROJECT_MATERIAL_COUNT,
      options,
    );
  }

  async uploadProjectMaterial(
    params: ProjectMaterialUploadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectMaterialResponse>> {
    return await this.request<ProjectMaterialResponse>(
      this.client.uploadProjectMaterial(params),
      METHOD_PROJECT_MATERIAL_UPLOAD,
      options,
    );
  }

  async importProjectMaterialFromUrl(
    params: ProjectMaterialImportFromUrlParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectMaterialResponse>> {
    return await this.request<ProjectMaterialResponse>(
      this.client.importProjectMaterialFromUrl(params),
      METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL,
      options,
    );
  }

  async updateProjectMaterial(
    params: ProjectMaterialUpdateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectMaterialResponse>> {
    return await this.request<ProjectMaterialResponse>(
      this.client.updateProjectMaterial(params),
      METHOD_PROJECT_MATERIAL_UPDATE,
      options,
    );
  }

  async deleteProjectMaterial(
    params: ProjectMaterialLookupParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectMaterialDeleteResponse>> {
    return await this.request<ProjectMaterialDeleteResponse>(
      this.client.deleteProjectMaterial(params),
      METHOD_PROJECT_MATERIAL_DELETE,
      options,
    );
  }

  async readProjectMaterialContent(
    params: ProjectMaterialLookupParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectMaterialContentResponse>> {
    return await this.request<ProjectMaterialContentResponse>(
      this.client.readProjectMaterialContent(params),
      METHOD_PROJECT_MATERIAL_CONTENT,
      options,
    );
  }

  async listVoiceAsrCredentials(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceAsrCredentialListResponse>> {
    return await this.request<VoiceAsrCredentialListResponse>(
      this.client.listVoiceAsrCredentials(),
      METHOD_VOICE_ASR_CREDENTIAL_LIST,
      options,
    );
  }

  async createVoiceAsrCredential(
    params: VoiceAsrCredentialCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceAsrCredentialWriteResponse>> {
    return await this.request<VoiceAsrCredentialWriteResponse>(
      this.client.createVoiceAsrCredential(params),
      METHOD_VOICE_ASR_CREDENTIAL_CREATE,
      options,
    );
  }

  async updateVoiceAsrCredential(
    params: VoiceAsrCredentialUpdateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceAsrCredentialMutationResponse>> {
    return await this.request<VoiceAsrCredentialMutationResponse>(
      this.client.updateVoiceAsrCredential(params),
      METHOD_VOICE_ASR_CREDENTIAL_UPDATE,
      options,
    );
  }

  async deleteVoiceAsrCredential(
    params: VoiceAsrCredentialIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceAsrCredentialMutationResponse>> {
    return await this.request<VoiceAsrCredentialMutationResponse>(
      this.client.deleteVoiceAsrCredential(params),
      METHOD_VOICE_ASR_CREDENTIAL_DELETE,
      options,
    );
  }

  async setDefaultVoiceAsrCredential(
    params: VoiceAsrCredentialIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceAsrCredentialMutationResponse>> {
    return await this.request<VoiceAsrCredentialMutationResponse>(
      this.client.setDefaultVoiceAsrCredential(params),
      METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET,
      options,
    );
  }

  async testVoiceAsrCredential(
    params: VoiceAsrCredentialIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceAsrCredentialTestResponse>> {
    return await this.request<VoiceAsrCredentialTestResponse>(
      this.client.testVoiceAsrCredential(params),
      METHOD_VOICE_ASR_CREDENTIAL_TEST,
      options,
    );
  }

  async listVoiceInstructions(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceInstructionListResponse>> {
    return await this.request<VoiceInstructionListResponse>(
      this.client.listVoiceInstructions(),
      METHOD_VOICE_INSTRUCTION_LIST,
      options,
    );
  }

  async saveVoiceInstruction(
    params: VoiceInstructionSaveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceInstructionMutationResponse>> {
    return await this.request<VoiceInstructionMutationResponse>(
      this.client.saveVoiceInstruction(params),
      METHOD_VOICE_INSTRUCTION_SAVE,
      options,
    );
  }

  async deleteVoiceInstruction(
    params: VoiceInstructionIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceInstructionMutationResponse>> {
    return await this.request<VoiceInstructionMutationResponse>(
      this.client.deleteVoiceInstruction(params),
      METHOD_VOICE_INSTRUCTION_DELETE,
      options,
    );
  }

  async setDefaultVoiceModel(
    params: VoiceModelDefaultSetParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceModelDefaultSetResponse>> {
    return await this.request<VoiceModelDefaultSetResponse>(
      this.client.setDefaultVoiceModel(params),
      METHOD_VOICE_MODEL_DEFAULT_SET,
      options,
    );
  }

  async testTranscribeVoiceModelFile(
    params: VoiceModelTestTranscribeFileParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<VoiceModelTestTranscribeFileResponse>> {
    return await this.request<VoiceModelTestTranscribeFileResponse>(
      this.client.testTranscribeVoiceModelFile(params),
      METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE,
      options,
    );
  }

  async readUsageStats(
    params: UsageStatsRangeParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<UsageStatsReadResponse>> {
    return await this.request<UsageStatsReadResponse>(
      this.client.readUsageStats(params),
      METHOD_USAGE_STATS_READ,
      options,
    );
  }

  async listUsageStatsModelRanking(
    params: UsageStatsRangeParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<UsageStatsModelRankingListResponse>> {
    return await this.request<UsageStatsModelRankingListResponse>(
      this.client.listUsageStatsModelRanking(params),
      METHOD_USAGE_STATS_MODEL_RANKING_LIST,
      options,
    );
  }

  async listUsageStatsDailyTrends(
    params: UsageStatsRangeParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<UsageStatsDailyTrendsListResponse>> {
    return await this.request<UsageStatsDailyTrendsListResponse>(
      this.client.listUsageStatsDailyTrends(params),
      METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
      options,
    );
  }

  async readArtifacts(
    params: ArtifactReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ArtifactReadResponse>> {
    return await this.request<ArtifactReadResponse>(
      this.client.readArtifacts(params),
      METHOD_ARTIFACT_READ,
      options,
    );
  }

  async listDirectory(
    params: FileSystemListDirectoryParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<FileSystemDirectoryListing>> {
    return await this.request<FileSystemDirectoryListing>(
      this.client.listDirectory(params),
      METHOD_FILE_SYSTEM_LIST_DIRECTORY,
      options,
    );
  }

  async readFilePreview(
    params: FileSystemReadFilePreviewParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<FileSystemFilePreview>> {
    return await this.request<FileSystemFilePreview>(
      this.client.readFilePreview(params),
      METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
      options,
    );
  }

  async createFile(
    params: FileSystemCreateFileParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<FileSystemMutationResponse>> {
    return await this.request<FileSystemMutationResponse>(
      this.client.createFile(params),
      METHOD_FILE_SYSTEM_CREATE_FILE,
      options,
    );
  }

  async createDirectory(
    params: FileSystemCreateDirectoryParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<FileSystemMutationResponse>> {
    return await this.request<FileSystemMutationResponse>(
      this.client.createDirectory(params),
      METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
      options,
    );
  }

  async renameFile(
    params: FileSystemRenameFileParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<FileSystemMutationResponse>> {
    return await this.request<FileSystemMutationResponse>(
      this.client.renameFile(params),
      METHOD_FILE_SYSTEM_RENAME_FILE,
      options,
    );
  }

  async deleteFile(
    params: FileSystemDeleteFileParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<FileSystemMutationResponse>> {
    return await this.request<FileSystemMutationResponse>(
      this.client.deleteFile(params),
      METHOD_FILE_SYSTEM_DELETE_FILE,
      options,
    );
  }

  async readProjectGitStatus(
    params: ProjectGitStatusParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectGitStatusResponse>> {
    return await this.request<ProjectGitStatusResponse>(
      this.client.readProjectGitStatus(params),
      METHOD_PROJECT_GIT_STATUS,
      options,
    );
  }

  async readProjectGitDiff(
    params: ProjectGitDiffParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectGitDiffResponse>> {
    return await this.request<ProjectGitDiffResponse>(
      this.client.readProjectGitDiff(params),
      METHOD_PROJECT_GIT_DIFF,
      options,
    );
  }

  async listProjectGitCommits(
    params: ProjectGitCommitListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectGitCommitListResponse>> {
    return await this.request<ProjectGitCommitListResponse>(
      this.client.listProjectGitCommits(params),
      METHOD_PROJECT_GIT_COMMITS_LIST,
      options,
    );
  }

  async checkoutProjectGitBranch(
    params: ProjectGitBranchCheckoutParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectGitBranchCheckoutResponse>> {
    return await this.request<ProjectGitBranchCheckoutResponse>(
      this.client.checkoutProjectGitBranch(params),
      METHOD_PROJECT_GIT_BRANCH_CHECKOUT,
      options,
    );
  }

  async createProjectGitBranch(
    params: ProjectGitBranchCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectGitBranchCreateResponse>> {
    return await this.request<ProjectGitBranchCreateResponse>(
      this.client.createProjectGitBranch(params),
      METHOD_PROJECT_GIT_BRANCH_CREATE,
      options,
    );
  }

  async createProjectGitWorktree(
    params: ProjectGitWorktreeCreateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectGitWorktreeCreateResponse>> {
    return await this.request<ProjectGitWorktreeCreateResponse>(
      this.client.createProjectGitWorktree(params),
      METHOD_PROJECT_GIT_WORKTREE_CREATE,
      options,
    );
  }

  async startProjectShellSession(
    params: ProjectShellSessionStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectShellSessionStartResponse>> {
    return await this.request<ProjectShellSessionStartResponse>(
      this.client.startProjectShellSession(params),
      METHOD_PROJECT_SHELL_SESSION_START,
      options,
    );
  }

  async writeProjectShellSession(
    params: ProjectShellSessionWriteParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectShellEmptyResponse>> {
    return await this.request<ProjectShellEmptyResponse>(
      this.client.writeProjectShellSession(params),
      METHOD_PROJECT_SHELL_SESSION_WRITE,
      options,
    );
  }

  async resizeProjectShellSession(
    params: ProjectShellSessionResizeParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectShellEmptyResponse>> {
    return await this.request<ProjectShellEmptyResponse>(
      this.client.resizeProjectShellSession(params),
      METHOD_PROJECT_SHELL_SESSION_RESIZE,
      options,
    );
  }

  async killProjectShellSession(
    params: ProjectShellSessionKillParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectShellEmptyResponse>> {
    return await this.request<ProjectShellEmptyResponse>(
      this.client.killProjectShellSession(params),
      METHOD_PROJECT_SHELL_SESSION_KILL,
      options,
    );
  }

  async drainProjectShellSessionEvents(
    params: ProjectShellSessionDrainEventsParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectShellSessionDrainEventsResponse>> {
    return await this.request<ProjectShellSessionDrainEventsResponse>(
      this.client.drainProjectShellSessionEvents(params),
      METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
      options,
    );
  }

  async startExecutionProcess(
    params: ExecutionProcessStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ExecutionProcessStartResponse>> {
    return await this.request<ExecutionProcessStartResponse>(
      this.client.startExecutionProcess(params),
      METHOD_EXECUTION_PROCESS_START,
      options,
    );
  }

  async writeExecutionProcessStdin(
    params: ExecutionProcessWriteStdinParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ExecutionProcessEmptyResponse>> {
    return await this.request<ExecutionProcessEmptyResponse>(
      this.client.writeExecutionProcessStdin(params),
      METHOD_EXECUTION_PROCESS_WRITE_STDIN,
      options,
    );
  }

  async interruptExecutionProcess(
    params: ExecutionProcessIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ExecutionProcessStatusResponse>> {
    return await this.request<ExecutionProcessStatusResponse>(
      this.client.interruptExecutionProcess(params),
      METHOD_EXECUTION_PROCESS_INTERRUPT,
      options,
    );
  }

  async terminateExecutionProcess(
    params: ExecutionProcessIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ExecutionProcessStatusResponse>> {
    return await this.request<ExecutionProcessStatusResponse>(
      this.client.terminateExecutionProcess(params),
      METHOD_EXECUTION_PROCESS_TERMINATE,
      options,
    );
  }

  async readExecutionProcessStatus(
    params: ExecutionProcessIdParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ExecutionProcessStatusResponse>> {
    return await this.request<ExecutionProcessStatusResponse>(
      this.client.readExecutionProcessStatus(params),
      METHOD_EXECUTION_PROCESS_STATUS,
      options,
    );
  }

  async drainExecutionProcessOutput(
    params: ExecutionProcessDrainOutputParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ExecutionProcessDrainOutputResponse>> {
    return await this.request<ExecutionProcessDrainOutputResponse>(
      this.client.drainExecutionProcessOutput(params),
      METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT,
      options,
    );
  }

  async exportEvidence(
    params: EvidenceExportParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<EvidenceExportResponse>> {
    return await this.request<EvidenceExportResponse>(
      this.client.exportEvidence(params),
      METHOD_EVIDENCE_EXPORT,
      options,
    );
  }

  async exportHandoffBundle(
    params: AgentSessionHandoffBundleExportParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionHandoffBundleExportResponse>> {
    return await this.request<AgentSessionHandoffBundleExportResponse>(
      this.client.exportHandoffBundle(params),
      METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
      options,
    );
  }

  async exportReplayCase(
    params: AgentSessionReplayCaseExportParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionReplayCaseExportResponse>> {
    return await this.request<AgentSessionReplayCaseExportResponse>(
      this.client.exportReplayCase(params),
      METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT,
      options,
    );
  }

  async exportAnalysisHandoff(
    params: AgentSessionAnalysisHandoffExportParams,
    options: AppServerRequestOptions = {},
  ): Promise<
    AppServerRequestResult<AgentSessionAnalysisHandoffExportResponse>
  > {
    return await this.request<AgentSessionAnalysisHandoffExportResponse>(
      this.client.exportAnalysisHandoff(params),
      METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
      options,
    );
  }

  async exportReviewDecisionTemplate(
    params: AgentSessionReviewDecisionTemplateExportParams,
    options: AppServerRequestOptions = {},
  ): Promise<
    AppServerRequestResult<AgentSessionReviewDecisionTemplateExportResponse>
  > {
    return await this.request<AgentSessionReviewDecisionTemplateExportResponse>(
      this.client.exportReviewDecisionTemplate(params),
      METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
      options,
    );
  }

  async saveReviewDecision(
    params: AgentSessionReviewDecisionSaveParams,
    options: AppServerRequestOptions = {},
  ): Promise<
    AppServerRequestResult<AgentSessionReviewDecisionTemplateExportResponse>
  > {
    return await this.request<AgentSessionReviewDecisionTemplateExportResponse>(
      this.client.saveReviewDecision(params),
      METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE,
      options,
    );
  }

  async readSession(
    params: AgentSessionReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionReadResponse>> {
    return await this.request<AgentSessionReadResponse>(
      this.client.readSession(params),
      METHOD_AGENT_SESSION_READ,
      options,
    );
  }

  async readAgentSessionToolInventory(
    params: AgentSessionToolInventoryReadParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionToolInventoryReadResponse>> {
    return await this.request<AgentSessionToolInventoryReadResponse>(
      this.client.readAgentSessionToolInventory(params),
      METHOD_AGENT_SESSION_TOOL_INVENTORY_READ,
      options,
    );
  }

  async listModels(
    params: ModelListParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelListResponse>> {
    return await this.request<ModelListResponse>(
      this.client.listModels(params),
      METHOD_MODEL_LIST,
      options,
    );
  }

  async listModelPreferences(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelPreferencesListResponse>> {
    return await this.request<ModelPreferencesListResponse>(
      this.client.listModelPreferences(),
      METHOD_MODEL_PREFERENCES_LIST,
      options,
    );
  }

  async readModelSyncState(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelSyncStateReadResponse>> {
    return await this.request<ModelSyncStateReadResponse>(
      this.client.readModelSyncState(),
      METHOD_MODEL_SYNC_STATE_READ,
      options,
    );
  }

  async listModelProviders(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelProviderListResponse>> {
    return await this.request<ModelProviderListResponse>(
      this.client.listModelProviders(),
      METHOD_MODEL_PROVIDER_LIST,
      options,
    );
  }

  async listModelProviderCatalog(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelProviderCatalogListResponse>> {
    return await this.request<ModelProviderCatalogListResponse>(
      this.client.listModelProviderCatalog(),
      METHOD_MODEL_PROVIDER_CATALOG_LIST,
      options,
    );
  }

  async readModelProviderAlias(
    params: ModelProviderAliasReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelProviderAliasReadResponse>> {
    return await this.request<ModelProviderAliasReadResponse>(
      this.client.readModelProviderAlias(params),
      METHOD_MODEL_PROVIDER_ALIAS_READ,
      options,
    );
  }

  async listModelProviderAliases(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelProviderAliasListResponse>> {
    return await this.request<ModelProviderAliasListResponse>(
      this.client.listModelProviderAliases(),
      METHOD_MODEL_PROVIDER_ALIAS_LIST,
      options,
    );
  }

  async resolveConnectDeepLink(
    params: ConnectDeepLinkResolveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConnectDeepLinkResolveResponse>> {
    return await this.request<ConnectDeepLinkResolveResponse>(
      this.client.resolveConnectDeepLink(params),
      METHOD_CONNECT_DEEP_LINK_RESOLVE,
      options,
    );
  }

  async resolveConnectOpenDeepLink(
    params: ConnectOpenDeepLinkResolveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConnectOpenDeepLinkResolveResponse>> {
    return await this.request<ConnectOpenDeepLinkResolveResponse>(
      this.client.resolveConnectOpenDeepLink(params),
      METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
      options,
    );
  }

  async saveConnectRelayApiKey(
    params: ConnectRelayApiKeySaveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConnectRelayApiKeySaveResponse>> {
    return await this.request<ConnectRelayApiKeySaveResponse>(
      this.client.saveConnectRelayApiKey(params),
      METHOD_CONNECT_RELAY_API_KEY_SAVE,
      options,
    );
  }

  async sendConnectCallback(
    params: ConnectCallbackSendParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConnectCallbackSendResponse>> {
    return await this.request<ConnectCallbackSendResponse>(
      this.client.sendConnectCallback(params),
      METHOD_CONNECT_CALLBACK_SEND,
      options,
    );
  }

  async scanConversationImportSource(
    params: ConversationImportSourceScanParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConversationImportSourceScanResponse>> {
    return await this.request<ConversationImportSourceScanResponse>(
      this.client.scanConversationImportSource(params),
      METHOD_CONVERSATION_IMPORT_SOURCE_SCAN,
      options,
    );
  }

  async previewConversationImportThread(
    params: ConversationImportThreadPreviewParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConversationImportThreadPreviewResponse>> {
    return await this.request<ConversationImportThreadPreviewResponse>(
      this.client.previewConversationImportThread(params),
      METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW,
      options,
    );
  }

  async commitConversationImportThread(
    params: ConversationImportThreadCommitParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConversationImportThreadCommitResponse>> {
    return await this.request<ConversationImportThreadCommitResponse>(
      this.client.commitConversationImportThread(params),
      METHOD_CONVERSATION_IMPORT_THREAD_COMMIT,
      options,
    );
  }

  async readConversationImportRuntimeEvents(
    params: ConversationImportThreadRuntimeEventsReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<
    AppServerRequestResult<ConversationImportThreadRuntimeEventsReadResponse>
  > {
    return await this.request<ConversationImportThreadRuntimeEventsReadResponse>(
      this.client.readConversationImportRuntimeEvents(params),
      METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ,
      options,
    );
  }

  async startTurn(
    params: AgentSessionTurnStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionTurnStartResponse>> {
    return await this.request<AgentSessionTurnStartResponse>(
      this.client.startTurn(params),
      METHOD_AGENT_SESSION_TURN_START,
      options,
    );
  }

  async cancelTurn(
    params: AgentSessionTurnCancelParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionTurnCancelResponse>> {
    return await this.request<AgentSessionTurnCancelResponse>(
      this.client.cancelTurn(params),
      METHOD_AGENT_SESSION_TURN_CANCEL,
      options,
    );
  }

  async replayAction(
    params: AgentSessionActionReplayParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionActionReplayResponse>> {
    return await this.request<AgentSessionActionReplayResponse>(
      this.client.replayAction(params),
      METHOD_AGENT_SESSION_ACTION_REPLAY,
      options,
    );
  }

  async respondAction(
    params: AgentSessionActionRespondParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionActionRespondResponse>> {
    return await this.request<AgentSessionActionRespondResponse>(
      this.client.respondAction(params),
      METHOD_AGENT_SESSION_ACTION_RESPOND,
      options,
    );
  }

  async request<T>(
    requestMessage: JsonRpcRequest,
    method = requestMessage.method,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<T>> {
    this.transport.send(requestMessage);
    return await this.waitForResponse<T>(requestMessage.id, method, options);
  }

  async requestUntilFirstNotificationOrResponse<T>(
    requestMessage: JsonRpcRequest,
    method = requestMessage.method,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestFirstMessageResult<T>> {
    this.transport.send(requestMessage);
    const messages: JsonRpcMessage[] = [];
    const notifications: JsonRpcNotification[] = [];

    try {
      const message = await this.#nextMessageForRequest(
        requestMessage.id,
        options.timeoutMs,
      );
      messages.push(message);

      if (isJsonRpcNotification(message)) {
        notifications.push(message);
        this.#mirroredNotifications.push(message);
        this.#detachedRequestIds.add(requestMessage.id);
        return {
          id: requestMessage.id,
          completed: false,
          notifications,
          messages,
        };
      }

      if (isJsonRpcErrorResponse(message) && message.id === requestMessage.id) {
        throw new AppServerRequestError(
          method,
          message,
          [...notifications],
          [...messages],
        );
      }

      if (isJsonRpcResponse(message) && message.id === requestMessage.id) {
        return {
          id: requestMessage.id,
          result: message.result as T,
          response: message,
          notifications,
          messages,
          completed: true,
        };
      }

      this.#detachedRequestIds.add(requestMessage.id);
      return {
        id: requestMessage.id,
        completed: false,
        notifications,
        messages,
      };
    } catch (error) {
      if (isAppServerTransportReadTimeoutError(error)) {
        this.#detachedRequestIds.add(requestMessage.id);
      }
      throw error;
    }
  }

  async waitForResponse<T>(
    id: RequestId,
    method: string,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<T>> {
    const messages: JsonRpcMessage[] = [];
    const notifications: JsonRpcNotification[] = [];
    const startedAt = Date.now();

    try {
      for (;;) {
        const remainingTimeoutMs = remainingRequestTimeoutMs(
          options.timeoutMs,
          startedAt,
        );
        const message = await this.#nextMessageForRequest(
          id,
          remainingTimeoutMs,
        );
        messages.push(message);

        if (isJsonRpcNotification(message)) {
          notifications.push(message);
          this.#mirroredNotifications.push(message);
          await this.#yieldReadTurn();
          continue;
        }

        if (isJsonRpcErrorResponse(message) && message.id === id) {
          throw new AppServerRequestError(
            method,
            message,
            [...notifications],
            [...messages],
          );
        }

        if (isJsonRpcResponse(message) && message.id === id) {
          return {
            id,
            result: message.result as T,
            response: message,
            notifications,
            messages,
          };
        }
      }
    } catch (error) {
      throw error;
    }
  }

  async nextNotification(timeoutMs?: number): Promise<JsonRpcNotification> {
    for (;;) {
      const buffered = this.#shiftBufferedNotification();
      if (buffered) {
        return buffered;
      }
      const notification = await this.#withTransportRead(
        timeoutMs,
        () => this.#shiftBufferedNotification(),
        (message) => {
          if (this.#consumeDetachedRequestMessage(message)) {
            return undefined;
          }
          if (isJsonRpcNotification(message)) {
            return message;
          }
          this.#prependBufferedMessages([message]);
          return undefined;
        },
      );
      if (notification) {
        return notification;
      }
    }
  }

  async nextMessage(timeoutMs?: number): Promise<JsonRpcMessage> {
    for (;;) {
      const buffered = this.#shiftBufferedMessage();
      if (buffered) {
        return buffered;
      }
      const message = await this.#withTransportRead<JsonRpcMessage | undefined>(
        timeoutMs,
        () => this.#shiftBufferedMessage(),
        (incoming) =>
          this.#consumeDetachedRequestMessage(incoming) ? undefined : incoming,
      );
      if (message) {
        return message;
      }
    }
  }

  async #nextMessageForRequest(
    id: RequestId,
    timeoutMs?: number,
  ): Promise<JsonRpcMessage> {
    const startedAt = Date.now();

    for (;;) {
      const buffered = this.#shiftBufferedRequestMessage(id);
      if (buffered) {
        return buffered;
      }

      const remainingTimeoutMs =
        timeoutMs === undefined
          ? undefined
          : Math.max(1, timeoutMs - (Date.now() - startedAt));
      const readTimeoutMs =
        remainingTimeoutMs === undefined
          ? APP_SERVER_TRANSPORT_READ_SLICE_MS
          : Math.min(remainingTimeoutMs, APP_SERVER_TRANSPORT_READ_SLICE_MS);
      let message: JsonRpcMessage | undefined;
      try {
        message = await this.#withTransportRead<JsonRpcMessage | undefined>(
          readTimeoutMs,
          () => this.#shiftBufferedRequestMessage(id),
          (incoming) => {
            if (this.#consumeDetachedRequestMessage(incoming)) {
              return undefined;
            }
            if (isJsonRpcNotification(incoming)) {
              return incoming;
            }
            if (isJsonRpcResponse(incoming) && incoming.id === id) {
              return incoming;
            }
            if (isJsonRpcErrorResponse(incoming) && incoming.id === id) {
              return incoming;
            }
            this.#prependBufferedMessages([incoming]);
            return undefined;
          },
        );
      } catch (error) {
        if (!isAppServerTransportReadTimeoutError(error)) {
          throw error;
        }
        if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) {
          throw new Error(
            `timed out waiting for app-server message after ${timeoutMs}ms`,
          );
        }
        await this.#yieldReadTurn();
        continue;
      }

      if (message) {
        return message;
      }

      await this.#yieldReadTurn();
    }
  }

  #prependBufferedMessages(messages: JsonRpcMessage[]): void {
    if (messages.length === 0) {
      return;
    }
    const retained = messages.filter(
      (message) => !this.#consumeDetachedRequestMessage(message),
    );
    if (retained.length === 0) {
      return;
    }
    this.#bufferedMessages = [...retained, ...this.#bufferedMessages];
  }

  #shiftBufferedMessage(): JsonRpcMessage | undefined {
    while (this.#bufferedMessages.length > 0) {
      const message = this.#bufferedMessages.shift();
      if (message && !this.#consumeDetachedRequestMessage(message)) {
        return message;
      }
    }
    return undefined;
  }

  #shiftBufferedRequestMessage(id: RequestId): JsonRpcMessage | undefined {
    this.#dropDetachedBufferedRequestMessages();

    const notificationIndex = this.#bufferedMessages.findIndex(
      isJsonRpcNotification,
    );
    if (notificationIndex >= 0) {
      const [message] = this.#bufferedMessages.splice(notificationIndex, 1);
      return message;
    }

    const responseIndex = this.#bufferedMessages.findIndex((message) => {
      return (
        (isJsonRpcResponse(message) || isJsonRpcErrorResponse(message)) &&
        message.id === id
      );
    });
    if (responseIndex < 0) {
      return undefined;
    }
    const [message] = this.#bufferedMessages.splice(responseIndex, 1);
    return message;
  }

  #shiftBufferedNotification(): JsonRpcNotification | undefined {
    const mirrored = this.#mirroredNotifications.shift();
    if (mirrored) {
      return mirrored;
    }
    this.#dropDetachedBufferedRequestMessages();
    const index = this.#bufferedMessages.findIndex(isJsonRpcNotification);
    if (index < 0) {
      return undefined;
    }
    const [message] = this.#bufferedMessages.splice(index, 1);
    return message as JsonRpcNotification;
  }

  #dropDetachedBufferedRequestMessages(): void {
    this.#bufferedMessages = this.#bufferedMessages.filter(
      (message) => !this.#consumeDetachedRequestMessage(message),
    );
  }

  #consumeDetachedRequestMessage(message: JsonRpcMessage): boolean {
    if (
      (isJsonRpcResponse(message) || isJsonRpcErrorResponse(message)) &&
      this.#detachedRequestIds.has(message.id)
    ) {
      this.#detachedRequestIds.delete(message.id);
      return true;
    }
    return false;
  }

  async #withTransportRead<T>(
    timeoutMs?: number,
    beforeRead?: () => T | undefined,
    afterRead?: (message: JsonRpcMessage) => T,
  ): Promise<T> {
    const previousRead = this.#transportReadLock;
    let releaseRead: () => void = () => undefined;
    this.#transportReadLock = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    await previousRead;
    try {
      const buffered = beforeRead?.();
      if (buffered) {
        return buffered;
      }
      const message = await this.transport.nextMessage(timeoutMs);
      return afterRead ? afterRead(message) : (message as T);
    } finally {
      releaseRead();
    }
  }

  async #yieldReadTurn(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

function isAppServerTransportReadTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("timed out waiting for app-server message after")
  );
}

export class AppServerAgentEventRouter {
  #listeners = new Set<AgentEventListener>();

  subscribe(listener: AgentEventListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async dispatch(message: JsonRpcMessage): Promise<boolean> {
    const notification = agentSessionEventNotification(message);
    if (!notification) {
      return false;
    }
    for (const listener of this.#listeners) {
      await listener(notification.params.event, notification);
    }
    return true;
  }
}

export class AppServerAgentRuntimeClient implements AgentRuntimeClient {
  readonly connection: AppServerConnection;
  readonly eventRouter: AppServerAgentEventRouter;
  readonly defaultRequestOptions: AppServerRequestOptions;

  constructor(
    connection: AppServerConnection,
    options: AgentRuntimeClientOptions = {},
  ) {
    this.connection = connection;
    this.eventRouter = new AppServerAgentEventRouter();
    this.defaultRequestOptions = options.request ?? {};
  }

  async startTurn(
    params: AgentSessionTurnStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionTurnStartResponse>> {
    return await this.connection.startTurn(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  async cancelTurn(
    params: AgentSessionTurnCancelParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionTurnCancelResponse>> {
    return await this.connection.cancelTurn(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  async respondAction(
    params: AgentSessionActionRespondParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionActionRespondResponse>> {
    return await this.connection.respondAction(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  async readThread(
    params: AgentSessionReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionReadResponse>> {
    return await this.connection.readSession(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  async readToolInventory(
    params: AgentSessionToolInventoryReadParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionToolInventoryReadResponse>> {
    return await this.connection.readAgentSessionToolInventory(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  async exportEvidence(
    params: EvidenceExportParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<EvidenceExportResponse>> {
    return await this.connection.exportEvidence(
      params,
      mergeRequestOptions(this.defaultRequestOptions, options),
    );
  }

  subscribeEvents(
    listener: AgentRuntimeEventListener,
  ): AgentRuntimeClientSubscription {
    const unsubscribe = this.eventRouter.subscribe(listener);
    return { unsubscribe };
  }

  async dispatchEvent(message: JsonRpcMessage): Promise<boolean> {
    return await this.eventRouter.dispatch(message);
  }

  async nextEvent(timeoutMs?: number): Promise<AgentSessionEventNotification> {
    for (;;) {
      const notification = await this.connection.nextNotification(timeoutMs);
      const agentNotification = agentSessionEventNotification(notification);
      if (agentNotification) {
        await this.dispatchEvent(agentNotification);
        return agentNotification;
      }
    }
  }
}

export function createAgentRuntimeClient(
  connection: AppServerConnection,
  options: AgentRuntimeClientOptions = {},
): AgentRuntimeClient {
  return new AppServerAgentRuntimeClient(connection, options);
}

function mergeRequestOptions(
  defaults: AppServerRequestOptions,
  overrides: AppServerRequestOptions,
): AppServerRequestOptions {
  return { ...defaults, ...overrides };
}

function normalizeMethodSpecs(
  methods: readonly AppServerMethodSpec[],
): string[] {
  return methods
    .map((spec) => `${spec.kind}:${spec.method}`)
    .sort((left, right) => left.localeCompare(right));
}

export function sidecarBinaryName(
  platform: NodeJS.Platform | string = process.platform,
): string {
  return platform === "win32" ? "app-server.exe" : "app-server";
}

export function defaultPackagedSidecarRelativePath(
  platform: NodeJS.Platform | string = process.platform,
  arch: NodeJS.Architecture | string = process.arch,
): string {
  return path.join(
    "app-server",
    platformKey(platform, arch),
    sidecarBinaryName(platform),
  );
}

export function resolveSidecarBinaryPath(
  options: ResolveSidecarBinaryPathOptions = {},
): SidecarBinaryPathResolution | undefined {
  const env = options.env ?? process.env;
  const envVarName = options.envVarName ?? "APP_SERVER_BIN";
  if (options.allowEnvOverride ?? true) {
    const envBinaryPath = env[envVarName]?.trim();
    if (envBinaryPath) {
      return {
        binaryPath: envBinaryPath,
        source: "env",
      };
    }
  }

  if (options.resourcesPath?.trim()) {
    return {
      binaryPath: path.join(
        options.resourcesPath,
        options.resourceRelativePath ??
          defaultPackagedSidecarRelativePath(options.platform, options.arch),
      ),
      source: "resources",
    };
  }

  if (options.devBinaryPath?.trim()) {
    return {
      binaryPath: options.devBinaryPath,
      source: "dev",
    };
  }

  return undefined;
}

export function stdioSidecar(
  binaryPath: string,
  appPolicyPath?: string,
  dataDir?: string,
  productDbMigrationCleanup?: SidecarLaunchConfig["productDbMigrationCleanup"],
): SidecarLaunchConfig {
  return {
    binaryPath,
    listenUrl: DEFAULT_LISTEN_URL,
    backendMode: DEFAULT_STANDALONE_BACKEND_MODE,
    ...(appPolicyPath ? { appPolicyPath } : {}),
    ...(dataDir ? { dataDir } : {}),
    ...(productDbMigrationCleanup ? { productDbMigrationCleanup } : {}),
  };
}

export function sidecarFromReleaseArtifact(
  binaryPath: string,
  artifact: AppServerReleaseArtifact,
  listenUrl = DEFAULT_LISTEN_URL,
  backendMode: SidecarLaunchConfig["backendMode"] = DEFAULT_STANDALONE_BACKEND_MODE,
  appPolicyPath?: string,
  dataDir?: string,
  productDbMigrationCleanup?: SidecarLaunchConfig["productDbMigrationCleanup"],
): SidecarLaunchConfig {
  return {
    binaryPath,
    listenUrl,
    backendMode,
    ...(appPolicyPath ? { appPolicyPath } : {}),
    ...(dataDir ? { dataDir } : {}),
    ...(productDbMigrationCleanup ? { productDbMigrationCleanup } : {}),
    expectedSha256: artifact.sha256,
    artifact,
  };
}

export function sidecarArgs(config: SidecarLaunchConfig): string[] {
  const args =
    config.listenUrl === DEFAULT_LISTEN_URL
      ? ["--stdio"]
      : ["--listen", config.listenUrl];
  args.push("--backend", config.backendMode ?? DEFAULT_STANDALONE_BACKEND_MODE);
  if (config.backendMode === "external" && config.backendCommand) {
    args.push("--backend-command", config.backendCommand);
  }
  for (const backendArg of config.backendMode === "external"
    ? (config.backendArgs ?? [])
    : []) {
    args.push("--backend-arg", backendArg);
  }
  if (
    config.backendMode === "external" &&
    config.backendTimeoutMs !== undefined
  ) {
    args.push("--backend-timeout-ms", String(config.backendTimeoutMs));
  }
  if (config.appPolicyPath) {
    args.push("--app-policy", config.appPolicyPath);
  }
  if (config.dataDir) {
    args.push("--data-dir", config.dataDir);
  }
  if (config.productDbMigrationCleanup) {
    args.push(
      "--product-db-migration-cleanup",
      config.productDbMigrationCleanup,
    );
  }
  return args;
}

export function platformKey(
  platform: NodeJS.Platform | string = process.platform,
  arch: NodeJS.Architecture | string = process.arch,
): AppServerArtifactPlatform {
  if (platform === "win32") {
    return "win32-x64";
  }
  if (platform === "darwin" && arch === "arm64") {
    return "darwin-arm64";
  }
  if (platform === "darwin") {
    return "darwin-x64";
  }
  if (platform === "linux") {
    return "linux-x64";
  }
  return `${platform}-${arch}`;
}

export function findReleaseArtifact(
  manifest: AppServerReleaseManifest,
  platform: AppServerArtifactPlatform = platformKey(),
): AppServerReleaseArtifact | undefined {
  return manifest.artifacts.find((artifact) => artifact.platform === platform);
}

export function resolveSidecarFromReleaseManifest(
  manifest: AppServerReleaseManifest,
  options: ResolveSidecarFromManifestOptions = {},
): ResolvedSidecarLaunchConfig | undefined {
  assertCompatibleManifest(
    manifest,
    options.expectedProtocolVersion ?? PROTOCOL_VERSION,
  );
  const artifact = findReleaseArtifact(
    manifest,
    platformKey(options.platform, options.arch),
  );
  if (!artifact) {
    return undefined;
  }

  const binaryPath = resolveSidecarBinaryPath(options);
  if (!binaryPath) {
    return undefined;
  }

  return {
    config: {
      binaryPath: binaryPath.binaryPath,
      listenUrl: options.listenUrl ?? DEFAULT_LISTEN_URL,
      backendMode: options.backendMode ?? DEFAULT_STANDALONE_BACKEND_MODE,
      ...(options.backendCommand
        ? { backendCommand: options.backendCommand }
        : {}),
      ...(options.backendArgs ? { backendArgs: options.backendArgs } : {}),
      ...(options.backendTimeoutMs !== undefined
        ? { backendTimeoutMs: options.backendTimeoutMs }
        : {}),
      ...(options.appPolicyPath
        ? { appPolicyPath: options.appPolicyPath }
        : {}),
      ...(options.dataDir ? { dataDir: options.dataDir } : {}),
      ...(options.productDbMigrationCleanup
        ? { productDbMigrationCleanup: options.productDbMigrationCleanup }
        : {}),
      expectedSha256:
        binaryPath.source === "resources" ? artifact.sha256 : undefined,
      artifact,
    },
    artifact,
    binaryPathSource: binaryPath.source,
  };
}

export async function readReleaseManifest(
  path: string,
): Promise<AppServerReleaseManifest> {
  return JSON.parse(await readFile(path, "utf8")) as AppServerReleaseManifest;
}

export async function readProtocolSchemaManifest(
  manifestPath: string,
): Promise<AppServerProtocolSchemaManifest> {
  return JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as AppServerProtocolSchemaManifest;
}

export async function resolveSidecarFromReleaseManifestFile(
  manifestPath: string,
  options: ResolveSidecarFromManifestOptions = {},
): Promise<ResolvedSidecarLaunchConfig | undefined> {
  return resolveSidecarFromReleaseManifest(
    await readReleaseManifest(manifestPath),
    options,
  );
}

export function defaultReleaseManifestPath(
  resourcesPath: string,
  manifestRelativePath = DEFAULT_RELEASE_MANIFEST_NAME,
): string {
  return path.join(resourcesPath, manifestRelativePath);
}

export function defaultProtocolSchemaManifestPath(
  schemaJsonRoot: string,
  manifestRelativePath = DEFAULT_PROTOCOL_SCHEMA_MANIFEST_NAME,
): string {
  return path.join(schemaJsonRoot, manifestRelativePath);
}

export function assertCompatibleManifest(
  manifest: AppServerReleaseManifest,
  expectedProtocolVersion = PROTOCOL_VERSION,
): void {
  if (manifest.protocolVersion !== expectedProtocolVersion) {
    throw new Error(
      `unsupported app-server protocol: expected ${expectedProtocolVersion}, got ${manifest.protocolVersion}`,
    );
  }
}

export function assertCompatibleProtocolSchemaManifest(
  manifest: AppServerProtocolSchemaManifest,
  expectedProtocolVersion = PROTOCOL_VERSION,
  expectedMethods: readonly AppServerMethodSpec[] = APP_SERVER_METHODS,
): void {
  if (manifest.protocolVersion !== expectedProtocolVersion) {
    throw new Error(
      `unsupported app-server schema protocol: expected ${expectedProtocolVersion}, got ${manifest.protocolVersion}`,
    );
  }
  if (manifest.jsonRpc.version !== JSONRPC_VERSION) {
    throw new Error(
      `unsupported JSON-RPC schema version: expected ${JSONRPC_VERSION}, got ${manifest.jsonRpc.version}`,
    );
  }
  const actualMethods = normalizeMethodSpecs(manifest.methods);
  const expectedMethodList = normalizeMethodSpecs(expectedMethods);
  if (actualMethods.join("\n") !== expectedMethodList.join("\n")) {
    throw new Error("app-server schema method catalog mismatch");
  }
}

export function protocolSchemaFilePath(
  schemaJsonRoot: string,
  group: ProtocolSchemaGroup,
  typeName: string,
): string {
  return path.join(schemaJsonRoot, group, `${typeName}.json`);
}

export function listProtocolSchemaFiles(
  manifest: AppServerProtocolSchemaManifest,
  schemaJsonRoot: string,
): ProtocolSchemaFile[] {
  return (["jsonrpc", "v0"] as const).flatMap((group) =>
    (manifest.schemas[group] ?? []).map((typeName) => ({
      group,
      typeName,
      path: protocolSchemaFilePath(schemaJsonRoot, group, typeName),
    })),
  );
}

export function sha256Hex(content: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function sha256File(path: string): Promise<string> {
  return sha256Hex(await readFile(path));
}

export function assertSha256(
  actualSha256: string,
  expectedSha256: string,
): void {
  if (normalizeSha256(actualSha256) !== normalizeSha256(expectedSha256)) {
    throw new Error("app-server sha256 mismatch");
  }
}

export async function assertSidecarFileSha256(
  config: SidecarLaunchConfig,
): Promise<void> {
  if (!config.expectedSha256) {
    throw new Error("sidecar expectedSha256 is required");
  }
  assertSha256(await sha256File(config.binaryPath), config.expectedSha256);
}

export async function spawnAppServerSidecar(
  config: SidecarLaunchConfig,
  options: SidecarProcessOptions = {},
): Promise<AppServerSidecar> {
  if (options.verifySha256 ?? Boolean(config.expectedSha256)) {
    await assertSidecarFileSha256(config);
  }

  const child = spawn(config.binaryPath, options.args ?? sidecarArgs(config), {
    ...options.spawnOptions,
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdio: "pipe",
  });

  return new AppServerSidecar(child);
}

export async function connectAppServerSidecar(
  config: SidecarLaunchConfig,
  initializeParams: InitializeParams,
  options: ConnectSidecarOptions = {},
): Promise<ConnectedAppServerSidecar> {
  const client = options.client ?? new AppServerClient();
  const sidecar = await spawnAppServerSidecar(config, options);

  try {
    const initializeRequest = client.initialize(initializeParams);
    sidecar.send(initializeRequest);
    const initializeMessage = await sidecar.nextMessage(
      options.initializeTimeoutMs,
    );
    const initializeResponse = expectResponseResult<InitializeResponse>(
      initializeMessage,
      initializeRequest.id,
      METHOD_INITIALIZE,
    );
    assertInitializeResponseProtocol(
      initializeResponse,
      options.expectedProtocolVersion ?? PROTOCOL_VERSION,
    );
    sidecar.send(client.initialized());

    return {
      client,
      connection: new AppServerConnection(sidecar, client),
      sidecar,
      initializeResponse,
    };
  } catch (error) {
    appendSidecarStderr(error, sidecar.stderrLines);
    await sidecar.close().catch(() => undefined);
    throw error;
  }
}

function appendSidecarStderr(
  error: unknown,
  stderrLines: readonly string[],
): void {
  if (!(error instanceof Error) || stderrLines.length === 0) {
    return;
  }
  const tail = stderrLines.slice(-20);
  error.message = `${error.message}; stderr=${tail.join("\n")}`;
  Object.assign(error, { stderrLines: tail });
}

export async function startPackagedAppServerSidecar(
  initializeParams: InitializeParams,
  options: PackagedSidecarLifecycleOptions,
): Promise<StartedPackagedAppServerSidecar> {
  const manifestPath =
    options.manifestPath ??
    defaultReleaseManifestPath(
      options.resourcesPath,
      options.manifestRelativePath,
    );
  const resolved = await resolveSidecarFromReleaseManifestFile(manifestPath, {
    ...options,
    allowEnvOverride: options.allowEnvOverride ?? false,
    resourcesPath: options.resourcesPath,
  });
  if (!resolved) {
    throw new Error("app-server sidecar artifact is not available");
  }

  const lifecycle = new AppServerSidecarLifecycle(
    resolved.config,
    initializeParams,
    options,
  );
  const connected = await lifecycle.start();
  return {
    resolved,
    lifecycle,
    connected,
  };
}

export function sidecarRestartDelayMs(
  attempt: number,
  policy: SidecarRestartPolicy = {},
): number {
  const initialDelayMs = policy.initialDelayMs ?? 500;
  const maxDelayMs = policy.maxDelayMs ?? 30_000;
  const factor = policy.factor ?? 2;
  const exponent = Math.max(0, attempt - 1);
  return Math.max(
    0,
    Math.min(maxDelayMs, Math.round(initialDelayMs * factor ** exponent)),
  );
}

export function shouldRestartSidecar(
  attempt: number,
  policy: SidecarRestartPolicy = {},
): boolean {
  const maxAttempts = policy.maxAttempts ?? 3;
  return maxAttempts < 0 || attempt <= maxAttempts;
}

export class AppServerSidecarLifecycle {
  readonly config: SidecarLaunchConfig;
  readonly initializeParams: InitializeParams;

  #options: SidecarLifecycleOptions;
  #connected: ConnectedAppServerSidecar | undefined;
  #stopped = true;

  constructor(
    config: SidecarLaunchConfig,
    initializeParams: InitializeParams,
    options: SidecarLifecycleOptions = {},
  ) {
    this.config = config;
    this.initializeParams = initializeParams;
    this.#options = options;
  }

  get connected(): ConnectedAppServerSidecar | undefined {
    return this.#connected;
  }

  async start(): Promise<ConnectedAppServerSidecar> {
    this.#stopped = false;
    return await this.#connectWithRetry(0);
  }

  async restart(): Promise<ConnectedAppServerSidecar> {
    await this.#closeCurrent();
    this.#stopped = false;
    return await this.#connectWithRetry(0);
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    await this.#closeCurrent();
  }

  async #connect(attempt: number): Promise<ConnectedAppServerSidecar> {
    const connected = await connectAppServerSidecar(
      this.config,
      this.initializeParams,
      this.#options,
    );
    this.#connected = connected;
    connected.sidecar.child.once("exit", (code, signal) => {
      void this.#handleExit(connected, attempt + 1, code, signal);
    });
    return connected;
  }

  async #connectWithRetry(attempt: number): Promise<ConnectedAppServerSidecar> {
    try {
      return await this.#connect(attempt);
    } catch (error) {
      const stderrLines =
        error instanceof Error &&
        Array.isArray((error as Error & { stderrLines?: unknown }).stderrLines)
          ? ((error as Error & { stderrLines: string[] }).stderrLines ?? [])
          : [];
      const retryAttempt = attempt + 1;
      this.#options.onRestartFailed?.({
        attempt: retryAttempt,
        error,
        stderrLines,
      });
      if (
        this.#stopped ||
        !shouldRestartSidecar(retryAttempt, this.#options.restartPolicy)
      ) {
        throw error;
      }
      await this.#waitBeforeRestart({
        attempt: retryAttempt,
        code: null,
        signal: null,
        stderrLines: [],
      });
      return await this.#connectWithRetry(retryAttempt);
    }
  }

  async #handleExit(
    connected: ConnectedAppServerSidecar,
    attempt: number,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> {
    if (this.#stopped || this.#connected !== connected) {
      return;
    }
    this.#connected = undefined;

    const event: SidecarExitEvent = {
      attempt,
      code,
      signal,
      stderrLines: [...connected.sidecar.stderrLines],
    };
    this.#options.onExit?.(event);
    await this.#restartAfterDelay(event);
  }

  async #restartAfterDelay(event: SidecarExitEvent): Promise<void> {
    if (!shouldRestartSidecar(event.attempt, this.#options.restartPolicy)) {
      return;
    }

    await this.#waitBeforeRestart(event);

    if (this.#stopped) {
      return;
    }

    try {
      const connected = await this.#connect(event.attempt);
      this.#options.onRestarted?.(connected, event.attempt);
    } catch (error) {
      this.#options.onRestartFailed?.({
        attempt: event.attempt,
        error,
        stderrLines: event.stderrLines,
      });
      await this.#restartAfterDelay({
        ...event,
        attempt: event.attempt + 1,
      });
    }
  }

  async #waitBeforeRestart(event: SidecarExitEvent): Promise<void> {
    const delayMs = sidecarRestartDelayMs(
      event.attempt,
      this.#options.restartPolicy,
    );
    this.#options.onRestartScheduled?.({ ...event, delayMs });
    await (this.#options.sleep ?? sleep)(delayMs);
  }

  async #closeCurrent(): Promise<void> {
    const connected = this.#connected;
    this.#connected = undefined;
    if (connected) {
      await connected.sidecar.close();
    }
  }
}

export class AppServerSidecar {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stderrLines: string[] = [];

  #stdout: ReadlineInterface;
  #stderr: ReadlineInterface;
  #messages: JsonRpcMessage[] = [];
  #waiters: Array<{
    resolve: (message: JsonRpcMessage) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  #closed = false;
  #closedError: Error | null = null;

  constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    this.#stdout = createInterface({ input: child.stdout });
    this.#stderr = createInterface({ input: child.stderr });

    this.#stdout.on("line", (line) => this.#receiveLine(line));
    this.#stderr.on("line", (line) => this.stderrLines.push(line));
    child.stdin.on("error", (error) =>
      this.#markClosedWithError(
        normalizeSidecarStdinError(error, "app-server sidecar stdin error"),
      ),
    );
    child.once("error", (error) => this.#markClosedWithError(error));
    child.once("exit", (code, signal) =>
      this.#markClosedWithError(
        new Error(
          `app-server exited before next message: code=${code}, signal=${signal}`,
        ),
      ),
    );
  }

  send(message: JsonRpcMessage): void {
    this.sendLine(encodeMessage(message));
  }

  sendLine(line: string): void {
    if (this.#closed || this.child.stdin.destroyed) {
      throw new Error("app-server sidecar stdin is closed");
    }
    try {
      this.child.stdin.write(line, (error) => {
        if (error) {
          this.#markClosedWithError(
            normalizeSidecarStdinError(
              error,
              "app-server sidecar stdin write failed",
            ),
          );
        }
      });
    } catch (error) {
      throw normalizeSidecarStdinError(
        error,
        "app-server sidecar stdin write failed",
      );
    }
  }

  nextMessage(timeoutMs = 30_000): Promise<JsonRpcMessage> {
    const message = this.#messages.shift();
    if (message) {
      return Promise.resolve(message);
    }
    if (this.#closed) {
      return Promise.reject(
        this.#closedError ?? new Error("app-server sidecar is closed"),
      );
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters = this.#waiters.filter(
          (waiter) => waiter.timer !== timer,
        );
        reject(
          new Error(
            `timed out waiting for app-server message after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
      this.#waiters.push({ resolve, reject, timer });
    });
  }

  async waitForExit(timeoutMs = 5_000): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }
    await withTimeout(
      once(this.child, "exit"),
      timeoutMs,
      "timed out waiting for app-server exit",
    );
  }

  async close(
    signal: NodeJS.Signals = "SIGTERM",
    timeoutMs = 5_000,
  ): Promise<void> {
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill(signal);
      try {
        await this.waitForExit(timeoutMs);
      } catch (error) {
        this.child.kill("SIGKILL");
        await this.waitForExit(timeoutMs);
        throw error;
      }
    }

    this.#stdout.close();
    this.#stderr.close();
  }

  #receiveLine(line: string): void {
    let message: JsonRpcMessage;
    try {
      message = decodeMessage(line);
    } catch (error) {
      this.#rejectWaiters(
        error instanceof Error ? error : new Error(String(error)),
      );
      return;
    }

    const waiter = this.#waiters.shift();
    if (!waiter) {
      this.#messages.push(message);
      return;
    }
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  }

  #rejectWaiters(error: Error): void {
    for (const waiter of this.#waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  #markClosedWithError(error: Error): void {
    this.#closed = true;
    this.#closedError = error;
    this.#rejectWaiters(error);
  }
}

function normalizeSidecarStdinError(error: unknown, fallback: string): Error {
  const message = error instanceof Error ? error.message : String(error || "");
  if (
    message.includes("EPIPE") ||
    message.includes("ERR_STREAM_DESTROYED") ||
    message.includes("write after end")
  ) {
    return new Error("app-server sidecar stdin is closed");
  }
  return error instanceof Error ? error : new Error(fallback);
}

function normalizeSha256(value: string): string {
  return value.trim().toLowerCase();
}

function expectResponseResult<T>(
  message: JsonRpcMessage,
  id: RequestId,
  method: string,
): T {
  if (isJsonRpcErrorResponse(message)) {
    throw new Error(`${method} failed: ${message.error.message}`);
  }
  if (!isJsonRpcResponse(message) || message.id !== id) {
    throw new Error(`expected ${method} response for request ${String(id)}`);
  }
  return message.result as T;
}

function assertInitializeResponseProtocol(
  response: InitializeResponse,
  expectedProtocolVersion: string,
): void {
  if (response.serverInfo.protocolVersion !== expectedProtocolVersion) {
    throw new Error(
      `unsupported app-server protocol: expected ${expectedProtocolVersion}, got ${response.serverInfo.protocolVersion}`,
    );
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
