import type { PluginProvenance, PluginTaskRecord, PluginTaskRequest, PluginTaskStatus, PluginTaskEventType } from "../types";
export interface BuildPluginTaskRecordParams {
    taskId: string;
    traceId: string;
    appId: string;
    entryKey?: string;
    retryOfTaskId?: string;
    retryAttempt?: number;
    request: PluginTaskRequest;
    provenance: PluginProvenance;
    now: string;
    startMessage: string;
}
export interface BuildRetryPluginTaskRecordParams {
    taskId: string;
    traceId: string;
    sourceTask: PluginTaskRecord;
    provenance: PluginProvenance;
    now: string;
    startMessage: string;
}
export interface AppendPluginTaskEventParams {
    type: PluginTaskEventType;
    status?: PluginTaskStatus;
    message?: string;
    payload?: unknown;
    refs?: string[];
    at: string;
}
export declare function buildPluginTaskRecord({ taskId, traceId, appId, entryKey, retryOfTaskId, retryAttempt, request, provenance, now, startMessage, }: BuildPluginTaskRecordParams): PluginTaskRecord;
export declare function buildRetryPluginTaskRecord({ taskId, traceId, sourceTask, provenance, now, startMessage, }: BuildRetryPluginTaskRecordParams): PluginTaskRecord;
export declare function appendPluginTaskEvent(task: PluginTaskRecord, params: AppendPluginTaskEventParams): PluginTaskRecord;
