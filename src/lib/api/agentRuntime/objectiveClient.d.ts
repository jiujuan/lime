import type { AgentRuntimeCommandInvoke } from "./transport";
import type {
  AgentRuntimeClearObjectiveResult,
  AgentRuntimeContinueObjectiveResult,
  AgentRuntimeObjectiveSessionRequest,
  AgentRuntimeSetObjectiveRequest,
  AgentRuntimeUpdateObjectiveStatusRequest,
  ManagedObjective,
} from "./types";
export interface AgentRuntimeObjectiveClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
}
export declare function createObjectiveClient({
  invokeCommand,
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
