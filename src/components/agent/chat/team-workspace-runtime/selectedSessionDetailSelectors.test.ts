import { describe, expect, it } from "vitest";
import { changeLimeLocale, getLimeI18n } from "@/i18n/createI18n";
import {
  buildSelectedSessionDetailCopy,
  buildSelectedSessionDetailDisplayState,
  type SelectedSessionDetailTranslate,
} from "./selectedSessionDetailSelectors";

async function buildEnglishSelectedSessionDetailCopy() {
  await changeLimeLocale("en-US");
  const translate: SelectedSessionDetailTranslate = (key, options) =>
    String(
      getLimeI18n().t(
        key as never,
        {
          ns: "agent",
          ...(options ?? {}),
        } as never,
      ),
    );

  return buildSelectedSessionDetailCopy({
    locale: "en-US",
    translate,
  });
}

describe("selectedSessionDetailSelectors", () => {
  it("应稳定产出选中成员详情区的 metadata、设置与技能标签", () => {
    const state = buildSelectedSessionDetailDisplayState({
      selectedSession: {
        blueprintRoleLabel: "执行",
        createdFromTurnId: "turn-42",
        latestTurnStatus: "running",
        model: "gpt-5.4",
        originTool: "spawn_agent",
        outputContract: "请输出可执行的 patch 与验证结论。",
        profileName: "代码执行员",
        providerConcurrencyGroup: "openai",
        providerName: "OpenAI",
        providerParallelBudget: 1,
        queueReason: "等待上游并发窗口。",
        queuedTurnCount: 1,
        roleKey: "executor",
        sessionType: "sub_agent",
        skills: [
          {
            id: "bounded-implementation",
            name: "边界实现",
            description: "只改明确授权的边界。",
          },
          {
            id: "verification-report",
            name: "验证汇报",
            directory: "verification-report",
          },
        ],
        teamActiveCount: 1,
        teamParallelBudget: 3,
        teamPresetId: "code-triage-team",
        theme: "engineering",
      },
      isChildSession: true,
      parentSessionName: "主线程总览",
    });

    expect(state.runtimeDetailSummary).toBe(
      "等待中 1 · 最近进展 处理中 · 处理中 1/3 · 稳妥模式",
    );
    expect(state.queueReason).toBe("等待上游并发窗口。");
    expect(state.metadata).toEqual([
      "分工 执行",
      "子任务",
      "服务 OpenAI",
      "模型 gpt-5.4",
      "来源 spawn_agent",
      "来自之前的任务 turn-42",
      "等待中 1",
      "处理中 1/3",
      "稳妥模式",
      "最近进展 处理中",
      "来自 主线程总览",
    ]);
    expect(state.settingBadges).toEqual([
      "预设 代码排障团队",
      "风格 代码执行员",
      "分工 执行",
      "主题 engineering",
    ]);
    expect(state.outputContract).toBe("请输出可执行的 patch 与验证结论。");
    expect(state.skillBadges).toEqual([
      {
        id: "bounded-implementation",
        label: "边界实现",
        title: "只改明确授权的边界。",
      },
      {
        id: "verification-report",
        label: "验证汇报",
        title: "verification-report",
      },
    ]);
    expect(state.hasSettings).toBe(true);
  });

  it("未知预设应保留原始 id，且无内容时不展示设置区", () => {
    const state = buildSelectedSessionDetailDisplayState({
      selectedSession: {
        teamPresetId: "custom-ops-team",
        roleKey: "unknown-role",
      },
      isChildSession: false,
    });

    expect(state.settingBadges).toEqual(["预设 custom-ops-team"]);
    expect(state.metadata).toEqual([]);
    expect(state.hasSettings).toBe(true);
  });

  it("没有会话时应返回空展示模型", () => {
    const state = buildSelectedSessionDetailDisplayState({
      selectedSession: null,
      isChildSession: false,
    });

    expect(state).toEqual({
      runtimeDetailSummary: null,
      queueReason: null,
      metadata: [],
      settingBadges: [],
      outputContract: null,
      skillBadges: [],
      hasSettings: false,
    });
  });

  it("应支持注入英文详情 copy 且保留运行时业务数据", async () => {
    const copy = await buildEnglishSelectedSessionDetailCopy();

    const state = buildSelectedSessionDetailDisplayState({
      copy,
      selectedSession: {
        blueprintRoleLabel: "执行",
        createdFromTurnId: "turn-42",
        latestTurnStatus: "running",
        model: "gpt-5.4",
        originTool: "spawn_agent",
        outputContract: "Keep runtime contract.",
        profileName: "代码执行员",
        providerConcurrencyGroup: "openai",
        providerName: "OpenAI",
        providerParallelBudget: 1,
        queueReason: "Runtime queue reason.",
        queuedTurnCount: 1,
        roleKey: "executor",
        sessionType: "sub_agent",
        skills: [
          {
            id: "bounded-implementation",
            name: "边界实现",
            description: "只改明确授权的边界。",
          },
        ],
        teamActiveCount: 1,
        teamParallelBudget: 3,
        teamPresetId: "code-triage-team",
        theme: "engineering",
      },
      isChildSession: true,
      parentSessionName: "主线程总览",
    });

    expect(state.runtimeDetailSummary).toBe(
      "Waiting 1 · Latest progress Running · Running 1/3 · Steady mode",
    );
    expect(state.metadata).toEqual([
      "Role 执行",
      "Subtask",
      "Provider OpenAI",
      "Model gpt-5.4",
      "Source spawn_agent",
      "From earlier task turn-42",
      "Waiting 1",
      "Running 1/3",
      "Steady mode",
      "Latest progress Running",
      "From 主线程总览",
    ]);
    expect(state.settingBadges).toEqual([
      "Plan Code triage team",
      "Style 代码执行员",
      "Role Execution",
      "Theme engineering",
    ]);
    expect(state.outputContract).toBe("Keep runtime contract.");
    expect(state.skillBadges).toEqual([
      {
        id: "bounded-implementation",
        label: "边界实现",
        title: "只改明确授权的边界。",
      },
    ]);
  });
});
