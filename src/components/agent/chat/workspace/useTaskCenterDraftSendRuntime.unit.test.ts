import { createElement, useEffect, useRef, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { extractInputbarManagedObjectiveText } from "../components/Inputbar/utils/inputbarModeRequestMetadata";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import { useTaskCenterDraftSendDispatchRuntime } from "./useTaskCenterDraftSendRuntime";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

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
  onSnapshot,
  onNonMaterializedSessionReady,
}: {
  displayMessagesLength: number;
  messagesLength?: number;
  currentSessionId?: string | null;
  request?: TaskCenterDraftSendRequest | null;
  onNonMaterializedSessionReady?: (sessionId: string) => void;
  onSnapshot: (snapshot: {
    taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
    homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
  }) => void;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    const [taskCenterDraftSendRequest, setTaskCenterDraftSendRequest] =
      useState<TaskCenterDraftSendRequest | null>(request);
    const [homePendingPreviewRequest, setHomePendingPreviewRequest] =
      useState<TaskCenterDraftSendRequest | null>(request);
    const materializedSessionIdsRef = useRef(new Map<string, string>());
    const sendRef = useRef(vi.fn(async () => true));

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
      sendRef,
      workspaceId: "workspace-test",
    });

    useEffect(() => {
      onSnapshot({
        taskCenterDraftSendRequest,
        homePendingPreviewRequest,
      });
    }, [
      homePendingPreviewRequest,
      taskCenterDraftSendRequest,
    ]);

    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });
  mountedRoots.push({ root, container });
}

afterEach(() => {
  mountedRoots.splice(0).forEach(({ root, container }) => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
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
});
