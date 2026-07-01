import type { AgentThreadItem, AgentThreadItemStatus } from "../types";
import { summarizeThreadProcessBatch } from "./toolBatchGrouping";
import {
  buildPreviewLines,
  classifyItemKind,
  summarizeThinkingItem,
} from "./agentThreadGroupingItemSummary";
import type {
  AgentThreadDisplayModel,
  AgentThreadDisplayModelOptions,
  AgentThreadGroupingTranslate,
  AgentThreadGroupKind,
  AgentThreadOrderedBlock,
  AgentThreadSemanticGroup,
  AgentThreadSummaryChip,
} from "./agentThreadGroupingTypes";
import {
  hasImportedSourceProcessItem,
  isImportedSourceMetadata,
} from "./importedSourceProcess";

export type {
  AgentThreadDisplayModel,
  AgentThreadDisplayModelOptions,
  AgentThreadGroupingTranslate,
  AgentThreadGroupKind,
  AgentThreadOrderedBlock,
  AgentThreadSemanticGroup,
  AgentThreadSummaryChip,
} from "./agentThreadGroupingTypes";

function interpolateFallbackText(
  value: string,
  options?: Record<string, unknown>,
): string {
  if (!options) {
    return value;
  }
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, name: string) => {
    const option = options[name.trim()];
    return option === undefined || option === null ? "" : String(option);
  });
}

function translateGroupingText(
  t: AgentThreadGroupingTranslate | undefined,
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  if (!t) {
    return interpolateFallbackText(defaultValue, options);
  }
  return String(t(key, { defaultValue, ...options }));
}

function resolveItemTimestamp(item: AgentThreadItem): string {
  return item.completed_at || item.updated_at || item.started_at;
}

function compareItems(left: AgentThreadItem, right: AgentThreadItem): number {
  if (left.turn_id === right.turn_id && left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }
  const leftTimestamp = resolveItemTimestamp(left);
  const rightTimestamp = resolveItemTimestamp(right);
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp.localeCompare(rightTimestamp);
  }
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }
  return left.id.localeCompare(right.id);
}

function mergeStatuses(
  statuses: AgentThreadItemStatus[],
): AgentThreadItemStatus {
  if (statuses.some((status) => status === "in_progress")) {
    return "in_progress";
  }
  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }
  return "completed";
}

function resolveGroupTitle(
  kind: Exclude<AgentThreadGroupKind, "other">,
): string {
  switch (kind) {
    case "process":
      return "执行过程";
    case "approval":
      return "等你确认";
    case "alert":
      return "提醒和错误";
    case "artifact":
      return "文件和产物";
    case "subagent":
      return "子任务";
    default:
      return "执行过程";
  }
}

function resolveBlockTitle(kind: AgentThreadGroupKind): string {
  if (kind === "other") {
    return "执行过程";
  }
  return resolveGroupTitle(kind);
}

function resolveCountLabel(kind: AgentThreadGroupKind, count: number): string {
  switch (kind) {
    case "process":
      return `${count} 步`;
    case "artifact":
      return `${count} 份`;
    case "subagent":
      return `${count} 个任务`;
    default:
      return `${count} 项`;
  }
}

function summarizeImportedSourceProcessBatch(
  items: AgentThreadItem[],
  t?: AgentThreadGroupingTranslate,
): {
  title: string;
  supportingLines: string[];
  countLabel: string;
  rawDetailLabel: string;
} | null {
  if (!hasImportedSourceProcessItem(items)) {
    return null;
  }

  const commandCount = items.filter(
    (item) =>
      (item.type === "command_execution" || item.type === "tool_call") &&
      isImportedSourceMetadata(item.metadata),
  ).length;
  const reasoningCount = items.filter(
    (item) =>
      item.type === "reasoning" &&
      item.text.trim().length > 0 &&
      isImportedSourceMetadata(item.metadata),
  ).length;
  const searchCount = items.filter(
    (item) =>
      item.type === "web_search" && isImportedSourceMetadata(item.metadata),
  ).length;
  const patchCount = items.filter(
    (item) => item.type === "patch" && isImportedSourceMetadata(item.metadata),
  ).length;

  const supportingLines = [
    reasoningCount > 0
      ? translateGroupingText(
          t,
          "generalWorkbench.taskRail.importedProcess.reasoning",
          "{{count}} reasoning records completed",
          { count: reasoningCount },
        )
      : null,
    commandCount > 0
      ? translateGroupingText(
          t,
          "generalWorkbench.taskRail.importedProcess.commands",
          "{{count}} command records",
          { count: commandCount },
        )
      : null,
    searchCount > 0
      ? translateGroupingText(
          t,
          "generalWorkbench.taskRail.importedProcess.searches",
          "{{count}} search records",
          { count: searchCount },
        )
      : null,
    patchCount > 0
      ? translateGroupingText(
          t,
          "generalWorkbench.taskRail.importedProcess.patches",
          "{{count}} file changes",
          { count: patchCount },
        )
      : null,
  ].filter((line): line is string => Boolean(line));

  return {
    title: translateGroupingText(
      t,
      "generalWorkbench.taskRail.importedProcess.title",
      "Imported command record",
    ),
    supportingLines:
      supportingLines.length > 0
        ? supportingLines
        : [
            translateGroupingText(
              t,
              "generalWorkbench.taskRail.importedProcess.empty",
              "Execution records imported from local history",
            ),
          ],
    countLabel: translateGroupingText(
      t,
      "generalWorkbench.taskRail.importedProcess.count",
      "{{count}} steps",
      { count: items.length },
    ),
    rawDetailLabel: translateGroupingText(
      t,
      "generalWorkbench.taskRail.importedProcess.open",
      "Expand imported process",
    ),
  };
}

function shouldDefaultExpand(
  kind: AgentThreadGroupKind,
  status: AgentThreadItemStatus,
  items: AgentThreadItem[] = [],
): boolean {
  if (kind === "approval" || kind === "alert") {
    return true;
  }
  if (kind === "process" && hasImportedSourceProcessItem(items)) {
    return true;
  }
  if (kind === "process" && hasContentFactoryWorkflowProcessItem(items)) {
    return true;
  }
  return status !== "completed";
}

function hasContentFactoryWorkflowProcessItem(
  items: AgentThreadItem[],
): boolean {
  return items.some((item) => {
    const metadata =
      item.metadata &&
      typeof item.metadata === "object" &&
      !Array.isArray(item.metadata)
        ? (item.metadata as Record<string, unknown>)
        : null;
    const source = typeof metadata?.source === "string" ? metadata.source : "";
    const workflowKey =
      typeof metadata?.workflowKey === "string"
        ? metadata.workflowKey
        : typeof metadata?.workflow_key === "string"
          ? metadata.workflow_key
          : "";

    return (
      source === "content_factory_search_requests" ||
      workflowKey === "content_article_workflow"
    );
  });
}

function buildSummaryText(items: AgentThreadItem[]): string | null {
  const sortedThinking = items
    .filter(
      (item) =>
        item.type === "plan" ||
        item.type === "reasoning" ||
        item.type === "turn_summary" ||
        item.type === "context_compaction",
    )
    .sort(compareItems);

  for (let index = sortedThinking.length - 1; index >= 0; index -= 1) {
    const candidate = summarizeThinkingItem(sortedThinking[index]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function buildAgentThreadDisplayModel(
  items: AgentThreadItem[],
  options: AgentThreadDisplayModelOptions = {},
): AgentThreadDisplayModel {
  const sortedItems = [...items].sort(compareItems);
  const thinkingItems = sortedItems.filter(
    (item) =>
      item.type === "plan" ||
      item.type === "reasoning" ||
      item.type === "turn_summary" ||
      item.type === "context_compaction",
  );
  const orderedBlocks: AgentThreadOrderedBlock[] = [];
  const groups: AgentThreadSemanticGroup[] = [];
  let current: {
    kind: AgentThreadGroupKind;
    items: AgentThreadItem[];
  } | null = null;

  const pushCurrentBlock = () => {
    if (!current) {
      return;
    }

    const status = mergeStatuses(current.items.map((entry) => entry.status));
    const hasReasoningProcessItem = current.items.some(
      (entry) =>
        entry.type === "plan" ||
        entry.type === "reasoning" ||
        entry.type === "turn_summary" ||
        entry.type === "context_compaction",
    );
    const importedProcessSummary =
      current.kind === "process"
        ? summarizeImportedSourceProcessBatch(current.items, options.t)
        : null;
    const processBatchSummary =
      current.kind === "process" &&
      !hasReasoningProcessItem &&
      !importedProcessSummary
        ? summarizeThreadProcessBatch(current.items)
        : null;
    const startedAt =
      current.items[0]?.started_at || current.items[0]?.updated_at || "";
    const completedAt = current.items[current.items.length - 1]?.completed_at;
    const forceExpanded =
      current.kind === "process" && hasImportedSourceProcessItem(current.items);
    const block: AgentThreadOrderedBlock = {
      id: current.items.map((entry) => entry.id).join(":"),
      kind: current.kind,
      title:
        importedProcessSummary?.title ||
        processBatchSummary?.title ||
        resolveBlockTitle(current.kind),
      status,
      items: current.items,
      previewLines:
        importedProcessSummary?.supportingLines ||
        processBatchSummary?.supportingLines ||
        buildPreviewLines(current.kind, current.items),
      countLabel:
        importedProcessSummary?.countLabel ||
        processBatchSummary?.countLabel ||
        resolveCountLabel(current.kind, current.items.length),
      rawDetailLabel:
        importedProcessSummary?.rawDetailLabel ||
        processBatchSummary?.rawDetailLabel ||
        (current.kind === "approval"
          ? "查看待处理项"
          : current.kind === "artifact"
            ? "查看产物"
            : current.kind === "subagent"
              ? "查看子任务详情"
              : "查看执行过程"),
      defaultExpanded: shouldDefaultExpand(current.kind, status, current.items),
      ...(forceExpanded ? { forceExpanded: true } : {}),
      startedAt,
      completedAt,
    };

    orderedBlocks.push(block);

    if (current.kind !== "other") {
      groups.push({
        id: block.id,
        kind: current.kind,
        title: block.title,
        status: block.status,
        items: block.items,
        previewLines: block.previewLines,
        countLabel: block.countLabel,
        rawDetailLabel: block.rawDetailLabel,
        defaultExpanded: block.defaultExpanded,
        ...(block.forceExpanded ? { forceExpanded: true } : {}),
      });
    }
  };

  for (const item of sortedItems) {
    const kind = classifyItemKind(item);
    if (!current || current.kind !== kind) {
      pushCurrentBlock();
      current = { kind, items: [item] };
      continue;
    }

    current.items.push(item);
  }

  pushCurrentBlock();

  const summaryCounts = new Map<
    AgentThreadSummaryChip["kind"],
    AgentThreadSummaryChip
  >();

  for (const group of groups) {
    if (group.kind === "approval" || group.kind === "alert") {
      continue;
    }

    const existing = summaryCounts.get(group.kind);
    if (existing) {
      existing.count += group.items.length;
      continue;
    }

    summaryCounts.set(group.kind, {
      kind: group.kind,
      label: group.title,
      count: group.items.length,
    });
  }

  return {
    summaryText: buildSummaryText(sortedItems),
    thinkingItems,
    groups,
    orderedBlocks,
    summaryChips: Array.from(summaryCounts.values()),
  };
}
