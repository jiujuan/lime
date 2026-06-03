import { describe, expect, it } from "vitest";
import type { AsterSubagentSessionInfo } from "@/lib/api/agentRuntime";
import type { Topic } from "../hooks/agentChatShared";
import {
  buildChatSidebarTaskItems,
  buildCollapsedTeamSummary,
  buildTaskSections,
  filterChatSidebarTaskItems,
  resolveCurrentStatusPreview,
  resolveSidebarDisplayTitle,
  resolveSubagentSessionTypeLabel,
  resolveUnixDate,
  shouldMarkSubagentAsFocus,
  sortSubagentSessionsByPriority,
  type TaskCardViewModel,
} from "./ChatSidebarViewModel";

function topic(overrides: Partial<Topic> = {}): Topic {
  const createdAt = new Date("2026-03-15T08:00:00.000Z");
  return {
    id: "topic-1",
    title: "任务一",
    createdAt,
    updatedAt: createdAt,
    messagesCount: 2,
    executionStrategy: "react",
    status: "done",
    lastPreview: "  已生成   首版结果，可继续复盘。  ",
    isPinned: false,
    hasUnread: false,
    tag: null,
    sourceSessionId: "topic-1",
    ...overrides,
  };
}

function taskItem(overrides: Partial<TaskCardViewModel>): TaskCardViewModel {
  return {
    id: "task",
    title: "任务",
    updatedAt: new Date("2026-03-15T08:00:00.000Z"),
    messagesCount: 1,
    status: "done",
    statusLabel: "已完成",
    lastPreview: "完成摘要",
    isCurrent: false,
    isPinned: false,
    hasUnread: false,
    ...overrides,
  };
}

function subagent(
  overrides: Partial<AsterSubagentSessionInfo>,
): AsterSubagentSessionInfo {
  return {
    id: "child",
    name: "子任务",
    created_at: 1_742_288_400,
    updated_at: 1_742_288_500,
    session_type: "sub_agent",
    task_summary: "处理主线任务。",
    role_hint: "executor",
    runtime_status: "running",
    ...overrides,
  };
}

describe("ChatSidebarViewModel", () => {
  it("应构造任务卡片并覆盖当前任务运行态预览", () => {
    const items = buildChatSidebarTaskItems({
      topics: [
        topic({
          title: "Image #1",
          status: "done",
          isPinned: false,
        }),
        topic({
          id: "topic-2",
          title: "",
          status: "done",
          sourceSessionId: "topic-2",
        }),
      ],
      currentTopicId: "topic-1",
      currentMessages: [],
      currentTaskPreview: "来自当前消息的摘要",
      isSending: true,
      pendingActionCount: 0,
      queuedTurnCount: 0,
      threadStatus: "running",
      pinnedTaskIdSet: new Set(["topic-2"]),
      workspaceError: false,
    });

    expect(items[0]).toMatchObject({
      id: "topic-1",
      title: "图片任务 1",
      status: "running",
      statusLabel: "进行中",
      lastPreview: "正在生成回复或执行工具，请稍候。",
      isCurrent: true,
      isPinned: false,
    });
    expect(items[1]).toMatchObject({
      id: "topic-2",
      title: "未命名任务",
      lastPreview: "已生成 首版结果，可继续复盘。",
      isPinned: true,
    });
  });

  it("应处理当前任务状态预览和工作区异常标签", () => {
    expect(
      resolveCurrentStatusPreview(
        "failed",
        "workspace_error",
        "fallback",
        0,
        false,
      ),
    ).toContain("工作区异常");
    expect(
      resolveCurrentStatusPreview("waiting", "user_action", "fallback", 2, false),
    ).toBe("等待你确认或补充信息后继续执行。");
    expect(resolveSidebarDisplayTitle("Image #2", "fallback")).toBe(
      "图片任务 2",
    );
  });

  it("应隐藏旧历史里误入标题和预览的运行时错误包络", () => {
    const runtimeErrorEnvelope = [
      "Ran into this error: Server error: upstream temporarily unavailable.",
      "",
      "Please retry if you think this is a transient or recoverable error.",
    ].join("\n");

    expect(resolveSidebarDisplayTitle(runtimeErrorEnvelope, "未命名任务")).toBe(
      "未命名任务",
    );

    const items = buildChatSidebarTaskItems({
      topics: [
        topic({
          title: runtimeErrorEnvelope,
          lastPreview: runtimeErrorEnvelope,
          status: "failed",
        }),
        topic({
          id: "topic-truncated-error-title",
          title: "Ran into this erro...",
          lastPreview: "执行失败",
          status: "failed",
          sourceSessionId: "topic-truncated-error-title",
        }),
      ],
      currentTopicId: null,
      currentMessages: [],
      currentTaskPreview: "",
      isSending: false,
      pendingActionCount: 0,
      queuedTurnCount: 0,
      threadStatus: null,
      pinnedTaskIdSet: new Set(),
      workspaceError: false,
    });

    expect(items[0]).toMatchObject({
      title: "未命名任务",
      lastPreview: "等待你补充任务需求后开始执行。",
      status: "failed",
    });
    expect(items[1]).toMatchObject({
      title: "未命名任务",
      lastPreview: "执行失败",
      status: "failed",
    });
  });

  it("应按状态和关键词过滤任务", () => {
    const items = [
      taskItem({
        id: "running",
        title: "发布方案",
        status: "running",
        statusLabel: "进行中",
      }),
      taskItem({
        id: "done",
        title: "历史复盘",
        status: "done",
        statusLabel: "已完成",
      }),
      taskItem({
        id: "waiting",
        title: "素材确认",
        status: "waiting",
        statusLabel: "待处理",
        lastPreview: "需要确认封面图",
      }),
    ];

    expect(
      filterChatSidebarTaskItems({
        taskItems: items,
        searchKeyword: "",
        statusFilter: "active",
      }).map((item) => item.id),
    ).toEqual(["running", "waiting"]);
    expect(
      filterChatSidebarTaskItems({
        taskItems: items,
        searchKeyword: "封面",
        statusFilter: "all",
      }).map((item) => item.id),
    ).toEqual(["waiting"]);
  });

  it("应构造任务分组并按当前、固定、更新时间排序", () => {
    const sections = buildTaskSections(
      [
        taskItem({
          id: "recent",
          updatedAt: new Date("2026-03-15T11:00:00.000Z"),
        }),
        taskItem({
          id: "older",
          updatedAt: new Date("2026-03-10T11:00:00.000Z"),
        }),
        taskItem({
          id: "running-pinned",
          status: "running",
          isPinned: true,
          updatedAt: new Date("2026-03-15T09:00:00.000Z"),
        }),
        taskItem({
          id: "running-current",
          status: "running",
          isCurrent: true,
          updatedAt: new Date("2026-03-15T08:00:00.000Z"),
        }),
        taskItem({
          id: "failed",
          status: "failed",
          statusReason: "workspace_error",
        }),
      ],
      "task-center",
      new Date("2026-03-15T12:00:00.000Z").getTime(),
    );

    expect(sections.map((section) => [section.key, section.title])).toEqual([
      ["running", "进行中"],
      ["waiting", "待继续"],
      ["recent", "最近对话"],
      ["older", "归档"],
    ]);
    expect(sections.find((section) => section.key === "running")?.items.map((item) => item.id))
      .toEqual(["running-current", "running-pinned"]);
    expect(sections.find((section) => section.key === "waiting")?.items.map((item) => item.id))
      .toEqual(["failed"]);
    expect(sections.find((section) => section.key === "older")?.items.map((item) => item.id))
      .toEqual(["older"]);
  });

  it("应按运行优先级排序子任务并生成折叠摘要", () => {
    const sorted = sortSubagentSessionsByPriority([
      subagent({
        id: "completed",
        runtime_status: "completed",
        updated_at: 300,
      }),
      subagent({ id: "queued", runtime_status: "queued", updated_at: 200 }),
      subagent({ id: "running", runtime_status: "running", updated_at: 100 }),
      subagent({ id: "failed-new", runtime_status: "failed", updated_at: 500 }),
      subagent({ id: "failed-old", runtime_status: "failed", updated_at: 400 }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "running",
      "queued",
      "failed-new",
      "failed-old",
      "completed",
    ]);
    expect(buildCollapsedTeamSummary(sorted, "5 个子任务")).toBe(
      "已收起 · 5 个子任务 · 1 个处理中 · 1 个稍后开始 · 1 个已完成 · 2 个失败",
    );
    expect(shouldMarkSubagentAsFocus(sorted[0])).toBe(true);
    expect(shouldMarkSubagentAsFocus(subagent({ runtime_status: "completed" })))
      .toBe(false);
  });

  it("应解析子任务类型和 Unix 时间", () => {
    expect(resolveSubagentSessionTypeLabel("sub_agent")).toBe("子任务");
    expect(resolveSubagentSessionTypeLabel("fork")).toBe("分支会话");
    expect(resolveSubagentSessionTypeLabel("custom")).toBe("custom");
    expect(resolveUnixDate(1_742_288_400)?.toISOString()).toBe(
      "2025-03-18T09:00:00.000Z",
    );
    expect(resolveUnixDate(0)).toBeNull();
  });
});
