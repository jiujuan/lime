import { useEffect, useRef } from "react";
import { recordAgentUiPerformanceMetric } from "@/lib/agentUiPerformanceMetrics";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime/sessionTypes";
import {
  buildHistoricalHydrationProjectionEvents,
} from "../projection/historicalMessageHydrationProjection";
import { recordAgentUiProjectionEvents } from "../projection/conversationProjectionStore";
import type { Message } from "../types";
import type { MessageListRenderGroup } from "./MessageList.types";
import type { MessageListMeasuredComputation } from "./messageListPerformance";

interface UseMessageListTelemetryOptions {
  canBuildHistoricalTimeline: boolean;
  hiddenHistoryCount: number;
  historicalContentPartsDeferredCount: number;
  historicalContentPartsDeferredMeasurement: MessageListMeasuredComputation<number>;
  historicalMarkdownDeferredCount: number;
  historicalMarkdownHydrationTargetCount: number;
  historicalMarkdownHydrationTargetsMeasurement: MessageListMeasuredComputation<
    string[]
  >;
  hydratedHistoricalMarkdownCount: number;
  isHistoricalTimelineReady: boolean;
  isRestoredHistoryWindow: boolean;
  isRestoringSession: boolean;
  messageGroupsMeasurement: MessageListMeasuredComputation<unknown>;
  messagesCount: number;
  persistedHiddenHistoryCount: number;
  renderedMessages: Message[];
  renderedThreadItemsCount: number;
  renderedThreadItemsMeasurement: MessageListMeasuredComputation<unknown>;
  renderedTurnsCount: number;
  renderGroups: MessageListRenderGroup[];
  renderGroupsMeasurement: MessageListMeasuredComputation<unknown>;
  sessionId: string | null;
  shouldDeferHistoricalTimeline: boolean;
  shouldDeferTailRuntimeStatusLine: boolean;
  shouldDeferThreadItemsScan: boolean;
  threadRead: AgentRuntimeThreadReadModel | null;
  timelineByMessageIdMeasurement: MessageListMeasuredComputation<unknown>;
  turnsCount: number;
  visibleMessagesCount: number;
}

export function useMessageListTelemetry({
  canBuildHistoricalTimeline,
  hiddenHistoryCount,
  historicalContentPartsDeferredCount,
  historicalContentPartsDeferredMeasurement,
  historicalMarkdownDeferredCount,
  historicalMarkdownHydrationTargetCount,
  historicalMarkdownHydrationTargetsMeasurement,
  hydratedHistoricalMarkdownCount,
  isHistoricalTimelineReady,
  isRestoredHistoryWindow,
  isRestoringSession,
  messageGroupsMeasurement,
  messagesCount,
  persistedHiddenHistoryCount,
  renderedMessages,
  renderedThreadItemsCount,
  renderedThreadItemsMeasurement,
  renderedTurnsCount,
  renderGroups,
  renderGroupsMeasurement,
  sessionId,
  shouldDeferHistoricalTimeline,
  shouldDeferTailRuntimeStatusLine,
  shouldDeferThreadItemsScan,
  threadRead,
  timelineByMessageIdMeasurement,
  turnsCount,
  visibleMessagesCount,
}: UseMessageListTelemetryOptions) {
  const restoredSessionMetricRef = useRef<string | null>(null);
  const messageListMeasuredComputeMs =
    renderedThreadItemsMeasurement.durationMs +
    timelineByMessageIdMeasurement.durationMs +
    messageGroupsMeasurement.durationMs +
    renderGroupsMeasurement.durationMs +
    historicalMarkdownHydrationTargetsMeasurement.durationMs +
    historicalContentPartsDeferredMeasurement.durationMs;

  useEffect(() => {
    if (!sessionId) {
      restoredSessionMetricRef.current = null;
      return;
    }

    if (
      restoredSessionMetricRef.current &&
      restoredSessionMetricRef.current !== sessionId
    ) {
      restoredSessionMetricRef.current = null;
    }

    const shouldTrackRestoredSession =
      isRestoringSession ||
      isRestoredHistoryWindow ||
      hiddenHistoryCount > 0 ||
      persistedHiddenHistoryCount > 0;
    if (shouldTrackRestoredSession) {
      restoredSessionMetricRef.current = sessionId;
    }

    const shouldRecordRestoredFollowUp =
      restoredSessionMetricRef.current === sessionId &&
      visibleMessagesCount > 0;
    const shouldRecord =
      shouldTrackRestoredSession || shouldRecordRestoredFollowUp;
    if (!shouldRecord) {
      return;
    }
    const shouldFinishRestoredFollowUp =
      shouldRecordRestoredFollowUp &&
      renderedMessages.length >= visibleMessagesCount;

    const metricContext = {
      canBuildHistoricalTimeline,
      hiddenHistoryCount,
      isHistoricalTimelineReady,
      isRestoredHistoryWindow,
      isRestoringSession,
      historicalContentPartsDeferredCount,
      hydratedHistoricalMarkdownCount,
      historicalMarkdownDeferredCount,
      messageListComputeMs: messageListMeasuredComputeMs,
      messageListGroupBuildMs: messageGroupsMeasurement.durationMs,
      messageListHistoricalContentPartsScanMs:
        historicalContentPartsDeferredMeasurement.durationMs,
      messageListHistoricalMarkdownTargetScanMs:
        historicalMarkdownHydrationTargetsMeasurement.durationMs,
      messageListRenderGroupsMs: renderGroupsMeasurement.durationMs,
      messageListThreadItemsScanMs: renderedThreadItemsMeasurement.durationMs,
      messageListTimelineBuildMs: timelineByMessageIdMeasurement.durationMs,
      messagesCount,
      persistedHiddenHistoryCount,
      renderedMessagesCount: renderedMessages.length,
      renderedTurnsCount,
      recordReason: shouldTrackRestoredSession
        ? "restored-window"
        : "restored-follow-up",
      sessionId,
      shouldDeferHistoricalTimeline,
      tailRuntimeStatusDeferred: shouldDeferTailRuntimeStatusLine,
      threadItemsScanDeferred: shouldDeferThreadItemsScan,
      threadItemsCount: renderedThreadItemsCount,
      timelineGroupsCount: renderGroups.length,
      turnsCount,
      visibleMessagesCount,
    };

    recordAgentUiPerformanceMetric("messageList.commit", metricContext);
    recordAgentUiProjectionEvents(
      buildHistoricalHydrationProjectionEvents(
        {
          sessionId,
          threadId: threadRead?.thread_id ?? null,
          recordReason: metricContext.recordReason,
          isRestoringSession,
          isRestoredHistoryWindow,
          isHistoricalTimelineReady,
          canBuildHistoricalTimeline,
          shouldDeferHistoricalTimeline,
          shouldDeferThreadItemsScan,
          shouldDeferTailRuntimeStatusLine,
          hiddenHistoryCount,
          persistedHiddenHistoryCount,
          targetCount: historicalMarkdownHydrationTargetCount,
          hydratedHistoricalMarkdownCount,
          historicalMarkdownDeferredCount,
          historicalContentPartsDeferredCount,
          messagesCount,
          visibleMessagesCount,
          renderedMessagesCount: renderedMessages.length,
          renderedTurnsCount,
          threadItemsCount: renderedThreadItemsCount,
          messageListComputeMs: messageListMeasuredComputeMs,
        },
        {
          timestamp: new Date().toISOString(),
          sessionId,
          threadId: threadRead?.thread_id ?? null,
        },
      ),
    );

    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      recordAgentUiPerformanceMetric("messageList.paint", metricContext);
      if (shouldFinishRestoredFollowUp) {
        restoredSessionMetricRef.current = null;
      }
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      recordAgentUiPerformanceMetric("messageList.paint", metricContext);
      if (shouldFinishRestoredFollowUp) {
        restoredSessionMetricRef.current = null;
      }
    });

    return () => {
      window.cancelAnimationFrame?.(frameId);
    };
  }, [
    canBuildHistoricalTimeline,
    hiddenHistoryCount,
    historicalContentPartsDeferredCount,
    historicalContentPartsDeferredMeasurement.durationMs,
    historicalMarkdownDeferredCount,
    historicalMarkdownHydrationTargetCount,
    historicalMarkdownHydrationTargetsMeasurement.durationMs,
    hydratedHistoricalMarkdownCount,
    isHistoricalTimelineReady,
    isRestoredHistoryWindow,
    isRestoringSession,
    messageGroupsMeasurement.durationMs,
    messageListMeasuredComputeMs,
    messagesCount,
    persistedHiddenHistoryCount,
    renderedMessages.length,
    renderedThreadItemsCount,
    renderedThreadItemsMeasurement.durationMs,
    renderedTurnsCount,
    renderGroups.length,
    renderGroupsMeasurement.durationMs,
    sessionId,
    shouldDeferHistoricalTimeline,
    shouldDeferTailRuntimeStatusLine,
    shouldDeferThreadItemsScan,
    threadRead?.thread_id,
    timelineByMessageIdMeasurement.durationMs,
    turnsCount,
    visibleMessagesCount,
  ]);
}
