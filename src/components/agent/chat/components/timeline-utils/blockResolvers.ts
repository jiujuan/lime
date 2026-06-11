import type { ActionRequired, AgentThreadItem, AgentThreadTurn } from "../../types";
import type { AgentThreadOrderedBlock } from "../../utils/agentThreadGrouping";
import { hasAnyPrefix, shortenInlineText } from "./textFormatting";
import { parseAIResponse } from "@/components/workspace/a2ui/parser";
import { resolveReasoningDisplayText, resolveTurnSummaryDisplayText } from "./displayTextResolvers";
import { shouldHideTurnSummaryFromConversation } from "../../utils/turnSummaryPresentation";

export function isThinkingTimelineItem(
  item: AgentThreadItem,
): item is Extract<
  AgentThreadItem,
  { type: "plan" | "reasoning" | "turn_summary" | "context_compaction" }
> {
  return (
    item.type === "plan" ||
    item.type === "reasoning" ||
    item.type === "turn_summary" ||
    item.type === "context_compaction"
  );
}

export function isToolExecutionTimelineItem(item: AgentThreadItem): boolean {
  return (
    item.type === "tool_call" ||
    item.type === "command_execution" ||
    item.type === "web_search"
  );
}

export function extractCompactThinkingParts(
  item: Extract<
    AgentThreadItem,
    { type: "plan" | "reasoning" | "turn_summary" | "context_compaction" }
  >,
) {
  if (item.type === "context_compaction") {
    const title =
      item.stage === "completed" || item.status === "completed"
        ? "压了上下文"
        : "正在压上下文";
    const detail =
      item.detail?.trim() ||
      (item.stage === "completed" || item.status === "completed"
        ? "把前面的对话压成摘要了，后面接着做。"
        : "在把前面的对话压成摘要，马上继续。");
    return { title, detail };
  }

  if (item.type === "plan") {
    return {
      title: item.status === "in_progress" ? "还在排步骤" : "定了这些步骤",
      detail: item.text.trim(),
    };
  }

  if (item.type === "reasoning") {
    const { summaryText, bodyText, combinedText } =
      resolveReasoningDisplayText(item);
    const previewSource = summaryText || combinedText;
    const lines = previewSource
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const [
      title = item.status === "in_progress" ? "思考中" : "已完成思考",
      ...rest
    ] = lines;
    const detail = [rest.join("\n").trim(), bodyText]
      .filter(Boolean)
      .join("\n\n");

    const parsed = parseAIResponse(combinedText, false);
    if (parsed.hasA2UI || parsed.hasPending) {
      return null;
    }

    return {
      title,
      detail,
    };
  }

  if (item.type === "turn_summary") {
    const displayText = resolveTurnSummaryDisplayText(item);
    const parsed = parseAIResponse(displayText, false);
    if (parsed.hasA2UI || parsed.hasPending) {
      return null;
    }

    return {
      title: item.status === "in_progress" ? "处理中" : "当前进展",
      detail: shouldHideTurnSummaryFromConversation(item) ? "" : displayText,
    };
  }

  return null;
}

export function resolveCompactTechnicalSummary(
  block: AgentThreadOrderedBlock,
): string {
  return `处理了 ${block.items.length} 个步骤`;
}

export function resolveActiveBlockIndex(blocks: AgentThreadOrderedBlock[]): number {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index]?.status === "in_progress") {
      return index;
    }
  }

  return -1;
}

export function findLastBlockIndex(
  blocks: AgentThreadOrderedBlock[],
  predicate: (block: AgentThreadOrderedBlock) => boolean,
): number {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (predicate(blocks[index])) {
      return index;
    }
  }

  return -1;
}

export function resolveFocusBlockIndex(params: {
  blocks: AgentThreadOrderedBlock[];
  turn: AgentThreadTurn;
  actionRequests?: ActionRequired[];
  activeBlockIndex: number;
}): number {
  const { blocks, turn, actionRequests, activeBlockIndex } = params;

  if (blocks.length === 0) {
    return -1;
  }

  if (activeBlockIndex >= 0) {
    return activeBlockIndex;
  }

  const pendingAction = findLatestPendingAction(actionRequests);

  if (pendingAction) {
    const pendingIndex = findLastBlockIndex(
      blocks,
      (block) => block.kind === "approval" || block.kind === "alert",
    );
    if (pendingIndex >= 0) {
      return pendingIndex;
    }
  }

  if (turn.status === "failed" || turn.status === "aborted") {
    const failedIndex = findLastBlockIndex(
      blocks,
      (block) => block.status === "failed" || block.kind === "alert",
    );
    if (failedIndex >= 0) {
      return failedIndex;
    }
  }

  const lastMeaningfulIndex = findLastBlockIndex(
    blocks,
    (block) => block.kind !== "other",
  );
  if (lastMeaningfulIndex >= 0) {
    return lastMeaningfulIndex;
  }

  return blocks.length - 1;
}

export function resolveExpandedBlockIndexes(params: {
  blocks: AgentThreadOrderedBlock[];
  isCurrentTurn: boolean;
  focusBlockIndex: number;
  turn: AgentThreadTurn;
  collapseInactiveDetails?: boolean;
}): Set<number> {
  const {
    blocks,
    isCurrentTurn,
    focusBlockIndex,
    turn,
    collapseInactiveDetails = false,
  } = params;
  const expanded = new Set<number>();

  blocks.forEach((block, index) => {
    if (
      isCurrentTurn &&
      turn.status === "running" &&
      block.kind === "process" &&
      block.status === "in_progress"
    ) {
      expanded.add(index);
      return;
    }

    if (
      block.defaultExpanded &&
      (!collapseInactiveDetails ||
        (block.kind === "approval" && block.status !== "completed") ||
        block.kind === "alert")
    ) {
      expanded.add(index);
    }
  });

  if (focusBlockIndex >= 0) {
    const focusBlock = blocks[focusBlockIndex];
    const shouldExpandFocus =
      (focusBlock?.kind === "approval" && focusBlock.status !== "completed") ||
      focusBlock?.kind === "alert" ||
      turn.status === "failed" ||
      turn.status === "aborted";

    if (shouldExpandFocus && !collapseInactiveDetails) {
      expanded.add(focusBlockIndex);
    }

    if (
      shouldExpandFocus &&
      !collapseInactiveDetails &&
      isCurrentTurn &&
      focusBlockIndex > 0
    ) {
      const previousBlock = blocks[focusBlockIndex - 1];
      if (previousBlock?.kind !== "other") {
        expanded.add(focusBlockIndex - 1);
      }
    }
  }

  return expanded;
}

function normalizeBlockPreviewLine(
  kind: AgentThreadOrderedBlock["kind"],
  line: string,
): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return line;
  }

  if (
    kind === "artifact" &&
    !hasAnyPrefix(trimmed, [
      "看了 ",
      "读了 ",
      "写了 ",
      "改了 ",
      "动了 ",
      "产出了 ",
    ])
  ) {
    return `产出了 ${trimmed}`;
  }

  if (
    kind === "approval" &&
    !hasAnyPrefix(trimmed, [
      "等你补充：",
      "等你确认：",
      "等你补充信息",
      "等你确认这一步",
    ])
  ) {
    return `等你确认：${trimmed}`;
  }

  if (
    kind === "alert" &&
    !hasAnyPrefix(trimmed, ["收到提醒：", "碰到错误："])
  ) {
    return `收到提醒：${trimmed}`;
  }

  if (
    kind === "subagent" &&
    !hasAnyPrefix(trimmed, ["分给子任务", "子任务", "分给协作成员", "协作成员"])
  ) {
    return `分给子任务处理 ${trimmed}`;
  }

  return trimmed;
}

export function resolveBlockSummaryLines(block: AgentThreadOrderedBlock): string[] {
  const isTurnSummaryOnlyBlock =
    block.items.length > 0 &&
    block.items.every((item) => item.type === "turn_summary");
  const isThinkingOnlyBlock = block.items.every((item) =>
    isThinkingTimelineItem(item),
  );
  const normalizedPreviewLines = block.previewLines
    .map((line) => normalizeBlockPreviewLine(block.kind, line))
    .filter((line) => line.trim().length > 0)
    .map((line) => shortenInlineText(line, 92) || line);

  if (isTurnSummaryOnlyBlock) {
    const headline = block.status === "in_progress" ? "处理中" : "当前进展";
    if (normalizedPreviewLines.length > 0) {
      return [
        headline,
        ...normalizedPreviewLines.filter((line) => line !== headline),
      ];
    }

    return [headline];
  }

  if (isThinkingOnlyBlock) {
    const headline = block.status === "in_progress" ? "思考中" : "已完成思考";
    if (normalizedPreviewLines.length > 0) {
      return [
        headline,
        ...normalizedPreviewLines.filter((line) => line !== headline),
      ];
    }

    return [headline];
  }

  if (block.kind === "process" && block.items.length > 1) {
    return [block.title, ...normalizedPreviewLines];
  }

  if (normalizedPreviewLines.length > 0) {
    return normalizedPreviewLines;
  }

  if (block.kind === "approval") {
    return [block.status === "completed" ? "这一步已经确认" : "等你确认这一步"];
  }

  if (block.kind === "alert") {
    return [block.status === "failed" ? "碰到错误" : "收到提醒"];
  }

  if (block.kind === "subagent") {
    return [block.status === "completed" ? "子任务已完成" : "子任务处理中"];
  }

  if (block.kind === "other") {
    return [resolveCompactTechnicalSummary(block)];
  }

  return [block.title];
}

export function resolveProcessMixLabel(block: AgentThreadOrderedBlock): string | null {
  if (block.kind !== "process" || block.items.length <= 1) {
    return null;
  }

  const toolCount = block.items.filter((item) =>
    isToolExecutionTimelineItem(item),
  ).length;
  const thinkingCount = block.items.filter((item) =>
    isThinkingTimelineItem(item),
  ).length;

  const parts: string[] = [];
  if (toolCount > 0) {
    parts.push(`${toolCount} 个工具步骤`);
  }
  if (thinkingCount > 0) {
    parts.push(`${thinkingCount} 条思路`);
  }

  return parts.length > 0 ? parts.join("，") : null;
}

function findLatestPendingAction(
  actionRequests: ActionRequired[] | undefined,
): ActionRequired | null {
  if (!actionRequests?.length) {
    return null;
  }

  for (let index = actionRequests.length - 1; index >= 0; index -= 1) {
    const actionRequest = actionRequests[index];
    if (actionRequest.status !== "submitted") {
      return actionRequest;
    }
  }

  return null;
}
