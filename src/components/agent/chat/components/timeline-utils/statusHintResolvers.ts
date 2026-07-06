import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
} from "../../types";
import {
  isPendingRuntimeActionConfirmation,
  isRuntimeActionConfirmationRequestId,
  isRuntimeActionConfirmationThreadItem,
  isRuntimePermissionConfirmationWaitMessage,
  isSubmittedRuntimeActionConfirmation,
} from "../../utils/runtimeActionConfirmation";
import { resolveAgentRuntimeErrorPresentation } from "../../utils/agentRuntimeErrorPresentation";
import {
  resolveTimelineConfirmedStatusLabel,
  resolveTimelineItemStatusLabel,
  resolveTimelinePausedDetail,
  resolveTimelinePausedStatusLabel,
  resolveTimelinePendingActionDetail,
  resolveTimelinePendingStatusLabel,
  resolveTimelineRuntimeConfirmationPendingDetail,
  resolveTimelineRuntimeConfirmationSubmittedDetail,
} from "./timelineCopy";

function findLatestPendingAction(
  actionRequests: ActionRequired[] | undefined,
): ActionRequired | null {
  if (!actionRequests?.length) {
    return null;
  }

  for (let index = actionRequests.length - 1; index >= 0; index -= 1) {
    const actionRequest = actionRequests[index];
    if (actionRequest.status !== "submitted") {
      return actionRequest;
    }
  }

  return null;
}

export function resolveUserFacingErrorMessage(
  errorMessage?: string | null,
): string {
  const normalized = errorMessage?.trim();
  if (!normalized) {
    return "";
  }
  return resolveAgentRuntimeErrorPresentation(normalized).displayMessage;
}

export function resolveThreadInlineStatusHint(params: {
  turn: AgentThreadTurn;
  actionRequests?: ActionRequired[];
  runtimeConfirmationPrompt?: string | null;
  hasSubmittedRuntimeConfirmation?: boolean;
}) {
  const pendingAction = findLatestPendingAction(params.actionRequests);

  if (pendingAction) {
    return {
      tone: "warning" as const,
      label: resolveTimelinePendingStatusLabel(),
      detail:
        pendingAction.prompt?.trim() || resolveTimelinePendingActionDetail(),
    };
  }

  if (params.runtimeConfirmationPrompt?.trim()) {
    return {
      tone: "warning" as const,
      label: resolveTimelinePendingStatusLabel(),
      detail: params.runtimeConfirmationPrompt.trim(),
    };
  }

  if (params.turn.status === "failed") {
    if (isRuntimePermissionConfirmationWaitMessage(params.turn.error_message)) {
      if (params.hasSubmittedRuntimeConfirmation) {
        return {
          tone: "neutral" as const,
          label: resolveTimelineConfirmedStatusLabel(),
          detail: resolveTimelineRuntimeConfirmationSubmittedDetail(),
        };
      }

      return {
        tone: "warning" as const,
        label: resolveTimelinePendingStatusLabel(),
        detail: resolveTimelineRuntimeConfirmationPendingDetail(),
      };
    }
  }

  if (params.turn.status === "aborted") {
    return {
      tone: "neutral" as const,
      label: resolveTimelinePausedStatusLabel(),
      detail:
        params.turn.error_message?.trim() || resolveTimelinePausedDetail(),
    };
  }

  if (params.turn.status === "failed" && params.turn.error_message?.trim()) {
    return {
      tone: "error" as const,
      label: resolveTimelineItemStatusLabel("failed"),
      detail: resolveUserFacingErrorMessage(params.turn.error_message),
    };
  }

  return null;
}

export function resolvePendingRuntimeConfirmationPrompt(params: {
  items: AgentThreadItem[];
  actionRequests?: ActionRequired[];
}): string | null {
  const actionRequests = params.actionRequests || [];
  for (let index = actionRequests.length - 1; index >= 0; index -= 1) {
    const actionRequest = actionRequests[index];
    if (isPendingRuntimeActionConfirmation(actionRequest)) {
      return (
        actionRequest.prompt?.trim() ||
        resolveTimelineRuntimeConfirmationPendingDetail()
      );
    }
  }

  for (let index = params.items.length - 1; index >= 0; index -= 1) {
    const item = params.items[index];
    if (
      isRuntimeActionConfirmationThreadItem(item) &&
      item.status !== "completed"
    ) {
      return (
        item.prompt?.trim() || resolveTimelineRuntimeConfirmationPendingDetail()
      );
    }
  }

  return null;
}

export function hasSubmittedRuntimeActionConfirmation(params: {
  items: AgentThreadItem[];
  actionRequests?: ActionRequired[];
}): boolean {
  if (
    (params.actionRequests || []).some((actionRequest) =>
      isSubmittedRuntimeActionConfirmation(actionRequest),
    )
  ) {
    return true;
  }

  return params.items.some(
    (item) =>
      (item.type === "approval_request" ||
        item.type === "request_user_input") &&
      item.status === "completed" &&
      isRuntimeActionConfirmationRequestId(item.request_id),
  );
}
