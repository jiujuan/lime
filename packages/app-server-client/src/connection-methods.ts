import * as protocol from "./protocol.js";
import type { AppServerClient } from "./request-client.js";
import type {
  AppServerConnection,
  AppServerRequestOptions,
  AppServerRequestResult,
} from "./connection.js";

type ConnectionParamsMode = "none" | "required" | "optional-empty";

type ConnectionMethodSpec = {
  name: string;
  clientMethod: string;
  method: string;
  params: ConnectionParamsMode;
};

declare module "./connection.js" {
  interface AppServerConnection {
    startSession(
      params: protocol.AgentSessionStartParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentSessionStartResponse>>;
    listCapabilities(
      params?: protocol.CapabilityListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.CapabilityListResponse>>;
    listSessions(
      params?: protocol.AgentSessionListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentSessionListResponse>>;
    updateSession(
      params: protocol.AgentSessionUpdateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentSessionUpdateResponse>>;
    archiveManySessions(
      params: protocol.AgentSessionArchiveManyParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionArchiveManyResponse>
    >;
    deleteSession(
      params: protocol.AgentSessionDeleteParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentSessionDeleteResponse>>;
    readAgentSessionObjective(
      params: protocol.AgentSessionObjectiveReadParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionObjectiveReadResponse>
    >;
    setAgentSessionObjective(
      params: protocol.AgentSessionObjectiveSetParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionObjectiveSetResponse>
    >;
    updateAgentSessionObjectiveStatus(
      params: protocol.AgentSessionObjectiveStatusUpdateParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionObjectiveStatusUpdateResponse>
    >;
    clearAgentSessionObjective(
      params: protocol.AgentSessionObjectiveClearParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionObjectiveClearResponse>
    >;
    continueAgentSessionObjective(
      params: protocol.AgentSessionObjectiveContinueParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionObjectiveContinueResponse>
    >;
    auditAgentSessionObjective(
      params: protocol.AgentSessionObjectiveAuditParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionObjectiveAuditResponse>
    >;
    compactAgentSession(
      params: protocol.AgentSessionCompactParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentSessionCompactResponse>>;
    resumeAgentSessionThread(
      params: protocol.AgentSessionThreadResumeParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionThreadResumeResponse>
    >;
    removeAgentSessionQueuedTurn(
      params: protocol.AgentSessionQueuedTurnRemoveParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionQueuedTurnRemoveResponse>
    >;
    promoteAgentSessionQueuedTurn(
      params: protocol.AgentSessionQueuedTurnPromoteParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionQueuedTurnPromoteResponse>
    >;
    listAgentSessionFileCheckpoints(
      params: protocol.AgentSessionFileCheckpointListParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionFileCheckpointListResponse>
    >;
    getAgentSessionFileCheckpoint(
      params: protocol.AgentSessionFileCheckpointGetParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionFileCheckpointDetail>
    >;
    diffAgentSessionFileCheckpoint(
      params: protocol.AgentSessionFileCheckpointDiffParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionFileCheckpointDiffResponse>
    >;
    restoreAgentSessionFileCheckpoint(
      params: protocol.AgentSessionFileCheckpointRestoreParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionFileCheckpointRestoreResponse>
    >;
    getOrCreateSessionFile(
      params: protocol.SessionFileGetOrCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SessionFileMetaResponse>>;
    updateSessionFileMeta(
      params: protocol.SessionFileUpdateMetaParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SessionFileMetaResponse>>;
    saveSessionFile(
      params: protocol.SessionFileSaveParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SessionFileEntryResponse>>;
    readSessionFile(
      params: protocol.SessionFileIdParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SessionFileReadResponse>>;
    resolveSessionFilePath(
      params: protocol.SessionFileIdParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SessionFileResolvePathResponse>>;
    deleteSessionFile(
      params: protocol.SessionFileIdParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SessionFileMutationResponse>>;
    listSessionFiles(
      params: protocol.SessionFileGetOrCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SessionFileListResponse>>;
    listWorkspaces(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WorkspaceListResponse>>;
    readWorkspace(
      params: protocol.WorkspaceReadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WorkspaceReadResponse>>;
    updateWorkspace(
      params: protocol.WorkspaceUpdateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WorkspaceUpdateResponse>>;
    deleteWorkspace(
      params: protocol.WorkspaceDeleteParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WorkspaceDeleteResponse>>;
    ensureWorkspace(
      params: protocol.WorkspaceEnsureProjectParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WorkspaceEnsureProjectResponse>>;
    readWorkspaceByPath(
      params: protocol.WorkspacePathReadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WorkspaceReadResponse>>;
    readDefaultWorkspace(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WorkspaceReadResponse>>;
    ensureDefaultWorkspace(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WorkspaceReadResponse>>;
    readWorkspaceProjectsRoot(
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WorkspaceProjectsRootReadResponse>
    >;
    resolveWorkspaceProjectPath(
      params: protocol.WorkspaceProjectPathResolveParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WorkspaceProjectPathResolveResponse>
    >;
    ensureWorkspaceReady(
      params: protocol.WorkspaceEnsureParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WorkspaceEnsureReadyResponse>>;
    requestWorkspaceRightSurface(
      params: protocol.WorkspaceRightSurfaceRequestParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WorkspaceRightSurfaceRequestResponse>
    >;
    listWorkspaceRightSurfacePending(
      params?: protocol.WorkspaceRightSurfacePendingListParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WorkspaceRightSurfacePendingListResponse>
    >;
    consumeWorkspaceRightSurfacePending(
      params: protocol.WorkspaceRightSurfacePendingConsumeParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WorkspaceRightSurfacePendingConsumeResponse>
    >;
    dismissWorkspaceRightSurfacePending(
      params: protocol.WorkspaceRightSurfacePendingDismissParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WorkspaceRightSurfacePendingDismissResponse>
    >;
    listSkills(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillListResponse>>;
    readSkill(
      params: protocol.SkillReadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillReadResponse>>;
    listManagementSkills(
      params: protocol.SkillManagementListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillListResponse>>;
    installManagementSkill(
      params: protocol.SkillManagementInstallParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillManagementWriteResponse>>;
    uninstallManagementSkill(
      params: protocol.SkillManagementUninstallParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillManagementWriteResponse>>;
    listSkillRepositories(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillRepositoryListResponse>>;
    saveSkillRepository(
      params: protocol.SkillRepositorySaveParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillManagementWriteResponse>>;
    deleteSkillRepository(
      params: protocol.SkillRepositoryDeleteParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillManagementWriteResponse>>;
    refreshSkillCache(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillManagementWriteResponse>>;
    listInstalledSkillDirectories(
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.SkillInstalledDirectoriesListResponse>
    >;
    inspectLocalSkill(
      params: protocol.SkillLocalInspectParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillLocalInspectResponse>>;
    inspectLocalSkillPackage(
      params: protocol.SkillPackageLocalInspectParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.SkillPackageLocalInspectResponse>
    >;
    inspectLocalSkillDetail(
      params: protocol.SkillLocalDetailInspectParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.SkillLocalDetailInspectResponse>
    >;
    createSkillScaffold(
      params: protocol.SkillScaffoldCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillScaffoldCreateResponse>>;
    importLocalSkill(
      params: protocol.SkillLocalImportParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillLocalImportResponse>>;
    renameLocalSkill(
      params: protocol.SkillLocalRenameParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillLocalRenameResponse>>;
    inspectRemoteSkill(
      params: protocol.SkillRemoteInspectParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillRemoteInspectResponse>>;
    installLocalSkillPackage(
      params: protocol.SkillPackageLocalInstallParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.SkillPackageLocalInstallResponse>
    >;
    replaceLocalSkillPackage(
      params: protocol.SkillPackageLocalReplaceParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.SkillPackageLocalReplaceResponse>
    >;
    exportSkillPackage(
      params: protocol.SkillPackageExportParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillPackageExportResponse>>;
    installMarketplaceSkill(
      params: protocol.SkillMarketplaceInstallParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.SkillMarketplaceInstallResponse>
    >;
    installSkillFromDownload(
      params: protocol.SkillDownloadInstallParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SkillDownloadInstallResponse>>;
    listWorkspaceSkillBindings(
      params: protocol.WorkspaceSkillBindingsListParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WorkspaceSkillBindingsListResponse>
    >;
    listWorkspaceRegisteredSkills(
      params: protocol.WorkspaceRegisteredSkillsListParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WorkspaceRegisteredSkillsListResponse>
    >;
    inspectAgentAppLocalPackage(
      params: protocol.AgentAppLocalPackageInspectParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentAppLocalPackageInspectResponse>
    >;
    fetchAgentAppCloudPackage(
      params: protocol.AgentAppFetchCloudPackageParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentAppPackageCacheEntry>>;
    saveAgentAppInstalled(
      params: protocol.AgentAppInstalledSaveParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<unknown>>;
    listAgentAppInstalled(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentAppInstalledListResponse>>;
    setAgentAppInstalledDisabled(
      params: protocol.AgentAppInstalledDisabledSetParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentAppInstalledListResponse>>;
    previewAgentAppUninstall(
      params: protocol.AgentAppUninstallRehearsalParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentAppUninstallRehearsalResponse>
    >;
    uninstallAgentApp(
      params: protocol.AgentAppUninstallParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentAppUninstallResponse>>;
    prepareAgentAppShell(
      params: protocol.AgentAppShellPrepareParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentAppShellPrepareResponse>>;
    startAgentAppUiRuntime(
      params: protocol.AgentAppUiRuntimeStartParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentAppUiRuntimeStatusResponse>
    >;
    getAgentAppUiRuntimeStatus(
      params: protocol.AgentAppUiRuntimeStatusParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentAppUiRuntimeStatusResponse>
    >;
    stopAgentAppUiRuntime(
      params: protocol.AgentAppUiRuntimeStopParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentAppUiRuntimeStatusResponse>
    >;
    listKnowledgePacks(
      params: protocol.KnowledgeListPacksParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.KnowledgeListPacksResponse>>;
    readKnowledgePack(
      params: protocol.KnowledgeReadPackParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.KnowledgeReadPackResponse>>;
    importKnowledgeSource(
      params: protocol.KnowledgeImportSourceParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.KnowledgeImportSourceResponse>>;
    compileKnowledgePack(
      params: protocol.KnowledgeCompilePackParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.KnowledgeCompilePackResponse>>;
    setDefaultKnowledgePack(
      params: protocol.KnowledgeSetDefaultPackParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.KnowledgeSetDefaultPackResponse>
    >;
    updateKnowledgePackStatus(
      params: protocol.KnowledgeUpdatePackStatusParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.KnowledgeUpdatePackStatusResponse>
    >;
    resolveKnowledgeContext(
      params: protocol.KnowledgeResolveContextParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.KnowledgeContextResolutionResponse>
    >;
    validateKnowledgeContextRun(
      params: protocol.KnowledgeValidateContextRunParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.KnowledgeValidateContextRunResponse>
    >;
    listAutomationJobs(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AutomationJobListResponse>>;
    readAutomationSchedulerConfig(
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AutomationSchedulerConfigReadResponse>
    >;
    updateAutomationSchedulerConfig(
      params: protocol.AutomationSchedulerConfigUpdateParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AutomationSchedulerConfigUpdateResponse>
    >;
    readAutomationSchedulerStatus(
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AutomationSchedulerStatusResponse>
    >;
    readAutomationJob(
      params: protocol.AutomationJobIdParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AutomationJobReadResponse>>;
    createAutomationJob(
      params: protocol.AutomationJobCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AutomationJobWriteResponse>>;
    updateAutomationJob(
      params: protocol.AutomationJobUpdateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AutomationJobWriteResponse>>;
    deleteAutomationJob(
      params: protocol.AutomationJobIdParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AutomationJobDeleteResponse>>;
    runAutomationJobNow(
      params: protocol.AutomationJobIdParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AutomationJobRunNowResponse>>;
    readAutomationHealth(
      params?: protocol.AutomationJobHealthParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AutomationJobHealthResponse>>;
    readAutomationRunHistory(
      params: protocol.AutomationJobRunHistoryParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AutomationJobRunHistoryResponse>
    >;
    previewAutomationSchedule(
      params: protocol.AutomationScheduleParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AutomationSchedulePreviewResponse>
    >;
    validateAutomationSchedule(
      params: protocol.AutomationScheduleParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AutomationScheduleValidateResponse>
    >;
    listMcpServers(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerListResponse>>;
    listMcpServersWithStatus(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerStatusListResponse>>;
    createMcpServer(
      params: protocol.McpServerCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerListResponse>>;
    updateMcpServer(
      params: protocol.McpServerUpdateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerListResponse>>;
    deleteMcpServer(
      params: protocol.McpServerDeleteParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerListResponse>>;
    setMcpServerEnabled(
      params: protocol.McpServerEnabledSetParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerListResponse>>;
    importMcpServersFromApp(
      params: protocol.McpServerImportFromAppParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerImportFromAppResponse>>;
    syncAllMcpServersToLive(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerListResponse>>;
    loginMcpServerOauth(
      params: protocol.McpServerOauthLoginParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerOauthLoginResponse>>;
    startMcpServer(
      params: protocol.McpServerStartParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerLifecycleResponse>>;
    stopMcpServer(
      params: protocol.McpServerStopParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpServerLifecycleResponse>>;
    listMcpTools(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpToolListResponse>>;
    listMcpToolsForContext(
      params: protocol.McpToolListForContextParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpToolListResponse>>;
    searchMcpTools(
      params: protocol.McpToolSearchParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpToolListResponse>>;
    callMcpTool(
      params: protocol.McpToolCallParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpToolCallResponse>>;
    callMcpToolWithCaller(
      params: protocol.McpToolCallWithCallerParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpToolCallResponse>>;
    listMcpPrompts(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpPromptListResponse>>;
    getMcpPrompt(
      params: protocol.McpPromptGetParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpPromptGetResponse>>;
    listMcpResources(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpResourceListResponse>>;
    readMcpResource(
      params: protocol.McpResourceReadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.McpResourceReadResponse>>;
    subscribeMcpResource(
      params: protocol.McpResourceSubscribeParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.McpResourceSubscriptionResponse>
    >;
    unsubscribeMcpResource(
      params: protocol.McpResourceUnsubscribeParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.McpResourceSubscriptionResponse>
    >;
    readProjectMemory(
      params: protocol.ProjectMemoryReadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectMemoryReadResponse>>;
    listMemoryStore(
      params: protocol.MemoryStoreListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MemoryStoreListResponse>>;
    readMemoryStore(
      params: protocol.MemoryStoreReadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MemoryStoreReadResponse>>;
    searchMemoryStore(
      params: protocol.MemoryStoreSearchParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MemoryStoreSearchResponse>>;
    addMemoryStoreNote(
      params: protocol.MemoryStoreAddNoteParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MemoryStoreAddNoteResponse>>;
    consolidateMemoryStore(
      params: protocol.MemoryStoreConsolidateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MemoryStoreConsolidateResponse>>;
    listMemoryStoreReviewNotes(
      params: protocol.MemoryStoreReviewListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MemoryStoreReviewListResponse>>;
    resolveMemoryStoreReviewNote(
      params: protocol.MemoryStoreReviewResolveParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.MemoryStoreReviewResolveResponse>
    >;
    healthMemoryStore(
      params: protocol.MemoryStoreRootParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MemoryStoreHealthResponse>>;
    resetMemoryStore(
      params: protocol.MemoryStoreResetParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MemoryStoreResetResponse>>;
    rebuildMemoryStoreIndex(
      params: protocol.MemoryStoreRootParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.MemoryStoreIndexRebuildResponse>
    >;
    listLogs(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.LogListResponse>>;
    readPersistedLogTail(
      params: protocol.LogPersistedTailParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.LogPersistedTailResponse>>;
    clearLogs(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.LogClearResponse>>;
    clearDiagnosticLogHistory(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.LogClearResponse>>;
    readLogStorageDiagnostics(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.LogStorageDiagnosticsResponse>>;
    exportSupportBundle(
      params?: protocol.SupportBundleExportParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.SupportBundleExportResponse>>;
    readServerDiagnostics(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ServerDiagnosticsResponse>>;
    readWindowsStartupDiagnostics(
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WindowsStartupDiagnosticsResponse>
    >;
    listDiagnosticsTraces(
      params: protocol.DiagnosticsTraceListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.DiagnosticsTraceListResponse>>;
    readDiagnosticsTrace(
      params: protocol.DiagnosticsTraceReadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.DiagnosticsTraceReadResponse>>;
    exportDiagnosticsTrace(
      params: protocol.DiagnosticsTraceExportParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.DiagnosticsTraceExportResponse>>;
    readGatewayChannelStatus(
      params: protocol.GatewayChannelStatusParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GatewayChannelStatusResponse>>;
    startGatewayChannel(
      params: protocol.GatewayChannelStartParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GatewayChannelStatusResponse>>;
    stopGatewayChannel(
      params: protocol.GatewayChannelStopParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GatewayChannelStatusResponse>>;
    probeTelegramChannel(
      params?: protocol.ChannelProbeParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ChannelProbeResponse>>;
    probeFeishuChannel(
      params?: protocol.ChannelProbeParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ChannelProbeResponse>>;
    probeDiscordChannel(
      params?: protocol.ChannelProbeParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ChannelProbeResponse>>;
    probeWechatChannel(
      params?: protocol.ChannelProbeParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ChannelProbeResponse>>;
    startWechatChannelLogin(
      params?: protocol.WechatLoginStartParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WechatLoginStartResponse>>;
    waitWechatChannelLogin(
      params: protocol.WechatLoginWaitParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WechatLoginWaitResponse>>;
    listWechatChannelAccounts(
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WechatChannelAccountListResponse>
    >;
    removeWechatChannelAccount(
      params: protocol.WechatChannelAccountRemoveParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.WechatChannelAccountRemoveResponse>
    >;
    setWechatChannelRuntimeModel(
      params: protocol.WechatRuntimeModelSetParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.WechatRuntimeModelSetResponse>>;
    probeGatewayTunnel(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GatewayTunnelProbeResponse>>;
    detectGatewayTunnelCloudflared(
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.GatewayTunnelCloudflaredDetectResponse>
    >;
    installGatewayTunnelCloudflared(
      params: protocol.GatewayTunnelCloudflaredInstallParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.GatewayTunnelCloudflaredInstallResponse>
    >;
    createGatewayTunnel(
      params: protocol.GatewayTunnelCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GatewayTunnelCreateResponse>>;
    startGatewayTunnel(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GatewayTunnelStatusResponse>>;
    stopGatewayTunnel(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GatewayTunnelStatusResponse>>;
    restartGatewayTunnel(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GatewayTunnelStatusResponse>>;
    readGatewayTunnelStatus(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GatewayTunnelStatusResponse>>;
    syncGatewayTunnelWebhookUrl(
      params: protocol.GatewayTunnelSyncWebhookUrlParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.GatewayTunnelSyncWebhookUrlResponse>
    >;
    createImageMediaTaskArtifact(
      params: protocol.MediaTaskArtifactImageCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MediaTaskArtifactResponse>>;
    createAudioMediaTaskArtifact(
      params: protocol.MediaTaskArtifactAudioCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MediaTaskArtifactResponse>>;
    createVideoMediaTaskArtifact(
      params: protocol.MediaTaskArtifactVideoCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MediaTaskArtifactResponse>>;
    completeAudioMediaTaskArtifact(
      params: protocol.MediaTaskArtifactAudioCompleteParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MediaTaskArtifactResponse>>;
    getMediaTaskArtifact(
      params: protocol.MediaTaskArtifactLookupParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MediaTaskArtifactResponse>>;
    listMediaTaskArtifacts(
      params: protocol.MediaTaskArtifactListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MediaTaskArtifactListResponse>>;
    cancelMediaTaskArtifact(
      params: protocol.MediaTaskArtifactLookupParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.MediaTaskArtifactResponse>>;
    getGalleryMaterial(
      params: protocol.GalleryMaterialLookupParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GalleryMaterialResponse>>;
    createGalleryMaterialMetadata(
      params: protocol.GalleryMaterialMetadataCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.GalleryMaterialMetadataResponse>
    >;
    getGalleryMaterialMetadata(
      params: protocol.GalleryMaterialLookupParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.GalleryMaterialMetadataResponse>
    >;
    updateGalleryMaterialMetadata(
      params: protocol.GalleryMaterialMetadataUpdateParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.GalleryMaterialMetadataResponse>
    >;
    deleteGalleryMaterialMetadata(
      params: protocol.GalleryMaterialLookupParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GalleryMaterialDeleteResponse>>;
    listGalleryMaterialsByImageCategory(
      params: protocol.GalleryMaterialFilterParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GalleryMaterialListResponse>>;
    listGalleryMaterialsByLayoutCategory(
      params: protocol.GalleryMaterialFilterParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GalleryMaterialListResponse>>;
    listGalleryMaterialsByMood(
      params: protocol.GalleryMaterialFilterParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.GalleryMaterialListResponse>>;
    listProjectMaterials(
      params: protocol.ProjectMaterialListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectMaterialListResponse>>;
    getProjectMaterial(
      params: protocol.ProjectMaterialLookupParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectMaterialResponse>>;
    countProjectMaterials(
      params: protocol.ProjectMaterialListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectMaterialCountResponse>>;
    uploadProjectMaterial(
      params: protocol.ProjectMaterialUploadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectMaterialResponse>>;
    importProjectMaterialFromUrl(
      params: protocol.ProjectMaterialImportFromUrlParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectMaterialResponse>>;
    updateProjectMaterial(
      params: protocol.ProjectMaterialUpdateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectMaterialResponse>>;
    deleteProjectMaterial(
      params: protocol.ProjectMaterialLookupParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectMaterialDeleteResponse>>;
    readProjectMaterialContent(
      params: protocol.ProjectMaterialLookupParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectMaterialContentResponse>>;
    listVoiceAsrCredentials(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.VoiceAsrCredentialListResponse>>;
    createVoiceAsrCredential(
      params: protocol.VoiceAsrCredentialCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.VoiceAsrCredentialWriteResponse>
    >;
    updateVoiceAsrCredential(
      params: protocol.VoiceAsrCredentialUpdateParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.VoiceAsrCredentialMutationResponse>
    >;
    deleteVoiceAsrCredential(
      params: protocol.VoiceAsrCredentialIdParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.VoiceAsrCredentialMutationResponse>
    >;
    setDefaultVoiceAsrCredential(
      params: protocol.VoiceAsrCredentialIdParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.VoiceAsrCredentialMutationResponse>
    >;
    testVoiceAsrCredential(
      params: protocol.VoiceAsrCredentialIdParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.VoiceAsrCredentialTestResponse>>;
    listVoiceInstructions(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.VoiceInstructionListResponse>>;
    saveVoiceInstruction(
      params: protocol.VoiceInstructionSaveParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.VoiceInstructionMutationResponse>
    >;
    deleteVoiceInstruction(
      params: protocol.VoiceInstructionIdParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.VoiceInstructionMutationResponse>
    >;
    setDefaultVoiceModel(
      params: protocol.VoiceModelDefaultSetParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.VoiceModelDefaultSetResponse>>;
    testTranscribeVoiceModelFile(
      params: protocol.VoiceModelTestTranscribeFileParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.VoiceModelTestTranscribeFileResponse>
    >;
    readUsageStats(
      params: protocol.UsageStatsRangeParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.UsageStatsReadResponse>>;
    listUsageStatsModelRanking(
      params: protocol.UsageStatsRangeParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.UsageStatsModelRankingListResponse>
    >;
    listUsageStatsDailyTrends(
      params: protocol.UsageStatsRangeParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.UsageStatsDailyTrendsListResponse>
    >;
    readArtifacts(
      params: protocol.ArtifactReadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ArtifactReadResponse>>;
    listDirectory(
      params: protocol.FileSystemListDirectoryParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.FileSystemDirectoryListing>>;
    readFilePreview(
      params: protocol.FileSystemReadFilePreviewParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.FileSystemFilePreview>>;
    createFile(
      params: protocol.FileSystemCreateFileParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.FileSystemMutationResponse>>;
    createDirectory(
      params: protocol.FileSystemCreateDirectoryParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.FileSystemMutationResponse>>;
    renameFile(
      params: protocol.FileSystemRenameFileParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.FileSystemMutationResponse>>;
    deleteFile(
      params: protocol.FileSystemDeleteFileParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.FileSystemMutationResponse>>;
    readProjectGitStatus(
      params: protocol.ProjectGitStatusParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectGitStatusResponse>>;
    readProjectGitDiff(
      params: protocol.ProjectGitDiffParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectGitDiffResponse>>;
    listProjectGitCommits(
      params: protocol.ProjectGitCommitListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectGitCommitListResponse>>;
    checkoutProjectGitBranch(
      params: protocol.ProjectGitBranchCheckoutParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ProjectGitBranchCheckoutResponse>
    >;
    createProjectGitBranch(
      params: protocol.ProjectGitBranchCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectGitBranchCreateResponse>>;
    createProjectGitWorktree(
      params: protocol.ProjectGitWorktreeCreateParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ProjectGitWorktreeCreateResponse>
    >;
    startProjectShellSession(
      params: protocol.ProjectShellSessionStartParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ProjectShellSessionStartResponse>
    >;
    writeProjectShellSession(
      params: protocol.ProjectShellSessionWriteParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectShellEmptyResponse>>;
    resizeProjectShellSession(
      params: protocol.ProjectShellSessionResizeParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectShellEmptyResponse>>;
    killProjectShellSession(
      params: protocol.ProjectShellSessionKillParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ProjectShellEmptyResponse>>;
    drainProjectShellSessionEvents(
      params?: protocol.ProjectShellSessionDrainEventsParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ProjectShellSessionDrainEventsResponse>
    >;
    startExecutionProcess(
      params: protocol.ExecutionProcessStartParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ExecutionProcessStartResponse>>;
    writeExecutionProcessStdin(
      params: protocol.ExecutionProcessWriteStdinParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ExecutionProcessEmptyResponse>>;
    interruptExecutionProcess(
      params: protocol.ExecutionProcessIdParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ExecutionProcessStatusResponse>>;
    terminateExecutionProcess(
      params: protocol.ExecutionProcessIdParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ExecutionProcessStatusResponse>>;
    readExecutionProcessStatus(
      params: protocol.ExecutionProcessIdParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ExecutionProcessStatusResponse>>;
    drainExecutionProcessOutput(
      params?: protocol.ExecutionProcessDrainOutputParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ExecutionProcessDrainOutputResponse>
    >;
    exportEvidence(
      params: protocol.EvidenceExportParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.EvidenceExportResponse>>;
    exportHandoffBundle(
      params: protocol.AgentSessionHandoffBundleExportParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionHandoffBundleExportResponse>
    >;
    exportReplayCase(
      params: protocol.AgentSessionReplayCaseExportParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionReplayCaseExportResponse>
    >;
    exportAnalysisHandoff(
      params: protocol.AgentSessionAnalysisHandoffExportParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionAnalysisHandoffExportResponse>
    >;
    exportReviewDecisionTemplate(
      params: protocol.AgentSessionReviewDecisionTemplateExportParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionReviewDecisionTemplateExportResponse>
    >;
    saveReviewDecision(
      params: protocol.AgentSessionReviewDecisionSaveParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionReviewDecisionTemplateExportResponse>
    >;
    readSession(
      params: protocol.AgentSessionReadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentSessionReadResponse>>;
    readAgentSessionToolInventory(
      params?: protocol.AgentSessionToolInventoryReadParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionToolInventoryReadResponse>
    >;
    listModels(
      params?: protocol.ModelListParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ModelListResponse>>;
    listModelPreferences(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ModelPreferencesListResponse>>;
    readModelSyncState(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ModelSyncStateReadResponse>>;
    listModelProviders(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ModelProviderListResponse>>;
    listModelProviderCatalog(
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ModelProviderCatalogListResponse>
    >;
    readModelProviderAlias(
      params: protocol.ModelProviderAliasReadParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ModelProviderAliasReadResponse>>;
    listModelProviderAliases(
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ModelProviderAliasListResponse>>;
    resolveConnectDeepLink(
      params: protocol.ConnectDeepLinkResolveParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ConnectDeepLinkResolveResponse>>;
    resolveConnectOpenDeepLink(
      params: protocol.ConnectOpenDeepLinkResolveParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ConnectOpenDeepLinkResolveResponse>
    >;
    saveConnectRelayApiKey(
      params: protocol.ConnectRelayApiKeySaveParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ConnectRelayApiKeySaveResponse>>;
    sendConnectCallback(
      params: protocol.ConnectCallbackSendParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.ConnectCallbackSendResponse>>;
    scanConversationImportSource(
      params?: protocol.ConversationImportSourceScanParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ConversationImportSourceScanResponse>
    >;
    previewConversationImportThread(
      params: protocol.ConversationImportThreadPreviewParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ConversationImportThreadPreviewResponse>
    >;
    commitConversationImportThread(
      params: protocol.ConversationImportThreadCommitParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ConversationImportThreadCommitResponse>
    >;
    readConversationImportRuntimeEvents(
      params: protocol.ConversationImportThreadRuntimeEventsReadParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.ConversationImportThreadRuntimeEventsReadResponse>
    >;
    startTurn(
      params: protocol.AgentSessionTurnStartParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentSessionTurnStartResponse>>;
    cancelTurn(
      params: protocol.AgentSessionTurnCancelParams,
      options?: AppServerRequestOptions,
    ): Promise<AppServerRequestResult<protocol.AgentSessionTurnCancelResponse>>;
    replayAction(
      params: protocol.AgentSessionActionReplayParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionActionReplayResponse>
    >;
    respondAction(
      params: protocol.AgentSessionActionRespondParams,
      options?: AppServerRequestOptions,
    ): Promise<
      AppServerRequestResult<protocol.AgentSessionActionRespondResponse>
    >;
  }
}

const CONNECTION_METHODS: readonly ConnectionMethodSpec[] = [
  {
    name: "startSession",
    clientMethod: "startSession",
    method: protocol.METHOD_AGENT_SESSION_START,
    params: "required",
  },
  {
    name: "listCapabilities",
    clientMethod: "listCapabilities",
    method: protocol.METHOD_CAPABILITY_LIST,
    params: "optional-empty",
  },
  {
    name: "listSessions",
    clientMethod: "listSessions",
    method: protocol.METHOD_AGENT_SESSION_LIST,
    params: "optional-empty",
  },
  {
    name: "updateSession",
    clientMethod: "updateSession",
    method: protocol.METHOD_AGENT_SESSION_UPDATE,
    params: "required",
  },
  {
    name: "archiveManySessions",
    clientMethod: "archiveManySessions",
    method: protocol.METHOD_AGENT_SESSION_ARCHIVE_MANY,
    params: "required",
  },
  {
    name: "deleteSession",
    clientMethod: "deleteSession",
    method: protocol.METHOD_AGENT_SESSION_DELETE,
    params: "required",
  },
  {
    name: "readAgentSessionObjective",
    clientMethod: "readAgentSessionObjective",
    method: protocol.METHOD_AGENT_SESSION_OBJECTIVE_READ,
    params: "required",
  },
  {
    name: "setAgentSessionObjective",
    clientMethod: "setAgentSessionObjective",
    method: protocol.METHOD_AGENT_SESSION_OBJECTIVE_SET,
    params: "required",
  },
  {
    name: "updateAgentSessionObjectiveStatus",
    clientMethod: "updateAgentSessionObjectiveStatus",
    method: protocol.METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
    params: "required",
  },
  {
    name: "clearAgentSessionObjective",
    clientMethod: "clearAgentSessionObjective",
    method: protocol.METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
    params: "required",
  },
  {
    name: "continueAgentSessionObjective",
    clientMethod: "continueAgentSessionObjective",
    method: protocol.METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
    params: "required",
  },
  {
    name: "auditAgentSessionObjective",
    clientMethod: "auditAgentSessionObjective",
    method: protocol.METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
    params: "required",
  },
  {
    name: "compactAgentSession",
    clientMethod: "compactAgentSession",
    method: protocol.METHOD_AGENT_SESSION_COMPACT,
    params: "required",
  },
  {
    name: "resumeAgentSessionThread",
    clientMethod: "resumeAgentSessionThread",
    method: protocol.METHOD_AGENT_SESSION_THREAD_RESUME,
    params: "required",
  },
  {
    name: "removeAgentSessionQueuedTurn",
    clientMethod: "removeAgentSessionQueuedTurn",
    method: protocol.METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE,
    params: "required",
  },
  {
    name: "promoteAgentSessionQueuedTurn",
    clientMethod: "promoteAgentSessionQueuedTurn",
    method: protocol.METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE,
    params: "required",
  },
  {
    name: "listAgentSessionFileCheckpoints",
    clientMethod: "listAgentSessionFileCheckpoints",
    method: protocol.METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST,
    params: "required",
  },
  {
    name: "getAgentSessionFileCheckpoint",
    clientMethod: "getAgentSessionFileCheckpoint",
    method: protocol.METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET,
    params: "required",
  },
  {
    name: "diffAgentSessionFileCheckpoint",
    clientMethod: "diffAgentSessionFileCheckpoint",
    method: protocol.METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF,
    params: "required",
  },
  {
    name: "restoreAgentSessionFileCheckpoint",
    clientMethod: "restoreAgentSessionFileCheckpoint",
    method: protocol.METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE,
    params: "required",
  },
  {
    name: "getOrCreateSessionFile",
    clientMethod: "getOrCreateSessionFile",
    method: protocol.METHOD_SESSION_FILE_GET_OR_CREATE,
    params: "required",
  },
  {
    name: "updateSessionFileMeta",
    clientMethod: "updateSessionFileMeta",
    method: protocol.METHOD_SESSION_FILE_UPDATE_META,
    params: "required",
  },
  {
    name: "saveSessionFile",
    clientMethod: "saveSessionFile",
    method: protocol.METHOD_SESSION_FILE_SAVE,
    params: "required",
  },
  {
    name: "readSessionFile",
    clientMethod: "readSessionFile",
    method: protocol.METHOD_SESSION_FILE_READ,
    params: "required",
  },
  {
    name: "resolveSessionFilePath",
    clientMethod: "resolveSessionFilePath",
    method: protocol.METHOD_SESSION_FILE_RESOLVE_PATH,
    params: "required",
  },
  {
    name: "deleteSessionFile",
    clientMethod: "deleteSessionFile",
    method: protocol.METHOD_SESSION_FILE_DELETE,
    params: "required",
  },
  {
    name: "listSessionFiles",
    clientMethod: "listSessionFiles",
    method: protocol.METHOD_SESSION_FILE_LIST,
    params: "required",
  },
  {
    name: "listWorkspaces",
    clientMethod: "listWorkspaces",
    method: protocol.METHOD_WORKSPACE_LIST,
    params: "none",
  },
  {
    name: "readWorkspace",
    clientMethod: "readWorkspace",
    method: protocol.METHOD_WORKSPACE_READ,
    params: "required",
  },
  {
    name: "updateWorkspace",
    clientMethod: "updateWorkspace",
    method: protocol.METHOD_WORKSPACE_UPDATE,
    params: "required",
  },
  {
    name: "deleteWorkspace",
    clientMethod: "deleteWorkspace",
    method: protocol.METHOD_WORKSPACE_DELETE,
    params: "required",
  },
  {
    name: "ensureWorkspace",
    clientMethod: "ensureWorkspace",
    method: protocol.METHOD_WORKSPACE_ENSURE,
    params: "required",
  },
  {
    name: "readWorkspaceByPath",
    clientMethod: "readWorkspaceByPath",
    method: protocol.METHOD_WORKSPACE_BY_PATH_READ,
    params: "required",
  },
  {
    name: "readDefaultWorkspace",
    clientMethod: "readDefaultWorkspace",
    method: protocol.METHOD_WORKSPACE_DEFAULT_READ,
    params: "none",
  },
  {
    name: "ensureDefaultWorkspace",
    clientMethod: "ensureDefaultWorkspace",
    method: protocol.METHOD_WORKSPACE_DEFAULT_ENSURE,
    params: "none",
  },
  {
    name: "readWorkspaceProjectsRoot",
    clientMethod: "readWorkspaceProjectsRoot",
    method: protocol.METHOD_WORKSPACE_PROJECTS_ROOT_READ,
    params: "none",
  },
  {
    name: "resolveWorkspaceProjectPath",
    clientMethod: "resolveWorkspaceProjectPath",
    method: protocol.METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
    params: "required",
  },
  {
    name: "ensureWorkspaceReady",
    clientMethod: "ensureWorkspaceReady",
    method: protocol.METHOD_WORKSPACE_ENSURE_READY,
    params: "required",
  },
  {
    name: "requestWorkspaceRightSurface",
    clientMethod: "requestWorkspaceRightSurface",
    method: protocol.METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
    params: "required",
  },
  {
    name: "listWorkspaceRightSurfacePending",
    clientMethod: "listWorkspaceRightSurfacePending",
    method: protocol.METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
    params: "optional-empty",
  },
  {
    name: "consumeWorkspaceRightSurfacePending",
    clientMethod: "consumeWorkspaceRightSurfacePending",
    method: protocol.METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CONSUME,
    params: "required",
  },
  {
    name: "dismissWorkspaceRightSurfacePending",
    clientMethod: "dismissWorkspaceRightSurfacePending",
    method: protocol.METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_DISMISS,
    params: "required",
  },
  {
    name: "listSkills",
    clientMethod: "listSkills",
    method: protocol.METHOD_SKILL_LIST,
    params: "none",
  },
  {
    name: "readSkill",
    clientMethod: "readSkill",
    method: protocol.METHOD_SKILL_READ,
    params: "required",
  },
  {
    name: "listManagementSkills",
    clientMethod: "listManagementSkills",
    method: protocol.METHOD_SKILL_MANAGEMENT_LIST,
    params: "required",
  },
  {
    name: "installManagementSkill",
    clientMethod: "installManagementSkill",
    method: protocol.METHOD_SKILL_MANAGEMENT_INSTALL,
    params: "required",
  },
  {
    name: "uninstallManagementSkill",
    clientMethod: "uninstallManagementSkill",
    method: protocol.METHOD_SKILL_MANAGEMENT_UNINSTALL,
    params: "required",
  },
  {
    name: "listSkillRepositories",
    clientMethod: "listSkillRepositories",
    method: protocol.METHOD_SKILL_REPOSITORY_LIST,
    params: "none",
  },
  {
    name: "saveSkillRepository",
    clientMethod: "saveSkillRepository",
    method: protocol.METHOD_SKILL_REPOSITORY_SAVE,
    params: "required",
  },
  {
    name: "deleteSkillRepository",
    clientMethod: "deleteSkillRepository",
    method: protocol.METHOD_SKILL_REPOSITORY_DELETE,
    params: "required",
  },
  {
    name: "refreshSkillCache",
    clientMethod: "refreshSkillCache",
    method: protocol.METHOD_SKILL_CACHE_REFRESH,
    params: "none",
  },
  {
    name: "listInstalledSkillDirectories",
    clientMethod: "listInstalledSkillDirectories",
    method: protocol.METHOD_SKILL_INSTALLED_DIRECTORIES_LIST,
    params: "none",
  },
  {
    name: "inspectLocalSkill",
    clientMethod: "inspectLocalSkill",
    method: protocol.METHOD_SKILL_LOCAL_INSPECT,
    params: "required",
  },
  {
    name: "inspectLocalSkillPackage",
    clientMethod: "inspectLocalSkillPackage",
    method: protocol.METHOD_SKILL_PACKAGE_LOCAL_INSPECT,
    params: "required",
  },
  {
    name: "inspectLocalSkillDetail",
    clientMethod: "inspectLocalSkillDetail",
    method: protocol.METHOD_SKILL_LOCAL_DETAIL_INSPECT,
    params: "required",
  },
  {
    name: "createSkillScaffold",
    clientMethod: "createSkillScaffold",
    method: protocol.METHOD_SKILL_LOCAL_SCAFFOLD_CREATE,
    params: "required",
  },
  {
    name: "importLocalSkill",
    clientMethod: "importLocalSkill",
    method: protocol.METHOD_SKILL_LOCAL_IMPORT,
    params: "required",
  },
  {
    name: "renameLocalSkill",
    clientMethod: "renameLocalSkill",
    method: protocol.METHOD_SKILL_LOCAL_RENAME,
    params: "required",
  },
  {
    name: "inspectRemoteSkill",
    clientMethod: "inspectRemoteSkill",
    method: protocol.METHOD_SKILL_REMOTE_INSPECT,
    params: "required",
  },
  {
    name: "installLocalSkillPackage",
    clientMethod: "installLocalSkillPackage",
    method: protocol.METHOD_SKILL_PACKAGE_LOCAL_INSTALL,
    params: "required",
  },
  {
    name: "replaceLocalSkillPackage",
    clientMethod: "replaceLocalSkillPackage",
    method: protocol.METHOD_SKILL_PACKAGE_LOCAL_REPLACE,
    params: "required",
  },
  {
    name: "exportSkillPackage",
    clientMethod: "exportSkillPackage",
    method: protocol.METHOD_SKILL_PACKAGE_EXPORT,
    params: "required",
  },
  {
    name: "installMarketplaceSkill",
    clientMethod: "installMarketplaceSkill",
    method: protocol.METHOD_SKILL_MARKETPLACE_INSTALL,
    params: "required",
  },
  {
    name: "installSkillFromDownload",
    clientMethod: "installSkillFromDownload",
    method: protocol.METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL,
    params: "required",
  },
  {
    name: "listWorkspaceSkillBindings",
    clientMethod: "listWorkspaceSkillBindings",
    method: protocol.METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
    params: "required",
  },
  {
    name: "listWorkspaceRegisteredSkills",
    clientMethod: "listWorkspaceRegisteredSkills",
    method: protocol.METHOD_WORKSPACE_REGISTERED_SKILLS_LIST,
    params: "required",
  },
  {
    name: "inspectAgentAppLocalPackage",
    clientMethod: "inspectAgentAppLocalPackage",
    method: protocol.METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT,
    params: "required",
  },
  {
    name: "fetchAgentAppCloudPackage",
    clientMethod: "fetchAgentAppCloudPackage",
    method: protocol.METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD,
    params: "required",
  },
  {
    name: "saveAgentAppInstalled",
    clientMethod: "saveAgentAppInstalled",
    method: protocol.METHOD_AGENT_APP_INSTALLED_SAVE,
    params: "required",
  },
  {
    name: "listAgentAppInstalled",
    clientMethod: "listAgentAppInstalled",
    method: protocol.METHOD_AGENT_APP_INSTALLED_LIST,
    params: "none",
  },
  {
    name: "setAgentAppInstalledDisabled",
    clientMethod: "setAgentAppInstalledDisabled",
    method: protocol.METHOD_AGENT_APP_INSTALLED_DISABLED_SET,
    params: "required",
  },
  {
    name: "previewAgentAppUninstall",
    clientMethod: "previewAgentAppUninstall",
    method: protocol.METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
    params: "required",
  },
  {
    name: "uninstallAgentApp",
    clientMethod: "uninstallAgentApp",
    method: protocol.METHOD_AGENT_APP_INSTALLED_UNINSTALL,
    params: "required",
  },
  {
    name: "listAgentAppHostLifecycle",
    clientMethod: "listAgentAppHostLifecycle",
    method: protocol.METHOD_AGENT_APP_HOST_LIFECYCLE_LIST,
    params: "none",
  },
  {
    name: "prepareAgentAppShell",
    clientMethod: "prepareAgentAppShell",
    method: protocol.METHOD_AGENT_APP_SHELL_PREPARE,
    params: "required",
  },
  {
    name: "startAgentAppUiRuntime",
    clientMethod: "startAgentAppUiRuntime",
    method: protocol.METHOD_AGENT_APP_UI_RUNTIME_START,
    params: "required",
  },
  {
    name: "getAgentAppUiRuntimeStatus",
    clientMethod: "getAgentAppUiRuntimeStatus",
    method: protocol.METHOD_AGENT_APP_UI_RUNTIME_STATUS,
    params: "required",
  },
  {
    name: "stopAgentAppUiRuntime",
    clientMethod: "stopAgentAppUiRuntime",
    method: protocol.METHOD_AGENT_APP_UI_RUNTIME_STOP,
    params: "required",
  },
  {
    name: "listKnowledgePacks",
    clientMethod: "listKnowledgePacks",
    method: protocol.METHOD_KNOWLEDGE_PACK_LIST,
    params: "required",
  },
  {
    name: "readKnowledgePack",
    clientMethod: "readKnowledgePack",
    method: protocol.METHOD_KNOWLEDGE_PACK_READ,
    params: "required",
  },
  {
    name: "importKnowledgeSource",
    clientMethod: "importKnowledgeSource",
    method: protocol.METHOD_KNOWLEDGE_SOURCE_IMPORT,
    params: "required",
  },
  {
    name: "compileKnowledgePack",
    clientMethod: "compileKnowledgePack",
    method: protocol.METHOD_KNOWLEDGE_PACK_COMPILE,
    params: "required",
  },
  {
    name: "setDefaultKnowledgePack",
    clientMethod: "setDefaultKnowledgePack",
    method: protocol.METHOD_KNOWLEDGE_PACK_DEFAULT_SET,
    params: "required",
  },
  {
    name: "updateKnowledgePackStatus",
    clientMethod: "updateKnowledgePackStatus",
    method: protocol.METHOD_KNOWLEDGE_PACK_STATUS_UPDATE,
    params: "required",
  },
  {
    name: "resolveKnowledgeContext",
    clientMethod: "resolveKnowledgeContext",
    method: protocol.METHOD_KNOWLEDGE_CONTEXT_RESOLVE,
    params: "required",
  },
  {
    name: "validateKnowledgeContextRun",
    clientMethod: "validateKnowledgeContextRun",
    method: protocol.METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE,
    params: "required",
  },
  {
    name: "listAutomationJobs",
    clientMethod: "listAutomationJobs",
    method: protocol.METHOD_AUTOMATION_JOB_LIST,
    params: "none",
  },
  {
    name: "readAutomationSchedulerConfig",
    clientMethod: "readAutomationSchedulerConfig",
    method: protocol.METHOD_AUTOMATION_SCHEDULER_CONFIG_READ,
    params: "none",
  },
  {
    name: "updateAutomationSchedulerConfig",
    clientMethod: "updateAutomationSchedulerConfig",
    method: protocol.METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE,
    params: "required",
  },
  {
    name: "readAutomationSchedulerStatus",
    clientMethod: "readAutomationSchedulerStatus",
    method: protocol.METHOD_AUTOMATION_SCHEDULER_STATUS,
    params: "none",
  },
  {
    name: "readAutomationJob",
    clientMethod: "readAutomationJob",
    method: protocol.METHOD_AUTOMATION_JOB_READ,
    params: "required",
  },
  {
    name: "createAutomationJob",
    clientMethod: "createAutomationJob",
    method: protocol.METHOD_AUTOMATION_JOB_CREATE,
    params: "required",
  },
  {
    name: "updateAutomationJob",
    clientMethod: "updateAutomationJob",
    method: protocol.METHOD_AUTOMATION_JOB_UPDATE,
    params: "required",
  },
  {
    name: "deleteAutomationJob",
    clientMethod: "deleteAutomationJob",
    method: protocol.METHOD_AUTOMATION_JOB_DELETE,
    params: "required",
  },
  {
    name: "runAutomationJobNow",
    clientMethod: "runAutomationJobNow",
    method: protocol.METHOD_AUTOMATION_JOB_RUN_NOW,
    params: "required",
  },
  {
    name: "readAutomationHealth",
    clientMethod: "readAutomationHealth",
    method: protocol.METHOD_AUTOMATION_JOB_HEALTH,
    params: "optional-empty",
  },
  {
    name: "readAutomationRunHistory",
    clientMethod: "readAutomationRunHistory",
    method: protocol.METHOD_AUTOMATION_JOB_RUN_HISTORY,
    params: "required",
  },
  {
    name: "previewAutomationSchedule",
    clientMethod: "previewAutomationSchedule",
    method: protocol.METHOD_AUTOMATION_SCHEDULE_PREVIEW,
    params: "required",
  },
  {
    name: "validateAutomationSchedule",
    clientMethod: "validateAutomationSchedule",
    method: protocol.METHOD_AUTOMATION_SCHEDULE_VALIDATE,
    params: "required",
  },
  {
    name: "listMcpServers",
    clientMethod: "listMcpServers",
    method: protocol.METHOD_MCP_SERVER_LIST,
    params: "none",
  },
  {
    name: "listMcpServersWithStatus",
    clientMethod: "listMcpServersWithStatus",
    method: protocol.METHOD_MCP_SERVER_STATUS_LIST,
    params: "none",
  },
  {
    name: "createMcpServer",
    clientMethod: "createMcpServer",
    method: protocol.METHOD_MCP_SERVER_CREATE,
    params: "required",
  },
  {
    name: "updateMcpServer",
    clientMethod: "updateMcpServer",
    method: protocol.METHOD_MCP_SERVER_UPDATE,
    params: "required",
  },
  {
    name: "deleteMcpServer",
    clientMethod: "deleteMcpServer",
    method: protocol.METHOD_MCP_SERVER_DELETE,
    params: "required",
  },
  {
    name: "setMcpServerEnabled",
    clientMethod: "setMcpServerEnabled",
    method: protocol.METHOD_MCP_SERVER_ENABLED_SET,
    params: "required",
  },
  {
    name: "importMcpServersFromApp",
    clientMethod: "importMcpServersFromApp",
    method: protocol.METHOD_MCP_SERVER_IMPORT_FROM_APP,
    params: "required",
  },
  {
    name: "syncAllMcpServersToLive",
    clientMethod: "syncAllMcpServersToLive",
    method: protocol.METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
    params: "none",
  },
  {
    name: "loginMcpServerOauth",
    clientMethod: "loginMcpServerOauth",
    method: protocol.METHOD_MCP_SERVER_OAUTH_LOGIN,
    params: "required",
  },
  {
    name: "startMcpServer",
    clientMethod: "startMcpServer",
    method: protocol.METHOD_MCP_SERVER_START,
    params: "required",
  },
  {
    name: "stopMcpServer",
    clientMethod: "stopMcpServer",
    method: protocol.METHOD_MCP_SERVER_STOP,
    params: "required",
  },
  {
    name: "listMcpTools",
    clientMethod: "listMcpTools",
    method: protocol.METHOD_MCP_TOOL_LIST,
    params: "none",
  },
  {
    name: "listMcpToolsForContext",
    clientMethod: "listMcpToolsForContext",
    method: protocol.METHOD_MCP_TOOL_LIST_FOR_CONTEXT,
    params: "required",
  },
  {
    name: "searchMcpTools",
    clientMethod: "searchMcpTools",
    method: protocol.METHOD_MCP_TOOL_SEARCH,
    params: "required",
  },
  {
    name: "callMcpTool",
    clientMethod: "callMcpTool",
    method: protocol.METHOD_MCP_TOOL_CALL,
    params: "required",
  },
  {
    name: "callMcpToolWithCaller",
    clientMethod: "callMcpToolWithCaller",
    method: protocol.METHOD_MCP_TOOL_CALL_WITH_CALLER,
    params: "required",
  },
  {
    name: "listMcpPrompts",
    clientMethod: "listMcpPrompts",
    method: protocol.METHOD_MCP_PROMPT_LIST,
    params: "none",
  },
  {
    name: "getMcpPrompt",
    clientMethod: "getMcpPrompt",
    method: protocol.METHOD_MCP_PROMPT_GET,
    params: "required",
  },
  {
    name: "listMcpResources",
    clientMethod: "listMcpResources",
    method: protocol.METHOD_MCP_RESOURCE_LIST,
    params: "none",
  },
  {
    name: "readMcpResource",
    clientMethod: "readMcpResource",
    method: protocol.METHOD_MCP_RESOURCE_READ,
    params: "required",
  },
  {
    name: "subscribeMcpResource",
    clientMethod: "subscribeMcpResource",
    method: protocol.METHOD_MCP_RESOURCE_SUBSCRIBE,
    params: "required",
  },
  {
    name: "unsubscribeMcpResource",
    clientMethod: "unsubscribeMcpResource",
    method: protocol.METHOD_MCP_RESOURCE_UNSUBSCRIBE,
    params: "required",
  },
  {
    name: "readProjectMemory",
    clientMethod: "readProjectMemory",
    method: protocol.METHOD_PROJECT_MEMORY_READ,
    params: "required",
  },
  {
    name: "listMemoryStore",
    clientMethod: "listMemoryStore",
    method: protocol.METHOD_MEMORY_STORE_LIST,
    params: "required",
  },
  {
    name: "readMemoryStore",
    clientMethod: "readMemoryStore",
    method: protocol.METHOD_MEMORY_STORE_READ,
    params: "required",
  },
  {
    name: "searchMemoryStore",
    clientMethod: "searchMemoryStore",
    method: protocol.METHOD_MEMORY_STORE_SEARCH,
    params: "required",
  },
  {
    name: "addMemoryStoreNote",
    clientMethod: "addMemoryStoreNote",
    method: protocol.METHOD_MEMORY_STORE_ADD_NOTE,
    params: "required",
  },
  {
    name: "consolidateMemoryStore",
    clientMethod: "consolidateMemoryStore",
    method: protocol.METHOD_MEMORY_STORE_CONSOLIDATE,
    params: "required",
  },
  {
    name: "listMemoryStoreReviewNotes",
    clientMethod: "listMemoryStoreReviewNotes",
    method: protocol.METHOD_MEMORY_STORE_REVIEW_LIST,
    params: "required",
  },
  {
    name: "resolveMemoryStoreReviewNote",
    clientMethod: "resolveMemoryStoreReviewNote",
    method: protocol.METHOD_MEMORY_STORE_REVIEW_RESOLVE,
    params: "required",
  },
  {
    name: "healthMemoryStore",
    clientMethod: "healthMemoryStore",
    method: protocol.METHOD_MEMORY_STORE_HEALTH,
    params: "required",
  },
  {
    name: "resetMemoryStore",
    clientMethod: "resetMemoryStore",
    method: protocol.METHOD_MEMORY_STORE_RESET,
    params: "required",
  },
  {
    name: "rebuildMemoryStoreIndex",
    clientMethod: "rebuildMemoryStoreIndex",
    method: protocol.METHOD_MEMORY_STORE_INDEX_REBUILD,
    params: "required",
  },
  {
    name: "listLogs",
    clientMethod: "listLogs",
    method: protocol.METHOD_LOG_LIST,
    params: "none",
  },
  {
    name: "readPersistedLogTail",
    clientMethod: "readPersistedLogTail",
    method: protocol.METHOD_LOG_PERSISTED_TAIL,
    params: "required",
  },
  {
    name: "clearLogs",
    clientMethod: "clearLogs",
    method: protocol.METHOD_LOG_CLEAR,
    params: "none",
  },
  {
    name: "clearDiagnosticLogHistory",
    clientMethod: "clearDiagnosticLogHistory",
    method: protocol.METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR,
    params: "none",
  },
  {
    name: "readLogStorageDiagnostics",
    clientMethod: "readLogStorageDiagnostics",
    method: protocol.METHOD_DIAGNOSTICS_LOG_STORAGE_READ,
    params: "none",
  },
  {
    name: "exportSupportBundle",
    clientMethod: "exportSupportBundle",
    method: protocol.METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT,
    params: "optional-empty",
  },
  {
    name: "readServerDiagnostics",
    clientMethod: "readServerDiagnostics",
    method: protocol.METHOD_DIAGNOSTICS_SERVER_READ,
    params: "none",
  },
  {
    name: "readWindowsStartupDiagnostics",
    clientMethod: "readWindowsStartupDiagnostics",
    method: protocol.METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ,
    params: "none",
  },
  {
    name: "listDiagnosticsTraces",
    clientMethod: "listDiagnosticsTraces",
    method: protocol.METHOD_DIAGNOSTICS_TRACE_LIST,
    params: "required",
  },
  {
    name: "readDiagnosticsTrace",
    clientMethod: "readDiagnosticsTrace",
    method: protocol.METHOD_DIAGNOSTICS_TRACE_READ,
    params: "required",
  },
  {
    name: "exportDiagnosticsTrace",
    clientMethod: "exportDiagnosticsTrace",
    method: protocol.METHOD_DIAGNOSTICS_TRACE_EXPORT,
    params: "required",
  },
  {
    name: "readGatewayChannelStatus",
    clientMethod: "readGatewayChannelStatus",
    method: protocol.METHOD_GATEWAY_CHANNEL_STATUS,
    params: "required",
  },
  {
    name: "startGatewayChannel",
    clientMethod: "startGatewayChannel",
    method: protocol.METHOD_GATEWAY_CHANNEL_START,
    params: "required",
  },
  {
    name: "stopGatewayChannel",
    clientMethod: "stopGatewayChannel",
    method: protocol.METHOD_GATEWAY_CHANNEL_STOP,
    params: "required",
  },
  {
    name: "probeTelegramChannel",
    clientMethod: "probeTelegramChannel",
    method: protocol.METHOD_TELEGRAM_CHANNEL_PROBE,
    params: "optional-empty",
  },
  {
    name: "probeFeishuChannel",
    clientMethod: "probeFeishuChannel",
    method: protocol.METHOD_FEISHU_CHANNEL_PROBE,
    params: "optional-empty",
  },
  {
    name: "probeDiscordChannel",
    clientMethod: "probeDiscordChannel",
    method: protocol.METHOD_DISCORD_CHANNEL_PROBE,
    params: "optional-empty",
  },
  {
    name: "probeWechatChannel",
    clientMethod: "probeWechatChannel",
    method: protocol.METHOD_WECHAT_CHANNEL_PROBE,
    params: "optional-empty",
  },
  {
    name: "startWechatChannelLogin",
    clientMethod: "startWechatChannelLogin",
    method: protocol.METHOD_WECHAT_CHANNEL_LOGIN_START,
    params: "optional-empty",
  },
  {
    name: "waitWechatChannelLogin",
    clientMethod: "waitWechatChannelLogin",
    method: protocol.METHOD_WECHAT_CHANNEL_LOGIN_WAIT,
    params: "required",
  },
  {
    name: "listWechatChannelAccounts",
    clientMethod: "listWechatChannelAccounts",
    method: protocol.METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
    params: "none",
  },
  {
    name: "removeWechatChannelAccount",
    clientMethod: "removeWechatChannelAccount",
    method: protocol.METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
    params: "required",
  },
  {
    name: "setWechatChannelRuntimeModel",
    clientMethod: "setWechatChannelRuntimeModel",
    method: protocol.METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
    params: "required",
  },
  {
    name: "probeGatewayTunnel",
    clientMethod: "probeGatewayTunnel",
    method: protocol.METHOD_GATEWAY_TUNNEL_PROBE,
    params: "none",
  },
  {
    name: "detectGatewayTunnelCloudflared",
    clientMethod: "detectGatewayTunnelCloudflared",
    method: protocol.METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
    params: "none",
  },
  {
    name: "installGatewayTunnelCloudflared",
    clientMethod: "installGatewayTunnelCloudflared",
    method: protocol.METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
    params: "required",
  },
  {
    name: "createGatewayTunnel",
    clientMethod: "createGatewayTunnel",
    method: protocol.METHOD_GATEWAY_TUNNEL_CREATE,
    params: "required",
  },
  {
    name: "startGatewayTunnel",
    clientMethod: "startGatewayTunnel",
    method: protocol.METHOD_GATEWAY_TUNNEL_START,
    params: "none",
  },
  {
    name: "stopGatewayTunnel",
    clientMethod: "stopGatewayTunnel",
    method: protocol.METHOD_GATEWAY_TUNNEL_STOP,
    params: "none",
  },
  {
    name: "restartGatewayTunnel",
    clientMethod: "restartGatewayTunnel",
    method: protocol.METHOD_GATEWAY_TUNNEL_RESTART,
    params: "none",
  },
  {
    name: "readGatewayTunnelStatus",
    clientMethod: "readGatewayTunnelStatus",
    method: protocol.METHOD_GATEWAY_TUNNEL_STATUS,
    params: "none",
  },
  {
    name: "syncGatewayTunnelWebhookUrl",
    clientMethod: "syncGatewayTunnelWebhookUrl",
    method: protocol.METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
    params: "required",
  },
  {
    name: "createImageMediaTaskArtifact",
    clientMethod: "createImageMediaTaskArtifact",
    method: protocol.METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
    params: "required",
  },
  {
    name: "createAudioMediaTaskArtifact",
    clientMethod: "createAudioMediaTaskArtifact",
    method: protocol.METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE,
    params: "required",
  },
  {
    name: "createVideoMediaTaskArtifact",
    clientMethod: "createVideoMediaTaskArtifact",
    method: protocol.METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE,
    params: "required",
  },
  {
    name: "completeAudioMediaTaskArtifact",
    clientMethod: "completeAudioMediaTaskArtifact",
    method: protocol.METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE,
    params: "required",
  },
  {
    name: "getMediaTaskArtifact",
    clientMethod: "getMediaTaskArtifact",
    method: protocol.METHOD_MEDIA_TASK_ARTIFACT_GET,
    params: "required",
  },
  {
    name: "listMediaTaskArtifacts",
    clientMethod: "listMediaTaskArtifacts",
    method: protocol.METHOD_MEDIA_TASK_ARTIFACT_LIST,
    params: "required",
  },
  {
    name: "cancelMediaTaskArtifact",
    clientMethod: "cancelMediaTaskArtifact",
    method: protocol.METHOD_MEDIA_TASK_ARTIFACT_CANCEL,
    params: "required",
  },
  {
    name: "getGalleryMaterial",
    clientMethod: "getGalleryMaterial",
    method: protocol.METHOD_GALLERY_MATERIAL_GET,
    params: "required",
  },
  {
    name: "createGalleryMaterialMetadata",
    clientMethod: "createGalleryMaterialMetadata",
    method: protocol.METHOD_GALLERY_MATERIAL_METADATA_CREATE,
    params: "required",
  },
  {
    name: "getGalleryMaterialMetadata",
    clientMethod: "getGalleryMaterialMetadata",
    method: protocol.METHOD_GALLERY_MATERIAL_METADATA_GET,
    params: "required",
  },
  {
    name: "updateGalleryMaterialMetadata",
    clientMethod: "updateGalleryMaterialMetadata",
    method: protocol.METHOD_GALLERY_MATERIAL_METADATA_UPDATE,
    params: "required",
  },
  {
    name: "deleteGalleryMaterialMetadata",
    clientMethod: "deleteGalleryMaterialMetadata",
    method: protocol.METHOD_GALLERY_MATERIAL_METADATA_DELETE,
    params: "required",
  },
  {
    name: "listGalleryMaterialsByImageCategory",
    clientMethod: "listGalleryMaterialsByImageCategory",
    method: protocol.METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY,
    params: "required",
  },
  {
    name: "listGalleryMaterialsByLayoutCategory",
    clientMethod: "listGalleryMaterialsByLayoutCategory",
    method: protocol.METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY,
    params: "required",
  },
  {
    name: "listGalleryMaterialsByMood",
    clientMethod: "listGalleryMaterialsByMood",
    method: protocol.METHOD_GALLERY_MATERIAL_LIST_BY_MOOD,
    params: "required",
  },
  {
    name: "listProjectMaterials",
    clientMethod: "listProjectMaterials",
    method: protocol.METHOD_PROJECT_MATERIAL_LIST,
    params: "required",
  },
  {
    name: "getProjectMaterial",
    clientMethod: "getProjectMaterial",
    method: protocol.METHOD_PROJECT_MATERIAL_GET,
    params: "required",
  },
  {
    name: "countProjectMaterials",
    clientMethod: "countProjectMaterials",
    method: protocol.METHOD_PROJECT_MATERIAL_COUNT,
    params: "required",
  },
  {
    name: "uploadProjectMaterial",
    clientMethod: "uploadProjectMaterial",
    method: protocol.METHOD_PROJECT_MATERIAL_UPLOAD,
    params: "required",
  },
  {
    name: "importProjectMaterialFromUrl",
    clientMethod: "importProjectMaterialFromUrl",
    method: protocol.METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL,
    params: "required",
  },
  {
    name: "updateProjectMaterial",
    clientMethod: "updateProjectMaterial",
    method: protocol.METHOD_PROJECT_MATERIAL_UPDATE,
    params: "required",
  },
  {
    name: "deleteProjectMaterial",
    clientMethod: "deleteProjectMaterial",
    method: protocol.METHOD_PROJECT_MATERIAL_DELETE,
    params: "required",
  },
  {
    name: "readProjectMaterialContent",
    clientMethod: "readProjectMaterialContent",
    method: protocol.METHOD_PROJECT_MATERIAL_CONTENT,
    params: "required",
  },
  {
    name: "listVoiceAsrCredentials",
    clientMethod: "listVoiceAsrCredentials",
    method: protocol.METHOD_VOICE_ASR_CREDENTIAL_LIST,
    params: "none",
  },
  {
    name: "createVoiceAsrCredential",
    clientMethod: "createVoiceAsrCredential",
    method: protocol.METHOD_VOICE_ASR_CREDENTIAL_CREATE,
    params: "required",
  },
  {
    name: "updateVoiceAsrCredential",
    clientMethod: "updateVoiceAsrCredential",
    method: protocol.METHOD_VOICE_ASR_CREDENTIAL_UPDATE,
    params: "required",
  },
  {
    name: "deleteVoiceAsrCredential",
    clientMethod: "deleteVoiceAsrCredential",
    method: protocol.METHOD_VOICE_ASR_CREDENTIAL_DELETE,
    params: "required",
  },
  {
    name: "setDefaultVoiceAsrCredential",
    clientMethod: "setDefaultVoiceAsrCredential",
    method: protocol.METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET,
    params: "required",
  },
  {
    name: "testVoiceAsrCredential",
    clientMethod: "testVoiceAsrCredential",
    method: protocol.METHOD_VOICE_ASR_CREDENTIAL_TEST,
    params: "required",
  },
  {
    name: "listVoiceInstructions",
    clientMethod: "listVoiceInstructions",
    method: protocol.METHOD_VOICE_INSTRUCTION_LIST,
    params: "none",
  },
  {
    name: "saveVoiceInstruction",
    clientMethod: "saveVoiceInstruction",
    method: protocol.METHOD_VOICE_INSTRUCTION_SAVE,
    params: "required",
  },
  {
    name: "deleteVoiceInstruction",
    clientMethod: "deleteVoiceInstruction",
    method: protocol.METHOD_VOICE_INSTRUCTION_DELETE,
    params: "required",
  },
  {
    name: "setDefaultVoiceModel",
    clientMethod: "setDefaultVoiceModel",
    method: protocol.METHOD_VOICE_MODEL_DEFAULT_SET,
    params: "required",
  },
  {
    name: "testTranscribeVoiceModelFile",
    clientMethod: "testTranscribeVoiceModelFile",
    method: protocol.METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE,
    params: "required",
  },
  {
    name: "readUsageStats",
    clientMethod: "readUsageStats",
    method: protocol.METHOD_USAGE_STATS_READ,
    params: "required",
  },
  {
    name: "listUsageStatsModelRanking",
    clientMethod: "listUsageStatsModelRanking",
    method: protocol.METHOD_USAGE_STATS_MODEL_RANKING_LIST,
    params: "required",
  },
  {
    name: "listUsageStatsDailyTrends",
    clientMethod: "listUsageStatsDailyTrends",
    method: protocol.METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
    params: "required",
  },
  {
    name: "readArtifacts",
    clientMethod: "readArtifacts",
    method: protocol.METHOD_ARTIFACT_READ,
    params: "required",
  },
  {
    name: "listDirectory",
    clientMethod: "listDirectory",
    method: protocol.METHOD_FILE_SYSTEM_LIST_DIRECTORY,
    params: "required",
  },
  {
    name: "readFilePreview",
    clientMethod: "readFilePreview",
    method: protocol.METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
    params: "required",
  },
  {
    name: "createFile",
    clientMethod: "createFile",
    method: protocol.METHOD_FILE_SYSTEM_CREATE_FILE,
    params: "required",
  },
  {
    name: "createDirectory",
    clientMethod: "createDirectory",
    method: protocol.METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
    params: "required",
  },
  {
    name: "renameFile",
    clientMethod: "renameFile",
    method: protocol.METHOD_FILE_SYSTEM_RENAME_FILE,
    params: "required",
  },
  {
    name: "deleteFile",
    clientMethod: "deleteFile",
    method: protocol.METHOD_FILE_SYSTEM_DELETE_FILE,
    params: "required",
  },
  {
    name: "readProjectGitStatus",
    clientMethod: "readProjectGitStatus",
    method: protocol.METHOD_PROJECT_GIT_STATUS,
    params: "required",
  },
  {
    name: "readProjectGitDiff",
    clientMethod: "readProjectGitDiff",
    method: protocol.METHOD_PROJECT_GIT_DIFF,
    params: "required",
  },
  {
    name: "listProjectGitCommits",
    clientMethod: "listProjectGitCommits",
    method: protocol.METHOD_PROJECT_GIT_COMMITS_LIST,
    params: "required",
  },
  {
    name: "checkoutProjectGitBranch",
    clientMethod: "checkoutProjectGitBranch",
    method: protocol.METHOD_PROJECT_GIT_BRANCH_CHECKOUT,
    params: "required",
  },
  {
    name: "createProjectGitBranch",
    clientMethod: "createProjectGitBranch",
    method: protocol.METHOD_PROJECT_GIT_BRANCH_CREATE,
    params: "required",
  },
  {
    name: "createProjectGitWorktree",
    clientMethod: "createProjectGitWorktree",
    method: protocol.METHOD_PROJECT_GIT_WORKTREE_CREATE,
    params: "required",
  },
  {
    name: "startProjectShellSession",
    clientMethod: "startProjectShellSession",
    method: protocol.METHOD_PROJECT_SHELL_SESSION_START,
    params: "required",
  },
  {
    name: "writeProjectShellSession",
    clientMethod: "writeProjectShellSession",
    method: protocol.METHOD_PROJECT_SHELL_SESSION_WRITE,
    params: "required",
  },
  {
    name: "resizeProjectShellSession",
    clientMethod: "resizeProjectShellSession",
    method: protocol.METHOD_PROJECT_SHELL_SESSION_RESIZE,
    params: "required",
  },
  {
    name: "killProjectShellSession",
    clientMethod: "killProjectShellSession",
    method: protocol.METHOD_PROJECT_SHELL_SESSION_KILL,
    params: "required",
  },
  {
    name: "drainProjectShellSessionEvents",
    clientMethod: "drainProjectShellSessionEvents",
    method: protocol.METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
    params: "optional-empty",
  },
  {
    name: "startExecutionProcess",
    clientMethod: "startExecutionProcess",
    method: protocol.METHOD_EXECUTION_PROCESS_START,
    params: "required",
  },
  {
    name: "writeExecutionProcessStdin",
    clientMethod: "writeExecutionProcessStdin",
    method: protocol.METHOD_EXECUTION_PROCESS_WRITE_STDIN,
    params: "required",
  },
  {
    name: "interruptExecutionProcess",
    clientMethod: "interruptExecutionProcess",
    method: protocol.METHOD_EXECUTION_PROCESS_INTERRUPT,
    params: "required",
  },
  {
    name: "terminateExecutionProcess",
    clientMethod: "terminateExecutionProcess",
    method: protocol.METHOD_EXECUTION_PROCESS_TERMINATE,
    params: "required",
  },
  {
    name: "readExecutionProcessStatus",
    clientMethod: "readExecutionProcessStatus",
    method: protocol.METHOD_EXECUTION_PROCESS_STATUS,
    params: "required",
  },
  {
    name: "drainExecutionProcessOutput",
    clientMethod: "drainExecutionProcessOutput",
    method: protocol.METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT,
    params: "optional-empty",
  },
  {
    name: "exportEvidence",
    clientMethod: "exportEvidence",
    method: protocol.METHOD_EVIDENCE_EXPORT,
    params: "required",
  },
  {
    name: "exportHandoffBundle",
    clientMethod: "exportHandoffBundle",
    method: protocol.METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
    params: "required",
  },
  {
    name: "exportReplayCase",
    clientMethod: "exportReplayCase",
    method: protocol.METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT,
    params: "required",
  },
  {
    name: "exportAnalysisHandoff",
    clientMethod: "exportAnalysisHandoff",
    method: protocol.METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
    params: "required",
  },
  {
    name: "exportReviewDecisionTemplate",
    clientMethod: "exportReviewDecisionTemplate",
    method: protocol.METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
    params: "required",
  },
  {
    name: "saveReviewDecision",
    clientMethod: "saveReviewDecision",
    method: protocol.METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE,
    params: "required",
  },
  {
    name: "readSession",
    clientMethod: "readSession",
    method: protocol.METHOD_AGENT_SESSION_READ,
    params: "required",
  },
  {
    name: "readAgentSessionToolInventory",
    clientMethod: "readAgentSessionToolInventory",
    method: protocol.METHOD_AGENT_SESSION_TOOL_INVENTORY_READ,
    params: "optional-empty",
  },
  {
    name: "listModels",
    clientMethod: "listModels",
    method: protocol.METHOD_MODEL_LIST,
    params: "optional-empty",
  },
  {
    name: "listModelPreferences",
    clientMethod: "listModelPreferences",
    method: protocol.METHOD_MODEL_PREFERENCES_LIST,
    params: "none",
  },
  {
    name: "readModelSyncState",
    clientMethod: "readModelSyncState",
    method: protocol.METHOD_MODEL_SYNC_STATE_READ,
    params: "none",
  },
  {
    name: "listModelProviders",
    clientMethod: "listModelProviders",
    method: protocol.METHOD_MODEL_PROVIDER_LIST,
    params: "none",
  },
  {
    name: "listModelProviderCatalog",
    clientMethod: "listModelProviderCatalog",
    method: protocol.METHOD_MODEL_PROVIDER_CATALOG_LIST,
    params: "none",
  },
  {
    name: "readModelProviderAlias",
    clientMethod: "readModelProviderAlias",
    method: protocol.METHOD_MODEL_PROVIDER_ALIAS_READ,
    params: "required",
  },
  {
    name: "listModelProviderAliases",
    clientMethod: "listModelProviderAliases",
    method: protocol.METHOD_MODEL_PROVIDER_ALIAS_LIST,
    params: "none",
  },
  {
    name: "resolveConnectDeepLink",
    clientMethod: "resolveConnectDeepLink",
    method: protocol.METHOD_CONNECT_DEEP_LINK_RESOLVE,
    params: "required",
  },
  {
    name: "resolveConnectOpenDeepLink",
    clientMethod: "resolveConnectOpenDeepLink",
    method: protocol.METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
    params: "required",
  },
  {
    name: "saveConnectRelayApiKey",
    clientMethod: "saveConnectRelayApiKey",
    method: protocol.METHOD_CONNECT_RELAY_API_KEY_SAVE,
    params: "required",
  },
  {
    name: "sendConnectCallback",
    clientMethod: "sendConnectCallback",
    method: protocol.METHOD_CONNECT_CALLBACK_SEND,
    params: "required",
  },
  {
    name: "scanConversationImportSource",
    clientMethod: "scanConversationImportSource",
    method: protocol.METHOD_CONVERSATION_IMPORT_SOURCE_SCAN,
    params: "optional-empty",
  },
  {
    name: "previewConversationImportThread",
    clientMethod: "previewConversationImportThread",
    method: protocol.METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW,
    params: "required",
  },
  {
    name: "commitConversationImportThread",
    clientMethod: "commitConversationImportThread",
    method: protocol.METHOD_CONVERSATION_IMPORT_THREAD_COMMIT,
    params: "required",
  },
  {
    name: "readConversationImportRuntimeEvents",
    clientMethod: "readConversationImportRuntimeEvents",
    method: protocol.METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ,
    params: "required",
  },
  {
    name: "startTurn",
    clientMethod: "startTurn",
    method: protocol.METHOD_AGENT_SESSION_TURN_START,
    params: "required",
  },
  {
    name: "cancelTurn",
    clientMethod: "cancelTurn",
    method: protocol.METHOD_AGENT_SESSION_TURN_CANCEL,
    params: "required",
  },
  {
    name: "replayAction",
    clientMethod: "replayAction",
    method: protocol.METHOD_AGENT_SESSION_ACTION_REPLAY,
    params: "required",
  },
  {
    name: "respondAction",
    clientMethod: "respondAction",
    method: protocol.METHOD_AGENT_SESSION_ACTION_RESPOND,
    params: "required",
  },
];

type ConnectionRuntime = AppServerConnection & {
  readonly client: AppServerClient;
  request<T>(
    requestMessage: protocol.JsonRpcRequest,
    method?: string,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<T>>;
};

type ResolvedArgs = {
  clientArgs: unknown[];
  options: AppServerRequestOptions;
};

function resolveArgs(
  mode: ConnectionParamsMode,
  args: IArguments,
): ResolvedArgs {
  if (mode === "none") {
    return {
      clientArgs: [],
      options: (args[0] as AppServerRequestOptions | undefined) ?? {},
    };
  }
  if (mode === "optional-empty") {
    return {
      clientArgs: [args.length === 0 || args[0] === undefined ? {} : args[0]],
      options: (args[1] as AppServerRequestOptions | undefined) ?? {},
    };
  }
  return {
    clientArgs: [args[0]],
    options: (args[1] as AppServerRequestOptions | undefined) ?? {},
  };
}

export function installAppServerConnectionMethods(
  prototype: AppServerConnection,
): void {
  for (const spec of CONNECTION_METHODS) {
    Object.defineProperty(prototype, spec.name, {
      configurable: true,
      writable: true,
      value: async function (
        this: ConnectionRuntime,
      ): Promise<AppServerRequestResult<unknown>> {
        const { clientArgs, options } = resolveArgs(spec.params, arguments);
        const client = this.client as unknown as Record<
          string,
          (...args: unknown[]) => protocol.JsonRpcRequest
        >;
        const requestMessage = client[spec.clientMethod](...clientArgs);
        return await this.request(requestMessage, spec.method, options);
      },
    });
  }
}
