import {
  CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
} from "./claw-chat-current-fixture-constants.mjs";

const CONTENT_FACTORY_APP_ID = "content-factory-app";
const ARTICLE_OBJECT_ID = "article-1";
const IMAGE_SET_OBJECT_ID = "image-set-1";
const STORYBOARD_OBJECT_ID = "storyboard-1";
const CHECKLIST_OBJECT_ID = "delivery-checklist-1";
const CONTENT_FACTORY_PRODUCT_PROFILE_STORYBOARD_ARTIFACT_ID =
  "artifact-video-storyboard";
const CONTENT_FACTORY_PRODUCT_PROFILE_CHECKLIST_ARTIFACT_ID =
  "artifact-delivery-checklist";

export function buildContentFactoryWorkspacePatch(workspace) {
  return {
    schemaVersion: "product-workspace.v1",
    appId: CONTENT_FACTORY_APP_ID,
    sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
    workspaceId: workspace.workspaceId,
    primaryObjectRef: {
      appId: CONTENT_FACTORY_APP_ID,
      kind: "articleDraft",
      id: ARTICLE_OBJECT_ID,
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID],
      sourceTurnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
      sourceTaskId: "article_job_1",
    },
    selectedObjectRef: {
      appId: CONTENT_FACTORY_APP_ID,
      kind: "videoStoryboard",
      id: STORYBOARD_OBJECT_ID,
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
    },
    objects: [
      {
        ref: {
          appId: CONTENT_FACTORY_APP_ID,
          kind: "articleDraft",
          id: ARTICLE_OBJECT_ID,
          sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID],
          sourceTurnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          sourceTaskId: "article_job_1",
        },
        title: "公众号文章草稿",
        status: "ready",
        summary: "已生成首版文章",
        previewArtifactId: CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID,
        source: {
          taskKind: "content.article.generate",
          taskId: "article_job_1",
          turnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID],
          markdown:
            "# 内容工厂首版文章\n\n这是由 Agent App worker 写回的公众号文章草稿。",
          evidenceIds: ["evidence-article-1"],
        },
      },
      {
        ref: {
          appId: CONTENT_FACTORY_APP_ID,
          kind: "imageGenerationSet",
          id: IMAGE_SET_OBJECT_ID,
          sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID],
          sourceTurnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          sourceTaskId: "image_job_1",
        },
        title: "配图组",
        status: "needs_review",
        summary: "等待选择主图",
        previewArtifactId: CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID,
        source: {
          taskKind: "content.image.generate",
          taskId: "image_job_1",
          turnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID],
          images: [
            {
              id: CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID,
              title: "主图",
              url: "https://example.com/content-factory-image-1.png",
              prompt: "明亮的中文内容工厂主图",
            },
          ],
          evidenceIds: ["evidence-image-1"],
        },
      },
      {
        ref: {
          appId: CONTENT_FACTORY_APP_ID,
          kind: "videoStoryboard",
          id: STORYBOARD_OBJECT_ID,
          sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_STORYBOARD_ARTIFACT_ID],
          sourceTurnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          sourceTaskId: "storyboard_job_1",
        },
        title: "视频分镜",
        status: "ready",
        summary: "3 镜头短视频分镜",
        previewArtifactId:
          CONTENT_FACTORY_PRODUCT_PROFILE_STORYBOARD_ARTIFACT_ID,
        source: {
          taskKind: "content.video.storyboard.generate",
          taskId: "storyboard_job_1",
          turnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_STORYBOARD_ARTIFACT_ID],
          rendererContract: {
            pluginId: CONTENT_FACTORY_APP_ID,
            rendererKind: "app_declared",
            artifactType: "videoStoryboard",
            outputArtifactKind: "content_factory.workspace_patch",
            surfaceKind: "productProfile",
            paneKind: "storyboard",
            entry: "./renderer/storyboard.tsx",
            actionKeys: ["open_storyboard"],
            runtimeAuthorization: {
              status: "placeholder_only",
              executionMode: "host_placeholder",
              reasonCode: "app_declared_renderer_placeholder_only",
              requestedOutputArtifactKind: "content_factory.workspace_patch",
              allowedOutputArtifactKinds: ["content_factory.workspace_patch"],
            },
          },
          scenes: [
            {
              id: "shot-1",
              title: "厨房开场",
              description: "镜头推近产品",
              visualPrompt: "明亮厨房，自然光",
              duration: "3s",
            },
          ],
        },
      },
      {
        ref: {
          appId: CONTENT_FACTORY_APP_ID,
          kind: "deliveryChecklist",
          id: CHECKLIST_OBJECT_ID,
          sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_CHECKLIST_ARTIFACT_ID],
          sourceTurnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          sourceTaskId: "delivery_checklist_job_1",
        },
        title: "交付检查清单",
        status: "ready",
        summary: "发布前检查项",
        previewArtifactId:
          CONTENT_FACTORY_PRODUCT_PROFILE_CHECKLIST_ARTIFACT_ID,
        source: {
          taskKind: "content.delivery.review",
          taskId: "delivery_checklist_job_1",
          turnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_CHECKLIST_ARTIFACT_ID],
          items: [
            {
              id: "article",
              title: "文章已生成",
              status: "done",
            },
            {
              id: "image-license",
              title: "确认图片授权",
              notes: "发布前需复核",
              status: "todo",
            },
          ],
        },
      },
    ],
    layoutState: {
      activeTabKind: "productProfile",
      activePaneKind: "documentCanvas",
      openTabKinds: ["productProfile", "files"],
      splitMode: "chat-right-dock",
    },
    sourceArtifacts: [{ artifactRef: "artifact-workspace-patch-1" }],
    updatedAt: "2026-06-24T00:00:00.000Z",
  };
}

export function buildContentFactoryActionResultWorkspacePatch(workspace) {
  return {
    schemaVersion: "product-workspace.v1",
    appId: CONTENT_FACTORY_APP_ID,
    sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
    workspaceId: workspace.workspaceId,
    selectedObjectRef: {
      appId: CONTENT_FACTORY_APP_ID,
      kind: "imageGenerationSet",
      id: IMAGE_SET_OBJECT_ID,
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
    },
    objects: [
      {
        ref: {
          appId: CONTENT_FACTORY_APP_ID,
          kind: "imageGenerationSet",
          id: IMAGE_SET_OBJECT_ID,
          sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
          artifactIds: ["artifact-image-regenerated"],
          sourceTurnId: "turn_content_factory_product_profile_action",
          sourceTaskId: "image_regenerate_job_1",
          version: "2",
        },
        title: "配图组",
        status: "ready",
        summary: "已重新生成 2 张候选图",
        previewArtifactId: "artifact-image-regenerated",
        source: {
          taskKind: "content.image.generate",
          taskId: "image_regenerate_job_1",
          turnId: "turn_content_factory_product_profile_action",
          artifactIds: ["artifact-image-regenerated"],
          images: [
            {
              id: "image-regenerated-1",
              title: "厨房台面主图",
              url: "https://example.com/content-factory-image-regenerated-1.png",
              prompt: "厨房台面主图，明亮自然光",
            },
            {
              id: "image-regenerated-2",
              title: "产品细节图",
              url: "https://example.com/content-factory-image-regenerated-2.png",
              prompt: "产品细节图，突出质感",
            },
          ],
        },
      },
    ],
    layoutState: {
      activeTabKind: "productProfile",
      activePaneKind: "imageGrid",
      openTabKinds: ["productProfile", "files"],
      splitMode: "chat-right-dock",
    },
    sourceArtifacts: [
      { artifactRef: "artifact-image-regenerate-workspace-patch" },
    ],
    updatedAt: "2026-06-24T00:01:00.000Z",
  };
}
