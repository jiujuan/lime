import type { AgentProcessStatus, AgentRuntimeGeneratedTitleResult, AsterAgentStatus, AsterProviderConfig } from "./types";
import { type AgentRuntimeBridgeInvoke } from "./transport";
export interface AgentRuntimeAgentClientDeps {
    bridgeInvoke?: AgentRuntimeBridgeInvoke;
}
export interface GenerateAgentRuntimeTitleRequest {
    sessionId?: string;
    previewText?: string;
    titleKind?: "session" | "image_task";
}
export declare function createAgentClient({ bridgeInvoke, }?: AgentRuntimeAgentClientDeps): {
    configureAsterProvider: (config: AsterProviderConfig, sessionId: string) => Promise<AsterAgentStatus>;
    generateAgentRuntimeTitleResult: (request: GenerateAgentRuntimeTitleRequest) => Promise<AgentRuntimeGeneratedTitleResult>;
    generateAgentRuntimeTitle: (request: GenerateAgentRuntimeTitleRequest) => Promise<string>;
    generateAgentRuntimeSessionTitle: (sessionId: string, previewText?: string) => Promise<string>;
    getAgentProcessStatus: () => Promise<AgentProcessStatus>;
    getAsterAgentStatus: () => Promise<AsterAgentStatus>;
    initAsterAgent: () => Promise<AsterAgentStatus>;
    startAgentProcess: () => Promise<AgentProcessStatus>;
    stopAgentProcess: () => Promise<void>;
};
export declare const configureAsterProvider: (config: AsterProviderConfig, sessionId: string) => Promise<AsterAgentStatus>, generateAgentRuntimeTitleResult: (request: GenerateAgentRuntimeTitleRequest) => Promise<AgentRuntimeGeneratedTitleResult>, generateAgentRuntimeTitle: (request: GenerateAgentRuntimeTitleRequest) => Promise<string>, generateAgentRuntimeSessionTitle: (sessionId: string, previewText?: string) => Promise<string>, getAgentProcessStatus: () => Promise<AgentProcessStatus>, getAsterAgentStatus: () => Promise<AsterAgentStatus>, initAsterAgent: () => Promise<AsterAgentStatus>, startAgentProcess: () => Promise<AgentProcessStatus>, stopAgentProcess: () => Promise<void>;
