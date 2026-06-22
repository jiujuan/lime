import type {
  ExpertSkillRuntimeCandidate,
  ExpertSkillRuntimeCandidateReadiness,
} from "@/features/experts";
import type { AgentThreadItem } from "../types";

export type ExpertSkillRuntimeReadinessTone =
  | "ready"
  | "warning"
  | "blocked";

export interface ExpertSkillRuntimeReadinessCopy {
  ready: string;
  needsMapping: string;
  needsRegistration: string;
  needsEnable: string;
  blocked: string;
}

export interface ExpertSkillRuntimeChipViewModel {
  ref: string;
  label: string;
  readiness: ExpertSkillRuntimeCandidateReadiness;
  readinessLabel: string;
  readinessTone: ExpertSkillRuntimeReadinessTone;
  title: string;
}

export interface ExpertSkillRuntimeSummaryCopy {
  readyTitle: string;
  readyDetail: string;
  partialTitle: string;
  partialDetail: string;
  blockedTitle: string;
  blockedDetail: string;
  emptyTitle: string;
  emptyDetail: string;
}

export interface ExpertSkillRuntimeActionCopy {
  ready: string;
  needsMapping: string;
  needsRegistration: string;
  needsEnable: string;
  blocked: string;
}

export interface ExpertSkillRuntimeSummaryViewModel {
  tone: ExpertSkillRuntimeReadinessTone;
  title: string;
  detail: string;
  totalCount: number;
  readyCount: number;
  attentionCount: number;
}

export type ExpertSkillRuntimeRecoveryKind =
  | "open_picker"
  | "map_skill_ref"
  | "replace_skill_ref"
  | "open_skills_manage"
  | "enable_workspace_skill";

export interface ExpertSkillRuntimeActionViewModel {
  ref: string;
  label: string;
  readiness: ExpertSkillRuntimeCandidateReadiness;
  actionLabel: string;
  reason: string;
  recoveryKind: ExpertSkillRuntimeRecoveryKind;
  searchQuery: string;
}

export interface ExpertSkillRuntimeTraceCopy {
  none: string;
  bodyRead: string;
  gateReady: string;
  gateBlocked: string;
  search: string;
}

export interface ExpertSkillRuntimeTraceViewModel {
  tone: ExpertSkillRuntimeReadinessTone;
  label: string;
}

export type ExpertSkillRuntimeInvocationStatus =
  | "none"
  | "running"
  | "completed"
  | "failed"
  | "unknown";

export interface ExpertSkillRuntimeInvocationCopy {
  none: string;
  running: string;
  completed: string;
  failed: string;
  unknown: string;
}

export interface ExpertSkillRuntimeInvocationViewModel {
  tone: ExpertSkillRuntimeReadinessTone;
  label: string;
  status: ExpertSkillRuntimeInvocationStatus;
  skillName: string | null;
}

export interface BuildExpertSkillRuntimeChipViewModelsInput {
  skillRefs: string[];
  candidates: ExpertSkillRuntimeCandidate[];
  resolveLabel: (ref: string) => string;
  copy: ExpertSkillRuntimeReadinessCopy;
}

function normalizeRefKey(ref: string): string {
  return ref.trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: Record<string, unknown> | null, key: string) {
  const raw = value?.[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readFirstString(
  value: Record<string, unknown> | null,
  keys: string[],
) {
  for (const key of keys) {
    const matched = readString(value, key);
    if (matched) {
      return matched;
    }
  }
  return null;
}

function readFirstBoolean(
  value: Record<string, unknown> | null,
  keys: string[],
) {
  for (const key of keys) {
    const raw = value?.[key];
    if (typeof raw === "boolean") {
      return raw;
    }
  }
  return null;
}

function asParsedRecord(value: unknown): Record<string, unknown> | null {
  const direct = asRecord(value);
  if (direct) {
    return direct;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function readStringArray(
  value: Record<string, unknown> | null,
  key: string,
): string[] {
  const raw = value?.[key];
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string")
    : [];
}

function readinessLabel(
  readiness: ExpertSkillRuntimeCandidateReadiness,
  copy: ExpertSkillRuntimeReadinessCopy,
): string {
  switch (readiness) {
    case "ready":
      return copy.ready;
    case "needs_mapping":
      return copy.needsMapping;
    case "needs_registration":
      return copy.needsRegistration;
    case "needs_enable":
      return copy.needsEnable;
    case "blocked":
      return copy.blocked;
    default:
      return copy.blocked;
  }
}

function readinessTone(
  readiness: ExpertSkillRuntimeCandidateReadiness,
): ExpertSkillRuntimeReadinessTone {
  switch (readiness) {
    case "ready":
      return "ready";
    case "needs_mapping":
    case "needs_registration":
    case "needs_enable":
      return "warning";
    case "blocked":
    default:
      return "blocked";
  }
}

function isGenericSkillToolName(value: string | null): boolean {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    normalized === "skill" ||
    normalized === "skilltool" ||
    normalized === "loadskill" ||
    normalized === "limerunserviceskill"
  );
}

function isSkillInvocationItem(item: AgentThreadItem): boolean {
  if (item.type !== "tool_call") {
    return false;
  }
  const metadata = asRecord(item.metadata);
  const toolFamily = readFirstString(metadata, ["tool_family", "toolFamily"]);
  const skillSource = readFirstString(metadata, ["skill_source", "skillSource"]);
  return (
    toolFamily === "skill" ||
    skillSource === "SKILL.md" ||
    Boolean(readFirstString(metadata, ["skill_name", "skillName"])) ||
    isGenericSkillToolName(item.tool_name)
  );
}

function readSkillInvocationName(item: AgentThreadItem): string | null {
  const metadata = asRecord(item.metadata);
  const args = item.type === "tool_call" ? asParsedRecord(item.arguments) : null;
  return (
    readFirstString(metadata, [
      "skill_display_name",
      "skillDisplayName",
      "skill_name",
      "skillName",
    ]) ||
    readFirstString(args, [
      "display_name",
      "displayName",
      "skill",
      "name",
      "skill_name",
      "skillName",
    ]) ||
    (item.type === "tool_call" && !isGenericSkillToolName(item.tool_name)
      ? item.tool_name
      : null)
  );
}

function resolveSkillInvocationStatus(
  item: AgentThreadItem,
): ExpertSkillRuntimeInvocationStatus {
  const metadata = asRecord(item.metadata);
  const success =
    item.type === "tool_call"
      ? item.success ?? readFirstBoolean(metadata, ["success", "ok"])
      : readFirstBoolean(metadata, ["success", "ok"]);
  if (success === false) {
    return "failed";
  }
  if (success === true) {
    return "completed";
  }
  if (item.type === "tool_call" && item.error) {
    return "failed";
  }
  const metadataStatus = readFirstString(metadata, ["status", "state"]);
  const status = (metadataStatus || item.status).toLowerCase();
  if (status === "in_progress" || status === "running") {
    return "running";
  }
  if (status === "failed" || status === "error") {
    return "failed";
  }
  if (status === "completed" || status === "complete" || status === "done") {
    return "completed";
  }
  return "unknown";
}

function invocationTone(
  status: ExpertSkillRuntimeInvocationStatus,
): ExpertSkillRuntimeReadinessTone {
  switch (status) {
    case "completed":
      return "ready";
    case "running":
    case "unknown":
      return "warning";
    case "failed":
    case "none":
    default:
      return "blocked";
  }
}

function invocationLabel(
  status: ExpertSkillRuntimeInvocationStatus,
  copy: ExpertSkillRuntimeInvocationCopy,
): string {
  switch (status) {
    case "running":
      return copy.running;
    case "completed":
      return copy.completed;
    case "failed":
      return copy.failed;
    case "unknown":
      return copy.unknown;
    case "none":
    default:
      return copy.none;
  }
}

function normalizeRecoverySearchQuery(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("skill://")) {
    const parts = trimmed
      .replace(/\/SKILL\.md$/i, "")
      .split("/")
      .filter(Boolean);
    return parts.at(-1)?.split("@")[0]?.trim() || trimmed;
  }
  return trimmed
    .replace(/^(?:skill|service-skill|workspace_skill):/i, "")
    .replace(/^project:/i, "")
    .split("@")[0]
    .trim();
}

function recoverySearchQuery(
  candidate: ExpertSkillRuntimeCandidate,
  resolveLabel: (ref: string) => string,
): string {
  const values = [
    candidate.skillLocator?.directory,
    candidate.skillLocator?.name,
    candidate.ref,
    candidate.displayTitle,
    resolveLabel(candidate.ref),
  ];
  for (const value of values) {
    if (!value) {
      continue;
    }
    const normalized = normalizeRecoverySearchQuery(value);
    if (normalized) {
      return normalized;
    }
  }
  return candidate.ref;
}

function recoveryKindForReadiness(
  readiness: ExpertSkillRuntimeCandidateReadiness,
): ExpertSkillRuntimeRecoveryKind {
  if (readiness === "needs_enable") {
    return "enable_workspace_skill";
  }
  if (readiness === "needs_registration") {
    return "open_skills_manage";
  }
  if (readiness === "needs_mapping") {
    return "map_skill_ref";
  }
  if (readiness === "blocked") {
    return "replace_skill_ref";
  }
  return "open_picker";
}

export function buildExpertSkillRuntimeChipViewModels({
  skillRefs,
  candidates,
  resolveLabel,
  copy,
}: BuildExpertSkillRuntimeChipViewModelsInput): ExpertSkillRuntimeChipViewModel[] {
  const candidatesByRef = new Map(
    candidates.map((candidate) => [normalizeRefKey(candidate.ref), candidate]),
  );

  return skillRefs.map((ref) => {
    const candidate = candidatesByRef.get(normalizeRefKey(ref));
    const readiness = candidate?.readiness ?? "blocked";
    const label = candidate?.displayTitle || resolveLabel(ref);
    const labelText = readinessLabel(readiness, copy);
    return {
      ref,
      label,
      readiness,
      readinessLabel: labelText,
      readinessTone: readinessTone(readiness),
      title: `${ref} · ${labelText}`,
    };
  });
}

export function buildExpertSkillRuntimeSummaryViewModel(
  chips: ExpertSkillRuntimeChipViewModel[],
  copy: ExpertSkillRuntimeSummaryCopy,
): ExpertSkillRuntimeSummaryViewModel {
  if (chips.length === 0) {
    return {
      tone: "blocked",
      title: copy.emptyTitle,
      detail: copy.emptyDetail,
      totalCount: 0,
      readyCount: 0,
      attentionCount: 0,
    };
  }

  const readyCount = chips.filter((chip) => chip.readiness === "ready").length;
  const attentionCount = chips.length - readyCount;
  if (readyCount === chips.length) {
    return {
      tone: "ready",
      title: copy.readyTitle,
      detail: copy.readyDetail,
      totalCount: chips.length,
      readyCount,
      attentionCount,
    };
  }

  return {
    tone: readyCount > 0 ? "warning" : "blocked",
    title: readyCount > 0 ? copy.partialTitle : copy.blockedTitle,
    detail: readyCount > 0 ? copy.partialDetail : copy.blockedDetail,
    totalCount: chips.length,
    readyCount,
    attentionCount,
  };
}

export function buildExpertSkillRuntimeActionViewModels({
  candidates,
  resolveLabel,
  copy,
}: {
  candidates: ExpertSkillRuntimeCandidate[];
  resolveLabel: (ref: string) => string;
  copy: ExpertSkillRuntimeActionCopy;
}): ExpertSkillRuntimeActionViewModel[] {
  return candidates
    .filter((candidate) => candidate.readiness !== "ready")
    .map((candidate) => ({
      ref: candidate.ref,
      label: candidate.displayTitle || resolveLabel(candidate.ref),
      readiness: candidate.readiness,
      actionLabel:
        candidate.readiness === "needs_mapping"
          ? copy.needsMapping
          : candidate.readiness === "needs_registration"
            ? copy.needsRegistration
            : candidate.readiness === "needs_enable"
              ? copy.needsEnable
              : copy.blocked,
      reason: candidate.reason,
      recoveryKind: recoveryKindForReadiness(candidate.readiness),
      searchQuery: recoverySearchQuery(candidate, resolveLabel),
    }));
}

export function buildExpertSkillRuntimeTraceViewModel({
  threadItems,
  copy,
}: {
  threadItems?: readonly AgentThreadItem[];
  copy: ExpertSkillRuntimeTraceCopy;
}): ExpertSkillRuntimeTraceViewModel {
  const skillEvents = (threadItems ?? [])
    .map((item) => asRecord(item.metadata))
    .map((metadata) =>
      asRecord(metadata?.skillRuntime) ?? asRecord(metadata?.skill_runtime),
    )
    .filter((metadata): metadata is Record<string, unknown> =>
      Boolean(metadata),
    );

  const hasBodyRead = skillEvents.some(
    (event) =>
      readString(event, "event") === "skill_body_read" &&
      readString(event, "status") !== "failed",
  );
  const gateEvents = skillEvents.filter(
    (event) => readString(event, "event") === "skill_gate_decision",
  );
  const hasSelectedGate = gateEvents.some(
    (event) =>
      readStringArray(event, "selectedSkills").length > 0 ||
      readStringArray(event, "selected_skills").length > 0 ||
      readStringArray(event, "sourceAllowlist").length > 0 ||
      readStringArray(event, "source_allowlist").length > 0,
  );
  const hasSearch = skillEvents.some(
    (event) => readString(event, "event") === "skill_search",
  );

  if (hasSelectedGate) {
    return {
      tone: "ready",
      label: copy.gateReady,
    };
  }
  if (hasBodyRead) {
    return {
      tone: "ready",
      label: copy.bodyRead,
    };
  }
  if (gateEvents.length > 0) {
    return {
      tone: "warning",
      label: copy.gateBlocked,
    };
  }
  if (hasSearch) {
    return {
      tone: "warning",
      label: copy.search,
    };
  }
  return {
    tone: "blocked",
    label: copy.none,
  };
}

export function buildExpertSkillRuntimeInvocationViewModel({
  threadItems,
  copy,
}: {
  threadItems?: readonly AgentThreadItem[];
  copy: ExpertSkillRuntimeInvocationCopy;
}): ExpertSkillRuntimeInvocationViewModel {
  const items = threadItems ?? [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!isSkillInvocationItem(item)) {
      continue;
    }
    const status = resolveSkillInvocationStatus(item);
    return {
      tone: invocationTone(status),
      label: invocationLabel(status, copy),
      status,
      skillName: readSkillInvocationName(item),
    };
  }

  return {
    tone: "blocked",
    label: copy.none,
    status: "none",
    skillName: null,
  };
}
