import { describe, expect, it } from "vitest";
import type { AppServerAgentEvent } from "@/lib/api/appServer";
import { readCanonicalThreadItem } from "./appServerCanonicalItemReader";

const event: AppServerAgentEvent = {
  eventId: "event-1",
  sequence: 7,
  sessionId: "session-1",
  threadId: "thread-1",
  turnId: "turn-1",
  type: "item.updated",
  timestamp: "2026-07-13T00:00:02.000Z",
  payload: {},
};

function item(
  payload: Record<string, unknown>,
  override: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    sessionId: "session-1",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    sequence: 7,
    ordinal: 3,
    createdAtMs: Date.parse("2026-07-13T00:00:00.000Z"),
    updatedAtMs: Date.parse("2026-07-13T00:00:01.000Z"),
    kind: payload.type,
    status: "inProgress",
    payload,
    metadata: { source: "canonical" },
    ...override,
  };
}

describe("readCanonicalThreadItem", () => {
  it.each([
    [
      "userMessage",
      { type: "userMessage", content: "hello" },
      { type: "user_message", content: "hello" },
    ],
    [
      "agentMessage",
      { type: "agentMessage", text: "answer", phase: "final" },
      { type: "agent_message", text: "answer", phase: "final" },
    ],
    [
      "reasoning",
      { type: "reasoning", summary: ["summary"], content: ["a", "b"] },
      { type: "reasoning", text: "ab", summary: ["summary"] },
    ],
    [
      "command",
      { type: "command", command: "npm test", cwd: "/repo", exit_code: 0 },
      { type: "command_execution", command: "npm test", exit_code: 0 },
    ],
    [
      "file",
      { type: "file", path: "src/app.ts", diff: "+ok", status: "applied" },
      { type: "file_artifact", path: "src/app.ts", content: "+ok" },
    ],
    [
      "media",
      { type: "media", uri: "artifact://image", mime_type: "image/png" },
      { type: "media", uri: "artifact://image", mime_type: "image/png" },
    ],
    [
      "subAgent",
      {
        type: "subAgent",
        child_thread_id: "thread-child",
        activity: "waiting",
        detail: "queued",
      },
      {
        type: "subagent_activity",
        session_id: "thread-child",
        status_label: "waiting",
      },
    ],
    [
      "contextCompaction",
      { type: "contextCompaction", summary: "bounded", window_id: "window-1" },
      { type: "context_compaction", stage: "started", detail: "bounded" },
    ],
    [
      "extension",
      { type: "extension", name: "review", data: { score: 9 } },
      { type: "extension", name: "review", data: { score: 9 } },
    ],
  ])(
    "projects canonical %s without raw payload inference",
    (_name, payload, expected) => {
      expect(readCanonicalThreadItem(item(payload), event)).toMatchObject({
        id: "item-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 7,
        status: "in_progress",
        started_at: "2026-07-13T00:00:00.000Z",
        updated_at: "2026-07-13T00:00:01.000Z",
        ...expected,
        metadata: expect.objectContaining({
          source: "canonical",
          ordinal: 3,
        }),
      });
    },
  );

  it("keeps Tool item identity separate from call identity", () => {
    expect(
      readCanonicalThreadItem(
        item({
          type: "tool",
          call_id: "call-1",
          name: "read_file",
          arguments: [{ name: "path", value: "src/app.ts" }],
          output: { text: "done", durationMs: 12 },
        }),
        event,
      ),
    ).toMatchObject({
      id: "item-1",
      type: "tool_call",
      tool_name: "read_file",
      output: "done",
      metadata: { callId: "call-1", durationMs: 12 },
    });
  });

  it("fails closed on missing durable fields or identity conflicts", () => {
    for (const override of [
      { itemId: "" },
      { sequence: 8 },
      { ordinal: undefined },
      { createdAtMs: undefined },
      { sessionId: "session-other" },
      { threadId: "thread-other" },
      { turnId: "turn-other" },
    ]) {
      expect(
        readCanonicalThreadItem(
          item({ type: "agentMessage", text: "ignored" }, override),
          event,
        ),
      ).toBeNull();
    }
  });
});
