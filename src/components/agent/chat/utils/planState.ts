import type { AgentEvent, AgentThreadItem } from "@/lib/api/agentProtocol";
import {
  parseProposedPlanItems,
  type ProposedPlanItem,
} from "./proposedPlan";

export type AgentPlanPhase =
  | "idle"
  | "planning"
  | "ready"
  | "executing"
  | "completed"
  | "blocked";

export interface AgentPlanState {
  phase: AgentPlanPhase;
  text: string;
  steps: ProposedPlanItem[];
  source?: "thread_item" | "live_event" | "tool";
  itemId?: string;
  revisionId?: string;
  turnId?: string;
}

type PlanEvent = Extract<AgentEvent, { type: "plan_delta" | "plan_final" }>;

const EMPTY_PLAN_STATE: AgentPlanState = {
  phase: "idle",
  text: "",
  steps: [],
};

function isPlanItem(
  item: AgentThreadItem,
): item is Extract<AgentThreadItem, { type: "plan" }> {
  return item.type === "plan";
}

function isRevisionedPlanItem(
  item: AgentThreadItem,
): item is Extract<AgentThreadItem, { type: "plan" }> {
  return isPlanItem(item) && Boolean(readRevisionId(item.metadata));
}

function readRevisionId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const record = metadata as Record<string, unknown>;
  const revisionId = record.revisionId ?? record.revision_id;
  return typeof revisionId === "string" && revisionId.trim()
    ? revisionId.trim()
    : undefined;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizePlanStepStatus(value: unknown): ProposedPlanItem["status"] {
  if (value === "completed" || value === "in_progress" || value === "pending") {
    return value;
  }
  if (value === "done") {
    return "completed";
  }
  if (value === "running" || value === "active") {
    return "in_progress";
  }
  return "pending";
}

function planStepsFromStructuredPlan(value: unknown): ProposedPlanItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const text = readString(record, "step", "text", "content", "title");
      if (!text) {
        return null;
      }
      return {
        text,
        status: normalizePlanStepStatus(record.status),
      } satisfies ProposedPlanItem;
    })
    .filter((item): item is ProposedPlanItem => item !== null);
}

function planStepsFromTextOrStructuredPlan(
  text: string,
  plan: unknown,
): ProposedPlanItem[] {
  const structuredSteps = planStepsFromStructuredPlan(plan);
  return structuredSteps.length > 0
    ? structuredSteps
    : parseProposedPlanItems(text);
}

function sourceFromPlanEvent(event: PlanEvent): AgentPlanState["source"] {
  if (event.source === "update_plan" || event.toolCallId) {
    return "tool";
  }
  return "live_event";
}

export function buildPlanStateFromThreadItems(
  threadItems: readonly AgentThreadItem[] | undefined,
): AgentPlanState {
  const latestPlan = [...(threadItems ?? [])]
    .reverse()
    .find(isRevisionedPlanItem);
  if (!latestPlan) {
    return { ...EMPTY_PLAN_STATE };
  }
  const revisionId = readRevisionId(latestPlan.metadata);
  if (!revisionId) {
    return { ...EMPTY_PLAN_STATE };
  }
  const text = latestPlan.text.trim();
  const metadata =
    latestPlan.metadata &&
    typeof latestPlan.metadata === "object" &&
    !Array.isArray(latestPlan.metadata)
      ? (latestPlan.metadata as Record<string, unknown>)
      : {};
  const steps = planStepsFromTextOrStructuredPlan(text, metadata.plan);
  return {
    phase: latestPlan.status === "completed" ? "ready" : "planning",
    text,
    steps,
    source: "thread_item",
    itemId: latestPlan.id,
    revisionId,
    turnId: latestPlan.turn_id,
  };
}

export function buildPlanStateFromLiveEvent(event: PlanEvent): AgentPlanState {
  const text = event.text.trim() || event.delta?.trim() || "";
  return {
    phase: event.type === "plan_final" ? "ready" : "planning",
    text,
    steps: planStepsFromTextOrStructuredPlan(text, event.plan),
    source: sourceFromPlanEvent(event),
    itemId: event.sourceItemId,
    revisionId: event.revisionId,
    turnId: event.turn_id,
  };
}

export function buildPlanStateFromLivePayload(
  payload: unknown,
  eventType: "plan.delta" | "plan.final",
): AgentPlanState {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const text =
    typeof record.text === "string"
      ? record.text.trim()
      : typeof record.delta === "string"
        ? record.delta.trim()
        : "";
  return {
    phase: eventType === "plan.final" ? "ready" : "planning",
    text,
    steps: planStepsFromTextOrStructuredPlan(text, record.plan),
    source:
      record.source === "update_plan" || typeof record.toolCallId === "string"
        ? "tool"
        : "live_event",
    itemId:
      typeof record.sourceItemId === "string"
        ? record.sourceItemId
        : typeof record.source_item_id === "string"
          ? record.source_item_id
          : undefined,
    revisionId:
      typeof record.revisionId === "string"
        ? record.revisionId
        : typeof record.revision_id === "string"
          ? record.revision_id
          : undefined,
    turnId:
      typeof record.turnId === "string"
        ? record.turnId
        : typeof record.turn_id === "string"
          ? record.turn_id
          : undefined,
  };
}

export function hydrateAgentPlanState(params: {
  threadItems?: readonly AgentThreadItem[];
  events?: readonly AgentEvent[];
}): AgentPlanState {
  let current = buildPlanStateFromThreadItems(params.threadItems);
  for (const event of params.events ?? []) {
    if (event.type === "plan_delta" || event.type === "plan_final") {
      const state = buildPlanStateFromLiveEvent(event);
      if (state.text || state.steps.length > 0) {
        current = state;
      }
    }
  }
  return current;
}
