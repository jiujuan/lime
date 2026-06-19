import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultTopics, renderSidebar } from "./ChatSidebar.testFixtures";

describe("ChatSidebar", () => {
  it("应显示新建任务入口和任务列表", () => {
    const container = renderSidebar();
    expect(container.textContent).toContain("新建任务");
    expect(container.textContent).toContain("任务一");
  });
  it("历史记录初次同步时应展示加载提示而不是空态", () => {
    const container = renderSidebar({
      topics: [],
      topicsReady: false,
      currentTopicId: null,
    });

    expect(
      container.querySelector('[data-testid="chat-sidebar-history-loading"]'),
    ).not.toBeNull();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(container.textContent).toContain("正在整理历史记录");
    expect(container.textContent).toContain("最近对话会自动出现");
    expect(container.textContent).not.toContain("还没有任务");
  });
  it("任务中心侧栏空态应展示最近对话文案和新建入口", () => {
    const container = renderSidebar({
      contextVariant: "task-center",
      topics: [],
      currentTopicId: null,
    });
    const searchInput = container.querySelector(
      'input[placeholder="搜索对话标题或摘要"]',
    ) as HTMLInputElement | null;

    expect(container.textContent).toContain("最近对话");
    expect(container.textContent).toContain(
      "继续最近对话，待处理会话会优先显示在前面。",
    );
    expect(container.textContent).toContain("任务");
    expect(container.textContent).toContain("新建任务");
    expect(container.textContent).toContain("能力");
    expect(container.textContent).toContain("Skills");
    expect(container.textContent).toContain("资料");
    expect(container.textContent).toContain("项目资料");
    expect(container.textContent).not.toContain("灵感库");
    expect(searchInput).toBeTruthy();
    expect(
      container.querySelector('button[aria-label="新建对话"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("全部对话");
    expect(container.textContent).toContain("待继续");
    expect(container.textContent).toContain("还没有最近对话");
    expect(container.textContent).toContain(
      "从“新建对话”开始后，最近对话会自动出现在这里。",
    );
  });
  it("任务中心导航块应支持入口跳转", () => {
    const onOpenTaskCenterHome = vi.fn();
    const onOpenSkillsPage = vi.fn();
    const onOpenKnowledgePage = vi.fn();
    const container = renderSidebar({
      contextVariant: "task-center",
      onOpenTaskCenterHome,
      onOpenSkillsPage,
      onOpenKnowledgePage,
    });

    act(() => {
      (
        Array.from(container.querySelectorAll("button")).find((button) =>
          button.textContent?.includes("新建任务"),
        ) as HTMLButtonElement | undefined
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      (
        Array.from(container.querySelectorAll("button")).find((button) =>
          button.textContent?.includes("Skills"),
        ) as HTMLButtonElement | undefined
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      (
        Array.from(container.querySelectorAll("button")).find((button) =>
          button.textContent?.includes("项目资料"),
        ) as HTMLButtonElement | undefined
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenTaskCenterHome).toHaveBeenCalledTimes(1);
    expect(onOpenSkillsPage).toHaveBeenCalledTimes(1);
    expect(onOpenKnowledgePage).toHaveBeenCalledTimes(1);
  });
  it("任务中心顶部新建对话应打开任务中心空白草稿而不是复用当前会话", () => {
    const onNewChat = vi.fn();
    const onOpenTaskCenterHome = vi.fn();
    const container = renderSidebar({
      contextVariant: "task-center",
      onNewChat,
      onOpenTaskCenterHome,
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="新建对话"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenTaskCenterHome).toHaveBeenCalledTimes(1);
    expect(onNewChat).not.toHaveBeenCalled();
  });
  it("任务中心侧栏不应再在顶部重复展示继续最近会话卡", () => {
    const now = Date.now();
    const container = renderSidebar({
      contextVariant: "task-center",
      currentTopicId: null,
      topics: [
        {
          ...defaultTopics[0],
          id: "topic-waiting",
          title: "待继续任务",
          updatedAt: new Date(now),
          status: "waiting",
          statusReason: "user_action",
          lastPreview: "请先确认发布标题后继续。",
          workspaceId: "project-waiting",
          sourceSessionId: "topic-waiting",
        },
        {
          ...defaultTopics[0],
          id: "topic-recent",
          title: "最近对话任务",
          updatedAt: new Date(now - 2_000),
          status: "done",
          lastPreview: "首版结果已经产出，可继续补充和复盘。",
          sourceSessionId: "topic-recent",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="task-center-continuation-panel"]'),
    ).toBeNull();
    expect(container.textContent).toContain("待继续任务");
    expect(container.textContent).toContain("最近对话任务");
  });
  it("任务中心侧栏应使用对话与归档分组标题", () => {
    const now = Date.now();
    const container = renderSidebar({
      contextVariant: "task-center",
      currentTopicId: null,
      topics: [
        {
          ...defaultTopics[0],
          id: "topic-running",
          title: "进行中任务",
          updatedAt: new Date(now),
          status: "running",
          sourceSessionId: "topic-running",
        },
        {
          ...defaultTopics[0],
          id: "topic-waiting",
          title: "待继续任务",
          updatedAt: new Date(now - 1_000),
          status: "waiting",
          statusReason: "user_action",
          sourceSessionId: "topic-waiting",
        },
        {
          ...defaultTopics[0],
          id: "topic-recent",
          title: "最近对话任务",
          updatedAt: new Date(now - 2_000),
          status: "done",
          sourceSessionId: "topic-recent",
        },
        {
          ...defaultTopics[0],
          id: "topic-older",
          title: "更早任务",
          updatedAt: new Date(now - 1000 * 60 * 60 * 24 * 5),
          status: "done",
          sourceSessionId: "topic-older",
        },
      ],
    });

    expect(container.textContent).toContain("进行中");
    expect(container.textContent).toContain("待继续");
    expect(container.textContent).toContain("最近对话");
    expect(container.textContent).toContain("归档");
    expect(
      container.querySelector(
        '[data-testid="chat-sidebar-task-title-loading-topic-running"]',
      ),
    ).not.toBeNull();
  });
  it("点击归档分组中的对话时，不应把它当成普通任务切换入口", () => {
    const now = Date.now();
    const onSwitchTopic = vi.fn();
    const onOpenArchivedTopic = vi.fn();
    const container = renderSidebar({
      contextVariant: "task-center",
      currentTopicId: null,
      onSwitchTopic,
      onOpenArchivedTopic,
      topics: [
        {
          ...defaultTopics[0],
          id: "topic-recent",
          title: "最近对话",
          updatedAt: new Date(now - 2_000),
          status: "done",
          sourceSessionId: "topic-recent",
        },
        {
          ...defaultTopics[0],
          id: "topic-older",
          title: "归档对话",
          updatedAt: new Date(now - 1000 * 60 * 60 * 24 * 5),
          status: "done",
          sourceSessionId: "topic-older",
        },
      ],
    });

    act(() => {
      (
        Array.from(container.querySelectorAll('[role="button"]')).find((node) =>
          node.textContent?.includes("归档对话"),
        ) as HTMLElement | undefined
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenArchivedTopic).toHaveBeenCalledWith("topic-older");
    expect(onSwitchTopic).not.toHaveBeenCalledWith("topic-older");
  });
  it("任务中心侧栏不应再显示 continuation fallback 文案", async () => {
    const container = renderSidebar({
      contextVariant: "task-center",
      currentTopicId: null,
      topics: [
        {
          ...defaultTopics[0],
          id: "topic-draft",
          title: "待整理现场",
          updatedAt: new Date(),
          status: "draft",
          lastPreview: "先补齐创作需求，再继续生成。",
          sourceSessionId: "topic-draft",
        },
      ],
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain("打开最近会话");
  });
});
