import type { AgentTokenUsage } from "@/lib/api/agentProtocol";
import type {
  AgentSubagentSessionInfo,
  AgentRuntimeThreadReadModel,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
  Message,
} from "../types";
import {
  summarizeStreamingToolBatch,
  summarizeThreadProcessBatch,
  type ToolBatchSummaryDescriptor,
} from "./toolBatchGrouping";
import { resolveAgentThreadToolProcessPreview } from "./toolProcessSummary";
import { shouldHideTurnSummaryFromConversation } from "./turnSummaryPresentation";
import {
  isPendingRuntimeActionConfirmation,
  isPendingRuntimeActionConfirmationThreadItem,
  isRuntimeActionConfirmationRequestId,
  isRuntimePermissionConfirmationWaitMessage,
  isSubmittedRuntimeActionConfirmation,
  isSubmittedRuntimeActionConfirmationThreadItem,
} from "./runtimeActionConfirmation";

export type AgentTaskRuntimeStatus =
  | "queued"
  | "running"
  | "waiting_input"
  | "completed"
  | "failed"
  | "aborted";

export type AgentTaskRuntimePhase =
  | "preparing"
  | "reasoning"
  | "tool_batch"
  | "waiting_input"
  | "completed"
  | "failed"
  | "aborted";

export interface AgentTaskRuntimeSubtaskStats {
  total: number;
  active: number;
  queued: number;
  completed: number;
  failed: number;
}

export interface AgentTaskRuntimeCardModel {
  taskId: string;
  title: string;
  summary: string;
  status: AgentTaskRuntimeStatus;
  statusLabel: string;
  phase: AgentTaskRuntimePhase;
  phaseLabel: string;
  detail: string | null;
  supportingLines: string[];
  batchDescriptor: ToolBatchSummaryDescriptor | null;
  queuedTurnCount: number;
  pendingRequestCount: number;
  subtaskStats: AgentTaskRuntimeSubtaskStats | null;
  usage?: AgentTokenUsage;
}

interface BuildAgentTaskRuntimeCardModelParams {
  messages: Message[];
  turns?: readonly AgentThreadTurn[];
  threadItems?: readonly AgentThreadItem[];
  currentTurnId?: string | null;
  threadRead?: AgentRuntimeThreadReadModel | null;
  pendingActions?: readonly ActionRequired[];
  submittedActionsInFlight?: readonly ActionRequired[];
  queuedTurns?: readonly QueuedTurnSnapshot[];
  childSubagentSessions?: readonly AgentSubagentSessionInfo[];
  isSending?: boolean;
}

function resolveVisiblePendingRequestCount(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
  submittedActionsInFlight: readonly ActionRequired[],
): number {
  const submittedRequestIds = new Set(
    submittedActionsInFlight.map((item) => item.requestId),
  );
  let count = 0;
  for (const request of threadRead?.pending_requests ?? []) {
    if (submittedRequestIds.has(request.id)) {
      continue;
    }
    count += 1;
  }
  return count;
}

function resolveVisiblePendingActions(
  pendingActions: readonly ActionRequired[],
): ActionRequired[] {
  return pendingActions.filter((action) => action.status !== "submitted");
}

function hasPendingRuntimeActionConfirmation(params: {
  latestTurnItems: AgentThreadItem[];
  pendingActions: readonly ActionRequired[];
  threadRead?: AgentRuntimeThreadReadModel | null;
  submittedActionsInFlight: readonly ActionRequired[];
}): boolean {
  const submittedRequestIds = new Set(
    params.submittedActionsInFlight.map((item) => item.requestId),
  );

  return (
    params.pendingActions.some(isPendingRuntimeActionConfirmation) ||
    params.latestTurnItems.some(isPendingRuntimeActionConfirmationThreadItem) ||
    (params.threadRead?.pending_requests ?? []).some(
      (request) =>
        !submittedRequestIds.has(request.id) &&
        isRuntimeActionConfirmationRequestId(request.id),
    )
  );
}

function hasSubmittedRuntimeActionConfirmation(params: {
  latestTurnItems: AgentThreadItem[];
  pendingActions: readonly ActionRequired[];
  submittedActionsInFlight: readonly ActionRequired[];
}): boolean {
  return (
    params.pendingActions.some(isSubmittedRuntimeActionConfirmation) ||
    params.submittedActionsInFlight.some(
      isSubmittedRuntimeActionConfirmation,
    ) ||
    params.latestTurnItems.some(isSubmittedRuntimeActionConfirmationThreadItem)
  );
}

function shorten(value: string | null | undefined, maxLength = 120): string {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function firstMeaningfulLine(value: string | null | undefined): string | null {
  const normalized = (value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return normalized || null;
}

function isProcessItem(item: AgentThreadItem): boolean {
  return (
    item.type === "tool_call" ||
    item.type === "command_execution" ||
    item.type === "web_search"
  );
}

function resolveLatestTurn(
  turns: readonly AgentThreadTurn[],
  currentTurnId?: string | null,
): AgentThreadTurn | null {
  if (currentTurnId) {
    const matched = turns.find((turn) => turn.id === currentTurnId);
    if (matched) {
      return matched;
    }
  }
  return turns[turns.length - 1] || null;
}

function resolveLatestAssistantMessage(
  messages: readonly Message[],
): Message | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return null;
}

function resolveLatestUserMessage(messages: readonly Message[]): Message | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === "user" &&
      (message.content.trim().length > 0 ||
        (Array.isArray(message.images) && message.images.length > 0))
    ) {
      return message;
    }
  }
  return null;
}

export function isAssistantAwaitingFinalResponse(
  latestAssistant: Message | null,
): boolean {
  if (!latestAssistant?.isThinking) {
    return false;
  }

  return (
    latestAssistant.runtimeStatus?.phase !== "failed" &&
    latestAssistant.runtimeStatus?.phase !== "cancelled"
  );
}

function resolveLatestUsage(
  messages: readonly Message[],
): AgentTokenUsage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && !message.isThinking && message.usage) {
      return message.usage;
    }
  }
  return undefined;
}

function resolveTaskStatus(params: {
  latestAssistant: Message | null;
  latestTurn: AgentThreadTurn | null;
  latestTurnItems: AgentThreadItem[];
  threadRead?: AgentRuntimeThreadReadModel | null;
  pendingActions: readonly ActionRequired[];
  submittedActionsInFlight: readonly ActionRequired[];
  queuedTurnCount: number;
  isSending: boolean;
}): AgentTaskRuntimeStatus | null {
  const {
    latestAssistant,
    latestTurn,
    latestTurnItems,
    threadRead,
    pendingActions,
    submittedActionsInFlight,
    queuedTurnCount,
    isSending,
  } = params;
  const visiblePendingActions = resolveVisiblePendingActions(pendingActions);
  const visiblePendingRequestCount = resolveVisiblePendingRequestCount(
    threadRead,
    submittedActionsInFlight,
  );
  if (visiblePendingActions.length > 0 || visiblePendingRequestCount > 0) {
    return "waiting_input";
  }

  if (
    latestTurn?.status === "failed" &&
    isRuntimePermissionConfirmationWaitMessage(latestTurn.error_message)
  ) {
    if (
      hasSubmittedRuntimeActionConfirmation({
        latestTurnItems,
        pendingActions,
        submittedActionsInFlight,
      })
    ) {
      return null;
    }

    if (
      hasPendingRuntimeActionConfirmation({
        latestTurnItems,
        pendingActions,
        threadRead,
        submittedActionsInFlight,
      })
    ) {
      return "waiting_input";
    }

    return "waiting_input";
  }

  if (threadRead?.status === "queued" || queuedTurnCount > 0) {
    return latestTurn ? "queued" : queuedTurnCount > 0 ? "queued" : null;
  }

  if (
    isSending ||
    threadRead?.status === "running" ||
    threadRead?.status === "interrupting"
  ) {
    return "running";
  }

  switch (latestTurn?.status) {
    case "completed":
      if (isAssistantAwaitingFinalResponse(latestAssistant)) {
        return "running";
      }
      return "completed";
    case "failed":
      return "failed";
    case "aborted":
      return "aborted";
    case "running":
      return "running";
    default:
      return null;
  }
}

function resolveTaskPhase(params: {
  status: AgentTaskRuntimeStatus;
  latestAssistant: Message | null;
  batchDescriptor: ToolBatchSummaryDescriptor | null;
}): AgentTaskRuntimePhase {
  const { status, latestAssistant, batchDescriptor } = params;
  if (status === "waiting_input") {
    return "waiting_input";
  }
  if (status === "queued") {
    return "preparing";
  }
  if (status === "completed") {
    return "completed";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "aborted") {
    return "aborted";
  }

  if (batchDescriptor) {
    return "tool_batch";
  }

  if (latestAssistant?.runtimeStatus?.phase === "preparing") {
    return "preparing";
  }

  return "reasoning";
}

function resolveStatusLabel(status: AgentTaskRuntimeStatus): string {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "进行中";
    case "waiting_input":
      return "等待输入";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "aborted":
      return "已中断";
  }
}

function resolvePhaseLabel(phase: AgentTaskRuntimePhase): string {
  switch (phase) {
    case "preparing":
      return "准备中";
    case "reasoning":
      return "分析中";
    case "tool_batch":
      return "工具批次处理中";
    case "waiting_input":
      return "等待确认或补充";
    case "completed":
      return "任务完成";
    case "failed":
      return "任务失败";
    case "aborted":
      return "任务已中断";
  }
}

function resolveBlockingDetail(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
  latestTurnItems: readonly AgentThreadItem[],
  pendingActions: readonly ActionRequired[],
  submittedActionsInFlight: readonly ActionRequired[],
): string | null {
  const submittedRequestIds = new Set(
    submittedActionsInFlight.map((item) => item.requestId),
  );
  const visiblePendingActions = resolveVisiblePendingActions(pendingActions);
  const visiblePendingRequest = (threadRead?.pending_requests ?? []).find(
    (request) => !submittedRequestIds.has(request.id),
  );
  const pendingRuntimeConfirmation = latestTurnItems.find(
    isPendingRuntimeActionConfirmationThreadItem,
  );
  const pendingRequestTitle =
    threadRead?.diagnostics?.primary_blocking_summary ||
    visiblePendingRequest?.title ||
    visiblePendingActions[0]?.prompt ||
    visiblePendingActions[0]?.questions?.[0]?.question ||
    pendingRuntimeConfirmation?.prompt ||
    (pendingRuntimeConfirmation?.type === "request_user_input"
      ? pendingRuntimeConfirmation.questions?.[0]?.question
      : undefined);

  return shorten(pendingRequestTitle, 96) || null;
}

function resolveCompletedSummary(
  latestAssistant: Message | null,
  latestTurnItems: readonly AgentThreadItem[],
): string | null {
  let latestTurnSummary: AgentThreadItem | null = null;
  for (let index = latestTurnItems.length - 1; index >= 0; index -= 1) {
    const item = latestTurnItems[index];
    if (
      item?.type === "turn_summary" &&
      item.status === "completed" &&
      !shouldHideTurnSummaryFromConversation(item)
    ) {
      latestTurnSummary = item;
      break;
    }
  }
  if (latestTurnSummary?.type === "turn_summary") {
    return shorten(firstMeaningfulLine(latestTurnSummary.text), 96) || null;
  }

  return shorten(firstMeaningfulLine(latestAssistant?.content), 96) || null;
}

function resolveSubtaskStats(
  childSubagentSessions: readonly AgentSubagentSessionInfo[],
): AgentTaskRuntimeSubtaskStats | null {
  if (childSubagentSessions.length === 0) {
    return null;
  }

  return childSubagentSessions.reduce<AgentTaskRuntimeSubtaskStats>(
    (stats, session) => {
      const status = session.runtime_status || "idle";
      stats.total += 1;
      if (status === "running") {
        stats.active += 1;
      } else if (status === "queued") {
        stats.active += 1;
        stats.queued += 1;
      } else if (status === "completed" || status === "closed") {
        stats.completed += 1;
      } else if (status === "failed" || status === "aborted") {
        stats.failed += 1;
      }
      return stats;
    },
    { total: 0, active: 0, queued: 0, completed: 0, failed: 0 },
  );
}

export function buildAgentTaskRuntimeCardModel({
  messages,
  turns = [],
  threadItems = [],
  currentTurnId = null,
  threadRead = null,
  pendingActions = [],
  submittedActionsInFlight = [],
  queuedTurns = [],
  childSubagentSessions = [],
  isSending = false,
}: BuildAgentTaskRuntimeCardModelParams): AgentTaskRuntimeCardModel | null {
  const latestTurn = resolveLatestTurn(turns, currentTurnId);
  const latestAssistant = resolveLatestAssistantMessage(messages);
  const latestUser = resolveLatestUserMessage(messages);
  const latestTurnItems: AgentThreadItem[] = [];
  const latestProcessItems: AgentThreadItem[] = [];
  if (latestTurn) {
    for (const item of threadItems) {
      if (item.turn_id !== latestTurn.id) {
        continue;
      }
      latestTurnItems.push(item);
      if (isProcessItem(item)) {
        latestProcessItems.push(item);
      }
    }
  }
  const visibleToolCalls =
    latestAssistant?.toolCalls?.filter(
      (toolCall) => toolCall.status !== "failed",
    ) || [];
  const streamingBatchDescriptor =
    summarizeStreamingToolBatch(visibleToolCalls);
  const persistedBatchDescriptor =
    summarizeThreadProcessBatch(latestProcessItems);
  const batchDescriptor = streamingBatchDescriptor || persistedBatchDescriptor;
  const status = resolveTaskStatus({
    latestAssistant,
    latestTurn,
    latestTurnItems,
    threadRead,
    pendingActions,
    submittedActionsInFlight,
    queuedTurnCount: queuedTurns.length,
    isSending,
  });
  const visiblePendingActions = resolveVisiblePendingActions(pendingActions);

  if (
    !status &&
    !latestTurn &&
    !latestUser &&
    childSubagentSessions.length === 0 &&
    queuedTurns.length === 0
  ) {
    return null;
  }

  const phase = resolveTaskPhase({
    status: status || "running",
    latestAssistant,
    batchDescriptor,
  });
  const titleSource =
    latestTurn?.prompt_text ||
    latestUser?.content ||
    (childSubagentSessions.length > 0 ? "正在协调子任务" : "当前任务");
  const title = shorten(firstMeaningfulLine(titleSource), 120) || "当前任务";
  const subtaskStats = resolveSubtaskStats(childSubagentSessions);
  let latestPreview: string | null = null;
  for (let index = latestProcessItems.length - 1; index >= 0; index -= 1) {
    latestPreview = resolveAgentThreadToolProcessPreview(
      latestProcessItems[index]!,
    );
    if (latestPreview) {
      break;
    }
  }
  latestPreview =
    latestPreview ||
    shorten(firstMeaningfulLine(latestAssistant?.runtimeStatus?.detail), 96) ||
    null;

  let detail: string | null = null;
  const supportingLines: string[] = [];

  if (status === "waiting_input") {
    detail = resolveBlockingDetail(
      threadRead,
      latestTurnItems,
      pendingActions,
      submittedActionsInFlight,
    );
  } else if (status === "queued") {
    detail =
      queuedTurns.length > 0
        ? `还有 ${queuedTurns.length} 条消息在排队，当前任务会在前一轮结束后继续。`
        : "正在准备本轮执行。";
  } else if (phase === "tool_batch" && batchDescriptor) {
    detail = batchDescriptor.title;
    supportingLines.push(...batchDescriptor.supportingLines);
  } else if (
    status === "completed" ||
    status === "failed" ||
    status === "aborted"
  ) {
    detail = resolveCompletedSummary(latestAssistant, latestTurnItems);
    if (batchDescriptor) {
      supportingLines.push(...batchDescriptor.supportingLines);
    }
  } else {
    detail = latestPreview || "正在处理当前请求。";
  }

  if (
    subtaskStats &&
    subtaskStats.total > 0 &&
    !supportingLines.some((line) => line.includes("子任务"))
  ) {
    if (subtaskStats.active > 0) {
      supportingLines.push(
        `子任务 ${subtaskStats.active}/${subtaskStats.total} 进行中`,
      );
    } else {
      supportingLines.push(`子任务 ${subtaskStats.total} 个已收拢到当前任务`);
    }
  }

  const visiblePendingRequestCount = resolveVisiblePendingRequestCount(
    threadRead,
    submittedActionsInFlight,
  );

  if (
    threadRead?.diagnostics?.primary_blocking_summary &&
    status !== "waiting_input" &&
    visiblePendingRequestCount > 0
  ) {
    supportingLines.push(
      shorten(threadRead.diagnostics.primary_blocking_summary, 96),
    );
  }

  const dedupedSupportingLines = supportingLines.filter(
    (line, index, array) => Boolean(line) && array.indexOf(line) === index,
  );
  const hasProcessTrail =
    Boolean(batchDescriptor) || latestProcessItems.length > 0;
  const hasSubtasks = Boolean(subtaskStats?.total);
  const hasLiveRuntimeDetail = Boolean(
    latestAssistant?.runtimeStatus?.title ||
    latestAssistant?.runtimeStatus?.detail,
  );
  const hasBlockingOrQueue =
    visiblePendingActions.length > 0 ||
    visiblePendingRequestCount > 0 ||
    queuedTurns.length > 0;
  const shouldDisplay =
    status === "waiting_input" ||
    status === "queued" ||
    status === "failed" ||
    status === "aborted" ||
    ((status === "running" || !status) &&
      (hasProcessTrail ||
        hasSubtasks ||
        hasBlockingOrQueue ||
        hasLiveRuntimeDetail));

  if (!shouldDisplay) {
    return null;
  }

  return {
    taskId: latestTurn?.id || currentTurnId || "main-session-task",
    title,
    summary: title,
    status: status || "running",
    statusLabel: resolveStatusLabel(status || "running"),
    phase,
    phaseLabel: resolvePhaseLabel(phase),
    detail,
    supportingLines: dedupedSupportingLines,
    batchDescriptor,
    queuedTurnCount: queuedTurns.length,
    pendingRequestCount:
      visiblePendingActions.length || visiblePendingRequestCount,
    subtaskStats,
    usage: resolveLatestUsage(messages),
  };
}
