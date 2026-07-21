import { describe, expect, it } from "vitest";

import type { AppServerThread } from "@/lib/api/appServer";
import {
  selectCanonicalChildThreadSummaries,
  summarizeCanonicalChildThreads,
} from "./canonicalChildThreadSummary";

const THREAD_UPDATED_AT_SECONDS = 1_780_704_000;

function agentExtra(
  threadId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    agentPath: `/root/${threadId}`,
    agentState: { status: "pendingInit" },
    ...overrides,
  };
}

function child(
  threadId: string,
  overrides: Partial<AppServerThread> = {},
): AppServerThread {
  return {
    cliVersion: "1.0.0",
    createdAt: THREAD_UPDATED_AT_SECONDS - 100,
    cwd: "/tmp",
    ephemeral: false,
    extra: agentExtra(threadId),
    id: threadId,
    modelProvider: "",
    parentThreadId: "parent",
    preview: "",
    sessionId: `session-${threadId}`,
    source: "appServer",
    status: { type: "idle" },
    turns: [],
    updatedAt: THREAD_UPDATED_AT_SECONDS,
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
          agentRole: "reviewer",
          extra: agentExtra("zeta", {
            agentState: { status: "interrupted" },
            lastTaskMessage: "review projection",
          }),
          modelProvider: "openai",
          turns: [
            {
              completedAt: 110,
              id: "turn-1",
              startedAt: 100,
              status: "completed",
            },
            {
              completedAt: 130,
              id: "turn-2",
              startedAt: 120,
              status: "interrupted",
            },
          ],
        }),
        child("alpha", {
          extra: agentExtra("alpha", {
            agentState: { status: "running" },
          }),
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
        updatedAtMs: THREAD_UPDATED_AT_SECONDS * 1_000,
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
    [
      child("running", {
        extra: agentExtra("running", { agentState: { status: "running" } }),
      }),
      "running",
    ],
    [
      child("interrupted", {
        extra: agentExtra("interrupted", {
          agentState: { status: "interrupted" },
        }),
        turns: [
          {
            completedAt: 200,
            id: "turn",
            startedAt: 100,
            status: "interrupted",
          },
        ],
      }),
      "interrupted",
    ],
    [
      child("completed", {
        extra: agentExtra("completed", {
          agentState: { status: "completed" },
        }),
        turns: [
          {
            completedAt: 200,
            id: "turn",
            startedAt: 100,
            status: "completed",
          },
        ],
      }),
      "completed",
    ],
    [
      child("errored", {
        extra: agentExtra("errored", {
          agentState: { message: "provider failed", status: "errored" },
        }),
      }),
      "errored",
    ],
    [
      child("shutdown", {
        extra: agentExtra("shutdown", {
          agentState: { status: "shutdown" },
        }),
        status: { type: "active", activeFlags: [] },
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

  it("extra 未提供 agentState 时按最新 v2 Turn 派生错误状态", () => {
    const [summary] = selectCanonicalChildThreadSummaries({
      parentThreadId: "parent",
      threads: [
        child("fallback", {
          extra: { agentPath: "/root/fallback" },
          turns: [
            {
              completedAt: 110,
              id: "turn-1",
              startedAt: 100,
              status: "completed",
            },
            {
              completedAt: 130,
              error: { message: "provider failed" },
              id: "turn-2",
              startedAt: 120,
              status: "failed",
            },
          ],
        }),
      ],
    });

    expect(summary).toEqual(
      expect.objectContaining({
        status: "errored",
        statusMessage: "provider failed",
        threadId: "fallback",
      }),
    );
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
        child("running", {
          extra: agentExtra("running", { agentState: { status: "running" } }),
        }),
        child("interrupted", {
          extra: agentExtra("interrupted", {
            agentState: { status: "interrupted" },
          }),
          turns: [
            {
              completedAt: 200,
              id: "turn",
              startedAt: 100,
              status: "interrupted",
            },
          ],
        }),
        child("completed", {
          extra: agentExtra("completed", {
            agentState: { status: "completed" },
          }),
          turns: [
            {
              completedAt: 200,
              id: "turn",
              startedAt: 100,
              status: "completed",
            },
          ],
        }),
        child("shutdown", {
          extra: agentExtra("shutdown", {
            agentState: { status: "shutdown" },
          }),
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
