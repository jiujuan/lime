function resolveMockObjectiveSessionId(args?: any): string {
  const request = args?.request ?? args ?? {};
  return request.session_id || request.sessionId || args?.sessionId || "mock";
}

function buildMockThreadRead(sessionId: string) {
  return {
    thread_id: sessionId,
    status: "idle",
    pending_requests: [],
    incidents: [],
    queued_turns: [],
    managed_objective: null,
  };
}

export function resetAgentRuntimeObjectiveMocks() {
  return undefined;
}

export const agentRuntimeObjectiveMocks: Record<string, (args?: any) => any> = {
  agent_runtime_get_thread_read: (args?: any) => {
    const sessionId = resolveMockObjectiveSessionId(args);
    return buildMockThreadRead(sessionId);
  },
};
