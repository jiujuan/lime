import { describe, expect, it } from "vitest";

import {
  resolveAgentChatWorkspaceShellViewModel,
  type AgentChatWorkspaceShellViewModelInput,
} from "./agentChatWorkspaceShellViewModel";

function resolve(
  overrides: Partial<AgentChatWorkspaceShellViewModelInput> = {},
) {
  return resolveAgentChatWorkspaceShellViewModel({
    agentEntry: "new-task",
    showChatPanel: false,
    contentId: null,
    displayMessageCount: 0,
    isHomePendingPreviewActive: false,
    shouldSuppressTaskCenterDraftContent: false,
    hasCanvasWorkbenchContent: false,
    isThemeWorkbench: false,
    shouldUseCompactGeneralWorkbench: false,
    isBootstrapDispatchPending: false,
    isSessionHydrating: false,
    isSending: false,
    queuedTurnCount: 0,
    ...overrides,
  });
}

describe("agentChatWorkspaceShellViewModel", () => {
  it("空白 new-task 首页应保持聊天面板关闭并禁止恢复工作区图片任务", () => {
    expect(resolve()).toEqual({
      hasDisplayMessages: false,
      hasMessages: false,
      effectiveShowChatPanel: false,
      allowTopicSidebarToggle: false,
      shouldRestoreImageTasksFromWorkspace: false,
    });
  });

  it("显式 showChatPanel=true 时应允许侧栏切换", () => {
    expect(
      resolve({
        showChatPanel: true,
      }),
    ).toMatchObject({
      effectiveShowChatPanel: true,
      allowTopicSidebarToggle: true,
    });
  });

  it("new-task 有展示消息、预览或发送活动时应进入聊天面板", () => {
    for (const overrides of [
      { displayMessageCount: 1 },
      { isHomePendingPreviewActive: true },
      { isSending: true },
      { queuedTurnCount: 1 },
      { isSessionHydrating: true },
    ] satisfies Array<Partial<AgentChatWorkspaceShellViewModelInput>>) {
      expect(resolve(overrides)).toMatchObject({
        hasDisplayMessages:
          Boolean(overrides.displayMessageCount) ||
          Boolean(overrides.isHomePendingPreviewActive),
        effectiveShowChatPanel: true,
        allowTopicSidebarToggle: true,
      });
    }
  });

  it("被任务中心草稿空态压制的消息不应计入展示消息", () => {
    expect(
      resolve({
        displayMessageCount: 2,
        shouldSuppressTaskCenterDraftContent: true,
      }),
    ).toMatchObject({
      hasDisplayMessages: false,
      hasMessages: false,
      effectiveShowChatPanel: false,
    });
  });

  it("画布或主题工作台内容应打开聊天面板但不解除空白首页恢复阻断", () => {
    expect(
      resolve({
        hasCanvasWorkbenchContent: true,
      }),
    ).toMatchObject({
      effectiveShowChatPanel: true,
      shouldRestoreImageTasksFromWorkspace: false,
    });

    expect(
      resolve({
        isThemeWorkbench: true,
      }),
    ).toMatchObject({
      effectiveShowChatPanel: true,
      shouldRestoreImageTasksFromWorkspace: false,
    });
  });

  it("紧凑工作台不应因 bootstrap pending 打开聊天面板，但仍应恢复图片任务", () => {
    expect(
      resolve({
        isBootstrapDispatchPending: true,
        shouldUseCompactGeneralWorkbench: true,
      }),
    ).toMatchObject({
      effectiveShowChatPanel: false,
      shouldRestoreImageTasksFromWorkspace: true,
    });
  });

  it("非 new-task 入口不应用空白首页规则阻断图片任务恢复", () => {
    expect(
      resolve({
        agentEntry: "claw",
      }),
    ).toMatchObject({
      effectiveShowChatPanel: false,
      allowTopicSidebarToggle: false,
      shouldRestoreImageTasksFromWorkspace: true,
    });
  });

  it("已有 contentId 的 new-task 首页仍可恢复工作区图片任务", () => {
    expect(
      resolve({
        contentId: "content-1",
      }),
    ).toMatchObject({
      shouldRestoreImageTasksFromWorkspace: true,
    });
  });
});
