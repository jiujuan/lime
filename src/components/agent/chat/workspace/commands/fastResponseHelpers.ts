/**
 * 快速响应辅助函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于快速响应模式的读取和元数据处理。
 *
 * @module fastResponseHelpers
 */

import type { ServiceModelsConfig } from "@/lib/api/appConfigTypes";
import { buildServiceModelSlotMetadata } from "@/lib/serviceModels";
import {
  AGENT_FAST_RESPONSE_MODE_STORAGE_KEY,
  buildAgentFastResponseMetadata,
  FAST_RESPONSE_REASONING_EFFORT,
  type AgentFastResponseRoutingDecision,
  type AgentFastResponseMode,
} from "../../utils/fastResponseRouting";
import { asRecord } from "./skillSlotUtils";

const FAST_RESPONSE_MODEL_SLOT = "fast";

export function readFastResponseMode(): AgentFastResponseMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  return window.localStorage.getItem(AGENT_FAST_RESPONSE_MODE_STORAGE_KEY) ===
    "off"
    ? "off"
    : "auto";
}

export function withFastResponseMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  decision: AgentFastResponseRoutingDecision,
  serviceModels?: ServiceModelsConfig,
): Record<string, unknown> | undefined {
  const fastResponseMetadata = buildAgentFastResponseMetadata(decision);
  if (!fastResponseMetadata) {
    return requestMetadata;
  }

  const nextMetadata = { ...(requestMetadata || {}) };
  const harness = asRecord(nextMetadata.harness) || {};
  const existingModelSlots =
    asRecord(harness.model_slots) || asRecord(harness.modelSlots) || {};
  const fastResponseModelSlot = buildServiceModelSlotMetadata({
    preference: serviceModels?.responsive_chat,
    source: "service_models.responsive_chat",
    reason: "fast_response_routing",
  });
  nextMetadata.harness = {
    ...harness,
    model_reasoning_effort:
      harness.model_reasoning_effort ??
      harness.modelReasoningEffort ??
      FAST_RESPONSE_REASONING_EFFORT,
    modelReasoningEffort:
      harness.modelReasoningEffort ??
      harness.model_reasoning_effort ??
      FAST_RESPONSE_REASONING_EFFORT,
    ...(fastResponseModelSlot
      ? {
          model_slots: {
            ...existingModelSlots,
            [FAST_RESPONSE_MODEL_SLOT]:
              asRecord(existingModelSlots[FAST_RESPONSE_MODEL_SLOT]) ||
              fastResponseModelSlot,
          },
        }
      : {}),
    fast_response_routing: fastResponseMetadata,
  };
  return nextMetadata;
}
