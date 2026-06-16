import type { AgentThreadItem } from "../types";
import type { AgentToolCallState } from "@/lib/api/agentProtocol";
import type {
  GeneralWorkbenchTaskRailItemStatus,
  GeneralWorkbenchTaskRailPlanItem,
} from "./generalWorkbenchTaskRailViewModel";
import {
  type MinimalTranslate,
  translateTaskRailText,
} from "./generalWorkbenchTaskRailText";

type UpdatePlanStepStatus = "pending" | "in_progress" | "completed";

interface UpdatePlanStep {
  step: string;
  status: UpdatePlanStepStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeToolName(value: string | null | undefined): string {
  return (value || "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

export function isUpdatePlanToolName(value: string | null | undefined): boolean {
  const normalized = normalizeToolName(value);
  return normalized === "updateplan" || normalized === "updateplantool";
}

function normalizePlanStepStatus(value: unknown): UpdatePlanStepStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  switch (normalized) {
    case "pending":
      return "pending";
    case "in_progress":
    case "inProgress":
    case "in-progress":
      return "in_progress";
    case "completed":
      return "completed";
    default:
      return null;
  }
}

function normalizeRailStatus(
  status: UpdatePlanStepStatus,
): GeneralWorkbenchTaskRailItemStatus {
  if (status === "completed") {
    return "completed";
  }
  if (status === "in_progress") {
    return "running";
  }
  return "pending";
}

function readPlanSteps(value: unknown): UpdatePlanStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const step = typeof item.step === "string" ? item.step.trim() : "";
    const status = normalizePlanStepStatus(item.status);
    if (!step || !status) {
      return [];
    }
    return [{ step, status }];
  });
}

function readUpdatePlanStepsFromMetadata(metadata: unknown): UpdatePlanStep[] {
  if (!isRecord(metadata)) {
    return [];
  }
  return readPlanSteps(metadata.plan);
}

function buildPlanItemsFromSteps({
  steps,
  idPrefix,
  t,
}: {
  steps: readonly UpdatePlanStep[];
  idPrefix: string;
  t: MinimalTranslate;
}): GeneralWorkbenchTaskRailPlanItem[] {
  return steps.map((step, index) => ({
    id: `${idPrefix}:${index}:${step.step}`,
    title: step.step,
    status: normalizeRailStatus(step.status),
    meta: translateTaskRailText(
      t,
      "generalWorkbench.taskRail.stepMeta",
      "步骤 {{index}}",
      { index: index + 1 },
    ),
  }));
}

export function buildUpdatePlanItemsFromMessageToolCalls(
  toolCalls: readonly AgentToolCallState[] | undefined,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailPlanItem[] {
  for (const toolCall of toolCalls ?? []) {
    if (!isUpdatePlanToolName(toolCall.name)) {
      continue;
    }
    const steps = readUpdatePlanStepsFromMetadata(toolCall.result?.metadata);
    if (steps.length === 0) {
      continue;
    }
    return buildPlanItemsFromSteps({
      steps,
      idPrefix: `message-tool-plan:${toolCall.id}`,
      t,
    });
  }
  return [];
}

export function buildUpdatePlanItemsFromThreadItems(
  threadItems: readonly AgentThreadItem[] | undefined,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailPlanItem[] {
  const updatePlanToolItems = (threadItems ?? []).filter(
    (item): item is Extract<AgentThreadItem, { type: "tool_call" }> =>
      item.type === "tool_call" && isUpdatePlanToolName(item.tool_name),
  );

  for (const item of [...updatePlanToolItems].reverse()) {
    const steps = readUpdatePlanStepsFromMetadata(item.metadata);
    if (steps.length === 0) {
      continue;
    }
    return buildPlanItemsFromSteps({
      steps,
      idPrefix: `thread-tool-plan:${item.id}`,
      t,
    });
  }

  return [];
}
