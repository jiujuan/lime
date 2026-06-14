import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "../diagnosticFacade";

export type AgentRuntimeBridgeInvoke = <TResponse>(
  command: string,
  payload?: Record<string, unknown>,
) => Promise<TResponse>;

export type AgentRuntimeCommandInvoke = <TResponse>(
  command: string,
  payload?: Record<string, unknown>,
) => Promise<TResponse>;

export interface AgentRuntimeTransportDeps {
  invoke?: typeof safeInvoke;
}

export interface AgentRuntimeCommandTransportDeps extends AgentRuntimeTransportDeps {
  bridgeInvoke?: AgentRuntimeBridgeInvoke;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertNotMockLikeEnvelope(command: string, value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  if (isRecord(value.error)) {
    throw new Error(`${command} returned an error envelope`);
  }

  const keys = Object.keys(value);
  if (keys.length === 1 && value.success === true) {
    throw new Error(`${command} returned a mock-like success envelope`);
  }
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
    assertNotMockLikeEnvelope(command, result);
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
    command: string,
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
    assertNotMockLikeEnvelope(command, result);
    return result;
  };
}

export const invokeAgentRuntimeCommand = createAgentRuntimeCommandInvoke({
  bridgeInvoke: invokeAgentRuntimeBridge,
});
