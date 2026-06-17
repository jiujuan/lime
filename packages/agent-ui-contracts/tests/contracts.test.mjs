import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AgentUiContractValidationError,
  AGENT_RUNTIME_CAPABILITY_MANIFEST_SCHEMA,
  AGENT_RUNTIME_EVENT_SCHEMA,
  AGENT_RUNTIME_RESUME_CONTRACT_SCHEMA,
  AGENT_RUNTIME_STATE_DELTA_SCHEMA,
  AGENT_UI_PROJECTION_STATE_SCHEMA,
  agentUiConformanceFixtures,
  agentUiJsonSchemas,
  collectAgentUiFixtureValidationIssues,
  collectProjectionStateValidationIssues,
  collectRuntimeCapabilityManifestValidationIssues,
  collectRuntimeEventValidationIssues,
  collectRuntimeResumeContractValidationIssues,
  createRuntimeSequenceVerifier,
  getAgentUiFixture,
  isRuntimeSettledStatusValue,
  isRuntimeTerminalStatusValue,
  isRuntimeTurnTerminalEventClass,
  normalizeRuntimeTurnTerminalEventClass,
  runtimeStatusForTerminalEventClass,
  runtimeTurnTerminalProjectionFromStatus,
  validateAgentUiFixture,
  validateProjectionState,
  validateRuntimeCapabilityManifest,
  validateRuntimeEvent,
  validateRuntimeResumeContract,
  verifyRuntimeEventSequence,
} from "../dist/index.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("agent ui contracts package exports runtime-free validation and fixtures", () => {
  assert.equal(typeof validateRuntimeEvent, "function");
  assert.equal(typeof validateAgentUiFixture, "function");
  assert.equal(typeof getAgentUiFixture, "function");
  assert.equal(Array.isArray(agentUiConformanceFixtures), true);
});

test("agent ui contracts publish adapter and runtime type declarations", async () => {
  const declarations = await import("../dist/index.js");

  assert.deepEqual(
    Object.keys(declarations).sort(),
    [
      "AGENT_UI_FIXTURE_SCHEMA_VERSION",
      "AGENT_RUNTIME_CAPABILITY_MANIFEST_SCHEMA",
      "AGENT_RUNTIME_EVENT_SCHEMA",
      "AGENT_RUNTIME_RESUME_CONTRACT_SCHEMA",
      "AGENT_RUNTIME_STATE_DELTA_SCHEMA",
      "AGENT_UI_PROJECTION_STATE_SCHEMA",
      "AgentUiContractValidationError",
      "agentUiJsonSchemas",
      "agentUiConformanceFixtures",
      "collectAgentUiFixtureValidationIssues",
      "collectProjectionStateValidationIssues",
      "collectRuntimeCapabilityManifestValidationIssues",
      "collectRuntimeEventValidationIssues",
      "collectRuntimeResumeContractValidationIssues",
      "collectThreadReadModelValidationIssues",
      "createRuntimeSequenceVerifier",
      "getAgentUiFixture",
      "isRuntimeSettledStatusValue",
      "isRuntimeTerminalStatusValue",
      "isRuntimeTurnTerminalEventClass",
      "normalizeRuntimeStatusValue",
      "normalizeRuntimeTurnTerminalEventClass",
      "runtimeStatusForTerminalEventClass",
      "runtimeTurnTerminalKindFromStatus",
      "runtimeTurnTerminalProjectionFromKind",
      "runtimeTurnTerminalProjectionFromStatus",
      "validateAgentUiFixture",
      "validateProjectionState",
      "validateRuntimeCapabilityManifest",
      "validateRuntimeEvent",
      "validateRuntimeResumeContract",
      "validateThreadReadModel",
      "verifyRuntimeEventSequence",
    ].sort(),
  );

  const indexDeclarations = await readDeclaration("index");
    assert.equal(
      indexDeclarations,
      [
        'export type * from "./capabilities";',
        'export type * from "./events";',
        'export * from "./fixtures.js";',
        'export type * from "./graph";',
        'export type * from "./messages";',
        'export type * from "./projection";',
        'export type * from "./runtime";',
        'export * from "./runtimeTerminal.js";',
        'export * from "./schemas.js";',
        'export * from "./sequenceVerifier.js";',
        'export type * from "./timeline";',
        'export type * from "./tools";',
        'export * from "./validation.js";',
        "",
      ].join("\n"),
    );

  const typeDeclarations = [
    await readDeclaration("capabilities"),
    await readDeclaration("events"),
    await readDeclaration("fixtures"),
    await readDeclaration("runtime"),
    await readDeclaration("runtimeTerminal"),
    await readDeclaration("projection"),
    await readDeclaration("tools"),
    await readDeclaration("schemas"),
    await readDeclaration("messages"),
    await readDeclaration("timeline"),
    await readDeclaration("graph"),
    await readDeclaration("sequenceVerifier"),
    await readDeclaration("validation"),
  ].join("\n");

  assert.match(
    typeDeclarations,
    /export interface AgentRuntimeCapabilityManifest/,
  );
  assert.match(typeDeclarations, /export interface AgentRuntimeResumeContract/);
  assert.match(typeDeclarations, /export type AgentUiEventClass/);
  assert.match(typeDeclarations, /export interface AgentUiProjectionEvent/);
  assert.match(typeDeclarations, /export interface AgentRuntimeExecutionEvent/);
  assert.match(typeDeclarations, /export interface AgentRuntimeStateDelta/);
  assert.match(
    typeDeclarations,
    /export declare const AGENT_RUNTIME_EVENT_SCHEMA/,
  );
  assert.match(
    typeDeclarations,
    /export declare const AGENT_RUNTIME_CAPABILITY_MANIFEST_SCHEMA/,
  );
  assert.match(
    typeDeclarations,
    /export declare const AGENT_RUNTIME_RESUME_CONTRACT_SCHEMA/,
  );
  assert.match(
    typeDeclarations,
    /export declare const AGENT_RUNTIME_STATE_DELTA_SCHEMA/,
  );
  assert.match(typeDeclarations, /subagentId\?: string/);
  assert.match(typeDeclarations, /handoffId\?: string/);
  assert.match(typeDeclarations, /reviewId\?: string/);
  assert.match(typeDeclarations, /export type AgentUiArtifactRefView/);
  assert.match(typeDeclarations, /export type AgentUiEvidenceRefView/);
  assert.match(typeDeclarations, /export interface AgentUiSubagentsModel/);
  assert.match(typeDeclarations, /export interface AgentUiProjectionState/);
  assert.match(typeDeclarations, /export interface AgentUiToolCallView/);
  assert.match(typeDeclarations, /export interface AgentUiToolSurfaceModel/);
  assert.match(typeDeclarations, /export interface AgentUiMcpSurfaceModel/);
  assert.match(typeDeclarations, /artifacts: AgentUiArtifactRefView\[\]/);
  assert.match(typeDeclarations, /evidence: AgentUiEvidenceRefView\[\]/);
  assert.match(typeDeclarations, /subagents: AgentUiSubagentsModel/);
  assert.match(typeDeclarations, /toolCalls: AgentUiToolSurfaceModel/);
  assert.match(typeDeclarations, /mcp: AgentUiMcpSurfaceModel/);
  assert.match(typeDeclarations, /actions\?: AgentRuntimeActionProjection\[\]/);
  assert.match(typeDeclarations, /export interface AgentUiFixture/);
  assert.match(
    typeDeclarations,
    /export declare function validateRuntimeEvent/,
  );
  assert.match(
    typeDeclarations,
    /export declare function verifyRuntimeEventSequence/,
  );
  assert.match(
    typeDeclarations,
    /export declare function createRuntimeSequenceVerifier/,
  );
  assert.match(
    typeDeclarations,
    /export declare function normalizeRuntimeTurnTerminalEventClass/,
  );
  assert.match(typeDeclarations, /export interface RuntimeSequenceViolation/);
});

test("runtime terminal helpers expose the single current turn terminal contract", () => {
  assert.equal(
    normalizeRuntimeTurnTerminalEventClass("turn.completed"),
    "turn.completed",
  );
  assert.equal(
    normalizeRuntimeTurnTerminalEventClass("turn.failed"),
    "turn.failed",
  );
  assert.equal(
    normalizeRuntimeTurnTerminalEventClass("turn.canceled"),
    "turn.canceled",
  );
  assert.equal(normalizeRuntimeTurnTerminalEventClass("turn.final_done"), undefined);
  assert.equal(normalizeRuntimeTurnTerminalEventClass("turn.done"), undefined);
  assert.equal(normalizeRuntimeTurnTerminalEventClass("turn.cancelled"), undefined);
  assert.equal(isRuntimeTurnTerminalEventClass("turn.canceled"), true);
  assert.equal(isRuntimeTurnTerminalEventClass("turn.final_done"), false);
  assert.equal(runtimeStatusForTerminalEventClass("turn.completed"), "completed");
  assert.equal(runtimeStatusForTerminalEventClass("turn.failed"), "failed");
  assert.equal(runtimeStatusForTerminalEventClass("turn.canceled"), "canceled");
  assert.deepEqual(runtimeTurnTerminalProjectionFromStatus("canceled"), {
    kind: "canceled",
    eventClass: "turn.canceled",
    status: "canceled",
    phase: "canceled",
  });
  assert.equal(isRuntimeTerminalStatusValue("completed"), true);
  assert.equal(isRuntimeTerminalStatusValue("cancelled"), false);
  assert.equal(isRuntimeSettledStatusValue("idle"), true);
});

test("agent ui contracts expose JSON schemas for cross-language validation", () => {
  assert.equal(
    AGENT_RUNTIME_EVENT_SCHEMA.properties.schemaVersion.const,
    "lime-runtime-event/v0.1",
  );
  assert.deepEqual(AGENT_RUNTIME_EVENT_SCHEMA.not.properties.eventClass.enum, [
    "done",
    "final_done",
    "cancelled",
    "turn.done",
    "turn.final_done",
    "turn.cancelled",
  ]);
  assert.deepEqual(AGENT_RUNTIME_EVENT_SCHEMA.required, [
    "id",
    "schemaVersion",
    "runtimeId",
    "kind",
    "status",
    "sequence",
    "title",
    "createdAt",
  ]);
  assert.equal(
    AGENT_RUNTIME_STATE_DELTA_SCHEMA.properties.schemaVersion.const,
    "lime-runtime-state-delta/v0.1",
  );
  assert.deepEqual(
    AGENT_RUNTIME_STATE_DELTA_SCHEMA.properties.patch.items.oneOf.map(
      (item) => item.properties.op,
    ),
    [
      { enum: ["add", "replace", "test"] },
      { const: "remove" },
      { enum: ["move", "copy"] },
    ],
  );
  assert.ok(AGENT_UI_PROJECTION_STATE_SCHEMA.required.includes("subagents"));
  assert.equal(agentUiJsonSchemas.runtimeEvent, AGENT_RUNTIME_EVENT_SCHEMA);
  assert.equal(
    AGENT_RUNTIME_CAPABILITY_MANIFEST_SCHEMA.properties.schemaVersion.const,
    "lime-runtime-capability-manifest/v0.1",
  );
  assert.equal(
    AGENT_RUNTIME_RESUME_CONTRACT_SCHEMA.properties.schemaVersion.const,
    "lime-runtime-resume-contract/v0.1",
  );
  assert.equal(
    agentUiJsonSchemas.runtimeCapabilityManifest,
    AGENT_RUNTIME_CAPABILITY_MANIFEST_SCHEMA,
  );
  assert.equal(
    agentUiJsonSchemas.runtimeResumeContract,
    AGENT_RUNTIME_RESUME_CONTRACT_SCHEMA,
  );
});

test("checked-in JSON schema files match exported schema constants", async () => {
  const schemas = [
    ["agent-runtime-event.v0.1.schema.json", AGENT_RUNTIME_EVENT_SCHEMA],
    [
      "agent-runtime-capability-manifest.v0.1.schema.json",
      AGENT_RUNTIME_CAPABILITY_MANIFEST_SCHEMA,
    ],
    [
      "agent-runtime-resume-contract.v0.1.schema.json",
      AGENT_RUNTIME_RESUME_CONTRACT_SCHEMA,
    ],
    [
      "agent-runtime-state-delta.v0.1.schema.json",
      AGENT_RUNTIME_STATE_DELTA_SCHEMA,
    ],
    [
      "agent-ui-projection-state.v0.1.schema.json",
      AGENT_UI_PROJECTION_STATE_SCHEMA,
    ],
  ];

  for (const [fileName, expected] of schemas) {
    const file = await fs.readFile(
      path.join(packageRoot, "schemas", fileName),
      "utf8",
    );
    assert.deepEqual(JSON.parse(file), expected, fileName);
  }
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
      "coding-file-change",
      "coding-command-approval",
      "coding-sandbox-blocked",
      "coding-patch-failure",
      "coding-test-failure-fix",
      "coding-hydration-repair",
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
    activityCount: 10,
    activeThreadCount: 0,
    completedThreadCount: 1,
    failedThreadCount: 0,
  });
  assert.ok(
    handoff.events.some((event) => event.eventClass === "channel.opened"),
  );
  assert.ok(
    handoff.events.some((event) => event.eventClass === "artifact.changed"),
  );
  assert.ok(
    handoff.events.some((event) => event.eventClass === "subagent.started"),
  );
  assert.ok(
    handoff.events.some((event) => event.eventClass === "handoff.requested"),
  );
  assert.ok(
    handoff.events.some((event) => event.eventClass === "review.verdict"),
  );
  assert.ok(
    handoff.events.some((event) => event.eventClass === "task.completed"),
  );
  assert.ok(
    handoff.events.some((event) => event.eventClass === "state.delta"),
  );
  assert.ok(
    handoff.events.some((event) => event.eventClass === "snapshot.updated"),
  );
});

test("coding conformance fixtures pin the required workbench fact families", () => {
  const codingFixtures = agentUiConformanceFixtures.filter((fixture) =>
    fixture.id.startsWith("coding-"),
  );

  assert.deepEqual(
    codingFixtures.map((fixture) => fixture.id),
    [
      "coding-file-change",
      "coding-command-approval",
      "coding-sandbox-blocked",
      "coding-patch-failure",
      "coding-test-failure-fix",
      "coding-hydration-repair",
    ],
  );

  assert.deepEqual(getAgentUiFixture("coding-file-change").expected.coding, {
    fileCount: 1,
    changeCount: 1,
    patchCount: 1,
    commandCount: 1,
    testCount: 1,
    blockedCount: 0,
    failedPatchCount: 0,
    failedTestCount: 0,
  });
  assert.deepEqual(getAgentUiFixture("coding-command-approval").expected.coding, {
    commandCount: 1,
  });
  assert.deepEqual(getAgentUiFixture("coding-sandbox-blocked").expected.coding, {
    blockedCount: 1,
  });
  assert.deepEqual(getAgentUiFixture("coding-patch-failure").expected.coding, {
    patchCount: 1,
    testCount: 1,
    blockedCount: 1,
    failedPatchCount: 1,
    failedTestCount: 1,
  });
  assert.deepEqual(getAgentUiFixture("coding-test-failure-fix").expected.coding, {
    changeCount: 1,
    patchCount: 1,
    commandCount: 2,
    testCount: 1,
    failedTestCount: 0,
  });
  assert.deepEqual(getAgentUiFixture("coding-hydration-repair").expected.coding, {
    changeCount: 1,
  });

  for (const fixture of codingFixtures) {
    assert.equal(
      collectAgentUiFixtureValidationIssues(fixture).length,
      0,
      fixture.id,
    );
    assert.ok(fixture.expected.coding, fixture.id);
  }
});

test("coding conformance fixtures fail closed on malformed lifecycle streams", () => {
  const patchFailure = getAgentUiFixture("coding-patch-failure");
  const orphanPatchTerminal = {
    ...patchFailure,
    events: patchFailure.events.filter(
      (event) => event.eventClass !== "patch.started",
    ),
    expected: {
      ...patchFailure.expected,
      diagnostics: [],
    },
  };
  assert.deepEqual(
    collectAgentUiFixtureValidationIssues(orphanPatchTerminal).map((issue) => [
      issue.code,
      issue.path,
    ]),
    [["sequence_violation", "$.events[0]"]],
  );
  assert.deepEqual(
    verifyRuntimeEventSequence(orphanPatchTerminal.events).map(
      (violation) => violation.code,
    ),
    ["patch_terminal_without_start"],
  );

  const commandApproval = getAgentUiFixture("coding-command-approval");
  const unresolvedActionAtTurnEnd = {
    ...commandApproval,
    events: commandApproval.events.filter(
      (event) => event.eventClass !== "action.resolved",
    ),
    expected: {
      ...commandApproval.expected,
      diagnostics: [],
    },
  };
  assert.deepEqual(
    verifyRuntimeEventSequence(unresolvedActionAtTurnEnd.events).map(
      (violation) => violation.code,
    ),
    ["action_unresolved_at_turn_end"],
  );

  const testFix = getAgentUiFixture("coding-test-failure-fix");
  const duplicateActiveTest = {
    ...testFix,
    events: testFix.events.map((event) =>
      event.id === "evt_test_fix_completed_failed"
        ? {
            ...event,
            id: "evt_test_fix_started_duplicate",
            eventClass: "test.started",
            status: "running",
            title: "Duplicate active test start",
          }
        : event,
    ),
    expected: {
      ...testFix.expected,
      diagnostics: [],
    },
  };
  assert.deepEqual(
    verifyRuntimeEventSequence(duplicateActiveTest.events).map(
      (violation) => violation.code,
    ),
    ["test_started_already_active", "test_started_already_active"],
  );
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
    ["$.expected.subagents.hasSubagents", "$.expected.subagents.threadCount"],
  );
});

test("fixture validation checks coding expectation shape", () => {
  const fixture = {
    ...getAgentUiFixture("coding-file-change"),
    expected: {
      status: "completed",
      coding: {
        fileCount: "1",
        changeCount: "1",
        patchCount: "1",
      },
    },
  };

  assert.deepEqual(
    collectAgentUiFixtureValidationIssues(fixture).map((issue) => issue.path),
    [
      "$.expected.coding.fileCount",
      "$.expected.coding.changeCount",
      "$.expected.coding.patchCount",
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

  for (const eventClass of [
    "done",
    "final_done",
    "cancelled",
    "turn.done",
    "turn.final_done",
    "turn.cancelled",
  ]) {
    assert.deepEqual(
      collectRuntimeEventValidationIssues({
        ...validToolEvent,
        eventClass,
        toolCallId: undefined,
      }).map((issue) => issue.code),
      ["schema_mismatch"],
      `${eventClass} should fail closed as legacy turn terminal`,
    );
  }
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

const RUNTIME_EVENT_BASE = {
  schemaVersion: "lime-runtime-event/v0.1",
  runtimeId: "runtime",
  threadId: "thread",
  turnId: "turn",
  createdAt: "2026-06-10T00:00:00.000Z",
};

function seqEvent(input) {
  return { ...RUNTIME_EVENT_BASE, ...input };
}

test("sequence verifier accepts well-formed conformance fixtures", () => {
  for (const fixture of agentUiConformanceFixtures) {
    assert.deepEqual(
      verifyRuntimeEventSequence(fixture.events).map((v) => v.code),
      [],
      `fixture ${fixture.id} should have no sequence violations`,
    );
  }
});

test("sequence verifier flags tool.result without a matching tool.started", () => {
  const events = [
    seqEvent({
      id: "evt_1",
      eventClass: "tool.result",
      kind: "tool",
      status: "completed",
      sequence: 1,
      toolCallId: "tool_orphan",
      title: "Orphan tool result",
    }),
  ];

  assert.deepEqual(
    verifyRuntimeEventSequence(events).map((v) => v.code),
    ["tool_result_without_start"],
  );
});

test("runtime event validation enforces coding event fact scopes", () => {
  const base = {
    ...RUNTIME_EVENT_BASE,
    id: "evt_coding",
    kind: "tool",
    status: "completed",
    sequence: 1,
    title: "Coding fact",
  };

  assert.deepEqual(
    collectRuntimeEventValidationIssues({
      ...base,
      eventClass: "file.changed",
      payload: { path: "src/App.tsx" },
      artifactRefs: ["artifact-app"],
    }).map((issue) => issue.code),
    [],
  );

  assert.deepEqual(
    collectRuntimeEventValidationIssues({
      ...base,
      eventClass: "file.changed",
      payload: {},
    }).map((issue) => issue.path),
    ["$.artifactId", "$.payload.path"],
  );

  assert.deepEqual(
    collectRuntimeEventValidationIssues({
      ...base,
      eventClass: "patch.failed",
      toolCallId: "patch-1",
      payload: { patchId: "patch-1" },
    }).map((issue) => issue.path),
    ["$.payload.failureCategory"],
  );

  assert.deepEqual(
    collectRuntimeEventValidationIssues({
      ...base,
      eventClass: "command.output",
      toolCallId: "command-1",
      payload: { commandId: "command-1" },
    }).map((issue) => issue.path),
    ["$.refIds"],
  );

  assert.deepEqual(
    collectRuntimeEventValidationIssues({
      ...base,
      eventClass: "sandbox.blocked",
      kind: "sandbox",
      status: "blocked",
      payload: {},
    }).map((issue) => issue.path),
    ["$.payload.reasonCode"],
  );
});

test("sequence verifier flags malformed coding event lifecycles", () => {
  assert.deepEqual(
    verifyRuntimeEventSequence([
      seqEvent({
        id: "evt_patch_orphan",
        eventClass: "patch.applied",
        kind: "tool",
        status: "completed",
        sequence: 1,
        toolCallId: "patch-orphan",
        title: "Patch applied",
        payload: { patchId: "patch-orphan" },
      }),
    ]).map((v) => v.code),
    ["patch_terminal_without_start"],
  );

  assert.deepEqual(
    verifyRuntimeEventSequence([
      seqEvent({
        id: "evt_command_orphan",
        eventClass: "command.exited",
        kind: "tool",
        status: "completed",
        sequence: 1,
        toolCallId: "command-orphan",
        title: "Command exited",
        payload: { commandId: "command-orphan", exitCode: 0 },
      }),
    ]).map((v) => v.code),
    ["command_exited_without_start"],
  );

  assert.deepEqual(
    verifyRuntimeEventSequence([
      seqEvent({
        id: "evt_test_orphan",
        eventClass: "test.completed",
        kind: "tool",
        status: "completed",
        sequence: 1,
        toolCallId: "test-orphan",
        title: "Test completed",
        payload: { testRunId: "test-orphan", result: "passed" },
      }),
    ]).map((v) => v.code),
    ["test_completed_without_start"],
  );
});

test("sequence verifier flags a tool.started never closed before turn end", () => {
  const events = [
    seqEvent({
      id: "evt_1",
      eventClass: "tool.started",
      kind: "tool",
      status: "running",
      sequence: 1,
      toolCallId: "tool_unclosed",
      title: "Tool started",
    }),
    seqEvent({
      id: "evt_2",
      eventClass: "turn.completed",
      kind: "state",
      status: "completed",
      sequence: 2,
      title: "Turn completed",
    }),
  ];

  const violations = verifyRuntimeEventSequence(events);
  assert.deepEqual(
    violations.map((v) => v.code),
    ["tool_unclosed_at_turn_end"],
  );
  assert.equal(violations[0].scopeId, "tool_unclosed");
});

test("sequence verifier flags action.resolved without a matching action.required", () => {
  const events = [
    seqEvent({
      id: "evt_1",
      eventClass: "action.resolved",
      kind: "action",
      status: "completed",
      sequence: 1,
      actionId: "action_orphan",
      title: "Orphan resolve",
    }),
  ];

  assert.deepEqual(
    verifyRuntimeEventSequence(events).map((v) => v.code),
    ["action_resolved_without_request"],
  );
});

test("sequence verifier flags an unresolved action at turn end", () => {
  const events = [
    seqEvent({
      id: "evt_1",
      eventClass: "action.required",
      kind: "action",
      status: "blocked",
      sequence: 1,
      actionId: "action_pending",
      title: "Approval required",
    }),
    seqEvent({
      id: "evt_2",
      eventClass: "turn.completed",
      kind: "state",
      status: "completed",
      sequence: 2,
      title: "Turn completed",
    }),
  ];

  assert.deepEqual(
    verifyRuntimeEventSequence(events).map((v) => v.code),
    ["action_unresolved_at_turn_end"],
  );
});

test("sequence verifier closes action.required with cancellation and expiry events", () => {
  for (const eventClass of ["action.cancelled", "action.expired"]) {
    const events = [
      seqEvent({
        id: `${eventClass}:required`,
        eventClass: "action.required",
        kind: "action",
        status: "blocked",
        sequence: 1,
        actionId: "action_pending",
        title: "Approval required",
      }),
      seqEvent({
        id: `${eventClass}:closed`,
        eventClass,
        kind: "action",
        status: "completed",
        sequence: 2,
        actionId: "action_pending",
        title: "Action closed",
      }),
      seqEvent({
        id: `${eventClass}:turn`,
        eventClass: "turn.completed",
        kind: "state",
        status: "completed",
        sequence: 3,
        title: "Turn completed",
      }),
    ];

    assert.deepEqual(verifyRuntimeEventSequence(events), [], eventClass);
  }
});

test("sequence verifier treats turn terminal as model stream closure", () => {
  const events = [
    seqEvent({
      id: "evt_1",
      eventClass: "model.delta",
      kind: "model",
      status: "running",
      sequence: 1,
      title: "Model delta",
    }),
    seqEvent({
      id: "evt_2",
      eventClass: "turn.completed",
      kind: "state",
      status: "completed",
      sequence: 2,
      title: "Turn completed",
    }),
  ];

  assert.deepEqual(verifyRuntimeEventSequence(events), []);
});

test("sequence verifier treats turn.canceled as terminal", () => {
  const events = [
    seqEvent({
      id: "evt_1",
      eventClass: "turn.canceled",
      kind: "state",
      status: "failed",
      sequence: 1,
      title: "Turn canceled",
    }),
    seqEvent({
      id: "evt_2",
      eventClass: "tool.started",
      kind: "tool",
      status: "running",
      sequence: 2,
      toolCallId: "tool_late",
      title: "Late tool",
    }),
  ];

  assert.deepEqual(
    verifyRuntimeEventSequence(events).map((v) => v.code),
    ["execution_after_turn_terminal"],
  );
});

test("sequence verifier rejects execution stream after a terminal turn", () => {
  const events = [
    seqEvent({
      id: "evt_1",
      eventClass: "turn.completed",
      kind: "state",
      status: "completed",
      sequence: 1,
      title: "Turn completed",
    }),
    seqEvent({
      id: "evt_2",
      eventClass: "tool.started",
      kind: "tool",
      status: "running",
      sequence: 2,
      toolCallId: "tool_late",
      title: "Late tool",
    }),
  ];

  assert.deepEqual(
    verifyRuntimeEventSequence(events).map((v) => v.code),
    ["execution_after_turn_terminal"],
  );
});

test("sequence verifier flags duplicate event ids", () => {
  const events = [
    seqEvent({
      id: "dup",
      eventClass: "model.delta",
      kind: "model",
      status: "running",
      sequence: 1,
      title: "First",
    }),
    seqEvent({
      id: "dup",
      eventClass: "model.completed",
      kind: "model",
      status: "completed",
      sequence: 2,
      title: "Second",
    }),
  ];

  assert.deepEqual(
    verifyRuntimeEventSequence(events).map((v) => v.code),
    ["duplicate_event_id"],
  );
});

test("incremental verifier matches batch verification and reports per-push", () => {
  const verifier = createRuntimeSequenceVerifier();

  assert.deepEqual(
    verifier.push(
      seqEvent({
        id: "evt_1",
        eventClass: "tool.started",
        kind: "tool",
        status: "running",
        sequence: 1,
        toolCallId: "tool_a",
        title: "Tool started",
      }),
    ),
    [],
  );

  const secondPush = verifier.push(
    seqEvent({
      id: "evt_2",
      eventClass: "tool.result",
      kind: "tool",
      status: "completed",
      sequence: 2,
      toolCallId: "tool_b",
      title: "Mismatched result",
    }),
  );
  assert.deepEqual(
    secondPush.map((v) => v.code),
    ["tool_result_without_start"],
  );

  assert.deepEqual(
    verifier.finalize().map((v) => v.code),
    ["tool_result_without_start"],
  );
});

test("fixture validation surfaces sequence violations as issues", () => {
  const base = getAgentUiFixture("tool-success");
  const broken = {
    ...base,
    events: base.events.map((event) =>
      event.eventClass === "tool.started"
        ? { ...event, eventClass: "tool.result", id: "evt_broken_result" }
        : event,
    ),
  };

  const codes = collectAgentUiFixtureValidationIssues(broken).map(
    (issue) => issue.code,
  );
  assert.ok(codes.includes("sequence_violation"));
  assert.ok(
    collectAgentUiFixtureValidationIssues(broken).some(
      (issue) =>
        issue.code === "sequence_violation" && issue.path === "$.events[0]",
    ),
  );
  assert.throws(
    () => validateAgentUiFixture(broken),
    AgentUiContractValidationError,
  );
});

test("runtime capability manifest validation fixes provider capability contract", () => {
  const manifest = {
    schemaVersion: "lime-runtime-capability-manifest/v0.1",
    runtimeId: "runtime-main",
    providerId: "provider-openai",
    generatedAt: "2026-06-12T00:00:00.000Z",
    capabilities: [
      {
        id: "transport.jsonrpc",
        status: "supported",
        scope: "runtime",
        title: "App Server JSON-RPC",
      },
      {
        id: "hitl.resume",
        status: "experimental",
        scope: "session",
        title: "Resume open actions",
        metadata: { requiresExplicitCoverage: true },
      },
    ],
  };

  assert.equal(validateRuntimeCapabilityManifest(manifest), manifest);

  const invalid = {
    ...manifest,
    capabilities: [{ id: "tools.native", status: "supported" }],
  };
  assert.deepEqual(
    collectRuntimeCapabilityManifestValidationIssues(invalid).map(
      (issue) => issue.path,
    ),
    ["$.capabilities[0].scope", "$.capabilities[0].title"],
  );
});

test("runtime resume contract validation requires selected actions to cover open actions", () => {
  const contract = {
    schemaVersion: "lime-runtime-resume-contract/v0.1",
    runtimeId: "runtime-main",
    sessionId: "session-1",
    turnId: "turn-1",
    resumeMode: "all-open-actions",
    openActionIds: ["action-a", "action-b"],
    decisions: [
      { actionId: "action-a", decision: "approved" },
      { actionId: "action-b", decision: "answered", response: "继续" },
    ],
    createdAt: "2026-06-12T00:00:00.000Z",
  };

  assert.equal(validateRuntimeResumeContract(contract), contract);

  const missingDecision = {
    ...contract,
    decisions: [{ actionId: "action-a", decision: "approved" }],
  };
  assert.deepEqual(
    collectRuntimeResumeContractValidationIssues(missingDecision).map(
      (issue) => [issue.path, issue.message],
    ),
    [
      [
        "$.decisions",
        "Resume contract must cover open actions: action-b.",
      ],
    ],
  );
  assert.throws(
    () => validateRuntimeResumeContract(missingDecision),
    AgentUiContractValidationError,
  );
});
