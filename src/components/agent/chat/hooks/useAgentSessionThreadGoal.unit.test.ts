import { describe, expect, it } from "vitest";
import type { AppServerJsonRpcNotification } from "@/lib/api/appServer";
import type { ThreadGoal } from "@limecloud/app-server-client";
import { readScopedThreadGoalNotification } from "./useAgentSessionThreadGoal";

const goal: ThreadGoal = {
  createdAt: 10,
  objective: "完成 Codex 主链",
  status: "active",
  threadId: "thread-1",
  timeUsedSeconds: 3,
  tokenBudget: null,
  tokensUsed: 1_024,
  updatedAt: 20,
};

function notification(
  method: string,
  params: Record<string, unknown>,
): AppServerJsonRpcNotification {
  return { jsonrpc: "2.0", method, params };
}

describe("useAgentSessionThreadGoal", () => {
  it("应投影当前 thread 的 updated notification", () => {
    expect(
      readScopedThreadGoalNotification(
        notification("thread/goal/updated", {
          threadId: "thread-1",
          goal,
        }),
        "thread-1",
      ),
    ).toEqual({ kind: "updated", goal });
  });

  it("应投影当前 thread 的 cleared notification", () => {
    expect(
      readScopedThreadGoalNotification(
        notification("thread/goal/cleared", { threadId: "thread-1" }),
        "thread-1",
      ),
    ).toEqual({ kind: "cleared" });
  });

  it("应拒绝其它 thread 和 identity 不一致的 updated notification", () => {
    expect(
      readScopedThreadGoalNotification(
        notification("thread/goal/updated", {
          threadId: "thread-other",
          goal: { ...goal, threadId: "thread-other" },
        }),
        "thread-1",
      ),
    ).toBeNull();
    expect(
      readScopedThreadGoalNotification(
        notification("thread/goal/updated", {
          threadId: "thread-1",
          goal: { ...goal, threadId: "thread-other" },
        }),
        "thread-1",
      ),
    ).toBeNull();
  });
});
