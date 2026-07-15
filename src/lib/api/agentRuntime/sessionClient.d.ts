import type {
  AppServerSessionClient,
  AppServerSessionRpcClient,
} from "./appServerSessionClient";
import type { AgentExecutionStrategy } from "../agentExecutionRuntime";
import type {
  AgentRuntimeCreateSessionOptions,
  AgentRuntimeGetSessionOptions,
  AgentRuntimeUpdateSessionRequest,
} from "./requestTypes";
import type {
  AgentRuntimeListSessionsOptions,
  AgentSessionDetail,
  AgentSessionInfo,
} from "./sessionTypes";
export interface AgentRuntimeSessionClientDeps {
  appServerClient?: AppServerSessionRpcClient;
  appServerSessionClient?: AppServerSessionClient;
}
export declare function createSessionClient({
  appServerClient,
  appServerSessionClient,
}?: AgentRuntimeSessionClientDeps): {
  createAgentRuntimeSession: (
    workspaceId?: string,
    name?: string,
    executionStrategy?: AgentExecutionStrategy,
    options?: AgentRuntimeCreateSessionOptions,
  ) => Promise<string>;
  deleteAgentRuntimeSession: (sessionId: string) => Promise<void>;
  getAgentRuntimeSession: (
    sessionId: string,
    options?: AgentRuntimeGetSessionOptions,
  ) => Promise<AgentSessionDetail>;
  listAgentRuntimeSessions: (
    options?: AgentRuntimeListSessionsOptions,
  ) => Promise<AgentSessionInfo[]>;
  archiveManyAgentRuntimeSessions: (
    sessionIds: string[],
  ) => Promise<AgentSessionInfo[]>;
  updateAgentRuntimeSession: (
    request: AgentRuntimeUpdateSessionRequest,
  ) => Promise<void>;
};
export declare const archiveManyAgentRuntimeSessions: (
    sessionIds: string[],
  ) => Promise<AgentSessionInfo[]>,
  createAgentRuntimeSession: (
    workspaceId?: string,
    name?: string,
    executionStrategy?: AgentExecutionStrategy,
    options?: AgentRuntimeCreateSessionOptions,
  ) => Promise<string>,
  deleteAgentRuntimeSession: (sessionId: string) => Promise<void>,
  getAgentRuntimeSession: (
    sessionId: string,
    options?: AgentRuntimeGetSessionOptions,
  ) => Promise<AgentSessionDetail>,
  listAgentRuntimeSessions: (
    options?: AgentRuntimeListSessionsOptions,
  ) => Promise<AgentSessionInfo[]>,
  updateAgentRuntimeSession: (
    request: AgentRuntimeUpdateSessionRequest,
  ) => Promise<void>;
