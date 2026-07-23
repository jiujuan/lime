import type {
  PluginRuntimeCancelTaskRequest,
  PluginRuntimeCancelTaskResult,
  PluginRuntimeGetTaskRequest,
  PluginRuntimeStartTaskRequest,
  PluginRuntimeStartTaskResult,
  PluginRuntimeSubmitHostResponseRequest,
  PluginRuntimeSubmitHostResponseResult,
  PluginRuntimeTaskSnapshot,
} from "@/lib/api/agentRuntime/pluginTaskTypes";

export interface PluginRuntimeCapabilityApi {
  startTask(
    request: PluginRuntimeStartTaskRequest,
  ): Promise<PluginRuntimeStartTaskResult>;
  getTask(
    request: PluginRuntimeGetTaskRequest,
  ): Promise<PluginRuntimeTaskSnapshot>;
  cancelTask(
    request: PluginRuntimeCancelTaskRequest,
  ): Promise<PluginRuntimeCancelTaskResult>;
  submitHostResponse(
    request: PluginRuntimeSubmitHostResponseRequest,
  ): Promise<PluginRuntimeSubmitHostResponseResult>;
}

export function createFailClosedPluginRuntimeCapabilityApi(): PluginRuntimeCapabilityApi {
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
