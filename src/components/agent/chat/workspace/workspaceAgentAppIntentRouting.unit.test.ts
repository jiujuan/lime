import { describe, expect, it } from "vitest";
import contentFactoryFixture from "@/features/agent-app/testing/fixtures/content-factory-app.json";
import { normalizeManifest } from "@/features/agent-app/manifest/normalizeManifest";
import { parseManifest } from "@/features/agent-app/manifest/parseManifest";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import {
  buildAgentAppIntentRequestMetadata,
  buildAgentAppIntentSystemPrompt,
  resolveWorkspaceAgentAppIntent,
} from "./workspaceAgentAppIntentRouting";

const contentFactoryManifest = normalizeManifest(
  parseManifest(contentFactoryFixture),
);

function createInstalledApp(
  overrides: Partial<InstalledAgentAppState> = {},
): InstalledAgentAppState {
  return {
    appId: "creator-workbench",
    disabled: false,
    manifest: {
      appId: "creator-workbench",
      displayName: "创作工作台",
      manifestVersion: "0.11",
      version: "1.0.0",
      status: "ready",
      appType: "domain-app",
      description: "创作业务应用",
      runtimeTargets: ["local"],
      requires: {
        appRuntime: "0.11",
        capabilities: {},
      },
      runtimePackage: {
        worker: {
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
      skillRefs: [],
      toolRefs: [],
      evals: [],
      events: [],
      secrets: [],
      overlayTemplates: [],
      lifecycle: {
        install: [],
        activate: [],
        deactivate: [],
        uninstall: [],
      },
      install: {
        schemaVersion: 1,
        supportedModes: ["runtime_backed"],
        preferredMode: "runtime_backed",
        runtime: {
          standalone: {
            embedRuntime: false,
          },
          runtimeBacked: {
            requires: "lime",
          },
        },
        branding: {
          name: "创作工作台",
          windowTitle: "创作工作台",
        },
        compatibility: {},
      },
      profiles: [],
      agentRuntime: {
        tasks: [{ kind: "creator.generate" }],
        intents: [
          {
            key: "creator_generate",
            mode: "natural_language",
            taskKind: "creator.generate",
            outputArtifactKind: "creator.workspace_patch",
            rightSurface: "articleWorkspace",
            triggerPhrases: {
              "zh-CN": ["创作工作台", "用创作工作台生成"],
              "en-US": ["creator workbench"],
            },
            expectedObjects: ["articleDraft", "imageSet"],
          },
        ],
      },
    },
    ...overrides,
  } as InstalledAgentAppState;
}

describe("workspaceAgentAppIntentRouting", () => {
  it("应从已安装 Agent App manifest intents 匹配自然语言触发", () => {
    const match = resolveWorkspaceAgentAppIntent(
      "帮我用创作工作台生成一篇文章和配图",
      [createInstalledApp()],
    );

    expect(match).toMatchObject({
      appId: "creator-workbench",
      appName: "创作工作台",
      intentKey: "creator_generate",
      taskKind: "creator.generate",
      outputArtifactKind: "creator.workspace_patch",
      rightSurface: "articleWorkspace",
      expectedObjects: ["articleDraft", "imageSet"],
      source: "agent_app_manifest_intent",
    });
  });

  it("内容工厂写文章应优先命中文章任务 intent，而不是泛化生成任务", () => {
    const match = resolveWorkspaceAgentAppIntent("用内容工厂写一篇公众号文章", [
      {
        appId: contentFactoryManifest.appId,
        appName: contentFactoryManifest.displayName,
        manifest: contentFactoryManifest,
      },
    ]);

    expect(match).toMatchObject({
      appId: "content-factory-app",
      appName: "内容工厂",
      intentKey: "content_article_generate",
      taskKind: "content.article.generate",
      outputArtifactKind: "content_factory.workspace_patch",
      rightSurface: "articleWorkspace",
      expectedObjects: ["articleDraft"],
      source: "agent_app_manifest_intent",
    });
  });

  it("内容工厂 intent 应来自调用方提供的 manifest source", () => {
    const match = resolveWorkspaceAgentAppIntent("@内容工厂 写一篇公众号文章", [
      {
        appId: contentFactoryManifest.appId,
        appName: contentFactoryManifest.displayName,
        manifest: contentFactoryManifest,
      },
    ]);

    expect(match).toMatchObject({
      appId: "content-factory-app",
      appName: "内容工厂",
      intentKey: "content_factory_generate",
      workflowKey: "content_article_workflow",
      source: "agent_app_manifest_intent",
    });
  });

  it("@写文章 应命中内容工厂文章任务 intent", () => {
    const match = resolveWorkspaceAgentAppIntent("@写文章 写一篇公众号文章", [
      {
        appId: contentFactoryManifest.appId,
        appName: contentFactoryManifest.displayName,
        manifest: contentFactoryManifest,
      },
    ]);

    expect(match).toMatchObject({
      appId: "content-factory-app",
      appName: "内容工厂",
      intentKey: "content_article_generate",
      taskKind: "content.article.generate",
      workflowKey: "content_article_workflow",
      outputArtifactKind: "content_factory.workspace_patch",
      rightSurface: "articleWorkspace",
      expectedObjects: ["articleDraft"],
      matchedPhrase: "@写文章",
      source: "agent_app_manifest_intent",
    });
  });

  it("应从插件包 runtime activationEntries 投影 @写文章 intent", () => {
    const app = createInstalledApp({
      appId: "content-factory-app",
      manifest: {
        ...createInstalledApp().manifest,
        appId: "content-factory-app",
        displayName: "内容工厂",
        runtimePackage: {
          worker: {
            outputArtifactKind: "content_factory.workspace_patch",
          },
        },
        agentRuntime: {
          activationEntries: [
            {
              key: "content_article_generate",
              title: "写文章",
              aliases: ["@写文章", "@写作"],
              taskKind: "content.article.generate",
              workflow: "content_article_workflow",
              defaultObjectKind: "articleDraft",
              rightSurface: "articleWorkspace",
            },
          ],
        },
        workflows: [
          {
            key: "content_article_workflow",
            taskKind: "content.article.generate",
            triggerIntents: ["content_article_generate"],
            outputArtifactKind: "content_factory.workspace_patch",
            steps: [
              {
                id: "draft",
                subagent: "article-writer",
                skillRefs: ["article-writing"],
                expectedOutput: "articleDraft",
              },
            ],
          },
        ],
        workbench: {
          profile: "production",
          articleWorkspace: {
            primaryObjectKinds: ["articleDraft"],
          },
        },
      },
    });

    const match = resolveWorkspaceAgentAppIntent("@写文章 写一篇公众号文章", [
      {
        appId: app.appId,
        appName: app.manifest.displayName,
        manifest: app.manifest,
      },
    ]);

    expect(match).toMatchObject({
      appId: "content-factory-app",
      appName: "内容工厂",
      intentKey: "content_article_generate",
      taskKind: "content.article.generate",
      outputArtifactKind: "content_factory.workspace_patch",
      rightSurface: "articleWorkspace",
      expectedObjects: ["articleDraft"],
      matchedPhrase: "@写文章",
      source: "agent_app_manifest_intent",
    });
  });

  it("禁用的 Agent App 不应命中 intent", () => {
    expect(
      resolveWorkspaceAgentAppIntent("用创作工作台生成文章", [
        createInstalledApp({ disabled: true }),
      ]),
    ).toBeNull();
  });

  it("旧 installed state 没有 intents 时应按已点名 App 的默认 task runtime 命中", () => {
    const app = createInstalledApp();
    app.manifest.agentRuntime = {
      tasks: [{ kind: "creator.generate" }],
      worker: {
        outputArtifactKind: "creator.workspace_patch",
      },
    };
    app.manifest.workbench = {
      profile: "production",
      articleWorkspace: {
        primaryObjectKinds: ["articleDraft", "imageSet"],
      },
    };

    const match = resolveWorkspaceAgentAppIntent(
      "帮我用创作工作台生成一篇文章和配图",
      [app],
    );

    expect(match).toMatchObject({
      appId: "creator-workbench",
      intentKey: "default",
      taskKind: "creator.generate",
      outputArtifactKind: "creator.workspace_patch",
      rightSurface: "articleWorkspace",
      expectedObjects: ["articleDraft", "imageSet"],
      source: "agent_app_manifest_default",
    });
  });

  it("应构造通用 harness metadata 和系统提示，阻断 Skill 搜索替代 App", () => {
    const match = resolveWorkspaceAgentAppIntent("creator workbench plan", [
      createInstalledApp(),
    ]);
    expect(match).not.toBeNull();

    const metadata = buildAgentAppIntentRequestMetadata(match!);
    expect(metadata).toMatchObject({
      agent_app_intent: {
        app_id: "creator-workbench",
        intent_key: "creator_generate",
        task_kind: "creator.generate",
        output_artifact_kind: "creator.workspace_patch",
        right_surface: "articleWorkspace",
      },
      right_surface: {
        surface_kind: "articleWorkspace",
        target: "articleWorkspace",
      },
    });
    expect(buildAgentAppIntentSystemPrompt(match!)).toContain(
      "本轮请求已命中 Agent App manifest intent。",
    );
    expect(buildAgentAppIntentSystemPrompt(match!)).not.toContain("已安装");
    expect(buildAgentAppIntentSystemPrompt(match!)).toContain("skill_search");
  });

  it("未声明 rightSurface 时不应写入空的 right_surface metadata", () => {
    const metadata = buildAgentAppIntentRequestMetadata({
      appId: "minimal-app",
      appName: "Minimal App",
      manifest: {
        ...contentFactoryManifest,
        appId: "minimal-app",
        displayName: "Minimal App",
        workbench: undefined,
      },
      intentKey: "default",
      expectedObjects: [],
      matchedPhrase: "Minimal App",
      source: "agent_app_manifest_default",
    });

    expect(metadata).toEqual({
      agent_app_intent: {
        source: "agent_app_manifest_default",
        app_id: "minimal-app",
        app_name: "Minimal App",
        intent_key: "default",
        expected_objects: [],
        matched_phrase: "Minimal App",
      },
    });
  });
});
