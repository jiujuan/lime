import { describe, expect, it, vi } from "vitest";
import {
  METHOD_THREAD_GOAL_CLEAR,
  METHOD_THREAD_GOAL_GET,
  METHOD_THREAD_GOAL_SET,
  type ThreadGoal,
} from "@limecloud/app-server-client";
import {
  createThreadGoalClient,
  parseThreadGoal,
  type ThreadGoalAppServerClient,
} from "./threadGoalClient";

const goal: ThreadGoal = {
  createdAt: 10,
  objective: "完成 Codex 主链",
  status: "active",
  threadId: "thread-1",
  timeUsedSeconds: 3,
  tokenBudget: 100_000,
  tokensUsed: 1_024,
  updatedAt: 20,
};

function appServerClient(result: unknown) {
  return {
    request: vi.fn().mockResolvedValue({ result }),
  } as ThreadGoalAppServerClient;
}

describe("threadGoalClient", () => {
  it("应从 typed App Server method 读取 canonical ThreadGoal", async () => {
    const client = appServerClient({ goal });
    const gateway = createThreadGoalClient({ appServerClient: client });

    await expect(gateway.getThreadGoal(" thread-1 ")).resolves.toEqual(goal);
    expect(client.request).toHaveBeenCalledWith(METHOD_THREAD_GOAL_GET, {
      threadId: "thread-1",
    });
  });

  it("没有 goal 时应返回 null", async () => {
    const gateway = createThreadGoalClient({
      appServerClient: appServerClient({ goal: null }),
    });

    await expect(gateway.getThreadGoal("thread-1")).resolves.toBeNull();
  });

  it("应通过 typed App Server method 设置 canonical ThreadGoal", async () => {
    const client = appServerClient({ goal });
    const gateway = createThreadGoalClient({ appServerClient: client });

    await expect(
      gateway.setThreadGoal({
        threadId: " thread-1 ",
        objective: " 完成 Codex 主链 ",
        tokenBudget: 100_000,
      }),
    ).resolves.toEqual(goal);
    expect(client.request).toHaveBeenCalledWith(METHOD_THREAD_GOAL_SET, {
      threadId: "thread-1",
      objective: "完成 Codex 主链",
      tokenBudget: 100_000,
    });
  });

  it("应通过同一个 typed patch method 更新 canonical Goal 状态", async () => {
    const pausedGoal = { ...goal, status: "paused" as const };
    const client = appServerClient({ goal: pausedGoal });
    const gateway = createThreadGoalClient({ appServerClient: client });

    await expect(
      gateway.setThreadGoalStatus(" thread-1 ", "paused"),
    ).resolves.toEqual(pausedGoal);
    expect(client.request).toHaveBeenCalledWith(METHOD_THREAD_GOAL_SET, {
      threadId: "thread-1",
      status: "paused",
    });
  });

  it("应通过 typed App Server method 清除 canonical ThreadGoal", async () => {
    const client = appServerClient({ cleared: true });
    const gateway = createThreadGoalClient({ appServerClient: client });

    await expect(gateway.clearThreadGoal(" thread-1 ")).resolves.toBe(true);
    expect(client.request).toHaveBeenCalledWith(METHOD_THREAD_GOAL_CLEAR, {
      threadId: "thread-1",
    });
  });

  it("应拒绝空 patch、非法预算和错误 clear 响应", async () => {
    const gateway = createThreadGoalClient({
      appServerClient: appServerClient({ cleared: "yes" }),
    });

    await expect(
      gateway.setThreadGoal({ threadId: "thread-1" }),
    ).rejects.toThrow("at least one valid ThreadGoal patch field");
    await expect(
      gateway.setThreadGoal({ threadId: "thread-1", tokenBudget: -1 }),
    ).rejects.toThrow("tokenBudget must be null or non-negative");
    await expect(gateway.clearThreadGoal("thread-1")).rejects.toThrow(
      "canonical cleared result",
    );
  });

  it("应拒绝错误 thread identity 和不完整 payload", async () => {
    const wrongThread = createThreadGoalClient({
      appServerClient: appServerClient({
        goal: { ...goal, threadId: "thread-other" },
      }),
    });
    await expect(wrongThread.getThreadGoal("thread-1")).rejects.toThrow(
      "requested canonical ThreadGoal",
    );
    expect(parseThreadGoal({ ...goal, objective: "" })).toBeNull();
  });
});
