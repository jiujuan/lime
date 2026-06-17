import { describe, expect, it } from "vitest";
import {
  bindInputbarThreadGoalMetadata,
  buildInputbarModeRequestMetadata,
  buildInputbarToolPreferencesOverride,
} from "./inputbarModeRequestMetadata";

describe("inputbarModeRequestMetadata", () => {
  it("应把 plan 和 goal 开关投影到 harness metadata", () => {
    const metadata = buildInputbarModeRequestMetadata(
      {
        harness: {
          preferences: {
            subagent: true,
          },
        },
      },
      {
        goalEnabled: true,
        objectiveText: "持续推进目标",
        planEnabled: true,
        source: "inputbar",
        subagentEnabled: true,
        threadId: "thread-goal-1",
      },
    );

    expect(metadata).toMatchObject({
      harness: {
        task_mode_enabled: true,
        goal_mode_enabled: true,
        preferences: {
          subagent: true,
          task: true,
          task_mode: true,
          objective: true,
          goal: true,
        },
        collaboration_mode: {
          mode: "plan",
          source: "inputbar",
        },
        thread_goal: {
          enabled: true,
          source: "inputbar",
          status: "active",
          set: {
            threadId: "thread-goal-1",
            objective: "持续推进目标",
            status: "active",
            tokenBudget: null,
          },
        },
        goal: {
          enabled: true,
          source: "inputbar",
          status: "active",
          set: {
            threadId: "thread-goal-1",
            objective: "持续推进目标",
            status: "active",
            tokenBudget: null,
          },
        },
        managed_objective: {
          objective_text: "持续推进目标",
          source: "inputbar",
        },
      },
    });
  });

  it("计划模式应作为协作模式投影，且不创建 update_plan 工具语义", () => {
    const metadata = buildInputbarModeRequestMetadata(undefined, {
      planEnabled: true,
      source: "plus_menu",
    });

    expect(metadata).toMatchObject({
      harness: {
        task_mode_enabled: true,
        collaboration_mode: {
          mode: "plan",
          source: "plus_menu",
        },
        preferences: {
          task: true,
          task_mode: true,
        },
      },
    });
    expect(JSON.stringify(metadata)).not.toContain("update_plan");
  });

  it("未开启 plan 时不生成 toolPreferencesOverride", () => {
    expect(
      buildInputbarToolPreferencesOverride({
        goalEnabled: true,
        planEnabled: false,
        subagentEnabled: true,
      }),
    ).toBeUndefined();
  });

  it("开启 plan 时应生成发送偏好覆盖", () => {
    expect(
      buildInputbarToolPreferencesOverride({
        planEnabled: true,
        subagentEnabled: true,
      }),
    ).toEqual({
      task: true,
      subagent: true,
    });
  });

  it("应在已有 goal metadata 上绑定实际 thread id", () => {
    const metadata = bindInputbarThreadGoalMetadata(
      {
        harness: {
          goal_mode_enabled: true,
          thread_goal: {
            enabled: true,
            source: "empty_state",
            status: "active",
            set: {
              objective: null,
              status: "active",
              tokenBudget: null,
            },
          },
        },
      },
      "thread-from-dispatch",
    );

    expect(metadata).toMatchObject({
      harness: {
        goal_mode_enabled: true,
        thread_goal: {
          enabled: true,
          source: "empty_state",
          status: "active",
          set: {
            threadId: "thread-from-dispatch",
            objective: null,
            status: "active",
            tokenBudget: null,
          },
        },
        goal: {
          enabled: true,
          source: "empty_state",
          status: "active",
          set: {
            threadId: "thread-from-dispatch",
            objective: null,
            status: "active",
            tokenBudget: null,
          },
        },
      },
    });
  });

  it("没有 goal metadata 时不应凭空创建 thread goal", () => {
    const base = {
      harness: {
        preferences: {
          task: true,
        },
      },
    };

    expect(bindInputbarThreadGoalMetadata(base, "thread-ignored")).toBe(base);
  });
});
