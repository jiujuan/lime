import { describe, expect, it } from "vitest";
import { filterMentionableServiceSkills } from "@/components/agent/chat/service-skills/entryAdapter";
import type { ServiceSkillHomeItem } from "@/components/agent/chat/service-skills/types";

function createMentionableServiceSkill(
  overrides: Partial<ServiceSkillHomeItem> = {},
): ServiceSkillHomeItem {
  return {
    id: "daily-trend-briefing",
    title: "每日趋势摘要",
    summary: "围绕指定平台与关键词输出趋势摘要。",
    entryHint: "把平台和关键词给我，我先整理一份趋势报告。",
    aliases: ["趋势报告", "热点摘要"],
    category: "内容运营",
    outputHint: "趋势摘要 + 调度建议",
    source: "cloud_catalog",
    runnerType: "scheduled",
    defaultExecutorBinding: "automation_job",
    executionLocation: "client_default",
    slotSchema: [],
    surfaceScopes: ["home", "mention", "workspace"],
    promptTemplateKey: "trend_briefing",
    version: "seed-v1",
    badge: "云目录",
    recentUsedAt: null,
    isRecent: false,
    runnerLabel: "本地计划任务",
    runnerTone: "sky",
    runnerDescription: "当前先进入工作区生成首版任务方案，后续再接本地自动化。",
    actionLabel: "先做方案",
    automationStatus: null,
    groupKey: "general",
    ...overrides,
  };
}

describe("filterMentionableServiceSkills", () => {
  it("服务技能过滤应支持命中别名", () => {
    const filtered = filterMentionableServiceSkills(
      [
        createMentionableServiceSkill(),
        createMentionableServiceSkill({
          id: "carousel-post-replication",
          title: "复制轮播帖",
          aliases: ["轮播帖", "小红书轮播"],
          runnerType: "instant",
          defaultExecutorBinding: "agent_turn",
          runnerLabel: "本地即时执行",
          runnerTone: "emerald",
          runnerDescription: "客户端起步版可直接进入工作区执行。",
          actionLabel: "对话内补参",
          promptTemplateKey: "replication",
        }),
      ],
      "轮播",
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("carousel-post-replication");
  });
});
