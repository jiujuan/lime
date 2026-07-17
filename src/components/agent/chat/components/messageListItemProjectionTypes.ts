import type { AgentStreamTextOverlaySnapshot } from "../hooks/agentStreamTextOverlayStore";
import type { MessageListRenderGroup } from "./MessageList.types";
import type { Message, PendingA2UISource } from "../types";

export interface ResolveMessageListItemProjectionOptions {
  activeCurrentTurnId: string | null;
  activePendingA2UISource: PendingA2UISource | null;
  canOpenSavedSiteContent: boolean;
  expandedHistoricalAssistantMessageIds: Set<string>;
  expandedLongHistoricalMessageIds: Set<string>;
  focusedTimelineItemId?: string | null;
  group: MessageListRenderGroup;
  hasActiveInteractiveRuntime: boolean;
  isRestoredHistoryWindow: boolean;
  isSending: boolean;
  lastAssistantMessageId: string | null;
  message: Message;
  shouldDeferHistoricalAssistantMessageDetails: (message: Message) => boolean;
  shouldDeferThreadItemsScan: boolean;
  streamingTextOverlay?: AgentStreamTextOverlaySnapshot | null;
}
