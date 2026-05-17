type AgentDebugLevel = "debug" | "info" | "warn" | "error";
interface AgentDebugOptions {
    level?: AgentDebugLevel;
    throttleMs?: number;
    dedupeKey?: string;
    consoleOnly?: boolean;
}
export declare function logAgentDebug(component: string, phase: string, context?: Record<string, unknown>, options?: AgentDebugOptions): void;
export {};
