import { describe, expect, it } from "vitest";
import type {
  AgentThreadItem,
  AgentThreadTurn,
  Message,
} from "../types";
import type { AsterSessionDetail } from "@/lib/api/agentRuntime";

import {
  ACTIVE_SESSION_TRANSIENT_ITEMS_LIMIT,
  ACTIVE_SESSION_TRANSIENT_MESSAGES_LIMIT,
  ACTIVE_SESSION_TRANSIENT_TURNS_LIMIT,
  applyTopicExecutionStrategyToTopics,
  applyTopicSnapshotToTopics,
  mapSessionDetailToTopic,
  prependVerifiedSessionTopicFromDetail,
  resolveRestoreCandidateSanitizationPlan,
  resolveRuntimePreviewFromSessionDetail,
  resolveRuntimeThreadStatusFromSessionDetail,
  selectActiveSessionTransientItems,
  selectActiveSessionTransientMessages,
  selectActiveSessionTransientTurns,
  shouldAutoResumeHydratedRuntimeThread,
  upsertFreshSessionDraftTopic,
  upsertTopicFromSessionDetail,
} from "./agentSessionTopicViewModel";
import type { Topic } from "./agentChatShared";

function createDetail(
  overrides: Partial<AsterSessionDetail> = {},
): AsterSessionDetail {
  return {
    id: "session-1",
    name: "会话 1",
    created_at: 1,
    updated_at: 2,
    messages_count: 0,
    messages: [],
    ...overrides,
  };
}

function createTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: "topic-1",
    title: "Topic 1",
    createdAt: new Date(1_000),
    updatedAt: new Date(2_000),
    workspaceId: "workspace-1",
    messagesCount: 1,
    executionStrategy: "react",
    status: "done",
    statusReason: "default",
    lastPreview: "preview",
    isPinned: false,
    hasUnread: false,
    tag: null,
    sourceSessionId: "topic-1",
    ...overrides,
  };
}

function createMessage(index: number): Message {
  return {
    id: `message-${index}`,
    role: index % 2 === 0 ? "assistant" : "user",
    content: `message ${index}`,
    timestamp: new Date(index),
  };
}

function createTurn(index: number): AgentThreadTurn {
  return {
    id: `turn-${index}`,
    thread_id: "thread-1",
    prompt_text: `prompt ${index}`,
    status: "completed",
    started_at: new Date(index).toISOString(),
    completed_at: new Date(index + 1).toISOString(),
    created_at: new Date(index).toISOString(),
    updated_at: new Date(index + 1).toISOString(),
  };
}

function createItem(index: number, turnId?: string): AgentThreadItem {
  return {
    id: `item-${index}`,
    thread_id: "thread-1",
    turn_id: turnId ?? "",
    sequence: index,
    type: "turn_summary",
    text: `item ${index}`,
    status: "completed",
    started_at: new Date(index).toISOString(),
    completed_at: new Date(index + 1).toISOString(),
    updated_at: new Date(index + 1).toISOString(),
  };
}

describe("agentSessionTopicViewModel", () => {
  it("应清洗 restore candidate 并拒绝跨工作区或辅助会话", () => {
    expect(
      resolveRestoreCandidateSanitizationPlan({
        candidateSessionId: "  ",
        mappedWorkspaceId: null,
        workspaceId: "workspace-1",
      }),
    ).toEqual({ kind: "empty" });

    expect(
      resolveRestoreCandidateSanitizationPlan({
        candidateSessionId: "title-gen-child-1",
        mappedWorkspaceId: "workspace-1",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      kind: "skip_auxiliary",
      candidateSessionId: "title-gen-child-1",
      workspaceId: "workspace-1",
    });

    expect(
      resolveRestoreCandidateSanitizationPlan({
        candidateSessionId: "session-1",
        mappedWorkspaceId: "workspace-default",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      kind: "reject_workspace",
      candidateSessionId: "session-1",
      mappedWorkspaceId: "workspace-default",
      workspaceId: "workspace-1",
    });

    expect(
      resolveRestoreCandidateSanitizationPlan({
        candidateSessionId: "session-1",
        mappedWorkspaceId: "workspace-2",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      kind: "reject_workspace",
      candidateSessionId: "session-1",
      mappedWorkspaceId: "workspace-2",
      workspaceId: "workspace-1",
    });
  });

  it("restore candidate 无映射或同工作区映射时应保留", () => {
    expect(
      resolveRestoreCandidateSanitizationPlan({
        candidateSessionId: " session-1 ",
        mappedWorkspaceId: null,
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      kind: "accept",
      sessionId: "session-1",
    });

    expect(
      resolveRestoreCandidateSanitizationPlan({
        candidateSessionId: "session-1",
        mappedWorkspaceId: "workspace-1",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      kind: "accept",
      sessionId: "session-1",
    });

    expect(
      resolveRestoreCandidateSanitizationPlan({
        candidateSessionId: "session-1",
        mappedWorkspaceId: "__invalid__",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      kind: "accept",
      sessionId: "session-1",
    });
  });

  it("应识别需要自动恢复的 runtime thread 状态", () => {
    expect(
      shouldAutoResumeHydratedRuntimeThread({
        thread_id: "thread-1",
        status: "running",
        pending_requests: [],
        incidents: [],
        queued_turns: [],
      }),
    ).toBe(true);
    expect(
      shouldAutoResumeHydratedRuntimeThread({
        thread_id: "thread-1",
        status: "idle",
        pending_requests: [],
        incidents: [],
        queued_turns: [{ queued_turn_id: "queued-1" } as never],
      }),
    ).toBe(true);
    expect(
      shouldAutoResumeHydratedRuntimeThread({
        thread_id: "thread-1",
        status: "idle",
        pending_requests: [],
        incidents: [],
        queued_turns: [],
      }),
    ).toBe(false);
  });

  it("应从 session detail 推导 topic runtime 状态与预览", () => {
    expect(
      resolveRuntimeThreadStatusFromSessionDetail(
        createDetail({
          thread_read: {
            thread_id: "thread-1",
            status: "waiting_request",
            pending_requests: [],
            incidents: [],
            queued_turns: [],
          },
        }),
      ),
    ).toBe("waiting");

    expect(
      resolveRuntimeThreadStatusFromSessionDetail(
        createDetail({
          queued_turns: [{ message_preview: "继续执行" } as never],
        }),
      ),
    ).toBe("running");

    expect(
      resolveRuntimePreviewFromSessionDetail(
        createDetail({
          thread_read: {
            thread_id: "thread-1",
            status: "queued",
            pending_requests: [],
            incidents: [],
            queued_turns: [{ message_preview: " 后台排队中 " } as never],
          },
        }),
      ),
    ).toBe("后台排队中");
  });

  it("应把 runtime detail 映射为 topic 并覆盖运行态展示", () => {
    const topic = mapSessionDetailToTopic(
      "session-running",
      createDetail({
        name: "运行中任务",
        messages_count: 2,
        workspace_id: "workspace-detail",
        thread_read: {
          thread_id: "thread-1",
          status: "running",
          pending_requests: [],
          incidents: [],
          queued_turns: [],
        },
      }),
      "workspace-fallback",
    );

    expect(topic).toMatchObject({
      id: "session-running",
      title: "运行中任务",
      workspaceId: "workspace-detail",
      messagesCount: 2,
      status: "running",
      statusReason: "default",
    });
  });

  it("upsert topic 时应保留本地 pin/unread/tag 并按时间排序", () => {
    const existing = createTopic({
      id: "topic-1",
      updatedAt: new Date(2_000),
      isPinned: true,
      hasUnread: true,
      tag: "重点",
    });
    const newer = createTopic({
      id: "topic-2",
      updatedAt: new Date(4_000),
    });
    const detailTopic = createTopic({
      id: "topic-1",
      title: "远端新标题",
      updatedAt: new Date(5_000),
      isPinned: false,
      hasUnread: false,
      tag: null,
    });

    expect(upsertTopicFromSessionDetail([existing, newer], detailTopic)).toEqual([
      {
        ...detailTopic,
        isPinned: true,
        hasUnread: true,
        tag: "重点",
      },
      newer,
    ]);
  });

  it("应把新建 session 草稿插入到 topic 顶部并去重", () => {
    const existing = createTopic({
      id: "session-new",
      title: "旧草稿",
      updatedAt: new Date(1_000),
    });
    const other = createTopic({ id: "topic-2", title: "保留任务" });
    const now = new Date(8_000);

    expect(
      upsertFreshSessionDraftTopic([existing, other], {
        createdAt: now,
        executionStrategy: "react",
        sessionId: "session-new",
        sessionName: "  新任务标题  ",
        workspaceId: "workspace-2",
      }),
    ).toEqual([
      {
        id: "session-new",
        title: "新任务标题",
        createdAt: now,
        updatedAt: now,
        workspaceId: "workspace-2",
        messagesCount: 0,
        executionStrategy: "react",
        status: "draft",
        lastPreview: "等待你补充任务需求后开始执行。",
        isPinned: false,
        hasUnread: false,
        tag: null,
        sourceSessionId: "session-new",
      },
      other,
    ]);
  });

  it("远端校验通过后应只在 topic 缺失时补入 session", () => {
    const detail = createDetail({
      name: "远端会话",
      created_at: 5,
      updated_at: 6,
      messages_count: 20,
      messages: [{ id: "message-1" } as never, { id: "message-2" } as never],
      execution_strategy: "code_orchestrated" as never,
      workspace_id: "workspace-remote",
      working_dir: "/tmp/workspace",
    });
    const existing = createTopic({ id: "topic-1" });
    const nextTopics = prependVerifiedSessionTopicFromDetail(
      [existing],
      "session-remote",
      detail,
    );

    expect(nextTopics[0]).toMatchObject({
      id: "session-remote",
      title: "远端会话",
      messagesCount: 2,
      executionStrategy: "react",
      workspaceId: "workspace-remote",
    });
    expect(nextTopics[1]).toBe(existing);
    expect(
      prependVerifiedSessionTopicFromDetail(
        nextTopics,
        "session-remote",
        detail,
      ),
    ).toBe(nextTopics);
  });

  it("应只更新目标 topic 的 execution strategy", () => {
    const target = createTopic({
      id: "topic-1",
      executionStrategy: "react",
    });
    const other = createTopic({
      id: "topic-2",
      executionStrategy: "react",
    });

    expect(
      applyTopicExecutionStrategyToTopics(
        [target, other],
        "topic-1",
        "react",
      ),
    ).toEqual([
      {
        ...target,
        executionStrategy: "react",
      },
      other,
    ]);
  });

  it("应只把 live snapshot 写回目标 topic", () => {
    const original = createTopic({ id: "topic-1", messagesCount: 1 });
    const other = createTopic({ id: "topic-2", messagesCount: 2 });
    const updatedAt = new Date(6_000);

    expect(
      applyTopicSnapshotToTopics([original, other], "topic-1", {
        updatedAt,
        messagesCount: 3,
        status: "running",
        statusReason: "default",
        lastPreview: "正在执行",
        hasUnread: true,
      }),
    ).toEqual([
      {
        ...original,
        updatedAt,
        messagesCount: 3,
        status: "running",
        statusReason: "default",
        lastPreview: "正在执行",
        hasUnread: true,
      },
      other,
    ]);
  });

  it("live snapshot 未改变或目标不存在时应复用原 topic 数组", () => {
    const original = createTopic({ id: "topic-1", messagesCount: 1 });
    const topics = [original];

    expect(
      applyTopicSnapshotToTopics(topics, "topic-1", {
        updatedAt: original.updatedAt,
        messagesCount: original.messagesCount,
        status: original.status,
        statusReason: original.statusReason,
        lastPreview: original.lastPreview,
        hasUnread: original.hasUnread,
      }),
    ).toBe(topics);

    expect(
      applyTopicSnapshotToTopics(topics, "missing-topic", {
        messagesCount: 2,
      }),
    ).toBe(topics);
  });

  it("应裁剪 transient messages 和 turns 到尾部窗口", () => {
    const messages = Array.from(
      { length: ACTIVE_SESSION_TRANSIENT_MESSAGES_LIMIT + 2 },
      (_, index) => createMessage(index),
    );
    const turns = Array.from(
      { length: ACTIVE_SESSION_TRANSIENT_TURNS_LIMIT + 2 },
      (_, index) => createTurn(index),
    );

    expect(selectActiveSessionTransientMessages(messages)[0]?.id).toBe(
      "message-2",
    );
    expect(selectActiveSessionTransientTurns(turns)[0]?.id).toBe("turn-2");
  });

  it("应按保留 turn 裁剪 transient items，并保留无 turn_id 的邻近项", () => {
    const turns = Array.from(
      { length: ACTIVE_SESSION_TRANSIENT_TURNS_LIMIT + 1 },
      (_, index) => createTurn(index),
    );
    const items = [
      createItem(1, "turn-0"),
      createItem(2, "turn-1"),
      createItem(3, "turn-2"),
      createItem(4),
    ];

    expect(selectActiveSessionTransientItems(items, turns)).toEqual([
      createItem(2, "turn-1"),
      createItem(3, "turn-2"),
      createItem(4),
    ]);
  });

  it("没有 retained turn 时应只按 item 尾部窗口裁剪", () => {
    const items = Array.from(
      { length: ACTIVE_SESSION_TRANSIENT_ITEMS_LIMIT + 2 },
      (_, index) => createItem(index),
    );

    expect(selectActiveSessionTransientItems(items, [])[0]?.id).toBe("item-2");
  });
});
