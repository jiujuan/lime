import { describe, expect, it } from "vitest";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";
import {
  buildTaskCenterDraftTab,
  clearActiveTaskCenterDraftTab,
  markTaskCenterDraftTabFailed,
  markTaskCenterDraftTabRunning,
  removeTaskCenterDraftTab,
  resolveActiveTaskCenterDraftTabId,
  resolveTaskCenterDraftClosePlan,
  shouldWarmupTaskCenterDraftSession,
  upsertTaskCenterDraftTab,
} from "./taskCenterDraftTabs";

function createDraft(id: string, overrides?: Partial<TaskCenterDraftTab>) {
  const createdAt = new Date("2026-04-20T00:00:00.000Z");
  return {
    id,
    title: "新对话",
    createdAt,
    updatedAt: createdAt,
    status: "draft",
    ...overrides,
  } satisfies TaskCenterDraftTab;
}

describe("taskCenterDraftTabs", () => {
  it("应构建并前置 upsert 草稿标签，同时控制最大数量", () => {
    const now = new Date("2026-04-20T01:00:00.000Z");
    const draft = buildTaskCenterDraftTab({
      id: "task-draft-new",
      now,
    });

    expect(draft).toEqual({
      id: "task-draft-new",
      title: "新对话",
      createdAt: now,
      updatedAt: now,
      status: "draft",
    });

    expect(
      upsertTaskCenterDraftTab(
        [createDraft("task-draft-a"), createDraft("task-draft-new")],
        draft,
        2,
      ).map((item) => item.id),
    ).toEqual(["task-draft-new", "task-draft-a"]);
  });

  it("应把提交中的草稿标记为 running，并在创建失败时标记 failed", () => {
    const draft = createDraft("task-draft-a");
    const runningAt = new Date("2026-04-20T02:00:00.000Z");
    const failedAt = new Date("2026-04-20T03:00:00.000Z");

    const running = markTaskCenterDraftTabRunning({
      current: [draft],
      draftTabId: "task-draft-a",
      title: "生成封面图",
      updatedAt: runningAt,
    });
    expect(running[0]).toMatchObject({
      id: "task-draft-a",
      title: "生成封面图",
      status: "running",
      updatedAt: runningAt,
    });

    const failed = markTaskCenterDraftTabFailed(
      running,
      "task-draft-a",
      failedAt,
    );
    expect(failed[0]).toMatchObject({
      id: "task-draft-a",
      status: "failed",
      updatedAt: failedAt,
    });
    expect(markTaskCenterDraftTabFailed(failed, "missing")).toBe(failed);
  });

  it("应解析当前有效草稿与预热创建条件", () => {
    const draftTabs = [createDraft("task-draft-a")];

    expect(
      resolveActiveTaskCenterDraftTabId({
        draftTabs,
        activeDraftTabId: "task-draft-a",
      }),
    ).toBe("task-draft-a");
    expect(
      resolveActiveTaskCenterDraftTabId({
        draftTabs,
        activeDraftTabId: "missing",
      }),
    ).toBeNull();

    expect(
      shouldWarmupTaskCenterDraftSession({
        agentEntry: "claw",
        activeDraftTabId: "task-draft-a",
        draftTabs,
        input: "  你好  ",
        isPreparingSend: false,
        isSending: false,
      }),
    ).toBe(true);
    expect(
      shouldWarmupTaskCenterDraftSession({
        agentEntry: "claw",
        activeDraftTabId: "task-draft-a",
        draftTabs,
        input: "你好",
        isPreparingSend: true,
        isSending: false,
      }),
    ).toBe(false);
    expect(
      shouldWarmupTaskCenterDraftSession({
        agentEntry: "new-task",
        activeDraftTabId: "task-draft-a",
        draftTabs,
        input: "你好",
        isPreparingSend: false,
        isSending: false,
      }),
    ).toBe(false);
    expect(
      shouldWarmupTaskCenterDraftSession({
        agentEntry: "claw",
        activeDraftTabId: "task-draft-a",
        draftTabs,
        input: "   ",
        isPreparingSend: false,
        isSending: false,
      }),
    ).toBe(false);
    expect(
      shouldWarmupTaskCenterDraftSession({
        agentEntry: "claw",
        activeDraftTabId: "task-draft-a",
        draftTabs,
        input: "你好",
        isPreparingSend: false,
        isSending: true,
      }),
    ).toBe(false);
  });

  it("关闭草稿时应优先切换剩余草稿，其次回退到打开的任务", () => {
    const draftA = createDraft("task-draft-a");
    const draftB = createDraft("task-draft-b");

    expect(
      resolveTaskCenterDraftClosePlan({
        closingDraftTabId: "task-draft-a",
        currentDraftTabs: [draftA, draftB],
        activeDraftTabId: "task-draft-a",
        openTopicIds: ["topic-a"],
      }),
    ).toEqual({
      action: "selectDraft",
      fallbackDraftTabId: "task-draft-b",
      remainingDraftTabs: [draftB],
    });

    expect(
      resolveTaskCenterDraftClosePlan({
        closingDraftTabId: "task-draft-a",
        currentDraftTabs: [draftA],
        activeDraftTabId: "task-draft-a",
        openTopicIds: ["topic-a"],
      }),
    ).toEqual({
      action: "switchTopic",
      fallbackTopicId: "topic-a",
      remainingDraftTabs: [],
    });

    expect(
      resolveTaskCenterDraftClosePlan({
        closingDraftTabId: "task-draft-a",
        currentDraftTabs: [draftA],
        activeDraftTabId: "task-draft-a",
        openTopicIds: [],
      }),
    ).toEqual({
      action: "clearActiveDraft",
      remainingDraftTabs: [],
    });
  });

  it("删除非活跃草稿时不应改变当前活跃草稿", () => {
    const draftA = createDraft("task-draft-a");
    const draftB = createDraft("task-draft-b");

    expect(removeTaskCenterDraftTab([draftA, draftB], "task-draft-b")).toEqual([
      draftA,
    ]);
    expect(
      clearActiveTaskCenterDraftTab("task-draft-a", "task-draft-b"),
    ).toBe("task-draft-a");
    expect(
      resolveTaskCenterDraftClosePlan({
        closingDraftTabId: "task-draft-b",
        currentDraftTabs: [draftA, draftB],
        activeDraftTabId: "task-draft-a",
        openTopicIds: ["topic-a"],
      }),
    ).toEqual({
      action: "remove",
      remainingDraftTabs: [draftA],
    });
  });
});
