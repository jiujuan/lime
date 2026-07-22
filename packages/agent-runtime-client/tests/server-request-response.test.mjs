import assert from "node:assert/strict";
import test from "node:test";

import { createAgentRuntimeClientFromSessionGateway } from "../dist/sessionGateway.js";

test("session gateway forwards typed server-request responses by outer id", () => {
  const responses = [];
  const runtime = createAgentRuntimeClientFromSessionGateway({
    startTurn: async () => requestResult(1, {}),
    steerTurn: async () => requestResult(2, {}),
    readThread: async () => requestResult(3, {}),
    cancelTurn: async () => requestResult(4, {}),
    respondAction: async () => requestResult(5, {}),
    respondServerRequest(id, result) {
      responses.push({ id, result });
    },
    rejectServerRequest(id, error) {
      responses.push({ id, error });
    },
  });

  runtime.respondServerRequest("reverse-1", { decision: "accept" });
  runtime.rejectServerRequest("reverse-1", {
    code: -32800,
    message: "request cancelled",
  });

  assert.deepEqual(responses, [
    { id: "reverse-1", result: { decision: "accept" } },
    {
      id: "reverse-1",
      error: { code: -32800, message: "request cancelled" },
    },
  ]);
});

test("session gateway fails closed when no server-request responder is provided", () => {
  const runtime = createAgentRuntimeClientFromSessionGateway({
    startTurn: async () => requestResult(1, {}),
    steerTurn: async () => requestResult(2, {}),
    readThread: async () => requestResult(3, {}),
    cancelTurn: async () => requestResult(4, {}),
    respondAction: async () => requestResult(5, {}),
  });

  assert.throws(
    () => runtime.respondServerRequest("reverse-2", { decision: "accept" }),
    /does not expose respondServerRequest/,
  );
  assert.throws(
    () =>
      runtime.rejectServerRequest("reverse-2", {
        code: -32800,
        message: "request cancelled",
      }),
    /does not expose rejectServerRequest/,
  );
});

function requestResult(id, result) {
  return {
    id,
    result,
    response: { id, result },
    notifications: [],
    messages: [],
  };
}
