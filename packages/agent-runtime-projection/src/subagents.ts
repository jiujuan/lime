import type {
  AgentRuntimeExecutionEvent,
  AgentUiSubagentActivityView,
  AgentUiSubagentDelegationView,
  AgentUiSubagentIsolationView,
  AgentUiSubagentsModel,
  AgentUiSubagentThreadView,
} from "@limecloud/agent-ui-contracts";

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function payloadString(
  event: AgentRuntimeExecutionEvent,
  ...keys: string[]
): string | undefined {
  const payload = event.payload;
  if (!isRecord(payload)) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function payloadNumber(
  event: AgentRuntimeExecutionEvent,
  ...keys: string[]
): number | undefined {
  const payload = event.payload;
  if (!isRecord(payload)) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function payloadBoolean(
  event: AgentRuntimeExecutionEvent,
  ...keys: string[]
): boolean | undefined {
  const payload = event.payload;
  if (!isRecord(payload)) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function safePreview(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length > 280 ? `${value.slice(0, 277)}...` : value;
}

function compact<T extends object>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}

function subagentThreadId(event: AgentRuntimeExecutionEvent): string | undefined {
  return (
    event.subagentId ??
    event.workerId ??
    payloadString(
      event,
      "subagentId",
      "agentThreadId",
      "childThreadId",
      "childSessionId",
      "session_id",
      "targetThreadId",
    )
  );
}

function parentThreadId(event: AgentRuntimeExecutionEvent): string | undefined {
  return (
    payloadString(
      event,
      "parentThreadId",
      "parent_thread_id",
      "parentSessionId",
      "parent_session_id",
    ) ?? event.threadId
  );
}

function isSubagentEvent(event: AgentRuntimeExecutionEvent): boolean {
  const eventClass = event.eventClass ?? "";
  return Boolean(
    subagentThreadId(event) ||
      eventClass.startsWith("subagent.") ||
      eventClass.startsWith("handoff.") ||
      eventClass === "agent.spawned" ||
      eventClass === "agent.completed",
  );
}

function isDelegationEvent(event: AgentRuntimeExecutionEvent): boolean {
  const eventClass = event.eventClass ?? "";
  return (
    eventClass.startsWith("subagent.") ||
    eventClass.startsWith("handoff.") ||
    eventClass === "agent.spawned" ||
    eventClass === "agent.handoff"
  );
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}

function activityKind(event: AgentRuntimeExecutionEvent): string {
  const eventClass = event.eventClass ?? "";
  if (eventClass.includes("started") || eventClass === "agent.spawned") {
    return "started";
  }
  if (eventClass.includes("completed") || eventClass === "agent.completed") {
    return "completed";
  }
  if (eventClass.includes("failed")) return "failed";
  if (eventClass.startsWith("handoff.")) return "handoff";
  if (eventClass.startsWith("review.")) return "review";
  if (eventClass.startsWith("tool.") || eventClass.startsWith("model.")) {
    return "interacted";
  }
  return "updated";
}

function delegationAction(event: AgentRuntimeExecutionEvent): string {
  const eventClass = event.eventClass ?? "";
  if (eventClass.startsWith("handoff.") || eventClass === "agent.handoff") {
    return "handoff";
  }
  if (eventClass.includes("wait")) return "wait";
  if (eventClass.includes("interrupt")) return "interrupt";
  if (eventClass.includes("close")) return "close";
  if (eventClass.includes("send") || eventClass.includes("input")) {
    return "send_input";
  }
  return "spawn";
}

function isolationForEvent(
  event: AgentRuntimeExecutionEvent,
): AgentUiSubagentIsolationView | undefined {
  const isolation = compact<AgentUiSubagentIsolationView>({
    runtimeProfileId: payloadString(event, "runtimeProfileId", "runtime_profile_id"),
    modelProfileId: payloadString(event, "modelProfileId", "model_profile_id"),
    isolationProfileId: payloadString(
      event,
      "isolationProfileId",
      "isolation_profile_id",
    ),
    workspaceRef: payloadString(event, "workspaceRef", "workspace_ref", "cwdRef"),
    permissionProfile: payloadString(
      event,
      "permissionProfile",
      "permission_profile",
    ),
    sandboxProfile: payloadString(event, "sandboxProfile", "sandbox_profile"),
    forkPolicy: payloadString(event, "forkPolicy", "fork_policy"),
    depth: payloadNumber(event, "depth", "subagentDepth"),
    canDelegate: payloadBoolean(event, "canDelegate", "can_delegate"),
  });
  return Object.keys(isolation).length ? isolation : undefined;
}

function mergeThread(
  current: AgentUiSubagentThreadView | undefined,
  event: AgentRuntimeExecutionEvent,
  threadId: string,
): AgentUiSubagentThreadView {
  const sourceEventIds = new Set([
    ...(current?.sourceEventIds ?? []),
    event.id,
  ]);
  const artifactRefs = new Set([
    ...(current?.artifactRefs ?? []),
    ...(event.artifactRefs ?? []),
  ]);
  const evidenceRefs = new Set([
    ...(current?.evidenceRefs ?? []),
    ...(event.evidenceRefs ?? []),
  ]);
  return compact<AgentUiSubagentThreadView>({
    threadId,
    subagentId: event.subagentId ?? current?.subagentId ?? threadId,
    parentThreadId: current?.parentThreadId ?? parentThreadId(event),
    parentTaskId:
      current?.parentTaskId ??
      payloadString(event, "parentTaskId", "parent_task_id"),
    taskId: current?.taskId ?? event.taskId,
    taskPath:
      current?.taskPath ??
      payloadString(event, "taskPath", "task_path", "agentPath", "agent_path"),
    role:
      current?.role ??
      payloadString(event, "role", "agentRole", "agent_role"),
    nickname:
      current?.nickname ??
      payloadString(event, "nickname", "agentNickname", "agent_nickname"),
    status: event.status,
    title: current?.title ?? event.title,
    summary:
      payloadString(event, "summary", "resultSummary", "outputSummary") ??
      current?.summary,
    promptPreview:
      current?.promptPreview ??
      safePreview(
        payloadString(event, "promptPreview", "prompt_preview", "prompt", "input"),
      ),
    lastActivityAt: event.completedAt ?? event.createdAt ?? current?.lastActivityAt,
    createdAt: current?.createdAt ?? event.createdAt,
    completedAt: event.completedAt ?? (isTerminalStatus(event.status) ? event.createdAt : current?.completedAt),
    artifactRefs: Array.from(artifactRefs),
    evidenceRefs: Array.from(evidenceRefs),
    sourceEventIds: Array.from(sourceEventIds),
    isolation: current?.isolation ?? isolationForEvent(event),
  });
}

function delegationForEvent(
  event: AgentRuntimeExecutionEvent,
  threadId: string,
): AgentUiSubagentDelegationView {
  const parentId = parentThreadId(event);
  return compact<AgentUiSubagentDelegationView>({
    callId:
      event.handoffId ??
      payloadString(event, "callId", "delegationCallId") ??
      `${parentId ?? "root"}:delegation:${threadId}`,
    sourceEventId: event.id,
    action: delegationAction(event),
    parentThreadId: parentId,
    targetThreadIds: [threadId],
    status: event.status,
    title: event.title,
    promptPreview: safePreview(
      payloadString(event, "promptPreview", "prompt_preview", "prompt", "input"),
    ),
    createdAt: event.createdAt,
    completedAt: event.completedAt,
  });
}

function activityForEvent(
  event: AgentRuntimeExecutionEvent,
  threadId: string,
): AgentUiSubagentActivityView {
  return compact<AgentUiSubagentActivityView>({
    activityId: event.id,
    threadId,
    sourceEventId: event.id,
    kind: activityKind(event),
    status: event.status,
    title: event.title,
    createdAt: event.createdAt,
  });
}

export function buildAgentUiSubagentsModel(
  events: readonly AgentRuntimeExecutionEvent[] = [],
): AgentUiSubagentsModel {
  const threads = new Map<string, AgentUiSubagentThreadView>();
  const delegationCalls = new Map<string, AgentUiSubagentDelegationView>();
  const activities: AgentUiSubagentActivityView[] = [];

  events.forEach((event) => {
    if (!isSubagentEvent(event)) return;
    const threadId = subagentThreadId(event);
    if (!threadId) return;

    threads.set(threadId, mergeThread(threads.get(threadId), event, threadId));
    activities.push(activityForEvent(event, threadId));

    if (isDelegationEvent(event)) {
      const delegation = delegationForEvent(event, threadId);
      delegationCalls.set(delegation.callId, delegation);
    }
  });

  const threadList = Array.from(threads.values());
  return {
    hasSubagents: threadList.length > 0,
    threads: threadList,
    delegationCalls: Array.from(delegationCalls.values()),
    activities,
    activeThreadIds: threadList
      .filter((thread) => thread.status === "pending" || thread.status === "running" || thread.status === "blocked")
      .map((thread) => thread.threadId),
    completedThreadIds: threadList
      .filter((thread) => thread.status === "completed")
      .map((thread) => thread.threadId),
    failedThreadIds: threadList
      .filter((thread) => thread.status === "failed")
      .map((thread) => thread.threadId),
  };
}
