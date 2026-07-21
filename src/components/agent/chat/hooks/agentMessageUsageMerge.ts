import type { Message } from "../types";

type AssistantUsageByRuntimeTurnId = ReadonlyMap<
  string,
  NonNullable<Message["usage"]>
>;

export function preserveAssistantMessageUsage(
  previousMessages: Message[],
  nextMessages: Message[],
  rememberedUsageByRuntimeTurnId?: AssistantUsageByRuntimeTurnId,
): Message[] {
  const usageByMessageId = new Map<string, NonNullable<Message["usage"]>>();
  const usageByRuntimeTurnId = new Map<string, NonNullable<Message["usage"]>>();
  const usageByImageTaskId = new Map<string, NonNullable<Message["usage"]>>();

  previousMessages.forEach((message) => {
    if (message.role !== "assistant" || !message.usage) {
      return;
    }
    if (message.id) {
      usageByMessageId.set(message.id, message.usage);
    }
    const runtimeTurnId = message.runtimeTurnId?.trim();
    if (runtimeTurnId) {
      usageByRuntimeTurnId.set(runtimeTurnId, message.usage);
    }
    const taskId = message.imageWorkbenchPreview?.taskId?.trim();
    if (taskId) {
      usageByImageTaskId.set(taskId, message.usage);
    }
  });

  if (
    usageByMessageId.size === 0 &&
    usageByRuntimeTurnId.size === 0 &&
    usageByImageTaskId.size === 0 &&
    !rememberedUsageByRuntimeTurnId?.size
  ) {
    return nextMessages;
  }

  let changed = false;
  const mergedMessages = nextMessages.map((message) => {
    if (message.role !== "assistant" || message.usage) {
      return message;
    }
    const runtimeTurnId = message.runtimeTurnId?.trim();
    const usage =
      (runtimeTurnId ? usageByRuntimeTurnId.get(runtimeTurnId) : undefined) ??
      (runtimeTurnId
        ? rememberedUsageByRuntimeTurnId?.get(runtimeTurnId)
        : undefined) ??
      (message.imageWorkbenchPreview?.taskId
        ? usageByImageTaskId.get(message.imageWorkbenchPreview.taskId)
        : undefined) ??
      usageByMessageId.get(message.id);
    if (!usage) {
      return message;
    }
    changed = true;
    return { ...message, usage };
  });

  return changed ? mergedMessages : nextMessages;
}

export function applyAssistantTurnUsage(
  messages: Message[],
  runtimeTurnId: string,
  usage: NonNullable<Message["usage"]>,
): Message[] {
  const normalizedRuntimeTurnId = runtimeTurnId.trim();
  if (!normalizedRuntimeTurnId) {
    return messages;
  }

  let changed = false;
  const nextMessages = messages.map((message) => {
    if (
      message.role !== "assistant" ||
      message.runtimeTurnId?.trim() !== normalizedRuntimeTurnId ||
      message.usage === usage
    ) {
      return message;
    }
    changed = true;
    return { ...message, usage };
  });
  return changed ? nextMessages : messages;
}
