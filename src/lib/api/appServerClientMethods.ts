import * as constants from "./appServerConstants";
import type * as appServer from "./appServerTypes";

type AppServerClientMethodParamsMode = "none" | "required" | "optional-empty";

type AppServerClientMethodSpec = {
  name: string;
  method: string;
  params: AppServerClientMethodParamsMode;
};

type AppServerClientRequestRunner = {
  request<T>(
    method: string,
    params?: unknown,
  ): Promise<appServer.AppServerRequestResult<T>>;
};

declare module "./appServerClient" {
  interface AppServerClient {
    startSession(
      params: appServer.AppServerAgentSessionStartParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionStartResponse>
    >;
    listSessions(
      params?: appServer.AppServerAgentSessionListParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionListResponse>
    >;
    listCapabilities(
      params?: appServer.AppServerCapabilityListParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerCapabilityListResponse>
    >;
    requestWorkspaceRightSurface(
      params: appServer.AppServerWorkspaceRightSurfaceRequestParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerWorkspaceRightSurfaceRequestResponse>
    >;
    listWorkspaceRightSurfacePending(
      params?: appServer.AppServerWorkspaceRightSurfacePendingListParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerWorkspaceRightSurfacePendingListResponse>
    >;
    consumeWorkspaceRightSurfacePending(
      params: appServer.AppServerWorkspaceRightSurfacePendingConsumeParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerWorkspaceRightSurfacePendingConsumeResponse>
    >;
    dismissWorkspaceRightSurfacePending(
      params: appServer.AppServerWorkspaceRightSurfacePendingDismissParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerWorkspaceRightSurfacePendingDismissResponse>
    >;
    readArtifacts(
      params: appServer.AppServerArtifactReadParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerArtifactReadResponse>
    >;
    listDirectory(
      params: appServer.AppServerFileSystemListDirectoryParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerFileSystemDirectoryListing>
    >;
    readFilePreview(
      params: appServer.AppServerFileSystemReadFilePreviewParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerFileSystemFilePreview>
    >;
    createFile(
      params: appServer.AppServerFileSystemCreateFileParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerFileSystemMutationResponse>
    >;
    createDirectory(
      params: appServer.AppServerFileSystemCreateDirectoryParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerFileSystemMutationResponse>
    >;
    renameFile(
      params: appServer.AppServerFileSystemRenameFileParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerFileSystemMutationResponse>
    >;
    deleteFile(
      params: appServer.AppServerFileSystemDeleteFileParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerFileSystemMutationResponse>
    >;
    startExecutionProcess(
      params: appServer.AppServerExecutionProcessStartParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerExecutionProcessStartResponse>
    >;
    writeExecutionProcessStdin(
      params: appServer.AppServerExecutionProcessWriteStdinParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerExecutionProcessEmptyResponse>
    >;
    interruptExecutionProcess(
      params: appServer.AppServerExecutionProcessIdParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerExecutionProcessStatusResponse>
    >;
    terminateExecutionProcess(
      params: appServer.AppServerExecutionProcessIdParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerExecutionProcessStatusResponse>
    >;
    readExecutionProcessStatus(
      params: appServer.AppServerExecutionProcessIdParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerExecutionProcessStatusResponse>
    >;
    drainExecutionProcessOutput(
      params?: appServer.AppServerExecutionProcessDrainOutputParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerExecutionProcessDrainOutputResponse>
    >;
    readProjectGitStatus(
      params: appServer.AppServerProjectGitStatusParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectGitStatusResponse>
    >;
    readProjectGitDiff(
      params: appServer.AppServerProjectGitDiffParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectGitDiffResponse>
    >;
    listProjectGitCommits(
      params: appServer.AppServerProjectGitCommitListParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectGitCommitListResponse>
    >;
    checkoutProjectGitBranch(
      params: appServer.AppServerProjectGitBranchCheckoutParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectGitBranchCheckoutResponse>
    >;
    createProjectGitBranch(
      params: appServer.AppServerProjectGitBranchCreateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectGitBranchCreateResponse>
    >;
    createProjectGitWorktree(
      params: appServer.AppServerProjectGitWorktreeCreateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectGitWorktreeCreateResponse>
    >;
    exportEvidence(
      params: appServer.AppServerEvidenceExportParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerEvidenceExportResponse>
    >;
    exportHandoffBundle(
      params: appServer.AppServerAgentSessionHandoffBundleExportParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionHandoffBundleExportResponse>
    >;
    exportReplayCase(
      params: appServer.AppServerAgentSessionReplayCaseExportParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionReplayCaseExportResponse>
    >;
    exportAnalysisHandoff(
      params: appServer.AppServerAgentSessionAnalysisHandoffExportParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionAnalysisHandoffExportResponse>
    >;
    exportReviewDecisionTemplate(
      params: appServer.AppServerAgentSessionReviewDecisionTemplateExportParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionReviewDecisionTemplateExportResponse>
    >;
    saveReviewDecision(
      params: appServer.AppServerAgentSessionReviewDecisionSaveParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionReviewDecisionTemplateExportResponse>
    >;
    readSession(
      params: appServer.AppServerAgentSessionReadParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionReadResponse>
    >;
    readConversationImportRuntimeEvents(
      params: appServer.AppServerConversationImportThreadRuntimeEventsReadParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerConversationImportThreadRuntimeEventsReadResponse>
    >;
    readAgentSessionToolInventory(
      params?: appServer.AppServerAgentSessionToolInventoryReadParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionToolInventoryReadResponse>
    >;
    updateSession(
      params: appServer.AppServerAgentSessionUpdateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionUpdateResponse>
    >;
    archiveManySessions(
      params: appServer.AppServerAgentSessionArchiveManyParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionArchiveManyResponse>
    >;
    deleteSession(
      params: appServer.AppServerAgentSessionDeleteParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionDeleteResponse>
    >;
    readAgentSessionObjective(
      params: appServer.AppServerAgentSessionObjectiveReadParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionObjectiveReadResponse>
    >;
    setAgentSessionObjective(
      params: appServer.AppServerAgentSessionObjectiveSetParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionObjectiveSetResponse>
    >;
    updateAgentSessionObjectiveStatus(
      params: appServer.AppServerAgentSessionObjectiveStatusUpdateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionObjectiveStatusUpdateResponse>
    >;
    clearAgentSessionObjective(
      params: appServer.AppServerAgentSessionObjectiveClearParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionObjectiveClearResponse>
    >;
    continueAgentSessionObjective(
      params: appServer.AppServerAgentSessionObjectiveContinueParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionObjectiveContinueResponse>
    >;
    auditAgentSessionObjective(
      params: appServer.AppServerAgentSessionObjectiveAuditParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionObjectiveAuditResponse>
    >;
    compactAgentSession(
      params: appServer.AppServerAgentSessionCompactParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionCompactResponse>
    >;
    resumeAgentSessionThread(
      params: appServer.AppServerAgentSessionThreadResumeParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionThreadResumeResponse>
    >;
    removeAgentSessionQueuedTurn(
      params: appServer.AppServerAgentSessionQueuedTurnRemoveParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionQueuedTurnRemoveResponse>
    >;
    promoteAgentSessionQueuedTurn(
      params: appServer.AppServerAgentSessionQueuedTurnPromoteParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionQueuedTurnPromoteResponse>
    >;
    listAgentSessionFileCheckpoints(
      params: appServer.AppServerAgentSessionFileCheckpointListParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionFileCheckpointListResponse>
    >;
    getAgentSessionFileCheckpoint(
      params: appServer.AppServerAgentSessionFileCheckpointGetParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionFileCheckpointDetail>
    >;
    diffAgentSessionFileCheckpoint(
      params: appServer.AppServerAgentSessionFileCheckpointDiffParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionFileCheckpointDiffResponse>
    >;
    restoreAgentSessionFileCheckpoint(
      params: appServer.AppServerAgentSessionFileCheckpointRestoreParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionFileCheckpointRestoreResponse>
    >;
    getOrCreateSessionFile(
      params: appServer.AppServerSessionFileGetOrCreateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerSessionFileMetaResponse>
    >;
    updateSessionFileMeta(
      params: appServer.AppServerSessionFileUpdateMetaParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerSessionFileMetaResponse>
    >;
    saveSessionFile(
      params: appServer.AppServerSessionFileSaveParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerSessionFileEntryResponse>
    >;
    readSessionFile(
      params: appServer.AppServerSessionFileIdParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerSessionFileReadResponse>
    >;
    resolveSessionFilePath(
      params: appServer.AppServerSessionFileIdParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerSessionFileResolvePathResponse>
    >;
    deleteSessionFile(
      params: appServer.AppServerSessionFileIdParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerSessionFileMutationResponse>
    >;
    listSessionFiles(
      params: appServer.AppServerSessionFileGetOrCreateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerSessionFileListResponse>
    >;
    startTurn(
      params: appServer.AppServerAgentSessionTurnStartParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionTurnStartResponse>
    >;
    cancelTurn(
      params: appServer.AppServerAgentSessionTurnCancelParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionTurnCancelResponse>
    >;
    appendAgentSessionRuntimeEvents(
      params: appServer.AppServerAgentSessionRuntimeEventAppendParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionRuntimeEventAppendResponse>
    >;
    respondAction(
      params: appServer.AppServerAgentSessionActionRespondParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionActionRespondResponse>
    >;
    replayAction(
      params: appServer.AppServerAgentSessionActionReplayParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerAgentSessionActionReplayResponse>
    >;
    listLogs(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerLogListResponse>
    >;
    readPersistedLogTail(
      params: appServer.AppServerLogPersistedTailParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerLogPersistedTailResponse>
    >;
    clearLogs(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerLogClearResponse>
    >;
    clearDiagnosticLogHistory(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerLogClearResponse>
    >;
    readLogStorageDiagnostics(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerLogStorageDiagnosticsResponse>
    >;
    exportSupportBundle(
      params?: appServer.AppServerSupportBundleExportParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerSupportBundleExportResponse>
    >;
    readServerDiagnostics(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerServerDiagnosticsResponse>
    >;
    readWindowsStartupDiagnostics(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerWindowsStartupDiagnosticsResponse>
    >;
    listDiagnosticsTraces(
      params: appServer.AppServerDiagnosticsTraceListParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerDiagnosticsTraceListResponse>
    >;
    readDiagnosticsTrace(
      params: appServer.AppServerDiagnosticsTraceReadParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerDiagnosticsTraceReadResponse>
    >;
    exportDiagnosticsTrace(
      params: appServer.AppServerDiagnosticsTraceExportParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerDiagnosticsTraceExportResponse>
    >;
    readGatewayChannelStatus(
      params: appServer.AppServerGatewayChannelStatusParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayChannelStatusResponse>
    >;
    startGatewayChannel(
      params: appServer.AppServerGatewayChannelStartParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayChannelStatusResponse>
    >;
    stopGatewayChannel(
      params: appServer.AppServerGatewayChannelStopParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayChannelStatusResponse>
    >;
    probeTelegramChannel(
      params?: appServer.AppServerChannelProbeParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerChannelProbeResponse>
    >;
    probeFeishuChannel(
      params?: appServer.AppServerChannelProbeParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerChannelProbeResponse>
    >;
    probeDiscordChannel(
      params?: appServer.AppServerChannelProbeParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerChannelProbeResponse>
    >;
    probeWechatChannel(
      params?: appServer.AppServerChannelProbeParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerChannelProbeResponse>
    >;
    startWechatChannelLogin(
      params?: appServer.AppServerWechatLoginStartParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerWechatLoginStartResponse>
    >;
    waitWechatChannelLogin(
      params: appServer.AppServerWechatLoginWaitParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerWechatLoginWaitResponse>
    >;
    listWechatChannelAccounts(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerWechatChannelAccountListResponse>
    >;
    removeWechatChannelAccount(
      params: appServer.AppServerWechatChannelAccountRemoveParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerWechatChannelAccountRemoveResponse>
    >;
    setWechatChannelRuntimeModel(
      params: appServer.AppServerWechatRuntimeModelSetParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerWechatRuntimeModelSetResponse>
    >;
    probeGatewayTunnel(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayTunnelProbeResponse>
    >;
    detectGatewayTunnelCloudflared(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayTunnelCloudflaredDetectResponse>
    >;
    installGatewayTunnelCloudflared(
      params: appServer.AppServerGatewayTunnelCloudflaredInstallParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayTunnelCloudflaredInstallResponse>
    >;
    createGatewayTunnel(
      params: appServer.AppServerGatewayTunnelCreateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayTunnelCreateResponse>
    >;
    startGatewayTunnel(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayTunnelStatusResponse>
    >;
    stopGatewayTunnel(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayTunnelStatusResponse>
    >;
    restartGatewayTunnel(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayTunnelStatusResponse>
    >;
    readGatewayTunnelStatus(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayTunnelStatusResponse>
    >;
    syncGatewayTunnelWebhookUrl(
      params: appServer.AppServerGatewayTunnelSyncWebhookUrlParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGatewayTunnelSyncWebhookUrlResponse>
    >;
    createImageMediaTaskArtifact(
      params: appServer.AppServerMediaTaskArtifactImageCreateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerMediaTaskArtifactResponse>
    >;
    createAudioMediaTaskArtifact(
      params: appServer.AppServerMediaTaskArtifactAudioCreateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerMediaTaskArtifactResponse>
    >;
    createVideoMediaTaskArtifact(
      params: appServer.AppServerMediaTaskArtifactVideoCreateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerMediaTaskArtifactResponse>
    >;
    completeAudioMediaTaskArtifact(
      params: appServer.AppServerMediaTaskArtifactAudioCompleteParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerMediaTaskArtifactResponse>
    >;
    getMediaTaskArtifact(
      params: appServer.AppServerMediaTaskArtifactLookupParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerMediaTaskArtifactResponse>
    >;
    listMediaTaskArtifacts(
      params: appServer.AppServerMediaTaskArtifactListParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerMediaTaskArtifactListResponse>
    >;
    cancelMediaTaskArtifact(
      params: appServer.AppServerMediaTaskArtifactLookupParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerMediaTaskArtifactResponse>
    >;
    getGalleryMaterial(
      params: appServer.AppServerGalleryMaterialLookupParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGalleryMaterialResponse>
    >;
    createGalleryMaterialMetadata(
      params: appServer.AppServerGalleryMaterialMetadataCreateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGalleryMaterialMetadataResponse>
    >;
    getGalleryMaterialMetadata(
      params: appServer.AppServerGalleryMaterialLookupParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGalleryMaterialMetadataResponse>
    >;
    updateGalleryMaterialMetadata(
      params: appServer.AppServerGalleryMaterialMetadataUpdateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGalleryMaterialMetadataResponse>
    >;
    deleteGalleryMaterialMetadata(
      params: appServer.AppServerGalleryMaterialLookupParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGalleryMaterialDeleteResponse>
    >;
    listGalleryMaterialsByImageCategory(
      params: appServer.AppServerGalleryMaterialFilterParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGalleryMaterialListResponse>
    >;
    listGalleryMaterialsByLayoutCategory(
      params: appServer.AppServerGalleryMaterialFilterParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGalleryMaterialListResponse>
    >;
    listGalleryMaterialsByMood(
      params: appServer.AppServerGalleryMaterialFilterParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerGalleryMaterialListResponse>
    >;
    listProjectMaterials(
      params: appServer.AppServerProjectMaterialListParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectMaterialListResponse>
    >;
    getProjectMaterial(
      params: appServer.AppServerProjectMaterialLookupParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectMaterialResponse>
    >;
    countProjectMaterials(
      params: appServer.AppServerProjectMaterialListParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectMaterialCountResponse>
    >;
    uploadProjectMaterial(
      params: appServer.AppServerProjectMaterialUploadParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectMaterialResponse>
    >;
    importProjectMaterialFromUrl(
      params: appServer.AppServerProjectMaterialImportFromUrlParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectMaterialResponse>
    >;
    updateProjectMaterial(
      params: appServer.AppServerProjectMaterialUpdateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectMaterialResponse>
    >;
    deleteProjectMaterial(
      params: appServer.AppServerProjectMaterialLookupParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectMaterialDeleteResponse>
    >;
    readProjectMaterialContent(
      params: appServer.AppServerProjectMaterialLookupParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerProjectMaterialContentResponse>
    >;
    listVoiceAsrCredentials(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceAsrCredentialListResponse>
    >;
    createVoiceAsrCredential(
      params: appServer.AppServerVoiceAsrCredentialCreateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceAsrCredentialWriteResponse>
    >;
    updateVoiceAsrCredential(
      params: appServer.AppServerVoiceAsrCredentialUpdateParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceAsrCredentialMutationResponse>
    >;
    deleteVoiceAsrCredential(
      params: appServer.AppServerVoiceAsrCredentialIdParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceAsrCredentialMutationResponse>
    >;
    setDefaultVoiceAsrCredential(
      params: appServer.AppServerVoiceAsrCredentialIdParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceAsrCredentialMutationResponse>
    >;
    testVoiceAsrCredential(
      params: appServer.AppServerVoiceAsrCredentialIdParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceAsrCredentialTestResponse>
    >;
    listVoiceInstructions(): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceInstructionListResponse>
    >;
    saveVoiceInstruction(
      params: appServer.AppServerVoiceInstructionSaveParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceInstructionMutationResponse>
    >;
    deleteVoiceInstruction(
      params: appServer.AppServerVoiceInstructionIdParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceInstructionMutationResponse>
    >;
    setDefaultVoiceModel(
      params: appServer.AppServerVoiceModelDefaultSetParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceModelDefaultSetResponse>
    >;
    testTranscribeVoiceModelFile(
      params: appServer.AppServerVoiceModelTestTranscribeFileParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerVoiceModelTestTranscribeFileResponse>
    >;
    readUsageStats(
      params: appServer.AppServerUsageStatsRangeParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerUsageStatsReadResponse>
    >;
    listUsageStatsModelRanking(
      params: appServer.AppServerUsageStatsRangeParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerUsageStatsModelRankingListResponse>
    >;
    listUsageStatsDailyTrends(
      params: appServer.AppServerUsageStatsRangeParams,
    ): Promise<
      appServer.AppServerRequestResult<appServer.AppServerUsageStatsDailyTrendsListResponse>
    >;
  }
}

const APP_SERVER_CLIENT_METHODS: readonly AppServerClientMethodSpec[] = [
  {
    name: "startSession",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_START,
    params: "required",
  },
  {
    name: "listSessions",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_LIST,
    params: "optional-empty",
  },
  {
    name: "listCapabilities",
    method: constants.APP_SERVER_METHOD_CAPABILITY_LIST,
    params: "optional-empty",
  },
  {
    name: "requestWorkspaceRightSurface",
    method: constants.APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
    params: "required",
  },
  {
    name: "listWorkspaceRightSurfacePending",
    method: constants.APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
    params: "optional-empty",
  },
  {
    name: "consumeWorkspaceRightSurfacePending",
    method: constants.APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CONSUME,
    params: "required",
  },
  {
    name: "dismissWorkspaceRightSurfacePending",
    method: constants.APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_DISMISS,
    params: "required",
  },
  {
    name: "readArtifacts",
    method: constants.APP_SERVER_METHOD_ARTIFACT_READ,
    params: "required",
  },
  {
    name: "listDirectory",
    method: constants.APP_SERVER_METHOD_FILE_SYSTEM_LIST_DIRECTORY,
    params: "required",
  },
  {
    name: "readFilePreview",
    method: constants.APP_SERVER_METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
    params: "required",
  },
  {
    name: "createFile",
    method: constants.APP_SERVER_METHOD_FILE_SYSTEM_CREATE_FILE,
    params: "required",
  },
  {
    name: "createDirectory",
    method: constants.APP_SERVER_METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
    params: "required",
  },
  {
    name: "renameFile",
    method: constants.APP_SERVER_METHOD_FILE_SYSTEM_RENAME_FILE,
    params: "required",
  },
  {
    name: "deleteFile",
    method: constants.APP_SERVER_METHOD_FILE_SYSTEM_DELETE_FILE,
    params: "required",
  },
  {
    name: "startExecutionProcess",
    method: constants.APP_SERVER_METHOD_EXECUTION_PROCESS_START,
    params: "required",
  },
  {
    name: "writeExecutionProcessStdin",
    method: constants.APP_SERVER_METHOD_EXECUTION_PROCESS_WRITE_STDIN,
    params: "required",
  },
  {
    name: "interruptExecutionProcess",
    method: constants.APP_SERVER_METHOD_EXECUTION_PROCESS_INTERRUPT,
    params: "required",
  },
  {
    name: "terminateExecutionProcess",
    method: constants.APP_SERVER_METHOD_EXECUTION_PROCESS_TERMINATE,
    params: "required",
  },
  {
    name: "readExecutionProcessStatus",
    method: constants.APP_SERVER_METHOD_EXECUTION_PROCESS_STATUS,
    params: "required",
  },
  {
    name: "drainExecutionProcessOutput",
    method: constants.APP_SERVER_METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT,
    params: "optional-empty",
  },
  {
    name: "readProjectGitStatus",
    method: constants.APP_SERVER_METHOD_PROJECT_GIT_STATUS,
    params: "required",
  },
  {
    name: "readProjectGitDiff",
    method: constants.APP_SERVER_METHOD_PROJECT_GIT_DIFF,
    params: "required",
  },
  {
    name: "listProjectGitCommits",
    method: constants.APP_SERVER_METHOD_PROJECT_GIT_COMMITS_LIST,
    params: "required",
  },
  {
    name: "checkoutProjectGitBranch",
    method: constants.APP_SERVER_METHOD_PROJECT_GIT_BRANCH_CHECKOUT,
    params: "required",
  },
  {
    name: "createProjectGitBranch",
    method: constants.APP_SERVER_METHOD_PROJECT_GIT_BRANCH_CREATE,
    params: "required",
  },
  {
    name: "createProjectGitWorktree",
    method: constants.APP_SERVER_METHOD_PROJECT_GIT_WORKTREE_CREATE,
    params: "required",
  },
  {
    name: "exportEvidence",
    method: constants.APP_SERVER_METHOD_EVIDENCE_EXPORT,
    params: "required",
  },
  {
    name: "exportHandoffBundle",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
    params: "required",
  },
  {
    name: "exportReplayCase",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT,
    params: "required",
  },
  {
    name: "exportAnalysisHandoff",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
    params: "required",
  },
  {
    name: "exportReviewDecisionTemplate",
    method:
      constants.APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
    params: "required",
  },
  {
    name: "saveReviewDecision",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE,
    params: "required",
  },
  {
    name: "readSession",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_READ,
    params: "required",
  },
  {
    name: "readConversationImportRuntimeEvents",
    method:
      constants.APP_SERVER_METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ,
    params: "required",
  },
  {
    name: "readAgentSessionToolInventory",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_TOOL_INVENTORY_READ,
    params: "optional-empty",
  },
  {
    name: "updateSession",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_UPDATE,
    params: "required",
  },
  {
    name: "archiveManySessions",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_ARCHIVE_MANY,
    params: "required",
  },
  {
    name: "deleteSession",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_DELETE,
    params: "required",
  },
  {
    name: "readAgentSessionObjective",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_READ,
    params: "required",
  },
  {
    name: "setAgentSessionObjective",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_SET,
    params: "required",
  },
  {
    name: "updateAgentSessionObjectiveStatus",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
    params: "required",
  },
  {
    name: "clearAgentSessionObjective",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
    params: "required",
  },
  {
    name: "continueAgentSessionObjective",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
    params: "required",
  },
  {
    name: "auditAgentSessionObjective",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
    params: "required",
  },
  {
    name: "compactAgentSession",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_COMPACT,
    params: "required",
  },
  {
    name: "resumeAgentSessionThread",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_THREAD_RESUME,
    params: "required",
  },
  {
    name: "removeAgentSessionQueuedTurn",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE,
    params: "required",
  },
  {
    name: "promoteAgentSessionQueuedTurn",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE,
    params: "required",
  },
  {
    name: "listAgentSessionFileCheckpoints",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST,
    params: "required",
  },
  {
    name: "getAgentSessionFileCheckpoint",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET,
    params: "required",
  },
  {
    name: "diffAgentSessionFileCheckpoint",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF,
    params: "required",
  },
  {
    name: "restoreAgentSessionFileCheckpoint",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE,
    params: "required",
  },
  {
    name: "getOrCreateSessionFile",
    method: constants.APP_SERVER_METHOD_SESSION_FILE_GET_OR_CREATE,
    params: "required",
  },
  {
    name: "updateSessionFileMeta",
    method: constants.APP_SERVER_METHOD_SESSION_FILE_UPDATE_META,
    params: "required",
  },
  {
    name: "saveSessionFile",
    method: constants.APP_SERVER_METHOD_SESSION_FILE_SAVE,
    params: "required",
  },
  {
    name: "readSessionFile",
    method: constants.APP_SERVER_METHOD_SESSION_FILE_READ,
    params: "required",
  },
  {
    name: "resolveSessionFilePath",
    method: constants.APP_SERVER_METHOD_SESSION_FILE_RESOLVE_PATH,
    params: "required",
  },
  {
    name: "deleteSessionFile",
    method: constants.APP_SERVER_METHOD_SESSION_FILE_DELETE,
    params: "required",
  },
  {
    name: "listSessionFiles",
    method: constants.APP_SERVER_METHOD_SESSION_FILE_LIST,
    params: "required",
  },
  {
    name: "startTurn",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_TURN_START,
    params: "required",
  },
  {
    name: "cancelTurn",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_TURN_CANCEL,
    params: "required",
  },
  {
    name: "appendAgentSessionRuntimeEvents",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
    params: "required",
  },
  {
    name: "respondAction",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
    params: "required",
  },
  {
    name: "replayAction",
    method: constants.APP_SERVER_METHOD_AGENT_SESSION_ACTION_REPLAY,
    params: "required",
  },
  {
    name: "listLogs",
    method: constants.APP_SERVER_METHOD_LOG_LIST,
    params: "none",
  },
  {
    name: "readPersistedLogTail",
    method: constants.APP_SERVER_METHOD_LOG_PERSISTED_TAIL,
    params: "required",
  },
  {
    name: "clearLogs",
    method: constants.APP_SERVER_METHOD_LOG_CLEAR,
    params: "none",
  },
  {
    name: "clearDiagnosticLogHistory",
    method: constants.APP_SERVER_METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR,
    params: "none",
  },
  {
    name: "readLogStorageDiagnostics",
    method: constants.APP_SERVER_METHOD_DIAGNOSTICS_LOG_STORAGE_READ,
    params: "none",
  },
  {
    name: "exportSupportBundle",
    method: constants.APP_SERVER_METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT,
    params: "optional-empty",
  },
  {
    name: "readServerDiagnostics",
    method: constants.APP_SERVER_METHOD_DIAGNOSTICS_SERVER_READ,
    params: "none",
  },
  {
    name: "readWindowsStartupDiagnostics",
    method: constants.APP_SERVER_METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ,
    params: "none",
  },
  {
    name: "listDiagnosticsTraces",
    method: constants.APP_SERVER_METHOD_DIAGNOSTICS_TRACE_LIST,
    params: "required",
  },
  {
    name: "readDiagnosticsTrace",
    method: constants.APP_SERVER_METHOD_DIAGNOSTICS_TRACE_READ,
    params: "required",
  },
  {
    name: "exportDiagnosticsTrace",
    method: constants.APP_SERVER_METHOD_DIAGNOSTICS_TRACE_EXPORT,
    params: "required",
  },
  {
    name: "readGatewayChannelStatus",
    method: constants.APP_SERVER_METHOD_GATEWAY_CHANNEL_STATUS,
    params: "required",
  },
  {
    name: "startGatewayChannel",
    method: constants.APP_SERVER_METHOD_GATEWAY_CHANNEL_START,
    params: "required",
  },
  {
    name: "stopGatewayChannel",
    method: constants.APP_SERVER_METHOD_GATEWAY_CHANNEL_STOP,
    params: "required",
  },
  {
    name: "probeTelegramChannel",
    method: constants.APP_SERVER_METHOD_TELEGRAM_CHANNEL_PROBE,
    params: "optional-empty",
  },
  {
    name: "probeFeishuChannel",
    method: constants.APP_SERVER_METHOD_FEISHU_CHANNEL_PROBE,
    params: "optional-empty",
  },
  {
    name: "probeDiscordChannel",
    method: constants.APP_SERVER_METHOD_DISCORD_CHANNEL_PROBE,
    params: "optional-empty",
  },
  {
    name: "probeWechatChannel",
    method: constants.APP_SERVER_METHOD_WECHAT_CHANNEL_PROBE,
    params: "optional-empty",
  },
  {
    name: "startWechatChannelLogin",
    method: constants.APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_START,
    params: "optional-empty",
  },
  {
    name: "waitWechatChannelLogin",
    method: constants.APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_WAIT,
    params: "required",
  },
  {
    name: "listWechatChannelAccounts",
    method: constants.APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
    params: "none",
  },
  {
    name: "removeWechatChannelAccount",
    method: constants.APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
    params: "required",
  },
  {
    name: "setWechatChannelRuntimeModel",
    method: constants.APP_SERVER_METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
    params: "required",
  },
  {
    name: "probeGatewayTunnel",
    method: constants.APP_SERVER_METHOD_GATEWAY_TUNNEL_PROBE,
    params: "none",
  },
  {
    name: "detectGatewayTunnelCloudflared",
    method: constants.APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
    params: "none",
  },
  {
    name: "installGatewayTunnelCloudflared",
    method: constants.APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
    params: "required",
  },
  {
    name: "createGatewayTunnel",
    method: constants.APP_SERVER_METHOD_GATEWAY_TUNNEL_CREATE,
    params: "required",
  },
  {
    name: "startGatewayTunnel",
    method: constants.APP_SERVER_METHOD_GATEWAY_TUNNEL_START,
    params: "none",
  },
  {
    name: "stopGatewayTunnel",
    method: constants.APP_SERVER_METHOD_GATEWAY_TUNNEL_STOP,
    params: "none",
  },
  {
    name: "restartGatewayTunnel",
    method: constants.APP_SERVER_METHOD_GATEWAY_TUNNEL_RESTART,
    params: "none",
  },
  {
    name: "readGatewayTunnelStatus",
    method: constants.APP_SERVER_METHOD_GATEWAY_TUNNEL_STATUS,
    params: "none",
  },
  {
    name: "syncGatewayTunnelWebhookUrl",
    method: constants.APP_SERVER_METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
    params: "required",
  },
  {
    name: "createImageMediaTaskArtifact",
    method: constants.APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
    params: "required",
  },
  {
    name: "createAudioMediaTaskArtifact",
    method: constants.APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE,
    params: "required",
  },
  {
    name: "createVideoMediaTaskArtifact",
    method: constants.APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE,
    params: "required",
  },
  {
    name: "completeAudioMediaTaskArtifact",
    method: constants.APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE,
    params: "required",
  },
  {
    name: "getMediaTaskArtifact",
    method: constants.APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET,
    params: "required",
  },
  {
    name: "listMediaTaskArtifacts",
    method: constants.APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST,
    params: "required",
  },
  {
    name: "cancelMediaTaskArtifact",
    method: constants.APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_CANCEL,
    params: "required",
  },
  {
    name: "getGalleryMaterial",
    method: constants.APP_SERVER_METHOD_GALLERY_MATERIAL_GET,
    params: "required",
  },
  {
    name: "createGalleryMaterialMetadata",
    method: constants.APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_CREATE,
    params: "required",
  },
  {
    name: "getGalleryMaterialMetadata",
    method: constants.APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_GET,
    params: "required",
  },
  {
    name: "updateGalleryMaterialMetadata",
    method: constants.APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_UPDATE,
    params: "required",
  },
  {
    name: "deleteGalleryMaterialMetadata",
    method: constants.APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_DELETE,
    params: "required",
  },
  {
    name: "listGalleryMaterialsByImageCategory",
    method: constants.APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY,
    params: "required",
  },
  {
    name: "listGalleryMaterialsByLayoutCategory",
    method:
      constants.APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY,
    params: "required",
  },
  {
    name: "listGalleryMaterialsByMood",
    method: constants.APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_MOOD,
    params: "required",
  },
  {
    name: "listProjectMaterials",
    method: constants.APP_SERVER_METHOD_PROJECT_MATERIAL_LIST,
    params: "required",
  },
  {
    name: "getProjectMaterial",
    method: constants.APP_SERVER_METHOD_PROJECT_MATERIAL_GET,
    params: "required",
  },
  {
    name: "countProjectMaterials",
    method: constants.APP_SERVER_METHOD_PROJECT_MATERIAL_COUNT,
    params: "required",
  },
  {
    name: "uploadProjectMaterial",
    method: constants.APP_SERVER_METHOD_PROJECT_MATERIAL_UPLOAD,
    params: "required",
  },
  {
    name: "importProjectMaterialFromUrl",
    method: constants.APP_SERVER_METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL,
    params: "required",
  },
  {
    name: "updateProjectMaterial",
    method: constants.APP_SERVER_METHOD_PROJECT_MATERIAL_UPDATE,
    params: "required",
  },
  {
    name: "deleteProjectMaterial",
    method: constants.APP_SERVER_METHOD_PROJECT_MATERIAL_DELETE,
    params: "required",
  },
  {
    name: "readProjectMaterialContent",
    method: constants.APP_SERVER_METHOD_PROJECT_MATERIAL_CONTENT,
    params: "required",
  },
  {
    name: "listVoiceAsrCredentials",
    method: constants.APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_LIST,
    params: "none",
  },
  {
    name: "createVoiceAsrCredential",
    method: constants.APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_CREATE,
    params: "required",
  },
  {
    name: "updateVoiceAsrCredential",
    method: constants.APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_UPDATE,
    params: "required",
  },
  {
    name: "deleteVoiceAsrCredential",
    method: constants.APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_DELETE,
    params: "required",
  },
  {
    name: "setDefaultVoiceAsrCredential",
    method: constants.APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET,
    params: "required",
  },
  {
    name: "testVoiceAsrCredential",
    method: constants.APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_TEST,
    params: "required",
  },
  {
    name: "listVoiceInstructions",
    method: constants.APP_SERVER_METHOD_VOICE_INSTRUCTION_LIST,
    params: "none",
  },
  {
    name: "saveVoiceInstruction",
    method: constants.APP_SERVER_METHOD_VOICE_INSTRUCTION_SAVE,
    params: "required",
  },
  {
    name: "deleteVoiceInstruction",
    method: constants.APP_SERVER_METHOD_VOICE_INSTRUCTION_DELETE,
    params: "required",
  },
  {
    name: "setDefaultVoiceModel",
    method: constants.APP_SERVER_METHOD_VOICE_MODEL_DEFAULT_SET,
    params: "required",
  },
  {
    name: "testTranscribeVoiceModelFile",
    method: constants.APP_SERVER_METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE,
    params: "required",
  },
  {
    name: "readUsageStats",
    method: constants.APP_SERVER_METHOD_USAGE_STATS_READ,
    params: "required",
  },
  {
    name: "listUsageStatsModelRanking",
    method: constants.APP_SERVER_METHOD_USAGE_STATS_MODEL_RANKING_LIST,
    params: "required",
  },
  {
    name: "listUsageStatsDailyTrends",
    method: constants.APP_SERVER_METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
    params: "required",
  },
];

export function installAppServerClientMethods(prototype: object): void {
  for (const spec of APP_SERVER_CLIENT_METHODS) {
    Object.defineProperty(prototype, spec.name, {
      configurable: true,
      value: function (this: AppServerClientRequestRunner, params?: unknown) {
        if (spec.params === "none") {
          return this.request(spec.method, {});
        }
        if (spec.params === "optional-empty") {
          return this.request(spec.method, params ?? {});
        }
        return this.request(spec.method, params);
      },
    });
  }
}
