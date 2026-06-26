import { describe, expect, it } from "vitest";
import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";
import {
  buildContentFactoryWorkspacePatchProfile,
  buildContentFactoryWorkspacePatchProfileFromPendingRequests,
  CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
} from "./contentFactoryWorkspacePatch";
import { CONTENT_FACTORY_PLUGIN_ID } from "./contentFactoryPlugin";

const workspacePatch = {
  schemaVersion: "product-workspace.v1",
  appId: CONTENT_FACTORY_PLUGIN_ID,
  sessionId: "session-main",
  workspaceId: "workspace-main",
  selectedObjectRef: {
    appId: CONTENT_FACTORY_PLUGIN_ID,
    kind: "articleDraft",
    id: "article-1",
    sessionId: "session-main",
  },
  objects: [
    {
      ref: {
        appId: CONTENT_FACTORY_PLUGIN_ID,
        kind: "articleDraft",
        id: "article-1",
        sessionId: "session-main",
        artifactIds: ["artifact-article-1"],
        sourceTurnId: "turn-1",
      },
      title: "公众号文章草稿",
      status: "ready",
      summary: "已生成首版文章",
      previewArtifactId: "artifact-article-1",
      source: {
        taskKind: "content.article.generate",
        artifactIds: ["artifact-article-1"],
        markdown: "# 标题\n\n首版文章正文。",
      },
    },
    {
      ref: {
        appId: CONTENT_FACTORY_PLUGIN_ID,
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
        artifactIds: ["artifact-image-1"],
      },
      title: "配图组",
      status: "needs_review",
      summary: "等待选择主图",
      source: {
        taskKind: "content.image.generate",
        images: [
          {
            id: "artifact-image-1",
            title: "主图",
            url: "https://example.test/image-1.png",
          },
        ],
      },
    },
  ],
  layoutState: {
    activeTabKind: "productProfile",
    activePaneKind: "documentCanvas",
    openTabKinds: ["productProfile", "files"],
  },
  sourceArtifacts: [{ artifactRef: "artifact-workspace-patch-1" }],
};

function pendingRequest(
  metadata: Record<string, unknown>,
): WorkspaceRightSurfacePendingRequest {
  return {
    requestId: "right_surface_product_profile_1",
    workspaceId: "workspace-main",
    sessionId: "session-main",
    surfaceKind: "productProfile",
    origin: "runtime",
    priority: "foreground",
    status: "pending",
    reason: "product_profile_ready",
    requestedAt: "2026-06-26T00:00:00.000Z",
    metadata,
  };
}

describe("contentFactoryWorkspacePatch", () => {
  it("应从 worker artifact metadata 的 contentFactoryWorkspacePatch 投影 Product Profile", () => {
    const profile = buildContentFactoryWorkspacePatchProfile({
      artifact: {
        artifactId: "artifact-workspace-patch-1",
        kind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        metadata: {
          contentFactoryWorkspacePatch: workspacePatch,
        },
      },
    });

    expect(profile).toMatchObject({
      appId: CONTENT_FACTORY_PLUGIN_ID,
      sessionId: "session-main",
      workspaceId: "workspace-main",
      source: "rightSurfacePending",
      objectCount: 2,
      selectedObjectRef: {
        kind: "articleDraft",
        id: "article-1",
      },
      layoutState: {
        activePaneKind: "documentCanvas",
        openTabKinds: ["productProfile", "files"],
      },
    });
    expect(profile?.objects.map((object) => object.title)).toEqual([
      "公众号文章草稿",
      "配图组",
    ]);
  });

  it("应从 artifact content JSON 投影 workspace patch", () => {
    const profile = buildContentFactoryWorkspacePatchProfile({
      artifact: {
        artifactId: "artifact-workspace-patch-1",
        kind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        content: JSON.stringify({
          ...workspacePatch,
          sourceArtifacts: [],
        }),
      },
    });

    expect(profile).toMatchObject({
      appId: CONTENT_FACTORY_PLUGIN_ID,
      sessionId: "session-main",
      objectCount: 2,
    });
  });

  it("应兼容 metadata.workspace_patch 与 productWorkspace 包装", () => {
    const fromSnake = buildContentFactoryWorkspacePatchProfile({
      metadata: {
        workspace_patch: workspacePatch,
      },
    });
    const fromCamel = buildContentFactoryWorkspacePatchProfile({
      productWorkspace: workspacePatch,
    });

    expect(fromSnake?.objects[0]?.ref.kind).toBe("articleDraft");
    expect(fromCamel?.objects[1]?.ref.kind).toBe("imageGenerationSet");
  });

  it("应从 pending requests 的 artifact metadata 包装形态投影并补请求来源", () => {
    const profile = buildContentFactoryWorkspacePatchProfileFromPendingRequests([
      pendingRequest({
        artifact: {
          artifactId: "artifact-workspace-patch-1",
          kind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
          metadata: {
            contentFactoryWorkspacePatch: {
              ...workspacePatch,
              sourceArtifacts: [],
            },
          },
        },
      }),
    ]);

    expect(profile).toMatchObject({
      appId: CONTENT_FACTORY_PLUGIN_ID,
      sessionId: "session-main",
      workspaceId: "workspace-main",
      updatedAt: "2026-06-26T00:00:00.000Z",
      sourceArtifacts: [
        {
          requestId: "right_surface_product_profile_1",
          origin: "runtime",
          reason: "product_profile_ready",
          artifactRef: "artifact-workspace-patch-1",
          kind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        },
      ],
    });
    expect(profile?.workerEvidence).toEqual([
      expect.objectContaining({
        source: "artifact.snapshot",
        artifactRef: "artifact-workspace-patch-1",
        artifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
      }),
    ]);
  });

  it("非内容工厂、缺少 session 或坏 JSON 应 fail closed", () => {
    expect(
      buildContentFactoryWorkspacePatchProfile({
        ...workspacePatch,
        appId: "other-plugin",
      }),
    ).toBeNull();
    expect(
      buildContentFactoryWorkspacePatchProfile({
        ...workspacePatch,
        sessionId: "",
        objects: [
          {
            ...workspacePatch.objects[0],
            ref: {
              ...workspacePatch.objects[0].ref,
              sessionId: "",
            },
          },
        ],
      }),
    ).toBeNull();
    expect(
      buildContentFactoryWorkspacePatchProfile({
        artifact: {
          kind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
          content: "{not-json",
        },
      }),
    ).toBeNull();
  });
});
