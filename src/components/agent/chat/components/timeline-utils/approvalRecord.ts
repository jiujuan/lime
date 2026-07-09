import type { AgentThreadItem } from "../../types";
import type { ActionRequired } from "../../types";

export type ApprovalRecordDecision =
  | "allow_once"
  | "allow_for_session"
  | "approved"
  | "decline"
  | "declined"
  | "cancel"
  | "cancelled"
  | "expired"
  | "failed"
  | "unknown";

export type ApprovalRecordStatus =
  | "approved_once"
  | "approved_for_session"
  | "declined"
  | "cancelled"
  | "expired"
  | "failed"
  | "imported_read_only"
  | "unknown";

export interface ApprovalRecordViewModel {
  requestId: string;
  toolName?: string;
  prompt?: string;
  decision: ApprovalRecordDecision;
  status: ApprovalRecordStatus;
  decisionScope?: string;
  approvalScope?: Record<string, unknown>;
  source?: string;
  sourceEventType?: string;
  autoResolved: boolean;
  importedReadOnly: boolean;
}

type ApprovalThreadItem = Extract<
  AgentThreadItem,
  { type: "approval_request" }
>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(
  source: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!source) {
    return undefined;
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function booleanValue(
  source: Record<string, unknown> | undefined,
  keys: string[],
): boolean | undefined {
  if (!source) {
    return undefined;
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function objectValue(
  source: Record<string, unknown> | undefined,
  keys: string[],
): Record<string, unknown> | undefined {
  if (!source) {
    return undefined;
  }
  for (const key of keys) {
    const value = record(source[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizeDecision(value: string | undefined): ApprovalRecordDecision {
  switch (value) {
    case "allow_once":
    case "approved":
    case "allow":
      return value === "allow" ? "allow_once" : value;
    case "allow_for_session":
    case "approved_for_session":
      return "allow_for_session";
    case "decline":
    case "declined":
    case "deny":
    case "denied":
    case "rejected":
      return "decline";
    case "cancel":
    case "abort":
    case "aborted":
    case "canceled":
    case "cancelled":
      return "cancel";
    case "expired":
      return "expired";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

function decisionFromEventType(
  sourceEventType: string | undefined,
): ApprovalRecordDecision | undefined {
  switch (sourceEventType) {
    case "action.canceled":
    case "action.cancelled":
      return "cancel";
    case "action.expired":
      return "expired";
    default:
      return undefined;
  }
}

function statusFromDecision(params: {
  decision: ApprovalRecordDecision;
  sourceEventType?: string;
  itemStatus?: string;
  importedReadOnly?: boolean;
}): ApprovalRecordStatus {
  if (params.importedReadOnly && params.decision === "unknown") {
    return "imported_read_only";
  }
  if (params.sourceEventType === "action.expired") {
    return "expired";
  }
  if (
    params.sourceEventType === "action.canceled" ||
    params.sourceEventType === "action.cancelled"
  ) {
    return "cancelled";
  }
  switch (params.decision) {
    case "allow_for_session":
      return "approved_for_session";
    case "allow_once":
    case "approved":
      return "approved_once";
    case "decline":
    case "declined":
      return "declined";
    case "cancel":
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "failed":
      return "failed";
    default:
      return params.itemStatus === "failed" ? "failed" : "unknown";
  }
}

function sourceFromResponse(
  response: Record<string, unknown> | undefined,
  autoResolved: boolean,
): string | undefined {
  return (
    stringValue(response, ["source", "sourceClient", "source_client"]) ||
    stringValue(objectValue(response, ["cache"]), ["source"]) ||
    (autoResolved ? "approval_session_cache" : undefined)
  );
}

function normalizedPolicyValue(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

function firstStringFromSources(
  sources: Array<Record<string, unknown> | undefined>,
  keys: string[],
): string | undefined {
  for (const source of sources) {
    const value = stringValue(source, keys);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function approvalPolicySourcesFromArguments(
  args: Record<string, unknown> | undefined,
): Array<Record<string, unknown> | undefined> {
  if (!args) {
    return [];
  }
  return [
    args,
    objectValue(args, ["policy", "permissionPolicy", "permission_policy"]),
    objectValue(args, ["turnConfig", "turn_config"]),
    objectValue(args, ["hostOptions", "host_options"]),
  ];
}

function shouldHideForFullAccess(
  sources: Array<Record<string, unknown> | undefined>,
): boolean {
  const approvalPolicy = normalizedPolicyValue(
    firstStringFromSources(sources, ["approvalPolicy", "approval_policy"]),
  );
  const sandboxPolicy = normalizedPolicyValue(
    firstStringFromSources(sources, [
      "sandboxPolicy",
      "sandbox_policy",
      "requestedSandboxPolicy",
      "requested_sandbox_policy",
    ]),
  );
  return approvalPolicy === "never" || sandboxPolicy === "danger-full-access";
}

export function toApprovalRecordFromThreadItem(
  item: ApprovalThreadItem,
): ApprovalRecordViewModel | null {
  const response = record(item.response);
  const metadata = record(item.metadata);
  const args = record(item.arguments);
  if (
    shouldHideForFullAccess([
      response,
      metadata,
      ...approvalPolicySourcesFromArguments(args),
    ])
  ) {
    return null;
  }

  const sourceEventType = stringValue(metadata, [
    "source_event_type",
    "sourceEventType",
  ]);
  const autoResolved =
    booleanValue(response, ["auto_resolved", "autoResolved"]) ?? false;
  const importedReadOnly =
    booleanValue(response, ["imported_read_only", "importedReadOnly"]) ??
    booleanValue(metadata, ["imported_read_only", "importedReadOnly"]) ??
    false;
  const decision =
    decisionFromEventType(sourceEventType) ??
    normalizeDecision(stringValue(response, ["decision", "status"]));

  return {
    requestId: item.request_id,
    toolName: item.tool_name,
    prompt: item.prompt,
    decision,
    status: statusFromDecision({
      decision,
      sourceEventType,
      itemStatus: item.status,
      importedReadOnly,
    }),
    decisionScope: stringValue(response, [
      "decision_scope",
      "decisionScope",
      "scope",
    ]),
    approvalScope: objectValue(response, ["approval_scope", "approvalScope"]),
    source: sourceFromResponse(response, autoResolved),
    sourceEventType,
    autoResolved,
    importedReadOnly,
  };
}

export function toApprovalRecordFromActionRequired(
  request: ActionRequired,
): ApprovalRecordViewModel | null {
  if (request.actionType !== "tool_confirmation") {
    return null;
  }
  const response = record(request.submittedUserData);
  if (
    shouldHideForFullAccess([
      response,
      ...approvalPolicySourcesFromArguments(request.arguments),
    ])
  ) {
    return null;
  }

  const autoResolved =
    booleanValue(response, ["auto_resolved", "autoResolved"]) ?? false;
  const importedReadOnly =
    booleanValue(response, ["imported_read_only", "importedReadOnly"]) ?? false;
  const sourceEventType = stringValue(response, [
    "source_event_type",
    "sourceEventType",
  ]);
  const decision =
    decisionFromEventType(sourceEventType) ??
    normalizeDecision(stringValue(response, ["decision", "status"]));

  return {
    requestId: request.requestId,
    toolName: request.toolName,
    prompt: request.prompt,
    decision,
    status: statusFromDecision({
      decision,
      sourceEventType,
      itemStatus: request.status,
      importedReadOnly,
    }),
    decisionScope: stringValue(response, [
      "decision_scope",
      "decisionScope",
      "scope",
    ]),
    approvalScope: objectValue(response, ["approval_scope", "approvalScope"]),
    source: sourceFromResponse(response, autoResolved),
    sourceEventType,
    autoResolved,
    importedReadOnly,
  };
}
