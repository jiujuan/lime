import { resolveMessageListItemProjection } from "./messageListItemProjection";
import type { AgentStreamTextOverlaySnapshot } from "../hooks/agentStreamTextOverlayStore";
import type { Message, PendingA2UISource } from "../types";

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
  turnId?: string;
  turnStatus?: "queued" | "running" | "completed" | "failed" | "aborted";
}

export function buildProjection(
  message: Message,
  timelineItems: ProjectionTimelineItems | null = null,
  options: BuildProjectionOptions = {},
) {
  return resolveMessageListItemProjection({
    activeCurrentTurnId: null,
    activePendingA2UISource: options.activePendingA2UISource ?? null,
    canOpenSavedSiteContent: false,
    expandedHistoricalAssistantMessageIds: new Set(),
    expandedHistoricalTimelineKeys: new Set(),
    expandedLongHistoricalMessageIds: new Set(),
    group: {
      lastAssistantId: message.id,
      timeline: timelineItems
        ? ({
            turn: {
              id: options.turnId ?? "turn-legacy-unphased-final",
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
