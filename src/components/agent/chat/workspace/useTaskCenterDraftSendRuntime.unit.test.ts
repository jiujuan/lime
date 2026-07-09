import { createElement, useEffect, useRef, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { recordAgentUiPerformanceMetric } from "@/lib/agentUiPerformanceMetrics";
import { extractInputbarManagedObjectiveText } from "../components/Inputbar/utils/inputbarModeRequestMetadata";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";
import {
  useTaskCenterDraftSendDispatchRuntime,
  useTaskCenterEmptyStateSendRuntime,
} from "./useTaskCenterDraftSendRuntime";

vi.mock("@/lib/agentUiPerformanceMetrics", () => ({
  recordAgentUiPerformanceMetric: vi.fn(),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];
type DraftSendRuntimeHandle = {
  commitMaterializedDraftTab: ReturnType<typeof vi.fn>;
  materializeDraftTab: ReturnType<typeof vi.fn>;
  restoreInput: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
};

function createDraftSendRequest(
  overrides: Partial<TaskCenterDraftSendRequest> = {},
): TaskCenterDraftSendRequest {
  return {
    id: "draft-send-test",
    draftTabId: "task-draft-test",
    text: "真实 E2E 目标",
    images: [],
    submittedAt: Date.now(),
    materializeDraft: false,
    source: "empty-state",
    ...overrides,
  };
}

function mountDraftSendRuntime({
  displayMessagesLength,
  messagesLength = 0,
  currentSessionId,
  request = createDraftSendRequest(),
  sendResult = true,
  onSnapshot,
  onNonMaterializedSessionReady,
  materializeDraftResult = null,
  prewarmedMaterializedSessionId = null,
  prewarmedDraftSession = false,
  rerenderAfterMount = false,
}: {
  displayMessagesLength: number;
  messagesLength?: number;
  currentSessionId?: string | null;
  request?: TaskCenterDraftSendRequest | null;
  sendResult?: boolean;
  materializeDraftResult?: string | null;
  prewarmedMaterializedSessionId?: string | null;
  prewarmedDraftSession?: boolean;
  rerenderAfterMount?: boolean;
  onNonMaterializedSessionReady?: (sessionId: string) => void;
  onSnapshot: (snapshot: {
    taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
    homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
  }) => void;
}): DraftSendRuntimeHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const restoreInput = vi.fn();
  const commitMaterializedDraftTab = vi.fn();
  const materializeDraftTab = vi.fn(async () => materializeDraftResult);
  const send = vi.fn(async () => sendResult);

  function Harness() {
    const [renderTick, setRenderTick] = useState(0);
    const [taskCenterDraftSendRequest, setTaskCenterDraftSendRequest] =
      useState<TaskCenterDraftSendRequest | null>(request);
    const [homePendingPreviewRequest, setHomePendingPreviewRequest] =
      useState<TaskCenterDraftSendRequest | null>(request);
    const materializedSessionIdsRef = useRef(
      new Map<string, string>(
        request && prewarmedMaterializedSessionId
          ? [[request.draftTabId, prewarmedMaterializedSessionId]]
          : [],
      ),
    );
    const prewarmedDraftSessionIdsRef = useRef(
      new Set<string>(
        request && prewarmedDraftSession ? [request.draftTabId] : [],
      ),
    );
    const sendRef = useRef(send);

    useEffect(() => {
      if (rerenderAfterMount && renderTick === 0) {
        setRenderTick(1);
      }
    }, [renderTick]);

    useTaskCenterDraftSendDispatchRuntime({
      taskCenterDraftSendRequest,
      setTaskCenterDraftSendRequest,
      setHomePendingPreviewRequest,
      messagesLength,
      displayMessagesLength,
      currentSessionId,
      materializedSessionIdsRef,
      prewarmedDraftSessionIdsRef,
      materializeDraftTab,
      commitMaterializedDraftTab,
      onNonMaterializedSessionReady,
      restoreInput,
      sendRef,
      workspaceId: rerenderAfterMount
        ? `workspace-test-${renderTick}`
        : "workspace-test",
    });

    useEffect(() => {
      onSnapshot({
        taskCenterDraftSendRequest,
        homePendingPreviewRequest,
      });
    }, [homePendingPreviewRequest, taskCenterDraftSendRequest]);

    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });
  mountedRoots.push({ root, container });

  return {
    commitMaterializedDraftTab,
    materializeDraftTab,
    restoreInput,
    send,
  };
}

function mountEmptyStateSendRuntime({
  activeSessionId = null,
  activeSessionIdAfterSend,
  activeDraftTabId = null,
  agentEntry = "claw",
  displayMessagesLength = 0,
  turnsLength = 0,
  threadItemsLength = 0,
  hasDisplayMessages = false,
  input = "默认输入",
  sessionId = null,
  sendResult = true,
  taskCenterDraftSendRequest = null,
  onNonMaterializedSessionReady = vi.fn(),
}: {
  activeSessionId?: string | null;
  activeSessionIdAfterSend?: string | null;
  activeDraftTabId?: string | null;
  agentEntry?: string;
  displayMessagesLength?: number;
  turnsLength?: number;
  threadItemsLength?: number;
  hasDisplayMessages?: boolean;
  input?: string;
  sessionId?: string | null;
  sendResult?: boolean;
  taskCenterDraftSendRequest?: TaskCenterDraftSendRequest | null;
  onNonMaterializedSessionReady?: ReturnType<typeof vi.fn>;
} = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const setInput = vi.fn();
  const clearMessages = vi.fn();
  const activeSessionIdRef = { current: activeSessionId };
  const handleSend = vi.fn(async () => {
    if (activeSessionIdAfterSend !== undefined) {
      activeSessionIdRef.current = activeSessionIdAfterSend;
    }
    return sendResult;
  });
  const setTaskCenterDraftTabs = vi.fn();
  const setTaskCenterDraftSendRequest = vi.fn();
  const setHomePendingPreviewRequest = vi.fn();
  let sendHandler: ReturnType<
    typeof useTaskCenterEmptyStateSendRuntime
  > | null = null;

  function Harness() {
    const activeDraftTabIdRef = useRef<string | null>(activeDraftTabId);
    sendHandler = useTaskCenterEmptyStateSendRuntime({
      agentEntry,
      input,
      setInput,
      activeSessionIdRef,
      activeDraftTabIdRef,
      clearMessages,
      displayMessagesLength,
      turnsLength,
      threadItemsLength,
      hasDisplayMessages,
      handleSend,
      sessionId,
      taskCenterWorkspaceId: "workspace-test",
      setTaskCenterDraftTabs,
      setTaskCenterDraftSendRequest,
      taskCenterDraftSendRequest,
      setHomePendingPreviewRequest,
      onNonMaterializedSessionReady,
    });
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });
  mountedRoots.push({ root, container });

  return {
    clearMessages,
    handleSend,
    onNonMaterializedSessionReady,
    setHomePendingPreviewRequest,
    setInput,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs,
    send: (payload?: Parameters<NonNullable<typeof sendHandler>>[0]) => {
      if (!sendHandler) {
        throw new Error("send handler 尚未初始化");
      }
      return sendHandler(payload);
    },
  };
}

afterEach(() => {
  mountedRoots.splice(0).forEach(({ root, container }) => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  vi.clearAllMocks();
});

async function flushAfterNextPaint() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
        return;
      }
      window.setTimeout(resolve, 0);
    });
    await Promise.resolve();
  });
}

describe("extractInputbarManagedObjectiveText", () => {
  it("应从 inputbar managed objective metadata 提取目标文本", () => {
    expect(
      extractInputbarManagedObjectiveText({
        harness: {
          managed_objective: {
            objective_text: "持续推进真实 E2E 目标",
            source: "inputbar",
          },
        },
      }),
    ).toBe("持续推进真实 E2E 目标");
  });

  it("没有目标 metadata 时应返回 null", () => {
    expect(
      extractInputbarManagedObjectiveText({
        harness: {
          preferences: {
            task: true,
          },
        },
      }),
    ).toBeNull();
  });
});

describe("useTaskCenterDraftSendDispatchRuntime", () => {
  it("仅临时展示投影出现时不应清理首页首发 pending preview", async () => {
    const onNonMaterializedSessionReady = vi.fn();
    const snapshots: Array<{
      taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
      homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
    }> = [];
    const request = createDraftSendRequest({
      draftTabId: "sess_ready",
    });

    await act(async () => {
      mountDraftSendRuntime({
        displayMessagesLength: 1,
        messagesLength: 0,
        request,
        onNonMaterializedSessionReady,
        onSnapshot: (snapshot) => {
          snapshots.push(snapshot);
        },
      });
      await Promise.resolve();
    });
    await flushAfterNextPaint();

    const latest = snapshots.at(-1);
    expect(latest?.taskCenterDraftSendRequest).toBeNull();
    expect(latest?.homePendingPreviewRequest).toMatchObject({
      id: request.id,
      draftTabId: "sess_ready",
      sessionReady: true,
    });
    expect(onNonMaterializedSessionReady).toHaveBeenCalledWith("sess_ready");
  });

  it("真实会话已有消息时应清理 draft surface 请求", async () => {
    const onNonMaterializedSessionReady = vi.fn();
    const snapshots: Array<{
      taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
      homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
    }> = [];

    await act(async () => {
      mountDraftSendRuntime({
        displayMessagesLength: 0,
        messagesLength: 1,
        request: createDraftSendRequest({
          draftTabId: "sess_real_message",
        }),
        onNonMaterializedSessionReady,
        onSnapshot: (snapshot) => {
          snapshots.push(snapshot);
        },
      });
      await Promise.resolve();
    });

    const latest = snapshots.at(-1);
    expect(latest?.taskCenterDraftSendRequest).toBeNull();
    expect(latest?.homePendingPreviewRequest).toBeNull();
    expect(onNonMaterializedSessionReady).toHaveBeenCalledWith(
      "sess_real_message",
    );
  });

  it("临时 draft-send id 没有真实 session 时应等待后续真实 session", async () => {
    const onNonMaterializedSessionReady = vi.fn();
    const snapshots: Array<{
      taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
      homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
    }> = [];

    await act(async () => {
      mountDraftSendRuntime({
        displayMessagesLength: 1,
        messagesLength: 0,
        request: createDraftSendRequest({
          draftTabId: "draft-send-test",
        }),
        onNonMaterializedSessionReady,
        onSnapshot: (snapshot) => {
          snapshots.push(snapshot);
        },
      });
      await Promise.resolve();
    });

    expect(onNonMaterializedSessionReady).not.toHaveBeenCalled();
    expect(snapshots.at(-1)?.taskCenterDraftSendRequest?.draftTabId).toBe(
      "draft-send-test",
    );
  });

  it("临时 draft-send id 有真实 session 时应标记真实会话 ready", async () => {
    const onNonMaterializedSessionReady = vi.fn();

    await act(async () => {
      mountDraftSendRuntime({
        displayMessagesLength: 1,
        messagesLength: 0,
        currentSessionId: "sess_ready_from_state",
        request: createDraftSendRequest({
          draftTabId: "draft-send-test",
        }),
        onNonMaterializedSessionReady,
        onSnapshot: () => {},
      });
      await Promise.resolve();
    });

    expect(onNonMaterializedSessionReady).toHaveBeenCalledWith(
      "sess_ready_from_state",
    );
  });

  it("首页首发真实 session 已创建但消息未投影时应接管会话并保留 pending preview", async () => {
    const onNonMaterializedSessionReady = vi.fn();
    const snapshots: Array<{
      taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
      homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
    }> = [];
    const request = createDraftSendRequest({
      draftTabId: "draft-send-live",
      dispatchState: "dispatched",
      materializeDraft: false,
      source: "empty-state",
      text: "@配图 画一张深圳夏天的图",
    });

    mountDraftSendRuntime({
      displayMessagesLength: 0,
      messagesLength: 0,
      currentSessionId: "sess_live_ready",
      request,
      onNonMaterializedSessionReady,
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
    });

    await vi.waitFor(() => {
      const latest = snapshots.at(-1);
      expect(latest?.taskCenterDraftSendRequest).toMatchObject({
        id: request.id,
        draftTabId: "sess_live_ready",
        sessionReady: true,
      });
      expect(latest?.homePendingPreviewRequest).toMatchObject({
        id: request.id,
        draftTabId: "sess_live_ready",
        sessionReady: true,
      });
    });
    expect(onNonMaterializedSessionReady).toHaveBeenCalledWith(
      "sess_live_ready",
    );
  });

  it("首页首发发送返回 false 时应清理 pending preview", async () => {
    const snapshots: Array<{
      taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
      homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
    }> = [];

    const runtime = mountDraftSendRuntime({
      displayMessagesLength: 0,
      messagesLength: 0,
      sendResult: false,
      request: createDraftSendRequest({
        draftTabId: "sess-image-no-project",
        text: "参考图生成一张小红书封面",
      }),
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
    });

    await flushAfterNextPaint();

    await vi.waitFor(() => {
      const latest = snapshots.at(-1);
      expect(latest?.taskCenterDraftSendRequest).toBeNull();
      expect(latest?.homePendingPreviewRequest).toBeNull();
    });
    expect(runtime.restoreInput).toHaveBeenCalledWith(
      "参考图生成一张小红书封面",
    );
  });

  it("materialized 草稿发送成功但真实消息未接管前应保留 pending preview", async () => {
    const snapshots: Array<{
      taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
      homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
    }> = [];
    const request = createDraftSendRequest({
      draftTabId: "task-draft-materialized",
      materializeDraft: true,
      source: "task-center-empty-state",
      text: "画一张深圳夏天的图",
    });

    const runtime = mountDraftSendRuntime({
      displayMessagesLength: 0,
      materializeDraftResult: "session-materialized",
      messagesLength: 0,
      request,
      sendResult: true,
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
    });

    await flushAfterNextPaint();

    await vi.waitFor(() => {
      const latest = snapshots.at(-1);
      expect(latest?.taskCenterDraftSendRequest).toBeNull();
      expect(latest?.homePendingPreviewRequest?.id).toBe(request.id);
    });
    expect(runtime.commitMaterializedDraftTab).toHaveBeenCalledWith(
      request.draftTabId,
      "session-materialized",
      { embedHomeSession: false, hydrateSession: false, preserveInput: false },
    );
    expect(runtime.send).toHaveBeenCalledWith(
      request.images,
      undefined,
      undefined,
      request.text,
      undefined,
      undefined,
      expect.objectContaining({
        targetSessionId: "session-materialized",
        requestMetadata: expect.objectContaining({
          agentUiPerformanceTrace: expect.objectContaining({
            sessionId: "session-materialized",
          }),
        }),
      }),
    );
    expect(
      runtime.commitMaterializedDraftTab.mock.invocationCallOrder[0],
    ).toBeLessThan(runtime.send.mock.invocationCallOrder[0]);
  });

  it("materialized 草稿发送应等待 pending preview paint 后再启动 materialize", async () => {
    const request = createDraftSendRequest({
      draftTabId: "task-draft-defer-materialize",
      materializeDraft: true,
      source: "task-center-empty-state",
      text: "先展示用户消息再创建正式会话",
    });

    const runtime = mountDraftSendRuntime({
      displayMessagesLength: 0,
      materializeDraftResult: "session-defer-materialize",
      messagesLength: 0,
      request,
      sendResult: true,
      onSnapshot: () => {},
    });

    expect(runtime.materializeDraftTab).not.toHaveBeenCalled();
    expect(runtime.send).not.toHaveBeenCalled();

    await flushAfterNextPaint();

    await vi.waitFor(() => {
      expect(runtime.materializeDraftTab).toHaveBeenCalledTimes(1);
      expect(runtime.send).toHaveBeenCalledTimes(1);
    });
  });

  it("materialized 草稿发送期间仅有临时展示投影时应继续保留 pending preview", async () => {
    const snapshots: Array<{
      taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
      homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
    }> = [];
    const request = createDraftSendRequest({
      draftTabId: "task-draft-materialized-preview-race",
      materializeDraft: true,
      source: "task-center-empty-state",
      text: "你好-cdp-race",
    });

    const runtime = mountDraftSendRuntime({
      displayMessagesLength: 1,
      materializeDraftResult: "session-materialized-preview-race",
      messagesLength: 0,
      request,
      sendResult: true,
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
    });

    await flushAfterNextPaint();

    await vi.waitFor(() => {
      const latest = snapshots.at(-1);
      expect(latest?.taskCenterDraftSendRequest).toBeNull();
      expect(latest?.homePendingPreviewRequest?.id).toBe(request.id);
    });
    expect(runtime.commitMaterializedDraftTab).toHaveBeenCalledWith(
      request.draftTabId,
      "session-materialized-preview-race",
      { embedHomeSession: false, hydrateSession: false, preserveInput: false },
    );
    expect(runtime.send).toHaveBeenCalledWith(
      request.images,
      undefined,
      undefined,
      request.text,
      undefined,
      undefined,
      expect.objectContaining({
        targetSessionId: "session-materialized-preview-race",
      }),
    );
  });

  it("materialized 草稿发送成功后应同步路由但不拉取空详情", async () => {
    const request = createDraftSendRequest({
      draftTabId: "task-draft-route-sync",
      materializeDraft: true,
      source: "task-center-empty-state",
      text: "从草稿进入正式会话",
    });

    const runtime = mountDraftSendRuntime({
      displayMessagesLength: 1,
      materializeDraftResult: "session-route-sync",
      messagesLength: 1,
      request,
      sendResult: true,
      onSnapshot: () => {},
    });

    await flushAfterNextPaint();

    await vi.waitFor(() => {
      expect(runtime.commitMaterializedDraftTab).toHaveBeenCalledWith(
        request.draftTabId,
        "session-route-sync",
        {
          embedHomeSession: false,
          hydrateSession: false,
          preserveInput: false,
        },
      );
    });
    const commitOptions = runtime.commitMaterializedDraftTab.mock.calls[0]?.[2];
    expect(commitOptions).toEqual(expect.objectContaining({ hydrateSession: false }));
    expect(commitOptions).not.toEqual(
      expect.objectContaining({ syncRoute: false }),
    );
  });

  it("materialized 草稿发送复用输入预热 session 时不应同步路由", async () => {
    const request = createDraftSendRequest({
      draftTabId: "task-draft-prewarmed-route",
      materializeDraft: true,
      source: "task-center-empty-state",
      text: "复用预热会话发送",
    });

    const runtime = mountDraftSendRuntime({
      displayMessagesLength: 0,
      materializeDraftResult: "session-prewarmed-route",
      messagesLength: 0,
      prewarmedDraftSession: true,
      request,
      sendResult: true,
      onSnapshot: () => {},
    });

    await flushAfterNextPaint();

    await vi.waitFor(() => {
      expect(runtime.commitMaterializedDraftTab).toHaveBeenCalledWith(
        request.draftTabId,
        "session-prewarmed-route",
        {
          embedHomeSession: false,
          hydrateSession: false,
          preserveInput: false,
          syncRoute: false,
        },
      );
    });
  });

  it("materialized 草稿请求在 re-render 下也只派发一次", async () => {
    const request = createDraftSendRequest({
      draftTabId: "task-draft-rerender",
      materializeDraft: true,
      source: "empty-state",
      text: "@配图 画一张深圳夏天的图",
    });

    const runtime = mountDraftSendRuntime({
      displayMessagesLength: 0,
      materializeDraftResult: "session-rerender",
      messagesLength: 0,
      request,
      rerenderAfterMount: true,
      sendResult: true,
      onSnapshot: () => {},
    });

    await flushAfterNextPaint();

    await vi.waitFor(() => {
      expect(runtime.send).toHaveBeenCalledTimes(1);
    });
    expect(runtime.materializeDraftTab).toHaveBeenCalledTimes(1);
    expect(runtime.commitMaterializedDraftTab).toHaveBeenCalledTimes(1);
  });
});

describe("useTaskCenterEmptyStateSendRuntime", () => {
  it("已有首页首发 pending 请求时应拒绝重复发送", () => {
    const runtime = mountEmptyStateSendRuntime({
      activeDraftTabId: "draft-a",
      taskCenterDraftSendRequest: createDraftSendRequest({
        draftTabId: "draft-a",
        materializeDraft: true,
      }),
    });

    let result: unknown;
    act(() => {
      result = runtime.send({
        textOverride: "重复点击不应再次发送",
      });
    });

    expect(result).toBe(false);
    expect(runtime.setInput).not.toHaveBeenCalled();
    expect(runtime.setTaskCenterDraftSendRequest).not.toHaveBeenCalled();
    expect(runtime.setHomePendingPreviewRequest).not.toHaveBeenCalled();
    expect(runtime.setTaskCenterDraftTabs).not.toHaveBeenCalled();
    expect(runtime.handleSend).not.toHaveBeenCalled();
  });

  it("React 状态提交前的连续触发也应只创建一次首页首发请求", async () => {
    const runtime = mountEmptyStateSendRuntime({
      activeDraftTabId: "draft-a",
    });

    let secondResult: unknown;
    act(() => {
      runtime.send({
        textOverride: "生成一版项目复盘",
      });
      secondResult = runtime.send({
        textOverride: "生成一版项目复盘",
      });
    });

    expect(secondResult).toBe(false);
    expect(runtime.setTaskCenterDraftSendRequest).toHaveBeenCalledTimes(1);
    expect(runtime.setHomePendingPreviewRequest).toHaveBeenCalledTimes(1);
    expect(runtime.setTaskCenterDraftTabs).not.toHaveBeenCalled();
    await flushAfterNextPaint();
    expect(runtime.setTaskCenterDraftTabs).toHaveBeenCalledTimes(1);
    expect(runtime.handleSend).not.toHaveBeenCalled();
  });

  it("已有 draft tab 时应创建 materialized draft send request 并清理旧会话内容", async () => {
    const runtime = mountEmptyStateSendRuntime({
      activeDraftTabId: "draft-a",
      displayMessagesLength: 1,
      hasDisplayMessages: true,
    });

    act(() => {
      runtime.send({
        textOverride: "生成一版项目复盘",
        sendOptions: { displayContent: "展示文本" },
        triggeredAt: 1_780_000_010_000,
        triggerSource: "button",
      });
    });

    expect(runtime.setInput).toHaveBeenCalledWith("");
    expect(runtime.clearMessages).toHaveBeenCalledWith({ showToast: false });
    expect(runtime.setTaskCenterDraftSendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draftTabId: "draft-a",
        materializeDraft: true,
        source: "task-center-empty-state",
        submittedAt: 1_780_000_010_000,
        text: "生成一版项目复盘",
        triggerSource: "button",
      }),
    );
    expect(runtime.setHomePendingPreviewRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draftTabId: "draft-a",
        materializeDraft: true,
      }),
    );

    expect(runtime.setTaskCenterDraftTabs).not.toHaveBeenCalled();
    await flushAfterNextPaint();
    const updateTabs = runtime.setTaskCenterDraftTabs.mock.calls[0]?.[0] as
      | ((tabs: TaskCenterDraftTab[]) => TaskCenterDraftTab[])
      | undefined;
    const now = new Date("2026-06-22T00:00:00.000Z");
    expect(
      updateTabs?.([
        {
          id: "draft-a",
          title: "新对话",
          createdAt: now,
          updatedAt: now,
          status: "draft",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: "draft-a",
        title: "生成一版项目复盘",
        status: "running",
      }),
    ]);
    expect(runtime.handleSend).not.toHaveBeenCalled();
    expect(recordAgentUiPerformanceMetric).toHaveBeenCalledWith(
      "homeInput.submit",
      expect.objectContaining({
        hasDraftTab: true,
        source: "task-center-empty-state",
        triggerSource: "button",
        workspaceId: "workspace-test",
      }),
    );
  });

  it("Task Center 首页无会话内容且没有 session 时应直接派发普通发送并保留 pending preview", async () => {
    const runtime = mountEmptyStateSendRuntime({
      activeDraftTabId: null,
      hasDisplayMessages: false,
      sessionId: null,
    });

    act(() => {
      runtime.send({ textOverride: "继续拆分 workspace" });
    });

    expect(runtime.setTaskCenterDraftSendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draftTabId: expect.stringMatching(/^draft-send-/),
        dispatchState: "dispatched",
        materializeDraft: false,
        source: "empty-state",
        text: "继续拆分 workspace",
      }),
    );
    expect(runtime.setHomePendingPreviewRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draftTabId: expect.stringMatching(/^draft-send-/),
        dispatchState: "dispatched",
        materializeDraft: false,
        source: "empty-state",
        text: "继续拆分 workspace",
      }),
    );
    expect(runtime.setTaskCenterDraftTabs).not.toHaveBeenCalled();
    expect(runtime.handleSend).not.toHaveBeenCalled();

    await flushAfterNextPaint();

    expect(runtime.handleSend).toHaveBeenCalledWith(
      [],
      undefined,
      undefined,
      "继续拆分 workspace",
      undefined,
      undefined,
      expect.objectContaining({
        skipPreSubmitResume: true,
        skipSessionRestore: true,
        skipSessionStartHooks: true,
        requestMetadata: expect.objectContaining({
          agentUiPerformanceTrace: expect.objectContaining({
            sessionId: null,
            source: "empty-state",
            workspaceId: "workspace-test",
          }),
        }),
      }),
    );
    expect(recordAgentUiPerformanceMetric).toHaveBeenCalledWith(
      "homeInput.pendingShellApplied",
      expect.objectContaining({
        sessionId: null,
        source: "empty-state",
        workspaceId: "workspace-test",
      }),
    );
    const initialTrackingRequest =
      runtime.setTaskCenterDraftSendRequest.mock.calls[0]?.[0];
    const clearTrackingRequest = runtime.setTaskCenterDraftSendRequest.mock
      .calls[1]?.[0] as
      | ((
          current: TaskCenterDraftSendRequest | null,
        ) => TaskCenterDraftSendRequest | null)
      | undefined;
    expect(
      clearTrackingRequest?.(
        initialTrackingRequest as TaskCenterDraftSendRequest,
      ),
    ).toBeNull();
    expect(runtime.setHomePendingPreviewRequest).toHaveBeenCalledTimes(1);
  });

  it("Task Center 首页首发成功后拿到真实 session 时应立即接管前台会话", async () => {
    const onNonMaterializedSessionReady = vi.fn();
    const runtime = mountEmptyStateSendRuntime({
      activeDraftTabId: null,
      activeSessionIdAfterSend: "sess_ready_after_direct_send",
      hasDisplayMessages: false,
      onNonMaterializedSessionReady,
      sessionId: null,
    });

    act(() => {
      runtime.send({ textOverride: "你好" });
    });
    await flushAfterNextPaint();

    expect(onNonMaterializedSessionReady).toHaveBeenCalledWith(
      "sess_ready_after_direct_send",
    );
    const bindHomePreview = runtime.setHomePendingPreviewRequest.mock.calls.find(
      ([arg]) => typeof arg === "function",
    )?.[0] as
      | ((
          current: TaskCenterDraftSendRequest | null,
        ) => TaskCenterDraftSendRequest | null)
      | undefined;
    const initialPreview =
      runtime.setHomePendingPreviewRequest.mock.calls[0]?.[0];
    expect(
      bindHomePreview?.(initialPreview as TaskCenterDraftSendRequest),
    ).toMatchObject({
      draftTabId: "sess_ready_after_direct_send",
      sessionReady: true,
      text: "你好",
    });
  });

  it("Task Center 首页已有 session 时应直接进入普通发送流并保留 pending preview", async () => {
    const runtime = mountEmptyStateSendRuntime({
      activeDraftTabId: null,
      hasDisplayMessages: false,
      sessionId: "sess_existing",
    });

    act(() => {
      runtime.send({ textOverride: "继续拆分 workspace" });
    });

    expect(runtime.setTaskCenterDraftSendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draftTabId: "sess_existing",
        dispatchState: "dispatched",
        materializeDraft: false,
        source: "empty-state",
        text: "继续拆分 workspace",
      }),
    );
    expect(runtime.setHomePendingPreviewRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draftTabId: "sess_existing",
        dispatchState: "dispatched",
        materializeDraft: false,
        source: "empty-state",
        text: "继续拆分 workspace",
      }),
    );
    expect(runtime.handleSend).not.toHaveBeenCalled();

    await flushAfterNextPaint();

    expect(runtime.handleSend).toHaveBeenCalledWith(
      [],
      undefined,
      undefined,
      "继续拆分 workspace",
      undefined,
      undefined,
      expect.objectContaining({
        skipPreSubmitResume: true,
        skipSessionRestore: true,
        skipSessionStartHooks: true,
        requestMetadata: expect.objectContaining({
          agentUiPerformanceTrace: expect.objectContaining({
            sessionId: "sess_existing",
            source: "empty-state",
            workspaceId: "workspace-test",
          }),
        }),
      }),
    );
    expect(recordAgentUiPerformanceMetric).toHaveBeenCalledWith(
      "homeInput.sendDispatch.done",
      expect.objectContaining({
        result: true,
        sessionId: "sess_existing",
        source: "empty-state",
        workspaceId: "workspace-test",
      }),
    );
    const initialTrackingRequest =
      runtime.setTaskCenterDraftSendRequest.mock.calls[0]?.[0];
    const clearTrackingRequest = runtime.setTaskCenterDraftSendRequest.mock
      .calls[1]?.[0] as
      | ((
          current: TaskCenterDraftSendRequest | null,
        ) => TaskCenterDraftSendRequest | null)
      | undefined;
    expect(
      clearTrackingRequest?.(
        initialTrackingRequest as TaskCenterDraftSendRequest,
      ),
    ).toBeNull();
    expect(runtime.setHomePendingPreviewRequest).toHaveBeenCalledTimes(1);
  });

  it("Task Center 首页已有 session 普通发送派发失败时应恢复输入并清理 pending preview", async () => {
    const runtime = mountEmptyStateSendRuntime({
      activeDraftTabId: null,
      hasDisplayMessages: false,
      input: "失败后保留文本",
      sendResult: false,
      sessionId: "sess_existing",
    });

    act(() => {
      runtime.send();
    });
    await flushAfterNextPaint();

    const initialPreview =
      runtime.setHomePendingPreviewRequest.mock.calls[0]?.[0];
    const clearPreview = runtime.setHomePendingPreviewRequest.mock
      .calls[1]?.[0] as
      | ((
          current: TaskCenterDraftSendRequest | null,
        ) => TaskCenterDraftSendRequest | null)
      | undefined;
    const initialTrackingRequest =
      runtime.setTaskCenterDraftSendRequest.mock.calls[0]?.[0];
    const clearTrackingRequest = runtime.setTaskCenterDraftSendRequest.mock
      .calls[1]?.[0] as
      | ((
          current: TaskCenterDraftSendRequest | null,
        ) => TaskCenterDraftSendRequest | null)
      | undefined;

    expect(runtime.setInput).toHaveBeenLastCalledWith("失败后保留文本");
    expect(
      clearTrackingRequest?.(
        initialTrackingRequest as TaskCenterDraftSendRequest,
      ),
    ).toBeNull();
    expect(
      clearPreview?.(initialPreview as TaskCenterDraftSendRequest),
    ).toBeNull();
  });

  it("非 Task Center 首屏发送应直接回落到 handleSend", () => {
    const runtime = mountEmptyStateSendRuntime({
      agentEntry: "agent",
      hasDisplayMessages: true,
      sessionId: "session-a",
    });
    const image = {
      data: "data:image/png;base64,AA==",
      mediaType: "image/png",
    };
    const sendOptions = { displayContent: "展示文本" };

    act(() => {
      runtime.send({
        images: [image],
        textOverride: "普通发送",
        sendOptions,
      });
    });

    expect(runtime.setTaskCenterDraftSendRequest).not.toHaveBeenCalled();
    expect(runtime.setHomePendingPreviewRequest).not.toHaveBeenCalled();
    expect(runtime.handleSend).toHaveBeenCalledWith(
      [image],
      undefined,
      undefined,
      "普通发送",
      undefined,
      undefined,
      sendOptions,
    );
    expect(recordAgentUiPerformanceMetric).toHaveBeenCalledWith(
      "homeInput.submit",
      expect.objectContaining({
        hasDraftTab: false,
        sessionId: "session-a",
        source: "empty-state",
      }),
    );
  });
});
