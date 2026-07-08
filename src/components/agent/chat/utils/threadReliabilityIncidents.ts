import type {
  AgentRuntimeIncidentView,
  AgentRuntimeThreadReadModel,
} from "@/lib/api/agentRuntime";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
} from "../types";
import { isRuntimePermissionConfirmationWaitMessage } from "./runtimeActionConfirmation";
import { normalizeText, shortenText, viewText } from "./threadReliabilityText";
import type {
  RuntimeIssueThreadItem,
  ThreadReliabilityIncidentDisplay,
  ThreadReliabilityRequestDisplay,
  ThreadReliabilityTone,
  ThreadReliabilityViewTextContext,
} from "./threadReliabilityTypes";

const NON_BLOCKING_RUNTIME_WARNING_CODES = new Set([
  "artifact_document_repaired",
]);

function describeIncidentDetails(details: unknown): string | null {
  if (typeof details === "string") {
    return shortenText(details, 80);
  }
  if (details && typeof details === "object") {
    try {
      return shortenText(JSON.stringify(details), 80);
    } catch {
      return null;
    }
  }
  return null;
}

function isRuntimePermissionConfirmationWaitDetails(details: unknown): boolean {
  if (typeof details === "string") {
    return isRuntimePermissionConfirmationWaitMessage(details);
  }
  if (!details || typeof details !== "object") {
    return false;
  }

  const record = details as Record<string, unknown>;
  const message = record.message;
  if (
    typeof message === "string" &&
    isRuntimePermissionConfirmationWaitMessage(message)
  ) {
    return true;
  }

  try {
    return isRuntimePermissionConfirmationWaitMessage(JSON.stringify(details));
  } catch {
    return false;
  }
}

function isRuntimePermissionConfirmationWaitIncident(
  incident: AgentRuntimeIncidentView,
): boolean {
  return (
    isRuntimePermissionConfirmationWaitMessage(incident.title) ||
    isRuntimePermissionConfirmationWaitDetails(incident.details)
  );
}

export function resolveIncidentToneFromSeverity(
  severity?: string,
): ThreadReliabilityTone {
  const normalized = (severity || "").toLowerCase();
  if (normalized.includes("critical") || normalized.includes("high")) {
    return "failed";
  }
  if (normalized.includes("warn") || normalized.includes("medium")) {
    return "waiting";
  }
  return "neutral";
}

function normalizeIncident(
  incident: AgentRuntimeIncidentView,
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityIncidentDisplay {
  const severity = (incident.severity || "").toLowerCase();
  const tone = resolveIncidentToneFromSeverity(incident.severity);
  let severityLabel = viewText(context, "incident.severity.low", "Low");

  if (severity.includes("critical") || severity.includes("high")) {
    severityLabel = viewText(context, "incident.severity.high", "High");
  } else if (severity.includes("warn") || severity.includes("medium")) {
    severityLabel = viewText(context, "incident.severity.medium", "Medium");
  }

  const statusLabel =
    incident.status && incident.status.toLowerCase().includes("clear")
      ? viewText(context, "incident.status.recovered", "Recovered")
      : viewText(context, "incident.status.active", "Active");

  return {
    id: incident.id,
    incidentType: incident.incident_type,
    title:
      shortenText(incident.title, 56) ||
      shortenText(incident.incident_type, 56) ||
      viewText(context, "incident.title.default", "Runtime incident"),
    detail: describeIncidentDetails(incident.details),
    statusLabel,
    severityLabel,
    tone,
  };
}

function resolveIncidentPriority(
  incident: ThreadReliabilityIncidentDisplay,
): number {
  if (incident.tone === "failed") {
    return 0;
  }
  if (incident.tone === "waiting") {
    return 1;
  }
  return 2;
}

function sortIncidentsByPriority(
  incidents: ThreadReliabilityIncidentDisplay[],
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityIncidentDisplay[] {
  return [...incidents].sort((left, right) => {
    const priorityDelta =
      resolveIncidentPriority(left) - resolveIncidentPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.title.localeCompare(right.title, context.locale);
  });
}

function deriveFallbackIncidents(
  latestTurn: AgentThreadTurn | null,
  threadItems: AgentThreadItem[],
  pendingRequests: ThreadReliabilityRequestDisplay[],
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityIncidentDisplay[] {
  if (pendingRequests.length > 0) {
    return [
      {
        id: `pending-request-${pendingRequests[0]?.id || "active"}`,
        incidentType: "waiting_user_input",
        title: viewText(
          context,
          "incident.title.waitingUserInput",
          "Thread is waiting for user action",
        ),
        detail: pendingRequests[0]?.title || null,
        statusLabel: viewText(context, "incident.status.active", "Active"),
        severityLabel: viewText(context, "incident.severity.medium", "Medium"),
        tone: "waiting",
      },
    ];
  }

  if (latestTurn?.status === "failed") {
    if (isRuntimePermissionConfirmationWaitMessage(latestTurn.error_message)) {
      return [];
    }

    return [
      {
        id: `turn-failed-${latestTurn.id}`,
        incidentType: "turn_failed",
        title: viewText(
          context,
          "incident.title.turnFailed",
          "The latest turn failed",
        ),
        detail: shortenText(latestTurn.error_message, 80),
        statusLabel: viewText(context, "incident.status.active", "Active"),
        severityLabel: viewText(context, "incident.severity.high", "High"),
        tone: "failed",
      },
    ];
  }

  const issueItem = [...threadItems]
    .reverse()
    .find((item): item is RuntimeIssueThreadItem => {
      if (item.type !== "error" && item.type !== "warning") {
        return false;
      }
      if (isRuntimePermissionConfirmationWaitMessage(item.message)) {
        return false;
      }
      if (item.type === "error") {
        return true;
      }
      const code = normalizeText(item.code);
      return !code || !NON_BLOCKING_RUNTIME_WARNING_CODES.has(code);
    });

  if (!issueItem) {
    return [];
  }

  if (issueItem.type === "error") {
    return [
      {
        id: issueItem.id,
        incidentType: "runtime_error",
        title: viewText(
          context,
          "incident.title.runtimeError",
          "Timeline recorded an error",
        ),
        detail: shortenText(issueItem.message, 80),
        statusLabel: viewText(context, "incident.status.active", "Active"),
        severityLabel: viewText(context, "incident.severity.high", "High"),
        tone: "failed",
      },
    ];
  }

  return [
    {
      id: issueItem.id,
      incidentType: "runtime_warning",
      title: viewText(
        context,
        "incident.title.runtimeWarning",
        "Timeline recorded a warning",
      ),
      detail: shortenText(issueItem.message, 80),
      statusLabel: viewText(context, "incident.status.active", "Active"),
      severityLabel: viewText(context, "incident.severity.medium", "Medium"),
      tone: "waiting",
    },
  ];
}

export function normalizeIncidents(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
  latestTurn: AgentThreadTurn | null,
  threadItems: AgentThreadItem[],
  pendingRequests: ThreadReliabilityRequestDisplay[],
  submittedActionsInFlight: ActionRequired[],
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityIncidentDisplay[] {
  const submittedRequestIds = new Set(
    submittedActionsInFlight.map((item) => item.requestId),
  );
  const activeIncidents = (threadRead?.incidents ?? []).filter((incident) => {
    const normalizedStatus = (incident.status || "").toLowerCase();
    if (normalizedStatus.includes("clear") || incident.cleared_at) {
      return false;
    }
    if (isRuntimePermissionConfirmationWaitIncident(incident)) {
      return false;
    }
    if (submittedRequestIds.has(incident.id.replace(/^incident-/, ""))) {
      return false;
    }
    return true;
  });

  if (activeIncidents.length > 0) {
    return sortIncidentsByPriority(
      activeIncidents.map((incident) => normalizeIncident(incident, context)),
      context,
    );
  }

  return sortIncidentsByPriority(
    deriveFallbackIncidents(latestTurn, threadItems, pendingRequests, context),
    context,
  );
}
