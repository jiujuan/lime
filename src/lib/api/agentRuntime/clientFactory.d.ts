import {
  type AgentRuntimeBridgeInvoke,
  type AgentRuntimeCommandInvoke,
  type AgentRuntimeTransportDeps,
} from "./transport";
import type { AppServerSessionRpcClient } from "./appServerSessionClient";
import type { AgentRuntimeEvidenceExportAppServerClient } from "./exportClient";
import type { AgentRuntimeWorkspaceSkillBindingsAppServerClient } from "./inventoryClient";
import type { AgentRuntimeObjectiveAppServerClient } from "./objectiveClient";
import type { AgentRuntimeThreadClientDeps } from "./threadClient";
export type AgentRuntimeAppServerClient =
  AgentRuntimeThreadClientDeps["appServerClient"] &
    AppServerSessionRpcClient &
    AgentRuntimeEvidenceExportAppServerClient &
    AgentRuntimeObjectiveAppServerClient &
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
    request: import("./requestTypes").AgentRuntimeCompactSessionRequest,
  ) => Promise<void>;
  diffAgentRuntimeFileCheckpoint: (
    request: import("./requestTypes").AgentRuntimeDiffFileCheckpointRequest,
  ) => Promise<import("./sessionTypes").AgentRuntimeFileCheckpointDiffResult>;
  getAgentRuntimeFileCheckpoint: (
    request: import("./requestTypes").AgentRuntimeGetFileCheckpointRequest,
  ) => Promise<import("./sessionTypes").AgentRuntimeFileCheckpointDetail>;
  getAgentRuntimeThreadRead: (
    sessionId: string,
  ) => Promise<import("./sessionTypes").AgentRuntimeThreadReadModel>;
  interruptAgentRuntimeTurn: (
    request: import("./requestTypes").AgentRuntimeInterruptTurnRequest,
  ) => Promise<boolean>;
  listAgentRuntimeFileCheckpoints: (
    request: import("./requestTypes").AgentRuntimeListFileCheckpointsRequest,
  ) => Promise<import("./sessionTypes").AgentRuntimeFileCheckpointListResult>;
  promoteAgentRuntimeQueuedTurn: (
    request: import("./requestTypes").AgentRuntimePromoteQueuedTurnRequest,
  ) => Promise<boolean>;
  removeAgentRuntimeQueuedTurn: (
    request: import("./requestTypes").AgentRuntimeRemoveQueuedTurnRequest,
  ) => Promise<boolean>;
  replayAgentRuntimeRequest: (
    request: import("./requestTypes").AgentRuntimeReplayRequestRequest,
  ) => Promise<
    import("./requestTypes").AgentRuntimeReplayedActionRequiredView | null
  >;
  respondAgentRuntimeAction: (
    request: import("./requestTypes").AgentRuntimeRespondActionRequest,
  ) => Promise<void>;
  resumeAgentRuntimeThread: (
    request: import("./requestTypes").AgentRuntimeResumeThreadRequest,
  ) => Promise<boolean>;
  submitAgentRuntimeTurn: (
    request: import("@/lib/api/appServer").AppServerAgentSessionTurnStartParams,
  ) => Promise<void>;
  createAgentRuntimeSession: (
    workspaceId?: string,
    name?: string,
    executionStrategy?: import("../agentExecutionRuntime").AgentExecutionStrategy,
    options?: import("./requestTypes").AgentRuntimeCreateSessionOptions,
  ) => Promise<string>;
  deleteAgentRuntimeSession: (sessionId: string) => Promise<void>;
  getAgentRuntimeSession: (
    sessionId: string,
    options?: import("./requestTypes").AgentRuntimeGetSessionOptions,
  ) => Promise<import("./sessionTypes").AgentSessionDetail>;
  listAgentRuntimeSessions: (
    options?: import("./sessionTypes").AgentRuntimeListSessionsOptions,
  ) => Promise<import("./sessionTypes").AgentSessionInfo[]>;
  updateAgentRuntimeSession: (
    request: import("./requestTypes").AgentRuntimeUpdateSessionRequest,
  ) => Promise<void>;
  getAgentRuntimeToolInventory: (
    request?: import("./toolInventoryTypes").AgentRuntimeToolInventoryRequest,
  ) => Promise<import("./toolInventoryTypes").AgentRuntimeToolInventory>;
  listWorkspaceSkillBindings: (
    request: import("./toolInventoryTypes").AgentRuntimeListWorkspaceSkillBindingsRequest,
  ) => Promise<
    import("./toolInventoryTypes").AgentRuntimeWorkspaceSkillBindings
  >;
  auditAgentRuntimeObjective: (
    request: import("./sessionTypes").AgentRuntimeObjectiveSessionRequest,
  ) => Promise<import("./sessionTypes").ManagedObjective>;
  clearAgentRuntimeObjective: (
    request: import("./sessionTypes").AgentRuntimeObjectiveSessionRequest,
  ) => Promise<import("./sessionTypes").AgentRuntimeClearObjectiveResult>;
  continueAgentRuntimeObjective: (
    request: import("./sessionTypes").AgentRuntimeObjectiveSessionRequest,
  ) => Promise<import("./sessionTypes").AgentRuntimeContinueObjectiveResult>;
  getAgentRuntimeObjective: (
    sessionId: string,
  ) => Promise<import("./sessionTypes").ManagedObjective | null>;
  setAgentRuntimeObjective: (
    request: import("./sessionTypes").AgentRuntimeSetObjectiveRequest,
  ) => Promise<import("./sessionTypes").ManagedObjective>;
  updateAgentRuntimeObjectiveStatus: (
    request: import("./sessionTypes").AgentRuntimeUpdateObjectiveStatusRequest,
  ) => Promise<import("./sessionTypes").ManagedObjective | null>;
  exportAgentRuntimeAnalysisHandoff: (
    sessionId: string,
    options?: import("./exportClient").AgentRuntimeExportOptions,
  ) => Promise<import("./evidenceTypes").AgentRuntimeAnalysisHandoff>;
  exportAgentRuntimeEvidencePack: (
    sessionId: string,
  ) => Promise<import("./evidenceTypes").AgentRuntimeEvidencePack>;
  exportAgentRuntimeHandoffBundle: (
    sessionId: string,
    options?: import("./exportClient").AgentRuntimeExportOptions,
  ) => Promise<import("./evidenceTypes").AgentRuntimeHandoffBundle>;
  exportAgentRuntimeReplayCase: (
    sessionId: string,
    options?: import("./exportClient").AgentRuntimeExportOptions,
  ) => Promise<import("./evidenceTypes").AgentRuntimeReplayCase>;
  exportAgentRuntimeReviewDecisionTemplate: (
    sessionId: string,
    options?: import("./exportClient").AgentRuntimeExportOptions,
  ) => Promise<import("./evidenceTypes").AgentRuntimeReviewDecisionTemplate>;
  saveAgentRuntimeReviewDecision: (
    request: import("./evidenceTypes").AgentRuntimeSaveReviewDecisionRequest,
  ) => Promise<import("./evidenceTypes").AgentRuntimeReviewDecisionTemplate>;
  generateAgentRuntimeTitleResult: (
    request: import("./agentClient").GenerateAgentRuntimeTitleRequest,
  ) => Promise<import("./sessionTypes").AgentRuntimeGeneratedTitleResult>;
  generateAgentRuntimeTitle: (
    request: import("./agentClient").GenerateAgentRuntimeTitleRequest,
  ) => Promise<string>;
  generateAgentRuntimeSessionTitle: (
    sessionId: string,
    previewText?: string,
  ) => Promise<string>;
  getRuntimeProviderSelection: () => Promise<
    import("./sessionTypes").RuntimeProviderSelection
  >;
};
export type AgentRuntimeClient = ReturnType<typeof createAgentRuntimeClient>;
