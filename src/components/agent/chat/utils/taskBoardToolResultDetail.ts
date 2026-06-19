import { normalizeToolNameKey } from "./toolDisplayInfo";
import { parseStructuredToolResult } from "./toolResultDetailText";

const TASK_BOARD_TOOL_NAMES = new Set([
  "taskcreate",
  "tasklist",
  "taskget",
  "taskupdate",
]);

export interface TaskBoardResultDetailCopy {
  taskNotFound: () => string;
  moreTasks: (count: number) => string;
  emptyTaskList: () => string;
}

const DEFAULT_TASK_BOARD_RESULT_DETAIL_COPY: TaskBoardResultDetailCopy = {
  taskNotFound: () => "Task not found",
  moreTasks: (count: number) => `${count} more tasks`,
  emptyTaskList: () => "Task list is empty",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
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

function readArray(
  record: Record<string, unknown> | null,
  keys: string[],
): unknown[] | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return null;
}

function readTaskSubject(
  record: Record<string, unknown> | null,
): string | null {
  return readString(record, ["subject", "content", "title", "description"]);
}

function readTaskStatus(record: Record<string, unknown> | null): string | null {
  return readString(record, ["status", "state"]);
}

function readTaskId(record: Record<string, unknown> | null): string | null {
  return readString(record, ["id", "taskId", "task_id"]);
}

function formatTaskLine(record: Record<string, unknown>): string | null {
  const id = readTaskId(record);
  const subject = readTaskSubject(record);
  const status = readTaskStatus(record);
  const label = [id ? `#${id}` : null, subject].filter(Boolean).join(" ");
  const main = label || status;
  if (!main) {
    return null;
  }
  return status && label ? `${main} · ${status}` : main;
}

export function resolveTaskBoardResultDetailText(params: {
  toolName: string;
  outputText: string;
  metadata: Record<string, unknown> | null;
  fallbackSummary: string | null;
  copy?: TaskBoardResultDetailCopy;
}): string | null {
  const normalizedName = normalizeToolNameKey(params.toolName);
  if (!TASK_BOARD_TOOL_NAMES.has(normalizedName)) {
    return null;
  }
  const copy = params.copy ?? DEFAULT_TASK_BOARD_RESULT_DETAIL_COPY;

  const parsedOutput = parseStructuredToolResult(params.outputText);
  const outputRecord = asRecord(parsedOutput);
  const metadata = params.metadata;
  const task = asRecord(metadata?.task) || asRecord(outputRecord?.task);
  const tasks =
    readArray(metadata, ["tasks", "task_list"]) ||
    readArray(outputRecord, ["tasks", "task_list"]);
  const lines: string[] = [];

  if (task) {
    const taskLine = formatTaskLine(task);
    if (taskLine) {
      lines.push(taskLine);
    }
  }

  if (!task && normalizedName === "taskget") {
    lines.push(copy.taskNotFound());
  }

  if (tasks) {
    const taskLines = tasks
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map(formatTaskLine)
      .filter((item): item is string => Boolean(item));
    if (taskLines.length > 0) {
      lines.push(...taskLines.slice(0, 5));
      if (taskLines.length > 5) {
        lines.push(copy.moreTasks(taskLines.length - 5));
      }
    } else if (normalizedName === "tasklist") {
      lines.push(copy.emptyTaskList());
    }
  }

  const summary = params.fallbackSummary?.trim();
  if (summary && !lines.includes(summary)) {
    lines.unshift(summary);
  }

  return lines.length > 0 ? lines.join("\n") : summary || null;
}
