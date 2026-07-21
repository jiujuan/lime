import { describe, expect, it } from "vitest";
import type { ThreadReadResponse, Turn } from "@limecloud/app-server-client";
import { projectChatRuntimeQueueControl } from "./chatRuntimeQueueControlProjection";

function readResponse(
  turns: Turn[] | undefined,
  overrides: Partial<ThreadReadResponse["thread"]> = {},
): ThreadReadResponse {
  return {
    thread: {
      cliVersion: "test",
      createdAt: 0.1,
      cwd: "/tmp/workspace",
      ephemeral: false,
      id: "thread-1",
      modelProvider: "openai",
      preview: "",
      sessionId: "session-1",
      source: "appServer",
      status: { type: "active", activeFlags: [] },
      turns,
      updatedAt: 0.2,
      ...overrides,
    },
  };
}

function turn(id: string, status: Turn["status"] = "completed"): Turn {
  return { id, status };
}

describe("projectChatRuntimeQueueControl", () => {
  it("projects the active turn from a hydrated v2 Thread", () => {
    expect(
      projectChatRuntimeQueueControl(
        readResponse([turn("turn-active", "inProgress"), turn("turn-done")]),
      ),
    ).toEqual({
      ok: true,
      projection: {
        threadId: "thread-1",
        updatedAtMs: 200,
        activeTurnId: "turn-active",
        queuedTurnIds: [],
      },
    });
  });

  it("fails closed when turns are not hydrated", () => {
    expect(
      projectChatRuntimeQueueControl(readResponse(undefined)),
    ).toMatchObject({ ok: false });
  });

  it("projects terminal turns without an active turn", () => {
    expect(
      projectChatRuntimeQueueControl(
        readResponse([
          turn("turn-completed"),
          turn("turn-failed", "failed"),
          turn("turn-interrupted", "interrupted"),
        ]),
      ),
    ).toMatchObject({
      ok: true,
      projection: { activeTurnId: null, queuedTurnIds: [] },
    });
  });

  it("fails closed for duplicate or multiple active turns", () => {
    expect(
      projectChatRuntimeQueueControl(
        readResponse([turn("turn-1"), turn("turn-1")]),
      ),
    ).toMatchObject({ ok: false });
    expect(
      projectChatRuntimeQueueControl(
        readResponse([
          turn("turn-a", "inProgress"),
          turn("turn-b", "inProgress"),
        ]),
      ),
    ).toMatchObject({ ok: false });
  });

  it("fails closed for invalid identity or timestamp", () => {
    expect(
      projectChatRuntimeQueueControl(readResponse([], { id: "" })),
    ).toMatchObject({ ok: false });
    expect(
      projectChatRuntimeQueueControl(
        readResponse([], { updatedAt: Number.NaN }),
      ),
    ).toMatchObject({ ok: false });
  });
});
