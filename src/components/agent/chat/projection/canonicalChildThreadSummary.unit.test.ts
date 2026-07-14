import { describe, expect, it } from "vitest";

import type { AppServerThread } from "@/lib/api/appServer";
import {
  selectCanonicalChildThreadSummaries,
  summarizeCanonicalChildThreads,
} from "./canonicalChildThreadSummary";

function child(
  threadId: string,
  overrides: Partial<AppServerThread> = {},
): AppServerThread {
  return {
    agentPath: `/root/${threadId}`,
    agentState: { status: "pendingInit" },
    archived: false,
    createdAtMs: 100,
    parentThreadId: "parent",
    sessionId: `session-${threadId}`,
    status: { type: "idle" },
    threadId,
    turns: [],
    turnsView: "summary",
    updatedAtMs: 200,
    ...overrides,
  };
}

describe("selectCanonicalChildThreadSummaries", () => {
  it("从 canonical Thread identity 和 latest Turn 派生稳定 child roster", () => {
    const summaries = selectCanonicalChildThreadSummaries({
      parentThreadId: "parent",
      threads: [
        child("zeta", {
          agentNickname: "Nash",
          agentPath: "/root/zeta",
          agentRole: "reviewer",
          agentState: { status: "interrupted" },
          lastTaskMessage: "review projection",
          modelProvider: "openai",
          turns: [
            {
              createdAtMs: 100,
              sessionId: "session-zeta",
              status: "completed",
              threadId: "zeta",
              turnId: "turn-1",
              updatedAtMs: 110,
            },
            {
              createdAtMs: 120,
              sessionId: "session-zeta",
              status: "interrupted",
              threadId: "zeta",
              turnId: "turn-2",
              updatedAtMs: 130,
            },
          ],
        }),
        child("alpha", {
          agentState: { status: "running" },
          status: { type: "active", activeFlags: [] },
        }),
        child("outside", { parentThreadId: "another-parent" }),
      ],
    });

    expect(summaries).toEqual([
      expect.objectContaining({
        name: "alpha",
        path: "/root/alpha",
        sessionId: "session-alpha",
        status: "running",
        threadId: "alpha",
      }),
      expect.objectContaining({
        modelProvider: "openai",
        name: "Nash",
        path: "/root/zeta",
        role: "reviewer",
        status: "interrupted",
        taskSummary: "review projection",
        threadId: "zeta",
      }),
    ]);
  });

  it.each([
    [child("pending"), "pendingInit"],
    [child("running", { agentState: { status: "running" } }), "running"],
    [
      child("interrupted", {
        agentState: { status: "interrupted" },
        turns: [
          {
            createdAtMs: 100,
            sessionId: "session-interrupted",
            status: "interrupted",
            threadId: "interrupted",
            turnId: "turn",
            updatedAtMs: 200,
          },
        ],
      }),
      "interrupted",
    ],
    [
      child("completed", {
        agentState: { status: "completed" },
        turns: [
          {
            createdAtMs: 100,
            sessionId: "session-completed",
            status: "completed",
            threadId: "completed",
            turnId: "turn",
            updatedAtMs: 200,
          },
        ],
      }),
      "completed",
    ],
    [
      child("errored", {
        agentState: { message: "provider failed", status: "errored" },
      }),
      "errored",
    ],
    [
      child("shutdown", {
        agentState: { status: "shutdown" },
        status: { type: "active" },
      }),
      "shutdown",
    ],
  ])("将 canonical facts 映射为 Codex status %#", (thread, expected) => {
    expect(
      selectCanonicalChildThreadSummaries({
        parentThreadId: "parent",
        threads: [thread],
      })[0]?.status,
    ).toBe(expected);
  });

  it("为被 parent Item 引用但缺失的 child 显式生成 notFound", () => {
    const summaries = selectCanonicalChildThreadSummaries({
      parentThreadId: "parent",
      referencedChildThreadIds: ["missing", "missing"],
      threads: [],
    });

    expect(summaries).toEqual([
      expect.objectContaining({
        parentThreadId: "parent",
        sessionId: null,
        status: "notFound",
        threadId: "missing",
      }),
    ]);
  });
});

describe("summarizeCanonicalChildThreads", () => {
  it("按 Codex status 统一计算 GUI counts", () => {
    const children = selectCanonicalChildThreadSummaries({
      parentThreadId: "parent",
      referencedChildThreadIds: ["missing"],
      threads: [
        child("pending"),
        child("running", { agentState: { status: "running" } }),
        child("interrupted", {
          agentState: { status: "interrupted" },
          turns: [
            {
              createdAtMs: 100,
              sessionId: "session-interrupted",
              status: "interrupted",
              threadId: "interrupted",
              turnId: "turn",
              updatedAtMs: 200,
            },
          ],
        }),
        child("completed", {
          agentState: { status: "completed" },
          turns: [
            {
              createdAtMs: 100,
              sessionId: "session-completed",
              status: "completed",
              threadId: "completed",
              turnId: "turn",
              updatedAtMs: 200,
            },
          ],
        }),
        child("shutdown", {
          agentState: { status: "shutdown" },
        }),
      ],
    });

    expect(summarizeCanonicalChildThreads(children)).toEqual({
      active: 2,
      failed: 1,
      interrupted: 1,
      queued: 1,
      running: 1,
      settled: 2,
      total: 6,
    });
  });
});
