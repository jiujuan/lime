import {
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_READ,
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_SET,
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
  AppServerClient,
  type AppServerManagedObjective,
} from "@/lib/api/appServer";
import type {
  AgentRuntimeClearObjectiveResult,
  AgentRuntimeContinueObjectiveResult,
  AgentRuntimeObjectiveSessionRequest,
  AgentRuntimeSetObjectiveRequest,
  AgentRuntimeUpdateObjectiveStatusRequest,
  ManagedObjective,
} from "./types";

export type AgentRuntimeObjectiveAppServerClient = Pick<
  AppServerClient,
  | "readAgentSessionObjective"
  | "setAgentSessionObjective"
  | "updateAgentSessionObjectiveStatus"
  | "clearAgentSessionObjective"
  | "continueAgentSessionObjective"
  | "auditAgentSessionObjective"
>;

export interface AgentRuntimeObjectiveClientDeps {
  appServerClient?: AgentRuntimeObjectiveAppServerClient;
}

const MANAGED_OBJECTIVE_STATUSES = new Set<ManagedObjective["status"]>([
  "active",
  "verifying",
  "needs_input",
  "blocked",
  "budget_limited",
  "paused",
  "completed",
  "failed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRequiredString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalRecord(
  value: unknown,
): value is Record<string, unknown> | null | undefined {
  return value === undefined || value === null || isRecord(value);
}

function readField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): unknown {
  return record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
}

function isManagedObjectiveStatus(
  value: unknown,
): value is ManagedObjective["status"] {
  return (
    typeof value === "string" &&
    MANAGED_OBJECTIVE_STATUSES.has(value as ManagedObjective["status"])
  );
}

function isManagedObjective(value: unknown): value is ManagedObjective {
  return (
    isRecord(value) &&
    isRequiredString(value.objective_id) &&
    isOptionalString(value.workspace_id) &&
    isRequiredString(value.owner_kind) &&
    isRequiredString(value.owner_id) &&
    isRequiredString(value.objective_text) &&
    isStringArray(value.success_criteria) &&
    isManagedObjectiveStatus(value.status) &&
    isOptionalRecord(value.budget_policy) &&
    isOptionalRecord(value.risk_policy) &&
    isOptionalRecord(value.approval_policy) &&
    isOptionalRecord(value.continuation_policy) &&
    isOptionalString(value.last_audit_summary) &&
    isOptionalString(value.last_evidence_pack_ref) &&
    isStringArray(value.last_artifact_refs) &&
    isOptionalString(value.blocker_reason) &&
    isRequiredString(value.created_at) &&
    isRequiredString(value.updated_at)
  );
}

function isAppServerManagedObjective(
  value: unknown,
): value is AppServerManagedObjective {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isRequiredString(readField(value, "objectiveId", "objective_id")) &&
    isOptionalString(readField(value, "workspaceId", "workspace_id")) &&
    isRequiredString(readField(value, "ownerKind", "owner_kind")) &&
    isRequiredString(readField(value, "ownerId", "owner_id")) &&
    isRequiredString(readField(value, "objectiveText", "objective_text")) &&
    isStringArray(readField(value, "successCriteria", "success_criteria")) &&
    isManagedObjectiveStatus(readField(value, "status")) &&
    isOptionalRecord(readField(value, "budgetPolicy", "budget_policy")) &&
    isOptionalRecord(readField(value, "riskPolicy", "risk_policy")) &&
    isOptionalRecord(readField(value, "approvalPolicy", "approval_policy")) &&
    isOptionalRecord(
      readField(value, "continuationPolicy", "continuation_policy"),
    ) &&
    isOptionalString(
      readField(value, "lastAuditSummary", "last_audit_summary"),
    ) &&
    isOptionalString(
      readField(value, "lastEvidencePackRef", "last_evidence_pack_ref"),
    ) &&
    isStringArray(readField(value, "lastArtifactRefs", "last_artifact_refs")) &&
    isOptionalString(readField(value, "blockerReason", "blocker_reason")) &&
    isRequiredString(readField(value, "createdAt", "created_at")) &&
    isRequiredString(readField(value, "updatedAt", "updated_at"))
  );
}

function isClearObjectiveResult(
  value: unknown,
): value is AgentRuntimeClearObjectiveResult {
  return isRecord(value) && typeof value.cleared === "boolean";
}

function isContinueObjectiveResult(
  value: unknown,
): value is AgentRuntimeContinueObjectiveResult {
  return (
    isRecord(value) &&
    typeof value.submitted === "boolean" &&
    isRequiredString(value.queued_turn_id) &&
    isManagedObjective(value.objective)
  );
}

function assertManagedObjective(
  command: string,
  value: unknown,
): asserts value is ManagedObjective {
  if (!isManagedObjective(value)) {
    throw new Error(`${command} did not return managed objective`);
  }
}

function assertAppServerManagedObjective(
  command: string,
  value: unknown,
): asserts value is AppServerManagedObjective {
  if (!isAppServerManagedObjective(value)) {
    throw new Error(`${command} did not return managed objective`);
  }
}

function assertClearObjectiveResult(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeClearObjectiveResult {
  if (!isClearObjectiveResult(value)) {
    throw new Error(`${command} did not return objective clear result`);
  }
}

function assertContinueObjectiveResult(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeContinueObjectiveResult {
  if (!isContinueObjectiveResult(value)) {
    throw new Error(`${command} did not return objective continue result`);
  }
}

function projectAppServerContinueObjectiveResponse(
  command: string,
  value: unknown,
): AgentRuntimeContinueObjectiveResult {
  if (
    !isRecord(value) ||
    typeof value.submitted !== "boolean" ||
    !isRequiredString(readField(value, "queuedTurnId", "queued_turn_id")) ||
    !Object.prototype.hasOwnProperty.call(value, "objective")
  ) {
    throw new Error(`${command} did not return objective continue result`);
  }
  const result: AgentRuntimeContinueObjectiveResult = {
    submitted: value.submitted,
    queued_turn_id: readField(value, "queuedTurnId", "queued_turn_id") as string,
    objective: projectAppServerManagedObjective(command, value.objective),
  };
  assertContinueObjectiveResult(command, result);
  return result;
}

function projectAppServerAuditObjectiveResponse(
  command: string,
  value: unknown,
): ManagedObjective {
  return projectRequiredAppServerManagedObjectiveResponse(command, value);
}

function normalizeOptionalRecord(
  value: unknown,
): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function projectAppServerManagedObjective(
  command: string,
  value: unknown,
): ManagedObjective {
  assertAppServerManagedObjective(command, value);
  const record = value as unknown as Record<string, unknown>;
  const objective: ManagedObjective = {
    objective_id: readField(record, "objectiveId", "objective_id") as string,
    workspace_id: normalizeOptionalString(
      readField(record, "workspaceId", "workspace_id"),
    ),
    owner_kind: readField(record, "ownerKind", "owner_kind") as string,
    owner_id: readField(record, "ownerId", "owner_id") as string,
    objective_text: readField(
      record,
      "objectiveText",
      "objective_text",
    ) as string,
    success_criteria: readField(
      record,
      "successCriteria",
      "success_criteria",
    ) as string[],
    status: readField(record, "status") as ManagedObjective["status"],
    budget_policy: normalizeOptionalRecord(
      readField(record, "budgetPolicy", "budget_policy"),
    ),
    risk_policy: normalizeOptionalRecord(
      readField(record, "riskPolicy", "risk_policy"),
    ),
    approval_policy: normalizeOptionalRecord(
      readField(record, "approvalPolicy", "approval_policy"),
    ),
    continuation_policy: normalizeOptionalRecord(
      readField(record, "continuationPolicy", "continuation_policy"),
    ),
    last_audit_summary: normalizeOptionalString(
      readField(record, "lastAuditSummary", "last_audit_summary"),
    ),
    last_evidence_pack_ref: normalizeOptionalString(
      readField(record, "lastEvidencePackRef", "last_evidence_pack_ref"),
    ),
    last_artifact_refs: readField(
      record,
      "lastArtifactRefs",
      "last_artifact_refs",
    ) as string[],
    blocker_reason: normalizeOptionalString(
      readField(record, "blockerReason", "blocker_reason"),
    ),
    created_at: readField(record, "createdAt", "created_at") as string,
    updated_at: readField(record, "updatedAt", "updated_at") as string,
  };
  assertManagedObjective(command, objective);
  return objective;
}

function projectOptionalAppServerManagedObjectiveResponse(
  command: string,
  value: unknown,
): ManagedObjective | null {
  if (!isRecord(value)) {
    throw new Error(`${command} did not return managed objective`);
  }
  if (!Object.prototype.hasOwnProperty.call(value, "objective")) {
    if (Object.keys(value).length === 0) {
      return null;
    }
    throw new Error(`${command} did not return managed objective`);
  }
  const objective = value.objective;
  return objective == null
    ? null
    : projectAppServerManagedObjective(command, objective);
}

function projectRequiredAppServerManagedObjectiveResponse(
  command: string,
  value: unknown,
): ManagedObjective {
  if (
    !isRecord(value) ||
    !Object.prototype.hasOwnProperty.call(value, "objective")
  ) {
    throw new Error(`${command} did not return managed objective`);
  }
  return projectAppServerManagedObjective(command, value.objective);
}

function toAppServerSessionObjectiveParams(
  request: AgentRuntimeObjectiveSessionRequest,
) {
  return {
    sessionId: request.sessionId,
    ownerKind: request.ownerKind ?? undefined,
    ownerId: request.ownerId ?? undefined,
  };
}

function toAppServerSetObjectiveParams(request: AgentRuntimeSetObjectiveRequest) {
  return {
    sessionId: request.sessionId,
    workspaceId: request.workspaceId ?? undefined,
    objectiveText: request.objectiveText,
    successCriteria: request.successCriteria ?? [],
    budgetPolicy: request.budgetPolicy ?? undefined,
    riskPolicy: request.riskPolicy ?? undefined,
    approvalPolicy: request.approvalPolicy ?? undefined,
    continuationPolicy: request.continuationPolicy ?? undefined,
  };
}

function toAppServerUpdateObjectiveStatusParams(
  request: AgentRuntimeUpdateObjectiveStatusRequest,
) {
  return {
    sessionId: request.sessionId,
    status: request.status,
    blockerReason: request.blockerReason ?? undefined,
  };
}

export function createObjectiveClient({
  appServerClient = new AppServerClient(),
}: AgentRuntimeObjectiveClientDeps = {}) {
  async function getAgentRuntimeObjective(
    sessionId: string,
  ): Promise<ManagedObjective | null> {
    const command = APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_READ;
    const response = await appServerClient.readAgentSessionObjective({
      sessionId,
    });
    return projectOptionalAppServerManagedObjectiveResponse(
      command,
      response.result,
    );
  }

  async function setAgentRuntimeObjective(
    request: AgentRuntimeSetObjectiveRequest,
  ): Promise<ManagedObjective> {
    const command = APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_SET;
    const response = await appServerClient.setAgentSessionObjective(
      toAppServerSetObjectiveParams(request),
    );
    return projectRequiredAppServerManagedObjectiveResponse(
      command,
      response.result,
    );
  }

  async function updateAgentRuntimeObjectiveStatus(
    request: AgentRuntimeUpdateObjectiveStatusRequest,
  ): Promise<ManagedObjective | null> {
    const command = APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE;
    const response = await appServerClient.updateAgentSessionObjectiveStatus(
      toAppServerUpdateObjectiveStatusParams(request),
    );
    return projectOptionalAppServerManagedObjectiveResponse(
      command,
      response.result,
    );
  }

  async function clearAgentRuntimeObjective(
    request: AgentRuntimeObjectiveSessionRequest,
  ): Promise<AgentRuntimeClearObjectiveResult> {
    const command = APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CLEAR;
    const response = await appServerClient.clearAgentSessionObjective({
      sessionId: request.sessionId,
    });
    assertClearObjectiveResult(command, response.result);
    return response.result;
  }

  async function continueAgentRuntimeObjective(
    request: AgentRuntimeObjectiveSessionRequest,
  ): Promise<AgentRuntimeContinueObjectiveResult> {
    const command = APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE;
    const response = await appServerClient.continueAgentSessionObjective(
      toAppServerSessionObjectiveParams(request),
    );
    return projectAppServerContinueObjectiveResponse(command, response.result);
  }

  async function auditAgentRuntimeObjective(
    request: AgentRuntimeObjectiveSessionRequest,
  ): Promise<ManagedObjective> {
    const command = APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_AUDIT;
    const response = await appServerClient.auditAgentSessionObjective(
      toAppServerSessionObjectiveParams(request),
    );
    return projectAppServerAuditObjectiveResponse(command, response.result);
  }

  return {
    auditAgentRuntimeObjective,
    clearAgentRuntimeObjective,
    continueAgentRuntimeObjective,
    getAgentRuntimeObjective,
    setAgentRuntimeObjective,
    updateAgentRuntimeObjectiveStatus,
  };
}

export const {
  auditAgentRuntimeObjective,
  clearAgentRuntimeObjective,
  continueAgentRuntimeObjective,
  getAgentRuntimeObjective,
  setAgentRuntimeObjective,
  updateAgentRuntimeObjectiveStatus,
} = createObjectiveClient();
