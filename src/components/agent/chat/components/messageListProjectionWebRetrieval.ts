import type { AgentThreadItem, Message } from "../types";
import {
  isAgentMessageCommentaryPhase,
  shouldUseAgentMessageAsFinalText,
} from "../utils/agentMessagePhase";
import { isUnifiedWebSearchToolName } from "../utils/searchResultPreview";
import { isUnifiedWebFetchToolName } from "../utils/toolNameFamily";

export function hasRunningWebRetrievalContentPart(
  parts?: Message["contentParts"],
): boolean {
  return Boolean(
    parts?.some((part) => {
      return (
        part.type === "tool_use" &&
        part.toolCall.status === "running" &&
        (isUnifiedWebSearchToolName(part.toolCall.name) ||
          isUnifiedWebFetchToolName(part.toolCall.name))
      );
    }),
  );
}

function isRunningThreadItemStatus(status?: string | null): boolean {
  return status === "in_progress" || status === "running";
}

export function isActiveThreadTurnStatus(status?: string | null): boolean {
  return status === "running" || status === "queued" || status === "in_progress";
}

function isWebRetrievalThreadItem(item: AgentThreadItem): boolean {
  return (
    item.type === "web_search" ||
    (item.type === "tool_call" &&
      (isUnifiedWebSearchToolName(item.tool_name) ||
        isUnifiedWebFetchToolName(item.tool_name)))
  );
}

export function hasRunningWebRetrievalTimelineItem(
  items?: AgentThreadItem[],
): boolean {
  return Boolean(
    items?.some(
      (item) =>
        isRunningThreadItemStatus(item.status) &&
        isWebRetrievalThreadItem(item),
    ),
  );
}

export function hasCompletedOrRunningWebRetrievalTimelineItem(
  items?: AgentThreadItem[],
): boolean {
  return Boolean(
    items?.some(
      (item) =>
        (item.status === "completed" ||
          isRunningThreadItemStatus(item.status)) &&
        isWebRetrievalThreadItem(item),
    ),
  );
}

export function normalizeInactiveRunningWebRetrievalContentParts(
  parts: Message["contentParts"] | undefined,
  shouldNormalize: boolean,
): Message["contentParts"] | undefined {
  if (!shouldNormalize || !parts?.length) {
    return parts;
  }

  let changed = false;
  const nextParts = parts.map((part) => {
    if (
      part.type !== "tool_use" ||
      part.toolCall.status !== "running" ||
      (!isUnifiedWebSearchToolName(part.toolCall.name) &&
        !isUnifiedWebFetchToolName(part.toolCall.name))
    ) {
      return part;
    }

    changed = true;
    return {
      ...part,
      toolCall: {
        ...part.toolCall,
        status: "completed" as const,
      },
    };
  });

  return changed ? nextParts : parts;
}

export function normalizeInactiveRunningWebRetrievalTimelineItems(
  items: AgentThreadItem[] | undefined,
  shouldNormalize: boolean,
): AgentThreadItem[] | undefined {
  if (!shouldNormalize || !items?.length) {
    return items;
  }

  let changed = false;
  const nextItems = items.map((item) => {
    if (
      !isRunningThreadItemStatus(item.status) ||
      !isWebRetrievalThreadItem(item)
    ) {
      return item;
    }

    changed = true;
    return {
      ...item,
      status: "completed" as const,
      completed_at: item.completed_at || item.updated_at || item.started_at,
    } as AgentThreadItem;
  });

  return changed ? nextItems : items;
}

export function hideFinalAnswerContentPartsWhileRunning(
  parts?: Message["contentParts"],
  shouldHide?: boolean,
): Message["contentParts"] | undefined {
  if (!shouldHide || !parts?.length) {
    return parts;
  }

  let changed = false;
  const nextParts = parts.filter((part) => {
    if (part.type !== "text") {
      return true;
    }
    const phase = part.metadata?.phase;
    if (
      typeof phase === "string" &&
      isAgentMessageCommentaryPhase(phase)
    ) {
      return true;
    }
    changed = true;
    return false;
  });

  return changed ? nextParts : parts;
}

export function hasFinalAnswerTextAfterRunningWebRetrieval(
  items?: AgentThreadItem[],
): boolean {
  if (!items?.length) {
    return false;
  }

  const orderedItems = [...items].sort((left, right) => {
    const leftSequence = Number.isFinite(left.sequence)
      ? Number(left.sequence)
      : Number.MAX_SAFE_INTEGER;
    const rightSequence = Number.isFinite(right.sequence)
      ? Number(right.sequence)
      : Number.MAX_SAFE_INTEGER;
    if (leftSequence !== rightSequence) {
      return leftSequence - rightSequence;
    }
    return left.id.localeCompare(right.id);
  });

  let sawRunningWebRetrieval = false;
  for (const item of orderedItems) {
    if (
      isWebRetrievalThreadItem(item) &&
      isRunningThreadItemStatus(item.status)
    ) {
      sawRunningWebRetrieval = true;
      continue;
    }

    if (
      sawRunningWebRetrieval &&
      item.type === "agent_message" &&
      !isAgentMessageCommentaryPhase(item.phase) &&
      shouldUseAgentMessageAsFinalText(item.phase) &&
      item.text.trim().length > 0
    ) {
      return true;
    }
  }

  return false;
}

export function hasFinalAnswerTextTimelineItem(
  items?: AgentThreadItem[],
): boolean {
  return Boolean(
    items?.some(
      (item) =>
        item.type === "agent_message" &&
        !isAgentMessageCommentaryPhase(item.phase) &&
        shouldUseAgentMessageAsFinalText(item.phase) &&
        item.text.trim().length > 0,
    ),
  );
}
