/**
 * 发送辅助函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于发送前的辅助处理。
 *
 * @module sendHelpers
 */

import { asRecord } from "./skillSlotUtils";

export function waitForNextPaint(): Promise<void> {
  if (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export function hasHarnessLaunchRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  launchKey: "translation_skill_launch" | "resource_search_skill_launch",
): boolean {
  return Boolean(asRecord(asRecord(requestMetadata?.harness)?.[launchKey]));
}
