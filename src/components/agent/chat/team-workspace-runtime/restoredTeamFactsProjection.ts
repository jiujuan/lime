import type { AgentSubagentRuntimeStatus } from "@/lib/api/agentProtocol";
import type {
  AgentSubagentParentContext,
  AgentSubagentSessionInfo,
} from "@/lib/api/agentRuntime";
import type { AgentUiProjectionEvent } from "@limecloud/agent-ui-contracts";
import { buildAgentUiProjectionEvents } from "../projection/agentUiEventProjection";

type RestoredTeamFactSession = {
  id: string;
  status?: AgentSubagentRuntimeStatus | null;
  latestTurnStatus?: AgentSubagentRuntimeStatus | null;
  queuedTurnCount?: number;
  teamPhase?: string | null;
  teamParallelBudget?: number;
  teamActiveCount?: number;
  teamQueuedCount?: number;
  providerConcurrencyGroup?: string | null;
  providerParallelBudget?: number;
  queueReason?: string | null;
  retryableOverload?: boolean;
  createdFromTurnId?: string | null;
};

export interface RestoredTeamFactsProjectionParams {
  currentSessionId?: string | null;
  currentThreadId?: string | null;
  currentTurnId?: string | null;
  currentSessionRuntimeStatus?: AgentSubagentRuntimeStatus | null;
  currentSessionLatestTurnStatus?: AgentSubagentRuntimeStatus | null;
  currentSessionQueuedTurnCount?: number;
  childSubagentSessions?: AgentSubagentSessionInfo[];
  subagentParentContext?: AgentSubagentParentContext | null;
  timestamp?: string;
  sequence?: number;
}

export interface RestoredTeamFactsProjection {
  fingerprint: string | null;
  events: AgentUiProjectionEvent[];
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeStatus(
  status: string | null | undefined,
): AgentSubagentRuntimeStatus {
  switch (status) {
    case "queued":
    case "running":
    case "completed":
    case "failed":
    case "aborted":
    case "closed":
    case "not_found":
      return status;
    case "idle":
    default:
      return "idle";
  }
}

function fromChildSession(
  session: AgentSubagentSessionInfo,
): RestoredTeamFactSession | null {
  const id = normalizeText(session.id);
  if (!id) {
    return null;
  }

  return {
    id,
    status: normalizeStatus(
      session.runtime_status ?? session.latest_turn_status,
    ),
    latestTurnStatus: normalizeStatus(
      session.latest_turn_status ?? session.runtime_status,
    ),
    queuedTurnCount: session.queued_turn_count,
    teamPhase: session.team_phase,
    teamParallelBudget: session.team_parallel_budget,
    teamActiveCount: session.team_active_count,
    teamQueuedCount: session.team_queued_count,
    providerConcurrencyGroup: session.provider_concurrency_group,
    providerParallelBudget: session.provider_parallel_budget,
    queueReason: session.queue_reason,
    retryableOverload: session.retryable_overload,
    createdFromTurnId: session.created_from_turn_id,
  };
}

function collectRestoredSessions(
  params: RestoredTeamFactsProjectionParams,
  parentSessionId: string,
): RestoredTeamFactSession[] {
  const sessionsById = new Map<string, RestoredTeamFactSession>();
  const addSession = (session: RestoredTeamFactSession | null) => {
    if (!session) {
      return;
    }
    const existing = sessionsById.get(session.id);
    sessionsById.set(session.id, {
      ...(existing ?? {}),
      ...session,
      status: session.status ?? existing?.status,
      latestTurnStatus: session.latestTurnStatus ?? existing?.latestTurnStatus,
      createdFromTurnId:
        session.createdFromTurnId ?? existing?.createdFromTurnId,
    });
  };

  if (params.subagentParentContext) {
    const currentSessionId = normalizeText(params.currentSessionId);
    if (currentSessionId && currentSessionId !== parentSessionId) {
      addSession({
        id: currentSessionId,
        status: normalizeStatus(
          params.currentSessionRuntimeStatus ??
            params.currentSessionLatestTurnStatus,
        ),
        latestTurnStatus: normalizeStatus(
          params.currentSessionLatestTurnStatus ??
            params.currentSessionRuntimeStatus,
        ),
        queuedTurnCount: params.currentSessionQueuedTurnCount,
        createdFromTurnId: params.subagentParentContext.created_from_turn_id,
      });
    }

    for (const session of params.subagentParentContext
      .sibling_subagent_sessions ?? []) {
      addSession(fromChildSession(session));
    }
    return [...sessionsById.values()];
  }

  for (const session of params.childSubagentSessions ?? []) {
    addSession(fromChildSession(session));
  }
  return [...sessionsById.values()];
}

function resolveParentSessionId(
  params: RestoredTeamFactsProjectionParams,
): string | null {
  return (
    normalizeText(params.subagentParentContext?.parent_session_id) ??
    normalizeText(params.currentSessionId)
  );
}

function resolveParentThreadId(
  params: RestoredTeamFactsProjectionParams,
  parentSessionId: string,
): string {
  if (params.subagentParentContext) {
    return parentSessionId;
  }
  return normalizeText(params.currentThreadId) ?? parentSessionId;
}

function buildFingerprint(events: AgentUiProjectionEvent[]): string | null {
  if (events.length === 0) {
    return null;
  }

  return events
    .map((event) =>
      [
        event.sessionId,
        event.threadId,
        event.turnId,
        event.type,
        event.taskId,
        event.agentId,
        event.runtimeStatus,
        event.latestTurnStatus,
        event.teamPhase,
        event.queuedTurnCount,
        event.workerNotificationId,
        event.handoffId,
      ].join("\u001f"),
    )
    .join("\u001e");
}

export function buildRestoredTeamFactsProjection(
  params: RestoredTeamFactsProjectionParams,
): RestoredTeamFactsProjection {
  const parentSessionId = resolveParentSessionId(params);
  if (!parentSessionId) {
    return { fingerprint: null, events: [] };
  }

  const restoredSessions = collectRestoredSessions(params, parentSessionId);
  if (restoredSessions.length === 0) {
    return { fingerprint: null, events: [] };
  }

  const parentThreadId = resolveParentThreadId(params, parentSessionId);
  const timestamp = params.timestamp ?? new Date().toISOString();
  let sequence = params.sequence ?? 1;
  const events: AgentUiProjectionEvent[] = [];

  for (const session of restoredSessions) {
    const turnId =
      normalizeText(session.createdFromTurnId) ??
      normalizeText(params.currentTurnId) ??
      undefined;
    const sessionEvents = buildAgentUiProjectionEvents(
      {
        type: "subagent_status_changed",
        session_id: session.id,
        root_session_id: parentSessionId,
        parent_session_id: parentSessionId,
        status: normalizeStatus(session.status),
        latest_turn_status: session.latestTurnStatus
          ? normalizeStatus(session.latestTurnStatus)
          : undefined,
        queued_turn_count: session.queuedTurnCount,
        team_phase: session.teamPhase ?? undefined,
        team_parallel_budget: session.teamParallelBudget,
        team_active_count: session.teamActiveCount,
        team_queued_count: session.teamQueuedCount,
        provider_concurrency_group:
          session.providerConcurrencyGroup ?? undefined,
        provider_parallel_budget: session.providerParallelBudget,
        queue_reason: session.queueReason ?? undefined,
        retryable_overload: session.retryableOverload,
      },
      {
        sequence,
        timestamp,
        sessionId: parentSessionId,
        threadId: parentThreadId,
        turnId,
        runId: `agent_team_restore:${parentSessionId}`,
      },
    );
    events.push(...sessionEvents);
    sequence += sessionEvents.length;
  }

  return {
    fingerprint: buildFingerprint(events),
    events,
  };
}
