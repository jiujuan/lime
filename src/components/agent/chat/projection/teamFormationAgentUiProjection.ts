import type {
  TeamWorkspaceRuntimeFormationState,
  TeamWorkspaceRuntimeMember,
} from "../teamWorkspaceRuntime";

import type {
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeEntity,
  AgentUiRuntimeStatus,
} from "./agentUiEventProjection";
import { recordAgentUiProjectionEvents } from "./conversationProjectionStore";

function normalizeText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function timestampFromUpdatedAt(updatedAt: number): string | undefined {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return undefined;
  }
  return new Date(updatedAt).toISOString();
}

function resolveFormationPhase(
  status: TeamWorkspaceRuntimeFormationState["status"],
): AgentUiPhase {
  switch (status) {
    case "forming":
      return "planning";
    case "formed":
      return "accepted";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

function resolveMemberRuntimeStatus(
  member: TeamWorkspaceRuntimeMember,
): AgentUiRuntimeStatus {
  switch (member.status) {
    case "planned":
      return "queued";
    case "spawning":
      return "preparing";
    case "running":
      return "running";
    case "waiting":
      return "waiting";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

function resolveMemberPhase(member: TeamWorkspaceRuntimeMember): AgentUiPhase {
  switch (member.status) {
    case "planned":
      return "planning";
    case "spawning":
      return "preparing";
    case "running":
      return "acting";
    case "waiting":
      return "waiting";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

function resolveMemberEntity(
  member: TeamWorkspaceRuntimeMember,
): AgentUiRuntimeEntity {
  return normalizeText(member.sessionId) ? "subagent_turn" : "work_item";
}

function resolveMemberTaskId(
  requestId: string,
  member: TeamWorkspaceRuntimeMember,
): string {
  return normalizeText(member.sessionId) ?? `${requestId}:${member.id}`;
}

function buildMemberPayload(
  state: TeamWorkspaceRuntimeFormationState,
  member: TeamWorkspaceRuntimeMember,
  runtimeEntity: AgentUiRuntimeEntity,
  runtimeStatus: AgentUiRuntimeStatus,
): Record<string, unknown> {
  return {
    teamEvent: "team_formation_member",
    taskEvent: "team_formation_member",
    requestId: state.requestId,
    formationStatus: state.status,
    memberId: member.id,
    memberLabel: member.label,
    memberSummary: member.summary,
    roleKey: normalizeText(member.roleKey),
    profileId: normalizeText(member.profileId),
    skillIds: member.skillIds,
    memberStatus: member.status,
    sessionId: normalizeText(member.sessionId),
    latestSnippet: normalizeText(member.latestSnippet),
    runtimeEntity,
    runtimeStatus,
  };
}

export function buildAgentUiTeamFormationProjectionEvents(
  state: TeamWorkspaceRuntimeFormationState,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const timestamp =
    context.timestamp ?? timestampFromUpdatedAt(state.updatedAt);
  const sessionId = normalizeText(context.sessionId ?? undefined);
  const threadId = normalizeText(context.threadId ?? undefined);
  const runId = normalizeText(context.runId ?? undefined);
  const turnId = normalizeText(context.turnId ?? undefined);
  const requestId = state.requestId.trim();
  if (!requestId) {
    return [];
  }

  const formationPhase = resolveFormationPhase(state.status);
  const baseSequence = context.sequence;
  const events: AgentUiProjectionEvent[] = [
    {
      type: "team.changed",
      sourceType: "team_formation_projection",
      sequence: baseSequence,
      timestamp,
      sessionId,
      threadId,
      runId,
      turnId,
      teamId: requestId,
      teamName: normalizeText(state.label),
      owner: "team",
      scope: "team",
      phase: formationPhase,
      surface: "team_roster",
      persistence: "snapshot",
      topology: "coordinator_team",
      payload: {
        teamEvent: "team_formation_changed",
        requestId,
        formationStatus: state.status,
        label: normalizeText(state.label),
        summary: normalizeText(state.summary),
        memberCount: state.members.length,
        blueprintRoleCount: state.blueprint?.roles.length ?? 0,
        errorMessage: normalizeText(state.errorMessage),
      },
      rawEventRef: requestId,
    },
  ];

  state.members.forEach((member, index) => {
    const runtimeEntity = resolveMemberEntity(member);
    const runtimeStatus = resolveMemberRuntimeStatus(member);
    const phase = resolveMemberPhase(member);
    const taskId = resolveMemberTaskId(requestId, member);
    const workItemId = runtimeEntity === "work_item" ? taskId : undefined;
    const agentId = normalizeText(member.sessionId) ?? member.id;
    const payload = buildMemberPayload(
      state,
      member,
      runtimeEntity,
      runtimeStatus,
    );
    const sequenceOffset = index * 2 + 1;

    events.push(
      {
        type: "agent.changed",
        sourceType: "team_formation_projection",
        sequence:
          typeof baseSequence === "number"
            ? baseSequence + sequenceOffset
            : undefined,
        timestamp,
        sessionId,
        threadId,
        runId,
        turnId,
        taskId,
        agentId,
        workItemId,
        agentName: member.label,
        agentRole: normalizeText(member.roleKey),
        agentSource: "team_formation",
        owner: "agent",
        scope: "agent",
        phase,
        surface: "team_roster",
        persistence: "snapshot",
        control: "assign",
        topology: "coordinator_team",
        runtimeEntity,
        runtimeStatus,
        latestTurnStatus: runtimeStatus,
        transcriptRef: normalizeText(member.sessionId),
        payload,
        rawEventRef: requestId,
      },
      {
        type: "task.changed",
        sourceType: "team_formation_projection",
        sequence:
          typeof baseSequence === "number"
            ? baseSequence + sequenceOffset + 1
            : undefined,
        timestamp,
        sessionId,
        threadId,
        runId,
        turnId,
        taskId,
        agentId,
        workItemId,
        owner: "task",
        scope: "task",
        phase,
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        topology: "coordinator_team",
        runtimeEntity,
        runtimeStatus,
        latestTurnStatus: runtimeStatus,
        payload,
        rawEventRef: requestId,
      },
    );
  });

  return events;
}

export function recordTeamFormationAgentUiProjection(
  state: TeamWorkspaceRuntimeFormationState,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  return recordAgentUiProjectionEvents(
    buildAgentUiTeamFormationProjectionEvents(state, context),
  );
}
