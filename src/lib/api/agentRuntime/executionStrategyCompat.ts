import type { AsterExecutionStrategy } from "./types";

export function normalizeExecutionStrategyToReact(
  value: unknown,
): AsterExecutionStrategy | null {
  return value === "react" || value === "code_orchestrated" || value === "auto"
    ? "react"
    : null;
}
