import type {
  AgentThreadItem,
  AgentThreadReasoningItem,
} from "@/lib/api/agentProtocol";
import type { ContentPart, Message } from "../types";
import type { HistoryToolCall } from "./agentChatHistoryTypes";
import { extractThinkingContentFromParts } from "./agentChatHistoryPrimitives";
import { collectMessageToolIds, hasSharedValue } from "./agentChatHistorySignatures";

function isReasoningPartForThreadItemContent(
  part: ContentPart,
  item: AgentThreadReasoningItem,
): boolean {
  if (part.type !== "thinking") {
    return false;
  }
  if (part.metadata?.threadItemId === item.id) {
    return true;
  }
  if (part.text.trim() !== item.text?.trim()) {
    return false;
  }

  const metadataTurnId =
    typeof part.metadata?.turnId === "string"
      ? part.metadata.turnId
      : typeof part.metadata?.turn_id === "string"
        ? part.metadata.turn_id
        : null;
  const metadataSequence = sequenceFromContentPart(part);
  return (
    metadataTurnId === item.turn_id ||
    (metadataSequence !== null && metadataSequence === item.sequence)
  );
}

function isThreadReasoningItem(
  item: AgentThreadItem,
): item is AgentThreadReasoningItem {
  return item.type === "reasoning" && Boolean(item.text.trim());
}

function sequenceFromContentPart(
  part: ContentPart,
  sequenceByToolId?: Map<string, number>,
): number | null {
  const sequence = part.metadata?.sequence;
  if (
    typeof sequence === "number" &&
    Number.isFinite(sequence) &&
    sequence < Number.MAX_SAFE_INTEGER
  ) {
    return sequence;
  }
  if (part.type === "tool_use") {
    const itemSequence = sequenceByToolId?.get(part.toolCall.id);
    return typeof itemSequence === "number" &&
      Number.isFinite(itemSequence) &&
      itemSequence < Number.MAX_SAFE_INTEGER
      ? itemSequence
      : null;
  }
  return null;
}

export function contentPartMetadataFromThreadToolItem(
  item: AgentThreadItem,
  toolCall: HistoryToolCall,
): Record<string, unknown> | undefined {
  const metadata =
    toolCall.metadata && typeof toolCall.metadata === "object"
      ? { ...(toolCall.metadata as Record<string, unknown>) }
      : {};
  metadata.source = "agent_thread_item";
  metadata.threadItemId = item.id;
  metadata.sequence = item.sequence;
  metadata.turnId = item.turn_id;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function contentPartMetadataFromThreadReasoningItem(
  item: AgentThreadReasoningItem,
): Record<string, unknown> {
  return {
    ...(item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : {}),
    source: "thread_item_reasoning",
    threadItemId: item.id,
    sequence: item.sequence,
    turnId: item.turn_id,
  };
}

function insertReasoningPartByThreadSequence(
  parts: ContentPart[],
  nextPart: ContentPart,
  sequence: number,
  sequenceByToolId: Map<string, number>,
): ContentPart[] {
  let insertAfterIndex = -1;
  for (let index = 0; index < parts.length; index += 1) {
    const partSequence = sequenceFromContentPart(
      parts[index]!,
      sequenceByToolId,
    );
    if (partSequence !== null && partSequence < sequence) {
      insertAfterIndex = index;
    }
  }

  if (insertAfterIndex >= 0) {
    return [
      ...parts.slice(0, insertAfterIndex + 1),
      nextPart,
      ...parts.slice(insertAfterIndex + 1),
    ];
  }

  const firstTextIndex = parts.findIndex((part) => part.type === "text");
  if (firstTextIndex >= 0) {
    return [
      ...parts.slice(0, firstTextIndex),
      nextPart,
      ...parts.slice(firstTextIndex),
    ];
  }

  return [...parts, nextPart];
}

function mergeToolSequenceIntoContentParts(
  parts: ContentPart[],
  sequenceByToolId: Map<string, number>,
): ContentPart[] {
  let changed = false;
  const nextParts = parts.map((part) => {
    if (part.type !== "tool_use") {
      return part;
    }
    if (
      typeof part.metadata?.sequence === "number" &&
      Number.isFinite(part.metadata.sequence) &&
      part.metadata.sequence < Number.MAX_SAFE_INTEGER
    ) {
      return part;
    }
    const sequence = sequenceByToolId.get(part.toolCall.id);
    if (
      typeof sequence !== "number" ||
      !Number.isFinite(sequence) ||
      sequence >= Number.MAX_SAFE_INTEGER
    ) {
      return part;
    }
    changed = true;
    return {
      ...part,
      metadata: {
        ...(part.metadata ?? {}),
        sequence,
      },
    };
  });
  return changed ? nextParts : parts;
}

function mergeReasoningThreadItemsIntoContentParts(params: {
  parts?: ContentPart[];
  reasoningItems: AgentThreadItem[];
  sequenceByToolId: Map<string, number>;
}): ContentPart[] | undefined {
  const baseParts = mergeToolSequenceIntoContentParts(
    Array.isArray(params.parts) ? params.parts : [],
    params.sequenceByToolId,
  );
  const relevantReasoningItems = params.reasoningItems
    .filter(isThreadReasoningItem)
    .sort((left, right) => left.sequence - right.sequence);

  if (relevantReasoningItems.length === 0) {
    return params.parts;
  }

  let merged = [...baseParts];
  for (const item of relevantReasoningItems) {
    const text = item.text.trim();
    const metadata = {
      ...(item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : {}),
      source: "thread_item_reasoning",
      threadItemId: item.id,
      sequence: item.sequence,
      turnId: item.turn_id,
    };
    const existingIndex = merged.findIndex((part) =>
      isReasoningPartForThreadItemContent(part, item),
    );
    const nextPart: ContentPart = {
      type: "thinking",
      text,
      metadata,
    };

    if (existingIndex >= 0) {
      merged = [
        ...merged.slice(0, existingIndex),
        ...merged.slice(existingIndex + 1),
      ];
    }

    merged = insertReasoningPartByThreadSequence(
      merged,
      nextPart,
      item.sequence,
      params.sequenceByToolId,
    );
  }

  return merged.length > 0 ? merged : undefined;
}

function collectThreadItemToolIdsByTurnId(
  items: AgentThreadItem[],
): Map<string, Set<string>> {
  const toolIdsByTurnId = new Map<string, Set<string>>();
  for (const item of items) {
    if (
      item.type !== "tool_call" &&
      item.type !== "command_execution" &&
      item.type !== "patch" &&
      item.type !== "web_search"
    ) {
      continue;
    }

    const turnId = item.turn_id?.trim();
    if (!turnId) {
      continue;
    }
    const toolIds = toolIdsByTurnId.get(turnId) ?? new Set<string>();
    toolIds.add(item.id);
    toolIdsByTurnId.set(turnId, toolIds);
  }
  return toolIdsByTurnId;
}

function collectThreadItemSequenceByToolId(
  items: AgentThreadItem[],
): Map<string, number> {
  const sequenceByToolId = new Map<string, number>();
  for (const item of items) {
    if (
      item.type !== "tool_call" &&
      item.type !== "command_execution" &&
      item.type !== "patch" &&
      item.type !== "web_search"
    ) {
      continue;
    }
    sequenceByToolId.set(item.id, item.sequence);
  }
  return sequenceByToolId;
}

function messageMatchesReasoningThreadItem(params: {
  message: Message;
  item: AgentThreadItem;
  toolIdsByTurnId: Map<string, Set<string>>;
}): boolean {
  const runtimeTurnId = params.message.runtimeTurnId?.trim();
  if (runtimeTurnId && runtimeTurnId === params.item.turn_id) {
    return true;
  }

  const turnToolIds = params.toolIdsByTurnId.get(params.item.turn_id);
  if (!turnToolIds?.size) {
    return false;
  }
  return hasSharedValue(collectMessageToolIds(params.message), turnToolIds);
}

export function mergeThreadItemReasoningIntoMessages(
  messages: Message[],
  items: AgentThreadItem[],
): Message[] {
  const reasoningItems = items.filter(
    (item) => item.type === "reasoning" && Boolean(item.text?.trim()),
  );
  if (reasoningItems.length === 0) {
    return messages;
  }

  const toolIdsByTurnId = collectThreadItemToolIdsByTurnId(items);
  const sequenceByToolId = collectThreadItemSequenceByToolId(items);
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }

    const matchingReasoningItems = reasoningItems.filter((item) =>
      messageMatchesReasoningThreadItem({
        message,
        item,
        toolIdsByTurnId,
      }),
    );
    if (matchingReasoningItems.length === 0) {
      return message;
    }

    const contentParts = mergeReasoningThreadItemsIntoContentParts({
      parts: message.contentParts,
      reasoningItems: matchingReasoningItems,
      sequenceByToolId,
    });
    if (contentParts === message.contentParts) {
      return message;
    }

    changed = true;
    return {
      ...message,
      contentParts,
      thinkingContent:
        extractThinkingContentFromParts(contentParts) ??
        message.thinkingContent,
    };
  });

  return changed ? nextMessages : messages;
}
