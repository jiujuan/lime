import type {
  AppServerSessionClient,
  AppServerSessionRpcClient,
} from "./appServerSessionClient";
import type {
  AsterExecutionStrategy,
  AsterSessionDetail,
  AsterSessionInfo,
  AgentRuntimeCreateSessionOptions,
  AgentRuntimeListSessionsOptions,
  AgentRuntimeGetSessionOptions,
  AgentRuntimeUpdateSessionRequest,
} from "./types";
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
    executionStrategy?: AsterExecutionStrategy,
    options?: AgentRuntimeCreateSessionOptions,
  ) => Promise<string>;
  deleteAgentRuntimeSession: (sessionId: string) => Promise<void>;
  getAgentRuntimeSession: (
    sessionId: string,
    options?: AgentRuntimeGetSessionOptions,
  ) => Promise<AsterSessionDetail>;
  listAgentRuntimeSessions: (
    options?: AgentRuntimeListSessionsOptions,
  ) => Promise<AsterSessionInfo[]>;
  archiveManyAgentRuntimeSessions: (
    sessionIds: string[],
  ) => Promise<AsterSessionInfo[]>;
  updateAgentRuntimeSession: (
    request: AgentRuntimeUpdateSessionRequest,
  ) => Promise<void>;
};
export declare const archiveManyAgentRuntimeSessions: (
    sessionIds: string[],
  ) => Promise<AsterSessionInfo[]>,
  createAgentRuntimeSession: (
    workspaceId?: string,
    name?: string,
    executionStrategy?: AsterExecutionStrategy,
    options?: AgentRuntimeCreateSessionOptions,
  ) => Promise<string>,
  deleteAgentRuntimeSession: (sessionId: string) => Promise<void>,
  getAgentRuntimeSession: (
    sessionId: string,
    options?: AgentRuntimeGetSessionOptions,
  ) => Promise<AsterSessionDetail>,
  listAgentRuntimeSessions: (
    options?: AgentRuntimeListSessionsOptions,
  ) => Promise<AsterSessionInfo[]>,
  updateAgentRuntimeSession: (
    request: AgentRuntimeUpdateSessionRequest,
  ) => Promise<void>;
