export const MODEL_TRUNCATION_MODES = ["bytes", "tokens"] as const;

export type ModelTruncationMode = (typeof MODEL_TRUNCATION_MODES)[number];

export const DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES = 10_000;

export interface ModelTruncationPolicyConfig {
  mode: ModelTruncationMode;
  limit: number;
}

export interface ModelTruncationPolicyInput {
  truncation_policy?: unknown;
  truncationPolicy?: unknown;
}

export interface ModelTruncationPolicy {
  mode: ModelTruncationMode;
  limit: number;
  truncation_policy: ModelTruncationPolicyConfig;
}

function firstPresent<T>(
  input: ModelTruncationPolicyInput,
  keys: Array<keyof ModelTruncationPolicyInput>,
): T | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

function isModelTruncationMode(value: unknown): value is ModelTruncationMode {
  return MODEL_TRUNCATION_MODES.includes(value as ModelTruncationMode);
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function normalizeTruncationPolicy(
  value: unknown,
): ModelTruncationPolicyConfig {
  if (typeof value !== "object" || value === null) {
    return {
      mode: "bytes",
      limit: DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES,
    };
  }

  const record = value as Record<string, unknown>;
  const mode = record.mode;
  const limit = normalizePositiveInteger(record.limit);

  if (!isModelTruncationMode(mode) || limit === null) {
    return {
      mode: "bytes",
      limit: DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES,
    };
  }

  return {
    mode,
    limit,
  };
}

export function buildModelTruncationPolicy(
  input: ModelTruncationPolicyInput | null | undefined,
): ModelTruncationPolicy {
  const source = input ?? {};
  const truncationPolicy = normalizeTruncationPolicy(
    firstPresent(source, ["truncation_policy", "truncationPolicy"]),
  );

  return {
    mode: truncationPolicy.mode,
    limit: truncationPolicy.limit,
    truncation_policy: truncationPolicy,
  };
}
