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
    ""
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
    ""
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
    ""
  );
}

export function buildInstalledSkillCapabilityDescription(
  skill: Pick<Skill, "description" | "metadata">,
  options: BuildInstalledSkillCapabilityDescriptionOptions = {},
): string {
  const segments: string[] = [];
  const copy = options.copy ?? {};

  if (options.includePromise ?? true) {
    const promise = resolveInstalledSkillPromise(skill, copy);
    if (promise) {
      segments.push(promise);
    }
  }

  if (options.includeRequiredInputs ?? true) {
    const requiredInputs = summarizeInstalledSkillRequiredInputs(skill, copy);
    if (requiredInputs) {
      segments.push(`${copy.requiredPrefix ?? ""}${requiredInputs}`);
    }
  }

  if (options.includeOutputHint ?? true) {
    const outputHint = getInstalledSkillOutputHint(skill, copy);
    if (outputHint) {
      segments.push(`${copy.outputPrefix ?? ""}${outputHint}`);
    }
  }

  return segments.join(" · ");
}
