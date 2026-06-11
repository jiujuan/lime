/**
 * 快速响应辅助函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于快速响应模式的读取和元数据处理。
 *
 * @module fastResponseHelpers
 */

import {
  AGENT_FAST_RESPONSE_MODE_STORAGE_KEY,
  buildAgentFastResponseMetadata,
  type AgentFastResponseRoutingDecision,
  type AgentFastResponseMode,
} from "../../utils/fastResponseRouting";
import { asRecord } from "./skillSlotUtils";

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
): Record<string, unknown> | undefined {
  const fastResponseMetadata = buildAgentFastResponseMetadata(decision);
  if (!fastResponseMetadata) {
    return requestMetadata;
  }

  const nextMetadata = { ...(requestMetadata || {}) };
  const harness = asRecord(nextMetadata.harness) || {};
  nextMetadata.harness = {
    ...harness,
    fast_response_routing: fastResponseMetadata,
  };
  return nextMetadata;
}
