import type { AgentToolCallState } from "@/lib/api/agentProtocol";
import {
  isAgentMessageCommentaryPhase,
  shouldUseAgentMessageAsFinalText,
} from "../utils/agentMessagePhase";
import type { AgentThreadItem, Message } from "../types";
import {
  aggregateFileChanges,
  type FileChangesAggregate,
} from "../utils/fileChangeSummary";
import {
  hasImportedSourceProcessItem,
  isImportedSourceProcessItem,
} from "../utils/importedSourceProcess";
import {
  toActionRequired,
  toToolCallState,
} from "./timeline-utils/itemConverters";

type MessageContentPart = NonNullable<Message["contentParts"]>[number];

function stringifyTimelineArguments(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveTimelineToolStatus(
  status: AgentThreadItem["status"],
): AgentToolCallState["status"] {
  if (status === "in_progress") {
    return "running";
  }
  return status;
}

function appendTextContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "text") {
    lastPart.text = `${lastPart.text}\n${normalized}`;
    return;
  }

  parts.push({ type: "text", text: normalized });
}

function appendThinkingContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
  metadata?: Record<string, unknown>,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "thinking") {
    lastPart.text = `${lastPart.text}\n\n${normalized}`;
    if (!lastPart.metadata && metadata) {
      lastPart.metadata = metadata;
    }
    return;
  }

  parts.push({
    type: "thinking",
    text: normalized,
    ...(metadata ? { metadata } : {}),
  });
}

function appendPlanContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }
  appendTextContentPart(
    parts,
    `<proposed_plan>\n${normalized}\n</proposed_plan>`,
  );
}

function shouldRenderTimelineAgentMessageText(item: AgentThreadItem): boolean {
  if (item.type !== "agent_message") {
    return false;
  }

  return (
    shouldUseAgentMessageAsFinalText(item.phase) ||
    isAgentMessageCommentaryPhase(item.phase)
  );
}

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function buildTimelineToolContentPart(
  item: AgentThreadItem,
): MessageContentPart | null {
  if (
    item.type === "tool_call" ||
    item.type === "command_execution" ||
    item.type === "web_search"
  ) {
    const toolCall = toToolCallState(item);
    if (!toolCall) {
      return null;
    }
    return {
      type: "tool_use",
      toolCall,
    };
  }

  return null;
}

function buildTimelineActionContentPart(
  item: AgentThreadItem,
): MessageContentPart | null {
  if (item.type !== "approval_request" && item.type !== "request_user_input") {
    return null;
  }

  const actionRequired = toActionRequired(item);
  if (!actionRequired) {
    return null;
  }

  return {
    type: "action_required",
    actionRequired,
  };
}

function buildTimelinePatchContentPart(
  item: AgentThreadItem,
): MessageContentPart | null {
  if (item.type !== "patch") {
    return null;
  }

  const aggregate = aggregateFileChanges([buildTimelinePatchToolCall(item)]);
  if (aggregate.fileCount === 0) {
    const fallbackAggregate = buildTimelinePatchFallbackAggregate(item);
    return fallbackAggregate
      ? { type: "file_changes_batch", aggregate: fallbackAggregate }
      : null;
  }

  return { type: "file_changes_batch", aggregate };
}

function buildTimelinePatchToolCall(
  item: Extract<AgentThreadItem, { type: "patch" }>,
): AgentToolCallState {
  const status = resolveTimelineToolStatus(item.status);
  const metadata = metadataRecord(item.metadata);
  const primaryPath = item.paths?.find((path) => path.trim().length > 0);
  return {
    id: item.id,
    name: "Patch",
    arguments: stringifyTimelineArguments({
      path: primaryPath,
      paths: item.paths,
    }),
    status,
    startTime: new Date(item.started_at),
    endTime: item.completed_at ? new Date(item.completed_at) : undefined,
    metadata,
    result:
      status === "running"
        ? undefined
        : {
            success: item.success !== false,
            output: [item.stdout, item.stderr, item.text]
              .filter((value): value is string => Boolean(value?.trim()))
              .join("\n"),
            metadata,
          },
  };
}

function buildTimelinePatchFallbackAggregate(
  item: Extract<AgentThreadItem, { type: "patch" }>,
): FileChangesAggregate | null {
  const paths = (item.paths?.length ? item.paths : item.summary || [])
    .map((path) => path.trim())
    .filter(Boolean);
  const uniquePaths = Array.from(new Set(paths));
  if (uniquePaths.length === 0) {
    return null;
  }

  const files = uniquePaths.map((path) => ({
    path,
    kind: "update" as const,
    linesAdded: 0,
    linesRemoved: 0,
    diff: [],
    truncated: false,
    source: "backend" as const,
    status: resolveTimelineToolStatus(item.status),
  }));

  return {
    files,
    totalAdded: 0,
    totalRemoved: 0,
    fileCount: files.length,
  };
}

export function buildTimelineInlineContentParts(params: {
  displayContent: string;
  existingContentParts?: Message["contentParts"];
  items?: AgentThreadItem[];
}): Message["contentParts"] | undefined {
  const items = params.items || [];
  const hasAgentMessage = items.some(
    (item) =>
      item.type === "agent_message" &&
      shouldRenderTimelineAgentMessageText(item) &&
      item.text.trim().length > 0,
  );
  const hasImportedProcess = hasImportedSourceProcessItem(items);

  const reasoningCount = items.filter(
    (item) => item.type === "reasoning" && item.text.trim().length > 0,
  ).length;
  const planCount = items.filter(
    (item) => item.type === "plan" && item.text.trim().length > 0,
  ).length;
  const hasImportedReasoning = items.some(
    (item) =>
      item.type === "reasoning" &&
      item.text.trim().length > 0 &&
      isImportedSourceProcessItem(item),
  );
  const toolLikeCount = items.filter(
    (item) =>
      item.type === "tool_call" ||
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
    reasoningCount < 2 &&
    planCount === 0 &&
    !hasImportedReasoning &&
    toolLikeCount === 0 &&
    actionLikeCount === 0
  ) {
    return undefined;
  }
  if (!hasAgentMessage && !hasImportedProcess) {
    return undefined;
  }

  const parts: MessageContentPart[] = [];
  for (const item of items) {
    if (item.type === "reasoning") {
      appendThinkingContentPart(
        parts,
        item.text,
        metadataRecord(item.metadata),
      );
      continue;
    }

    if (item.type === "plan") {
      appendPlanContentPart(parts, item.text);
      continue;
    }

    if (
      item.type === "agent_message" &&
      shouldRenderTimelineAgentMessageText(item)
    ) {
      appendTextContentPart(parts, item.text);
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

  const fileChangeParts = (params.existingContentParts || []).filter(
    (part) => part.type === "file_changes_batch",
  );
  if (fileChangeParts.length > 0) {
    parts.push(...fileChangeParts);
  }

  return parts;
}
