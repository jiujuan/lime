import { describe, expect, it } from "vitest";
import {
  buildPluginRightSurfaceLaunchTargetOptions,
  getPluginRightSurfaceLaunchTargetId,
  normalizePluginRightSurfaceLaunchTarget,
  resolvePluginLaunchTargetPolicy,
} from "./pluginLaunchTargetPolicy";

describe("pluginLaunchTargetPolicy", () => {
  it("默认把启动目标收敛到独立窗口", () => {
    const policy = resolvePluginLaunchTargetPolicy({
      mode: "standalone",
      rightSurfaceTarget: {
        workspaceId: "workspace-main",
        sessionId: "session-main",
      },
    });

    expect(policy).toMatchObject({
      mode: "standalone",
      rightSurfaceAvailable: true,
      rightSurfaceTarget: null,
    });
    expect(policy.rightSurfaceTargetId).toBe(
      "workspace=workspace-main&session=session-main",
    );
    expect(policy.rightSurfaceTargets).toHaveLength(1);
  });

  it("只有显式选择右侧且 Claw target 有效时才返回投递目标", () => {
    const policy = resolvePluginLaunchTargetPolicy({
      mode: "rightSurface",
      rightSurfaceTarget: {
        workspaceId: " workspace-main ",
        sessionId: " session-main ",
      },
    });

    expect(policy).toMatchObject({
      mode: "rightSurface",
      rightSurfaceAvailable: true,
      rightSurfaceTarget: {
        workspaceId: "workspace-main",
        sessionId: "session-main",
      },
    });
    expect(policy.rightSurfaceTargetId).toBe(
      "workspace=workspace-main&session=session-main",
    );
  });

  it("右侧 target 缺失时回退独立窗口", () => {
    const policy = resolvePluginLaunchTargetPolicy({
      mode: "rightSurface",
      rightSurfaceTarget: {
        workspaceId: " ",
        sessionId: null,
      },
    });

    expect(policy).toEqual({
      mode: "standalone",
      rightSurfaceAvailable: false,
      rightSurfaceTarget: null,
      rightSurfaceTargetId: null,
      rightSurfaceTargets: [],
    });
  });

  it("保留仅 sessionId 的当前 Claw 目标", () => {
    expect(
      normalizePluginRightSurfaceLaunchTarget({
        workspaceId: "",
        sessionId: "session-main",
      }),
    ).toEqual({
      sessionId: "session-main",
    });
  });

  it("为多个 Claw 目标生成稳定选项并按 id 去重", () => {
    const options = buildPluginRightSurfaceLaunchTargetOptions({
      rightSurfaceTarget: {
        workspaceId: "workspace-main",
        sessionId: "session-main",
        label: "主会话",
      },
      rightSurfaceTargets: [
        {
          workspaceId: "workspace-main",
          sessionId: "session-main",
          label: "重复会话",
        },
        {
          workspaceId: "workspace-main",
          sessionId: "session-review",
          title: "复盘会话",
          description: "历史对话",
        },
      ],
    });

    expect(options).toEqual([
      {
        id: "workspace=workspace-main&session=session-main",
        label: "主会话",
        description: null,
        target: {
          workspaceId: "workspace-main",
          sessionId: "session-main",
          label: "主会话",
        },
      },
      {
        id: "workspace=workspace-main&session=session-review",
        label: "复盘会话",
        description: "历史对话",
        target: {
          workspaceId: "workspace-main",
          sessionId: "session-review",
          title: "复盘会话",
          description: "历史对话",
        },
      },
    ]);
  });

  it("按 selected target id 解析具体 Claw 会话", () => {
    const selectedRightSurfaceTargetId =
      getPluginRightSurfaceLaunchTargetId({
        workspaceId: "workspace-main",
        sessionId: "session-review",
      });

    expect(
      resolvePluginLaunchTargetPolicy({
        mode: "rightSurface",
        selectedRightSurfaceTargetId,
        rightSurfaceTargets: [
          {
            workspaceId: "workspace-main",
            sessionId: "session-main",
          },
          {
            workspaceId: "workspace-main",
            sessionId: "session-review",
          },
        ],
      }).rightSurfaceTarget,
    ).toEqual({
      workspaceId: "workspace-main",
      sessionId: "session-review",
    });
  });
});
