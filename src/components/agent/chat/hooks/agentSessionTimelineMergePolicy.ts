import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import {
  filterConversationThreadItems,
  mergeThreadItems,
} from "../utils/threadTimelineView";

export type AgentSessionDetailMergeMode =
  | "history_hydrate"
  | "runtime_sync"
  | "terminal_reconcile";

export interface AgentSessionTimelineMergeDecision {
  mode: AgentSessionDetailMergeMode;
  hasIncomingTerminalTimeline: boolean;
  isLocalTimelineCompatible: boolean;
  shouldPreserveByRuntimeSync: boolean;
  shouldPreserveBySession: boolean;
  shouldIgnoreIncompatibleHydratedMessages: boolean;
}

export function normalizeAgentSessionDetailMergeMode(
  mode?: AgentSessionDetailMergeMode | null,
): AgentSessionDetailMergeMode {
  return mode ?? "history_hydrate";
}

function normalizeConversationText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstUserMessageText(messages: Message[]): string {
  return normalizeConversationText(
    messages.find((message) => message.role === "user")?.content || "",
  );
}

function userMessageTexts(messages: Message[]): string[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => normalizeConversationText(message.content || ""));
}

function areConversationTextsCompatible(left: string, right: string): boolean {
  if (!left || !right) {
    return true;
  }

  return left === right || left.includes(right) || right.includes(left);
}

export function isLocalTimelineCompatibleWithHydratedMessages(params: {
  hydratedMessages: Message[];
  localMessages: Message[];
}): boolean {
  const hydratedUserTexts = userMessageTexts(params.hydratedMessages);
  const localUserTexts = userMessageTexts(params.localMessages);
  if (hydratedUserTexts.length === 0 || localUserTexts.length === 0) {
    return true;
  }

  const compareCount = Math.min(
    hydratedUserTexts.length,
    localUserTexts.length,
  );
  for (let index = 0; index < compareCount; index += 1) {
    if (
      !areConversationTextsCompatible(
        localUserTexts[index] || "",
        hydratedUserTexts[index] || "",
      )
    ) {
      return false;
    }
  }

  return true;
}

function hasAssistantProcessSnapshot(messages: Message[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      (Boolean(message.thinkingContent?.trim()) ||
        Boolean(message.contentParts?.some((part) => part.type !== "text")) ||
        Boolean(message.runtimeTurnId?.trim().startsWith("skill-exec-")) ||
        message.inlineProcessRetention === "skill"),
  );
}

export function shouldPreserveDetachedLocalSnapshot(params: {
  hydratedMessages: Message[];
  localMessages: Message[];
  sessionId: string | null;
}): boolean {
  if (
    params.sessionId !== null ||
    !hasAssistantProcessSnapshot(params.localMessages)
  ) {
    return false;
  }

  const localUserText = firstUserMessageText(params.localMessages);
  const hydratedUserText = firstUserMessageText(params.hydratedMessages);
  if (!localUserText || !hydratedUserText) {
    return false;
  }

  return areConversationTextsCompatible(localUserText, hydratedUserText);
}

export function mergeRuntimeSyncThreadItems(
  localItems: AgentThreadItem[],
  incomingItems: AgentThreadItem[],
): AgentThreadItem[] {
  const localItemById = new Map(localItems.map((item) => [item.id, item]));
  return filterConversationThreadItems(
    mergeThreadItems(localItems, incomingItems),
  ).map((item) => {
    const localItem = localItemById.get(item.id);
    if (item.type !== "agent_message" || localItem?.type !== "agent_message") {
      return item;
    }

    const localText = localItem.text.trim();
    const incomingText = item.text.trim();
    if (
      !localText ||
      (incomingText && !localText.includes(incomingText)) ||
      incomingText.length >= localText.length
    ) {
      return item;
    }

    return {
      ...item,
      text: localItem.text,
    };
  });
}

export function hasTerminalDetailTimeline(detail: {
  thread_read?: AgentRuntimeThreadReadModel | null;
  turns?: AgentThreadTurn[];
}): boolean {
  const activeStatuses = new Set([
    "idle",
    "queued",
    "running",
    "waiting_request",
  ]);
  const normalizedThreadReadStatus = (detail.thread_read?.status || "")
    .trim()
    .toLowerCase();
  if (
    normalizedThreadReadStatus &&
    !activeStatuses.has(normalizedThreadReadStatus)
  ) {
    return true;
  }

  return (detail.turns || []).some((turn) => {
    const normalizedTurnStatus = (turn.status || "").trim().toLowerCase();
    return (
      Boolean(normalizedTurnStatus) && !activeStatuses.has(normalizedTurnStatus)
    );
  });
}

export function resolveAgentSessionTimelineMergeDecision(params: {
  mode?: AgentSessionDetailMergeMode | null;
  mayPreserveExistingTimelineBySession: boolean;
  hydratedMessagesForCompatibility: Message[];
  localMessages: Message[];
  threadRead?: AgentRuntimeThreadReadModel | null;
  incomingTurns: AgentThreadTurn[];
}): AgentSessionTimelineMergeDecision {
  const mode = normalizeAgentSessionDetailMergeMode(params.mode);
  const hasIncomingTerminalTimeline = hasTerminalDetailTimeline({
    thread_read: params.threadRead,
    turns: params.incomingTurns,
  });
  const isLocalTimelineCompatible =
    isLocalTimelineCompatibleWithHydratedMessages({
      hydratedMessages: params.hydratedMessagesForCompatibility,
      localMessages: params.localMessages,
    });
  const shouldPreserveByRuntimeSync =
    params.mayPreserveExistingTimelineBySession &&
    mode === "runtime_sync" &&
    !hasIncomingTerminalTimeline;
  const shouldPreserveBySession =
    shouldPreserveByRuntimeSync ||
    (params.mayPreserveExistingTimelineBySession && isLocalTimelineCompatible);

  return {
    mode,
    hasIncomingTerminalTimeline,
    isLocalTimelineCompatible,
    shouldPreserveByRuntimeSync,
    shouldPreserveBySession,
    shouldIgnoreIncompatibleHydratedMessages:
      shouldPreserveByRuntimeSync && !isLocalTimelineCompatible,
  };
}
