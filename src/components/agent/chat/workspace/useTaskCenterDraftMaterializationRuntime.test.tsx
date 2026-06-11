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
  input: string;
}

interface ProbeProps {
  createFreshSession: ReturnType<typeof vi.fn>;
  onSnapshot: (snapshot: ProbeSnapshot) => void;
  upsertTaskCenterOpenTab: ReturnType<typeof vi.fn>;
}

function Probe({
  createFreshSession,
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
  const [, setHomePendingPreviewRequest] =
    useState<TaskCenterDraftSendRequest | null>(null);
  const [, setTaskCenterDraftSendRequest] =
    useState<TaskCenterDraftSendRequest | null>(null);
  const [, setMentionedCharacters] = useState<Character[]>([]);
  const [, setSelectedText] = useState("");
  const [, setTaskCenterDetachedTopicId] = useState<string | null>(null);
  const [, setTaskCenterTransitionTopicId] = useState<string | null>(null);
  const draftSurfaceActiveRef = useRef(true);

  useTaskCenterDraftMaterializationRuntime({
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
      input,
    });
  }, [activeDraftTabId, draftTabs, input, onSnapshot]);

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
    let latestSnapshot: ProbeSnapshot | null = null;

    await act(async () => {
      root.render(
        <Probe
          createFreshSession={createFreshSession}
          onSnapshot={(snapshot) => {
            latestSnapshot = snapshot;
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
    expect(latestSnapshot?.activeDraftTabId).toBe(initialDraft.id);
    expect(latestSnapshot?.draftTabs.map((tab) => tab.id)).toEqual([
      initialDraft.id,
    ]);
  });
});
