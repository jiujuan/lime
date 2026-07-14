import type { Dispatch, SetStateAction } from "react";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type { Message } from "../types";

type MessageContentPart = NonNullable<Message["contentParts"]>[number];
type MessageContentParts = NonNullable<Message["contentParts"]>;

function metadataFromThreadItem(
  item: AgentThreadItem,
): Record<string, unknown> | undefined {
  return item.metadata && typeof item.metadata === "object"
    ? (item.metadata as Record<string, unknown>)
    : undefined;
}

function isReasoningPartForThreadItem(
  part: MessageContentPart,
  itemId: string,
): boolean {
  return part.type === "thinking" && part.metadata?.threadItemId === itemId;
}

function normalizeComparableReasoningText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function areReasoningTextsEquivalent(left: string, right: string): boolean {
  const normalizedLeft = normalizeComparableReasoningText(left);
  const normalizedRight = normalizeComparableReasoningText(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(normalizedRight) ||
    normalizedRight.startsWith(normalizedLeft)
  );
}

export function isPersistedReasoningContentPart(
  part: MessageContentPart,
): boolean {
  return (
    part.type === "thinking" &&
    part.metadata?.source === "thread_item_reasoning" &&
    Boolean(part.metadata.threadItemId)
  );
}

function threadItemToolSequenceById(
  items: readonly AgentThreadItem[],
  turnId?: string | null,
): Map<string, number> {
  const sequenceById = new Map<string, number>();
  const normalizedTurnId = turnId?.trim();
  for (const item of items) {
    if (item.type !== "tool_call") {
      continue;
    }
    if (normalizedTurnId && item.turn_id !== normalizedTurnId) {
      continue;
    }
    sequenceById.set(item.id, threadItemTimelinePosition(item));
  }
  return sequenceById;
}

function threadItemTimelinePosition(item: AgentThreadItem): number {
  if (isComparableThreadItemSequence(item.ordinal)) {
    return item.ordinal;
  }
  const metadata = metadataFromThreadItem(item);
  const metadataOrdinal = metadata?.ordinal;
  return isComparableThreadItemSequence(metadataOrdinal)
    ? metadataOrdinal
    : item.sequence;
}

function isComparableThreadItemSequence(sequence: unknown): sequence is number {
  return (
    typeof sequence === "number" &&
    Number.isFinite(sequence) &&
    sequence < Number.MAX_SAFE_INTEGER
  );
}

function contentPartSequence(
  part: MessageContentPart,
  sequenceByToolId: Map<string, number>,
): number | null {
  const sequence = part.metadata?.sequence;
  if (isComparableThreadItemSequence(sequence)) {
    return sequence;
  }
  if (part.type === "tool_use") {
    const itemSequence = sequenceByToolId.get(part.toolCall.id);
    return isComparableThreadItemSequence(itemSequence) ? itemSequence : null;
  }
  return null;
}

function isThinkingPartCompatibleWithReasoningItem(
  part: MessageContentPart,
  item: AgentThreadItem,
  text: string,
): boolean {
  if (part.type !== "thinking" || !part.text.trim()) {
    return false;
  }

  const partThreadItemId = part.metadata?.threadItemId;
  if (partThreadItemId && partThreadItemId === item.id) {
    return true;
  }

  const partTurnId =
    typeof part.metadata?.turnId === "string"
      ? part.metadata.turnId.trim()
      : "";
  const itemTurnId = item.turn_id.trim();
  if (partTurnId && itemTurnId && partTurnId !== itemTurnId) {
    return false;
  }

  return areReasoningTextsEquivalent(part.text, text);
}

function upsertToolSequenceIntoContentParts(
  parts: MessageContentParts,
  sequenceByToolId: Map<string, number>,
): MessageContentParts {
  let changed = false;
  const nextParts = parts.map((part) => {
    if (part.type !== "tool_use") {
      return part;
    }
    if (isComparableThreadItemSequence(part.metadata?.sequence)) {
      return part;
    }
    const sequence = sequenceByToolId.get(part.toolCall.id);
    if (!isComparableThreadItemSequence(sequence)) {
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

function insertReasoningPartByContentSequence(params: {
  parts: MessageContentParts;
  reasoningPart: MessageContentPart;
  reasoningSequence: number;
  sequenceByToolId: Map<string, number>;
}): MessageContentParts {
  let insertAfterIndex = -1;
  for (let index = 0; index < params.parts.length; index += 1) {
    const sequence = contentPartSequence(
      params.parts[index]!,
      params.sequenceByToolId,
    );
    if (sequence !== null && sequence <= params.reasoningSequence) {
      insertAfterIndex = index;
    }
  }

  if (insertAfterIndex >= 0) {
    return [
      ...params.parts.slice(0, insertAfterIndex + 1),
      params.reasoningPart,
      ...params.parts.slice(insertAfterIndex + 1),
    ];
  }

  const firstTextIndex = params.parts.findIndex((part) => part.type === "text");
  if (firstTextIndex >= 0) {
    return [
      ...params.parts.slice(0, firstTextIndex),
      params.reasoningPart,
      ...params.parts.slice(firstTextIndex),
    ];
  }

  return [...params.parts, params.reasoningPart];
}

function hasComparableContentPartSequence(
  parts: MessageContentParts,
  sequenceByToolId: Map<string, number>,
): boolean {
  return parts.some(
    (part) => contentPartSequence(part, sequenceByToolId) !== null,
  );
}

export function syncAssistantReasoningContentPartFromThreadItem(params: {
  assistantMsgId: string;
  item: AgentThreadItem;
  threadItems?: readonly AgentThreadItem[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
}): void {
  if (params.item.type !== "reasoning") {
    return;
  }

  const text = params.item.text?.trim();
  if (!text) {
    return;
  }

  const timelinePosition = threadItemTimelinePosition(params.item);

  params.setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== params.assistantMsgId) {
        return message;
      }

      const metadata = {
        ...(metadataFromThreadItem(params.item) ?? {}),
        source: "thread_item_reasoning",
        threadItemId: params.item.id,
        sequence: timelinePosition,
        turnId: params.item.turn_id,
      };
      const sequenceByToolId = threadItemToolSequenceById(
        params.threadItems ?? [],
        params.item.turn_id,
      );
      const parts = upsertToolSequenceIntoContentParts(
        message.contentParts || [],
        sequenceByToolId,
      );
      const existingIndex = parts.findIndex((part) =>
        isReasoningPartForThreadItem(part, params.item.id),
      );
      const compatibleThinkingIndex =
        existingIndex >= 0
          ? existingIndex
          : parts.findIndex((part) =>
              isThinkingPartCompatibleWithReasoningItem(
                part,
                params.item,
                text,
              ),
            );
      const nextPart: MessageContentPart = {
        type: "thinking",
        text,
        metadata,
      };

      if (compatibleThinkingIndex >= 0) {
        const existingPart = parts[compatibleThinkingIndex];
        const remainingParts = [
          ...parts.slice(0, compatibleThinkingIndex),
          ...parts.slice(compatibleThinkingIndex + 1),
        ];
        if (
          !hasComparableContentPartSequence(remainingParts, sequenceByToolId)
        ) {
          const nextParts = [...parts];
          nextParts[compatibleThinkingIndex] = nextPart;
          if (
            existingPart?.type === "thinking" &&
            existingPart.text === text &&
            existingPart.metadata?.turnId === params.item.turn_id
          ) {
            return message;
          }
          return {
            ...message,
            contentParts: nextParts,
          };
        }
        const nextParts = insertReasoningPartByContentSequence({
          parts: remainingParts,
          reasoningPart: nextPart,
          reasoningSequence: timelinePosition,
          sequenceByToolId,
        });
        if (
          existingPart?.type === "thinking" &&
          existingPart.text === text &&
          existingPart.metadata?.turnId === params.item.turn_id &&
          nextParts === parts
        ) {
          return message;
        }
        return {
          ...message,
          contentParts: nextParts,
        };
      }

      return {
        ...message,
        contentParts: insertReasoningPartByContentSequence({
          parts,
          reasoningPart: nextPart,
          reasoningSequence: timelinePosition,
          sequenceByToolId,
        }),
      };
    }),
  );
}
