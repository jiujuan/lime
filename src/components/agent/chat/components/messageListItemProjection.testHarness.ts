import { resolveMessageListItemProjection } from "./messageListItemProjection";
import type { AgentStreamTextOverlaySnapshot } from "../hooks/agentStreamTextOverlayStore";
import type { AgentThreadTurn, Message, PendingA2UISource } from "../types";

export type ProjectionTimelineItems = NonNullable<
  NonNullable<
    Parameters<typeof resolveMessageListItemProjection>[0]["group"]["timeline"]
  >["items"]
>;

export interface BuildProjectionOptions {
  activePendingA2UISource?: PendingA2UISource | null;
  hasActiveInteractiveRuntime?: boolean;
  isRestoredHistoryWindow?: boolean;
  isSending?: boolean;
  lastAssistantMessageId?: string | null;
  shouldDeferMessageDetails?: boolean;
  streamingTextOverlay?: AgentStreamTextOverlaySnapshot | null;
  timelineMessageId?: string | null;
  lastAssistantId?: string | null;
  turnId?: string;
  turnStatus?: AgentThreadTurn["status"] | "queued";
}

export function buildProjection(
  message: Message,
  timelineItems: ProjectionTimelineItems | null = null,
  options: BuildProjectionOptions = {},
) {
  const turnId = options.turnId ?? "turn-legacy-unphased-final";
  return resolveMessageListItemProjection({
    activeCurrentTurnId: null,
    activePendingA2UISource: options.activePendingA2UISource ?? null,
    canOpenSavedSiteContent: false,
    expandedHistoricalAssistantMessageIds: new Set(),
    expandedLongHistoricalMessageIds: new Set(),
    group: {
      lastAssistantId: options.lastAssistantId ?? message.id,
      timelineMessageId: options.timelineMessageId ?? undefined,
      timeline: timelineItems
        ? ({
            turn: {
              id: turnId,
              status: options.turnStatus ?? "completed",
            },
            items: timelineItems,
          } as never)
        : null,
    } as never,
    hasActiveInteractiveRuntime: options.hasActiveInteractiveRuntime ?? true,
    isRestoredHistoryWindow: options.isRestoredHistoryWindow ?? false,
    isSending: options.isSending ?? true,
    lastAssistantMessageId: options.lastAssistantMessageId ?? message.id,
    message,
    shouldDeferHistoricalAssistantMessageDetails: () =>
      options.shouldDeferMessageDetails ?? false,
    shouldDeferThreadItemsScan: false,
    streamingTextOverlay: options.streamingTextOverlay ?? null,
  });
}

export type { Message };
