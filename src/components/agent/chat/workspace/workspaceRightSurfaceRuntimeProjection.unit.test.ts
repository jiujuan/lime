import { describe, expect, it } from "vitest";
import { buildRightSurfaceState } from "./right-surface";
import {
  buildWorkspaceRightSurfaceRuntimeAvailableSurfaces,
  buildWorkspaceRightSurfaceRuntimeLaunchers,
  buildWorkspaceRightSurfaceRuntimePendingIntents,
} from "./workspaceRightSurfaceRuntimeProjection";

describe("workspaceRightSurfaceRuntimeProjection", () => {
  it("应按 harness pending 与文件预览生成 runtime pending intents", () => {
    const intents = buildWorkspaceRightSurfaceRuntimePendingIntents({
      createdAt: 100,
      harnessPendingCount: 2,
      objectCanvasCandidateId: "browser assist",
      preferredServiceSkillResultFileTargetRelativePath: "result.md",
      showHarnessToggle: true,
      suppressHomeNavbarUtilityActions: false,
    });

    expect(intents.map((intent) => intent.command.kind)).toEqual([
      "harness",
      "harness",
      "files",
      "objectCanvas",
    ]);
  });

  it("隐藏 navbar utility actions 时不生成 harness pending intents", () => {
    const intents = buildWorkspaceRightSurfaceRuntimePendingIntents({
      createdAt: 100,
      harnessPendingCount: 2,
      objectCanvasCandidateId: null,
      preferredServiceSkillResultFileTargetRelativePath: null,
      showHarnessToggle: true,
      suppressHomeNavbarUtilityActions: true,
    });

    expect(intents).toEqual([]);
  });

  it("应按专家信息与 harness 可见性生成可用 surface 集合", () => {
    expect(
      Array.from(
        buildWorkspaceRightSurfaceRuntimeAvailableSurfaces({
          filesAvailable: true,
          hasExpertInfoPanel: true,
          shellAvailable: true,
          showHarnessToggle: true,
          suppressHomeNavbarUtilityActions: false,
        }),
      ),
    ).toEqual(["workbench", "expertInfo", "files", "shell", "harness"]);
  });

  it("launcher 应聚合 pending 数量并禁用不可用 surface", () => {
    const pendingIntents = buildWorkspaceRightSurfaceRuntimePendingIntents({
      createdAt: 100,
      harnessPendingCount: 1,
      objectCanvasCandidateId: "browser assist",
      preferredServiceSkillResultFileTargetRelativePath: "result.md",
      showHarnessToggle: true,
      suppressHomeNavbarUtilityActions: false,
    });
    const launchers = buildWorkspaceRightSurfaceRuntimeLaunchers({
      surfaceState: buildRightSurfaceState("workbench", "user"),
      pendingIntents,
      filesAvailable: false,
      hasExpertInfoPanel: false,
      shellAvailable: true,
      showHarnessToggle: true,
      suppressHomeNavbarUtilityActions: false,
    });

    expect(
      launchers.find((launcher) => launcher.kind === "workbench"),
    ).toMatchObject({ active: true, disabled: false });
    expect(
      launchers.find((launcher) => launcher.kind === "harness"),
    ).toMatchObject({ pendingCount: 1, disabled: false });
    expect(
      launchers.find((launcher) => launcher.kind === "shell"),
    ).toMatchObject({ disabled: false });
    expect(
      launchers.find((launcher) => launcher.kind === "files"),
    ).toMatchObject({ pendingCount: 1, disabled: true });
    expect(
      launchers.find((launcher) => launcher.kind === "objectCanvas"),
    ).toMatchObject({ pendingCount: 1, disabled: true });
    expect(
      launchers.find((launcher) => launcher.kind === "expertInfo"),
    ).toMatchObject({ disabled: true });
  });

  it("files 可用时应让文件 surface launcher 可点击并保留 pending 数量", () => {
    const pendingIntents = buildWorkspaceRightSurfaceRuntimePendingIntents({
      createdAt: 100,
      harnessPendingCount: 0,
      objectCanvasCandidateId: null,
      preferredServiceSkillResultFileTargetRelativePath: "result.md",
      showHarnessToggle: true,
      suppressHomeNavbarUtilityActions: false,
    });
    const launchers = buildWorkspaceRightSurfaceRuntimeLaunchers({
      surfaceState: buildRightSurfaceState("files", "user"),
      pendingIntents,
      filesAvailable: true,
      hasExpertInfoPanel: false,
      shellAvailable: false,
      showHarnessToggle: false,
      suppressHomeNavbarUtilityActions: false,
    });

    expect(launchers.find((launcher) => launcher.kind === "files")).toMatchObject({
      active: true,
      disabled: false,
      pendingCount: 1,
    });
  });
});
