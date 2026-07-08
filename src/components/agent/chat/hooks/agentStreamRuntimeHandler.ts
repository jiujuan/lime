import { toast } from "sonner";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import { logAgentDebug } from "@/lib/agentDebug";
import { updateMessageArtifactsStatus } from "../utils/messageArtifacts";
import {
  markThreadActionItemSubmitted,
  removeThreadItemState,
  upsertThreadItemState,
} from "./agentThreadState";
import {
  handleActionRequiredEvent,
  handleArtifactSnapshotEvent,
  handleContextTraceEvent,
  handleToolEndEvent,
  handleToolInputDeltaEvent,
  handleToolOutputDeltaEvent,
  handleToolProgressEvent,
  handleToolStartEvent,
} from "./agentStreamEventProcessor";
import {
  buildAgentStreamCompletedAssistantMessagePatch,
  buildAgentStreamEmptyFinalErrorPlan,
  isAgentStreamEmptyFinalReplyError,
} from "./agentStreamCompletionController";
import {
  applyAgentStreamErrorToastPlan,
  buildAgentStreamErrorFailurePlan,
  buildAgentStreamFailedAssistantMessagePatch,
} from "./agentStreamErrorController";
import { recordAgentStreamPerformanceMetric } from "./agentStreamPerformanceMetrics";
import {
  buildAgentStreamFirstRuntimeStatusMetricContext,
  shouldRecordAgentStreamFirstRuntimeStatus,
} from "./agentStreamRuntimeMetricsController";
import {
  applyAgentStreamRuntimeStatusToMessages,
  applyAgentStreamRuntimeStatusToThreadItems,
  buildAgentStreamProviderTraceRuntimeStatusApplyPlan,
  buildAgentStreamRuntimeStatusApplyPlan,
} from "./agentStreamRuntimeStatusController";
import { buildAgentStreamTextDeltaApplyPlan } from "./agentStreamTextDeltaController";
import {
  appendTextWithOverlapFallback,
  buildStreamedReasoningItem,
  resetStreamedReasoningSegment,
} from "./agentStreamReasoningTimeline";
import {
  buildAgentStreamWarningPlan,
  buildAgentStreamWarningToastAction,
  applyAgentStreamWarningToastAction,
} from "./agentStreamWarningController";
import {
  shouldWatchAgentStreamQueuedDraftCleanup,
  shouldWatchAgentStreamQueuedDraftCleanupForCleared,
} from "./agentStreamQueueController";
import { buildAgentStreamToolEndPreApplyPlan } from "./agentStreamToolEventController";
import { buildAgentStreamPlanThreadItem } from "./agentStreamPlanEventController";
import {
  buildAgentStreamActionRequiredPreApplyPlan,
  buildAgentStreamArtifactSnapshotPreApplyPlan,
} from "./agentStreamArtifactActionController";
import {
  applyAgentStreamModelChangeExecutionRuntime,
  applyAgentStreamTurnContextExecutionRuntime,
  buildAgentStreamContextTracePreApplyPlan,
  buildAgentStreamModelChangePreApplyPlan,
  buildAgentStreamTurnContextPreApplyPlan,
} from "./agentStreamRuntimeContextController";
import {
  buildAgentStreamThinkingDeltaMessagePatch,
  buildAgentStreamThinkingDeltaPreApplyPlan,
} from "./agentStreamThinkingDeltaController";
import { shouldSurfaceReasoningEventAsVisibleProcess } from "./agentStreamVisibleReasoningPolicy";
import { syncAssistantAgentMessageContentPartFromThreadItem } from "./agentStreamAgentMessageContentSync";
import { isPersistedReasoningContentPart } from "./agentStreamReasoningContentSync";
import { isRuntimePermissionConfirmationWaitMessage } from "../utils/runtimeActionConfirmation";
import { buildAgentUiProjectionEvents } from "../projection/agentUiEventProjection";
import { enqueueAgentUiProjectionEvents } from "../projection/conversationProjectionStore";
import { isRetainedSkillProcessMessage } from "../utils/skillInlineProcessRetention";
import {
  applyAcknowledgedActionRequests,
  removeActionsByRequestIds,
  shouldPersistSubmittedActionForType,
} from "./agentChatActionState";
import { normalizeActionType } from "./agentChatCoreUtils";
import { createAgentStreamRuntimeHandlerActions } from "./agentStreamRuntimeHandlerActions";
import {
  handleAgentStreamMessageSnapshotEvent,
  handleAgentStreamQueueEvent,
  handleAgentStreamThreadItemLifecycleEvent,
  handleAgentStreamTurnCanceledEvent,
  handleAgentStreamTurnCompletedEvent,
  handleAgentStreamTurnFailedEvent,
  handleAgentStreamTurnStartedEvent,
} from "./agentStreamRuntimeLifecycleEvents";
import {
  applyAgentStreamImageTaskCreatedEvent,
  applyAgentStreamImageTaskPresentationGeneratedEvent,
} from "./agentStreamImageTaskEventController";
import type { HandleTurnStreamEventOptions } from "./agentStreamRuntimeHandlerTypes";
import {
  bindAssistantMessageToRuntimeTurn,
  finishRequestLog,
  resolveActionResolvedUserData,
  resolveVisibleTextDeltaAfterSnapshotPrefill,
  sequenceFromAgentEvent,
  stringifySubmittedActionResponse,
} from "./agentStreamRuntimeHandlerUtils";
import {
  noteActiveFinalTextSegment,
  resolveTextSegmentFinalEligibility,
  shouldRouteTextDeltaToFinalOverlay,
  shouldSuppressLegacyTextDeltaAfterProcessBoundary,
  type TextDeltaAgentEvent,
} from "./agentStreamTextDeltaLifecycle";
import { shouldApplyAgentStreamTerminalEvent } from "./agentStreamTerminalTurnGuard";

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function handleTurnStreamEvent({
  data,
  requestState,
  callbacks,
  observer,
  eventName,
  pendingTurnKey,
  pendingItemKey,
  assistantMsgId,
  activeSessionId,
  resolvedWorkspaceId,
  effectiveExecutionStrategy,
  surfaceThinkingDeltas = true,
  preserveAssistantContent,
  assistantFallbackContent,
  content,
  runtime,
  _webSearch,
  warnedKeysRef,
  actionLoggedKeys,
  toolLogIdByToolId,
  toolStartedAtByToolId,
  toolNameByToolId,
  onWriteFile,
  setMessages,
  setPendingActions,
  getThreadItems,
  setThreadItems,
  setThreadTurns,
  setCurrentTurnId,
  setExecutionRuntime,
  setIsSending,
  soulCopy,
}: HandleTurnStreamEventOptions): void {
  const {
    activateStream,
    clearOptimisticItem,
    clearOptimisticTurn,
    upsertQueuedTurn,
    removeQueuedTurnsFromProjection,
    playToolcallSound,
    playTypewriterSound,
    appendThinkingToParts,
  } = callbacks;
  const preservedAssistantContent = preserveAssistantContent?.trim() || null;
  const shouldPreserveAssistantContent = Boolean(preservedAssistantContent);
  if (
    preservedAssistantContent &&
    !requestState.preservedAssistantContentInitialized
  ) {
    requestState.accumulatedContent = preservedAssistantContent;
    requestState.renderedContent = preservedAssistantContent;
    requestState.preservedAssistantContentInitialized = true;
  }

  const projectionEvents = buildAgentUiProjectionEvents(data, {
    sequence: (requestState.agentUiEventSequence ?? 0) + 1,
    timestamp: new Date().toISOString(),
    sessionId: activeSessionId,
    runId: eventName,
    messageId: assistantMsgId,
  }, {
    soulCopy,
  });
  if (projectionEvents.length > 0) {
    requestState.agentUiEventSequence =
      (requestState.agentUiEventSequence ?? 0) + projectionEvents.length;
    enqueueAgentUiProjectionEvents(projectionEvents);
  }

  const {
    buildStreamingTextCommitPatch,
    clearQueuedDraftCleanupTimer,
    clearStreamingTextOverlay,
    commitRenderedTextBeforeProcessPart,
    completeAssistantStreamMessageFromCompletionPlan,
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
  } = createAgentStreamRuntimeHandlerActions({
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
  });
  const runtimeStateSetters = {
    getThreadItems,
    setCurrentTurnId,
    setMessages,
    setThreadItems,
    setThreadTurns,
  };
  const syncStreamedAgentMessageContentParts = () => {
    const items = requestState.streamedAgentMessageItemsByItemId;
    if (!items || items.size === 0) {
      return;
    }
    const threadItems = getThreadItems?.() ?? [];
    for (const item of items.values()) {
      syncAssistantAgentMessageContentPartFromThreadItem({
        assistantMsgId,
        item,
        threadItems,
        setMessages,
      });
    }
  };
  const noteProcessEventSequence = (sequence: number | null | undefined) => {
    if (typeof sequence !== "number" || !Number.isFinite(sequence)) {
      return;
    }
    requestState.maxProcessEventSequence = Math.max(
      requestState.maxProcessEventSequence ?? Number.NEGATIVE_INFINITY,
      sequence,
    );
    syncStreamedAgentMessageContentParts();
  };
  const noteFinalAnswerRequiredProcessBoundary = (
    sequence: number | null | undefined,
  ) => {
    const processSequence =
      typeof sequence === "number" && Number.isFinite(sequence)
        ? sequence
        : null;
    requestState.hasFinalAnswerRequiredProcessBoundary = true;
    if (
      processSequence !== null &&
      typeof requestState.latestAssistantTextEventSequence === "number" &&
      processSequence < requestState.latestAssistantTextEventSequence
    ) {
      requestState.hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary = true;
    } else {
      requestState.hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary = false;
    }
    if (processSequence === null) {
      return;
    }
    requestState.maxFinalAnswerRequiredProcessEventSequence = Math.max(
      requestState.maxFinalAnswerRequiredProcessEventSequence ??
        Number.NEGATIVE_INFINITY,
      processSequence,
    );
    noteProcessEventSequence(processSequence);
  };
  const noteTextEventBeforeAppend = (event: TextDeltaAgentEvent) => {
    const sequence = sequenceFromAgentEvent(event);
    const itemId = normalizeOptionalText(event.itemId);
    const phase = normalizeOptionalText(event.phase);
    const turnId = normalizeOptionalText(event.turn_id);
    const eventSequence =
      typeof sequence === "number" && Number.isFinite(sequence)
        ? sequence
        : null;
    const activeItemId = normalizeOptionalText(
      requestState.activeTextSegmentItemId,
    );
    const activePhase = normalizeOptionalText(
      requestState.activeTextSegmentPhase,
    );
    const activeTurnId = normalizeOptionalText(
      requestState.activeTextSegmentTurnId,
    );
    const eligibility = resolveTextSegmentFinalEligibility(event);
    const activeEligibility =
      requestState.activeTextSegmentFinalEligibility ?? null;
    if (
      (activeItemId && itemId && activeItemId !== itemId) ||
      (activePhase && phase && activePhase !== phase) ||
      (activeTurnId && turnId && activeTurnId !== turnId) ||
      (activeEligibility && eligibility && activeEligibility !== eligibility)
    ) {
      commitRenderedTextBeforeProcessPart();
    }
    noteActiveFinalTextSegment({ event, requestState });
    if (eventSequence !== null) {
      requestState.latestAssistantTextEventSequence = Math.max(
        requestState.latestAssistantTextEventSequence ??
          Number.NEGATIVE_INFINITY,
        eventSequence,
      );
      const activeTextSequence = requestState.activeTextSegmentSequence;
      const maxProcessSequence = requestState.maxProcessEventSequence;
      if (
        typeof activeTextSequence === "number" &&
        typeof maxProcessSequence === "number" &&
        activeTextSequence < maxProcessSequence &&
        eventSequence > maxProcessSequence
      ) {
        commitRenderedTextBeforeProcessPart();
      }
      if (typeof requestState.activeTextSegmentSequence !== "number") {
        requestState.activeTextSegmentSequence = eventSequence;
      }
    }
    if (!requestState.activeTextSegmentItemId && itemId) {
      requestState.activeTextSegmentItemId = itemId;
    }
    if (!requestState.activeTextSegmentPhase && phase) {
      requestState.activeTextSegmentPhase = phase;
    }
    if (!requestState.activeTextSegmentTurnId && turnId) {
      requestState.activeTextSegmentTurnId = turnId;
    }
    if (!requestState.hasFinalAnswerRequiredProcessBoundary) {
      return;
    }
    const maxReplyProcessSequence =
      requestState.maxFinalAnswerRequiredProcessEventSequence;
    if (
      eventSequence !== null &&
      typeof maxReplyProcessSequence === "number" &&
      eventSequence <= maxReplyProcessSequence
    ) {
      return;
    }
    requestState.hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary = true;
  };
  const upsertStructuredAgentMessageDeltaItem = (
    event: TextDeltaAgentEvent,
    options: {
      shouldSyncMessageContentPart?: boolean;
      shouldSyncThreadItem?: boolean;
      textDelta?: string;
    } = {},
  ): boolean => {
    const textDelta = options.textDelta ?? event.text;
    if (!textDelta) {
      return true;
    }
    const itemId =
      normalizeOptionalText(event.itemId) ||
      normalizeOptionalText(event.event_id);
    const turnId =
      normalizeOptionalText(event.turn_id) ||
      normalizeOptionalText(requestState.currentTurnId) ||
      normalizeOptionalText(requestState.queuedTurnId);
    if (!itemId || !turnId) {
      return true;
    }

    const textByItem =
      requestState.streamedAgentMessageTextByItemId ??
      new Map<string, string>();
    requestState.streamedAgentMessageTextByItemId = textByItem;
    const nextText = appendTextWithOverlapFallback(
      textByItem.get(itemId) || "",
      textDelta,
    );
    textByItem.set(itemId, nextText);

    const now = event.timestamp || new Date().toISOString();
    const sequence = sequenceFromAgentEvent(event) ?? Number.MAX_SAFE_INTEGER;
    const item = {
      id: itemId,
      thread_id:
        normalizeOptionalText(event.thread_id) ||
        normalizeOptionalText(event.session_id) ||
        activeSessionId,
      turn_id: turnId,
      sequence,
      status: "in_progress" as const,
      started_at: now,
      updated_at: now,
      type: "agent_message" as const,
      text: nextText,
      ...(event.phase ? { phase: event.phase } : {}),
      metadata: {
        source: "agent_text_delta",
        ...(event.itemId ? { itemId: event.itemId } : {}),
        ...(event.phase ? { phase: event.phase } : {}),
      },
    };

    const itemsByItemId =
      requestState.streamedAgentMessageItemsByItemId ??
      new Map<string, AgentThreadItem>();
    requestState.streamedAgentMessageItemsByItemId = itemsByItemId;
    itemsByItemId.set(itemId, item);
    logAgentDebug(
      "AgentStream",
      "nonFinalTextDelta",
      {
        eventName,
        itemId,
        phase: event.phase ?? null,
        sequence,
        sessionId: activeSessionId,
        textLength: nextText.length,
        turnId,
      },
      {
        dedupeKey: `${eventName}:structuredAgentMessageTextDelta:${itemId}:${sequence}:${nextText.length}`,
      },
    );

    bindAssistantMessageToRuntimeTurn(setMessages, assistantMsgId, turnId);
    if (options.shouldSyncThreadItem !== false) {
      setThreadItems((prev) =>
        upsertThreadItemState(
          removeThreadItemState(prev, pendingItemKey),
          item,
        ),
      );
    }
    if (
      options.shouldSyncMessageContentPart !== false &&
      normalizeOptionalText(event.itemId)
    ) {
      syncAssistantAgentMessageContentPartFromThreadItem({
        assistantMsgId,
        item,
        threadItems: getThreadItems?.(),
        setMessages,
      });
    }
    return true;
  };
  const shouldApplyTerminalEvent = (
    terminalType: "turn_completed" | "turn_canceled" | "turn_failed",
    terminalTurnId?: string | null,
  ): boolean => {
    const shouldApply = shouldApplyAgentStreamTerminalEvent({
      activeTextSegmentTurnId: requestState.activeTextSegmentTurnId,
      currentTurnId: requestState.currentTurnId,
      queuedTurnId: requestState.queuedTurnId,
      terminalTurnId,
    });
    if (!shouldApply) {
      logAgentDebug(
        "AgentStream",
        "staleTerminalIgnored",
        {
          activeTextSegmentTurnId: requestState.activeTextSegmentTurnId ?? null,
          currentTurnId: requestState.currentTurnId ?? null,
          eventName,
          queuedTurnId: requestState.queuedTurnId ?? null,
          sessionId: activeSessionId,
          terminalTurnId: terminalTurnId ?? null,
          terminalType,
        },
        {
          dedupeKey: `${eventName}:staleTerminalIgnored:${terminalType}:${terminalTurnId ?? "unknown"}`,
        },
      );
    }
    return shouldApply;
  };

  switch (data.type) {
    case "message":
      // 后端会先发送完整 message 快照，再发送细粒度 delta；这里仅确认流已进入已知事件路径，避免误报未知事件。
      activateStream();
      handleAgentStreamMessageSnapshotEvent({
        assistantMsgId,
        event: data,
        requestState,
        setMessages,
        shouldPreserveAssistantContent,
        surfaceThinkingDeltas,
      });
      break;

    case "thread_started":
      break;

    case "queue_added":
    case "queue_removed":
    case "queue_started":
    case "queue_cleared":
      handleAgentStreamQueueEvent({
        activateStream,
        clearQueuedDraftCleanupTimer,
        event: data,
        markQueuedDraftState,
        removeQueuedTurnsFromProjection,
        requestState,
        scheduleQueuedDraftCleanup,
        shouldWatchAgentStreamQueuedDraftCleanup,
        shouldWatchAgentStreamQueuedDraftCleanupForCleared,
        upsertQueuedTurn,
      });
      break;

    case "turn_started":
      clearQueuedDraftCleanupTimer();
      activateStream();
      handleAgentStreamTurnStartedEvent({
        assistantMsgId,
        event: data,
        pendingItemKey,
        pendingTurnKey,
        requestState,
        setters: runtimeStateSetters,
      });
      break;

    case "item_started":
    case "item_completed":
      activateStream();
      requestState.currentTurnId = data.item.turn_id;
      if (data.item.type === "reasoning") {
        resetStreamedReasoningSegment(requestState);
      }
      if (data.item.type === "tool_call" || data.item.type === "reasoning") {
        commitRenderedTextBeforeProcessPart();
        noteFinalAnswerRequiredProcessBoundary(sequenceFromAgentEvent(data));
        noteFinalAnswerRequiredProcessBoundary(data.item.sequence);
      }
      handleAgentStreamThreadItemLifecycleEvent({
        assistantMsgId,
        event: data,
        pendingItemKey,
        requestState,
        setters: runtimeStateSetters,
      });
      break;

    case "item_updated":
      activateStream();
      requestState.currentTurnId = data.item.turn_id;
      if (data.item.type === "reasoning") {
        resetStreamedReasoningSegment(requestState);
      }
      if (data.item.type === "tool_call" || data.item.type === "reasoning") {
        commitRenderedTextBeforeProcessPart();
        noteFinalAnswerRequiredProcessBoundary(sequenceFromAgentEvent(data));
        noteFinalAnswerRequiredProcessBoundary(data.item.sequence);
      }
      if (
        handleAgentStreamThreadItemLifecycleEvent({
          assistantMsgId,
          event: data,
          pendingItemKey,
          requestState,
          setters: runtimeStateSetters,
        }) === "deferred"
      ) {
        break;
      }
      break;

    case "turn_completed": {
      if (!shouldApplyTerminalEvent(data.type, data.turn.id)) {
        break;
      }
      clearQueuedDraftCleanupTimer();
      flushPendingTextRender();
      clearOptimisticItem();
      clearOptimisticTurn();
      handleAgentStreamTurnCompletedEvent({
        assistantFallbackContent,
        assistantMsgId,
        completeAssistantStreamMessageFromCompletionPlan,
        event: data,
        finalizeMissingFinalReplyFailure,
        pendingTurnKey,
        requestState,
        shouldPreserveAssistantContent,
        setters: runtimeStateSetters,
        toolCallCount: toolLogIdByToolId.size,
      });
      break;
    }

    case "turn_canceled": {
      if (!shouldApplyTerminalEvent(data.type, data.turn.id)) {
        break;
      }
      clearQueuedDraftCleanupTimer();
      flushPendingTextRender();
      clearOptimisticItem();
      clearOptimisticTurn();
      handleAgentStreamTurnCanceledEvent({
        assistantMsgId,
        completeInterruptedTurn,
        event: data,
        pendingTurnKey,
        setters: runtimeStateSetters,
      });
      break;
    }

    case "turn_failed": {
      if (!shouldApplyTerminalEvent(data.type, data.turn.id)) {
        break;
      }
      clearQueuedDraftCleanupTimer();
      activateStream();
      flushPendingTextRender();
      clearOptimisticItem();
      clearOptimisticTurn();
      handleAgentStreamTurnFailedEvent({
        assistantMsgId,
        event: data,
        finalizeMissingFinalReplyFailure,
        pendingTurnKey,
        requestState,
        setters: runtimeStateSetters,
      });
      break;
    }

    case "runtime_status":
      activateStream();
      {
        const imageWorkflowStatus = data.status.metadata?.agentui;
        if (
          imageWorkflowStatus &&
          typeof imageWorkflowStatus === "object" &&
          !Array.isArray(imageWorkflowStatus) &&
          (imageWorkflowStatus as Record<string, unknown>).workflow_key ===
            "image_command_workflow" &&
          (imageWorkflowStatus as Record<string, unknown>).status_kind ===
            "image_task_parameters_required"
        ) {
          requestState.hasMeaningfulCompletionSignal = true;
        }
        if (
          shouldRecordAgentStreamFirstRuntimeStatus({
            firstRuntimeStatusAt: requestState.firstRuntimeStatusAt,
          })
        ) {
          requestState.firstRuntimeStatusAt = Date.now();
          const firstRuntimeStatusContext =
            buildAgentStreamFirstRuntimeStatusMetricContext({
              activeSessionId,
              eventName,
              firstEventReceivedAt: requestState.firstEventReceivedAt,
              firstRuntimeStatusAt: requestState.firstRuntimeStatusAt,
              requestStartedAt: requestState.requestStartedAt,
              statusPhase: data.status.phase,
              statusTitle: data.status.title,
            });
          recordAgentStreamPerformanceMetric(
            "agentStream.firstRuntimeStatus",
            requestState.performanceTrace,
            firstRuntimeStatusContext,
          );
          logAgentDebug(
            "AgentStream",
            "firstRuntimeStatus",
            firstRuntimeStatusContext,
          );
        }
        if (data.status.metadata?.keepalive_kind) {
          logAgentDebug(
            "AgentStream",
            "runtimeKeepalive",
            {
              eventName,
              sessionId: activeSessionId,
              kind: data.status.metadata.keepalive_kind,
              sequence: data.status.metadata.keepalive_sequence ?? null,
              elapsedMs: data.status.metadata.keepalive_elapsed_ms ?? null,
              title: data.status.title,
            },
            {
              dedupeKey: `${eventName}:runtimeKeepalive:${data.status.metadata.keepalive_sequence ?? "unknown"}`,
            },
          );
        }
        const runtimeStatusPlan = buildAgentStreamRuntimeStatusApplyPlan({
          status: data.status,
          updatedAt: new Date().toISOString(),
        });
        setThreadItems((prev) => {
          const nextItems = applyAgentStreamRuntimeStatusToThreadItems({
            activeSessionId,
            items: prev,
            pendingItemKey,
            plan: runtimeStatusPlan,
          });
          return nextItems ?? prev;
        });
        setMessages((prev) =>
          applyAgentStreamRuntimeStatusToMessages({
            assistantMsgId,
            messages: prev,
            plan: runtimeStatusPlan,
          }),
        );
      }
      break;

    case "provider_trace": {
      activateStream();
      const runtimeStatusPlan =
        buildAgentStreamProviderTraceRuntimeStatusApplyPlan({
          executionStrategy: effectiveExecutionStrategy,
          firstRuntimeStatusAt: requestState.firstRuntimeStatusAt,
          stage: data.stage,
          updatedAt: new Date().toISOString(),
          soulCopy,
        });
      if (runtimeStatusPlan) {
        requestState.firstRuntimeStatusAt = Date.now();
        const firstRuntimeStatusContext =
          buildAgentStreamFirstRuntimeStatusMetricContext({
            activeSessionId,
            eventName,
            firstEventReceivedAt: requestState.firstEventReceivedAt,
            firstRuntimeStatusAt: requestState.firstRuntimeStatusAt,
            requestStartedAt: requestState.requestStartedAt,
            statusPhase: runtimeStatusPlan.normalizedStatus.phase,
            statusTitle: runtimeStatusPlan.normalizedStatus.title,
          });
        recordAgentStreamPerformanceMetric(
          "agentStream.firstRuntimeStatus",
          requestState.performanceTrace,
          firstRuntimeStatusContext,
        );
        logAgentDebug(
          "AgentStream",
          "firstRuntimeStatus",
          firstRuntimeStatusContext,
        );

        setThreadItems((prev) => {
          const nextItems = applyAgentStreamRuntimeStatusToThreadItems({
            activeSessionId,
            items: prev,
            pendingItemKey,
            plan: runtimeStatusPlan,
          });
          return nextItems ?? prev;
        });
        setMessages((prev) =>
          applyAgentStreamRuntimeStatusToMessages({
            assistantMsgId,
            messages: prev,
            plan: runtimeStatusPlan,
          }),
        );
      }
      break;
    }

    case "turn_context":
      if (buildAgentStreamTurnContextPreApplyPlan(data).shouldActivateStream) {
        activateStream();
      }
      setExecutionRuntime((current) =>
        applyAgentStreamTurnContextExecutionRuntime(current, data),
      );
      break;

    case "model_change":
      if (buildAgentStreamModelChangePreApplyPlan(data).shouldActivateStream) {
        activateStream();
      }
      setExecutionRuntime((current) =>
        applyAgentStreamModelChangeExecutionRuntime(current, data),
      );
      break;

    case "thinking_delta":
    case "reasoning_delta":
      {
        const eventSequence = sequenceFromAgentEvent(data);
        const shouldSurfaceVisibleProcessReasoning =
          data.type === "reasoning_delta" &&
          shouldSurfaceReasoningEventAsVisibleProcess(data);
        if (shouldSurfaceVisibleProcessReasoning) {
          requestState.shouldSurfaceVisibleProcessReasoning = true;
        }
        const effectiveSurfaceThinkingDeltas =
          surfaceThinkingDeltas ||
          requestState.shouldSurfaceVisibleProcessReasoning === true;
        if (data.type === "reasoning_delta" || eventSequence !== null) {
          noteFinalAnswerRequiredProcessBoundary(eventSequence);
          commitRenderedTextBeforeProcessPart();
        }
        const reasoningText =
          data.type === "reasoning_delta"
            ? data.text || data.delta || ""
            : data.text;
        if (!requestState.firstThinkingDeltaAt) {
          const now = Date.now();
          requestState.firstThinkingDeltaAt = now;
          const context = {
            deltaChars: reasoningText.length,
            elapsedMs: Math.max(0, now - requestState.requestStartedAt),
            eventName,
            firstEventDeltaMs: requestState.firstEventReceivedAt
              ? Math.max(0, now - requestState.firstEventReceivedAt)
              : null,
            firstRuntimeStatusDeltaMs: requestState.firstRuntimeStatusAt
              ? Math.max(0, now - requestState.firstRuntimeStatusAt)
              : null,
            surfaced: effectiveSurfaceThinkingDeltas,
            visibleProcessReasoning: shouldSurfaceVisibleProcessReasoning,
            sessionId: activeSessionId,
          };
          recordAgentStreamPerformanceMetric(
            "agentStream.firstThinkingDelta",
            requestState.performanceTrace,
            context,
          );
          logAgentDebug("AgentStream", "firstThinkingDelta", context);
        }
        const thinkingPlan = buildAgentStreamThinkingDeltaPreApplyPlan({
          surfaceThinkingDeltas: effectiveSurfaceThinkingDeltas,
        });
        if (thinkingPlan.shouldActivateStream) {
          activateStream();
        }
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== assistantMsgId) {
              return msg;
            }
            if (
              !thinkingPlan.shouldApplyThinkingDelta &&
              !isRetainedSkillProcessMessage(msg)
            ) {
              return msg;
            }

            return {
              ...msg,
              ...buildAgentStreamThinkingDeltaMessagePatch({
                appendThinkingToParts,
                contentParts: msg.contentParts,
                textDelta: reasoningText,
                thinkingContent: msg.thinkingContent,
              }),
            };
          }),
        );
        if (thinkingPlan.shouldApplyThinkingDelta) {
          requestState.streamedReasoningText = appendTextWithOverlapFallback(
            requestState.streamedReasoningText || "",
            reasoningText,
          );
          const nowIso = new Date().toISOString();
          const streamedReasoningItem = buildStreamedReasoningItem({
            activeSessionId,
            now: nowIso,
            requestState,
            sequence: sequenceFromAgentEvent(data),
          });
          if (streamedReasoningItem) {
            setThreadItems((prev) =>
              upsertThreadItemState(
                removeThreadItemState(prev, pendingItemKey),
                streamedReasoningItem,
              ),
            );
          }
        }
      }
      break;

    case "reasoning_started":
    case "reasoning_final":
      noteFinalAnswerRequiredProcessBoundary(sequenceFromAgentEvent(data));
      commitRenderedTextBeforeProcessPart();
      activateStream();
      break;

    case "reasoning_ended":
      activateStream();
      break;

    case "plan_delta":
    case "plan_final": {
      activateStream();
      clearOptimisticItem();
      noteProcessEventSequence(sequenceFromAgentEvent(data));
      commitRenderedTextBeforeProcessPart();
      const now = new Date().toISOString();
      const planItem = buildAgentStreamPlanThreadItem({
        activeSessionId,
        event: data,
        fallbackTurnId: requestState.currentTurnId || requestState.queuedTurnId,
        now,
        pendingItemKey,
        sequence: sequenceFromAgentEvent(data),
      });
      if (planItem) {
        setThreadItems((prev) =>
          upsertThreadItemState(
            removeThreadItemState(prev, pendingItemKey),
            planItem,
          ),
        );
      }
      break;
    }

    case "text_delta":
    case "text_delta_batch": {
      activateStream();
      clearOptimisticItem();
      const shouldRouteToFinalOverlay = shouldRouteTextDeltaToFinalOverlay({
        event: data,
        requestState,
      });
      if (!shouldRouteToFinalOverlay) {
        if (
          shouldSuppressLegacyTextDeltaAfterProcessBoundary({
            event: data,
            requestState,
          })
        ) {
          commitRenderedTextBeforeProcessPart();
          break;
        }
        noteProcessEventSequence(sequenceFromAgentEvent(data));
        commitRenderedTextBeforeProcessPart();
        upsertStructuredAgentMessageDeltaItem(data);
        break;
      }
      if (shouldPreserveAssistantContent) {
        break;
      }
      let visibleTextDelta = data.text;
      {
        const visibleDelta = resolveVisibleTextDeltaAfterSnapshotPrefill({
          deltaText: data.text,
          prefilledSnapshotText: requestState.prefilledMessageSnapshotText,
          replayOffset: requestState.prefilledMessageSnapshotReplayOffset,
        });
        visibleTextDelta = visibleDelta.textDelta;
        if (visibleTextDelta) {
          noteTextEventBeforeAppend(data);
        }
        const textDeltaPlan = buildAgentStreamTextDeltaApplyPlan({
          activeSessionId,
          accumulatedContent: requestState.accumulatedContent,
          deltaText: visibleDelta.textDelta,
          eventName,
          firstEventReceivedAt: requestState.firstEventReceivedAt,
          firstRuntimeStatusAt: requestState.firstRuntimeStatusAt,
          firstTextDeltaAt: requestState.firstTextDeltaAt,
          metricDeltaText: data.text,
          now: Date.now(),
          rendererEventReceivedAt: data.renderer_event_received_at,
          requestStartedAt: requestState.requestStartedAt,
          serverEventEmittedAt: data.server_event_emitted_at,
          textDeltaBufferedCount: requestState.textDeltaBufferedCount,
        });
        if (visibleDelta.nextReplayOffset === null) {
          requestState.prefilledMessageSnapshotReplayOffset = undefined;
          requestState.prefilledMessageSnapshotText = null;
        } else {
          requestState.prefilledMessageSnapshotReplayOffset =
            visibleDelta.nextReplayOffset;
        }
        requestState.textDeltaBufferedCount = textDeltaPlan.nextBufferedCount;
        if (
          textDeltaPlan.firstTextDeltaAt &&
          textDeltaPlan.firstTextDeltaContext
        ) {
          requestState.firstTextDeltaAt = textDeltaPlan.firstTextDeltaAt;
          recordAgentStreamPerformanceMetric(
            "agentStream.firstTextDelta",
            requestState.performanceTrace,
            textDeltaPlan.firstTextDeltaContext,
          );
          logAgentDebug(
            "AgentStream",
            "firstTextDelta",
            textDeltaPlan.firstTextDeltaContext,
          );
        }
        requestState.accumulatedContent = textDeltaPlan.nextAccumulatedContent;
      }
      const isStructuredFinalDelta =
        resolveTextSegmentFinalEligibility(data) === "explicit_final" &&
        Boolean(normalizeOptionalText(data.itemId));
      if (visibleTextDelta && isStructuredFinalDelta) {
        upsertStructuredAgentMessageDeltaItem(data, {
          shouldSyncMessageContentPart: false,
          shouldSyncThreadItem: false,
          textDelta: visibleTextDelta,
        });
      }
      if (visibleTextDelta) {
        if (
          !surfaceThinkingDeltas &&
          !requestState.shouldSurfaceVisibleProcessReasoning &&
          !requestState.hiddenThinkingPartsCleared
        ) {
          requestState.hiddenThinkingPartsCleared = true;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    thinkingContent: isRetainedSkillProcessMessage(msg)
                      ? msg.thinkingContent
                      : undefined,
                    contentParts: isRetainedSkillProcessMessage(msg)
                      ? msg.contentParts
                      : (msg.contentParts || []).filter(
                          (part) =>
                            part.type !== "thinking" ||
                            isPersistedReasoningContentPart(part),
                        ),
                  }
                : msg,
            ),
          );
        }
        observer?.onTextDelta?.(
          visibleTextDelta,
          requestState.accumulatedContent,
        );
        playTypewriterSound();
      }
      scheduleTextRenderFlush();
      break;
    }

    case "tool_start":
      activateStream();
      clearOptimisticItem();
      commitRenderedTextBeforeProcessPart();
      noteFinalAnswerRequiredProcessBoundary(sequenceFromAgentEvent(data));
      upsertFallbackTextOverlayIfSilent("tool_start_fallback");
      playToolcallSound();
      {
        const shouldUpdateMessageLayer =
          shouldUpdateLegacyToolMessageLayer(data);
        upsertProjectedTimelineItem(data);
        if (!shouldUpdateMessageLayer) {
          break;
        }
        handleToolStartEvent({
          data,
          setPendingActions,
          onWriteFile,
          toolLogIdByToolId,
          toolStartedAtByToolId,
          toolNameByToolId,
          assistantMsgId,
          activeSessionId,
          resolvedWorkspaceId,
          setMessages,
        });
      }
      break;

    case "tool_progress":
      activateStream();
      clearOptimisticItem();
      commitRenderedTextBeforeProcessPart();
      noteFinalAnswerRequiredProcessBoundary(sequenceFromAgentEvent(data));
      {
        const shouldUpdateMessageLayer =
          shouldUpdateLegacyToolMessageLayer(data);
        upsertProjectedTimelineItem(data);
        if (!shouldUpdateMessageLayer) {
          break;
        }
        handleToolProgressEvent({
          data,
          toolLogIdByToolId,
          assistantMsgId,
          setMessages,
        });
      }
      break;

    case "tool_input_delta":
      activateStream();
      clearOptimisticItem();
      commitRenderedTextBeforeProcessPart();
      noteFinalAnswerRequiredProcessBoundary(sequenceFromAgentEvent(data));
      {
        const shouldUpdateMessageLayer =
          shouldUpdateLegacyToolMessageLayer(data);
        upsertProjectedTimelineItem(data);
        if (!shouldUpdateMessageLayer) {
          break;
        }
        handleToolInputDeltaEvent({
          data,
          toolLogIdByToolId,
          toolStartedAtByToolId,
          toolNameByToolId,
          assistantMsgId,
          activeSessionId,
          resolvedWorkspaceId,
          setMessages,
        });
      }
      break;

    case "tool_output_delta":
      activateStream();
      clearOptimisticItem();
      commitRenderedTextBeforeProcessPart();
      noteFinalAnswerRequiredProcessBoundary(sequenceFromAgentEvent(data));
      {
        const shouldUpdateMessageLayer =
          shouldUpdateLegacyToolMessageLayer(data);
        upsertProjectedTimelineItem(data);
        if (!shouldUpdateMessageLayer) {
          break;
        }
        handleToolOutputDeltaEvent({
          data,
          toolLogIdByToolId,
          assistantMsgId,
          setMessages,
        });
      }
      break;

    case "tool_end":
      activateStream();
      clearOptimisticItem();
      commitRenderedTextBeforeProcessPart();
      noteFinalAnswerRequiredProcessBoundary(sequenceFromAgentEvent(data));
      {
        const toolEndPlan = buildAgentStreamToolEndPreApplyPlan({
          result: data.result,
          toolId: data.tool_id,
          toolNameByToolId,
        });
        if (toolEndPlan.hasMeaningfulCompletionSignal) {
          requestState.hasMeaningfulCompletionSignal = true;
        }
      }
      {
        const shouldUpdateMessageLayer =
          shouldUpdateLegacyToolMessageLayer(data);
        upsertProjectedTimelineItem(data);
        if (!shouldUpdateMessageLayer) {
          break;
        }
        handleToolEndEvent({
          data,
          onWriteFile,
          toolLogIdByToolId,
          toolStartedAtByToolId,
          toolNameByToolId,
          assistantMsgId,
          activeSessionId,
          resolvedWorkspaceId,
          setMessages,
        });
      }
      break;

    case "image_task_created":
      activateStream();
      clearOptimisticItem();
      {
        const didApplyImageTaskCreated = applyAgentStreamImageTaskCreatedEvent({
          assistantMsgId,
          currentAssistantContent: requestState.accumulatedContent,
          event: data,
          fallbackPrompt: content || requestState.accumulatedContent,
          pendingPresentation: requestState.pendingImageTaskPresentation,
          setMessages,
        });
        requestState.hasMeaningfulCompletionSignal =
          didApplyImageTaskCreated ||
          requestState.hasMeaningfulCompletionSignal;
        if (didApplyImageTaskCreated) {
          requestState.pendingImageTaskPresentation = null;
        }
      }
      break;

    case "image_task_presentation_generated":
      activateStream();
      clearOptimisticItem();
      applyAgentStreamImageTaskPresentationGeneratedEvent({
        assistantMsgId,
        event: data,
        cachePresentation: (presentation) => {
          const existing = requestState.pendingImageTaskPresentation;
          requestState.pendingImageTaskPresentation = {
            assistantIntro:
              presentation.assistantIntro || existing?.assistantIntro || "",
            completionCaption:
              presentation.completionCaption ||
              existing?.completionCaption ||
              "",
            workflowRunId:
              presentation.workflowRunId ?? existing?.workflowRunId ?? null,
            turnId: presentation.turnId ?? existing?.turnId ?? null,
          };
        },
        setMessages,
      });
      break;

    case "artifact_snapshot":
      {
        const artifactPlan = buildAgentStreamArtifactSnapshotPreApplyPlan({
          artifact: data.artifact,
        });
        if (artifactPlan.shouldActivateStream) {
          activateStream();
        }
        if (artifactPlan.shouldClearOptimisticItem) {
          clearOptimisticItem();
        }
        if (artifactPlan.shouldMarkMeaningfulCompletionSignal) {
          requestState.hasMeaningfulCompletionSignal = true;
        }
      }
      handleArtifactSnapshotEvent({
        data,
        onWriteFile,
        assistantMsgId,
        activeSessionId,
        resolvedWorkspaceId,
        setMessages,
      });
      break;

    case "action_required":
      {
        const actionPlan = buildAgentStreamActionRequiredPreApplyPlan(data);
        if (actionPlan.shouldActivateStream) {
          activateStream();
        }
        if (actionPlan.shouldClearOptimisticItem) {
          clearOptimisticItem();
        }
        if (actionPlan.shouldMarkMeaningfulCompletionSignal) {
          requestState.hasMeaningfulCompletionSignal = true;
        }
      }
      noteProcessEventSequence(sequenceFromAgentEvent(data));
      commitRenderedTextBeforeProcessPart();
      bindAssistantMessageToRuntimeTurn(
        setMessages,
        assistantMsgId,
        data.scope?.turn_id,
      );
      upsertProjectedTimelineItem(data);
      handleActionRequiredEvent({
        data,
        eventName,
        actionLoggedKeys,
        effectiveExecutionStrategy,
        runtime,
        setPendingActions,
        assistantMsgId,
        activeSessionId,
        resolvedWorkspaceId,
        setMessages,
      });
      break;

    case "action_resolved":
      activateStream();
      bindAssistantMessageToRuntimeTurn(
        setMessages,
        assistantMsgId,
        data.scope?.turn_id,
      );
      upsertProjectedTimelineItem(data);
      {
        const actionType = normalizeActionType(data.action_type);
        if (actionType) {
          const requestIds = new Set([data.request_id]);
          const submittedUserData = resolveActionResolvedUserData(data);
          const submittedResponse =
            stringifySubmittedActionResponse(submittedUserData) ||
            stringifySubmittedActionResponse(data.feedback);
          setPendingActions((prev) =>
            removeActionsByRequestIds(prev, requestIds),
          );
          setMessages((prev) =>
            applyAcknowledgedActionRequests({
              messages: prev,
              requestIds,
              shouldPersistSubmittedAction:
                shouldPersistSubmittedActionForType(actionType),
              submittedResponse,
              submittedUserData,
            }),
          );
          setThreadItems((prev) =>
            markThreadActionItemSubmitted(
              prev,
              requestIds,
              submittedResponse,
              submittedUserData,
            ),
          );
        }
      }
      break;

    case "context_trace":
      {
        const contextTracePlan = buildAgentStreamContextTracePreApplyPlan(data);
        if (contextTracePlan.shouldActivateStream) {
          activateStream();
        }
        if (contextTracePlan.shouldClearOptimisticItem) {
          clearOptimisticItem();
        }
      }
      handleContextTraceEvent({
        data,
        assistantMsgId,
        activeSessionId,
        resolvedWorkspaceId,
        setMessages,
      });
      break;

    case "error": {
      clearQueuedDraftCleanupTimer();
      flushPendingTextRender();
      if (isRuntimePermissionConfirmationWaitMessage(data.message)) {
        clearOptimisticItem();
        finishRequestLog(requestState, {
          eventType: "chat_request_complete",
          status: "success",
          description: "等待用户确认运行时权限",
        });
        setMessages((prev) => {
          const nextMessages = prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...updateMessageArtifactsStatus(msg, "complete"),
                  ...buildStreamingTextCommitPatch(msg),
                  isThinking: false,
                }
              : msg,
          );
          persistRetainedSkillProcessSnapshot(nextMessages);
          return nextMessages;
        });
        clearStreamingTextOverlay();
        finalizeTerminalStreamState();
        break;
      }
      if (isAgentStreamEmptyFinalReplyError(data.message)) {
        clearOptimisticItem();
        clearOptimisticTurn();
        const emptyFinalErrorPlan = buildAgentStreamEmptyFinalErrorPlan({
          errorMessage: data.message,
          accumulatedContent: requestState.accumulatedContent,
          fallbackContent: assistantFallbackContent,
          hasMeaningfulCompletionSignal:
            requestState.hasMeaningfulCompletionSignal,
          queuedTurnId: requestState.queuedTurnId,
        });
        if (emptyFinalErrorPlan.type === "missing_final_reply_failure") {
          finalizeMissingFinalReplyFailure(emptyFinalErrorPlan);
          break;
        }
        finishRequestLog(requestState, emptyFinalErrorPlan.requestLogPayload);
        const gracefulContent = emptyFinalErrorPlan.finalContent;
        observer?.onComplete?.(gracefulContent);
        setMessages((prev) => {
          const nextMessages = prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...updateMessageArtifactsStatus(msg, "complete"),
                  ...buildAgentStreamCompletedAssistantMessagePatch({
                    parts: msg.contentParts,
                    finalContent: gracefulContent,
                    previousContent: msg.content,
                    rawContent: requestState.accumulatedContent,
                    surfaceThinkingDeltas:
                      surfaceThinkingDeltas ||
                      requestState.shouldSurfaceVisibleProcessReasoning ===
                        true ||
                      Boolean(msg.imageWorkbenchPreview) ||
                      isRetainedSkillProcessMessage(msg),
                    preserveThinkingContent:
                      requestState.shouldSurfaceVisibleProcessReasoning ===
                        true || Boolean(msg.imageWorkbenchPreview),
                    thinkingContent: msg.thinkingContent,
                    toolCalls: msg.toolCalls,
                  }),
                }
              : msg,
          );
          persistRetainedSkillProcessSnapshot(nextMessages);
          return nextMessages;
        });
        clearStreamingTextOverlay();
        finalizeTerminalStreamState();
        break;
      }

      const errorFailurePlan = buildAgentStreamErrorFailurePlan({
        errorMessage: data.message,
        queuedTurnId: requestState.queuedTurnId,
      });
      markFailedTimelineState(errorFailurePlan.errorMessage);
      finishRequestLog(requestState, errorFailurePlan.requestLogPayload);
      observer?.onError?.(errorFailurePlan.errorMessage);
      applyAgentStreamErrorToastPlan(errorFailurePlan.toast, toast);
      setMessages((prev) => {
        const nextMessages = prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...updateMessageArtifactsStatus(msg, "error"),
                ...buildAgentStreamFailedAssistantMessagePatch({
                  errorMessage: errorFailurePlan.errorMessage,
                  accumulatedContent: requestState.accumulatedContent,
                  previousContent: msg.content,
                  previousContentParts: msg.contentParts,
                  soulCopy,
                }),
              }
            : msg,
        );
        persistRetainedSkillProcessSnapshot(nextMessages);
        return nextMessages;
      });
      clearStreamingTextOverlay();
      finalizeTerminalStreamState();
      break;
    }

    case "warning": {
      const warningKey = `${activeSessionId}:${data.code || data.message}`;
      const warningPlan = buildAgentStreamWarningPlan({
        activeSessionId,
        alreadyWarned: warnedKeysRef.current.has(warningKey),
        code: data.code,
        message: data.message,
      });
      if (warningPlan.shouldMarkWarned && warningPlan.warningKey) {
        warnedKeysRef.current.add(warningPlan.warningKey);
      }
      applyAgentStreamWarningToastAction(
        buildAgentStreamWarningToastAction(warningPlan.toast),
        toast,
      );
      break;
    }

    default:
      break;
  }
}
