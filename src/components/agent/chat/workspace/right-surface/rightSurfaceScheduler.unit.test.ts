import { describe, expect, it } from "vitest";
import { scheduleWorkspaceRightSurfaceCommand } from "./rightSurfaceScheduler";
import { buildRightSurfaceState } from "./rightSurfaceState";

describe("rightSurfaceScheduler", () => {
  it("用户前台动作应可替换当前 surface", () => {
    const decision = scheduleWorkspaceRightSurfaceCommand({
      current: buildRightSurfaceState("workbench", "user"),
      command: {
        action: "open",
        kind: "expertInfo",
        origin: "user",
      },
    });

    expect(decision).toMatchObject({
      status: "accepted",
      state: {
        activeSurface: "expertInfo",
        previousSurface: "workbench",
        source: "user",
      },
    });
  });

  it("后台 skill 请求不应抢占当前用户正在看的 surface", () => {
    const current = buildRightSurfaceState("expertInfo", "user");

    const decision = scheduleWorkspaceRightSurfaceCommand({
      current,
      priority: "background",
      command: {
        action: "open",
        kind: "files",
        origin: "skill",
      },
    });

    expect(decision).toEqual({
      status: "deferred",
      state: current,
      reasonCode: "background_request_deferred",
    });
  });

  it("用户锁定 surface 时非用户请求应延后", () => {
    const current = buildRightSurfaceState("expertInfo", "user");

    const decision = scheduleWorkspaceRightSurfaceCommand({
      current,
      userLockedSurface: "expertInfo",
      command: {
        action: "open",
        kind: "shell",
        origin: "mcpTool",
      },
    });

    expect(decision).toEqual({
      status: "deferred",
      state: current,
      reasonCode: "user_locked_surface",
    });
  });

  it("不允许的 route source 应被拒绝", () => {
    const current = buildRightSurfaceState("expertInfo", "user");

    const decision = scheduleWorkspaceRightSurfaceCommand({
      current,
      command: {
        action: "open",
        kind: "shell",
        origin: "route",
      },
    });

    expect(decision).toEqual({
      status: "rejected",
      state: current,
      reasonCode: "source_not_allowed",
    });
  });

  it("关闭请求应直接接受并记录 previousSurface", () => {
    const decision = scheduleWorkspaceRightSurfaceCommand({
      current: buildRightSurfaceState("harness", "runtime"),
      command: {
        action: "close",
        origin: "mcpTool",
      },
    });

    expect(decision).toMatchObject({
      status: "accepted",
      state: {
        activeSurface: null,
        previousSurface: "harness",
        source: "runtime",
      },
    });
  });
});
