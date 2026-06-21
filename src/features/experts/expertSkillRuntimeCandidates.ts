import type {
  SkillCatalog,
  SkillCatalogSkillEntry,
  SkillCatalogSkillLocator,
} from "@/lib/api/skillCatalog";
import { listSkillCatalogSkillEntries } from "@/lib/api/skillCatalog";
import type { Skill } from "@/lib/api/skills";

export type ExpertSkillRuntimeCandidateKind =
  | "catalog_skill"
  | "service_skill"
  | "workspace_skill"
  | "skill_uri"
  | "unknown";

export type ExpertSkillRuntimeCandidateReadiness =
  | "ready"
  | "needs_mapping"
  | "needs_registration"
  | "blocked";

export interface ExpertSkillRuntimeCandidate {
  ref: string;
  kind: ExpertSkillRuntimeCandidateKind;
  readiness: ExpertSkillRuntimeCandidateReadiness;
  reason: string;
  displayTitle: string;
  source: "expert_skill_ref" | "expert_skill_override";
  riskLevel: "low" | "medium";
  skillLocator?: SkillCatalogSkillLocator;
}

export interface BuildExpertSkillRuntimeCandidatesOptions {
  source?: ExpertSkillRuntimeCandidate["source"];
  catalog?: SkillCatalog | null;
  localSkills?: Skill[] | null;
}

function normalizeRef(ref: string): string {
  return ref.trim();
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function titleFromRef(ref: string): string {
  const tail = ref.includes(":") ? ref.split(":").pop() || ref : ref;
  return tail.split("@")[0] || tail || ref;
}

function findCatalogSkillEntry(
  refName: string,
  catalog?: SkillCatalog | null,
): SkillCatalogSkillEntry | null {
  if (!catalog) {
    return null;
  }
  const normalized = normalizeKey(refName);
  return (
    listSkillCatalogSkillEntries(catalog).find((entry) =>
      [
        entry.id,
        entry.skillId,
        entry.skillLocator?.name,
        entry.skillLocator?.directory,
        ...(entry.aliases ?? []),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => normalizeKey(value) === normalized),
    ) ?? null
  );
}

function findLocalSkill(refName: string, localSkills?: Skill[] | null): Skill | null {
  if (!localSkills) {
    return null;
  }
  const normalized = normalizeKey(refName);
  return (
    localSkills.find((skill) =>
      [skill.key, skill.name, skill.directory, skill.localDirectoryPath]
        .filter((value): value is string => Boolean(value))
        .some((value) => normalizeKey(value) === normalized),
    ) ?? null
  );
}

function skillUriLocator(ref: string): SkillCatalogSkillLocator | undefined {
  if (!ref.startsWith("skill://")) {
    return undefined;
  }
  const withoutScheme = ref.slice("skill://".length);
  const parts = withoutScheme.split("/").filter(Boolean);
  const skillFileIndex = parts.findIndex((part) => part === "SKILL.md");
  const name =
    skillFileIndex > 0
      ? parts[skillFileIndex - 1]
      : parts.at(-1)?.replace(/\.md$/i, "");
  if (!name) {
    return undefined;
  }
  return {
    source: "other",
    name,
    directory: name,
    skillFilePath: ref,
  };
}

function buildSkillRefCandidate(
  ref: string,
  options: Required<Pick<BuildExpertSkillRuntimeCandidatesOptions, "source">> &
    Pick<BuildExpertSkillRuntimeCandidatesOptions, "catalog" | "localSkills">,
): ExpertSkillRuntimeCandidate {
  const name = ref.slice("skill:".length);
  const catalogEntry = findCatalogSkillEntry(name, options.catalog);
  const localSkill = findLocalSkill(name, options.localSkills);
  const localSkillLocator: SkillCatalogSkillLocator | undefined = localSkill
    ? {
        source: localSkill.catalogSource === "project" ? "project" : "user",
        name: localSkill.key || localSkill.name || name,
        directory: localSkill.directory || undefined,
      }
    : undefined;
  return {
    ref,
    kind: "catalog_skill",
    readiness:
      catalogEntry?.skillLocator || localSkillLocator ? "ready" : "needs_mapping",
    reason: catalogEntry?.skillLocator
      ? "expert skill ref matched SkillCatalog skillLocator"
      : localSkillLocator
        ? "expert skill ref matched installed local Skill"
      : "expert skill ref has no SkillCatalog locator yet",
    displayTitle: catalogEntry?.title ?? localSkill?.name ?? titleFromRef(ref),
    source: options.source,
    riskLevel: "low",
    skillLocator:
      catalogEntry?.skillLocator ??
      localSkillLocator ??
      (name
        ? {
            source: "catalog",
            name,
          }
        : undefined),
  };
}

function buildServiceSkillRefCandidate(
  ref: string,
  options: Required<Pick<BuildExpertSkillRuntimeCandidatesOptions, "source">>,
): ExpertSkillRuntimeCandidate {
  const name = ref.slice("service-skill:".length);
  return {
    ref,
    kind: "service_skill",
    readiness: "needs_mapping",
    reason:
      "service skill ref must be resolved through service_scene_launch skillLocator",
    displayTitle: titleFromRef(ref),
    source: options.source,
    riskLevel: "medium",
    skillLocator: name
      ? {
          source: "catalog",
          name,
        }
      : undefined,
  };
}

function buildWorkspaceSkillRefCandidate(
  ref: string,
  options: Required<Pick<BuildExpertSkillRuntimeCandidatesOptions, "source">>,
): ExpertSkillRuntimeCandidate {
  const directory = ref.slice("workspace_skill:".length);
  return {
    ref,
    kind: "workspace_skill",
    readiness: "needs_registration",
    reason:
      "workspace skill ref requires workspaceSkillBindings/list ready_for_manual_enable",
    displayTitle: titleFromRef(ref),
    source: options.source,
    riskLevel: "medium",
    skillLocator: directory
      ? {
          source: "project",
          name: `project:${directory}`,
          directory,
        }
      : undefined,
  };
}

function buildSkillUriCandidate(
  ref: string,
  options: Required<Pick<BuildExpertSkillRuntimeCandidatesOptions, "source">>,
): ExpertSkillRuntimeCandidate {
  const locator = skillUriLocator(ref);
  return {
    ref,
    kind: "skill_uri",
    readiness: locator ? "ready" : "blocked",
    reason: locator
      ? "expert skill URI can be resolved by AgentSkillSnapshot body reader"
      : "expert skill URI is malformed",
    displayTitle: locator?.name ?? titleFromRef(ref),
    source: options.source,
    riskLevel: "medium",
    skillLocator: locator,
  };
}

export function buildExpertSkillRuntimeCandidates(
  skillRefs: string[],
  options: BuildExpertSkillRuntimeCandidatesOptions = {},
): ExpertSkillRuntimeCandidate[] {
  const source = options.source ?? "expert_skill_ref";
  const seen = new Set<string>();
  return skillRefs
    .map(normalizeRef)
    .filter(Boolean)
    .filter((ref) => {
      const key = normalizeKey(ref);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((ref) => {
      if (ref.startsWith("skill://")) {
        return buildSkillUriCandidate(ref, { source });
      }
      if (ref.startsWith("skill:")) {
        return buildSkillRefCandidate(ref, {
          source,
          catalog: options.catalog,
          localSkills: options.localSkills,
        });
      }
      if (ref.startsWith("service-skill:")) {
        return buildServiceSkillRefCandidate(ref, { source });
      }
      if (ref.startsWith("workspace_skill:")) {
        return buildWorkspaceSkillRefCandidate(ref, { source });
      }
      return {
        ref,
        kind: "unknown",
        readiness: "blocked",
        reason: "unsupported expert skill ref format",
        displayTitle: titleFromRef(ref),
        source,
        riskLevel: "medium",
      };
    });
}
