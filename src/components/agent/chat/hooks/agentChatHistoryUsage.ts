import type { AgentTokenUsage } from "@/lib/api/agentProtocol";

function readNonNegativeNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      return value;
    }
  }
  return undefined;
}

export function normalizeHistoryUsage(
  usage: unknown,
): AgentTokenUsage | undefined {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return undefined;
  }

  const record = usage as Record<string, unknown>;
  const inputTokens = readNonNegativeNumber(record, [
    "input_tokens",
    "inputTokens",
  ]);
  const outputTokens = readNonNegativeNumber(record, [
    "output_tokens",
    "outputTokens",
  ]);
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cached_input_tokens: readNonNegativeNumber(record, [
      "cached_input_tokens",
      "cachedInputTokens",
    ]),
    cache_creation_input_tokens: readNonNegativeNumber(record, [
      "cache_creation_input_tokens",
      "cacheCreationInputTokens",
    ]),
  };
}
