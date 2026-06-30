import { describe, expect, it } from "vitest";
import contentFactoryFixture from "@/features/agent-app/fixtures/content-factory-app.json";
import { buildPackageIdentity } from "@/features/agent-app/install/packageIdentity";
import { normalizeManifest } from "@/features/agent-app/manifest/normalizeManifest";
import { parseManifest } from "@/features/agent-app/manifest/parseManifest";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import {
  extractWorkspacePluginActivationFromRequestMetadata,
  mergePluginActivationSendOptions,
  resolveWorkspacePluginActivation,
} from "./workspacePluginActivation";

function createInstalledPluginBackedApp(
  overrides: Partial<InstalledAgentAppState> = {},
): InstalledAgentAppState {
  return {
    appId: "creator-workbench",
    disabled: false,
    readiness: {
      appId: "creator-workbench",
      status: "ready",
      checkedAt: "2026-06-25T00:00:00.000Z",
      blockers: [],
      warnings: [],
      supportedCapabilities: [],
      missingCapabilities: [],
      entryReadiness: [],
      installModes: [],
    },
    manifest: {
      appId: "creator-workbench",
      displayName: "创作工作台",
      manifestVersion: "0.11",
      version: "1.0.0",
      status: "ready",
      appType: "agent-app",
      description: "创作业务应用",
      runtimeTargets: ["local"],
      requires: {
        appRuntime: "0.11",
        capabilities: {},
      },
      runtimePackage: {
        worker: {
          entrypoint: "worker.js",
          outputArtifactKind: "creator.workspace_patch",
        },
      },
      permissions: [],
      entries: [
        {
          key: "creator",
          kind: "workflow",
          title: "创作工作台",
          requiredCapabilities: [],
          permissions: [],
          enabledByDefault: true,
        },
      ],
      knowledgeTemplates: [],
      artifacts: [],
      policies: [],
      services: [],
      workflows: [],
      skillRefs: [
        {
          id: "article-draft",
          required: false,
        },
      ],
      toolRefs: [],
      evals: [],
      events: [],
      secrets: [],
      overlayTemplates: [],
      lifecycle: {},
      install: {
        modes: ["in_lime"],
        branding: {},
      },
      profiles: ["workbench"],
      agentRuntime: {
        tasks: [{ kind: "creator.generate" }],
        intents: [
          {
            key: "creator_article_generate",
            mode: "natural_language",
            taskKind: "creator.article.generate",
            outputArtifactKind: "creator.workspace_patch",
            rightSurface: "articleWorkspace",
            triggerPhrases: {
              "zh-CN": ["写一篇公众号文章", "写文章"],
            },
            expectedObjects: ["articleDraft"],
          },
        ],
      },
      workbench: {
        profile: "production",
        articleWorkspace: {
          primaryObjectKinds: ["articleDraft"],
        },
        productionObjects: [
          {
            kind: "articleDraft",
            title: "文章草稿",
            artifactKind: "creator.article_draft",
            defaultSurface: "artifact",
            primary: true,
          },
        ],
        objectSurfaces: [
          {
            objectKind: "articleDraft",
            surfaceKind: "artifact",
            renderer: "host_builtin",
          },
        ],
      },
    },
    ...overrides,
  } as InstalledAgentAppState;
}

function createInstalledContentFactory(
  overrides: Partial<InstalledAgentAppState> = {},
): InstalledAgentAppState {
  const parsedManifest = parseManifest(contentFactoryFixture);
  const manifest = normalizeManifest(parsedManifest);
  return {
    appId: manifest.appId,
    disabled: false,
    identity: buildPackageIdentity({
      manifest: parsedManifest,
      loadedAt: "2026-06-28T00:00:00.000Z",
    }),
    manifest,
    projection: {} as InstalledAgentAppState["projection"],
    readiness: {
      appId: manifest.appId,
      status: "ready",
      checkedAt: "2026-06-28T00:00:00.000Z",
      blockers: [],
      warnings: [],
      supportedCapabilities: [],
      missingCapabilities: [],
      entryReadiness: [],
      installModes: [],
    },
    installMode: "in_lime",
    runtimeProfileSummary:
      {} as InstalledAgentAppState["runtimeProfileSummary"],
    setup: {} as InstalledAgentAppState["setup"],
    installedAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    ...overrides,
  } as InstalledAgentAppState;
}

describe("workspacePluginActivation", () => {
  it("应从已安装 Agent App manifest 投影插件显式 @ 激活", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@创作工作台 写一篇公众号文章",
      sessionId: "session-1",
      installedAgentApps: [createInstalledPluginBackedApp()],
    });

    expect(resolution).toMatchObject({
      status: "matched",
      trigger: "@创作工作台",
      body: "写一篇公众号文章",
      context: {
        sessionId: "session-1",
        pluginId: "creator-workbench",
        activeEntryKey: "creator",
        selectedObjectRef: {
          pluginId: "creator-workbench",
          objectKind: "articleDraft",
          objectId: "pending",
        },
      },
      intentMatch: {
        intentKey: "creator_article_generate",
        taskKind: "creator.article.generate",
        outputArtifactKind: "creator.workspace_patch",
        rightSurface: "articleWorkspace",
        expectedObjects: ["articleDraft"],
      },
    });
  });

  it("未安装内容工厂时不应通过隐藏 fallback 激活", () => {
    expect(
      resolveWorkspacePluginActivation({
        text: "@内容工厂 写一篇公众号文章",
        sessionId: "session-content-factory",
        installedAgentApps: [],
      }),
    ).toBeNull();
    expect(
      resolveWorkspacePluginActivation({
        text: "@写文章 写一篇公众号文章",
        sessionId: "session-write-article",
        installedAgentApps: [],
      }),
    ).toBeNull();
  });

  it("内容工厂 @ 激活应来自已安装 Agent App manifest", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@内容工厂 写一篇公众号文章",
      sessionId: "session-content-factory",
      installedAgentApps: [createInstalledContentFactory()],
    });

    expect(resolution).toMatchObject({
      status: "matched",
      trigger: "@内容工厂",
      body: "写一篇公众号文章",
      context: {
        sessionId: "session-content-factory",
        pluginId: "content-factory-app",
        activeAgentAppId: "content-factory-app",
        activeEntryKey: "content_factory_generate",
        selectedObjectRef: {
          pluginId: "content-factory-app",
          objectKind: "articleDraft",
          objectId: "pending",
        },
      },
      intentMatch: {
        appId: "content-factory-app",
        intentKey: "content_factory_generate",
        taskKind: "content.factory.generate",
        outputArtifactKind: "content_factory.workspace_patch",
        rightSurface: "articleWorkspace",
        expectedObjects: [
          "articleDraft",
          "imageGenerationSet",
          "videoStoryboard",
          "deliveryChecklist",
        ],
      },
    });
  });

  it("@写文章 应作为已安装内容工厂文章入口别名", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@写文章 写一篇公众号文章",
      sessionId: "session-write-article",
      installedAgentApps: [createInstalledContentFactory()],
    });

    expect(resolution).toMatchObject({
      status: "matched",
      trigger: "@写文章",
      body: "写一篇公众号文章",
      context: {
        sessionId: "session-write-article",
        pluginId: "content-factory-app",
        activeAgentAppId: "content-factory-app",
        activeEntryKey: "content_article_generate",
        selectedObjectRef: {
          pluginId: "content-factory-app",
          objectKind: "articleDraft",
          objectId: "pending",
        },
      },
      intentMatch: {
        appId: "content-factory-app",
        intentKey: "content_article_generate",
        taskKind: "content.article.generate",
        outputArtifactKind: "content_factory.workspace_patch",
        rightSurface: "articleWorkspace",
        expectedObjects: ["articleDraft"],
      },
    });
  });

  it("@写作 应作为已安装内容工厂文章入口别名", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@写作 要求:你帮我写一篇关于登山的文章",
      sessionId: "session-writing-alias",
      installedAgentApps: [createInstalledContentFactory()],
    });

    expect(resolution).toMatchObject({
      status: "matched",
      trigger: "@写作",
      body: "要求:你帮我写一篇关于登山的文章",
      context: {
        sessionId: "session-writing-alias",
        pluginId: "content-factory-app",
        activeAgentAppId: "content-factory-app",
        activeEntryKey: "content_article_generate",
        selectedObjectRef: {
          pluginId: "content-factory-app",
          objectKind: "articleDraft",
          objectId: "pending",
        },
      },
      intentMatch: {
        appId: "content-factory-app",
        intentKey: "content_article_generate",
        taskKind: "content.article.generate",
        outputArtifactKind: "content_factory.workspace_patch",
        rightSurface: "articleWorkspace",
        expectedObjects: ["articleDraft"],
      },
    });
  });

  it("@写作 合并发送参数时应带上内容工厂写作 workflow、子智能体和 skills", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@写作 要求:你帮我写一篇关于登山的文章",
      sessionId: "session-writing-workflow",
      installedAgentApps: [createInstalledContentFactory()],
    });

    const sendOptions = mergePluginActivationSendOptions({
      sendOptions: { requestMetadata: { harness: { theme: "general" } } },
      resolution: resolution!,
    });

    expect(sendOptions?.requestMetadata).toMatchObject({
      harness: {
        plugin_activation: {
          plugin_id: "content-factory-app",
          intent_key: "content_article_generate",
          task_kind: "content.article.generate",
          workflow_key: "content_article_workflow",
          workflow: expect.objectContaining({
            key: "content_article_workflow",
            steps: expect.arrayContaining([
              expect.objectContaining({ subagent: "content-researcher" }),
              expect.objectContaining({ subagent: "article-writer" }),
            ]),
          }),
          subagents: expect.arrayContaining([
            expect.objectContaining({
              id: "content-researcher",
              title: "资料检索",
            }),
            expect.objectContaining({
              id: "article-writer",
              title: "正文写作",
            }),
          ]),
          skill_refs: expect.arrayContaining([
            expect.objectContaining({
              id: "gongzonghao-article-writer",
              title: "公众号文章写作",
            }),
          ]),
          cli_refs: ["content-factory"],
          connector_refs: ["lime-knowledge", "web-research", "media-generation"],
          hook_policy: {
            prompt: ["prompt-submit"],
            task: ["task-complete"],
          },
          runtime_registries: {
            cli: {
              entrypoint: "./cli/content-factory.mjs",
              registry: "./clis/clis.json",
              commands: ["inspect", "run", "validate"],
            },
            connectors: {
              registry: "./connectors/connectors.json",
            },
            hooks: expect.objectContaining({
              directory: "./hooks",
              handlers: expect.arrayContaining([
                expect.objectContaining({ key: "prompt-submit" }),
                expect.objectContaining({ key: "task-complete" }),
              ]),
            }),
          },
          default_prompts: expect.arrayContaining([
            expect.stringContaining("@写文章"),
          ]),
        },
      },
    });
  });

  it("禁用插件被显式 @ 时应 fail closed 返回 blocked", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@创作工作台 写一篇公众号文章",
      sessionId: "session-1",
      installedAgentApps: [
        createInstalledPluginBackedApp({
          disabled: true,
        }),
      ],
    });

    expect(resolution).toMatchObject({
      status: "blocked",
      trigger: "@创作工作台",
      blockerCodes: expect.arrayContaining(["PLUGIN_DISABLED"]),
    });
  });

  it("应合并 plugin_activation harness metadata 并保留已有字段", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@创作工作台 写一篇公众号文章",
      sessionId: "session-1",
      installedAgentApps: [createInstalledPluginBackedApp()],
    });

    const sendOptions = mergePluginActivationSendOptions({
      sendOptions: {
        requestMetadata: {
          harness: {
            theme: "general",
          },
        },
      },
      resolution: resolution!,
    });

    expect(sendOptions?.requestMetadata).toMatchObject({
      harness: {
        theme: "general",
        plugin_activation: {
          source: "plugin_explicit_mention",
          trigger: "@创作工作台",
          body: "写一篇公众号文章",
          session_id: "session-1",
          plugin_id: "creator-workbench",
          active_entry_key: "creator",
          intent_key: "creator_article_generate",
          task_kind: "creator.article.generate",
          output_artifact_kind: "creator.workspace_patch",
          right_surface: "articleWorkspace",
          expected_objects: ["articleDraft"],
          selected_object_ref: {
            plugin_id: "creator-workbench",
            object_kind: "articleDraft",
            object_id: "pending",
          },
          opened_tabs: ["articleWorkspace"],
          context_source: "user",
        },
      },
    });
    expect(sendOptions?.systemPromptOverride).toContain(
      "本轮请求已命中 Agent App manifest intent。",
    );
    expect(sendOptions?.systemPromptOverride).not.toContain("已安装");
    expect(sendOptions?.systemPromptOverride).toContain("creator-workbench");
    expect(sendOptions?.systemPromptOverride).toContain(
      "creator.article.generate",
    );
    expect(sendOptions?.systemPromptOverride).toContain("skill_search");
  });

  it("应从 plugin_activation request metadata 反投影回插件激活上下文", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@创作工作台:article-draft 写一篇公众号文章",
      sessionId: "session-1",
      installedAgentApps: [createInstalledPluginBackedApp()],
    });

    const sendOptions = mergePluginActivationSendOptions({
      sendOptions: {
        requestMetadata: {
          harness: {
            theme: "general",
          },
        },
      },
      resolution: resolution!,
    });

    expect(
      extractWorkspacePluginActivationFromRequestMetadata(
        sendOptions?.requestMetadata,
      ),
    ).toMatchObject({
      source: "plugin_explicit_mention",
      trigger: "@创作工作台:article-draft",
      body: "写一篇公众号文章",
      context: {
        sessionId: "session-1",
        pluginId: "creator-workbench",
        activeEntryKey: "creator",
        selectedSkillKeys: ["article-draft"],
        selectedObjectRef: {
          pluginId: "creator-workbench",
          objectKind: "articleDraft",
          objectId: "pending",
        },
        openedTabs: ["articleWorkspace"],
        source: "user",
      },
    });
  });

  it("应兼容 camelCase pluginActivation metadata", () => {
    expect(
      extractWorkspacePluginActivationFromRequestMetadata({
        harness: {
          pluginActivation: {
            source: "plugin_explicit_mention",
            trigger: "@Creator",
            body: "continue",
            sessionId: "session-2",
            pluginId: "creator-workbench",
            activeEntryKey: "creator",
            selectedSkillKeys: ["article-draft", "article-draft"],
            selectedObjectRef: {
              pluginId: "creator-workbench",
              objectKind: "articleDraft",
              objectId: "draft-1",
              artifactIds: ["artifact-1"],
              sourceTurnId: "turn-1",
            },
            openedTabs: ["articleWorkspace", "articleWorkspace"],
            pinnedTabs: ["articleWorkspace"],
            contextSource: "history",
          },
        },
      }),
    ).toMatchObject({
      source: "plugin_explicit_mention",
      trigger: "@Creator",
      body: "continue",
      context: {
        sessionId: "session-2",
        pluginId: "creator-workbench",
        activeEntryKey: "creator",
        selectedSkillKeys: ["article-draft"],
        selectedObjectRef: {
          pluginId: "creator-workbench",
          objectKind: "articleDraft",
          objectId: "draft-1",
          artifactIds: ["artifact-1"],
          sourceTurnId: "turn-1",
        },
        openedTabs: ["articleWorkspace"],
        pinnedTabs: ["articleWorkspace"],
        source: "history",
      },
    });
  });

  it("plugin_activation 字段不完整时不构造激活上下文", () => {
    expect(
      extractWorkspacePluginActivationFromRequestMetadata({
        harness: {
          plugin_activation: {
            trigger: "@创作工作台",
          },
        },
      }),
    ).toBeNull();
  });
});
