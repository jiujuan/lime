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
    request: import("@/lib/api/appServer").AppServerAgentSessionTurnStartParams,
  ) => Promise<void>;
  createAgentRuntimeSession: (
    workspaceId?: string,
    name?: string,
    executionStrategy?: import("./types").AgentExecutionStrategy,
    options?: import("./types").AgentRuntimeCreateSessionOptions,
  ) => Promise<string>;
  deleteAgentRuntimeSession: (sessionId: string) => Promise<void>;
  getAgentRuntimeSession: (
    sessionId: string,
    options?: import("./types").AgentRuntimeGetSessionOptions,
  ) => Promise<import("./types").AgentSessionDetail>;
  listAgentRuntimeSessions: (
    options?: import("./types").AgentRuntimeListSessionsOptions,
  ) => Promise<import("./types").AgentSessionInfo[]>;
  updateAgentRuntimeSession: (
    request: import("./types").AgentRuntimeUpdateSessionRequest,
  ) => Promise<void>;
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
    options?: import("./exportClient").AgentRuntimeExportOptions,
  ) => Promise<import("./types").AgentRuntimeAnalysisHandoff>;
  exportAgentRuntimeEvidencePack: (
    sessionId: string,
  ) => Promise<import("./types").AgentRuntimeEvidencePack>;
  exportAgentRuntimeHandoffBundle: (
    sessionId: string,
    options?: import("./exportClient").AgentRuntimeExportOptions,
  ) => Promise<import("./types").AgentRuntimeHandoffBundle>;
  exportAgentRuntimeReplayCase: (
    sessionId: string,
    options?: import("./exportClient").AgentRuntimeExportOptions,
  ) => Promise<import("./types").AgentRuntimeReplayCase>;
  exportAgentRuntimeReviewDecisionTemplate: (
    sessionId: string,
    options?: import("./exportClient").AgentRuntimeExportOptions,
  ) => Promise<import("./types").AgentRuntimeReviewDecisionTemplate>;
  saveAgentRuntimeReviewDecision: (
    request: import("./types").AgentRuntimeSaveReviewDecisionRequest,
  ) => Promise<import("./types").AgentRuntimeReviewDecisionTemplate>;
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
  getRuntimeProviderSelection: () => Promise<import("./types").RuntimeProviderSelection>;
};
export type AgentRuntimeClient = ReturnType<typeof createAgentRuntimeClient>;
