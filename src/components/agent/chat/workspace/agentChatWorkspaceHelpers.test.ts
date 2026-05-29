import { describe, expect, it } from "vitest";
import { resolveTaskCenterHomeSurfaceState } from "./agentChatWorkspaceHelpers";

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
