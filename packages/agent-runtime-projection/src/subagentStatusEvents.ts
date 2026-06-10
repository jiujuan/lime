import type {
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import { compactProjectionFields, definedString } from "./normalization.js";
import {
  buildSubagentProjectionPayload,
  buildSubagentRuntimeFacts,
  buildWorkerUsageProjection,
  isSubagentSpawnStatus,
  isSubagentTerminalStatus,
  resolveSubagentStatusControl,
  resolveSubagentStatusPhase,
  resolveTeamTopology,
  type AgentUiSubagentRuntimeFactInput,
  type AgentUiWorkerUsageInput,
} from "./runtimeFacts.js";

export interface AgentUiSubagentStatusChangedProjectionInput
  extends AgentUiSubagentRuntimeFactInput {
  sourceType?: AgentUiProjectionSourceType | string;
  session_id: string;
  root_session_id: string;
  parent_session_id?: string | null;
  latest_turn_id?: string | null;
  closed?: boolean;
  usage?: AgentUiWorkerUsageInput | null;
  duration_ms?: number;
  tool_count?: number;
  result_ref?: string | null;
}

export function resolveAgentUiSubagentStatusHandoffStatus(
  input: Pick<
    AgentUiSubagentStatusChangedProjectionInput,
    "parent_session_id" | "status"
  >,
): string | null {
  if (!definedString(input.parent_session_id)) {
    return null;
  }

  switch (input.status) {
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
    case "cancelled":
    case "closed":
      return "cancelled";
    default:
      return null;
  }
}

export function normalizeAgentUiSubagentHandoffPhase(
  status: string | null | undefined,
): AgentUiPhase {
  switch (definedString(status)) {
    case "accepted":
      return "accepted";
    case "active":
    case "running":
      return "acting";
    case "returned":
      return "reconciling";
    case "resumed":
    case "completed":
    case "ready":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "handoff_requested":
    case "requested":
    case "pending":
      return "waiting";
    default:
      return status === "failed" || status === "error"
        ? "failed"
        : status === "completed" || status === "ready"
          ? "completed"
          : "acting";
  }
}

export function buildAgentUiSubagentStatusChangedEvents(
  input: AgentUiSubagentStatusChangedProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? "subagent_status_changed" },
    context,
  );
  const facts = compactProjectionFields(buildSubagentRuntimeFacts(input));
  const phase = resolveSubagentStatusPhase(input.status);
  const topology = resolveTeamTopology(facts);
  const payload = buildSubagentProjectionPayload(input);
  const transcriptRef = input.latest_turn_id
    ? `${input.session_id}:${input.latest_turn_id}`
    : input.session_id;
  const parentSessionId = definedString(input.parent_session_id);
  const handoffStatus = resolveAgentUiSubagentStatusHandoffStatus(input);
  const shared = {
    ...base,
    sessionId: input.root_session_id,
    taskId: input.session_id,
    agentId: input.session_id,
    parentSessionId,
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
      control: resolveSubagentStatusControl(input.status),
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

  if (isSubagentSpawnStatus(input.status)) {
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

  if (isSubagentTerminalStatus(input.status)) {
    const terminalEvent =
      input.status === "completed" ? "worker_completed" : "worker_stopped";
    const workerUsage = buildWorkerUsageProjection(input.usage ?? undefined);
    const workerPayload = compactProjectionFields({
      transcriptRef,
      workerUsage,
      durationMs: input.duration_ms,
      toolCount: input.tool_count,
      resultRef: definedString(input.result_ref),
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
        workerNotificationId: `${input.session_id}:${input.status}`,
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

  if (handoffStatus && parentSessionId) {
    const resultRef = definedString(input.result_ref);
    events.push({
      ...shared,
      type: "agent.handoff",
      handoffId: `${parentSessionId}:handoff:${input.session_id}`,
      transcriptRef,
      owner: "agent",
      scope: "agent",
      phase: normalizeAgentUiSubagentHandoffPhase(handoffStatus),
      surface: "handoff_lane",
      persistence: isSubagentTerminalStatus(input.status)
        ? "archive"
        : "snapshot",
      control: "open_detail",
      topology: "specialist_handoff",
      payload: compactProjectionFields({
        handoffEvent: "specialist_handoff",
        status: handoffStatus,
        sourceStatus: input.status,
        from: parentSessionId,
        to: input.session_id,
        reason: "subagent_status_changed",
        resumeTarget: `agent-runtime://session/${input.session_id}`,
        contextBoundary: "subagent_session",
        transcriptRef,
        latestTurnId: input.latest_turn_id,
        resultRef,
      }),
    });
  }

  return events;
}
