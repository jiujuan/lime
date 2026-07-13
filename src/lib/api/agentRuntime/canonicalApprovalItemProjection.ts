import type { ThreadItem } from "@limecloud/app-server-client";
import type { AgentThreadItem } from "../agentProtocol";

type CanonicalApprovalPayload = Extract<
  ThreadItem["payload"],
  { type: "approval" }
>;
type ApprovalThreadItem = Extract<
  AgentThreadItem,
  { type: "approval_request" }
>;

export function projectCanonicalApprovalItem(
  value: unknown,
): ApprovalThreadItem | null {
  if (!isCanonicalApprovalItem(value)) {
    return null;
  }

  const payload = value.payload;
  return {
    id: value.itemId,
    thread_id: value.threadId,
    turn_id: value.turnId,
    sequence: value.sequence,
    status: projectItemStatus(value.status),
    started_at: timestampFromMillis(value.createdAtMs),
    completed_at:
      value.completedAtMs == null
        ? undefined
        : timestampFromMillis(value.completedAtMs),
    updated_at: timestampFromMillis(value.updatedAtMs),
    metadata: value.metadata,
    type: "approval_request",
    request_id: payload.request_id,
    action_type: payload.action.kind,
    prompt: payload.action.description || undefined,
    available_decisions: payload.available_decisions
      ?.map(projectAvailableDecision)
      .filter((decision) => decision !== null),
    response: projectApprovalResponse(payload),
  };
}

function isCanonicalApprovalItem(
  value: unknown,
): value is ThreadItem & { payload: CanonicalApprovalPayload } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<ThreadItem>;
  const payload = item.payload as Partial<CanonicalApprovalPayload> | undefined;
  return (
    isNonEmptyString(item.itemId) &&
    isNonEmptyString(item.threadId) &&
    isNonEmptyString(item.turnId) &&
    isFiniteNumber(item.sequence) &&
    isFiniteNumber(item.createdAtMs) &&
    isFiniteNumber(item.updatedAtMs) &&
    (item.completedAtMs == null || isFiniteNumber(item.completedAtMs)) &&
    isItemStatus(item.status) &&
    Boolean(payload && isApprovalPayload(payload))
  );
}

function isApprovalPayload(
  payload: Partial<CanonicalApprovalPayload>,
): payload is CanonicalApprovalPayload {
  return (
    payload.type === "approval" &&
    isNonEmptyString(payload.request_id) &&
    Boolean(
      payload.action &&
      typeof payload.action === "object" &&
      isNonEmptyString(payload.action.kind) &&
      typeof payload.action.description === "string",
    ) &&
    (payload.scope === undefined ||
      payload.scope === "once" ||
      payload.scope === "turn" ||
      payload.scope === "session") &&
    (payload.decision == null || isApprovalDecision(payload.decision)) &&
    (payload.available_decisions === undefined ||
      (Array.isArray(payload.available_decisions) &&
        payload.available_decisions.every(isApprovalDecision)))
  );
}

function isApprovalDecision(
  value: unknown,
): value is NonNullable<CanonicalApprovalPayload["decision"]> {
  return (
    value === "approved" ||
    value === "approvedForSession" ||
    value === "denied" ||
    value === "timedOut" ||
    value === "abort"
  );
}

function isItemStatus(value: unknown): value is ThreadItem["status"] {
  return (
    value === "pending" ||
    value === "inProgress" ||
    value === "completed" ||
    value === "failed" ||
    value === "interrupted" ||
    value === "cancelled"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function projectItemStatus(
  status: ThreadItem["status"],
): ApprovalThreadItem["status"] {
  switch (status) {
    case "failed":
      return "failed";
    case "pending":
    case "inProgress":
      return "in_progress";
    default:
      return "completed";
  }
}

function projectApprovalResponse(payload: CanonicalApprovalPayload): unknown {
  if (!payload.decision) {
    return undefined;
  }
  return {
    decision: projectApprovalDecision(payload.decision),
    decision_scope: payload.scope,
    reason_code: payload.reason_code,
  };
}

function projectApprovalDecision(
  decision: NonNullable<CanonicalApprovalPayload["decision"]>,
): string {
  switch (decision) {
    case "approved":
      return "allow_once";
    case "approvedForSession":
      return "allow_for_session";
    case "denied":
      return "decline";
    case "abort":
      return "cancel";
    case "timedOut":
      return "expired";
  }
}

function projectAvailableDecision(
  decision: NonNullable<
    CanonicalApprovalPayload["available_decisions"]
  >[number],
): NonNullable<ApprovalThreadItem["available_decisions"]>[number] | null {
  switch (decision) {
    case "approved":
      return "allow_once";
    case "approvedForSession":
      return "allow_for_session";
    case "denied":
      return "decline";
    case "abort":
      return "cancel";
    case "timedOut":
      return null;
  }
}

function timestampFromMillis(value: number): string {
  return new Date(value).toISOString();
}
