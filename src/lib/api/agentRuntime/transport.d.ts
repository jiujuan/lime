import { safeInvoke } from "@/lib/dev-bridge";
export type AgentRuntimeBridgeInvoke = <TResponse>(command: string, payload?: Record<string, unknown>) => Promise<TResponse>;
export type AgentRuntimeCommandInvoke = <TResponse>(command: string, payload?: Record<string, unknown>) => Promise<TResponse>;
export interface AgentRuntimeTransportDeps {
    invoke?: typeof safeInvoke;
}
export interface AgentRuntimeCommandTransportDeps extends AgentRuntimeTransportDeps {
    bridgeInvoke?: AgentRuntimeBridgeInvoke;
}
export declare function createAgentRuntimeBridgeInvoke({ invoke, }?: AgentRuntimeTransportDeps): AgentRuntimeBridgeInvoke;
export declare const invokeAgentRuntimeBridge: AgentRuntimeBridgeInvoke;
export declare function createAgentRuntimeCommandInvoke({ bridgeInvoke, invoke, }?: AgentRuntimeCommandTransportDeps): AgentRuntimeCommandInvoke;
export declare const invokeAgentRuntimeCommand: AgentRuntimeCommandInvoke;
