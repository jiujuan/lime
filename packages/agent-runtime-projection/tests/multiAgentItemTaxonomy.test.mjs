import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexMultiAgentItemTaxonomyProjectionEvent,
  extractCodexMultiAgentItemTaxonomySnapshot,
} from "../dist/index.js";

const EXPECTED_TOOLS = [
  "spawn_agent",
  "send_message",
  "followup_task",
  "wait_agent",
  "interrupt_agent",
  "list_agents",
];

function item(toolName, status, overrides = {}) {
  return {
    type: "collabToolCall",
    itemId: `${toolName}-item`,
    toolName,
    status,
    parentThreadId: "thread-root",
    turnId: "turn-root",
    receiverThreadIds: toolName === "list_agents" ? [] : ["thread-worker"],
    childThreadId: toolName === "spawn_agent" ? "thread-worker" : undefined,
    taskName: toolName === "spawn_agent" ? "researcher" : undefined,
    message: `${toolName} message`,
    ...overrides,
  };
}

function surface(
  surfaceName,
  itemIds = EXPECTED_TOOLS.map((tool) => `${tool}-item`),
) {
  return {
    surface: surfaceName,
    itemIds,
  };
}

function baseInput(overrides = {}) {
  return {
    threadId: "thread-root",
    expectedTools: EXPECTED_TOOLS,
    expectedStatuses: ["running", "completed", "interrupted"],
    taxonomyItems: [
      item("spawn_agent", "completed"),
      item("send_message", "running"),
      item("followup_task", "completed"),
      item("wait_agent", "completed"),
      item("interrupt_agent", "interrupted"),
      item("list_agents", "completed"),
    ],
    surfaceBindings: [
      surface("team_transcript"),
      surface("worker_card", ["spawn_agent-item", "wait_agent-item"]),
      surface("review_lane", ["interrupt_agent-item"]),
    ],
    legacyTextSummaries: [],
    orphanAgentHistories: [],
    ...overrides,
  };
}

test("multi-agent item taxonomy covers Codex v2 team tools as structured items", () => {
  const event = buildCodexMultiAgentItemTaxonomyProjectionEvent(baseInput(), {
    sequence: 421,
    sessionId: "session-root",
    threadId: "thread-root",
    turnId: "turn-root",
    timestamp: "2026-07-09T00:00:00.000Z",
  });

  assert.deepEqual(
    {
      type: event.type,
      sourceType: event.sourceType,
      sequence: event.sequence,
      sessionId: event.sessionId,
      threadId: event.threadId,
      turnId: event.turnId,
      owner: event.owner,
      scope: event.scope,
      phase: event.phase,
      surface: event.surface,
      persistence: event.persistence,
      control: event.control,
      topology: event.topology,
      runtimeEntity: event.runtimeEntity,
      runtimeStatus: event.runtimeStatus,
    },
    {
      type: "team.changed",
      sourceType: "multi_agent_item_taxonomy_projection",
      sequence: 421,
      sessionId: "session-root",
      threadId: "thread-root",
      turnId: "turn-root",
      owner: "team",
      scope: "team",
      phase: "completed",
      surface: "delegation_graph",
      persistence: "snapshot",
      control: "open_detail",
      topology: "coordinator_team",
      runtimeEntity: "work_item",
      runtimeStatus: "completed",
    },
  );

  assert.deepEqual(event.payload.validationIssues, []);
  assert.equal(event.payload.toolsCovered, true);
  assert.equal(event.payload.statusesCovered, true);
  assert.equal(event.payload.parentThreadBound, true);
  assert.equal(event.payload.surfacesBoundToItems, true);
  assert.deepEqual(
    event.payload.multiAgentItemTaxonomy.items.map((entry) => [
      entry.toolName,
      entry.status,
    ]),
    [
      ["spawn_agent", "completed"],
      ["send_message", "running"],
      ["followup_task", "completed"],
      ["wait_agent", "completed"],
      ["interrupt_agent", "aborted"],
      ["list_agents", "completed"],
    ],
  );
});

test("multi-agent taxonomy maps visual aliases back to Codex v2 tool names", () => {
  const snapshot = extractCodexMultiAgentItemTaxonomySnapshot(
    baseInput({
      taxonomyItems: [
        item("SpawnAgent", "completed"),
        item("send_input", "running"),
        item("resume_agent", "completed"),
        item("wait", "completed"),
        item("close_agent", "interrupted"),
        item("list_agents", "completed"),
      ],
    }),
  );

  assert.deepEqual(
    snapshot.items.map((entry) => entry.toolName),
    EXPECTED_TOOLS,
  );
  assert.equal(snapshot.toolsCovered, true);
  assert.equal(snapshot.statusesCovered, true);
});

test("multi-agent taxonomy rejects legacy tools and missing lineage", () => {
  const snapshot = extractCodexMultiAgentItemTaxonomySnapshot(
    baseInput({
      taxonomyItems: [
        item("SubAgentTask", "running", {
          itemId: undefined,
          turnId: undefined,
          parentThreadId: undefined,
        }),
      ],
      surfaceBindings: [],
    }),
  );

  assert.equal(snapshot.itemIdsStable, false);
  assert.equal(snapshot.turnIdsStable, false);
  assert.equal(snapshot.parentThreadBound, false);
  assert.deepEqual(
    snapshot.validationIssues.map((entry) => entry.code),
    [
      "legacy_tool_name",
      "missing_item_id",
      "missing_turn_id",
      "missing_parent_thread_id",
      "expected_tool_missing",
      "expected_status_missing",
      "surface_item_binding_missing",
    ],
  );
});

test("multi-agent taxonomy requires spawn child lineage", () => {
  const snapshot = extractCodexMultiAgentItemTaxonomySnapshot(
    baseInput({
      taxonomyItems: [
        item("spawn_agent", "completed", {
          childThreadId: undefined,
          receiverThreadIds: [],
        }),
        item("send_message", "running"),
        item("followup_task", "completed"),
        item("wait_agent", "completed"),
        item("interrupt_agent", "interrupted"),
        item("list_agents", "completed"),
      ],
    }),
  );

  assert.equal(snapshot.childLineageStable, false);
  assert(
    snapshot.validationIssues.some(
      (entry) => entry.code === "missing_child_thread_id",
    ),
  );
});

test("multi-agent taxonomy rejects text summaries and orphan agent histories", () => {
  const snapshot = extractCodexMultiAgentItemTaxonomySnapshot(
    baseInput({
      legacyTextSummaries: [
        {
          text: "Researcher is running",
        },
      ],
      orphanAgentHistories: [
        {
          agentId: "researcher",
          childSessionId: "session-worker",
        },
      ],
    }),
  );

  assert.equal(snapshot.legacyTextSummaryClean, false);
  assert.equal(snapshot.orphanAgentHistoryClean, false);
  assert.deepEqual(
    snapshot.validationIssues
      .map((entry) => entry.code)
      .filter((code) => code.includes("summary") || code.includes("orphan")),
    ["text_summary_timeline_leak", "orphan_agent_history"],
  );
});

test("multi-agent taxonomy requires GUI surfaces to bind item ids", () => {
  const snapshot = extractCodexMultiAgentItemTaxonomySnapshot(
    baseInput({
      surfaceBindings: [
        surface("team_transcript", ["spawn_agent-item"]),
        surface("worker_card", ["missing-item"]),
      ],
    }),
  );

  assert.equal(snapshot.surfacesBoundToItems, false);
  assert(
    snapshot.validationIssues.some(
      (entry) => entry.code === "surface_item_binding_missing",
    ),
  );
});
