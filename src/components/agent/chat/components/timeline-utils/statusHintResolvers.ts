import type { ActionRequired, AgentThreadItem, AgentThreadTurn } from "../../types";
import {
  isPendingRuntimeActionConfirmation,
  isRuntimeActionConfirmationRequestId,
  isRuntimeActionConfirmationThreadItem,
  isRuntimePermissionConfirmationWaitMessage,
  isSubmittedRuntimeActionConfirmation,
} from "../../utils/runtimeActionConfirmation";
import { resolveAgentRuntimeErrorPresentation } from "../../utils/agentRuntimeErrorPresentation";

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

export function resolveUserFacingErrorMessage(errorMessage?: string | null): string {
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
      label: "待处理",
      detail:
        pendingAction.prompt?.trim() ||
        "当前阶段在等待你确认，完成后会继续后续处理。",
    };
  }

  if (params.runtimeConfirmationPrompt?.trim()) {
    return {
      tone: "warning" as const,
      label: "待处理",
      detail: params.runtimeConfirmationPrompt.trim(),
    };
  }

  if (params.turn.status === "failed") {
    if (isRuntimePermissionConfirmationWaitMessage(params.turn.error_message)) {
      if (params.hasSubmittedRuntimeConfirmation) {
        return {
          tone: "neutral" as const,
          label: "已确认",
          detail: "已收到运行时权限确认，正在继续处理当前任务。",
        };
      }

      return {
        tone: "warning" as const,
        label: "待处理",
        detail: "当前阶段在等待你确认运行时权限。",
      };
    }
  }

  if (params.turn.status === "aborted") {
    return {
      tone: "neutral" as const,
      label: "已暂停",
      detail:
        params.turn.error_message?.trim() ||
        "当前阶段已暂停，你可以处理后继续下一步。",
    };
  }

  if (params.turn.status === "failed" && params.turn.error_message?.trim()) {
    return {
      tone: "error" as const,
      label: "失败",
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
      return actionRequest.prompt?.trim() || "当前阶段在等待你确认运行时权限。";
    }
  }

  for (let index = params.items.length - 1; index >= 0; index -= 1) {
    const item = params.items[index];
    if (
      isRuntimeActionConfirmationThreadItem(item) &&
      item.status !== "completed"
    ) {
      return item.prompt?.trim() || "当前阶段在等待你确认运行时权限。";
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
