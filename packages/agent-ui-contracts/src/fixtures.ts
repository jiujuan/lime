import type {
  AgentRuntimeExecutionEvent,
  AgentRuntimeReadModel,
} from "./runtime";

export const AGENT_UI_FIXTURE_SCHEMA_VERSION = "agent-ui-fixture/v0.1";

export interface AgentUiFixtureExpectation {
  status: string;
  messagePartCount?: number;
  timelineEntryCount?: number;
  graphNodeCount?: number;
  pendingActionCount?: number;
  artifactCount?: number;
  evidenceCount?: number;
  subagents?: {
    hasSubagents?: boolean;
    threadCount?: number;
    delegationCallCount?: number;
    activityCount?: number;
    activeThreadCount?: number;
    completedThreadCount?: number;
    failedThreadCount?: number;
  };
  diagnostics?: string[];
}

export interface AgentUiFixture<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> {
  id: string;
  schemaVersion: string;
  title: string;
  events: TEvent[];
  initialReadModel?: AgentRuntimeReadModel<TEvent>;
  finalReadModel?: AgentRuntimeReadModel<TEvent>;
  expected: AgentUiFixtureExpectation;
}

const runtimeId = "agent_ui_fixture_runtime";
const threadId = "thread_fixture";
const turnId = "turn_fixture";
const taskId = "task_fixture";
const createdAt = "2026-06-10T00:00:00.000Z";

function event(
  input: Omit<
    AgentRuntimeExecutionEvent,
    "createdAt" | "id" | "runtimeId" | "schemaVersion" | "threadId" | "turnId"
  > & { id: string },
): AgentRuntimeExecutionEvent {
  return {
    schemaVersion: "lime-runtime-event/v0.1",
    runtimeId,
    threadId,
    turnId,
    createdAt,
    ...input,
  };
}

function readModel(
  events: AgentRuntimeExecutionEvent[],
  overrides: Partial<AgentRuntimeReadModel> = {},
): AgentRuntimeReadModel {
  return {
    events: events.map((source) => projection(source)),
    visibleEvents: events.map((source) => projection(source)),
    pendingActions: [],
    inputSourceRecovery: false,
    sourceCount: 0,
    artifactRefs: events.flatMap((source) => source.artifactRefs ?? []),
    evidenceRefs: events.flatMap((source) => source.evidenceRefs ?? []),
    taskRefs: [taskId],
    ...overrides,
  };
}

function projection(source: AgentRuntimeExecutionEvent) {
  return {
    id: `projection_${source.id}`,
    source,
    surface: "runtime-status" as const,
    title: source.title,
    detail: source.detail,
    status: source.status,
    displayStatusKey: `agent.status.${source.status}`,
    resolved: source.status !== "blocked" && source.status !== "pending",
    actionKind: source.actionId ? "runtime_action" : "none",
    targetModule: "agent-runtime",
    actionId: source.actionId,
  };
}

const textBasicEvents = [
  event({
    id: "evt_text_submitted",
    eventClass: "turn.submitted",
    kind: "state",
    status: "pending",
    sequence: 1,
    title: "Turn submitted",
  }),
  event({
    id: "evt_text_started",
    eventClass: "turn.started",
    kind: "state",
    status: "running",
    sequence: 2,
    title: "Turn started",
  }),
  event({
    id: "evt_text_delta",
    eventClass: "model.delta",
    kind: "model",
    status: "running",
    sequence: 3,
    title: "Assistant text",
    payload: { delta: "你好，Lime。" },
  }),
  event({
    id: "evt_text_completed",
    eventClass: "model.completed",
    kind: "model",
    status: "completed",
    sequence: 4,
    title: "Assistant final text",
    payload: { text: "你好，Lime。" },
  }),
  event({
    id: "evt_text_turn_completed",
    eventClass: "turn.completed",
    kind: "state",
    status: "completed",
    sequence: 5,
    title: "Turn completed",
    completedAt: createdAt,
  }),
  event({
    id: "evt_text_snapshot",
    eventClass: "snapshot.updated",
    kind: "state",
    status: "completed",
    sequence: 6,
    title: "Snapshot updated",
  }),
];

const toolSuccessEvents = [
  event({
    id: "evt_tool_started",
    eventClass: "tool.started",
    kind: "tool",
    status: "running",
    sequence: 1,
    taskId,
    toolCallId: "tool_fixture_search",
    title: "Search started",
    payload: { toolName: "search" },
  }),
  event({
    id: "evt_tool_result",
    eventClass: "tool.result",
    kind: "tool",
    status: "completed",
    sequence: 2,
    taskId,
    toolCallId: "tool_fixture_search",
    title: "Search completed",
    refIds: ["output_search_1"],
  }),
  event({
    id: "evt_tool_turn_completed",
    eventClass: "turn.completed",
    kind: "state",
    status: "completed",
    sequence: 3,
    taskId,
    title: "Turn completed",
  }),
];

const toolFailureEvents = [
  event({
    id: "evt_tool_failed_start",
    eventClass: "tool.started",
    kind: "tool",
    status: "running",
    sequence: 1,
    taskId,
    toolCallId: "tool_fixture_write",
    title: "Write file started",
  }),
  event({
    id: "evt_tool_failed",
    eventClass: "tool.failed",
    kind: "tool",
    status: "failed",
    sequence: 2,
    taskId,
    toolCallId: "tool_fixture_write",
    title: "Write file failed",
    payload: { failureCategory: "permission_denied" },
  }),
];

const hitlActionEvents = [
  event({
    id: "evt_action_required",
    eventClass: "action.required",
    kind: "action",
    status: "blocked",
    sequence: 1,
    taskId,
    actionId: "action_fixture_approval",
    title: "Approval required",
  }),
  event({
    id: "evt_action_resolved",
    eventClass: "action.resolved",
    kind: "action",
    status: "completed",
    sequence: 2,
    taskId,
    actionId: "action_fixture_approval",
    title: "Approval resolved",
    payload: { decision: "approved" },
  }),
];

const artifactEvidenceEvents = [
  event({
    id: "evt_artifact_changed",
    eventClass: "artifact.changed",
    kind: "draft",
    owner: "artifact",
    status: "completed",
    sequence: 1,
    taskId,
    artifactId: "artifact_fixture_1",
    artifactRefs: ["artifact_fixture_1"],
    title: "Artifact changed",
  }),
  event({
    id: "evt_evidence_changed",
    eventClass: "evidence.changed",
    kind: "evidence",
    owner: "evidence",
    status: "completed",
    sequence: 2,
    taskId,
    evidenceId: "evidence_fixture_1",
    evidenceRefs: ["evidence_fixture_1"],
    title: "Evidence changed",
  }),
];

const streamRepairEvents = [
  event({
    id: "evt_repair_delta",
    eventClass: "model.delta",
    kind: "model",
    status: "running",
    sequence: 1,
    title: "Assistant text before gap",
    payload: { delta: "first chunk" },
  }),
  event({
    id: "evt_repair_snapshot",
    eventClass: "snapshot.updated",
    kind: "state",
    status: "completed",
    sequence: 3,
    title: "Snapshot repaired stream",
  }),
];

const subagentHandoffEvents = [
  event({
    id: "evt_parent_task_created",
    eventClass: "task.created",
    kind: "handoff",
    status: "running",
    sequence: 1,
    taskId,
    title: "Parent task created",
  }),
  event({
    id: "evt_subagent_started",
    eventClass: "subagent.started",
    kind: "handoff",
    status: "running",
    sequence: 2,
    taskId,
    subagentId: "subagent_fixture_researcher",
    title: "Research subagent started",
    payload: { role: "researcher", parentTaskId: taskId },
  }),
  event({
    id: "evt_subagent_tool_result",
    eventClass: "tool.result",
    kind: "tool",
    status: "completed",
    sequence: 3,
    taskId,
    subagentId: "subagent_fixture_researcher",
    toolCallId: "tool_fixture_research",
    title: "Research completed",
  }),
  event({
    id: "evt_handoff_requested",
    eventClass: "handoff.requested",
    kind: "handoff",
    status: "blocked",
    sequence: 4,
    taskId,
    subagentId: "subagent_fixture_researcher",
    handoffId: "handoff_fixture_1",
    title: "Handoff requested",
  }),
  event({
    id: "evt_review_verdict",
    eventClass: "review.verdict",
    kind: "evidence",
    status: "completed",
    sequence: 5,
    taskId,
    reviewId: "review_fixture_1",
    evidenceId: "evidence_fixture_review",
    evidenceRefs: ["evidence_fixture_review"],
    title: "Review completed",
  }),
  event({
    id: "evt_subagent_completed",
    eventClass: "subagent.completed",
    kind: "handoff",
    status: "completed",
    sequence: 6,
    taskId,
    subagentId: "subagent_fixture_researcher",
    title: "Research subagent completed",
  }),
];

export const agentUiConformanceFixtures = [
  {
    id: "text-basic",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Text turn with final reconciliation",
    events: textBasicEvents,
    finalReadModel: readModel(textBasicEvents),
    expected: {
      status: "completed",
      messagePartCount: 1,
      timelineEntryCount: 6,
    },
  },
  {
    id: "tool-success",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Tool call success with output reference",
    events: toolSuccessEvents,
    finalReadModel: readModel(toolSuccessEvents),
    expected: {
      status: "completed",
      timelineEntryCount: 3,
    },
  },
  {
    id: "tool-failure",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Tool failure with recovery category",
    events: toolFailureEvents,
    finalReadModel: readModel(toolFailureEvents),
    expected: {
      status: "failed",
      diagnostics: ["tool.failed"],
    },
  },
  {
    id: "hitl-action",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Human approval action lifecycle",
    events: hitlActionEvents,
    initialReadModel: readModel(hitlActionEvents.slice(0, 1), {
      pendingActions: [projection(hitlActionEvents[0])],
    }),
    finalReadModel: readModel(hitlActionEvents),
    expected: {
      status: "completed",
      pendingActionCount: 0,
    },
  },
  {
    id: "artifact-evidence",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Artifact and evidence references",
    events: artifactEvidenceEvents,
    finalReadModel: readModel(artifactEvidenceEvents),
    expected: {
      status: "completed",
      artifactCount: 1,
      evidenceCount: 1,
    },
  },
  {
    id: "stream-repair",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Interrupted stream repaired by snapshot",
    events: streamRepairEvents,
    finalReadModel: readModel(streamRepairEvents),
    expected: {
      status: "completed",
      diagnostics: ["sequence_gap"],
    },
  },
  {
    id: "subagent-handoff",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Subagent handoff and review",
    events: subagentHandoffEvents,
    finalReadModel: readModel(subagentHandoffEvents, {
      evidenceRefs: ["evidence_fixture_review"],
      taskRefs: [taskId, "subagent_fixture_researcher"],
    }),
    expected: {
      status: "completed",
      graphNodeCount: 2,
      evidenceCount: 1,
      subagents: {
        hasSubagents: true,
        threadCount: 1,
        delegationCallCount: 2,
        activityCount: 4,
        activeThreadCount: 0,
        completedThreadCount: 1,
        failedThreadCount: 0,
      },
    },
  },
] satisfies AgentUiFixture[];

export type AgentUiConformanceFixtureId =
  (typeof agentUiConformanceFixtures)[number]["id"];

export function getAgentUiFixture(
  id: AgentUiConformanceFixtureId,
): AgentUiFixture {
  const fixture = agentUiConformanceFixtures.find((item) => item.id === id);
  if (!fixture) {
    throw new Error(`Unknown Agent UI fixture: ${id}`);
  }
  return fixture;
}
