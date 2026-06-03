import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";

import { AgentThreadReliabilityPanel } from "./AgentThreadReliabilityPanel";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
  Message,
} from "../types";
import type {
  AgentRuntimeFileCheckpointDetail,
  AgentRuntimeFileCheckpointDiffResult,
  AgentRuntimeFileCheckpointListResult,
  AgentRuntimeFileCheckpointRestoreResult,
  AgentRuntimeThreadReadModel,
} from "@/lib/api/agentRuntime";
import type { TeamMemorySnapshot } from "@/lib/teamMemorySync";
import type { HarnessSessionState } from "../utils/harnessState";
import { conversationProjectionStore } from "../projection/conversationProjectionStore";
import { changeLimeLocale } from "@/i18n/createI18n";

const hoistedMocks = vi.hoisted(() => ({
  diffAgentRuntimeFileCheckpointMock: vi.fn(),
  getAgentRuntimeFileCheckpointMock: vi.fn(),
  listAgentRuntimeFileCheckpointsMock: vi.fn(),
  restoreAgentRuntimeFileCheckpointMock: vi.fn(),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  mockPrefetchContextMemoryForTurn: vi.fn(),
}));

export const diffAgentRuntimeFileCheckpointMock =
  hoistedMocks.diffAgentRuntimeFileCheckpointMock;
export const getAgentRuntimeFileCheckpointMock =
  hoistedMocks.getAgentRuntimeFileCheckpointMock;
export const listAgentRuntimeFileCheckpointsMock =
  hoistedMocks.listAgentRuntimeFileCheckpointsMock;
export const restoreAgentRuntimeFileCheckpointMock =
  hoistedMocks.restoreAgentRuntimeFileCheckpointMock;
export const mockToast = hoistedMocks.mockToast;
export const mockPrefetchContextMemoryForTurn =
  hoistedMocks.mockPrefetchContextMemoryForTurn;

vi.mock("sonner", () => ({
  toast: hoistedMocks.mockToast,
}));

vi.mock("@/lib/api/agentRuntime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/agentRuntime")>(
    "@/lib/api/agentRuntime",
  );
  return {
    ...actual,
    diffAgentRuntimeFileCheckpoint:
      hoistedMocks.diffAgentRuntimeFileCheckpointMock,
    getAgentRuntimeFileCheckpoint:
      hoistedMocks.getAgentRuntimeFileCheckpointMock,
    listAgentRuntimeFileCheckpoints:
      hoistedMocks.listAgentRuntimeFileCheckpointsMock,
    restoreAgentRuntimeFileCheckpoint:
      hoistedMocks.restoreAgentRuntimeFileCheckpointMock,
  };
});

vi.mock("@/lib/api/memoryRuntime", () => ({
  prefetchContextMemoryForTurn: hoistedMocks.mockPrefetchContextMemoryForTurn,
}));

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];
let originalClipboard: Clipboard | undefined;

export function createFileCheckpointListResult(): AgentRuntimeFileCheckpointListResult {
  return {
    session_id: "session-file-1",
    thread_id: "thread-file-1",
    checkpoint_count: 2,
    checkpoints: [
      {
        checkpoint_id: "artifact-document:req-2",
        turn_id: "turn-10",
        path: ".lime/artifacts/thread-file/persistence-map.artifact.json",
        source: "artifact_document_service",
        updated_at: "2026-04-16T09:12:00Z",
        version_no: 8,
        version_id: "artifact-document:req-2:v8",
        request_id: "req-2",
        title: "持久化 current map",
        kind: "artifact_document",
        status: "ready",
        preview_text: "补上 file checkpoint 对话框入口",
        snapshot_path:
          ".lime/artifacts/thread-file/.versions/persistence-map.v8.json",
        validation_issue_count: 1,
      },
      {
        checkpoint_id: "artifact-document:req-1",
        turn_id: "turn-9",
        path: ".lime/artifacts/thread-file/replay.artifact.json",
        source: "artifact_document_service",
        updated_at: "2026-04-16T08:58:00Z",
        version_no: 7,
        version_id: "artifact-document:req-1:v7",
        request_id: "req-1",
        title: "Replay case",
        kind: "artifact_document",
        status: "ready",
        preview_text: "上一版 replay 导出",
        snapshot_path:
          ".lime/artifacts/thread-file/.versions/replay-case.v7.json",
        validation_issue_count: 0,
      },
    ],
  };
}

export function createFileCheckpointDetail(
  checkpointId: string,
): AgentRuntimeFileCheckpointDetail {
  if (checkpointId === "artifact-document:req-1") {
    return {
      session_id: "session-file-1",
      thread_id: "thread-file-1",
      checkpoint: {
        checkpoint_id: "artifact-document:req-1",
        turn_id: "turn-9",
        path: ".lime/artifacts/thread-file/replay.artifact.json",
        source: "artifact_document_service",
        updated_at: "2026-04-16T08:58:00Z",
        version_no: 7,
        version_id: "artifact-document:req-1:v7",
        request_id: "req-1",
        title: "Replay case",
        kind: "artifact_document",
        status: "ready",
        preview_text: "上一版 replay 导出",
        snapshot_path:
          ".lime/artifacts/thread-file/.versions/replay-case.v7.json",
        validation_issue_count: 0,
      },
      live_path: ".lime/artifacts/thread-file/replay.artifact.json",
      snapshot_path:
        ".lime/artifacts/thread-file/.versions/replay-case.v7.json",
      checkpoint_document: {
        title: "Replay case",
        body: "上一版导出仍使用旧摘要文案",
      },
      live_document: {
        title: "Replay case",
        body: "当前已切到新的 evidence 结构",
      },
      version_history: [{ version_id: "artifact-document:req-1:v6" }],
      validation_issues: [],
      metadata: {
        source: "artifact_document_service",
      },
      content: "上一版 replay 导出",
    };
  }

  return {
    session_id: "session-file-1",
    thread_id: "thread-file-1",
    checkpoint: {
      checkpoint_id: "artifact-document:req-2",
      turn_id: "turn-10",
      path: ".lime/artifacts/thread-file/persistence-map.artifact.json",
      source: "artifact_document_service",
      updated_at: "2026-04-16T09:12:00Z",
      version_no: 8,
      version_id: "artifact-document:req-2:v8",
      request_id: "req-2",
      title: "持久化 current map",
      kind: "artifact_document",
      status: "ready",
      preview_text: "补上 file checkpoint 对话框入口",
      snapshot_path:
        ".lime/artifacts/thread-file/.versions/persistence-map.v8.json",
      validation_issue_count: 1,
    },
    live_path: ".lime/artifacts/thread-file/persistence-map.artifact.json",
    snapshot_path:
      ".lime/artifacts/thread-file/.versions/persistence-map.v8.json",
    checkpoint_document: {
      title: "持久化 current map",
      summary: "已在可靠性面板接入 file checkpoint detail/diff 对话框",
    },
    live_document: {
      title: "持久化 current map",
      summary: "当前工作区产物已经更新到 v8",
    },
    version_history: [
      { version_id: "artifact-document:req-2:v7" },
      { version_id: "artifact-document:req-2:v6" },
    ],
    validation_issues: ["缺少 reviewer 字段"],
    metadata: {
      source: "artifact_document_service",
    },
    content: "补上 file checkpoint 对话框入口",
  };
}

export function createFileCheckpointDiff(
  checkpointId: string,
): AgentRuntimeFileCheckpointDiffResult {
  if (checkpointId === "artifact-document:req-1") {
    return {
      session_id: "session-file-1",
      thread_id: "thread-file-1",
      checkpoint: createFileCheckpointDetail(checkpointId).checkpoint,
      current_version_id: "artifact-document:req-1:v7",
      previous_version_id: "artifact-document:req-1:v6",
      diff: {
        changes: ["summary 从旧结构迁移到 replay 包"],
      },
    };
  }

  return {
    session_id: "session-file-1",
    thread_id: "thread-file-1",
    checkpoint: createFileCheckpointDetail(checkpointId).checkpoint,
    current_version_id: "artifact-document:req-2:v8",
    previous_version_id: "artifact-document:req-2:v7",
    diff: {
      summary: "更新持久化快照入口",
      unified_diff: [
        "diff --git a/src/components/agent/chat/components/AgentThreadReliabilityPanel.tsx b/src/components/agent/chat/components/AgentThreadReliabilityPanel.tsx",
        "--- a/src/components/agent/chat/components/AgentThreadReliabilityPanel.tsx",
        "+++ b/src/components/agent/chat/components/AgentThreadReliabilityPanel.tsx",
        "@@ -10,2 +10,3 @@",
        ' const title = "最近文件快照";',
        '-const action = "打开快照";',
        '+const action = "查看快照详情";',
      ].join("\n"),
    },
  };
}

export function createFileCheckpointRestoreResult(): AgentRuntimeFileCheckpointRestoreResult {
  return {
    session_id: "session-file-1",
    thread_id: "thread-file-1",
    checkpoint: createFileCheckpointDetail("artifact-document:req-2")
      .checkpoint,
    live_path: ".lime/artifacts/thread-file/persistence-map.artifact.json",
    snapshot_path:
      ".lime/artifacts/thread-file/.versions/persistence-map.v8.json",
    backup_path:
      ".lime/file-checkpoint-backups/20260416T091200Z/.lime/artifacts/thread-file/persistence-map.artifact.json",
    restored_at: "2026-04-16T09:13:00Z",
  };
}

export async function flushPromises(rounds = 4) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");

  originalClipboard = navigator.clipboard;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
  window.localStorage.clear();
  mockPrefetchContextMemoryForTurn.mockResolvedValue({
    session_id: "session-default",
    rules_source_paths: [],
    working_memory_excerpt: null,
    durable_memories: [],
    team_memory_entries: [],
    latest_compaction: null,
    prompt: null,
  });
  listAgentRuntimeFileCheckpointsMock.mockResolvedValue(
    createFileCheckpointListResult(),
  );
  getAgentRuntimeFileCheckpointMock.mockImplementation(
    async ({ checkpoint_id }: { checkpoint_id: string }) =>
      createFileCheckpointDetail(checkpoint_id),
  );
  diffAgentRuntimeFileCheckpointMock.mockImplementation(
    async ({ checkpoint_id }: { checkpoint_id: string }) =>
      createFileCheckpointDiff(checkpoint_id),
  );
  restoreAgentRuntimeFileCheckpointMock.mockResolvedValue(
    createFileCheckpointRestoreResult(),
  );
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  });
  vi.clearAllMocks();
  conversationProjectionStore.clearAgentUiProjectionEvents();
});

export function renderPanel(props?: {
  threadRead?: AgentRuntimeThreadReadModel | null;
  turns?: AgentThreadTurn[];
  threadItems?: AgentThreadItem[];
  pendingActions?: ActionRequired[];
  submittedActionsInFlight?: ActionRequired[];
  currentTurnId?: string | null;
  canInterrupt?: boolean;
  onInterruptCurrentTurn?: () => void | Promise<void>;
  onResumeThread?: () => boolean | Promise<boolean>;
  onReplayPendingRequest?: (requestId: string) => boolean | Promise<boolean>;
  onLocatePendingRequest?: (requestId: string) => void;
  onPromoteQueuedTurn?: (queuedTurnId: string) => boolean | Promise<boolean>;
  onOpenMemoryWorkbench?: () => void;
  harnessState?: HarnessSessionState | null;
  messages?: Message[];
  teamMemorySnapshot?: TeamMemorySnapshot | null;
  diagnosticRuntimeContext?: {
    sessionId?: string | null;
    workspaceId?: string | null;
    workingDir?: string | null;
    providerType?: string | null;
    model?: string | null;
    executionStrategy?: string | null;
    activeTheme?: string | null;
    selectedTeamLabel?: string | null;
  } | null;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <AgentThreadReliabilityPanel
        threadRead={props?.threadRead}
        turns={props?.turns}
        threadItems={props?.threadItems}
        pendingActions={props?.pendingActions}
        submittedActionsInFlight={props?.submittedActionsInFlight}
        currentTurnId={props?.currentTurnId}
        canInterrupt={props?.canInterrupt}
        onInterruptCurrentTurn={props?.onInterruptCurrentTurn}
        onResumeThread={props?.onResumeThread}
        onReplayPendingRequest={props?.onReplayPendingRequest}
        onLocatePendingRequest={props?.onLocatePendingRequest}
        onPromoteQueuedTurn={props?.onPromoteQueuedTurn}
        onOpenMemoryWorkbench={props?.onOpenMemoryWorkbench}
        harnessState={props?.harnessState}
        messages={props?.messages}
        teamMemorySnapshot={props?.teamMemorySnapshot}
        diagnosticRuntimeContext={props?.diagnosticRuntimeContext}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}
