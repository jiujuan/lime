import {
  collectAgentUiFixtureValidationIssues,
  verifyRuntimeEventSequence,
  type AgentUiContractValidationIssue,
  type AgentUiFixture,
  type AgentUiProjectionState,
  type AgentRuntimeExecutionEvent,
  type RuntimeSequenceViolation,
} from "@limecloud/agent-ui-contracts";
import { projectCodingWorkbenchView } from "./coding.js";
import { projectAgentUiState } from "./uiState.js";

export interface AgentUiFixtureReplayResult<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> {
  fixtureId: string;
  state: AgentUiProjectionState<TEvent>;
  validationIssues: AgentUiContractValidationIssue[];
  /** 流式 sequence verifier 报告的、未被 fixture 豁免的协议序列违规。 */
  sequenceViolations: RuntimeSequenceViolation[];
  diagnostics: string[];
  /**
   * 坏流是否被拦截：存在未豁免的 sequence violation 时为 true，
   * 此时不把坏流投影成 state（state 为合法空 state）。
   */
  failedClosed: boolean;
  passed: boolean;
}

export function replayAgentUiFixture<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
>(
  fixture: AgentUiFixture<TEvent>,
): AgentUiFixtureReplayResult<TEvent> {
  const validationIssues = collectAgentUiFixtureValidationIssues(fixture);
  const sequenceViolations = collectUnexpectedSequenceViolations(fixture);
  const failedClosed = sequenceViolations.length > 0;

  // fail closed：坏流不进入 projector，避免把违反协议的事件流投影成「看起来正常」的 state。
  const state = failedClosed
    ? projectAgentUiState<TEvent>()
    : projectAgentUiState<TEvent>({ executionEvents: fixture.events });

  const diagnostics = failedClosed
    ? sequenceViolations.map((violation) => violation.code)
    : collectReplayDiagnostics(fixture, state, validationIssues);

  return {
    fixtureId: fixture.id,
    state,
    validationIssues,
    sequenceViolations,
    failedClosed,
    diagnostics,
    passed:
      !failedClosed
      && validationIssues.length === 0
      && diagnostics.length === 0,
  };
}

/**
 * 跑 sequence verifier，过滤掉 fixture 在 `expected.diagnostics` 中显式声明（豁免）的 violation。
 *
 * 语义与 contracts 包 `collectSequenceViolationIssues` 一致：未声明的 violation 才算坏流。
 */
function collectUnexpectedSequenceViolations<
  TEvent extends AgentRuntimeExecutionEvent,
>(fixture: AgentUiFixture<TEvent>): RuntimeSequenceViolation[] {
  const violations = verifyRuntimeEventSequence(fixture.events);
  if (violations.length === 0) {
    return [];
  }
  const expectedDiagnostics = fixture.expected?.diagnostics ?? [];
  return violations.filter(
    (violation) => !expectedDiagnostics.includes(violation.code),
  );
}

function collectReplayDiagnostics<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  fixture: AgentUiFixture<TEvent>,
  state: AgentUiProjectionState<TEvent>,
  validationIssues: AgentUiContractValidationIssue[],
): string[] {
  const diagnostics: string[] = validationIssues.map((issue) => issue.code);
  const expected = fixture.expected;

  if (expected.messagePartCount !== undefined && state.messages.length < expected.messagePartCount) {
    diagnostics.push("message_parts_below_expected");
  }
  if (expected.timelineEntryCount !== undefined && state.timeline.length < expected.timelineEntryCount) {
    diagnostics.push("timeline_entries_below_expected");
  }
  if (expected.graphNodeCount !== undefined && state.graph.length < expected.graphNodeCount) {
    diagnostics.push("graph_nodes_below_expected");
  }
  if (expected.pendingActionCount !== undefined && state.readModel.pendingActions.length !== expected.pendingActionCount) {
    diagnostics.push("pending_actions_mismatch");
  }
  if (expected.artifactCount !== undefined && state.artifacts.length < expected.artifactCount) {
    diagnostics.push("artifacts_below_expected");
  }
  if (expected.evidenceCount !== undefined && state.evidence.length < expected.evidenceCount) {
    diagnostics.push("evidence_below_expected");
  }
  diagnostics.push(...collectCodingReplayDiagnostics(fixture, state));
  diagnostics.push(...collectSubagentsReplayDiagnostics(fixture, state));

  return diagnostics.filter(
    (diagnostic) => !(expected.diagnostics ?? []).includes(diagnostic),
  );
}

function collectCodingReplayDiagnostics<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  fixture: AgentUiFixture<TEvent>,
  state: AgentUiProjectionState<TEvent>,
): string[] {
  const expected = fixture.expected.coding;
  if (!expected) {
    return [];
  }

  const diagnostics: string[] = [];
  const model = projectCodingWorkbenchView(state);
  if (
    expected.fileCount !== undefined &&
    model.files.length < expected.fileCount
  ) {
    diagnostics.push("coding_files_below_expected");
  }
  if (
    expected.changeCount !== undefined &&
    model.changes.length < expected.changeCount
  ) {
    diagnostics.push("coding_changes_below_expected");
  }
  if (
    expected.patchCount !== undefined &&
    model.patches.length < expected.patchCount
  ) {
    diagnostics.push("coding_patches_below_expected");
  }
  if (
    expected.commandCount !== undefined &&
    model.commands.length < expected.commandCount
  ) {
    diagnostics.push("coding_commands_below_expected");
  }
  if (
    expected.testCount !== undefined &&
    model.tests.length < expected.testCount
  ) {
    diagnostics.push("coding_tests_below_expected");
  }
  if (
    expected.blockedCount !== undefined &&
    model.diagnostics.filter((diagnostic) => diagnostic.status === "blocked")
      .length !== expected.blockedCount
  ) {
    diagnostics.push("coding_blocked_count_mismatch");
  }
  if (
    expected.failedPatchCount !== undefined &&
    model.patches.filter((patch) => patch.status === "failed").length !==
      expected.failedPatchCount
  ) {
    diagnostics.push("coding_failed_patch_count_mismatch");
  }
  if (
    expected.failedTestCount !== undefined &&
    model.tests.filter((test) => test.status === "failed").length !==
      expected.failedTestCount
  ) {
    diagnostics.push("coding_failed_test_count_mismatch");
  }
  return diagnostics;
}

function collectSubagentsReplayDiagnostics<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  fixture: AgentUiFixture<TEvent>,
  state: AgentUiProjectionState<TEvent>,
): string[] {
  const expected = fixture.expected.subagents;
  if (!expected) {
    return [];
  }

  const diagnostics: string[] = [];
  const model = state.subagents;
  if (
    expected.hasSubagents !== undefined
    && model.hasSubagents !== expected.hasSubagents
  ) {
    diagnostics.push("subagents_surface_mismatch");
  }
  if (
    expected.threadCount !== undefined
    && model.threads.length < expected.threadCount
  ) {
    diagnostics.push("subagent_threads_below_expected");
  }
  if (
    expected.delegationCallCount !== undefined
    && model.delegationCalls.length < expected.delegationCallCount
  ) {
    diagnostics.push("subagent_delegation_calls_below_expected");
  }
  if (
    expected.activityCount !== undefined
    && model.activities.length < expected.activityCount
  ) {
    diagnostics.push("subagent_activities_below_expected");
  }
  if (
    expected.activeThreadCount !== undefined
    && model.activeThreadIds.length !== expected.activeThreadCount
  ) {
    diagnostics.push("subagent_active_threads_mismatch");
  }
  if (
    expected.completedThreadCount !== undefined
    && model.completedThreadIds.length !== expected.completedThreadCount
  ) {
    diagnostics.push("subagent_completed_threads_mismatch");
  }
  if (
    expected.failedThreadCount !== undefined
    && model.failedThreadIds.length !== expected.failedThreadCount
  ) {
    diagnostics.push("subagent_failed_threads_mismatch");
  }
  return diagnostics;
}
