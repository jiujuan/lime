import type { Message } from "../types";
import type { Topic } from "./agentChatShared";

type AutoTitleMessage = Pick<Message, "role" | "content">;

const AUTO_TITLE_PLACEHOLDER_TITLES = new Set([
  "",
  "未命名",
  "未命名对话",
  "新任务",
  "新话题",
  "新对话",
]);

export function isAutoTitlePlaceholder(
  title: string | null | undefined,
): boolean {
  return AUTO_TITLE_PLACEHOLDER_TITLES.has(title?.trim() ?? "");
}

export function isPreviewDerivedTitle(
  title: string | null | undefined,
  messages: AutoTitleMessage[],
): boolean {
  const normalizedTitle = title?.trim();
  if (!normalizedTitle) {
    return false;
  }

  const firstAssistantMessage = messages.find(
    (message) =>
      message.role === "assistant" &&
      typeof message.content === "string" &&
      message.content.trim().length > 0,
  );
  if (!firstAssistantMessage) {
    return false;
  }

  const normalizedMessage = firstAssistantMessage.content.trim();
  const messagePrefix = normalizedMessage.slice(
    0,
    Math.max(16, normalizedTitle.length),
  );
  return (
    normalizedMessage.startsWith(normalizedTitle) ||
    normalizedTitle.startsWith(messagePrefix)
  );
}

export function shouldGenerateAutoTitle(params: {
  activeSessionTitle: string | null;
  messages: AutoTitleMessage[];
}): boolean {
  return (
    isAutoTitlePlaceholder(params.activeSessionTitle) ||
    isPreviewDerivedTitle(params.activeSessionTitle, params.messages)
  );
}

export function hasUserTextMessage(messages: AutoTitleMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "user" &&
      typeof message.content === "string" &&
      message.content.trim().length > 0,
  );
}

export function buildAutoTitleConversationText(
  messages: AutoTitleMessage[],
): string {
  return messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
    .map((message) => `${message.role}：${message.content}`)
    .join("\n")
    .slice(-1000);
}

export function applyGeneratedAutoTitleToTopics(
  topics: Topic[],
  sessionId: string,
  generatedTitle: string | null | undefined,
): Topic[] {
  const normalizedTitle = generatedTitle?.trim();
  if (!sessionId || !normalizedTitle) {
    return topics;
  }

  let changed = false;
  const nextTopics = topics.map((topic) => {
    if (topic.id !== sessionId) {
      return topic;
    }
    if (topic.title === normalizedTitle) {
      return topic;
    }

    changed = true;
    return {
      ...topic,
      title: normalizedTitle,
    };
  });

  return changed ? nextTopics : topics;
}
