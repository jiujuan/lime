import {
  getCurrentSkillCatalogSnapshot,
  listSkillCatalogSkillEntries,
  type SkillCatalogSkillEntry,
} from "@/lib/api/skillCatalog";
import type { ServiceSkillItem } from "@/lib/api/serviceSkills";
import type { Skill } from "@/lib/api/skills";
import { normalizeExpertSkillRefKey } from "./expertSkillRefEditing";

export type ExpertSkillCandidateSource = "local" | "service" | "catalog";

export interface ExpertSkillCandidate {
  ref: string;
  title: string;
  summary: string;
  source: ExpertSkillCandidateSource;
  sourceLabel: string;
}

const normalizeRefKey = normalizeExpertSkillRefKey;

export function sanitizeSkillRefTestId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatSkillRefLabel(ref: string) {
  const withoutPrefix = ref.includes(":") ? ref.split(":").pop() || ref : ref;
  const withoutVersion = withoutPrefix.split("@")[0] || withoutPrefix;
  return withoutVersion
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function localSkillRef(skill: Skill): string {
  const key = skill.key?.trim() || skill.directory?.trim() || skill.name.trim();
  return key.startsWith("skill:") ? key : `skill:${key}`;
}

function serviceSkillRef(skill: Pick<ServiceSkillItem, "id">): string {
  return `service-skill:${skill.id}`;
}

function catalogSkillRef(entry: SkillCatalogSkillEntry): string {
  return entry.skillId?.trim()
    ? `skill:${entry.skillId.trim()}`
    : entry.id.trim();
}

export function skillCandidateInitial(title: string): string {
  const normalized = title.trim();
  return normalized ? normalized.slice(0, 1).toUpperCase() : "S";
}

function upsertSkillCandidate(
  map: Map<string, ExpertSkillCandidate>,
  candidate: ExpertSkillCandidate,
) {
  const key = normalizeRefKey(candidate.ref);
  if (!key || map.has(key)) {
    return;
  }
  map.set(key, candidate);
}

export function buildSkillCandidates(input: {
  localSkills?: Skill[];
  serviceSkills?: ServiceSkillItem[];
}): ExpertSkillCandidate[] {
  const candidates = new Map<string, ExpertSkillCandidate>();

  for (const skill of input.localSkills || []) {
    const ref = localSkillRef(skill);
    upsertSkillCandidate(candidates, {
      ref,
      title: skill.name || skill.key || skill.directory,
      summary: skill.description || skill.directory || ref,
      source: "local",
      sourceLabel: skill.catalogSource === "remote" ? "remote" : "local",
    });
  }

  for (const skill of input.serviceSkills || []) {
    upsertSkillCandidate(candidates, {
      ref: serviceSkillRef(skill),
      title: skill.title,
      summary: skill.summary,
      source: "service",
      sourceLabel: skill.category || "",
    });
  }

  try {
    const catalog = getCurrentSkillCatalogSnapshot();
    for (const item of catalog.items) {
      upsertSkillCandidate(candidates, {
        ref: serviceSkillRef(item),
        title: item.title,
        summary: item.summary,
        source: "service",
        sourceLabel: item.category || "",
      });
    }
    for (const entry of listSkillCatalogSkillEntries(catalog)) {
      upsertSkillCandidate(candidates, {
        ref: catalogSkillRef(entry),
        title: entry.title,
        summary: entry.summary,
        source: "catalog",
        sourceLabel: entry.groupKey || "",
      });
    }
  } catch {
    // 目录读取失败不阻断专家信息面板；已绑定技能仍按 ref 展示。
  }

  const sourceOrder: Record<ExpertSkillCandidateSource, number> = {
    local: 0,
    service: 1,
    catalog: 2,
  };

  return [...candidates.values()].sort((left, right) => {
    const sourceDiff = sourceOrder[left.source] - sourceOrder[right.source];
    if (sourceDiff !== 0) {
      return sourceDiff;
    }
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

export function filterSkillCandidates(
  candidates: ExpertSkillCandidate[],
  query: string,
): ExpertSkillCandidate[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return candidates;
  }

  return candidates.filter((candidate) =>
    [
      candidate.ref,
      candidate.title,
      candidate.summary,
      candidate.sourceLabel,
    ].some((value) => value.toLowerCase().includes(normalized)),
  );
}

export function resolveSkillLabel(
  ref: string,
  candidates: ExpertSkillCandidate[],
): string {
  const matched = candidates.find(
    (candidate) => normalizeRefKey(candidate.ref) === normalizeRefKey(ref),
  );
  return matched?.title || formatSkillRefLabel(ref);
}
