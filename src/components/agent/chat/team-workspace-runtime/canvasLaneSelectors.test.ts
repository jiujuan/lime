import { describe, expect, it } from "vitest";
import { agentEnUSResource } from "@/i18n/agentResources";
import {
  buildTeamWorkspaceCanvasLaneCopy,
  buildTeamWorkspaceCanvasLanes,
  type TeamWorkspaceCanvasLaneTranslate,
} from "./canvasLaneSelectors";

type EnAgentResourceKey = keyof typeof agentEnUSResource;

function interpolateResourceTemplate(
  template: string,
  values?: Record<string, unknown>,
) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    const value = values?.[name];
    return value == null ? match : String(value);
  });
}

function buildEnglishCanvasLaneCopy() {
  const translate: TeamWorkspaceCanvasLaneTranslate = (key, options) =>
    interpolateResourceTemplate(
      agentEnUSResource[key as EnAgentResourceKey],
      options,
    );

  return buildTeamWorkspaceCanvasLaneCopy({
    locale: "en-US",
    translate,
  });
}

describe("canvasLaneSelectors", () => {
  it("真实成员图应把 session lane 投影为稳定的展示模型", () => {
    const lanes = buildTeamWorkspaceCanvasLanes({
      hasRealTeamGraph: true,
      sessions: [
        {
          id: "child-1",
          name: "执行代理",
          runtimeStatus: "running",
          taskSummary: "补齐 runtime selector 收口。",
          roleHint: "executor",
          blueprintRoleLabel: "执行",
          profileId: "code-executor",
          profileName: "代码执行员",
          roleKey: "executor",
          teamPresetId: "code-triage-team",
          model: "gpt-5.4",
          skills: [
            {
              id: "repo-exploration",
              name: "仓库探索",
            },
            {
              id: "verification-report",
              name: "验证汇报",
            },
          ],
          latestTurnStatus: "running",
          queuedTurnCount: 2,
          teamParallelBudget: 3,
          teamActiveCount: 1,
          providerConcurrencyGroup: "openai",
          providerParallelBudget: 1,
        },
      ],
      runtimeMembers: [
        {
          id: "executor",
          label: "执行",
          summary: "负责落地改动。",
          profileId: "code-executor",
          roleKey: "executor",
          skillIds: [],
          status: "running",
        },
      ],
      plannedRoles: [
        {
          id: "executor",
          label: "执行",
          summary: "负责落地改动。",
          profileId: "code-executor",
          roleKey: "executor",
        },
      ],
      liveActivityBySessionId: {
        "child-1": [
          {
            id: "live-1",
            title: "工具 页面截图",
            detail: "页面结构差异已提取完成。",
            statusLabel: "完成",
            badgeClassName:
              "border border-emerald-200 bg-emerald-50 text-emerald-700",
          },
        ],
      },
      previewBySessionId: {
        "child-1": {
          preview: "回复：旧内容",
          entries: [
            {
              id: "stored-1",
              title: "回复",
              detail: "历史里的旧内容。",
              statusLabel: "消息",
              badgeClassName:
                "border border-slate-200 bg-slate-50 text-slate-600",
            },
          ],
          status: "ready",
        },
      },
      activityTimelineEntryLimit: 4,
    });

    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({
      id: "child-1",
      kind: "session",
      persistKey: "session:child-1",
      fallbackPersistKeys: ["runtime:executor", "planned:executor"],
      title: "执行代理",
      summary: "补齐 runtime selector 收口。",
      badgeLabel: "处理中",
      roleLabel: "执行",
      profileLabel: "代码执行员",
      presetLabel: "代码排障团队",
      modelLabel: "gpt-5.4",
      statusHint: "等待中 2 · 最近进展 处理中 · 处理中 1/3 · 稳妥模式",
      updatedAtLabel: "刚刚",
      skillLabels: ["仓库探索", "验证汇报"],
      previewText: "工具 页面截图：页面结构差异已提取完成。",
    });
    expect(lanes[0]?.previewEntries?.map((entry) => entry.id)).toEqual([
      "live-1",
      "stored-1",
    ]);
  });

  it("未形成真实成员图但已有 runtime member 时，应投影为 runtime lane", () => {
    const lanes = buildTeamWorkspaceCanvasLanes({
      hasRealTeamGraph: false,
      sessions: [],
      runtimeMembers: [
        {
          id: "writer",
          label: "写作",
          summary: "负责整理路线图结论。",
          profileId: "doc-writer",
          roleKey: "writer",
          skillIds: [],
          status: "running",
        },
      ],
      plannedRoles: [
        {
          id: "writer",
          label: "写作",
          summary: "把研究结果整理成方案。",
          profileId: "doc-writer",
          roleKey: "writer",
        },
      ],
      activityTimelineEntryLimit: 4,
    });

    expect(lanes).toEqual([
      expect.objectContaining({
        id: "writer",
        kind: "runtime",
        persistKey: "runtime:writer",
        fallbackPersistKeys: ["planned:writer"],
        title: "写作",
        badgeLabel: "正在处理",
        roleLabel: "撰写",
        statusHint: "这项任务正在处理",
        updatedAtLabel: "等待任务接手",
        previewText: "负责整理路线图结论。",
      }),
    ]);
  });

  it("没有 runtime member 时，应退回 planned lane", () => {
    const lanes = buildTeamWorkspaceCanvasLanes({
      hasRealTeamGraph: false,
      sessions: [],
      runtimeMembers: [],
      plannedRoles: [
        {
          id: "reviewer",
          label: "复核",
          summary: "补测试并确认风险。",
          roleKey: "reviewer",
        },
      ],
      activityTimelineEntryLimit: 4,
    });

    expect(lanes).toEqual([
      expect.objectContaining({
        id: "reviewer",
        kind: "planned",
        persistKey: "planned:reviewer",
        fallbackPersistKeys: [],
        title: "复核",
        badgeLabel: "待开始",
        roleLabel: "复核",
        statusHint: "等待系统把这项任务拆出来",
        updatedAtLabel: "计划分工",
        previewText: "补测试并确认风险。",
      }),
    ]);
  });

  it("应支持注入英文 canvas lane chrome copy 且不翻译运行时数据", () => {
    const copy = buildEnglishCanvasLaneCopy();

    const sessionLanes = buildTeamWorkspaceCanvasLanes({
      copy,
      hasRealTeamGraph: true,
      sessions: [
        {
          id: "child-en",
          name: "Runtime worker",
          runtimeStatus: "running",
          latestTurnStatus: "running",
          queuedTurnCount: 2,
          teamParallelBudget: 3,
          teamActiveCount: 1,
          providerConcurrencyGroup: "openai",
          providerParallelBudget: 1,
        },
      ],
      runtimeMembers: [],
      plannedRoles: [],
      previewBySessionId: {
        "child-en": {
          preview: null,
          entries: [],
          status: "loading",
        },
      },
      activityTimelineEntryLimit: 4,
    });

    expect(sessionLanes).toEqual([
      expect.objectContaining({
        id: "child-en",
        title: "Runtime worker",
        summary: "No task summary yet. Open details to view the full context.",
        badgeLabel: "Running",
        statusHint:
          "Waiting 2 · Latest progress Running · Running 1/3 · Steady mode",
        updatedAtLabel: "just now",
        previewText: "Syncing the latest content for this task...",
      }),
    ]);

    const plannedLanes = buildTeamWorkspaceCanvasLanes({
      copy,
      hasRealTeamGraph: false,
      sessions: [],
      runtimeMembers: [],
      plannedRoles: [
        {
          id: "reviewer",
          label: "Reviewer",
          summary: "Keep this runtime summary as data.",
          roleKey: "reviewer",
        },
      ],
      activityTimelineEntryLimit: 4,
    });

    expect(plannedLanes).toEqual([
      expect.objectContaining({
        title: "Reviewer",
        summary: "Keep this runtime summary as data.",
        badgeLabel: "Not started",
        statusHint: "Waiting for the system to split out this task",
        updatedAtLabel: "Planned assignment",
      }),
    ]);
  });
});
