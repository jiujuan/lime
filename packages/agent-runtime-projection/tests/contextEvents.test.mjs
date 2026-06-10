import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentUiContextTraceEvent } from "../dist/index.js";

test("context trace helper builds standard context changed events", () => {
  const event = buildAgentUiContextTraceEvent(
    {
      steps: [
        {
          stage: "collect_workspace",
          detail: "读取项目上下文",
        },
        {
          stage: "resolve_memory",
          detail: "完成记忆与知识检索",
        },
      ],
    },
    {
      sessionId: "session-context",
      threadId: "thread-context",
      turnId: "turn-context",
      timestamp: "2026-06-10T00:00:00.000Z",
    },
  );

  assert.equal(event.sourceType, "context_trace");
  assert.equal(event.timestamp, "2026-06-10T00:00:00.000Z");
  assert.equal(event.sessionId, "session-context");
  assert.equal(event.threadId, "thread-context");
  assert.equal(event.turnId, "turn-context");
  assert.equal(event.type, "context.changed");
  assert.equal(event.owner, "context");
  assert.equal(event.scope, "turn");
  assert.equal(event.phase, "preparing");
  assert.equal(event.surface, "runtime_status");
  assert.equal(event.persistence, "snapshot");
  assert.deepEqual(event.payload, {
    stepCount: 2,
    latestStage: "resolve_memory",
    latestDetailPreview: "完成记忆与知识检索",
  });
});

test("context trace helper keeps empty traces as snapshot facts", () => {
  const event = buildAgentUiContextTraceEvent(
    {
      sourceType: "context_trace",
      steps: [],
    },
    {
      sessionId: "session-context",
    },
  );

  assert.equal(event.type, "context.changed");
  assert.deepEqual(event.payload, {
    stepCount: 0,
    latestStage: undefined,
    latestDetailPreview: undefined,
  });
});
