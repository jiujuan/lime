import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type {
  HarnessPlanPhase,
  HarnessTodoItem,
  HarnessTodoStatus,
  PersistedHarnessTodoLike,
} from "./harnessStateTypes";
import type { AgentPlanState } from "./planState";
import {
  asRecord,
  buildTextPreview,
  extractMetadata,
  parseJsonValue,
} from "./harnessStateCore";

function normalizeTodoStatus(value: unknown): HarnessTodoStatus {
  if (value === true) return "completed";

  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : undefined;
  if (!normalized) return "pending";

  if (normalized === "completed" || normalized === "done") {
    return "completed";
  }
  if (
    normalized === "in_progress" ||
    normalized === "inprogress" ||
    normalized === "active" ||
    normalized === "running"
  ) {
    return "in_progress";
  }
  return "pending";
}

function extractTodoCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const record = asRecord(value);
  if (!record) return [];

  for (const key of [
    "todos",
    "items",
    "tasks",
    "todo_list",
    "todoList",
    "task_list",
    "taskList",
  ]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function normalizeTodoItem(
  value: unknown,
  index: number,
): HarnessTodoItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const content =
    (typeof record.content === "string" && record.content.trim()) ||
    (typeof record.text === "string" && record.text.trim()) ||
    (typeof record.title === "string" && record.title.trim()) ||
    (typeof record.task === "string" && record.task.trim()) ||
    (typeof record.label === "string" && record.label.trim()) ||
    "";

  if (!content) return null;

  return {
    id:
      (typeof record.id === "string" && record.id.trim()) ||
      `todo-${index + 1}`,
    content,
    status: normalizeTodoStatus(
      record.status ?? record.done ?? record.completed ?? record.state,
    ),
  };
}

export function normalizePersistedTodoItems(
  items?: readonly PersistedHarnessTodoLike[],
): HarnessTodoItem[] {
  return (items || [])
    .map((item, index) => normalizeTodoItem(item, index))
    .filter((item): item is HarnessTodoItem => item !== null);
}

export function extractTodoSnapshot(
  toolCall: ToolCallState,
): HarnessTodoItem[] {
  const fromMetadata = extractTodoCandidates(extractMetadata(toolCall))
    .map(normalizeTodoItem)
    .filter((item): item is HarnessTodoItem => item !== null);
  if (fromMetadata.length > 0) {
    return fromMetadata;
  }

  const fromArguments = extractTodoCandidates(
    parseJsonValue(toolCall.arguments),
  )
    .map(normalizeTodoItem)
    .filter((item): item is HarnessTodoItem => item !== null);
  if (fromArguments.length > 0) {
    return fromArguments;
  }

  return extractTodoCandidates(parseJsonValue(toolCall.result?.output))
    .map(normalizeTodoItem)
    .filter((item): item is HarnessTodoItem => item !== null);
}

export function shouldUseStandardPlanState(planState: AgentPlanState): boolean {
  if (planState.phase === "idle" || planState.steps.length === 0) {
    return false;
  }
  return planState.source !== "thread_item" || Boolean(planState.revisionId);
}

function normalizePlanStateTodoStatus(
  status: AgentPlanState["steps"][number]["status"],
): HarnessTodoStatus {
  if (status === "completed") {
    return "completed";
  }
  if (status === "in_progress") {
    return "in_progress";
  }
  return "pending";
}

export function planStateToTodoItems(
  planState: AgentPlanState,
): HarnessTodoItem[] {
  if (!shouldUseStandardPlanState(planState)) {
    return [];
  }
  return planState.steps.map((step, index) => ({
    id: `${planState.itemId || planState.revisionId || "plan-state"}:${index + 1}`,
    content: step.text,
    status: normalizePlanStateTodoStatus(step.status),
  }));
}

export function planStateToHarnessPhase(
  planState: AgentPlanState,
): HarnessPlanPhase {
  if (planState.phase === "ready" || planState.phase === "completed") {
    return "ready";
  }
  if (planState.phase === "planning" || planState.phase === "executing") {
    return "planning";
  }
  return "idle";
}

export function summarizePlanDecisionText(text?: string): string | undefined {
  return buildTextPreview(text, {
    maxLines: 4,
    maxChars: 240,
  });
}
