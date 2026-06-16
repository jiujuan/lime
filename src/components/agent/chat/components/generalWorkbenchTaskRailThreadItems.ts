import type { AgentThreadItem } from "../types";
import { resolveUserFacingToolDisplayLabel } from "../utils/toolDisplayInfo";
import type {
  GeneralWorkbenchTaskRailItem,
  GeneralWorkbenchTaskRailItemStatus,
} from "./generalWorkbenchTaskRailViewModel";
import { isUpdatePlanToolName } from "./planToolProjection";

type MinimalTranslate = (
  key: string,
  options?: Record<string, unknown>,
) => unknown;

function translateTaskRailText(
  t: MinimalTranslate,
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  return String(t(key, { defaultValue, ...options }));
}

function normalizeThreadItemStatus(
  item: AgentThreadItem,
): GeneralWorkbenchTaskRailItemStatus {
  if (item.status === "failed") {
    return "failed";
  }
  if (item.status === "in_progress") {
    return "running";
  }
  if (item.type === "command_execution") {
    if (typeof item.exit_code === "number" && item.exit_code !== 0) {
      return "failed";
    }
    if (item.error?.trim()) {
      return "failed";
    }
  }
  if (item.type === "tool_call" && item.success === false) {
    return "failed";
  }
  return "completed";
}

function truncateText(value: string, maxLength = 120): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function stringifyThreadItemValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (!value) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function formatThreadItemArgs(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return stringifyThreadItemValue(value);
  }

  const parts = Object.entries(value)
    .slice(0, 2)
    .map(([key, item]) => `${key}: ${String(item ?? "").slice(0, 44)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function readThreadItemTime(item: AgentThreadItem): Date | null {
  const value = item.completed_at || item.updated_at || item.started_at;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || path;
}

export function buildGeneralWorkbenchTaskRailThreadItemItems(
  threadItems: readonly AgentThreadItem[] | undefined,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailItem[] {
  const items: GeneralWorkbenchTaskRailItem[] = [];

  for (const item of threadItems ?? []) {
    const status = normalizeThreadItemStatus(item);
    const timestamp = readThreadItemTime(item);

    if (item.type === "tool_call") {
      if (isUpdatePlanToolName(item.tool_name)) {
        continue;
      }
      const detail =
        item.error?.trim() ||
        stringifyThreadItemValue(item.output) ||
        formatThreadItemArgs(item.arguments);
      items.push({
        id: `thread-tool:${item.id}`,
        kind: "tool",
        status,
        title: resolveUserFacingToolDisplayLabel(item.tool_name),
        detail: detail ? truncateText(detail, 140) : null,
        meta: item.tool_name,
        timestamp,
      });
      continue;
    }

    if (item.type === "command_execution") {
      const detail =
        item.error?.trim() ||
        item.aggregated_output?.trim() ||
        item.cwd?.trim() ||
        null;
      items.push({
        id: `thread-command:${item.id}`,
        kind: "run",
        status,
        title: translateTaskRailText(
          t,
          "generalWorkbench.taskRail.runTitle",
          "执行 {{source}}",
          { source: item.command },
        ),
        detail: detail ? truncateText(detail, 140) : null,
        meta:
          typeof item.exit_code === "number"
            ? `exit ${item.exit_code}`
            : item.cwd,
        timestamp,
      });
      continue;
    }

    if (item.type === "web_search") {
      const source = item.query?.trim() || item.action?.trim();
      const detail = item.output?.trim() || item.action?.trim() || null;
      items.push({
        id: `thread-web-search:${item.id}`,
        kind: "run",
        status,
        title: source
          ? translateTaskRailText(
              t,
              "generalWorkbench.taskRail.runTitle",
              "执行 {{source}}",
              { source },
            )
          : translateTaskRailText(
              t,
              "generalWorkbench.taskRail.runTitleFallback",
              "执行任务",
            ),
        detail: detail ? truncateText(detail, 140) : null,
        meta: "web_search",
        timestamp,
      });
      continue;
    }

    if (item.type === "file_artifact") {
      items.push({
        id: `thread-file-artifact:${item.id}`,
        kind: "artifact",
        status,
        title: basename(item.path),
        detail: item.path,
        meta: item.source,
        timestamp,
        artifactPath: item.path,
      });
    }
  }

  return items;
}
