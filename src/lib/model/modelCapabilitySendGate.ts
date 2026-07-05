import {
  getModelCapabilitySummary,
  type ModelCapabilitySummary,
} from "./inferModelCapabilities";
import type {
  EnhancedModelMetadata,
  ModelModality,
} from "@/lib/types/modelRegistry";

export type ModelCapabilitySendPartKind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "file";

export interface BuildModelCapabilitySendGateInputOptions {
  text?: string | null;
  imageCount?: number;
  audioCount?: number;
  videoCount?: number;
  fileCount?: number;
  parts?: Array<ModelCapabilitySendPartKind | null | undefined>;
}

export interface ModelCapabilitySendGateInput {
  requiredInputModalities: ModelModality[];
}

export type ModelCapabilitySendGateStatus = "allowed" | "blocked" | "unknown";

export interface ModelCapabilitySendGateResult {
  status: ModelCapabilitySendGateStatus;
  requiredInputModalities: ModelModality[];
  supportedInputModalities: ModelModality[];
  missingInputModalities: ModelModality[];
  requiresMediaInput: boolean;
  reason: "missing_capability_summary" | "missing_input_modalities" | null;
}

export const MODEL_INPUT_CAPABILITY_GAP_ERROR_PREFIX =
  "model_input_capability_gap";

const SEND_MODALITY_ORDER: ModelCapabilitySendPartKind[] = [
  "text",
  "image",
  "audio",
  "video",
  "file",
];

const MEDIA_MODALITIES = new Set<ModelModality>([
  "image",
  "audio",
  "video",
  "file",
]);

function hasPositiveCount(value?: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function uniqueOrderedModalities(
  values: Iterable<ModelCapabilitySendPartKind>,
): ModelModality[] {
  const present = new Set(values);
  return SEND_MODALITY_ORDER.filter((modality) => present.has(modality));
}

function hasMediaModality(modalities: readonly ModelModality[]): boolean {
  return modalities.some((modality) => MEDIA_MODALITIES.has(modality));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSelector(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

function matchesModelSelector(
  model: EnhancedModelMetadata,
  normalizedModel: string,
): boolean {
  return [
    model.id,
    model.provider_model_id,
    model.canonical_model_id,
    model.display_name,
  ].some((value) => normalizeSelector(value) === normalizedModel);
}

function matchesProviderSelector(
  model: EnhancedModelMetadata,
  normalizedProvider: string,
): boolean {
  if (!normalizedProvider) {
    return true;
  }

  return [model.provider_id, model.provider_name].some(
    (value) => normalizeSelector(value) === normalizedProvider,
  );
}

export function resolveModelRegistryEntryForSelection(options: {
  models: readonly EnhancedModelMetadata[];
  providerType?: string | null;
  model?: string | null;
}): EnhancedModelMetadata | null {
  const normalizedModel = normalizeSelector(options.model);
  if (!normalizedModel) {
    return null;
  }

  const modelMatches = options.models.filter((model) =>
    matchesModelSelector(model, normalizedModel),
  );
  if (modelMatches.length === 0) {
    return null;
  }

  const normalizedProvider = normalizeSelector(options.providerType);
  const providerMatch = modelMatches.find((model) =>
    matchesProviderSelector(model, normalizedProvider),
  );
  const selectedModel =
    providerMatch ?? (modelMatches.length === 1 ? modelMatches[0] : null);

  return selectedModel ?? null;
}

export function resolveModelCapabilitySummaryForSelection(options: {
  models: readonly EnhancedModelMetadata[];
  providerType?: string | null;
  model?: string | null;
}): ModelCapabilitySummary | null {
  const selectedModel = resolveModelRegistryEntryForSelection(options);
  return selectedModel ? getModelCapabilitySummary(selectedModel) : null;
}

export function buildModelCapabilitySendGateInput(
  options: BuildModelCapabilitySendGateInputOptions,
): ModelCapabilitySendGateInput {
  const required: ModelCapabilitySendPartKind[] = [];

  if (options.text?.trim()) {
    required.push("text");
  }
  if (hasPositiveCount(options.imageCount)) {
    required.push("image");
  }
  if (hasPositiveCount(options.audioCount)) {
    required.push("audio");
  }
  if (hasPositiveCount(options.videoCount)) {
    required.push("video");
  }
  if (hasPositiveCount(options.fileCount)) {
    required.push("file");
  }
  for (const part of options.parts ?? []) {
    if (part) {
      required.push(part);
    }
  }

  return {
    requiredInputModalities: uniqueOrderedModalities(required),
  };
}

export function evaluateModelInputCapability(
  summary: ModelCapabilitySummary | null | undefined,
  input: ModelCapabilitySendGateInput,
): ModelCapabilitySendGateResult {
  const requiredInputModalities = uniqueOrderedModalities(
    input.requiredInputModalities.filter(
      (modality): modality is ModelCapabilitySendPartKind =>
        SEND_MODALITY_ORDER.includes(modality as ModelCapabilitySendPartKind),
    ),
  );
  const requiresMediaInput = hasMediaModality(requiredInputModalities);

  if (requiredInputModalities.length === 0) {
    return {
      status: "allowed",
      requiredInputModalities,
      supportedInputModalities: summary?.input_modalities ?? [],
      missingInputModalities: [],
      requiresMediaInput,
      reason: null,
    };
  }

  if (!summary) {
    return {
      status: "unknown",
      requiredInputModalities,
      supportedInputModalities: [],
      missingInputModalities: requiredInputModalities,
      requiresMediaInput,
      reason: "missing_capability_summary",
    };
  }

  const supported = new Set(summary.input_modalities);
  const missingInputModalities = requiredInputModalities.filter(
    (modality) => !supported.has(modality),
  );

  return {
    status: missingInputModalities.length > 0 ? "blocked" : "allowed",
    requiredInputModalities,
    supportedInputModalities: summary.input_modalities,
    missingInputModalities,
    requiresMediaInput,
    reason:
      missingInputModalities.length > 0 ? "missing_input_modalities" : null,
  };
}

export function mergeModelInputCapabilityGateMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  gate: ModelCapabilitySendGateResult | undefined,
): Record<string, unknown> | undefined {
  if (!gate) {
    return requestMetadata;
  }

  const existingHarness = isPlainRecord(requestMetadata?.harness)
    ? requestMetadata.harness
    : {};

  return {
    ...(requestMetadata || {}),
    harness: {
      ...existingHarness,
      model_input_capability_gate: gate,
    },
  };
}

export function buildModelInputCapabilityGapErrorMessage(
  result: ModelCapabilitySendGateResult,
): string {
  const reason = result.reason ?? "unknown";
  const modalities = (
    result.missingInputModalities.length > 0
      ? result.missingInputModalities
      : result.requiredInputModalities
  ).join(",");

  return `${MODEL_INPUT_CAPABILITY_GAP_ERROR_PREFIX}:${reason}:${modalities || "unknown"}`;
}

export function assertModelInputCapabilityAllowed(
  summary: ModelCapabilitySummary | null | undefined,
  input: ModelCapabilitySendGateInput,
  options?: {
    failClosedOnUnknown?: boolean;
  },
): ModelCapabilitySendGateResult {
  const result = evaluateModelInputCapability(summary, input);
  const shouldFail =
    result.status === "blocked" ||
    (result.status === "unknown" &&
      options?.failClosedOnUnknown === true &&
      result.requiresMediaInput);

  if (shouldFail) {
    throw new Error(buildModelInputCapabilityGapErrorMessage(result));
  }

  return result;
}
