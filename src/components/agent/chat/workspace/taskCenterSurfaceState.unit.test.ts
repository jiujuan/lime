import { describe, expect, it } from "vitest";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";
import {
  hasTaskCenterPendingPreviewActivity,
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
    dispatchState: overrides.dispatchState,
    source: overrides.source ?? "task-center-empty-state",
    sendExecutionStrategy: overrides.sendExecutionStrategy,
    sendOptions: overrides.sendOptions,
  };
}

describe("hasTaskCenterPendingPreviewActivity", () => {
  it("home preview 已清但 bootstrap preview 仍有消息时应保持活跃", () => {
    expect(hasTaskCenterPendingPreviewActivity(false, 1)).toBe(true);
    expect(hasTaskCenterPendingPreviewActivity(false, 0)).toBe(false);
  });
});

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

  it("激活草稿的 direct-dispatch pending send 应立即解除首页压制", () => {
    const draftTab = createDraftTab("draft-1");
    const state = resolveTaskCenterDraftSurfaceState({
      agentEntry: "claw",
      isTaskCenterEntry: true,
      activeDraftTabId: draftTab.id,
      draftTabs: [draftTab],
      draftSurfaceActive: false,
      draftSendRequest: createDraftSendRequest({
        draftTabId: "draft-send-request-1",
        materializeDraft: false,
        dispatchState: "dispatched",
      }),
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      queuedTurnCount: 0,
    });

    expect(state.isTaskCenterDraftTabActive).toBe(true);
    expect(state.isTaskCenterDraftSendInFlight).toBe(false);
    expect(state.hasVisibleSessionActivityForDraftSurface).toBe(true);
    expect(state.shouldSuppressTaskCenterDraftContent).toBe(false);
  });

  it("direct-dispatch tracking 清除后仍有 pending preview 时不应闪回首页", () => {
    const draftTab = createDraftTab("draft-1");
    const state = resolveTaskCenterDraftSurfaceState({
      agentEntry: "claw",
      isTaskCenterEntry: true,
      activeDraftTabId: draftTab.id,
      draftTabs: [draftTab],
      draftSurfaceActive: false,
      draftSendRequest: null,
      hasHomePendingPreview: true,
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      queuedTurnCount: 0,
    });

    expect(state.isTaskCenterDraftTabActive).toBe(true);
    expect(state.hasVisibleSessionActivityForDraftSurface).toBe(true);
    expect(state.shouldSuppressTaskCenterDraftContent).toBe(false);
  });

  it("新 session 接管时 request 和 preview 已清但仍在发送不应闪回首页", () => {
    const draftTab = createDraftTab("draft-1");
    const state = resolveTaskCenterDraftSurfaceState({
      agentEntry: "claw",
      isTaskCenterEntry: true,
      activeDraftTabId: draftTab.id,
      draftTabs: [draftTab],
      draftSurfaceActive: false,
      draftSendRequest: null,
      hasHomePendingPreview: false,
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: true,
      queuedTurnCount: 0,
    });

    expect(state.isTaskCenterDraftTabActive).toBe(true);
    expect(state.hasVisibleSessionActivityForDraftSurface).toBe(true);
    expect(state.shouldSuppressTaskCenterDraftContent).toBe(false);
  });

  it("new-task 草稿发送中也不应被首页空态压制", () => {
    const draftTab = createDraftTab("draft-new-task");
    const state = resolveTaskCenterDraftSurfaceState({
      agentEntry: "new-task",
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

  it("草稿 surface 标志滞留但已有本地物化会话时不应压制内容", () => {
    const state = resolveTaskCenterDraftSurfaceState({
      agentEntry: "claw",
      isTaskCenterEntry: true,
      activeDraftTabId: null,
      draftTabs: [],
      draftSurfaceActive: true,
      draftSendRequest: null,
      displayMessageCount: 0,
      threadItemCount: 0,
      hasLocalSessionOverride: true,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      queuedTurnCount: 0,
    });

    expect(state.hasVisibleSessionActivityForDraftSurface).toBe(true);
    expect(state.shouldSuppressTaskCenterDraftContent).toBe(false);
  });

  it("首页发送请求已创建时应展示 pending preview 而不是继续压制内容", () => {
    const state = resolveTaskCenterDraftSurfaceState({
      agentEntry: "new-task",
      isTaskCenterEntry: true,
      activeDraftTabId: null,
      draftTabs: [],
      draftSurfaceActive: true,
      draftSendRequest: createDraftSendRequest({
        materializeDraft: false,
        source: "empty-state",
      }),
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      queuedTurnCount: 0,
    });

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

  it("首页发送请求已创建但 pending preview 尚未派生时应立即退出 embedded home", () => {
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
      isHomePendingPreviewActive: false,
      queuedTurnCount: 0,
      sessionId: "new-session",
      embeddedHomeSessionIds: new Set(["new-session"]),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      shouldUseBrowserWorkspaceHomeChrome: true,
    });

    expect(state.hasCurrentSessionActivity).toBe(true);
    expect(state.hasHomeConversationActivity).toBe(true);
    expect(state.taskCenterHomeSurfaceState.shouldRenderEmbeddedHome).toBe(
      false,
    );
    expect(
      state.taskCenterHomeSurfaceState.shouldHideCurrentSessionContent,
    ).toBe(false);
    expect(state.taskCenterHomeSurfaceState.sceneSessionId).toBe("new-session");
  });

  it("首页发送刚触发但 preview 尚未派生时不应闪回 embedded home", () => {
    const state = resolveTaskCenterHomeChromeState({
      agentEntry: "claw",
      draftSurfaceActive: true,
      draftTabActive: false,
      shouldSuppressDraftContent: false,
      draftSendRequest: null,
      sessionSwitchPending: false,
      hasInitialSessionRoute: false,
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      isHomePendingPreviewActive: false,
      isHomeSendStarting: true,
      queuedTurnCount: 0,
      sessionId: null,
      embeddedHomeSessionIds: new Set(),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      shouldUseBrowserWorkspaceHomeChrome: true,
    });

    expect(state.hasCurrentSessionActivity).toBe(true);
    expect(state.hasHomeConversationActivity).toBe(true);
    expect(state.taskCenterHomeSurfaceState.shouldRenderEmbeddedHome).toBe(
      false,
    );
    expect(
      state.taskCenterHomeSurfaceState.shouldHideCurrentSessionContent,
    ).toBe(false);
    expect(state.suppressHomeNavbarUtilityActions).toBe(false);
  });

  it("new-task 后台恢复时应把旧 running session 留在后台，不作为首页前台会话活动", () => {
    const state = resolveTaskCenterHomeChromeState({
      agentEntry: "new-task",
      draftSurfaceActive: false,
      draftTabActive: false,
      shouldSuppressDraftContent: false,
      draftSendRequest: null,
      sessionSwitchPending: false,
      hasInitialSessionRoute: false,
      isHomeSessionBackgroundRecovery: true,
      displayMessageCount: 1,
      threadItemCount: 1,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: true,
      isHomePendingPreviewActive: false,
      queuedTurnCount: 0,
      sessionId: "running-session",
      embeddedHomeSessionIds: new Set(),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      shouldUseBrowserWorkspaceHomeChrome: true,
    });

    expect(state.hasCurrentSessionActivity).toBe(false);
    expect(state.hasHomeConversationActivity).toBe(false);
    expect(
      state.taskCenterHomeSurfaceState.shouldHideCurrentSessionContent,
    ).toBe(true);
    expect(state.taskCenterHomeSurfaceState.sceneSessionId).toBeNull();
  });

  it("new-task 后台执行态应隐藏旧会话内容但保留顶栏工具入口", () => {
    const state = resolveTaskCenterHomeChromeState({
      agentEntry: "new-task",
      draftSurfaceActive: false,
      draftTabActive: false,
      shouldSuppressDraftContent: false,
      draftSendRequest: null,
      sessionSwitchPending: false,
      hasInitialSessionRoute: false,
      isHomeSessionBackgroundRecovery: true,
      displayMessageCount: 1,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: true,
      isHomePendingPreviewActive: false,
      queuedTurnCount: 0,
      sessionId: "running-session",
      embeddedHomeSessionIds: new Set(),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      shouldUseBrowserWorkspaceHomeChrome: true,
    });

    expect(state.hasHomeConversationActivity).toBe(false);
    expect(
      state.taskCenterHomeSurfaceState.shouldHideCurrentSessionContent,
    ).toBe(true);
    expect(state.suppressHomeNavbarUtilityActions).toBe(false);
  });

  it("本地物化会话应优先作为前台会话，不被后台恢复卡片覆盖", () => {
    const state = resolveTaskCenterHomeChromeState({
      agentEntry: "claw",
      draftSurfaceActive: false,
      draftTabActive: false,
      shouldSuppressDraftContent: false,
      draftSendRequest: null,
      sessionSwitchPending: false,
      hasInitialSessionRoute: false,
      isHomeSessionBackgroundRecovery: true,
      displayMessageCount: 0,
      threadItemCount: 0,
      hasPendingA2UIForm: false,
      isPreparingSend: false,
      isSending: false,
      isHomePendingPreviewActive: false,
      queuedTurnCount: 0,
      hasLocalSessionOverride: true,
      sessionId: "materialized-session",
      embeddedHomeSessionIds: new Set(["materialized-session"]),
      isAutoRestoringSession: false,
      isSessionHydrating: false,
      shouldUseBrowserWorkspaceHomeChrome: true,
    });

    expect(state.hasCurrentSessionActivity).toBe(true);
    expect(state.hasHomeConversationActivity).toBe(true);
    expect(state.taskCenterHomeSurfaceState.shouldRenderEmbeddedHome).toBe(
      false,
    );
    expect(
      state.taskCenterHomeSurfaceState.shouldHideCurrentSessionContent,
    ).toBe(false);
    expect(state.taskCenterHomeSurfaceState.sceneSessionId).toBe(
      "materialized-session",
    );
  });

  it("侧边栏新建任务激活草稿 surface 时应压住 route 空会话页", () => {
    const state = resolveTaskCenterHomeChromeState({
      agentEntry: "claw",
      draftSurfaceActive: true,
      draftTabActive: false,
      shouldSuppressDraftContent: true,
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
      shouldUseBrowserWorkspaceHomeChrome: true,
    });

    expect(state.hasCurrentSessionActivity).toBe(false);
    expect(state.hasHomeConversationActivity).toBe(false);
    expect(state.taskCenterHomeSurfaceState.shouldRenderEmbeddedHome).toBe(
      true,
    );
    expect(
      state.taskCenterHomeSurfaceState.shouldHideCurrentSessionContent,
    ).toBe(true);
    expect(state.taskCenterHomeSurfaceState.sceneSessionId).toBeNull();
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
