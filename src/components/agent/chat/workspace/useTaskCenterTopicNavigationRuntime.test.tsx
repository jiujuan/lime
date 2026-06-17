import { useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Character } from "@/lib/api/memory";
import type { Topic } from "../hooks/agentChatShared";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import type { TaskCenterWorkspaceTabMap } from "../utils/taskCenterTabs";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";
import { useTaskCenterTopicNavigationRuntime } from "./useTaskCenterTopicNavigationRuntime";

type Runtime = ReturnType<typeof useTaskCenterTopicNavigationRuntime>;

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function mountRuntime(overrides: {
  clearTaskCenterEmbeddedHomeSession?: (topicId: string) => void;
  switchTopic?: (topicId: string, options?: unknown) => Promise<unknown>;
} = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const runtimeRef: { current: Runtime | null } = { current: null };
  const topicById = new Map<string, Topic>([
    [
      "topic-next",
      {
        id: "topic-next",
        title: "历史会话",
        createdAt: new Date("2026-06-17T00:00:00.000Z"),
        updatedAt: new Date("2026-06-17T00:00:00.000Z"),
        workspaceId: "workspace-test",
        workingDir: null,
        messagesCount: 1,
        executionStrategy: "react",
        status: "done",
        lastPreview: "历史会话",
        isPinned: false,
        hasUnread: false,
        tag: null,
        sourceSessionId: "topic-next",
      },
    ],
  ]);

  function Harness() {
    const activeSessionIdRef = useRef<string | null>("topic-current");
    const activeTaskCenterDraftTabIdRef = useRef<string | null>(null);
    const taskCenterDraftSurfaceActiveRef = useRef(true);
    const taskCenterDraftTabsRef = useRef<TaskCenterDraftTab[]>([]);
    const taskCenterOpenTabIdsRef = useRef(["topic-current"]);
    const [, setActiveTaskCenterDraftTabId] = useState<string | null>(null);
    const [, setHomePendingPreviewRequest] =
      useState<TaskCenterDraftSendRequest | null>(null);
    const [, setInput] = useState("");
    const [, setMentionedCharacters] = useState<Character[]>([]);
    const [, setSelectedText] = useState("");
    const [, setTaskCenterDetachedTopicId] = useState<string | null>(null);
    const [, setTaskCenterDraftSendRequest] =
      useState<TaskCenterDraftSendRequest | null>(null);
    const [, setTaskCenterDraftTabs] = useState<TaskCenterDraftTab[]>([]);
    const [, setTaskCenterLocalSessionOverride] = useState<{
      sessionId: string;
      routeSessionId: string | null;
    } | null>(null);
    const [, setTaskCenterOpenTabMap] = useState<TaskCenterWorkspaceTabMap>({});
    const [, setTaskCenterTransitionTopicId] = useState<string | null>(null);

    runtimeRef.current = useTaskCenterTopicNavigationRuntime({
      activeSessionIdRef,
      activeTaskCenterDraftTabIdRef,
      agentEntry: "claw",
      clearEntryPendingA2UI: vi.fn(),
      clearMessages: vi.fn(),
      clearTaskCenterEmbeddedHomeSession:
        overrides.clearTaskCenterEmbeddedHomeSession ?? vi.fn(),
      messagesLength: 0,
      openTaskCenterDraftTab: vi.fn(() => "draft-1"),
      replaceTaskCenterOpenTabs: vi.fn(),
      resetLocalImageWorkbenchSessionScope: vi.fn(),
      resetTopicLocalState: vi.fn(),
      sessionId: "topic-current",
      setActiveTaskCenterDraftTabId,
      setHomePendingPreviewRequest,
      setInput,
      setMentionedCharacters,
      setSelectedText,
      setTaskCenterDetachedTopicId,
      setTaskCenterDraftSendRequest,
      setTaskCenterDraftTabs,
      setTaskCenterLocalSessionOverride,
      setTaskCenterOpenTabMap,
      setTaskCenterTransitionTopicId,
      switchTopic:
        overrides.switchTopic ?? vi.fn(async () => "success" as const),
      taskCenterDetachedTopicId: null,
      taskCenterDraftSurfaceActiveRef,
      taskCenterDraftTabsRef,
      taskCenterOpenTabIdsRef,
      taskCenterTransitionTopicId: null,
      taskCenterWorkspaceId: "workspace-test",
      topicById,
      upsertTaskCenterOpenTab: vi.fn(),
      markTaskCenterLocalSessionOverride: vi.fn(),
    });
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });
  mountedRoots.push({ root, container });

  if (!runtimeRef.current) {
    throw new Error("runtime did not mount");
  }
  return runtimeRef.current;
}

afterEach(() => {
  mountedRoots.splice(0).forEach(({ root, container }) => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe("useTaskCenterTopicNavigationRuntime", () => {
  it("打开已有任务会话时应清理 embedded home 标记", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const clearTaskCenterEmbeddedHomeSession = vi.fn();
    const switchTopic = vi.fn(async () => "success" as const);
    const runtime = mountRuntime({
      clearTaskCenterEmbeddedHomeSession,
      switchTopic,
    });

    await act(async () => {
      await runtime.handleOpenTaskTopic("topic-next");
    });

    expect(clearTaskCenterEmbeddedHomeSession).toHaveBeenCalledWith(
      "topic-next",
    );
    expect(switchTopic).toHaveBeenCalledWith("topic-next", undefined);
  });
});
