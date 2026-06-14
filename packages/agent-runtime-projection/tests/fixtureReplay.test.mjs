import assert from "node:assert/strict";
import test from "node:test";

import {
  agentUiConformanceFixtures,
  getAgentUiFixture,
} from "../../agent-ui-contracts/dist/index.js";
import {
  createAgentUiProjector,
  projectCodingWorkbenchView,
  replayAgentUiFixture,
} from "../dist/index.js";

test("replayAgentUiFixture replays standard contract fixtures", () => {
  for (const fixture of agentUiConformanceFixtures) {
    const result = replayAgentUiFixture(fixture);
    assert.equal(result.validationIssues.length, 0, fixture.id);
    assert.equal(result.passed, true, fixture.id);
    assert.equal(result.state.hydration.eventCount, fixture.events.length);
    assert.equal(
      result.state.runtime.latestEventId,
      fixture.events.at(-1)?.id,
      fixture.id,
    );
  }
});

test("replayAgentUiFixture proves key projection surfaces", () => {
  const textState = replayAgentUiFixture(getAgentUiFixture("text-basic")).state;
  assert.ok(textState.messages.length >= 1);
  assert.ok(textState.messages.some((part) => part.text === "你好，Lime。"));
  assert.equal(
    replayAgentUiFixture(getAgentUiFixture("tool-success")).state.tools.length,
    2,
  );
  assert.equal(
    replayAgentUiFixture(getAgentUiFixture("hitl-action")).state.actions.length,
    2,
  );
  assert.deepEqual(
    replayAgentUiFixture(getAgentUiFixture("artifact-evidence")).state.artifacts
      .map((artifact) => artifact.id),
    ["artifact_fixture_1"],
  );
  assert.deepEqual(
    replayAgentUiFixture(getAgentUiFixture("artifact-evidence")).state.evidence
      .map((evidence) => evidence.id),
    ["evidence_fixture_1"],
  );

  const handoffState = replayAgentUiFixture(getAgentUiFixture("subagent-handoff")).state;
  assert.equal(handoffState.subagents.hasSubagents, true);
  assert.deepEqual(
    handoffState.subagents.threads.map((thread) => thread.threadId),
    ["subagent_fixture_researcher"],
  );
  assert.equal(handoffState.subagents.threads[0].status, "completed");
  assert.deepEqual(
    handoffState.subagents.delegationCalls.map((delegation) => delegation.action),
    ["spawn", "handoff"],
  );
  assert.deepEqual(
    handoffState.subagents.activities.map((activity) => activity.kind),
    [
      "started",
      "interacted",
      "interacted",
      "started",
      "interacted",
      "interacted",
      "handoff",
      "review",
      "completed",
      "completed",
    ],
  );
  assert.deepEqual(handoffState.artifacts.map((artifact) => artifact.id), [
    "artifact_fixture_research_notes",
  ]);
  assert.deepEqual(
    handoffState.subagents.threads[0].artifactRefs,
    ["artifact_fixture_research_notes"],
  );
  assert.deepEqual(handoffState.subagents.threads[0].evidenceRefs, [
    "evidence_fixture_review",
  ]);
  assert.equal(
    handoffState.subagents.threads[0].summary,
    "Research notes and review evidence are ready.",
  );
});

test("subagent thread status follows lifecycle facts instead of scoped activity events", () => {
  const fixture = getAgentUiFixture("subagent-handoff");
  const afterToolResult = replayAgentUiFixture({
    ...fixture,
    events: fixture.events.slice(0, 6),
    expected: {
      ...fixture.expected,
      subagents: undefined,
    },
  }).state;
  const afterHandoffRequest = replayAgentUiFixture({
    ...fixture,
    events: fixture.events.slice(0, 8),
    expected: {
      ...fixture.expected,
      subagents: undefined,
    },
  }).state;

  assert.equal(afterToolResult.subagents.threads[0].status, "running");
  assert.equal(afterHandoffRequest.subagents.threads[0].status, "blocked");
});

test("coding fixtures project file, patch, command, test, action and block facts", () => {
  const fileChange = projectCodingWorkbenchView(
    replayAgentUiFixture(getAgentUiFixture("coding-file-change")).state,
  );
  assert.equal(fileChange.mainObject.status, "completed");
  assert.deepEqual(fileChange.files.map((file) => file.path), ["src/App.tsx"]);
  assert.deepEqual(fileChange.changes.map((change) => change.path), [
    "src/App.tsx",
  ]);
  assert.deepEqual(fileChange.patches.map((patch) => patch.status), [
    "completed",
  ]);
  assert.deepEqual(fileChange.commands.map((command) => command.exitCode), [0]);
  assert.deepEqual(fileChange.tests.map((run) => run.result), ["passed"]);

  const approval = projectCodingWorkbenchView(
    replayAgentUiFixture(getAgentUiFixture("coding-command-approval")).state,
  );
  assert.equal(approval.mainObject.status, "completed");
  assert.deepEqual(approval.commands.map((command) => command.command), [
    "npm run lint",
  ]);
  assert.equal(approval.actions.length, 2);
  assert.equal(
    getAgentUiFixture("coding-command-approval").events.filter((event) =>
      event.eventClass?.startsWith("action."),
    ).length,
    2,
  );

  const sandbox = projectCodingWorkbenchView(
    replayAgentUiFixture(getAgentUiFixture("coding-sandbox-blocked")).state,
  );
  assert.equal(sandbox.mainObject.status, "blocked");
  assert.ok(
    sandbox.diagnostics.some((diagnostic) => diagnostic.status === "blocked"),
  );
  assert.equal(sandbox.actions.length, 1);

  const patchFailure = projectCodingWorkbenchView(
    replayAgentUiFixture(getAgentUiFixture("coding-patch-failure")).state,
  );
  assert.equal(patchFailure.mainObject.status, "failed");
  assert.deepEqual(patchFailure.patches.map((patch) => patch.failureCategory), [
    "conflict",
  ]);
  assert.deepEqual(patchFailure.tests.map((run) => run.failureCategory), [
    "assertion_failed",
  ]);

  const fixed = projectCodingWorkbenchView(
    replayAgentUiFixture(getAgentUiFixture("coding-test-failure-fix")).state,
  );
  assert.equal(fixed.mainObject.status, "completed");
  assert.deepEqual(fixed.tests.map((run) => run.status), ["completed"]);
  assert.equal(fixed.commands.length, 2);

  const repaired = projectCodingWorkbenchView(
    replayAgentUiFixture(getAgentUiFixture("coding-hydration-repair")).state,
  );
  assert.equal(repaired.mainObject.status, "completed");
  assert.deepEqual(repaired.changes.map((change) => change.path), [
    "src/recovered.ts",
  ]);
});

test("replayAgentUiFixture fails closed on a malformed event stream", () => {
  const base = getAgentUiFixture("tool-success");
  // 删掉 tool.started，只留 tool.result，制造一条孤立的收口事件（坏流）。
  const broken = {
    ...base,
    events: base.events.filter(
      (event) => event.eventClass !== "tool.started",
    ),
  };

  const result = replayAgentUiFixture(broken);
  assert.equal(result.failedClosed, true);
  assert.equal(result.passed, false);
  assert.deepEqual(
    result.sequenceViolations.map((violation) => violation.code),
    ["tool_result_without_start"],
  );
  // fail closed：坏流不投影，state 退化为合法空 state。
  assert.equal(result.state.hydration.eventCount, 0);
  assert.equal(result.state.tools.length, 0);
  assert.equal(result.state.timeline.length, 0);
});

test("projector apply remains idempotent for fixture replay", () => {
  const fixture = getAgentUiFixture("subagent-handoff");
  const projector = createAgentUiProjector();

  for (const event of fixture.events) {
    projector.apply(event);
    projector.apply(event);
  }

  const state = projector.getState();
  assert.equal(state.hydration.eventCount, fixture.events.length);
  assert.ok(
    state.graph.some(
      (node) =>
        node.nodeId === "subagent_fixture_researcher"
        && node.nodeType === "subagent",
    ),
  );
  assert.ok(
    state.timeline.some((entry) => entry.sourceEventId === "evt_handoff_requested"),
  );
});
