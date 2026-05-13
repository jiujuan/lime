import type { Message } from "../types";
import { extractExistingHarnessMetadata } from "./harnessRequestMetadata";

export const SKILL_INLINE_PROCESS_RETENTION = "skill" as const;
export const SKILL_EXECUTION_RUNTIME_TURN_PREFIX = "skill-exec-";

const EXPLICIT_SKILL_LAUNCH_KEYS = new Set([
  "service_scene_launch",
  "serviceSceneLaunch",
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function isSkillLaunchMetadataKey(key: string): boolean {
  return (
    EXPLICIT_SKILL_LAUNCH_KEYS.has(key) ||
    key.endsWith("_skill_launch") ||
    key.endsWith("SkillLaunch")
  );
}

export function shouldRetainSkillInlineProcessFromMetadata(
  requestMetadata?: Record<string, unknown>,
): boolean {
  const harness = extractExistingHarnessMetadata(requestMetadata);
  if (!harness) {
    return false;
  }

  return Object.entries(harness).some(([key, value]) => {
    const launch = asRecord(value);
    return Boolean(
      launch && isSkillLaunchMetadataKey(key) && Object.keys(launch).length > 0,
    );
  });
}

export function isRetainedSkillProcessMessage(message: Message): boolean {
  return (
    message.role === "assistant" &&
    (message.inlineProcessRetention === SKILL_INLINE_PROCESS_RETENTION ||
      Boolean(
        message.runtimeTurnId
          ?.trim()
          .startsWith(SKILL_EXECUTION_RUNTIME_TURN_PREFIX),
      ))
  );
}
