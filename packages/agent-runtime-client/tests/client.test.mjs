import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as runtimeClientPackage from "../dist/index.js";

const {
  AgentRuntimeEventPipeline,
  AgentRuntimeSequenceViolationError,
  AppServerConnection,
  createAgentRuntimeClient,
  createAgentRuntimeClientFromSessionGateway,
  runtimeExecutionEventFromCanonicalEvent,
  withEvent,
} = runtimeClientPackage;

test("createAgentRuntimeClient delegates current App Server requests", async () => {
  const sent = [];
  const responses = [
    {
      id: 1,
      result: {
        turn: {
          turnId: "turn-1",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
    },
    {
      id: 2,
      result: {
        tools: [],
        updatedAt: "2026-05-15T00:00:01.000Z",
      },
    },
  ];
  const runtime = createAgentRuntimeClient(
    new AppServerConnection({
      send(message) {
        sent.push(message);
      },
      async nextMessage() {
        const response = responses.shift();
        assert.ok(response, "unexpected App Server request");
        return response;
      },
    }),
  );

  const result = await runtime.startTurn({
    sessionId: "session-1",
    input: { text: "生成草稿" },
  });
  await runtime.readToolInventory({ sessionId: "session-1" });

  assert.equal(sent[0].method, "agentSession/turn/start");
  assert.equal(sent[1].method, "agentSession/toolInventory/read");
  assert.equal(result.result.turn.turnId, "turn-1");
});

test("session gateway delegates the standard runtime client surface", async () => {
  const calls = [];
  const gateway = {
    ...createMinimalSessionGateway(calls),
    async readToolInventory(params, options) {
      calls.push(["readToolInventory", params, options]);
      return requestResult(6, {
        tools: [],
        updatedAt: "2026-05-15T00:00:01.000Z",
      });
    },
    async exportEvidence(params, options) {
      calls.push(["exportEvidence", params, options]);
      return requestResult(5, {
        session: {
          sessionId: params.sessionId,
          threadId: "thread-1",
          status: "completed",
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:02.000Z",
        },
        turns: [],
        events: [],
        artifacts: [],
        exportedAt: "2026-05-15T00:00:03.000Z",
      });
    },
  };
  const runtime = createAgentRuntimeClientFromSessionGateway(gateway);
  const options = { timeoutMs: 120_000 };

  await runtime.startTurn(
    { sessionId: "session-1", input: { text: "生成草稿" } },
    options,
  );
  await runtime.readThread(
    { threadId: "thread-1", turnsView: "full" },
    options,
  );
  await runtime.readToolInventory({ sessionId: "session-1" }, options);
  await runtime.cancelTurn(
    { sessionId: "session-1", turnId: "turn-1" },
    options,
  );
  await runtime.respondAction(
    {
      sessionId: "session-1",
      requestId: "request-1",
      actionType: "ask_user",
      confirmed: true,
      response: "继续",
    },
    options,
  );
  await runtime.exportEvidence(
    { sessionId: "session-1", includeEvents: true },
    options,
  );

  assert.deepEqual(calls.map(([name]) => name), [
    "startTurn",
    "readThread",
    "readToolInventory",
    "cancelTurn",
    "respondAction",
    "exportEvidence",
  ]);
  assert.equal(calls[1][2].timeoutMs, 120_000);
  assert.equal(calls[5][1].includeEvents, true);
});

test("package root exports the canonical mapper without compatibility aliases", () => {
  assert.equal(typeof runtimeExecutionEventFromCanonicalEvent, "function");
  assert.equal("runtimeExecutionEventFromAgentEvent" in runtimeClientPackage, false);
  assert.equal(
    "createSchemaVersionCompatibilityMiddleware" in runtimeClientPackage,
    false,
  );
});

test("package root type surface exports canonical thread read types only", async () => {
  const declarations = await readFile(
    new URL("../dist/index.d.ts", import.meta.url),
    "utf8",
  );

  assert.equal(declarations.includes("type ThreadReadParams"), true);
  assert.equal(declarations.includes("type ThreadReadResponse"), true);
  assert.equal(declarations.includes("AgentSessionReadParams"), false);
  assert.equal(declarations.includes("AgentSessionReadResponse"), false);
});

test("canonical mapper reads lifecycle state from typed Thread Turn and Item", () => {
  const thread = runtimeExecutionEventFromCanonicalEvent({
    method: "thread/updated",
    params: {
      sessionId: "session-1",
      threadId: "thread-1",
      name: "Research",
      status: { type: "active", activeFlags: ["waitingOnApproval"] },
      createdAtMs: 100,
      updatedAtMs: 110,
    },
  });
  const turn = runtimeExecutionEventFromCanonicalEvent(
    turnEvent("interrupted", { updatedAtMs: 220, completedAtMs: 220 }),
  );
  const item = runtimeExecutionEventFromCanonicalEvent(
    itemEvent({ status: "completed", sequence: 2, updatedAtMs: 320 }),
  );
  const approval = runtimeExecutionEventFromCanonicalEvent(
    itemEvent({ kind: "approval", status: "pending" }),
  );
  const command = runtimeExecutionEventFromCanonicalEvent(
    itemEvent({ kind: "command", status: "completed" }),
  );

  assert.equal(thread.status, "running");
  assert.equal(thread.title, "Research");
  assert.equal(turn.eventClass, "turn.canceled");
  assert.equal(turn.status, "canceled");
  assert.equal(item.eventClass, "tool.result");
  assert.equal(item.toolCallId, "tool_call_1");
  assert.equal(approval.eventClass, "action.required");
  assert.equal(command.eventClass, "command.exited");
});

test("root client dispatches canonical lifecycle only to canonical listeners", async () => {
  const runtime = createRuntimeClient();
  const canonical = [];
  const raw = [];
  runtime.subscribeCanonicalEvents((event) => canonical.push(event));
  runtime.subscribeEvents((event) => raw.push(event));

  for (const notification of canonicalToolLifecycle()) {
    assert.equal(await runtime.dispatchEvent(notification), true);
  }
  assert.equal(
    await runtime.dispatchEvent(rawNotification("turn.completed")),
    false,
  );

  assert.deepEqual(canonical.map((event) => event.method), [
    "turn/updated",
    "item/updated",
    "item/updated",
    "item/updated",
    "turn/updated",
  ]);
  assert.deepEqual(raw, []);
});

test("session gateway dispatches canonical lifecycle and rejects raw lifecycle", async () => {
  const runtime = createAgentRuntimeClientFromSessionGateway(
    createMinimalSessionGateway(),
  );
  const canonical = [];
  const raw = [];
  runtime.subscribeCanonicalEvents((event) => canonical.push(event));
  runtime.subscribeEvents((event) => raw.push(event));

  assert.equal(
    await runtime.dispatchEvent(canonicalNotification(turnEvent("inProgress"))),
    true,
  );
  assert.equal(
    await runtime.dispatchEvent(rawNotification("turn.started")),
    false,
  );

  assert.equal(canonical[0].method, "turn/updated");
  assert.deepEqual(raw, []);
});

test("disabling sequence verification does not restore raw lifecycle", async () => {
  const runtime = createAgentRuntimeClientFromSessionGateway(
    createMinimalSessionGateway(),
    { sequenceVerifierMode: "off" },
  );

  assert.equal(
    await runtime.dispatchEvent(rawNotification("tool.result")),
    false,
  );
  assert.equal(
    await runtime.dispatchEvent(
      canonicalNotification(itemEvent({ status: "completed" })),
    ),
    true,
  );
});

test("raw channel accepts only explicit media.read notifications", async () => {
  for (const runtime of [
    createRuntimeClient(),
    createAgentRuntimeClientFromSessionGateway(createMinimalSessionGateway()),
  ]) {
    const received = [];
    runtime.subscribeEvents((event) => received.push(event.type));

    assert.equal(
      await runtime.dispatchEvent(mediaReadChunkNotification()),
      true,
    );
    assert.equal(
      await runtime.dispatchEvent(mediaReadCompletedNotification()),
      true,
    );
    assert.equal(
      await runtime.dispatchEvent(rawNotification("snapshot.updated")),
      false,
    );
    assert.equal(
      await runtime.dispatchEvent(rawNotification("media.read.chunk")),
      false,
    );

    assert.deepEqual(received, ["media.read.chunk", "media.read.completed"]);
  }
});

test("nextEvent consumes canonical notifications from gateway sources", async () => {
  const directNotification = canonicalNotification(
    itemEvent({ kind: "agentMessage", status: "inProgress" }),
  );
  const directRuntime = createAgentRuntimeClientFromSessionGateway({
    ...createMinimalSessionGateway(),
    async nextEvent(timeoutMs) {
      assert.equal(timeoutMs, 500);
      return directNotification;
    },
  });
  const directReceived = [];
  directRuntime.subscribeCanonicalEvents((event) => directReceived.push(event));

  const directEvent = await directRuntime.nextEvent(500);

  assert.equal(directEvent.params.canonicalEvent.method, "item/updated");
  assert.equal(directReceived[0].params.kind, "agentMessage");

  const drainedNotification = canonicalNotification(turnEvent("inProgress"));
  const drainedRuntime = createAgentRuntimeClientFromSessionGateway({
    ...createMinimalSessionGateway(),
    async drainEvents(limit) {
      assert.equal(limit, 1);
      return [{ method: "log/list", params: {} }, drainedNotification];
    },
  });

  const drainedEvent = await drainedRuntime.nextEvent();
  assert.equal(drainedEvent.params.canonicalEvent.method, "turn/updated");
});

test("sequence verifier fails closed for orphan canonical tool completion", async () => {
  const notification = canonicalNotification(
    itemEvent({ status: "completed", sequence: 2, updatedAtMs: 320 }),
  );
  const runtime = createRuntimeClient();

  assert.equal(await runtime.dispatchEvent(notification), false);

  const streamingRuntime = createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        return notification;
      },
    }),
  );
  await assert.rejects(
    streamingRuntime.nextEvent(),
    AgentRuntimeSequenceViolationError,
  );
});

test("collect-diagnostics keeps canonical dispatch observable", async () => {
  const runtime = createAgentRuntimeClientFromSessionGateway(
    createMinimalSessionGateway(),
    { sequenceVerifierMode: "collect-diagnostics" },
  );
  const received = [];
  runtime.subscribeCanonicalEvents((event) => received.push(event));

  const handled = await runtime.dispatchEvent(
    canonicalNotification(
      itemEvent({ status: "completed", sequence: 2, updatedAtMs: 320 }),
    ),
  );

  assert.equal(handled, true);
  assert.equal(received[0].params.status, "completed");
});

test("canonical adapters run before verification and may fan out", async () => {
  const runtime = createRuntimeClient({
    adapters: [
      ({ notification, event }) => {
        if (event.method !== "item/updated") return;
        return [
          withEvent(notification, {
            ...event,
            params: {
              ...event.params,
              status: "inProgress",
              sequence: 1,
              updatedAtMs: 310,
            },
          }),
          withEvent(notification, {
            ...event,
            params: {
              ...event.params,
              status: "completed",
              sequence: 2,
              updatedAtMs: 320,
              completedAtMs: 320,
            },
          }),
        ];
      },
    ],
  });
  const received = [];
  runtime.subscribeCanonicalEvents((event) => {
    received.push(`${event.params.sequence}:${event.params.status}`);
  });

  const handled = await runtime.dispatchEvent(
    canonicalNotification(itemEvent({ status: "pending", sequence: 0 })),
  );

  assert.equal(handled, true);
  assert.deepEqual(received, ["1:inProgress", "2:completed"]);
});

test("nextEvent returns canonical adapter fanout before another transport read", async () => {
  let reads = 0;
  const source = canonicalNotification(
    itemEvent({ status: "pending", sequence: 0 }),
  );
  const runtime = createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        reads += 1;
        return source;
      },
    }),
    {
      adapters: [
        ({ notification, event }) => [
          withEvent(notification, {
            ...event,
            params: {
              ...event.params,
              status: "inProgress",
              sequence: 1,
              updatedAtMs: 310,
            },
          }),
          withEvent(notification, {
            ...event,
            params: {
              ...event.params,
              status: "completed",
              sequence: 2,
              updatedAtMs: 320,
              completedAtMs: 320,
            },
          }),
        ],
      ],
    },
  );

  const first = await runtime.nextEvent();
  const second = await runtime.nextEvent();

  assert.equal(first.params.canonicalEvent.params.status, "inProgress");
  assert.equal(second.params.canonicalEvent.params.status, "completed");
  assert.equal(reads, 1);
});

test("canonical middleware can drop an item before listener dispatch", async () => {
  const runtime = createRuntimeClient({
    middlewares: [
      ({ event }) => event.method === "item/updated" ? false : undefined,
    ],
  });
  const received = [];
  runtime.subscribeCanonicalEvents((event) => received.push(event));

  const handled = await runtime.dispatchEvent(
    canonicalNotification(
      itemEvent({ kind: "agentMessage", status: "inProgress" }),
    ),
  );

  assert.equal(handled, false);
  assert.deepEqual(received, []);
});

test("pipeline flush verifies buffered canonical notifications", async () => {
  const completed = canonicalNotification(
    itemEvent({ status: "completed", sequence: 2, updatedAtMs: 320 }),
  );
  const pipeline = new AgentRuntimeEventPipeline({
    middlewares: [
      {
        transform() {},
        flush() {
          return completed;
        },
      },
    ],
  });

  const processed = await pipeline.process(
    canonicalNotification(
      itemEvent({ status: "inProgress", sequence: 1, updatedAtMs: 310 }),
    ),
  );
  const flushed = await pipeline.flush();

  assert.equal(processed.accepted, true);
  assert.equal(
    processed.notifications[0].params.canonicalEvent.params.status,
    "inProgress",
  );
  assert.equal(flushed.accepted, true);
  assert.equal(
    flushed.notifications[0].params.canonicalEvent.params.status,
    "completed",
  );
});

test("session gateway fails closed when optional runtime surfaces are absent", async () => {
  const runtime = createAgentRuntimeClientFromSessionGateway(
    createMinimalSessionGateway(),
  );

  await assert.rejects(
    runtime.exportEvidence({ sessionId: "session-1" }),
    /does not expose exportEvidence/,
  );
  await assert.rejects(runtime.nextEvent(), /does not expose agentSession\/event/);
});

test("session gateway propagates transport errors without mock fallback", async () => {
  const runtime = createAgentRuntimeClientFromSessionGateway({
    ...createMinimalSessionGateway(),
    async startTurn() {
      throw new Error("bridge offline");
    },
  });

  await assert.rejects(
    runtime.startTurn({ sessionId: "session-1", input: { text: "生成草稿" } }),
    /bridge offline/,
  );
});

test("sessionGateway subpath is browser-safe and canonical-only", async () => {
  const subpath = await import("../dist/sessionGateway.js");
  const source = await readFile(
    new URL("../dist/sessionGateway.js", import.meta.url),
    "utf8",
  );

  assert.equal(typeof subpath.AgentRuntimeEventSequenceGate, "function");
  assert.equal(typeof subpath.AgentRuntimeEventPipeline, "function");
  assert.equal(
    typeof subpath.runtimeExecutionEventFromCanonicalEvent,
    "function",
  );
  assert.equal("runtimeExecutionEventFromAgentEvent" in subpath, false);
  assert.equal(
    "createSchemaVersionCompatibilityMiddleware" in subpath,
    false,
  );
  assert.equal(source.includes("node:"), false);
  assert.equal(source.includes("app-server-client"), false);
  assert.equal(source.includes("@limecloud/app-server-client"), false);
});

function createRuntimeClient(options = {}) {
  return createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        throw new Error("unused");
      },
    }),
    options,
  );
}

function createMinimalSessionGateway(calls = []) {
  return {
    async startTurn(params, options) {
      calls.push(["startTurn", params, options]);
      return requestResult(1, {
        turn: {
          turnId: "turn-1",
          sessionId: params.sessionId,
          threadId: "thread-1",
          status: "accepted",
        },
      });
    },
    async readThread(params, options) {
      calls.push(["readThread", params, options]);
      return requestResult(2, {
        thread: {
          archived: false,
          createdAtMs: 1778803200000,
          sessionId: "session-1",
          status: { type: "active" },
          threadId: params.threadId,
          turns: [],
          turnsView: params.turnsView,
          updatedAtMs: 1778803201000,
        },
      });
    },
    async cancelTurn(params, options) {
      calls.push(["cancelTurn", params, options]);
      return requestResult(3, {});
    },
    async respondAction(params, options) {
      calls.push(["respondAction", params, options]);
      return requestResult(4, {});
    },
  };
}

function requestResult(id, result) {
  return {
    id,
    result,
    response: { jsonrpc: "2.0", id, result },
    notifications: [],
    messages: [],
  };
}

function canonicalToolLifecycle() {
  return [
    canonicalNotification(turnEvent("inProgress", { updatedAtMs: 210 })),
    canonicalNotification(
      itemEvent({ status: "pending", sequence: 0, updatedAtMs: 300 }),
    ),
    canonicalNotification(
      itemEvent({ status: "inProgress", sequence: 1, updatedAtMs: 310 }),
    ),
    canonicalNotification(
      itemEvent({ status: "completed", sequence: 2, updatedAtMs: 320 }),
    ),
    canonicalNotification(
      turnEvent("completed", { updatedAtMs: 220, completedAtMs: 220 }),
    ),
  ];
}

function turnEvent(status, overrides = {}) {
  return {
    method: "turn/updated",
    params: {
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      status,
      createdAtMs: 200,
      updatedAtMs: 210,
      ...overrides,
    },
  };
}

function itemEvent({
  kind = "tool",
  status = "inProgress",
  itemId = kind === "agentMessage" ? "msg_1" : "tool_call_1",
  sequence = 1,
  updatedAtMs = 310,
  ...overrides
} = {}) {
  const payload = itemPayload(kind);
  return {
    method: "item/updated",
    params: {
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId,
      sequence,
      ordinal: 0,
      createdAtMs: 300,
      updatedAtMs,
      kind,
      status,
      payload,
      ...overrides,
    },
  };
}

function itemPayload(kind) {
  switch (kind) {
    case "agentMessage":
      return { type: "agentMessage", text: "hello" };
    case "approval":
      return {
        type: "approval",
        action: { type: "askUser", prompt: "Continue?" },
        decision: { type: "pending" },
      };
    case "command":
      return { type: "command", command: "npm test" };
    default:
      return { type: "tool", name: "shell", arguments: [] };
  }
}

function canonicalNotification(canonicalEvent) {
  const sequence = canonicalEvent.params.sequence
    ?? canonicalEvent.params.updatedAtMs;
  return {
    method: "agentSession/event",
    params: {
      event: {
        eventId: `event-${canonicalEvent.method}-${sequence}`,
        sequence,
        sessionId: canonicalEvent.params.sessionId,
        threadId: canonicalEvent.params.threadId,
        turnId: canonicalEvent.params.turnId,
        type: canonicalEvent.method,
        timestamp: new Date(canonicalEvent.params.updatedAtMs).toISOString(),
        payload: {},
      },
      canonicalEvent,
    },
  };
}

function rawNotification(type, overrides = {}) {
  return {
    method: "agentSession/event",
    params: {
      event: {
        eventId: `event-${type}`,
        sequence: 1,
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
        type,
        timestamp: "2026-05-15T00:00:02.000Z",
        payload: {},
        ...overrides,
      },
    },
  };
}

function mediaReadChunkNotification() {
  return rawNotification("media.read.chunk", {
    payload: {
      streamId: "media-stream-1",
      chunkIndex: 0,
      done: false,
      chunk: { contentBase64: "aGVsbG8=" },
    },
  });
}

function mediaReadCompletedNotification() {
  return rawNotification("media.read.completed", {
    payload: {
      streamId: "media-stream-1",
      chunkCount: 1,
      done: true,
      media: { mimeType: "image/png" },
    },
  });
}
