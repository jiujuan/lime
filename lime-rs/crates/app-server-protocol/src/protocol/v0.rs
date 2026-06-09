use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: &str = "appserver.v0";
pub const SERVER_NAME: &str = "app-server";
pub const V0_SCHEMA_TYPE_NAMES: &[&str] = &[
    "ClientInfo",
    "ClientCapabilities",
    "InitializeParams",
    "InitializeResponse",
    "ServerInfo",
    "PlatformInfo",
    "ServerCapabilities",
    "CapabilityListParams",
    "CapabilityListResponse",
    "CapabilityDescriptor",
    "ArtifactReadParams",
    "ArtifactContentStatus",
    "ArtifactSummary",
    "ArtifactReadResponse",
    "FileSystemListDirectoryParams",
    "FileSystemReadFilePreviewParams",
    "FileSystemCreateFileParams",
    "FileSystemCreateDirectoryParams",
    "FileSystemRenameFileParams",
    "FileSystemDeleteFileParams",
    "FileSystemMutationResponse",
    "FileSystemDirectoryListing",
    "FileSystemFileEntry",
    "FileSystemFilePreview",
    "EvidenceExportParams",
    "EvidenceExportResponse",
    "EvidencePackSummary",
    "EvidencePackArtifact",
    "AgentSessionHandoffBundleExportParams",
    "AgentSessionHandoffBundleExportResponse",
    "AgentSessionHandoffArtifact",
    "AgentSessionReplayCaseExportParams",
    "AgentSessionReplayCaseExportResponse",
    "AgentSessionAnalysisHandoffExportParams",
    "AgentSessionAnalysisHandoffExportResponse",
    "AgentSessionReviewDecisionTemplateExportParams",
    "AgentSessionReviewDecisionTemplateExportResponse",
    "AgentSessionReviewDecisionSaveParams",
    "AgentSessionReviewDecision",
    "AgentSessionListParams",
    "AgentSessionOverview",
    "AgentSessionListResponse",
    "AgentSessionUpdateParams",
    "AgentSessionUpdateResponse",
    "ManagedObjectiveStatus",
    "ManagedObjective",
    "AgentSessionObjectiveReadParams",
    "AgentSessionObjectiveReadResponse",
    "AgentSessionObjectiveSetParams",
    "AgentSessionObjectiveSetResponse",
    "AgentSessionObjectiveStatusUpdateParams",
    "AgentSessionObjectiveStatusUpdateResponse",
    "AgentSessionObjectiveClearParams",
    "AgentSessionObjectiveClearResponse",
    "AgentSessionObjectiveContinueParams",
    "AgentSessionObjectiveContinueResponse",
    "AgentSessionObjectiveAuditParams",
    "AgentSessionObjectiveAuditResponse",
    "AgentSessionCompactParams",
    "AgentSessionCompactResponse",
    "AgentSessionThreadResumeParams",
    "AgentSessionThreadResumeResponse",
    "AgentSessionQueuedTurnRemoveParams",
    "AgentSessionQueuedTurnRemoveResponse",
    "AgentSessionQueuedTurnPromoteParams",
    "AgentSessionQueuedTurnPromoteResponse",
    "AgentSessionFileCheckpointListParams",
    "AgentSessionFileCheckpointGetParams",
    "AgentSessionFileCheckpointDiffParams",
    "AgentSessionFileCheckpointRestoreParams",
    "AgentSessionFileCheckpointSummary",
    "AgentSessionFileCheckpointThreadSummary",
    "AgentSessionFileCheckpointListResponse",
    "AgentSessionFileCheckpointDetail",
    "AgentSessionFileCheckpointDiffResponse",
    "AgentSessionFileCheckpointRestoreResponse",
    "WorkspaceReadParams",
    "WorkspacePathReadParams",
    "WorkspaceProjectPathResolveParams",
    "WorkspaceEnsureParams",
    "WorkspaceListResponse",
    "WorkspaceReadResponse",
    "WorkspaceProjectsRootReadResponse",
    "WorkspaceProjectPathResolveResponse",
    "WorkspaceEnsureReadyResponse",
    "SkillReadParams",
    "SkillListResponse",
    "SkillReadResponse",
    "SkillManagementListParams",
    "SkillManagementInstallParams",
    "SkillManagementUninstallParams",
    "SkillRepositorySaveParams",
    "SkillRepositoryDeleteParams",
    "SkillLocalInspectParams",
    "SkillScaffoldCreateParams",
    "SkillLocalImportParams",
    "SkillRemoteInspectParams",
    "SkillManagementWriteResponse",
    "SkillRepositoryListResponse",
    "SkillInstalledDirectoriesListResponse",
    "SkillLocalInspectResponse",
    "SkillScaffoldCreateResponse",
    "SkillLocalImportResponse",
    "SkillRemoteInspectResponse",
    "SkillLocalDetailInspectParams",
    "SkillLocalRenameParams",
    "SkillPackageLocalReplaceParams",
    "SkillLocalDetailInspectResponse",
    "SkillLocalRenameResponse",
    "SkillPackageLocalReplaceResponse",
    "SkillPackageLocalInspectParams",
    "SkillPackageLocalInstallParams",
    "SkillPackageExportParams",
    "SkillMarketplaceBundleFile",
    "SkillMarketplaceInstallParams",
    "SkillDownloadInstallParams",
    "SkillPackageLocalInspectResponse",
    "SkillPackageLocalInstallResponse",
    "SkillMarketplaceInstallResponse",
    "SkillDownloadInstallResponse",
    "SkillPackageExportResponse",
    "GatewayChannelStartParams",
    "GatewayChannelStopParams",
    "GatewayChannelStatusParams",
    "GatewayChannelStatusResponse",
    "ChannelProbeParams",
    "ChannelProbeResponse",
    "WechatLoginStartParams",
    "WechatLoginStartResponse",
    "WechatLoginWaitParams",
    "WechatLoginWaitResponse",
    "WechatConfiguredAccount",
    "WechatChannelAccountListResponse",
    "WechatChannelAccountRemoveParams",
    "WechatChannelAccountRemoveResponse",
    "WechatRuntimeModelSetParams",
    "WechatRuntimeModelSetResponse",
    "GatewayTunnelCreateParams",
    "GatewayTunnelCreateResult",
    "GatewayTunnelCreateResponse",
    "GatewayTunnelProbeResponse",
    "GatewayTunnelStatusResponse",
    "GatewayTunnelCloudflaredDetectResponse",
    "GatewayTunnelCloudflaredInstallParams",
    "GatewayTunnelCloudflaredInstallResponse",
    "GatewayTunnelSyncWebhookUrlParams",
    "GatewayTunnelSyncWebhookUrlResponse",
    "ImageStoryboardSlotInput",
    "MediaTaskArtifactImageCreateParams",
    "MediaTaskArtifactAudioCreateParams",
    "MediaTaskArtifactAudioCompleteParams",
    "MediaTaskArtifactLookupParams",
    "MediaTaskArtifactListParams",
    "MediaTaskArtifactListFilters",
    "MediaTaskArtifactResponse",
    "MediaTaskArtifactListResponse",
    "WorkspaceSkillBindingsListParams",
    "WorkspaceSkillBindingsListResponse",
    "WorkspaceRegisteredSkillsListParams",
    "WorkspaceRegisteredSkillsListResponse",
    "AgentAppLocalPackageInspectParams",
    "AgentAppLocalPackageInspectResponse",
    "AgentAppFetchCloudPackageParams",
    "AgentAppCloudReleaseDescriptor",
    "AgentAppPackageCacheEntry",
    "AgentAppPackageIdentity",
    "AgentAppInstalledSaveParams",
    "AgentAppInstalledDisabledSetParams",
    "AgentAppInstalledListResponse",
    "AgentAppUninstallRehearsalParams",
    "AgentAppUninstallRehearsalResponse",
    "AgentAppUninstallRehearsalTarget",
    "AgentAppUninstallParams",
    "AgentAppUninstallResponse",
    "AgentAppDeleteDataExecutionEvidence",
    "AgentAppDeleteDataTargetEvidence",
    "AgentAppDeleteDataPostDeleteResidualAudit",
    "AgentAppShellPrepareParams",
    "AgentAppShellPrepareResponse",
    "AgentAppShellPackageMount",
    "AgentAppUiRuntimeStartParams",
    "AgentAppUiRuntimeStatusParams",
    "AgentAppUiRuntimeStopParams",
    "AgentAppUiRuntimeStatusResponse",
    "KnowledgeListPacksParams",
    "KnowledgeListPacksResponse",
    "KnowledgeReadPackParams",
    "KnowledgeReadPackResponse",
    "KnowledgeImportSourceParams",
    "KnowledgeImportSourceResponse",
    "KnowledgeCompilePackParams",
    "KnowledgeCompilePackResponse",
    "KnowledgeSetDefaultPackParams",
    "KnowledgeSetDefaultPackResponse",
    "KnowledgeUpdatePackStatusParams",
    "KnowledgeUpdatePackStatusResponse",
    "KnowledgeResolveContextPackParams",
    "KnowledgeResolveContextParams",
    "KnowledgeContextResolutionResponse",
    "KnowledgeValidateContextRunParams",
    "KnowledgeValidateContextRunResponse",
    "AutomationSchedulerConfigReadResponse",
    "AutomationSchedulerConfigUpdateParams",
    "AutomationSchedulerConfigUpdateResponse",
    "AutomationSchedulerStatusResponse",
    "AutomationJobListResponse",
    "AutomationJobIdParams",
    "AutomationJobReadResponse",
    "AutomationJobCreateParams",
    "AutomationJobWriteResponse",
    "AutomationJobUpdateParams",
    "AutomationJobDeleteResponse",
    "AutomationJobRunNowResponse",
    "AutomationJobHealthParams",
    "AutomationJobHealthResponse",
    "AutomationJobRunHistoryParams",
    "AutomationJobRunHistoryResponse",
    "AutomationScheduleParams",
    "AutomationSchedulePreviewResponse",
    "AutomationScheduleValidateResponse",
    "McpServerListResponse",
    "McpServerStatusListResponse",
    "McpServerCreateParams",
    "McpServerUpdateParams",
    "McpServerDeleteParams",
    "McpServerEnabledSetParams",
    "McpServerImportFromAppParams",
    "McpServerImportFromAppResponse",
    "McpServerStartParams",
    "McpServerStopParams",
    "McpServerLifecycleResponse",
    "McpToolListForContextParams",
    "McpToolSearchParams",
    "McpToolCallParams",
    "McpToolCallWithCallerParams",
    "McpToolCallResponse",
    "McpPromptGetParams",
    "McpPromptGetResponse",
    "McpResourceReadParams",
    "McpResourceReadResponse",
    "McpContent",
    "McpPromptMessage",
    "McpToolListResponse",
    "McpPromptListResponse",
    "McpResourceListResponse",
    "ProjectMemoryReadParams",
    "ProjectMemoryReadResponse",
    "LogEntry",
    "LogListResponse",
    "LogPersistedTailParams",
    "LogPersistedTailResponse",
    "LogClearResponse",
    "LogArtifactEntry",
    "LogStorageDiagnosticsResponse",
    "SupportBundleExportResponse",
    "DiagnosticsMetricConfig",
    "DiagnosticsTelemetrySummary",
    "DiagnosticsCapabilityRoutingMetricsSnapshot",
    "DiagnosticsResponseCacheDiagnostics",
    "DiagnosticsRequestDedupDiagnostics",
    "DiagnosticsIdempotencyDiagnostics",
    "ServerDiagnosticsResponse",
    "WindowsStartupCheck",
    "WindowsStartupDiagnosticsResponse",
    "UsageStatsRangeParams",
    "UsageStatsSummary",
    "UsageStatsReadResponse",
    "UsageStatsModelUsage",
    "UsageStatsModelRankingListResponse",
    "UsageStatsDailyUsage",
    "UsageStatsDailyTrendsListResponse",
    "ModelListParams",
    "ModelListResponse",
    "ModelPreferencesListResponse",
    "ModelSyncStateReadResponse",
    "ModelProviderListResponse",
    "ModelProviderCatalogListResponse",
    "ModelProviderReadParams",
    "ModelProviderReadResponse",
    "ModelProviderCreateParams",
    "ModelProviderWriteResponse",
    "ModelProviderUpdateParams",
    "ModelProviderDeleteParams",
    "ModelProviderDeleteResponse",
    "ModelProviderSortOrderItem",
    "ModelProviderSortOrdersUpdateParams",
    "ModelProviderMutationResponse",
    "ModelProviderConfigExportParams",
    "ModelProviderConfigExportResponse",
    "ModelProviderConfigImportParams",
    "ModelProviderConfigImportResponse",
    "ModelProviderTestConnectionParams",
    "ModelProviderTestConnectionResponse",
    "ModelProviderTestChatParams",
    "ModelProviderTestChatResponse",
    "ModelProviderFetchModelsParams",
    "ModelProviderFetchModelsResponse",
    "ModelProviderKeyCreateParams",
    "ModelProviderKeyWriteResponse",
    "ModelProviderKeyUpdateParams",
    "ModelProviderKeyDeleteParams",
    "ModelProviderKeyDeleteResponse",
    "ModelProviderKeyNextParams",
    "ModelProviderKeyNextResponse",
    "ModelProviderKeyEventParams",
    "ModelProviderUiStateReadParams",
    "ModelProviderUiStateReadResponse",
    "ModelProviderUiStateWriteParams",
    "ModelProviderAliasReadParams",
    "ModelProviderAliasReadResponse",
    "ModelProviderAliasListResponse",
    "ConnectDeepLinkResolveParams",
    "ConnectPayload",
    "ConnectDeepLinkResolveResponse",
    "ConnectOpenDeepLinkResolveParams",
    "OpenDeepLinkPayload",
    "ConnectOpenDeepLinkResolveResponse",
    "ConnectRelayApiKeySaveParams",
    "ConnectRelayApiKeySaveResponse",
    "ConnectCallbackStatus",
    "ConnectCallbackSendParams",
    "ConnectCallbackSendResponse",
    "AgentSessionStartParams",
    "AgentSessionStartResponse",
    "AgentSessionReadParams",
    "AgentSessionReadResponse",
    "AgentSessionTurnStartParams",
    "AgentSessionTurnStartResponse",
    "AgentSessionTurnCancelParams",
    "AgentSessionTurnCancelResponse",
    "AgentSessionActionType",
    "AgentSessionActionScope",
    "AgentSessionActionReplayParams",
    "AgentSessionActionReplayResponse",
    "AgentSessionReplayedActionRequired",
    "AgentSessionActionRespondParams",
    "AgentSessionActionRespondResponse",
    "AgentSessionEventParams",
    "BusinessObjectRef",
    "AgentSessionStatus",
    "AgentSession",
    "AgentTurnStatus",
    "AgentTurn",
    "AgentInput",
    "AgentAttachment",
    "RuntimeOptions",
    "AgentEvent",
];

pub const METHOD_INITIALIZE: &str = "initialize";
pub const METHOD_INITIALIZED: &str = "initialized";
pub const METHOD_CAPABILITY_LIST: &str = "capability/list";
pub const METHOD_ARTIFACT_READ: &str = "artifact/read";
pub const METHOD_FILE_SYSTEM_LIST_DIRECTORY: &str = "fileSystem/listDirectory";
pub const METHOD_FILE_SYSTEM_READ_FILE_PREVIEW: &str = "fileSystem/readFilePreview";
pub const METHOD_FILE_SYSTEM_CREATE_FILE: &str = "fileSystem/createFile";
pub const METHOD_FILE_SYSTEM_CREATE_DIRECTORY: &str = "fileSystem/createDirectory";
pub const METHOD_FILE_SYSTEM_RENAME_FILE: &str = "fileSystem/renameFile";
pub const METHOD_FILE_SYSTEM_DELETE_FILE: &str = "fileSystem/deleteFile";
pub const METHOD_EVIDENCE_EXPORT: &str = "evidence/export";
pub const METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT: &str = "agentSession/handoffBundle/export";
pub const METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT: &str = "agentSession/replayCase/export";
pub const METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT: &str =
    "agentSession/analysisHandoff/export";
pub const METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT: &str =
    "agentSession/reviewDecisionTemplate/export";
pub const METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE: &str = "agentSession/reviewDecision/save";
pub const METHOD_AGENT_SESSION_LIST: &str = "agentSession/list";
pub const METHOD_AGENT_SESSION_UPDATE: &str = "agentSession/update";
pub const METHOD_AGENT_SESSION_OBJECTIVE_READ: &str = "agentSession/objective/read";
pub const METHOD_AGENT_SESSION_OBJECTIVE_SET: &str = "agentSession/objective/set";
pub const METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE: &str =
    "agentSession/objective/status/update";
pub const METHOD_AGENT_SESSION_OBJECTIVE_CLEAR: &str = "agentSession/objective/clear";
pub const METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE: &str = "agentSession/objective/continue";
pub const METHOD_AGENT_SESSION_OBJECTIVE_AUDIT: &str = "agentSession/objective/audit";
pub const METHOD_AGENT_SESSION_COMPACT: &str = "agentSession/compact";
pub const METHOD_AGENT_SESSION_THREAD_RESUME: &str = "agentSession/thread/resume";
pub const METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE: &str = "agentSession/queuedTurn/remove";
pub const METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE: &str = "agentSession/queuedTurn/promote";
pub const METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST: &str = "agentSession/fileCheckpoint/list";
pub const METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET: &str = "agentSession/fileCheckpoint/get";
pub const METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF: &str = "agentSession/fileCheckpoint/diff";
pub const METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE: &str =
    "agentSession/fileCheckpoint/restore";
pub const METHOD_WORKSPACE_LIST: &str = "workspace/list";
pub const METHOD_WORKSPACE_READ: &str = "workspace/read";
pub const METHOD_WORKSPACE_BY_PATH_READ: &str = "workspace/byPath/read";
pub const METHOD_WORKSPACE_DEFAULT_READ: &str = "workspace/default/read";
pub const METHOD_WORKSPACE_DEFAULT_ENSURE: &str = "workspace/default/ensure";
pub const METHOD_WORKSPACE_PROJECTS_ROOT_READ: &str = "workspace/projectsRoot/read";
pub const METHOD_WORKSPACE_PROJECT_PATH_RESOLVE: &str = "workspace/projectPath/resolve";
pub const METHOD_WORKSPACE_ENSURE_READY: &str = "workspace/ensureReady";
pub const METHOD_SKILL_LIST: &str = "skill/list";
pub const METHOD_SKILL_READ: &str = "skill/read";
pub const METHOD_SKILL_MANAGEMENT_LIST: &str = "skillManagement/list";
pub const METHOD_SKILL_MANAGEMENT_INSTALL: &str = "skillManagement/install";
pub const METHOD_SKILL_MANAGEMENT_UNINSTALL: &str = "skillManagement/uninstall";
pub const METHOD_SKILL_REPOSITORY_LIST: &str = "skillRepository/list";
pub const METHOD_SKILL_REPOSITORY_SAVE: &str = "skillRepository/save";
pub const METHOD_SKILL_REPOSITORY_DELETE: &str = "skillRepository/delete";
pub const METHOD_SKILL_CACHE_REFRESH: &str = "skillCache/refresh";
pub const METHOD_SKILL_INSTALLED_DIRECTORIES_LIST: &str = "skillInstalledDirectories/list";
pub const METHOD_SKILL_LOCAL_INSPECT: &str = "skillLocal/inspect";
pub const METHOD_SKILL_LOCAL_DETAIL_INSPECT: &str = "skillLocal/detail/inspect";
pub const METHOD_SKILL_LOCAL_SCAFFOLD_CREATE: &str = "skillLocal/scaffold/create";
pub const METHOD_SKILL_LOCAL_IMPORT: &str = "skillLocal/import";
pub const METHOD_SKILL_LOCAL_RENAME: &str = "skillLocal/rename";
pub const METHOD_SKILL_REMOTE_INSPECT: &str = "skillRemote/inspect";
pub const METHOD_SKILL_PACKAGE_LOCAL_INSPECT: &str = "skillPackage/local/inspect";
pub const METHOD_SKILL_PACKAGE_LOCAL_INSTALL: &str = "skillPackage/local/install";
pub const METHOD_SKILL_PACKAGE_LOCAL_REPLACE: &str = "skillPackage/local/replace";
pub const METHOD_SKILL_PACKAGE_EXPORT: &str = "skillPackage/export";
pub const METHOD_SKILL_MARKETPLACE_INSTALL: &str = "skillMarketplace/install";
pub const METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL: &str = "skillPackage/download/install";
pub const METHOD_GATEWAY_CHANNEL_START: &str = "gatewayChannel/start";
pub const METHOD_GATEWAY_CHANNEL_STOP: &str = "gatewayChannel/stop";
pub const METHOD_GATEWAY_CHANNEL_STATUS: &str = "gatewayChannel/status";
pub const METHOD_TELEGRAM_CHANNEL_PROBE: &str = "telegramChannel/probe";
pub const METHOD_FEISHU_CHANNEL_PROBE: &str = "feishuChannel/probe";
pub const METHOD_DISCORD_CHANNEL_PROBE: &str = "discordChannel/probe";
pub const METHOD_WECHAT_CHANNEL_PROBE: &str = "wechatChannel/probe";
pub const METHOD_WECHAT_CHANNEL_LOGIN_START: &str = "wechatChannel/login/start";
pub const METHOD_WECHAT_CHANNEL_LOGIN_WAIT: &str = "wechatChannel/login/wait";
pub const METHOD_WECHAT_CHANNEL_ACCOUNT_LIST: &str = "wechatChannel/accounts/list";
pub const METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE: &str = "wechatChannel/account/remove";
pub const METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET: &str = "wechatChannel/runtimeModel/set";
pub const METHOD_GATEWAY_TUNNEL_PROBE: &str = "gatewayTunnel/probe";
pub const METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT: &str = "gatewayTunnel/cloudflared/detect";
pub const METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL: &str = "gatewayTunnel/cloudflared/install";
pub const METHOD_GATEWAY_TUNNEL_CREATE: &str = "gatewayTunnel/create";
pub const METHOD_GATEWAY_TUNNEL_START: &str = "gatewayTunnel/start";
pub const METHOD_GATEWAY_TUNNEL_STOP: &str = "gatewayTunnel/stop";
pub const METHOD_GATEWAY_TUNNEL_RESTART: &str = "gatewayTunnel/restart";
pub const METHOD_GATEWAY_TUNNEL_STATUS: &str = "gatewayTunnel/status";
pub const METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL: &str = "gatewayTunnel/syncWebhookUrl";
pub const METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE: &str = "mediaTaskArtifact/image/create";
pub const METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE: &str = "mediaTaskArtifact/audio/create";
pub const METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE: &str = "mediaTaskArtifact/audio/complete";
pub const METHOD_MEDIA_TASK_ARTIFACT_GET: &str = "mediaTaskArtifact/get";
pub const METHOD_MEDIA_TASK_ARTIFACT_LIST: &str = "mediaTaskArtifact/list";
pub const METHOD_MEDIA_TASK_ARTIFACT_CANCEL: &str = "mediaTaskArtifact/cancel";
pub const METHOD_WORKSPACE_SKILL_BINDINGS_LIST: &str = "workspaceSkillBindings/list";
pub const METHOD_WORKSPACE_REGISTERED_SKILLS_LIST: &str = "workspaceRegisteredSkills/list";
pub const METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT: &str = "agentAppLocalPackage/inspect";
pub const METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD: &str = "agentAppPackage/fetchCloud";
pub const METHOD_AGENT_APP_INSTALLED_SAVE: &str = "agentAppInstalled/save";
pub const METHOD_AGENT_APP_INSTALLED_LIST: &str = "agentAppInstalled/list";
pub const METHOD_AGENT_APP_INSTALLED_DISABLED_SET: &str = "agentAppInstalled/disabled/set";
pub const METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL: &str =
    "agentAppInstalled/uninstall/rehearsal";
pub const METHOD_AGENT_APP_INSTALLED_UNINSTALL: &str = "agentAppInstalled/uninstall";
pub const METHOD_AGENT_APP_SHELL_PREPARE: &str = "agentAppShell/prepare";
pub const METHOD_AGENT_APP_UI_RUNTIME_START: &str = "agentAppUiRuntime/start";
pub const METHOD_AGENT_APP_UI_RUNTIME_STATUS: &str = "agentAppUiRuntime/status";
pub const METHOD_AGENT_APP_UI_RUNTIME_STOP: &str = "agentAppUiRuntime/stop";
pub const METHOD_KNOWLEDGE_PACK_LIST: &str = "knowledgePack/list";
pub const METHOD_KNOWLEDGE_PACK_READ: &str = "knowledgePack/read";
pub const METHOD_KNOWLEDGE_SOURCE_IMPORT: &str = "knowledgePack/source/import";
pub const METHOD_KNOWLEDGE_PACK_COMPILE: &str = "knowledgePack/compile";
pub const METHOD_KNOWLEDGE_PACK_DEFAULT_SET: &str = "knowledgePack/default/set";
pub const METHOD_KNOWLEDGE_PACK_STATUS_UPDATE: &str = "knowledgePack/status/update";
pub const METHOD_KNOWLEDGE_CONTEXT_RESOLVE: &str = "knowledgeContext/resolve";
pub const METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE: &str = "knowledgeContextRun/validate";
pub const METHOD_AUTOMATION_SCHEDULER_CONFIG_READ: &str = "automationScheduler/config/read";
pub const METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE: &str = "automationScheduler/config/update";
pub const METHOD_AUTOMATION_SCHEDULER_STATUS: &str = "automationScheduler/status";
pub const METHOD_AUTOMATION_JOB_LIST: &str = "automationJob/list";
pub const METHOD_AUTOMATION_JOB_READ: &str = "automationJob/read";
pub const METHOD_AUTOMATION_JOB_CREATE: &str = "automationJob/create";
pub const METHOD_AUTOMATION_JOB_UPDATE: &str = "automationJob/update";
pub const METHOD_AUTOMATION_JOB_DELETE: &str = "automationJob/delete";
pub const METHOD_AUTOMATION_JOB_RUN_NOW: &str = "automationJob/runNow";
pub const METHOD_AUTOMATION_JOB_HEALTH: &str = "automationJob/health";
pub const METHOD_AUTOMATION_JOB_RUN_HISTORY: &str = "automationJob/runHistory";
pub const METHOD_AUTOMATION_SCHEDULE_PREVIEW: &str = "automationSchedule/preview";
pub const METHOD_AUTOMATION_SCHEDULE_VALIDATE: &str = "automationSchedule/validate";
pub const METHOD_MCP_SERVER_LIST: &str = "mcpServer/list";
pub const METHOD_MCP_SERVER_STATUS_LIST: &str = "mcpServerStatus/list";
pub const METHOD_MCP_SERVER_CREATE: &str = "mcpServer/create";
pub const METHOD_MCP_SERVER_UPDATE: &str = "mcpServer/update";
pub const METHOD_MCP_SERVER_DELETE: &str = "mcpServer/delete";
pub const METHOD_MCP_SERVER_ENABLED_SET: &str = "mcpServer/enabled/set";
pub const METHOD_MCP_SERVER_IMPORT_FROM_APP: &str = "mcpServer/importFromApp";
pub const METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE: &str = "mcpServer/syncAllToLive";
pub const METHOD_MCP_SERVER_START: &str = "mcpServer/start";
pub const METHOD_MCP_SERVER_STOP: &str = "mcpServer/stop";
pub const METHOD_MCP_TOOL_LIST: &str = "mcpTool/list";
pub const METHOD_MCP_TOOL_LIST_FOR_CONTEXT: &str = "mcpTool/listForContext";
pub const METHOD_MCP_TOOL_SEARCH: &str = "mcpTool/search";
pub const METHOD_MCP_TOOL_CALL: &str = "mcpTool/call";
pub const METHOD_MCP_TOOL_CALL_WITH_CALLER: &str = "mcpTool/callWithCaller";
pub const METHOD_MCP_PROMPT_LIST: &str = "mcpPrompt/list";
pub const METHOD_MCP_PROMPT_GET: &str = "mcpPrompt/get";
pub const METHOD_MCP_RESOURCE_LIST: &str = "mcpResource/list";
pub const METHOD_MCP_RESOURCE_READ: &str = "mcpResource/read";
pub const METHOD_PROJECT_MEMORY_READ: &str = "projectMemory/read";
pub const METHOD_LOG_LIST: &str = "log/list";
pub const METHOD_LOG_PERSISTED_TAIL: &str = "log/persistedTail";
pub const METHOD_LOG_CLEAR: &str = "log/clear";
pub const METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR: &str = "log/diagnosticHistory/clear";
pub const METHOD_DIAGNOSTICS_LOG_STORAGE_READ: &str = "diagnostics/logStorage/read";
pub const METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT: &str = "diagnostics/supportBundle/export";
pub const METHOD_DIAGNOSTICS_SERVER_READ: &str = "diagnostics/server/read";
pub const METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ: &str = "diagnostics/windowsStartup/read";
pub const METHOD_USAGE_STATS_READ: &str = "usageStats/read";
pub const METHOD_USAGE_STATS_MODEL_RANKING_LIST: &str = "usageStats/modelRanking/list";
pub const METHOD_USAGE_STATS_DAILY_TRENDS_LIST: &str = "usageStats/dailyTrends/list";
pub const METHOD_MODEL_LIST: &str = "model/list";
pub const METHOD_MODEL_PREFERENCES_LIST: &str = "modelPreferences/list";
pub const METHOD_MODEL_SYNC_STATE_READ: &str = "modelSyncState/read";
pub const METHOD_MODEL_PROVIDER_LIST: &str = "modelProvider/list";
pub const METHOD_MODEL_PROVIDER_CATALOG_LIST: &str = "modelProvider/catalog/list";
pub const METHOD_MODEL_PROVIDER_READ: &str = "modelProvider/read";
pub const METHOD_MODEL_PROVIDER_CREATE: &str = "modelProvider/create";
pub const METHOD_MODEL_PROVIDER_UPDATE: &str = "modelProvider/update";
pub const METHOD_MODEL_PROVIDER_DELETE: &str = "modelProvider/delete";
pub const METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE: &str = "modelProvider/sortOrders/update";
pub const METHOD_MODEL_PROVIDER_CONFIG_EXPORT: &str = "modelProviderConfig/export";
pub const METHOD_MODEL_PROVIDER_CONFIG_IMPORT: &str = "modelProviderConfig/import";
pub const METHOD_MODEL_PROVIDER_TEST_CONNECTION: &str = "modelProvider/testConnection";
pub const METHOD_MODEL_PROVIDER_TEST_CHAT: &str = "modelProvider/testChat";
pub const METHOD_MODEL_PROVIDER_FETCH_MODELS: &str = "modelProvider/fetchModels";
pub const METHOD_MODEL_PROVIDER_KEY_CREATE: &str = "modelProviderKey/create";
pub const METHOD_MODEL_PROVIDER_KEY_UPDATE: &str = "modelProviderKey/update";
pub const METHOD_MODEL_PROVIDER_KEY_DELETE: &str = "modelProviderKey/delete";
pub const METHOD_MODEL_PROVIDER_KEY_NEXT: &str = "modelProviderKey/next";
pub const METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD: &str = "modelProviderKey/usage/record";
pub const METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD: &str = "modelProviderKey/error/record";
pub const METHOD_MODEL_PROVIDER_UI_STATE_READ: &str = "modelProviderUiState/read";
pub const METHOD_MODEL_PROVIDER_UI_STATE_WRITE: &str = "modelProviderUiState/write";
pub const METHOD_MODEL_PROVIDER_ALIAS_READ: &str = "modelProviderAlias/read";
pub const METHOD_MODEL_PROVIDER_ALIAS_LIST: &str = "modelProviderAlias/list";
pub const METHOD_CONNECT_DEEP_LINK_RESOLVE: &str = "connectDeepLink/resolve";
pub const METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE: &str = "connectOpenDeepLink/resolve";
pub const METHOD_CONNECT_RELAY_API_KEY_SAVE: &str = "connectRelayApiKey/save";
pub const METHOD_CONNECT_CALLBACK_SEND: &str = "connectCallback/send";
pub const METHOD_AGENT_SESSION_START: &str = "agentSession/start";
pub const METHOD_AGENT_SESSION_READ: &str = "agentSession/read";
pub const METHOD_AGENT_SESSION_TURN_START: &str = "agentSession/turn/start";
pub const METHOD_AGENT_SESSION_TURN_CANCEL: &str = "agentSession/turn/cancel";
pub const METHOD_AGENT_SESSION_ACTION_REPLAY: &str = "agentSession/action/replay";
pub const METHOD_AGENT_SESSION_ACTION_RESPOND: &str = "agentSession/action/respond";
pub const METHOD_AGENT_SESSION_EVENT: &str = "agentSession/event";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AppServerMethodKind {
    Request,
    Notification,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerMethodSpec {
    pub method: &'static str,
    pub kind: AppServerMethodKind,
}

pub const APP_SERVER_METHODS: &[AppServerMethodSpec] = &[
    AppServerMethodSpec {
        method: METHOD_INITIALIZE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_INITIALIZED,
        kind: AppServerMethodKind::Notification,
    },
    AppServerMethodSpec {
        method: METHOD_CAPABILITY_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_ARTIFACT_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_FILE_SYSTEM_LIST_DIRECTORY,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_FILE_SYSTEM_CREATE_FILE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_FILE_SYSTEM_RENAME_FILE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_FILE_SYSTEM_DELETE_FILE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_EVIDENCE_EXPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_UPDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_OBJECTIVE_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_OBJECTIVE_SET,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_COMPACT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_THREAD_RESUME,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WORKSPACE_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WORKSPACE_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WORKSPACE_BY_PATH_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WORKSPACE_DEFAULT_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WORKSPACE_DEFAULT_ENSURE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WORKSPACE_PROJECTS_ROOT_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WORKSPACE_ENSURE_READY,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_MANAGEMENT_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_MANAGEMENT_INSTALL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_MANAGEMENT_UNINSTALL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_REPOSITORY_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_REPOSITORY_SAVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_REPOSITORY_DELETE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_CACHE_REFRESH,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_INSTALLED_DIRECTORIES_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_LOCAL_INSPECT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_LOCAL_DETAIL_INSPECT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_LOCAL_SCAFFOLD_CREATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_LOCAL_IMPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_LOCAL_RENAME,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_REMOTE_INSPECT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_PACKAGE_LOCAL_INSPECT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_PACKAGE_LOCAL_INSTALL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_PACKAGE_LOCAL_REPLACE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_PACKAGE_EXPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_MARKETPLACE_INSTALL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_CHANNEL_START,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_CHANNEL_STOP,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_CHANNEL_STATUS,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_TELEGRAM_CHANNEL_PROBE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_FEISHU_CHANNEL_PROBE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_DISCORD_CHANNEL_PROBE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WECHAT_CHANNEL_PROBE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WECHAT_CHANNEL_LOGIN_START,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WECHAT_CHANNEL_LOGIN_WAIT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_TUNNEL_PROBE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_TUNNEL_CREATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_TUNNEL_START,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_TUNNEL_STOP,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_TUNNEL_RESTART,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_TUNNEL_STATUS,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MEDIA_TASK_ARTIFACT_GET,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MEDIA_TASK_ARTIFACT_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MEDIA_TASK_ARTIFACT_CANCEL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_WORKSPACE_REGISTERED_SKILLS_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_INSTALLED_SAVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_INSTALLED_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_INSTALLED_DISABLED_SET,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_INSTALLED_UNINSTALL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_SHELL_PREPARE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_UI_RUNTIME_START,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_UI_RUNTIME_STATUS,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_APP_UI_RUNTIME_STOP,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_KNOWLEDGE_PACK_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_KNOWLEDGE_PACK_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_KNOWLEDGE_SOURCE_IMPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_KNOWLEDGE_PACK_COMPILE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_KNOWLEDGE_PACK_DEFAULT_SET,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_KNOWLEDGE_PACK_STATUS_UPDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_KNOWLEDGE_CONTEXT_RESOLVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_SCHEDULER_CONFIG_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_SCHEDULER_STATUS,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_JOB_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_JOB_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_JOB_CREATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_JOB_UPDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_JOB_DELETE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_JOB_RUN_NOW,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_JOB_HEALTH,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_JOB_RUN_HISTORY,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_SCHEDULE_PREVIEW,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AUTOMATION_SCHEDULE_VALIDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_SERVER_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_SERVER_STATUS_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_SERVER_CREATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_SERVER_UPDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_SERVER_DELETE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_SERVER_ENABLED_SET,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_SERVER_IMPORT_FROM_APP,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_SERVER_START,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_SERVER_STOP,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_TOOL_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_TOOL_LIST_FOR_CONTEXT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_TOOL_SEARCH,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_TOOL_CALL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_TOOL_CALL_WITH_CALLER,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_PROMPT_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_PROMPT_GET,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_RESOURCE_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MCP_RESOURCE_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_PROJECT_MEMORY_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_LOG_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_LOG_PERSISTED_TAIL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_LOG_CLEAR,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_DIAGNOSTICS_LOG_STORAGE_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_DIAGNOSTICS_SERVER_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_USAGE_STATS_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_USAGE_STATS_MODEL_RANKING_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PREFERENCES_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_SYNC_STATE_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_CATALOG_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_CREATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_UPDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_DELETE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_CONFIG_EXPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_CONFIG_IMPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_TEST_CONNECTION,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_TEST_CHAT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_FETCH_MODELS,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_KEY_CREATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_KEY_UPDATE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_KEY_DELETE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_KEY_NEXT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_UI_STATE_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_UI_STATE_WRITE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_ALIAS_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_MODEL_PROVIDER_ALIAS_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_CONNECT_DEEP_LINK_RESOLVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_CONNECT_RELAY_API_KEY_SAVE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_CONNECT_CALLBACK_SEND,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_START,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_TURN_START,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_TURN_CANCEL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_ACTION_REPLAY,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_ACTION_RESPOND,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_EVENT,
        kind: AppServerMethodKind::Notification,
    },
];

pub fn is_app_server_request_method(method: &str) -> bool {
    APP_SERVER_METHODS
        .iter()
        .any(|spec| spec.kind == AppServerMethodKind::Request && spec.method == method)
}

pub fn is_app_server_notification_method(method: &str) -> bool {
    APP_SERVER_METHODS
        .iter()
        .any(|spec| spec.kind == AppServerMethodKind::Notification && spec.method == method)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClientCapabilities {
    #[serde(default)]
    pub event_methods: Vec<String>,
    #[serde(default)]
    pub experimental: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    pub client_info: ClientInfo,
    #[serde(default)]
    pub capabilities: ClientCapabilities,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResponse {
    pub server_info: ServerInfo,
    pub platform: PlatformInfo,
    pub capabilities: ServerCapabilities,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
    pub protocol_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub family: String,
    pub os: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ServerCapabilities {
    pub agent_session: bool,
    pub capability_discovery: bool,
    pub artifact: bool,
    pub evidence: bool,
    pub workspace: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityListResponse {
    #[serde(default)]
    pub capabilities: Vec<CapabilityDescriptor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDescriptor {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub methods: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactReadParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_content: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ArtifactContentStatus {
    #[default]
    NotRequested,
    Available,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactSummary {
    pub artifact_ref: String,
    pub event_id: String,
    pub sequence: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default)]
    pub content_status: ArtifactContentStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactReadResponse {
    #[serde(default)]
    pub artifacts: Vec<ArtifactSummary>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemListDirectoryParams {
    pub path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemReadFilePreviewParams {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_size: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemCreateFileParams {
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemCreateDirectoryParams {
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemRenameFileParams {
    pub old_path: String,
    pub new_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemDeleteFileParams {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recursive: Option<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemMutationResponse {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemDirectoryListing {
    pub path: String,
    #[serde(default)]
    pub parent_path: Option<String>,
    #[serde(default)]
    pub entries: Vec<FileSystemFileEntry>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_type: Option<String>,
    #[serde(default)]
    pub is_hidden: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode_str: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(default)]
    pub is_symlink: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon_data_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemFilePreview {
    pub path: String,
    #[serde(default)]
    pub content: Option<String>,
    pub is_binary: bool,
    pub size: u64,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceExportParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_events: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_artifacts: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_evidence_pack: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceExportResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    #[serde(default)]
    pub events: Vec<AgentEvent>,
    #[serde(default)]
    pub artifacts: Vec<ArtifactSummary>,
    pub exported_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence_pack: Option<EvidencePackSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvidencePackSummary {
    pub pack_relative_root: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack_absolute_root: Option<String>,
    pub exported_at: String,
    pub thread_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_turn_status: Option<String>,
    pub turn_count: usize,
    pub item_count: usize,
    pub pending_request_count: usize,
    pub queued_turn_count: usize,
    pub recent_artifact_count: usize,
    #[serde(default)]
    pub known_gaps: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observability_summary: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completion_audit_summary: Option<serde_json::Value>,
    #[serde(default)]
    pub artifacts: Vec<EvidencePackArtifact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvidencePackArtifact {
    pub kind: String,
    pub title: String,
    pub relative_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub absolute_path: Option<String>,
    pub bytes: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionHandoffBundleExportParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionHandoffBundleExportResponse {
    pub session_id: String,
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub workspace_root: String,
    pub bundle_relative_root: String,
    pub bundle_absolute_root: String,
    pub exported_at: String,
    pub thread_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_turn_status: Option<String>,
    pub pending_request_count: usize,
    pub queued_turn_count: usize,
    pub active_subagent_count: usize,
    pub todo_total: usize,
    pub todo_pending: usize,
    pub todo_in_progress: usize,
    pub todo_completed: usize,
    #[serde(default)]
    pub artifacts: Vec<AgentSessionHandoffArtifact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionHandoffArtifact {
    pub kind: String,
    pub title: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub bytes: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReplayCaseExportParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReplayCaseExportResponse {
    pub session_id: String,
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub workspace_root: String,
    pub replay_relative_root: String,
    pub replay_absolute_root: String,
    pub handoff_bundle_relative_root: String,
    pub evidence_pack_relative_root: String,
    pub exported_at: String,
    pub thread_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_turn_status: Option<String>,
    pub pending_request_count: usize,
    pub queued_turn_count: usize,
    pub linked_handoff_artifact_count: usize,
    pub linked_evidence_artifact_count: usize,
    pub recent_artifact_count: usize,
    #[serde(default)]
    pub artifacts: Vec<AgentSessionHandoffArtifact>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionAnalysisHandoffExportParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionAnalysisHandoffExportResponse {
    pub session_id: String,
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub workspace_root: String,
    pub sanitized_workspace_root: String,
    pub analysis_relative_root: String,
    pub analysis_absolute_root: String,
    pub handoff_bundle_relative_root: String,
    pub evidence_pack_relative_root: String,
    pub replay_case_relative_root: String,
    pub exported_at: String,
    pub thread_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_turn_status: Option<String>,
    pub pending_request_count: usize,
    pub queued_turn_count: usize,
    pub title: String,
    pub copy_prompt: String,
    #[serde(default)]
    pub artifacts: Vec<AgentSessionHandoffArtifact>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReviewDecisionTemplateExportParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReviewDecisionSaveParams {
    pub session_id: String,
    pub decision_status: String,
    #[serde(default)]
    pub decision_summary: String,
    #[serde(default)]
    pub chosen_fix_strategy: String,
    pub risk_level: String,
    #[serde(default)]
    pub risk_tags: Vec<String>,
    #[serde(default)]
    pub human_reviewer: String,
    #[serde(default)]
    pub followup_actions: Vec<String>,
    #[serde(default)]
    pub regression_requirements: Vec<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReviewDecision {
    pub decision_status: String,
    #[serde(default)]
    pub decision_summary: String,
    #[serde(default)]
    pub chosen_fix_strategy: String,
    pub risk_level: String,
    #[serde(default)]
    pub risk_tags: Vec<String>,
    #[serde(default)]
    pub human_reviewer: String,
    #[serde(default)]
    pub followup_actions: Vec<String>,
    #[serde(default)]
    pub regression_requirements: Vec<String>,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReviewDecisionTemplateExportResponse {
    pub session_id: String,
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub workspace_root: String,
    pub review_relative_root: String,
    pub review_absolute_root: String,
    pub analysis_relative_root: String,
    pub analysis_absolute_root: String,
    pub handoff_bundle_relative_root: String,
    pub evidence_pack_relative_root: String,
    pub replay_case_relative_root: String,
    pub exported_at: String,
    pub thread_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_turn_status: Option<String>,
    pub pending_request_count: usize,
    pub queued_turn_count: usize,
    pub title: String,
    pub default_decision_status: String,
    pub decision: AgentSessionReviewDecision,
    #[serde(default)]
    pub decision_status_options: Vec<String>,
    #[serde(default)]
    pub risk_level_options: Vec<String>,
    #[serde(default)]
    pub review_checklist: Vec<String>,
    #[serde(default)]
    pub analysis_artifacts: Vec<AgentSessionHandoffArtifact>,
    #[serde(default)]
    pub artifacts: Vec<AgentSessionHandoffArtifact>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerListResponse {
    #[serde(default)]
    pub servers: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatusListResponse {
    #[serde(default)]
    pub servers: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerCreateParams {
    pub server: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerUpdateParams {
    pub server: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerDeleteParams {
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerEnabledSetParams {
    pub id: String,
    pub app_type: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerImportFromAppParams {
    pub app_type: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerImportFromAppResponse {
    pub imported_count: usize,
    #[serde(default)]
    pub servers: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStartParams {
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStopParams {
    pub name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerLifecycleResponse {}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpToolListResponse {
    #[serde(default)]
    pub tools: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpToolListForContextParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caller: Option<String>,
    #[serde(default)]
    pub include_deferred: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpToolSearchParams {
    pub query: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caller: Option<String>,
    #[serde(default = "default_mcp_tool_search_limit")]
    pub limit: usize,
}

fn default_mcp_tool_search_limit() -> usize {
    10
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpToolCallParams {
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpToolCallWithCallerParams {
    pub tool_name: String,
    pub arguments: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caller: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct McpToolCallResponse {
    #[serde(default)]
    pub content: Vec<McpContent>,
    pub is_error: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptListResponse {
    #[serde(default)]
    pub prompts: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptGetParams {
    pub name: String,
    #[serde(default)]
    pub arguments: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptGetResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub messages: Vec<McpPromptMessage>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpResourceListResponse {
    #[serde(default)]
    pub resources: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpResourceReadParams {
    pub uri: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct McpResourceReadResponse {
    pub uri: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blob: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum McpContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { data: String, mime_type: String },
    #[serde(rename = "resource")]
    Resource {
        uri: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        text: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        blob: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptMessage {
    pub role: String,
    pub content: McpContent,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_archived: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_only: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionOverview {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution_strategy: Option<String>,
    pub messages_count: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionListResponse {
    #[serde(default)]
    pub sessions: Vec<AgentSessionOverview>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionUpdateParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_selector: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution_strategy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recent_access_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recent_preferences: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recent_team_selection: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionUpdateResponse {
    pub session: AgentSessionOverview,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ManagedObjectiveStatus {
    Active,
    Verifying,
    NeedsInput,
    Blocked,
    BudgetLimited,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ManagedObjective {
    pub objective_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub owner_kind: String,
    pub owner_id: String,
    pub objective_text: String,
    #[serde(default)]
    pub success_criteria: Vec<String>,
    pub status: ManagedObjectiveStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budget_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub risk_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub continuation_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_audit_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_evidence_pack_ref: Option<String>,
    #[serde(default)]
    pub last_artifact_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blocker_reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveReadParams {
    pub session_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveReadResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub objective: Option<ManagedObjective>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveSetParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub objective_text: String,
    #[serde(default)]
    pub success_criteria: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budget_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub risk_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub continuation_policy: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveSetResponse {
    pub objective: ManagedObjective,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveStatusUpdateParams {
    pub session_id: String,
    pub status: ManagedObjectiveStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blocker_reason: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveStatusUpdateResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub objective: Option<ManagedObjective>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveClearParams {
    pub session_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveClearResponse {
    pub cleared: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveContinueParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveContinueResponse {
    pub submitted: bool,
    pub queued_turn_id: String,
    pub objective: ManagedObjective,
    pub turn: AgentTurn,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveAuditParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveAuditResponse {
    pub objective: ManagedObjective,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionCompactParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionCompactResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    pub compacted: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionThreadResumeParams {
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionThreadResumeResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    pub resumed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionQueuedTurnRemoveParams {
    pub session_id: String,
    pub queued_turn_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionQueuedTurnRemoveResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    pub queued_turn_id: String,
    pub removed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionQueuedTurnPromoteParams {
    pub session_id: String,
    pub queued_turn_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionQueuedTurnPromoteResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    pub queued_turn_id: String,
    pub promoted: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointListParams {
    pub session_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointGetParams {
    pub session_id: String,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointDiffParams {
    pub session_id: String,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointRestoreParams {
    pub session_id: String,
    pub checkpoint_id: String,
    #[serde(default)]
    pub confirm_restore: bool,
    #[serde(default = "default_file_checkpoint_restore_backup")]
    pub create_backup: bool,
}

fn default_file_checkpoint_restore_backup() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointSummary {
    pub checkpoint_id: String,
    pub turn_id: String,
    pub path: String,
    pub source: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_no: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot_path: Option<String>,
    pub validation_issue_count: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointThreadSummary {
    pub count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_checkpoint: Option<AgentSessionFileCheckpointSummary>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointListResponse {
    pub session_id: String,
    pub thread_id: String,
    pub checkpoint_count: usize,
    #[serde(default)]
    pub checkpoints: Vec<AgentSessionFileCheckpointSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointDetail {
    pub session_id: String,
    pub thread_id: String,
    pub checkpoint: AgentSessionFileCheckpointSummary,
    pub live_path: String,
    pub snapshot_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checkpoint_document: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub live_document: Option<serde_json::Value>,
    #[serde(default)]
    pub version_history: Vec<serde_json::Value>,
    #[serde(default)]
    pub validation_issues: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointDiffResponse {
    pub session_id: String,
    pub thread_id: String,
    pub checkpoint: AgentSessionFileCheckpointSummary,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_version_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_version_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointRestoreResponse {
    pub session_id: String,
    pub thread_id: String,
    pub checkpoint: AgentSessionFileCheckpointSummary,
    pub live_path: String,
    pub snapshot_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backup_path: Option<String>,
    pub restored_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceReadParams {
    pub id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePathReadParams {
    pub root_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProjectPathResolveParams {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_root_path: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEnsureParams {
    pub id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceListResponse {
    #[serde(default)]
    pub workspaces: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceReadResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProjectsRootReadResponse {
    pub root_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProjectPathResolveResponse {
    pub root_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEnsureReadyResponse {
    pub result: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillReadParams {
    pub skill_name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillListResponse {
    #[serde(default)]
    pub skills: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillReadResponse {
    pub skill: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillManagementListParams {
    pub app: String,
    #[serde(default)]
    pub refresh_remote: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillManagementInstallParams {
    pub app: String,
    pub directory: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillManagementUninstallParams {
    pub app: String,
    pub directory: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillRepositoryEntry {
    pub owner: String,
    pub name: String,
    pub branch: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillRepositorySaveParams {
    pub repo: SkillRepositoryEntry,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillRepositoryDeleteParams {
    pub owner: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillLocalInspectParams {
    pub app: String,
    pub directory: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillScaffoldCreateParams {
    pub app: String,
    pub request: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillLocalImportParams {
    pub app: String,
    pub source_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillRemoteInspectParams {
    pub owner: String,
    pub name: String,
    pub branch: String,
    pub directory: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillManagementWriteResponse {
    pub success: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillRepositoryListResponse {
    #[serde(default)]
    pub repos: Vec<SkillRepositoryEntry>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillInstalledDirectoriesListResponse {
    #[serde(default)]
    pub directories: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillLocalInspectResponse {
    pub inspection: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillScaffoldCreateResponse {
    pub inspection: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillLocalImportResponse {
    pub directory: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillRemoteInspectResponse {
    pub inspection: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageLocalInspectParams {
    pub app: String,
    pub source_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillLocalDetailInspectParams {
    pub app: String,
    pub directory: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillLocalRenameParams {
    pub app: String,
    pub directory: String,
    pub new_directory: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageLocalReplaceParams {
    pub app: String,
    pub directory: String,
    pub source_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageLocalInstallParams {
    pub app: String,
    pub source_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skill_name: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageExportParams {
    pub app: String,
    pub directory: String,
    pub target_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketplaceBundleFile {
    pub path: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketplaceInstallParams {
    pub app: String,
    pub manifest_version: String,
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    pub version: String,
    #[serde(default)]
    pub content_hash: String,
    #[serde(default)]
    pub file_count: u64,
    #[serde(default)]
    pub files: Vec<SkillMarketplaceBundleFile>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillDownloadInstallParams {
    pub app: String,
    pub skill_name: String,
    pub download_url: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageLocalInspectResponse {
    pub directory: String,
    pub inspection: serde_json::Value,
    #[serde(default)]
    pub files: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillLocalDetailInspectResponse {
    pub directory: String,
    pub inspection: serde_json::Value,
    #[serde(default)]
    pub files: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillLocalRenameResponse {
    pub directory: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageLocalInstallResponse {
    pub directory: String,
    pub inspection: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageLocalReplaceResponse {
    pub directory: String,
    pub inspection: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketplaceInstallResponse {
    pub directory: String,
    pub inspection: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillDownloadInstallResponse {
    pub directory: String,
    pub inspection: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageExportResponse {
    pub directory: String,
    pub output_path: String,
    pub file_count: u64,
    pub bytes_written: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayChannelStartParams {
    pub channel: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "poll_timeout_secs"
    )]
    pub poll_timeout_secs: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayChannelStopParams {
    pub channel: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayChannelStatusParams {
    pub channel: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayChannelStatusResponse {
    pub channel: String,
    pub status: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChannelProbeParams {
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChannelProbeResponse {
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
    pub ok: bool,
    pub message: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatLoginStartParams {
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "base_url")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "bot_type")]
    pub bot_type: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "session_key"
    )]
    pub session_key: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatLoginStartResponse {
    #[serde(alias = "session_key")]
    pub session_key: String,
    #[serde(alias = "qrcode_url")]
    pub qrcode_url: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatLoginWaitParams {
    #[serde(alias = "session_key")]
    pub session_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "base_url")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "bot_type")]
    pub bot_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "timeout_ms")]
    pub timeout_ms: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "account_name"
    )]
    pub account_name: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatLoginWaitResponse {
    pub connected: bool,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "bot_token")]
    pub bot_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "user_id")]
    pub user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "base_url")]
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatConfiguredAccount {
    pub account_id: String,
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cdn_base_url: Option<String>,
    pub has_token: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scanner_user_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatChannelAccountListResponse {
    #[serde(default)]
    pub accounts: Vec<WechatConfiguredAccount>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatChannelAccountRemoveParams {
    #[serde(alias = "account_id")]
    pub account_id: String,
    #[serde(default, alias = "purge_data")]
    pub purge_data: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatChannelAccountRemoveResponse {}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatRuntimeModelSetParams {
    #[serde(alias = "provider_id")]
    pub provider_id: String,
    #[serde(alias = "model_id")]
    pub model_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatRuntimeModelSetResponse {
    pub runtime_model: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCreateParams {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "tunnel_name"
    )]
    pub tunnel_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "dns_name")]
    pub dns_name: Option<String>,
    #[serde(default = "default_true")]
    pub persist: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCreateResult {
    pub ok: bool,
    pub tunnel_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "tunnel_id")]
    pub tunnel_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "credentials_file"
    )]
    pub credentials_file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "dns_name")]
    pub dns_name: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "public_base_url"
    )]
    pub public_base_url: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelStatusResponse {
    pub running: bool,
    pub provider: String,
    pub mode: String,
    pub binary: String,
    pub local_url: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "public_base_url"
    )]
    pub public_base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "started_at")]
    pub started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "last_error")]
    pub last_error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "last_exit")]
    pub last_exit: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "command_preview"
    )]
    pub command_preview: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "connector_active"
    )]
    pub connector_active: Option<bool>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "connector_message"
    )]
    pub connector_message: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelProbeResponse {
    pub ok: bool,
    pub provider: String,
    pub mode: String,
    pub binary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(alias = "config_ready")]
    pub config_ready: bool,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCloudflaredDetectResponse {
    pub installed: bool,
    pub binary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub platform: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "package_manager"
    )]
    pub package_manager: Option<String>,
    #[serde(alias = "install_supported")]
    pub install_supported: bool,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "install_command"
    )]
    pub install_command: Option<String>,
    #[serde(alias = "requires_privilege")]
    pub requires_privilege: bool,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCloudflaredInstallParams {
    #[serde(default)]
    pub confirm: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCloudflaredInstallResponse {
    pub ok: bool,
    pub attempted: bool,
    pub platform: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "package_manager"
    )]
    pub package_manager: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "exit_code")]
    pub exit_code: Option<i32>,
    pub installed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCreateResponse {
    pub result: GatewayTunnelCreateResult,
    pub status: GatewayTunnelStatusResponse,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelSyncWebhookUrlParams {
    pub channel: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "webhook_path"
    )]
    pub webhook_path: Option<String>,
    #[serde(default = "default_true")]
    pub persist: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelSyncWebhookUrlResponse {
    pub channel: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
    #[serde(alias = "webhook_path")]
    pub webhook_path: String,
    #[serde(alias = "public_base_url")]
    pub public_base_url: String,
    #[serde(alias = "webhook_url")]
    pub webhook_url: String,
    pub persisted: bool,
}

const fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImageStoryboardSlotInput {
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "slot_id")]
    pub slot_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "shot_type")]
    pub shot_type: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MediaTaskArtifactImageCreateParams {
    pub project_root_path: String,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "title_generation_result"
    )]
    pub title_generation_result: Option<serde_json::Value>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "persona_context"
    )]
    pub persona_context: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub presentation: Option<serde_json::Value>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "taste_context"
    )]
    pub taste_context: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "raw_text")]
    pub raw_text: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "layout_hint"
    )]
    pub layout_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "aspect_ratio"
    )]
    pub aspect_ratio: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "provider_id"
    )]
    pub provider_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "executor_mode"
    )]
    pub executor_mode: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "outer_model"
    )]
    pub outer_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "session_id")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "thread_id")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "turn_id")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "project_id")]
    pub project_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "content_id")]
    pub content_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "entry_source"
    )]
    pub entry_source: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "modality_contract_key"
    )]
    pub modality_contract_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modality: Option<String>,
    #[serde(default, alias = "required_capabilities")]
    pub required_capabilities: Vec<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "routing_slot"
    )]
    pub routing_slot: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "runtime_contract"
    )]
    pub runtime_contract: Option<serde_json::Value>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "requested_target"
    )]
    pub requested_target: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "slot_id")]
    pub slot_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "anchor_hint"
    )]
    pub anchor_hint: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "anchor_section_title"
    )]
    pub anchor_section_title: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "anchor_text"
    )]
    pub anchor_text: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "target_output_id"
    )]
    pub target_output_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "target_output_ref_id"
    )]
    pub target_output_ref_id: Option<String>,
    #[serde(default, alias = "reference_images")]
    pub reference_images: Vec<String>,
    #[serde(default, alias = "storyboard_slots")]
    pub storyboard_slots: Vec<ImageStoryboardSlotInput>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MediaTaskArtifactAudioCreateParams {
    pub project_root_path: String,
    #[serde(alias = "source_text", alias = "prompt", alias = "text")]
    pub source_text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "raw_text")]
    pub raw_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "voice_style"
    )]
    pub voice_style: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "target_language"
    )]
    pub target_language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "mime_type")]
    pub mime_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "audio_path")]
    pub audio_path: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "duration_ms"
    )]
    pub duration_ms: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "provider_id"
    )]
    pub provider_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "session_id")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "thread_id")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "turn_id")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "project_id")]
    pub project_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "content_id")]
    pub content_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "entry_source"
    )]
    pub entry_source: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "modality_contract_key"
    )]
    pub modality_contract_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modality: Option<String>,
    #[serde(default, alias = "required_capabilities")]
    pub required_capabilities: Vec<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "routing_slot"
    )]
    pub routing_slot: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "runtime_contract"
    )]
    pub runtime_contract: Option<serde_json::Value>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "requested_target"
    )]
    pub requested_target: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "output_path"
    )]
    pub output_path: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MediaTaskArtifactAudioCompleteParams {
    pub project_root_path: String,
    pub task_ref: String,
    #[serde(alias = "audio_path", alias = "audio_url")]
    pub audio_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "mime_type")]
    pub mime_type: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "duration_ms"
    )]
    pub duration_ms: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "provider_id"
    )]
    pub provider_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MediaTaskArtifactLookupParams {
    pub project_root_path: String,
    pub task_ref: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MediaTaskArtifactListParams {
    pub project_root_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "task_family"
    )]
    pub task_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "task_type")]
    pub task_type: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "modality_contract_key"
    )]
    pub modality_contract_key: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "routing_outcome"
    )]
    pub routing_outcome: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct MediaTaskArtifactListFilters {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modality_contract_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routing_outcome: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct MediaTaskArtifactResponse {
    pub success: bool,
    pub task_id: String,
    pub task_type: String,
    #[serde(default)]
    pub task_family: String,
    pub status: String,
    pub normalized_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_attempt_id: Option<String>,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub absolute_path: String,
    #[serde(default)]
    pub artifact_path: String,
    #[serde(default)]
    pub absolute_artifact_path: String,
    #[serde(default)]
    pub reused_existing: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<String>,
    #[serde(default)]
    pub record: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct MediaTaskArtifactListResponse {
    pub success: bool,
    pub workspace_root: String,
    pub artifact_root: String,
    pub filters: MediaTaskArtifactListFilters,
    pub total: usize,
    #[serde(default)]
    pub modality_runtime_contracts: serde_json::Value,
    #[serde(default)]
    pub tasks: Vec<MediaTaskArtifactResponse>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkillBindingsListParams {
    pub workspace_root: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caller: Option<String>,
    #[serde(default)]
    pub workbench: bool,
    #[serde(default)]
    pub browser_assist: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkillBindingsListResponse {
    pub bindings: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRegisteredSkillsListParams {
    pub workspace_root: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRegisteredSkillsListResponse {
    #[serde(default)]
    pub skills: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppLocalPackageInspectParams {
    pub app_dir: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppLocalPackageInspectResponse {
    pub source_kind: String,
    pub source_uri: String,
    pub app_dir: String,
    pub app_markdown: String,
    pub manifest: serde_json::Value,
    pub manifest_hash: String,
    pub package_hash: String,
    pub inspected_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppFetchCloudPackageParams {
    pub descriptor: AgentAppCloudReleaseDescriptor,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppCloudReleaseDescriptor {
    pub source_uri: String,
    pub app_id: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant_enablement_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    pub package_url: String,
    pub package_hash: String,
    pub manifest_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature_ref: Option<String>,
    pub loaded_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppPackageCacheEntry {
    pub app_id: String,
    pub identity: AgentAppPackageIdentity,
    pub manifest_snapshot: serde_json::Value,
    pub package_hash: String,
    pub manifest_hash: String,
    pub cache_path: String,
    pub cached_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppPackageIdentity {
    pub source_kind: String,
    pub source_uri: String,
    pub app_id: String,
    pub app_version: String,
    pub package_hash: String,
    pub manifest_hash: String,
    pub loaded_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant_enablement_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature_ref: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppInstalledSaveParams {
    pub state: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppInstalledDisabledSetParams {
    pub app_id: String,
    pub disabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppInstalledListResponse {
    #[serde(default)]
    pub states: Vec<serde_json::Value>,
    #[serde(default)]
    pub issues: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallRehearsalParams {
    pub app_id: String,
    pub mode: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallRehearsalResponse {
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_hash: Option<String>,
    pub mode: String,
    pub generated_at: String,
    pub deleted_target_count: usize,
    pub retained_target_count: usize,
    #[serde(default)]
    pub targets: Vec<AgentAppUninstallRehearsalTarget>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallRehearsalTarget {
    pub kind: String,
    pub value: String,
    pub safe_to_delete: bool,
    pub action: String,
    pub reason: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallParams {
    pub app_id: String,
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmation_phrase: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallResponse {
    pub status: String,
    pub rehearsal: AgentAppUninstallRehearsalResponse,
    pub list: AgentAppInstalledListResponse,
    pub removed_target_count: usize,
    pub missing_target_count: usize,
    #[serde(default)]
    pub blocker_codes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delete_evidence: Option<AgentAppDeleteDataExecutionEvidence>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppDeleteDataExecutionEvidence {
    pub status: String,
    pub generated_at: String,
    pub data_root: String,
    #[serde(default)]
    pub removed_targets: Vec<AgentAppDeleteDataTargetEvidence>,
    #[serde(default)]
    pub missing_targets: Vec<AgentAppDeleteDataTargetEvidence>,
    #[serde(default)]
    pub retained_targets: Vec<AgentAppDeleteDataTargetEvidence>,
    #[serde(default)]
    pub blocked_targets: Vec<AgentAppDeleteDataTargetEvidence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failed_target: Option<AgentAppDeleteDataTargetEvidence>,
    #[serde(default)]
    pub blocker_codes: Vec<String>,
    pub post_delete_residual_audit: AgentAppDeleteDataPostDeleteResidualAudit,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppDeleteDataTargetEvidence {
    pub kind: String,
    pub value: String,
    pub action: String,
    pub reason: String,
    pub status: String,
    #[serde(default)]
    pub blocker_codes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppDeleteDataPostDeleteResidualAudit {
    pub status: String,
    pub checked_at: String,
    pub checked_target_count: usize,
    pub remaining_target_count: usize,
    #[serde(default)]
    pub remaining_targets: Vec<AgentAppDeleteDataTargetEvidence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failed_target: Option<AgentAppDeleteDataTargetEvidence>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellPrepareParams {
    pub descriptor: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellPackageMount {
    pub kind: String,
    pub path: String,
    pub read_only: bool,
    pub package_hash: String,
    pub manifest_hash: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellPrepareResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub install_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shell_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub descriptor_version: Option<u64>,
    pub dev_shell: bool,
    #[serde(default)]
    pub blocker_codes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_mount: Option<AgentAppShellPackageMount>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window_title: Option<String>,
    pub prepared_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStartParams {
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStatusParams {
    pub app_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStopParams {
    pub app_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStatusResponse {
    pub app_id: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeListPacksParams {
    pub working_dir: String,
    #[serde(default)]
    pub include_archived: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeListPacksResponse {
    pub working_dir: String,
    pub root_path: String,
    #[serde(default)]
    pub packs: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeReadPackParams {
    pub working_dir: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeReadPackResponse {
    pub pack: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeImportSourceParams {
    pub working_dir: String,
    pub pack_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_file_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_text: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeImportSourceResponse {
    pub pack: serde_json::Value,
    pub source: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCompilePackParams {
    pub working_dir: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub builder_runtime: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCompilePackResponse {
    pub pack: serde_json::Value,
    pub selected_source_count: u32,
    pub compiled_view: serde_json::Value,
    pub run: serde_json::Value,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSetDefaultPackParams {
    pub working_dir: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSetDefaultPackResponse {
    pub default_pack_name: String,
    pub default_marker_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeUpdatePackStatusParams {
    pub working_dir: String,
    pub name: String,
    pub status: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeUpdatePackStatusResponse {
    pub pack: serde_json::Value,
    pub previous_status: String,
    pub cleared_default: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeResolveContextPackParams {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeResolveContextParams {
    pub working_dir: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub packs: Vec<KnowledgeResolveContextPackParams>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_chars: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation: Option<String>,
    #[serde(default)]
    pub write_run: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_reason: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeContextResolutionResponse {
    pub pack_name: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grounding: Option<String>,
    #[serde(default)]
    pub selected_views: Vec<serde_json::Value>,
    #[serde(default)]
    pub selected_files: Vec<String>,
    #[serde(default)]
    pub source_anchors: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<serde_json::Value>,
    #[serde(default)]
    pub missing: Vec<String>,
    pub token_estimate: u32,
    pub fenced_context: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_path: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeValidateContextRunParams {
    pub working_dir: String,
    pub name: String,
    pub run_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeValidateContextRunResponse {
    pub valid: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default)]
    pub errors: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSchedulerConfigReadResponse {
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSchedulerConfigUpdateParams {
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSchedulerConfigUpdateResponse {
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSchedulerStatusResponse {
    pub status: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobListResponse {
    #[serde(default)]
    pub jobs: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobIdParams {
    pub id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobReadResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub job: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobCreateParams {
    pub request: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobWriteResponse {
    pub job: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobUpdateParams {
    pub id: String,
    pub request: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobDeleteResponse {
    pub deleted: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobRunNowResponse {
    pub result: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobHealthParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub query: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobHealthResponse {
    pub health: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobRunHistoryParams {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationJobRunHistoryResponse {
    #[serde(default)]
    pub runs: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationScheduleParams {
    pub schedule: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSchedulePreviewResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_run_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationScheduleValidateResponse {
    pub valid: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemoryReadParams {
    pub project_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemoryReadResponse {
    pub memory: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogListResponse {
    #[serde(default)]
    pub entries: Vec<LogEntry>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogPersistedTailParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lines: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogPersistedTailResponse {
    #[serde(default)]
    pub entries: Vec<LogEntry>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogClearResponse {
    pub cleared: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogArtifactEntry {
    pub file_name: String,
    pub path: String,
    pub size_bytes: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
    pub compressed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogStorageDiagnosticsResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_directory: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_log_path: Option<String>,
    pub current_log_exists: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_log_size_bytes: Option<u64>,
    pub in_memory_log_count: usize,
    #[serde(default)]
    pub related_log_files: Vec<LogArtifactEntry>,
    #[serde(default)]
    pub raw_response_files: Vec<LogArtifactEntry>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupportBundleExportResponse {
    pub bundle_path: String,
    pub output_directory: String,
    pub generated_at: String,
    pub platform: String,
    #[serde(default)]
    pub included_sections: Vec<String>,
    #[serde(default)]
    pub omitted_sections: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsMetricConfig {
    pub enabled: bool,
    pub ttl_secs: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_entries: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_body_bytes: Option<u64>,
    #[serde(default)]
    pub cacheable_status_codes: Vec<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wait_timeout_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header_name: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsTelemetrySummary {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub timeout_requests: u64,
    pub success_rate: f64,
    pub avg_latency_ms: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_latency_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_latency_ms: Option<f64>,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsCapabilityRoutingMetricsSnapshot {
    pub filter_eval_total: u64,
    pub filter_excluded_total: u64,
    pub filter_excluded_tools_total: u64,
    pub filter_excluded_vision_total: u64,
    pub filter_excluded_context_total: u64,
    pub provider_fallback_total: u64,
    pub model_fallback_total: u64,
    pub all_candidates_excluded_total: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsResponseCacheDiagnostics {
    pub config: DiagnosticsMetricConfig,
    pub stats: serde_json::Value,
    pub hit_rate_percent: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsRequestDedupDiagnostics {
    pub config: DiagnosticsMetricConfig,
    pub stats: serde_json::Value,
    pub replay_rate_percent: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsIdempotencyDiagnostics {
    pub config: DiagnosticsMetricConfig,
    pub stats: serde_json::Value,
    pub replay_rate_percent: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ServerDiagnosticsResponse {
    pub generated_at: String,
    pub running: bool,
    pub host: String,
    pub port: u16,
    pub telemetry_summary: DiagnosticsTelemetrySummary,
    pub capability_routing: DiagnosticsCapabilityRoutingMetricsSnapshot,
    pub response_cache: DiagnosticsResponseCacheDiagnostics,
    pub request_dedup: DiagnosticsRequestDedupDiagnostics,
    pub idempotency: DiagnosticsIdempotencyDiagnostics,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WindowsStartupCheck {
    pub key: String,
    pub status: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WindowsStartupDiagnosticsResponse {
    pub platform: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_data_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub legacy_lime_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub db_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub webview2_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_exe: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shell_env: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comspec_env: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_terminal_shell: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub installation_kind_guess: Option<String>,
    #[serde(default)]
    pub checks: Vec<WindowsStartupCheck>,
    pub has_blocking_issues: bool,
    pub has_warnings: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary_message: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UsageStatsRangeParams {
    pub time_range: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UsageStatsSummary {
    pub total_conversations: u32,
    pub total_messages: u32,
    pub total_tokens: u64,
    pub total_time_minutes: u32,
    pub monthly_conversations: u32,
    pub monthly_messages: u32,
    pub monthly_tokens: u64,
    pub today_conversations: u32,
    pub today_messages: u32,
    pub today_tokens: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UsageStatsReadResponse {
    pub stats: UsageStatsSummary,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UsageStatsModelUsage {
    pub model: String,
    pub conversations: u32,
    pub tokens: u64,
    pub percentage: f32,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UsageStatsModelRankingListResponse {
    #[serde(default)]
    pub ranking: Vec<UsageStatsModelUsage>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UsageStatsDailyUsage {
    pub date: String,
    pub conversations: u32,
    pub tokens: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UsageStatsDailyTrendsListResponse {
    #[serde(default)]
    pub trends: Vec<UsageStatsDailyUsage>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelListResponse {
    #[serde(default)]
    pub models: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelPreferencesListResponse {
    #[serde(default)]
    pub preferences: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelSyncStateReadResponse {
    pub sync_state: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderListResponse {
    #[serde(default)]
    pub providers: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderCatalogListResponse {
    #[serde(default)]
    pub providers: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderReadParams {
    pub provider_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderReadResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderCreateParams {
    pub provider: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderWriteResponse {
    pub provider: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderUpdateParams {
    pub provider_id: String,
    pub patch: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderDeleteParams {
    pub provider_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderDeleteResponse {
    pub deleted: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderSortOrderItem {
    pub provider_id: String,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderSortOrdersUpdateParams {
    #[serde(default)]
    pub sort_orders: Vec<ModelProviderSortOrderItem>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderMutationResponse {}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderConfigExportParams {
    #[serde(default)]
    pub include_keys: Option<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderConfigExportResponse {
    pub config_json: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderConfigImportParams {
    pub config_json: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderConfigImportResponse {
    pub success: bool,
    pub imported_providers: usize,
    pub imported_api_keys: usize,
    pub skipped_providers: usize,
    #[serde(default)]
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderTestConnectionParams {
    pub provider_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_name: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderTestConnectionResponse {
    pub success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderTestChatParams {
    pub provider_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_name: Option<String>,
    pub prompt: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderTestChatResponse {
    pub success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderFetchModelsParams {
    pub provider_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderFetchModelsResponse {
    #[serde(default)]
    pub models: Vec<serde_json::Value>,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diagnostic_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<String>,
    pub should_prompt_error: bool,
    pub from_cache: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderKeyCreateParams {
    pub provider_id: String,
    pub api_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
    #[serde(default)]
    pub replace_existing: Option<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderKeyWriteResponse {
    pub key: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderKeyUpdateParams {
    pub key_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderKeyDeleteParams {
    pub key_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderKeyDeleteResponse {
    pub deleted: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderKeyNextParams {
    pub provider_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderKeyNextResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderKeyEventParams {
    pub key_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderUiStateReadParams {
    pub key: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderUiStateReadResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderUiStateWriteParams {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderAliasReadParams {
    pub provider: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderAliasReadResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderAliasListResponse {
    #[serde(default)]
    pub configs: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectDeepLinkResolveParams {
    pub url: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectPayload {
    pub relay: String,
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ref_code: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectDeepLinkResolveResponse {
    pub payload: ConnectPayload,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relay_info: Option<serde_json::Value>,
    pub is_verified: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectOpenDeepLinkResolveParams {
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OpenDeepLinkPayload {
    pub kind: String,
    pub slug: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectOpenDeepLinkResolveResponse {
    pub payload: OpenDeepLinkPayload,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRelayApiKeySaveParams {
    pub relay_id: String,
    pub api_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRelayApiKeySaveResponse {
    pub provider_id: String,
    pub key_id: String,
    pub provider_name: String,
    pub is_new_provider: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ConnectCallbackStatus {
    Success,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectCallbackSendParams {
    pub relay_id: String,
    pub api_key: String,
    pub status: ConnectCallbackStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ref_code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConnectCallbackSendResponse {
    pub delivered: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionStartParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub business_object_ref: Option<BusinessObjectRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionStartResponse {
    pub session: AgentSession,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReadParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_limit: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_offset: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_before_message_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReadResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnStartParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub input: AgentInput,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_options: Option<RuntimeOptions>,
    #[serde(default)]
    pub queue_if_busy: bool,
    #[serde(default)]
    pub skip_pre_submit_resume: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnStartResponse {
    pub turn: AgentTurn,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnCancelParams {
    pub session_id: String,
    pub turn_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnCancelResponse {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AgentSessionActionType {
    ToolConfirmation,
    AskUser,
    Elicitation,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionScope {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionReplayParams {
    pub session_id: String,
    pub request_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReplayedActionRequired {
    #[serde(rename = "type")]
    pub event_type: String,
    pub request_id: String,
    pub action_type: AgentSessionActionType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arguments: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub questions: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requested_schema: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<AgentSessionActionScope>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionReplayResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<AgentSessionReplayedActionRequired>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionRespondParams {
    pub session_id: String,
    pub request_id: String,
    pub action_type: AgentSessionActionType,
    pub confirmed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_data: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action_scope: Option<AgentSessionActionScope>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionRespondResponse {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionEventParams {
    pub event: AgentEvent,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BusinessObjectRef {
    pub kind: String,
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum AgentSessionStatus {
    Idle,
    Running,
    WaitingAction,
    Completed,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub session_id: String,
    pub thread_id: String,
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub business_object_ref: Option<BusinessObjectRef>,
    pub status: AgentSessionStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum AgentTurnStatus {
    Accepted,
    Queued,
    Running,
    WaitingAction,
    Completed,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurn {
    pub turn_id: String,
    pub session_id: String,
    pub thread_id: String,
    pub status: AgentTurnStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentInput {
    pub text: String,
    #[serde(default)]
    pub attachments: Vec<AgentAttachment>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAttachment {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capability_id: Option<String>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_preference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_preference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queued_turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_options: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    pub event_id: String,
    pub sequence: u64,
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(rename = "type")]
    pub event_type: String,
    pub timestamp: String,
    pub payload: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, RequestId};
    use serde_json::json;

    #[test]
    fn initialize_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_INITIALIZE,
            Some(
                serde_json::to_value(InitializeParams {
                    client_info: ClientInfo {
                        name: "desktop-client".to_string(),
                        title: Some("Desktop Client".to_string()),
                        version: Some("1.58.0".to_string()),
                    },
                    capabilities: ClientCapabilities {
                        event_methods: vec![METHOD_AGENT_SESSION_EVENT.to_string()],
                        experimental: false,
                    },
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 1,
                "method": "initialize",
                "params": {
                    "clientInfo": {
                        "name": "desktop-client",
                        "title": "Desktop Client",
                        "version": "1.58.0"
                    },
                    "capabilities": {
                        "eventMethods": ["agentSession/event"],
                        "experimental": false
                    }
                }
            })
        );
    }

    #[test]
    fn initialize_response_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(
            JsonRpcResponse::new(
                RequestId::Integer(1),
                InitializeResponse {
                    server_info: ServerInfo {
                        name: SERVER_NAME.to_string(),
                        version: "1.58.0".to_string(),
                        protocol_version: PROTOCOL_VERSION.to_string(),
                    },
                    platform: PlatformInfo {
                        family: "desktop".to_string(),
                        os: "macos".to_string(),
                    },
                    capabilities: ServerCapabilities {
                        agent_session: true,
                        capability_discovery: true,
                        artifact: true,
                        evidence: true,
                        workspace: true,
                    },
                },
            )
            .expect("create response"),
        )
        .expect("serialize response");

        assert_eq!(
            value,
            json!({
                "id": 1,
                "result": {
                    "serverInfo": {
                        "name": "app-server",
                        "version": "1.58.0",
                        "protocolVersion": "appserver.v0"
                    },
                    "platform": {
                        "family": "desktop",
                        "os": "macos"
                    },
                    "capabilities": {
                        "agentSession": true,
                        "capabilityDiscovery": true,
                        "artifact": true,
                        "evidence": true,
                        "workspace": true
                    }
                }
            })
        );
    }

    #[test]
    fn capability_list_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_CAPABILITY_LIST,
            Some(
                serde_json::to_value(CapabilityListParams {
                    app_id: Some("content-studio".to_string()),
                    workspace_id: Some("workspace-main".to_string()),
                    session_id: Some("sess_1".to_string()),
                    cursor: Some("2".to_string()),
                    limit: Some(25),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 2,
                "method": "capability/list",
                "params": {
                    "appId": "content-studio",
                    "workspaceId": "workspace-main",
                    "sessionId": "sess_1",
                    "cursor": "2",
                    "limit": 25
                }
            })
        );
    }

    #[test]
    fn agent_session_start_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::String("req-start".to_string()),
            METHOD_AGENT_SESSION_START,
            Some(
                serde_json::to_value(AgentSessionStartParams {
                    session_id: Some("sess_1".to_string()),
                    thread_id: Some("thread_1".to_string()),
                    app_id: "writer".to_string(),
                    workspace_id: Some("workspace_1".to_string()),
                    business_object_ref: Some(BusinessObjectRef {
                        kind: "document".to_string(),
                        id: "doc_1".to_string(),
                        title: Some("Draft".to_string()),
                        uri: Some("file:///draft.md".to_string()),
                        metadata: Some(json!({ "source": "fixture" })),
                    }),
                    locale: Some("zh-CN".to_string()),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": "req-start",
                "method": "agentSession/start",
                "params": {
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "appId": "writer",
                    "workspaceId": "workspace_1",
                    "businessObjectRef": {
                        "kind": "document",
                        "id": "doc_1",
                        "title": "Draft",
                        "uri": "file:///draft.md",
                        "metadata": {
                            "source": "fixture"
                        }
                    },
                    "locale": "zh-CN"
                }
            })
        );
    }

    #[test]
    fn artifact_read_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(6),
            METHOD_ARTIFACT_READ,
            Some(
                serde_json::to_value(ArtifactReadParams {
                    session_id: "sess_1".to_string(),
                    turn_id: Some("turn_1".to_string()),
                    artifact_ref: Some("artifact-document:req-1".to_string()),
                    include_content: Some(true),
                    cursor: Some("2".to_string()),
                    limit: Some(10),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 6,
                "method": "artifact/read",
                "params": {
                    "sessionId": "sess_1",
                    "turnId": "turn_1",
                    "artifactRef": "artifact-document:req-1",
                    "includeContent": true,
                    "cursor": "2",
                    "limit": 10
                }
            })
        );
    }

    #[test]
    fn artifact_summary_content_status_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(ArtifactSummary {
            artifact_ref: "artifact-document:req-1".to_string(),
            event_id: "evt-artifact-1".to_string(),
            sequence: 7,
            turn_id: Some("turn_1".to_string()),
            artifact_id: Some("req-1".to_string()),
            path: Some(".lime/artifacts/report.md".to_string()),
            title: Some("Report".to_string()),
            kind: Some("document".to_string()),
            status: Some("ready".to_string()),
            content: Some("# Report".to_string()),
            content_status: ArtifactContentStatus::Available,
            metadata: Some(json!({ "version": 2 })),
        })
        .expect("serialize artifact summary");

        assert_eq!(
            value,
            json!({
                "artifactRef": "artifact-document:req-1",
                "eventId": "evt-artifact-1",
                "sequence": 7,
                "turnId": "turn_1",
                "artifactId": "req-1",
                "path": ".lime/artifacts/report.md",
                "title": "Report",
                "kind": "document",
                "status": "ready",
                "content": "# Report",
                "contentStatus": "available",
                "metadata": {
                    "version": 2
                }
            })
        );
    }

    #[test]
    fn evidence_export_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(7),
            METHOD_EVIDENCE_EXPORT,
            Some(
                serde_json::to_value(EvidenceExportParams {
                    session_id: "sess_1".to_string(),
                    turn_id: Some("turn_1".to_string()),
                    include_events: Some(true),
                    include_artifacts: Some(true),
                    include_evidence_pack: Some(true),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 7,
                "method": "evidence/export",
                "params": {
                    "sessionId": "sess_1",
                    "turnId": "turn_1",
                    "includeEvents": true,
                    "includeArtifacts": true,
                    "includeEvidencePack": true
                }
            })
        );
    }

    #[test]
    fn evidence_export_response_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(EvidenceExportResponse {
            session: AgentSession {
                session_id: "sess_1".to_string(),
                thread_id: "thread_1".to_string(),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: "2026-06-05T00:00:00.000Z".to_string(),
                updated_at: "2026-06-05T00:00:01.000Z".to_string(),
            },
            turns: vec![AgentTurn {
                turn_id: "turn_1".to_string(),
                session_id: "sess_1".to_string(),
                thread_id: "thread_1".to_string(),
                status: AgentTurnStatus::Accepted,
                started_at: Some("2026-06-05T00:00:01.000Z".to_string()),
                completed_at: None,
            }],
            events: vec![AgentEvent {
                event_id: "evt_1".to_string(),
                sequence: 1,
                session_id: "sess_1".to_string(),
                thread_id: Some("thread_1".to_string()),
                turn_id: Some("turn_1".to_string()),
                event_type: "artifact.snapshot".to_string(),
                timestamp: "2026-06-05T00:00:01.000Z".to_string(),
                payload: json!({
                    "artifactId": "artifact-report",
                    "path": ".app-server/artifacts/report.md"
                }),
            }],
            artifacts: vec![ArtifactSummary {
                artifact_ref: "artifact-report".to_string(),
                event_id: "evt_1".to_string(),
                sequence: 1,
                turn_id: Some("turn_1".to_string()),
                artifact_id: Some("artifact-report".to_string()),
                path: Some(".app-server/artifacts/report.md".to_string()),
                title: None,
                kind: None,
                status: None,
                content: None,
                content_status: ArtifactContentStatus::NotRequested,
                metadata: None,
            }],
            exported_at: "2026-06-05T00:00:02.000Z".to_string(),
            evidence_pack: Some(EvidencePackSummary {
                pack_relative_root: ".lime/harness/sessions/sess_1/evidence".to_string(),
                pack_absolute_root: Some(
                    "/workspace/.lime/harness/sessions/sess_1/evidence".to_string(),
                ),
                exported_at: "2026-06-05T00:00:03.000Z".to_string(),
                thread_status: "running".to_string(),
                latest_turn_status: Some("accepted".to_string()),
                turn_count: 1,
                item_count: 3,
                pending_request_count: 0,
                queued_turn_count: 0,
                recent_artifact_count: 1,
                known_gaps: vec!["gui_smoke_not_run".to_string()],
                observability_summary: Some(json!({
                    "schema_version": "runtime-evidence-pack.v1"
                })),
                completion_audit_summary: Some(json!({
                    "decision": "in_progress"
                })),
                artifacts: vec![EvidencePackArtifact {
                    kind: "summary".to_string(),
                    title: "Evidence Summary".to_string(),
                    relative_path: ".lime/harness/sessions/sess_1/evidence/summary.md".to_string(),
                    absolute_path: None,
                    bytes: 128,
                }],
            }),
        })
        .expect("serialize evidence export response");

        assert_eq!(
            value,
            json!({
                "session": {
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "appId": "content-studio",
                    "workspaceId": "workspace-main",
                    "status": "running",
                    "createdAt": "2026-06-05T00:00:00.000Z",
                    "updatedAt": "2026-06-05T00:00:01.000Z"
                },
                "turns": [{
                    "turnId": "turn_1",
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "status": "accepted",
                    "startedAt": "2026-06-05T00:00:01.000Z"
                }],
                "events": [{
                    "eventId": "evt_1",
                    "sequence": 1,
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "turnId": "turn_1",
                    "type": "artifact.snapshot",
                    "timestamp": "2026-06-05T00:00:01.000Z",
                    "payload": {
                        "artifactId": "artifact-report",
                        "path": ".app-server/artifacts/report.md"
                    }
                }],
                "artifacts": [{
                    "artifactRef": "artifact-report",
                    "eventId": "evt_1",
                    "sequence": 1,
                    "turnId": "turn_1",
                    "artifactId": "artifact-report",
                    "path": ".app-server/artifacts/report.md",
                    "contentStatus": "notRequested"
                }],
                "exportedAt": "2026-06-05T00:00:02.000Z",
                "evidencePack": {
                    "packRelativeRoot": ".lime/harness/sessions/sess_1/evidence",
                    "packAbsoluteRoot": "/workspace/.lime/harness/sessions/sess_1/evidence",
                    "exportedAt": "2026-06-05T00:00:03.000Z",
                    "threadStatus": "running",
                    "latestTurnStatus": "accepted",
                    "turnCount": 1,
                    "itemCount": 3,
                    "pendingRequestCount": 0,
                    "queuedTurnCount": 0,
                    "recentArtifactCount": 1,
                    "knownGaps": ["gui_smoke_not_run"],
                    "observabilitySummary": {
                        "schema_version": "runtime-evidence-pack.v1"
                    },
                    "completionAuditSummary": {
                        "decision": "in_progress"
                    },
                    "artifacts": [{
                        "kind": "summary",
                        "title": "Evidence Summary",
                        "relativePath": ".lime/harness/sessions/sess_1/evidence/summary.md",
                        "bytes": 128
                    }]
                }
            })
        );
    }

    #[test]
    fn agent_session_turn_start_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_AGENT_SESSION_TURN_START,
            Some(
                serde_json::to_value(AgentSessionTurnStartParams {
                    session_id: "sess_1".to_string(),
                    turn_id: Some("turn_1".to_string()),
                    input: AgentInput {
                        text: "hello".to_string(),
                        attachments: vec![AgentAttachment {
                            kind: "file".to_string(),
                            uri: Some("file:///draft.md".to_string()),
                            metadata: Some(json!({ "mimeType": "text/markdown" })),
                        }],
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: Some("draft.write".to_string()),
                        stream: true,
                        event_name: Some("agent_app_runtime:app:task".to_string()),
                        provider_preference: Some("deepseek".to_string()),
                        model_preference: Some("deepseek-v4-flash".to_string()),
                        metadata: Some(json!({ "taskId": "task-1" })),
                        queued_turn_id: Some("queued-turn-1".to_string()),
                        host_options: Some(json!({ "adapter": "desktop" })),
                    }),
                    queue_if_busy: true,
                    skip_pre_submit_resume: true,
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 2,
                "method": "agentSession/turn/start",
                "params": {
                    "sessionId": "sess_1",
                    "turnId": "turn_1",
                    "input": {
                        "text": "hello",
                        "attachments": [{
                            "kind": "file",
                            "uri": "file:///draft.md",
                            "metadata": {
                                "mimeType": "text/markdown"
                            }
                        }]
                    },
                    "runtimeOptions": {
                        "capabilityId": "draft.write",
                        "stream": true,
                        "eventName": "agent_app_runtime:app:task",
                        "providerPreference": "deepseek",
                        "modelPreference": "deepseek-v4-flash",
                        "metadata": {
                            "taskId": "task-1"
                        },
                        "queuedTurnId": "queued-turn-1",
                        "hostOptions": {
                            "adapter": "desktop"
                        }
                    },
                    "queueIfBusy": true,
                    "skipPreSubmitResume": true
                }
            })
        );
    }

    #[test]
    fn agent_session_turn_cancel_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(3),
            METHOD_AGENT_SESSION_TURN_CANCEL,
            Some(
                serde_json::to_value(AgentSessionTurnCancelParams {
                    session_id: "sess_1".to_string(),
                    turn_id: "turn_1".to_string(),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 3,
                "method": "agentSession/turn/cancel",
                "params": {
                    "sessionId": "sess_1",
                    "turnId": "turn_1"
                }
            })
        );
    }

    #[test]
    fn agent_session_action_replay_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(4),
            METHOD_AGENT_SESSION_ACTION_REPLAY,
            Some(
                serde_json::to_value(AgentSessionActionReplayParams {
                    session_id: "sess_1".to_string(),
                    request_id: "req_confirm_1".to_string(),
                })
                .expect("serialize replay params"),
            ),
        ))
        .expect("serialize replay request");

        assert_eq!(
            value,
            json!({
                "id": 4,
                "method": "agentSession/action/replay",
                "params": {
                    "sessionId": "sess_1",
                    "requestId": "req_confirm_1"
                }
            })
        );
    }

    #[test]
    fn agent_session_action_respond_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(5),
            METHOD_AGENT_SESSION_ACTION_RESPOND,
            Some(
                serde_json::to_value(AgentSessionActionRespondParams {
                    session_id: "sess_1".to_string(),
                    request_id: "req_confirm_1".to_string(),
                    action_type: AgentSessionActionType::ToolConfirmation,
                    confirmed: true,
                    response: Some("allow".to_string()),
                    user_data: Some(json!({ "choice": "allow" })),
                    metadata: Some(json!({ "source": "content-studio" })),
                    event_name: Some("agent_app_runtime:app:task".to_string()),
                    action_scope: Some(AgentSessionActionScope {
                        session_id: Some("sess_1".to_string()),
                        thread_id: Some("thread_1".to_string()),
                        turn_id: Some("turn_1".to_string()),
                    }),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 5,
                "method": "agentSession/action/respond",
                "params": {
                    "sessionId": "sess_1",
                    "requestId": "req_confirm_1",
                    "actionType": "tool_confirmation",
                    "confirmed": true,
                    "response": "allow",
                    "userData": {
                        "choice": "allow"
                    },
                    "metadata": {
                        "source": "content-studio"
                    },
                    "eventName": "agent_app_runtime:app:task",
                    "actionScope": {
                        "sessionId": "sess_1",
                        "threadId": "thread_1",
                        "turnId": "turn_1"
                    }
                }
            })
        );
    }

    #[test]
    fn agent_session_event_notification_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcNotification::new(
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
                        payload: json!({
                            "status": "running",
                            "delta": {
                                "text": "hello"
                            }
                        }),
                    },
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize notification");

        assert_eq!(
            value,
            json!({
                "method": "agentSession/event",
                "params": {
                    "event": {
                        "eventId": "evt_1",
                        "sequence": 1,
                        "sessionId": "sess_1",
                        "threadId": "thread_1",
                        "turnId": "turn_1",
                        "type": "turn.started",
                        "timestamp": "2026-06-04T00:00:00Z",
                        "payload": {
                            "status": "running",
                            "delta": {
                                "text": "hello"
                            }
                        }
                    }
                }
            })
        );
    }

    #[test]
    fn app_server_method_catalog_keeps_request_and_notification_methods_together() {
        let methods: Vec<&str> = APP_SERVER_METHODS.iter().map(|spec| spec.method).collect();
        assert_eq!(
            methods,
            vec![
                METHOD_INITIALIZE,
                METHOD_INITIALIZED,
                METHOD_CAPABILITY_LIST,
                METHOD_ARTIFACT_READ,
                METHOD_FILE_SYSTEM_LIST_DIRECTORY,
                METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
                METHOD_FILE_SYSTEM_CREATE_FILE,
                METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
                METHOD_FILE_SYSTEM_RENAME_FILE,
                METHOD_FILE_SYSTEM_DELETE_FILE,
                METHOD_EVIDENCE_EXPORT,
                METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
                METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT,
                METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
                METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
                METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE,
                METHOD_AGENT_SESSION_LIST,
                METHOD_AGENT_SESSION_UPDATE,
                METHOD_AGENT_SESSION_OBJECTIVE_READ,
                METHOD_AGENT_SESSION_OBJECTIVE_SET,
                METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
                METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
                METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
                METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
                METHOD_AGENT_SESSION_COMPACT,
                METHOD_AGENT_SESSION_THREAD_RESUME,
                METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE,
                METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE,
                METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST,
                METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET,
                METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF,
                METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE,
                METHOD_WORKSPACE_LIST,
                METHOD_WORKSPACE_READ,
                METHOD_WORKSPACE_BY_PATH_READ,
                METHOD_WORKSPACE_DEFAULT_READ,
                METHOD_WORKSPACE_DEFAULT_ENSURE,
                METHOD_WORKSPACE_PROJECTS_ROOT_READ,
                METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
                METHOD_WORKSPACE_ENSURE_READY,
                METHOD_SKILL_LIST,
                METHOD_SKILL_READ,
                METHOD_SKILL_LOCAL_DETAIL_INSPECT,
                METHOD_SKILL_LOCAL_RENAME,
                METHOD_SKILL_PACKAGE_LOCAL_INSPECT,
                METHOD_SKILL_PACKAGE_LOCAL_INSTALL,
                METHOD_SKILL_PACKAGE_LOCAL_REPLACE,
                METHOD_SKILL_PACKAGE_EXPORT,
                METHOD_SKILL_MARKETPLACE_INSTALL,
                METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL,
                METHOD_GATEWAY_CHANNEL_STATUS,
                METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
                METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
                METHOD_WORKSPACE_REGISTERED_SKILLS_LIST,
                METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT,
                METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD,
                METHOD_AGENT_APP_INSTALLED_SAVE,
                METHOD_AGENT_APP_INSTALLED_LIST,
                METHOD_AGENT_APP_INSTALLED_DISABLED_SET,
                METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
                METHOD_AGENT_APP_INSTALLED_UNINSTALL,
                METHOD_AGENT_APP_SHELL_PREPARE,
                METHOD_AGENT_APP_UI_RUNTIME_START,
                METHOD_AGENT_APP_UI_RUNTIME_STATUS,
                METHOD_AGENT_APP_UI_RUNTIME_STOP,
                METHOD_KNOWLEDGE_PACK_LIST,
                METHOD_KNOWLEDGE_PACK_READ,
                METHOD_KNOWLEDGE_SOURCE_IMPORT,
                METHOD_KNOWLEDGE_PACK_COMPILE,
                METHOD_KNOWLEDGE_PACK_DEFAULT_SET,
                METHOD_KNOWLEDGE_PACK_STATUS_UPDATE,
                METHOD_KNOWLEDGE_CONTEXT_RESOLVE,
                METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE,
                METHOD_AUTOMATION_SCHEDULER_CONFIG_READ,
                METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE,
                METHOD_AUTOMATION_SCHEDULER_STATUS,
                METHOD_AUTOMATION_JOB_LIST,
                METHOD_AUTOMATION_JOB_READ,
                METHOD_AUTOMATION_JOB_CREATE,
                METHOD_AUTOMATION_JOB_UPDATE,
                METHOD_AUTOMATION_JOB_DELETE,
                METHOD_AUTOMATION_JOB_RUN_NOW,
                METHOD_AUTOMATION_JOB_HEALTH,
                METHOD_AUTOMATION_JOB_RUN_HISTORY,
                METHOD_AUTOMATION_SCHEDULE_PREVIEW,
                METHOD_AUTOMATION_SCHEDULE_VALIDATE,
                METHOD_MCP_SERVER_LIST,
                METHOD_MCP_SERVER_STATUS_LIST,
                METHOD_MCP_SERVER_CREATE,
                METHOD_MCP_SERVER_UPDATE,
                METHOD_MCP_SERVER_DELETE,
                METHOD_MCP_SERVER_ENABLED_SET,
                METHOD_MCP_SERVER_IMPORT_FROM_APP,
                METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
                METHOD_MCP_SERVER_START,
                METHOD_MCP_SERVER_STOP,
                METHOD_MCP_TOOL_LIST,
                METHOD_MCP_TOOL_LIST_FOR_CONTEXT,
                METHOD_MCP_TOOL_SEARCH,
                METHOD_MCP_TOOL_CALL,
                METHOD_MCP_TOOL_CALL_WITH_CALLER,
                METHOD_MCP_PROMPT_LIST,
                METHOD_MCP_PROMPT_GET,
                METHOD_MCP_RESOURCE_LIST,
                METHOD_MCP_RESOURCE_READ,
                METHOD_PROJECT_MEMORY_READ,
                METHOD_USAGE_STATS_READ,
                METHOD_USAGE_STATS_MODEL_RANKING_LIST,
                METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
                METHOD_MODEL_LIST,
                METHOD_MODEL_PREFERENCES_LIST,
                METHOD_MODEL_SYNC_STATE_READ,
                METHOD_MODEL_PROVIDER_LIST,
                METHOD_MODEL_PROVIDER_CATALOG_LIST,
                METHOD_MODEL_PROVIDER_READ,
                METHOD_MODEL_PROVIDER_CREATE,
                METHOD_MODEL_PROVIDER_UPDATE,
                METHOD_MODEL_PROVIDER_DELETE,
                METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE,
                METHOD_MODEL_PROVIDER_CONFIG_EXPORT,
                METHOD_MODEL_PROVIDER_CONFIG_IMPORT,
                METHOD_MODEL_PROVIDER_TEST_CONNECTION,
                METHOD_MODEL_PROVIDER_TEST_CHAT,
                METHOD_MODEL_PROVIDER_FETCH_MODELS,
                METHOD_MODEL_PROVIDER_KEY_CREATE,
                METHOD_MODEL_PROVIDER_KEY_UPDATE,
                METHOD_MODEL_PROVIDER_KEY_DELETE,
                METHOD_MODEL_PROVIDER_KEY_NEXT,
                METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD,
                METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD,
                METHOD_MODEL_PROVIDER_UI_STATE_READ,
                METHOD_MODEL_PROVIDER_UI_STATE_WRITE,
                METHOD_MODEL_PROVIDER_ALIAS_READ,
                METHOD_MODEL_PROVIDER_ALIAS_LIST,
                METHOD_CONNECT_DEEP_LINK_RESOLVE,
                METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
                METHOD_CONNECT_RELAY_API_KEY_SAVE,
                METHOD_CONNECT_CALLBACK_SEND,
                METHOD_AGENT_SESSION_START,
                METHOD_AGENT_SESSION_READ,
                METHOD_AGENT_SESSION_TURN_START,
                METHOD_AGENT_SESSION_TURN_CANCEL,
                METHOD_AGENT_SESSION_ACTION_RESPOND,
                METHOD_AGENT_SESSION_EVENT,
            ]
        );

        let unique_methods = methods.iter().collect::<std::collections::HashSet<_>>();
        assert_eq!(unique_methods.len(), methods.len());
        assert!(is_app_server_request_method(METHOD_INITIALIZE));
        assert!(is_app_server_request_method(METHOD_EVIDENCE_EXPORT));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT
        ));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT
        ));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT
        ));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT
        ));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE
        ));
        assert!(is_app_server_request_method(METHOD_AGENT_SESSION_COMPACT));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_THREAD_RESUME
        ));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE
        ));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE
        ));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_TURN_START
        ));
        assert!(!is_app_server_request_method(METHOD_INITIALIZED));
        assert!(is_app_server_notification_method(METHOD_INITIALIZED));
        assert!(is_app_server_notification_method(
            METHOD_AGENT_SESSION_EVENT
        ));
        assert!(!is_app_server_notification_method(
            METHOD_AGENT_SESSION_START
        ));
    }
}
