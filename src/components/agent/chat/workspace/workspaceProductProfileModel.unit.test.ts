import { describe, expect, it } from "vitest";
import {
  buildWorkspaceProductProfileActionRequestMetadata,
  buildWorkspaceProductProfileFromPendingRequests,
  buildWorkspaceProductProfileFromThreadRead,
  buildWorkspaceProductProfileViewModel,
} from "./workspaceProductProfileModel";

const workspacePatch = {
  schemaVersion: "product-workspace.v1",
  appId: "content-factory-app",
  sessionId: "session-main",
  workspaceId: "workspace-main",
  primaryObjectRef: {
    appId: "content-factory-app",
    kind: "articleDraft",
    id: "article-1",
    sessionId: "session-main",
  },
  selectedObjectRef: {
    appId: "content-factory-app",
    kind: "imageGenerationSet",
    id: "image-set-1",
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
        sourceTurnId: "turn-1",
      },
      title: "公众号文章草稿",
      status: "ready",
      summary: "已生成首版文章",
      previewArtifactId: "artifact-article-1",
      source: {
        taskKind: "content.article.generate",
        artifactIds: ["artifact-article-1"],
        markdown: "# 标题\n\n这是首版文章正文。",
      },
    },
    {
      ref: {
        appId: "content-factory-app",
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
            url: "https://lime.local/image-1.png",
            prompt: "明亮的中文内容工厂主图",
          },
          {
            id: "artifact-image-local",
            title: "本地缓存图",
            filePath: "/tmp/lime-content-factory/local-image.png",
            prompt: "已缓存到本地的内容工厂配图",
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
  sourceArtifacts: [{ artifactRef: "artifact-workspace-patch-1" }],
  workerEvidence: [
    {
      id: "evt-worker-success:workerEvidence",
      status: "completed",
      source: "agent_app_task_worker",
      appId: "content-factory-app",
      taskId: "task-article-1",
      taskKind: "content.article.generate",
      turnId: "turn-action-1",
      artifactRef: "artifact-workspace-patch-1",
      artifactKind: "content_factory.workspace_patch",
      updatedAt: "2026-06-24T00:00:00.000Z",
    },
    {
      id: "evt-worker-failed:workerEvidence",
      status: "failed",
      source: "agent_app_task_worker",
      appId: "content-factory-app",
      taskId: "task-image-1",
      taskKind: "content.image.generate",
      turnId: "turn-action-2",
      errorCode: "worker_invalid_json_output",
      errorMessage: "Agent App worker returned invalid JSON",
      updatedAt: "2026-06-24T00:00:02.000Z",
    },
  ],
  actionHistory: [
    {
      id: "turn-action-1:productProfileAction:regenerate",
      key: "regenerate",
      intent: "regenerate",
      risk: "write",
      status: "completed",
      turnStatus: "completed",
      turnId: "turn-action-1",
      sessionId: "session-main",
      threadId: "thread-main",
      appId: "content-factory-app",
      objectRef: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
      },
      objectTitle: "配图组",
      objectStatus: "needs_review",
      taskKind: "content.image.generate",
      prompt: "请重新生成「配图组」",
      submittedAt: "2026-06-24T00:00:00.000Z",
      completedAt: "2026-06-24T00:00:01.000Z",
    },
  ],
  updatedAt: "2026-06-24T00:00:00.000Z",
};

describe("workspaceProductProfileModel", () => {
  it("应从 thread_read.product_workspace 投影内容工厂产物 Profile", () => {
    const profile = buildWorkspaceProductProfileFromThreadRead({
      thread_id: "thread-main",
      product_workspace: workspacePatch,
    });

    expect(profile).toMatchObject({
      appId: "content-factory-app",
      sessionId: "session-main",
      workspaceId: "workspace-main",
      source: "threadRead",
      objectCount: 2,
      layoutState: {
        activePaneKind: "imageGrid",
        openTabKinds: ["productProfile", "files"],
      },
    });
    expect(profile?.objects.map((object) => object.ref.kind)).toEqual([
      "articleDraft",
      "imageGenerationSet",
    ]);
  });

  it("应从 productProfile pending metadata 投影并保留请求来源", () => {
    const profile = buildWorkspaceProductProfileFromPendingRequests([
      {
        requestId: "right_surface_product_profile_1",
        workspaceId: "workspace-main",
        sessionId: "session-main",
        surfaceKind: "productProfile",
        origin: "runtime",
        priority: "foreground",
        status: "pending",
        reason: "product_profile_ready",
        requestedAt: "2026-06-24T00:00:00.000Z",
        metadata: {
          contentFactoryWorkspacePatch: workspacePatch,
        },
      },
    ]);

    expect(profile).toMatchObject({
      source: "rightSurfacePending",
      appId: "content-factory-app",
      sessionId: "session-main",
      workspaceId: "workspace-main",
      updatedAt: "2026-06-24T00:00:00.000Z",
    });
  });

  it("view model 应优先选择 selectedObjectRef 并统计状态", () => {
    const profile = buildWorkspaceProductProfileFromThreadRead({
      thread_id: "thread-main",
      productWorkspace: workspacePatch,
    });
    expect(profile).not.toBeNull();

    const viewModel = buildWorkspaceProductProfileViewModel(profile!);

    expect(viewModel.selectedObject.ref.kind).toBe("imageGenerationSet");
    expect(viewModel.selectedObject.title).toBe("配图组");
    expect(viewModel.selectedSurface).toMatchObject({
      layout: "imageGrid",
      titleKey: "workspace.productProfile.surface.imageGrid",
    });
    expect(viewModel.selectedActions.map((action) => action.key)).toEqual([
      "regenerate",
      "create_variant",
      "apply_to_article",
    ]);
    expect(viewModel.selectedArtifactIds).toEqual(["artifact-image-1"]);
    expect(viewModel.selectedPreview.images).toEqual([
      expect.objectContaining({
        id: "artifact-image-1",
        title: "主图",
        url: "https://lime.local/image-1.png",
      }),
      expect.objectContaining({
        id: "artifact-image-local",
        localPath: "/tmp/lime-content-factory/local-image.png",
        filePath: "/tmp/lime-content-factory/local-image.png",
        url: null,
      }),
    ]);
    expect(viewModel.selectedActionHistory).toEqual([
      expect.objectContaining({
        key: "regenerate",
        status: "completed",
        turnId: "turn-action-1",
      }),
    ]);
    expect(viewModel.latestSelectedAction?.taskKind).toBe(
      "content.image.generate",
    );
    expect(viewModel.statusCounts.ready).toBe(1);
    expect(viewModel.statusCounts.needs_review).toBe(1);
    expect(viewModel.sourceArtifacts).toEqual([
      { artifactRef: "artifact-workspace-patch-1" },
    ]);
    expect(viewModel.latestWorkerEvidence).toEqual(
      expect.objectContaining({
        status: "failed",
        taskId: "task-image-1",
        errorCode: "worker_invalid_json_output",
      }),
    );
    expect(viewModel.workerEvidence).toHaveLength(2);
  });

  it("应从对象 source 投影结构化预览内容", () => {
    const profile = buildWorkspaceProductProfileFromThreadRead({
      thread_id: "thread-main",
      productWorkspace: {
        ...workspacePatch,
        selectedObjectRef: {
          appId: "content-factory-app",
          kind: "articleDraft",
          id: "article-1",
          sessionId: "session-main",
        },
      },
    });
    expect(profile).not.toBeNull();

    const viewModel = buildWorkspaceProductProfileViewModel(profile!);

    expect(viewModel.selectedPreview.documentText).toContain("首版文章正文");
    expect(viewModel.selectedPreview.images).toEqual([]);
  });

  it("旧 read model 没有 workerEvidence 时应从 diagnostics 投影失败记录", () => {
    const legacyWorkspacePatch = {
      ...workspacePatch,
    } as Record<string, unknown>;
    delete legacyWorkspacePatch.workerEvidence;
    const profile = buildWorkspaceProductProfileFromThreadRead({
      thread_id: "thread-main",
      active_turn_id: "turn-worker-failed",
      productWorkspace: legacyWorkspacePatch,
      diagnostics: {
        latest_turn_error_message:
          "Agent App task worker failed: invalid JSON",
        latest_turn_completed_at: "2026-06-24T00:00:03.000Z",
        warning_count: 0,
        context_compaction_count: 0,
        failed_tool_call_count: 0,
        failed_command_count: 0,
        pending_request_count: 0,
      },
    });
    expect(profile).not.toBeNull();

    const viewModel = buildWorkspaceProductProfileViewModel(profile!);

    expect(viewModel.latestWorkerEvidence).toEqual(
      expect.objectContaining({
        status: "failed",
        turnId: "turn-worker-failed",
        errorMessage: "Agent App task worker failed: invalid JSON",
      }),
    );
  });

  it("应构造可随 Claw turn 透传的 Product Profile action metadata", () => {
    const profile = buildWorkspaceProductProfileFromThreadRead({
      thread_id: "thread-main",
      productWorkspace: workspacePatch,
    });
    expect(profile).not.toBeNull();
    const viewModel = buildWorkspaceProductProfileViewModel(profile!);
    const action = viewModel.selectedActions.find(
      (candidate) => candidate.key === "regenerate",
    );
    expect(action).toBeDefined();

    const metadata = buildWorkspaceProductProfileActionRequestMetadata({
      action: action!,
      object: viewModel.selectedObject,
      profile: profile!,
      prompt: "请重新生成「配图组」",
    });

    expect(metadata).toMatchObject({
      agent_app: {
        source: "right_surface_product_profile",
        app_id: "content-factory-app",
        session_id: "session-main",
        workspace_id: "workspace-main",
        product_profile_action: {
          key: "regenerate",
          intent: "regenerate",
          risk: "write",
          task_kind: "content.image.generate",
          prompt: "请重新生成「配图组」",
          object: {
            app_id: "content-factory-app",
            kind: "imageGenerationSet",
            id: "image-set-1",
            session_id: "session-main",
            title: "配图组",
            status: "needs_review",
            artifact_ids: ["artifact-image-1"],
          },
        },
      },
      right_surface: {
        surface_kind: "productProfile",
        source: "threadRead",
        action_key: "regenerate",
      },
    });
  });
});
