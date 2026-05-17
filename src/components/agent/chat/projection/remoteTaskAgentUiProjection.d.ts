import type { AgentRun } from "@/lib/api/executionRun";
import type { AgentUiProjectionContext, AgentUiProjectionEvent, AgentUiRuntimeStatus } from "./agentUiEventProjection";
export type AgentUiRemoteTaskProjectionEvent = "created" | "updated" | "needs_input" | "auth_required" | "artifact_updated" | "completed" | "failed" | "cancelled";
export interface AgentUiRemoteTaskAgentCard {
    id?: string | null;
    name?: string | null;
    provider?: string | null;
    url?: string | null;
}
export interface AgentUiRemoteTaskArtifactRef {
    artifactId: string;
    artifactPath?: string | null;
    contentRef?: string | null;
    contentUrl?: string | null;
    mimeType?: string | null;
    byteSize?: string | null;
    digest?: string | null;
    preview?: string | null;
    title?: string | null;
    status?: string | null;
}
export interface AgentUiRemoteTaskProjectionInput {
    remoteTaskId: string;
    event: AgentUiRemoteTaskProjectionEvent;
    agentCard?: AgentUiRemoteTaskAgentCard | null;
    taskId?: string | null;
    title?: string | null;
    inputSummary?: string | null;
    source?: string | null;
    channel?: string | null;
    accountId?: string | null;
    inboundMessageId?: string | null;
    inputRequired?: boolean | null;
    authRequired?: boolean | null;
    authStatus?: string | null;
    remoteEvent?: string | null;
    remoteStatus?: string | null;
    status?: AgentUiRuntimeStatus | null;
    artifacts?: AgentUiRemoteTaskArtifactRef[];
    timestamp?: string | null;
    sessionId?: string | null;
    threadId?: string | null;
    runId?: string | null;
}
export declare function buildRemoteTaskAgentUiProjectionInputFromAgentRun(run: AgentRun): AgentUiRemoteTaskProjectionInput | null;
export declare function buildAgentUiRemoteTaskProjectionEventsFromAgentRun(run: AgentRun, context?: AgentUiProjectionContext): AgentUiProjectionEvent[];
export declare function buildAgentUiRemoteTaskProjectionEvents(input: AgentUiRemoteTaskProjectionInput, context?: AgentUiProjectionContext): AgentUiProjectionEvent[];
export declare function recordRemoteTaskAgentUiProjection(input: AgentUiRemoteTaskProjectionInput, context?: AgentUiProjectionContext): AgentUiProjectionEvent[];
export declare function recordRemoteTaskAgentUiProjectionFromAgentRun(run: AgentRun, context?: AgentUiProjectionContext): AgentUiProjectionEvent[];
