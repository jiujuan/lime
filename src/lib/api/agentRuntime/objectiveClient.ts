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
    return await invokeCommand<ManagedObjective | null>(
      AGENT_RUNTIME_COMMANDS.getObjective,
      { sessionId },
    );
  }

  async function setAgentRuntimeObjective(
    request: AgentRuntimeSetObjectiveRequest,
  ): Promise<ManagedObjective> {
    return await invokeCommand<ManagedObjective>(
      AGENT_RUNTIME_COMMANDS.setObjective,
      { request: toBackendSetObjectiveRequest(request) },
    );
  }

  async function updateAgentRuntimeObjectiveStatus(
    request: AgentRuntimeUpdateObjectiveStatusRequest,
  ): Promise<ManagedObjective | null> {
    return await invokeCommand<ManagedObjective | null>(
      AGENT_RUNTIME_COMMANDS.updateObjectiveStatus,
      { request: toBackendUpdateObjectiveStatusRequest(request) },
    );
  }

  async function clearAgentRuntimeObjective(
    request: AgentRuntimeObjectiveSessionRequest,
  ): Promise<AgentRuntimeClearObjectiveResult> {
    return await invokeCommand<AgentRuntimeClearObjectiveResult>(
      AGENT_RUNTIME_COMMANDS.clearObjective,
      { request: toBackendSessionObjectiveRequest(request) },
    );
  }

  async function continueAgentRuntimeObjective(
    request: AgentRuntimeObjectiveSessionRequest,
  ): Promise<AgentRuntimeContinueObjectiveResult> {
    return await invokeCommand<AgentRuntimeContinueObjectiveResult>(
      AGENT_RUNTIME_COMMANDS.continueObjective,
      { request: toBackendSessionObjectiveRequest(request) },
    );
  }

  async function auditAgentRuntimeObjective(
    request: AgentRuntimeObjectiveSessionRequest,
  ): Promise<ManagedObjective> {
    return await invokeCommand<ManagedObjective>(
      AGENT_RUNTIME_COMMANDS.auditObjective,
      { request: toBackendSessionObjectiveRequest(request) },
    );
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
