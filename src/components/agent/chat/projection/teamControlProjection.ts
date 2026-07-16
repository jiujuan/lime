import type {
  AgentUiControl,
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeEntity,
  AgentUiRuntimeStatus,
  AgentUiSurface,
} from "@limecloud/agent-ui-contracts";
import {
  compactProjectionFields,
  definedString,
  normalizeProjectionIdList,
  truncateText,
} from "@limecloud/agent-runtime-projection";
import { normalizeHandoffProjectionPhase } from "./phaseProjection";
import { sequenceProjectionEvents } from "./projectionBase";

export type AgentUiTeamControlProjectionAction =
  | "assign"
  | "close"
  | "close_completed"
  | "delegate"
  | "reassign"
  | "request_review"
  | "resume"
  | "send_input"
  | "stop"
  | "wait";

export interface AgentUiTeamControlProjectionInput {
  action: AgentUiTeamControlProjectionAction;
  sessionId?: string | null;
  requestedSessionIds: string[];
  affectedSessionIds?: string[];
  cascadeSessionIds?: string[];
  resolvedSessionId?: string | null;
  resolvedStatus?: string | null;
  timedOut?: boolean;
  messagePreview?: string | null;
  runtimeEntity?: AgentUiRuntimeEntity | null;
  workItemId?: string | null;
  reviewId?: string | null;
  previousAssigneeId?: string | null;
  nextAssigneeId?: string | null;
  reassignmentReason?: string | null;
  timestamp?: string | null;
}

function resolveTeamControl(
  control: AgentUiTeamControlProjectionAction,
): AgentUiControl {
  switch (control) {
    case "assign":
    case "reassign":
      return "assign";
    case "delegate":
      return "delegate";
    case "request_review":
      return "request_review";
    case "resume":
    case "send_input":
      return "continue_agent";
    case "stop":
      return "stop";
    case "wait":
      return "wait";
    case "close":
    case "close_completed":
    default:
      return "close";
  }
}

function normalizeTeamControlResolvedRuntimeStatus(
  status: string | null | undefined,
): AgentUiRuntimeStatus | undefined {
  const normalizedStatus = definedString(status);
  switch (normalizedStatus) {
    case "idle":
    case "queued":
    case "submitted":
    case "accepted":
    case "preparing":
    case "running":
    case "waiting":
    case "needs_input":
    case "plan_ready":
    case "completed":
    case "failed":
    case "aborted":
    case "cancelled":
    case "closed":
    case "not_found":
      return normalizedStatus;
    case "assigned":
    case "claimed":
      return "accepted";
    case "blocked":
    case "reviewing":
      return "waiting";
    case "done":
      return "completed";
    case "killed":
      return "aborted";
    case "open":
      return "queued";
    default:
      return undefined;
  }
}

function phaseFromTeamControlRuntimeStatus(
  status: AgentUiRuntimeStatus,
): AgentUiPhase {
  switch (status) {
    case "accepted":
      return "accepted";
    case "queued":
    case "submitted":
      return "planning";
    case "preparing":
      return "preparing";
    case "running":
      return "acting";
    case "waiting":
    case "needs_input":
    case "plan_ready":
      return "waiting";
    case "completed":
    case "closed":
    case "not_found":
      return "completed";
    case "failed":
      return "failed";
    case "aborted":
      return "interrupted";
    case "cancelled":
      return "cancelled";
    case "idle":
    default:
      return "unknown";
  }
}

function resolveTeamControlPhase(
  action: AgentUiTeamControlProjectionAction,
  timedOut: boolean,
  resolvedStatus?: string | null,
): AgentUiPhase {
  const resolvedRuntimeStatus = timedOut
    ? undefined
    : normalizeTeamControlResolvedRuntimeStatus(resolvedStatus);
  if (resolvedRuntimeStatus) {
    return phaseFromTeamControlRuntimeStatus(resolvedRuntimeStatus);
  }
  if (action === "request_review") {
    return "reviewing";
  }
  if (action === "reassign") {
    return "routing";
  }
  if (action === "assign" || action === "delegate") {
    return "planning";
  }
  if (action === "wait") {
    return timedOut ? "waiting" : "completed";
  }
  if (action === "resume" || action === "send_input") {
    return "acting";
  }
  if (action === "stop") {
    return "interrupted";
  }
  return "completed";
}

function resolveTeamControlRuntimeStatus(
  action: AgentUiTeamControlProjectionAction,
  timedOut: boolean,
  resolvedStatus?: string | null,
): AgentUiRuntimeStatus {
  const resolvedRuntimeStatus = timedOut
    ? undefined
    : normalizeTeamControlResolvedRuntimeStatus(resolvedStatus);
  if (resolvedRuntimeStatus) {
    return resolvedRuntimeStatus;
  }
  if (action === "request_review") {
    return "waiting";
  }
  if (action === "assign" || action === "delegate" || action === "reassign") {
    return "queued";
  }
  if (action === "wait") {
    return timedOut ? "waiting" : "completed";
  }
  if (action === "resume" || action === "send_input") {
    return "running";
  }
  if (action === "stop") {
    return "aborted";
  }
  return "closed";
}

function resolveTeamControlTaskSurface(
  action: AgentUiTeamControlProjectionAction,
): AgentUiSurface {
  switch (action) {
    case "delegate":
      return "delegation_graph";
    case "request_review":
      return "review_lane";
    case "assign":
    case "reassign":
    default:
      return "work_board";
  }
}

function resolveTeamControlRuntimeEntity(
  input: AgentUiTeamControlProjectionInput,
): AgentUiRuntimeEntity {
  if (input.runtimeEntity) {
    return input.runtimeEntity;
  }
  return input.action === "assign" || input.action === "reassign"
    ? "work_item"
    : "subagent_turn";
}

export function buildAgentUiTeamControlProjectionEvents(
  input: AgentUiTeamControlProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const requestedSessionIds = normalizeProjectionIdList(
    input.requestedSessionIds,
  );
  const affectedSessionIds = normalizeProjectionIdList(
    input.affectedSessionIds,
  );
  const cascadeSessionIds = normalizeProjectionIdList(input.cascadeSessionIds);
  const workItemId = definedString(input.workItemId);
  const reviewId = definedString(input.reviewId);
  const previousAssigneeId = definedString(input.previousAssigneeId);
  const nextAssigneeId = definedString(input.nextAssigneeId);
  const reassignmentReason = truncateText(input.reassignmentReason);
  const fallbackTaskIds = normalizeProjectionIdList([workItemId, reviewId]);
  const taskSessionIds =
    affectedSessionIds.length > 0
      ? affectedSessionIds
      : requestedSessionIds.length > 0
        ? requestedSessionIds
        : fallbackTaskIds;
  const control = resolveTeamControl(input.action);
  const timedOut = input.timedOut === true;
  const phase = resolveTeamControlPhase(
    input.action,
    timedOut,
    input.resolvedStatus,
  );
  const runtimeStatus = resolveTeamControlRuntimeStatus(
    input.action,
    timedOut,
    input.resolvedStatus,
  );
  const taskSurface = resolveTeamControlTaskSurface(input.action);
  const runtimeEntity = resolveTeamControlRuntimeEntity(input);
  const timestamp = definedString(input.timestamp) ?? context.timestamp;
  const sessionId = definedString(input.sessionId ?? context.sessionId);
  const sharedPayload = compactProjectionFields({
    teamEvent: "team_control",
    taskEvent:
      input.action === "reassign" ? "team_reassignment" : "team_control",
    action: input.action,
    control,
    requestedSessionIds,
    affectedSessionIds,
    cascadeSessionIds,
    resolvedSessionId: definedString(input.resolvedSessionId),
    resolvedStatus: definedString(input.resolvedStatus),
    timedOut,
    messagePreview: truncateText(input.messagePreview),
    runtimeEntity,
    workItemId,
    reviewId,
    previousAssigneeId,
    nextAssigneeId,
    reassignmentReason,
  });

  const events: AgentUiProjectionEvent[] = taskSessionIds.map<AgentUiProjectionEvent>((taskId) => ({
      sourceType: "team_control_projection",
      timestamp,
      sessionId,
      threadId: definedString(context.threadId),
      runId: definedString(context.runId),
      turnId: definedString(context.turnId),
      type: "task.changed",
      taskId,
      agentId: taskId,
      workItemId,
      reviewId,
      owner: "task",
      scope: "task",
      phase,
      surface: taskSurface,
      persistence: "snapshot",
      control,
      topology: "coordinator_team",
      runtimeEntity,
      runtimeStatus,
      latestTurnStatus: runtimeStatus,
      payload: {
        ...sharedPayload,
        taskId,
        runtimeEntity,
        runtimeStatus,
      },
    }));

  if (input.action === "resume" && runtimeEntity === "subagent_turn") {
    events.push(
      ...affectedSessionIds.map<AgentUiProjectionEvent>((taskId) => ({
        sourceType: "team_control_projection",
        timestamp,
        sessionId,
        threadId: definedString(context.threadId),
        runId: definedString(context.runId),
        turnId: definedString(context.turnId),
        type: "agent.handoff",
        taskId,
        agentId: taskId,
        handoffId: `${sessionId ?? "session"}:handoff:${taskId}`,
        parentThreadId: definedString(context.threadId),
        owner: "agent",
        scope: "agent",
        phase: normalizeHandoffProjectionPhase("resumed"),
        surface: "handoff_lane",
        persistence: "snapshot",
        control,
        topology: "specialist_handoff",
        runtimeEntity,
        runtimeStatus,
        latestTurnStatus: runtimeStatus,
        payload: {
          ...sharedPayload,
          handoffEvent: "specialist_handoff",
          status: "resumed",
          sourceControl: "resume",
          from: sessionId,
          to: taskId,
          reason: "team_control_resume",
          resumeTarget: `agent-runtime://session/${taskId}`,
          contextBoundary: "subagent_session",
        },
      })),
    );
  }

  return sequenceProjectionEvents(events, context.sequence);
}
