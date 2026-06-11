import {
  collectAgentUiFixtureValidationIssues,
  type AgentUiContractValidationIssue,
  type AgentUiFixture,
  type AgentUiProjectionState,
  type AgentRuntimeExecutionEvent,
} from "@limecloud/agent-ui-contracts";
import { projectAgentUiState } from "./uiState.js";

export interface AgentUiFixtureReplayResult<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> {
  fixtureId: string;
  state: AgentUiProjectionState<TEvent>;
  validationIssues: AgentUiContractValidationIssue[];
  diagnostics: string[];
  passed: boolean;
}

export function replayAgentUiFixture<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
>(
  fixture: AgentUiFixture<TEvent>,
): AgentUiFixtureReplayResult<TEvent> {
  const validationIssues = collectAgentUiFixtureValidationIssues(fixture);
  const state = projectAgentUiState<TEvent>({
    executionEvents: fixture.events,
  });
  const diagnostics = collectReplayDiagnostics(fixture, state, validationIssues);

  return {
    fixtureId: fixture.id,
    state,
    validationIssues,
    diagnostics,
    passed: validationIssues.length === 0 && diagnostics.length === 0,
  };
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
  diagnostics.push(...collectSubagentsReplayDiagnostics(fixture, state));

  return diagnostics.filter(
    (diagnostic) => !(expected.diagnostics ?? []).includes(diagnostic),
  );
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
