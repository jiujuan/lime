import { describe, expect, it } from "vitest";
import { APP_SERVER_METHOD_AGENT_SESSION_EVENT } from "@/lib/api/appServer";
import { projectAppServerAgentEventPayload } from "./appServerEventStream";

function canonicalToolNotification(
  type: "item.started" | "item.completed",
  status: "inProgress" | "completed",
  output: Record<string, unknown> | null,
) {
  const sequence = type === "item.started" ? 4 : 5;
  const item = {
    sessionId: "session-1",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "tool-call-1",
    sequence,
    ordinal: 1,
    createdAtMs: 1_784_000_000_000,
    updatedAtMs: 1_784_000_000_100,
    completedAtMs: type === "item.completed" ? 1_784_000_000_100 : undefined,
    kind: "tool",
    status,
    payload: {
      type: "tool",
      call_id: "tool-call-1",
      name: "WebFetch",
      arguments: [{ name: "url", value: "https://example.com/tool" }],
      output,
    },
    metadata: { source: "canonical-tool-test" },
  };
  return {
    method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
    params: {
      event: {
        eventId: `event-${type}`,
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
        sequence,
        timestamp: "2026-07-12T19:08:01.076Z",
        type,
        payload: {
          item,
        },
      },
      canonicalEvent: { method: "item/updated", params: item },
    },
  } as never;
}

function canonicalResolvedApprovalNotification() {
  return {
    method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
    params: {
      event: {
        eventId: "event-action-resolved",
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
        sequence: 7,
        timestamp: "2026-07-13T05:26:23.971Z",
        type: "action.resolved",
        payload: {
          requestId: "approval-1",
          actionType: "tool_confirmation",
        },
      },
      canonicalEvent: {
        method: "item/updated",
        params: {
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item_approval-1",
          sequence: 7,
          ordinal: 6,
          createdAtMs: 1_784_000_000_000,
          updatedAtMs: 1_784_000_000_100,
          completedAtMs: 1_784_000_000_100,
          kind: "approval",
          status: "completed",
          payload: {
            type: "approval",
            request_id: "approval-1",
            action: {
              kind: "tool_confirmation",
              description: "允许执行浏览器工具？",
            },
            scope: "once",
            decision: "denied",
          },
          metadata: null,
        },
      },
    },
  } as never;
}

describe("canonical App Server Tool Item projection", () => {
  it("projects resolved canonical Approval as its terminal thread item", () => {
    expect(
      projectAppServerAgentEventPayload(
        canonicalResolvedApprovalNotification(),
      ),
    ).toMatchObject({
      type: "item_completed",
      item: {
        id: "item_approval-1",
        type: "approval_request",
        request_id: "approval-1",
        status: "completed",
        response: { decision: "denied" },
      },
    });
  });

  it("projects nested item.started Tool payload into a running tool_call", () => {
    const projected = projectAppServerAgentEventPayload(
      canonicalToolNotification("item.started", "inProgress", null),
    );

    expect(projected).toMatchObject({
      type: "item_started",
      item: {
        id: "tool-call-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 4,
        status: "in_progress",
        type: "tool_call",
        tool_name: "WebFetch",
        arguments: [{ name: "url", value: "https://example.com/tool" }],
        metadata: { source: "canonical-tool-test" },
      },
    });
  });

  it("projects nested item.completed Tool output and terminal state", () => {
    const projected = projectAppServerAgentEventPayload(
      canonicalToolNotification("item.completed", "completed", {
        text: "fetched https://example.com/tool",
        structuredContent: { source: "fixture" },
        durationMs: 37,
        truncated: false,
      }),
    );

    expect(projected).toMatchObject({
      type: "item_completed",
      item: {
        id: "tool-call-1",
        status: "completed",
        type: "tool_call",
        tool_name: "WebFetch",
        output: "fetched https://example.com/tool",
        structured_content: { source: "fixture" },
        duration_ms: 37,
        output_truncated: false,
        success: true,
      },
    });
  });
});
