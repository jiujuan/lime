import { describe, expect, it } from "vitest";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";
import {
  resolveTaskCenterDraftSurfaceState,
  resolveTaskCenterHomeChromeState,
} from "./taskCenterSurfaceState";

function createDraftTab(
  id: string,
  overrides: Partial<TaskCenterDraftTab> = {},
): TaskCenterDraftTab {
  const now = new Date("2026-06-22T00:00:00.000Z");
  return {
    id,
    title: overrides.title ?? "新任务",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    status: overrides.status ?? "draft",
  };
}

function createDraftSendRequest(
  overrides: Partial<TaskCenterDraftSendRequest> = {},
): TaskCenterDraftSendRequest {
  return {
    id: overrides.id ?? "request-1",
    draftTabId: overrides.draftTabId ?? "draft-1",
    text: overrides.text ?? "整理今天的国际新闻",
    images: overrides.images ?? [],
    submittedAt: overrides.submittedAt ?? Date.parse("2026-06-22T00:00:00Z"),
    materializeDraft: overrides.materializeDraft ?? true,
    source: overrides.source ?? "task-center-empty-state",
    sendExecutionStrategy: overrides.sendExecutionStrategy,
    sendOptions: overrides.sendOptions,
  };
}

describe("resolveTaskCenterDraftSurfaceState", () => {
  it("激活草稿页且尚未发送时应压制旧会话内容", () => {
    const draftTab = createDraftTab("draft-1");
    const state = resolveTaskCenterDraftSurfaceState({
      agentEntry: "claw",
      isTaskCenterEntry: true,
      activeDraftTabId: draftTab.id,
      draftTabs: [draftTab],
      draftSurfaceActive: false,
      draftSendRequest: null,
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      queuedTurnCount: 0,
    });

    expect(state.activeTaskCenterDraftTab?.id).toBe("draft-1");
    expect(state.isTaskCenterDraftTabActive).toBe(true);
    expect(state.isTaskCenterDraftSurfaceActive).toBe(true);
    expect(state.isTaskCenterDraftSendInFlight).toBe(false);
    expect(state.shouldSuppressTaskCenterDraftContent).toBe(true);
  });

  it("草稿发送中不应被首页空态压制", () => {
    const draftTab = createDraftTab("draft-1");
    const state = resolveTaskCenterDraftSurfaceState({
      agentEntry: "claw",
      isTaskCenterEntry: true,
      activeDraftTabId: draftTab.id,
      draftTabs: [draftTab],
      draftSurfaceActive: false,
      draftSendRequest: createDraftSendRequest({ draftTabId: draftTab.id }),
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: true,
      queuedTurnCount: 0,
    });

    expect(state.isTaskCenterDraftSendInFlight).toBe(true);
    expect(state.shouldSuppressTaskCenterDraftContent).toBe(false);
  });

  it("草稿 surface 标志滞留但已有会话活动时不应压制内容", () => {
    const state = resolveTaskCenterDraftSurfaceState({
      agentEntry: "claw",
      isTaskCenterEntry: true,
      activeDraftTabId: null,
      draftTabs: [],
      draftSurfaceActive: true,
      draftSendRequest: null,
      displayMessageCount: 1,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      queuedTurnCount: 0,
    });

    expect(state.isTaskCenterDraftSurfaceActive).toBe(true);
    expect(state.hasVisibleSessionActivityForDraftSurface).toBe(true);
    expect(state.shouldSuppressTaskCenterDraftContent).toBe(false);
  });
});

describe("resolveTaskCenterHomeChromeState", () => {
  it("草稿首页无会话活动时应渲染 embedded home 并隐藏首页工具动作", () => {
    const state = resolveTaskCenterHomeChromeState({
      agentEntry: "claw",
      draftSurfaceActive: true,
      draftTabActive: false,
      shouldSuppressDraftContent: true,
      draftSendRequest: null,
      sessionSwitchPending: false,
      hasInitialSessionRoute: false,
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      isHomePendingPreviewActive: false,
      queuedTurnCount: 0,
      sessionId: "old-session",
      embeddedHomeSessionIds: new Set(),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      shouldUseBrowserWorkspaceHomeChrome: true,
    });

    expect(state.hasHomeConversationActivity).toBe(false);
    expect(state.taskCenterHomeSurfaceState.shouldRenderEmbeddedHome).toBe(
      true,
    );
    expect(state.shouldRenderTaskCenterEmbeddedHome).toBe(true);
    expect(state.suppressHomeNavbarUtilityActions).toBe(true);
  });

  it("首页 pending preview 已出现时应保留当前会话内容", () => {
    const state = resolveTaskCenterHomeChromeState({
      agentEntry: "claw",
      draftSurfaceActive: true,
      draftTabActive: false,
      shouldSuppressDraftContent: false,
      draftSendRequest: createDraftSendRequest(),
      sessionSwitchPending: false,
      hasInitialSessionRoute: false,
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      isHomePendingPreviewActive: true,
      queuedTurnCount: 0,
      sessionId: "new-session",
      embeddedHomeSessionIds: new Set(["new-session"]),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      shouldUseBrowserWorkspaceHomeChrome: true,
    });

    expect(state.hasCurrentSessionActivity).toBe(true);
    expect(state.hasHomeConversationActivity).toBe(true);
    expect(
      state.taskCenterHomeSurfaceState.shouldHideCurrentSessionContent,
    ).toBe(false);
    expect(state.shouldRenderTaskCenterEmbeddedHome).toBe(false);
  });

  it("从路由打开历史空会话时不应被任务中心首页覆盖", () => {
    const state = resolveTaskCenterHomeChromeState({
      agentEntry: "claw",
      draftSurfaceActive: false,
      draftTabActive: false,
      shouldSuppressDraftContent: false,
      draftSendRequest: null,
      sessionSwitchPending: false,
      hasInitialSessionRoute: true,
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      isHomePendingPreviewActive: false,
      queuedTurnCount: 0,
      sessionId: "session-from-sidebar",
      embeddedHomeSessionIds: new Set(["session-from-sidebar"]),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      shouldUseBrowserWorkspaceHomeChrome: false,
    });

    expect(state.taskCenterHomeSurfaceState.shouldRenderEmbeddedHome).toBe(
      false,
    );
    expect(state.taskCenterHomeSurfaceState.sceneSessionId).toBe(
      "session-from-sidebar",
    );
  });
});
