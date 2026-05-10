import type { Skill } from "@/lib/api/skills";

interface BuildInstalledSkillCapabilityDescriptionOptions {
  includePromise?: boolean;
  includeRequiredInputs?: boolean;
  includeOutputHint?: boolean;
  copy?: InstalledSkillPresentationCopy;
}

export interface InstalledSkillPresentationCopy {
  defaultPromise?: string;
  fallbackRequiredInputs?: string;
  fallbackOutputHint?: string;
  requiredPrefix?: string;
  outputPrefix?: string;
}

const FALLBACK_REQUIRED_INPUTS = "对话里继续补充目标与约束";
const FALLBACK_OUTPUT_HINT = "带着该 Skill 进入生成";
const DEFAULT_PROMISE = "当你需要复用这个 Skill 时使用。";

function readInstalledSkillMetadata(
  skill: Pick<Skill, "metadata">,
  key: string,
): string | null {
  const value = skill.metadata?.[key];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveInstalledSkillPromise(
  skill: Pick<Skill, "description" | "metadata">,
  copy: InstalledSkillPresentationCopy = {},
): string {
  const description = skill.description?.trim();

  return (
    readInstalledSkillMetadata(skill, "lime_when_to_use") ??
    readInstalledSkillMetadata(skill, "when_to_use") ??
    (description && description.length > 0 ? description : null) ??
    copy.defaultPromise ??
    DEFAULT_PROMISE
  );
}

export function summarizeInstalledSkillRequiredInputs(
  skill: Pick<Skill, "metadata">,
  copy: InstalledSkillPresentationCopy = {},
): string {
  return (
    readInstalledSkillMetadata(skill, "lime_argument_hint") ??
    readInstalledSkillMetadata(skill, "argument_hint") ??
    copy.fallbackRequiredInputs ??
    FALLBACK_REQUIRED_INPUTS
  );
}

export function getInstalledSkillOutputHint(
  skill: Pick<Skill, "metadata">,
  copy: InstalledSkillPresentationCopy = {},
): string {
  return (
    readInstalledSkillMetadata(skill, "lime_output_hint") ??
    readInstalledSkillMetadata(skill, "output_hint") ??
    copy.fallbackOutputHint ??
    FALLBACK_OUTPUT_HINT
  );
}

export function buildInstalledSkillCapabilityDescription(
  skill: Pick<Skill, "description" | "metadata">,
  options: BuildInstalledSkillCapabilityDescriptionOptions = {},
): string {
  const segments: string[] = [];
  const copy = options.copy ?? {};

  if (options.includePromise ?? true) {
    segments.push(resolveInstalledSkillPromise(skill, copy));
  }

  if (options.includeRequiredInputs ?? true) {
    segments.push(
      `${copy.requiredPrefix ?? "需要："}${summarizeInstalledSkillRequiredInputs(
        skill,
        copy,
      )}`,
    );
  }

  if (options.includeOutputHint ?? true) {
    segments.push(
      `${copy.outputPrefix ?? "交付："}${getInstalledSkillOutputHint(
        skill,
        copy,
      )}`,
    );
  }

  return segments.join(" · ");
}
