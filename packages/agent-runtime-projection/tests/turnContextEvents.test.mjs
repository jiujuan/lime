import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentUiTurnContextEvents } from "../dist/index.js";

test("turn context helper builds standard context changed events", () => {
  const events = buildAgentUiTurnContextEvents(
    {
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      outputSchemaRuntime: {
        source: "turn",
        strategy: "native",
        providerName: "openai",
        modelName: "gpt-5.4",
      },
      contextSummary: {
        memory_budget: {
          used_tokens: 640,
          max_tokens: 1200,
          status: "ready",
          source: "knowledge_context_resolver",
        },
        missing_context: [
          {
            id: "knowledge_warning:0",
            kind: "knowledge_warning",
            label: "sources/missing.md",
            status: "unknown",
            reason: "缺少来源",
            source: "knowledge_context_resolver",
          },
        ],
        retrieval_refs: [
          {
            source_id: "knowledge_pack:brand:compiled/splits/brief.md",
            kind: "knowledge_pack",
          },
        ],
        team_memory_refs: [
          {
            key: "team.selection",
            source: "team_memory_shadow",
          },
        ],
      },
    },
    {
      sessionId: "context-session",
      timestamp: "2026-06-10T00:00:00.000Z",
    },
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].sourceType, "turn_context");
  assert.equal(events[0].timestamp, "2026-06-10T00:00:00.000Z");
  assert.equal(events[0].sessionId, "session-1");
  assert.equal(events[0].threadId, "thread-1");
  assert.equal(events[0].turnId, "turn-1");
  assert.equal(events[0].type, "context.changed");
  assert.equal(events[0].owner, "context");
  assert.equal(events[0].scope, "turn");
  assert.equal(events[0].phase, "preparing");
  assert.equal(events[0].surface, "runtime_status");
  assert.equal(events[0].persistence, "snapshot");
  assert.deepEqual(events[0].payload, {
    outputSchemaAvailable: true,
    outputSchemaSource: "turn",
    outputSchemaStrategy: "native",
    providerName: "openai",
    modelName: "gpt-5.4",
    contextSummaryAvailable: true,
    memoryBudget: {
      used_tokens: 640,
      max_tokens: 1200,
      status: "ready",
      source: "knowledge_context_resolver",
    },
    missingContext: [
      {
        id: "knowledge_warning:0",
        kind: "knowledge_warning",
        label: "sources/missing.md",
        status: "unknown",
        reason: "缺少来源",
        source: "knowledge_context_resolver",
      },
    ],
    retrievalRefs: [
      {
        source_id: "knowledge_pack:brand:compiled/splits/brief.md",
        kind: "knowledge_pack",
      },
    ],
    teamMemoryRefs: [
      {
        key: "team.selection",
        source: "team_memory_shadow",
      },
    ],
  });
  assert.deepEqual(events[0].refs, {
    contextSourceIds: ["knowledge_pack:brand:compiled/splits/brief.md"],
    teamMemoryKeys: ["team.selection"],
  });
});

test("turn context helper appends permission changed events", () => {
  const events = buildAgentUiTurnContextEvents({
    sessionId: "session-permission",
    threadId: "thread-permission",
    turnId: "turn-permission",
    approvalPolicy: "on-request",
    sandboxPolicy: "workspace-write",
  });

  assert.equal(events.length, 2);
  assert.equal(events[1].type, "permission.changed");
  assert.equal(events[1].sourceType, "turn_context");
  assert.equal(events[1].sessionId, "session-permission");
  assert.equal(events[1].threadId, "thread-permission");
  assert.equal(events[1].turnId, "turn-permission");
  assert.equal(events[1].owner, "policy");
  assert.equal(events[1].scope, "turn");
  assert.equal(events[1].phase, "preparing");
  assert.equal(events[1].surface, "runtime_status");
  assert.equal(events[1].persistence, "snapshot");
  assert.deepEqual(events[1].payload, {
    approvalPolicy: "on-request",
    sandboxPolicy: "workspace-write",
    sourceEvent: "turn_context",
  });
});

test("turn context helper keeps empty context snapshots stable", () => {
  const events = buildAgentUiTurnContextEvents({
    sourceType: "turn_context",
    contextSummary: null,
    outputSchemaRuntime: null,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "context.changed");
  assert.deepEqual(events[0].payload, {
    outputSchemaAvailable: false,
    outputSchemaSource: undefined,
    outputSchemaStrategy: undefined,
    providerName: undefined,
    modelName: undefined,
    contextSummaryAvailable: false,
    memoryBudget: null,
    missingContext: [],
    retrievalRefs: [],
    teamMemoryRefs: [],
  });
  assert.deepEqual(events[0].refs, {
    contextSourceIds: [],
    teamMemoryKeys: [],
  });
});
