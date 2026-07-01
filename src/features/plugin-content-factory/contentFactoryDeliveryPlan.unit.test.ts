import { describe, expect, it } from "vitest";
import { buildWorkspaceArticleWorkspaceViewModel } from "@/components/agent/chat/workspace/workspaceArticleWorkspaceModel";
import {
  buildContentFactoryDeliveryParts,
  buildContentFactoryDeliveryArticleWorkspace,
} from "./contentFactoryDeliveryPlan";
import {
  buildContentFactoryPluginContract,
  CONTENT_FACTORY_PLUGIN_ID,
} from "./contentFactoryPlugin";

describe("contentFactoryDeliveryPlan", () => {
  it("应从内容工厂 contract 生成固定 MVP 交付部件", () => {
    const parts = buildContentFactoryDeliveryParts(
      buildContentFactoryPluginContract(),
    );

    expect(parts).toEqual([
      {
        key: "contentBrief",
        objectKind: "contentBrief",
        artifactType: "content_brief",
        surfaceKind: "briefForm",
        outputArtifactKind: "content_factory.workspace_patch",
        title: "内容简报",
        stage: "brief",
        required: false,
      },
      {
        key: "articleDraft",
        objectKind: "articleDraft",
        artifactType: "markdown_document",
        surfaceKind: "documentCanvas",
        outputArtifactKind: "content_factory.workspace_patch",
        title: "文章草稿",
        stage: "draft",
        required: true,
      },
      {
        key: "imageGenerationSet",
        objectKind: "imageGenerationSet",
        artifactType: "image_set",
        surfaceKind: "imageGrid",
        outputArtifactKind: "content_factory.workspace_patch",
        title: "图片生成组",
        stage: "visual",
        required: true,
      },
      {
        key: "videoScript",
        objectKind: "videoScript",
        artifactType: "video_script",
        surfaceKind: "documentCanvas",
        outputArtifactKind: "content_factory.workspace_patch",
        title: "视频脚本",
        stage: "video",
        required: false,
      },
      {
        key: "videoStoryboard",
        objectKind: "videoStoryboard",
        artifactType: "storyboard",
        surfaceKind: "storyboard",
        outputArtifactKind: "content_factory.workspace_patch",
        title: "视频分镜",
        stage: "video",
        required: true,
      },
      {
        key: "deliveryChecklist",
        objectKind: "deliveryChecklist",
        artifactType: "delivery_checklist",
        surfaceKind: "checklist",
        outputArtifactKind: "content_factory.workspace_patch",
        title: "交付检查清单",
        stage: "review",
        required: true,
      },
    ]);
  });

  it("应生成可被 Article Editor 右栏消费的交付包 workspace", () => {
    const profile = buildContentFactoryDeliveryArticleWorkspace({
      contract: buildContentFactoryPluginContract(),
      sessionId: "session-content-factory",
      workspaceId: "workspace-main",
      now: "2026-06-26T00:00:00.000Z",
    });

    expect(profile).toMatchObject({
      schemaVersion: "article-workspace.v1",
      appId: CONTENT_FACTORY_PLUGIN_ID,
      sessionId: "session-content-factory",
      workspaceId: "workspace-main",
      source: "rightSurfacePending",
      objectCount: 6,
      primaryObjectRef: {
        appId: CONTENT_FACTORY_PLUGIN_ID,
        kind: "articleDraft",
        id: "articleDraft",
        sessionId: "session-content-factory",
        artifactIds: ["session-content-factory:articleDraft"],
      },
      layoutState: {
        activeTabKind: "articleWorkspace",
        activePaneKind: "documentCanvas",
        openTabKinds: ["articleWorkspace"],
      },
      updatedAt: "2026-06-26T00:00:00.000Z",
    });
    expect(profile?.objects.map((object) => object.ref.kind)).toEqual([
      "contentBrief",
      "articleDraft",
      "imageGenerationSet",
      "videoScript",
      "videoStoryboard",
      "deliveryChecklist",
    ]);
    expect(profile?.sourceArtifacts).toEqual([
      {
        source: "content_factory_delivery_plan",
        pluginId: CONTENT_FACTORY_PLUGIN_ID,
        outputArtifactKind: "content_factory.workspace_patch",
        requiredObjectKinds: [
          "articleDraft",
          "imageGenerationSet",
          "videoStoryboard",
          "deliveryChecklist",
        ],
      },
    ]);
    expect(profile?.objects[1]?.source).toMatchObject({
      processMarkdown: "",
      documentText: "",
    });
  });

  it("生成的 profile 应能投影出当前对象预览和动作", () => {
    const profile = buildContentFactoryDeliveryArticleWorkspace({
      contract: buildContentFactoryPluginContract(),
      sessionId: "session-content-factory",
    });
    expect(profile).not.toBeNull();

    const viewModel = buildWorkspaceArticleWorkspaceViewModel(profile!);

    expect(viewModel.selectedObject.ref.kind).toBe("articleDraft");
    expect(viewModel.selectedSurface).toMatchObject({
      layout: "document",
      titleKey: "workspace.articleWorkspace.surface.document",
    });
    expect(viewModel.selectedArtifactIds).toEqual([
      "session-content-factory:articleDraft",
    ]);
    expect(viewModel.selectedActions.map((action) => action.key)).toEqual([
      "revise",
      "continue_writing",
      "generate_images",
      "export_markdown",
    ]);
  });

  it("非内容工厂 contract 或缺少 session 时应 fail closed", () => {
    const contract = {
      ...buildContentFactoryPluginContract(),
      id: "other-plugin",
    };

    expect(buildContentFactoryDeliveryParts(contract)).toEqual([]);
    expect(
      buildContentFactoryDeliveryArticleWorkspace({
        contract: buildContentFactoryPluginContract(),
        sessionId: " ",
      }),
    ).toBeNull();
    expect(
      buildContentFactoryDeliveryArticleWorkspace({
        contract,
        sessionId: "session-content-factory",
      }),
    ).toBeNull();
  });
});
