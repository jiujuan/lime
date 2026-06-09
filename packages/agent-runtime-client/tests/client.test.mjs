import assert from "node:assert/strict";
import test from "node:test";

import {
  AppServerConnection,
  createAgentRuntimeClient,
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
