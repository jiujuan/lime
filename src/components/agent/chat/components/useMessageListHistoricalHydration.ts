import { useCallback, useEffect, useMemo, useState } from "react";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import {
  buildHistoricalMarkdownHydrationIndexByMessageId,
  buildHistoricalMarkdownHydrationTargets,
  countDeferredHistoricalContentParts,
  countDeferredHistoricalMarkdown,
  shouldDeferHistoricalAssistantMessageDetails as shouldDeferHistoricalAssistantMessageDetailsProjection,
} from "../projection/historicalMessageHydrationProjection";
import type { Message } from "../types";
import {
  MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_BATCH_SIZE,
  MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_DELAY_MS,
  MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_INITIAL_COUNT,
} from "./messageListConstants";
import { measureMessageListComputation } from "./messageListPerformance";

interface UseMessageListHistoricalHydrationOptions {
  activeCurrentTurnId: string | null;
  focusedTimelineItemId: string | null;
  isHistoricalTimelineReady: boolean;
  isRestoredHistoryWindow: boolean;
  isSending: boolean;
  renderedMessages: Message[];
}

export function useMessageListHistoricalHydration({
  activeCurrentTurnId,
  focusedTimelineItemId,
  isHistoricalTimelineReady,
  isRestoredHistoryWindow,
  isSending,
  renderedMessages,
}: UseMessageListHistoricalHydrationOptions) {
  const historicalMessageHydrationState = useMemo(
    () => ({
      activeCurrentTurnId,
      focusedTimelineItemId,
      isRestoredHistoryWindow,
      isSending,
    }),
    [
      activeCurrentTurnId,
      focusedTimelineItemId,
      isRestoredHistoryWindow,
      isSending,
    ],
  );
  const historicalMarkdownHydrationTargetsMeasurement = useMemo(
    () =>
      measureMessageListComputation(() =>
        buildHistoricalMarkdownHydrationTargets({
          messages: renderedMessages,
          state: historicalMessageHydrationState,
        }),
      ),
    [historicalMessageHydrationState, renderedMessages],
  );
  const historicalMarkdownHydrationTargets =
    historicalMarkdownHydrationTargetsMeasurement.value;
  const historicalMarkdownHydrationKey =
    historicalMarkdownHydrationTargets.join("|");
  const [hydratedHistoricalMarkdownCount, setHydratedHistoricalMarkdownCount] =
    useState(0);

  useEffect(() => {
    const total = historicalMarkdownHydrationTargets.length;
    if (!isRestoredHistoryWindow || !isHistoricalTimelineReady || total <= 0) {
      setHydratedHistoricalMarkdownCount(0);
      return;
    }

    setHydratedHistoricalMarkdownCount((current) => {
      const clampedCurrent = Math.min(current, total);
      if (clampedCurrent > 0) {
        return clampedCurrent;
      }
      return Math.min(
        total,
        MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_INITIAL_COUNT,
      );
    });
  }, [
    historicalMarkdownHydrationKey,
    historicalMarkdownHydrationTargets.length,
    isHistoricalTimelineReady,
    isRestoredHistoryWindow,
  ]);

  useEffect(() => {
    const total = historicalMarkdownHydrationTargets.length;
    if (
      !isRestoredHistoryWindow ||
      !isHistoricalTimelineReady ||
      hydratedHistoricalMarkdownCount >= total
    ) {
      return;
    }

    return scheduleMinimumDelayIdleTask(
      () => {
        setHydratedHistoricalMarkdownCount((current) =>
          Math.min(
            total,
            Math.max(
              current,
              MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_INITIAL_COUNT,
            ) + MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_BATCH_SIZE,
          ),
        );
      },
      {
        minimumDelayMs: MESSAGE_LIST_RESTORED_MARKDOWN_HYDRATION_DELAY_MS,
        idleTimeoutMs: 700,
      },
    );
  }, [
    hydratedHistoricalMarkdownCount,
    historicalMarkdownHydrationKey,
    historicalMarkdownHydrationTargets.length,
    isHistoricalTimelineReady,
    isRestoredHistoryWindow,
  ]);

  const historicalMarkdownHydrationIndexByMessageId = useMemo(
    () =>
      buildHistoricalMarkdownHydrationIndexByMessageId(
        historicalMarkdownHydrationTargets,
      ),
    [historicalMarkdownHydrationTargets],
  );
  const shouldDeferHistoricalAssistantMessageDetails = useCallback(
    (message: Message): boolean =>
      shouldDeferHistoricalAssistantMessageDetailsProjection({
        message,
        state: historicalMessageHydrationState,
        isHistoricalTimelineReady,
        hydrationIndexByMessageId: historicalMarkdownHydrationIndexByMessageId,
        hydratedHistoricalMarkdownCount,
      }),
    [
      hydratedHistoricalMarkdownCount,
      historicalMarkdownHydrationIndexByMessageId,
      historicalMessageHydrationState,
      isHistoricalTimelineReady,
    ],
  );
  const historicalContentPartsDeferredMeasurement = useMemo(
    () =>
      measureMessageListComputation(() =>
        countDeferredHistoricalContentParts({
          messages: renderedMessages,
          state: historicalMessageHydrationState,
          isHistoricalTimelineReady,
          hydrationIndexByMessageId:
            historicalMarkdownHydrationIndexByMessageId,
          hydratedHistoricalMarkdownCount,
        }),
      ),
    [
      hydratedHistoricalMarkdownCount,
      historicalMarkdownHydrationIndexByMessageId,
      historicalMessageHydrationState,
      isHistoricalTimelineReady,
      renderedMessages,
    ],
  );
  const historicalContentPartsDeferredCount =
    historicalContentPartsDeferredMeasurement.value;
  const historicalMarkdownDeferredCount = countDeferredHistoricalMarkdown({
    isRestoredHistoryWindow,
    targetCount: historicalMarkdownHydrationTargets.length,
    hydratedHistoricalMarkdownCount,
  });

  return {
    historicalContentPartsDeferredCount,
    historicalContentPartsDeferredMeasurement,
    historicalMarkdownDeferredCount,
    historicalMarkdownHydrationTargets,
    historicalMarkdownHydrationTargetsMeasurement,
    hydratedHistoricalMarkdownCount,
    shouldDeferHistoricalAssistantMessageDetails,
  };
}
