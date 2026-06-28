import type {
  AgentRuntimeIncidentView,
  AgentRuntimeOutcomeView,
  AgentRuntimeRequestView,
  AgentRuntimeThreadReadModel,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
} from "../types";
import { isRuntimePermissionConfirmationWaitMessage } from "./runtimeActionConfirmation";

export type ThreadReliabilityTone =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "paused"
  | "neutral";

export interface ThreadReliabilityRequestDisplay {
  id: string;
  title: string;
  typeLabel: string;
  statusLabel: string;
  statusTone: ThreadReliabilityTone;
  createdAtLabel?: string | null;
  waitingLabel?: string | null;
}

export interface ThreadReliabilityIncidentDisplay {
  id: string;
  incidentType: string;
  title: string;
  detail?: string | null;
  statusLabel: string;
  severityLabel: string;
  tone: ThreadReliabilityTone;
}

export interface ThreadReliabilityOutcomeDisplay {
  label: string;
  summary: string;
  primaryCause?: string | null;
  retryable: boolean;
  endedAtLabel?: string | null;
  tone: ThreadReliabilityTone;
  outcomeType?: string | null;
}

export interface ThreadReliabilityQueuedTurnDisplay {
  id: string;
  title: string;
  positionLabel?: string | null;
}

export interface ThreadReliabilityViewModel {
  shouldRender: boolean;
  statusLabel: string;
  statusTone: ThreadReliabilityTone;
  summary: string;
  activeTurnLabel?: string | null;
  updatedAtLabel?: string | null;
  interruptStateLabel?: string | null;
  pendingRequestCount: number;
  activeIncidentCount: number;
  queuedTurnCount: number;
  pendingRequests: ThreadReliabilityRequestDisplay[];
  submittedRequests: ThreadReliabilityRequestDisplay[];
  incidents: ThreadReliabilityIncidentDisplay[];
  outcome: ThreadReliabilityOutcomeDisplay | null;
  nextQueuedTurn: ThreadReliabilityQueuedTurnDisplay | null;
  recommendations: string[];
}

export type ThreadReliabilitySummaryModel = Pick<
  ThreadReliabilityViewModel,
  "shouldRender" | "statusLabel" | "statusTone" | "summary"
>;

interface BuildThreadReliabilityViewParams {
  threadRead?: AgentRuntimeThreadReadModel | null;
  turns?: AgentThreadTurn[];
  threadItems?: AgentThreadItem[];
  currentTurnId?: string | null;
  pendingActions?: ActionRequired[];
  submittedActionsInFlight?: ActionRequired[];
  queuedTurns?: QueuedTurnSnapshot[];
  t?: ThreadReliabilityViewTranslation;
  locale?: string | null;
}

const NON_BLOCKING_RUNTIME_WARNING_CODES = new Set([
  "artifact_document_repaired",
]);

const VIEW_I18N_PREFIX = "agentChat.threadReliability.view.";
const DEFAULT_VIEW_LOCALE = "en-US";

export type ThreadReliabilityViewTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface ThreadReliabilityViewTextContext {
  t?: ThreadReliabilityViewTranslation;
  locale: string;
}

type RuntimeIssueThreadItem = Extract<
  AgentThreadItem,
  { type: "error" | "warning" }
>;

function createThreadReliabilityViewTextContext(
  params: Pick<BuildThreadReliabilityViewParams, "t" | "locale">,
): ThreadReliabilityViewTextContext {
  return {
    t: params.t,
    locale: params.locale?.trim() || DEFAULT_VIEW_LOCALE,
  };
}

function interpolateFallback(
  template: string,
  options?: Record<string, unknown>,
): string {
  if (!options) {
    return template;
  }

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const value = options[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function viewText(
  context: ThreadReliabilityViewTextContext,
  key: string,
  fallback: string,
  options?: Record<string, unknown>,
): string {
  const fullKey = `${VIEW_I18N_PREFIX}${key}`;
  const translated = context.t?.(fullKey, options);
  if (translated && translated !== fullKey) {
    return translated;
  }
  return interpolateFallback(fallback, options);
}

function normalizeText(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function shortenText(value?: string | null, maxLength = 52): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseDateValue(value?: string | number | null): Date | null {
  if (typeof value === "number") {
    const normalizedValue = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(normalizedValue);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function formatTimeLabel(
  value: string | number | null | undefined,
  context: ThreadReliabilityViewTextContext,
): string | null {
  const date = parseDateValue(value);
  if (!date) {
    return null;
  }

  return date.toLocaleString(context.locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWaitingLabel(
  value: string | number | null | undefined,
  context: ThreadReliabilityViewTextContext,
): string | null {
  const date = parseDateValue(value);
  if (!date) {
    return null;
  }

  const deltaMs = Math.max(0, Date.now() - date.getTime());
  const deltaMinutes = Math.floor(deltaMs / 60_000);
  const deltaHours = Math.floor(deltaMinutes / 60);

  if (deltaMinutes < 1) {
    return viewText(context, "time.justNow", "Just now");
  }
  if (deltaMinutes < 60) {
    return viewText(context, "time.waitingMinutes", "Waiting {{count}} min", {
      count: deltaMinutes,
    });
  }
  if (deltaHours < 24) {
    return viewText(context, "time.waitingHours", "Waiting {{count}} hr", {
      count: deltaHours,
    });
  }
  return viewText(context, "time.waitingDays", "Waiting {{count}} days", {
    count: Math.floor(deltaHours / 24),
  });
}

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

function mergePendingRequests(
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

function hasActiveFailedIncident(
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

function mergeSubmittedRequests(
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

function resolveLatestTurn(
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

export function resolveOutcomeTone(
  outcomeType?: string,
): ThreadReliabilityTone {
  const normalized = (outcomeType || "").toLowerCase();
  if (normalized.includes("complete")) {
    return "completed";
  }
  if (normalized.includes("interrupt") || normalized.includes("abort")) {
    return "paused";
  }
  if (normalized.includes("wait")) {
    return "waiting";
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return "failed";
  }
  return "neutral";
}

export function resolveOutcomeLabel(
  outcomeType: string | undefined,
  context: ThreadReliabilityViewTextContext = createThreadReliabilityViewTextContext(
    {},
  ),
): string {
  const normalized = (outcomeType || "").toLowerCase();
  if (normalized.includes("complete")) {
    return viewText(context, "outcome.label.completed", "Completed");
  }
  if (normalized.includes("interrupt") || normalized.includes("abort")) {
    return viewText(context, "outcome.label.interrupted", "Interrupted");
  }
  if (normalized.includes("provider")) {
    return viewText(context, "outcome.label.providerFailed", "Provider failed");
  }
  if (normalized.includes("tool")) {
    return viewText(context, "outcome.label.toolFailed", "Tool failed");
  }
  if (normalized.includes("wait") && normalized.includes("approval")) {
    return viewText(
      context,
      "outcome.label.waitingApproval",
      "Waiting for approval",
    );
  }
  if (normalized.includes("wait") && normalized.includes("user")) {
    return viewText(context, "outcome.label.waitingUser", "Waiting for input");
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return viewText(context, "outcome.label.failed", "Failed");
  }
  return viewText(context, "outcome.label.recent", "Latest result");
}

function deriveOutcomeFromTurn(
  latestTurn: AgentThreadTurn | null,
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityOutcomeDisplay | null {
  if (!latestTurn) {
    return null;
  }

  if (latestTurn.status === "completed") {
    return {
      label: viewText(context, "outcome.label.completed", "Completed"),
      summary: viewText(
        context,
        "outcome.summary.completed",
        "The latest turn completed successfully",
      ),
      retryable: false,
      endedAtLabel: formatTimeLabel(latestTurn.completed_at, context),
      tone: "completed",
      outcomeType: "completed",
    };
  }

  if (latestTurn.status === "failed") {
    if (isRuntimePermissionConfirmationWaitMessage(latestTurn.error_message)) {
      return {
        label: viewText(context, "status.waiting", "Waiting"),
        summary: viewText(
          context,
          "outcome.summary.permissionWait",
          "This turn is waiting for runtime permission confirmation",
        ),
        retryable: true,
        endedAtLabel: formatTimeLabel(latestTurn.completed_at, context),
        tone: "waiting",
        outcomeType: "waiting_permission",
      };
    }

    return {
      label: viewText(context, "outcome.label.failed", "Failed"),
      summary:
        normalizeText(latestTurn.error_message) ||
        viewText(
          context,
          "outcome.summary.failedFallback",
          "The latest turn failed",
        ),
      primaryCause: normalizeText(latestTurn.error_message),
      retryable: true,
      endedAtLabel: formatTimeLabel(latestTurn.completed_at, context),
      tone: "failed",
      outcomeType: "failed",
    };
  }

  if (latestTurn.status === "aborted") {
    return {
      label: viewText(context, "outcome.label.interrupted", "Interrupted"),
      summary: viewText(
        context,
        "outcome.summary.aborted",
        "The latest turn was interrupted",
      ),
      retryable: true,
      endedAtLabel: formatTimeLabel(latestTurn.completed_at, context),
      tone: "paused",
      outcomeType: "aborted",
    };
  }

  return null;
}

function normalizeOutcome(
  outcome: AgentRuntimeOutcomeView | null | undefined,
  latestTurn: AgentThreadTurn | null,
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityOutcomeDisplay | null {
  if (!outcome) {
    return deriveOutcomeFromTurn(latestTurn, context);
  }

  return {
    label: resolveOutcomeLabel(outcome.outcome_type, context),
    summary:
      shortenText(outcome.summary, 72) ||
      shortenText(outcome.primary_cause, 72) ||
      viewText(context, "outcome.summary.updated", "Latest result updated"),
    primaryCause: shortenText(outcome.primary_cause, 72),
    retryable: Boolean(outcome.retryable),
    endedAtLabel: formatTimeLabel(outcome.ended_at, context),
    tone: resolveOutcomeTone(outcome.outcome_type),
    outcomeType: outcome.outcome_type,
  };
}

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

function normalizeIncidents(
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

function normalizeInterruptStateLabel(
  interruptState?: string | null,
  context: ThreadReliabilityViewTextContext = createThreadReliabilityViewTextContext(
    {},
  ),
): string | null {
  const normalized = (interruptState || "").toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.includes("interrupting")) {
    return viewText(
      context,
      "interrupt.interrupting",
      "Runtime is processing the interruption",
    );
  }
  if (normalized.includes("interrupt")) {
    return viewText(
      context,
      "interrupt.interrupted",
      "Runtime confirmed the interruption",
    );
  }
  return shortenText(interruptState, 32);
}

function resolveNextQueuedTurn(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
  queuedTurns: QueuedTurnSnapshot[],
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityQueuedTurnDisplay | null {
  const candidate =
    threadRead?.queued_turns?.[0] ??
    (queuedTurns.length > 0 ? queuedTurns[0] : null);

  if (!candidate) {
    return null;
  }

  return {
    id: candidate.queued_turn_id,
    title:
      shortenText(candidate.message_preview, 48) ||
      shortenText(candidate.message_text, 48) ||
      viewText(context, "queue.titleFallback", "Continue queued turn"),
    positionLabel:
      candidate.position > 0
        ? viewText(context, "queue.position", "Queue #{{position}}", {
            position: candidate.position,
          })
        : null,
  };
}

function resolveStatusMeta(
  status: string | undefined,
  context: ThreadReliabilityViewTextContext,
): {
  label: string;
  tone: ThreadReliabilityTone;
} {
  const normalized = (status || "").toLowerCase();
  if (normalized.includes("interrupting")) {
    return {
      label: viewText(context, "status.interrupting", "Interrupting"),
      tone: "paused",
    };
  }
  if (normalized.includes("wait") || normalized.includes("queue")) {
    return {
      label: viewText(context, "status.waiting", "Waiting"),
      tone: "waiting",
    };
  }
  if (normalized.includes("interrupt") || normalized.includes("abort")) {
    return {
      label: viewText(context, "status.interrupted", "Interrupted"),
      tone: "paused",
    };
  }
  if (normalized.includes("run") || normalized.includes("active")) {
    return {
      label: viewText(context, "status.running", "Running"),
      tone: "running",
    };
  }
  if (
    normalized.includes("complete") ||
    normalized.includes("done") ||
    normalized.includes("success")
  ) {
    return {
      label: viewText(context, "status.completed", "Completed"),
      tone: "completed",
    };
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return {
      label: viewText(context, "status.failed", "Failed"),
      tone: "failed",
    };
  }
  return {
    label: viewText(context, "status.idle", "Idle"),
    tone: "neutral",
  };
}

function deriveStatusFromRuntime(params: {
  threadRead?: AgentRuntimeThreadReadModel | null;
  latestTurn: AgentThreadTurn | null;
  pendingRequests: ThreadReliabilityRequestDisplay[];
  submittedRequests: ThreadReliabilityRequestDisplay[];
  queuedTurnCount: number;
  context: ThreadReliabilityViewTextContext;
}): { label: string; tone: ThreadReliabilityTone } {
  if (params.submittedRequests.length > 0) {
    return {
      label: viewText(params.context, "status.processing", "Processing"),
      tone: "running",
    };
  }
  if (params.threadRead?.status) {
    return resolveStatusMeta(params.threadRead.status, params.context);
  }

  if (params.pendingRequests.length > 0) {
    return {
      label: viewText(params.context, "status.waiting", "Waiting"),
      tone: "waiting",
    };
  }

  if (params.latestTurn?.status === "running") {
    return {
      label: viewText(params.context, "status.running", "Running"),
      tone: "running",
    };
  }
  if (params.latestTurn?.status === "completed") {
    return {
      label: viewText(params.context, "status.completed", "Completed"),
      tone: "completed",
    };
  }
  if (params.latestTurn?.status === "failed") {
    if (
      isRuntimePermissionConfirmationWaitMessage(
        params.latestTurn.error_message,
      )
    ) {
      return {
        label: viewText(params.context, "status.waiting", "Waiting"),
        tone: "waiting",
      };
    }
    return {
      label: viewText(params.context, "status.failed", "Failed"),
      tone: "failed",
    };
  }
  if (params.latestTurn?.status === "aborted") {
    return {
      label: viewText(params.context, "status.interrupted", "Interrupted"),
      tone: "paused",
    };
  }
  if (params.queuedTurnCount > 0) {
    return {
      label: viewText(params.context, "status.waiting", "Waiting"),
      tone: "waiting",
    };
  }

  return {
    label: viewText(params.context, "status.idle", "Idle"),
    tone: "neutral",
  };
}

function buildSummary(params: {
  statusLabel: string;
  latestTurn: AgentThreadTurn | null;
  pendingRequests: ThreadReliabilityRequestDisplay[];
  submittedRequests: ThreadReliabilityRequestDisplay[];
  incidents: ThreadReliabilityIncidentDisplay[];
  outcome: ThreadReliabilityOutcomeDisplay | null;
  queuedTurnCount: number;
  interruptState?: string | null;
  interruptStateLabel?: string | null;
  nextQueuedTurn: ThreadReliabilityQueuedTurnDisplay | null;
  context: ThreadReliabilityViewTextContext;
}): string {
  if (params.pendingRequests.length > 0) {
    return viewText(
      params.context,
      "summary.pendingRequest",
      "Current thread is waiting for user action: {{title}}",
      {
        title:
          params.pendingRequests[0]?.title ||
          viewText(
            params.context,
            "summary.pendingRequestFallback",
            "Review pending requests",
          ),
      },
    );
  }

  if (params.submittedRequests.length > 0) {
    return viewText(
      params.context,
      "summary.submittedRequest",
      "Submitted response: {{title}}. Waiting for runtime to refresh status.",
      {
        title:
          params.submittedRequests[0]?.title ||
          viewText(
            params.context,
            "summary.submittedRequestFallback",
            "Waiting for thread to continue",
          ),
      },
    );
  }

  if (params.incidents.length > 0) {
    return params.incidents[0]?.detail
      ? viewText(
          params.context,
          "summary.incidentWithDetail",
          "{{title}}: {{detail}}",
          {
            title: params.incidents[0].title,
            detail: params.incidents[0].detail,
          },
        )
      : params.incidents[0].title;
  }

  if (params.interruptStateLabel) {
    if ((params.interruptState || "").toLowerCase().includes("interrupting")) {
      return viewText(
        params.context,
        "summary.interrupting",
        "{{state}}. Wait for runtime to refresh the final status.",
        { state: params.interruptStateLabel },
      );
    }
    if (params.nextQueuedTurn) {
      return viewText(
        params.context,
        "summary.interruptedWithNext",
        "{{state}}. You can continue {{title}}.",
        {
          state: params.interruptStateLabel,
          title: params.nextQueuedTurn.title,
        },
      );
    }
    return viewText(
      params.context,
      "summary.interrupted",
      "{{state}}. Start a new turn if you need to continue.",
      { state: params.interruptStateLabel },
    );
  }

  if (params.latestTurn?.status === "running") {
    return viewText(
      params.context,
      "summary.running",
      "Current thread is running: {{title}}",
      {
        title:
          shortenText(params.latestTurn.prompt_text, 52) ||
          viewText(params.context, "summary.runningFallback", "Processing"),
      },
    );
  }

  if (params.outcome) {
    return params.outcome.summary;
  }

  if (params.queuedTurnCount > 0) {
    return viewText(
      params.context,
      "summary.queuedTurns",
      "{{count}} queued turns are waiting to run",
      { count: params.queuedTurnCount },
    );
  }

  return viewText(
    params.context,
    "summary.status",
    "Current thread status: {{status}}",
    { status: params.statusLabel },
  );
}

function buildRecommendations(params: {
  pendingRequests: ThreadReliabilityRequestDisplay[];
  submittedRequests: ThreadReliabilityRequestDisplay[];
  incidents: ThreadReliabilityIncidentDisplay[];
  outcome: ThreadReliabilityOutcomeDisplay | null;
  nextQueuedTurn: ThreadReliabilityQueuedTurnDisplay | null;
  interruptState?: string | null;
  interruptStateLabel?: string | null;
  context: ThreadReliabilityViewTextContext;
}): string[] {
  const recommendations = new Set<string>();
  const incidentTypes = new Set(
    params.incidents.map((incident) => incident.incidentType),
  );

  if (params.pendingRequests.length > 0) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.pendingRequest",
        "Respond to the current pending request first",
      ),
    );
  }
  if (params.submittedRequests.length > 0) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.submittedRequest",
        "Wait for runtime to refresh the latest status",
      ),
    );
  }
  if (params.incidents.some((incident) => incident.tone === "failed")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.failedIncident",
        "Handle high-priority incidents first",
      ),
    );
  }
  if (incidentTypes.has("approval_timeout")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.approvalTimeout",
        "Approval has been waiting too long; handle it soon or stop this run",
      ),
    );
  }
  if (incidentTypes.has("user_input_timeout")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.userInputTimeout",
        "User input has been waiting too long; add input and continue the thread",
      ),
    );
  }
  if (incidentTypes.has("turn_stuck")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.turnStuck",
        "The current turn has stalled; stop it and resume execution",
      ),
    );
  }
  if (incidentTypes.has("provider_error")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.providerError",
        "Provider failures are usually retryable; resume later or resend the turn",
      ),
    );
  }
  if (incidentTypes.has("tool_failed")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.toolFailed",
        "Check the failed tool's parameters or environment before retrying",
      ),
    );
  }
  if (params.interruptStateLabel) {
    if ((params.interruptState || "").toLowerCase().includes("interrupting")) {
      recommendations.add(
        viewText(
          params.context,
          "recommendation.interrupting",
          "Stopping the current run; wait for runtime to refresh the final status",
        ),
      );
    } else {
      recommendations.add(
        viewText(
          params.context,
          "recommendation.interrupted",
          "Runtime has confirmed this run was interrupted",
        ),
      );
    }
  }
  if (
    params.nextQueuedTurn &&
    !(params.interruptState || "").toLowerCase().includes("interrupting")
  ) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.nextQueuedTurn",
        "Continue queued turn: {{title}}",
        { title: params.nextQueuedTurn.title },
      ),
    );
  }
  if (params.outcome?.retryable) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.retryable",
        "The latest result supports retry; resume or start a new turn",
      ),
    );
  }
  if ((params.outcome?.outcomeType || "").toLowerCase().includes("provider")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.providerError",
        "Provider failures are usually retryable; resume later or resend the turn",
      ),
    );
  }
  if ((params.outcome?.outcomeType || "").toLowerCase().includes("tool")) {
    recommendations.add(
      viewText(
        params.context,
        "recommendation.toolFailed",
        "Check the failed tool's parameters or environment before retrying",
      ),
    );
  }

  return [...recommendations];
}

export function buildThreadReliabilityView(
  params: BuildThreadReliabilityViewParams,
): ThreadReliabilityViewModel {
  const context = createThreadReliabilityViewTextContext(params);
  const turns = params.turns ?? [];
  const threadItems = params.threadItems ?? [];
  const pendingActions = params.pendingActions ?? [];
  const submittedActionsInFlight = params.submittedActionsInFlight ?? [];
  const latestTurn = resolveLatestTurn(turns, params.currentTurnId);
  const activeTurnCandidates = params.threadRead?.active_turn_id
    ? [params.threadRead.active_turn_id]
    : [params.currentTurnId, latestTurn?.id];
  const activeTurnIds = new Set(
    activeTurnCandidates.filter((item): item is string =>
      Boolean(item?.trim()),
    ),
  );
  const allowLocalPendingActions =
    !params.threadRead ||
    (params.threadRead.pending_requests?.length ?? 0) > 0 ||
    !hasActiveFailedIncident(params.threadRead);
  const pendingRequests = mergePendingRequests(
    params.threadRead,
    pendingActions,
    submittedActionsInFlight,
    activeTurnIds,
    allowLocalPendingActions,
    context,
  );
  const submittedRequests = mergeSubmittedRequests(
    submittedActionsInFlight,
    context,
  );
  const queuedTurnCount =
    params.threadRead?.queued_turns?.length ?? params.queuedTurns?.length ?? 0;
  const outcome = normalizeOutcome(
    params.threadRead?.last_outcome,
    latestTurn,
    context,
  );
  const updatedAtLabel = formatTimeLabel(
    params.threadRead?.updated_at,
    context,
  );
  const interruptStateLabel = normalizeInterruptStateLabel(
    params.threadRead?.interrupt_state,
    context,
  );
  const nextQueuedTurn = resolveNextQueuedTurn(
    params.threadRead,
    params.queuedTurns ?? [],
    context,
  );
  const incidents = normalizeIncidents(
    params.threadRead,
    latestTurn,
    threadItems,
    pendingRequests,
    submittedActionsInFlight,
    context,
  );
  const statusMeta = deriveStatusFromRuntime({
    threadRead: params.threadRead,
    latestTurn,
    pendingRequests,
    submittedRequests,
    queuedTurnCount,
    context,
  });

  return {
    shouldRender:
      Boolean(params.threadRead) ||
      turns.length > 0 ||
      pendingRequests.length > 0 ||
      submittedRequests.length > 0 ||
      incidents.length > 0 ||
      queuedTurnCount > 0,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    summary: buildSummary({
      statusLabel: statusMeta.label,
      latestTurn,
      pendingRequests,
      submittedRequests,
      incidents,
      outcome,
      queuedTurnCount,
      interruptState: params.threadRead?.interrupt_state,
      interruptStateLabel,
      nextQueuedTurn,
      context,
    }),
    activeTurnLabel:
      shortenText(latestTurn?.prompt_text, 56) ||
      params.threadRead?.active_turn_id ||
      latestTurn?.id ||
      null,
    updatedAtLabel,
    interruptStateLabel,
    pendingRequestCount: pendingRequests.length,
    activeIncidentCount: incidents.length,
    queuedTurnCount,
    pendingRequests,
    submittedRequests,
    incidents,
    outcome,
    nextQueuedTurn,
    recommendations: buildRecommendations({
      pendingRequests,
      submittedRequests,
      incidents,
      outcome,
      nextQueuedTurn,
      interruptState: params.threadRead?.interrupt_state,
      interruptStateLabel,
      context,
    }),
  };
}

export function buildThreadReliabilitySummary(
  params: Omit<BuildThreadReliabilityViewParams, "threadItems">,
): ThreadReliabilitySummaryModel {
  const context = createThreadReliabilityViewTextContext(params);
  const turns = params.turns ?? [];
  const pendingActions = params.pendingActions ?? [];
  const submittedActionsInFlight = params.submittedActionsInFlight ?? [];
  const latestTurn = resolveLatestTurn(turns, params.currentTurnId);
  const activeTurnCandidates = params.threadRead?.active_turn_id
    ? [params.threadRead.active_turn_id]
    : [params.currentTurnId, latestTurn?.id];
  const activeTurnIds = new Set(
    activeTurnCandidates.filter((item): item is string =>
      Boolean(item?.trim()),
    ),
  );
  const allowLocalPendingActions =
    !params.threadRead ||
    (params.threadRead.pending_requests?.length ?? 0) > 0 ||
    !hasActiveFailedIncident(params.threadRead);
  const pendingRequests = mergePendingRequests(
    params.threadRead,
    pendingActions,
    submittedActionsInFlight,
    activeTurnIds,
    allowLocalPendingActions,
    context,
  );
  const submittedRequests = mergeSubmittedRequests(
    submittedActionsInFlight,
    context,
  );
  const queuedTurnCount =
    params.threadRead?.queued_turns?.length ?? params.queuedTurns?.length ?? 0;
  const outcome = normalizeOutcome(
    params.threadRead?.last_outcome,
    latestTurn,
    context,
  );
  const interruptStateLabel = normalizeInterruptStateLabel(
    params.threadRead?.interrupt_state,
    context,
  );
  const nextQueuedTurn = resolveNextQueuedTurn(
    params.threadRead,
    params.queuedTurns ?? [],
    context,
  );
  const statusMeta = deriveStatusFromRuntime({
    threadRead: params.threadRead,
    latestTurn,
    pendingRequests,
    submittedRequests,
    queuedTurnCount,
    context,
  });

  return {
    shouldRender:
      Boolean(params.threadRead) ||
      turns.length > 0 ||
      pendingRequests.length > 0 ||
      submittedRequests.length > 0 ||
      queuedTurnCount > 0,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    summary: buildSummary({
      statusLabel: statusMeta.label,
      latestTurn,
      pendingRequests,
      submittedRequests,
      incidents: [],
      outcome,
      queuedTurnCount,
      interruptState: params.threadRead?.interrupt_state,
      interruptStateLabel,
      nextQueuedTurn,
      context,
    }),
  };
}
