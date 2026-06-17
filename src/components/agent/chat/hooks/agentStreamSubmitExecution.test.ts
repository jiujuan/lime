import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { activityLogger } from "@/lib/workspace/workbenchRuntime";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type {
  AsterSessionExecutionRuntime,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import type { ActionRequired, Message } from "../types";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type { StreamRequestState } from "./agentStreamSubmissionLifecycle";
import { executeAgentStreamSubmit } from "./agentStreamSubmitExecution";

const { setAgentRuntimeObjectiveMock } = vi.hoisted(() => ({
  setAgentRuntimeObjectiveMock: vi.fn(),
}));

vi.mock("@/lib/api/agentRuntime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/agentRuntime")>(
    "@/lib/api/agentRuntime",
  );
  return {
    ...actual,
    setAgentRuntimeObjective: setAgentRuntimeObjectiveMock,
  };
});

function noopDispatch<T>() {
  return vi.fn() as unknown as Dispatch<SetStateAction<T>>;
}

describe("agentStreamSubmitExecution", () => {
  afterEach(() => {
    activityLogger.clear();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("应串起 submit context、listener 绑定与 submitOp", async () => {
    const unlisten = vi.fn();
    const submitOp = vi.fn(async () => {});
    const ensureSession = vi.fn(async () => "session-1");
    const registerListener = vi.fn();
    const activateStream = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
      submitOp,
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await executeAgentStreamSubmit({
      runtime,
      ensureSession,
      attemptSilentTurnRecovery: async () => false,
      sessionIdRef: { current: null } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => "workspace-1",
      getSyncedSessionExecutionStrategy: () => "react",
      getSyncedSessionRecentPreferences: () => ({
        webSearch: true,
        thinking: true,
        task: false,
        subagent: true,
      }),
      effectiveAccessMode: "read-only",
      content: "继续生成提纲",
      images: [],
      skipUserMessage: false,
      expectingQueue: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      webSearch: true,
      thinking: true,
      skipSessionRestore: true,
      skipSessionStartHooks: true,
      skipPreSubmitResume: true,
      requestMetadata: {
        harness: {
          managed_objective: {
            objective_text: "持续推进真实 E2E 目标",
            source: "inputbar",
          },
          thread_goal: {
            enabled: true,
            set: {
              threadId: "draft-send-1",
              objective: "持续推进真实 E2E 目标",
            },
          },
        },
      },
      eventName: "event-1",
      requestTurnId: "turn-1",
      requestState,
      assistantMsgId: "assistant-1",
      pendingTurnKey: "pending-turn-1",
      pendingItemKey: "pending-item-1",
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream,
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnState: () => {},
        registerListener,
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
    });

    expect(registerListener).toHaveBeenCalledTimes(1);
    const registeredUnlisten = registerListener.mock.calls[0]?.[0];
    expect(registeredUnlisten).toEqual(expect.any(Function));
    registeredUnlisten?.();
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(submitOp).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "user_input",
        sessionId: "session-1",
        eventName: "event-1",
        workspaceId: "workspace-1",
        turnId: "turn-1",
        text: "继续生成提纲",
        skipPreSubmitResume: true,
        preferences: expect.objectContaining({
          approvalPolicy: "on-request",
          sandboxPolicy: "read-only",
        }),
      }),
    );
    expect(ensureSession).toHaveBeenCalledWith({
      skipSessionRestore: true,
      skipSessionStartHooks: true,
    });
    expect(setAgentRuntimeObjectiveMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      objectiveText: "持续推进真实 E2E 目标",
      successCriteria: [],
    });
    expect(activateStream).toHaveBeenCalled();
    expect(requestState.requestLogId).toBeTruthy();
  });

  it("追求目标写入失败不应阻断消息提交", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unlisten = vi.fn();
    const submitOp = vi.fn(async () => {});
    const ensureSession = vi.fn(async () => "session-1");
    const registerListener = vi.fn();
    const activateStream = vi.fn();
    setAgentRuntimeObjectiveMock.mockRejectedValueOnce(
      new Error("bridge timeout"),
    );
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
      submitOp,
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await executeAgentStreamSubmit({
      runtime,
      ensureSession,
      attemptSilentTurnRecovery: async () => false,
      sessionIdRef: { current: null } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => "workspace-1",
      getSyncedSessionExecutionStrategy: () => "react",
      getSyncedSessionRecentPreferences: () => ({
        webSearch: false,
        thinking: false,
        task: false,
        subagent: false,
      }),
      effectiveAccessMode: "read-only",
      content: "继续生成提纲",
      images: [],
      skipUserMessage: false,
      expectingQueue: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      webSearch: false,
      thinking: false,
      skipSessionRestore: true,
      skipSessionStartHooks: true,
      skipPreSubmitResume: true,
      requestMetadata: {
        harness: {
          managed_objective: {
            objective_text: "持续推进真实 E2E 目标",
            source: "inputbar",
          },
        },
      },
      eventName: "event-1",
      requestTurnId: "turn-1",
      requestState,
      assistantMsgId: "assistant-1",
      pendingTurnKey: "pending-turn-1",
      pendingItemKey: "pending-item-1",
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream,
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnState: () => {},
        registerListener,
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
    });

    expect(setAgentRuntimeObjectiveMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[AgentStream] 写入追求目标失败，继续发送消息:",
      expect.any(Error),
    );
    expect(submitOp).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "user_input",
        sessionId: "session-1",
      }),
    );
    expect(activateStream).toHaveBeenCalled();
  });
});
