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
  coding?: {
    fileCount?: number;
    changeCount?: number;
    patchCount?: number;
    commandCount?: number;
    testCount?: number;
    blockedCount?: number;
    failedPatchCount?: number;
    failedTestCount?: number;
  };
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
    id: "evt_subagent_channel_opened",
    eventClass: "channel.opened",
    kind: "handoff",
    status: "running",
    sequence: 3,
    taskId,
    subagentId: "subagent_fixture_researcher",
    channelId: "channel_fixture_research",
    title: "Research channel opened",
    payload: {
      parentTaskId: taskId,
      channelType: "handoff",
      targetThreadId: "subagent_fixture_researcher",
    },
  }),
  event({
    id: "evt_subagent_channel_message",
    eventClass: "channel.message",
    kind: "handoff",
    status: "running",
    sequence: 4,
    taskId,
    subagentId: "subagent_fixture_researcher",
    channelId: "channel_fixture_research",
    title: "Research update posted",
    payload: {
      parentTaskId: taskId,
      summary: "Found primary sources and drafted evidence notes.",
    },
  }),
  event({
    id: "evt_subagent_tool_started",
    eventClass: "tool.started",
    kind: "tool",
    status: "running",
    sequence: 5,
    taskId,
    subagentId: "subagent_fixture_researcher",
    toolCallId: "tool_fixture_research",
    title: "Research started",
  }),
  event({
    id: "evt_subagent_tool_result",
    eventClass: "tool.result",
    kind: "tool",
    status: "completed",
    sequence: 6,
    taskId,
    subagentId: "subagent_fixture_researcher",
    toolCallId: "tool_fixture_research",
    title: "Research completed",
  }),
  event({
    id: "evt_subagent_artifact_changed",
    eventClass: "artifact.changed",
    kind: "draft",
    owner: "artifact",
    status: "completed",
    sequence: 7,
    taskId,
    subagentId: "subagent_fixture_researcher",
    artifactId: "artifact_fixture_research_notes",
    artifactRefs: ["artifact_fixture_research_notes"],
    title: "Research notes attached",
    payload: {
      relativePath: "handoff/research-notes.md",
      preview: "Primary source notes for review.",
    },
  }),
  event({
    id: "evt_handoff_requested",
    eventClass: "handoff.requested",
    kind: "handoff",
    status: "blocked",
    sequence: 8,
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
    sequence: 9,
    taskId,
    subagentId: "subagent_fixture_researcher",
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
    sequence: 10,
    taskId,
    subagentId: "subagent_fixture_researcher",
    title: "Research subagent completed",
    completedAt: createdAt,
  }),
  event({
    id: "evt_subagent_task_completed",
    eventClass: "task.completed",
    kind: "handoff",
    status: "completed",
    sequence: 11,
    taskId,
    subagentId: "subagent_fixture_researcher",
    title: "Research task completed",
    completedAt: createdAt,
  }),
  event({
    id: "evt_subagent_projection_delta",
    eventClass: "state.delta",
    kind: "state",
    status: "completed",
    sequence: 12,
    taskId,
    title: "Subagent projection reconciled",
    payload: {
      target: "projection.subagents",
      patch: [
        {
          op: "replace",
          path: "/threads/0/summary",
          value: "Research notes and review evidence are ready.",
        },
      ],
    },
  }),
  event({
    id: "evt_subagent_snapshot_updated",
    eventClass: "snapshot.updated",
    kind: "state",
    status: "completed",
    sequence: 13,
    taskId,
    title: "Subagent snapshot updated",
  }),
];

const codingFileChangeEvents = [
  event({
    id: "evt_coding_turn_started",
    eventClass: "turn.started",
    kind: "state",
    status: "running",
    sequence: 1,
    taskId,
    title: "Coding turn started",
    payload: { profileId: "coding" },
  }),
  event({
    id: "evt_coding_file_read",
    eventClass: "file.read",
    kind: "tool",
    status: "completed",
    sequence: 2,
    taskId,
    toolCallId: "tool_file_read_package",
    artifactId: "artifact_src_app",
    artifactRefs: ["artifact_src_app"],
    title: "Read app source",
    payload: {
      path: "src/App.tsx",
      operation: "read",
      contentRef: "artifact://fixture/src-app-before",
      mimeType: "text/typescript",
    },
  }),
  event({
    id: "evt_coding_patch_started",
    eventClass: "patch.started",
    kind: "tool",
    status: "running",
    sequence: 3,
    taskId,
    toolCallId: "patch_fixture_update_app",
    title: "Apply app patch",
    payload: {
      patchId: "patch_fixture_update_app",
      path: "src/App.tsx",
      operation: "apply",
    },
  }),
  event({
    id: "evt_coding_file_changed",
    eventClass: "file.changed",
    kind: "draft",
    owner: "artifact",
    status: "completed",
    sequence: 4,
    taskId,
    toolCallId: "patch_fixture_update_app",
    artifactId: "artifact_src_app_after",
    artifactRefs: ["artifact_src_app_after"],
    title: "Updated app source",
    payload: {
      path: "src/App.tsx",
      operation: "write",
      changeKind: "modified",
      checkpointId: "checkpoint_fixture_1",
      checkpointRef: "checkpoint://fixture/1",
      diffRef: "artifact://fixture/src-app-diff",
      preview: "Render coding workbench status from runtime facts.",
    },
  }),
  event({
    id: "evt_coding_patch_applied",
    eventClass: "patch.applied",
    kind: "tool",
    status: "completed",
    sequence: 5,
    taskId,
    toolCallId: "patch_fixture_update_app",
    artifactRefs: ["artifact_src_app_after"],
    title: "Patch applied",
    payload: {
      patchId: "patch_fixture_update_app",
      path: "src/App.tsx",
      changedFileCount: 1,
      diffRef: "artifact://fixture/src-app-diff",
    },
  }),
  event({
    id: "evt_coding_command_started",
    eventClass: "command.started",
    kind: "tool",
    status: "running",
    sequence: 6,
    taskId,
    toolCallId: "command_fixture_test",
    title: "Run tests",
    payload: {
      commandId: "command_fixture_test",
      command: "npm test",
      cwd: ".",
    },
  }),
  event({
    id: "evt_coding_command_output",
    eventClass: "command.output",
    kind: "tool",
    status: "running",
    sequence: 7,
    taskId,
    toolCallId: "command_fixture_test",
    title: "Test output",
    refIds: ["output_fixture_test_log"],
    payload: {
      commandId: "command_fixture_test",
      stream: "stdout",
      outputRef: "output_fixture_test_log",
      preview: "1 test passed",
    },
  }),
  event({
    id: "evt_coding_command_exited",
    eventClass: "command.exited",
    kind: "tool",
    status: "completed",
    sequence: 8,
    taskId,
    toolCallId: "command_fixture_test",
    title: "Tests exited",
    refIds: ["output_fixture_test_log"],
    payload: {
      commandId: "command_fixture_test",
      exitCode: 0,
      outputRef: "output_fixture_test_log",
    },
  }),
  event({
    id: "evt_coding_test_started",
    eventClass: "test.started",
    kind: "tool",
    status: "running",
    sequence: 9,
    taskId,
    toolCallId: "test_fixture_unit",
    title: "Unit tests started",
    payload: {
      testRunId: "test_fixture_unit",
      commandId: "command_fixture_test",
      suite: "unit",
    },
  }),
  event({
    id: "evt_coding_test_completed",
    eventClass: "test.completed",
    kind: "tool",
    status: "completed",
    sequence: 10,
    taskId,
    toolCallId: "test_fixture_unit",
    title: "Unit tests passed",
    refIds: ["output_fixture_test_log"],
    payload: {
      testRunId: "test_fixture_unit",
      commandId: "command_fixture_test",
      result: "passed",
      passed: 1,
      failed: 0,
      outputRef: "output_fixture_test_log",
    },
  }),
  event({
    id: "evt_coding_turn_completed",
    eventClass: "turn.completed",
    kind: "state",
    status: "completed",
    sequence: 11,
    taskId,
    title: "Coding turn completed",
    completedAt: createdAt,
  }),
];

const codingPatchFailureEvents = [
  event({
    id: "evt_patch_failure_started",
    eventClass: "patch.started",
    kind: "tool",
    status: "running",
    sequence: 1,
    taskId,
    toolCallId: "patch_fixture_conflict",
    title: "Apply conflicting patch",
    payload: {
      patchId: "patch_fixture_conflict",
      path: "src/App.tsx",
    },
  }),
  event({
    id: "evt_patch_failure_failed",
    eventClass: "patch.failed",
    kind: "tool",
    status: "failed",
    sequence: 2,
    taskId,
    toolCallId: "patch_fixture_conflict",
    title: "Patch failed",
    refIds: ["output_patch_conflict"],
    payload: {
      patchId: "patch_fixture_conflict",
      path: "src/App.tsx",
      failureCategory: "conflict",
      recoveryHintRef: "evidence://fixture/patch-conflict-hint",
      outputRef: "output_patch_conflict",
    },
  }),
  event({
    id: "evt_patch_failure_test_started",
    eventClass: "test.started",
    kind: "tool",
    status: "running",
    sequence: 3,
    taskId,
    toolCallId: "test_fixture_failed",
    title: "Regression tests started",
    payload: {
      testRunId: "test_fixture_failed",
      commandId: "command_fixture_regression",
      suite: "regression",
    },
  }),
  event({
    id: "evt_patch_failure_test_completed",
    eventClass: "test.completed",
    kind: "tool",
    status: "failed",
    sequence: 4,
    taskId,
    toolCallId: "test_fixture_failed",
    title: "Regression tests failed",
    refIds: ["output_test_failure"],
    payload: {
      testRunId: "test_fixture_failed",
      commandId: "command_fixture_regression",
      result: "failed",
      passed: 4,
      failed: 1,
      failureCategory: "assertion_failed",
      outputRef: "output_test_failure",
    },
  }),
  event({
    id: "evt_patch_failure_sandbox_blocked",
    eventClass: "sandbox.blocked",
    kind: "sandbox",
    status: "blocked",
    sequence: 5,
    taskId,
    title: "Sandbox blocked command",
    payload: {
      reasonCode: "network_disabled",
      recoveryHintRef: "evidence://fixture/sandbox-network-hint",
      commandId: "command_fixture_install",
    },
  }),
  event({
    id: "evt_patch_failure_turn_failed",
    eventClass: "turn.failed",
    kind: "state",
    status: "failed",
    sequence: 6,
    taskId,
    title: "Coding turn failed",
    payload: {
      failureCategory: "requires_user_action",
    },
  }),
];

const codingCommandApprovalEvents = [
  event({
    id: "evt_command_approval_required",
    eventClass: "action.required",
    kind: "action",
    status: "blocked",
    sequence: 1,
    taskId,
    actionId: "action_command_approval",
    title: "Command approval required",
    payload: {
      actionKind: "approve-command",
      targetModule: "coding-workbench",
      commandId: "command_fixture_lint",
      command: "npm run lint",
      controls: ["approve", "reject"],
    },
  }),
  event({
    id: "evt_command_approval_resolved",
    eventClass: "action.resolved",
    kind: "action",
    status: "completed",
    sequence: 2,
    taskId,
    actionId: "action_command_approval",
    title: "Command approval granted",
    payload: {
      decision: "approve",
      commandId: "command_fixture_lint",
    },
  }),
  event({
    id: "evt_command_approval_started",
    eventClass: "command.started",
    kind: "tool",
    status: "running",
    sequence: 3,
    taskId,
    toolCallId: "command_fixture_lint",
    title: "Lint started",
    payload: {
      commandId: "command_fixture_lint",
      command: "npm run lint",
      cwd: ".",
    },
  }),
  event({
    id: "evt_command_approval_exited",
    eventClass: "command.exited",
    kind: "tool",
    status: "completed",
    sequence: 4,
    taskId,
    toolCallId: "command_fixture_lint",
    title: "Lint completed",
    refIds: ["output_lint_approval"],
    payload: {
      commandId: "command_fixture_lint",
      exitCode: 0,
      outputRef: "output_lint_approval",
    },
  }),
  event({
    id: "evt_command_approval_turn_completed",
    eventClass: "turn.completed",
    kind: "state",
    status: "completed",
    sequence: 5,
    taskId,
    title: "Coding turn completed",
  }),
];

const codingSandboxBlockedEvents = [
  event({
    id: "evt_sandbox_blocked",
    eventClass: "sandbox.blocked",
    kind: "sandbox",
    status: "blocked",
    sequence: 1,
    taskId,
    title: "Network command blocked",
    payload: {
      reasonCode: "network_disabled",
      commandId: "command_fixture_install",
      recoveryHintRef: "evidence://fixture/network-disabled-hint",
    },
  }),
  event({
    id: "evt_sandbox_action_required",
    eventClass: "action.required",
    kind: "action",
    status: "blocked",
    sequence: 2,
    taskId,
    actionId: "action_sandbox_recovery",
    title: "Sandbox recovery required",
    payload: {
      actionKind: "acknowledge-sandbox-block",
      targetModule: "coding-workbench",
      controls: ["acknowledge"],
      reasonCode: "network_disabled",
    },
  }),
];

const codingTestFailureFixEvents = [
  event({
    id: "evt_test_fix_command_started",
    eventClass: "command.started",
    kind: "tool",
    status: "running",
    sequence: 1,
    taskId,
    toolCallId: "command_fixture_test_fix",
    title: "Run failing tests",
    payload: {
      commandId: "command_fixture_test_fix",
      command: "npm test",
      cwd: ".",
    },
  }),
  event({
    id: "evt_test_fix_command_exited_failed",
    eventClass: "command.exited",
    kind: "tool",
    status: "failed",
    sequence: 2,
    taskId,
    toolCallId: "command_fixture_test_fix",
    title: "Tests exited with failure",
    refIds: ["output_test_fix_failed"],
    payload: {
      commandId: "command_fixture_test_fix",
      exitCode: 1,
      outputRef: "output_test_fix_failed",
    },
  }),
  event({
    id: "evt_test_fix_started_failed",
    eventClass: "test.started",
    kind: "tool",
    status: "running",
    sequence: 3,
    taskId,
    toolCallId: "test_fixture_fix",
    title: "Unit tests started",
    payload: {
      testRunId: "test_fixture_fix",
      commandId: "command_fixture_test_fix",
      suite: "unit",
    },
  }),
  event({
    id: "evt_test_fix_completed_failed",
    eventClass: "test.completed",
    kind: "tool",
    status: "failed",
    sequence: 4,
    taskId,
    toolCallId: "test_fixture_fix",
    title: "Unit tests failed",
    refIds: ["output_test_fix_failed"],
    payload: {
      testRunId: "test_fixture_fix",
      commandId: "command_fixture_test_fix",
      result: "failed",
      passed: 8,
      failed: 1,
      failureCategory: "assertion_failed",
      outputRef: "output_test_fix_failed",
    },
  }),
  event({
    id: "evt_test_fix_patch_started",
    eventClass: "patch.started",
    kind: "tool",
    status: "running",
    sequence: 5,
    taskId,
    toolCallId: "patch_fixture_test_fix",
    title: "Patch failing assertion",
    payload: {
      patchId: "patch_fixture_test_fix",
      path: "src/App.test.tsx",
    },
  }),
  event({
    id: "evt_test_fix_file_changed",
    eventClass: "file.changed",
    kind: "draft",
    owner: "artifact",
    status: "completed",
    sequence: 6,
    taskId,
    toolCallId: "patch_fixture_test_fix",
    artifactId: "artifact_test_fix",
    artifactRefs: ["artifact_test_fix"],
    title: "Updated test fixture",
    payload: {
      path: "src/App.test.tsx",
      changeKind: "modified",
      checkpointRef: "checkpoint://fixture/test-fix",
      diffRef: "artifact://fixture/test-fix-diff",
      preview: "Assert coding projection from runtime events.",
    },
  }),
  event({
    id: "evt_test_fix_patch_applied",
    eventClass: "patch.applied",
    kind: "tool",
    status: "completed",
    sequence: 7,
    taskId,
    toolCallId: "patch_fixture_test_fix",
    artifactRefs: ["artifact_test_fix"],
    title: "Patch applied",
    payload: {
      patchId: "patch_fixture_test_fix",
      path: "src/App.test.tsx",
      diffRef: "artifact://fixture/test-fix-diff",
    },
  }),
  event({
    id: "evt_test_fix_rerun_started",
    eventClass: "command.started",
    kind: "tool",
    status: "running",
    sequence: 8,
    taskId,
    toolCallId: "command_fixture_test_rerun",
    title: "Rerun tests",
    payload: {
      commandId: "command_fixture_test_rerun",
      command: "npm test",
      cwd: ".",
    },
  }),
  event({
    id: "evt_test_fix_rerun_exited",
    eventClass: "command.exited",
    kind: "tool",
    status: "completed",
    sequence: 9,
    taskId,
    toolCallId: "command_fixture_test_rerun",
    title: "Rerun tests passed",
    refIds: ["output_test_fix_passed"],
    payload: {
      commandId: "command_fixture_test_rerun",
      exitCode: 0,
      outputRef: "output_test_fix_passed",
    },
  }),
  event({
    id: "evt_test_fix_rerun_test_started",
    eventClass: "test.started",
    kind: "tool",
    status: "running",
    sequence: 10,
    taskId,
    toolCallId: "test_fixture_fix",
    title: "Unit tests rerun started",
    payload: {
      testRunId: "test_fixture_fix",
      commandId: "command_fixture_test_rerun",
      suite: "unit",
    },
  }),
  event({
    id: "evt_test_fix_completed_passed",
    eventClass: "test.completed",
    kind: "tool",
    status: "completed",
    sequence: 11,
    taskId,
    toolCallId: "test_fixture_fix",
    title: "Unit tests passed",
    refIds: ["output_test_fix_passed"],
    payload: {
      testRunId: "test_fixture_fix",
      commandId: "command_fixture_test_rerun",
      result: "passed",
      passed: 9,
      failed: 0,
      outputRef: "output_test_fix_passed",
    },
  }),
  event({
    id: "evt_test_fix_turn_completed",
    eventClass: "turn.completed",
    kind: "state",
    status: "completed",
    sequence: 12,
    taskId,
    title: "Coding turn completed after fix",
  }),
];

const codingHydrationRepairEvents = [
  event({
    id: "evt_hydration_file_changed",
    eventClass: "file.changed",
    kind: "draft",
    owner: "artifact",
    status: "completed",
    sequence: 1,
    taskId,
    artifactId: "artifact_hydration_file",
    artifactRefs: ["artifact_hydration_file"],
    title: "Recovered file change",
    payload: {
      path: "src/recovered.ts",
      changeKind: "modified",
      checkpointRef: "checkpoint://fixture/recovered",
      diffRef: "artifact://fixture/recovered-diff",
    },
  }),
  event({
    id: "evt_hydration_snapshot",
    eventClass: "snapshot.updated",
    kind: "state",
    status: "completed",
    sequence: 3,
    taskId,
    title: "Coding snapshot repaired",
    payload: {
      repairReason: "sequence_gap",
    },
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
      artifactRefs: ["artifact_fixture_research_notes"],
      evidenceRefs: ["evidence_fixture_review"],
      taskRefs: [taskId, "subagent_fixture_researcher"],
    }),
    expected: {
      status: "completed",
      graphNodeCount: 2,
      artifactCount: 1,
      evidenceCount: 1,
      subagents: {
        hasSubagents: true,
        threadCount: 1,
        delegationCallCount: 2,
        activityCount: 10,
        activeThreadCount: 0,
        completedThreadCount: 1,
        failedThreadCount: 0,
      },
    },
  },
  {
    id: "coding-file-change",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Coding file change with patch, command and test facts",
    events: codingFileChangeEvents,
    finalReadModel: readModel(codingFileChangeEvents, {
      artifactRefs: ["artifact_src_app", "artifact_src_app_after"],
      taskRefs: [taskId],
    }),
    expected: {
      status: "completed",
      timelineEntryCount: 11,
      artifactCount: 2,
      coding: {
        fileCount: 1,
        changeCount: 1,
        patchCount: 1,
        commandCount: 1,
        testCount: 1,
        blockedCount: 0,
        failedPatchCount: 0,
        failedTestCount: 0,
      },
    },
  },
  {
    id: "coding-command-approval",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Coding command approval gates command execution",
    events: codingCommandApprovalEvents,
    initialReadModel: readModel(codingCommandApprovalEvents.slice(0, 1), {
      pendingActions: [projection(codingCommandApprovalEvents[0])],
    }),
    finalReadModel: readModel(codingCommandApprovalEvents),
    expected: {
      status: "completed",
      pendingActionCount: 0,
      coding: {
        commandCount: 1,
      },
    },
  },
  {
    id: "coding-sandbox-blocked",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Coding sandbox block exposes recovery action",
    events: codingSandboxBlockedEvents,
    finalReadModel: readModel(codingSandboxBlockedEvents, {
      pendingActions: [projection(codingSandboxBlockedEvents[1])],
    }),
    expected: {
      status: "blocked",
      pendingActionCount: 1,
      coding: {
        blockedCount: 1,
      },
    },
  },
  {
    id: "coding-patch-failure",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Coding patch failure, failed test and sandbox block facts",
    events: codingPatchFailureEvents,
    finalReadModel: readModel(codingPatchFailureEvents),
    expected: {
      status: "failed",
      timelineEntryCount: 6,
      coding: {
        patchCount: 1,
        testCount: 1,
        blockedCount: 1,
        failedPatchCount: 1,
        failedTestCount: 1,
      },
      diagnostics: ["patch.failed", "test.completed", "sandbox.blocked"],
    },
  },
  {
    id: "coding-test-failure-fix",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Coding failed test is fixed by a later patch and rerun",
    events: codingTestFailureFixEvents,
    finalReadModel: readModel(codingTestFailureFixEvents, {
      artifactRefs: ["artifact_test_fix"],
    }),
    expected: {
      status: "completed",
      artifactCount: 1,
      coding: {
        changeCount: 1,
        patchCount: 1,
        commandCount: 2,
        testCount: 1,
        failedTestCount: 0,
      },
      diagnostics: ["command.exited", "test.completed"],
    },
  },
  {
    id: "coding-hydration-repair",
    schemaVersion: AGENT_UI_FIXTURE_SCHEMA_VERSION,
    title: "Coding read model repairs a sequence gap from snapshot",
    events: codingHydrationRepairEvents,
    finalReadModel: readModel(codingHydrationRepairEvents, {
      artifactRefs: ["artifact_hydration_file"],
    }),
    expected: {
      status: "completed",
      artifactCount: 1,
      coding: {
        changeCount: 1,
      },
      diagnostics: ["sequence_gap"],
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
