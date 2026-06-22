import { describe, expect, it } from "vitest";
import {
  buildRightSurfaceState,
  isRightSurfaceOpen,
  resolveExpertInfoPanelCollapsedAfterLayoutChange,
  resolveWorkspaceRightSurfaceState,
} from "./rightSurfaceState";

describe("resolveWorkspaceRightSurfaceState", () => {
  it("工作台布局打开时 active surface 固定为 workbench", () => {
    expect(
      resolveWorkspaceRightSurfaceState({
        layoutMode: "chat-canvas",
        hasExpertInfo: true,
        expertInfoVisible: true,
      }).activeSurface,
    ).toBe("workbench");
  });

  it("纯聊天布局下专家可见时 active surface 为 expertInfo", () => {
    expect(
      resolveWorkspaceRightSurfaceState({
        layoutMode: "chat",
        hasExpertInfo: true,
        expertInfoVisible: true,
      }).activeSurface,
    ).toBe("expertInfo");
  });

  it("没有专家或专家隐藏时没有 active surface", () => {
    const state = resolveWorkspaceRightSurfaceState({
      layoutMode: "chat",
      hasExpertInfo: false,
      expertInfoVisible: true,
    });

    expect(state.activeSurface).toBeNull();
    expect(isRightSurfaceOpen(state)).toBe(false);
  });

  it("显式 runtime 请求应走 registry/controller 打开对应 surface", () => {
    expect(
      resolveWorkspaceRightSurfaceState({
        layoutMode: "chat",
        hasExpertInfo: false,
        expertInfoVisible: false,
        requestedSurface: "shell",
        source: "runtime",
      }),
    ).toMatchObject({
      activeSurface: "shell",
      previousSurface: null,
      source: "runtime",
      layoutVariant: "docked",
    });
  });

  it("显式 route 请求不允许打开未开放 route source 的 surface", () => {
    const current = buildRightSurfaceState("expertInfo", "user");

    expect(
      resolveWorkspaceRightSurfaceState({
        layoutMode: "chat",
        hasExpertInfo: true,
        expertInfoVisible: true,
        currentState: current,
        requestedSurface: "shell",
        source: "route",
      }),
    ).toBe(current);
  });

  it("显式关闭应把当前 surface 收到 previousSurface", () => {
    expect(
      resolveWorkspaceRightSurfaceState({
        layoutMode: "chat",
        hasExpertInfo: true,
        expertInfoVisible: false,
        currentState: buildRightSurfaceState("expertInfo", "user"),
        requestedSurface: null,
        source: "user",
      }),
    ).toMatchObject({
      activeSurface: null,
      previousSurface: "expertInfo",
      source: "user",
    });
  });
});

describe("resolveExpertInfoPanelCollapsedAfterLayoutChange", () => {
  it("离开纯聊天布局时应收起专家信息面板", () => {
    expect(
      resolveExpertInfoPanelCollapsedAfterLayoutChange({
        previousLayoutMode: "chat",
        nextLayoutMode: "chat-canvas",
        currentCollapsed: false,
      }),
    ).toBe(true);
  });

  it("从工作台回到纯聊天布局时不应自动恢复专家信息面板", () => {
    expect(
      resolveExpertInfoPanelCollapsedAfterLayoutChange({
        previousLayoutMode: "chat-canvas",
        nextLayoutMode: "chat",
        currentCollapsed: true,
      }),
    ).toBe(true);
  });
});
