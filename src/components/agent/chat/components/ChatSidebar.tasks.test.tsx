import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Topic } from "../hooks/agentChatShared";
import type { Message } from "../types";
import {
  createPendingActionMessage,
  defaultTopics,
  renderSidebar,
} from "./ChatSidebar.testFixtures";

describe("ChatSidebar", () => {
  it("点击任务时应触发切换", () => {
    const onSwitchTopic = vi.fn();
    const container = renderSidebar({ onSwitchTopic });
    const taskItem = Array.from(
      container.querySelectorAll('[role="button"]'),
    ).find((element) => element.textContent?.includes("任务一"));
    expect(taskItem).toBeTruthy();
    if (taskItem) {
      act(() => {
        taskItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    expect(onSwitchTopic).toHaveBeenCalledWith("topic-1");
  });
  it("点击菜单删除任务时应触发删除", () => {
    const onDeleteTopic = vi.fn();
    const container = renderSidebar({ onDeleteTopic });
    const actionButton = container.querySelector(
      'button[aria-label="任务操作"]',
    ) as HTMLButtonElement | null;
    expect(actionButton).toBeTruthy();
    if (actionButton) {
      act(() => {
        actionButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    const deleteButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("删除任务"),
    );
    expect(deleteButton).toBeTruthy();
    if (deleteButton) {
      act(() => {
        deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    expect(onDeleteTopic).toHaveBeenCalledWith("topic-1");
  });
  it("当前任务应显示直接删除按钮并支持点击删除", () => {
    const onDeleteTopic = vi.fn();
    const container = renderSidebar({ onDeleteTopic });
    const deleteButton = container.querySelector(
      'button[aria-label="删除任务"]',
    ) as HTMLButtonElement | null;

    expect(deleteButton).toBeTruthy();

    act(() => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onDeleteTopic).toHaveBeenCalledWith("topic-1");
  });
  it("切换为仅看进行中时应过滤已完成任务", () => {
    const container = renderSidebar({
      isSending: true,
      currentTopicId: "topic-1",
    });

    const filterButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("仅看进行中"),
    );
    expect(filterButton).toBeTruthy();

    act(() => {
      filterButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("任务一");
    expect(container.textContent).toContain("进行中");
  });
  it("当前运行中的任务标题旁应显示加载状态", () => {
    const container = renderSidebar({
      currentTopicId: "topic-1",
      threadStatus: "running",
    });

    expect(container.textContent).toContain("任务一");
    expect(container.textContent).toContain("进行中");
    expect(
      container.querySelector(
        '[data-testid="chat-sidebar-task-title-loading-topic-1"]',
      ),
    ).not.toBeNull();
  });
  it("当前任务存在待处理请求时应覆盖失败态并显示待处理摘要", () => {
    const now = new Date("2026-03-15T09:45:00.000Z");
    const topics: Topic[] = [
      {
        ...defaultTopics[0],
        status: "failed",
        lastPreview: "执行失败：write_file",
      },
    ];
    const currentMessages: Message[] = [
      {
        id: "msg-user",
        role: "user",
        content: "帮我整理一篇公众号发布文案",
        timestamp: now,
      },
      {
        ...createPendingActionMessage(
          "请先确认发布标题后继续执行。",
          "这篇文章的最终标题是什么？",
        ),
        timestamp: new Date(now.getTime() + 1),
      },
    ];

    const container = renderSidebar({
      topics,
      currentMessages,
      currentTopicId: "topic-1",
      isSending: false,
      pendingActionCount: 0,
    });

    expect(container.textContent).toContain("待处理");
    expect(container.textContent).toContain("确认发布标题");
    expect(container.textContent).not.toContain("执行失败");
  });
  it("等待用户补充信息时应显示待处理提示", () => {
    const currentMessages: Message[] = [
      {
        id: "msg-user",
        role: "user",
        content: "帮我写一篇活动预热文案",
        timestamp: new Date("2026-03-15T09:45:00.000Z"),
      },
      createPendingActionMessage(
        "请先补充活动标题后继续。",
        "这次活动的正式标题是什么？",
      ),
    ];

    const container = renderSidebar({
      topics: [
        {
          ...defaultTopics[0],
          status: "waiting",
        },
      ],
      currentMessages,
      currentTopicId: "topic-1",
      isSending: false,
      pendingActionCount: 0,
    });

    expect(container.textContent).toContain("待处理");
    expect(container.textContent).toContain("补充活动标题");
  });
  it("待处理任务应统一归入待处理分组", () => {
    const topics: Topic[] = [
      {
        ...defaultTopics[0],
        status: "waiting",
        statusReason: "user_action",
        lastPreview: "请先补充文章标题。",
      },
      {
        ...defaultTopics[0],
        id: "topic-2",
        title: "任务二",
        sourceSessionId: "topic-2",
        status: "waiting",
        statusReason: "user_action",
        lastPreview: "等待你补充发布标题。",
      },
    ];

    const container = renderSidebar({
      topics,
      currentTopicId: null,
      currentMessages: [],
    });

    expect(container.textContent).toContain("待处理2");
    expect(container.textContent).toContain("任务一");
    expect(container.textContent).toContain("任务二");
  });
  it("当前待处理任务应提供继续任务入口", () => {
    const onResumeTask = vi.fn();
    const currentMessages: Message[] = [
      {
        id: "msg-user",
        role: "user",
        content: "帮我把文章整理成周报",
        timestamp: new Date("2026-03-15T09:45:00.000Z"),
      },
      createPendingActionMessage(
        "请先补充周报标题后继续。",
        "本周周报的标题是什么？",
      ),
    ];
    const container = renderSidebar({
      onResumeTask,
      topics: [
        {
          ...defaultTopics[0],
          status: "waiting",
          statusReason: "user_action",
          lastPreview: "请先补充周报标题后继续。",
        },
      ],
      currentTopicId: "topic-1",
      currentMessages,
    });

    expect(container.textContent).toContain("继续任务");

    const resumeButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("继续任务"),
    );
    expect(resumeButton).toBeTruthy();

    act(() => {
      resumeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onResumeTask).toHaveBeenCalledWith("topic-1", "user_action");
  });
  it("非当前待处理任务也应提供继续任务动作", () => {
    const onResumeTask = vi.fn();
    const container = renderSidebar({
      onResumeTask,
      topics: [
        {
          ...defaultTopics[0],
          status: "waiting",
          statusReason: "user_action",
          lastPreview: "请先补充周报标题后继续。",
        },
      ],
      currentTopicId: null,
    });

    expect(container.textContent).toContain("继续任务");

    const resumeButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("继续任务"),
    );
    expect(resumeButton).toBeTruthy();

    act(() => {
      resumeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onResumeTask).toHaveBeenCalledWith("topic-1", "user_action");
  });
});
