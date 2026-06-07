import { AppServerClient, type AppServerAgentSessionActionRespondParams, type AppServerAgentSessionTurnStartParams, type AppServerJsonRpcNotification } from "@/lib/api/appServer";
import { type AgentRuntimeCommandInvoke } from "./transport";
import type { AgentRuntimeCompactSessionRequest, AgentRuntimeDiffFileCheckpointRequest, AgentRuntimeFileCheckpointDetail, AgentRuntimeFileCheckpointDiffResult, AgentRuntimeFileCheckpointListResult, AgentRuntimeFileCheckpointRestoreResult, AgentRuntimeGetFileCheckpointRequest, AgentRuntimeInterruptTurnRequest, AgentRuntimeListFileCheckpointsRequest, AgentRuntimePromoteQueuedTurnRequest, AgentRuntimeRemoveQueuedTurnRequest, AgentRuntimeReplayRequestRequest, AgentRuntimeReplayedActionRequiredView, AgentRuntimeRespondActionRequest, AgentRuntimeRestoreFileCheckpointRequest, AgentRuntimeResumeThreadRequest, AgentRuntimeSubmitTurnRequest, AgentRuntimeThreadReadModel } from "./types";
export type AgentRuntimeAppServerClient = Pick<AppServerClient, "readSession" | "startTurn" | "cancelTurn" | "respondAction" | "drainEvents">;
export interface AgentRuntimeThreadClientDeps {
    invokeCommand?: AgentRuntimeCommandInvoke;
    appServerClient?: AgentRuntimeAppServerClient;
    isAppServerTurnLifecycleAvailable?: () => boolean;
    enableAppServerEventDrain?: boolean;
}
export declare function createThreadClient({ invokeCommand, appServerClient, isAppServerTurnLifecycleAvailable, enableAppServerEventDrain, }?: AgentRuntimeThreadClientDeps): {
    compactAgentRuntimeSession: (request: AgentRuntimeCompactSessionRequest) => Promise<void>;
    diffAgentRuntimeFileCheckpoint: (request: AgentRuntimeDiffFileCheckpointRequest) => Promise<AgentRuntimeFileCheckpointDiffResult>;
    getAgentRuntimeFileCheckpoint: (request: AgentRuntimeGetFileCheckpointRequest) => Promise<AgentRuntimeFileCheckpointDetail>;
    getAgentRuntimeThreadRead: (sessionId: string) => Promise<AgentRuntimeThreadReadModel>;
    interruptAgentRuntimeTurn: (request: AgentRuntimeInterruptTurnRequest) => Promise<boolean>;
    listAgentRuntimeFileCheckpoints: (request: AgentRuntimeListFileCheckpointsRequest) => Promise<AgentRuntimeFileCheckpointListResult>;
    promoteAgentRuntimeQueuedTurn: (request: AgentRuntimePromoteQueuedTurnRequest) => Promise<boolean>;
    removeAgentRuntimeQueuedTurn: (request: AgentRuntimeRemoveQueuedTurnRequest) => Promise<boolean>;
    replayAgentRuntimeRequest: (request: AgentRuntimeReplayRequestRequest) => Promise<AgentRuntimeReplayedActionRequiredView | null>;
    respondAgentRuntimeAction: (request: AgentRuntimeRespondActionRequest) => Promise<void>;
    restoreAgentRuntimeFileCheckpoint: (request: AgentRuntimeRestoreFileCheckpointRequest) => Promise<AgentRuntimeFileCheckpointRestoreResult>;
    resumeAgentRuntimeThread: (request: AgentRuntimeResumeThreadRequest) => Promise<boolean>;
    submitAgentRuntimeTurn: (request: AgentRuntimeSubmitTurnRequest) => Promise<void>;
};
export declare function publishAppServerAgentSessionNotifications(eventName: string | undefined, notifications: AppServerJsonRpcNotification[] | undefined): void;
export declare function projectAppServerAgentEventPayload(notification: AppServerJsonRpcNotification): Record<string, unknown> | null;
export declare function appServerTurnStartParamsFromRequest(request: AgentRuntimeSubmitTurnRequest): AppServerAgentSessionTurnStartParams;
export declare function appServerActionRespondParamsFromRequest(request: AgentRuntimeRespondActionRequest): AppServerAgentSessionActionRespondParams;
export declare const compactAgentRuntimeSession: (request: AgentRuntimeCompactSessionRequest) => Promise<void>, diffAgentRuntimeFileCheckpoint: (request: AgentRuntimeDiffFileCheckpointRequest) => Promise<AgentRuntimeFileCheckpointDiffResult>, getAgentRuntimeFileCheckpoint: (request: AgentRuntimeGetFileCheckpointRequest) => Promise<AgentRuntimeFileCheckpointDetail>, getAgentRuntimeThreadRead: (sessionId: string) => Promise<AgentRuntimeThreadReadModel>, interruptAgentRuntimeTurn: (request: AgentRuntimeInterruptTurnRequest) => Promise<boolean>, listAgentRuntimeFileCheckpoints: (request: AgentRuntimeListFileCheckpointsRequest) => Promise<AgentRuntimeFileCheckpointListResult>, promoteAgentRuntimeQueuedTurn: (request: AgentRuntimePromoteQueuedTurnRequest) => Promise<boolean>, removeAgentRuntimeQueuedTurn: (request: AgentRuntimeRemoveQueuedTurnRequest) => Promise<boolean>, replayAgentRuntimeRequest: (request: AgentRuntimeReplayRequestRequest) => Promise<AgentRuntimeReplayedActionRequiredView | null>, respondAgentRuntimeAction: (request: AgentRuntimeRespondActionRequest) => Promise<void>, restoreAgentRuntimeFileCheckpoint: (request: AgentRuntimeRestoreFileCheckpointRequest) => Promise<AgentRuntimeFileCheckpointRestoreResult>, resumeAgentRuntimeThread: (request: AgentRuntimeResumeThreadRequest) => Promise<boolean>, submitAgentRuntimeTurn: (request: AgentRuntimeSubmitTurnRequest) => Promise<void>;
