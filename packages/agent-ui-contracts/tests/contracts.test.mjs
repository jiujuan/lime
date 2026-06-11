import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  AgentUiContractValidationError,
  agentUiConformanceFixtures,
  collectAgentUiFixtureValidationIssues,
  collectProjectionStateValidationIssues,
  collectRuntimeEventValidationIssues,
  getAgentUiFixture,
  validateAgentUiFixture,
  validateProjectionState,
  validateRuntimeEvent,
} from "../dist/index.js";

test("agent ui contracts package exports runtime-free validation and fixtures", () => {
  assert.equal(typeof validateRuntimeEvent, "function");
  assert.equal(typeof validateAgentUiFixture, "function");
  assert.equal(typeof getAgentUiFixture, "function");
  assert.equal(Array.isArray(agentUiConformanceFixtures), true);
});

test("agent ui contracts publish adapter and runtime type declarations", async () => {
  const declarations = await import("../dist/index.js");

  assert.deepEqual(Object.keys(declarations).sort(), [
    "AGENT_UI_FIXTURE_SCHEMA_VERSION",
    "AgentUiContractValidationError",
    "agentUiConformanceFixtures",
    "collectAgentUiFixtureValidationIssues",
    "collectProjectionStateValidationIssues",
    "collectRuntimeEventValidationIssues",
    "collectThreadReadModelValidationIssues",
    "getAgentUiFixture",
    "validateAgentUiFixture",
    "validateProjectionState",
    "validateRuntimeEvent",
    "validateThreadReadModel",
  ]);

  const indexDeclarations = await readDeclaration("index");
  assert.equal(
    indexDeclarations,
    [
      'export type * from "./events";',
      'export * from "./fixtures.js";',
      'export type * from "./graph";',
      'export type * from "./messages";',
      'export type * from "./projection";',
      'export type * from "./runtime";',
      'export type * from "./timeline";',
      'export * from "./validation.js";',
      "",
    ].join("\n"),
  );

  const typeDeclarations = [
    await readDeclaration("events"),
    await readDeclaration("fixtures"),
    await readDeclaration("runtime"),
    await readDeclaration("projection"),
    await readDeclaration("messages"),
    await readDeclaration("timeline"),
    await readDeclaration("graph"),
    await readDeclaration("validation"),
  ].join("\n");

  assert.match(typeDeclarations, /export type AgentUiEventClass/);
  assert.match(typeDeclarations, /export interface AgentUiProjectionEvent/);
  assert.match(typeDeclarations, /export interface AgentRuntimeExecutionEvent/);
  assert.match(typeDeclarations, /subagentId\?: string/);
  assert.match(typeDeclarations, /handoffId\?: string/);
  assert.match(typeDeclarations, /reviewId\?: string/);
  assert.match(typeDeclarations, /export type AgentUiArtifactRefView/);
  assert.match(typeDeclarations, /export type AgentUiEvidenceRefView/);
  assert.match(typeDeclarations, /export interface AgentUiSubagentsModel/);
  assert.match(typeDeclarations, /export interface AgentUiProjectionState/);
  assert.match(typeDeclarations, /artifacts: AgentUiArtifactRefView\[\]/);
  assert.match(typeDeclarations, /evidence: AgentUiEvidenceRefView\[\]/);
  assert.match(typeDeclarations, /subagents: AgentUiSubagentsModel/);
  assert.match(typeDeclarations, /actions\?: AgentRuntimeActionProjection\[\]/);
  assert.match(typeDeclarations, /export interface AgentUiFixture/);
  assert.match(typeDeclarations, /export declare function validateRuntimeEvent/);
});

test("projection state validation requires Subagents model", () => {
  const projectionState = {
    runtime: { status: "idle" },
    messages: [],
    timeline: [],
    graph: [],
    tools: [],
    actions: [],
    artifacts: [],
    evidence: [],
    diagnostics: [],
    subagents: {
      hasSubagents: false,
      threads: [],
      delegationCalls: [],
      activities: [],
      activeThreadIds: [],
      completedThreadIds: [],
      failedThreadIds: [],
    },
    readModel: {
      events: [],
      visibleEvents: [],
      pendingActions: [],
      inputSourceRecovery: false,
      sourceCount: 0,
      artifactRefs: [],
      evidenceRefs: [],
      taskRefs: [],
    },
    hydration: { status: "idle", eventCount: 0 },
    ephemeralUi: {},
  };

  assert.equal(validateProjectionState(projectionState), projectionState);

  const withoutSubagents = { ...projectionState };
  delete withoutSubagents.subagents;
  assert.deepEqual(
    collectProjectionStateValidationIssues(withoutSubagents).map(
      (issue) => issue.path,
    ),
    ["$.subagents"],
  );

  const withIncompleteSubagents = {
    ...projectionState,
    subagents: {
      hasSubagents: false,
      threads: [],
    },
  };
  assert.deepEqual(
    collectProjectionStateValidationIssues(withIncompleteSubagents).map(
      (issue) => issue.path,
    ),
    [
      "$.subagents.delegationCalls",
      "$.subagents.activities",
      "$.subagents.activeThreadIds",
      "$.subagents.completedThreadIds",
      "$.subagents.failedThreadIds",
    ],
  );
});

test("projection state validation checks structured artifact and evidence refs", () => {
  const projectionState = {
    runtime: { status: "completed" },
    messages: [],
    timeline: [],
    graph: [],
    tools: [],
    actions: [],
    artifacts: [
      {
        id: "prompt-draft:1",
        sourceEventId: "evt-artifact",
        title: "Prompt draft",
        status: "completed",
        owner: "artifact",
        path: "drafts/prompt.md",
        contentRef: "content://prompt-draft/1",
        mimeType: "text/markdown",
        preview: "可编辑草稿",
        metadata: { draftId: "1" },
      },
    ],
    evidence: [
      {
        id: "input-source:1",
        sourceEventId: "evt-evidence",
        title: "Input source",
        status: "completed",
        owner: "evidence",
        path: "evidence/input-source-1",
        mimeType: "application/json",
        preview: "证据摘要",
        metadata: { sourceId: "1" },
      },
    ],
    diagnostics: [],
    subagents: {
      hasSubagents: false,
      threads: [],
      delegationCalls: [],
      activities: [],
      activeThreadIds: [],
      completedThreadIds: [],
      failedThreadIds: [],
    },
    readModel: {
      events: [],
      visibleEvents: [],
      pendingActions: [],
      inputSourceRecovery: false,
      sourceCount: 0,
      artifactRefs: ["prompt-draft:1"],
      evidenceRefs: ["input-source:1"],
      taskRefs: [],
    },
    hydration: { status: "live", eventCount: 2 },
    ephemeralUi: {},
  };

  assert.equal(validateProjectionState(projectionState), projectionState);

  const invalid = {
    ...projectionState,
    artifacts: [
      { id: "prompt-draft:1" },
      {
        id: "prompt-draft:2",
        sourceEventId: "evt-artifact-2",
        preview: "x".repeat(513),
      },
    ],
    evidence: [
      {
        id: "input-source:1",
        sourceEventId: "evt-evidence",
        metadata: { token: "secret" },
      },
    ],
  };

  assert.deepEqual(
    collectProjectionStateValidationIssues(invalid).map((issue) => [
      issue.code,
      issue.path,
    ]),
    [
      ["schema_mismatch", "$.artifacts[0].sourceEventId"],
      ["large_payload_inline", "$.artifacts[1].preview"],
      ["secret_leak_risk", "$.evidence[0].metadata.token"],
    ],
  );
});

test("agent ui conformance fixtures cover the standard runtime slices", () => {
  assert.deepEqual(
    agentUiConformanceFixtures.map((fixture) => fixture.id),
    [
      "text-basic",
      "tool-success",
      "tool-failure",
      "hitl-action",
      "artifact-evidence",
      "stream-repair",
      "subagent-handoff",
    ],
  );

  for (const fixture of agentUiConformanceFixtures) {
    assert.equal(collectAgentUiFixtureValidationIssues(fixture).length, 0);
    assert.equal(validateAgentUiFixture(fixture), fixture);
  }

  const handoff = getAgentUiFixture("subagent-handoff");
  assert.deepEqual(handoff.expected.subagents, {
    hasSubagents: true,
    threadCount: 1,
    delegationCallCount: 2,
    activityCount: 4,
    activeThreadCount: 0,
    completedThreadCount: 1,
    failedThreadCount: 0,
  });
  assert.ok(
    handoff.events.some((event) => event.eventClass === "subagent.started"),
  );
  assert.ok(
    handoff.events.some((event) => event.eventClass === "handoff.requested"),
  );
  assert.ok(handoff.events.some((event) => event.eventClass === "review.verdict"));
});

test("fixture validation checks Subagents expectation shape", () => {
  const fixture = {
    ...getAgentUiFixture("subagent-handoff"),
    expected: {
      status: "completed",
      subagents: {
        hasSubagents: "yes",
        threadCount: "1",
      },
    },
  };

  assert.deepEqual(
    collectAgentUiFixtureValidationIssues(fixture).map((issue) => issue.path),
    [
      "$.expected.subagents.hasSubagents",
      "$.expected.subagents.threadCount",
    ],
  );
});

test("runtime event validation enforces scope ids and payload safety", () => {
  const validToolEvent = {
    id: "evt_tool",
    schemaVersion: "lime-runtime-event/v0.1",
    runtimeId: "runtime",
    threadId: "thread",
    turnId: "turn",
    sequence: 1,
    kind: "tool",
    status: "running",
    eventClass: "tool.started",
    toolCallId: "tool_1",
    title: "Tool started",
    createdAt: "2026-06-10T00:00:00.000Z",
  };

  assert.equal(validateRuntimeEvent(validToolEvent), validToolEvent);

  assert.deepEqual(
    collectRuntimeEventValidationIssues({
      ...validToolEvent,
      toolCallId: undefined,
    }).map((issue) => issue.code),
    ["missing_scope_id"],
  );

  assert.deepEqual(
    collectRuntimeEventValidationIssues({
      ...validToolEvent,
      payload: { apiKey: "secret" },
    }).map((issue) => issue.code),
    ["secret_leak_risk"],
  );

  assert.deepEqual(
    collectRuntimeEventValidationIssues({
      ...validToolEvent,
      payload: { text: "x".repeat(33_000) },
    }).map((issue) => issue.code),
    ["large_payload_inline"],
  );
});

test("fixture validation reports sequence gaps unless the fixture declares repair", () => {
  const base = getAgentUiFixture("text-basic");
  const broken = {
    ...base,
    events: base.events.map((event, index) =>
      index === 2 ? { ...event, sequence: 8 } : event,
    ),
  };

  assert.deepEqual(
    collectAgentUiFixtureValidationIssues(broken)
      .map((issue) => issue.code)
      .filter((code) => code === "sequence_gap"),
    ["sequence_gap", "sequence_gap"],
  );

  assert.throws(
    () => validateAgentUiFixture(broken),
    AgentUiContractValidationError,
  );

  assert.equal(
    collectAgentUiFixtureValidationIssues(getAgentUiFixture("stream-repair"))
      .length,
    0,
  );
});

async function readDeclaration(name) {
  return fs.readFile(new URL(`../dist/${name}.d.ts`, import.meta.url), "utf8");
}
