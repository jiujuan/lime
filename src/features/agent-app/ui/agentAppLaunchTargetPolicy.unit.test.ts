import { describe, expect, it } from "vitest";
import {
  normalizeAgentAppRightSurfaceLaunchTarget,
  resolveAgentAppLaunchTargetPolicy,
} from "./agentAppLaunchTargetPolicy";

describe("agentAppLaunchTargetPolicy", () => {
  it("默认把启动目标收敛到独立窗口", () => {
    expect(
      resolveAgentAppLaunchTargetPolicy({
        mode: "standalone",
        rightSurfaceTarget: {
          workspaceId: "workspace-main",
          sessionId: "session-main",
        },
      }),
    ).toEqual({
      mode: "standalone",
      rightSurfaceAvailable: true,
      rightSurfaceTarget: null,
    });
  });

  it("只有显式选择右侧且 Claw target 有效时才返回投递目标", () => {
    expect(
      resolveAgentAppLaunchTargetPolicy({
        mode: "rightSurface",
        rightSurfaceTarget: {
          workspaceId: " workspace-main ",
          sessionId: " session-main ",
        },
      }),
    ).toEqual({
      mode: "rightSurface",
      rightSurfaceAvailable: true,
      rightSurfaceTarget: {
        workspaceId: "workspace-main",
        sessionId: "session-main",
      },
    });
  });

  it("右侧 target 缺失时回退独立窗口", () => {
    expect(
      resolveAgentAppLaunchTargetPolicy({
        mode: "rightSurface",
        rightSurfaceTarget: {
          workspaceId: " ",
          sessionId: null,
        },
      }),
    ).toEqual({
      mode: "standalone",
      rightSurfaceAvailable: false,
      rightSurfaceTarget: null,
    });
  });

  it("保留仅 sessionId 的当前 Claw 目标", () => {
    expect(
      normalizeAgentAppRightSurfaceLaunchTarget({
        workspaceId: "",
        sessionId: "session-main",
      }),
    ).toEqual({
      sessionId: "session-main",
    });
  });
});
