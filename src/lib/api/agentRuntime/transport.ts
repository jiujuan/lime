import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "../diagnosticFacade";
import type { AgentRuntimeCommandName } from "./commandManifest.generated";

export type AgentRuntimeBridgeInvoke = <TResponse>(
  command: string,
  payload?: Record<string, unknown>,
) => Promise<TResponse>;

export type AgentRuntimeCommandInvoke = <TResponse>(
  command: AgentRuntimeCommandName,
  payload?: Record<string, unknown>,
) => Promise<TResponse>;

export interface AgentRuntimeTransportDeps {
  invoke?: typeof safeInvoke;
}

export interface AgentRuntimeCommandTransportDeps extends AgentRuntimeTransportDeps {
  bridgeInvoke?: AgentRuntimeBridgeInvoke;
}

export function createAgentRuntimeBridgeInvoke({
  invoke = safeInvoke,
}: AgentRuntimeTransportDeps = {}): AgentRuntimeBridgeInvoke {
  return async <TResponse>(
    command: string,
    payload?: Record<string, unknown>,
  ): Promise<TResponse> => {
    const result =
      typeof payload === "undefined"
        ? await invoke<TResponse>(command)
        : await invoke<TResponse>(command, payload);
    assertNotDiagnosticFacade(
      command,
      result,
      "真实 Agent Runtime current 通道",
    );
    return result;
  };
}

export const invokeAgentRuntimeBridge = createAgentRuntimeBridgeInvoke();

export function createAgentRuntimeCommandInvoke({
  bridgeInvoke,
  invoke,
}: AgentRuntimeCommandTransportDeps = {}): AgentRuntimeCommandInvoke {
  const resolvedBridgeInvoke =
    bridgeInvoke ?? createAgentRuntimeBridgeInvoke({ invoke });

  return async <TResponse>(
    command: AgentRuntimeCommandName,
    payload?: Record<string, unknown>,
  ): Promise<TResponse> => {
    const result =
      typeof payload === "undefined"
        ? await resolvedBridgeInvoke<TResponse>(command)
        : await resolvedBridgeInvoke<TResponse>(command, payload);
    assertNotDiagnosticFacade(
      command,
      result,
      "真实 Agent Runtime current 通道",
    );
    return result;
  };
}

export const invokeAgentRuntimeCommand = createAgentRuntimeCommandInvoke({
  bridgeInvoke: invokeAgentRuntimeBridge,
});
