import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import {
  buildConversationMessageRenderWindowProjection,
  filterVisibleConversationMessages,
  resolveConversationMessageRenderWindowSettings,
  resolveInitialConversationRenderedMessageCount,
  shouldUseConversationProgressiveRender,
} from "../projection/messageRenderWindowProjection";
import type { Message } from "../types";
import { MESSAGE_LIST_RENDER_WINDOW_SETTINGS } from "./messageListConstants";

interface UseMessageListRenderWindowOptions {
  isSending: boolean;
  isRestoringSession: boolean;
  isUserScrolling: boolean;
  messages: Message[];
  sessionHistoryWindow: {
    loadedMessages: number;
    totalMessages: number;
    isLoadingFull: boolean;
    error?: string | null;
  } | null;
}

export function useMessageListRenderWindow({
  isSending,
  isRestoringSession,
  isUserScrolling,
  messages,
  sessionHistoryWindow,
}: UseMessageListRenderWindowOptions) {
  const visibleMessages = useMemo(
    () => filterVisibleConversationMessages(messages),
    [messages],
  );
  const visibleMessageFirstId = visibleMessages[0]?.id ?? null;
  const visibleMessageLastId =
    visibleMessages[visibleMessages.length - 1]?.id ?? null;
  const persistedHiddenHistoryCount =
    sessionHistoryWindow &&
    sessionHistoryWindow.totalMessages > sessionHistoryWindow.loadedMessages
      ? sessionHistoryWindow.totalMessages - sessionHistoryWindow.loadedMessages
      : 0;
  const isRestoredHistoryWindow =
    isRestoringSession || persistedHiddenHistoryCount > 0;
  const [restoredPromptCacheNoticeReady, setRestoredPromptCacheNoticeReady] =
    useState(() => !isRestoredHistoryWindow);

  useEffect(() => {
    if (!isRestoredHistoryWindow) {
      setRestoredPromptCacheNoticeReady(true);
      return;
    }

    setRestoredPromptCacheNoticeReady(false);
    return scheduleMinimumDelayIdleTask(
      () => {
        setRestoredPromptCacheNoticeReady(true);
      },
      {
        minimumDelayMs: 1_500,
        idleTimeoutMs: 3_000,
      },
    );
  }, [isRestoredHistoryWindow, visibleMessageFirstId, visibleMessageLastId]);

  const messageRenderWindowSettings =
    resolveConversationMessageRenderWindowSettings(
      MESSAGE_LIST_RENDER_WINDOW_SETTINGS,
      isRestoredHistoryWindow,
    );
  const progressiveInitialRenderCount =
    messageRenderWindowSettings.initialRenderCount;
  const progressiveRenderBatchSize =
    messageRenderWindowSettings.renderBatchSize;
  const progressiveRenderMinimumDelayMs =
    messageRenderWindowSettings.minimumDelayMs;
  const shouldUseProgressiveRender = shouldUseConversationProgressiveRender({
    isSending,
    isRestoredHistoryWindow,
    visibleMessageCount: visibleMessages.length,
    settings: messageRenderWindowSettings,
  });
  const visibleMessageWindowRef = useRef<{
    firstId: string | null;
    lastId: string | null;
    length: number;
  } | null>(null);
  const [renderedMessageCount, setRenderedMessageCount] = useState(() =>
    resolveInitialConversationRenderedMessageCount({
      isSending,
      isRestoredHistoryWindow,
      visibleMessageCount: visibleMessages.length,
      settings: messageRenderWindowSettings,
    }),
  );

  useEffect(() => {
    const previousWindow = visibleMessageWindowRef.current;
    visibleMessageWindowRef.current = {
      firstId: visibleMessageFirstId,
      lastId: visibleMessageLastId,
      length: visibleMessages.length,
    };

    if (!shouldUseProgressiveRender) {
      setRenderedMessageCount(visibleMessages.length);
      return;
    }

    const isAppendOnlyUpdate =
      previousWindow !== null &&
      previousWindow.firstId === visibleMessageFirstId &&
      previousWindow.length <= visibleMessages.length &&
      previousWindow.lastId !== visibleMessageLastId;

    if (!isAppendOnlyUpdate) {
      setRenderedMessageCount(
        Math.min(visibleMessages.length, progressiveInitialRenderCount),
      );
      return;
    }

    const appendedCount = visibleMessages.length - previousWindow.length;
    if (appendedCount <= 0) {
      return;
    }

    setRenderedMessageCount((current) =>
      Math.min(
        visibleMessages.length,
        Math.max(current + appendedCount, progressiveInitialRenderCount),
      ),
    );
  }, [
    progressiveInitialRenderCount,
    shouldUseProgressiveRender,
    visibleMessageFirstId,
    visibleMessageLastId,
    visibleMessages.length,
  ]);

  const messageRenderWindow = useMemo(
    () =>
      buildConversationMessageRenderWindowProjection({
        visibleMessages,
        renderedMessageCount,
        isSending,
        isRestoredHistoryWindow,
        settings: messageRenderWindowSettings,
      }),
    [
      isRestoredHistoryWindow,
      isSending,
      messageRenderWindowSettings,
      renderedMessageCount,
      visibleMessages,
    ],
  );
  const hiddenHistoryCount = messageRenderWindow.hiddenHistoryCount;
  const shouldAutoHydrateHiddenHistory =
    messageRenderWindow.shouldAutoHydrateHiddenHistory;

  useEffect(() => {
    if (
      !shouldAutoHydrateHiddenHistory ||
      hiddenHistoryCount <= 0 ||
      isUserScrolling
    ) {
      return;
    }

    return scheduleMinimumDelayIdleTask(
      () => {
        setRenderedMessageCount((current) =>
          Math.min(
            visibleMessages.length,
            current + progressiveRenderBatchSize,
          ),
        );
      },
      {
        minimumDelayMs: progressiveRenderMinimumDelayMs,
        idleTimeoutMs: 1_200,
      },
    );
  }, [
    hiddenHistoryCount,
    isUserScrolling,
    progressiveRenderBatchSize,
    progressiveRenderMinimumDelayMs,
    shouldAutoHydrateHiddenHistory,
    visibleMessages.length,
  ]);

  const renderedMessages = messageRenderWindow.renderedMessages;
  const renderedAssistantMessageCount = useMemo(
    () =>
      renderedMessages.reduce(
        (count, message) => count + (message.role === "assistant" ? 1 : 0),
        0,
      ),
    [renderedMessages],
  );
  const handleExpandAllHistory = useCallback(() => {
    setRenderedMessageCount(visibleMessages.length);
  }, [visibleMessages.length]);

  return {
    handleExpandAllHistory,
    hiddenHistoryCount,
    isRestoredHistoryWindow,
    persistedHiddenHistoryCount,
    progressiveInitialRenderCount,
    renderedAssistantMessageCount,
    renderedMessageCount,
    renderedMessages,
    restoredPromptCacheNoticeReady,
    visibleMessages,
  };
}
