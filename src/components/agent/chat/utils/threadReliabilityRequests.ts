import type {
  AgentRuntimeRequestView,
  AgentRuntimeThreadReadModel,
} from "@/lib/api/agentRuntime/sessionTypes";
import type { ActionRequired, AgentThreadTurn } from "../types";
import {
  formatTimeLabel,
  formatWaitingLabel,
  shortenText,
  viewText,
} from "./threadReliabilityText";
import type {
  ThreadReliabilityRequestDisplay,
  ThreadReliabilityTone,
  ThreadReliabilityViewTextContext,
} from "./threadReliabilityTypes";

function resolveRequestTypeLabel(
  requestType: string | undefined,
  context: ThreadReliabilityViewTextContext,
): string {
  const normalized = (requestType || "").toLowerCase();
  if (normalized.includes("tool") || normalized.includes("approval")) {
    return viewText(context, "request.type.toolConfirmation", "Tool approval");
  }
  if (normalized.includes("elicitation")) {
    return viewText(context, "request.type.elicitation", "Structured input");
  }
  if (normalized.includes("ask") || normalized.includes("user")) {
    return viewText(context, "request.type.userInput", "User input");
  }
  return viewText(context, "request.type.pending", "Pending request");
}

function resolveRequestStatusMeta(
  status: string | undefined,
  context: ThreadReliabilityViewTextContext,
): {
  label: string;
  tone: ThreadReliabilityTone;
} {
  const normalized = (status || "").toLowerCase();

  if (
    normalized.includes("submitted") ||
    normalized.includes("queued") ||
    normalized.includes("answer")
  ) {
    return {
      label: viewText(context, "request.status.submitted", "Submitted"),
      tone: "waiting",
    };
  }
  if (
    normalized.includes("resolved") ||
    normalized.includes("completed") ||
    normalized.includes("declined")
  ) {
    return {
      label: viewText(context, "request.status.resolved", "Handled"),
      tone: "completed",
    };
  }
  if (normalized.includes("failed") || normalized.includes("error")) {
    return {
      label: viewText(context, "request.status.failed", "Failed"),
      tone: "failed",
    };
  }

  return {
    label: viewText(context, "request.status.pending", "Pending"),
    tone: "waiting",
  };
}

function isPendingRequest(request: AgentRuntimeRequestView): boolean {
  if (request.resolved_at) {
    return false;
  }
  const normalized = (request.status || "").toLowerCase();
  return !(
    normalized.includes("resolved") ||
    normalized.includes("completed") ||
    normalized.includes("declined") ||
    normalized.includes("cancelled")
  );
}

function requestTitleFromThreadRead(
  request: AgentRuntimeRequestView,
  context: ThreadReliabilityViewTextContext,
): string {
  return (
    shortenText(request.title) ||
    shortenText(
      typeof request.payload === "string" ? request.payload : undefined,
    ) ||
    `${resolveRequestTypeLabel(request.request_type, context)} #${request.id.slice(0, 8)}`
  );
}

function requestTitleFromAction(
  action: ActionRequired,
  context: ThreadReliabilityViewTextContext,
): string {
  if (action.actionType === "tool_confirmation") {
    return (
      shortenText(action.prompt) ||
      (action.toolName
        ? viewText(
            context,
            "request.title.toolConfirmationWithName",
            "Waiting to confirm tool: {{toolName}}",
            { toolName: action.toolName },
          )
        : viewText(
            context,
            "request.title.toolConfirmationFallback",
            "Waiting for tool approval",
          ))
    );
  }

  if (action.actionType === "elicitation") {
    return (
      shortenText(action.prompt) ||
      viewText(
        context,
        "request.title.elicitationFallback",
        "Waiting for structured input",
      )
    );
  }

  return (
    shortenText(action.prompt) ||
    viewText(
      context,
      "request.title.userInputFallback",
      "Waiting for user input",
    )
  );
}

export function mergePendingRequests(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
  pendingActions: ActionRequired[],
  submittedActionsInFlight: ActionRequired[],
  activeTurnIds: Set<string>,
  allowLocalPendingActions: boolean,
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityRequestDisplay[] {
  const merged = new Map<string, ThreadReliabilityRequestDisplay>();
  const submittedRequestIds = new Set(
    submittedActionsInFlight.map((item) => item.requestId),
  );

  for (const request of threadRead?.pending_requests ?? []) {
    if (submittedRequestIds.has(request.id)) {
      continue;
    }
    if (!isPendingRequest(request)) {
      continue;
    }
    const statusMeta = resolveRequestStatusMeta(request.status, context);
    merged.set(request.id, {
      id: request.id,
      title: requestTitleFromThreadRead(request, context),
      typeLabel: resolveRequestTypeLabel(request.request_type, context),
      statusLabel: statusMeta.label,
      statusTone: statusMeta.tone,
      createdAtLabel: formatTimeLabel(request.created_at, context),
      waitingLabel: formatWaitingLabel(request.created_at, context),
    });
  }

  for (const action of pendingActions) {
    if (!allowLocalPendingActions) {
      continue;
    }
    if (threadRead) {
      const actionTurnId = action.scope?.turnId?.trim();
      const shouldTrustLocalAction =
        actionTurnId !== undefined &&
        actionTurnId.length > 0 &&
        activeTurnIds.has(actionTurnId);
      if (!shouldTrustLocalAction) {
        continue;
      }
    }
    if (merged.has(action.requestId)) {
      continue;
    }
    const statusMeta = resolveRequestStatusMeta(action.status, context);
    merged.set(action.requestId, {
      id: action.requestId,
      title: requestTitleFromAction(action, context),
      typeLabel: resolveRequestTypeLabel(action.actionType, context),
      statusLabel: statusMeta.label,
      statusTone: statusMeta.tone,
    });
  }

  return [...merged.values()];
}

export function hasActiveFailedIncident(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
): boolean {
  return (threadRead?.incidents ?? []).some((incident) => {
    const normalizedStatus = (incident.status || "").toLowerCase();
    if (normalizedStatus.includes("clear") || incident.cleared_at) {
      return false;
    }

    const incidentText = [
      incident.incident_type,
      incident.severity,
      incident.title,
      typeof incident.details === "string" ? incident.details : undefined,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      incidentText.includes("error") ||
      incidentText.includes("fail") ||
      incidentText.includes("failed") ||
      incidentText.includes("runtime_error")
    );
  });
}

export function mergeSubmittedRequests(
  submittedActionsInFlight: ActionRequired[],
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityRequestDisplay[] {
  const merged = new Map<string, ThreadReliabilityRequestDisplay>();

  for (const action of submittedActionsInFlight) {
    merged.set(action.requestId, {
      id: action.requestId,
      title: requestTitleFromAction(action, context),
      typeLabel: resolveRequestTypeLabel(action.actionType, context),
      statusLabel: viewText(context, "request.status.submitted", "Submitted"),
      statusTone: "running",
    });
  }

  return [...merged.values()];
}

export function resolveLatestTurn(
  turns: AgentThreadTurn[],
  currentTurnId?: string | null,
): AgentThreadTurn | null {
  if (currentTurnId) {
    const currentTurn = turns.find((turn) => turn.id === currentTurnId);
    if (currentTurn) {
      return currentTurn;
    }
  }

  return turns.length > 0 ? turns[turns.length - 1] : null;
}
