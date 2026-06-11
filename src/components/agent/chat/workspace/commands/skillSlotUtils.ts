/**
 * 技能 slot 值处理工具函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于规范化和提取技能 slot 值。
 *
 * @module skillSlotUtils
 */

import { normalizeOptionalText } from "./commandRecentDefaults";

export function asRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function readPositiveInteger(value: unknown): number | undefined {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.floor(numericValue)
    : undefined;
}

export function normalizeImageWorkbenchMode(
  value: unknown,
): "edit" | "variation" | "generate" {
  return value === "edit" || value === "variation" || value === "generate"
    ? value
    : "generate";
}

export function normalizeServiceSkillUsageSlotValue(
  value: unknown,
): string | undefined {
  if (typeof value === "string") {
    return normalizeOptionalText(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return undefined;
}

export function pickUsageSlotValues(
  record: Record<string, unknown>,
  fieldKeys: readonly string[],
): Record<string, string> | undefined {
  const nextValues = Object.fromEntries(
    fieldKeys
      .map((fieldKey) => [
        fieldKey,
        normalizeServiceSkillUsageSlotValue(record[fieldKey]),
      ])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  return Object.keys(nextValues).length > 0 ? nextValues : undefined;
}

export function resolveLaunchScopedRequestContext(
  launchMetadata: Record<string, unknown>,
  requestContextKey: string,
): Record<string, unknown> | undefined {
  return (
    asRecord(launchMetadata[requestContextKey]) ||
    asRecord(asRecord(launchMetadata.request_context)?.[requestContextKey])
  );
}
