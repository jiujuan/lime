import { describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import {
  resolveDefaultSelectedArtifact,
  resolveTaskCenterHomeSurfaceState,
} from "./agentChatWorkspaceHelpers";

const DOCUMENT_ARTIFACT_TYPE = ("doc" + "ument") as Artifact["type"];

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

  it("通用工作区默认回退不应自动选中后台生成的文档 artifact", () => {
    const generatedDocument = createArtifact({
      id: "artifact-generated-doc-1",
      title: "导出结果",
      content: "# 导出结果",
      meta: {
        filePath: "exports/x-article-export/result.md",
        source: "artifact_snapshot",
      },
    });

    expect(resolveDefaultSelectedArtifact("general", [generatedDocument])).toBe(
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
      resolveDefaultSelectedArtifact("article", [
        firstArtifact,
        lastArtifact,
      ])?.id,
    ).toBe("artifact-doc-2");
  });
});
