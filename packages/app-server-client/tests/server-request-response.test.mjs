import assert from "node:assert/strict";
import { test } from "vitest";

import { AppServerConnection } from "../dist/index.js";

test("server request responses preserve the exact request id", async () => {
  const sent = [];
  const incoming = [
    {
      id: "server-request-1",
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        startedAt: 1_783_900_000_000,
      },
    },
    {
      id: "server-request-2",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-2",
        questions: [],
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = incoming.shift();
      assert.ok(message, "unexpected server message read");
      return message;
    },
  });

  const firstRequest = await connection.nextServerMessage();
  const secondRequest = await connection.nextServerMessage();
  assert.equal(firstRequest.id, "server-request-1");
  assert.equal(secondRequest.id, "server-request-2");

  connection.respondServerRequest(firstRequest.id, { decision: "accept" });
  connection.rejectServerRequest(secondRequest.id, {
    code: -32800,
    message: "request cancelled",
  });
  assert.throws(
    () =>
      connection.respondServerRequest(firstRequest.id, { decision: "accept" }),
    /unknown or already resolved server request id/,
  );

  assert.deepEqual(sent, [
    { id: "server-request-1", result: { decision: "accept" } },
    {
      id: "server-request-2",
      error: { code: -32800, message: "request cancelled" },
    },
  ]);
});

test("generic message reads still register reverse requests for exact replies", async () => {
  const sent = [];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      return {
        id: "server-request-generic",
        method: "item/fileChange/requestApproval",
        params: {},
      };
    },
  });

  const request = await connection.nextMessage();
  connection.respondServerRequest(request.id, { decision: "decline" });

  assert.deepEqual(sent, [
    { id: "server-request-generic", result: { decision: "decline" } },
  ]);
});

test("resolved reverse requests cannot be answered after terminal notification", async () => {
  const sent = [];
  const incoming = [
    {
      id: "server-request-cancelled",
      method: "item/tool/requestUserInput",
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1" },
    },
    {
      method: "serverRequest/resolved",
      params: {
        requestId: "server-request-cancelled",
        threadId: "thread-1",
      },
    },
  ];
  const connection = new AppServerConnection({
    send(message) {
      sent.push(message);
    },
    async nextMessage() {
      const message = incoming.shift();
      assert.ok(message, "unexpected server message read");
      return message;
    },
  });

  const request = await connection.nextServerMessage();
  await connection.nextServerMessage();
  assert.throws(
    () => connection.respondServerRequest(request.id, { answers: {} }),
    /unknown or already resolved server request id/,
  );
  assert.deepEqual(sent, []);
});
