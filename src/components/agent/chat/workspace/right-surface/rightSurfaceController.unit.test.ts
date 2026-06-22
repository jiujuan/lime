import { describe, expect, it } from "vitest";
import {
  canOpenWorkspaceRightSurface,
  closeWorkspaceRightSurface,
  openWorkspaceRightSurface,
} from "./rightSurfaceController";
import { buildRightSurfaceState } from "./rightSurfaceState";

describe("rightSurfaceController", () => {
  it("应按 registry source 规则判断 surface 是否可打开", () => {
    expect(canOpenWorkspaceRightSurface("expertInfo", "route")).toBe(true);
    expect(canOpenWorkspaceRightSurface("shell", "route")).toBe(false);
    expect(canOpenWorkspaceRightSurface("shell", "runtime")).toBe(true);
  });

  it("打开 surface 时应记录前一个 active surface", () => {
    const current = buildRightSurfaceState("expertInfo", "user");

    const next = openWorkspaceRightSurface(current, {
      kind: "files",
      source: "runtime",
      layoutVariant: "expanded",
    });

    expect(next).toEqual({
      activeSurface: "files",
      previousSurface: "expertInfo",
      source: "runtime",
      layoutVariant: "expanded",
    });
  });

  it("不允许的来源不应改变当前 surface", () => {
    const current = buildRightSurfaceState("expertInfo", "user");

    expect(
      openWorkspaceRightSurface(current, {
        kind: "shell",
        source: "route",
      }),
    ).toBe(current);
  });

  it("关闭 surface 时应把当前 surface 写入 previousSurface", () => {
    const current = buildRightSurfaceState("shell", "runtime");

    expect(closeWorkspaceRightSurface(current, { source: "user" })).toEqual({
      activeSurface: null,
      previousSurface: "shell",
      source: "user",
      layoutVariant: "docked",
    });
  });
});
