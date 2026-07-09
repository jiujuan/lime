import { describe, expect, it } from "vitest";
import { resolveTaskCenterNewTaskPageRequestPlan } from "./useTaskCenterNewTaskPageRuntime";

describe("resolveTaskCenterNewTaskPageRequestPlan", () => {
  it("非任务中心入口应跳过", () => {
    expect(
      resolveTaskCenterNewTaskPageRequestPlan({
        agentEntry: "settings",
        externalProjectId: "project-a",
      }),
    ).toEqual({
      action: "skip",
      reason: "unsupported-entry",
    });
  });

  it("未显式请求项目时应沿用当前路由项目打开草稿", () => {
    expect(
      resolveTaskCenterNewTaskPageRequestPlan({
        agentEntry: "claw",
        externalProjectId: " project-a ",
      }),
    ).toEqual({
      action: "open-draft",
      projectId: "project-a",
    });
  });

  it("route session 存在且请求项目不同，应忽略外部 draft request", () => {
    expect(
      resolveTaskCenterNewTaskPageRequestPlan({
        agentEntry: "claw",
        requestedProjectId: "project-b",
        externalProjectId: "project-a",
        normalizedInitialSessionId: "session-1",
      }),
    ).toEqual({
      action: "ignore",
      reason: "route-session-project-mismatch",
      agentEntry: "claw",
      initialSessionId: "session-1",
      requestedProjectId: "project-b",
      externalProjectId: "project-a",
    });
  });

  it("没有 route session 时请求项目不同应导航到对应首页", () => {
    expect(
      resolveTaskCenterNewTaskPageRequestPlan({
        agentEntry: "claw",
        requestedProjectId: "project-b",
        externalProjectId: "project-a",
      }),
    ).toEqual({
      action: "navigate",
      projectId: "project-b",
    });
  });

  it("route session 存在且请求清空项目时应沿用当前路由项目打开草稿", () => {
    expect(
      resolveTaskCenterNewTaskPageRequestPlan({
        agentEntry: "claw",
        requestedProjectId: null,
        externalProjectId: "project-a",
        normalizedInitialSessionId: "session-1",
      }),
    ).toEqual({
      action: "open-draft",
      projectId: "project-a",
    });
  });

  it("请求清空项目时应导航到无项目任务首页", () => {
    expect(
      resolveTaskCenterNewTaskPageRequestPlan({
        agentEntry: "new-task",
        requestedProjectId: null,
        externalProjectId: "project-a",
      }),
    ).toEqual({
      action: "navigate",
      projectId: null,
    });
  });

  it("请求项目与当前项目一致时应打开草稿", () => {
    expect(
      resolveTaskCenterNewTaskPageRequestPlan({
        agentEntry: "new-task",
        requestedProjectId: "project-a",
        externalProjectId: "project-a",
      }),
    ).toEqual({
      action: "open-draft",
      projectId: "project-a",
    });
  });
});
