export const MODEL_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

export type KnownModelReasoningEffort =
  (typeof MODEL_REASONING_EFFORTS)[number];

export type ModelReasoningEffort =
  | KnownModelReasoningEffort
  | (string & {});

export interface ModelReasoningEffortPreset {
  effort: ModelReasoningEffort;
  description: string;
}

export interface ModelReasoningPolicyInput {
  supports_reasoning_summary_parameter?: unknown;
  supportsReasoningSummaryParameter?: unknown;
  supports_reasoning_summaries?: unknown;
  supportsReasoningSummaries?: unknown;
  default_reasoning_level?: unknown;
  defaultReasoningLevel?: unknown;
  supported_reasoning_levels?: unknown;
  supportedReasoningLevels?: unknown;
}

export interface ModelReasoningPolicy {
  supports_reasoning_summaries: boolean;
  default_reasoning_level: ModelReasoningEffort | null;
  supported_reasoning_levels: ModelReasoningEffortPreset[];
  supported_reasoning_efforts: ModelReasoningEffort[];
  can_set_reasoning_effort: boolean;
}

function firstPresent<T>(
  input: ModelReasoningPolicyInput,
  keys: Array<keyof ModelReasoningPolicyInput>,
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

function normalizeDescription(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function normalizeModelReasoningEffort(
  value: unknown,
): ModelReasoningEffort | null {
  if (typeof value !== "string") {
    return null;
  }
  const effort = value.trim();
  return effort.length > 0 ? effort : null;
}

function normalizeReasoningEffortPreset(
  value: unknown,
): ModelReasoningEffortPreset | null {
  if (typeof value === "string") {
    const effort = normalizeModelReasoningEffort(value);
    return effort ? { effort, description: "" } : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const effort = normalizeModelReasoningEffort(source.effort);
  if (!effort) {
    return null;
  }
  return {
    effort,
    description: normalizeDescription(source.description),
  };
}

function normalizeReasoningEffortPresets(
  value: unknown,
): ModelReasoningEffortPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const presets: ModelReasoningEffortPreset[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const preset = normalizeReasoningEffortPreset(item);
    if (!preset || seen.has(preset.effort)) {
      continue;
    }
    seen.add(preset.effort);
    presets.push(preset);
  }
  return presets;
}

function includesSupportedEffort(
  policy: Pick<ModelReasoningPolicy, "supported_reasoning_efforts">,
  effort: ModelReasoningEffort,
): boolean {
  return policy.supported_reasoning_efforts.includes(effort);
}

function middleSupportedEffort(
  policy: Pick<ModelReasoningPolicy, "supported_reasoning_efforts">,
): ModelReasoningEffort | null {
  const supported = policy.supported_reasoning_efforts;
  if (supported.length === 0) {
    return null;
  }
  return supported[Math.floor((supported.length - 1) / 2)] ?? null;
}

export function buildModelReasoningPolicy(
  input: ModelReasoningPolicyInput | null | undefined,
): ModelReasoningPolicy {
  const source = input ?? {};
  const supportsReasoningSummaries = normalizeBoolean(
    firstPresent(source, [
      "supports_reasoning_summary_parameter",
      "supportsReasoningSummaryParameter",
      "supports_reasoning_summaries",
      "supportsReasoningSummaries",
    ]),
  );
  const defaultReasoningLevel = normalizeModelReasoningEffort(
    firstPresent(source, [
      "default_reasoning_level",
      "defaultReasoningLevel",
    ]),
  );
  const supportedReasoningLevels = normalizeReasoningEffortPresets(
    firstPresent(source, [
      "supported_reasoning_levels",
      "supportedReasoningLevels",
    ]),
  );
  const supportedReasoningEfforts = supportedReasoningLevels.map(
    (preset) => preset.effort,
  );

  return {
    supports_reasoning_summaries: supportsReasoningSummaries,
    default_reasoning_level: defaultReasoningLevel,
    supported_reasoning_levels: supportedReasoningLevels,
    supported_reasoning_efforts: supportedReasoningEfforts,
    can_set_reasoning_effort: supportedReasoningEfforts.length > 0,
  };
}

function hasReasoningEffortPolicy(
  policy: Pick<
    ModelReasoningPolicy,
    "default_reasoning_level" | "supported_reasoning_efforts"
  >,
): boolean {
  return (
    policy.default_reasoning_level !== null ||
    policy.supported_reasoning_efforts.length > 0
  );
}

export function resolveModelReasoningEffortForRequest(
  policy: Pick<
    ModelReasoningPolicy,
    | "supports_reasoning_summaries"
    | "default_reasoning_level"
    | "supported_reasoning_efforts"
  >,
  requestedReasoningEffort: unknown,
): ModelReasoningEffort | null {
  if (!hasReasoningEffortPolicy(policy)) {
    return null;
  }
  const requested = normalizeModelReasoningEffort(requestedReasoningEffort);
  if (requested && includesSupportedEffort(policy, requested)) {
    return requested;
  }
  return policy.default_reasoning_level;
}

export function resolveModelReasoningEffortForModelSwitch(
  policy: Pick<
    ModelReasoningPolicy,
    | "supports_reasoning_summaries"
    | "default_reasoning_level"
    | "supported_reasoning_efforts"
  >,
  currentReasoningEffort: unknown,
): ModelReasoningEffort | null {
  if (!hasReasoningEffortPolicy(policy)) {
    return null;
  }
  const current = normalizeModelReasoningEffort(currentReasoningEffort);
  if (current && includesSupportedEffort(policy, current)) {
    return current;
  }
  return middleSupportedEffort(policy) ?? policy.default_reasoning_level;
}
