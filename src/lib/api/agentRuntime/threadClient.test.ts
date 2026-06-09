import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  AppServerRpcError,
  type AppServerRequestResult,
} from "@/lib/api/appServer";
import { isAppServerBridgeAvailable } from "@/lib/api/appServerBridgeAvailability";
import { safeListen } from "@/lib/dev-bridge";
import { listenAgentRuntimeEvent } from "../agentRuntimeEvents";
import {
  appServerActionRespondParamsFromRequest,
  appServerTurnStartParamsFromRequest,
  createThreadClient,
  projectAppServerAgentEventPayload,
  type AgentRuntimeAppServerClient,
  type AgentRuntimeLifecycleClient,
} from "./threadClient";
import type { AgentRuntimeCommandInvoke } from "./transport";
import type {
  AgentRuntimeFileCheckpointDetail,
  AgentRuntimeFileCheckpointDiffResult,
  AgentRuntimeFileCheckpointListResult,
  AgentRuntimeFileCheckpointRestoreResult,
  AgentRuntimeFileCheckpointSummary,
  AgentRuntimeSubmitTurnRequest,
} from "./types";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
  safeListen: vi.fn(),
}));

vi.mock("@/lib/api/appServerBridgeAvailability", () => ({
  isAppServerBridgeAvailable: vi.fn(),
}));

function appServerClientMock(): AgentRuntimeAppServerClient {
  return {
    readSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
      },
      response: {
        id: 1,
        result: {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "agent-chat",
            status: "idle",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
          turns: [],
        },
      },
      messages: [],
      notifications: [],
    }),
    startTurn: vi.fn().mockResolvedValue({}),
    cancelTurn: vi.fn().mockResolvedValue({}),
    replayAction: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        action: {
          type: "action_required",
          requestId: "request-1",
          actionType: "ask_user",
          prompt: "请选择执行模式",
          scope: {
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
          },
        },
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    compactAgentSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
        compacted: true,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    resumeAgentSessionThread: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "running",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
        resumed: true,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    removeAgentSessionQueuedTurn: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
        queuedTurnId: "queued-1",
        removed: true,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    promoteAgentSessionQueuedTurn: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "running",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
        queuedTurnId: "queued-1",
        promoted: true,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    respondAction: vi.fn().mockResolvedValue({}),
    drainEvents: vi.fn().mockResolvedValue([]),
    listAgentSessionFileCheckpoints: vi.fn().mockResolvedValue({
      id: 1,
      result: appServerCheckpointList,
      response: { id: 1, result: appServerCheckpointList },
      messages: [],
      notifications: [],
    }),
    getAgentSessionFileCheckpoint: vi.fn().mockResolvedValue({
      id: 1,
      result: appServerCheckpointDetail,
      response: { id: 1, result: appServerCheckpointDetail },
      messages: [],
      notifications: [],
    }),
    diffAgentSessionFileCheckpoint: vi.fn().mockResolvedValue({
      id: 1,
      result: appServerCheckpointDiff,
      response: { id: 1, result: appServerCheckpointDiff },
      messages: [],
      notifications: [],
    }),
    restoreAgentSessionFileCheckpoint: vi.fn().mockResolvedValue({
      id: 1,
      result: appServerCheckpointRestore,
      response: { id: 1, result: appServerCheckpointRestore },
      messages: [],
      notifications: [],
    }),
  };
}

function standardRuntimeClientMock(): AgentRuntimeLifecycleClient {
  return {
    startTurn: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        turn: {
          turnId: "turn-1",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        },
      },
      messages: [],
      notifications: [],
    }),
    cancelTurn: vi.fn().mockResolvedValue({
      id: 2,
      result: {},
      response: { id: 2, result: {} },
      messages: [],
      notifications: [],
    }),
    respondAction: vi.fn().mockResolvedValue({
      id: 3,
      result: {},
      response: { id: 3, result: {} },
      messages: [],
      notifications: [],
    }),
    readThread: vi.fn().mockResolvedValue({
      id: 4,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
      },
      response: {
        id: 4,
        result: {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "agent-chat",
            status: "idle",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
          turns: [],
        },
      },
      messages: [],
      notifications: [],
    }),
  } as AgentRuntimeLifecycleClient;
}

const appServerCheckpointSummary = {
  checkpointId: "checkpoint-1",
  turnId: "turn-1",
  path: "src/App.tsx",
  source: "tool_result",
  updatedAt: "2026-06-06T00:00:00.000Z",
  validationIssueCount: 0,
};

const appServerCheckpointList = {
  sessionId: "session-1",
  threadId: "thread-1",
  checkpointCount: 1,
  checkpoints: [appServerCheckpointSummary],
};

const appServerCheckpointDetail = {
  sessionId: "session-1",
  threadId: "thread-1",
  checkpoint: appServerCheckpointSummary,
  livePath: "/workspace/src/App.tsx",
  snapshotPath: "/workspace/.lime/checkpoints/checkpoint-1/App.tsx",
  versionHistory: [],
  validationIssues: [],
  content: "export default function App() {}",
};

const appServerCheckpointDiff = {
  sessionId: "session-1",
  threadId: "thread-1",
  checkpoint: appServerCheckpointSummary,
  currentVersionId: "version-current",
  previousVersionId: "version-previous",
  diff: [],
};

const appServerCheckpointRestore = {
  sessionId: "session-1",
  threadId: "thread-1",
  checkpoint: appServerCheckpointSummary,
  livePath: "/workspace/src/App.tsx",
  snapshotPath: "/workspace/.lime/checkpoints/checkpoint-1/App.tsx",
  backupPath: null,
  restoredAt: "2026-06-06T00:01:00.000Z",
};

const checkpointSummary: AgentRuntimeFileCheckpointSummary = {
  checkpoint_id: "checkpoint-1",
  turn_id: "turn-1",
  path: "src/App.tsx",
  source: "tool_result",
  updated_at: "2026-06-06T00:00:00.000Z",
  validation_issue_count: 0,
};

const checkpointList: AgentRuntimeFileCheckpointListResult = {
  session_id: "session-1",
  thread_id: "thread-1",
  checkpoint_count: 1,
  checkpoints: [checkpointSummary],
};

const checkpointDetail: AgentRuntimeFileCheckpointDetail = {
  session_id: "session-1",
  thread_id: "thread-1",
  checkpoint: checkpointSummary,
  live_path: "/workspace/src/App.tsx",
  snapshot_path: "/workspace/.lime/checkpoints/checkpoint-1/App.tsx",
  version_history: [],
  validation_issues: [],
  content: "export default function App() {}",
};

const checkpointDiff: AgentRuntimeFileCheckpointDiffResult = {
  session_id: "session-1",
  thread_id: "thread-1",
  checkpoint: checkpointSummary,
  current_version_id: "version-current",
  previous_version_id: "version-previous",
  diff: [],
};

const checkpointRestore: AgentRuntimeFileCheckpointRestoreResult = {
  session_id: "session-1",
  thread_id: "thread-1",
  checkpoint: checkpointSummary,
  live_path: "/workspace/src/App.tsx",
  snapshot_path: "/workspace/.lime/checkpoints/checkpoint-1/App.tsx",
  backup_path: null,
  restored_at: "2026-06-06T00:01:00.000Z",
};

function malformedAppServerResult<T>(
  result: unknown,
): AppServerRequestResult<T> {
  return {
    id: 1,
    result: result as T,
    response: {
      id: 1,
      result: result as T,
    },
    messages: [],
    notifications: [],
  };
}

describe("agentRuntime threadClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAppServerBridgeAvailable).mockReturnValue(false);
    vi.mocked(safeListen).mockResolvedValue(vi.fn());
  });

  it("replay request 应走 App Server current action/replay 且不调用 legacy command gateway", async () => {
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const appServerClient = appServerClientMock();
    const client = createThreadClient({
      appServerClient,
      invokeCommand,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.replayAgentRuntimeRequest({
        session_id: "session-1",
        request_id: "request-1",
      }),
    ).resolves.toMatchObject({
      type: "action_required",
      request_id: "request-1",
      action_type: "ask_user",
      prompt: "请选择执行模式",
      scope: {
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
      },
    });
    expect(appServerClient.replayAction).toHaveBeenCalledWith({
      sessionId: "session-1",
      requestId: "request-1",
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("queue/session control 应走 App Server current methods 且不调用 legacy command gateway", async () => {
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const appServerClient = appServerClientMock();
    const client = createThreadClient({
      appServerClient,
      invokeCommand,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.compactAgentRuntimeSession({
        session_id: "session-1",
        event_name: "agentSession/event/session-1",
      }),
    ).resolves.toBeUndefined();
    await expect(
      client.resumeAgentRuntimeThread({ session_id: "session-1" }),
    ).resolves.toBe(true);
    await expect(
      client.removeAgentRuntimeQueuedTurn({
        session_id: "session-1",
        queued_turn_id: "queued-1",
      }),
    ).resolves.toBe(true);
    await expect(
      client.promoteAgentRuntimeQueuedTurn({
        session_id: "session-1",
        queued_turn_id: "queued-1",
      }),
    ).resolves.toBe(true);

    expect(appServerClient.compactAgentSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      eventName: "agentSession/event/session-1",
    });
    expect(appServerClient.resumeAgentSessionThread).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(appServerClient.removeAgentSessionQueuedTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      queuedTurnId: "queued-1",
    });
    expect(appServerClient.promoteAgentSessionQueuedTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      queuedTurnId: "queued-1",
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("replay current 收到假成功或缺字段结果时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.replayAction).mockResolvedValueOnce(
      malformedAppServerResult({
        action: {
          type: "action_required",
          actionType: "tool_confirmation",
        },
      }),
    );
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createThreadClient({
      appServerClient,
      invokeCommand,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.replayAgentRuntimeRequest({
        session_id: "session-1",
        request_id: "request-1",
      }),
    ).rejects.toThrow(
      "agentSession/action/replay did not return replayed action view",
    );
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("file checkpoint 应走 App Server current methods，不复用 legacy command gateway", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createThreadClient({
      appServerClient,
      invokeCommand,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.listAgentRuntimeFileCheckpoints({
        session_id: "session-1",
      }),
    ).resolves.toEqual(checkpointList);
    await expect(
      client.getAgentRuntimeFileCheckpoint({
        session_id: "session-1",
        checkpoint_id: "checkpoint-1",
      }),
    ).resolves.toEqual(checkpointDetail);
    await expect(
      client.diffAgentRuntimeFileCheckpoint({
        session_id: "session-1",
        checkpoint_id: "checkpoint-1",
      }),
    ).resolves.toEqual(checkpointDiff);
    await expect(
      client.restoreAgentRuntimeFileCheckpoint({
        session_id: "session-1",
        checkpoint_id: "checkpoint-1",
        confirm_restore: true,
      }),
    ).resolves.toEqual(checkpointRestore);

    expect(appServerClient.listAgentSessionFileCheckpoints).toHaveBeenCalledWith(
      {
        sessionId: "session-1",
      },
    );
    expect(appServerClient.getAgentSessionFileCheckpoint).toHaveBeenCalledWith({
      sessionId: "session-1",
      checkpointId: "checkpoint-1",
    });
    expect(appServerClient.diffAgentSessionFileCheckpoint).toHaveBeenCalledWith({
      sessionId: "session-1",
      checkpointId: "checkpoint-1",
    });
    expect(
      appServerClient.restoreAgentSessionFileCheckpoint,
    ).toHaveBeenCalledWith({
      sessionId: "session-1",
      checkpointId: "checkpoint-1",
      confirmRestore: true,
      createBackup: undefined,
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("file checkpoint App Server current 收到假成功或缺字段结果时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(
      appServerClient.listAgentSessionFileCheckpoints,
    ).mockResolvedValueOnce(
      malformedAppServerResult({
        ...appServerCheckpointList,
        checkpoints: [
          { ...appServerCheckpointSummary, validationIssueCount: "0" },
        ],
      }),
    );
    vi.mocked(
      appServerClient.getAgentSessionFileCheckpoint,
    ).mockResolvedValueOnce(
      malformedAppServerResult({
        ...appServerCheckpointDetail,
        checkpoint: { ...appServerCheckpointSummary, checkpointId: "" },
      }),
    );
    vi.mocked(
      appServerClient.diffAgentSessionFileCheckpoint,
    ).mockResolvedValueOnce(
      malformedAppServerResult({
        ...appServerCheckpointDiff,
        threadId: "",
      }),
    );
    vi.mocked(
      appServerClient.restoreAgentSessionFileCheckpoint,
    ).mockResolvedValueOnce(
      malformedAppServerResult({
        ...appServerCheckpointRestore,
        restoredAt: null,
      }),
    );
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createThreadClient({
      appServerClient,
      invokeCommand,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.listAgentRuntimeFileCheckpoints({ session_id: "session-1" }),
    ).rejects.toThrow(
      "agentSession/fileCheckpoint/list did not return file checkpoint list",
    );
    await expect(
      client.getAgentRuntimeFileCheckpoint({
        session_id: "session-1",
        checkpoint_id: "checkpoint-1",
      }),
    ).rejects.toThrow(
      "agentSession/fileCheckpoint/get did not return file checkpoint detail",
    );
    await expect(
      client.diffAgentRuntimeFileCheckpoint({
        session_id: "session-1",
        checkpoint_id: "checkpoint-1",
      }),
    ).rejects.toThrow(
      "agentSession/fileCheckpoint/diff did not return file checkpoint diff",
    );
    await expect(
      client.restoreAgentRuntimeFileCheckpoint({
        session_id: "session-1",
        checkpoint_id: "checkpoint-1",
        confirm_restore: true,
      }),
    ).rejects.toThrow(
      "agentSession/fileCheckpoint/restore did not return file checkpoint restore result",
    );
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("App Server 可用时 submit 应进入 agentSession/turn/start", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createThreadClient({
      appServerClient,
      invokeCommand,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await client.submitAgentRuntimeTurn({
      message: "生成草稿",
      session_id: "session-1",
      event_name: "agentSession/event/session-1",
      workspace_id: "workspace-1",
      turn_id: "turn-1",
      images: [{ data: "data:image/png;base64,abc", media_type: "image/png" }],
      turn_config: {
        provider_preference: "deepseek",
        model_preference: "deepseek-v4-flash",
        metadata: { source: "chat" },
      },
      queue_if_busy: true,
      queued_turn_id: "queued-1",
      skip_pre_submit_resume: true,
    });

    expect(appServerClient.startTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      turnId: "turn-1",
      input: {
        text: "生成草稿",
        attachments: [
          {
            kind: "image",
            uri: "data:image/png;base64,abc",
            metadata: {
              mediaType: "image/png",
              index: 0,
            },
          },
        ],
      },
      runtimeOptions: {
        stream: true,
        eventName: "agentSession/event/session-1",
        providerPreference: "deepseek",
        modelPreference: "deepseek-v4-flash",
        metadata: { source: "chat" },
        queuedTurnId: "queued-1",
        hostOptions: {
          asterChatRequest: {
            message: "生成草稿",
            session_id: "session-1",
            event_name: "agentSession/event/session-1",
            images: [
              {
                data: "data:image/png;base64,abc",
                media_type: "image/png",
              },
            ],
            provider_preference: "deepseek",
            model_preference: "deepseek-v4-flash",
            workspace_id: "workspace-1",
            metadata: { source: "chat" },
            turn_id: "turn-1",
            queue_if_busy: true,
            queued_turn_id: "queued-1",
          },
        },
      },
      queueIfBusy: true,
      skipPreSubmitResume: true,
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("turn lifecycle 注入标准 runtime client 后应委托 facade，不直接调用 renderer App Server lifecycle", async () => {
    const appServerClient = appServerClientMock();
    const standardRuntimeClient = standardRuntimeClientMock();
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createThreadClient({
      appServerClient,
      standardRuntimeClient,
      invokeCommand,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.submitAgentRuntimeTurn({
        message: "生成草稿",
        session_id: "session-1",
        event_name: "agentSession/event/session-1",
        turn_id: "turn-1",
      }),
    ).resolves.toBeUndefined();
    await expect(
      client.interruptAgentRuntimeTurn({
        session_id: "session-1",
        turn_id: "turn-1",
      }),
    ).resolves.toBe(true);
    await expect(
      client.respondAgentRuntimeAction({
        session_id: "session-1",
        request_id: "request-1",
        action_type: "ask_user",
        confirmed: true,
      }),
    ).resolves.toBeUndefined();
    await expect(client.getAgentRuntimeThreadRead(" session-1 ")).resolves.toEqual(
      expect.objectContaining({
        thread_id: "thread-1",
        status: "idle",
      }),
    );

    expect(standardRuntimeClient.startTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      turnId: "turn-1",
      input: {
        text: "生成草稿",
      },
      runtimeOptions: {
        stream: true,
        eventName: "agentSession/event/session-1",
        hostOptions: {
          asterChatRequest: {
            message: "生成草稿",
            session_id: "session-1",
            event_name: "agentSession/event/session-1",
            workspace_id: "",
            turn_id: "turn-1",
          },
        },
      },
    });
    expect(standardRuntimeClient.cancelTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      turnId: "turn-1",
    });
    expect(standardRuntimeClient.respondAction).toHaveBeenCalledWith({
      sessionId: "session-1",
      requestId: "request-1",
      actionType: "ask_user",
      confirmed: true,
    });
    expect(standardRuntimeClient.readThread).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(appServerClient.startTurn).not.toHaveBeenCalled();
    expect(appServerClient.cancelTurn).not.toHaveBeenCalled();
    expect(appServerClient.respondAction).not.toHaveBeenCalled();
    expect(appServerClient.readSession).not.toHaveBeenCalled();
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("浏览器 DevBridge 可用时 submit 应允许进入 App Server JSON-RPC", async () => {
    vi.mocked(isAppServerBridgeAvailable).mockReturnValue(true);
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createThreadClient({
      appServerClient,
      invokeCommand,
    });

    await client.submitAgentRuntimeTurn({
      message: "整理新闻",
      session_id: "session-1",
      event_name: "event-1",
    });

    expect(appServerClient.startTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      input: {
        text: "整理新闻",
      },
      runtimeOptions: {
        stream: true,
        eventName: "event-1",
        hostOptions: {
          asterChatRequest: {
            message: "整理新闻",
            session_id: "session-1",
            event_name: "event-1",
            workspace_id: "",
          },
        },
      },
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("App Server submit 应通过 hostOptions 无损携带 Claw/Aster 原始请求快照", () => {
    const request: AgentRuntimeSubmitTurnRequest = {
      message: "继续执行完整 Claw 链路",
      session_id: "session-claw",
      event_name: "aster_stream_claw",
      workspace_id: "workspace-claw",
      turn_id: "turn-claw",
      images: [
        {
          data: "data:image/png;base64,claw",
          media_type: "image/png",
        },
      ],
      turn_config: {
        provider_config: {
          provider_id: "deepseek",
          provider_name: "deepseek",
          model_name: "deepseek-v4-pro",
        },
        provider_preference: "deepseek",
        model_preference: "deepseek-v4-pro",
        reasoning_effort: "high",
        thinking_enabled: true,
        approval_policy: "on-request",
        sandbox_policy: "workspace-write",
        execution_strategy: "react",
        web_search: true,
        search_mode: "required",
        auto_continue: {
          enabled: true,
          fast_mode_enabled: false,
          continuation_length: 2,
          sensitivity: 0.5,
        },
        system_prompt: "保留 Claw 原始系统提示",
        metadata: {
          harness: {
            source: "claw",
            workspace_skill_runtime_enable: {
              source: "manual_session_enable",
            },
          },
        },
      },
      queue_if_busy: true,
      queued_turn_id: "queued-claw",
      skip_pre_submit_resume: true,
    } satisfies AgentRuntimeSubmitTurnRequest;
    const turnConfig = request.turn_config;
    if (!turnConfig) {
      throw new Error("turn_config should be defined for Claw requests");
    }

    expect(appServerTurnStartParamsFromRequest(request)).toEqual({
      sessionId: "session-claw",
      turnId: "turn-claw",
      input: {
        text: "继续执行完整 Claw 链路",
        attachments: [
          {
            kind: "image",
            uri: "data:image/png;base64,claw",
            metadata: {
              mediaType: "image/png",
              index: 0,
            },
          },
        ],
      },
      runtimeOptions: {
        stream: true,
        eventName: "aster_stream_claw",
        providerPreference: "deepseek",
        modelPreference: "deepseek-v4-pro",
        metadata: turnConfig.metadata,
        queuedTurnId: "queued-claw",
        hostOptions: {
          asterChatRequest: {
            message: "继续执行完整 Claw 链路",
            session_id: "session-claw",
            event_name: "aster_stream_claw",
            images: [
              {
                data: "data:image/png;base64,claw",
                media_type: "image/png",
              },
            ],
            provider_config: {
              provider_id: "deepseek",
              provider_name: "deepseek",
              model_name: "deepseek-v4-pro",
            },
            provider_preference: "deepseek",
            model_preference: "deepseek-v4-pro",
            reasoning_effort: "high",
            thinking_enabled: true,
            approval_policy: "on-request",
            sandbox_policy: "workspace-write",
            workspace_id: "workspace-claw",
            web_search: true,
            search_mode: "required",
            execution_strategy: "react",
            auto_continue: {
              enabled: true,
              fast_mode_enabled: false,
              continuation_length: 2,
              sensitivity: 0.5,
            },
            system_prompt: "保留 Claw 原始系统提示",
            metadata: {
              harness: {
                source: "claw",
                workspace_skill_runtime_enable: {
                  source: "manual_session_enable",
                },
              },
            },
            turn_id: "turn-claw",
            queue_if_busy: true,
            queued_turn_id: "queued-claw",
          },
        },
      },
      queueIfBusy: true,
      skipPreSubmitResume: true,
    });
  });

  it("App Server submit 返回 notification 时应投递到请求里的前端 stream event", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.startTurn).mockResolvedValueOnce({
      id: 1,
      result: {
        turn: {
          turnId: "turn-1",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        },
      },
      messages: [],
      notifications: [
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-1",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "message.delta",
              timestamp: "2026-06-06T00:00:00.000Z",
              payload: {
                text: "第一段",
              },
            },
          },
        },
      ],
    });
    const client = createThreadClient({
      appServerClient,
      invokeCommand: vi.fn() as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    const listener = vi.fn();
    const unlisten = await listenAgentRuntimeEvent(
      "aster_stream_message-1",
      listener,
    );

    await client.submitAgentRuntimeTurn({
      message: "生成草稿",
      session_id: "session-1",
      event_name: "aster_stream_message-1",
    });

    expect(listener).toHaveBeenCalledWith({
      payload: {
        type: "text_delta",
        text: "第一段",
        event_id: "evt-1",
        sequence: 1,
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        timestamp: "2026-06-06T00:00:00.000Z",
      },
    });
    unlisten();
  });

  it("App Server submit 响应缺少 turn 时应使用请求 turn_id 注册事件路由", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.startTurn).mockResolvedValueOnce({
      ...malformedAppServerResult({}),
      notifications: [
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-routing",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-request",
              type: "runtime.status",
              timestamp: "2026-06-06T00:00:00.000Z",
              payload: {
                status: {
                  phase: "routing",
                  title: "正在路由",
                  detail: "已进入 App Server",
                },
              },
            },
          },
        },
      ],
    });
    const client = createThreadClient({
      appServerClient,
      invokeCommand: vi.fn() as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
      enableAppServerEventDrain: true,
    });

    const listener = vi.fn();
    const unlisten = await listenAgentRuntimeEvent(
      "aster_stream_missing-turn",
      listener,
    );

    await client.submitAgentRuntimeTurn({
      message: "生成草稿",
      session_id: "session-1",
      turn_id: "turn-request",
      event_name: "aster_stream_missing-turn",
    });

    expect(listener).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        type: "runtime_status",
        event_id: "evt-routing",
        session_id: "session-1",
        turn_id: "turn-request",
      }),
    });
    unlisten();
  });

  it("App Server 异步 agentSession/event drain 应投递到当前前端 stream event", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.startTurn).mockResolvedValueOnce({
      id: 1,
      result: {
        turn: {
          turnId: "turn-1",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        },
      },
      messages: [],
      notifications: [],
    });
    vi.mocked(appServerClient.drainEvents).mockResolvedValueOnce([
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-drain-1",
            sequence: 2,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "message.delta",
            timestamp: "2026-06-06T00:00:01.000Z",
            payload: {
              text: "异步段落",
            },
          },
        },
      },
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-drain-2",
            sequence: 3,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "turn.done",
            timestamp: "2026-06-06T00:00:02.000Z",
            payload: {},
          },
        },
      },
    ]);
    const client = createThreadClient({
      appServerClient,
      invokeCommand: vi.fn() as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
      enableAppServerEventDrain: true,
    });

    const listener = vi.fn();
    const unlisten = await listenAgentRuntimeEvent(
      "aster_stream_message-drain",
      listener,
    );

    await client.submitAgentRuntimeTurn({
      message: "生成草稿",
      session_id: "session-1",
      event_name: "aster_stream_message-drain",
    });

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "text_delta",
          text: "异步段落",
          event_id: "evt-drain-1",
          session_id: "session-1",
          turn_id: "turn-1",
        }),
      });
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "done",
          event_id: "evt-drain-2",
          session_id: "session-1",
          turn_id: "turn-1",
        }),
      });
    });

    expect(appServerClient.drainEvents).toHaveBeenCalledWith(50);
    unlisten();
  });

  it("App Server turn/start pending 时也应提前注册 drain 路由并投递首个增量", async () => {
    const appServerClient = appServerClientMock();
    let resolveStartTurn:
      | ((
          value: Awaited<ReturnType<AgentRuntimeAppServerClient["startTurn"]>>,
        ) => void)
      | undefined;
    vi.mocked(appServerClient.startTurn).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStartTurn = resolve;
      }),
    );
    vi.mocked(appServerClient.drainEvents).mockResolvedValueOnce([
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-pending-delta",
            sequence: 1,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-pending",
            type: "message.delta",
            timestamp: "2026-06-06T00:00:00.000Z",
            payload: {
              text: "提前增量",
            },
          },
        },
      },
    ]);
    const client = createThreadClient({
      appServerClient,
      invokeCommand: vi.fn() as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
      enableAppServerEventDrain: true,
    });

    const listener = vi.fn();
    const unlisten = await listenAgentRuntimeEvent(
      "aster_stream_pending",
      listener,
    );
    const submitPromise = client.submitAgentRuntimeTurn({
      message: "生成草稿",
      session_id: "session-1",
      turn_id: "turn-pending",
      event_name: "aster_stream_pending",
    });

    await vi.waitFor(() => {
      expect(appServerClient.drainEvents).toHaveBeenCalledWith(50);
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "text_delta",
          text: "提前增量",
          event_id: "evt-pending-delta",
          session_id: "session-1",
          turn_id: "turn-pending",
        }),
      });
    });

    resolveStartTurn?.({
      id: 1,
      result: {
        turn: {
          turnId: "turn-pending",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-pending",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        },
      },
      messages: [],
      notifications: [
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-pending-delta",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-pending",
              type: "message.delta",
              timestamp: "2026-06-06T00:00:00.000Z",
              payload: {
                text: "提前增量",
              },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-pending-done",
              sequence: 2,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-pending",
              type: "turn.final_done",
              timestamp: "2026-06-06T00:00:01.000Z",
              payload: {},
            },
          },
        },
      ],
    });
    await submitPromise;
    expect(
      listener.mock.calls.filter(
        ([event]) => event?.payload?.event_id === "evt-pending-delta",
      ),
    ).toHaveLength(1);

    unlisten();
  });

  it("App Server drain 收到 turn.completed 后应关闭路由，后续事件不应再投递", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.startTurn).mockResolvedValueOnce({
      id: 1,
      result: {
        turn: {
          turnId: "turn-1",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        },
      },
      messages: [],
      notifications: [],
    });
    vi.mocked(appServerClient.drainEvents).mockResolvedValueOnce([
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-drain-completed",
            sequence: 2,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "turn.completed",
            timestamp: "2026-06-06T00:00:01.000Z",
            payload: {},
          },
        },
      },
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-drain-delta-after-completed",
            sequence: 3,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "message.delta",
            timestamp: "2026-06-06T00:00:02.000Z",
            payload: {
              text: "不应投递",
            },
          },
        },
      },
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-drain-final-done",
            sequence: 4,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "turn.final_done",
            timestamp: "2026-06-06T00:00:03.000Z",
            payload: {},
          },
        },
      },
    ]);
    const client = createThreadClient({
      appServerClient,
      invokeCommand: vi.fn() as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
      enableAppServerEventDrain: true,
    });

    const listener = vi.fn();
    const unlisten = await listenAgentRuntimeEvent(
      "aster_stream_message-drain-completed",
      listener,
    );

    await client.submitAgentRuntimeTurn({
      message: "生成草稿",
      session_id: "session-1",
      event_name: "aster_stream_message-drain-completed",
    });

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "turn_completed",
          event_id: "evt-drain-completed",
          session_id: "session-1",
          turn_id: "turn-1",
        }),
      });
    });

    expect(listener).not.toHaveBeenCalledWith({
      payload: expect.objectContaining({
        event_id: "evt-drain-delta-after-completed",
      }),
    });
    expect(listener).not.toHaveBeenCalledWith({
      payload: expect.objectContaining({
        event_id: "evt-drain-final-done",
      }),
    });
    expect(appServerClient.drainEvents).toHaveBeenCalledTimes(1);
    unlisten();
  });

  it("App Server submit error 前的 notification 应先投递到当前前端 stream event", async () => {
    const appServerClient = appServerClientMock();
    const notifications = [
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-error-delta",
            sequence: 1,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "message.delta",
            timestamp: "2026-06-06T00:00:01.000Z",
            payload: {
              text: "部分输出",
            },
          },
        },
      },
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-error-failed",
            sequence: 2,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "turn.failed",
            timestamp: "2026-06-06T00:00:02.000Z",
            payload: {
              message: "external backend crashed after partial output",
            },
          },
        },
      },
    ];
    const response = {
      id: 1,
      error: {
        code: -32000,
        message: "external backend crashed after partial output",
      },
    };
    vi.mocked(appServerClient.startTurn).mockRejectedValueOnce(
      new AppServerRpcError(response, notifications, [
        ...notifications,
        response,
      ]),
    );
    const client = createThreadClient({
      appServerClient,
      invokeCommand: vi.fn() as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    const listener = vi.fn();
    const unlisten = await listenAgentRuntimeEvent(
      "aster_stream_message-error",
      listener,
    );

    await expect(
      client.submitAgentRuntimeTurn({
        message: "生成草稿",
        session_id: "session-1",
        turn_id: "turn-1",
        event_name: "aster_stream_message-error",
      }),
    ).rejects.toThrow("external backend crashed after partial output");

    expect(listener).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        type: "text_delta",
        text: "部分输出",
        event_id: "evt-error-delta",
        session_id: "session-1",
        turn_id: "turn-1",
      }),
    });
    expect(listener).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        type: "error",
        message: "external backend crashed after partial output",
        event_id: "evt-error-failed",
        session_id: "session-1",
        turn_id: "turn-1",
      }),
    });
    unlisten();
  });

  it("App Server 不可用时 submit 应 fail closed，不回退 legacy command", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn().mockResolvedValue(undefined);
    const client = createThreadClient({
      appServerClient,
      invokeCommand: invokeCommand as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => false,
    });
    const request = {
      message: "继续",
      session_id: "session-1",
      event_name: "event-1",
      workspace_id: "workspace-1",
    };

    await expect(client.submitAgentRuntimeTurn(request)).rejects.toThrow(
      "App Server turn lifecycle is unavailable",
    );

    expect(invokeCommand).not.toHaveBeenCalled();
    expect(appServerClient.startTurn).not.toHaveBeenCalled();
  });

  it("App Server 可用且 turn_id 存在时 interrupt 应进入 agentSession/turn/cancel", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createThreadClient({
      appServerClient,
      invokeCommand,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.interruptAgentRuntimeTurn({
        session_id: "session-1",
        turn_id: "turn-1",
      }),
    ).resolves.toBe(true);

    expect(appServerClient.cancelTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      turnId: "turn-1",
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("App Server cancel response notification 应发布到当前 stream event", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.cancelTurn).mockResolvedValueOnce({
      id: 12,
      result: {},
      response: {
        id: 12,
        result: {},
      },
      messages: [],
      notifications: [
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-canceled",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "turn.canceled",
              timestamp: "2026-06-06T00:00:01.000Z",
              payload: {
                reason: "user_cancelled",
              },
            },
          },
        },
      ],
    });
    const client = createThreadClient({
      appServerClient,
      invokeCommand: vi.fn() as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });
    const listener = vi.fn();
    const unlisten = await listenAgentRuntimeEvent(
      "aster_stream_cancel",
      listener,
    );

    await expect(
      client.interruptAgentRuntimeTurn({
        session_id: "session-1",
        turn_id: "turn-1",
        event_name: "aster_stream_cancel",
      }),
    ).resolves.toBe(true);

    expect(listener).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        type: "turn_completed",
        message: "user_cancelled",
        event_id: "evt-canceled",
        session_id: "session-1",
        turn_id: "turn-1",
        turn: expect.objectContaining({
          id: "turn-1",
          status: "canceled",
          error_message: "user_cancelled",
        }),
      }),
    });
    unlisten();
  });

  it("App Server 不可用时 interrupt 应 fail closed，不回退 legacy command", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn().mockResolvedValue(true);
    const client = createThreadClient({
      appServerClient,
      invokeCommand: invokeCommand as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => false,
    });
    const request = { session_id: "session-1", turn_id: "turn-1" };

    await expect(client.interruptAgentRuntimeTurn(request)).rejects.toThrow(
      "App Server turn lifecycle is unavailable",
    );

    expect(invokeCommand).not.toHaveBeenCalled();
    expect(appServerClient.cancelTurn).not.toHaveBeenCalled();
  });

  it("缺少 turn_id 时 interrupt 应 fail closed，不回退 legacy command", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn().mockResolvedValue(true);
    const client = createThreadClient({
      appServerClient,
      invokeCommand: invokeCommand as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });
    const request = { session_id: "session-1" };

    await expect(client.interruptAgentRuntimeTurn(request)).rejects.toThrow(
      "turn_id is required to cancel App Server turn",
    );

    expect(invokeCommand).not.toHaveBeenCalled();
    expect(appServerClient.cancelTurn).not.toHaveBeenCalled();
  });

  it("App Server 可用时 respond action 应进入 agentSession/action/respond", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createThreadClient({
      appServerClient,
      invokeCommand,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await client.respondAgentRuntimeAction({
      session_id: "session-1",
      request_id: "req-1",
      action_type: "ask_user",
      confirmed: true,
      response: '{"answer":"继续"}',
      user_data: { answer: "继续" },
      metadata: { source: "inline-action" },
      event_name: "agentSession/event/session-1",
      action_scope: {
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
      },
    });

    expect(appServerClient.respondAction).toHaveBeenCalledWith({
      sessionId: "session-1",
      requestId: "req-1",
      actionType: "ask_user",
      confirmed: true,
      response: '{"answer":"继续"}',
      userData: { answer: "继续" },
      metadata: { source: "inline-action" },
      eventName: "agentSession/event/session-1",
      actionScope: {
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
      },
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("App Server 可用时 thread read 应进入 agentSession/read 并投影 read model", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.readSession).mockResolvedValueOnce({
      id: 3,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          workspaceId: "workspace-1",
          status: "waitingAction",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:03.000Z",
        },
        turns: [
          {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "running",
          },
        ],
        detail: {
          thread_read: {
            thread_id: "thread-1",
            status: "blocked",
            pending_requests: [
              {
                id: "request-1",
                thread_id: "thread-1",
                turn_id: "turn-1",
                request_type: "ask_user",
                status: "pending",
              },
            ],
          },
        },
      },
      response: {
        id: 3,
        result: {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "agent-chat",
            workspaceId: "workspace-1",
            status: "waitingAction",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:03.000Z",
          },
          turns: [
            {
              turnId: "turn-1",
              sessionId: "session-1",
              threadId: "thread-1",
              status: "running",
            },
          ],
          detail: {
            thread_read: {
              thread_id: "thread-1",
              status: "blocked",
              pending_requests: [
                {
                  id: "request-1",
                  thread_id: "thread-1",
                  turn_id: "turn-1",
                  request_type: "ask_user",
                  status: "pending",
                },
              ],
            },
          },
        },
      },
      messages: [],
      notifications: [],
    });
    const invokeCommand = vi.fn().mockResolvedValue({});
    const client = createThreadClient({
      appServerClient,
      invokeCommand: invokeCommand as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.getAgentRuntimeThreadRead("session-1"),
    ).resolves.toEqual(
      expect.objectContaining({
        thread_id: "thread-1",
        status: "blocked",
        profile_status: "blocked",
        active_turn_id: "turn-1",
        pending_requests: [
          expect.objectContaining({
            id: "request-1",
            request_type: "ask_user",
            status: "pending",
          }),
        ],
      }),
    );

    expect(appServerClient.readSession).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("App Server 不可用时 thread read 应 fail closed，不回退 legacy command", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn().mockResolvedValue({});
    const client = createThreadClient({
      appServerClient,
      invokeCommand: invokeCommand as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => false,
    });

    await expect(client.getAgentRuntimeThreadRead("session-1")).rejects.toThrow(
      "App Server turn lifecycle is unavailable",
    );

    expect(appServerClient.readSession).not.toHaveBeenCalled();
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("App Server 不可用时 respond action 应 fail closed，不回退 legacy command", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn().mockResolvedValue(undefined);
    const client = createThreadClient({
      appServerClient,
      invokeCommand: invokeCommand as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => false,
    });

    await expect(
      client.respondAgentRuntimeAction({
        session_id: "session-1",
        request_id: "req-1",
        action_type: "ask_user",
        confirmed: true,
      }),
    ).rejects.toThrow("App Server turn lifecycle is unavailable");

    expect(invokeCommand).not.toHaveBeenCalled();
    expect(appServerClient.respondAction).not.toHaveBeenCalled();
  });

  it("App Server respond action 返回 notification 时应继续投递到来源 stream event", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.respondAction).mockResolvedValueOnce({
      id: 2,
      result: {},
      response: {
        id: 2,
        result: {},
      },
      messages: [],
      notifications: [
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-action-1",
              sequence: 2,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "action.resolved",
              timestamp: "2026-06-06T00:00:01.000Z",
              payload: {
                requestId: "req-1",
                actionType: "ask_user",
                approved: true,
              },
            },
          },
        },
      ],
    });
    const client = createThreadClient({
      appServerClient,
      invokeCommand: vi.fn() as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    const listener = vi.fn();
    const unlisten = await listenAgentRuntimeEvent(
      "aster_stream_message-1",
      listener,
    );

    await client.respondAgentRuntimeAction({
      session_id: "session-1",
      request_id: "req-1",
      action_type: "ask_user",
      confirmed: true,
      event_name: "aster_stream_message-1",
    });

    expect(listener).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        type: "action_resolved",
        request_id: "req-1",
        action_type: "ask_user",
        approved: true,
        event_id: "evt-action-1",
        sequence: 2,
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        timestamp: "2026-06-06T00:00:01.000Z",
      }),
    });
    unlisten();
  });

  it("request projection 应在未传可选项时保持精简 App Server 参数", () => {
    expect(
      appServerTurnStartParamsFromRequest({
        message: "继续",
        session_id: "session-1",
        event_name: "agentSession/event/session-1",
      }),
    ).toEqual({
      sessionId: "session-1",
      input: {
        text: "继续",
      },
      runtimeOptions: {
        stream: true,
        eventName: "agentSession/event/session-1",
        hostOptions: {
          asterChatRequest: {
            message: "继续",
            session_id: "session-1",
            event_name: "agentSession/event/session-1",
            workspace_id: "",
          },
        },
      },
    });

    expect(
      appServerActionRespondParamsFromRequest({
        session_id: "session-1",
        request_id: "req-1",
        action_type: "tool_confirmation",
        confirmed: false,
      }),
    ).toEqual({
      sessionId: "session-1",
      requestId: "req-1",
      actionType: "tool_confirmation",
      confirmed: false,
    });
  });

  it("App Server event payload projection 应覆盖 current event type", () => {
    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-artifact",
            sequence: 3,
            sessionId: "session-1",
            turnId: "turn-1",
            type: "artifact.snapshot",
            timestamp: "2026-06-06T00:00:02.000Z",
            payload: {
              artifactId: "artifact-1",
              filePath: ".lime/artifacts/report.md",
            },
          },
        },
      }),
    ).toEqual({
      type: "artifact_snapshot",
      artifactId: "artifact-1",
      filePath: ".lime/artifacts/report.md",
      event_id: "evt-artifact",
      sequence: 3,
      session_id: "session-1",
      thread_id: undefined,
      turn_id: "turn-1",
      timestamp: "2026-06-06T00:00:02.000Z",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-status",
            sequence: 4,
            sessionId: "session-1",
            type: "runtime.status",
            timestamp: "2026-06-06T00:00:03.000Z",
            payload: {
              status: {
                phase: "routing",
                title: "正在路由",
                detail: "选择执行后端",
              },
            },
          },
        },
      }),
    ).toMatchObject({
      type: "runtime_status",
      status: {
        phase: "routing",
        title: "正在路由",
      },
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-failed",
            sequence: 5,
            sessionId: "session-1",
            turnId: "turn-1",
            type: "turn.failed",
            timestamp: "2026-06-06T00:00:04.000Z",
            payload: {
              message: "standalone app-server backend is not configured",
            },
          },
        },
      }),
    ).toMatchObject({
      type: "error",
      message: "standalone app-server backend is not configured",
      event_id: "evt-failed",
      session_id: "session-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-completed",
            sequence: 6,
            sessionId: "session-1",
            turnId: "turn-1",
            type: "turn.completed",
            timestamp: "2026-06-06T00:00:05.000Z",
            payload: {
              text: "CLAW_NEWS_FIXTURE_DONE",
              usage: {
                inputTokens: 10,
                outputTokens: 5,
              },
            },
          },
        },
      }),
    ).toMatchObject({
      type: "turn_completed",
      text: "CLAW_NEWS_FIXTURE_DONE",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
      },
      turn: {
        id: "turn-1",
        thread_id: "session-1",
        prompt_text: "",
        status: "completed",
      },
      event_id: "evt-completed",
      session_id: "session-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-canceled",
            sequence: 7,
            sessionId: "session-1",
            turnId: "turn-1",
            type: "turn.canceled",
            timestamp: "2026-06-06T00:00:06.000Z",
            payload: {
              reason: "user_cancelled",
            },
          },
        },
      }),
    ).toMatchObject({
      type: "turn_completed",
      message: "user_cancelled",
      turn: {
        id: "turn-1",
        thread_id: "session-1",
        prompt_text: "",
        status: "canceled",
        error_message: "user_cancelled",
      },
      event_id: "evt-canceled",
      session_id: "session-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-batch",
            sequence: 8,
            sessionId: "session-1",
            turnId: "turn-1",
            type: "message.delta_batch",
            timestamp: "2026-06-06T00:00:06.000Z",
            payload: {
              chunks: ["最终", "答复"],
              boundary: "provider",
            },
          },
        },
      }),
    ).toMatchObject({
      type: "text_delta_batch",
      text: "最终答复",
      chunks: ["最终", "答复"],
      boundary: "provider",
      event_id: "evt-batch",
      session_id: "session-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-claw-batch",
            sequence: 9,
            sessionId: "session-1",
            turnId: "turn-1",
            type: "message.delta",
            timestamp: "2026-06-06T00:00:07.000Z",
            payload: {
              type: "text_delta_batch",
              text: "Claw 批量输出",
              chunks: ["Claw ", "批量", "输出"],
              boundary: "backlog",
            },
          },
        },
      }),
    ).toMatchObject({
      type: "text_delta_batch",
      text: "Claw 批量输出",
      chunks: ["Claw ", "批量", "输出"],
      boundary: "backlog",
      event_id: "evt-claw-batch",
      session_id: "session-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-item-message",
            sequence: 9,
            sessionId: "session-1",
            turnId: "turn-1",
            type: "item.completed",
            timestamp: "2026-06-06T00:00:07.000Z",
            payload: {
              item: {
                id: "item-1",
                type: "agent_message",
                text: "最终答复",
                phase: "final_answer",
              },
            },
          },
        },
      }),
    ).toMatchObject({
      type: "message",
      message: {
        id: "item-1",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "最终答复",
          },
        ],
        timestamp: Date.parse("2026-06-06T00:00:07.000Z"),
      },
      event_id: "evt-item-message",
      session_id: "session-1",
      turn_id: "turn-1",
    });
  });
});
