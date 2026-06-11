import { describe, expect, it } from "vitest";
import type { CuratedTaskReferenceEntry } from "../utils/curatedTaskReferenceSelection";
import type { CreationReplaySurfaceModel } from "../utils/creationReplaySurface";
import {
  buildEmptyStateProjectConversationGroups,
  buildEmptyStateQuickActionItems,
  buildRecentSessionSupplementalAction,
  resolveEffectiveCuratedTaskReferences,
  resolveGuideHelpLabel,
  resolveRecentSessionLinkModel,
  shouldExposeHomeInputSuggestions,
  truncateEmptyStatePrompt,
} from "./EmptyStateViewModel";

function referenceEntry(
  overrides: Partial<CuratedTaskReferenceEntry> = {},
): CuratedTaskReferenceEntry {
  return {
    id: "memory-1",
    title: "品牌风格样本",
    summary: "保留轻盈但专业的表达。",
    category: "context",
    categoryLabel: "参考",
    tags: ["品牌"],
    ...overrides,
  };
}

function replaySurface(
  overrides: Partial<CreationReplaySurfaceModel> = {},
): CreationReplaySurfaceModel {
  return {
    kind: "memory_entry",
    eyebrow: "当前带入灵感",
    badgeLabel: "参考",
    title: "品牌风格样本",
    summary: "保留轻盈但专业的表达。",
    hint: "后续结果模板会默认把它一起带入。",
    defaultReferenceMemoryIds: ["memory-1"],
    defaultReferenceEntries: [referenceEntry()],
    ...overrides,
  };
}

describe("EmptyStateViewModel", () => {
  it("应裁剪并规范化 prompt 预览", () => {
    expect(truncateEmptyStatePrompt("  需求   澄清  ")).toBe("需求 澄清");
    expect(truncateEmptyStatePrompt("abcdef", 3)).toBe("abc…");
  });

  it("应优先使用显式 curated task 默认引用，其次使用 creation replay", () => {
    const explicitEntry = referenceEntry({ id: "explicit" });
    expect(
      resolveEffectiveCuratedTaskReferences({
        defaultCuratedTaskReferenceMemoryIds: ["explicit"],
        defaultCuratedTaskReferenceEntries: [explicitEntry],
        creationReplaySurface: replaySurface(),
      }),
    ).toEqual({
      effectiveDefaultCuratedTaskReferenceMemoryIds: ["explicit"],
      effectiveDefaultCuratedTaskReferenceEntries: [explicitEntry],
    });

    expect(
      resolveEffectiveCuratedTaskReferences({
        creationReplaySurface: replaySurface({
          defaultReferenceMemoryIds: ["from-replay"],
          defaultReferenceEntries: [referenceEntry({ id: "from-replay" })],
        }),
      }),
    ).toMatchObject({
      effectiveDefaultCuratedTaskReferenceMemoryIds: ["from-replay"],
      effectiveDefaultCuratedTaskReferenceEntries: [{ id: "from-replay" }],
    });
  });

  it("应构造前四个快速推荐项并使用主题 badge", () => {
    const items = buildEmptyStateQuickActionItems({
      activeTheme: "general",
      recommendations: [
        ["一", "  第一条    很长的提示  "],
        ["二", "第二条"],
        ["三", "第三条"],
        ["四", "第四条"],
        ["五", "第五条"],
      ],
      resolveBadge: (icon) => `推荐 ${icon}`,
    });

    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({
      key: "general-一",
      title: "一",
      description: "第一条 很长的提示",
      badge: "推荐 ✨",
      prompt: "  第一条    很长的提示  ",
    });
  });

  it("应根据引导帮助 starter 派生上下文 label", () => {
    expect(
      resolveGuideHelpLabel({
        starterChips: [
          {
            id: "guide",
            label: "Lime 使用指南",
            launchKind: "toggle_guide",
          },
        ],
        contextLabel: "Lime 引导帮助",
        contextLabelWithStarter: (label) => `正在查看 ${label}`,
      }),
    ).toBe("正在查看 Lime 使用指南");

    expect(
      resolveGuideHelpLabel({
        starterChips: [],
        contextLabel: "Lime 引导帮助",
        contextLabelWithStarter: (label) => `正在查看 ${label}`,
      }),
    ).toBe("Lime 引导帮助");
  });

  it("应生成最近会话入口 label/title，并控制 supplemental action 是否存在", () => {
    const linkModel = resolveRecentSessionLinkModel({
      recentSessionTitle: "品牌发布节奏整理",
      recentSessionSummary: "已整理到待确认发布标题这一步。",
      recentSessionActionLabel: "继续最近会话",
      defaultActionLabel: "继续",
    });

    expect(linkModel).toEqual({
      recentSessionLinkLabel: "继续最近会话 · 品牌发布节奏整理",
      recentSessionLinkTitle:
        "品牌发布节奏整理 · 已整理到待确认发布标题这一步。",
    });
    expect(
      buildRecentSessionSupplementalAction({
        recentSessionTitle: "品牌发布节奏整理",
        recentSessionLinkLabel: linkModel.recentSessionLinkLabel,
        recentSessionLinkTitle: linkModel.recentSessionLinkTitle,
        hasResumeHandler: true,
      }),
    ).toEqual({
      id: "recent-session",
      label: "继续最近会话 · 品牌发布节奏整理",
      title: "品牌发布节奏整理 · 已整理到待确认发布标题这一步。",
      testId: "entry-recent-session-resume",
    });
    expect(
      buildRecentSessionSupplementalAction({
        recentSessionTitle: "品牌发布节奏整理",
        recentSessionLinkLabel: linkModel.recentSessionLinkLabel,
        recentSessionLinkTitle: linkModel.recentSessionLinkTitle,
        hasResumeHandler: false,
      }),
    ).toBeNull();
  });

  it("应按项目生成空态会话目录并过滤当前会话和空草稿", () => {
    const groups = buildEmptyStateProjectConversationGroups({
      currentProjectId: "project-current",
      currentSessionId: "topic-current",
      openedProjects: [
        { id: "project-current", name: "当前项目" },
        { id: "project-other", name: "另一个项目" },
      ],
      topics: [
        {
          id: "topic-other-project",
          title: "另一个项目的对话",
          workspaceId: "project-other",
          messagesCount: 3,
          status: "done",
          statusReason: "default",
          lastPreview: "已经整理出可继续的结果。",
          createdAt: new Date("2026-05-01T00:00:00Z"),
          updatedAt: new Date("2026-05-03T00:00:00Z"),
        },
        {
          id: "topic-current",
          title: "当前打开的对话",
          workspaceId: "project-current",
          messagesCount: 5,
          status: "done",
          createdAt: new Date("2026-05-02T00:00:00Z"),
          updatedAt: new Date("2026-05-04T00:00:00Z"),
        },
        {
          id: "topic-current-project",
          title: "当前项目的对话",
          workspaceId: "project-current",
          messagesCount: 2,
          status: "done",
          statusReason: "workspace_error",
          lastPreview: "继续修复工作区。",
          createdAt: new Date("2026-05-01T00:00:00Z"),
          updatedAt: new Date("2026-05-02T00:00:00Z"),
        },
        {
          id: "topic-empty-draft",
          title: "空草稿",
          workspaceId: "project-current",
          messagesCount: 0,
          status: "draft",
          createdAt: new Date("2026-05-05T00:00:00Z"),
          updatedAt: new Date("2026-05-05T00:00:00Z"),
        },
      ],
    });

    expect(groups).toEqual([
      {
        projectId: "project-current",
        projectName: "当前项目",
        conversations: [
          {
            id: "topic-current-project",
            title: "当前项目的对话",
            summary: "继续修复工作区。",
            statusReason: "workspace_error",
          },
        ],
      },
      {
        projectId: "project-other",
        projectName: "另一个项目",
        conversations: [
          {
            id: "topic-other-project",
            title: "另一个项目的对话",
            summary: "已经整理出可继续的结果。",
            statusReason: "default",
          },
        ],
      },
    ]);
  });

  it("站点技能自动启动或引导帮助模式应隐藏 composer 起手建议", () => {
    expect(
      shouldExposeHomeInputSuggestions({
        hasAutoLaunchSiteSkill: false,
        guideHelpActive: false,
      }),
    ).toBe(true);
    expect(
      shouldExposeHomeInputSuggestions({
        hasAutoLaunchSiteSkill: true,
        guideHelpActive: false,
      }),
    ).toBe(false);
    expect(
      shouldExposeHomeInputSuggestions({
        hasAutoLaunchSiteSkill: false,
        guideHelpActive: true,
      }),
    ).toBe(false);
  });
});
