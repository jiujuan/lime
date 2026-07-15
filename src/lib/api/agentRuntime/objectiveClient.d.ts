import type { AppServerClient } from "@/lib/api/appServer";
import type { AgentRuntimeCommandInvoke } from "./transport";
import type {
  AgentRuntimeClearObjectiveResult,
  AgentRuntimeContinueObjectiveResult,
  AgentRuntimeObjectiveSessionRequest,
  AgentRuntimeSetObjectiveRequest,
  AgentRuntimeUpdateObjectiveStatusRequest,
  ManagedObjective,
} from "./sessionTypes";
export type AgentRuntimeObjectiveAppServerClient = Pick<
  AppServerClient,
  | "readAgentSessionObjective"
  | "setAgentSessionObjective"
  | "updateAgentSessionObjectiveStatus"
  | "clearAgentSessionObjective"
>;
export interface AgentRuntimeObjectiveClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
  appServerClient?: AgentRuntimeObjectiveAppServerClient;
}
export declare function createObjectiveClient({
  invokeCommand,
  appServerClient,
}?: AgentRuntimeObjectiveClientDeps): {
  auditAgentRuntimeObjective: (
    request: AgentRuntimeObjectiveSessionRequest,
  ) => Promise<ManagedObjective>;
  clearAgentRuntimeObjective: (
    request: AgentRuntimeObjectiveSessionRequest,
  ) => Promise<AgentRuntimeClearObjectiveResult>;
  continueAgentRuntimeObjective: (
    request: AgentRuntimeObjectiveSessionRequest,
  ) => Promise<AgentRuntimeContinueObjectiveResult>;
  getAgentRuntimeObjective: (
    sessionId: string,
  ) => Promise<ManagedObjective | null>;
  setAgentRuntimeObjective: (
    request: AgentRuntimeSetObjectiveRequest,
  ) => Promise<ManagedObjective>;
  updateAgentRuntimeObjectiveStatus: (
    request: AgentRuntimeUpdateObjectiveStatusRequest,
  ) => Promise<ManagedObjective | null>;
};
export declare const auditAgentRuntimeObjective: (
    request: AgentRuntimeObjectiveSessionRequest,
  ) => Promise<ManagedObjective>,
  clearAgentRuntimeObjective: (
    request: AgentRuntimeObjectiveSessionRequest,
  ) => Promise<AgentRuntimeClearObjectiveResult>,
  continueAgentRuntimeObjective: (
    request: AgentRuntimeObjectiveSessionRequest,
  ) => Promise<AgentRuntimeContinueObjectiveResult>,
  getAgentRuntimeObjective: (
    sessionId: string,
  ) => Promise<ManagedObjective | null>,
  setAgentRuntimeObjective: (
    request: AgentRuntimeSetObjectiveRequest,
  ) => Promise<ManagedObjective>,
  updateAgentRuntimeObjectiveStatus: (
    request: AgentRuntimeUpdateObjectiveStatusRequest,
  ) => Promise<ManagedObjective | null>;
