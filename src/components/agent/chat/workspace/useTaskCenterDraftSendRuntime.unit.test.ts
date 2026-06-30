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
  restoreInput: ReturnType<typeof vi.fn>;
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
}: {
  displayMessagesLength: number;
  messagesLength?: number;
  currentSessionId?: string | null;
  request?: TaskCenterDraftSendRequest | null;
  sendResult?: boolean;
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

  function Harness() {
    const [taskCenterDraftSendRequest, setTaskCenterDraftSendRequest] =
      useState<TaskCenterDraftSendRequest | null>(request);
    const [homePendingPreviewRequest, setHomePendingPreviewRequest] =
      useState<TaskCenterDraftSendRequest | null>(request);
    const materializedSessionIdsRef = useRef(new Map<string, string>());
    const sendRef = useRef(vi.fn(async () => sendResult));

    useTaskCenterDraftSendDispatchRuntime({
      taskCenterDraftSendRequest,
      setTaskCenterDraftSendRequest,
      setHomePendingPreviewRequest,
      messagesLength,
      displayMessagesLength,
      currentSessionId,
      materializedSessionIdsRef,
      materializeDraftTab: vi.fn(async () => null),
      commitMaterializedDraftTab: vi.fn(),
      onNonMaterializedSessionReady,
      restoreInput,
      sendRef,
      workspaceId: "workspace-test",
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
    restoreInput,
  };
}

function mountEmptyStateSendRuntime({
  activeDraftTabId = null,
  agentEntry = "claw",
  displayMessagesLength = 0,
  turnsLength = 0,
  threadItemsLength = 0,
  hasDisplayMessages = false,
  input = "默认输入",
  sessionId = null,
}: {
  activeDraftTabId?: string | null;
  agentEntry?: string;
  displayMessagesLength?: number;
  turnsLength?: number;
  threadItemsLength?: number;
  hasDisplayMessages?: boolean;
  input?: string;
  sessionId?: string | null;
} = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const setInput = vi.fn();
  const clearMessages = vi.fn();
  const handleSend = vi.fn(async () => true);
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
      setHomePendingPreviewRequest,
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
  it("真实展示消息出现后应清理首页首发 pending preview", async () => {
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
          draftTabId: "sess_ready",
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
        draftTabId: "draft-send-image-no-project",
        text: "参考图生成一张小红书封面",
      }),
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
    });

    await vi.waitFor(() => {
      const latest = snapshots.at(-1);
      expect(latest?.taskCenterDraftSendRequest).toBeNull();
      expect(latest?.homePendingPreviewRequest).toBeNull();
    });
    expect(runtime.restoreInput).toHaveBeenCalledWith(
      "参考图生成一张小红书封面",
    );
  });
});

describe("useTaskCenterEmptyStateSendRuntime", () => {
  it("已有 draft tab 时应创建 materialized draft send request 并清理旧会话内容", () => {
    const runtime = mountEmptyStateSendRuntime({
      activeDraftTabId: "draft-a",
      displayMessagesLength: 1,
      hasDisplayMessages: true,
    });

    act(() => {
      runtime.send({
        textOverride: "生成一版项目复盘",
        sendOptions: { displayContent: "展示文本" },
      });
    });

    expect(runtime.setInput).toHaveBeenCalledWith("");
    expect(runtime.clearMessages).toHaveBeenCalledWith({ showToast: false });
    expect(runtime.setTaskCenterDraftSendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draftTabId: "draft-a",
        materializeDraft: true,
        source: "task-center-empty-state",
        text: "生成一版项目复盘",
      }),
    );
    expect(runtime.setHomePendingPreviewRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draftTabId: "draft-a",
        materializeDraft: true,
      }),
    );

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
        workspaceId: "workspace-test",
      }),
    );
  });

  it("Task Center 首页无会话内容时应先排队 non-materialized request", () => {
    const runtime = mountEmptyStateSendRuntime({
      activeDraftTabId: null,
      hasDisplayMessages: false,
      sessionId: null,
    });

    act(() => {
      runtime.send({ textOverride: "继续拆分 workspace" });
    });

    expect(runtime.handleSend).not.toHaveBeenCalled();
    const request = runtime.setTaskCenterDraftSendRequest.mock.calls[0]?.[0] as
      | TaskCenterDraftSendRequest
      | undefined;
    expect(request).toEqual(
      expect.objectContaining({
        materializeDraft: false,
        source: "empty-state",
        text: "继续拆分 workspace",
      }),
    );
    expect(request?.draftTabId).toBe(request?.id);
    expect(runtime.setHomePendingPreviewRequest).toHaveBeenCalledWith(request);
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
