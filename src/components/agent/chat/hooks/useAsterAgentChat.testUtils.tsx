import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import type { WriteArtifactContext } from "../types";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";

const {
  mockInitAsterAgent,
  mockSubmitAgentRuntimeTurn,
  mockCreateAgentRuntimeSession,
  mockListAgentRuntimeSessions,
  mockGetAgentRuntimeSession,
  mockGetAgentRuntimeThreadRead,
  mockGenerateAgentRuntimeSessionTitle,
  mockUpdateAgentRuntimeSession,
  mockDeleteAgentRuntimeSession,
  mockCompactAgentRuntimeSession,
  mockInterruptAgentRuntimeTurn,
  mockResumeAgentRuntimeThread,
  mockReplayAgentRuntimeRequest,
  mockPromoteAgentRuntimeQueuedTurn,
  mockRemoveAgentRuntimeQueuedTurn,
  mockRespondAgentRuntimeAction,
  mockParseAgentEvent,
  mockSafeListen,
  mockToast,
  mockWechatChannelSetRuntimeModel,
  mockGetDefaultProvider,
  mockResolveClawWorkspaceProviderSelection,
  mockScheduleMinimumDelayIdleTask,
} = vi.hoisted(() => ({
  mockInitAsterAgent: vi.fn(),
  mockSubmitAgentRuntimeTurn: vi.fn(),
  mockCreateAgentRuntimeSession: vi.fn(),
  mockListAgentRuntimeSessions: vi.fn(),
  mockGetAgentRuntimeSession: vi.fn(),
  mockGetAgentRuntimeThreadRead: vi.fn(),
  mockGenerateAgentRuntimeSessionTitle: vi.fn(),
  mockUpdateAgentRuntimeSession: vi.fn(),
  mockDeleteAgentRuntimeSession: vi.fn(),
  mockCompactAgentRuntimeSession: vi.fn(),
  mockInterruptAgentRuntimeTurn: vi.fn(),
  mockResumeAgentRuntimeThread: vi.fn(),
  mockReplayAgentRuntimeRequest: vi.fn(),
  mockPromoteAgentRuntimeQueuedTurn: vi.fn(),
  mockRemoveAgentRuntimeQueuedTurn: vi.fn(),
  mockRespondAgentRuntimeAction: vi.fn(),
  mockParseAgentEvent: vi.fn((payload: unknown) => payload),
  mockSafeListen: vi.fn(),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  mockWechatChannelSetRuntimeModel: vi.fn(async () => undefined),
  mockGetDefaultProvider: vi.fn(),
  mockResolveClawWorkspaceProviderSelection: vi.fn(),
  mockScheduleMinimumDelayIdleTask: vi.fn((task: () => void) => {
    task();
    return () => undefined;
  }),
}));

export {
  mockInitAsterAgent,
  mockSubmitAgentRuntimeTurn,
  mockCreateAgentRuntimeSession,
  mockListAgentRuntimeSessions,
  mockGetAgentRuntimeSession,
  mockGetAgentRuntimeThreadRead,
  mockGenerateAgentRuntimeSessionTitle,
  mockUpdateAgentRuntimeSession,
  mockDeleteAgentRuntimeSession,
  mockCompactAgentRuntimeSession,
  mockInterruptAgentRuntimeTurn,
  mockResumeAgentRuntimeThread,
  mockReplayAgentRuntimeRequest,
  mockPromoteAgentRuntimeQueuedTurn,
  mockRemoveAgentRuntimeQueuedTurn,
  mockRespondAgentRuntimeAction,
  mockParseAgentEvent,
  mockSafeListen,
  mockToast,
  mockWechatChannelSetRuntimeModel,
  mockGetDefaultProvider,
  mockResolveClawWorkspaceProviderSelection,
  mockScheduleMinimumDelayIdleTask,
};

vi.mock("@/lib/api/agentRuntime", () => ({
  createAgentRuntimeClient: () => ({
    initAsterAgent: mockInitAsterAgent,
    submitAgentRuntimeTurn: mockSubmitAgentRuntimeTurn,
    createAgentRuntimeSession: mockCreateAgentRuntimeSession,
    listAgentRuntimeSessions: mockListAgentRuntimeSessions,
    getAgentRuntimeSession: mockGetAgentRuntimeSession,
    getAgentRuntimeThreadRead: mockGetAgentRuntimeThreadRead,
    generateAgentRuntimeSessionTitle: mockGenerateAgentRuntimeSessionTitle,
    updateAgentRuntimeSession: mockUpdateAgentRuntimeSession,
    deleteAgentRuntimeSession: mockDeleteAgentRuntimeSession,
    compactAgentRuntimeSession: mockCompactAgentRuntimeSession,
    interruptAgentRuntimeTurn: mockInterruptAgentRuntimeTurn,
    resumeAgentRuntimeThread: mockResumeAgentRuntimeThread,
    replayAgentRuntimeRequest: mockReplayAgentRuntimeRequest,
    promoteAgentRuntimeQueuedTurn: mockPromoteAgentRuntimeQueuedTurn,
    removeAgentRuntimeQueuedTurn: mockRemoveAgentRuntimeQueuedTurn,
    respondAgentRuntimeAction: mockRespondAgentRuntimeAction,
  }),
  initAsterAgent: mockInitAsterAgent,
  submitAgentRuntimeTurn: mockSubmitAgentRuntimeTurn,
  createAgentRuntimeSession: mockCreateAgentRuntimeSession,
  listAgentRuntimeSessions: mockListAgentRuntimeSessions,
  getAgentRuntimeSession: mockGetAgentRuntimeSession,
  getAgentRuntimeThreadRead: mockGetAgentRuntimeThreadRead,
  generateAgentRuntimeSessionTitle: mockGenerateAgentRuntimeSessionTitle,
  updateAgentRuntimeSession: mockUpdateAgentRuntimeSession,
  deleteAgentRuntimeSession: mockDeleteAgentRuntimeSession,
  compactAgentRuntimeSession: mockCompactAgentRuntimeSession,
  interruptAgentRuntimeTurn: mockInterruptAgentRuntimeTurn,
  resumeAgentRuntimeThread: mockResumeAgentRuntimeThread,
  replayAgentRuntimeRequest: mockReplayAgentRuntimeRequest,
  promoteAgentRuntimeQueuedTurn: mockPromoteAgentRuntimeQueuedTurn,
  removeAgentRuntimeQueuedTurn: mockRemoveAgentRuntimeQueuedTurn,
  respondAgentRuntimeAction: mockRespondAgentRuntimeAction,
}));

vi.mock("@/lib/api/agentProtocol", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api/agentProtocol")
  >("@/lib/api/agentProtocol");
  return {
    ...actual,
    parseAgentEvent: mockParseAgentEvent,
  };
});

vi.mock("@/lib/dev-bridge", () => ({
  safeListen: mockSafeListen,
  hasDevBridgeEventListenerCapability: vi.fn(() => false),
  isDevBridgeAvailable: vi.fn(() => false),
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

vi.mock("@/lib/api/channelsRuntime", () => ({
  wechatChannelSetRuntimeModel: mockWechatChannelSetRuntimeModel,
}));

vi.mock("@/lib/api/appConfig", () => ({
  getDefaultProvider: mockGetDefaultProvider,
}));

vi.mock("@/lib/desktop-runtime", () => ({
  getLegacyDesktopHostGlobal: vi.fn(() => null),
  hasDesktopHostEventCapability: vi.fn(() => true),
  hasDesktopHostEventListenerCapability: vi.fn(() => true),
  hasDesktopHostInvokeCapability: vi.fn(() => true),
  hasDesktopHostRuntimeMarkers: vi.fn(() => true),
}));

vi.mock("@/lib/utils/scheduleMinimumDelayIdleTask", () => ({
  scheduleMinimumDelayIdleTask: mockScheduleMinimumDelayIdleTask,
}));

vi.mock("../utils/clawWorkspaceProviderSelection", () => ({
  resolveClawWorkspaceProviderSelection:
    mockResolveClawWorkspaceProviderSelection,
}));

import { useAsterAgentChat } from "./useAsterAgentChat";
import { publishAgentRuntimeEvent } from "@/lib/api/agentRuntimeEvents";
import {
  clearAllAgentStreamTextOverlays,
  getAgentStreamTextOverlay as readAgentStreamTextOverlay,
} from "./agentStreamTextOverlayStore";

export interface HookHarness {
  getValue: () => ReturnType<typeof useAsterAgentChat>;
  getRenderCount: () => number;
  unmount: () => void;
}

export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

export function mountHook(
  workspaceId = "ws-test",
  currentOptions: {
    onWriteFile?: (
      content: string,
      fileName: string,
      context?: WriteArtifactContext,
    ) => void;
    getSyncedSessionRecentPreferences?: (
      sessionId: string,
    ) => ChatToolPreferences | null;
    initialTopicsLoadMode?: "immediate" | "deferred";
    initialTopicsDeferredDelayMs?: number;
    initialRuntimeWarmupLoadMode?: "immediate" | "deferred";
    initialRuntimeWarmupDeferredDelayMs?: number;
  } = {},
): HookHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let hookValue: ReturnType<typeof useAsterAgentChat> | null = null;
  let renderCount = 0;

  function TestComponent() {
    renderCount += 1;
    hookValue = useAsterAgentChat({
      workspaceId,
      onWriteFile: currentOptions.onWriteFile,
      getSyncedSessionRecentPreferences:
        currentOptions.getSyncedSessionRecentPreferences,
      initialTopicsLoadMode: currentOptions.initialTopicsLoadMode,
      initialTopicsDeferredDelayMs: currentOptions.initialTopicsDeferredDelayMs,
      initialRuntimeWarmupLoadMode: currentOptions.initialRuntimeWarmupLoadMode,
      initialRuntimeWarmupDeferredDelayMs:
        currentOptions.initialRuntimeWarmupDeferredDelayMs,
    });
    return null;
  }

  act(() => {
    root.render(<TestComponent />);
  });

  return {
    getValue: () => {
      if (!hookValue) {
        throw new Error("hook 尚未初始化");
      }
      return hookValue;
    },
    getRenderCount: () => renderCount,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

export async function flushRuntimeDetailRefresh() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 140));
  });
  await flushEffects();
}

export function captureTurnStream() {
  return captureRuntimeStream((eventName) => {
    return (
      typeof eventName === "string" && eventName.startsWith("aster_stream_")
    );
  });
}

export function captureContextCompactionStream() {
  return captureRuntimeStream((eventName) => {
    return (
      typeof eventName === "string" &&
      eventName.startsWith("agent_context_compaction_")
    );
  });
}

function captureRuntimeStream(matcher: (eventName: unknown) => boolean) {
  let streamHandler: ((event: { payload: unknown }) => void) | null = null;
  let activeEventName: string | null = null;

  mockSafeListen.mockImplementation(async (eventName, handler) => {
    if (matcher(eventName)) {
      streamHandler = handler as (event: { payload: unknown }) => void;
      activeEventName =
        typeof eventName === "string" ? eventName : String(eventName);
      return () => {
        if (streamHandler === handler) {
          streamHandler = null;
        }
        if (activeEventName === eventName) {
          activeEventName = null;
        }
      };
    }
    return () => {};
  });

  return {
    emit(payload: unknown) {
      const eventName = resolveCapturedRuntimeEventName({
        activeEventName,
        matcher,
      });
      if (eventName) {
        publishAgentRuntimeEvent(eventName, payload);
        return;
      }
      streamHandler?.({ payload });
    },
    emitBridge(payload: unknown) {
      streamHandler?.({ payload });
    },
    getEventName() {
      return resolveCapturedRuntimeEventName({
        activeEventName,
        matcher,
      });
    },
  };
}

function resolveCapturedRuntimeEventName({
  activeEventName,
  matcher,
}: {
  activeEventName: string | null;
  matcher: (eventName: unknown) => boolean;
}) {
  if (activeEventName && matcher(activeEventName)) {
    return activeEventName;
  }

  const runtimeCalls = [
    ...collectRuntimeEventNameCalls(mockSubmitAgentRuntimeTurn),
    ...collectRuntimeEventNameCalls(mockCompactAgentRuntimeSession),
  ].sort((left, right) => right.order - left.order);

  for (const call of runtimeCalls) {
    const eventName = readRuntimeEventNameFromCall(call.args);
    if (eventName && matcher(eventName)) {
      return eventName;
    }
  }

  return null;
}

function collectRuntimeEventNameCalls(mock: typeof mockSubmitAgentRuntimeTurn) {
  return mock.mock.calls.map((args, index) => ({
    args,
    order: mock.mock.invocationCallOrder[index] ?? index,
  }));
}

function readRuntimeEventNameFromCall(args: unknown[]) {
  const request = args[0];
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return null;
  }
  const eventName = (request as { event_name?: unknown; eventName?: unknown })
    .event_name;
  if (typeof eventName === "string" && eventName.trim()) {
    return eventName;
  }
  const camelEventName = (
    request as { event_name?: unknown; eventName?: unknown }
  ).eventName;
  return typeof camelEventName === "string" && camelEventName.trim()
    ? camelEventName
    : null;
}

export function seedSession(workspaceId: string, sessionId: string) {
  localStorage.setItem(
    `agent_session_workspace_${sessionId}`,
    JSON.stringify(workspaceId),
  );
  sessionStorage.setItem(
    `aster_curr_sessionId_${workspaceId}`,
    JSON.stringify(sessionId),
  );
  sessionStorage.setItem(
    `aster_messages_${workspaceId}`,
    JSON.stringify([
      {
        id: "m-1",
        role: "assistant",
        content: "hello",
        timestamp: new Date().toISOString(),
      },
    ]),
  );
}

export function seedSessionSnapshots(
  workspaceId: string,
  snapshots: Record<string, unknown>,
) {
  sessionStorage.setItem(
    `aster_session_snapshots_${workspaceId}`,
    JSON.stringify(snapshots),
  );
}

export function completedTurn(id = "turn-completed") {
  return {
    id,
    thread_id: "thread-completed",
    prompt_text: "",
    status: "completed" as const,
    started_at: "2026-06-12T00:00:00.000Z",
    completed_at: "2026-06-12T00:00:01.000Z",
    created_at: "2026-06-12T00:00:00.000Z",
    updated_at: "2026-06-12T00:00:01.000Z",
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  mockInitAsterAgent.mockReset();
  mockSubmitAgentRuntimeTurn.mockReset();
  mockCreateAgentRuntimeSession.mockReset();
  mockListAgentRuntimeSessions.mockReset();
  mockGetAgentRuntimeSession.mockReset();
  mockGetAgentRuntimeThreadRead.mockReset();
  mockGenerateAgentRuntimeSessionTitle.mockReset();
  mockUpdateAgentRuntimeSession.mockReset();
  mockDeleteAgentRuntimeSession.mockReset();
  mockCompactAgentRuntimeSession.mockReset();
  mockInterruptAgentRuntimeTurn.mockReset();
  mockResumeAgentRuntimeThread.mockReset();
  mockReplayAgentRuntimeRequest.mockReset();
  mockPromoteAgentRuntimeQueuedTurn.mockReset();
  mockRemoveAgentRuntimeQueuedTurn.mockReset();
  mockRespondAgentRuntimeAction.mockReset();
  mockParseAgentEvent.mockReset();
  mockSafeListen.mockReset();
  mockWechatChannelSetRuntimeModel.mockReset();
  mockGetDefaultProvider.mockReset();
  mockResolveClawWorkspaceProviderSelection.mockReset();
  mockScheduleMinimumDelayIdleTask.mockReset();
  mockScheduleMinimumDelayIdleTask.mockImplementation((task: () => void) => {
    task();
    return () => undefined;
  });
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockToast.info.mockReset();
  mockToast.warning.mockReset();
  localStorage.clear();
  sessionStorage.clear();

  mockInitAsterAgent.mockResolvedValue(undefined);
  mockSubmitAgentRuntimeTurn.mockResolvedValue(undefined);
  mockCreateAgentRuntimeSession.mockResolvedValue("created-session");
  mockListAgentRuntimeSessions.mockResolvedValue([]);
  mockGetAgentRuntimeSession.mockResolvedValue({
    id: "session-from-api",
    messages: [],
  });
  mockGetAgentRuntimeThreadRead.mockResolvedValue(undefined);
  mockGenerateAgentRuntimeSessionTitle.mockResolvedValue("");
  mockUpdateAgentRuntimeSession.mockResolvedValue(undefined);
  mockDeleteAgentRuntimeSession.mockResolvedValue(undefined);
  mockCompactAgentRuntimeSession.mockResolvedValue(undefined);
  mockInterruptAgentRuntimeTurn.mockResolvedValue(undefined);
  mockResumeAgentRuntimeThread.mockResolvedValue(false);
  mockReplayAgentRuntimeRequest.mockResolvedValue(null);
  mockPromoteAgentRuntimeQueuedTurn.mockResolvedValue(true);
  mockRemoveAgentRuntimeQueuedTurn.mockResolvedValue(true);
  mockRespondAgentRuntimeAction.mockResolvedValue(undefined);
  mockParseAgentEvent.mockImplementation((payload: unknown) => payload);
  mockSafeListen.mockResolvedValue(() => {});
  mockGetDefaultProvider.mockResolvedValue("openai");
  mockResolveClawWorkspaceProviderSelection.mockResolvedValue(null);
  clearAllAgentStreamTextOverlays();
});

afterEach(() => {
  clearAllAgentStreamTextOverlays();
  localStorage.clear();
  sessionStorage.clear();
});


export function getAgentStreamTextOverlay(
  messageId: string | null | undefined,
) {
  return readAgentStreamTextOverlay(messageId);
}
