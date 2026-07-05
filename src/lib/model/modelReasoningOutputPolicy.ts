export const MODEL_REASONING_SUMMARIES = [
  "auto",
  "concise",
  "detailed",
  "none",
] as const;

export type ModelReasoningSummary =
  (typeof MODEL_REASONING_SUMMARIES)[number];

export const MODEL_VERBOSITY_LEVELS = [
  "low",
  "medium",
  "high",
] as const;

export type ModelVerbosity = (typeof MODEL_VERBOSITY_LEVELS)[number];

export interface ModelReasoningOutputPolicyInput {
  default_reasoning_summary?: unknown;
  defaultReasoningSummary?: unknown;
  support_verbosity?: unknown;
  supportVerbosity?: unknown;
  default_verbosity?: unknown;
  defaultVerbosity?: unknown;
}

export interface ModelReasoningOutputPolicy {
  default_reasoning_summary: ModelReasoningSummary;
  support_verbosity: boolean;
  default_verbosity: ModelVerbosity | null;
  can_set_verbosity: boolean;
}

function firstPresent<T>(
  input: ModelReasoningOutputPolicyInput,
  keys: Array<keyof ModelReasoningOutputPolicyInput>,
): T | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

function normalizeKnownValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized as T) ? (normalized as T) : null;
}

export function normalizeModelReasoningSummary(
  value: unknown,
): ModelReasoningSummary | null {
  return normalizeKnownValue(value, MODEL_REASONING_SUMMARIES);
}

export function normalizeModelVerbosity(value: unknown): ModelVerbosity | null {
  return normalizeKnownValue(value, MODEL_VERBOSITY_LEVELS);
}

export function buildModelReasoningOutputPolicy(
  input: ModelReasoningOutputPolicyInput | null | undefined,
): ModelReasoningOutputPolicy {
  const source = input ?? {};
  const defaultReasoningSummary =
    normalizeModelReasoningSummary(
      firstPresent(source, [
        "default_reasoning_summary",
        "defaultReasoningSummary",
      ]),
    ) ?? "auto";
  const supportVerbosity =
    firstPresent(source, ["support_verbosity", "supportVerbosity"]) === true;
  const defaultVerbosity = normalizeModelVerbosity(
    firstPresent(source, ["default_verbosity", "defaultVerbosity"]),
  );

  return {
    default_reasoning_summary: defaultReasoningSummary,
    support_verbosity: supportVerbosity,
    default_verbosity: supportVerbosity ? defaultVerbosity : null,
    can_set_verbosity: supportVerbosity,
  };
}

export function resolveModelReasoningSummaryForRequest(
  policy: Pick<ModelReasoningOutputPolicy, "default_reasoning_summary">,
  modelSupportsReasoningSummaries: boolean,
  requestedReasoningSummary: unknown,
): ModelReasoningSummary | null {
  if (!modelSupportsReasoningSummaries) {
    return null;
  }
  const requested = normalizeModelReasoningSummary(requestedReasoningSummary);
  const summary = requested ?? policy.default_reasoning_summary;
  return summary === "none" ? null : summary;
}

export function resolveModelVerbosityForRequest(
  policy: Pick<
    ModelReasoningOutputPolicy,
    "support_verbosity" | "default_verbosity"
  >,
  requestedVerbosity: unknown,
): ModelVerbosity | null {
  if (!policy.support_verbosity) {
    return null;
  }
  const requested = normalizeModelVerbosity(requestedVerbosity);
  return requested ?? policy.default_verbosity;
}
