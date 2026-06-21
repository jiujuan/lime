import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import type { Message } from "../types";
import { sanitizeContentPartsForDisplay, sanitizeMessageTextForDisplay } from "../utils/messageDisplaySanitizer";
import { resolveFinalAgentMessageItemIds, shouldUseAgentMessageAsFinalText } from "../utils/agentMessagePhase";
import { aggregateFileChanges, isFileMutationToolName } from "../utils/fileChangeSummary";
import { SKILL_INLINE_PROCESS_RETENTION } from "../utils/skillInlineProcessRetention";
import { buildImageTaskPreviewFromToolResult, buildTaskPreviewFromToolResult } from "../utils/taskPreviewFromToolResult";
import { normalizeToolResultMetadata } from "./agentChatToolResult";
import { toActionRequired, toToolCallState } from "../components/timeline-utils/itemConverters";
import { mergeAdjacentAssistantMessages } from "./agentChatHistoryAdjacentMerge";
import {
  appendTextToParts,
  appendThinkingToHistoryParts,
  asHistoryRecord,
  parseHistoryTimestamp,
  mergeByKey,
} from "./agentChatHistoryPrimitives";
import {
  contentPartMetadataFromThreadToolItem,
} from "./agentChatHistoryReasoning";
import {
  extractThinkingContentFromParts,
} from "./agentChatHistoryPrimitives";
import {
  mergeHydratedToolStateContentParts,
  mergeImageWorkbenchPreview,
  mergeTaskPreview,
} from "./agentChatHistoryProcess";
import { dedupeAdjacentHistoryMessages } from "./agentChatHistorySignatures";
import { isAuxiliaryHistoryTurn, readThreadItemText } from "./agentChatHistoryTimelineBasics";

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
      ? readThreadItemText(item, ["content", "text", "message"])
      : readThreadItemText(item, ["text", "content", "message"]);
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
    runtimeTurnId: item.turn_id,
  };
}

export function hydrateSessionDetailMessagesFromThreadItems(
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
        asHistoryRecord(item.metadata) ?? undefined,
      );
      draft.timestamp = parseHistoryTimestamp(
        item.completed_at || item.updated_at || item.started_at,
      );
      continue;
    }

    if (
      item.type === "tool_call" ||
      item.type === "command_execution" ||
      item.type === "patch" ||
      item.type === "web_search"
    ) {
      const draft = ensureAssistantDraft(item);
      const toolCall = toToolCallState(item);
      if (!toolCall) {
        continue;
      }
      const toolArguments = toolCall.arguments;
      const itemMetadata = contentPartMetadataFromThreadToolItem(
        item,
        toolCall,
      );
      const normalizedResult =
        toolCall.result && typeof toolCall.result === "object"
          ? {
              ...toolCall.result,
              metadata:
                normalizeToolResultMetadata(
                  toolCall.result.metadata,
                  toolCall.result.output || "",
                  toolCall.result.error || "",
                ) || itemMetadata,
            }
          : toolCall.result;
      const normalizedToolCall =
        normalizedResult && typeof normalizedResult === "object"
          ? {
              ...toolCall,
              metadata: itemMetadata,
              result: normalizedResult,
            }
          : {
              ...toolCall,
              metadata: itemMetadata,
            };
      draft.toolCalls = mergeByKey(
        draft.toolCalls,
        [normalizedToolCall],
        (tool) => tool.id,
      );
      draft.contentParts = [
        ...(draft.contentParts || []),
        {
          type: "tool_use",
          toolCall: normalizedToolCall,
          ...(itemMetadata ? { metadata: itemMetadata } : {}),
        },
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
          toolName: toolCall.name,
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
              toolName: toolCall.name,
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
        toolCall.name === "Skill" ||
        metadata?.tool_family === "skill" ||
        metadata?.skill_source === "SKILL.md"
      ) {
        draft.inlineProcessRetention = SKILL_INLINE_PROCESS_RETENTION;
      }
      continue;
    }

    if (
      item.type === "approval_request" ||
      item.type === "request_user_input"
    ) {
      const actionRequired = toActionRequired(item);
      if (!actionRequired) {
        continue;
      }
      const draft = ensureAssistantDraft(item);
      draft.actionRequests = mergeByKey(
        draft.actionRequests,
        [actionRequired],
        (action) => action.requestId,
      );
      draft.contentParts = mergeHydratedToolStateContentParts(
        draft.contentParts || [],
        [{ type: "action_required", actionRequired }],
      );
      draft.timestamp = parseHistoryTimestamp(
        item.completed_at || item.updated_at || item.started_at,
      );
    }
  }
  flushAssistantDraft();

  return mergeAdjacentAssistantMessages(
    dedupeAdjacentHistoryMessages(messages),
  );
}
