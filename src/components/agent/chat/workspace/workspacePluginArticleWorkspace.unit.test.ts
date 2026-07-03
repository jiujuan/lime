import { describe, expect, it } from "vitest";
import contentFactoryFixture from "@/features/plugin/testing/fixtures/content-factory-app.json";
import { normalizePluginManifest } from "@/features/plugin";
import {
  buildContentFactoryPluginContract,
  CONTENT_FACTORY_PLUGIN_ID,
} from "@/features/plugin-content-factory";
import { buildWorkspacePluginArticleWorkspaceFromActivation } from "./workspacePluginArticleWorkspace";

describe("workspacePluginArticleWorkspace", () => {
  it("无显式激活时应返回 null", () => {
    expect(
      buildWorkspacePluginArticleWorkspaceFromActivation({
        activationContext: null,
        contracts: [],
      }),
    ).toBeNull();
  });

  it("contract 缺失或 article workspace 未启用时应 fail closed", () => {
    const disabledPlugin = normalizePluginManifest({
      id: "disabled-plugin",
      displayName: "禁用插件",
      version: "1.0.0",
    });

    expect(
      buildWorkspacePluginArticleWorkspaceFromActivation({
        activationContext: {
          sessionId: "session-main",
          pluginId: "missing-plugin",
          source: "user",
        },
        contracts: [disabledPlugin],
      }),
    ).toBeNull();

    expect(
      buildWorkspacePluginArticleWorkspaceFromActivation({
        activationContext: {
          sessionId: "session-main",
          pluginId: "disabled-plugin",
          source: "user",
        },
        contracts: [disabledPlugin],
      }),
    ).toBeNull();
  });

  it("应从 selected object 构造最小 Article Editor", () => {
    const plugin = normalizePluginManifest({
      id: "creator-workbench",
      displayName: "创作工作台",
      version: "1.0.0",
      artifactRenderers: [
        {
          artifactType: "articleDraft",
          surfaceKind: "documentCanvas",
          rendererKind: "host_builtin",
          outputArtifactKind: "creator.workspace_patch",
        },
      ],
    });

    const profile = buildWorkspacePluginArticleWorkspaceFromActivation({
      activationContext: {
        sessionId: "session-main",
        pluginId: "creator-workbench",
        activeEntryKey: "create-article",
        selectedSkillKeys: ["article"],
        selectedObjectRef: {
          pluginId: "creator-workbench",
          objectKind: "articleDraft",
          objectId: "article-1",
          version: "v1",
          artifactIds: ["artifact-article-1"],
          sourceTurnId: "turn-1",
        },
        openedTabs: ["articleWorkspace", "files"],
        source: "user",
      },
      contracts: [plugin],
      workspaceId: "workspace-main",
    });

    expect(profile).toMatchObject({
      schemaVersion: "article-workspace.v1",
      appId: "creator-workbench",
      sessionId: "session-main",
      workspaceId: "workspace-main",
      source: "rightSurfacePending",
      objectCount: 1,
      primaryObjectRef: {
        appId: "creator-workbench",
        kind: "articleDraft",
        id: "article-1",
        sessionId: "session-main",
        version: "v1",
        artifactIds: ["artifact-article-1"],
        sourceTurnId: "turn-1",
      },
      layoutState: {
        activeTabKind: "articleWorkspace",
        activePaneKind: "documentCanvas",
        openTabKinds: ["articleWorkspace"],
      },
      sourceArtifacts: [
        {
          source: "plugin_activation_context",
          pluginId: "creator-workbench",
          activeEntryKey: "create-article",
        },
      ],
      actionHistory: [],
      workerEvidence: [],
    });
    expect(profile?.objects).toEqual([
      expect.objectContaining({
        title: "创作工作台 - articleDraft",
        status: "draft",
        previewArtifactId: "artifact-article-1",
        source: expect.objectContaining({
          source: "plugin_activation_context",
          selectedSkillKeys: ["article"],
          outputArtifactKind: "creator.workspace_patch",
          artifactType: "articleDraft",
          surfaceKind: "documentCanvas",
        }),
      }),
    ]);
  });

  it("没有 selected object 时应使用 primaryObjectKind fallback", () => {
    const plugin = normalizePluginManifest({
      id: "image-workbench",
      displayName: "图片工作台",
      version: "1.0.0",
      artifactRenderers: [
        {
          artifactType: "imageGenerationSet",
          surfaceKind: "imageGrid",
          rendererKind: "host_builtin",
        },
      ],
      activationEntries: [
        {
          key: "create-images",
          title: "生成配图",
          kind: "plugin",
          defaultObjectKind: "articleDraft",
        },
      ],
    });

    const profile = buildWorkspacePluginArticleWorkspaceFromActivation({
      activationContext: {
        sessionId: "session-main",
        pluginId: "image-workbench",
        activeEntryKey: "create-images",
        source: "user",
      },
      contracts: [plugin],
    });

    expect(profile?.selectedObjectRef).toMatchObject({
      appId: "image-workbench",
      kind: "imageGenerationSet",
      id: "pending",
      sessionId: "session-main",
    });
    expect(profile?.objects[0]).toMatchObject({
      title: "图片工作台 - imageGenerationSet",
      status: "draft",
    });
  });

  it("显示名为空时应 fallback 到 plugin id，避免右栏对象名称为空", () => {
    const plugin = normalizePluginManifest({
      id: "fallback-plugin",
      name: "",
      displayName: "",
      version: "1.0.0",
      artifactRenderers: [
        {
          artifactType: "deliveryChecklist",
          surfaceKind: "checklist",
          rendererKind: "host_builtin",
        },
      ],
    });

    const profile = buildWorkspacePluginArticleWorkspaceFromActivation({
      activationContext: {
        sessionId: "session-main",
        pluginId: "fallback-plugin",
        source: "user",
      },
      contracts: [{ ...plugin, displayName: "" }],
    });

    expect(profile?.objects[0]?.title).toBe(
      "fallback-plugin - deliveryChecklist",
    );
  });

  it("内容工厂显式激活时应生成待回填占位 profile", () => {
    const profile = buildWorkspacePluginArticleWorkspaceFromActivation({
      activationContext: {
        sessionId: "session-content-factory",
        pluginId: CONTENT_FACTORY_PLUGIN_ID,
        activeEntryKey: "content_factory_generate",
        source: "user",
      },
      contracts: [
        buildContentFactoryPluginContract({ manifest: contentFactoryFixture }),
      ],
      workspaceId: "workspace-main",
    });

    expect(profile).toMatchObject({
      appId: CONTENT_FACTORY_PLUGIN_ID,
      sessionId: "session-content-factory",
      workspaceId: "workspace-main",
      objectCount: 1,
      primaryObjectRef: {
        kind: "articleDraft",
        id: "pending",
      },
      layoutState: {
        activeTabKind: "articleWorkspace",
        activePaneKind: "briefForm",
        openTabKinds: ["articleWorkspace"],
      },
      sourceArtifacts: [
        {
          source: "plugin_activation_context",
          pluginId: CONTENT_FACTORY_PLUGIN_ID,
        },
      ],
    });
    expect(profile?.objects.map((object) => object.ref.kind)).toEqual([
      "articleDraft",
    ]);
  });
});
