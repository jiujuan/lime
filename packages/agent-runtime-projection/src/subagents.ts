import type {
  AgentRuntimeExecutionEvent,
  AgentUiCollaborationFactsView,
  AgentUiSubagentActivityView,
  AgentUiSubagentDelegationView,
  AgentUiSubagentIsolationView,
  AgentUiSubagentsModel,
  AgentUiSubagentThreadView,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiCollaborationPayloadMetadata } from "./collaborationFacts.js";
import { readRecord } from "./normalization.js";

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

function collaborationForEvent(
  event: AgentRuntimeExecutionEvent,
): AgentUiCollaborationFactsView | undefined {
  const payload = readRecord(event.payload);
  const metadata = readRecord(payload?.metadata);
  const collaboration = buildAgentUiCollaborationPayloadMetadata({
    sourceType: event.eventClass,
    collaborationKind: payloadString(
      event,
      "collaborationKind",
      "collaboration_kind",
    ),
    surface: payloadString(event, "collaborationSurface", "collaboration_surface"),
    phase:
      event.phase ??
      payloadString(event, "collaborationPhase", "collaboration_phase"),
    status: event.status,
    runtimeEntity: payloadString(event, "runtimeEntity", "runtime_entity"),
    runtimeStatus: payloadString(event, "runtimeStatus", "runtime_status"),
    latestTurnStatus: payloadString(
      event,
      "latestTurnStatus",
      "latest_turn_status",
    ),
    taskId: event.taskId ?? payloadString(event, "taskId", "task_id"),
    agentId: event.subagentId ?? event.workerId,
    parentSessionId: parentThreadId(event),
    transcriptRef: payloadString(event, "transcriptRef", "transcript_ref"),
    handoffId: event.handoffId,
    metadata,
    payload,
  });
  return Object.keys(collaboration.collaborationFacts ?? {}).length
    ? collaboration
    : undefined;
}

function cloneCollaboration(
  collaboration: AgentUiCollaborationFactsView | undefined,
): AgentUiCollaborationFactsView | undefined {
  if (!collaboration) {
    return undefined;
  }
  return {
    ...collaboration,
    collaborationFacts: collaboration.collaborationFacts
      ? { ...collaboration.collaborationFacts }
      : undefined,
  };
}

function subagentThreadId(
  event: AgentRuntimeExecutionEvent,
): string | undefined {
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
    eventClass.startsWith("channel.") ||
    eventClass.startsWith("review.") ||
    eventClass === "agent.spawned" ||
    eventClass === "agent.completed" ||
    eventClass === "agent.changed",
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
  return (
    status === "completed" ||
    status === "failed" ||
    status === "canceled" ||
    status === "cancelled" ||
    status === "aborted" ||
    status === "closed" ||
    status === "not_found"
  );
}

function isFailedTerminalStatus(status: string): boolean {
  return (
    status === "failed" ||
    status === "canceled" ||
    status === "cancelled" ||
    status === "aborted" ||
    status === "closed" ||
    status === "not_found"
  );
}

function statusForThread(
  current: AgentUiSubagentThreadView | undefined,
  event: AgentRuntimeExecutionEvent,
): AgentRuntimeExecutionEvent["status"] {
  const eventClass = event.eventClass ?? "";
  if (!current) return event.status;
  if (
    eventClass.startsWith("subagent.") ||
    eventClass.startsWith("task.") ||
    eventClass === "agent.spawned" ||
    eventClass === "agent.completed" ||
    eventClass === "agent.changed" ||
    eventClass === "agent.handoff"
  ) {
    return event.status;
  }
  if (eventClass === "handoff.requested" && event.status === "blocked") {
    return event.status;
  }
  return current.status;
}

function activityKind(event: AgentRuntimeExecutionEvent): string {
  const eventClass = event.eventClass ?? "";
  if (eventClass.includes("started") || eventClass === "agent.spawned") {
    return "started";
  }
  if (
    eventClass.includes("cancel") ||
    eventClass.includes("abort") ||
    eventClass.includes("interrupt") ||
    eventClass.includes("closed") ||
    event.status === "canceled" ||
    event.status === "cancelled" ||
    event.status === "aborted" ||
    event.status === "closed"
  ) {
    return "interrupted";
  }
  if (eventClass.includes("completed") || eventClass === "agent.completed") {
    return "completed";
  }
  if (eventClass.includes("failed")) return "failed";
  if (eventClass.startsWith("handoff.")) return "handoff";
  if (eventClass.startsWith("review.")) return "review";
  if (
    eventClass.startsWith("channel.") ||
    eventClass.startsWith("tool.") ||
    eventClass.startsWith("model.") ||
    eventClass.startsWith("artifact.")
  ) {
    return "interacted";
  }
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
    runtimeProfileId: payloadString(
      event,
      "runtimeProfileId",
      "runtime_profile_id",
    ),
    modelProfileId: payloadString(event, "modelProfileId", "model_profile_id"),
    isolationProfileId: payloadString(
      event,
      "isolationProfileId",
      "isolation_profile_id",
    ),
    workspaceRef: payloadString(
      event,
      "workspaceRef",
      "workspace_ref",
      "cwdRef",
    ),
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
      current?.role ?? payloadString(event, "role", "agentRole", "agent_role"),
    nickname:
      current?.nickname ??
      payloadString(event, "nickname", "agentNickname", "agent_nickname"),
    status: statusForThread(current, event),
    title: current?.title ?? event.title,
    summary:
      payloadString(event, "summary", "resultSummary", "outputSummary") ??
      current?.summary,
    promptPreview:
      current?.promptPreview ??
      safePreview(
        payloadString(
          event,
          "promptPreview",
          "prompt_preview",
          "prompt",
          "input",
        ),
      ),
    lastActivityAt:
      event.completedAt ?? event.createdAt ?? current?.lastActivityAt,
    createdAt: current?.createdAt ?? event.createdAt,
    completedAt:
      event.completedAt ??
      (isTerminalStatus(event.status) ? event.createdAt : current?.completedAt),
    artifactRefs: Array.from(artifactRefs),
    evidenceRefs: Array.from(evidenceRefs),
    sourceEventIds: Array.from(sourceEventIds),
    isolation: current?.isolation ?? isolationForEvent(event),
    collaboration: collaborationForEvent(event) ?? current?.collaboration,
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
      payloadString(
        event,
        "promptPreview",
        "prompt_preview",
        "prompt",
        "input",
      ),
    ),
    createdAt: event.createdAt,
    completedAt: event.completedAt,
    collaboration: collaborationForEvent(event),
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
    collaboration: collaborationForEvent(event),
  });
}

export function buildAgentUiSubagentsModel(
  events: readonly AgentRuntimeExecutionEvent[] = [],
): AgentUiSubagentsModel {
  const accumulator = createAgentUiSubagentsModelAccumulator();
  for (const event of events) {
    accumulator.apply(event);
  }
  return accumulator.getModel();
}

export interface AgentUiSubagentsModelAccumulator {
  apply(event: AgentRuntimeExecutionEvent): AgentUiSubagentsModel;
  getModel(): AgentUiSubagentsModel;
  reset(): AgentUiSubagentsModel;
}

export function createAgentUiSubagentsModelAccumulator(): AgentUiSubagentsModelAccumulator {
  const threads = new Map<string, AgentUiSubagentThreadView>();
  const delegationCalls = new Map<string, AgentUiSubagentDelegationView>();
  const activities: AgentUiSubagentActivityView[] = [];
  let model = buildModel();

  function buildModel(): AgentUiSubagentsModel {
    const threadList = Array.from(threads.values());
    return {
      hasSubagents: threadList.length > 0,
      threads: threadList.map((thread) => ({
        ...thread,
        artifactRefs: [...thread.artifactRefs],
        evidenceRefs: [...thread.evidenceRefs],
        sourceEventIds: [...thread.sourceEventIds],
        isolation: thread.isolation ? { ...thread.isolation } : undefined,
        collaboration: cloneCollaboration(thread.collaboration),
      })),
      delegationCalls: Array.from(delegationCalls.values()).map(
        (delegation) => ({
          ...delegation,
          targetThreadIds: [...delegation.targetThreadIds],
          collaboration: cloneCollaboration(delegation.collaboration),
        }),
      ),
      activities: activities.map((activity) => ({
        ...activity,
        collaboration: cloneCollaboration(activity.collaboration),
      })),
      activeThreadIds: threadList
        .filter(
          (thread) =>
            thread.status === "pending" ||
            thread.status === "running" ||
            thread.status === "blocked",
        )
        .map((thread) => thread.threadId),
      completedThreadIds: threadList
        .filter((thread) => thread.status === "completed")
        .map((thread) => thread.threadId),
      failedThreadIds: threadList
        .filter((thread) => isFailedTerminalStatus(thread.status))
        .map((thread) => thread.threadId),
    };
  }

  return {
    apply(event) {
      if (!isSubagentEvent(event)) return model;
      const threadId = subagentThreadId(event);
      if (!threadId) return model;

      threads.set(
        threadId,
        mergeThread(threads.get(threadId), event, threadId),
      );
      activities.push(activityForEvent(event, threadId));

      if (isDelegationEvent(event)) {
        const delegation = delegationForEvent(event, threadId);
        delegationCalls.set(delegation.callId, delegation);
      }
      model = buildModel();
      return model;
    },
    getModel() {
      return model;
    },
    reset() {
      threads.clear();
      delegationCalls.clear();
      activities.length = 0;
      model = buildModel();
      return model;
    },
  };
}
