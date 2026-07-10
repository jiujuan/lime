import { toast } from "sonner";
import type { Dispatch, SetStateAction } from "react";
import type {
  AgentEvent,
  AgentThreadItem,
  AgentThreadTurn,
} from "@/lib/api/agentProtocol";
import type { AsterExecutionStrategy } from "@/lib/api/agentRuntime";
import { logAgentDebug } from "@/lib/agentDebug";
import type { Message } from "../types";
import { buildAgentTextDeltaContentPartMetadata } from "../utils/contentPartTimeline";
import { sanitizeImageWorkbenchPresentationText } from "../utils/imageWorkbenchPresentation";
import { updateMessageArtifactsStatus } from "../utils/messageArtifacts";
import { isRetainedSkillProcessMessage } from "../utils/skillInlineProcessRetention";
import {
  removeThreadItemState,
  upsertThreadItemState,
  upsertThreadTurnState,
} from "./agentThreadState";
import {
  buildInterruptedMessageContentPatch,
  markInterruptedAgentMessageThreadItems,
} from "./agentInterruptedMessageContent";
import { settleInterruptedMessageProcess } from "./agentStreamFlowControl";
import {
  buildAgentStreamCompletedAssistantMessagePatch,
  buildAgentStreamMissingFinalReplyFailureSideEffectPlan,
  type AgentStreamMissingFinalReplyPlan,
  reconcileAgentStreamFinalContentParts,
} from "./agentStreamCompletionController";
import {
  buildAgentStreamFailedAssistantMessagePatch,
  buildAgentStreamFailedTimelineItemUpdate,
  buildAgentStreamFailedTimelineStatePlan,
  buildAgentStreamFailedTimelineTurnUpdate,
} from "./agentStreamErrorController";
import { recordAgentStreamPerformanceMetric } from "./agentStreamPerformanceMetrics";
import type { AgentStreamRequestLogFinishPayload } from "./agentStreamRequestLogController";
import { buildAgentStreamProcessBoundaryTextCommitPatch } from "./agentStreamProcessBoundaryCommit";
import { isPersistedReasoningContentPart } from "./agentStreamReasoningContentSync";
import { resetStreamedReasoningSegment } from "./agentStreamReasoningTimeline";
import {
  clearActiveTextSegmentState,
  resolveAccumulatedContentBeforeActiveTextSegment,
  shouldCommitActiveTextSegmentAsFinal,
} from "./agentStreamTextDeltaLifecycle";
import {
  buildAgentStreamFirstTextPaintContext,
  buildAgentStreamTextRenderFlushPlan,
} from "./agentStreamTextRenderFlushController";
import {
  clearAgentStreamTextOverlay,
  upsertAgentStreamTextOverlay,
} from "./agentStreamTextOverlayStore";
import {
  buildAgentStreamQueuedDraftCleanupTimerFirePlan,
  buildAgentStreamQueuedDraftCleanupTimerSchedulePlan,
  buildAgentStreamTextRenderTimerSchedulePlan,
  buildAgentStreamTimerClearPlan,
} from "./agentStreamTimerController";
import { buildAgentStreamQueuedDraftStatePlan } from "./agentStreamQueueController";
import { projectAgentStreamTimelineItem } from "./agentStreamTimelineItemProjector";
import { mergeAssistantAgentMessageContentPartsFromThreadItems } from "./agentStreamAgentMessageContentSync";
import { saveAgentSessionCachedMessagesSnapshot } from "./agentSessionScopedStorage";
import { shouldLetLegacyToolEventUpdateMessageLayer } from "./agentStreamLegacyToolEventGate";
import {
  finishRequestLog,
  hasRetainedSkillInlineProcess,
} from "./agentStreamRuntimeHandlerUtils";
import type {
  StreamLifecycleCallbacks,
  StreamObserver,
  StreamRequestState,
} from "./agentStreamRuntimeHandlerTypes";
import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";

export type AgentStreamRuntimeToolEvent = Extract<
  AgentEvent,
  {
    type:
      | "tool_start"
      | "tool_input_delta"
      | "tool_progress"
      | "tool_output_delta"
      | "tool_end";
  }
>;

function sanitizeImageWorkbenchAssistantContentForMessage(params: {
  fallbackLanguageSource?: string | null;
  message: Message;
  value: string;
}): string {
  if (!params.message.imageWorkbenchPreview) {
    return params.value;
  }
  const languageSource =
    params.message.imageWorkbenchPreview.prompt ||
    params.fallbackLanguageSource ||
    params.value;
  const sanitized = sanitizeImageWorkbenchPresentationText(params.value, {
    languageSource,
  });
  return sanitized || params.message.content || params.value;
}

interface CreateAgentStreamRuntimeHandlerActionsOptions {
  activeSessionId: string;
  assistantFallbackContent?: string | null;
  assistantMsgId: string;
  callbacks: StreamLifecycleCallbacks;
  content: string;
  effectiveExecutionStrategy: AsterExecutionStrategy;
  eventName: string;
  getThreadItems?: () => readonly AgentThreadItem[];
  observer?: StreamObserver;
  pendingItemKey: string;
  pendingTurnKey: string;
  requestState: StreamRequestState;
  resolvedWorkspaceId: string;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  surfaceThinkingDeltas: boolean;
  soulCopy?: SoulInteractionCopy;
}

export function createAgentStreamRuntimeHandlerActions({
  activeSessionId,
  assistantFallbackContent,
  assistantMsgId,
  callbacks,
  content,
  effectiveExecutionStrategy,
  eventName,
  getThreadItems,
  observer,
  pendingItemKey,
  pendingTurnKey,
  requestState,
  resolvedWorkspaceId,
  setCurrentTurnId,
  setIsSending,
  setMessages,
  setThreadItems,
  setThreadTurns,
  surfaceThinkingDeltas,
  soulCopy,
}: CreateAgentStreamRuntimeHandlerActionsOptions) {
  const {
    clearActiveStreamIfMatch,
    disposeListener,
    isStreamActivated,
    removeQueuedDraftMessages,
  } = callbacks;

  const shouldPreserveVisibleProcessForMessage = (message: Message): boolean =>
    surfaceThinkingDeltas ||
    requestState.shouldSurfaceVisibleProcessReasoning === true ||
    Boolean(message.imageWorkbenchPreview) ||
    isRetainedSkillProcessMessage(message);

  const clearQueuedDraftCleanupTimer = () => {
    const clearPlan = buildAgentStreamTimerClearPlan({
      hasTimer: Boolean(requestState.queuedDraftCleanupTimerId),
    });
    if (clearPlan.shouldClearTimer && requestState.queuedDraftCleanupTimerId) {
      clearTimeout(requestState.queuedDraftCleanupTimerId);
    }
    requestState.queuedDraftCleanupTimerId = clearPlan.nextTimerId;
  };

  const clearPendingTextRenderTimer = () => {
    const clearPlan = buildAgentStreamTimerClearPlan({
      hasTimer: Boolean(requestState.pendingTextRenderTimerId),
    });
    if (clearPlan.shouldClearTimer && requestState.pendingTextRenderTimerId) {
      clearTimeout(requestState.pendingTextRenderTimerId);
    }
    requestState.pendingTextRenderTimerId = clearPlan.nextTimerId;
  };

  const flushPendingTextRender = () => {
    clearPendingTextRenderTimer();
    const renderedContent = requestState.renderedContent || "";
    const nextContent = requestState.accumulatedContent;
    const flushStartedAt = Date.now();
    const flushPlan = buildAgentStreamTextRenderFlushPlan({
      activeSessionId,
      eventName,
      firstTextDeltaAt: requestState.firstTextDeltaAt,
      firstTextPaintAt: requestState.firstTextPaintAt,
      firstTextPaintScheduled: requestState.firstTextPaintScheduled,
      firstTextRenderFlushAt: requestState.firstTextRenderFlushAt,
      flushStartedAt,
      maxTextDeltaBacklogChars: requestState.maxTextDeltaBacklogChars,
      nextContent,
      renderedContent,
      requestStartedAt: requestState.requestStartedAt,
      textDeltaFlushCount: requestState.textDeltaFlushCount,
    });
    if (!flushPlan) {
      return;
    }

    requestState.renderedContent = flushPlan.nextRenderedContent;
    requestState.textDeltaFlushCount = flushPlan.nextTextDeltaFlushCount;
    requestState.lastTextRenderFlushAt = flushPlan.nextLastTextRenderFlushAt;
    requestState.maxTextDeltaBacklogChars =
      flushPlan.nextMaxTextDeltaBacklogChars;
    if (
      flushPlan.firstTextRenderFlushAt &&
      flushPlan.firstTextRenderFlushContext
    ) {
      requestState.firstTextRenderFlushAt = flushPlan.firstTextRenderFlushAt;
      recordAgentStreamPerformanceMetric(
        "agentStream.firstTextRenderFlush",
        requestState.performanceTrace,
        flushPlan.firstTextRenderFlushContext,
      );
    }
    if (flushPlan.shouldScheduleFirstTextPaint) {
      requestState.firstTextPaintScheduled = true;
    }
    if (flushPlan.shouldLogFlush) {
      logAgentDebug(
        "AgentStream",
        "textRenderFlush",
        flushPlan.flushLogContext,
        {
          dedupeKey: flushPlan.flushLogDedupeKey,
          throttleMs: 250,
        },
      );
    }
    upsertAgentStreamTextOverlay({
      messageId: assistantMsgId,
      eventName,
      content: nextContent,
      boundary: "render_flush",
      itemId: requestState.activeTextSegmentItemId,
      phase: requestState.activeTextSegmentPhase,
      sequence: requestState.activeTextSegmentSequence,
      turnId: requestState.activeTextSegmentTurnId,
      updatedAt: flushStartedAt,
    });
    if (flushPlan.shouldScheduleFirstTextPaint) {
      const recordFirstTextPaint = () => {
        const paintedAt = Date.now();
        requestState.firstTextPaintAt = paintedAt;
        const paintContext = buildAgentStreamFirstTextPaintContext({
          activeSessionId,
          eventName,
          firstTextDeltaAt: requestState.firstTextDeltaAt,
          flushStartedAt,
          paintedAt,
          rendererEventReceivedAt:
            requestState.performanceTrace?.rendererEventReceivedAt,
          requestStartedAt: requestState.requestStartedAt,
          serverEventEmittedAt:
            requestState.performanceTrace?.serverEventEmittedAt,
        });
        recordAgentStreamPerformanceMetric(
          "agentStream.firstTextPaint",
          requestState.performanceTrace,
          paintContext,
        );
        logAgentDebug("AgentStream", "firstTextPaint", paintContext);
      };

      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(recordFirstTextPaint);
        });
      } else {
        setTimeout(recordFirstTextPaint, 0);
      }
    }
  };

  const commitRenderedTextBeforeProcessPart = () => {
    flushPendingTextRender();
    if (
      !requestState.accumulatedContent.trim() &&
      !requestState.renderedContent?.trim()
    ) {
      return;
    }

    if (!shouldCommitActiveTextSegmentAsFinal(requestState)) {
      const retainedFinalPrefix =
        resolveAccumulatedContentBeforeActiveTextSegment(requestState);
      requestState.accumulatedContent = retainedFinalPrefix;
      requestState.renderedContent = retainedFinalPrefix;
      clearActiveTextSegmentState(requestState);
      clearAgentStreamTextOverlay(assistantMsgId);
      return;
    }

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== assistantMsgId) {
          return msg;
        }
        const patch = buildAgentStreamProcessBoundaryTextCommitPatch({
          accumulatedContent: requestState.accumulatedContent,
          parts: msg.contentParts,
          renderedContent: requestState.renderedContent,
          shouldRetainThinkingPart: isPersistedReasoningContentPart,
          surfaceThinkingDeltas: shouldPreserveVisibleProcessForMessage(msg),
          textPartMetadata: buildAgentTextDeltaContentPartMetadata({
            itemId: requestState.activeTextSegmentItemId,
            phase: requestState.activeTextSegmentPhase,
            sequence: requestState.activeTextSegmentSequence,
            turnId: requestState.activeTextSegmentTurnId,
          }),
        });
        if (!patch.content && !patch.contentParts) {
          return msg;
        }
        clearActiveTextSegmentState(requestState);
        return {
          ...msg,
          ...patch,
        };
      }),
    );
    clearActiveTextSegmentState(requestState);
    clearAgentStreamTextOverlay(assistantMsgId);
  };

  const scheduleTextRenderFlush = () => {
    const renderedContent = requestState.renderedContent || "";
    const schedulePlan = buildAgentStreamTextRenderTimerSchedulePlan({
      accumulatedContent: requestState.accumulatedContent,
      hasPendingTimer: Boolean(requestState.pendingTextRenderTimerId),
      renderedContent,
    });
    if (schedulePlan.action === "flush_now") {
      flushPendingTextRender();
      return;
    }

    if (schedulePlan.action !== "schedule_timer" || !schedulePlan.delayMs) {
      return;
    }
    requestState.pendingTextRenderTimerId = setTimeout(() => {
      requestState.pendingTextRenderTimerId = null;
      flushPendingTextRender();
    }, schedulePlan.delayMs);
  };

  const clearStreamingTextOverlay = () => {
    clearAgentStreamTextOverlay(assistantMsgId);
  };

  const upsertFallbackTextOverlayIfSilent = (boundary: string) => {
    const fallbackContent = assistantFallbackContent?.trim();
    if (
      !fallbackContent ||
      requestState.accumulatedContent.trim() ||
      requestState.renderedContent?.trim()
    ) {
      return;
    }

    upsertAgentStreamTextOverlay({
      messageId: assistantMsgId,
      eventName,
      content: fallbackContent,
      boundary,
      updatedAt: Date.now(),
    });
  };

  const persistRetainedSkillProcessSnapshot = (messages: Message[]) => {
    const resolvedSessionId = activeSessionId.trim();
    const workspaceId = resolvedWorkspaceId.trim();
    if (!resolvedSessionId || !workspaceId) {
      return;
    }

    const targetMessage = messages.find(
      (message) => message.id === assistantMsgId,
    );
    if (!targetMessage || !hasRetainedSkillInlineProcess(targetMessage)) {
      return;
    }

    saveAgentSessionCachedMessagesSnapshot(
      workspaceId,
      resolvedSessionId,
      messages,
    );
  };

  const buildStreamingTextCommitPatch = (
    msg: Message,
  ): Partial<Pick<Message, "content" | "contentParts">> => {
    const finalContent = sanitizeImageWorkbenchAssistantContentForMessage({
      fallbackLanguageSource: content || requestState.accumulatedContent,
      message: msg,
      value: requestState.accumulatedContent || msg.content,
    });
    if (!finalContent) {
      return {};
    }
    const rawContent = sanitizeImageWorkbenchAssistantContentForMessage({
      fallbackLanguageSource: content || requestState.accumulatedContent,
      message: msg,
      value: requestState.accumulatedContent || finalContent,
    });

    return {
      content: finalContent,
      contentParts: reconcileAgentStreamFinalContentParts({
        parts: msg.contentParts,
        finalContent,
        finalTextPartMetadata: buildAgentTextDeltaContentPartMetadata({
          itemId: requestState.activeTextSegmentItemId,
          phase: requestState.activeTextSegmentPhase,
          sequence: requestState.activeTextSegmentSequence,
          turnId: requestState.activeTextSegmentTurnId,
        }),
        rawContent,
        surfaceThinkingDeltas: shouldPreserveVisibleProcessForMessage(msg),
      }),
    };
  };

  const scheduleQueuedDraftCleanup = (shouldWatchCurrentRequest: boolean) => {
    const cleanupSchedulePlan =
      buildAgentStreamQueuedDraftCleanupTimerSchedulePlan({
        shouldWatchCurrentRequest,
        streamActivated: isStreamActivated(),
      });
    if (cleanupSchedulePlan.shouldClearExistingTimer) {
      clearQueuedDraftCleanupTimer();
    }
    if (
      !cleanupSchedulePlan.shouldScheduleTimer ||
      !cleanupSchedulePlan.delayMs
    ) {
      return;
    }

    requestState.queuedDraftCleanupTimerId = setTimeout(() => {
      requestState.queuedDraftCleanupTimerId = null;
      const cleanupFirePlan = buildAgentStreamQueuedDraftCleanupTimerFirePlan({
        requestFinished: requestState.requestFinished,
        streamActivated: isStreamActivated(),
      });
      if (!cleanupFirePlan.shouldCleanup) {
        return;
      }
      disposeListener();
      removeQueuedDraftMessages();
    }, cleanupSchedulePlan.delayMs);
  };

  const markFailedTimelineState = (errorMessage: string) => {
    const failedTimelinePlan = buildAgentStreamFailedTimelineStatePlan({
      activeSessionId,
      errorMessage,
      failedAt: new Date().toISOString(),
      pendingItemKey,
      pendingTurnKey,
    });

    setThreadTurns((prev) => {
      const hasPendingTurn = prev.some(
        (turn) => turn.id === failedTimelinePlan.pendingTurnKey,
      );
      const currentTurnId = requestState.currentTurnId?.trim();
      const candidateTurns =
        !hasPendingTurn && currentTurnId
          ? prev.filter((turn) => turn.id === currentTurnId)
          : prev;
      const failedTurn = buildAgentStreamFailedTimelineTurnUpdate({
        activeSessionId: failedTimelinePlan.activeSessionId,
        errorMessage: failedTimelinePlan.errorMessage,
        failedAt: failedTimelinePlan.failedAt,
        pendingTurnKey: failedTimelinePlan.pendingTurnKey,
        turns: candidateTurns,
      });
      if (!failedTurn) {
        return prev;
      }

      return upsertThreadTurnState(prev, failedTurn);
    });

    setThreadItems((prev) => {
      const failedItem = buildAgentStreamFailedTimelineItemUpdate({
        errorMessage: failedTimelinePlan.errorMessage,
        failedAt: failedTimelinePlan.failedAt,
        items: prev,
        pendingItemKey: failedTimelinePlan.pendingItemKey,
      });
      if (!failedItem) {
        return prev;
      }

      return upsertThreadItemState(prev, failedItem);
    });
  };

  const finalizeTerminalStreamState = ({
    shouldClearActiveStream = true,
    shouldDisposeListener = true,
  }: {
    shouldClearActiveStream?: boolean;
    shouldDisposeListener?: boolean;
  } = {}) => {
    const activeStreamCleared = shouldClearActiveStream
      ? clearActiveStreamIfMatch(eventName)
      : false;
    if (activeStreamCleared || !isStreamActivated()) {
      setIsSending(false);
    }
    if (shouldDisposeListener) {
      disposeListener();
    }
  };

  const finalizeMissingFinalReplyFailure = (
    failurePlan: AgentStreamMissingFinalReplyPlan,
  ) => {
    const sideEffectPlan =
      buildAgentStreamMissingFinalReplyFailureSideEffectPlan(failurePlan);
    if (sideEffectPlan.shouldClearPendingTextRenderTimer) {
      clearPendingTextRenderTimer();
    }
    if (sideEffectPlan.shouldMarkFailedTimeline) {
      markFailedTimelineState(sideEffectPlan.errorMessage);
    }
    finishRequestLog(requestState, sideEffectPlan.requestLogPayload);
    observer?.onError?.(sideEffectPlan.observerErrorMessage);
    toast.error(sideEffectPlan.toastMessage);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantMsgId
          ? {
              ...updateMessageArtifactsStatus(msg, "error"),
              ...buildAgentStreamFailedAssistantMessagePatch({
                errorMessage: sideEffectPlan.errorMessage,
                accumulatedContent: requestState.accumulatedContent,
                previousContent: msg.content,
                previousContentParts: msg.contentParts,
                usage: sideEffectPlan.usage ?? msg.usage,
                soulCopy,
              }),
            }
          : msg,
      ),
    );
    clearStreamingTextOverlay();
    if (sideEffectPlan.shouldClearActiveStream) {
      finalizeTerminalStreamState({
        shouldClearActiveStream: true,
        shouldDisposeListener: sideEffectPlan.shouldDisposeListener,
      });
    } else if (sideEffectPlan.shouldDisposeListener) {
      disposeListener();
    }
  };

  const completeAssistantStreamMessage = ({
    finalContent,
    rawContent,
    usage,
  }: {
    finalContent: string;
    rawContent: string;
    usage?: Message["usage"];
  }) => {
    observer?.onComplete?.(finalContent);
    setMessages((prev) => {
      const nextMessages = prev.map((msg) => {
        if (msg.id !== assistantMsgId) {
          return msg;
        }
        const shouldPreserveRunningImageTaskContent =
          msg.imageWorkbenchPreview?.status === "running" &&
          !requestState.accumulatedContent.trim();
        const resolvedFinalContent = shouldPreserveRunningImageTaskContent
          ? msg.content
          : sanitizeImageWorkbenchAssistantContentForMessage({
              fallbackLanguageSource: content || finalContent,
              message: msg,
              value: finalContent,
            });
        const resolvedRawContent = shouldPreserveRunningImageTaskContent
          ? msg.content
          : sanitizeImageWorkbenchAssistantContentForMessage({
              fallbackLanguageSource: content || rawContent,
              message: msg,
              value: rawContent,
            });

        return {
          ...updateMessageArtifactsStatus(msg, "complete"),
          ...buildAgentStreamCompletedAssistantMessagePatch({
            parts: mergeAssistantAgentMessageContentPartsFromThreadItems({
              parts: msg.contentParts,
              turnId: msg.runtimeTurnId ?? requestState.currentTurnId,
              items: [
                ...Array.from(
                  requestState.streamedAgentMessageItemsByItemId?.values() ??
                    [],
                ),
                ...(getThreadItems?.() ?? []),
              ],
            }),
            finalContent: resolvedFinalContent,
            finalTextPartMetadata: buildAgentTextDeltaContentPartMetadata({
              itemId: requestState.activeTextSegmentItemId,
              phase: requestState.activeTextSegmentPhase,
              sequence: requestState.activeTextSegmentSequence,
              turnId: requestState.activeTextSegmentTurnId,
            }),
            previousContent:
              resolvedRawContent === resolvedFinalContent
                ? resolvedFinalContent
                : msg.content,
            rawContent: resolvedRawContent,
            surfaceThinkingDeltas: shouldPreserveVisibleProcessForMessage(msg),
            preserveThinkingContent:
              shouldPreserveVisibleProcessForMessage(msg),
            thinkingContent: msg.thinkingContent,
            toolCalls: msg.toolCalls,
            usage: usage ?? msg.usage,
          }),
        };
      });
      persistRetainedSkillProcessSnapshot(nextMessages);
      return nextMessages;
    });
    clearStreamingTextOverlay();
    finalizeTerminalStreamState();
  };

  const completeAssistantStreamMessageFromCompletionPlan = ({
    finalContent,
    requestLogPayload,
    usage,
  }: {
    finalContent: string;
    requestLogPayload: AgentStreamRequestLogFinishPayload;
    usage?: Message["usage"];
  }) => {
    finishRequestLog(requestState, requestLogPayload);
    completeAssistantStreamMessage({
      finalContent,
      rawContent: finalContent,
      usage,
    });
  };

  const completeInterruptedTurn = (turn: AgentThreadTurn) => {
    finishRequestLog(requestState, {
      eventType: "chat_request_complete",
      status: "success",
      description: "请求已中止",
    });
    observer?.onComplete?.(requestState.accumulatedContent.trim());
    setMessages((prev) => {
      const nextMessages = prev.map((msg) => {
        if (msg.id !== assistantMsgId) {
          return msg;
        }

        const interruptedMessage = settleInterruptedMessageProcess(msg);
        return {
          ...updateMessageArtifactsStatus(interruptedMessage, "complete"),
          ...buildInterruptedMessageContentPatch(interruptedMessage),
          isThinking: false,
          runtimeStatus: undefined,
        };
      });
      persistRetainedSkillProcessSnapshot(nextMessages);
      return nextMessages;
    });
    clearStreamingTextOverlay();
    setThreadItems((prev) =>
      markInterruptedAgentMessageThreadItems(prev, new Set([turn.id])),
    );
    setCurrentTurnId(turn.id);
    finalizeTerminalStreamState();
  };

  const markQueuedDraftState = (queuedMessageText?: string | null) => {
    const queuedDraftPlan = buildAgentStreamQueuedDraftStatePlan({
      contentFallback: content,
      executionStrategy: effectiveExecutionStrategy,
      queuedMessageText,
    });
    if (queuedDraftPlan.shouldClearActiveStream) {
      clearActiveStreamIfMatch(eventName);
    }
    if (queuedDraftPlan.shouldClearOptimisticItem) {
      callbacks.clearOptimisticItem();
    }
    if (queuedDraftPlan.shouldClearOptimisticTurn) {
      callbacks.clearOptimisticTurn();
    }
    if (queuedDraftPlan.shouldSetSendingFalse) {
      setIsSending(false);
    }

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantMsgId
          ? {
              ...msg,
              ...queuedDraftPlan.messagePatch,
            }
          : msg,
      ),
    );
  };

  const completeCurrentStreamedReasoningSegment = (
    completedAt = new Date().toISOString(),
  ) => {
    if (!requestState.streamedReasoningItemId) {
      return;
    }
    const itemId = requestState.streamedReasoningItemId;
    setThreadItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: "completed",
              completed_at: item.completed_at || completedAt,
              updated_at: completedAt,
            }
          : item,
      ),
    );
    resetStreamedReasoningSegment(requestState);
  };

  const upsertProjectedTimelineItem = (event: AgentEvent) => {
    completeCurrentStreamedReasoningSegment(
      typeof event.timestamp === "string" ? event.timestamp : undefined,
    );
    setThreadItems((prev) => {
      const fallbackTurnId =
        requestState.currentTurnId || requestState.queuedTurnId;
      const existingId =
        event.type === "tool_start" ||
        event.type === "tool_input_delta" ||
        event.type === "tool_progress" ||
        event.type === "tool_output_delta" ||
        event.type === "tool_end"
          ? event.tool_id
          : event.type === "action_required" || event.type === "action_resolved"
            ? event.request_id
            : "";
      const existingTurnId =
        event.type === "tool_start" ||
        event.type === "tool_input_delta" ||
        event.type === "tool_progress" ||
        event.type === "tool_output_delta" ||
        event.type === "tool_end"
          ? event.turn_id?.trim() || fallbackTurnId || ""
          : "";
      const projectedItem = projectAgentStreamTimelineItem(
        event,
        {
          activeSessionId,
          fallbackTurnId,
          now: new Date().toISOString(),
          soulCopy,
        },
        prev.find((item) => {
          if (item.id !== existingId) {
            return false;
          }
          if (!existingTurnId) {
            return true;
          }
          return item.turn_id === existingTurnId;
        }),
      );
      if (!projectedItem) {
        return prev;
      }
      return upsertThreadItemState(
        removeThreadItemState(prev, pendingItemKey),
        projectedItem,
      );
    });
  };

  const shouldUpdateLegacyToolMessageLayer = (
    event: AgentStreamRuntimeToolEvent,
  ): boolean =>
    shouldLetLegacyToolEventUpdateMessageLayer({
      event,
      fallbackTurnId: requestState.currentTurnId || requestState.queuedTurnId,
      items:
        (getThreadItems?.() as
          | import("@/lib/api/agentProtocol").AgentThreadItem[]
          | undefined) ?? [],
    });

  return {
    buildStreamingTextCommitPatch,
    clearPendingTextRenderTimer,
    clearQueuedDraftCleanupTimer,
    clearStreamingTextOverlay,
    commitRenderedTextBeforeProcessPart,
    completeAssistantStreamMessageFromCompletionPlan,
    completeCurrentStreamedReasoningSegment,
    completeInterruptedTurn,
    finalizeMissingFinalReplyFailure,
    finalizeTerminalStreamState,
    flushPendingTextRender,
    markFailedTimelineState,
    markQueuedDraftState,
    persistRetainedSkillProcessSnapshot,
    scheduleQueuedDraftCleanup,
    scheduleTextRenderFlush,
    shouldUpdateLegacyToolMessageLayer,
    upsertFallbackTextOverlayIfSilent,
    upsertProjectedTimelineItem,
  };
}
