import { beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale, getLimeI18n } from "@/i18n/createI18n";
import {
  buildTeamWorkspaceBoardCopy,
  buildTeamWorkspaceBoardSurfaceClassNames,
  resolveTeamWorkspaceBoardCopyState,
  type TeamWorkspaceBoardCopy,
  type TeamWorkspaceBoardTranslate,
} from "./teamWorkspaceBoardPresentationSelectors";

describe("teamWorkspaceBoardPresentationSelectors", () => {
  let boardCopy: TeamWorkspaceBoardCopy;

  beforeEach(async () => {
    await changeLimeLocale("en-US");
    const translate: TeamWorkspaceBoardTranslate = (key, options) =>
      String(
        getLimeI18n().t(
          key as never,
          {
            ns: "agent",
            ...(options ?? {}),
          } as never,
        ),
      );
    boardCopy = buildTeamWorkspaceBoardCopy({
      locale: "en-US",
      translate,
    });
  });

  it("应为无真实成员画布的 schedule 状态返回稳定文案", () => {
    expect(
      resolveTeamWorkspaceBoardCopyState({
        copy: boardCopy,
        detailExpanded: false,
        dispatchPreviewStatus: "forming",
        hasRuntimeSessions: false,
        isChildSession: false,
        isEmptyShellState: false,
        shellExpanded: false,
        visibleSessionsCount: 0,
      }),
    ).toMatchObject({
      detailToggleLabel: "View details",
      detailVisible: false,
      memberCanvasTitle: "Current progress",
    });

    expect(
      resolveTeamWorkspaceBoardCopyState({
        copy: boardCopy,
        detailExpanded: false,
        dispatchPreviewStatus: "forming",
        hasRuntimeSessions: false,
        isChildSession: false,
        isEmptyShellState: false,
        shellExpanded: false,
        visibleSessionsCount: 0,
      }).memberCanvasSubtitle,
    ).toContain("Preparing the current task split");
    expect(
      resolveTeamWorkspaceBoardCopyState({
        copy: boardCopy,
        detailExpanded: false,
        dispatchPreviewStatus: "failed",
        hasRuntimeSessions: false,
        isChildSession: false,
        isEmptyShellState: false,
        shellExpanded: false,
        visibleSessionsCount: 0,
      }).memberCanvasSubtitle,
    ).toContain("task split failed");
  });

  it("应为真实任务画布与嵌入态返回紧凑壳层样式", () => {
    const copyState = resolveTeamWorkspaceBoardCopyState({
      copy: boardCopy,
      detailExpanded: false,
      dispatchPreviewStatus: null,
      hasRuntimeSessions: true,
      isChildSession: false,
      isEmptyShellState: false,
      shellExpanded: false,
      visibleSessionsCount: 3,
    });
    const classNames = buildTeamWorkspaceBoardSurfaceClassNames({
      className: "custom-shell",
      detailVisible: false,
      embedded: true,
      selectedSessionStatusCardClassName: "border-sky-200 bg-white",
      selectedSessionVisible: true,
      useCompactCanvasChrome: true,
    });

    expect(copyState.memberCanvasSubtitle).toContain(
      "3 current progress lane(s) connected",
    );
    expect(classNames.boardShellClassName).toContain(
      "lime-workbench-theme-scope",
    );
    expect(classNames.boardShellClassName).toContain(
      "lime-workbench-surface-scope",
    );
    expect(classNames.boardShellClassName).toContain("rounded-[24px]");
    expect(classNames.boardShellClassName).toContain("border-slate-200");
    expect(classNames.boardShellClassName).toContain("bg-white");
    expect(classNames.boardShellClassName).toContain("custom-shell");
    expect(classNames.boardHeaderClassName).toContain("sticky top-0");
    expect(classNames.boardHeaderClassName).toContain("z-40");
    expect(classNames.canvasStageHeight).toBe("clamp(560px, 76vh, 980px)");
    expect(classNames.detailCardClassName).toContain("rounded-[20px]");
    expect(classNames.railCardClassName).toContain("space-y-3");
  });
});
