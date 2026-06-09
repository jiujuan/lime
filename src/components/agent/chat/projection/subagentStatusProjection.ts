import type {
  AgentEventRuntimeStatus,
  AgentEventSubagentStatusChanged,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildSubagentProjectionPayload,
  buildSubagentRuntimeFacts,
  buildTeamRuntimeFacts,
  buildWorkerUsageProjection,
  compactProjectionFields,
  definedString,
  hasTeamRuntimeMetadata,
  isSubagentSpawnStatus,
  isSubagentTerminalStatus,
  normalizeRuntimeStatusFromRuntimePhase,
  normalizeTeamRuntimePhase,
  resolveSubagentStatusControl,
  resolveSubagentStatusPhase,
  resolveTeamTopology,
  truncateText,
} from "@limecloud/agent-runtime-projection";
import { normalizeHandoffProjectionPhase } from "./phaseProjection";
import { buildAgentUiProjectionBase } from "./projectionBase";

export function buildTeamChangedFromRuntimeStatusEvent(
  event: AgentEventRuntimeStatus,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  const metadata = event.status.metadata;
  if (!hasTeamRuntimeMetadata(metadata)) {
    return null;
  }

  const facts = compactProjectionFields(buildTeamRuntimeFacts(metadata));
  const runtimeStatus = normalizeRuntimeStatusFromRuntimePhase(
    event.status.phase,
  );

  return {
    ...buildAgentUiProjectionBase(event, context),
    type: "team.changed",
    owner: "team",
    scope: "team",
    phase: normalizeTeamRuntimePhase({
      phase: event.status.phase,
      metadata,
    }),
    surface: "team_roster",
    persistence: "snapshot",
    runtimeStatus,
    latestTurnStatus: runtimeStatus,
    topology: resolveTeamTopology(facts),
    ...facts,
    payload: {
      teamEvent: "runtime_status_changed",
      sourcePhase: event.status.phase,
      title: event.status.title,
      detailPreview: truncateText(event.status.detail),
      concurrencyPhase: definedString(metadata?.concurrency_phase),
      concurrencyScope: definedString(metadata?.concurrency_scope),
    },
  };
}

function resolveSubagentStatusHandoffStatus(
  event: AgentEventSubagentStatusChanged,
): string | null {
  if (!definedString(event.parent_session_id)) {
    return null;
  }

  switch (event.status) {
    case "running":
      return "accepted";
    case "queued":
    case "idle":
      return "handoff_requested";
    case "completed":
      return "returned";
    case "failed":
    case "not_found":
      return "failed";
    case "aborted":
    case "closed":
      return "cancelled";
    default:
      return null;
  }
}

export function buildSubagentStatusChangedEvents(
  event: AgentEventSubagentStatusChanged,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const base = buildAgentUiProjectionBase(event, context);
  const facts = compactProjectionFields(buildSubagentRuntimeFacts(event));
  const phase = resolveSubagentStatusPhase(event.status);
  const topology = resolveTeamTopology(facts);
  const payload = buildSubagentProjectionPayload(event);
  const transcriptRef = event.latest_turn_id
    ? `${event.session_id}:${event.latest_turn_id}`
    : event.session_id;
  const handoffStatus = resolveSubagentStatusHandoffStatus(event);
  const shared = {
    ...base,
    sessionId: event.root_session_id,
    taskId: event.session_id,
    agentId: event.session_id,
    parentSessionId: event.parent_session_id,
    topology,
    ...facts,
  };
  const events: AgentUiProjectionEvent[] = [
    {
      ...shared,
      type: "agent.changed",
      owner: "agent",
      scope: "agent",
      phase,
      surface: "team_roster",
      persistence: "snapshot",
      payload: {
        agentEvent: "subagent_status_changed",
        ...payload,
      },
    },
    {
      ...shared,
      type: "task.changed",
      owner: "task",
      scope: "task",
      phase,
      surface: "task_capsule",
      persistence: "snapshot",
      control: resolveSubagentStatusControl(event.status),
      payload: {
        taskEvent: "subagent_status_changed",
        ...payload,
      },
    },
    {
      ...shared,
      type: "team.changed",
      owner: "team",
      scope: "team",
      phase,
      surface: "team_roster",
      persistence: "snapshot",
      payload: {
        teamEvent: "teammate_status_changed",
        ...payload,
      },
    },
    {
      ...shared,
      type: "agent.changed",
      owner: "agent",
      scope: "agent",
      phase,
      surface: "teammate_transcript",
      persistence: "snapshot",
      control: "open_detail",
      transcriptRef,
      payload: {
        agentEvent: "teammate_transcript_ref",
        transcriptRef,
        ...payload,
      },
    },
  ];

  if (isSubagentSpawnStatus(event.status)) {
    events.push({
      ...shared,
      type: "agent.spawned",
      owner: "agent",
      scope: "agent",
      phase,
      surface: "delegation_graph",
      persistence: "snapshot",
      control: "delegate",
      payload: {
        agentEvent: "subagent_active",
        spawnSource: "subagent_status_changed",
        ...payload,
      },
    });
  }

  if (isSubagentTerminalStatus(event.status)) {
    const terminalEvent =
      event.status === "completed" ? "worker_completed" : "worker_stopped";
    const workerUsage = buildWorkerUsageProjection(event.usage);
    const workerPayload = compactProjectionFields({
      transcriptRef,
      workerUsage,
      durationMs: event.duration_ms,
      toolCount: event.tool_count,
      resultRef: definedString(event.result_ref),
    });
    events.push(
      {
        ...shared,
        type: "agent.completed",
        owner: "agent",
        scope: "agent",
        phase,
        surface: "delegation_graph",
        persistence: "archive",
        payload: {
          agentEvent: terminalEvent,
          ...payload,
        },
      },
      {
        ...shared,
        type: "worker.notification",
        workerNotificationId: `${event.session_id}:${event.status}`,
        transcriptRef,
        ...(workerUsage ? { workerUsage } : {}),
        owner: "agent",
        scope: "agent",
        phase,
        surface: "worker_notifications",
        persistence: "archive",
        payload: {
          notificationKind: terminalEvent,
          ...payload,
          ...workerPayload,
        },
      },
    );
  }

  if (handoffStatus) {
    const parentSessionId = definedString(event.parent_session_id);
    const resultRef = definedString(event.result_ref);
    events.push({
      ...shared,
      type: "agent.handoff",
      handoffId: `${parentSessionId}:handoff:${event.session_id}`,
      transcriptRef,
      owner: "agent",
      scope: "agent",
      phase: normalizeHandoffProjectionPhase(handoffStatus),
      surface: "handoff_lane",
      persistence: isSubagentTerminalStatus(event.status)
        ? "archive"
        : "snapshot",
      control: "open_detail",
      topology: "specialist_handoff",
      payload: compactProjectionFields({
        handoffEvent: "specialist_handoff",
        status: handoffStatus,
        sourceStatus: event.status,
        from: parentSessionId,
        to: event.session_id,
        reason: "subagent_status_changed",
        resumeTarget: `agent-runtime://session/${event.session_id}`,
        contextBoundary: "subagent_session",
        transcriptRef,
        latestTurnId: event.latest_turn_id,
        resultRef,
      }),
    });
  }

  return events;
}
