type MockManagedObjective = {
  objective_id: string;
  workspace_id?: string | null;
  owner_kind: string;
  owner_id: string;
  objective_text: string;
  success_criteria: string[];
  status: string;
  budget_policy?: Record<string, unknown> | null;
  risk_policy?: Record<string, unknown> | null;
  approval_policy?: Record<string, unknown> | null;
  continuation_policy?: Record<string, unknown> | null;
  last_audit_summary?: string | null;
  last_evidence_pack_ref?: string | null;
  last_artifact_refs: string[];
  blocker_reason?: string | null;
  created_at: string;
  updated_at: string;
};

type MockObjectiveRequest = {
  session_id?: string;
  sessionId?: string;
  owner_kind?: string | null;
  ownerKind?: string | null;
  owner_id?: string | null;
  ownerId?: string | null;
  workspace_id?: string | null;
  workspaceId?: string | null;
  objective_text?: string;
  objectiveText?: string;
  success_criteria?: string[];
  successCriteria?: string[];
  status?: string;
  blocker_reason?: string | null;
  blockerReason?: string | null;
};

const mockManagedObjectives = new Map<string, MockManagedObjective>();

function resolveMockObjectiveOwner(args?: any): {
  ownerKind: string;
  ownerId: string;
} {
  const request = args?.request ?? args ?? {};
  const sessionId = resolveMockObjectiveSessionId(args);
  const ownerKind = request.owner_kind || request.ownerKind || "agent_session";
  const ownerId = request.owner_id || request.ownerId || sessionId;
  return {
    ownerKind,
    ownerId,
  };
}

function resolveMockObjectiveKey(ownerKind: string, ownerId: string): string {
  return `${ownerKind}:${ownerId}`;
}

function resolveMockObjectiveSessionId(args?: any): string {
  const request = args?.request ?? args ?? {};
  return request.session_id || request.sessionId || args?.sessionId || "mock";
}

function buildMockManagedObjective(
  request: MockObjectiveRequest,
  sessionId: string,
): MockManagedObjective {
  const now = new Date(0).toISOString();
  const ownerKind = request.owner_kind || request.ownerKind || "agent_session";
  const ownerId = request.owner_id || request.ownerId || sessionId;
  return {
    objective_id: `mock-objective-${Date.now()}`,
    workspace_id: request.workspace_id ?? request.workspaceId ?? null,
    owner_kind: ownerKind,
    owner_id: ownerId,
    objective_text: request.objective_text || request.objectiveText || "",
    success_criteria: request.success_criteria || request.successCriteria || [],
    status: "active",
    budget_policy: null,
    risk_policy: null,
    approval_policy: null,
    continuation_policy: null,
    last_audit_summary: null,
    last_evidence_pack_ref: null,
    last_artifact_refs: [],
    blocker_reason: null,
    created_at: now,
    updated_at: now,
  };
}

function getMockManagedObjective(
  ownerKind: string,
  ownerId: string,
): MockManagedObjective | null {
  return (
    mockManagedObjectives.get(resolveMockObjectiveKey(ownerKind, ownerId)) ??
    null
  );
}

function setMockManagedObjective(
  ownerKind: string,
  ownerId: string,
  objective: MockManagedObjective,
): MockManagedObjective {
  mockManagedObjectives.set(
    resolveMockObjectiveKey(ownerKind, ownerId),
    objective,
  );
  return objective;
}

function clearMockManagedObjective(
  ownerKind: string,
  ownerId: string,
): boolean {
  return mockManagedObjectives.delete(
    resolveMockObjectiveKey(ownerKind, ownerId),
  );
}

function buildMockThreadRead(sessionId: string) {
  return {
    thread_id: sessionId,
    status: "idle",
    pending_requests: [],
    incidents: [],
    queued_turns: [],
    managed_objective: getMockManagedObjective("agent_session", sessionId),
  };
}

export function resetAgentRuntimeObjectiveMocks() {
  mockManagedObjectives.clear();
}

export const agentRuntimeObjectiveMocks: Record<string, (args?: any) => any> = {
  agent_runtime_get_thread_read: (args?: any) => {
    const sessionId = resolveMockObjectiveSessionId(args);
    return buildMockThreadRead(sessionId);
  },
  agent_runtime_get_objective: (args?: any) => {
    const sessionId = resolveMockObjectiveSessionId(args);
    return getMockManagedObjective("agent_session", sessionId);
  },
  agent_runtime_set_objective: ({
    request,
  }: {
    request?: MockObjectiveRequest;
  } = {}) => {
    const sessionId = resolveMockObjectiveSessionId({ request });
    const { ownerKind, ownerId } = resolveMockObjectiveOwner({ request });
    return setMockManagedObjective(
      ownerKind,
      ownerId,
      buildMockManagedObjective(request ?? {}, sessionId),
    );
  },
  agent_runtime_update_objective_status: ({
    request,
  }: {
    request?: MockObjectiveRequest;
  } = {}) => {
    const { ownerKind, ownerId } = resolveMockObjectiveOwner({ request });
    const currentObjective = getMockManagedObjective(ownerKind, ownerId);
    if (!currentObjective) {
      return null;
    }
    const updatedObjective = {
      ...currentObjective,
      status: request?.status || currentObjective.status,
      blocker_reason: request?.blocker_reason ?? request?.blockerReason ?? null,
      updated_at: new Date(0).toISOString(),
    };
    return setMockManagedObjective(ownerKind, ownerId, updatedObjective);
  },
  agent_runtime_clear_objective: (args?: any) => {
    const { ownerKind, ownerId } = resolveMockObjectiveOwner(args);
    const cleared = clearMockManagedObjective(ownerKind, ownerId);
    return { cleared };
  },
  agent_runtime_continue_objective: (args?: any) => {
    const sessionId = resolveMockObjectiveSessionId(args);
    const objective = getMockManagedObjective("agent_session", sessionId);
    if (!objective || objective.status !== "active") {
      throw new Error("当前目标不能继续推进");
    }
    return {
      submitted: true,
      queued_turn_id: "mock-managed-objective-turn",
      objective,
    };
  },
  agent_runtime_audit_objective: (args?: any) => {
    const { ownerKind, ownerId } = resolveMockObjectiveOwner(args);
    const objective = getMockManagedObjective(ownerKind, ownerId);
    if (!objective) {
      throw new Error("当前会话还没有目标");
    }
    const criteriaKnown = objective.success_criteria.length === 0;
    const decision = criteriaKnown ? "completed" : "verifying";
    const blockers = criteriaKnown ? "none" : "unknown_success_criteria";
    return setMockManagedObjective(ownerKind, ownerId, {
      ...objective,
      status: criteriaKnown ? "completed" : "active",
      last_audit_summary: `decision=${decision}; pending_requests=0; evidence_pack=.lime/harness/mock/evidence; artifacts=1; blockers=${blockers}`,
      last_evidence_pack_ref: ".lime/harness/mock/evidence",
      last_artifact_refs: [".lime/harness/mock/evidence/artifacts/mock.md"],
      blocker_reason: null,
      updated_at: new Date(0).toISOString(),
    });
  },
};
