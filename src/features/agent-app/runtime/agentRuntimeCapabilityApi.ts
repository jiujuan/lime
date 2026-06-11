import type {
  AgentAppRuntimeCancelTaskRequest,
  AgentAppRuntimeCancelTaskResult,
  AgentAppRuntimeGetTaskRequest,
  AgentAppRuntimeStartTaskRequest,
  AgentAppRuntimeStartTaskResult,
  AgentAppRuntimeSubmitHostResponseRequest,
  AgentAppRuntimeSubmitHostResponseResult,
  AgentAppRuntimeTaskSnapshot,
} from "@/lib/api/agentAppRuntime";

export interface AgentAppRuntimeCapabilityApi {
  startTask(
    request: AgentAppRuntimeStartTaskRequest,
  ): Promise<AgentAppRuntimeStartTaskResult>;
  getTask(
    request: AgentAppRuntimeGetTaskRequest,
  ): Promise<AgentAppRuntimeTaskSnapshot>;
  cancelTask(
    request: AgentAppRuntimeCancelTaskRequest,
  ): Promise<AgentAppRuntimeCancelTaskResult>;
  submitHostResponse(
    request: AgentAppRuntimeSubmitHostResponseRequest,
  ): Promise<AgentAppRuntimeSubmitHostResponseResult>;
}

export function createFailClosedAgentAppRuntimeCapabilityApi(): AgentAppRuntimeCapabilityApi {
  const reject = async (method: string): Promise<never> => {
    throw new Error(
      `AgentRuntimeCapabilityHost requires a standard AgentRuntimeClient or explicit compat api before calling ${method}.`,
    );
  };
  return {
    startTask: () => reject("startTask"),
    getTask: () => reject("getTask"),
    cancelTask: () => reject("cancelTask"),
    submitHostResponse: () => reject("submitHostResponse"),
  };
}
