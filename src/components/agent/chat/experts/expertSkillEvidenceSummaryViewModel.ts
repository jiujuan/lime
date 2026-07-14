import type { AgentRuntimeEvidencePack } from "@/lib/api/agentRuntime/evidenceTypes";
import {
  formatWorkspaceSkillRuntimeEnableDisplay,
  type WorkspaceSkillRuntimeEnableDisplayTranslator,
} from "../utils/toolResultEnvelopeDisplay";

export interface ExpertSkillEvidenceSummaryCopy {
  title: string;
  counts: (searchCount: number, invocationCount: number) => string;
  exportedAt: (exportedAt: string) => string;
  latestSkill: (skillName: string) => string;
  knownGaps: (count: number) => string;
}

export interface ExpertSkillEvidenceSummaryViewModel {
  visible: boolean;
  title: string;
  countLabel: string;
  exportedAtLabel: string | null;
  latestSkillLabel: string | null;
  runtimeEnableLabel: string | null;
  knownGapsLabel: string | null;
}

type EvidencePackInput = AgentRuntimeEvidencePack | Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readFirstString(
  record: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readFirstRecord(
  record: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown> | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = asRecord(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function readFirstArray(
  record: Record<string, unknown> | null,
  keys: string[],
): unknown[] {
  if (!record) {
    return [];
  }
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function readLatestSkillName(invocations: unknown[]): string | null {
  for (let index = invocations.length - 1; index >= 0; index -= 1) {
    const invocation = asRecord(invocations[index]);
    const skillName = readFirstString(invocation, ["skill_name", "skillName"]);
    if (skillName) {
      return skillName;
    }
  }
  return null;
}

function readLatestRuntimeEnableLabel(
  invocations: unknown[],
  translateRuntimeEnable: WorkspaceSkillRuntimeEnableDisplayTranslator,
): string | null {
  for (let index = invocations.length - 1; index >= 0; index -= 1) {
    const label = formatWorkspaceSkillRuntimeEnableDisplay(
      invocations[index],
      translateRuntimeEnable,
    );
    if (label) {
      return label;
    }
  }
  return null;
}

export function buildExpertSkillEvidenceSummaryViewModel({
  evidencePack,
  copy,
  translateRuntimeEnable,
  formatExportedAt,
}: {
  evidencePack?: EvidencePackInput | null;
  copy: ExpertSkillEvidenceSummaryCopy;
  translateRuntimeEnable: WorkspaceSkillRuntimeEnableDisplayTranslator;
  formatExportedAt: (value: string) => string;
}): ExpertSkillEvidenceSummaryViewModel {
  const pack = asRecord(evidencePack);
  if (!pack) {
    return {
      visible: false,
      title: copy.title,
      countLabel: copy.counts(0, 0),
      exportedAtLabel: null,
      latestSkillLabel: null,
      runtimeEnableLabel: null,
      knownGapsLabel: null,
    };
  }

  const observabilitySummary = readFirstRecord(pack, [
    "observability_summary",
    "observabilitySummary",
  ]);
  const skillInvocations = readFirstArray(observabilitySummary, [
    "skill_invocations",
    "skillInvocations",
  ]);
  const skillSearches = readFirstArray(observabilitySummary, [
    "skill_searches",
    "skillSearches",
  ]);
  const exportedAt = readFirstString(pack, ["exported_at", "exportedAt"]);
  const knownGaps = readFirstArray(pack, ["known_gaps", "knownGaps"]);
  const latestSkillName = readLatestSkillName(skillInvocations);
  const runtimeEnableLabel = readLatestRuntimeEnableLabel(
    skillInvocations,
    translateRuntimeEnable,
  );

  return {
    visible: true,
    title: copy.title,
    countLabel: copy.counts(skillSearches.length, skillInvocations.length),
    exportedAtLabel: exportedAt
      ? copy.exportedAt(formatExportedAt(exportedAt))
      : null,
    latestSkillLabel: latestSkillName
      ? copy.latestSkill(latestSkillName)
      : null,
    runtimeEnableLabel,
    knownGapsLabel:
      knownGaps.length > 0 ? copy.knownGaps(knownGaps.length) : null,
  };
}
