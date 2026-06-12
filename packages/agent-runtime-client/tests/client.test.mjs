import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AgentRuntimeEventPipeline,
  AgentRuntimeSequenceViolationError,
  AppServerConnection,
  createSchemaVersionCompatibilityMiddleware,
  createAgentRuntimeClient,
  createAgentRuntimeClientFromSessionGateway,
  runtimeExecutionEventFromAgentEvent,
  withEvent,
} from "../dist/index.js";

test("createAgentRuntimeClient is available from the standard runtime client package", async () => {
  const sent = [];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      return {
        id: 1,
        result: {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        },
      };
    },
  });

  const runtime = createAgentRuntimeClient(connection);
  const result = await runtime.startTurn({
    sessionId: "session-1",
    input: { text: "生成草稿" },
  });

  assert.equal(sent[0].method, "agentSession/turn/start");
  assert.equal(result.result.turn.turnId, "turn-1");
});

test("createAgentRuntimeClientFromSessionGateway adapts an existing session gateway", async () => {
  const calls = [];
  const gateway = {
    async startTurn(params, options) {
      calls.push(["startTurn", params, options]);
      return {
        id: 1,
        result: {
          turn: {
            turnId: "turn-1",
            sessionId: params.sessionId,
            threadId: "thread-1",
            status: "accepted",
          },
        },
        response: { jsonrpc: "2.0", id: 1, result: {} },
        notifications: [],
        messages: [],
      };
    },
    async readSession(params, options) {
      calls.push(["readSession", params, options]);
      return {
        id: 2,
        result: {
          session: {
            sessionId: params.sessionId,
            threadId: "thread-1",
            status: "running",
            createdAt: "2026-05-15T00:00:00.000Z",
            updatedAt: "2026-05-15T00:00:01.000Z",
          },
          turns: [],
        },
        response: { jsonrpc: "2.0", id: 2, result: {} },
        notifications: [],
        messages: [],
      };
    },
    async cancelTurn(params, options) {
      calls.push(["cancelTurn", params, options]);
      return {
        id: 3,
        result: {},
        response: { jsonrpc: "2.0", id: 3, result: {} },
        notifications: [],
        messages: [],
      };
    },
    async respondAction(params, options) {
      calls.push(["respondAction", params, options]);
      return {
        id: 4,
        result: {},
        response: { jsonrpc: "2.0", id: 4, result: {} },
        notifications: [],
        messages: [],
      };
    },
    async exportEvidence(params, options) {
      calls.push(["exportEvidence", params, options]);
      return {
        id: 5,
        result: {
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
        },
        response: { jsonrpc: "2.0", id: 5, result: {} },
        notifications: [],
        messages: [],
      };
    },
  };

  const runtime = createAgentRuntimeClientFromSessionGateway(gateway);
  const requestOptions = { timeoutMs: 120_000 };

  await runtime.startTurn(
    { sessionId: "session-1", input: { text: "生成草稿" } },
    requestOptions,
  );
  await runtime.readThread({ sessionId: "session-1" }, requestOptions);
  await runtime.cancelTurn(
    { sessionId: "session-1", turnId: "turn-1" },
    requestOptions,
  );
  await runtime.respondAction(
    {
      sessionId: "session-1",
      requestId: "request-1",
      actionType: "ask_user",
      confirmed: true,
      response: "继续",
    },
    requestOptions,
  );
  await runtime.exportEvidence(
    {
      sessionId: "session-1",
      includeEvents: true,
      includeArtifacts: true,
    },
    requestOptions,
  );

  assert.deepEqual(calls.map(([name]) => name), [
    "startTurn",
    "readSession",
    "cancelTurn",
    "respondAction",
    "exportEvidence",
  ]);
  assert.equal(calls[1][1].sessionId, "session-1");
  assert.equal(calls[1][2].timeoutMs, 120_000);
  assert.equal(calls[4][1].includeEvents, true);
});

test("session gateway client dispatches only App Server runtime events", async () => {
  const runtime = createAgentRuntimeClientFromSessionGateway(
    createMinimalSessionGateway(),
  );
  const received = [];
  const subscription = runtime.subscribeEvents((event, notification) => {
    received.push([event.type, notification.method]);
  });

  const ignored = await runtime.dispatchEvent({
    method: "log/list",
    params: {},
  });
  const handled = await runtime.dispatchEvent(
    agentSessionEventNotification("turn.started"),
  );
  subscription.unsubscribe();
  await runtime.dispatchEvent(agentSessionEventNotification("turn.completed"));

  assert.equal(ignored, false);
  assert.equal(handled, true);
  assert.deepEqual(received, [["turn.started", "agentSession/event"]]);
});

test("session gateway client reads nextEvent from gateway event sources", async () => {
  const directRuntime = createAgentRuntimeClientFromSessionGateway({
    ...createMinimalSessionGateway(),
    async nextEvent(timeoutMs) {
      assert.equal(timeoutMs, 500);
      return agentSessionEventNotification("tool.started");
    },
  });
  const directReceived = [];
  directRuntime.subscribeEvents((event) => {
    directReceived.push(event.type);
  });

  const directEvent = await directRuntime.nextEvent(500);

  assert.equal(directEvent.params.event.type, "tool.started");
  assert.deepEqual(directReceived, ["tool.started"]);

  const drainedRuntime = createAgentRuntimeClientFromSessionGateway({
    ...createMinimalSessionGateway(),
    async drainEvents(limit) {
      assert.equal(limit, 1);
      return [
        { method: "log/list", params: {} },
        agentSessionEventNotification("action.required"),
      ];
    },
  });

  const drainedEvent = await drainedRuntime.nextEvent();

  assert.equal(drainedEvent.params.event.type, "action.required");
});

test("runtime client blocks invalid agentSession/event streams by default", async () => {
  const runtime = createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        return agentSessionEventNotification("tool.result", {
          payload: { toolCallId: "tool-orphan" },
        });
      },
    }),
  );
  const received = [];
  runtime.subscribeEvents((event) => {
    received.push(event.type);
  });

  const handled = await runtime.dispatchEvent(
    agentSessionEventNotification("tool.result", {
      payload: { toolCallId: "tool-orphan" },
    }),
  );

  assert.equal(handled, false);
  assert.deepEqual(received, []);
  await assert.rejects(
    runtime.nextEvent(),
    AgentRuntimeSequenceViolationError,
  );
});

test("runtime client normalizes App Server message events before sequence verification", async () => {
  const runtime = createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        throw new Error("unused");
      },
    }),
  );
  const delta = agentSessionEventNotification("message.delta", {
    eventId: "evt-message-delta",
    sequence: 1,
    payload: { messageId: "msg-1", text: "hello" },
  });
  const completed = agentSessionEventNotification("turn.completed", {
    eventId: "evt-turn-completed",
    sequence: 2,
  });

  assert.equal(
    runtimeExecutionEventFromAgentEvent(delta.params.event).eventClass,
    "model.delta",
  );
  assert.equal(await runtime.dispatchEvent(delta), true);
  assert.equal(await runtime.dispatchEvent(completed), true);
  assert.equal(
    await runtime.dispatchEvent(agentSessionEventNotification("message.delta", {
      eventId: "evt-late-delta",
      sequence: 3,
      payload: { messageId: "msg-1", text: "late" },
    })),
    false,
  );
});

test("runtime client treats App Server canceled turn events as terminal", async () => {
  const runtime = createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        throw new Error("unused");
      },
    }),
  );

  assert.equal(
    runtimeExecutionEventFromAgentEvent(
      agentSessionEventNotification("turn.canceled", {
        eventId: "evt-turn-canceled",
      }).params.event,
    ).eventClass,
    "turn.canceled",
  );
  assert.equal(
    runtimeExecutionEventFromAgentEvent(
      agentSessionEventNotification("turn.canceled", {
        eventId: "evt-turn-canceled",
      }).params.event,
    ).status,
    "canceled",
  );
  assert.equal(
    await runtime.dispatchEvent(
      agentSessionEventNotification("turn.canceled", {
        eventId: "evt-turn-canceled",
      }),
    ),
    true,
  );
  assert.equal(
    await runtime.dispatchEvent(
      agentSessionEventNotification("message.delta", {
        eventId: "evt-late-delta-after-cancel",
        sequence: 2,
        payload: { messageId: "msg-1", text: "late" },
      }),
    ),
    false,
  );
});

test("runtime client treats action cancel and expiry events as completed action terminals", () => {
  for (const type of ["action.cancelled", "action.canceled", "action.expired"]) {
    const runtimeEvent = runtimeExecutionEventFromAgentEvent(
      agentSessionEventNotification(type, {
        eventId: `evt-${type}`,
        payload: { actionId: "action-1" },
      }).params.event,
    );

    assert.equal(runtimeEvent.eventClass, type);
    assert.equal(runtimeEvent.kind, "action");
    assert.equal(runtimeEvent.status, "completed");
  }
});

test("runtime client can collect sequence diagnostics without blocking dispatch", async () => {
  const runtime = createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        throw new Error("unused");
      },
    }),
    { sequenceVerifierMode: "collect-diagnostics" },
  );
  const received = [];
  runtime.subscribeEvents((event) => {
    received.push(event.type);
  });

  const handled = await runtime.dispatchEvent(
    agentSessionEventNotification("tool.result", {
      payload: { toolCallId: "tool-orphan" },
    }),
  );

  assert.equal(handled, true);
  assert.deepEqual(received, ["tool.result"]);
});

test("runtime event adapters run before sequence verification", async () => {
  const runtime = createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        throw new Error("unused");
      },
    }),
    {
      adapters: [
        ({ notification, event }) => {
          if (event.type !== "legacy.tool.output") return;
          return withEvent(notification, {
            ...event,
            type: "tool.result",
            payload: {
              ...event.payload,
              toolCallId: "tool-1",
            },
          });
        },
      ],
    },
  );
  const received = [];
  runtime.subscribeEvents((event) => {
    received.push(event.type);
  });

  assert.equal(
    await runtime.dispatchEvent(
      agentSessionEventNotification("tool.started", {
        eventId: "evt-tool-started",
        payload: { toolCallId: "tool-1" },
      }),
    ),
    true,
  );
  assert.equal(
    await runtime.dispatchEvent(
      agentSessionEventNotification("legacy.tool.output", {
        eventId: "evt-legacy-tool-output",
        sequence: 2,
      }),
    ),
    true,
  );

  assert.deepEqual(received, ["tool.started", "tool.result"]);
});

test("runtime event adapters can fan out one transport notification into multiple verified events", async () => {
  const runtime = createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        throw new Error("unused");
      },
    }),
    {
      adapters: [
        ({ notification, event }) => {
          if (event.type !== "legacy.tool.complete") return;
          return [
            withEvent(notification, {
              ...event,
              eventId: "evt-fanout-tool-start",
              sequence: event.sequence,
              type: "tool.started",
              payload: {
                ...event.payload,
                toolCallId: "tool-fanout",
              },
            }),
            withEvent(notification, {
              ...event,
              eventId: "evt-fanout-tool-result",
              sequence: event.sequence + 1,
              type: "tool.result",
              payload: {
                ...event.payload,
                toolCallId: "tool-fanout",
              },
            }),
          ];
        },
      ],
    },
  );
  const received = [];
  runtime.subscribeEvents((event) => {
    received.push(`${event.sequence}:${event.type}`);
  });

  const handled = await runtime.dispatchEvent(
    agentSessionEventNotification("legacy.tool.complete", {
      eventId: "evt-legacy-tool-complete",
      sequence: 1,
    }),
  );

  assert.equal(handled, true);
  assert.deepEqual(received, ["1:tool.started", "2:tool.result"]);
});

test("runtime client nextEvent returns fanned-out events before reading more transport messages", async () => {
  let reads = 0;
  const runtime = createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        reads += 1;
        return agentSessionEventNotification("legacy.tool.complete", {
          eventId: "evt-legacy-tool-complete-next",
          sequence: 1,
        });
      },
    }),
    {
      adapters: [
        ({ notification, event }) => {
          if (event.type !== "legacy.tool.complete") return;
          return [
            withEvent(notification, {
              ...event,
              eventId: "evt-next-tool-start",
              sequence: event.sequence,
              type: "tool.started",
              payload: { toolCallId: "tool-next" },
            }),
            withEvent(notification, {
              ...event,
              eventId: "evt-next-tool-result",
              sequence: event.sequence + 1,
              type: "tool.result",
              payload: { toolCallId: "tool-next" },
            }),
          ];
        },
      ],
    },
  );

  const first = await runtime.nextEvent();
  const second = await runtime.nextEvent();

  assert.equal(first.params.event.type, "tool.started");
  assert.equal(second.params.event.type, "tool.result");
  assert.equal(reads, 1);
});

test("runtime event middleware can drop events before listener dispatch", async () => {
  const runtime = createAgentRuntimeClient(
    new AppServerConnection({
      send() {},
      async nextMessage() {
        throw new Error("unused");
      },
    }),
    {
      middlewares: [
        ({ event }) => {
          if (event.type === "snapshot.updated") return false;
        },
      ],
    },
  );
  const received = [];
  runtime.subscribeEvents((event) => {
    received.push(event.type);
  });

  assert.equal(
    await runtime.dispatchEvent(agentSessionEventNotification("snapshot.updated")),
    false,
  );

  assert.deepEqual(received, []);
});

test("schemaVersion compatibility middleware patches events in one place", async () => {
  const runtime = createAgentRuntimeClientFromSessionGateway(
    createMinimalSessionGateway(),
    {
      middlewares: [createSchemaVersionCompatibilityMiddleware()],
    },
  );
  const received = [];
  runtime.subscribeEvents((event) => {
    received.push(event.payload.schemaVersion);
  });

  const handled = await runtime.dispatchEvent(
    agentSessionEventNotification("turn.started"),
  );

  assert.equal(handled, true);
  assert.deepEqual(received, ["lime-runtime-event/v0.1"]);
});

test("runtime event pipeline flush emits buffered transform events through verifier", async () => {
  const pipeline = new AgentRuntimeEventPipeline({
    middlewares: [
      {
        transform({ notification, event }) {
          if (event.type !== "message.delta") return;
          return [
            withEvent(notification, {
              ...event,
              eventId: "evt-buffered-message-delta",
              type: "message.delta",
            }),
          ];
        },
        flush() {
          return agentSessionEventNotification("turn.completed", {
            eventId: "evt-buffered-turn-final",
            sequence: 2,
          });
        },
      },
    ],
  });

  const processed = await pipeline.process(
    agentSessionEventNotification("message.delta", {
      eventId: "evt-source-message-delta",
      sequence: 1,
      payload: { text: "hello" },
    }),
  );
  const flushed = await pipeline.flush();

  assert.equal(processed.accepted, true);
  assert.equal(processed.notifications[0].params.event.type, "message.delta");
  assert.equal(flushed.accepted, true);
  assert.deepEqual(
    flushed.notifications.map((notification) => notification.params.event.type),
    ["turn.completed"],
  );
});

test("session gateway client blocks invalid agentSession/event streams by default", async () => {
  const runtime = createAgentRuntimeClientFromSessionGateway(
    createMinimalSessionGateway(),
  );
  const received = [];
  runtime.subscribeEvents((event) => {
    received.push(event.type);
  });

  const handled = await runtime.dispatchEvent(
    agentSessionEventNotification("tool.result", {
      payload: { toolCallId: "tool-orphan" },
    }),
  );

  assert.equal(handled, false);
  assert.deepEqual(received, []);
});

test("session gateway client can disable sequence verifier explicitly", async () => {
  const runtime = createAgentRuntimeClientFromSessionGateway(
    createMinimalSessionGateway(),
    { sequenceVerifierMode: "off" },
  );
  const received = [];
  runtime.subscribeEvents((event) => {
    received.push(event.type);
  });

  const handled = await runtime.dispatchEvent(
    agentSessionEventNotification("tool.result", {
      payload: { toolCallId: "tool-orphan" },
    }),
  );

  assert.equal(handled, true);
  assert.deepEqual(received, ["tool.result"]);
});

test("session gateway client fails closed when required runtime surfaces are missing", async () => {
  const runtime = createAgentRuntimeClientFromSessionGateway(
    createMinimalSessionGateway(),
  );

  await assert.rejects(
    runtime.exportEvidence({ sessionId: "session-1" }),
    /does not expose exportEvidence/,
  );
  await assert.rejects(runtime.nextEvent(), /does not expose agentSession\/event/);
});

test("session gateway client propagates transport errors without fallback mocks", async () => {
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

test("sessionGateway subpath remains browser-safe", async () => {
  const subpath = await import("../dist/sessionGateway.js");
  const source = await readFile(
    new URL("../dist/sessionGateway.js", import.meta.url),
    "utf8",
  );

  assert.equal(typeof subpath.AgentRuntimeEventSequenceGate, "function");
  assert.equal(typeof subpath.AgentRuntimeEventPipeline, "function");
  assert.equal(
    typeof subpath.createSchemaVersionCompatibilityMiddleware,
    "function",
  );
  assert.equal(typeof subpath.runtimeExecutionEventFromAgentEvent, "function");
  assert.equal(source.includes("node:"), false);
  assert.equal(source.includes("app-server-client"), false);
  assert.equal(source.includes("@limecloud/app-server-client"), false);
});

function createMinimalSessionGateway() {
  return {
    async startTurn(params) {
      return {
        id: 1,
        result: {
          turn: {
            turnId: "turn-1",
            sessionId: params.sessionId,
            threadId: "thread-1",
            status: "accepted",
          },
        },
        response: { jsonrpc: "2.0", id: 1, result: {} },
        notifications: [],
        messages: [],
      };
    },
    async readSession(params) {
      return {
        id: 2,
        result: {
          session: {
            sessionId: params.sessionId,
            threadId: "thread-1",
            status: "running",
            createdAt: "2026-05-15T00:00:00.000Z",
            updatedAt: "2026-05-15T00:00:01.000Z",
          },
          turns: [],
        },
        response: { jsonrpc: "2.0", id: 2, result: {} },
        notifications: [],
        messages: [],
      };
    },
    async cancelTurn() {
      return {
        id: 3,
        result: {},
        response: { jsonrpc: "2.0", id: 3, result: {} },
        notifications: [],
        messages: [],
      };
    },
    async respondAction() {
      return {
        id: 4,
        result: {},
        response: { jsonrpc: "2.0", id: 4, result: {} },
        notifications: [],
        messages: [],
      };
    },
  };
}

function agentSessionEventNotification(type, overrides = {}) {
  const payload = {
    ...(overrides.payload ?? {}),
  };
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
        payload,
        ...overrides,
      },
    },
  };
}
