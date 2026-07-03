import { describe, expect, it } from "vitest";

import contentFactoryFixture from "@/features/plugin/testing/fixtures/content-factory-app.json";
import { buildPackageIdentity } from "@/features/plugin/install/packageIdentity";
import { normalizeManifest } from "@/features/plugin/manifest/normalizeManifest";
import { parseManifest } from "@/features/plugin/manifest/parseManifest";
import {
  buildPluginContractFromPluginManifest,
  normalizePluginManifest,
  PluginManifestError,
} from "./pluginContract";
import { buildPluginRendererOutputContracts } from "./pluginRendererOutput";
import {
  projectPluginRegistry,
  projectPluginRegistryItem,
} from "./pluginRegistry";

describe("Plugin P1 manifest contract", () => {
  it("应接受 Lime Plugin Package v1 的 plugin.json 入口和 contributions", () => {
    const contract = normalizePluginManifest({
      schemaVersion: "lime.plugin.package.v1",
      id: "content-factory-app",
      name: "content-factory-app",
      version: "2.0.1",
      displayName: "内容工厂",
      description: "内容生产插件包",
      interface: {
        displayName: "内容工厂",
        shortDescription: "生成文章、配图规划和交付检查清单",
        capabilities: ["写作工作流", "资料检索"],
        defaultPrompt: ["@写文章 帮我写一篇文章"],
      },
      contributions: {
        runtime: "./app.runtime.yaml",
        workbench: "./app.workbench.yaml",
        skills: "./skills",
        subagents: "./subagents",
        clis: "./clis/clis.json",
        connectors: "./connectors/connectors.json",
        hooks: "./hooks",
        resources: "./resources",
        workflows: "./workflows",
        artifacts: "./artifacts",
      },
      activationEntries: [
        {
          key: "content_article_generate",
          title: "写文章",
          aliases: ["@写文章", "@写作"],
          kind: "plugin",
          intent: "at_command",
          taskKind: "content.article.generate",
          workflow: "content_article_workflow",
          outputArtifactKind: "content_factory.workspace_patch",
          rightSurface: "articleWorkspace",
          expectedObjects: ["articleDraft"],
          defaultObjectKind: "articleDraft",
        },
      ],
    });

    expect(contract).toMatchObject({
      id: "content-factory-app",
      packageSchemaVersion: "lime.plugin.package.v1",
      displayName: "内容工厂",
      contributions: {
        runtime: "./app.runtime.yaml",
        workbench: "./app.workbench.yaml",
        subagents: "./subagents",
        clis: "./clis/clis.json",
        connectors: "./connectors/connectors.json",
        hooks: "./hooks",
      },
      componentPaths: {
        runtime: "./app.runtime.yaml",
        workbench: "./app.workbench.yaml",
        skills: "./skills",
        subagents: "./subagents",
        clis: "./clis/clis.json",
        connectors: "./connectors/connectors.json",
        hooks: "./hooks",
        resources: "./resources",
        workflows: "./workflows",
        artifacts: "./artifacts",
      },
      activationEntries: [
        {
          key: "content_article_generate",
          title: "写文章",
          aliases: ["@写文章", "@写作"],
          kind: "plugin",
          intent: "at_command",
          taskKind: "content.article.generate",
          workflowKey: "content_article_workflow",
          outputArtifactKind: "content_factory.workspace_patch",
          rightSurface: "articleWorkspace",
          expectedObjects: ["articleDraft"],
          defaultObjectKind: "articleDraft",
        },
      ],
    });
  });

  it("应接受插件包 manifest 的 name / interface / componentPaths 形状", () => {
    const contract = normalizePluginManifest({
      name: "research-pack",
      version: "1.0.0",
      description: "Research pack",
      keywords: ["research", "notes"],
      categories: ["productivity"],
      interface: {
        displayName: "Research Pack",
        shortDescription: "Research helpers",
        longDescription: "Longer research helpers description",
        category: "utility",
        capabilities: ["skills", "mcp"],
        defaultPrompt: ["Summarize a topic"],
        screenshots: ["./assets/shot-1.png"],
      },
      componentPaths: {
        skills: "./skills",
        hooks: "./hooks.json",
        apps: "./.app.json",
        mcpServers: "./.mcp.json",
      },
      cli: "./cli/index.mjs",
    });

    expect(contract).toMatchObject({
      id: "research-pack",
      displayName: "Research Pack",
      version: "1.0.0",
      keywords: ["research", "notes"],
      description: "Research pack",
      categories: ["productivity", "utility"],
      capabilities: ["skills", "mcp"],
      interface: {
        displayName: "Research Pack",
        shortDescription: "Research helpers",
        longDescription: "Longer research helpers description",
        category: "utility",
        capabilities: ["skills", "mcp"],
        defaultPrompt: ["Summarize a topic"],
        screenshots: ["./assets/shot-1.png"],
      },
      componentPaths: {
        skills: "./skills",
        cli: "./cli/index.mjs",
        hooks: "./hooks.json",
        apps: "./.app.json",
        mcpServers: "./.mcp.json",
      },
    });
    expect(contract.clis).toEqual([]);
  });

  it("应把插件包 CLI 和 lifecycle hooks 归一为一等 contract", () => {
    const contract = normalizePluginManifest({
      id: "creator-pack",
      displayName: "Creator Pack",
      version: "1.0.0",
      clis: [
        {
          id: "content-factory",
          title: "Content Factory CLI",
          entrypoint: "./cli/content-factory.mjs",
          registry: "./clis/clis.json",
          commands: ["inspect", "run", "validate", "run"],
          required: true,
        },
      ],
      hooks: {
        handlers: [
          {
            key: "prompt-submit",
            event: "prompt.submit",
            entrypoint: "./hooks/prompt-submit.mjs",
          },
          {
            key: "task-complete",
            event: "task.complete",
            entrypoint: "./hooks/task-complete.mjs",
          },
        ],
      },
    });

    expect(contract.clis).toEqual([
      {
        id: "content-factory",
        title: "Content Factory CLI",
        description: undefined,
        entrypoint: "./cli/content-factory.mjs",
        registry: "./clis/clis.json",
        commands: ["inspect", "run", "validate"],
        required: true,
      },
    ]);
    expect(contract.hooks).toEqual([
      {
        key: "prompt-submit",
        title: undefined,
        description: undefined,
        event: "prompt.submit",
        entrypoint: "./hooks/prompt-submit.mjs",
        path: undefined,
        required: false,
      },
      {
        key: "task-complete",
        title: undefined,
        description: undefined,
        event: "task.complete",
        entrypoint: "./hooks/task-complete.mjs",
        path: undefined,
        required: false,
      },
    ]);
  });

  it("应兼容旧的 id / skills / mcpServers 声明形状", () => {
    const contract = normalizePluginManifest({
      id: "legacy-pack",
      displayName: "Legacy Pack",
      version: "1.0.0",
      skills: [
        {
          id: "legacy-skill",
          title: "Legacy Skill",
        },
      ],
      mcpServers: {
        type: "http",
        url: "https://example.com/mcp",
      },
    });

    expect(contract).toMatchObject({
      id: "legacy-pack",
      displayName: "Legacy Pack",
      skills: [
        {
          id: "legacy-skill",
          title: "Legacy Skill",
        },
      ],
      componentPaths: {},
    });
  });

  it("应从 Plugin manifest 投影插件根对象、激活入口、renderer 和历史恢复 contract", () => {
    const manifest = normalizeManifest(parseManifest(contentFactoryFixture));
    const identity = buildPackageIdentity({
      manifest: parseManifest(contentFactoryFixture),
      loadedAt: "2026-06-25T00:00:00.000Z",
    });
    const contract = buildPluginContractFromPluginManifest({
      manifest,
      identity,
    });

    expect(contract).toMatchObject({
      schemaVersion: 1,
      id: "content-factory-app",
      displayName: "内容工厂",
      version: "2.0.0",
      provenance: {
        sourceKind: "plugin_manifest",
        sourceId: "content-factory-app",
        sourceVersion: "2.0.0",
      },
    });
    expect(contract.ui).toEqual([
      expect.objectContaining({
        id: "content-factory-app",
        title: "内容工厂",
        uiKind: "pane",
        entryKey: "content_factory",
      }),
    ]);
    expect(contract.activationEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "content_article_generate",
          title: "写文章",
          aliases: ["@写文章", "@写作"],
          kind: "plugin",
          intent: "at_command",
          taskKind: "content.article.generate",
          workflowKey: "content_article_workflow",
          rightSurface: "articleWorkspace",
          defaultObjectKind: "articleDraft",
        }),
        expect.objectContaining({
          key: "content_factory",
          kind: "pluginUi",
          intent: "manual",
          defaultObjectKind: "articleDraft",
        }),
        expect.objectContaining({
          key: "content_factory_generate",
          kind: "plugin",
          intent: "at_command",
          taskKind: "content.factory.generate",
          workflowKey: "content_article_workflow",
          rightSurface: "articleWorkspace",
          defaultObjectKind: "articleDraft",
        }),
      ]),
    );
    expect(contract.interface?.defaultPrompt).toEqual(
      expect.arrayContaining([
        expect.stringContaining("@写文章"),
        expect.stringContaining("@写作"),
      ]),
    );
    expect(contract.subagents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "content-researcher",
          title: "资料检索",
          activation: "content.article.generate",
        }),
        expect.objectContaining({
          id: "article-writer",
          title: "正文写作",
          activation: "content.article.generate",
        }),
      ]),
    );
    expect(contract.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "article-research",
          title: "资料检索",
        }),
        expect.objectContaining({
          id: "article-strategy",
          title: "选题策划",
        }),
        expect.objectContaining({
          id: "article-writing",
          title: "正文写作",
        }),
        expect.objectContaining({
          id: "article-editing",
          title: "审稿校对",
        }),
        expect.objectContaining({
          id: "article-image-plan",
          title: "文章配图规划",
        }),
      ]),
    );
    expect(contract.workflows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "content_article_workflow",
          taskKind: "content.article.generate",
          triggerIntents: ["content_article_generate"],
          cliRefs: ["content-factory"],
          connectorRefs: ["lime-knowledge", "web-research", "media-generation"],
          hookPolicy: {
            prompt: ["prompt-submit"],
            task: ["task-complete"],
          },
        }),
      ]),
    );
    expect(contract.clis).toEqual([
      expect.objectContaining({
        id: "agent-runtime-cli",
        entrypoint: "./cli/content-factory.mjs",
        registry: "./clis/clis.json",
        commands: ["inspect", "run", "validate"],
      }),
    ]);
    expect(contract.hooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "prompt-submit",
          event: "prompt.submit",
          entrypoint: "./hooks/prompt-submit.mjs",
        }),
        expect.objectContaining({
          key: "task-complete",
          event: "task.complete",
          entrypoint: "./hooks/task-complete.mjs",
        }),
      ]),
    );
    expect(contract.connectors).toEqual([]);
    expect(contract.artifactRenderers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactType: "markdown_document",
          surfaceKind: "documentCanvas",
          rendererKind: "host_builtin",
          outputArtifactKind: "content_factory.workspace_patch",
        }),
        expect.objectContaining({
          artifactType: "image_set",
          surfaceKind: "imageGrid",
          rendererKind: "host_builtin",
        }),
        expect.objectContaining({
          artifactType: "storyboard",
          surfaceKind: "storyboard",
          rendererKind: "host_builtin",
        }),
        expect.objectContaining({
          artifactType: "delivery_checklist",
          surfaceKind: "checklist",
          rendererKind: "host_builtin",
        }),
      ]),
    );
    expect(contract.rightSurface).toMatchObject({
      defaultActiveTab: "articleWorkspace",
      supportedTabs: [
        "articleWorkspace",
        "file",
        "evidence",
        "terminal",
        "browser",
        "sideChat",
      ],
      articleWorkspace: {
        enabled: true,
        primaryObjectKind: "articleDraft",
        selectionPolicy: "last",
      },
      historyRestore: {
        enabled: true,
        restoreSelection: true,
        restoreLayout: true,
      },
    });
    expect(contract.historyRestore).toEqual({
      defaultSurface: "selectedObject",
      restoreSelection: true,
      restoreLayout: true,
      fallback: "artifactPreview",
    });
  });

  it("缺少必填字段或 renderer contract 非法时 fail closed", () => {
    expect(() =>
      normalizePluginManifest({ displayName: "插件", version: "1.0.0" }),
    ).toThrow(PluginManifestError);
    expect(() =>
      normalizePluginManifest({
        id: "broken-renderer",
        displayName: "Broken",
        version: "1.0.0",
        artifactRenderers: [
          {
            artifactType: "articleDraft",
            surfaceKind: "documentCanvas",
            rendererKind: "raw_iframe",
          },
        ],
      }),
    ).toThrow("Plugin renderer kind is unsupported");
  });

  it("应为最小 manifest 补显式插件激活入口，但不伪造 renderer", () => {
    const contract = normalizePluginManifest({
      id: "research-pack",
      displayName: "研究助手",
      version: "1.0.0",
    });

    expect(contract.activationEntries).toEqual([
      {
        key: "research-pack",
        title: "研究助手",
        kind: "plugin",
        intent: "manual",
        defaultObjectKind: undefined,
      },
    ]);
    expect(contract.artifactRenderers).toEqual([]);
    expect(contract.rightSurface.articleWorkspace.enabled).toBe(false);
    expect(contract.historyRestore.defaultSurface).toBe("chat");
  });

  it("应保留 app-declared renderer 输出 contract 和 pane action 声明", () => {
    const contract = normalizePluginManifest({
      id: "creator-pack",
      displayName: "Creator Pack",
      version: "1.0.0",
      artifactRenderers: [
        {
          artifactType: "creator.article_draft",
          surfaceKind: "documentCanvas",
          paneKind: "editor",
          rendererKind: "app_declared",
          entry: "app://creator/editor",
          outputArtifactKind: "creator.workspace_patch",
          actionKeys: ["revise"],
          actions: [
            {
              key: "regenerate",
              intent: "regenerate",
              risk: "write",
              taskKind: "creator.generate",
            },
          ],
          capabilities: ["history_restore"],
        },
      ],
    });

    expect(contract.artifactRenderers[0]).toMatchObject({
      artifactType: "creator.article_draft",
      surfaceKind: "documentCanvas",
      paneKind: "editor",
      rendererKind: "app_declared",
      entry: "app://creator/editor",
      outputArtifactKind: "creator.workspace_patch",
      actionKeys: ["revise"],
      actions: [
        {
          key: "regenerate",
          intent: "regenerate",
          risk: "write",
          taskKind: "creator.generate",
        },
      ],
    });
    expect(buildPluginRendererOutputContracts(contract)).toEqual([
      expect.objectContaining({
        pluginId: "creator-pack",
        artifactType: "creator.article_draft",
        surfaceKind: "documentCanvas",
        paneKind: "editor",
        rendererKind: "app_declared",
        outputArtifactKind: "creator.workspace_patch",
        actionKeys: ["revise", "regenerate"],
        capabilities: ["history_restore"],
        runtimeAuthorization: expect.objectContaining({
          status: "placeholder_only",
          executionMode: "host_placeholder",
          runtimeBoundary: "host_placeholder_only",
          reasonCode: "app_declared_renderer_placeholder_only",
          remoteRuntimePolicy: expect.objectContaining({
            status: "disabled",
            clientBehavior: "fail_closed",
            serviceBoundary: "marketplace_control_plane_only",
          }),
        }),
      }),
    ]);
  });

  it("renderer action 风险非法时 fail closed", () => {
    expect(() =>
      normalizePluginManifest({
        id: "broken-action",
        displayName: "Broken Action",
        version: "1.0.0",
        artifactRenderers: [
          {
            artifactType: "articleDraft",
            surfaceKind: "documentCanvas",
            rendererKind: "host_builtin",
            actions: [{ key: "delete_everything", risk: "admin" }],
          },
        ],
      }),
    ).toThrow("Plugin renderer action risk is unsupported");
  });
});

describe("Plugin P1 registry projection", () => {
  it("应区分可安装、可激活、可渲染和只读历史四种状态", () => {
    const manifest = normalizeManifest(parseManifest(contentFactoryFixture));
    const contract = buildPluginContractFromPluginManifest({ manifest });
    const installable = projectPluginRegistryItem({
      contract,
      installed: false,
      readinessStatus: "unknown",
    });
    const active = projectPluginRegistryItem({
      contract,
      installed: true,
      enabled: true,
      readinessStatus: "ready",
    });
    const historyOnly = projectPluginRegistryItem({
      contract,
      installed: true,
      enabled: false,
      readinessStatus: "ready",
      hasHistoryWorkspace: true,
    });

    expect(installable.capabilityStates).toEqual(["installable", "renderable"]);
    expect(active.capabilityStates).toEqual(["activatable", "renderable"]);
    expect(active.activationState).toBe("activatable");
    expect(active.rendererState).toBe("renderable");
    expect(active.historyState).toBe("read_write");
    expect(historyOnly.capabilityStates).toEqual([
      "renderable",
      "read_only_history",
    ]);
    expect(historyOnly.activationState).toBe("disabled");
    expect(historyOnly.historyState).toBe("read_only_history");
  });

  it("已安装插件 needs-setup 只作为维护提醒，不应阻断输入区激活", () => {
    const manifest = normalizeManifest(parseManifest(contentFactoryFixture));
    const contract = buildPluginContractFromPluginManifest({ manifest });
    const item = projectPluginRegistryItem({
      contract,
      installed: true,
      enabled: true,
      readinessStatus: "needs-setup",
      blockerCodes: ["PLUGIN_INSTALLED_PACKAGE_MISMATCH"],
    });

    expect(item.activationState).toBe("activatable");
    expect(item.capabilityStates).toEqual(
      expect.arrayContaining(["activatable", "renderable"]),
    );
    expect(item.blockerCodes).toContain("PLUGIN_INSTALLED_PACKAGE_MISMATCH");
    expect(item.blockerCodes).not.toContain("PLUGIN_ACTIVATION_BLOCKED");
  });

  it("registry 应按展示名排序并保留阻断原因", () => {
    const alpha = normalizePluginManifest({
      id: "alpha",
      displayName: "Alpha",
      version: "1.0.0",
    });
    const beta = normalizePluginManifest({
      id: "beta",
      displayName: "Beta",
      version: "1.0.0",
      artifactRenderers: [
        {
          artifactType: "articleDraft",
          surfaceKind: "documentCanvas",
          rendererKind: "host_builtin",
        },
      ],
    });
    const registry = projectPluginRegistry([
      { contract: beta, installed: true, readinessStatus: "blocked" },
      { contract: alpha, installed: true, readinessStatus: "ready" },
    ]);

    expect(registry.map((item) => item.pluginId)).toEqual(["alpha", "beta"]);
    expect(registry[0]).toMatchObject({
      activationState: "activatable",
      rendererState: "missing_renderer",
      blockerCodes: ["PLUGIN_RENDERER_UNAVAILABLE"],
    });
    expect(registry[1]).toMatchObject({
      activationState: "blocked",
      rendererState: "renderable",
      blockerCodes: ["PLUGIN_ACTIVATION_BLOCKED"],
    });
  });
});
