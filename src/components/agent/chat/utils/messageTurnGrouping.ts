import type { Message } from "../types";
import { projectConversationMessagesByRuntimeTurn } from "./conversationTimelineOrdering";

export interface MessageTurnGroup {
  id: string;
  messages: Message[];
  userMessage: Message | null;
  assistantMessages: Message[];
  startedAt: Date;
  endedAt: Date;
}

function createGroup(seed: Message): MessageTurnGroup {
  return {
    id: `turn-group:${seed.id}`,
    messages: [seed],
    userMessage: seed.role === "user" ? seed : null,
    assistantMessages: seed.role === "assistant" ? [seed] : [],
    startedAt: seed.timestamp,
    endedAt: seed.timestamp,
  };
}

function refreshGroupRange(group: MessageTurnGroup, message: Message) {
  if (message.timestamp < group.startedAt) {
    group.startedAt = message.timestamp;
  }
  if (message.timestamp > group.endedAt) {
    group.endedAt = message.timestamp;
  }
}

function appendMessageToGroup(group: MessageTurnGroup, message: Message) {
  if (message.role === "user") {
    if (!group.userMessage) {
      group.userMessage = message;
      const firstAssistantIndex = group.messages.findIndex(
        (candidate) => candidate.role === "assistant",
      );
      if (firstAssistantIndex >= 0) {
        group.messages.splice(firstAssistantIndex, 0, message);
      } else {
        group.messages.push(message);
      }
    } else {
      group.messages.push(message);
    }
  } else {
    group.messages.push(message);
    group.assistantMessages.push(message);
  }
  refreshGroupRange(group, message);
}

export function buildMessageTurnGroups(
  messages: Message[],
): MessageTurnGroup[] {
  const groups: MessageTurnGroup[] = [];
  let current: MessageTurnGroup | null = null;

  for (const message of projectConversationMessagesByRuntimeTurn(messages)) {
    if (!current) {
      current = createGroup(message);
      continue;
    }

    if (message.role === "user") {
      groups.push(current);
      current = createGroup(message);
      continue;
    }

    appendMessageToGroup(current, message);
  }

  if (current) {
    groups.push(current);
  }

  return groups;
}
