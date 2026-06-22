import type { AgentThreadItem } from "../types";
import type {
  ExpertSkillRuntimeInvocationStatus,
  ExpertSkillRuntimeReadinessTone,
} from "./expertSkillRuntimeViewModel";

export type ExpertSkillRuntimeTimelineStepKind =
  | "search"
  | "body_read"
  | "runtime_enable"
  | "gate"
  | "invocation";

export interface ExpertSkillRuntimeTimelineStepViewModel {
  id: string;
  kind: ExpertSkillRuntimeTimelineStepKind;
  tone: ExpertSkillRuntimeReadinessTone;
  label: string;
  detail: string | null;
}

export interface ExpertSkillRuntimeTimelineCopy {
  empty: string;
  search: string;
  bodyRead: string;
  runtimeEnable: string;
  runtimeEnableWithCount: (count: number) => string;
  gateReady: string;
  gateBlocked: string;
  invocationRunning: string;
  invocationCompleted: string;
  invocationFailed: string;
  invocationUnknown: string;
}

export interface ExpertSkillRuntimeTimelineViewModel {
  emptyLabel: string;
  steps: ExpertSkillRuntimeTimelineStepViewModel[];
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

function readFirstStringArray(
  value: Record<string, unknown> | null,
  keys: string[],
): string[] {
  for (const key of keys) {
    const matched = readStringArray(value, key);
    if (matched.length > 0) {
      return matched;
    }
  }
  return [];
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

function timelineInvocationLabel(
  status: ExpertSkillRuntimeInvocationStatus,
  copy: ExpertSkillRuntimeTimelineCopy,
): string {
  switch (status) {
    case "running":
      return copy.invocationRunning;
    case "completed":
      return copy.invocationCompleted;
    case "failed":
      return copy.invocationFailed;
    case "unknown":
    case "none":
    default:
      return copy.invocationUnknown;
  }
}

function readRuntimeEnableRecord(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }
  const direct =
    asRecord(metadata.workspace_skill_runtime_enable) ??
    asRecord(metadata.workspaceSkillRuntimeEnable);
  if (direct) {
    return direct;
  }
  const harness = asRecord(metadata.harness);
  const harnessRuntimeEnable =
    asRecord(harness?.workspace_skill_runtime_enable) ??
    asRecord(harness?.workspaceSkillRuntimeEnable);
  if (harnessRuntimeEnable) {
    return harnessRuntimeEnable;
  }
  const skillRuntime =
    asRecord(metadata.skillRuntime) ?? asRecord(metadata.skill_runtime);
  return (
    asRecord(skillRuntime?.workspace_skill_runtime_enable) ??
    asRecord(skillRuntime?.workspaceSkillRuntimeEnable)
  );
}

function runtimeEnableBindingCount(
  record: Record<string, unknown> | null,
): number | null {
  const bindings = record?.bindings;
  return Array.isArray(bindings) ? bindings.length : null;
}

function readSkillRuntimeEvent(
  item: AgentThreadItem,
): Record<string, unknown> | null {
  const metadata = asRecord(item.metadata);
  return asRecord(metadata?.skillRuntime) ?? asRecord(metadata?.skill_runtime);
}

function hasSkillRuntimeTimelineSignal(item: AgentThreadItem): boolean {
  const metadata = asRecord(item.metadata);
  return Boolean(
    readSkillRuntimeEvent(item) ||
      readRuntimeEnableRecord(metadata) ||
      isSkillInvocationItem(item),
  );
}

function latestSkillRuntimeTurnId(
  items: readonly AgentThreadItem[],
): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (hasSkillRuntimeTimelineSignal(item)) {
      return item.turn_id;
    }
  }
  return null;
}

function skillRuntimeEventStep(
  item: AgentThreadItem,
  event: Record<string, unknown>,
  copy: ExpertSkillRuntimeTimelineCopy,
  index: number,
): ExpertSkillRuntimeTimelineStepViewModel | null {
  const eventName = readString(event, "event");
  if (eventName === "skill_search") {
    return {
      id: `${item.id}-skill-search-${index}`,
      kind: "search",
      tone: "warning",
      label: copy.search,
      detail: readFirstString(event, ["query", "searchQuery", "search_query"]),
    };
  }
  if (eventName === "skill_body_read") {
    return {
      id: `${item.id}-skill-body-read-${index}`,
      kind: "body_read",
      tone: readString(event, "status") === "failed" ? "blocked" : "ready",
      label: copy.bodyRead,
      detail: readFirstString(event, [
        "skill",
        "skillName",
        "skill_name",
        "name",
      ]),
    };
  }
  if (eventName === "skill_gate_decision") {
    const selectedSkills = readFirstStringArray(event, [
      "selectedSkills",
      "selected_skills",
      "sourceAllowlist",
      "source_allowlist",
    ]);
    const gateReady = selectedSkills.length > 0;
    return {
      id: `${item.id}-skill-gate-${index}`,
      kind: "gate",
      tone: gateReady ? "ready" : "warning",
      label: gateReady ? copy.gateReady : copy.gateBlocked,
      detail:
        selectedSkills.length > 0 ? selectedSkills.slice(0, 2).join(", ") : null,
    };
  }
  return null;
}

function runtimeEnableStep(
  item: AgentThreadItem,
  copy: ExpertSkillRuntimeTimelineCopy,
  index: number,
): ExpertSkillRuntimeTimelineStepViewModel | null {
  const runtimeEnable = readRuntimeEnableRecord(asRecord(item.metadata));
  if (!runtimeEnable) {
    return null;
  }
  const bindingCount = runtimeEnableBindingCount(runtimeEnable);
  return {
    id: `${item.id}-runtime-enable-${index}`,
    kind: "runtime_enable",
    tone: "ready",
    label:
      typeof bindingCount === "number" && bindingCount > 0
        ? copy.runtimeEnableWithCount(bindingCount)
        : copy.runtimeEnable,
    detail: readFirstString(runtimeEnable, ["source", "approval"]),
  };
}

function invocationTimelineStep(
  item: AgentThreadItem,
  copy: ExpertSkillRuntimeTimelineCopy,
  index: number,
): ExpertSkillRuntimeTimelineStepViewModel | null {
  if (!isSkillInvocationItem(item)) {
    return null;
  }
  const status = resolveSkillInvocationStatus(item);
  return {
    id: `${item.id}-skill-invocation-${index}`,
    kind: "invocation",
    tone: invocationTone(status),
    label: timelineInvocationLabel(status, copy),
    detail: readSkillInvocationName(item),
  };
}

export function buildExpertSkillRuntimeTimelineViewModel({
  threadItems,
  copy,
}: {
  threadItems?: readonly AgentThreadItem[];
  copy: ExpertSkillRuntimeTimelineCopy;
}): ExpertSkillRuntimeTimelineViewModel {
  const items = threadItems ?? [];
  const latestTurnId = latestSkillRuntimeTurnId(items);
  if (!latestTurnId) {
    return {
      emptyLabel: copy.empty,
      steps: [],
    };
  }

  const steps: ExpertSkillRuntimeTimelineStepViewModel[] = [];
  const scopedItems = items.filter((item) => item.turn_id === latestTurnId);
  scopedItems.forEach((item, index) => {
    const event = readSkillRuntimeEvent(item);
    if (event) {
      const step = skillRuntimeEventStep(item, event, copy, index);
      if (step) {
        steps.push(step);
      }
    }

    const runtimeStep = runtimeEnableStep(item, copy, index);
    if (runtimeStep) {
      steps.push(runtimeStep);
    }

    const invocationStep = invocationTimelineStep(item, copy, index);
    if (invocationStep) {
      steps.push(invocationStep);
    }
  });

  return {
    emptyLabel: copy.empty,
    steps: steps.slice(-5),
  };
}
