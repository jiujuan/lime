import { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Character } from "@/lib/api/memory";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import {
  TASK_CENTER_DRAFT_SESSION_WARMUP_DELAY_MS,
  type TaskCenterDraftTab,
} from "./agentChatWorkspaceHelpers";
import { useTaskCenterDraftMaterializationRuntime } from "./useTaskCenterDraftMaterializationRuntime";

const initialDraft: TaskCenterDraftTab = {
  id: "task-draft-existing",
  title: "新对话",
  createdAt: new Date("2026-06-11T00:00:00.000Z"),
  updatedAt: new Date("2026-06-11T00:00:00.000Z"),
  status: "draft",
};

interface ProbeSnapshot {
  activeDraftTabId: string | null;
  draftTabs: TaskCenterDraftTab[];
  homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
  input: string;
  taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
}

interface ProbeProps {
  createFreshSession: ReturnType<typeof vi.fn>;
  initialPendingRequest?: TaskCenterDraftSendRequest | null;
  onRuntime?: (runtime: {
    materializeTaskCenterDraftTab: (
      draftTabId: string,
      options?: { reason?: "send" | "input_warmup"; commit?: boolean },
    ) => Promise<string | null>;
    openTaskCenterDraftTab: (options?: {
      preservePendingSendRequest?: boolean;
    }) => string;
  }) => void;
  onSnapshot: (snapshot: ProbeSnapshot) => void;
  upsertTaskCenterOpenTab: ReturnType<typeof vi.fn>;
}

function Probe({
  createFreshSession,
  initialPendingRequest = null,
  onRuntime,
  onSnapshot,
  upsertTaskCenterOpenTab,
}: ProbeProps) {
  const [draftTabs, setDraftTabs] = useState<TaskCenterDraftTab[]>([
    initialDraft,
  ]);
  const [
    activeDraftTabId,
    setActiveTaskCenterDraftTabId,
  ] = useState<string | null>(initialDraft.id);
  const [input, setInput] = useState("残留输入");
  const [homePendingPreviewRequest, setHomePendingPreviewRequest] =
    useState<TaskCenterDraftSendRequest | null>(initialPendingRequest);
  const [taskCenterDraftSendRequest, setTaskCenterDraftSendRequest] =
    useState<TaskCenterDraftSendRequest | null>(initialPendingRequest);
  const [, setMentionedCharacters] = useState<Character[]>([]);
  const [, setSelectedText] = useState("");
  const [, setTaskCenterDetachedTopicId] = useState<string | null>(null);
  const [, setTaskCenterTransitionTopicId] = useState<string | null>(null);
  const draftSurfaceActiveRef = useRef(true);

  const runtime = useTaskCenterDraftMaterializationRuntime({
    activeTaskCenterDraftTabId: activeDraftTabId,
    agentEntry: "claw",
    clearMessages: vi.fn(),
    createFreshSession,
    input,
    isPreparingSend: false,
    isSending: false,
    markTaskCenterEmbeddedHomeSession: vi.fn(),
    markTaskCenterLocalSessionOverride: vi.fn(),
    resetLocalImageWorkbenchSessionScope: vi.fn(),
    resetTopicLocalState: vi.fn(),
    setActiveTaskCenterDraftTabId,
    setHomePendingPreviewRequest,
    setInput,
    setMentionedCharacters,
    setSelectedText,
    setTaskCenterDetachedTopicId,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs: setDraftTabs,
    setTaskCenterTransitionTopicId,
    taskCenterDraftSurfaceActiveRef: draftSurfaceActiveRef,
    taskCenterDraftTabs: draftTabs,
    taskCenterWorkspaceId: "workspace-test",
    upsertTaskCenterOpenTab,
  });

  useEffect(() => {
    onSnapshot({
      activeDraftTabId,
      draftTabs,
      homePendingPreviewRequest,
      input,
      taskCenterDraftSendRequest,
    });
  }, [
    activeDraftTabId,
    draftTabs,
    homePendingPreviewRequest,
    input,
    onSnapshot,
    taskCenterDraftSendRequest,
  ]);

  useEffect(() => {
    onRuntime?.({
      materializeTaskCenterDraftTab: runtime.materializeTaskCenterDraftTab,
      openTaskCenterDraftTab: runtime.openTaskCenterDraftTab,
    });
  }, [
    onRuntime,
    runtime.materializeTaskCenterDraftTab,
    runtime.openTaskCenterDraftTab,
  ]);

  return null;
}

describe("useTaskCenterDraftMaterializationRuntime", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("输入预热只应创建底层会话，不应提交并移除草稿标签", async () => {
    const createFreshSession = vi.fn(async () => "session-warmup");
    const upsertTaskCenterOpenTab = vi.fn();
    const snapshots: ProbeSnapshot[] = [];

    await act(async () => {
      root.render(
        <Probe
          createFreshSession={createFreshSession}
          onSnapshot={(snapshot) => {
            snapshots.push(snapshot);
          }}
          upsertTaskCenterOpenTab={upsertTaskCenterOpenTab}
        />,
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(TASK_CENTER_DRAFT_SESSION_WARMUP_DELAY_MS + 1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createFreshSession).toHaveBeenCalledWith("新对话", {
      preserveCurrentSnapshot: false,
    });
    expect(upsertTaskCenterOpenTab).not.toHaveBeenCalled();
    const latestSnapshot = snapshots.at(-1);
    expect(latestSnapshot?.activeDraftTabId).toBe(initialDraft.id);
    expect(latestSnapshot?.draftTabs.map((tab) => tab.id)).toEqual([
      initialDraft.id,
    ]);
  });

  it("首页首发打开草稿标签时不应清掉已排队的发送请求", async () => {
    const createFreshSession = vi.fn(async () => "session-send");
    const upsertTaskCenterOpenTab = vi.fn();
    const snapshots: ProbeSnapshot[] = [];
    let openDraftTab:
      | ((options?: { preservePendingSendRequest?: boolean }) => string)
      | null = null;
    const pendingRequest: TaskCenterDraftSendRequest = {
      id: "draft-send-home",
      draftTabId: "task-draft-home",
      text: "真实 E2E 目标",
      images: [],
      submittedAt: Date.now(),
      materializeDraft: true,
      source: "task-center-empty-state",
    };

    await act(async () => {
      root.render(
        <Probe
          createFreshSession={createFreshSession}
          initialPendingRequest={pendingRequest}
          onRuntime={(runtime) => {
            openDraftTab = runtime.openTaskCenterDraftTab;
          }}
          onSnapshot={(snapshot) => {
            snapshots.push(snapshot);
          }}
          upsertTaskCenterOpenTab={upsertTaskCenterOpenTab}
        />,
      );
    });

    await act(async () => {
      openDraftTab?.({ preservePendingSendRequest: true });
      await Promise.resolve();
    });

    const latestSnapshot = snapshots.at(-1);
    expect(latestSnapshot?.taskCenterDraftSendRequest?.id).toBe(
      pendingRequest.id,
    );
    expect(latestSnapshot?.homePendingPreviewRequest?.id).toBe(
      pendingRequest.id,
    );
    expect(latestSnapshot?.draftTabs).toHaveLength(2);
  });

  it("首页首发打开草稿后应能立即 materialize 新草稿", async () => {
    const createFreshSession = vi.fn(async () => "session-immediate-send");
    const upsertTaskCenterOpenTab = vi.fn();
    const snapshots: ProbeSnapshot[] = [];
    let runtime:
      | {
          materializeTaskCenterDraftTab: (
            draftTabId: string,
            options?: { reason?: "send" | "input_warmup"; commit?: boolean },
          ) => Promise<string | null>;
          openTaskCenterDraftTab: (options?: {
            preservePendingSendRequest?: boolean;
          }) => string;
        }
      | null = null;

    await act(async () => {
      root.render(
        <Probe
          createFreshSession={createFreshSession}
          onRuntime={(nextRuntime) => {
            runtime = nextRuntime;
          }}
          onSnapshot={(snapshot) => {
            snapshots.push(snapshot);
          }}
          upsertTaskCenterOpenTab={upsertTaskCenterOpenTab}
        />,
      );
    });

    let draftTabId = "";
    let materializedSessionId: string | null = null;
    await act(async () => {
      draftTabId =
        runtime?.openTaskCenterDraftTab({
          preservePendingSendRequest: true,
        }) ?? "";
      materializedSessionId =
        (await runtime?.materializeTaskCenterDraftTab(draftTabId, {
          reason: "send",
          commit: false,
        })) ?? null;
    });

    expect(draftTabId).toMatch(/^task-draft-/);
    expect(materializedSessionId).toBe("session-immediate-send");
    expect(createFreshSession).toHaveBeenCalledWith("新对话", {
      preserveCurrentSnapshot: false,
    });
    expect(snapshots.at(-1)?.draftTabs.some((tab) => tab.id === draftTabId)).toBe(
      true,
    );
  });
});
