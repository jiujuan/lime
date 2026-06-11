import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AppServerConnection,
  createAgentRuntimeClient,
  createAgentRuntimeClientFromSessionGateway,
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
  const source = await readFile(
    new URL("../dist/sessionGateway.js", import.meta.url),
    "utf8",
  );

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

function agentSessionEventNotification(type) {
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
      },
    },
  };
}
