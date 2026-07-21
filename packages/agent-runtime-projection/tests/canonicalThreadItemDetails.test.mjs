import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentUiThreadItemEvent } from "../dist/index.js";

const context = {
  sessionId: "session-1",
  threadId: "thread-1",
  turnId: "turn-1",
  sequence: 7,
  timestamp: "2026-07-19T00:00:00.000Z",
};

function toolItem(overrides) {
  return {
    id: "tool-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    type: "tool_call",
    status: "completed",
    tool_name: "search",
    success: true,
    ...overrides,
  };
}

test("canonical MCP and collab ThreadItem metadata reaches GUI projection", () => {
  const mcp = buildAgentUiThreadItemEvent(
    "item_completed",
    toolItem({
      metadata: {
        callId: "tool-1",
        canonical_type: "mcpToolCall",
        server: "docs",
        app_context: {
          connectorId: "connector-docs",
          resourceUri: "docs://codex",
        },
        plugin_id: "plugin-docs",
        result_content: [{ type: "text", text: "found" }],
        result_meta: { requestId: "request-1" },
      },
    }),
    context,
  );
  assert.deepEqual(mcp?.payload, {
    toolName: "search",
    success: true,
    outputPreview: undefined,
    errorPreview: undefined,
    metadataKeys: [
      "app_context",
      "callId",
      "canonical_type",
      "plugin_id",
      "result_content",
      "result_meta",
      "server",
    ],
    canonicalType: "mcpToolCall",
    mcpServer: "docs",
    mcpAppContext: {
      connectorId: "connector-docs",
      resourceUri: "docs://codex",
    },
    mcpPluginId: "plugin-docs",
    mcpResultContent: [{ type: "text", text: "found" }],
    mcpResultMeta: { requestId: "request-1" },
  });

  const collab = buildAgentUiThreadItemEvent(
    "item_completed",
    toolItem({
      tool_name: "wait",
      metadata: {
        callId: "tool-2",
        canonical_type: "collabAgentToolCall",
        sender_thread_id: "thread-1",
        receiver_thread_ids: ["thread-child"],
        reasoning_effort: "high",
        agents_states: {
          "thread-child": { status: "completed", message: "done" },
        },
      },
    }),
    context,
  );
  assert.equal(collab?.payload.canonicalType, "collabAgentToolCall");
  assert.equal(collab?.payload.senderThreadId, "thread-1");
  assert.deepEqual(collab?.payload.receiverThreadIds, ["thread-child"]);
  assert.equal(collab?.payload.reasoningEffort, "high");
  assert.deepEqual(collab?.payload.agentsStates, {
    "thread-child": { status: "completed", message: "done" },
  });
});

test("canonical WebSearch action and opaque results reach GUI projection", () => {
  const actionData = {
    type: "search",
    query: "Codex ThreadItem",
    queries: ["Codex ThreadItem", "Codex app server v2"],
  };
  const results = [
    { title: "ThreadItem", url: "https://example.test/thread-item" },
  ];
  const event = buildAgentUiThreadItemEvent(
    "item_completed",
    {
      id: "web-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "web_search",
      status: "completed",
      query: "Codex ThreadItem",
      action: "search",
      action_data: actionData,
      results,
    },
    context,
  );

  assert.deepEqual(event?.payload, {
    toolName: "web_search",
    queryPreview: "Codex ThreadItem",
    action: "search",
    actionData,
    results,
    resultCount: 1,
    outputPreview: undefined,
  });
});
