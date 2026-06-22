import { describe, expect, it } from "vitest";
import {
  applyWorkspaceRightSurfaceCommand,
  resolveWorkspaceRightSurfaceCommandSource,
} from "./rightSurfaceCommand";
import { buildRightSurfaceState } from "./rightSurfaceState";

describe("rightSurfaceCommand", () => {
  it("应把 skill 与 MCP tool origin 收敛为 runtime source", () => {
    expect(resolveWorkspaceRightSurfaceCommandSource("skill")).toBe("runtime");
    expect(resolveWorkspaceRightSurfaceCommandSource("mcpTool")).toBe(
      "runtime",
    );
    expect(resolveWorkspaceRightSurfaceCommandSource("route")).toBe("route");
  });

  it("skill 命令应通过 runtime source 打开已注册 surface", () => {
    const next = applyWorkspaceRightSurfaceCommand(
      buildRightSurfaceState(null, "user"),
      {
        action: "open",
        kind: "files",
        origin: "skill",
        layoutVariant: "expanded",
      },
    );

    expect(next).toEqual({
      activeSurface: "files",
      previousSurface: null,
      source: "runtime",
      layoutVariant: "expanded",
    });
  });

  it("MCP tool 命令应通过 runtime source 打开 shell surface", () => {
    const next = applyWorkspaceRightSurfaceCommand(
      buildRightSurfaceState("expertInfo", "user"),
      {
        action: "open",
        kind: "shell",
        origin: "mcpTool",
      },
    );

    expect(next).toMatchObject({
      activeSurface: "shell",
      previousSurface: "expertInfo",
      source: "runtime",
    });
  });

  it("route 命令仍不能越过 registry source 规则打开 shell", () => {
    const current = buildRightSurfaceState("expertInfo", "user");

    expect(
      applyWorkspaceRightSurfaceCommand(current, {
        action: "open",
        kind: "shell",
        origin: "route",
      }),
    ).toBe(current);
  });

  it("关闭命令应保留当前 surface 作为 previousSurface", () => {
    expect(
      applyWorkspaceRightSurfaceCommand(
        buildRightSurfaceState("harness", "runtime"),
        {
          action: "close",
          origin: "mcpTool",
        },
      ),
    ).toMatchObject({
      activeSurface: null,
      previousSurface: "harness",
      source: "runtime",
    });
  });
});
