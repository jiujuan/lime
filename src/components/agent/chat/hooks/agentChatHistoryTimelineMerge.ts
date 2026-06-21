import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import type { Message } from "../types";
import { mergeAdjacentAssistantMessages } from "./agentChatHistoryAdjacentMerge";
import { contentPartContainsProcess } from "./agentChatHistoryProcess";
import { dedupeAdjacentHistoryMessages, messageImageSignature, resolveMessageTimestampMs } from "./agentChatHistorySignatures";
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
