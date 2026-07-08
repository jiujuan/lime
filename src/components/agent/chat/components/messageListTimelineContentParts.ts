import type { AgentThreadItem, Message } from "../types";
import { hasImportedSourceProcessItem } from "../utils/importedSourceProcess";
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
  shouldRenderTimelineAgentMessageAsVisibleText,
} from "./messageListTimelineContentPartText";

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

export function buildTimelineInlineContentParts(params: {
  displayContent: string;
  processPrefaceContent?: string;
  existingContentParts?: Message["contentParts"];
  items?: AgentThreadItem[];
}): Message["contentParts"] | undefined {
  const items = params.items || [];
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
  const hasImportedProcess = hasImportedSourceProcessItem(items);

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
    !hasImportedProcess &&
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
