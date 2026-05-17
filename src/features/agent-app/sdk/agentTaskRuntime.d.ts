import type { AgentAppProvenance, AgentAppTaskRecord, AgentAppTaskRequest, AgentAppTaskStatus, AgentAppTaskEventType } from "../types";
export interface BuildAgentAppTaskRecordParams {
    taskId: string;
    traceId: string;
    appId: string;
    entryKey?: string;
    retryOfTaskId?: string;
    retryAttempt?: number;
    request: AgentAppTaskRequest;
    provenance: AgentAppProvenance;
    now: string;
    startMessage: string;
}
export interface BuildRetryAgentAppTaskRecordParams {
    taskId: string;
    traceId: string;
    sourceTask: AgentAppTaskRecord;
    provenance: AgentAppProvenance;
    now: string;
    startMessage: string;
}
export interface AppendAgentAppTaskEventParams {
    type: AgentAppTaskEventType;
    status?: AgentAppTaskStatus;
    message?: string;
    payload?: unknown;
    refs?: string[];
    at: string;
}
export declare function buildAgentAppTaskRecord({ taskId, traceId, appId, entryKey, retryOfTaskId, retryAttempt, request, provenance, now, startMessage, }: BuildAgentAppTaskRecordParams): AgentAppTaskRecord;
export declare function buildRetryAgentAppTaskRecord({ taskId, traceId, sourceTask, provenance, now, startMessage, }: BuildRetryAgentAppTaskRecordParams): AgentAppTaskRecord;
export declare function appendAgentAppTaskEvent(task: AgentAppTaskRecord, params: AppendAgentAppTaskEventParams): AgentAppTaskRecord;
