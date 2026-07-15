import type { AgentExecutionStrategy } from "../agentExecutionRuntime";

export function normalizeExecutionStrategyToReact(
  value: unknown,
): AgentExecutionStrategy | null {
  return value === "react" || value === "code_orchestrated" || value === "auto"
    ? "react"
    : null;
}
