import {
  type AgentRuntimeBridgeInvoke,
  type AgentRuntimeCommandInvoke,
  type AgentRuntimeTransportDeps,
} from "./transport";
import type { AppServerSessionRpcClient } from "./appServerSessionClient";
import type { AgentRuntimeEvidenceExportAppServerClient } from "./exportClient";
import type { AgentRuntimeWorkspaceSkillBindingsAppServerClient } from "./inventoryClient";
import type { AgentRuntimeThreadClientDeps } from "./threadClient";
export type AgentRuntimeAppServerClient =
  AgentRuntimeThreadClientDeps["appServerClient"] &
    AppServerSessionRpcClient &
    AgentRuntimeEvidenceExportAppServerClient &
    AgentRuntimeWorkspaceSkillBindingsAppServerClient;
export interface AgentRuntimeClientDeps extends AgentRuntimeTransportDeps {
  bridgeInvoke?: AgentRuntimeBridgeInvoke;
  invokeCommand?: AgentRuntimeCommandInvoke;
  appServerClient?: AgentRuntimeAppServerClient;
  isAppServerTurnLifecycleAvailable?: AgentRuntimeThreadClientDeps["isAppServerTurnLifecycleAvailable"];
}
export declare function createAgentRuntimeClient({
  appServerClient,
  bridgeInvoke,
  invoke,
  invokeCommand,
  isAppServerTurnLifecycleAvailable,
}?: AgentRuntimeClientDeps): {
  compactAgentRuntimeSession: (
    request: import("./types").AgentRuntimeCompactSessionRequest,
  ) => Promise<void>;
  diffAgentRuntimeFileCheckpoint: (
    request: import("./types").AgentRuntimeDiffFileCheckpointRequest,
  ) => Promise<import("./types").AgentRuntimeFileCheckpointDiffResult>;
  getAgentRuntimeFileCheckpoint: (
    request: import("./types").AgentRuntimeGetFileCheckpointRequest,
  ) => Promise<import("./types").AgentRuntimeFileCheckpointDetail>;
  getAgentRuntimeThreadRead: (
    sessionId: string,
  ) => Promise<import("./types").AgentRuntimeThreadReadModel>;
  interruptAgentRuntimeTurn: (
    request: import("./types").AgentRuntimeInterruptTurnRequest,
  ) => Promise<boolean>;
  listAgentRuntimeFileCheckpoints: (
    request: import("./types").AgentRuntimeListFileCheckpointsRequest,
  ) => Promise<import("./types").AgentRuntimeFileCheckpointListResult>;
  promoteAgentRuntimeQueuedTurn: (
    request: import("./types").AgentRuntimePromoteQueuedTurnRequest,
  ) => Promise<boolean>;
  removeAgentRuntimeQueuedTurn: (
    request: import("./types").AgentRuntimeRemoveQueuedTurnRequest,
  ) => Promise<boolean>;
  replayAgentRuntimeRequest: (
    request: import("./types").AgentRuntimeReplayRequestRequest,
  ) => Promise<import("./types").AgentRuntimeReplayedActionRequiredView | null>;
  respondAgentRuntimeAction: (
    request: import("./types").AgentRuntimeRespondActionRequest,
  ) => Promise<void>;
  resumeAgentRuntimeThread: (
    request: import("./types").AgentRuntimeResumeThreadRequest,
  ) => Promise<boolean>;
  submitAgentRuntimeTurn: (
    request: import("./types").AgentRuntimeSubmitTurnRequest,
  ) => Promise<void>;
  closeAgentRuntimeSubagent: (
    request: import("./types").AgentRuntimeCloseSubagentRequest,
  ) => Promise<import("./types").AgentRuntimeCloseSubagentResponse>;
  resumeAgentRuntimeSubagent: (
    request: import("./types").AgentRuntimeResumeSubagentRequest,
  ) => Promise<import("./types").AgentRuntimeResumeSubagentResponse>;
  sendAgentRuntimeSubagentInput: (
    request: import("./types").AgentRuntimeSendSubagentInputRequest,
  ) => Promise<import("./types").AgentRuntimeSendSubagentInputResponse>;
  spawnAgentRuntimeSubagent: (
    request: import("./types").AgentRuntimeSpawnSubagentRequest,
  ) => Promise<import("./types").AgentRuntimeSpawnSubagentResponse>;
  waitAgentRuntimeSubagents: (
    request: import("./types").AgentRuntimeWaitSubagentsRequest,
  ) => Promise<import("./types").AgentRuntimeWaitSubagentsResponse>;
  siteApplyAdapterCatalogBootstrap: (
    payload: unknown,
  ) => Promise<import("../../webview-api").SiteAdapterCatalogStatus>;
  siteClearAdapterCatalogCache: () => Promise<
    import("../../webview-api").SiteAdapterCatalogStatus
  >;
  siteDebugRunAdapter: (
    request: import("../../webview-api").RunSiteAdapterRequest,
  ) => Promise<import("../../webview-api").SiteAdapterRunResult>;
  siteGetAdapterCatalogStatus: () => Promise<
    import("../../webview-api").SiteAdapterCatalogStatus
  >;
  siteGetAdapterInfo: (
    name: string,
  ) => Promise<import("../../webview-api").SiteAdapterDefinition>;
  siteGetAdapterLaunchReadiness: (
    request: import("../../webview-api").SiteAdapterLaunchReadinessRequest,
  ) => Promise<import("../../webview-api").SiteAdapterLaunchReadinessResult>;
  siteImportAdapterYamlBundle: (
    request: import("../../webview-api").SiteAdapterImportYamlBundleRequest,
  ) => Promise<import("../../webview-api").SiteAdapterImportResult>;
  siteListAdapters: () => Promise<
    import("../../webview-api").SiteAdapterDefinition[]
  >;
  siteRecommendAdapters: (
    limit?: number,
  ) => Promise<import("../../webview-api").SiteAdapterRecommendation[]>;
  siteRunAdapter: (
    request: import("../../webview-api").RunSiteAdapterRequest,
  ) => Promise<import("../../webview-api").SiteAdapterRunResult>;
  siteSaveAdapterResult: (
    request: import("../../webview-api").SaveSiteAdapterResultRequest,
  ) => Promise<import("../../webview-api").SavedSiteAdapterContent>;
  siteSearchAdapters: (
    query: string,
  ) => Promise<import("../../webview-api").SiteAdapterDefinition[]>;
  createAgentRuntimeSession: (
    workspaceId: string,
    name?: string,
    executionStrategy?: import("./types").AsterExecutionStrategy,
    options?: import("./types").AgentRuntimeCreateSessionOptions,
  ) => Promise<string>;
  deleteAgentRuntimeSession: (sessionId: string) => Promise<void>;
  getAgentRuntimeSession: (
    sessionId: string,
    options?: import("./types").AgentRuntimeGetSessionOptions,
  ) => Promise<import("./types").AsterSessionDetail>;
  listAgentRuntimeSessions: (
    options?: import("./types").AgentRuntimeListSessionsOptions,
  ) => Promise<import("./types").AsterSessionInfo[]>;
  updateAgentRuntimeSession: (
    request: import("./types").AgentRuntimeUpdateSessionRequest,
  ) => Promise<void>;
  cancelMediaTaskArtifact: (
    request: import("./types").MediaTaskLookupRequest,
  ) => Promise<import("./types").MediaTaskArtifactOutput>;
  completeAudioGenerationTaskArtifact: (
    request: import("./types").CompleteAudioGenerationTaskArtifactRequest,
  ) => Promise<import("./types").MediaTaskArtifactOutput>;
  createAudioGenerationTaskArtifact: (
    request: import("./types").CreateAudioGenerationTaskArtifactRequest,
  ) => Promise<import("./types").MediaTaskArtifactOutput>;
  createImageGenerationTaskArtifact: (
    request: import("./types").CreateImageGenerationTaskArtifactRequest,
  ) => Promise<import("./types").MediaTaskArtifactOutput>;
  getMediaTaskArtifact: (
    request: import("./types").MediaTaskLookupRequest,
  ) => Promise<import("./types").MediaTaskArtifactOutput>;
  listMediaTaskArtifacts: (
    request: import("./types").ListMediaTaskArtifactsRequest,
  ) => Promise<import("./types").ListMediaTaskArtifactsOutput>;
  getAgentRuntimeToolInventory: (
    request?: import("./types").AgentRuntimeToolInventoryRequest,
  ) => Promise<import("./types").AgentRuntimeToolInventory>;
  listWorkspaceSkillBindings: (
    request: import("./types").AgentRuntimeListWorkspaceSkillBindingsRequest,
  ) => Promise<import("./types").AgentRuntimeWorkspaceSkillBindings>;
  auditAgentRuntimeObjective: (
    request: import("./types").AgentRuntimeObjectiveSessionRequest,
  ) => Promise<import("./types").ManagedObjective>;
  clearAgentRuntimeObjective: (
    request: import("./types").AgentRuntimeObjectiveSessionRequest,
  ) => Promise<import("./types").AgentRuntimeClearObjectiveResult>;
  continueAgentRuntimeObjective: (
    request: import("./types").AgentRuntimeObjectiveSessionRequest,
  ) => Promise<import("./types").AgentRuntimeContinueObjectiveResult>;
  getAgentRuntimeObjective: (
    sessionId: string,
  ) => Promise<import("./types").ManagedObjective | null>;
  setAgentRuntimeObjective: (
    request: import("./types").AgentRuntimeSetObjectiveRequest,
  ) => Promise<import("./types").ManagedObjective>;
  updateAgentRuntimeObjectiveStatus: (
    request: import("./types").AgentRuntimeUpdateObjectiveStatusRequest,
  ) => Promise<import("./types").ManagedObjective | null>;
  exportAgentRuntimeAnalysisHandoff: (
    sessionId: string,
  ) => Promise<import("./types").AgentRuntimeAnalysisHandoff>;
  exportAgentRuntimeEvidencePack: (
    sessionId: string,
  ) => Promise<import("./types").AgentRuntimeEvidencePack>;
  exportAgentRuntimeHandoffBundle: (
    sessionId: string,
  ) => Promise<import("./types").AgentRuntimeHandoffBundle>;
  exportAgentRuntimeReplayCase: (
    sessionId: string,
  ) => Promise<import("./types").AgentRuntimeReplayCase>;
  exportAgentRuntimeReviewDecisionTemplate: (
    sessionId: string,
  ) => Promise<import("./types").AgentRuntimeReviewDecisionTemplate>;
  saveAgentRuntimeReviewDecision: (
    request: import("./types").AgentRuntimeSaveReviewDecisionRequest,
  ) => Promise<import("./types").AgentRuntimeReviewDecisionTemplate>;
  configureAsterProvider: (
    config: import("./types").AsterProviderConfig,
    sessionId: string,
  ) => Promise<import("./types").AsterAgentStatus>;
  generateAgentRuntimeTitleResult: (
    request: import("./agentClient").GenerateAgentRuntimeTitleRequest,
  ) => Promise<import("./types").AgentRuntimeGeneratedTitleResult>;
  generateAgentRuntimeTitle: (
    request: import("./agentClient").GenerateAgentRuntimeTitleRequest,
  ) => Promise<string>;
  generateAgentRuntimeSessionTitle: (
    sessionId: string,
    previewText?: string,
  ) => Promise<string>;
  getAgentProcessStatus: () => Promise<import("./types").AgentProcessStatus>;
  getAsterAgentStatus: () => Promise<import("./types").AsterAgentStatus>;
  initAsterAgent: () => Promise<import("./types").AsterAgentStatus>;
  startAgentProcess: () => Promise<import("./types").AgentProcessStatus>;
  stopAgentProcess: () => Promise<void>;
};
export type AgentRuntimeClient = ReturnType<typeof createAgentRuntimeClient>;
