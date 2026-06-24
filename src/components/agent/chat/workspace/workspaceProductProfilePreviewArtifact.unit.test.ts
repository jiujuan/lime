import { describe, expect, it, vi } from "vitest";
import type { WorkspaceProductProfile } from "./workspaceProductProfileModel";
import { buildWorkspaceProductProfileViewModel } from "./workspaceProductProfileModel";
import { buildWorkspaceProductProfilePreviewArtifact } from "./workspaceProductProfilePreviewArtifact";

vi.mock("@/lib/api/fileSystem", () => ({
  convertLocalFileSrc: (path: string) => `asset://${path}`,
  resolveLocalFilePreviewUrl: (path?: string | null) =>
    path?.startsWith("/") ? `asset://${path}` : null,
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
        version: "2",
        artifactIds: ["artifact-article-1"],
        sourceTurnId: "turn-article-1",
        sourceTaskId: "task-article-1",
      },
      title: "公众号文章草稿",
      status: "ready",
      source: {
        taskKind: "content.article.generate",
        taskId: "task-article-1",
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
          {
            id: "artifact-image-local",
            title: "本地缓存图",
            localPath: "/tmp/lime-content-factory/local-image.png",
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
        artifactSchema: "artifact_document.v1",
        artifactKind: "report",
        artifactDocumentId:
          "artifact-document:content-factory-app:artifact-article-1",
        artifactVersionId:
          "artifact-document:content-factory-app:artifact-article-1:v2",
        artifactVersionNo: 2,
        artifactDocument: expect.objectContaining({
          schemaVersion: "artifact_document.v1",
          artifactId: "artifact-document:content-factory-app:artifact-article-1",
          title: "公众号文章草稿",
          status: "ready",
          metadata: expect.objectContaining({
            currentVersionId:
              "artifact-document:content-factory-app:artifact-article-1:v2",
            currentVersionNo: 2,
            versionHistory: [
              expect.objectContaining({
                versionNo: 2,
                createdBy: "automation",
              }),
            ],
            sourceRunBinding: expect.objectContaining({
              turnId: "turn-article-1",
              taskId: "task-article-1",
              appId: "content-factory-app",
              sessionId: "session-main",
            }),
          }),
          blocks: [
            expect.objectContaining({
              id: "body",
              type: "rich_text",
              markdown: expect.stringContaining("这是正文"),
            }),
          ],
          sources: expect.arrayContaining([
            expect.objectContaining({
              id: "source-task",
              type: "tool",
              label: "content.article.generate",
            }),
          ]),
        }),
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
        artifactDocument: expect.objectContaining({
          schemaVersion: "artifact_document.v1",
          kind: "brief",
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "image",
              url: "https://lime.local/image-1.png",
            }),
            expect.objectContaining({
              type: "image",
              url: "asset:///tmp/lime-content-factory/local-image.png",
              metadata: expect.objectContaining({
                localPath: "/tmp/lime-content-factory/local-image.png",
              }),
            }),
          ]),
        }),
        contentKind: "image",
        renderMode: "media",
        previewUrl: "https://lime.local/image-1.png",
        mimeType: "image/png",
      }),
    });
  });

  it("图片对象没有远程 URL 时应优先使用本地缓存文件打开预览", () => {
    const imageProfile: WorkspaceProductProfile = {
      ...profile,
      selectedObjectRef: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
      },
      objects: profile.objects.map((object) =>
        object.ref.kind === "imageGenerationSet"
          ? {
              ...object,
              source: {
                images: [
                  {
                    id: "artifact-image-local",
                    title: "本地缓存图",
                    localPath: "/tmp/lime-content-factory/local-image.png",
                  },
                ],
              },
            }
          : object,
      ),
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
      title: "本地缓存图",
      content: "asset:///tmp/lime-content-factory/local-image.png",
      meta: expect.objectContaining({
        source: "file",
        sourceRef: "/tmp/lime-content-factory/local-image.png",
        sourcePath: "/tmp/lime-content-factory/local-image.png",
        filePath: "/tmp/lime-content-factory/local-image.png",
        previewUrl: "asset:///tmp/lime-content-factory/local-image.png",
        productProfileImage: expect.objectContaining({
          id: "artifact-image-local",
          localPath: "/tmp/lime-content-factory/local-image.png",
          sourcePath: "/tmp/lime-content-factory/local-image.png",
        }),
      }),
    });
  });
});
