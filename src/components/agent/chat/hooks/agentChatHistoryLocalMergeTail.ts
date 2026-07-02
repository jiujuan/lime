import type { Message } from "../types";
import { resolveMessageTimestampMs } from "./agentChatHistorySignatures";
import { hasRetainableLocalMessageState } from "./agentChatHistoryLocalMergeState";

export interface CollectRetainedLocalTailOptions {
  hydratedMessageIds: Set<string>;
  lastHydratedMessage: Message | null;
  lastMatchedLocalIndex: number;
  lastMatchedLocalMessage: Message | null;
  localMessages: Message[];
  matchedLocalMessageIds: Set<string>;
}

export function collectRetainedLocalTail(
  options: CollectRetainedLocalTailOptions,
): Message[] {
  if (options.localMessages.length === 0) {
    return [];
  }

  const lastHydratedTimestampMs = options.lastHydratedMessage
    ? resolveMessageTimestampMs(options.lastHydratedMessage)
    : null;

  return options.localMessages.filter((message, index) => {
    if (options.hydratedMessageIds.has(message.id)) {
      return false;
    }
    if (options.matchedLocalMessageIds.has(message.id)) {
      return false;
    }
    if (index <= options.lastMatchedLocalIndex) {
      return false;
    }
    if (!hasRetainableLocalMessageState(message)) {
      return false;
    }

    const shouldRetainAssistantTailAfterHydratedUser =
      message.role === "assistant" &&
      options.lastHydratedMessage?.role === "user" &&
      options.lastMatchedLocalMessage?.role === "user";
    if (shouldRetainAssistantTailAfterHydratedUser) {
      return true;
    }

    const localTimestampMs = resolveMessageTimestampMs(message);
    if (lastHydratedTimestampMs === null || localTimestampMs === null) {
      return true;
    }

    return localTimestampMs >= lastHydratedTimestampMs;
  });
}
