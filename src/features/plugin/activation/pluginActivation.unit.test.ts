import { describe, expect, it } from "vitest";

import {
  normalizePluginManifest,
  projectPluginRegistryItem,
} from "@/features/plugin";
import {
  buildPluginActivationMentionCatalog,
  parsePluginActivationMention,
} from "./pluginActivation";

function buildResearchPlugin() {
  return normalizePluginManifest({
    id: "research-pack",
    displayName: "研究助手",
    version: "1.0.0",
    skills: [
      {
        id: "article-writer",
        title: "文章写作",
        required: true,
      },
    ],
    artifactRenderers: [
      {
        artifactType: "articleDraft",
        surfaceKind: "documentCanvas",
        rendererKind: "host_builtin",
      },
    ],
    activationEntries: [
      {
        key: "research-pack",
        title: "研究助手",
        aliases: ["@研究"],
        kind: "plugin",
        intent: "at_command",
        defaultObjectKind: "articleDraft",
      },
    ],
  });
}

describe("Plugin explicit activation", () => {
  it("应从已激活 registry 构建 @插件 mention catalog 并解析激活上下文", () => {
    const contract = buildResearchPlugin();
    const catalog = buildPluginActivationMentionCatalog({
      contracts: [contract],
      registryItems: [
        projectPluginRegistryItem({
          contract,
          installed: true,
          enabled: true,
          readinessStatus: "ready",
        }),
      ],
    });

    const result = parsePluginActivationMention({
      text: "@研究助手 帮我整理一篇文章",
      catalog,
      sessionId: "session-1",
    });

    expect(result).toMatchObject({
      status: "matched",
      match: {
        trigger: "@研究助手",
        body: "帮我整理一篇文章",
      },
      context: {
        sessionId: "session-1",
        pluginId: "research-pack",
        activeEntryKey: "research-pack",
        selectedObjectRef: {
          pluginId: "research-pack",
          objectKind: "articleDraft",
          objectId: "pending",
        },
        openedTabs: ["articleWorkspace"],
        source: "user",
      },
    });
  });

  it("应支持显式 @插件:技能，并写入 selectedSkillKeys", () => {
    const contract = buildResearchPlugin();
    const catalog = buildPluginActivationMentionCatalog({
      contracts: [contract],
      registryItems: [
        projectPluginRegistryItem({
          contract,
          installed: true,
          enabled: true,
          readinessStatus: "ready",
        }),
      ],
    });

    const result = parsePluginActivationMention({
      text: "@研究助手:文章写作 生成公众号草稿",
      catalog,
      sessionId: "session-2",
    });

    expect(result).toMatchObject({
      status: "matched",
      match: {
        trigger: "@研究助手:文章写作",
        body: "生成公众号草稿",
      },
      context: {
        pluginId: "research-pack",
        selectedSkillKeys: ["article-writer"],
      },
    });
  });

  it("应支持 activation entry aliases 作为显式 @ 入口", () => {
    const contract = buildResearchPlugin();
    const catalog = buildPluginActivationMentionCatalog({
      contracts: [contract],
      registryItems: [
        projectPluginRegistryItem({
          contract,
          installed: true,
          enabled: true,
          readinessStatus: "ready",
        }),
      ],
    });

    const result = parsePluginActivationMention({
      text: "@研究 生成公众号草稿",
      catalog,
      sessionId: "session-alias",
    });

    expect(result).toMatchObject({
      status: "matched",
      match: {
        trigger: "@研究",
        body: "生成公众号草稿",
      },
      context: {
        pluginId: "research-pack",
        activeEntryKey: "research-pack",
      },
    });
  });

  it("不可激活插件应返回 blocked，不构造可执行上下文", () => {
    const contract = buildResearchPlugin();
    const catalog = buildPluginActivationMentionCatalog({
      contracts: [contract],
      registryItems: [
        projectPluginRegistryItem({
          contract,
          installed: true,
          enabled: false,
          readinessStatus: "ready",
          hasHistoryWorkspace: true,
        }),
      ],
    });

    const result = parsePluginActivationMention({
      text: "@研究助手 继续旧文章",
      catalog,
      sessionId: "session-3",
    });

    expect(result).toEqual({
      status: "blocked",
      blockerCodes: ["PLUGIN_DISABLED"],
      match: expect.objectContaining({
        trigger: "@研究助手",
        body: "继续旧文章",
      }),
    });
  });

  it("未显式 @ 插件时不做语义猜测", () => {
    const contract = buildResearchPlugin();
    const catalog = buildPluginActivationMentionCatalog({
      contracts: [contract],
    });

    expect(
      parsePluginActivationMention({
        text: "请用研究助手整理文章",
        catalog,
        sessionId: "session-4",
      }),
    ).toBeNull();
  });
});
