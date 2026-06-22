import { describe, expect, it } from "vitest";
import type { OpenedProjectSummary } from "../hooks/useOpenedProjectSummaries";
import { resolveFallbackOpenedProjectId } from "./useWorkspaceOpenedProjectsRuntime";

function project(id: string): OpenedProjectSummary {
  return {
    id,
    name: id,
  };
}

describe("resolveFallbackOpenedProjectId", () => {
  it("关闭当前项目后应优先选择仍打开的其他项目", () => {
    expect(
      resolveFallbackOpenedProjectId({
        openedProjects: [project("current"), project("next-opened")],
        remainingStoredProjectIds: ["stored-a"],
        closingProjectId: "current",
      }),
    ).toBe("next-opened");
  });

  it("没有可见 opened project 时应回退到持久化列表里的其他项目", () => {
    expect(
      resolveFallbackOpenedProjectId({
        openedProjects: [project("current")],
        remainingStoredProjectIds: ["current", "stored-a"],
        closingProjectId: "current",
      }),
    ).toBe("stored-a");
  });

  it("候选项目只剩被关闭项目时应返回 null", () => {
    expect(
      resolveFallbackOpenedProjectId({
        openedProjects: [project("current")],
        remainingStoredProjectIds: ["current"],
        closingProjectId: "current",
      }),
    ).toBeNull();
  });

  it("应忽略空白候选项目 id", () => {
    expect(
      resolveFallbackOpenedProjectId({
        openedProjects: [project("current"), project(" ")],
        remainingStoredProjectIds: ["", "stored-a"],
        closingProjectId: "current",
      }),
    ).toBe("stored-a");
  });
});
