import type { ActionRequired, Message } from "../types";

export function collectCurrentAssistantTail(messages: readonly Message[]) {
  const tail: Message[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") {
      break;
    }

    if (message.role === "assistant") {
      tail.unshift(message);
    }
  }

  return tail;
}

function collectTailMessageIds(messages: readonly Message[]) {
  return new Set(collectCurrentAssistantTail(messages).map((msg) => msg.id));
}

export function findActionRequestSourceMessageId(
  messages: readonly Message[],
  requestId: string,
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message.role === "assistant" &&
      message.actionRequests?.some((request) => request.requestId === requestId)
    ) {
      return message.id;
    }
  }

  return null;
}

export function isActionRequestInCurrentAssistantTail(
  action: ActionRequired,
  messages: readonly Message[],
): boolean {
  const tail = collectCurrentAssistantTail(messages);
  if (tail.length === 0) {
    return false;
  }

  const sourceMessageId = action.sourceMessageId?.trim();
  if (sourceMessageId) {
    return tail.some((message) => message.id === sourceMessageId);
  }

  const scopedTurnId = action.scope?.turnId?.trim();
  if (scopedTurnId) {
    return tail.some(
      (message) =>
        message.runtimeTurnId === scopedTurnId ||
        message.actionRequests?.some(
          (request) => request.requestId === action.requestId,
        ),
    );
  }

  return tail.some((message) =>
    message.actionRequests?.some(
      (request) => request.requestId === action.requestId,
    ),
  );
}

export function filterActionsForCurrentAssistantTail(
  actions: readonly ActionRequired[],
  messages: readonly Message[],
  options: { keepUnscoped?: boolean } = {},
): ActionRequired[] {
  if (actions.length === 0) {
    return [];
  }

  const currentTailMessageIds = collectTailMessageIds(messages);
  if (currentTailMessageIds.size === 0) {
    return options.keepUnscoped
      ? actions.filter(
          (action) => !action.sourceMessageId?.trim() && !action.scope?.turnId,
        )
      : [];
  }

  return actions.filter((action) => {
    const sourceMessageId = action.sourceMessageId?.trim();
    if (sourceMessageId) {
      return currentTailMessageIds.has(sourceMessageId);
    }

    const matchedCurrentTail = isActionRequestInCurrentAssistantTail(
      action,
      messages,
    );
    if (matchedCurrentTail) {
      return true;
    }

    return options.keepUnscoped && !action.scope?.turnId;
  });
}
