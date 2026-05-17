import { type AgentRuntimeCommandInvoke } from "./transport";
import type { AsterExecutionStrategy, AsterSessionDetail, AsterSessionInfo, AgentRuntimeCreateSessionOptions, AgentRuntimeListSessionsOptions, AgentRuntimeGetSessionOptions, AgentRuntimeUpdateSessionRequest } from "./types";
export interface AgentRuntimeSessionClientDeps {
    invokeCommand?: AgentRuntimeCommandInvoke;
}
export declare function createSessionClient({ invokeCommand, }?: AgentRuntimeSessionClientDeps): {
    createAgentRuntimeSession: (workspaceId: string, name?: string, executionStrategy?: AsterExecutionStrategy, options?: AgentRuntimeCreateSessionOptions) => Promise<string>;
    deleteAgentRuntimeSession: (sessionId: string) => Promise<void>;
    getAgentRuntimeSession: (sessionId: string, options?: AgentRuntimeGetSessionOptions) => Promise<AsterSessionDetail>;
    listAgentRuntimeSessions: (options?: AgentRuntimeListSessionsOptions) => Promise<AsterSessionInfo[]>;
    updateAgentRuntimeSession: (request: AgentRuntimeUpdateSessionRequest) => Promise<void>;
};
export declare const createAgentRuntimeSession: (workspaceId: string, name?: string, executionStrategy?: AsterExecutionStrategy, options?: AgentRuntimeCreateSessionOptions) => Promise<string>, deleteAgentRuntimeSession: (sessionId: string) => Promise<void>, getAgentRuntimeSession: (sessionId: string, options?: AgentRuntimeGetSessionOptions) => Promise<AsterSessionDetail>, listAgentRuntimeSessions: (options?: AgentRuntimeListSessionsOptions) => Promise<AsterSessionInfo[]>, updateAgentRuntimeSession: (request: AgentRuntimeUpdateSessionRequest) => Promise<void>;
