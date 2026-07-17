import type { AgentSessionDetail } from "@/lib/api/agentRuntime/sessionTypes";
import type { Message } from "../types";
import { mergeAdjacentAssistantMessages } from "./agentChatHistoryAdjacentMerge";
import { contentPartContainsProcess } from "./agentChatHistoryProcess";
import {
  dedupeAdjacentHistoryMessages,
  messageImageSignature,
  resolveMessageTimestampMs,
} from "./agentChatHistorySignatures";
import { normalizeSignatureText } from "./agentChatHistoryPrimitives";
import { hydrateSessionDetailMessagesFromThreadItems } from "./agentChatHistoryThreadItems";
import { hydrateSessionDetailMessagesFromTurns } from "./agentChatHistoryTimelineBasics";

export function shouldMergeTimelineProcessMessages(
  timelineMessages: Message[],
): boolean {
  if (!hasHistoryAssistantProcessGap(timelineMessages)) {
    return false;
  }
  return true;
}

export function hasHistoryAssistantProcessGap(messages: Message[]): boolean {
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

export function mergeMissingUserMessagesFromTimeline(
  messages: Message[],
  detail: AgentSessionDetail,
  topicId: string,
): Message[] {
  const buildFallbackUserSignatures = (message: Message): string[] => {
    const signatures: string[] = [];
    const runtimeTurnId = message.runtimeTurnId?.trim();
    if (runtimeTurnId) {
      signatures.push(`turn:${runtimeTurnId}`);
    }
    const normalizedContent = normalizeSignatureText(message.content || "");
    signatures.push(
      `content-images:${normalizedContent}::${messageImageSignature(message.images)}`,
    );
    const timestampMs = resolveMessageTimestampMs(message);
    if (timestampMs !== null) {
      signatures.push(`content-time:${normalizedContent}::${timestampMs}`);
    }
    return signatures;
  };
  const hasKnownSignature = (
    signatures: readonly string[],
    known: ReadonlySet<string>,
  ): boolean => signatures.some((signature) => known.has(signature));
  const addSignatures = (signatures: readonly string[], known: Set<string>) => {
    for (const signature of signatures) {
      known.add(signature);
    }
  };
  const fallbackUserMessages: Message[] = [];
  const seenFallbackUserSignatures = new Set<string>();
  for (const candidate of [
    ...hydrateSessionDetailMessagesFromThreadItems(detail, topicId),
    ...hydrateSessionDetailMessagesFromTurns(detail, topicId),
  ]) {
    if (candidate.role !== "user") {
      continue;
    }
    const signatures = buildFallbackUserSignatures(candidate);
    if (hasKnownSignature(signatures, seenFallbackUserSignatures)) {
      continue;
    }
    addSignatures(signatures, seenFallbackUserSignatures);
    fallbackUserMessages.push(candidate);
  }
  if (fallbackUserMessages.length === 0) {
    return messages;
  }

  const knownUserSignatures = new Set(
    messages
      .filter((message) => message.role === "user")
      .flatMap(buildFallbackUserSignatures),
  );
  const uniqueFallbackUserMessages = fallbackUserMessages.filter(
    (fallbackMessage) => {
      const signatures = buildFallbackUserSignatures(fallbackMessage);
      if (hasKnownSignature(signatures, knownUserSignatures)) {
        return false;
      }
      addSignatures(signatures, knownUserSignatures);
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
