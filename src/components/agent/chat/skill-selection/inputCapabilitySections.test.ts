import { beforeEach, describe, expect, it } from "vitest";
import type { Skill } from "@/lib/api/skills";
import type { ServiceSkillHomeItem } from "@/components/agent/chat/service-skills/types";
import type { CodexSlashCommandDefinition } from "../commands";
import type {
  BuiltinInputCommand,
  RuntimeSceneSlashCommand,
} from "./builtinCommands";
import {
  buildInputCapabilitySections,
  buildInputCapabilitySectionsCopy,
} from "./inputCapabilitySections";
import { recordMentionEntryUsage } from "./mentionEntryUsage";
import { recordSlashEntryUsage } from "./slashEntryUsage";
import { buildCuratedTaskTemplateCopy } from "../utils/curatedTaskTemplates";
import agentResource from "@/i18n/resources/zh-CN/agent.json";

type AgentResourceKey = keyof typeof agentResource;

function interpolateTemplate(
  template: string,
  values?: Record<string, number | string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    const value = values?.[name];
    return value == null ? match : String(value);
  });
}

function translateAgentResource(
  key: string,
  values?: Record<string, number | string>,
): string {
  return interpolateTemplate(
    agentResource[key as AgentResourceKey] ?? key,
    values,
  );
}

function buildTestInputCapabilityCopy() {
  return buildInputCapabilitySectionsCopy(translateAgentResource);
}

function createBuiltinCommand(
  overrides: Partial<BuiltinInputCommand> & Pick<BuiltinInputCommand, "key">,
): BuiltinInputCommand {
  return {
    label: overrides.key,
    mentionLabel: overrides.key,
    commandPrefix: `@${overrides.key}`,
    description: `${overrides.key} 描述`,
    aliases: [],
    ...overrides,
  };
}

function createSlashCommand(
  overrides: Partial<CodexSlashCommandDefinition> &
    Pick<CodexSlashCommandDefinition, "key" | "commandPrefix" | "kind">,
): CodexSlashCommandDefinition {
  return {
    commandName: overrides.key,
    label: overrides.key,
    description: `${overrides.key} 描述`,
    aliases: [],
    support: "supported",
    ...overrides,
  };
}

function createSceneCommand(
  overrides: Partial<RuntimeSceneSlashCommand> &
    Pick<RuntimeSceneSlashCommand, "key" | "commandPrefix">,
): RuntimeSceneSlashCommand {
  return {
    label: overrides.key,
    description: `${overrides.key} 描述`,
    aliases: [],
    ...overrides,
  };
}

function createInstalledSkill(
  overrides: Partial<Skill> & Pick<Skill, "key" | "name" | "directory">,
): Skill {
  return {
    description: `${overrides.name} 描述`,
    installed: true,
    sourceKind: "builtin",
    ...overrides,
  };
}

function createMentionServiceSkill(
  overrides: Partial<ServiceSkillHomeItem> &
    Pick<ServiceSkillHomeItem, "id" | "title">,
): ServiceSkillHomeItem {
  return {
    summary: `${overrides.title} 摘要`,
    entryHint: `${overrides.title} 入口说明`,
    aliases: [],
    category: "内容创作",
    outputHint: `${overrides.title} 交付`,
    source: "cloud_catalog",
    runnerType: "instant",
    defaultExecutorBinding: "automation_job",
    executionLocation: "client_default",
    slotSchema: [],
    surfaceScopes: ["mention"],
    promptTemplateKey: "generic",
    version: "seed-v1",
    badge: "",
    recentUsedAt: null,
    isRecent: false,
    runnerLabel: "立即开始",
    runnerTone: "emerald",
    runnerDescription: "会直接生成首版结果。",
    actionLabel: "开始执行",
    automationStatus: null,
    ...overrides,
  };
}

function buildEmptyParams() {
  return {
    mentionQuery: "",
    builtinCommands: [] as BuiltinInputCommand[],
    slashCommands: [] as CodexSlashCommandDefinition[],
    sceneCommands: [] as RuntimeSceneSlashCommand[],
    mentionServiceSkills: [],
    serviceSkillGroups: [],
    filteredCharacters: [],
    installedSkills: [],
    availableSkills: [],
    projectId: undefined,
    sessionId: undefined,
    referenceEntries: undefined,
    inputCapabilityCopy: buildTestInputCapabilityCopy(),
  };
}

describe("buildInputCapabilitySections", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("mention 面板应按业务能力分组，而不是回退到内建命令总表", () => {
    const sections = buildInputCapabilitySections({
      ...buildEmptyParams(),
      mode: "mention",
      builtinCommands: [
        createBuiltinCommand({
          key: "research",
          label: "搜索",
          commandPrefix: "@搜索",
        }),
        createBuiltinCommand({
          key: "image_generate",
          label: "配图",
          commandPrefix: "@配图",
        }),
        createBuiltinCommand({
          key: "writing_runtime",
          label: "写作",
          commandPrefix: "@写作",
        }),
        createBuiltinCommand({
          key: "publish_runtime",
          label: "发布",
          commandPrefix: "@发布",
        }),
      ],
    });

    const headings = sections.map((section) => section.heading);
    expect(headings).toContain("搜索 / 读取");
    expect(headings).toContain("生成 / 表达");
    expect(headings).toContain("预览 / 发布");
    expect(headings).not.toContain("内建命令");
    expect(
      sections
        .find((section) => section.heading === "生成 / 表达")
        ?.items.map((item) => item.title),
    ).toContain("@写作");
  });

  it("slash 空查询应先收成先拿结果与工作台操作，不默认展开提示命令和状态帮助", () => {
    const sections = buildInputCapabilitySections({
      ...buildEmptyParams(),
      mode: "slash",
      slashCommands: [
        createSlashCommand({
          key: "compact",
          commandPrefix: "/compact",
          kind: "local_action",
          label: "压缩上下文",
        }),
        createSlashCommand({
          key: "clear",
          commandPrefix: "/clear",
          kind: "local_action",
          label: "清空任务",
        }),
        createSlashCommand({
          key: "new",
          commandPrefix: "/new",
          kind: "local_action",
          label: "新建任务",
        }),
        createSlashCommand({
          key: "review",
          commandPrefix: "/review",
          kind: "prompt_action",
          label: "代码审查",
        }),
        createSlashCommand({
          key: "help",
          commandPrefix: "/help",
          kind: "info",
          label: "命令帮助",
        }),
      ],
    });

    const headings = sections.map((section) => section.heading);
    expect(headings).toContain("先拿结果");
    expect(headings).toContain("工作台操作");
    expect(headings).not.toContain("提示命令");
    expect(headings).not.toContain("状态 / 帮助");
    expect(headings).not.toContain("快捷操作");
    expect(headings).not.toContain("Lime 命令");

    const workspaceSection = sections.find(
      (section) => section.heading === "工作台操作",
    );
    expect(workspaceSection?.items.map((item) => item.title)).toEqual([
      "新建任务",
      "清空任务",
      "压缩上下文",
    ]);
    expect(workspaceSection?.items.map((item) => item.kindLabel)).toEqual([
      "/new",
      "/clear",
      "/compact",
    ]);
  });

  it("slash 结果模板应支持注入本地化模板 copy", () => {
    const curatedTaskTemplateCopy = buildCuratedTaskTemplateCopy(
      (key, values) =>
        key === "curatedTask.templates.daily-trend-briefing.title"
          ? "Trend Briefing"
          : translateAgentResource(key, values),
    );
    const inputCapabilityCopy = buildInputCapabilitySectionsCopy(
      (key, values) => {
        const overrides: Record<string, string> = {
          "inputCapabilities.heading.resultTemplatesEmpty": "Get Results First",
          "inputCapabilities.review.action": "Continue with {{title}}",
        };
        return interpolateTemplate(
          overrides[key] ?? translateAgentResource(key),
          values,
        );
      },
    );

    const sections = buildInputCapabilitySections({
      ...buildEmptyParams(),
      mode: "slash",
      curatedTaskTemplateCopy,
      inputCapabilityCopy,
    });

    const resultTemplatesSection = sections.find(
      (section) => section.key === "result-templates",
    );
    expect(resultTemplatesSection?.heading).toBe("Get Results First");
    expect(resultTemplatesSection?.items[0]).toEqual(
      expect.objectContaining({
        kind: "curated_task",
        title: "Trend Briefing",
      }),
    );
  });

  it("@ 面板 chrome 文案应支持注入本地化 copy", () => {
    recordMentionEntryUsage({
      kind: "builtin_command",
      entryId: "research",
      usedAt: 1_712_345_678_900,
      replayText: "查找新品趋势",
    });
    const inputCapabilityCopy = buildInputCapabilitySectionsCopy(
      (key, values) => {
        const overrides: Record<string, string> = {
          "inputCapabilities.heading.recentMention": "Recently Used",
          "inputCapabilities.inputGroup.generateExpression": "Create / Express",
          "inputCapabilities.mentionRegistry.badge":
            "Unified invocation registry",
          "inputCapabilities.mentionRegistry.titleWithRecent":
            "Resume recent or switch executor",
          "inputCapabilities.recentInput": "Previous input: {{preview}}",
        };
        return interpolateTemplate(
          overrides[key] ?? translateAgentResource(key),
          values,
        );
      },
    );

    const sections = buildInputCapabilitySections({
      ...buildEmptyParams(),
      mode: "mention",
      builtinCommands: [
        createBuiltinCommand({
          key: "research",
          label: "搜索",
          commandPrefix: "@搜索",
        }),
        createBuiltinCommand({
          key: "image_generate",
          label: "配图",
          commandPrefix: "@配图",
        }),
      ],
      inputCapabilityCopy,
    });

    const recentSection = sections.find(
      (section) => section.key === "recent-mention",
    );
    const registryBannerSection = sections.find(
      (section) =>
        section.key.startsWith("builtin-commands:") && section.banner,
    );
    const generateSection = sections.find(
      (section) => section.key === "builtin-commands:generate-expression",
    );

    expect(recentSection?.heading).toBe("Recently Used");
    expect(recentSection?.banner).toBeUndefined();
    expect(registryBannerSection?.banner?.badge).toBe(
      "Unified invocation registry",
    );
    expect(registryBannerSection?.banner?.title).toBe(
      "Resume recent or switch executor",
    );
    expect(recentSection?.items[0]?.description).toBe(
      "Previous input: 查找新品趋势",
    );
    expect(generateSection?.heading).toBe("Create / Express");
  });

  it("@ 空查询有最近调用时仍应先展示完整命令注册表", () => {
    recordMentionEntryUsage({
      kind: "builtin_command",
      entryId: "research",
      usedAt: 1_712_345_678_900,
      replayText: "查找新品趋势",
    });

    const sections = buildInputCapabilitySections({
      ...buildEmptyParams(),
      mode: "mention",
      builtinCommands: [
        createBuiltinCommand({
          key: "research",
          label: "搜索",
          commandPrefix: "@搜索",
        }),
        createBuiltinCommand({
          key: "image_generate",
          label: "配图",
          commandPrefix: "@配图",
        }),
      ],
    });

    const headings = sections.map((section) => section.heading);
    const searchSection = sections.find(
      (section) => section.key === "builtin-commands:search-read",
    );
    const recentSection = sections.find(
      (section) => section.key === "recent-mention",
    );

    expect(headings.indexOf("搜索 / 读取")).toBeLessThan(
      headings.indexOf("最近调用"),
    );
    expect(searchSection?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "@搜索",
          replayText: undefined,
          description: "搜索 · research 描述",
        }),
      ]),
    );
    expect(recentSection?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "@搜索",
          replayText: "查找新品趋势",
        }),
      ]),
    );
  });

  it("slash 搜索时仍应按工作台命令类型展开匹配结果", () => {
    const sections = buildInputCapabilitySections({
      ...buildEmptyParams(),
      mode: "slash",
      mentionQuery: "工作台",
      slashCommands: [
        createSlashCommand({
          key: "new",
          commandPrefix: "/new",
          kind: "local_action",
          label: "工作台入口",
        }),
        createSlashCommand({
          key: "review",
          commandPrefix: "/review",
          kind: "prompt_action",
          label: "工作台复盘",
        }),
        createSlashCommand({
          key: "help",
          commandPrefix: "/help",
          kind: "info",
          label: "工作台帮助",
        }),
      ],
    });

    const headings = sections.map((section) => section.heading);
    expect(headings).toContain("工作台操作");
    expect(headings).toContain("提示命令");
    expect(headings).toContain("状态 / 帮助");
  });

  it("slash 最近继续项应只给工作台命令保留前缀，小模板与方法不再额外挂对象标签", () => {
    recordSlashEntryUsage({
      kind: "command",
      entryId: "compact",
      usedAt: 1_712_345_678_900,
    });
    recordSlashEntryUsage({
      kind: "scene",
      entryId: "campaign-launch",
      usedAt: 1_712_345_678_800,
    });
    recordSlashEntryUsage({
      kind: "skill",
      entryId: "skill-a",
      usedAt: 1_712_345_678_700,
    });

    const sections = buildInputCapabilitySections({
      ...buildEmptyParams(),
      mode: "slash",
      slashCommands: [
        createSlashCommand({
          key: "compact",
          commandPrefix: "/compact",
          kind: "local_action",
          label: "压缩上下文",
        }),
      ],
      sceneCommands: [
        createSceneCommand({
          key: "campaign-launch",
          commandPrefix: "/campaign-launch",
          label: "新品发布场景",
        }),
      ],
      installedSkills: [
        createInstalledSkill({
          key: "skill-a",
          name: "技能A",
          directory: "skill-a",
        }),
      ],
    });

    const recentContinuationSection = sections.find(
      (section) => section.key === "recent-slash-continuations",
    );
    const recentOperationSection = sections.find(
      (section) => section.key === "recent-slash-operations",
    );

    expect(
      recentOperationSection?.items.find(
        (item) => item.kind === "slash_command",
      )?.kindLabel,
    ).toBe("/compact");
    expect(
      recentContinuationSection?.items.find(
        (item) => item.kind === "scene_command",
      )?.kindLabel,
    ).toBeUndefined();
    expect(
      recentContinuationSection?.items.find(
        (item) => item.kind === "installed_skill",
      )?.kindLabel,
    ).toBeUndefined();
  });

  it("@ 面板的最近服务技能与做法分组应交给分组标题表达，不再重复挂标签", () => {
    const sections = buildInputCapabilitySections({
      ...buildEmptyParams(),
      mode: "mention",
      mentionServiceSkills: [
        createMentionServiceSkill({
          id: "recent-trend-briefing",
          title: "最近趋势摘要",
          groupKey: "github",
          recentUsedAt: 1_712_345_678_000,
          isRecent: true,
        }),
        createMentionServiceSkill({
          id: "github-radar",
          title: "GitHub 仓库雷达",
          groupKey: "github",
        }),
      ],
    });

    const recentSection = sections.find(
      (section) => section.key === "recent-mention",
    );
    const groupSection = sections.find((section) =>
      section.key.startsWith("service-skill-group:"),
    );

    expect(
      recentSection?.items.find((item) => item.kind === "service_skill")
        ?.kindLabel,
    ).toBeUndefined();
    expect(
      groupSection?.items.find((item) => item.kind === "service_skill")
        ?.kindLabel,
    ).toBeUndefined();
  });

  it("@ 空查询应先突出命令分组，再用场景 Skills补位", () => {
    const sections = buildInputCapabilitySections({
      ...buildEmptyParams(),
      mode: "mention",
      builtinCommands: [
        createBuiltinCommand({
          key: "research",
          label: "搜索",
          commandPrefix: "@搜索",
        }),
      ],
      mentionServiceSkills: [
        createMentionServiceSkill({
          id: "github-radar",
          title: "GitHub 仓库雷达",
          groupKey: "github",
        }),
      ],
      installedSkills: [
        createInstalledSkill({
          key: "skill-a",
          name: "技能A",
          directory: "skill-a",
        }),
      ],
      availableSkills: [
        createInstalledSkill({
          key: "skill-b",
          name: "技能B",
          directory: "skill-b",
          installed: false,
        }),
      ],
      filteredCharacters: [
        {
          id: "char-1",
          project_id: "project-1",
          name: "测试角色",
          aliases: [],
          description: "测试角色描述",
          personality: undefined,
          background: undefined,
          appearance: undefined,
          relationships: [],
          avatar_url: undefined,
          is_main: true,
          order: 0,
          extra: undefined,
          created_at: "",
          updated_at: "",
        },
      ],
    });

    const headings = sections.map((section) => section.heading);
    expect(headings).toContain("搜索 / 读取");
    expect(headings).toContain("场景 Skills");
    expect(headings).toContain("Skills");
    expect(headings).toContain("更多 Skills");
    expect(headings).toContain("协作角色");
    expect(headings.indexOf("搜索 / 读取")).toBeLessThan(
      headings.indexOf("场景 Skills"),
    );
    expect(headings.indexOf("场景 Skills")).toBeLessThan(
      headings.indexOf("Skills"),
    );
    expect(headings.indexOf("Skills")).toBeLessThan(
      headings.indexOf("更多 Skills"),
    );
    expect(headings.indexOf("更多 Skills")).toBeLessThan(
      headings.indexOf("协作角色"),
    );

    const commandSection = sections.find(
      (section) => section.key === "builtin-commands:search-read",
    );
    expect(commandSection?.banner?.badge).toBe("统一调用注册表");
    expect(commandSection?.banner?.title).toBe("先调命令，再补 Skill");
  });
});
