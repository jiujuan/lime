import type {
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import { buildAgentUiCollaborationPayloadMetadata } from "./collaborationFacts.js";
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
  metadata?: unknown;
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
  const sourceType = input.sourceType ?? "subagent_status_changed";
  const buildCollaborationPayload = ({
    payload: eventPayload,
    collaborationKind,
    surface,
    phase: eventPhase,
    status,
    handoffId,
  }: {
    payload: Record<string, unknown>;
    collaborationKind: string;
    surface: string;
    phase: AgentUiPhase;
    status?: string | null;
    handoffId?: string | null;
  }): Record<string, unknown> =>
    compactProjectionFields({
      ...eventPayload,
      ...buildAgentUiCollaborationPayloadMetadata({
        sourceType,
        collaborationKind,
        surface,
        phase: eventPhase,
        status: status ?? input.status,
        runtimeEntity: facts.runtimeEntity,
        runtimeStatus: facts.runtimeStatus,
        latestTurnStatus: facts.latestTurnStatus,
        taskId: input.session_id,
        agentId: input.session_id,
        parentSessionId,
        transcriptRef,
        handoffId,
        metadata: input.metadata,
      }),
    });
  const events: AgentUiProjectionEvent[] = [
    {
      ...shared,
      type: "agent.changed",
      owner: "agent",
      scope: "agent",
      phase,
      surface: "team_roster",
      persistence: "snapshot",
      payload: buildCollaborationPayload({
        payload: {
          agentEvent: "subagent_status_changed",
          ...payload,
        },
        collaborationKind: "subagent_status",
        surface: "team_roster",
        phase,
      }),
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
      payload: buildCollaborationPayload({
        payload: {
          taskEvent: "subagent_status_changed",
          ...payload,
        },
        collaborationKind: "subagent_task",
        surface: "task_capsule",
        phase,
      }),
    },
    {
      ...shared,
      type: "team.changed",
      owner: "team",
      scope: "team",
      phase,
      surface: "team_roster",
      persistence: "snapshot",
      payload: buildCollaborationPayload({
        payload: {
          teamEvent: "teammate_status_changed",
          ...payload,
        },
        collaborationKind: "team_status",
        surface: "team_roster",
        phase,
      }),
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
      payload: buildCollaborationPayload({
        payload: {
          agentEvent: "teammate_transcript_ref",
          transcriptRef,
          ...payload,
        },
        collaborationKind: "teammate_transcript",
        surface: "teammate_transcript",
        phase,
      }),
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
      payload: buildCollaborationPayload({
        payload: {
          agentEvent: "subagent_active",
          spawnSource: "subagent_status_changed",
          ...payload,
        },
        collaborationKind: "delegation",
        surface: "delegation_graph",
        phase,
      }),
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
        payload: buildCollaborationPayload({
          payload: {
            agentEvent: terminalEvent,
            ...payload,
          },
          collaborationKind: "delegation_terminal",
          surface: "delegation_graph",
          phase,
        }),
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
        payload: buildCollaborationPayload({
          payload: {
            notificationKind: terminalEvent,
            ...payload,
            ...workerPayload,
          },
          collaborationKind: terminalEvent,
          surface: "worker_notifications",
          phase,
        }),
      },
    );
  }

  if (handoffStatus && parentSessionId) {
    const resultRef = definedString(input.result_ref);
    const handoffId = `${parentSessionId}:handoff:${input.session_id}`;
    const handoffPhase = normalizeAgentUiSubagentHandoffPhase(handoffStatus);
    events.push({
      ...shared,
      type: "agent.handoff",
      handoffId,
      transcriptRef,
      owner: "agent",
      scope: "agent",
      phase: handoffPhase,
      surface: "handoff_lane",
      persistence: isSubagentTerminalStatus(input.status)
        ? "archive"
        : "snapshot",
      control: "open_detail",
      topology: "specialist_handoff",
      payload: buildCollaborationPayload({
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
        collaborationKind: "specialist_handoff",
        surface: "handoff_lane",
        phase: handoffPhase,
        status: handoffStatus,
        handoffId,
      }),
    });
  }

  return events;
}
