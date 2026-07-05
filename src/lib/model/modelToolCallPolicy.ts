export interface ModelToolCallPolicyInput {
  supports_parallel_tool_calls?: unknown;
  supportsParallelToolCalls?: unknown;
}

export interface ModelToolCallPolicy {
  supports_parallel_tool_calls: boolean;
  parallel_tool_calls: boolean;
}

function firstPresent<T>(
  input: ModelToolCallPolicyInput,
  keys: Array<keyof ModelToolCallPolicyInput>,
): T | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

export function buildModelToolCallPolicy(
  input: ModelToolCallPolicyInput | null | undefined,
): ModelToolCallPolicy {
  const source = input ?? {};
  const supportsParallelToolCalls = normalizeBoolean(
    firstPresent(source, [
      "supports_parallel_tool_calls",
      "supportsParallelToolCalls",
    ]),
  );

  return {
    supports_parallel_tool_calls: supportsParallelToolCalls,
    parallel_tool_calls: supportsParallelToolCalls,
  };
}
