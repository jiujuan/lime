import type { AgentExecutionStrategy } from "@/lib/api/agentExecutionRuntime";
import type { Message } from "../types";
import { buildQueuedRuntimeStatus } from "./agentStreamSubmitDraft";

export function buildAgentStreamQueuedDraftMessagePatch(params: {
  contentFallback: string;
  executionStrategy: AgentExecutionStrategy;
  queuedMessageText?: string | null;
}): Pick<Message, "isThinking" | "runtimeStatus"> {
  return {
    isThinking: false,
    runtimeStatus: buildQueuedRuntimeStatus(
      params.executionStrategy,
      params.queuedMessageText?.trim() || params.contentFallback,
    ),
  };
}

export function buildAgentStreamQueuedDraftStatePlan(params: {
  contentFallback: string;
  executionStrategy: AgentExecutionStrategy;
  queuedMessageText?: string | null;
}): {
  messagePatch: Pick<Message, "isThinking" | "runtimeStatus">;
  shouldClearActiveStream: boolean;
  shouldClearOptimisticItem: boolean;
  shouldClearOptimisticTurn: boolean;
  shouldSetSendingFalse: boolean;
} {
  return {
    messagePatch: buildAgentStreamQueuedDraftMessagePatch(params),
    shouldClearActiveStream: true,
    shouldClearOptimisticItem: true,
    shouldClearOptimisticTurn: true,
    shouldSetSendingFalse: true,
  };
}

export function shouldWatchAgentStreamQueuedDraftCleanup(params: {
  affectedQueuedTurnId: string;
  currentQueuedTurnId?: string | null;
}): boolean {
  return (
    !params.currentQueuedTurnId ||
    params.currentQueuedTurnId === params.affectedQueuedTurnId
  );
}

export function shouldWatchAgentStreamQueuedDraftCleanupForCleared(params: {
  clearedQueuedTurnIds: string[];
  currentQueuedTurnId?: string | null;
}): boolean {
  return (
    !params.currentQueuedTurnId ||
    params.clearedQueuedTurnIds.includes(params.currentQueuedTurnId)
  );
}
