import { type AgentRuntimeCommandInvoke } from "./transport";
import type { AgentRuntimeCompactSessionRequest, AgentRuntimeDiffFileCheckpointRequest, AgentRuntimeFileCheckpointDetail, AgentRuntimeFileCheckpointDiffResult, AgentRuntimeFileCheckpointListResult, AgentRuntimeGetFileCheckpointRequest, AgentRuntimeInterruptTurnRequest, AgentRuntimeListFileCheckpointsRequest, AgentRuntimePromoteQueuedTurnRequest, AgentRuntimeRemoveQueuedTurnRequest, AgentRuntimeReplayRequestRequest, AgentRuntimeReplayedActionRequiredView, AgentRuntimeRespondActionRequest, AgentRuntimeResumeThreadRequest, AgentRuntimeSubmitTurnRequest, AgentRuntimeThreadReadModel } from "./types";
export interface AgentRuntimeThreadClientDeps {
    invokeCommand?: AgentRuntimeCommandInvoke;
}
export declare function createThreadClient({ invokeCommand, }?: AgentRuntimeThreadClientDeps): {
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
    resumeAgentRuntimeThread: (request: AgentRuntimeResumeThreadRequest) => Promise<boolean>;
    submitAgentRuntimeTurn: (request: AgentRuntimeSubmitTurnRequest) => Promise<void>;
};
export declare const compactAgentRuntimeSession: (request: AgentRuntimeCompactSessionRequest) => Promise<void>, diffAgentRuntimeFileCheckpoint: (request: AgentRuntimeDiffFileCheckpointRequest) => Promise<AgentRuntimeFileCheckpointDiffResult>, getAgentRuntimeFileCheckpoint: (request: AgentRuntimeGetFileCheckpointRequest) => Promise<AgentRuntimeFileCheckpointDetail>, getAgentRuntimeThreadRead: (sessionId: string) => Promise<AgentRuntimeThreadReadModel>, interruptAgentRuntimeTurn: (request: AgentRuntimeInterruptTurnRequest) => Promise<boolean>, listAgentRuntimeFileCheckpoints: (request: AgentRuntimeListFileCheckpointsRequest) => Promise<AgentRuntimeFileCheckpointListResult>, promoteAgentRuntimeQueuedTurn: (request: AgentRuntimePromoteQueuedTurnRequest) => Promise<boolean>, removeAgentRuntimeQueuedTurn: (request: AgentRuntimeRemoveQueuedTurnRequest) => Promise<boolean>, replayAgentRuntimeRequest: (request: AgentRuntimeReplayRequestRequest) => Promise<AgentRuntimeReplayedActionRequiredView | null>, respondAgentRuntimeAction: (request: AgentRuntimeRespondActionRequest) => Promise<void>, resumeAgentRuntimeThread: (request: AgentRuntimeResumeThreadRequest) => Promise<boolean>, submitAgentRuntimeTurn: (request: AgentRuntimeSubmitTurnRequest) => Promise<void>;
