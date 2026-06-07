import type {
  AgentContextTraceStep as ContextTraceStep,
  AgentThreadItem,
  AgentThreadTurn,
  AgentTokenUsage,
} from "@/lib/api/agentProtocol";
import type {
  ContentPart,
  Message,
  MessageImage,
  MessageImageWorkbenchPreview,
  MessageTaskPreview,
} from "../types";
import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import type {
  Artifact,
  ArtifactStatus,
  ArtifactType,
} from "@/lib/artifact/types";
import { resolveArtifactProtocolFilePath } from "@/lib/artifact-protocol";
import { mergeArtifacts } from "../utils/messageArtifacts";
import {
  buildImageTaskPreviewFromToolResult,
  buildTaskPreviewFromToolResult,
} from "../utils/taskPreviewFromToolResult";
import {
  extractLimeToolMetadataBlock,
  isToolResultSuccessful,
  normalizeHistoryImagePart,
  normalizeToolResultImages,
  normalizeToolResultMetadata,
  resolveHistoryUserDataText,
  stringifyToolArguments,
} from "./agentChatToolResult";
import {
  sanitizeContentPartsForDisplay,
  sanitizeMessageTextForDisplay,
} from "../utils/messageDisplaySanitizer";
import {
  resolveFinalAgentMessageItemIds,
  shouldUseAgentMessageAsFinalText,
} from "../utils/agentMessagePhase";
import {
  aggregateFileChanges,
  isFileMutationToolName,
} from "../utils/fileChangeSummary";
import {
  isRetainedSkillProcessMessage,
  SKILL_INLINE_PROCESS_RETENTION,
} from "../utils/skillInlineProcessRetention";
import {
  buildFailedAgentMessageContent,
  buildFailedAgentRuntimeStatus,
} from "../utils/agentRuntimeStatus";

export const normalizeHistoryPartType = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
};

type HistoryToolCall = NonNullable<Message["toolCalls"]>[number];
type HistoryToolUseContentPart = Extract<ContentPart, { type: "tool_use" }>;
type HistoryThreadToolCall = NonNullable<
  NonNullable<AsterSessionDetail["thread_read"]>["tool_calls"]
>[number];

function settleRunningToolCallOnCompletedAssistant(
  toolCall: HistoryToolCall,
  completedAt: Date,
): HistoryToolCall {
  if (toolCall.status !== "running") {
    return toolCall;
  }

  return {
    ...toolCall,
    status: "completed",
    endTime: toolCall.endTime ?? completedAt,
    result: toolCall.result ?? {
      success: true,
      output: "",
    },
  };
}

function settleCompletedAssistantRunningToolState(message: Message): Message {
  if (
    message.role !== "assistant" ||
    message.isThinking ||
    !hasRenderableAssistantTextContent(message)
  ) {
    return message;
  }

  const hasRunningToolCall =
    message.toolCalls?.some((toolCall) => toolCall.status === "running") ??
    false;
  const hasRunningToolPart =
    message.contentParts?.some(
      (part) => part.type === "tool_use" && part.toolCall.status === "running",
    ) ?? false;

  if (!hasRunningToolCall && !hasRunningToolPart) {
    return message;
  }

  const completedAt = message.timestamp;
  return {
    ...message,
    toolCalls: message.toolCalls?.map((toolCall) =>
      settleRunningToolCallOnCompletedAssistant(toolCall, completedAt),
    ),
    contentParts: message.contentParts?.map((part) =>
      part.type === "tool_use"
        ? {
            ...part,
            toolCall: settleRunningToolCallOnCompletedAssistant(
              part.toolCall,
              completedAt,
            ),
          }
        : part,
    ),
  };
}

export const normalizeHistoryMessage = (message: Message): Message | null => {
  if (message.role !== "user") {
    return settleCompletedAssistantRunningToolState(message);
  }

  const text = message.content.trim();
  const hasImages = Array.isArray(message.images) && message.images.length > 0;
  if (text.length > 0 || hasImages) return message;

  const hasToolCalls =
    Array.isArray(message.toolCalls) && message.toolCalls.length > 0;
  const hasOnlyToolUseParts =
    Array.isArray(message.contentParts) &&
    message.contentParts.length > 0 &&
    message.contentParts.every((part) => part.type === "tool_use");

  if (hasToolCalls || hasOnlyToolUseParts) {
    return {
      ...message,
      role: "assistant",
    };
  }

  return null;
};

export const normalizeHistoryMessages = (messages: Message[]): Message[] =>
  messages
    .map((msg) => normalizeHistoryMessage(msg))
    .filter((msg): msg is Message => msg !== null);

const normalizeHistoryUsage = (usage: unknown): AgentTokenUsage | undefined => {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const inputTokens = (usage as { input_tokens?: unknown }).input_tokens;
  const outputTokens = (usage as { output_tokens?: unknown }).output_tokens;
  const cachedInputTokens = (usage as { cached_input_tokens?: unknown })
    .cached_input_tokens;
  const cacheCreationInputTokens = (
    usage as { cache_creation_input_tokens?: unknown }
  ).cache_creation_input_tokens;
  if (
    typeof inputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    return undefined;
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cached_input_tokens:
      typeof cachedInputTokens === "number" &&
      Number.isFinite(cachedInputTokens) &&
      cachedInputTokens >= 0
        ? cachedInputTokens
        : undefined,
    cache_creation_input_tokens:
      typeof cacheCreationInputTokens === "number" &&
      Number.isFinite(cacheCreationInputTokens) &&
      cacheCreationInputTokens >= 0
        ? cacheCreationInputTokens
        : undefined,
  };
};

export const hasLegacyFallbackToolNames = (messages: Message[]): boolean =>
  messages.some((message) =>
    (message.toolCalls || []).some((toolCall) =>
      /^工具调用\s+call_[0-9a-z]+$/i.test(toolCall.name.trim()),
    ),
  );

export const resolveHistoryToolName = (
  toolId: string,
  nameById: Map<string, string>,
): string => {
  const existing = nameById.get(toolId);
  if (existing && existing.trim()) {
    return existing.trim();
  }
  const shortId = toolId.trim().slice(0, 8);
  return shortId ? `工具调用 ${shortId}` : "工具调用";
};

export const appendTextWithOverlapDetection = (
  base: string,
  chunk: string,
): string => {
  if (!base) return chunk;
  if (!chunk) return base;
  if (chunk.startsWith(base)) return chunk;
  if (base.endsWith(chunk)) return base;

  const maxOverlap = Math.min(base.length, chunk.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (base.slice(-overlap) === chunk.slice(0, overlap)) {
      return base + chunk.slice(overlap);
    }
  }

  return base + chunk;
};

export const appendTextToParts = (
  parts: ContentPart[],
  text: string,
): ContentPart[] => {
  const newParts = [...parts];
  const lastPart = newParts[newParts.length - 1];

  if (lastPart && lastPart.type === "text") {
    newParts[newParts.length - 1] = {
      type: "text",
      text: appendTextWithOverlapDetection(lastPart.text, text),
    };
  } else {
    newParts.push({ type: "text", text });
  }
  return newParts;
};

export const appendThinkingToHistoryParts = (
  parts: ContentPart[],
  text: string,
): ContentPart[] => {
  if (!text) {
    return parts;
  }

  const nextParts = [...parts];
  const lastPart = nextParts[nextParts.length - 1];

  if (lastPart?.type === "thinking") {
    nextParts[nextParts.length - 1] = {
      type: "thinking",
      text: lastPart.text + text,
    };
    return nextParts;
  }

  nextParts.push({
    type: "thinking",
    text,
  });
  return nextParts;
};

export const extractThinkingContentFromParts = (
  parts?: ContentPart[],
): string | undefined => {
  if (!parts || parts.length === 0) {
    return undefined;
  }

  const thinkingText = parts
    .filter(
      (part): part is Extract<ContentPart, { type: "thinking" }> =>
        part.type === "thinking",
    )
    .map((part) => part.text)
    .join("");

  return thinkingText || undefined;
};

function mergeImageWorkbenchPreview(
  previous?: MessageImageWorkbenchPreview,
  next?: MessageImageWorkbenchPreview,
): MessageImageWorkbenchPreview | undefined {
  if (!previous) {
    return next;
  }
  if (!next) {
    return previous;
  }
  if (previous.taskId !== next.taskId) {
    return next;
  }
  return {
    ...previous,
    ...next,
  };
}

function mergeTaskPreview(
  previous?: MessageTaskPreview,
  next?: MessageTaskPreview,
): MessageTaskPreview | undefined {
  if (!previous) {
    return next;
  }
  if (!next) {
    return previous;
  }
  if (previous.taskId !== next.taskId) {
    return next;
  }
  return {
    ...previous,
    ...next,
  };
}

function contentPartContainsProcess(part: ContentPart): boolean {
  return part.type !== "text";
}

function mergeToolCallStates(
  previous: HistoryToolCall,
  next: HistoryToolCall,
): HistoryToolCall {
  if (previous.status === "running" && next.status !== "running") {
    return next;
  }
  if (previous.status !== "running" && next.status === "running") {
    return previous;
  }
  return next;
}

function mergeToolUseContentPart(
  previous: HistoryToolUseContentPart,
  next: HistoryToolUseContentPart,
): HistoryToolUseContentPart {
  const mergedToolCall = mergeToolCallStates(previous.toolCall, next.toolCall);
  return mergedToolCall === previous.toolCall
    ? previous
    : {
        ...previous,
        ...next,
        toolCall: mergedToolCall,
      };
}

function mergeHydratedToolStateContentParts(
  baseParts?: ContentPart[],
  overlayParts?: ContentPart[],
): ContentPart[] | undefined {
  const base = Array.isArray(baseParts) ? [...baseParts] : [];
  const overlay = Array.isArray(overlayParts) ? overlayParts : [];

  if (base.length === 0) {
    return overlay.length > 0 ? overlay : undefined;
  }
  if (overlay.length === 0) {
    return base;
  }

  const toolUseIndexById = new Map<string, number>();
  const actionRequiredIndexById = new Map<string, number>();

  base.forEach((part, index) => {
    if (part.type === "tool_use") {
      toolUseIndexById.set(part.toolCall.id, index);
      return;
    }
    if (part.type === "action_required") {
      actionRequiredIndexById.set(part.actionRequired.requestId, index);
    }
  });

  for (const part of overlay) {
    if (part.type === "tool_use") {
      const existingIndex = toolUseIndexById.get(part.toolCall.id);
      if (existingIndex !== undefined) {
        const current = base[existingIndex];
        if (current?.type === "tool_use") {
          base[existingIndex] = mergeToolUseContentPart(current, part);
        }
        continue;
      }
      toolUseIndexById.set(part.toolCall.id, base.length);
      base.push(part);
      continue;
    }

    if (part.type === "action_required") {
      const existingIndex = actionRequiredIndexById.get(
        part.actionRequired.requestId,
      );
      if (existingIndex !== undefined) {
        base[existingIndex] = part;
        continue;
      }
      actionRequiredIndexById.set(part.actionRequired.requestId, base.length);
      base.push(part);
    }
  }

  return base;
}

function mergeByKey<T>(
  localItems: T[] | undefined,
  remoteItems: T[] | undefined,
  getKey: (item: T) => string,
): T[] | undefined {
  const local = Array.isArray(localItems) ? localItems : [];
  const remote = Array.isArray(remoteItems) ? remoteItems : [];

  if (local.length === 0) {
    return remote.length > 0 ? remote : undefined;
  }
  if (remote.length === 0) {
    return local;
  }

  const merged = new Map<string, T>();
  for (const item of local) {
    merged.set(getKey(item), item);
  }
  for (const item of remote) {
    merged.set(getKey(item), item);
  }
  return Array.from(merged.values());
}

function settleRunningToolCallOnRemoteFailure(
  toolCall: HistoryToolCall,
  failedMessage: Message,
): HistoryToolCall {
  if (toolCall.status !== "running") {
    return toolCall;
  }

  return {
    ...toolCall,
    status: "failed",
    endTime: failedMessage.timestamp,
    result: {
      success: false,
      output: "",
      error: failedMessage.runtimeStatus?.detail || failedMessage.content,
      images: undefined,
    },
  };
}

function settleRunningProcessPartsOnRemoteFailure(
  parts: ContentPart[] | undefined,
  failedMessage: Message,
): ContentPart[] | undefined {
  if (!parts) {
    return undefined;
  }

  return parts.map((part) => {
    if (part.type !== "tool_use") {
      return part;
    }

    return {
      ...part,
      toolCall: settleRunningToolCallOnRemoteFailure(
        part.toolCall,
        failedMessage,
      ),
    };
  });
}

function mergeHydratedContentParts(
  localParts?: ContentPart[],
  remoteParts?: ContentPart[],
): ContentPart[] | undefined {
  const local = Array.isArray(localParts) ? localParts : [];
  const remote = Array.isArray(remoteParts) ? remoteParts : [];

  if (local.length === 0) {
    return remote.length > 0 ? remote : undefined;
  }
  if (remote.length === 0) {
    return local;
  }

  const localHasProcess = local.some(contentPartContainsProcess);
  const remoteHasProcess = remote.some(contentPartContainsProcess);
  if (localHasProcess && !remoteHasProcess) {
    let merged = [...local];
    for (const part of remote) {
      if (part.type === "text" && part.text.trim()) {
        merged = appendTextToParts(merged, part.text);
      }
    }
    return merged;
  }

  return remote;
}

function hasRenderableAssistantTextContent(message: Message): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  if (message.content.trim().length > 0) {
    return true;
  }

  return (message.contentParts || []).some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
}

export function normalizeHistoricalTopicSnapshotMessage(
  message: Message,
): Message {
  if (
    message.role !== "assistant" ||
    message.isThinking ||
    !hasRenderableAssistantTextContent(message)
  ) {
    return message;
  }

  if (isRetainedSkillProcessMessage(message)) {
    return {
      ...message,
      thinkingContent:
        message.thinkingContent ??
        extractThinkingContentFromParts(message.contentParts),
    };
  }

  const visibleContentParts = (message.contentParts || []).filter(
    (part) => part.type === "text" || part.type === "action_required",
  );
  const contentText = message.content.trim();
  const contentParts =
    visibleContentParts.length > 0
      ? visibleContentParts
      : contentText
        ? [{ type: "text", text: contentText } satisfies ContentPart]
        : undefined;

  return {
    ...message,
    thinkingContent: undefined,
    contentParts,
  };
}

export const normalizeHistoricalTopicSnapshotMessages = (
  messages: Message[],
): Message[] => messages.map(normalizeHistoricalTopicSnapshotMessage);

function compactHistoricalRestoreMessage(message: Message): Message {
  const normalized = normalizeHistoricalTopicSnapshotMessage(message);
  if (normalized.role !== "assistant") {
    return normalized;
  }

  return {
    ...normalized,
    toolCalls: undefined,
    actionRequests: undefined,
    contextTrace: undefined,
  };
}

export const compactHistoricalRestoreMessages = (
  messages: Message[],
): Message[] =>
  normalizeHistoryMessages(messages)
    .map(compactHistoricalRestoreMessage)
    .filter((message) => {
      if (message.role !== "assistant") {
        return true;
      }

      if (hasRenderableAssistantTextContent(message)) {
        return true;
      }

      return (
        (message.images?.length || 0) > 0 ||
        (message.artifacts?.length || 0) > 0 ||
        Boolean(message.imageWorkbenchPreview) ||
        Boolean(message.taskPreview)
      );
    });

export const shouldCompactCompletedSessionHistory = (
  detail: AsterSessionDetail,
): boolean => {
  const historyLimit =
    typeof detail.history_limit === "number" &&
    Number.isFinite(detail.history_limit) &&
    detail.history_limit > 0
      ? Math.trunc(detail.history_limit)
      : null;

  if (historyLimit === null) {
    return false;
  }

  const hasActiveTurn = (detail.turns || []).some(
    (turn) => turn.status === "running",
  );
  const hasActiveItem = (detail.items || []).some(
    (item) => item.status === "in_progress",
  );
  const hasQueuedTurn = (detail.queued_turns || []).length > 0;

  return !hasActiveTurn && !hasActiveItem && !hasQueuedTurn;
};

interface HydrateSessionDetailMessagesOptions {
  compactCompletedHistory?: boolean;
  includeTimelineFallback?: boolean;
}

function buildMessageFromThreadItem(
  item: AgentThreadItem,
  topicId: string,
  finalAgentMessageItemIds: Set<string>,
): Message | null {
  if (item.type !== "user_message" && item.type !== "agent_message") {
    return null;
  }
  if (
    item.type === "agent_message" &&
    (!shouldUseAgentMessageAsFinalText(item.phase) ||
      !finalAgentMessageItemIds.has(item.id))
  ) {
    return null;
  }

  const content =
    item.type === "user_message"
      ? normalizeHistoryString(item.content).trim()
      : normalizeHistoryString(item.text).trim();
  const role = item.type === "user_message" ? "user" : "assistant";
  const sanitizedContent = sanitizeMessageTextForDisplay(content, {
    role,
    hasImages: false,
  });
  if (!sanitizedContent) {
    return null;
  }

  const timestamp = new Date(item.completed_at || item.updated_at);
  return {
    id: `${topicId}-timeline-${item.id}`,
    role,
    content: sanitizedContent,
    contentParts:
      role === "assistant"
        ? [
            {
              type: "text",
              text: sanitizedContent,
            },
          ]
        : undefined,
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date(0) : timestamp,
  };
}

function hydrateSessionDetailMessagesFromThreadItems(
  detail: AsterSessionDetail,
  topicId: string,
): Message[] {
  const turnOrder = new Map<string, number>();
  (detail.turns || [])
    .filter((turn) => !isAuxiliaryHistoryTurn(turn))
    .forEach((turn, index) => {
      turnOrder.set(turn.id, index);
    });

  const sortedItems = [...(detail.items || [])].sort((left, right) => {
    const leftTurnOrder =
      turnOrder.get(left.turn_id) ?? Number.MAX_SAFE_INTEGER;
    const rightTurnOrder =
      turnOrder.get(right.turn_id) ?? Number.MAX_SAFE_INTEGER;
    if (leftTurnOrder !== rightTurnOrder) {
      return leftTurnOrder - rightTurnOrder;
    }
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
    const leftTimestamp = parseHistoryTimestamp(
      left.started_at || left.updated_at,
    ).getTime();
    const rightTimestamp = parseHistoryTimestamp(
      right.started_at || right.updated_at,
    ).getTime();
    if (leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }
    return left.id.localeCompare(right.id);
  });
  const finalAgentMessageItemIds = resolveFinalAgentMessageItemIds(sortedItems);

  const messages: Message[] = [];
  let assistantDraft: Message | null = null;

  const flushAssistantDraft = () => {
    if (!assistantDraft) {
      return;
    }
    const sanitizedParts =
      sanitizeContentPartsForDisplay(assistantDraft.contentParts || [], {
        role: "assistant",
        hasImages: Boolean(assistantDraft.images?.length),
      }) || [];

    // 历史重建：把文件工具的 tool_use parts 聚合成 file_changes_batch，
    // 与流式路径（agentStreamEventProcessor.ts）保持一致。
    const finalParts = (() => {
      const hasFileMutationParts = sanitizedParts.some(
        (part) =>
          part.type === "tool_use" &&
          isFileMutationToolName(part.toolCall.name),
      );
      if (!hasFileMutationParts) {
        return sanitizedParts;
      }
      const nonFileParts = sanitizedParts.filter(
        (part) =>
          !(
            part.type === "tool_use" &&
            isFileMutationToolName(part.toolCall.name)
          ),
      );
      const fileCalls = (assistantDraft?.toolCalls || []).filter(
        (tc) => isFileMutationToolName(tc.name) && tc.status !== "running",
      );
      const aggregate = aggregateFileChanges(fileCalls);
      if (aggregate.fileCount === 0) {
        return sanitizedParts;
      }
      return [
        ...nonFileParts,
        { type: "file_changes_batch" as const, aggregate },
      ];
    })();

    messages.push({
      ...assistantDraft,
      contentParts: finalParts.length > 0 ? finalParts : undefined,
      thinkingContent: extractThinkingContentFromParts(sanitizedParts),
    });
    assistantDraft = null;
  };

  const ensureAssistantDraft = (item: AgentThreadItem): Message => {
    if (assistantDraft?.runtimeTurnId === item.turn_id) {
      return assistantDraft;
    }
    flushAssistantDraft();
    const timestamp = parseHistoryTimestamp(
      item.started_at || item.updated_at || item.completed_at,
    );
    assistantDraft = {
      id:
        item.type === "agent_message"
          ? `${topicId}-timeline-${item.id}`
          : `${topicId}-timeline-assistant-${item.turn_id}`,
      role: "assistant",
      content: "",
      contentParts: [],
      timestamp,
      isThinking: false,
      runtimeTurnId: item.turn_id,
    };
    return assistantDraft;
  };

  const appendAssistantText = (draft: Message, text: string) => {
    const sanitizedText = sanitizeMessageTextForDisplay(text, {
      role: "assistant",
      hasImages: false,
    });
    if (!sanitizedText) {
      return;
    }
    draft.content = [draft.content.trim(), sanitizedText]
      .filter(Boolean)
      .join("\n\n");
    draft.contentParts = appendTextToParts(
      draft.contentParts || [],
      sanitizedText,
    );
  };

  for (const item of sortedItems) {
    if (item.type === "user_message" || item.type === "agent_message") {
      const message = buildMessageFromThreadItem(
        item,
        topicId,
        finalAgentMessageItemIds,
      );
      if (!message) {
        continue;
      }
      if (item.type === "user_message") {
        flushAssistantDraft();
        messages.push(message);
        continue;
      }

      const draft = ensureAssistantDraft(item);
      appendAssistantText(draft, message.content);
      draft.timestamp = message.timestamp;
      continue;
    }

    if (item.type === "reasoning") {
      const draft = ensureAssistantDraft(item);
      draft.contentParts = appendThinkingToHistoryParts(
        draft.contentParts || [],
        item.text,
      );
      draft.timestamp = parseHistoryTimestamp(
        item.completed_at || item.updated_at || item.started_at,
      );
      continue;
    }

    if (item.type === "tool_call") {
      const draft = ensureAssistantDraft(item);
      const status =
        item.status === "failed"
          ? ("failed" as const)
          : item.status === "completed"
            ? ("completed" as const)
            : ("running" as const);
      const toolArguments = stringifyToolArguments(item.arguments);
      const normalizedResult =
        status === "running"
          ? undefined
          : {
              success: item.success !== false && status !== "failed",
              output: item.output || "",
              error: item.error || undefined,
              images: undefined,
              metadata: normalizeToolResultMetadata(
                item.metadata,
                item.output || "",
                item.error || "",
              ),
            };
      const toolCall = {
        id: item.id,
        name: item.tool_name,
        arguments: toolArguments,
        status,
        startTime: parseHistoryTimestamp(item.started_at),
        endTime:
          status === "running"
            ? undefined
            : parseHistoryTimestamp(item.completed_at || item.updated_at),
        result: normalizedResult,
      };
      draft.toolCalls = mergeByKey(
        draft.toolCalls,
        [toolCall],
        (tool) => tool.id,
      );
      draft.contentParts = [
        ...(draft.contentParts || []),
        { type: "tool_use", toolCall },
      ];
      const normalizedResultRecord =
        normalizedResult &&
        typeof normalizedResult === "object" &&
        !Array.isArray(normalizedResult)
          ? (normalizedResult as Record<string, unknown>)
          : undefined;
      const imageWorkbenchPreviewFromTool = buildImageTaskPreviewFromToolResult(
        {
          toolId: item.id,
          toolName: item.tool_name,
          toolArguments,
          toolResult: normalizedResultRecord,
          fallbackPrompt: draft.content,
        },
      );
      draft.imageWorkbenchPreview = mergeImageWorkbenchPreview(
        draft.imageWorkbenchPreview,
        imageWorkbenchPreviewFromTool || undefined,
      );
      draft.taskPreview = imageWorkbenchPreviewFromTool
        ? undefined
        : mergeTaskPreview(
            draft.taskPreview,
            buildTaskPreviewFromToolResult({
              toolId: item.id,
              toolName: item.tool_name,
              toolArguments,
              toolResult: normalizedResultRecord,
              fallbackPrompt: draft.content,
            }) || undefined,
          );
      draft.timestamp = parseHistoryTimestamp(
        item.completed_at || item.updated_at || item.started_at,
      );
      const metadata = normalizedResult?.metadata as
        | Record<string, unknown>
        | undefined;
      if (
        item.tool_name === "Skill" ||
        metadata?.tool_family === "skill" ||
        metadata?.skill_source === "SKILL.md"
      ) {
        draft.inlineProcessRetention = SKILL_INLINE_PROCESS_RETENTION;
      }
    }
  }
  flushAssistantDraft();

  return mergeAdjacentAssistantMessages(
    dedupeAdjacentHistoryMessages(messages),
  );
}

function shouldMergeTimelineProcessMessages(
  timelineMessages: Message[],
): boolean {
  if (!hasHistoryAssistantProcessGap(timelineMessages)) {
    return false;
  }
  return true;
}

const AUXILIARY_HISTORY_TURN_ID_PREFIX = "auxiliary-runtime-projection-";

function normalizeHistoryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isAuxiliaryHistoryTurn(turn: AgentThreadTurn) {
  const normalizedId = normalizeHistoryString(turn.id).trim().toLowerCase();
  if (normalizedId.startsWith(AUXILIARY_HISTORY_TURN_ID_PREFIX)) {
    return true;
  }

  const normalizedPrompt = normalizeHistoryString(turn.prompt_text).trim();
  return (
    normalizedPrompt.startsWith("辅助标题生成") ||
    normalizedPrompt.startsWith("辅助人设生成")
  );
}

function parseHistoryTimestamp(value?: string | null): Date {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date(0);
}

function parseHistoryTimestampValue(value: unknown): Date {
  if (typeof value === "string") {
    return parseHistoryTimestamp(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestampMs = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(timestampMs);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date(0);
}

function normalizeHistoryStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isFailedHistoryStatus(value: unknown): boolean {
  const status = normalizeHistoryStatus(value);
  return status === "failed" || status === "error";
}

function findLatestFailedRuntimeTurnId(
  detail: AsterSessionDetail,
): string | null {
  const threadReadTurns = [...(detail.thread_read?.turns || [])].reverse();
  const failedThreadReadTurn = threadReadTurns.find(
    (turn) =>
      isFailedHistoryStatus(turn.status) ||
      isFailedHistoryStatus(turn.native_status),
  );
  if (failedThreadReadTurn?.turn_id) {
    return failedThreadReadTurn.turn_id;
  }

  const failedTurn = [...(detail.turns || [])]
    .filter((turn) => !isAuxiliaryHistoryTurn(turn))
    .reverse()
    .find((turn) => isFailedHistoryStatus(turn.status));
  return failedTurn?.id || null;
}

function findLatestFailedRuntimeErrorItem(
  detail: AsterSessionDetail,
  turnId: string | null,
): Extract<AgentThreadItem, { type: "error" }> | null {
  const errorItems = (detail.items || []).filter(
    (item): item is Extract<AgentThreadItem, { type: "error" }> =>
      item.type === "error" &&
      (!turnId || item.turn_id === turnId) &&
      isFailedHistoryStatus(item.status),
  );
  if (errorItems.length === 0) {
    return null;
  }

  return [...errorItems].sort((left, right) => {
    if (left.sequence !== right.sequence) {
      return right.sequence - left.sequence;
    }
    const leftTimestamp = parseHistoryTimestamp(
      left.completed_at || left.updated_at || left.started_at,
    ).getTime();
    const rightTimestamp = parseHistoryTimestamp(
      right.completed_at || right.updated_at || right.started_at,
    ).getTime();
    return rightTimestamp - leftTimestamp;
  })[0]!;
}

function findLatestFailedRuntimeTurn(
  detail: AsterSessionDetail,
  turnId: string | null,
): AgentThreadTurn | null {
  if (turnId) {
    const matchedTurn = (detail.turns || []).find((turn) => turn.id === turnId);
    if (matchedTurn) {
      return matchedTurn;
    }
  }

  return (
    [...(detail.turns || [])]
      .filter((turn) => !isAuxiliaryHistoryTurn(turn))
      .reverse()
      .find((turn) => isFailedHistoryStatus(turn.status)) ?? null
  );
}

function hydrateFailedRuntimeReadModelMessage(
  detail: AsterSessionDetail,
  topicId: string,
): Message | null {
  const diagnostics = detail.thread_read?.diagnostics;
  if (!isFailedHistoryStatus(diagnostics?.latest_turn_status)) {
    return null;
  }

  const turnId = findLatestFailedRuntimeTurnId(detail);
  const errorItem = findLatestFailedRuntimeErrorItem(detail, turnId);
  const failedTurn = findLatestFailedRuntimeTurn(detail, turnId);
  const errorMessage =
    normalizeHistoryString(diagnostics?.latest_turn_error_message).trim() ||
    normalizeHistoryString(errorItem?.message).trim() ||
    normalizeHistoryString(failedTurn?.error_message).trim();
  const content = buildFailedAgentMessageContent(errorMessage);
  const diagnosticsTimestamp = parseHistoryTimestampValue(
    diagnostics?.latest_turn_completed_at ??
      diagnostics?.latest_turn_updated_at ??
      diagnostics?.latest_turn_started_at,
  );
  const timestamp =
    diagnosticsTimestamp.getTime() > 0
      ? diagnosticsTimestamp
      : parseHistoryTimestamp(
          errorItem?.completed_at ||
            errorItem?.updated_at ||
            errorItem?.started_at ||
            failedTurn?.completed_at ||
            failedTurn?.updated_at ||
            failedTurn?.started_at,
        );

  return {
    id: `${topicId}-app-server-failed-${turnId || "latest"}`,
    role: "assistant",
    content,
    contentParts: [{ type: "text", text: content }],
    timestamp,
    isThinking: false,
    runtimeStatus: buildFailedAgentRuntimeStatus(errorMessage),
    runtimeTurnId: turnId || failedTurn?.id,
  };
}

function historyToolCallIdFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): string {
  const record = asHistoryRecord(toolCall);
  return (
    readHistoryString(record?.id) ||
    readHistoryString(record?.tool_call_id) ||
    readHistoryString(record?.toolCallId) ||
    readHistoryString(record?.toolId) ||
    readHistoryString(record?.tool_id)
  );
}

function historyToolCallNameFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): string {
  const record = asHistoryRecord(toolCall);
  return (
    readHistoryString(record?.tool_name) ||
    readHistoryString(record?.toolName) ||
    readHistoryString(record?.name)
  );
}

function historyToolCallStatusFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): HistoryToolCall["status"] {
  const status = normalizeHistoryStatus(toolCall.status);
  if (status === "failed" || status === "error") {
    return "failed";
  }
  if (status === "completed" || status === "complete" || status === "done") {
    return "completed";
  }
  return "running";
}

function historyToolCallOutputFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): string {
  const record = asHistoryRecord(toolCall);
  return (
    readHistoryString(record?.output_preview) ||
    readHistoryString(record?.outputPreview) ||
    readHistoryString(record?.output)
  );
}

function historyToolCallErrorFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): string {
  const record = asHistoryRecord(toolCall);
  return readHistoryString(record?.error);
}

function historyToolCallTurnIdFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): string {
  const record = asHistoryRecord(toolCall);
  return (
    readHistoryString(record?.turn_id) || readHistoryString(record?.turnId)
  );
}

function historyToolCallTimeFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
  keys: string[],
): Date {
  const record = asHistoryRecord(toolCall);
  for (const key of keys) {
    const timestamp = parseHistoryTimestampValue(record?.[key]);
    if (timestamp.getTime() > 0) {
      return timestamp;
    }
  }
  return new Date(0);
}

function historyToolCallFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): HistoryToolCall | null {
  const id = historyToolCallIdFromThreadToolCall(toolCall);
  const name = historyToolCallNameFromThreadToolCall(toolCall);
  if (!id || !name) {
    return null;
  }

  const status = historyToolCallStatusFromThreadToolCall(toolCall);
  const record = asHistoryRecord(toolCall);
  const output = historyToolCallOutputFromThreadToolCall(toolCall);
  const error = historyToolCallErrorFromThreadToolCall(toolCall);
  const startTime = historyToolCallTimeFromThreadToolCall(toolCall, [
    "started_at",
    "startedAt",
    "timestamp",
    "updated_at",
    "updatedAt",
  ]);
  const endTime =
    status === "running"
      ? undefined
      : historyToolCallTimeFromThreadToolCall(toolCall, [
          "finished_at",
          "finishedAt",
          "completed_at",
          "completedAt",
          "updated_at",
          "updatedAt",
          "timestamp",
        ]);

  return {
    id,
    name,
    arguments: stringifyToolArguments(record?.arguments),
    status,
    startTime,
    endTime,
    result:
      status === "running"
        ? undefined
        : {
            success: toolCall.success !== false && status !== "failed",
            output,
            error: error || undefined,
            images: undefined,
          },
  };
}

function hydrateSessionDetailMessagesFromThreadReadToolCalls(
  detail: AsterSessionDetail,
  topicId: string,
): Message[] {
  const rawToolCalls = detail.thread_read?.tool_calls || [];
  const toolCalls = rawToolCalls
    .map(historyToolCallFromThreadToolCall)
    .filter((toolCall): toolCall is HistoryToolCall => toolCall !== null);
  if (toolCalls.length === 0) {
    return [];
  }

  const runtimeTurnId =
    rawToolCalls.map(historyToolCallTurnIdFromThreadToolCall).find(Boolean) ||
    readHistoryString(detail.thread_read?.active_turn_id) ||
    readHistoryString(detail.thread_read?.turns?.find(Boolean)?.turn_id) ||
    readHistoryString(
      [...(detail.turns || [])]
        .filter((turn) => !isAuxiliaryHistoryTurn(turn))
        .at(-1)?.id,
    );
  const timestamp =
    [...toolCalls]
      .reverse()
      .map((toolCall) => toolCall.endTime || toolCall.startTime)
      .find((date) => date.getTime() > 0) || new Date(0);

  return [
    {
      id: `${topicId}-app-server-thread-read-tools-${runtimeTurnId || "latest"}`,
      role: "assistant",
      content: "",
      contentParts: toolCalls.map((toolCall) => ({
        type: "tool_use" as const,
        toolCall,
      })),
      toolCalls,
      timestamp,
      isThinking: false,
      runtimeTurnId: runtimeTurnId || undefined,
    },
  ];
}

type HistoryArtifactSummary = {
  artifactRef?: unknown;
  eventId?: unknown;
  sequence?: unknown;
  turnId?: unknown;
  artifactId?: unknown;
  path?: unknown;
  title?: unknown;
  kind?: unknown;
  status?: unknown;
  contentStatus?: unknown;
  metadata?: unknown;
};

const HISTORY_ARTIFACT_TYPES = new Set<ArtifactType>([
  "document",
  "code",
  "html",
  "svg",
  "mermaid",
  "react",
  "browser_assist",
  "canvas:document",
  "canvas:video",
  "canvas:design",
]);

function asHistoryRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readHistoryString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readHistoryNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readHistoryMetadataString(
  metadata: Record<string, unknown> | null,
  keys: string[],
): string {
  for (const key of keys) {
    const value = readHistoryString(metadata?.[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function fileNameFromHistoryPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").trim();
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || normalized;
}

function historyArtifactTypeFromSummary(
  summary: HistoryArtifactSummary,
  path: string,
  metadata: Record<string, unknown> | null,
): ArtifactType {
  const explicit =
    readHistoryString(summary.kind) ||
    readHistoryMetadataString(metadata, ["artifact_type", "type", "kind"]);
  const normalizedExplicit = explicit.toLowerCase();
  if (HISTORY_ARTIFACT_TYPES.has(normalizedExplicit as ArtifactType)) {
    return normalizedExplicit as ArtifactType;
  }
  if (normalizedExplicit === "markdown" || normalizedExplicit === "text") {
    return "document";
  }
  const extension = fileNameFromHistoryPath(path)
    .split(".")
    .pop()
    ?.toLowerCase();
  if (extension === "html" || extension === "htm") {
    return "html";
  }
  if (extension === "svg") {
    return "svg";
  }
  if (extension === "mmd" || extension === "mermaid") {
    return "mermaid";
  }
  if (extension === "jsx" || extension === "tsx") {
    return "react";
  }
  if (extension === "md" || extension === "markdown" || extension === "txt") {
    return "document";
  }
  return "code";
}

function historyArtifactStatusFromSummary(
  summary: HistoryArtifactSummary,
): ArtifactStatus {
  const status = readHistoryString(summary.status).toLowerCase();
  if (status === "pending") {
    return "pending";
  }
  if (status === "streaming" || status === "running") {
    return "streaming";
  }
  if (status === "error" || status === "failed") {
    return "error";
  }
  return "complete";
}

function readHistoryArtifactSummaries(
  value: unknown,
): HistoryArtifactSummary[] {
  const record = asHistoryRecord(value);
  const artifacts = record?.artifacts;
  return Array.isArray(artifacts)
    ? artifacts.filter((artifact): artifact is HistoryArtifactSummary =>
        Boolean(asHistoryRecord(artifact)),
      )
    : [];
}

function collectHistoryArtifactSummaries(
  detail: AsterSessionDetail,
): HistoryArtifactSummary[] {
  const detailRecord = detail as AsterSessionDetail & {
    artifacts?: unknown;
    threadRead?: unknown;
  };
  return [
    ...readHistoryArtifactSummaries(detailRecord),
    ...readHistoryArtifactSummaries(detail.thread_read),
    ...readHistoryArtifactSummaries(detailRecord.threadRead),
  ];
}

function historyArtifactFromSummary(
  summary: HistoryArtifactSummary,
): Artifact | null {
  const metadata = asHistoryRecord(summary.metadata);
  const path =
    readHistoryString(summary.path) ||
    readHistoryMetadataString(metadata, [
      "filePath",
      "file_path",
      "path",
      "artifactPath",
      "artifact_path",
      "absolutePath",
      "absolute_path",
    ]);
  const id =
    readHistoryString(summary.artifactId) ||
    readHistoryString(summary.artifactRef) ||
    path ||
    readHistoryString(summary.eventId);
  if (!id || !path) {
    return null;
  }

  const title =
    readHistoryString(summary.title) ||
    readHistoryMetadataString(metadata, ["title", "filename", "fileName"]) ||
    fileNameFromHistoryPath(path);
  const previewText = readHistoryMetadataString(metadata, [
    "previewText",
    "preview_text",
    "contentPreview",
    "content_preview",
  ]);
  const now = Date.now();
  const timestamp =
    readHistoryNumber(metadata?.createdAt) ??
    readHistoryNumber(metadata?.updatedAt) ??
    now;

  return {
    id,
    type: historyArtifactTypeFromSummary(summary, path, metadata),
    title,
    content: previewText,
    status: historyArtifactStatusFromSummary(summary),
    meta: {
      ...(metadata ?? {}),
      artifactRef: readHistoryString(summary.artifactRef) || undefined,
      eventId: readHistoryString(summary.eventId) || undefined,
      sequence: readHistoryNumber(summary.sequence),
      turnId: readHistoryString(summary.turnId) || undefined,
      contentStatus: readHistoryString(summary.contentStatus) || undefined,
      filePath: path,
      artifactPath: path,
      path,
      previewText: previewText || undefined,
    },
    position: { start: 0, end: previewText.length },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function isCodeHistoryArtifact(artifact: Artifact): boolean {
  const metadata = asHistoryRecord(artifact.meta);
  const language = readHistoryMetadataString(metadata, [
    "language",
    "fileLanguage",
    "file_language",
  ]);
  if (language) {
    return true;
  }
  if (artifact.type === "code" || artifact.type === "react") {
    return true;
  }
  const path = readHistoryMetadataString(metadata, [
    "filePath",
    "file_path",
    "artifactPath",
    "artifact_path",
    "path",
  ]);
  const extension = fileNameFromHistoryPath(path)
    .split(".")
    .pop()
    ?.toLowerCase();
  return Boolean(
    extension &&
    [
      "c",
      "cc",
      "cpp",
      "cs",
      "css",
      "go",
      "h",
      "hpp",
      "java",
      "js",
      "jsx",
      "kt",
      "mjs",
      "py",
      "rs",
      "sql",
      "swift",
      "ts",
      "tsx",
    ].includes(extension),
  );
}

function historyMessageTextFromArtifacts(artifacts: Artifact[]): string {
  const firstCompleteArtifact =
    artifacts.find((artifact) => artifact.status === "complete") ??
    artifacts[0];
  if (!firstCompleteArtifact) {
    return "";
  }

  const metadata = asHistoryRecord(firstCompleteArtifact.meta);
  const explicitText = readHistoryMetadataString(metadata, [
    "completionText",
    "completion_text",
    "messageText",
    "message_text",
    "summaryText",
    "summary_text",
    "statusMessage",
    "status_message",
  ]);
  if (explicitText) {
    return explicitText;
  }

  return isCodeHistoryArtifact(firstCompleteArtifact)
    ? "已生成代码产物，可在工作台查看。"
    : "已生成产物，可在工作台查看。";
}

function hydrateSessionDetailMessagesFromArtifacts(
  detail: AsterSessionDetail,
  topicId: string,
): Message[] {
  const artifacts = mergeArtifacts(
    collectHistoryArtifactSummaries(detail)
      .map(historyArtifactFromSummary)
      .filter((artifact): artifact is Artifact => artifact !== null),
  );
  if (artifacts.length === 0) {
    return [];
  }

  const content = historyMessageTextFromArtifacts(artifacts);
  const timestamp = parseHistoryTimestamp(
    detail.turns?.[0]?.completed_at ||
      detail.turns?.[0]?.updated_at ||
      detail.turns?.[0]?.started_at ||
      null,
  );
  return [
    {
      id: `${topicId}-app-server-artifacts`,
      role: "assistant",
      content,
      contentParts: content ? [{ type: "text", text: content }] : undefined,
      artifacts,
      timestamp,
      isThinking: false,
      runtimeTurnId: detail.turns?.[0]?.id,
    },
  ];
}

function hydrateSessionDetailMessagesFromTurns(
  detail: AsterSessionDetail,
  topicId: string,
): Message[] {
  const messages = (detail.turns || [])
    .filter((turn) => !isAuxiliaryHistoryTurn(turn))
    .map((turn): Message | null => {
      const content = sanitizeMessageTextForDisplay(
        normalizeHistoryString(turn.prompt_text),
        {
          role: "user",
          hasImages: false,
        },
      );
      if (!content) {
        return null;
      }

      return {
        id: `${topicId}-turn-${normalizeHistoryString(turn.id) || "unknown"}-prompt`,
        role: "user",
        content,
        timestamp: parseHistoryTimestamp(
          turn.started_at || turn.created_at || turn.updated_at,
        ),
      };
    })
    .filter((message): message is Message => message !== null);

  return dedupeAdjacentHistoryMessages(messages);
}

function hasHistoryAssistantProcessGap(messages: Message[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      ((message.contentParts || []).some(contentPartContainsProcess) ||
        (message.toolCalls?.length || 0) > 0 ||
        Boolean(message.imageWorkbenchPreview) ||
        Boolean(message.taskPreview) ||
        Boolean(message.runtimeStatus)),
  );
}

function mergeMissingUserMessagesFromTimeline(
  messages: Message[],
  detail: AsterSessionDetail,
  topicId: string,
): Message[] {
  const buildFallbackUserSignature = (message: Message): string =>
    [
      normalizeSignatureText(message.content || ""),
      messageImageSignature(message.images),
    ].join("::");
  const fallbackUserMessages: Message[] = [];
  const seenFallbackUserSignatures = new Set<string>();
  for (const candidate of [
    ...hydrateSessionDetailMessagesFromThreadItems(detail, topicId),
    ...hydrateSessionDetailMessagesFromTurns(detail, topicId),
  ]) {
    if (candidate.role !== "user") {
      continue;
    }
    const signature = buildFallbackUserSignature(candidate);
    if (seenFallbackUserSignatures.has(signature)) {
      continue;
    }
    seenFallbackUserSignatures.add(signature);
    fallbackUserMessages.push(candidate);
  }
  if (fallbackUserMessages.length === 0) {
    return messages;
  }

  const knownUserSignatures = new Set(
    messages
      .filter((message) => message.role === "user")
      .map(buildFallbackUserSignature),
  );
  const uniqueFallbackUserMessages = fallbackUserMessages.filter(
    (fallbackMessage) => {
      const signature = buildFallbackUserSignature(fallbackMessage);
      if (knownUserSignatures.has(signature)) {
        return false;
      }
      knownUserSignatures.add(signature);
      return true;
    },
  );
  if (uniqueFallbackUserMessages.length === 0) {
    return messages;
  }

  const interleavedMessages: Message[] = [];
  const hasExistingUserMessage = messages.some(
    (message) => message.role === "user",
  );

  if (hasExistingUserMessage && !hasHistoryAssistantProcessGap(messages)) {
    return messages;
  }

  if (!hasExistingUserMessage) {
    let fallbackUserIndex = 0;
    for (const message of messages) {
      if (fallbackUserIndex < uniqueFallbackUserMessages.length) {
        interleavedMessages.push(
          uniqueFallbackUserMessages[fallbackUserIndex]!,
        );
        fallbackUserIndex += 1;
      }
      interleavedMessages.push(message);
    }
    interleavedMessages.push(
      ...uniqueFallbackUserMessages.slice(fallbackUserIndex),
    );
  } else {
    interleavedMessages.push(...messages);
    const orderedFallbackUserMessages = uniqueFallbackUserMessages
      .map((message, index) => ({ message, index }))
      .sort((left, right) => {
        const leftTimestampMs = resolveMessageTimestampMs(left.message);
        const rightTimestampMs = resolveMessageTimestampMs(right.message);
        if (leftTimestampMs === rightTimestampMs) {
          return left.index - right.index;
        }
        if (leftTimestampMs === null) {
          return 1;
        }
        if (rightTimestampMs === null) {
          return -1;
        }
        return leftTimestampMs - rightTimestampMs;
      });

    for (const { message } of orderedFallbackUserMessages) {
      const fallbackTimestampMs = resolveMessageTimestampMs(message);
      const insertIndex =
        fallbackTimestampMs === null
          ? -1
          : interleavedMessages.findIndex((candidate) => {
              const candidateTimestampMs = resolveMessageTimestampMs(candidate);
              return (
                candidate.role !== "user" &&
                candidateTimestampMs !== null &&
                candidateTimestampMs >= fallbackTimestampMs
              );
            });
      if (insertIndex >= 0) {
        interleavedMessages.splice(insertIndex, 0, message);
      } else {
        interleavedMessages.push(message);
      }
    }
  }

  return mergeAdjacentAssistantMessages(
    dedupeAdjacentHistoryMessages(interleavedMessages),
  );
}

function normalizePreviewSignatureValue(value: unknown): string {
  if (typeof value === "string") {
    return normalizeSignatureText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function imageWorkbenchPreviewSignature(
  preview?: MessageImageWorkbenchPreview,
): string {
  if (!preview) {
    return "";
  }

  return [
    preview.taskId,
    preview.prompt,
    preview.mode,
    preview.status,
    preview.projectId,
    preview.contentId,
    preview.taskFilePath,
    preview.artifactPath,
    preview.imageUrl,
    preview.previewImages?.join("|"),
    preview.imageCount,
    preview.expectedImageCount,
    preview.layoutHint,
    preview.storyboardSlots
      ?.map((slot) =>
        [
          slot.slotId,
          slot.slotIndex,
          slot.label,
          slot.prompt,
          slot.shotType,
          slot.status,
        ]
          .map(normalizePreviewSignatureValue)
          .join("|"),
      )
      .join("||"),
    preview.sourceImageUrl,
    preview.sourceImagePrompt,
    preview.sourceImageRef,
    preview.sourceImageCount,
    preview.size,
    preview.phase,
    preview.statusMessage,
    preview.retryable,
    preview.attemptCount,
    preview.placeholderText,
    preview.runtimeContract?.contractKey,
    preview.runtimeContract?.routingSlot,
    preview.runtimeContract?.providerId,
    preview.runtimeContract?.model,
    preview.runtimeContract?.routingEvent,
    preview.runtimeContract?.routingOutcome,
    preview.runtimeContract?.failureCode,
    preview.runtimeContract?.modelCapabilityAssessmentSource,
    preview.runtimeContract?.modelSupportsImageGeneration,
  ]
    .map(normalizePreviewSignatureValue)
    .join(":");
}

function taskPreviewSignature(preview?: MessageTaskPreview): string {
  if (!preview) {
    return "";
  }

  const videoFields =
    preview.kind === "video_generate"
      ? [
          preview.videoUrl,
          preview.thumbnailUrl,
          preview.durationSeconds,
          preview.aspectRatio,
          preview.resolution,
          preview.progress,
          preview.retryable,
        ]
      : [];
  const metaItems =
    "metaItems" in preview && Array.isArray(preview.metaItems)
      ? preview.metaItems.map((item) => normalizeSignatureText(item)).join("|")
      : "";
  const imageCandidates =
    "imageCandidates" in preview && Array.isArray(preview.imageCandidates)
      ? preview.imageCandidates
          .map((candidate) =>
            [
              candidate.id,
              candidate.thumbnailUrl,
              candidate.contentUrl,
              candidate.hostPageUrl,
              candidate.width,
              candidate.height,
              candidate.name,
            ]
              .map(normalizePreviewSignatureValue)
              .join(":"),
          )
          .join("|")
      : "";
  const audioFields =
    preview.kind === "audio_generate"
      ? [
          preview.taskFilePath,
          preview.audioUrl,
          preview.mimeType,
          preview.durationMs,
          preview.sourceText,
          preview.voice,
        ]
      : [];

  return [
    preview.kind,
    preview.taskId,
    preview.taskType,
    preview.prompt,
    "title" in preview ? preview.title : "",
    preview.status,
    preview.projectId,
    preview.contentId,
    "artifactPath" in preview ? preview.artifactPath : "",
    "providerId" in preview ? preview.providerId : "",
    "model" in preview ? preview.model : "",
    preview.phase,
    preview.statusMessage,
    ...videoFields,
    ...audioFields,
    metaItems,
    imageCandidates,
  ]
    .map(normalizePreviewSignatureValue)
    .join(":");
}

export const mergeAdjacentAssistantMessages = (
  messages: Message[],
): Message[] => {
  const merged: Message[] = [];

  for (const current of messages) {
    if (merged.length === 0) {
      merged.push(current);
      continue;
    }

    const previous = merged[merged.length - 1];
    if (!previous || !shouldMergeAdjacentAssistantMessages(previous, current)) {
      merged.push(current);
      continue;
    }

    const content = [previous.content.trim(), current.content.trim()]
      .filter(Boolean)
      .join("\n\n");
    const contentParts = (() => {
      const nextParts: ContentPart[] = [...(previous.contentParts || [])];
      for (const part of current.contentParts || []) {
        if (part.type === "tool_use") {
          const existingIndex = nextParts.findIndex(
            (item) =>
              item.type === "tool_use" && item.toolCall.id === part.toolCall.id,
          );
          if (existingIndex >= 0) {
            const existingPart = nextParts[existingIndex];
            if (existingPart?.type === "tool_use") {
              nextParts[existingIndex] = mergeToolUseContentPart(
                existingPart,
                part,
              );
            } else {
              nextParts[existingIndex] = part;
            }
            continue;
          }
          nextParts.push(part);
          continue;
        }

        if (part.type === "action_required") {
          const existingIndex = nextParts.findIndex(
            (item) =>
              item.type === "action_required" &&
              item.actionRequired.requestId === part.actionRequired.requestId,
          );
          if (existingIndex >= 0) {
            nextParts[existingIndex] = part;
            continue;
          }
          nextParts.push(part);
          continue;
        }

        nextParts.push(part);
      }
      return nextParts;
    })();
    const toolCalls = (() => {
      const previousToolCalls = previous.toolCalls || [];
      const currentToolCalls = current.toolCalls || [];
      if (previousToolCalls.length === 0) {
        return currentToolCalls.length > 0 ? currentToolCalls : undefined;
      }
      if (currentToolCalls.length === 0) {
        return previousToolCalls;
      }

      const toolCallById = new Map<string, HistoryToolCall>();
      for (const toolCall of previousToolCalls) {
        toolCallById.set(toolCall.id, toolCall);
      }
      for (const toolCall of currentToolCalls) {
        const existing = toolCallById.get(toolCall.id);
        if (existing) {
          toolCallById.set(
            toolCall.id,
            mergeToolCallStates(existing, toolCall),
          );
          continue;
        }
        toolCallById.set(toolCall.id, toolCall);
      }

      if (toolCallById.size === 0) {
        return undefined;
      }

      return Array.from(toolCallById.values());
    })();
    const contextTrace = (() => {
      const seen = new Set<string>();
      const mergedSteps: ContextTraceStep[] = [];
      for (const step of [
        ...(previous.contextTrace || []),
        ...(current.contextTrace || []),
      ]) {
        const key = `${step.stage}::${step.detail}`;
        if (!seen.has(key)) {
          seen.add(key);
          mergedSteps.push(step);
        }
      }
      return mergedSteps;
    })();
    const artifacts = mergeArtifacts([
      ...(previous.artifacts || []),
      ...(current.artifacts || []),
    ]);
    const imageWorkbenchPreview = mergeImageWorkbenchPreview(
      previous.imageWorkbenchPreview,
      current.imageWorkbenchPreview,
    );
    const taskPreview = mergeTaskPreview(
      previous.taskPreview,
      current.taskPreview,
    );

    merged[merged.length - 1] = {
      ...previous,
      content,
      contentParts: contentParts.length > 0 ? contentParts : undefined,
      toolCalls: (toolCalls?.length || 0) > 0 ? toolCalls : undefined,
      contextTrace: contextTrace.length > 0 ? contextTrace : undefined,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      usage: current.usage ?? previous.usage,
      runtimeStatus: current.runtimeStatus ?? previous.runtimeStatus,
      imageWorkbenchPreview,
      taskPreview,
      timestamp: current.timestamp,
      isThinking: false,
      thinkingContent: extractThinkingContentFromParts(contentParts),
    };
  }

  return merged;
};

const normalizeSignatureText = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

const OMITTED_HISTORY_CONTENT_TEXT =
  "历史消息内容过大，首屏已省略完整内容；需要时可加载完整历史查看。";

function isOmittedHistoryContentProjection(message: Message): boolean {
  return normalizeSignatureText(message.content).includes(
    OMITTED_HISTORY_CONTENT_TEXT,
  );
}

const hasMessageImages = (message: Message): boolean =>
  Array.isArray(message.images) && message.images.length > 0;

function hasAssistantThinkingContent(message: Message): boolean {
  return (
    Boolean(message.thinkingContent?.trim()) ||
    (message.contentParts || []).some(
      (part) => part.type === "thinking" && part.text.trim().length > 0,
    )
  );
}

function collectMessageToolIds(message: Message): Set<string> {
  const ids = new Set<string>();
  for (const toolCall of message.toolCalls || []) {
    if (toolCall.id) {
      ids.add(toolCall.id);
    }
  }
  for (const part of message.contentParts || []) {
    if (part.type === "tool_use" && part.toolCall.id) {
      ids.add(part.toolCall.id);
    }
  }
  return ids;
}

function hasSharedValue(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function hasSharedProcessIdentity(
  previous: Message,
  current: Message,
): boolean {
  if (
    previous.imageWorkbenchPreview?.taskId &&
    previous.imageWorkbenchPreview.taskId ===
      current.imageWorkbenchPreview?.taskId
  ) {
    return true;
  }
  if (
    previous.taskPreview?.taskId &&
    previous.taskPreview.taskId === current.taskPreview?.taskId
  ) {
    return true;
  }

  const previousToolIds = collectMessageToolIds(previous);
  const currentToolIds = collectMessageToolIds(current);
  if (hasSharedValue(previousToolIds, currentToolIds)) {
    return true;
  }

  const previousActionIds = new Set(
    (previous.actionRequests || []).map((request) => request.requestId),
  );
  const currentActionIds = new Set(
    (current.actionRequests || []).map((request) => request.requestId),
  );
  return hasSharedValue(previousActionIds, currentActionIds);
}

function shouldMergeAdjacentAssistantMessages(
  previous: Message,
  current: Message,
): boolean {
  if (previous.role !== "assistant" || current.role !== "assistant") {
    return false;
  }

  if (hasSharedProcessIdentity(previous, current)) {
    return true;
  }

  if (
    previous.imageWorkbenchPreview?.taskId &&
    current.imageWorkbenchPreview?.taskId &&
    previous.imageWorkbenchPreview.taskId !==
      current.imageWorkbenchPreview.taskId
  ) {
    return false;
  }

  if (
    previous.taskPreview?.taskId &&
    current.taskPreview?.taskId &&
    previous.taskPreview.taskId !== current.taskPreview.taskId
  ) {
    return false;
  }

  const previousHasThinking = hasAssistantThinkingContent(previous);
  const currentHasThinking = hasAssistantThinkingContent(current);
  if (!previousHasThinking && !currentHasThinking) {
    return true;
  }

  const previousHasText = hasRenderableAssistantTextContent(previous);
  const currentHasText = hasRenderableAssistantTextContent(current);
  return previousHasThinking && !previousHasText && currentHasText;
}

const findMatchingLocalUserMessageIndex = (
  localUserMessages: Message[],
  targetMessage: Message,
  startIndex: number,
): number => {
  const targetContent = normalizeSignatureText(targetMessage.content || "");
  const hasLooseContentMatch = (candidateContent: string): boolean => {
    const minLength = Math.min(candidateContent.length, targetContent.length);
    return (
      minLength >= 24 &&
      (candidateContent.includes(targetContent) ||
        targetContent.includes(candidateContent))
    );
  };

  for (let index = startIndex; index < localUserMessages.length; index += 1) {
    const candidate = localUserMessages[index];
    if (!candidate) {
      continue;
    }

    const candidateContent = normalizeSignatureText(candidate.content || "");
    if (
      candidateContent === targetContent ||
      hasLooseContentMatch(candidateContent)
    ) {
      return index;
    }
  }

  return -1;
};

const findMatchingLocalAssistantMessageIndex = (
  localAssistantMessages: Message[],
  targetMessage: Message,
  startIndex: number,
): number => {
  const targetSignature = buildHistoryMessageSignature({
    ...targetMessage,
    usage: undefined,
  });

  for (
    let index = startIndex;
    index < localAssistantMessages.length;
    index += 1
  ) {
    const candidate = localAssistantMessages[index];
    if (!candidate) {
      continue;
    }

    const candidateSignature = buildHistoryMessageSignature({
      ...candidate,
      usage: undefined,
    });
    if (candidateSignature === targetSignature) {
      return index;
    }
  }

  const fallbackSignature = buildAssistantHydrationSignature(targetMessage);
  if (!fallbackSignature) {
    return -1;
  }

  for (
    let index = startIndex;
    index < localAssistantMessages.length;
    index += 1
  ) {
    const candidate = localAssistantMessages[index];
    if (!candidate) {
      continue;
    }

    const candidateSignature = buildAssistantHydrationSignature(candidate);
    if (candidateSignature === fallbackSignature) {
      return index;
    }
  }

  return -1;
};

function findNextLocalAssistantAfterUser(
  localMessages: Message[],
  localAssistantIndexById: Map<string, number>,
  matchedLocalMessageIds: Set<string>,
  userMessageIndex: number | null,
): number {
  if (userMessageIndex === null || userMessageIndex < 0) {
    return -1;
  }

  for (
    let index = userMessageIndex + 1;
    index < localMessages.length;
    index += 1
  ) {
    const candidate = localMessages[index];
    if (!candidate) {
      continue;
    }
    if (candidate.role === "user") {
      return -1;
    }
    if (candidate.role !== "assistant") {
      continue;
    }
    if (candidate.id && matchedLocalMessageIds.has(candidate.id)) {
      continue;
    }

    return candidate.id
      ? (localAssistantIndexById.get(candidate.id) ?? -1)
      : -1;
  }

  return -1;
}

function findNextLocalProcessAssistantIndex(
  localAssistantMessages: Message[],
  startIndex: number,
  matchedLocalMessageIds: Set<string>,
): number {
  for (
    let index = Math.max(0, startIndex);
    index < localAssistantMessages.length;
    index += 1
  ) {
    const candidate = localAssistantMessages[index];
    if (!candidate) {
      continue;
    }
    if (candidate.id && matchedLocalMessageIds.has(candidate.id)) {
      continue;
    }
    if (hasRetainableLocalAssistantProcessState(candidate)) {
      return index;
    }
  }

  return -1;
}

function shouldPreserveLocalAssistantVisibleOutput(
  localMessage: Message | undefined,
  remoteMessage: Message,
): boolean {
  if (!localMessage) {
    return false;
  }

  const localContent = normalizeSignatureText(localMessage.content);
  if (!localContent) {
    return false;
  }

  const remoteContent = normalizeSignatureText(remoteMessage.content);
  if (remoteContent === localContent) {
    return false;
  }
  if (!remoteContent || isOmittedHistoryContentProjection(remoteMessage)) {
    return true;
  }

  const localTimestampMs = resolveMessageTimestampMs(localMessage);
  const remoteTimestampMs = resolveMessageTimestampMs(remoteMessage);
  if (
    localTimestampMs !== null &&
    remoteTimestampMs !== null &&
    remoteTimestampMs > localTimestampMs
  ) {
    return false;
  }

  return true;
}

function resolveMessageTimestampMs(message: Message): number | null {
  const timestampMs = message.timestamp.getTime();
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function hasRetainableLocalMessageState(message: Message): boolean {
  if (message.role === "user") {
    return message.content.trim().length > 0 || hasMessageImages(message);
  }

  return (
    Boolean(message.thinkingContent?.trim()) ||
    (message.contentParts || []).some(contentPartContainsProcess) ||
    (message.toolCalls?.length || 0) > 0 ||
    (message.actionRequests?.length || 0) > 0 ||
    (message.contextTrace?.length || 0) > 0 ||
    (message.artifacts?.length || 0) > 0 ||
    Boolean(message.imageWorkbenchPreview) ||
    Boolean(message.taskPreview) ||
    Boolean(message.runtimeStatus) ||
    message.content.trim().length > 0
  );
}

function hasRetainableLocalAssistantProcessState(
  message: Message | undefined,
): boolean {
  if (!message || message.role !== "assistant") {
    return false;
  }

  return (
    Boolean(message.thinkingContent?.trim()) ||
    (message.contentParts || []).some(contentPartContainsProcess) ||
    (message.toolCalls?.length || 0) > 0 ||
    (message.actionRequests?.length || 0) > 0 ||
    (message.contextTrace?.length || 0) > 0 ||
    (message.artifacts?.length || 0) > 0 ||
    Boolean(message.imageWorkbenchPreview) ||
    Boolean(message.taskPreview) ||
    Boolean(message.runtimeStatus)
  );
}

function shouldMergeLocalAssistantProcessState(
  localMessage: Message | undefined,
  remoteMessage: Message,
): boolean {
  const hasVisibleProcessState =
    Boolean(
      localMessage?.contentParts?.some(
        (part) =>
          part.type === "tool_use" ||
          part.type === "action_required" ||
          part.type === "file_changes_batch",
      ),
    ) ||
    (localMessage?.toolCalls?.length || 0) > 0 ||
    (localMessage?.actionRequests?.length || 0) > 0 ||
    (localMessage?.contextTrace?.length || 0) > 0 ||
    (localMessage?.artifacts?.length || 0) > 0 ||
    Boolean(localMessage?.imageWorkbenchPreview) ||
    Boolean(localMessage?.taskPreview) ||
    Boolean(localMessage?.runtimeStatus);

  if (
    !localMessage ||
    remoteMessage.role !== "assistant" ||
    !hasVisibleProcessState ||
    hasRetainableLocalAssistantProcessState(remoteMessage)
  ) {
    return false;
  }

  const localContent = normalizeSignatureText(localMessage.content);
  const remoteContent = normalizeSignatureText(remoteMessage.content);
  return Boolean(
    localContent &&
      remoteContent &&
      localContent === remoteContent &&
      !isOmittedHistoryContentProjection(remoteMessage),
  );
}

function isLocalAssistantInMatchedUserTurn(params: {
  localAssistantMessage?: Message;
  localMessageIndexById: Map<string, number>;
  localMessages: Message[];
  lastMatchedLocalUserMessageIndex: number | null;
}): boolean {
  const { localAssistantMessage, lastMatchedLocalUserMessageIndex } = params;
  if (!localAssistantMessage?.id || lastMatchedLocalUserMessageIndex === null) {
    return false;
  }

  const assistantIndex = params.localMessageIndexById.get(
    localAssistantMessage.id,
  );
  if (
    assistantIndex === undefined ||
    assistantIndex <= lastMatchedLocalUserMessageIndex
  ) {
    return false;
  }

  return !params.localMessages
    .slice(lastMatchedLocalUserMessageIndex + 1, assistantIndex)
    .some((message) => message.role === "user");
}

function findPreviousLocalUserInSameTurn(params: {
  localAssistantMessage?: Message;
  localMessageIndexById: Map<string, number>;
  localMessages: Message[];
}): Message | null {
  const { localAssistantMessage } = params;
  if (!localAssistantMessage?.id) {
    return null;
  }

  const assistantIndex = params.localMessageIndexById.get(
    localAssistantMessage.id,
  );
  if (assistantIndex === undefined || assistantIndex <= 0) {
    return null;
  }

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const candidate = params.localMessages[index];
    if (!candidate) {
      continue;
    }

    if (candidate.role === "user") {
      return candidate;
    }
  }

  return null;
}

function hasRecoverableLocalUserBeforeAssistant(params: {
  localAssistantMessage?: Message;
  localMessageIndexById: Map<string, number>;
  localMessages: Message[];
  matchedLocalMessageIds: Set<string>;
}): boolean {
  const userMessage = findPreviousLocalUserInSameTurn(params);
  return Boolean(
    userMessage &&
    (!userMessage.id || !params.matchedLocalMessageIds.has(userMessage.id)) &&
    hasRetainableLocalMessageState(userMessage),
  );
}

function insertRecoverableLocalUsersForMatchedAssistantTurns(params: {
  mergedMessages: Message[];
  localMessageIndexById: Map<string, number>;
  localMessages: Message[];
  matchedLocalMessageIds: Set<string>;
}): Message[] {
  const existingUserSignatures = new Set(
    params.mergedMessages
      .filter((message) => message.role === "user")
      .map((message) =>
        [
          normalizeSignatureText(message.content || ""),
          messageImageSignature(message.images),
        ].join("::"),
      ),
  );
  let inserted = false;
  const nextMessages: Message[] = [];

  for (const message of params.mergedMessages) {
    if (message.role !== "assistant") {
      nextMessages.push(message);
      continue;
    }

    const hasMergedUserInCurrentTurn = (() => {
      for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
        const candidate = nextMessages[index];
        if (candidate?.role === "user") {
          return true;
        }
        if (candidate?.role === "assistant") {
          return false;
        }
      }
      return false;
    })();
    if (hasMergedUserInCurrentTurn) {
      nextMessages.push(message);
      continue;
    }

    const localAssistantMessage =
      message.id && params.localMessageIndexById.has(message.id)
        ? params.localMessages[params.localMessageIndexById.get(message.id)!]
        : undefined;
    const userMessage = findPreviousLocalUserInSameTurn({
      localAssistantMessage,
      localMessageIndexById: params.localMessageIndexById,
      localMessages: params.localMessages,
    });
    if (userMessage && hasRetainableLocalMessageState(userMessage)) {
      const signature = [
        normalizeSignatureText(userMessage.content || ""),
        messageImageSignature(userMessage.images),
      ].join("::");
      const isAlreadyMatched = Boolean(
        userMessage.id && params.matchedLocalMessageIds.has(userMessage.id),
      );
      if (!isAlreadyMatched && !existingUserSignatures.has(signature)) {
        nextMessages.push(userMessage);
        existingUserSignatures.add(signature);
        if (userMessage.id) {
          params.matchedLocalMessageIds.add(userMessage.id);
        }
        inserted = true;
      }
    }

    nextMessages.push(message);
  }

  return inserted ? nextMessages : params.mergedMessages;
}

export const mergeHydratedMessagesWithLocalState = (
  localMessages: Message[],
  hydratedMessages: Message[],
): Message[] => {
  if (hydratedMessages.length === 0) {
    return localMessages;
  }

  const localUserMessages = localMessages.filter(
    (message) => message.role === "user",
  );
  const localAssistantMessages = localMessages.filter(
    (message) => message.role === "assistant",
  );
  const localUserMessageIndexById = new Map<string, number>();
  const localAssistantMessageIndexById = new Map<string, number>();
  const localMessageIndexById = new Map<string, number>();
  const localImagePreviewByTaskId = new Map<
    string,
    MessageImageWorkbenchPreview
  >();
  const localTaskPreviewByTaskId = new Map<string, MessageTaskPreview>();
  const hydratedMessageIds = new Set<string>();

  localUserMessages.forEach((message, index) => {
    if (message.id) {
      localUserMessageIndexById.set(message.id, index);
    }
  });
  localAssistantMessages.forEach((message, index) => {
    if (message.id) {
      localAssistantMessageIndexById.set(message.id, index);
    }
  });
  localMessages.forEach((message, index) => {
    if (message.id) {
      localMessageIndexById.set(message.id, index);
    }
  });
  hydratedMessages.forEach((message) => {
    if (message.id) {
      hydratedMessageIds.add(message.id);
    }
  });

  localMessages.forEach((message) => {
    if (message.role !== "assistant") {
      return;
    }

    const imageTaskId = message.imageWorkbenchPreview?.taskId;
    if (imageTaskId) {
      localImagePreviewByTaskId.set(
        imageTaskId,
        message.imageWorkbenchPreview as MessageImageWorkbenchPreview,
      );
    }

    const taskPreviewId = message.taskPreview?.taskId;
    if (taskPreviewId) {
      localTaskPreviewByTaskId.set(
        taskPreviewId,
        message.taskPreview as MessageTaskPreview,
      );
    }
  });

  if (
    localUserMessages.length === 0 &&
    localAssistantMessages.length === 0 &&
    localImagePreviewByTaskId.size === 0 &&
    localTaskPreviewByTaskId.size === 0
  ) {
    return hydratedMessages;
  }

  let localUserCursor = 0;
  let localAssistantCursor = 0;
  let lastMatchedLocalUserMessageIndex: number | null = null;
  let hasHydratedUserInCurrentTurn = false;
  const matchedLocalMessageIds = new Set<string>();

  const mergedMessages = hydratedMessages.map((message) => {
    if (message.role === "assistant") {
      const matchedAssistantIndexById = message.id
        ? (localAssistantMessageIndexById.get(message.id) ?? -1)
        : -1;
      const matchedAssistantIndex =
        matchedAssistantIndexById >= 0
          ? matchedAssistantIndexById
          : findMatchingLocalAssistantMessageIndex(
              localAssistantMessages,
              message,
              localAssistantCursor,
            );
      const sequentialAssistantIndex =
        matchedAssistantIndex >= 0
          ? -1
          : findNextLocalAssistantAfterUser(
              localMessages,
              localAssistantMessageIndexById,
              matchedLocalMessageIds,
              lastMatchedLocalUserMessageIndex,
            );
      const processAssistantIndex =
        matchedAssistantIndex >= 0 ||
        sequentialAssistantIndex >= 0 ||
        hasRetainableLocalAssistantProcessState(message)
          ? -1
          : findNextLocalProcessAssistantIndex(
              localAssistantMessages,
              localAssistantCursor,
              matchedLocalMessageIds,
            );
      const resolvedMatchedAssistantIndex =
        matchedAssistantIndex >= 0
          ? matchedAssistantIndex
          : sequentialAssistantIndex >= 0
            ? sequentialAssistantIndex
            : processAssistantIndex;
      const didMatchLocalProcessAssistantOnly =
        processAssistantIndex >= 0 &&
        matchedAssistantIndex < 0 &&
        sequentialAssistantIndex < 0;
      const localAssistantMessage =
        resolvedMatchedAssistantIndex >= 0
          ? localAssistantMessages[resolvedMatchedAssistantIndex]
          : undefined;
      if (resolvedMatchedAssistantIndex >= 0) {
        localAssistantCursor = Math.max(
          localAssistantCursor,
          resolvedMatchedAssistantIndex + 1,
        );
        if (localAssistantMessage?.id) {
          matchedLocalMessageIds.add(localAssistantMessage.id);
        }
      }

      const localImagePreview =
        (message.imageWorkbenchPreview?.taskId
          ? localImagePreviewByTaskId.get(message.imageWorkbenchPreview.taskId)
          : undefined) ?? localAssistantMessage?.imageWorkbenchPreview;
      const localTaskPreview =
        (message.taskPreview?.taskId
          ? localTaskPreviewByTaskId.get(message.taskPreview.taskId)
          : undefined) ?? localAssistantMessage?.taskPreview;

      if (!localImagePreview && !localTaskPreview && !localAssistantMessage) {
        return message;
      }

      const hasMatchedUserTurn = isLocalAssistantInMatchedUserTurn({
        localAssistantMessage,
        localMessageIndexById,
        localMessages,
        lastMatchedLocalUserMessageIndex,
      });
      const hasRecoverableLocalUserTurn =
        !hasHydratedUserInCurrentTurn &&
        hasRecoverableLocalUserBeforeAssistant({
          localAssistantMessage,
          localMessageIndexById,
          localMessages,
          matchedLocalMessageIds,
        });
      const shouldPreserveLocalRuntimeSnapshot =
        (hasMatchedUserTurn || hasRecoverableLocalUserTurn) &&
        hasRetainableLocalAssistantProcessState(localAssistantMessage) &&
        !hasRetainableLocalAssistantProcessState(message);
      const shouldRestoreHistoricalProcessState =
        (hasMatchedUserTurn ||
          hasRecoverableLocalUserTurn ||
          didMatchLocalProcessAssistantOnly) &&
        hasRetainableLocalAssistantProcessState(localAssistantMessage) &&
        !hasRetainableLocalAssistantProcessState(message);
      const shouldMergeMatchingProcessState =
        shouldMergeLocalAssistantProcessState(localAssistantMessage, message);
      const shouldRetainLocalProcessState =
        !hasRenderableAssistantTextContent(message) ||
        shouldPreserveLocalRuntimeSnapshot ||
        shouldRestoreHistoricalProcessState ||
        shouldMergeMatchingProcessState;
      const shouldRetainLocalThinkingState =
        shouldRetainLocalProcessState || Boolean(message.thinkingContent);
      const contentParts = shouldRetainLocalProcessState
        ? mergeHydratedContentParts(
            localAssistantMessage?.contentParts,
            message.contentParts,
          )
        : message.contentParts;
      const toolCalls = (() => {
        const localToolCalls = localAssistantMessage?.toolCalls || [];
        const remoteToolCalls = message.toolCalls || [];
        if (localToolCalls.length === 0) {
          return remoteToolCalls.length > 0 ? remoteToolCalls : undefined;
        }
        if (remoteToolCalls.length === 0) {
          return localToolCalls;
        }

        const mergedToolCalls: HistoryToolCall[] = [...localToolCalls];
        const toolCallIndexById = new Map<string, number>();
        mergedToolCalls.forEach((toolCall, index) => {
          toolCallIndexById.set(toolCall.id, index);
        });

        for (const toolCall of remoteToolCalls) {
          const existingIndex = toolCallIndexById.get(toolCall.id);
          if (existingIndex === undefined) {
            toolCallIndexById.set(toolCall.id, mergedToolCalls.length);
            mergedToolCalls.push(toolCall);
            continue;
          }

          const existingToolCall = mergedToolCalls[existingIndex];
          if (existingToolCall) {
            mergedToolCalls[existingIndex] = mergeToolCallStates(
              existingToolCall,
              toolCall,
            );
          }
        }

        return mergedToolCalls;
      })();
      const actionRequests = mergeByKey(
        localAssistantMessage?.actionRequests,
        message.actionRequests,
        (request) => request.requestId,
      );
      const contextTrace = mergeByKey(
        localAssistantMessage?.contextTrace,
        message.contextTrace,
        (step) => `${step.stage}::${step.detail}`,
      );
      const artifacts = (() => {
        const localArtifacts = localAssistantMessage?.artifacts || [];
        const remoteArtifacts = message.artifacts || [];
        if (localArtifacts.length === 0) {
          return remoteArtifacts.length > 0 ? remoteArtifacts : undefined;
        }
        if (remoteArtifacts.length === 0) {
          return localArtifacts;
        }
        const merged = mergeArtifacts([...localArtifacts, ...remoteArtifacts]);
        return merged.length > 0 ? merged : undefined;
      })();
      const thinkingContent =
        message.thinkingContent ??
        (shouldRetainLocalThinkingState
          ? localAssistantMessage?.thinkingContent
          : undefined) ??
        extractThinkingContentFromParts(contentParts);
      const remoteIsFailedRuntimeStatus =
        message.runtimeStatus?.phase === "failed";
      const shouldPreserveLocalVisibleOutput =
        !remoteIsFailedRuntimeStatus &&
        (localAssistantMessage?.isThinking === true ||
          shouldPreserveLocalRuntimeSnapshot ||
          shouldPreserveLocalAssistantVisibleOutput(
            localAssistantMessage,
            message,
          ));
      const resolvedContentParts = shouldPreserveLocalVisibleOutput
        ? (mergeHydratedToolStateContentParts(
            localAssistantMessage?.contentParts,
            contentParts,
          ) ??
          localAssistantMessage?.contentParts ??
          contentParts)
        : contentParts;
      const resolvedThinkingContent = shouldPreserveLocalVisibleOutput
        ? (localAssistantMessage?.thinkingContent ??
          extractThinkingContentFromParts(resolvedContentParts))
        : thinkingContent;
      const resolvedFailedContentParts = remoteIsFailedRuntimeStatus
        ? settleRunningProcessPartsOnRemoteFailure(
            resolvedContentParts,
            message,
          )
        : resolvedContentParts;
      const resolvedFailedToolCalls =
        remoteIsFailedRuntimeStatus && toolCalls
          ? toolCalls.map((toolCall) =>
              settleRunningToolCallOnRemoteFailure(toolCall, message),
            )
          : toolCalls;

      return {
        ...message,
        id: localAssistantMessage?.id ?? message.id,
        content: shouldPreserveLocalVisibleOutput
          ? localAssistantMessage?.content || message.content
          : message.content,
        usage: message.usage ?? localAssistantMessage?.usage,
        contentParts: resolvedFailedContentParts,
        toolCalls: resolvedFailedToolCalls,
        actionRequests,
        contextTrace,
        artifacts,
        thinkingContent: remoteIsFailedRuntimeStatus
          ? extractThinkingContentFromParts(resolvedFailedContentParts)
          : resolvedThinkingContent,
        runtimeTurnId:
          message.runtimeTurnId ?? localAssistantMessage?.runtimeTurnId,
        inlineProcessRetention:
          message.inlineProcessRetention ??
          localAssistantMessage?.inlineProcessRetention,
        imageWorkbenchPreview: mergeImageWorkbenchPreview(
          localImagePreview,
          message.imageWorkbenchPreview,
        ),
        taskPreview: mergeTaskPreview(localTaskPreview, message.taskPreview),
      };
    }

    if (message.role !== "user") {
      return message;
    }

    hasHydratedUserInCurrentTurn = true;
    const matchedIndexById = message.id
      ? (localUserMessageIndexById.get(message.id) ?? -1)
      : -1;
    const matchedIndex =
      matchedIndexById >= 0
        ? matchedIndexById
        : findMatchingLocalUserMessageIndex(
            localUserMessages,
            message,
            localUserCursor,
          );
    if (matchedIndex < 0) {
      lastMatchedLocalUserMessageIndex = null;
      return message;
    }

    localUserCursor = Math.max(localUserCursor, matchedIndex + 1);
    const localMessage = localUserMessages[matchedIndex];
    if (localMessage?.id) {
      matchedLocalMessageIds.add(localMessage.id);
      lastMatchedLocalUserMessageIndex =
        localMessageIndexById.get(localMessage.id) ?? null;
    } else {
      lastMatchedLocalUserMessageIndex = null;
    }
    if (!localMessage) {
      return message;
    }

    if (hasMessageImages(message) || !hasMessageImages(localMessage)) {
      return {
        ...message,
        id: localMessage.id || message.id,
        inputCapabilityRoute:
          message.inputCapabilityRoute ?? localMessage.inputCapabilityRoute,
      };
    }

    return {
      ...message,
      id: localMessage.id || message.id,
      images: localMessage.images,
      inputCapabilityRoute:
        message.inputCapabilityRoute ?? localMessage.inputCapabilityRoute,
    };
  });

  const lastHydratedMessage =
    hydratedMessages.length > 0
      ? (hydratedMessages[hydratedMessages.length - 1] as Message)
      : null;
  const lastHydratedTimestampMs = lastHydratedMessage
    ? resolveMessageTimestampMs(lastHydratedMessage)
    : null;
  const lastMatchedLocalIndex = localMessages.reduce(
    (latest, message, index) => {
      if (!matchedLocalMessageIds.has(message.id)) {
        return latest;
      }
      return index;
    },
    -1,
  );
  const lastMatchedLocalMessage =
    lastMatchedLocalIndex >= 0 ? localMessages[lastMatchedLocalIndex] : null;
  const mergedMessagesWithRecoveredLocalUsers =
    insertRecoverableLocalUsersForMatchedAssistantTurns({
      mergedMessages,
      localMessageIndexById,
      localMessages,
      matchedLocalMessageIds,
    });

  const retainedLocalTail = localMessages.filter((message, index) => {
    if (hydratedMessageIds.has(message.id)) {
      return false;
    }
    if (matchedLocalMessageIds.has(message.id)) {
      return false;
    }
    if (index <= lastMatchedLocalIndex) {
      return false;
    }
    if (!hasRetainableLocalMessageState(message)) {
      return false;
    }

    const shouldRetainAssistantTailAfterHydratedUser =
      message.role === "assistant" &&
      lastHydratedMessage?.role === "user" &&
      lastMatchedLocalMessage?.role === "user";
    if (shouldRetainAssistantTailAfterHydratedUser) {
      return true;
    }

    const localTimestampMs = resolveMessageTimestampMs(message);
    if (lastHydratedTimestampMs === null || localTimestampMs === null) {
      return true;
    }

    return localTimestampMs >= lastHydratedTimestampMs;
  });

  return retainedLocalTail.length > 0
    ? [...mergedMessagesWithRecoveredLocalUsers, ...retainedLocalTail]
    : mergedMessagesWithRecoveredLocalUsers;
};

const messageImageSignature = (images?: MessageImage[]): string => {
  if (!images || images.length === 0) return "";
  return images
    .map((image) => `${image.mediaType}:${image.data.slice(0, 64)}`)
    .join("|");
};

const messageToolCallsSignature = (
  toolCalls?: Message["toolCalls"],
): string => {
  if (!toolCalls || toolCalls.length === 0) return "";
  return toolCalls
    .map((toolCall) => {
      const output = toolCall.result?.output
        ? normalizeSignatureText(toolCall.result.output)
        : "";
      const error = toolCall.result?.error
        ? normalizeSignatureText(toolCall.result.error)
        : "";
      return `${toolCall.id}:${toolCall.status}:${toolCall.name}:${output}:${error}`;
    })
    .join("|");
};

const messageContentPartsSignature = (parts?: ContentPart[]): string => {
  if (!parts || parts.length === 0) return "";
  return parts
    .map((part) => {
      if (part.type === "text" || part.type === "thinking") {
        return `${part.type}:${normalizeSignatureText(part.text)}`;
      }
      if (part.type === "tool_use") {
        const output = part.toolCall.result?.output
          ? normalizeSignatureText(part.toolCall.result.output)
          : "";
        const error = part.toolCall.result?.error
          ? normalizeSignatureText(part.toolCall.result.error)
          : "";
        return `tool_use:${part.toolCall.id}:${part.toolCall.status}:${part.toolCall.name}:${output}:${error}`;
      }
      if (part.type === "file_changes_batch") {
        return `file_changes_batch:${part.aggregate.fileCount}:+${part.aggregate.totalAdded}-${part.aggregate.totalRemoved}`;
      }
      const prompt = part.actionRequired.prompt
        ? normalizeSignatureText(part.actionRequired.prompt)
        : "";
      return `action_required:${part.actionRequired.requestId}:${part.actionRequired.actionType}:${prompt}`;
    })
    .join("|");
};

const messageArtifactsSignature = (
  artifacts?: Message["artifacts"],
): string => {
  if (!artifacts || artifacts.length === 0) return "";
  return artifacts
    .map((artifact) => {
      const filePath = resolveArtifactProtocolFilePath(artifact);
      return [
        artifact.id,
        artifact.type,
        artifact.status,
        normalizeSignatureText(artifact.title),
        normalizeSignatureText(filePath),
        normalizeSignatureText(artifact.content),
      ].join(":");
    })
    .join("|");
};

const buildAssistantHydrationSignature = (message: Message): string => {
  const contentSignature = normalizeSignatureText(message.content);
  const imageSignature = messageImageSignature(message.images);
  const imagePreviewSignature = imageWorkbenchPreviewSignature(
    message.imageWorkbenchPreview,
  );
  const nextTaskPreviewSignature = taskPreviewSignature(message.taskPreview);

  if (
    !contentSignature &&
    !imageSignature &&
    !imagePreviewSignature &&
    !nextTaskPreviewSignature
  ) {
    return "";
  }

  return [
    message.role,
    contentSignature,
    imageSignature,
    imagePreviewSignature,
    nextTaskPreviewSignature,
  ].join("::");
};

const buildHistoryMessageSignature = (message: Message): string => {
  const usageSignature = message.usage
    ? `${message.usage.input_tokens}:${message.usage.output_tokens}:${message.usage.cached_input_tokens ?? ""}:${message.usage.cache_creation_input_tokens ?? ""}`
    : "";
  return [
    message.role,
    normalizeSignatureText(message.content),
    messageImageSignature(message.images),
    messageToolCallsSignature(message.toolCalls),
    messageContentPartsSignature(message.contentParts),
    messageArtifactsSignature(message.artifacts),
    imageWorkbenchPreviewSignature(message.imageWorkbenchPreview),
    taskPreviewSignature(message.taskPreview),
    usageSignature,
  ].join("::");
};

export const dedupeAdjacentHistoryMessages = (
  messages: Message[],
): Message[] => {
  const deduped: Message[] = [];
  let previousSignature: string | null = null;
  let previousTimestampMs: number | null = null;

  for (const message of messages) {
    const signature = buildHistoryMessageSignature(message);
    const timestampMs = message.timestamp.getTime();
    const isDuplicate =
      previousSignature === signature &&
      previousTimestampMs !== null &&
      Math.abs(timestampMs - previousTimestampMs) <= 5000;

    if (!isDuplicate) {
      deduped.push(message);
      previousSignature = signature;
      previousTimestampMs = timestampMs;
    }
  }

  return deduped;
};

export const hydrateSessionDetailMessages = (
  detail: AsterSessionDetail,
  topicId: string,
  options: HydrateSessionDetailMessagesOptions = {},
): Message[] => {
  const historyToolNameById = new Map<string, string>();
  const historyToolArgumentsById = new Map<string, string | undefined>();
  const compactCompletedHistory =
    options.compactCompletedHistory === true &&
    shouldCompactCompletedSessionHistory(detail);
  const historyOffset =
    typeof detail.history_offset === "number" &&
    Number.isFinite(detail.history_offset) &&
    detail.history_offset >= 0
      ? Math.trunc(detail.history_offset)
      : 0;
  const cursorStartIndex =
    typeof detail.history_cursor?.start_index === "number" &&
    Number.isFinite(detail.history_cursor.start_index) &&
    detail.history_cursor.start_index >= 0
      ? Math.trunc(detail.history_cursor.start_index)
      : null;
  const messagesCount =
    typeof detail.messages_count === "number" &&
    Number.isFinite(detail.messages_count) &&
    detail.messages_count >= 0
      ? Math.trunc(detail.messages_count)
      : null;
  const historyAbsoluteStartIndex =
    cursorStartIndex !== null
      ? cursorStartIndex
      : messagesCount === null
        ? 0
        : Math.max(0, messagesCount - historyOffset - detail.messages.length);

  const loadedMessages: Message[] = detail.messages
    .filter(
      (msg) =>
        msg.role === "user" || msg.role === "assistant" || msg.role === "tool",
    )
    .flatMap((msg, index) => {
      const contentParts: ContentPart[] = [];
      const textParts: string[] = [];
      const toolCalls: Message["toolCalls"] = [];
      const images: MessageImage[] = [];
      const messageTimestamp = new Date(msg.timestamp * 1000);
      const rawParts = Array.isArray(msg.content) ? msg.content : [];
      let imageWorkbenchPreview: MessageImageWorkbenchPreview | undefined;
      let taskPreview: MessageTaskPreview | undefined;

      const appendText = (value: unknown) => {
        if (typeof value !== "string") return;
        const normalized = value.trim();
        if (!normalized) return;
        const lastPart = contentParts[contentParts.length - 1];
        if (lastPart?.type === "text") {
          const mergedText = appendTextWithOverlapDetection(
            lastPart.text,
            normalized,
          );
          lastPart.text =
            mergedText === `${lastPart.text}${normalized}`
              ? `${lastPart.text}\n${normalized}`
              : mergedText;
          textParts[textParts.length - 1] = lastPart.text;
          return;
        }

        textParts.push(normalized);
        contentParts.push({ type: "text", text: normalized });
      };

      for (const rawPart of rawParts) {
        if (!rawPart || typeof rawPart !== "object") continue;
        const part = rawPart as unknown as Record<string, unknown>;
        const partType = normalizeHistoryPartType(part.type);

        if (
          partType === "text" ||
          partType === "input_text" ||
          partType === "output_text"
        ) {
          appendText(part.text ?? part.content);
          continue;
        }

        if (
          compactCompletedHistory &&
          (partType === "thinking" ||
            partType === "reasoning" ||
            partType === "tool_request")
        ) {
          continue;
        }

        if (partType === "thinking" || partType === "reasoning") {
          const rawThinking =
            typeof part.thinking === "string"
              ? part.thinking
              : typeof part.reasoning === "string"
                ? part.reasoning
                : typeof part.text === "string"
                  ? part.text
                  : typeof part.content === "string"
                    ? part.content
                    : "";

          if (rawThinking) {
            const mergedThinkingParts = appendThinkingToHistoryParts(
              contentParts,
              rawThinking,
            );
            contentParts.splice(0, contentParts.length, ...mergedThinkingParts);
          }
          continue;
        }

        if (
          partType === "image" ||
          partType === "input_image" ||
          partType === "image_url"
        ) {
          const normalizedImage = normalizeHistoryImagePart(part);
          if (normalizedImage) {
            images.push(normalizedImage);
          }
          continue;
        }

        if (partType === "tool_request") {
          if (!part.id || typeof part.id !== "string") continue;
          const nestedToolCall =
            part.toolCall && typeof part.toolCall === "object"
              ? (part.toolCall as Record<string, unknown>)
              : part.tool_call && typeof part.tool_call === "object"
                ? (part.tool_call as Record<string, unknown>)
                : undefined;
          const nestedToolCallValue =
            nestedToolCall?.value && typeof nestedToolCall.value === "object"
              ? (nestedToolCall.value as Record<string, unknown>)
              : undefined;
          const toolName =
            (typeof part.tool_name === "string" && part.tool_name.trim()) ||
            (typeof part.toolName === "string" && part.toolName.trim()) ||
            (typeof part.name === "string" && part.name.trim()) ||
            (typeof nestedToolCallValue?.name === "string" &&
              nestedToolCallValue.name.trim()) ||
            resolveHistoryToolName(part.id, historyToolNameById);
          const rawArguments =
            part.arguments ??
            nestedToolCallValue?.arguments ??
            nestedToolCall?.arguments;
          const toolCall = {
            id: part.id,
            name: toolName,
            arguments: stringifyToolArguments(rawArguments),
            status: "running" as const,
            startTime: messageTimestamp,
          };
          historyToolNameById.set(part.id, toolName);
          historyToolArgumentsById.set(part.id, toolCall.arguments);
          toolCalls.push(toolCall);
          contentParts.push({ type: "tool_use", toolCall });
          continue;
        }

        if (partType === "tool_response") {
          if (!part.id || typeof part.id !== "string") continue;
          const toolName = resolveHistoryToolName(part.id, historyToolNameById);
          const rawOutputText =
            typeof part.output === "string" ? part.output : "";
          const rawErrorText = typeof part.error === "string" ? part.error : "";
          const normalizedOutput = extractLimeToolMetadataBlock(rawOutputText);
          const normalizedError = extractLimeToolMetadataBlock(rawErrorText);
          const metadata = normalizeToolResultMetadata(
            part.metadata,
            rawOutputText,
            rawErrorText,
          );
          const normalizedResult = {
            success: part.success !== false,
            output: normalizedOutput.text,
            error: normalizedError.text || undefined,
            images: normalizeToolResultImages(
              part.images,
              normalizedOutput.text,
              metadata,
            ),
            metadata,
          };
          const success = isToolResultSuccessful(normalizedResult);
          const normalizedResultRecord =
            normalizedResult &&
            typeof normalizedResult === "object" &&
            !Array.isArray(normalizedResult)
              ? (normalizedResult as Record<string, unknown>)
              : undefined;
          const toolArguments = historyToolArgumentsById.get(part.id);
          const imageWorkbenchPreviewFromTool =
            buildImageTaskPreviewFromToolResult({
              toolId: part.id,
              toolName,
              toolArguments,
              toolResult: normalizedResultRecord,
              fallbackPrompt: textParts.join("\n").trim(),
            });
          if (compactCompletedHistory) {
            imageWorkbenchPreview = mergeImageWorkbenchPreview(
              imageWorkbenchPreview,
              imageWorkbenchPreviewFromTool || undefined,
            );
            continue;
          }
          const toolCall = {
            id: part.id,
            name: toolName,
            status: success ? ("completed" as const) : ("failed" as const),
            startTime: messageTimestamp,
            endTime: messageTimestamp,
            result: {
              ...normalizedResult,
              success,
            },
          };
          toolCalls.push(toolCall);
          contentParts.push({ type: "tool_use", toolCall });
          imageWorkbenchPreview = mergeImageWorkbenchPreview(
            imageWorkbenchPreview,
            imageWorkbenchPreviewFromTool || undefined,
          );
          taskPreview = imageWorkbenchPreviewFromTool
            ? undefined
            : mergeTaskPreview(
                taskPreview,
                buildTaskPreviewFromToolResult({
                  toolId: part.id,
                  toolName,
                  toolArguments,
                  toolResult: normalizedResultRecord,
                  fallbackPrompt: textParts.join("\n").trim(),
                }) || undefined,
              );
          continue;
        }

        if (partType !== "action_required") continue;

        const actionType =
          typeof part.action_type === "string" ? part.action_type : "";
        if (actionType !== "elicitation_response") continue;

        const data =
          part.data && typeof part.data === "object"
            ? (part.data as Record<string, unknown>)
            : undefined;
        const userData =
          data && "user_data" in data ? data.user_data : part.data;
        const resolved = resolveHistoryUserDataText(userData);
        if (!resolved) continue;

        textParts.push(resolved);
        contentParts.push({ type: "text", text: resolved });
      }

      const rawContent = textParts.join("\n").trim();
      let normalizedRole =
        msg.role === "tool" ? "assistant" : (msg.role as "user" | "assistant");
      const usage = normalizeHistoryUsage(msg.usage);
      const content = sanitizeMessageTextForDisplay(rawContent, {
        role: normalizedRole,
        hasImages: images.length > 0,
      });
      const sanitizedContentParts =
        sanitizeContentPartsForDisplay(contentParts, {
          role: normalizedRole,
          hasImages: images.length > 0,
        }) || [];

      const hasToolMetadata =
        toolCalls.length > 0 ||
        sanitizedContentParts.some((part) => part.type === "tool_use");
      const hasProcessPreview =
        Boolean(imageWorkbenchPreview) || Boolean(taskPreview);

      if (normalizedRole === "user" && !content && images.length === 0) {
        if (hasToolMetadata || hasProcessPreview) {
          normalizedRole = "assistant";
        } else {
          return [];
        }
      }

      if (
        !content &&
        images.length === 0 &&
        sanitizedContentParts.length === 0 &&
        toolCalls.length === 0 &&
        !hasProcessPreview &&
        !(normalizedRole === "assistant" && usage)
      ) {
        return [];
      }

      const hydratedMessage: Message = {
        id: `${topicId}-${historyAbsoluteStartIndex + index}`,
        role: normalizedRole,
        content,
        images: images.length > 0 ? images : undefined,
        contentParts:
          sanitizedContentParts.length > 0 ? sanitizedContentParts : undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: messageTimestamp,
        isThinking: false,
        usage: normalizedRole === "assistant" ? usage : undefined,
        thinkingContent: extractThinkingContentFromParts(sanitizedContentParts),
        imageWorkbenchPreview,
        taskPreview,
      };

      return [
        compactCompletedHistory
          ? compactHistoricalRestoreMessage(hydratedMessage)
          : hydratedMessage,
      ];
    });

  const hydratedMessages = mergeAdjacentAssistantMessages(
    dedupeAdjacentHistoryMessages(loadedMessages),
  );
  const failedRuntimeMessage = hydrateFailedRuntimeReadModelMessage(
    detail,
    topicId,
  );
  const threadReadToolCallMessages =
    hydrateSessionDetailMessagesFromThreadReadToolCalls(detail, topicId);
  const readModelProcessMessages = [
    ...threadReadToolCallMessages,
    ...(failedRuntimeMessage ? [failedRuntimeMessage] : []),
  ];
  const timelineFallbackMessages =
    options.includeTimelineFallback === false
      ? []
      : [
          ...hydrateSessionDetailMessagesFromThreadItems(detail, topicId),
          ...hydrateSessionDetailMessagesFromArtifacts(detail, topicId),
        ];
  const timelineMessages =
    readModelProcessMessages.length === 0 &&
    timelineFallbackMessages.length === 0
      ? []
      : mergeAdjacentAssistantMessages(
          dedupeAdjacentHistoryMessages([
            ...readModelProcessMessages,
            ...timelineFallbackMessages,
          ]),
        );

  if (hydratedMessages.length > 0) {
    const hydratedWithTimelineProcess = shouldMergeTimelineProcessMessages(
      timelineMessages,
    )
      ? mergeHydratedMessagesWithLocalState(timelineMessages, hydratedMessages)
      : hydratedMessages;
    const hydratedWithFailedRuntime = failedRuntimeMessage
      ? mergeAdjacentAssistantMessages(
          dedupeAdjacentHistoryMessages([
            ...hydratedWithTimelineProcess,
            ...(!hydratedWithTimelineProcess.some(
              (message) => message.id === failedRuntimeMessage.id,
            )
              ? [failedRuntimeMessage]
              : []),
          ]),
        )
      : hydratedWithTimelineProcess;
    return mergeMissingUserMessagesFromTimeline(
      hydratedWithFailedRuntime,
      detail,
      topicId,
    );
  }

  if (detail.messages.length > 0) {
    return timelineMessages.length > 0 ? timelineMessages : hydratedMessages;
  }

  if (options.includeTimelineFallback !== false) {
    if (timelineMessages.length > 0) {
      return timelineMessages;
    }

    return hydrateSessionDetailMessagesFromTurns(detail, topicId);
  }

  return [];
};
