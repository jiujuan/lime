import type {
  AgentThreadItem,
  AgentThreadTurn,
} from "@/lib/api/agentProtocol";
import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import type { Message } from "../types";
import {
  buildFailedAgentMessageContent,
  buildFailedAgentRuntimeStatus,
} from "../utils/agentRuntimeStatus";
import { isImageTaskCreationToolName } from "../utils/imageTaskToolResult";
import { buildImageTaskPreviewFromToolResult } from "../utils/taskPreviewFromToolResult";
import { stringifyToolArguments } from "./agentChatToolResult";
import type {
  HistoryThreadToolCall,
  HistoryToolCall,
} from "./agentChatHistoryTypes";
import {
  asHistoryRecord,
  isFailedHistoryStatus,
  normalizeHistoryString,
  normalizeHistoryStatus,
  parseHistoryTimestamp,
  parseHistoryTimestampValue,
  readHistoryString,
} from "./agentChatHistoryPrimitives";
import { isAuxiliaryHistoryTurn } from "./agentChatHistoryTimelineBasics";
import { mergeImageWorkbenchPreview } from "./agentChatHistoryProcess";
import { resolveSessionDetailTurnUsage } from "./agentChatHistoryUsage";

function isImportedHistorySession(detail: AsterSessionDetail): boolean {
  const runtime = detail.execution_runtime;
  const runtimeRecord =
    runtime && typeof runtime === "object" && !Array.isArray(runtime)
      ? (runtime as unknown as Record<string, unknown>)
      : null;
  if (
    readHistoryString(runtimeRecord?.source_client) ||
    readHistoryString(runtimeRecord?.sourceClient) ||
    runtimeRecord?.imported_continuation ||
    runtimeRecord?.importedContinuation ||
    runtimeRecord?.imported_thread_settings ||
    runtimeRecord?.importedThreadSettings
  ) {
    return true;
  }

  const threadReadRecord = asHistoryRecord(detail.thread_read);
  const diagnostics = asHistoryRecord(threadReadRecord?.diagnostics);
  const runtimeSummary = asHistoryRecord(threadReadRecord?.runtime_summary);
  return Boolean(
    readHistoryString(diagnostics?.source_client) ||
    readHistoryString(diagnostics?.sourceClient) ||
    readHistoryString(runtimeSummary?.source_client) ||
    readHistoryString(runtimeSummary?.sourceClient),
  );
}

function findLatestFailedRuntimeTurnId(
  detail: AsterSessionDetail,
): string | null {
  const threadReadTurns = [...(detail.thread_read?.turns || [])].reverse();
  const failedThreadReadTurn = threadReadTurns.find(
    (turn) =>
      isFailedHistoryStatus(turn.status) ||
      isFailedHistoryStatus(turn.native_status),
  );
  if (failedThreadReadTurn?.turn_id) {
    return failedThreadReadTurn.turn_id;
  }

  const failedTurn = [...(detail.turns || [])]
    .filter((turn) => !isAuxiliaryHistoryTurn(turn))
    .reverse()
    .find((turn) => isFailedHistoryStatus(turn.status));
  return failedTurn?.id || null;
}

function findLatestFailedRuntimeErrorItem(
  detail: AsterSessionDetail,
  turnId: string | null,
): Extract<AgentThreadItem, { type: "error" }> | null {
  const errorItems = (detail.items || []).filter(
    (item): item is Extract<AgentThreadItem, { type: "error" }> =>
      item.type === "error" &&
      (!turnId || item.turn_id === turnId) &&
      isFailedHistoryStatus(item.status),
  );
  if (errorItems.length === 0) {
    return null;
  }

  return [...errorItems].sort((left, right) => {
    if (left.sequence !== right.sequence) {
      return right.sequence - left.sequence;
    }
    const leftTimestamp = parseHistoryTimestamp(
      left.completed_at || left.updated_at || left.started_at,
    ).getTime();
    const rightTimestamp = parseHistoryTimestamp(
      right.completed_at || right.updated_at || right.started_at,
    ).getTime();
    return rightTimestamp - leftTimestamp;
  })[0]!;
}

function findLatestFailedRuntimeTurn(
  detail: AsterSessionDetail,
  turnId: string | null,
): AgentThreadTurn | null {
  if (turnId) {
    const matchedTurn = (detail.turns || []).find((turn) => turn.id === turnId);
    if (matchedTurn) {
      return matchedTurn;
    }
  }

  return (
    [...(detail.turns || [])]
      .filter((turn) => !isAuxiliaryHistoryTurn(turn))
      .reverse()
      .find((turn) => isFailedHistoryStatus(turn.status)) ?? null
  );
}

export function hydrateFailedRuntimeReadModelMessage(
  detail: AsterSessionDetail,
  topicId: string,
): Message | null {
  if (isImportedHistorySession(detail)) {
    return null;
  }

  const diagnostics = detail.thread_read?.diagnostics;
  if (!isFailedHistoryStatus(diagnostics?.latest_turn_status)) {
    return null;
  }

  const turnId = findLatestFailedRuntimeTurnId(detail);
  const errorItem = findLatestFailedRuntimeErrorItem(detail, turnId);
  const failedTurn = findLatestFailedRuntimeTurn(detail, turnId);
  const errorMessage =
    normalizeHistoryString(diagnostics?.latest_turn_error_message).trim() ||
    normalizeHistoryString(errorItem?.message).trim() ||
    normalizeHistoryString(failedTurn?.error_message).trim();
  const content = buildFailedAgentMessageContent(errorMessage);
  const diagnosticsTimestamp = parseHistoryTimestampValue(
    diagnostics?.latest_turn_completed_at ??
      diagnostics?.latest_turn_updated_at ??
      diagnostics?.latest_turn_started_at,
  );
  const timestamp =
    diagnosticsTimestamp.getTime() > 0
      ? diagnosticsTimestamp
      : parseHistoryTimestamp(
          errorItem?.completed_at ||
            errorItem?.updated_at ||
            errorItem?.started_at ||
            failedTurn?.completed_at ||
            failedTurn?.updated_at ||
            failedTurn?.started_at,
        );

  return {
    id: `${topicId}-app-server-failed-${turnId || "latest"}`,
    role: "assistant",
    content,
    contentParts: [{ type: "text", text: content }],
    timestamp,
    isThinking: false,
    runtimeStatus: buildFailedAgentRuntimeStatus(errorMessage),
    runtimeTurnId: turnId || failedTurn?.id,
  };
}

function historyToolCallIdFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): string {
  const record = asHistoryRecord(toolCall);
  return (
    readHistoryString(record?.id) ||
    readHistoryString(record?.tool_call_id) ||
    readHistoryString(record?.toolCallId) ||
    readHistoryString(record?.toolId) ||
    readHistoryString(record?.tool_id)
  );
}

function historyToolCallNameFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): string {
  const record = asHistoryRecord(toolCall);
  return (
    readHistoryString(record?.tool_name) ||
    readHistoryString(record?.toolName) ||
    readHistoryString(record?.name)
  );
}

function historyToolCallStatusFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): HistoryToolCall["status"] {
  const status = normalizeHistoryStatus(toolCall.status);
  if (status === "failed" || status === "error") {
    return "failed";
  }
  if (status === "completed" || status === "complete" || status === "done") {
    return "completed";
  }
  return "running";
}

function historyToolCallOutputFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
  toolName: string,
): string {
  const record = asHistoryRecord(toolCall);
  const output = readHistoryString(record?.output);
  const outputPreview =
    readHistoryString(record?.output_preview) ||
    readHistoryString(record?.outputPreview);
  if (isImageTaskCreationToolName(toolName)) {
    return output || outputPreview;
  }
  return (
    outputPreview ||
    output
  );
}

function historyToolCallErrorFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): string {
  const record = asHistoryRecord(toolCall);
  return readHistoryString(record?.error);
}

function historyToolCallStructuredContentFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): unknown {
  const record = asHistoryRecord(toolCall);
  return record?.structured_content ?? record?.structuredContent;
}

function historyToolCallMetadataFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): Record<string, unknown> | undefined {
  const record = asHistoryRecord(toolCall);
  return asHistoryRecord(record?.metadata) ?? undefined;
}

function historyToolCallTurnIdFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): string {
  const record = asHistoryRecord(toolCall);
  return (
    readHistoryString(record?.turn_id) || readHistoryString(record?.turnId)
  );
}

function historyToolCallTimeFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
  keys: string[],
): Date {
  const record = asHistoryRecord(toolCall);
  for (const key of keys) {
    const timestamp = parseHistoryTimestampValue(record?.[key]);
    if (timestamp.getTime() > 0) {
      return timestamp;
    }
  }
  return new Date(0);
}

function historyToolCallFromThreadToolCall(
  toolCall: HistoryThreadToolCall,
): HistoryToolCall | null {
  const id = historyToolCallIdFromThreadToolCall(toolCall);
  const name = historyToolCallNameFromThreadToolCall(toolCall);
  if (!id || !name) {
    return null;
  }

  const status = historyToolCallStatusFromThreadToolCall(toolCall);
  const record = asHistoryRecord(toolCall);
  const output = historyToolCallOutputFromThreadToolCall(toolCall, name);
  const error = historyToolCallErrorFromThreadToolCall(toolCall);
  const structuredContent =
    historyToolCallStructuredContentFromThreadToolCall(toolCall);
  const metadata = historyToolCallMetadataFromThreadToolCall(toolCall);
  const startTime = historyToolCallTimeFromThreadToolCall(toolCall, [
    "started_at",
    "startedAt",
    "timestamp",
    "updated_at",
    "updatedAt",
  ]);
  const endTime =
    status === "running"
      ? undefined
      : historyToolCallTimeFromThreadToolCall(toolCall, [
          "finished_at",
          "finishedAt",
          "completed_at",
          "completedAt",
          "updated_at",
          "updatedAt",
          "timestamp",
        ]);

  return {
    id,
    name,
    arguments: stringifyToolArguments(record?.arguments),
    status,
    startTime,
    endTime,
    result:
      status === "running"
        ? undefined
        : {
            success: toolCall.success !== false && status !== "failed",
            output,
            error: error || undefined,
            images: undefined,
            structuredContent,
            metadata,
          },
    metadata,
  };
}

function resolveThreadReadToolCallUsage(
  detail: AsterSessionDetail,
  runtimeTurnId: string,
): Message["usage"] {
  return resolveSessionDetailTurnUsage(detail, runtimeTurnId);
}

export function hydrateSessionDetailMessagesFromThreadReadToolCalls(
  detail: AsterSessionDetail,
  topicId: string,
): Message[] {
  const rawToolCalls = detail.thread_read?.tool_calls || [];
  const toolCalls = rawToolCalls
    .map(historyToolCallFromThreadToolCall)
    .filter((toolCall): toolCall is HistoryToolCall => toolCall !== null);
  if (toolCalls.length === 0) {
    return [];
  }

  const runtimeTurnId =
    rawToolCalls.map(historyToolCallTurnIdFromThreadToolCall).find(Boolean) ||
    readHistoryString(detail.thread_read?.active_turn_id) ||
    readHistoryString(detail.thread_read?.turns?.find(Boolean)?.turn_id) ||
    readHistoryString(
      [...(detail.turns || [])]
        .filter((turn) => !isAuxiliaryHistoryTurn(turn))
        .at(-1)?.id,
    );
  const timestamp =
    [...toolCalls]
      .reverse()
      .map((toolCall) => toolCall.endTime || toolCall.startTime)
      .find((date) => date.getTime() > 0) || new Date(0);
  const usage = resolveThreadReadToolCallUsage(detail, runtimeTurnId);
  const imageWorkbenchPreview = toolCalls.reduce(
    (current, toolCall) =>
      mergeImageWorkbenchPreview(
        current,
        buildImageTaskPreviewFromToolResult({
          toolId: toolCall.id,
          toolName: toolCall.name,
          toolArguments: toolCall.arguments,
          toolResult:
            toolCall.result &&
            typeof toolCall.result === "object" &&
            !Array.isArray(toolCall.result)
              ? (toolCall.result as unknown as Record<string, unknown>)
              : undefined,
          fallbackPrompt: "",
        }) || undefined,
      ),
    undefined as Message["imageWorkbenchPreview"],
  );

  return [
    {
      id: `${topicId}-app-server-thread-read-tools-${runtimeTurnId || "latest"}`,
      role: "assistant",
      content: "",
      contentParts: toolCalls.map((toolCall) => ({
        type: "tool_use" as const,
        toolCall,
      })),
      toolCalls,
      timestamp,
      isThinking: false,
      runtimeTurnId: runtimeTurnId || undefined,
      usage,
      imageWorkbenchPreview,
    },
  ];
}
