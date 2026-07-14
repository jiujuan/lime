import type { Dispatch, SetStateAction } from "react";
import type {
  ActionRequired,
  ApprovalDecision,
  ConfirmResponse,
  Message,
} from "../types";
import {
  appendActionRequiredToParts,
  normalizeActionQuestions,
  resolveActionPromptKey,
} from "./agentChatCoreUtils";
import { buildActionResumeRuntimeStatus } from "../utils/agentRuntimeStatus";
import type { AgentRuntimeReplayedActionRequiredView } from "@/lib/api/agentRuntime/requestTypes";

interface UpsertAssistantActionRequestOptions {
  assistantMsgId: string;
  actionData: ActionRequired;
  replaceByPrompt?: boolean;
  setPendingActions: Dispatch<SetStateAction<ActionRequired[]>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}

export const upsertAssistantActionRequest = ({
  assistantMsgId,
  actionData,
  replaceByPrompt = false,
  setPendingActions,
  setMessages,
}: UpsertAssistantActionRequestOptions) => {
  const scopedActionData: ActionRequired = {
    ...actionData,
    sourceMessageId: actionData.sourceMessageId || assistantMsgId,
    status: actionData.status || "pending",
  };
  const promptKey = replaceByPrompt
    ? resolveActionPromptKey(scopedActionData)
    : null;

  setPendingActions((prev) => {
    let next = [...prev];

    if (replaceByPrompt && promptKey) {
      next = next.filter((item) => {
        const itemKey = resolveActionPromptKey(item);
        return !(
          item.requestId !== scopedActionData.requestId &&
          itemKey &&
          itemKey === promptKey
        );
      });
    }

    next = next.filter((item) => item.requestId !== scopedActionData.requestId);
    next.push(scopedActionData);
    return next;
  });

  setMessages((prev) =>
    prev.map((msg) => {
      if (msg.id !== assistantMsgId) return msg;

      let nextRequests = [...(msg.actionRequests || [])];
      let nextParts = [...(msg.contentParts || [])];

      if (replaceByPrompt && promptKey) {
        nextRequests = nextRequests.filter((item) => {
          const itemKey = resolveActionPromptKey(item);
          return !(
            item.requestId !== scopedActionData.requestId &&
            itemKey &&
            itemKey === promptKey
          );
        });
        nextParts = nextParts.filter(
          (part) =>
            !(
              part.type === "action_required" &&
              part.actionRequired.requestId !== scopedActionData.requestId &&
              resolveActionPromptKey(part.actionRequired) === promptKey
            ),
        );
      }

      nextRequests = nextRequests.filter(
        (item) => item.requestId !== scopedActionData.requestId,
      );
      nextParts = nextParts.filter(
        (part) =>
          !(
            part.type === "action_required" &&
            part.actionRequired.requestId === scopedActionData.requestId
          ),
      );
      nextRequests.push(scopedActionData);
      nextParts = appendActionRequiredToParts(nextParts, scopedActionData);

      return {
        ...msg,
        actionRequests: nextRequests,
        contentParts: nextParts,
      };
    }),
  );
};

export interface ApplyAcknowledgedActionRequestsOptions {
  messages: Message[];
  requestIds: Set<string>;
  shouldPersistSubmittedAction: boolean;
  submittedResponse?: string;
  submittedUserData?: unknown;
}

export function applyAcknowledgedActionRequests({
  messages,
  requestIds,
  shouldPersistSubmittedAction,
  submittedResponse,
  submittedUserData,
}: ApplyAcknowledgedActionRequestsOptions): Message[] {
  return messages.map((msg) => {
    const hasAcknowledgedAction = msg.actionRequests?.some((item) =>
      requestIds.has(item.requestId),
    );

    return {
      ...msg,
      actionRequests: shouldPersistSubmittedAction
        ? msg.actionRequests?.map((item) =>
            requestIds.has(item.requestId)
              ? {
                  ...item,
                  status: "submitted" as const,
                  submittedResponse,
                  submittedUserData,
                }
              : item,
          )
        : msg.actionRequests?.filter(
            (item) => !requestIds.has(item.requestId),
          ),
      contentParts: shouldPersistSubmittedAction
        ? msg.contentParts?.map((part) =>
            part.type === "action_required" &&
            requestIds.has(part.actionRequired.requestId)
              ? {
                  ...part,
                  actionRequired: {
                    ...part.actionRequired,
                    status: "submitted" as const,
                    submittedResponse,
                    submittedUserData,
                  },
                }
              : part,
          )
        : msg.contentParts?.filter(
            (part) =>
              part.type !== "action_required" ||
              !requestIds.has(part.actionRequired.requestId),
          ),
      runtimeStatus:
        shouldPersistSubmittedAction && hasAcknowledgedAction
          ? buildActionResumeRuntimeStatus()
          : msg.runtimeStatus,
    };
  });
}

export function shouldPersistSubmittedActionForType(
  actionType: ActionRequired["actionType"],
): boolean {
  return actionType === "elicitation" || actionType === "ask_user";
}

export function removeActionsByRequestIds(
  actions: ActionRequired[],
  requestIds: Set<string>,
): ActionRequired[] {
  return actions.filter((item) => !requestIds.has(item.requestId));
}

export function upsertSubmittedAction(
  actions: ActionRequired[],
  nextAction: ActionRequired,
): ActionRequired[] {
  const next = actions.filter(
    (item) => item.requestId !== nextAction.requestId,
  );
  next.push(nextAction);
  return next;
}

export interface QueuedFallbackActionResponse
  extends Omit<ConfirmResponse, "requestId"> {
  requestId: string;
  sourceMessageId?: string;
}

export interface ResolveFallbackActionResponsePlanOptions {
  actionType: ActionRequired["actionType"];
  pendingActions: ActionRequired[];
  persistedAction: ActionRequired | undefined;
  response: ConfirmResponse;
  userData: unknown;
}

export type FallbackActionResponsePlan =
  | {
      kind: "not_fallback";
    }
  | {
      kind: "queue";
      promptKey: string;
      queuedResponse: QueuedFallbackActionResponse;
    }
  | {
      kind: "submit_resolved";
      resolvedAction: ActionRequired;
    };

export function resolveFallbackActionResponsePlan({
  actionType,
  pendingActions,
  persistedAction,
  response,
  userData,
}: ResolveFallbackActionResponsePlanOptions): FallbackActionResponsePlan {
  if (!persistedAction?.isFallback) {
    return { kind: "not_fallback" };
  }

  const fallbackPromptKey = resolveActionPromptKey(persistedAction);
  if (!fallbackPromptKey) {
    return { kind: "not_fallback" };
  }

  const fallbackSourceMessageId = persistedAction.sourceMessageId;
  const resolvedAction = pendingActions.find((item) => {
    if (item.requestId === persistedAction.requestId) return false;
    if (item.isFallback) return false;
    if (item.actionType !== persistedAction.actionType) return false;
    if (
      fallbackSourceMessageId &&
      item.sourceMessageId !== fallbackSourceMessageId
    ) {
      return false;
    }
    return resolveActionPromptKey(item) === fallbackPromptKey;
  });

  if (resolvedAction) {
    return {
      kind: "submit_resolved",
      resolvedAction,
    };
  }

  return {
    kind: "queue",
    promptKey: fallbackPromptKey,
    queuedResponse: {
      ...response,
      actionType,
      requestId: persistedAction.requestId,
      userData,
      sourceMessageId: fallbackSourceMessageId,
    },
  };
}

export interface MarkQueuedFallbackActionOptions {
  messages: Message[];
  requestId: string;
  submittedResponse?: string;
  submittedUserData?: unknown;
}

export function markQueuedFallbackActionInMessages({
  messages,
  requestId,
  submittedResponse,
  submittedUserData,
}: MarkQueuedFallbackActionOptions): Message[] {
  return messages.map((msg) => ({
    ...msg,
    actionRequests: msg.actionRequests?.map((item) =>
      item.requestId === requestId
        ? {
            ...item,
            status: "queued" as const,
            submittedResponse,
            submittedUserData,
          }
        : item,
    ),
    contentParts: msg.contentParts?.map((part) =>
      part.type === "action_required" &&
      part.actionRequired.requestId === requestId
        ? {
            ...part,
            actionRequired: {
              ...part.actionRequired,
              status: "queued" as const,
              submittedResponse,
              submittedUserData,
            },
          }
        : part,
    ),
  }));
}

export function markQueuedFallbackActionInPendingActions(
  actions: ActionRequired[],
  requestId: string,
  submittedResponse?: string,
  submittedUserData?: unknown,
): ActionRequired[] {
  return actions.map((item) =>
    item.requestId === requestId
      ? {
          ...item,
          status: "queued",
          submittedResponse,
          submittedUserData,
        }
      : item,
  );
}

function isApprovalDecision(value: string): value is ApprovalDecision {
  return (
    value === "allow_once" ||
    value === "allow_for_session" ||
    value === "decline" ||
    value === "cancel"
  );
}

function normalizeApprovalDecisions(value: unknown): ApprovalDecision[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const decisions = value.filter(
    (item): item is ApprovalDecision =>
      typeof item === "string" && isApprovalDecision(item),
  );
  return decisions.length > 0 ? Array.from(new Set(decisions)) : undefined;
}

export function mapReplayedActionRequiredToAction(
  replayedAction: AgentRuntimeReplayedActionRequiredView,
): ActionRequired {
  return {
    requestId: replayedAction.request_id,
    actionType: replayedAction.action_type,
    toolName: replayedAction.tool_name,
    arguments:
      replayedAction.arguments &&
      typeof replayedAction.arguments === "object" &&
      !Array.isArray(replayedAction.arguments)
        ? replayedAction.arguments
        : undefined,
    prompt: replayedAction.prompt,
    questions: normalizeActionQuestions(
      replayedAction.questions,
      replayedAction.prompt,
    ),
    requestedSchema: replayedAction.requested_schema,
    availableDecisions: normalizeApprovalDecisions(
      replayedAction.available_decisions,
    ),
    scope: replayedAction.scope
      ? {
          sessionId: replayedAction.scope.session_id,
          threadId: replayedAction.scope.thread_id,
          turnId: replayedAction.scope.turn_id,
        }
      : undefined,
    status: "pending",
    isFallback: false,
  };
}
