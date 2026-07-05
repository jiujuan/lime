export const DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT = 95;
const AUTO_COMPACT_CONTEXT_WINDOW_RATIO_NUMERATOR = 9;
const AUTO_COMPACT_CONTEXT_WINDOW_RATIO_DENOMINATOR = 10;

export interface ModelContextPolicyInput {
  context_window?: unknown;
  contextWindow?: unknown;
  max_context_window?: unknown;
  maxContextWindow?: unknown;
  auto_compact_token_limit?: unknown;
  autoCompactTokenLimit?: unknown;
  effective_context_window_percent?: unknown;
  effectiveContextWindowPercent?: unknown;
}

export interface ModelContextPolicy {
  context_window: number | null;
  max_context_window: number | null;
  resolved_context_window: number | null;
  effective_context_window_percent: number;
  model_context_window: number | null;
  auto_compact_token_limit: number | null;
}

function firstPresent<T>(
  input: ModelContextPolicyInput,
  keys: Array<keyof ModelContextPolicyInput>,
): T | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function normalizeEffectiveContextWindowPercent(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 100
  ) {
    return DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT;
  }
  return value;
}

function resolveContextWindow(
  contextWindow: number | null,
  maxContextWindow: number | null,
): number | null {
  return contextWindow ?? maxContextWindow;
}

function resolveModelContextWindow(
  resolvedContextWindow: number | null,
  effectiveContextWindowPercent: number,
): number | null {
  if (resolvedContextWindow === null) {
    return null;
  }
  return Math.floor(
    (resolvedContextWindow * effectiveContextWindowPercent) / 100,
  );
}

function resolveAutoCompactTokenLimit(
  resolvedContextWindow: number | null,
  configuredLimit: number | null,
): number | null {
  if (resolvedContextWindow === null) {
    return configuredLimit;
  }
  const contextLimit = Math.floor(
    (resolvedContextWindow * AUTO_COMPACT_CONTEXT_WINDOW_RATIO_NUMERATOR) /
      AUTO_COMPACT_CONTEXT_WINDOW_RATIO_DENOMINATOR,
  );
  return configuredLimit === null
    ? contextLimit
    : Math.min(configuredLimit, contextLimit);
}

export function buildModelContextPolicy(
  input: ModelContextPolicyInput | null | undefined,
): ModelContextPolicy {
  const source = input ?? {};
  const contextWindow = normalizePositiveInteger(
    firstPresent(source, ["context_window", "contextWindow"]),
  );
  const maxContextWindow = normalizePositiveInteger(
    firstPresent(source, ["max_context_window", "maxContextWindow"]),
  );
  const configuredAutoCompactTokenLimit = normalizePositiveInteger(
    firstPresent(source, [
      "auto_compact_token_limit",
      "autoCompactTokenLimit",
    ]),
  );
  const effectiveContextWindowPercent =
    normalizeEffectiveContextWindowPercent(
      firstPresent(source, [
        "effective_context_window_percent",
        "effectiveContextWindowPercent",
      ]),
    );
  const resolvedContextWindow = resolveContextWindow(
    contextWindow,
    maxContextWindow,
  );

  return {
    context_window: contextWindow,
    max_context_window: maxContextWindow,
    resolved_context_window: resolvedContextWindow,
    effective_context_window_percent: effectiveContextWindowPercent,
    model_context_window: resolveModelContextWindow(
      resolvedContextWindow,
      effectiveContextWindowPercent,
    ),
    auto_compact_token_limit: resolveAutoCompactTokenLimit(
      resolvedContextWindow,
      configuredAutoCompactTokenLimit,
    ),
  };
}
