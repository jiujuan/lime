import type { Message } from "../types";

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

function normalizeRuntimeTurnId(message: Message): string | null {
  const normalized = message.runtimeTurnId?.trim();
  return normalized || null;
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

function getGroupRuntimeTurnId(group: MessageTurnGroup): string | null {
  if (group.userMessage) {
    return normalizeRuntimeTurnId(group.userMessage);
  }
  for (const message of group.messages) {
    const runtimeTurnId = normalizeRuntimeTurnId(message);
    if (runtimeTurnId) {
      return runtimeTurnId;
    }
  }
  return null;
}

export function buildMessageTurnGroups(
  messages: Message[],
): MessageTurnGroup[] {
  const groups: MessageTurnGroup[] = [];
  const groupByRuntimeTurnId = new Map<string, MessageTurnGroup>();
  let current: MessageTurnGroup | null = null;

  for (const message of messages) {
    const runtimeTurnId = normalizeRuntimeTurnId(message);

    if (message.role === "assistant" && runtimeTurnId) {
      const runtimeGroup = groupByRuntimeTurnId.get(runtimeTurnId);
      if (runtimeGroup) {
        appendMessageToGroup(runtimeGroup, message);
        continue;
      }
    }

    if (!current) {
      current = createGroup(message);
      if (runtimeTurnId) {
        groupByRuntimeTurnId.set(runtimeTurnId, current);
      }
      continue;
    }

    if (message.role === "user") {
      if (runtimeTurnId) {
        const runtimeGroup = groupByRuntimeTurnId.get(runtimeTurnId);
        if (runtimeGroup) {
          appendMessageToGroup(runtimeGroup, message);
          continue;
        }
      }
      groups.push(current);
      current = createGroup(message);
      if (runtimeTurnId) {
        groupByRuntimeTurnId.set(runtimeTurnId, current);
      }
      continue;
    }

    if (runtimeTurnId) {
      const currentRuntimeTurnId = getGroupRuntimeTurnId(current);
      if (currentRuntimeTurnId && currentRuntimeTurnId !== runtimeTurnId) {
        groups.push(current);
        current = createGroup(message);
        groupByRuntimeTurnId.set(runtimeTurnId, current);
        continue;
      }
    }

    appendMessageToGroup(current, message);
    if (runtimeTurnId) {
      groupByRuntimeTurnId.set(runtimeTurnId, current);
    }
  }

  if (current) {
    groups.push(current);
  }

  return groups;
}
