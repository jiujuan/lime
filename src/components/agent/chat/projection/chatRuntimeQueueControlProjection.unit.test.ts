import { describe, expect, it } from "vitest";
import type { ThreadReadResponse } from "@limecloud/app-server-client";
import { projectChatRuntimeQueueControl } from "./chatRuntimeQueueControlProjection";

function readResponse(
  turns: ThreadReadResponse["thread"]["turns"],
  overrides: Partial<ThreadReadResponse["thread"]> = {},
): ThreadReadResponse {
  return {
    thread: {
      archived: false,
      createdAtMs: 100,
      sessionId: "session-1",
      status: { type: "active" },
      threadId: "thread-1",
      turns,
      turnsView: "full",
      updatedAtMs: 200,
      ...overrides,
    },
  };
}

function turn(
  turnId: string,
  overrides: Partial<
    NonNullable<ThreadReadResponse["thread"]["turns"]>[number]
  > = {},
) {
  return {
    createdAtMs: 100,
    sessionId: "session-1",
    status: "completed" as const,
    threadId: "thread-1",
    turnId,
    updatedAtMs: 200,
    ...overrides,
  };
}

describe("projectChatRuntimeQueueControl", () => {
  it("projects one active turn and queued turns from hydrated canonical data", () => {
    const result = projectChatRuntimeQueueControl(
      readResponse([
        turn("turn-active", {
          status: "inProgress",
          queue: { state: "running" },
        }),
        turn("turn-queued", {
          status: "inProgress",
          queue: { state: "queued", position: 1 },
        }),
        turn("turn-done"),
      ]),
    );

    expect(result).toEqual({
      ok: true,
      projection: {
        threadId: "thread-1",
        updatedAtMs: 200,
        activeTurnId: "turn-active",
        queuedTurnIds: ["turn-queued"],
      },
    });
  });

  it("fails closed for summary or missing turn hydration", () => {
    expect(
      projectChatRuntimeQueueControl(
        readResponse(undefined, { turnsView: "summary" }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      projectChatRuntimeQueueControl(
        readResponse(undefined, { turnsView: "notLoaded" }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      projectChatRuntimeQueueControl(readResponse(undefined)),
    ).toMatchObject({ ok: false });
  });

  it("projects all-terminal turns with no active turn", () => {
    expect(
      projectChatRuntimeQueueControl(
        readResponse([
          turn("turn-completed"),
          turn("turn-completed-running", { queue: { state: "running" } }),
          turn("turn-failed", {
            status: "failed",
            queue: { state: "running" },
          }),
          turn("turn-interrupted", {
            status: "interrupted",
            queue: { state: "running" },
          }),
          turn("turn-not-queued", {
            status: "failed",
            queue: { state: "notQueued" },
          }),
        ]),
      ),
    ).toEqual({
      ok: true,
      projection: {
        threadId: "thread-1",
        updatedAtMs: 200,
        activeTurnId: null,
        queuedTurnIds: [],
      },
    });
  });

  it("fails closed for duplicate, cross-thread, and multiple active turns", () => {
    expect(
      projectChatRuntimeQueueControl(
        readResponse([turn("turn-1"), turn("turn-1")]),
      ),
    ).toMatchObject({ ok: false });
    expect(
      projectChatRuntimeQueueControl(
        readResponse([turn("turn-cross", { threadId: "thread-other" })]),
      ),
    ).toMatchObject({ ok: false });
    expect(
      projectChatRuntimeQueueControl(
        readResponse([
          turn("turn-a", { status: "inProgress" }),
          turn("turn-b", { status: "inProgress" }),
        ]),
      ),
    ).toMatchObject({ ok: false });
  });

  it("fails closed for session mismatch, invalid queue/status combinations, and timestamps", () => {
    expect(
      projectChatRuntimeQueueControl(
        readResponse([turn("turn-session", { sessionId: "session-other" })]),
      ),
    ).toMatchObject({ ok: false });
    expect(
      projectChatRuntimeQueueControl(
        readResponse([
          turn("turn-terminal-queued", { queue: { state: "queued" } }),
        ]),
      ),
    ).toMatchObject({ ok: false });
    expect(
      projectChatRuntimeQueueControl(
        readResponse([turn("turn-bad-time", { updatedAtMs: Number.NaN })]),
      ),
    ).toMatchObject({ ok: false });
  });
});
