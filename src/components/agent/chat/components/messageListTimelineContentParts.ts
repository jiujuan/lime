import type { AgentThreadItem, Message } from "../types";
import { aggregateFileChangeSummaries } from "../utils/fileChangeSummary";
import { resolveFinalAgentMessageItemIds } from "../utils/agentMessagePhase";
import { isUpdatePlanToolName } from "../utils/toolNameFamily";
import {
  buildTimelineActionContentPart,
  buildTimelinePatchContentPart,
  buildTimelineToolContentPart,
  isTimelineProcessItem,
  timelineItemMetadata,
  timelineTextMetadata,
} from "./messageListTimelineContentPartBuilders";
import { mergeSparseTimelineProcessIntoExistingParts } from "./messageListTimelineSparseMerge";
import type { MessageContentPart } from "./messageListTimelineContentPartTypes";
import {
  appendPlanContentPart,
  appendTextContentPart,
  appendThinkingContentPart,
  hasFinalTextContentPart,
  hasOnlyDuplicateReasoningItems,
  mergeExistingLeadAndFinalParts,
  shouldRenderTimelineAgentMessageAsCommentaryText,
  shouldRenderTimelineAgentMessageAsVisibleText,
} from "./messageListTimelineContentPartText";
import {
  areComparableContentTextsEqual,
  areComparableContentTextsRelated,
  normalizeComparableContentText,
  readableContentTextScore,
} from "./messageListComparableText";
import { selectFinalTextContentParts } from "./messageListProjectionContentParts";

function normalizeTimelineReasoningText(text: string): string {
  return normalizeComparableContentText(text);
}

function scoreTimelineReasoningItem(item: AgentThreadItem): number {
  if (item.type !== "reasoning") {
    return 0;
  }
  let score = 0;
  if (!item.id.startsWith("streamed-reasoning:")) {
    score += 4;
  }
  if (item.status === "completed") {
    score += 2;
  }
  if (item.status === "in_progress") {
    score += 1;
  }
  score += readableContentTextScore(item.text);
  return score;
}

function dedupeTimelineReasoningItems(
  items: AgentThreadItem[],
): AgentThreadItem[] {
  const nextItems: AgentThreadItem[] = [];

  for (const item of items) {
    const normalizedText =
      item.type === "reasoning"
        ? normalizeTimelineReasoningText(item.text)
        : "";
    if (item.type !== "reasoning" || !normalizedText) {
      nextItems.push(item);
      continue;
    }

    const existingIndex = nextItems.findIndex(
      (candidate) =>
        candidate.type === "reasoning" &&
        candidate.turn_id === item.turn_id &&
        areComparableContentTextsRelated(candidate.text, item.text),
    );
    if (existingIndex < 0) {
      nextItems.push(item);
      continue;
    }

    const existingItem = nextItems[existingIndex];
    if (
      existingItem &&
      scoreTimelineReasoningItem(item) >=
        scoreTimelineReasoningItem(existingItem)
    ) {
      nextItems[existingIndex] = item;
    }
  }

  return nextItems.length === items.length ? items : nextItems;
}

function shouldPrependDisplayContentBeforeActiveTimelineProcess(params: {
  processPrefaceContent: string;
  existingContentParts?: Message["contentParts"];
  items: AgentThreadItem[];
}): boolean {
  if (!params.processPrefaceContent.trim()) {
    return false;
  }
  if (params.existingContentParts?.length) {
    return false;
  }
  if (
    params.items.some(
      (item) =>
        item.type === "agent_message" &&
        shouldRenderTimelineAgentMessageAsVisibleText(item) &&
        item.text.trim().length > 0,
    )
  ) {
    return false;
  }
  return params.items.some(
    (item) => isTimelineProcessItem(item) && item.status === "in_progress",
  );
}

export function buildTimelineVisibleTextContentParts(params: {
  displayContent: string;
  existingContentParts?: Message["contentParts"];
  includeCommentary?: boolean;
  items?: AgentThreadItem[];
}): Message["contentParts"] | undefined {
  const includeCommentary = params.includeCommentary !== false;
  const compactFinalAgentMessageIds = includeCommentary
    ? null
    : resolveFinalAgentMessageItemIds(params.items || []);
  const timelineParts: MessageContentPart[] = [];
  for (const item of params.items || []) {
    if (
      item.type !== "agent_message" ||
      !shouldRenderTimelineAgentMessageAsVisibleText(item) ||
      (!includeCommentary &&
        (!compactFinalAgentMessageIds?.has(item.id) ||
          shouldRenderTimelineAgentMessageAsCommentaryText(item)))
    ) {
      continue;
    }
    appendTextContentPart(timelineParts, item.text, timelineTextMetadata(item));
  }

  const existingTextParts = (params.existingContentParts || []).filter(
    (part): part is Extract<MessageContentPart, { type: "text" }> =>
      part.type === "text" && part.text.trim().length > 0,
  );
  const existingCommentaryParts = existingTextParts.filter(
    (part) => part.metadata?.phase === "commentary",
  );
  const existingFinalParts = selectFinalTextContentParts(existingTextParts);
  const parts: MessageContentPart[] = [];
  const readPartIdentity = (
    part: Extract<MessageContentPart, { type: "text" }>,
  ): string | null => {
    for (const value of [part.metadata?.threadItemId, part.metadata?.itemId]) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return null;
  };
  const appendUniquePart = (
    part: Extract<MessageContentPart, { type: "text" }>,
  ) => {
    const identity = readPartIdentity(part);
    for (const candidate of parts) {
      if (candidate.type !== "text") {
        continue;
      }
      const candidateIdentity = readPartIdentity(candidate);
      if (identity && candidateIdentity === identity) {
        return;
      }
      if (
        !identity &&
        !candidateIdentity &&
        areComparableContentTextsEqual(candidate.text, part.text)
      ) {
        return;
      }
    }
    parts.push(part);
  };

  if (includeCommentary) {
    existingCommentaryParts.forEach(appendUniquePart);
  }
  timelineParts.forEach((part) => {
    if (part.type === "text") {
      appendUniquePart(part);
    }
  });
  existingFinalParts.forEach(appendUniquePart);

  if (
    params.displayContent.trim() &&
    !parts.some(
      (part) =>
        part.type === "text" &&
        areComparableContentTextsEqual(part.text, params.displayContent),
    )
  ) {
    appendTextContentPart(parts, params.displayContent);
  }

  return parts.length > 0 ? parts : undefined;
}

export function buildTimelineFileChangesContentPart(
  items?: AgentThreadItem[],
): Extract<MessageContentPart, { type: "file_changes_batch" }> | undefined {
  const patchParts = (items || []).flatMap((item) => {
    const part = buildTimelinePatchContentPart(item);
    return part?.type === "file_changes_batch" ? [part] : [];
  });
  if (patchParts.length === 0) {
    return undefined;
  }
  if (patchParts.length === 1) {
    return patchParts[0];
  }

  const patchItems = (items || []).filter(
    (item): item is Extract<AgentThreadItem, { type: "patch" }> =>
      item.type === "patch",
  );
  const firstPatchItem = patchItems[0];
  const aggregate = aggregateFileChangeSummaries(
    patchParts.flatMap((part) => part.aggregate.files),
  );
  if (!firstPatchItem || aggregate.fileCount === 0) {
    return undefined;
  }

  return {
    type: "file_changes_batch",
    aggregate,
    metadata: {
      ...timelineItemMetadata(firstPatchItem, "thread_item_patch"),
      threadItemIds: patchItems.map((item) => item.id),
    },
  };
}

export function buildTimelineInlineContentParts(params: {
  displayContent: string;
  processPrefaceContent?: string;
  existingContentParts?: Message["contentParts"];
  items?: AgentThreadItem[];
}): Message["contentParts"] | undefined {
  const items = dedupeTimelineReasoningItems(params.items || []);
  const sparseMergedParts = mergeSparseTimelineProcessIntoExistingParts({
    items,
    existingContentParts: params.existingContentParts,
    displayContent: params.displayContent,
  });
  if (sparseMergedParts) {
    return sparseMergedParts;
  }

  const hasAgentMessage = items.some((item) => {
    if (item.type !== "agent_message") {
      return false;
    }
    return (
      shouldRenderTimelineAgentMessageAsVisibleText(item) &&
      item.text.trim().length > 0
    );
  });
  const reasoningCount = items.filter(
    (item) => item.type === "reasoning" && item.text.trim().length > 0,
  ).length;
  const planCount = items.filter(
    (item) => item.type === "plan" && item.text.trim().length > 0,
  ).length;
  const toolLikeCount = items.filter(
    (item) =>
      (item.type === "tool_call" && !isUpdatePlanToolName(item.tool_name)) ||
      item.type === "command_execution" ||
      item.type === "patch" ||
      item.type === "web_search" ||
      item.type === "subagent_activity" ||
      item.type === "context_compaction",
  ).length;
  const actionLikeCount = items.filter(
    (item) =>
      item.type === "approval_request" || item.type === "request_user_input",
  ).length;
  if (
    hasOnlyDuplicateReasoningItems({
      items,
      existingContentParts: params.existingContentParts,
    })
  ) {
    return undefined;
  }
  if (
    !hasAgentMessage &&
    reasoningCount === 0 &&
    planCount === 0 &&
    toolLikeCount === 0 &&
    actionLikeCount === 0
  ) {
    return undefined;
  }

  const parts: MessageContentPart[] = [];
  const processPrefaceContent =
    params.processPrefaceContent ?? params.displayContent;
  const didPrependDisplayContent =
    shouldPrependDisplayContentBeforeActiveTimelineProcess({
      processPrefaceContent,
      existingContentParts: params.existingContentParts,
      items,
    });
  if (didPrependDisplayContent) {
    appendTextContentPart(parts, processPrefaceContent);
  }

  for (const item of items) {
    if (item.type === "reasoning") {
      appendThinkingContentPart(
        parts,
        item.text,
        timelineItemMetadata(item, "thread_item_reasoning"),
      );
      continue;
    }

    if (item.type === "plan") {
      appendPlanContentPart(parts, item.text);
      continue;
    }

    if (
      item.type === "agent_message" &&
      shouldRenderTimelineAgentMessageAsVisibleText(item)
    ) {
      appendTextContentPart(parts, item.text, timelineTextMetadata(item));
      continue;
    }

    const patchPart = buildTimelinePatchContentPart(item);
    if (patchPart) {
      parts.push(patchPart);
      continue;
    }

    const toolPart = buildTimelineToolContentPart(item);
    if (toolPart) {
      parts.push(toolPart);
      continue;
    }

    const actionPart = buildTimelineActionContentPart(item);
    if (actionPart) {
      parts.push(actionPart);
    }
  }

  if (!didPrependDisplayContent && !hasFinalTextContentPart(parts)) {
    appendTextContentPart(parts, params.displayContent);
  }

  const hasTextPart = parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
  const hasProcessPart = parts.some(
    (part) =>
      part.type === "thinking" ||
      part.type === "tool_use" ||
      part.type === "file_changes_batch" ||
      part.type === "action_required",
  );
  if (!hasTextPart && !hasProcessPart) {
    return undefined;
  }

  const mergedParts = mergeExistingLeadAndFinalParts({
    parts,
    existingContentParts: params.existingContentParts,
    displayContent: params.displayContent,
  });

  const fileChangeParts = (params.existingContentParts || []).filter(
    (part) => part.type === "file_changes_batch",
  );
  if (fileChangeParts.length > 0) {
    mergedParts.push(...fileChangeParts);
  }

  return mergedParts;
}
