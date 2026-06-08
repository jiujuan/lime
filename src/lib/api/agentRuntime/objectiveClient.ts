import { AGENT_RUNTIME_COMMANDS } from "./commandManifest.generated";
import {
  invokeAgentRuntimeCommand,
  type AgentRuntimeCommandInvoke,
} from "./transport";
import type {
  AgentRuntimeClearObjectiveResult,
  AgentRuntimeContinueObjectiveResult,
  AgentRuntimeObjectiveSessionRequest,
  AgentRuntimeSetObjectiveRequest,
  AgentRuntimeUpdateObjectiveStatusRequest,
  ManagedObjective,
} from "./types";

export interface AgentRuntimeObjectiveClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
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

function assertManagedObjectiveOrNull(
  command: string,
  value: unknown,
): asserts value is ManagedObjective | null {
  if (value !== null && !isManagedObjective(value)) {
    throw new Error(`${command} did not return managed objective`);
  }
}

function assertManagedObjective(
  command: string,
  value: unknown,
): asserts value is ManagedObjective {
  if (!isManagedObjective(value)) {
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

function toBackendSetObjectiveRequest(
  request: AgentRuntimeSetObjectiveRequest,
) {
  return {
    session_id: request.sessionId,
    workspace_id: request.workspaceId ?? null,
    objective_text: request.objectiveText,
    success_criteria: request.successCriteria ?? [],
    budget_policy: request.budgetPolicy ?? null,
    risk_policy: request.riskPolicy ?? null,
    approval_policy: request.approvalPolicy ?? null,
    continuation_policy: request.continuationPolicy ?? null,
  };
}

function toBackendSessionObjectiveRequest(
  request: AgentRuntimeObjectiveSessionRequest,
) {
  return {
    session_id: request.sessionId,
    owner_kind: request.ownerKind ?? null,
    owner_id: request.ownerId ?? null,
  };
}

function toBackendUpdateObjectiveStatusRequest(
  request: AgentRuntimeUpdateObjectiveStatusRequest,
) {
  return {
    session_id: request.sessionId,
    status: request.status,
    blocker_reason: request.blockerReason ?? null,
  };
}

export function createObjectiveClient({
  invokeCommand = invokeAgentRuntimeCommand,
}: AgentRuntimeObjectiveClientDeps = {}) {
  async function getAgentRuntimeObjective(
    sessionId: string,
  ): Promise<ManagedObjective | null> {
    const command = AGENT_RUNTIME_COMMANDS.getObjective;
    const result = await invokeCommand(command, { sessionId });
    assertManagedObjectiveOrNull(command, result);
    return result;
  }

  async function setAgentRuntimeObjective(
    request: AgentRuntimeSetObjectiveRequest,
  ): Promise<ManagedObjective> {
    const command = AGENT_RUNTIME_COMMANDS.setObjective;
    const result = await invokeCommand(command, {
      request: toBackendSetObjectiveRequest(request),
    });
    assertManagedObjective(command, result);
    return result;
  }

  async function updateAgentRuntimeObjectiveStatus(
    request: AgentRuntimeUpdateObjectiveStatusRequest,
  ): Promise<ManagedObjective | null> {
    const command = AGENT_RUNTIME_COMMANDS.updateObjectiveStatus;
    const result = await invokeCommand(command, {
      request: toBackendUpdateObjectiveStatusRequest(request),
    });
    assertManagedObjectiveOrNull(command, result);
    return result;
  }

  async function clearAgentRuntimeObjective(
    request: AgentRuntimeObjectiveSessionRequest,
  ): Promise<AgentRuntimeClearObjectiveResult> {
    const command = AGENT_RUNTIME_COMMANDS.clearObjective;
    const result = await invokeCommand(command, {
      request: toBackendSessionObjectiveRequest(request),
    });
    assertClearObjectiveResult(command, result);
    return result;
  }

  async function continueAgentRuntimeObjective(
    request: AgentRuntimeObjectiveSessionRequest,
  ): Promise<AgentRuntimeContinueObjectiveResult> {
    const command = AGENT_RUNTIME_COMMANDS.continueObjective;
    const result = await invokeCommand(command, {
      request: toBackendSessionObjectiveRequest(request),
    });
    assertContinueObjectiveResult(command, result);
    return result;
  }

  async function auditAgentRuntimeObjective(
    request: AgentRuntimeObjectiveSessionRequest,
  ): Promise<ManagedObjective> {
    const command = AGENT_RUNTIME_COMMANDS.auditObjective;
    const result = await invokeCommand(command, {
      request: toBackendSessionObjectiveRequest(request),
    });
    assertManagedObjective(command, result);
    return result;
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
