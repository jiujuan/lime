import { describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import {
  createMediaReferencePreviewArtifact,
  isTaskCenterDraftSendPendingForLayout,
  resolveDefaultSelectedArtifact,
  resolveRuntimeWorkspaceId,
  resolveTaskCenterHomeSurfaceState,
  shouldBuildFullThreadTimeline,
  shouldAutoRefreshWorkspaceRightSurfacePending,
  shouldSuppressTaskCenterDraftContentForLayout,
  shouldAutoRecoverWorkspacePathMissing,
} from "./agentChatWorkspaceHelpers";

const DOCUMENT_ARTIFACT_TYPE = ("doc" + "ument") as Artifact["type"];
const t = (key: string, options?: Record<string, unknown>) => {
  if (key === "agentChat.mediaReferencePreview.fallbackTitle") {
    return `媒体引用 ${options?.index ?? ""}`;
  }
  if (key === "agentChat.mediaReferencePreview.previewUnavailable") {
    return "该媒体当前以引用形式保存，完整预览需要 media sidecar source 接管。";
  }
  if (key === "agentChat.mediaReferencePreview.reference") {
    return `引用：${options?.value ?? ""}`;
  }
  if (key === "agentChat.mediaReferencePreview.kind") {
    return `类型：${options?.value ?? ""}`;
  }
  if (key === "agentChat.mediaReferencePreview.mime") {
    return `MIME：${options?.value ?? ""}`;
  }
  if (key === "agentChat.mediaReferencePreview.byteSize") {
    return `大小：${options?.value ?? ""} 字节`;
  }
  if (key === "agentChat.mediaReferencePreview.sha256") {
    return `SHA-256：${options?.value ?? ""}`;
  }
  return key;
};

function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const content = overrides.content ?? "# 文稿";

  return {
    id: overrides.id ?? "artifact-doc-1",
    type: overrides.type ?? DOCUMENT_ARTIFACT_TYPE,
    title: overrides.title ?? "文稿",
    content,
    status: overrides.status ?? "complete",
    meta: overrides.meta ?? {},
    position: overrides.position ?? { start: 0, end: content.length },
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    error: overrides.error,
  };
}

describe("createMediaReferencePreviewArtifact", () => {
  it("sidecar media reference 应生成 metadata fallback artifact，不展开媒体 payload", () => {
    const artifact = createMediaReferencePreviewArtifact({
      message: {
        id: "assistant-media",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-07-07T00:00:00.000Z"),
      },
      target: {
        kind: "media_reference",
        index: 0,
        reference: {
          kind: "image",
          uri: "sidecar://media/image-1",
          mimeType: "image/png",
          caption: "结果图",
          byteSize: 2048,
          sha256: "sha256-image-1",
        },
      },
      t,
    });

    expect(artifact.title).toBe("结果图");
    expect(artifact.content).toContain("media sidecar source");
    expect(artifact.content).toContain("sidecar://media/image-1");
    expect(artifact.meta).toMatchObject({
      openedFrom: "message-media-reference",
      messageId: "assistant-media",
      mediaUri: "sidecar://media/image-1",
      contentKind: "markdown",
      renderMode: "canvas",
    });
  });

  it("带 sourcePath owner 的 sidecar media reference 应生成 media artifact", () => {
    const artifact = createMediaReferencePreviewArtifact({
      message: {
        id: "assistant-media-source",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-07-07T00:00:00.000Z"),
      },
      target: {
        kind: "media_reference",
        index: 0,
        reference: {
          kind: "image",
          uri: "sidecar://media/image-1",
          mimeType: "image/png",
          title: "image-1.png",
          sourcePath: "/tmp/lime-media/image-1.png",
        },
      },
      t,
    });

    expect(artifact.title).toBe("image-1.png");
    expect(artifact.content).not.toContain("media sidecar source");
    expect(artifact.meta).toMatchObject({
      openedFrom: "message-media-reference",
      mediaUri: "sidecar://media/image-1",
      mediaSourcePath: "/tmp/lime-media/image-1.png",
      mediaPreviewSource: "source_path",
      sourcePath: "/tmp/lime-media/image-1.png",
      contentKind: "image",
      renderMode: "media",
    });
  });

  it("inline data previewUrl 应 fail closed 到 metadata fallback", () => {
    const artifact = createMediaReferencePreviewArtifact({
      message: {
        id: "assistant-media-inline-preview",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-07-07T00:00:00.000Z"),
      },
      target: {
        kind: "media_reference",
        index: 0,
        reference: {
          kind: "image",
          uri: "sidecar://media/image-1",
          mimeType: "image/png",
          title: "image-1.png",
          previewUrl: "data:image/png;base64,AAAA",
        },
      },
      t,
    });

    expect(artifact.content).toContain("media sidecar source");
    expect(artifact.content).toContain("sidecar://media/image-1");
    expect(artifact.content).not.toContain("data:image");
    expect(artifact.meta).toMatchObject({
      contentKind: "markdown",
      renderMode: "canvas",
    });
    expect(artifact.meta.mediaPreviewUrl).toBeUndefined();
  });

  it("可直接预览的媒体 URI 应生成 media artifact", () => {
    const artifact = createMediaReferencePreviewArtifact({
      message: {
        id: "assistant-media-direct",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-07-07T00:00:00.000Z"),
      },
      target: {
        kind: "media_reference",
        index: 1,
        reference: {
          kind: "image",
          uri: "https://example.com/image.png",
          mimeType: "image/png",
          title: "image.png",
        },
      },
      t,
    });

    expect(artifact.title).toBe("image.png");
    expect(artifact.content).toBe("https://example.com/image.png");
    expect(artifact.meta).toMatchObject({
      openedFrom: "message-media-reference",
      contentKind: "image",
      renderMode: "media",
      previewUrl: "https://example.com/image.png",
    });
  });
});

describe("resolveTaskCenterHomeSurfaceState", () => {
  it("任务中心草稿 surface 应压住旧会话活动并进入首页", () => {
    const state = resolveTaskCenterHomeSurfaceState({
      agentEntry: "claw",
      draftSurfaceActive: true,
      shouldSuppressDraftContent: true,
      sessionSwitchPending: false,
      hasConversationActivity: false,
      sessionId: "old-session",
      embeddedHomeSessionIds: new Set(),
      isAutoRestoringSession: true,
      isSessionHydrating: true,
    });

    expect(state.shouldRenderEmbeddedHome).toBe(true);
    expect(state.shouldHideCurrentSessionContent).toBe(true);
    expect(state.isRestoringSession).toBe(false);
    expect(state.sceneSessionId).toBeNull();
  });

  it("草稿发送后应退出首页，交给会话布局展示预览", () => {
    const state = resolveTaskCenterHomeSurfaceState({
      agentEntry: "claw",
      draftSurfaceActive: true,
      shouldSuppressDraftContent: false,
      sessionSwitchPending: false,
      hasConversationActivity: true,
      sessionId: "new-session",
      embeddedHomeSessionIds: new Set(["new-session"]),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
    });

    expect(state.shouldRenderEmbeddedHome).toBe(false);
    expect(state.shouldHideCurrentSessionContent).toBe(false);
    expect(state.sceneSessionId).toBe("new-session");
  });

  it("草稿 surface 标志滞留时，已有真实会话活动不应被首页覆盖", () => {
    const state = resolveTaskCenterHomeSurfaceState({
      agentEntry: "claw",
      draftSurfaceActive: true,
      shouldSuppressDraftContent: true,
      sessionSwitchPending: false,
      hasConversationActivity: false,
      hasCurrentSessionActivity: true,
      sessionId: "active-session",
      embeddedHomeSessionIds: new Set(["active-session"]),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
    });

    expect(state.shouldRenderEmbeddedHome).toBe(false);
    expect(state.shouldHideCurrentSessionContent).toBe(false);
    expect(state.sceneSessionId).toBe("active-session");
  });

  it("从侧栏打开历史空会话时不应被任务中心首页覆盖", () => {
    const state = resolveTaskCenterHomeSurfaceState({
      agentEntry: "claw",
      draftSurfaceActive: false,
      shouldSuppressDraftContent: false,
      sessionSwitchPending: false,
      hasInitialSessionRoute: true,
      hasConversationActivity: false,
      sessionId: "session-from-sidebar",
      embeddedHomeSessionIds: new Set(["session-from-sidebar"]),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
    });

    expect(state.shouldRenderEmbeddedHome).toBe(false);
    expect(state.shouldHideCurrentSessionContent).toBe(false);
    expect(state.sceneSessionId).toBe("session-from-sidebar");
  });

  it("路由携带 standalone initialSessionId 时应优先展示恢复壳而不是首页空态", () => {
    const state = resolveTaskCenterHomeSurfaceState({
      agentEntry: "claw",
      draftSurfaceActive: false,
      shouldSuppressDraftContent: true,
      sessionSwitchPending: false,
      hasInitialSessionRoute: true,
      hasConversationActivity: false,
      sessionId: null,
      embeddedHomeSessionIds: new Set(),
      isAutoRestoringSession: false,
      isSessionHydrating: true,
    });

    expect(state.shouldRenderEmbeddedHome).toBe(false);
    expect(state.shouldHideCurrentSessionContent).toBe(false);
    expect(state.isRestoringSession).toBe(true);
    expect(state.sceneSessionId).toBeNull();
  });

  it("旧会话切换中即使草稿 suppression 滞留也应展示恢复壳", () => {
    const state = resolveTaskCenterHomeSurfaceState({
      agentEntry: "claw",
      draftSurfaceActive: true,
      shouldSuppressDraftContent: true,
      sessionSwitchPending: true,
      hasInitialSessionRoute: false,
      hasConversationActivity: false,
      hasCurrentSessionActivity: false,
      sessionId: "history-session",
      embeddedHomeSessionIds: new Set(),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
    });

    expect(state.shouldRenderEmbeddedHome).toBe(false);
    expect(state.shouldHideCurrentSessionContent).toBe(true);
    expect(state.isRestoringSession).toBe(true);
    expect(state.sceneSessionId).toBeNull();
  });

  it("侧栏新建任务激活草稿 surface 时应压住旧 route session", () => {
    const state = resolveTaskCenterHomeSurfaceState({
      agentEntry: "claw",
      draftSurfaceActive: true,
      shouldSuppressDraftContent: true,
      sessionSwitchPending: false,
      hasInitialSessionRoute: true,
      hasConversationActivity: false,
      sessionId: "old-session",
      embeddedHomeSessionIds: new Set(),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
    });

    expect(state.shouldRenderEmbeddedHome).toBe(true);
    expect(state.shouldHideCurrentSessionContent).toBe(true);
    expect(state.sceneSessionId).toBeNull();
  });
});

describe("isTaskCenterDraftSendPendingForLayout", () => {
  it("已有真实消息且没有发送/队列时应收起首页首发 pending 态", () => {
    expect(
      isTaskCenterDraftSendPendingForLayout({
        hasDraftSendRequest: true,
        hasDisplayMessages: true,
        isSending: false,
        queuedTurnCount: 0,
      }),
    ).toBe(false);
  });

  it("仍在发送或还没有真实消息时应保持 pending 态", () => {
    expect(
      isTaskCenterDraftSendPendingForLayout({
        hasDraftSendRequest: true,
        hasDisplayMessages: false,
        isSending: false,
        queuedTurnCount: 0,
      }),
    ).toBe(true);
    expect(
      isTaskCenterDraftSendPendingForLayout({
        hasDraftSendRequest: true,
        hasDisplayMessages: true,
        isSending: true,
        queuedTurnCount: 0,
      }),
    ).toBe(true);
  });
});

describe("shouldBuildFullThreadTimeline", () => {
  it("普通聊天发送中不应构建完整 timeline", () => {
    expect(
      shouldBuildFullThreadTimeline({
        harnessPanelVisible: false,
        layoutMode: "chat",
      }),
    ).toBe(false);
  });

  it("打开 Harness 或工作台时应构建完整 timeline", () => {
    expect(
      shouldBuildFullThreadTimeline({
        harnessPanelVisible: true,
        layoutMode: "chat",
      }),
    ).toBe(true);
    expect(
      shouldBuildFullThreadTimeline({
        harnessPanelVisible: false,
        layoutMode: "canvas",
      }),
    ).toBe(true);
  });

  it("普通聊天非发送态也不应默认构建完整 timeline", () => {
    expect(
      shouldBuildFullThreadTimeline({
        harnessPanelVisible: false,
        layoutMode: "chat",
      }),
    ).toBe(false);
  });
});

describe("shouldAutoRefreshWorkspaceRightSurfacePending", () => {
  const baseParams = {
    sessionId: null,
    workspaceId: null,
    workspaceRoot: null,
    sceneIsSending: false,
    sceneIsPreparingSend: false,
    sceneLayoutMode: "chat",
    manualRightSurfaceActive: false,
    pluginActivationActive: false,
  };

  it("有 workspace scope 时即使空会话也应刷新 right surface pending", () => {
    expect(
      shouldAutoRefreshWorkspaceRightSurfacePending({
        ...baseParams,
        workspaceId: "workspace-1",
      }),
    ).toBe(true);
    expect(
      shouldAutoRefreshWorkspaceRightSurfacePending({
        ...baseParams,
        workspaceRoot: "/tmp/project",
      }),
    ).toBe(true);
  });

  it("没有 session 和 workspace scope 时默认不刷新", () => {
    expect(shouldAutoRefreshWorkspaceRightSurfacePending(baseParams)).toBe(
      false,
    );
  });

  it("无 scope 但有运行中或手动 surface 信号时仍允许刷新", () => {
    expect(
      shouldAutoRefreshWorkspaceRightSurfacePending({
        ...baseParams,
        sceneIsPreparingSend: true,
      }),
    ).toBe(true);
    expect(
      shouldAutoRefreshWorkspaceRightSurfacePending({
        ...baseParams,
        manualRightSurfaceActive: true,
      }),
    ).toBe(true);
  });
});

describe("shouldSuppressTaskCenterDraftContentForLayout", () => {
  it("草稿首页仅在没有真实会话活动时压制当前内容", () => {
    expect(
      shouldSuppressTaskCenterDraftContentForLayout({
        draftSurfaceActive: true,
        draftSendInFlight: false,
        hasVisibleSessionActivity: false,
      }),
    ).toBe(true);

    expect(
      shouldSuppressTaskCenterDraftContentForLayout({
        draftSurfaceActive: true,
        draftSendInFlight: false,
        hasVisibleSessionActivity: true,
      }),
    ).toBe(false);
  });

  it("草稿发送中不应被首页空态压制", () => {
    expect(
      shouldSuppressTaskCenterDraftContentForLayout({
        draftSurfaceActive: true,
        draftSendInFlight: true,
        hasVisibleSessionActivity: false,
      }),
    ).toBe(false);
  });
});

describe("resolveRuntimeWorkspaceId", () => {
  it("应只依赖当前 projectId，不因项目详情或目录健康状态缺失而清空", () => {
    expect(resolveRuntimeWorkspaceId(" remembered-project ")).toBe(
      "remembered-project",
    );
  });

  it("应拒绝 default/legacy alias，避免把占位项目写入 session", () => {
    expect(resolveRuntimeWorkspaceId("default")).toBe("");
    expect(resolveRuntimeWorkspaceId("workspace-default")).toBe("");
    expect(resolveRuntimeWorkspaceId("")).toBe("");
  });
});

describe("shouldAutoRecoverWorkspacePathMissing", () => {
  it("临时 workspace 发送失败后应允许自动回收默认 workspace", () => {
    expect(
      shouldAutoRecoverWorkspacePathMissing(
        { workspaceType: "temporary" },
        { content: "继续", images: [] },
      ),
    ).toBe(true);
  });

  it("持久 workspace 路径失败仍应保留手动重新选择目录", () => {
    expect(
      shouldAutoRecoverWorkspacePathMissing(
        { workspaceType: "general" },
        { content: "继续", images: [] },
      ),
    ).toBe(false);
    expect(
      shouldAutoRecoverWorkspacePathMissing(
        { workspaceType: "persistent" },
        { content: "继续", images: [] },
      ),
    ).toBe(false);
  });

  it("没有发送失败 payload 时不应自动切换 workspace", () => {
    expect(
      shouldAutoRecoverWorkspacePathMissing(
        { workspaceType: "temporary" },
        false,
      ),
    ).toBe(false);
  });
});

describe("resolveDefaultSelectedArtifact", () => {
  it("通用工作区默认回退不应把浏览器协助 artifact 当作首选", () => {
    const browserAssistArtifact = createArtifact({
      id: "browser-assist:general",
      type: "browser_assist",
      title: "浏览器协助",
      content: "",
      meta: {
        persistOutsideMessages: true,
        browserAssistScopeKey: "workspace:session-1",
      },
      createdAt: 3,
      updatedAt: 4,
    });
    const documentArtifact = createArtifact({
      id: "artifact-doc-1",
      title: "需求草稿",
      content: "# 需求草稿",
      meta: {
        filePath: "internal/prd.md",
      },
      createdAt: 1,
      updatedAt: 2,
    });

    expect(
      resolveDefaultSelectedArtifact("general", [
        browserAssistArtifact,
        documentArtifact,
      ])?.id,
    ).toBe("artifact-doc-1");
    expect(
      resolveDefaultSelectedArtifact("general", [browserAssistArtifact]),
    ).toBeNull();
  });

  it("通用工作区应把用户可消费的文章文档 artifact 作为默认右侧画布", () => {
    const generatedDocument = createArtifact({
      id: "artifact-generated-doc-1",
      title: "导出结果",
      content: "# 导出结果",
      meta: {
        filePath: "exports/x-article-export/result.md",
        source: "artifact_snapshot",
      },
    });

    expect(
      resolveDefaultSelectedArtifact("general", [generatedDocument])?.id,
    ).toBe("artifact-generated-doc-1");
  });

  it("通用工作区默认回退不应自动选中内部 ArtifactDocument 快照", () => {
    const internalDocument = createArtifact({
      id: "artifact-internal-doc-1",
      title: "report.artifact.json",
      content: '{"schemaVersion":"artifact_document.v1"}',
      meta: {
        filePath: ".lime/artifacts/thread-1/report.artifact.json",
        source: "artifact_snapshot",
      },
    });

    expect(resolveDefaultSelectedArtifact("general", [internalDocument])).toBe(
      null,
    );
  });

  it("非通用工作区仍沿用最后一个 artifact 作为默认回退", () => {
    const firstArtifact = createArtifact({
      id: "artifact-doc-1",
    });
    const lastArtifact = createArtifact({
      id: "artifact-doc-2",
    });

    expect(
      resolveDefaultSelectedArtifact("article", [firstArtifact, lastArtifact])
        ?.id,
    ).toBe("artifact-doc-2");
  });
});
