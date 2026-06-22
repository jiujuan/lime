import type { AgentPendingServiceSkillLaunchParams } from "@/types/page";

export function buildPendingServiceSkillLaunchSignature(
  launch?: AgentPendingServiceSkillLaunchParams,
): string {
  const skillId = launch?.skillId?.trim();
  const skillKey = launch?.skillKey?.trim();
  if (!skillId && !skillKey) {
    return "";
  }

  return JSON.stringify({
    skillId,
    skillKey,
    requestKey: launch?.requestKey ?? 0,
    initialSlotValues: launch?.initialSlotValues ?? null,
    prefillHint: launch?.prefillHint ?? null,
    launchUserInput: launch?.launchUserInput ?? null,
  });
}
