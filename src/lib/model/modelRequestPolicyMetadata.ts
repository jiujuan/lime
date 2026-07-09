import type { ModelContextPolicy } from "@/lib/model/modelContextPolicy";
import type { ModelExecutionPolicy } from "@/lib/model/modelExecutionPolicy";
import type { ModelInputModalityPolicy } from "@/lib/model/modelInputModalityPolicy";
import type { ModelNativeToolPolicy } from "@/lib/model/modelNativeToolPolicy";
import type { ModelReasoningOutputPolicy } from "@/lib/model/modelReasoningOutputPolicy";
import type { ModelReasoningPolicy } from "@/lib/model/modelReasoningPolicy";
import type { ModelResponsesPolicy } from "@/lib/model/modelResponsesPolicy";
import type { ModelToolCallPolicy } from "@/lib/model/modelToolCallPolicy";
import type { ModelTruncationPolicy } from "@/lib/model/modelTruncationPolicy";
import type { EnhancedModelMetadata } from "@/lib/types/modelRegistry";
import { resolveModelRegistryEntryForSelection } from "./modelCapabilitySendGate";

export interface ModelRequestPolicyMetadata {
  source: "model_registry";
  provider_id: string;
  model_id: string;
  execution_policy?: ModelExecutionPolicy;
  context_policy?: ModelContextPolicy;
  tool_call_policy?: ModelToolCallPolicy;
  reasoning_policy?: ModelReasoningPolicy;
  reasoning_output_policy?: ModelReasoningOutputPolicy;
  input_modality_policy?: ModelInputModalityPolicy;
  responses_policy?: ModelResponsesPolicy;
  truncation_policy?: ModelTruncationPolicy;
  native_tool_policy?: ModelNativeToolPolicy;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildModelRequestPolicyMetadata(
  model: EnhancedModelMetadata,
): ModelRequestPolicyMetadata | undefined {
  return {
    source: "model_registry",
    provider_id: model.provider_id,
    model_id: model.id,
    ...(model.execution_policy
      ? { execution_policy: model.execution_policy }
      : {}),
    ...(model.context_policy ? { context_policy: model.context_policy } : {}),
    ...(model.tool_call_policy
      ? { tool_call_policy: model.tool_call_policy }
      : {}),
    ...(model.reasoning_policy
      ? { reasoning_policy: model.reasoning_policy }
      : {}),
    ...(model.reasoning_output_policy
      ? { reasoning_output_policy: model.reasoning_output_policy }
      : {}),
    ...(model.input_modality_policy
      ? { input_modality_policy: model.input_modality_policy }
      : {}),
    ...(model.responses_policy
      ? { responses_policy: model.responses_policy }
      : {}),
    ...(model.truncation_policy
      ? { truncation_policy: model.truncation_policy }
      : {}),
    ...(model.native_tool_policy
      ? { native_tool_policy: model.native_tool_policy }
      : {}),
  };
}

export function resolveModelRequestPolicyMetadataForSelection(options: {
  models: readonly EnhancedModelMetadata[];
  providerType?: string | null;
  model?: string | null;
}): ModelRequestPolicyMetadata | undefined {
  const selectedModel = resolveModelRegistryEntryForSelection(options);
  return selectedModel
    ? buildModelRequestPolicyMetadata(selectedModel)
    : undefined;
}

export function mergeModelRequestPolicyMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  policy: ModelRequestPolicyMetadata | undefined,
): Record<string, unknown> | undefined {
  const existingHarness = isPlainRecord(requestMetadata?.harness)
    ? requestMetadata.harness
    : {};

  if (!policy) {
    if (!("model_request_policy" in existingHarness)) {
      return requestMetadata;
    }
    const nextHarness = { ...existingHarness };
    delete nextHarness.model_request_policy;
    return {
      ...(requestMetadata || {}),
      harness: nextHarness,
    };
  }

  return {
    ...(requestMetadata || {}),
    harness: {
      ...existingHarness,
      model_request_policy: policy,
    },
  };
}
