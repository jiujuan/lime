import { describe, expect, it, vi } from "vitest";
import type { WorkspaceProductProfile } from "./workspaceProductProfileModel";
import { buildWorkspaceProductProfileViewModel } from "./workspaceProductProfileModel";
import { buildWorkspaceProductProfilePreviewArtifact } from "./workspaceProductProfilePreviewArtifact";

vi.mock("@/lib/api/fileSystem", () => ({
  convertLocalFileSrc: (path: string) => `asset://${path}`,
}));

const profile: WorkspaceProductProfile = {
  schemaVersion: "product-workspace.v1",
  appId: "content-factory-app",
  sessionId: "session-main",
  workspaceId: "workspace-main",
  source: "threadRead",
  objectCount: 2,
  actionHistory: [],
  selectedObjectRef: {
    appId: "content-factory-app",
    kind: "articleDraft",
    id: "article-1",
    sessionId: "session-main",
  },
  objects: [
    {
      ref: {
        appId: "content-factory-app",
        kind: "articleDraft",
        id: "article-1",
        sessionId: "session-main",
        artifactIds: ["artifact-article-1"],
      },
      title: "公众号文章草稿",
      status: "ready",
      source: {
        markdown: "# 公众号文章草稿\n\n这是正文。",
      },
    },
    {
      ref: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
      },
      title: "配图组",
      status: "needs_review",
      source: {
        images: [
          {
            id: "artifact-image-1",
            title: "主图",
            url: "https://lime.local/image-1.png",
          },
        ],
      },
    },
  ],
};

describe("workspaceProductProfilePreviewArtifact", () => {
  it("应把文档对象投影为 source-backed markdown preview artifact", () => {
    const viewModel = buildWorkspaceProductProfileViewModel(profile);

    const artifact = buildWorkspaceProductProfilePreviewArtifact({
      artifactIds: viewModel.selectedArtifactIds,
      layout: viewModel.selectedSurface.layout,
      object: viewModel.selectedObject,
      preview: viewModel.selectedPreview,
      profile,
      now: 100,
    });

    expect(artifact).toMatchObject({
      id: expect.stringMatching(/^preview-artifact-/),
      type: "document",
      title: "公众号文章草稿",
      content: expect.stringContaining("这是正文"),
      status: "complete",
      meta: expect.objectContaining({
        previewArtifact: true,
        isSourceBacked: true,
        source: "artifact",
        sourceRef: "artifact-article-1",
        contentKind: "markdown",
        renderMode: "canvas",
        openedFrom: "right_surface_product_profile",
        productProfile: expect.objectContaining({
          appId: "content-factory-app",
          objectKind: "articleDraft",
          objectId: "article-1",
        }),
      }),
    });
  });

  it("应把图片对象投影为 media preview artifact", () => {
    const imageProfile: WorkspaceProductProfile = {
      ...profile,
      selectedObjectRef: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
      },
    };
    const viewModel = buildWorkspaceProductProfileViewModel(imageProfile);

    const artifact = buildWorkspaceProductProfilePreviewArtifact({
      artifactIds: viewModel.selectedArtifactIds,
      layout: viewModel.selectedSurface.layout,
      object: viewModel.selectedObject,
      preview: viewModel.selectedPreview,
      profile: imageProfile,
      now: 100,
    });

    expect(artifact).toMatchObject({
      title: "主图",
      content: "https://lime.local/image-1.png",
      meta: expect.objectContaining({
        contentKind: "image",
        renderMode: "media",
        previewUrl: "https://lime.local/image-1.png",
        mimeType: "image/png",
      }),
    });
  });
});
