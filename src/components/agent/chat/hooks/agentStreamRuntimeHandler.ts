import { toast } from "sonner";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  AgentEvent,
  AgentThreadItem,
  AgentThreadTurn,
} from "@/lib/api/agentProtocol";
import type {
  AsterExecutionStrategy,
  AsterSessionExecutionRuntime,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import { activityLogger } from "@/lib/workspace/workbenchRuntime";
import { logAgentDebug } from "@/lib/agentDebug";
import type { ActionRequired, Message } from "../types";
import { appendTextToParts } from "./agentChatHistory";
import { updateMessageArtifactsStatus } from "../utils/messageArtifacts";
import {
  markThreadActionItemSubmitted,
  removeThreadItemState,
  removeThreadTurnState,
  upsertThreadItemState,
  upsertThreadTurnState,
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
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import { settleInterruptedMessageProcess } from "./agentStreamFlowControl";
import {
  buildAgentStreamCompletedAssistantMessagePatch,
  buildAgentStreamEmptyFinalErrorPlan,
  buildAgentStreamFinalDonePlan,
  buildAgentStreamMissingFinalReplyFailurePlan,
  buildAgentStreamMissingFinalReplyFailureSideEffectPlan,
  type AgentStreamMissingFinalReplyPlan,
  isAgentStreamEmptyFinalReplyError,
  reconcileAgentStreamFinalContentParts,
} from "./agentStreamCompletionController";
import {
  applyAgentStreamErrorToastPlan,
  buildAgentStreamErrorFailurePlan,
  buildAgentStreamFailedAssistantMessagePatch,
  buildAgentStreamFailedTimelineStatePlan,
  buildAgentStreamFailedTimelineItemUpdate,
  buildAgentStreamFailedTimelineTurnUpdate,
} from "./agentStreamErrorController";
import {
  recordAgentStreamPerformanceMetric,
  type AgentUiPerformanceTraceMetadata,
} from "./agentStreamPerformanceMetrics";
import {
  buildAgentStreamRequestLogFinishPlan,
  type AgentStreamRequestLogFinishPayload,
} from "./agentStreamRequestLogController";
import {
  buildAgentStreamFirstRuntimeStatusMetricContext,
  shouldRecordAgentStreamFirstRuntimeStatus,
} from "./agentStreamRuntimeMetricsController";
import {
  buildAgentStreamRuntimeStatusApplyPlan,
  buildAgentStreamRuntimeSummaryItemUpdate,
} from "./agentStreamRuntimeStatusController";
import { buildAgentStreamTextDeltaApplyPlan } from "./agentStreamTextDeltaController";
import {
  clearAgentStreamTextOverlay,
  upsertAgentStreamTextOverlay,
} from "./agentStreamTextOverlayStore";
import {
  buildAgentStreamFirstTextPaintContext,
  buildAgentStreamTextRenderFlushPlan,
} from "./agentStreamTextRenderFlushController";
import {
  buildAgentStreamQueuedDraftCleanupTimerFirePlan,
  buildAgentStreamQueuedDraftCleanupTimerSchedulePlan,
  buildAgentStreamTextRenderTimerSchedulePlan,
  buildAgentStreamTimerClearPlan,
} from "./agentStreamTimerController";
import {
  applyAgentStreamWarningToastAction,
  buildAgentStreamWarningPlan,
  buildAgentStreamWarningToastAction,
} from "./agentStreamWarningController";
import {
  buildAgentStreamQueuedDraftStatePlan,
  shouldWatchAgentStreamQueuedDraftCleanup,
  shouldWatchAgentStreamQueuedDraftCleanupForCleared,
} from "./agentStreamQueueController";
import {
  buildAgentStreamTurnStartedPendingItemUpdate,
  shouldDeferAgentStreamThreadItemUpdate,
} from "./agentStreamThreadItemController";
import { projectAgentStreamTimelineItem } from "./agentStreamTimelineItemProjector";
import { buildAgentStreamToolEndPreApplyPlan } from "./agentStreamToolEventController";
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
import { saveAgentSessionCachedMessagesSnapshot } from "./agentSessionScopedStorage";
import { isRuntimePermissionConfirmationWaitMessage } from "../utils/runtimeActionConfirmation";
import { buildAgentUiProjectionEvents } from "../projection/agentUiEventProjection";
import { recordAgentUiProjectionEvents } from "../projection/conversationProjectionStore";
import { isRetainedSkillProcessMessage } from "../utils/skillInlineProcessRetention";
import {
  applyAcknowledgedActionRequests,
  removeActionsByRequestIds,
  shouldPersistSubmittedActionForType,
} from "./agentChatActionState";
import { normalizeActionType } from "./agentChatCoreUtils";

function extractVisibleTextFromAgentMessage(
  message: AgentEvent extends never
    ? never
    : {
        content?: Array<{ type?: string; text?: string }>;
      },
): string {
  const parts = Array.isArray(message.content) ? message.content : [];
  return parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part?.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");
}

type MessageParts = NonNullable<Message["contentParts"]>;

interface StreamObserver {
  onTextDelta?: (delta: string, accumulated: string) => void;
  onComplete?: (content: string) => void;
  onError?: (message: string) => void;
}

interface StreamRequestState {
  accumulatedContent: string;
  hasMeaningfulCompletionSignal?: boolean;
  queuedTurnId: string | null;
  requestLogId: string | null;
  requestStartedAt: number;
  submissionDispatchedAt?: number | null;
  listenerBoundAt?: number | null;
  firstEventReceivedAt?: number | null;
  firstRuntimeStatusAt?: number | null;
  firstThinkingDeltaAt?: number | null;
  firstTextDeltaAt?: number | null;
  firstTextPaintAt?: number | null;
  firstTextPaintScheduled?: boolean;
  firstTextRenderFlushAt?: number | null;
  lastTextRenderFlushAt?: number | null;
  textDeltaBufferedCount?: number;
  textDeltaFlushCount?: number;
  maxTextDeltaBacklogChars?: number;
  requestFinished: boolean;
  queuedDraftCleanupTimerId?: ReturnType<typeof setTimeout> | null;
  pendingTextRenderTimerId?: ReturnType<typeof setTimeout> | null;
  prefilledMessageSnapshotReplayOffset?: number;
  prefilledMessageSnapshotText?: string | null;
  renderedContent?: string;
  preservedAssistantContentInitialized?: boolean;
  hiddenThinkingPartsCleared?: boolean;
  performanceTrace?: AgentUiPerformanceTraceMetadata | null;
  agentUiEventSequence?: number;
  currentTurnId?: string | null;
  streamedReasoningItemId?: string | null;
  streamedReasoningText?: string;
  streamedReasoningStartedAt?: string | null;
  streamedReasoningSequence?: number | null;
  streamedReasoningSegmentCounter?: number;
}

function appendTextWithOverlapFallback(base: string, delta: string): string {
  if (!base) {
    return delta;
  }
  if (!delta) {
    return base;
  }
  if (delta.startsWith(base)) {
    return delta;
  }
  if (base.endsWith(delta)) {
    return base;
  }

  const maxOverlap = Math.min(base.length, delta.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (base.endsWith(delta.slice(0, overlap))) {
      return `${base}${delta.slice(overlap)}`;
    }
  }

  return `${base}${delta}`;
}

function resolveStreamedReasoningTurnId(
  requestState: StreamRequestState,
): string | null {
  return (
    requestState.currentTurnId?.trim() ||
    requestState.queuedTurnId?.trim() ||
    null
  );
}

function buildStreamedReasoningItem(params: {
  activeSessionId: string;
  now: string;
  requestState: StreamRequestState;
  sequence?: number | null;
}): AgentThreadItem | null {
  const turnId = resolveStreamedReasoningTurnId(params.requestState);
  const text = params.requestState.streamedReasoningText?.trim();
  if (!turnId || !text) {
    return null;
  }

  let itemId = params.requestState.streamedReasoningItemId;
  if (!itemId) {
    const sequence =
      typeof params.sequence === "number" && Number.isFinite(params.sequence)
        ? params.sequence
        : null;
    if (sequence !== null) {
      itemId = `streamed-reasoning:${turnId}:${sequence}`;
    } else {
      const nextCounter =
        (params.requestState.streamedReasoningSegmentCounter ?? 0) + 1;
      params.requestState.streamedReasoningSegmentCounter = nextCounter;
      itemId = `streamed-reasoning:${turnId}:local-${nextCounter}`;
    }
    params.requestState.streamedReasoningItemId = itemId;
    params.requestState.streamedReasoningSequence = sequence;
  }
  const startedAt =
    params.requestState.streamedReasoningStartedAt || params.now;
  params.requestState.streamedReasoningStartedAt = startedAt;
  const itemSequence =
    typeof params.requestState.streamedReasoningSequence === "number"
      ? params.requestState.streamedReasoningSequence
      : 0;

  return {
    id: itemId,
    thread_id: params.activeSessionId,
    turn_id: turnId,
    sequence: itemSequence,
    status: "in_progress",
    started_at: startedAt,
    updated_at: params.now,
    type: "reasoning",
    text,
  };
}

function isStreamedReasoningTimelineItem(
  item: AgentThreadItem,
  turnId?: string | null,
): boolean {
  return (
    item.type === "reasoning" &&
    item.id.startsWith("streamed-reasoning:") &&
    (!turnId || item.turn_id === turnId)
  );
}

function removeStreamedReasoningTimelineItems(
  items: AgentThreadItem[],
  turnId?: string | null,
): AgentThreadItem[] {
  const nextItems = items.filter(
    (item) => !isStreamedReasoningTimelineItem(item, turnId),
  );
  return nextItems.length === items.length ? items : nextItems;
}

function resetStreamedReasoningSegment(requestState: StreamRequestState): void {
  requestState.streamedReasoningItemId = null;
  requestState.streamedReasoningText = "";
  requestState.streamedReasoningStartedAt = null;
  requestState.streamedReasoningSequence = null;
}

function resolveToolLegacyEventTurnId(
  event: Extract<
    AgentEvent,
    {
      type:
        | "tool_start"
        | "tool_input_delta"
        | "tool_progress"
        | "tool_output_delta"
        | "tool_end";
    }
  >,
  fallbackTurnId: string | null | undefined,
): string {
  return event.turn_id?.trim() || fallbackTurnId?.trim() || "";
}

function findThreadItemForLegacyToolEvent(params: {
  event: Extract<
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
  fallbackTurnId: string | null | undefined;
  items: readonly AgentThreadItem[];
}): AgentThreadItem | undefined {
  const turnId = resolveToolLegacyEventTurnId(
    params.event,
    params.fallbackTurnId,
  );
  return params.items.find((item) => {
    if (item.type !== "tool_call" || item.id !== params.event.tool_id) {
      return false;
    }
    if (!turnId) {
      return true;
    }
    return item.turn_id === turnId;
  });
}

function isItemLifecycleToolItem(item: AgentThreadItem | undefined): boolean {
  if (!item || item.type !== "tool_call") {
    return false;
  }
  const metadata =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : null;
  if (metadata?.source === "item_lifecycle") {
    return true;
  }
  return (
    metadata?.source !== "legacy_tool_event" &&
    metadata?.runtime_event_source !== "legacy_tool_event"
  );
}

function shouldLetLegacyToolEventUpdateMessageLayer(params: {
  event: Extract<
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
  fallbackTurnId: string | null | undefined;
  items: readonly AgentThreadItem[];
}): boolean {
  const item = findThreadItemForLegacyToolEvent({
    event: params.event,
    fallbackTurnId: params.fallbackTurnId,
    items: params.items,
  });
  if (!isItemLifecycleToolItem(item)) {
    return true;
  }
  return false;
}

function stringifyThreadItemToolArguments(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type MessageToolCallState = NonNullable<Message["toolCalls"]>[number];
type MessageToolCallResult = NonNullable<MessageToolCallState["result"]>;

function toolExecutionResultFromThreadItem(
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
): MessageToolCallResult | undefined {
  if (item.status === "in_progress") {
    return undefined;
  }
  return {
    success: item.success ?? item.status === "completed",
    output: item.output || "",
    error: item.error,
    metadata:
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : undefined,
  };
}

function toolCallStateFromThreadItem(
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
): MessageToolCallState {
  return {
    id: item.id,
    name: item.tool_name || item.id,
    arguments: stringifyThreadItemToolArguments(item.arguments),
    status:
      item.status === "failed"
        ? "failed"
        : item.status === "completed"
          ? "completed"
          : "running",
    result: toolExecutionResultFromThreadItem(item),
    metadata:
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : undefined,
    startTime: item.started_at ? new Date(item.started_at) : new Date(),
    endTime: item.completed_at ? new Date(item.completed_at) : undefined,
  };
}

function mergeToolCallStateFromItem(
  existing: MessageToolCallState | undefined,
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
): MessageToolCallState {
  const fromItem = toolCallStateFromThreadItem(item);
  return {
    ...existing,
    ...fromItem,
    arguments: fromItem.arguments ?? existing?.arguments,
    result: fromItem.result ?? existing?.result,
    progress: item.status === "in_progress" ? existing?.progress : undefined,
    logs: existing?.logs,
  };
}

function mergeThreadItemMetadataIntoToolUsePart(
  part: Extract<NonNullable<Message["contentParts"]>[number], { type: "tool_use" }>,
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
): Extract<NonNullable<Message["contentParts"]>[number], { type: "tool_use" }> {
  const itemMetadata = metadataFromThreadItem(item);
  const metadata = {
    ...(itemMetadata ?? {}),
    ...(part.metadata ?? {}),
    sequence: item.sequence,
    turnId: item.turn_id,
  };
  return {
    ...part,
    metadata,
  };
}

function syncExistingMessageToolCallFromThreadItem(params: {
  assistantMsgId: string;
  item: AgentThreadItem;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}): void {
  if (params.item.type !== "tool_call") {
    return;
  }
  const toolCallItem = params.item;
  params.setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== params.assistantMsgId) {
        return message;
      }
      const hasExistingToolCall = Boolean(
        message.toolCalls?.some((toolCall) => toolCall.id === params.item.id),
      );
      const hasExistingToolUsePart = Boolean(
        message.contentParts?.some(
          (part) =>
            part.type === "tool_use" && part.toolCall.id === params.item.id,
        ),
      );
      if (!hasExistingToolCall && !hasExistingToolUsePart) {
        return message;
      }

      const updateToolCall = (
        toolCall: MessageToolCallState,
      ): MessageToolCallState =>
        toolCall.id === toolCallItem.id
          ? mergeToolCallStateFromItem(toolCall, toolCallItem)
          : toolCall;

      return {
        ...message,
        toolCalls: message.toolCalls?.map(updateToolCall),
        contentParts: message.contentParts?.map((part) =>
          part.type === "tool_use" && part.toolCall.id === toolCallItem.id
            ? {
                ...mergeThreadItemMetadataIntoToolUsePart(part, toolCallItem),
                toolCall: updateToolCall(part.toolCall),
              }
            : part,
        ),
      };
    }),
  );
}

function metadataFromThreadItem(
  item: AgentThreadItem,
): Record<string, unknown> | undefined {
  return item.metadata && typeof item.metadata === "object"
    ? (item.metadata as Record<string, unknown>)
    : undefined;
}

function isReasoningPartForThreadItem(
  part: NonNullable<Message["contentParts"]>[number],
  itemId: string,
): boolean {
  return part.type === "thinking" && part.metadata?.threadItemId === itemId;
}

function isPersistedReasoningContentPart(
  part: NonNullable<Message["contentParts"]>[number],
): boolean {
  return (
    part.type === "thinking" &&
    part.metadata?.source === "thread_item_reasoning" &&
    Boolean(part.metadata.threadItemId)
  );
}

function threadItemToolSequenceById(
  items: readonly AgentThreadItem[],
  turnId?: string | null,
): Map<string, number> {
  const sequenceById = new Map<string, number>();
  const normalizedTurnId = turnId?.trim();
  for (const item of items) {
    if (item.type !== "tool_call") {
      continue;
    }
    if (normalizedTurnId && item.turn_id !== normalizedTurnId) {
      continue;
    }
    sequenceById.set(item.id, item.sequence);
  }
  return sequenceById;
}

function isComparableThreadItemSequence(sequence: unknown): sequence is number {
  return (
    typeof sequence === "number" &&
    Number.isFinite(sequence) &&
    sequence < Number.MAX_SAFE_INTEGER
  );
}

function contentPartSequence(
  part: NonNullable<Message["contentParts"]>[number],
  sequenceByToolId: Map<string, number>,
): number | null {
  const sequence = part.metadata?.sequence;
  if (isComparableThreadItemSequence(sequence)) {
    return sequence;
  }
  if (part.type === "tool_use") {
    const itemSequence = sequenceByToolId.get(part.toolCall.id);
    return isComparableThreadItemSequence(itemSequence) ? itemSequence : null;
  }
  return null;
}

function upsertToolSequenceIntoContentParts(
  parts: NonNullable<Message["contentParts"]>,
  sequenceByToolId: Map<string, number>,
): NonNullable<Message["contentParts"]> {
  let changed = false;
  const nextParts = parts.map((part) => {
    if (part.type !== "tool_use") {
      return part;
    }
    if (
      isComparableThreadItemSequence(part.metadata?.sequence)
    ) {
      return part;
    }
    const sequence = sequenceByToolId.get(part.toolCall.id);
    if (!isComparableThreadItemSequence(sequence)) {
      return part;
    }
    changed = true;
    return {
      ...part,
      metadata: {
        ...(part.metadata ?? {}),
        sequence,
      },
    };
  });
  return changed ? nextParts : parts;
}

function insertReasoningPartByContentSequence(params: {
  parts: NonNullable<Message["contentParts"]>;
  reasoningPart: NonNullable<Message["contentParts"]>[number];
  reasoningSequence: number;
  sequenceByToolId: Map<string, number>;
}): NonNullable<Message["contentParts"]> {
  let insertAfterIndex = -1;
  for (let index = 0; index < params.parts.length; index += 1) {
    const sequence = contentPartSequence(
      params.parts[index]!,
      params.sequenceByToolId,
    );
    if (sequence !== null && sequence <= params.reasoningSequence) {
      insertAfterIndex = index;
    }
  }

  if (insertAfterIndex >= 0) {
    return [
      ...params.parts.slice(0, insertAfterIndex + 1),
      params.reasoningPart,
      ...params.parts.slice(insertAfterIndex + 1),
    ];
  }

  const firstTextIndex = params.parts.findIndex((part) => part.type === "text");
  if (firstTextIndex >= 0) {
    return [
      ...params.parts.slice(0, firstTextIndex),
      params.reasoningPart,
      ...params.parts.slice(firstTextIndex),
    ];
  }

  return [...params.parts, params.reasoningPart];
}

function hasComparableContentPartSequence(
  parts: NonNullable<Message["contentParts"]>,
  sequenceByToolId: Map<string, number>,
): boolean {
  return parts.some(
    (part) => contentPartSequence(part, sequenceByToolId) !== null,
  );
}

function syncAssistantReasoningContentPartFromThreadItem(params: {
  assistantMsgId: string;
  item: AgentThreadItem;
  threadItems?: readonly AgentThreadItem[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
}): void {
  if (params.item.type !== "reasoning") {
    return;
  }

  const text = params.item.text?.trim();
  if (!text) {
    return;
  }

  params.setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== params.assistantMsgId) {
        return message;
      }

      const metadata = {
        ...(metadataFromThreadItem(params.item) ?? {}),
        source: "thread_item_reasoning",
        threadItemId: params.item.id,
        sequence: params.item.sequence,
        turnId: params.item.turn_id,
      };
      const sequenceByToolId = threadItemToolSequenceById(
        params.threadItems ?? [],
        params.item.turn_id,
      );
      const parts = upsertToolSequenceIntoContentParts(
        message.contentParts || [],
        sequenceByToolId,
      );
      const existingIndex = parts.findIndex((part) =>
        isReasoningPartForThreadItem(part, params.item.id),
      );
      const nextPart: NonNullable<Message["contentParts"]>[number] = {
        type: "thinking",
        text,
        metadata,
      };

      if (existingIndex >= 0) {
        const existingPart = parts[existingIndex];
        const remainingParts = [
          ...parts.slice(0, existingIndex),
          ...parts.slice(existingIndex + 1),
        ];
        if (!hasComparableContentPartSequence(remainingParts, sequenceByToolId)) {
          const nextParts = [...parts];
          nextParts[existingIndex] = nextPart;
          if (
            existingPart?.type === "thinking" &&
            existingPart.text === text &&
            existingPart.metadata?.turnId === params.item.turn_id
          ) {
            return message;
          }
          return {
            ...message,
            contentParts: nextParts,
          };
        }
        const nextParts = insertReasoningPartByContentSequence({
          parts: remainingParts,
          reasoningPart: nextPart,
          reasoningSequence: params.item.sequence,
          sequenceByToolId,
        });
        if (
          existingPart?.type === "thinking" &&
          existingPart.text === text &&
          existingPart.metadata?.turnId === params.item.turn_id &&
          nextParts === parts
        ) {
          return message;
        }
        return {
          ...message,
          contentParts: nextParts,
        };
      }

      return {
        ...message,
        contentParts: insertReasoningPartByContentSequence({
          parts,
          reasoningPart: nextPart,
          reasoningSequence: params.item.sequence,
          sequenceByToolId,
        }),
      };
    }),
  );
}

function sequenceFromAgentEvent(event: AgentEvent): number | null {
  return typeof event.sequence === "number" && Number.isFinite(event.sequence)
    ? event.sequence
    : null;
}

function hasOwnRecordKeys(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length > 0,
  );
}

function resolveActionResolvedUserData(
  event: Extract<AgentEvent, { type: "action_resolved" }>,
): unknown {
  if (hasOwnRecordKeys(event.data)) {
    return event.data;
  }
  if (event.feedback?.trim()) {
    return event.feedback.trim();
  }
  if (typeof event.approved === "boolean") {
    return { approved: event.approved };
  }
  return undefined;
}

function stringifySubmittedActionResponse(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text || undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveVisibleTextDeltaAfterSnapshotPrefill(params: {
  deltaText: string;
  prefilledSnapshotText?: string | null;
  replayOffset?: number | null;
}): {
  nextReplayOffset: number | null;
  textDelta: string;
} {
  const snapshotText = params.prefilledSnapshotText || "";
  if (!snapshotText) {
    return { nextReplayOffset: null, textDelta: params.deltaText };
  }

  const replayOffset = Math.max(0, params.replayOffset ?? 0);
  const replayRemainder = snapshotText.slice(replayOffset);
  if (!params.deltaText) {
    return { nextReplayOffset: replayOffset, textDelta: "" };
  }

  if (replayRemainder.startsWith(params.deltaText)) {
    return {
      nextReplayOffset: replayOffset + params.deltaText.length,
      textDelta: "",
    };
  }

  if (params.deltaText.startsWith(replayRemainder)) {
    return {
      nextReplayOffset: null,
      textDelta: params.deltaText.slice(replayRemainder.length),
    };
  }

  return { nextReplayOffset: null, textDelta: params.deltaText };
}

interface StreamLifecycleCallbacks {
  activateStream: () => void;
  isStreamActivated: () => boolean;
  clearOptimisticItem: () => void;
  clearOptimisticTurn: () => void;
  disposeListener: () => void;
  removeQueuedDraftMessages: () => void;
  clearActiveStreamIfMatch: (eventName: string) => boolean;
  upsertQueuedTurn: (queuedTurn: QueuedTurnSnapshot) => void;
  removeQueuedTurnState: (queuedTurnIds: string[]) => void;
  playToolcallSound: () => void;
  playTypewriterSound: () => void;
  appendThinkingToParts: (
    parts: MessageParts,
    textDelta: string,
  ) => MessageParts;
}

interface HandleTurnStreamEventOptions {
  data: AgentEvent;
  requestState: StreamRequestState;
  callbacks: StreamLifecycleCallbacks;
  observer?: StreamObserver;
  eventName: string;
  pendingTurnKey: string;
  pendingItemKey: string;
  assistantMsgId: string;
  activeSessionId: string;
  resolvedWorkspaceId: string;
  effectiveExecutionStrategy: AsterExecutionStrategy;
  surfaceThinkingDeltas?: boolean;
  preserveAssistantContent?: string | null;
  assistantFallbackContent?: string | null;
  content: string;
  runtime: AgentRuntimeAdapter;
  _webSearch?: boolean;
  warnedKeysRef: MutableRefObject<Set<string>>;
  actionLoggedKeys: Set<string>;
  toolLogIdByToolId: Map<string, string>;
  toolStartedAtByToolId: Map<string, number>;
  toolNameByToolId: Map<string, string>;
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: import("../types").WriteArtifactContext,
  ) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setPendingActions: Dispatch<SetStateAction<ActionRequired[]>>;
  getThreadItems?: () => readonly AgentThreadItem[];
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setExecutionRuntime: Dispatch<
    SetStateAction<AsterSessionExecutionRuntime | null>
  >;
  setIsSending: Dispatch<SetStateAction<boolean>>;
}

function bindAssistantMessageToRuntimeTurn(
  setMessages: Dispatch<SetStateAction<Message[]>>,
  assistantMsgId: string,
  turnId?: string | null,
) {
  const normalizedTurnId = turnId?.trim();
  if (!normalizedTurnId) {
    return;
  }

  setMessages((prev) =>
    prev.map((message) =>
      message.id === assistantMsgId &&
      message.runtimeTurnId !== normalizedTurnId
        ? {
            ...message,
            runtimeTurnId: normalizedTurnId,
          }
        : message,
    ),
  );
}

function hasRetainedSkillInlineProcess(message: Message): boolean {
  return (
    isRetainedSkillProcessMessage(message) &&
    (Boolean(message.thinkingContent?.trim()) ||
      Boolean(
        message.contentParts?.some(
          (part) => part.type === "thinking" && part.text.trim().length > 0,
        ),
      ))
  );
}

function finishRequestLog(
  requestState: StreamRequestState,
  payload: AgentStreamRequestLogFinishPayload,
) {
  const requestLogPlan = buildAgentStreamRequestLogFinishPlan({
    requestLogId: requestState.requestLogId,
    requestFinished: requestState.requestFinished,
    requestStartedAt: requestState.requestStartedAt,
    finishedAt: Date.now(),
    payload,
  });
  if (
    !requestLogPlan.shouldUpdate ||
    !requestLogPlan.logId ||
    !requestLogPlan.updatePayload
  ) {
    return;
  }

  requestState.requestFinished = requestLogPlan.nextRequestFinished;
  activityLogger.updateLog(requestLogPlan.logId, requestLogPlan.updatePayload);
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
}: HandleTurnStreamEventOptions): void {
  const {
    activateStream,
    isStreamActivated,
    clearOptimisticItem,
    clearOptimisticTurn,
    disposeListener,
    removeQueuedDraftMessages,
    clearActiveStreamIfMatch,
    upsertQueuedTurn,
    removeQueuedTurnState,
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
  });
  if (projectionEvents.length > 0) {
    requestState.agentUiEventSequence =
      (requestState.agentUiEventSequence ?? 0) + projectionEvents.length;
    recordAgentUiProjectionEvents(projectionEvents);
  }

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
          requestStartedAt: requestState.requestStartedAt,
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
    const renderedContent = requestState.renderedContent || "";
    if (!renderedContent.trim()) {
      return;
    }

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== assistantMsgId) {
          return msg;
        }

        const currentText = (msg.contentParts || [])
          .filter((part): part is Extract<typeof part, { type: "text" }> => {
            return part.type === "text";
          })
          .map((part) => part.text)
          .join("");
        if (currentText === renderedContent) {
          return msg;
        }
        if (currentText && renderedContent.startsWith(currentText)) {
          const pendingText = renderedContent.slice(currentText.length);
          if (!pendingText.trim()) {
            return msg;
          }
          return {
            ...msg,
            content: renderedContent,
            contentParts: appendTextToParts(
              surfaceThinkingDeltas
                ? msg.contentParts || []
                : (msg.contentParts || []).filter(
                    (part) =>
                      part.type !== "thinking" ||
                      isPersistedReasoningContentPart(part),
                  ),
              pendingText,
            ),
          };
        }

        return {
          ...msg,
          content: renderedContent,
          contentParts: reconcileAgentStreamFinalContentParts({
            parts: msg.contentParts,
            finalContent: renderedContent,
            rawContent: requestState.accumulatedContent || renderedContent,
            surfaceThinkingDeltas:
              surfaceThinkingDeltas || isRetainedSkillProcessMessage(msg),
          }),
        };
      }),
    );
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
    const finalContent = requestState.accumulatedContent || msg.content;
    if (!finalContent) {
      return {};
    }

    return {
      content: finalContent,
      contentParts: reconcileAgentStreamFinalContentParts({
        parts: msg.contentParts,
        finalContent,
        rawContent: requestState.accumulatedContent || finalContent,
        surfaceThinkingDeltas:
          surfaceThinkingDeltas || isRetainedSkillProcessMessage(msg),
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
      const failedTurn = buildAgentStreamFailedTimelineTurnUpdate({
        activeSessionId: failedTimelinePlan.activeSessionId,
        errorMessage: failedTimelinePlan.errorMessage,
        failedAt: failedTimelinePlan.failedAt,
        pendingTurnKey: failedTimelinePlan.pendingTurnKey,
        turns: prev,
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
    removeQueuedTurnState(sideEffectPlan.queuedTurnIds);
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

        return {
          ...updateMessageArtifactsStatus(msg, "complete"),
          ...buildAgentStreamCompletedAssistantMessagePatch({
            parts: msg.contentParts,
            finalContent,
            previousContent: msg.content,
            rawContent,
            surfaceThinkingDeltas:
              surfaceThinkingDeltas || isRetainedSkillProcessMessage(msg),
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
    queuedTurnIds,
    requestLogPayload,
    usage,
  }: {
    finalContent: string;
    queuedTurnIds: string[];
    requestLogPayload: AgentStreamRequestLogFinishPayload;
    usage?: Message["usage"];
  }) => {
    removeQueuedTurnState(queuedTurnIds);
    finishRequestLog(requestState, requestLogPayload);
    completeAssistantStreamMessage({
      finalContent,
      rawContent: requestState.accumulatedContent,
      usage,
    });
  };
  const completeInterruptedTurn = (turn: AgentThreadTurn) => {
    removeQueuedTurnState(
      requestState.queuedTurnId ? [requestState.queuedTurnId] : [],
    );
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
          content: interruptedMessage.content || "(已停止)",
          isThinking: false,
          runtimeStatus: undefined,
        };
      });
      persistRetainedSkillProcessSnapshot(nextMessages);
      return nextMessages;
    });
    clearStreamingTextOverlay();
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
      clearOptimisticItem();
    }
    if (queuedDraftPlan.shouldClearOptimisticTurn) {
      clearOptimisticTurn();
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
    event: Extract<
      AgentEvent,
      {
        type:
          | "tool_start"
          | "tool_input_delta"
          | "tool_progress"
          | "tool_output_delta"
          | "tool_end";
      }
    >,
  ): boolean =>
    shouldLetLegacyToolEventUpdateMessageLayer({
      event,
      fallbackTurnId: requestState.currentTurnId || requestState.queuedTurnId,
      items: getThreadItems?.() ?? [],
    });

  switch (data.type) {
    case "message":
      // 后端会先发送完整 message 快照，再发送细粒度 delta；这里仅确认流已进入已知事件路径，避免误报未知事件。
      activateStream();
      {
        const snapshotText = extractVisibleTextFromAgentMessage(data.message);
        const shouldPrefillVisibleText =
          !shouldPreserveAssistantContent &&
          data.message.role === "assistant" &&
          !requestState.renderedContent &&
          !requestState.accumulatedContent &&
          snapshotText.trim().length > 0;
        if (!shouldPrefillVisibleText) {
          break;
        }

        requestState.accumulatedContent = snapshotText;
        requestState.renderedContent = snapshotText;
        requestState.prefilledMessageSnapshotReplayOffset = 0;
        requestState.prefilledMessageSnapshotText = snapshotText;
        if (!requestState.firstTextRenderFlushAt) {
          requestState.firstTextRenderFlushAt = Date.now();
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: snapshotText,
                  contentParts: appendTextToParts(
                    surfaceThinkingDeltas
                      ? msg.contentParts || []
                      : (msg.contentParts || []).filter(
                          (part) =>
                            part.type !== "thinking" ||
                            isPersistedReasoningContentPart(part),
                        ),
                    snapshotText,
                  ),
                }
              : msg,
          ),
        );
      }
      break;

    case "thread_started":
      break;

    case "queue_added":
      requestState.queuedTurnId = data.queued_turn.queued_turn_id;
      upsertQueuedTurn(data.queued_turn);
      markQueuedDraftState(data.queued_turn.message_text);
      break;

    case "queue_removed":
      removeQueuedTurnState([data.queued_turn_id]);
      scheduleQueuedDraftCleanup(
        shouldWatchAgentStreamQueuedDraftCleanup({
          affectedQueuedTurnId: data.queued_turn_id,
          currentQueuedTurnId: requestState.queuedTurnId,
        }),
      );
      break;

    case "queue_started":
      requestState.queuedTurnId = data.queued_turn_id;
      removeQueuedTurnState([data.queued_turn_id]);
      clearQueuedDraftCleanupTimer();
      activateStream();
      break;

    case "queue_cleared":
      removeQueuedTurnState(data.queued_turn_ids);
      scheduleQueuedDraftCleanup(
        shouldWatchAgentStreamQueuedDraftCleanupForCleared({
          clearedQueuedTurnIds: data.queued_turn_ids,
          currentQueuedTurnId: requestState.queuedTurnId,
        }),
      );
      break;

    case "turn_started":
      clearQueuedDraftCleanupTimer();
      activateStream();
      requestState.currentTurnId = data.turn.id;
      bindAssistantMessageToRuntimeTurn(
        setMessages,
        assistantMsgId,
        data.turn.id,
      );
      setCurrentTurnId(data.turn.id);
      setThreadTurns((prev) =>
        upsertThreadTurnState(
          removeThreadTurnState(prev, pendingTurnKey),
          data.turn,
        ),
      );
      setThreadItems((prev) => {
        const pendingItem = prev.find((item) => item.id === pendingItemKey);
        const updatedPendingItem = buildAgentStreamTurnStartedPendingItemUpdate(
          {
            pendingItem,
            turn: data.turn,
          },
        );
        if (!updatedPendingItem) {
          return prev;
        }

        return upsertThreadItemState(
          removeThreadItemState(prev, pendingItemKey),
          updatedPendingItem,
        );
      });
      break;

    case "item_started":
    case "item_completed":
      activateStream();
      requestState.currentTurnId = data.item.turn_id;
      if (data.item.type === "reasoning") {
        resetStreamedReasoningSegment(requestState);
      }
      bindAssistantMessageToRuntimeTurn(
        setMessages,
        assistantMsgId,
        data.item.turn_id,
      );
      {
        let nextThreadItemsForSync: readonly AgentThreadItem[] =
          getThreadItems?.() ?? [];
        setThreadItems((prev) => {
          const nextItems = upsertThreadItemState(
            data.item.type === "reasoning"
              ? removeStreamedReasoningTimelineItems(
                  removeThreadItemState(prev, pendingItemKey),
                  data.item.turn_id,
                )
              : removeThreadItemState(prev, pendingItemKey),
            data.item,
          );
          nextThreadItemsForSync = nextItems;
          return nextItems;
        });
        syncExistingMessageToolCallFromThreadItem({
          assistantMsgId,
          item: data.item,
          setMessages,
        });
        syncAssistantReasoningContentPartFromThreadItem({
          assistantMsgId,
          item: data.item,
          threadItems: nextThreadItemsForSync,
          setMessages,
        });
      }
      break;

    case "item_updated":
      activateStream();
      requestState.currentTurnId = data.item.turn_id;
      if (data.item.type === "reasoning") {
        resetStreamedReasoningSegment(requestState);
      }
      bindAssistantMessageToRuntimeTurn(
        setMessages,
        assistantMsgId,
        data.item.turn_id,
      );
      if (shouldDeferAgentStreamThreadItemUpdate(data.item)) {
        break;
      }
      {
        let nextThreadItemsForSync: readonly AgentThreadItem[] =
          getThreadItems?.() ?? [];
        setThreadItems((prev) => {
          const nextItems = upsertThreadItemState(
            data.item.type === "reasoning"
              ? removeStreamedReasoningTimelineItems(
                  removeThreadItemState(prev, pendingItemKey),
                  data.item.turn_id,
                )
              : removeThreadItemState(prev, pendingItemKey),
            data.item,
          );
          nextThreadItemsForSync = nextItems;
          return nextItems;
        });
        syncExistingMessageToolCallFromThreadItem({
          assistantMsgId,
          item: data.item,
          setMessages,
        });
        syncAssistantReasoningContentPartFromThreadItem({
          assistantMsgId,
          item: data.item,
          threadItems: nextThreadItemsForSync,
          setMessages,
        });
      }
      break;

    case "turn_completed": {
      clearQueuedDraftCleanupTimer();
      flushPendingTextRender();
      requestState.currentTurnId = data.turn.id;
      bindAssistantMessageToRuntimeTurn(
        setMessages,
        assistantMsgId,
        data.turn.id,
      );
      clearOptimisticItem();
      clearOptimisticTurn();
      setThreadTurns((prev) =>
        upsertThreadTurnState(
          removeThreadTurnState(prev, pendingTurnKey),
          data.turn,
        ),
      );
      setCurrentTurnId(data.turn.id);
      {
        const completedAt = data.turn.completed_at || new Date().toISOString();
        setThreadItems((prev) =>
          prev.map((item) =>
            isStreamedReasoningTimelineItem(item, data.turn.id)
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
      }
      if (data.text?.trim() && !shouldPreserveAssistantContent) {
        const completedText = data.text;
        const existingContent = requestState.accumulatedContent;
        const nextContent = !existingContent.trim()
          ? completedText
          : completedText.startsWith(existingContent)
            ? completedText
            : existingContent;
        requestState.accumulatedContent = nextContent;
        requestState.renderedContent = nextContent;
        requestState.hasMeaningfulCompletionSignal = true;
      }
      const turnCompletedPlan = buildAgentStreamFinalDonePlan({
        accumulatedContent: requestState.accumulatedContent,
        fallbackContent: assistantFallbackContent,
        hasMeaningfulCompletionSignal:
          requestState.hasMeaningfulCompletionSignal,
        queuedTurnId: requestState.queuedTurnId,
        toolCallCount: toolLogIdByToolId.size,
        usage: data.usage,
      });
      if (turnCompletedPlan.type === "missing_final_reply_failure") {
        finalizeMissingFinalReplyFailure(turnCompletedPlan);
        break;
      }
      completeAssistantStreamMessageFromCompletionPlan({
        ...turnCompletedPlan,
        usage: data.usage,
      });
      break;
    }

    case "turn_canceled": {
      clearQueuedDraftCleanupTimer();
      flushPendingTextRender();
      bindAssistantMessageToRuntimeTurn(
        setMessages,
        assistantMsgId,
        data.turn.id,
      );
      clearOptimisticItem();
      clearOptimisticTurn();
      setThreadTurns((prev) =>
        upsertThreadTurnState(
          removeThreadTurnState(prev, pendingTurnKey),
          data.turn,
        ),
      );
      completeInterruptedTurn(data.turn);
      break;
    }

    case "turn_failed": {
      clearQueuedDraftCleanupTimer();
      activateStream();
      flushPendingTextRender();
      bindAssistantMessageToRuntimeTurn(
        setMessages,
        assistantMsgId,
        data.turn.id,
      );
      clearOptimisticItem();
      clearOptimisticTurn();
      setThreadTurns((prev) =>
        upsertThreadTurnState(
          removeThreadTurnState(prev, pendingTurnKey),
          data.turn,
        ),
      );
      setCurrentTurnId(data.turn.id);
      finalizeMissingFinalReplyFailure(
        buildAgentStreamMissingFinalReplyFailurePlan({
          errorMessage: data.turn.error_message || "当前处理失败",
          queuedTurnId: requestState.queuedTurnId,
        }),
      );
      break;
    }

    case "runtime_status":
      activateStream();
      {
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
          const runtimeSummaryItem = buildAgentStreamRuntimeSummaryItemUpdate({
            activeSessionId,
            items: prev,
            pendingItemKey,
            summaryText: runtimeStatusPlan.summaryText,
            updatedAt: runtimeStatusPlan.updatedAt,
          });
          if (!runtimeSummaryItem) {
            return prev;
          }

          return upsertThreadItemState(prev, runtimeSummaryItem);
        });
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  runtimeStatus: runtimeStatusPlan.normalizedStatus,
                }
              : msg,
          ),
        );
      }
      break;

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
      {
        if (!requestState.firstThinkingDeltaAt) {
          const now = Date.now();
          requestState.firstThinkingDeltaAt = now;
          const context = {
            deltaChars: data.text.length,
            elapsedMs: Math.max(0, now - requestState.requestStartedAt),
            eventName,
            firstEventDeltaMs: requestState.firstEventReceivedAt
              ? Math.max(0, now - requestState.firstEventReceivedAt)
              : null,
            firstRuntimeStatusDeltaMs: requestState.firstRuntimeStatusAt
              ? Math.max(0, now - requestState.firstRuntimeStatusAt)
              : null,
            surfaced: surfaceThinkingDeltas,
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
          surfaceThinkingDeltas,
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
                textDelta: data.text,
                thinkingContent: msg.thinkingContent,
              }),
            };
          }),
        );
        if (thinkingPlan.shouldApplyThinkingDelta) {
          requestState.streamedReasoningText = appendTextWithOverlapFallback(
            requestState.streamedReasoningText || "",
            data.text,
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

    case "text_delta":
    case "text_delta_batch": {
      activateStream();
      clearOptimisticItem();
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
          requestStartedAt: requestState.requestStartedAt,
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
      if (visibleTextDelta) {
        if (
          !surfaceThinkingDeltas &&
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
      }
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
        removeQueuedTurnState(emptyFinalErrorPlan.queuedTurnIds);
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
                      isRetainedSkillProcessMessage(msg),
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
      removeQueuedTurnState(errorFailurePlan.queuedTurnIds);
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
