import { beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale, getLimeI18n } from "@/i18n/createI18n";
import {
  buildTeamWorkspaceFormationCopy,
  buildRuntimeFormationDisplayState,
  buildSelectedTeamPlanDisplayState,
  type TeamWorkspaceFormationCopy,
  type TeamWorkspaceFormationTranslate,
} from "./formationDisplaySelectors";

describe("formationDisplaySelectors", () => {
  let formationCopy: TeamWorkspaceFormationCopy;

  beforeEach(async () => {
    await changeLimeLocale("en-US");
    const translate: TeamWorkspaceFormationTranslate = (key, options) =>
      String(
        getLimeI18n().t(
          key as never,
          {
            ns: "agent",
            ...(options ?? {}),
          } as never,
        ),
      );
    formationCopy = buildTeamWorkspaceFormationCopy({
      locale: "en-US",
      translate,
    });
  });

  it("已选 Team 但无 runtime formation 时，应产出计划分工展示模型", () => {
    const state = buildSelectedTeamPlanDisplayState({
      copy: formationCopy,
      selectedTeamLabel: "代码排障团队",
      selectedTeamSummary: "分析、执行、验证三段式推进。",
      selectedTeamRoles: [
        {
          id: "explorer",
          label: "分析",
          summary: "负责收敛问题边界。",
        },
      ],
    });

    expect(state.hasSelectedTeamPlan).toBe(true);
    expect(state.summaryBadges.map((badge) => badge.text)).toEqual([
      "Team plan · 代码排障团队",
      "1 planned role(s)",
    ]);
    expect(formationCopy.detailRoleSectionPlanLabel).toBe("Role plan");
    expect(state.roleCards).toEqual([
      {
        id: "explorer",
        label: "分析",
        summary: "负责收敛问题边界。",
      },
    ]);
  });

  it("runtime formation 已就绪时，应产出状态、当前进展与参考分工", () => {
    const state = buildRuntimeFormationDisplayState({
      copy: formationCopy,
      teamDispatchPreviewState: {
        requestId: "runtime-1",
        status: "formed",
        label: "修复 Team",
        summary: "分析、执行、验证协作闭环。",
        members: [
          {
            id: "member-1",
            label: "分析",
            summary: "收敛问题边界。",
            skillIds: [],
            status: "planned",
          },
        ],
        blueprint: {
          label: "代码排障团队",
          summary: "分析、执行、验证三段式推进。",
          roles: [
            {
              id: "explorer",
              label: "分析",
              summary: "先定位问题与影响面。",
            },
          ],
        },
        updatedAt: Date.now(),
      },
    });

    expect(state.hasRuntimeFormation).toBe(true);
    expect(state.hint).toContain("team split is ready");
    expect(state.summaryBadges.map((badge) => badge.text)).toEqual([
      "Team plan · 修复分工方案",
      "Ready",
      "1 active progress item(s)",
      "Reference plan · 代码排障团队",
    ]);
    expect(formationCopy.formatTaskCountBadge(2)).toBe("2 task(s)");
    expect(formationCopy.detailHintRuntimeWithReference).toBe(
      "View the current task split and reference plan",
    );
    expect(state.panelHeadline).toBe("Team split is ready");
    expect(state.memberCards[0]).toMatchObject({
      label: "分析",
      badgeLabel: "Planned",
    });
    expect(state.blueprintRoleCards[0]).toMatchObject({
      label: "分析",
      summary: "先定位问题与影响面。",
    });
    expect(state.noticeText).toContain("team plan is ready");
    expect(state.noticeText).toContain("current progress");
  });

  it("runtime formation 失败时，应优先使用失败原因", () => {
    const state = buildRuntimeFormationDisplayState({
      copy: formationCopy,
      teamDispatchPreviewState: {
        requestId: "runtime-2",
        status: "failed",
        label: "失败的 Team",
        summary: null,
        members: [],
        blueprint: null,
        errorMessage: "Provider 认证失败，无法生成 Team。",
        updatedAt: Date.now(),
      },
    });

    expect(state.panelDescription).toBe(
      "Provider 认证失败，无法生成分工方案。",
    );
    expect(state.emptyDetail).toBe("Provider 认证失败，无法生成分工方案。");
    expect(state.noticeText).toBe("Provider 认证失败，无法生成分工方案。");
  });
});
