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
        productProfileCardPreview: {
          layout: "document",
          summary: null,
          counts: expect.objectContaining({
            artifacts: 1,
            outlineSections: 0,
            researchRounds: 0,
          }),
        },
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
        surfaceKind: "imageGrid",
        layout: "imageGrid",
        productProfileCardPreview: expect.objectContaining({
          layout: "imageGrid",
          summary: null,
          counts: expect.objectContaining({
            artifacts: 0,
            images: 2,
          }),
        }),
        productProfile: expect.objectContaining({
          surfaceKind: "imageGrid",
          layout: "imageGrid",
        }),
        artifactDocument: expect.objectContaining({
          schemaVersion: "artifact_document.v1",
          kind: "brief",
          metadata: expect.objectContaining({
            productProfile: expect.objectContaining({
              surfaceKind: "imageGrid",
              layout: "imageGrid",
            }),
          }),
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

  it("应把视频分镜对象投影为 storyboard preview artifact", () => {
    const storyboardProfile: WorkspaceProductProfile = {
      ...profile,
      selectedObjectRef: {
        appId: "content-factory-app",
        kind: "videoStoryboard",
        id: "storyboard-1",
        sessionId: "session-main",
      },
      objects: [
        ...profile.objects,
        {
          ref: {
            appId: "content-factory-app",
            kind: "videoStoryboard",
            id: "storyboard-1",
            sessionId: "session-main",
            artifactIds: ["artifact-video-storyboard"],
            sourceTurnId: "turn-storyboard-1",
            sourceTaskId: "task-storyboard-1",
          },
          title: "视频分镜",
          status: "ready",
          summary: "3 镜头短视频分镜",
          source: {
            taskKind: "content.video.storyboard.generate",
            taskId: "task-storyboard-1",
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
      ],
    };
    const viewModel = buildWorkspaceProductProfileViewModel(storyboardProfile);

    const artifact = buildWorkspaceProductProfilePreviewArtifact({
      artifactIds: viewModel.selectedArtifactIds,
      layout: viewModel.selectedSurface.layout,
      object: viewModel.selectedObject,
      preview: viewModel.selectedPreview,
      profile: storyboardProfile,
      now: 100,
    });

    expect(artifact).toMatchObject({
      title: "视频分镜",
      content: expect.stringContaining("厨房开场"),
      meta: expect.objectContaining({
        contentKind: "markdown",
        renderMode: "canvas",
        surfaceKind: "storyboard",
        layout: "storyboard",
        productProfileCardPreview: expect.objectContaining({
          layout: "storyboard",
          summary: "3 镜头短视频分镜",
          counts: expect.objectContaining({
            artifacts: 1,
            storyboardScenes: 1,
          }),
        }),
        productProfile: expect.objectContaining({
          surfaceKind: "storyboard",
          layout: "storyboard",
        }),
        artifactDocument: expect.objectContaining({
          kind: "brief",
          metadata: expect.objectContaining({
            productProfile: expect.objectContaining({
              objectKind: "videoStoryboard",
              surfaceKind: "storyboard",
              layout: "storyboard",
            }),
          }),
          blocks: [
            expect.objectContaining({
              type: "rich_text",
              markdown: expect.stringContaining("厨房开场"),
            }),
          ],
        }),
      }),
    });
  });

  it("应把交付检查清单投影为 checklist preview artifact", () => {
    const checklistProfile: WorkspaceProductProfile = {
      ...profile,
      selectedObjectRef: {
        appId: "content-factory-app",
        kind: "deliveryChecklist",
        id: "delivery-checklist-1",
        sessionId: "session-main",
      },
      objects: [
        ...profile.objects,
        {
          ref: {
            appId: "content-factory-app",
            kind: "deliveryChecklist",
            id: "delivery-checklist-1",
            sessionId: "session-main",
            artifactIds: ["artifact-delivery-checklist"],
            sourceTurnId: "turn-checklist-1",
            sourceTaskId: "task-checklist-1",
          },
          title: "交付检查清单",
          status: "ready",
          summary: "发布前检查项",
          source: {
            taskKind: "content.delivery.review",
            taskId: "task-checklist-1",
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
    };
    const viewModel = buildWorkspaceProductProfileViewModel(checklistProfile);

    const artifact = buildWorkspaceProductProfilePreviewArtifact({
      artifactIds: viewModel.selectedArtifactIds,
      layout: viewModel.selectedSurface.layout,
      object: viewModel.selectedObject,
      preview: viewModel.selectedPreview,
      profile: checklistProfile,
      now: 100,
    });

    expect(artifact).toMatchObject({
      title: "交付检查清单",
      content: expect.stringContaining("确认图片授权"),
      meta: expect.objectContaining({
        contentKind: "markdown",
        renderMode: "canvas",
        surfaceKind: "checklist",
        layout: "checklist",
        productProfileCardPreview: expect.objectContaining({
          layout: "checklist",
          summary: "发布前检查项",
          counts: expect.objectContaining({
            artifacts: 1,
            checklistItems: 2,
          }),
        }),
        productProfile: expect.objectContaining({
          surfaceKind: "checklist",
          layout: "checklist",
        }),
        artifactDocument: expect.objectContaining({
          kind: "plan",
          metadata: expect.objectContaining({
            productProfile: expect.objectContaining({
              objectKind: "deliveryChecklist",
              surfaceKind: "checklist",
              layout: "checklist",
            }),
          }),
          blocks: [
            expect.objectContaining({
              type: "checklist",
              items: [
                expect.objectContaining({
                  id: "article",
                  state: "done",
                }),
                expect.objectContaining({
                  id: "image-license",
                  state: "todo",
                  text: expect.stringContaining("发布前需复核"),
                }),
              ],
            }),
          ],
        }),
      }),
    });
  });
});
