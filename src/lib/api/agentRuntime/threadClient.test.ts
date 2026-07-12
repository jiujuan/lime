import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  AppServerRpcError,
  type AppServerAgentSessionTurnStartParams,
  type AppServerRequestResult,
} from "@/lib/api/appServer";
import { isAppServerBridgeAvailable } from "@/lib/api/appServerBridgeAvailability";
import { resetDefaultAppServerEventBusForTests } from "@/lib/api/appServerEventBus";
import { parseAgentEvent } from "@/lib/api/agentProtocol";
import { safeListen } from "@/lib/dev-bridge";
import { listenAgentRuntimeEvent } from "../agentRuntimeEvents";
import { resetAgentRuntimeEventSequenceGatesForTests } from "./eventSequenceGate";
import {
  APP_SERVER_EVENT_DRAIN_ACTIVE_INTERVAL_MS,
  APP_SERVER_EVENT_DRAIN_INTERVAL_MS,
} from "./appServerEventStream";
import {
  appServerActionRespondParamsFromRequest,
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
} from "./types";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
  safeListen: vi.fn(),
}));

vi.mock("@/lib/api/appServerBridgeAvailability", () => ({
  isAppServerBridgeAvailable: vi.fn(),
}));

function turnStartParams({
  sessionId = "session-1",
  turnId,
  text = "生成草稿",
  eventName,
  runtimeRequest,
  queueIfBusy,
  queuedTurnId,
  skipPreSubmitResume,
  attachments,
  expectedOutput,
  structuredOutput,
  outputSchema,
}: {
  sessionId?: string;
  turnId?: string;
  text?: string;
  eventName: string;
  runtimeRequest?: Record<string, unknown>;
  queueIfBusy?: boolean;
  queuedTurnId?: string;
  skipPreSubmitResume?: boolean;
  attachments?: AppServerAgentSessionTurnStartParams["input"]["attachments"];
  expectedOutput?: unknown;
  structuredOutput?: Record<string, unknown>;
  outputSchema?: unknown;
}): AppServerAgentSessionTurnStartParams {
  return {
    sessionId,
    ...(turnId ? { turnId } : {}),
    input: {
      text,
      ...(attachments ? { attachments } : {}),
    },
    runtimeOptions: {
      stream: true,
      eventName,
      ...(queuedTurnId ? { queuedTurnId } : {}),
      ...(runtimeRequest ? { runtimeRequest } : {}),
      ...(expectedOutput !== undefined ? { expectedOutput } : {}),
      ...(structuredOutput ? { structuredOutput } : {}),
      ...(outputSchema !== undefined ? { outputSchema } : {}),
    },
    ...(queueIfBusy ? { queueIfBusy } : {}),
    ...(skipPreSubmitResume ? { skipPreSubmitResume } : {}),
  };
}

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
    listCapabilities: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        capabilities: [
          {
            id: "agent.session",
            title: "Agent Session",
            methods: ["agentSession/start", "agentSession/turn/start"],
          },
        ],
        runtimeCapabilityManifest: {
          schemaVersion: "lime-runtime-capability-manifest/v0.1",
          runtimeId: "app-server",
          sessionId: "session-1",
          generatedAt: "2026-06-12T00:00:00.000Z",
          capabilities: [
            {
              id: "transport.jsonrpc",
              status: "supported",
              scope: "runtime",
              title: "Agent Session",
            },
          ],
        },
      },
      response: { id: 1, result: {} },
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
    resetDefaultAppServerEventBusForTests();
    vi.clearAllMocks();
    resetAgentRuntimeEventSequenceGatesForTests();
    vi.mocked(isAppServerBridgeAvailable).mockReturnValue(false);
    vi.mocked(safeListen).mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    resetDefaultAppServerEventBusForTests();
    vi.useRealTimers();
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
      resumeContract: expect.objectContaining({
        schemaVersion: "lime-runtime-resume-contract/v0.1",
        runtimeId: "app-server",
        sessionId: "session-1",
        turnId: "thread",
        resumeMode: "all-open-actions",
        openActionIds: [],
        decisions: [],
      }),
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

  it("capability manifest 应消费 App Server current capability/list 合同", async () => {
    const appServerClient = appServerClientMock();
    const client = createThreadClient({
      appServerClient,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.getAgentRuntimeCapabilityManifest({
        app_id: "agent-chat",
        workspace_id: "workspace-1",
        session_id: "session-1",
        limit: 10,
      }),
    ).resolves.toMatchObject({
      schemaVersion: "lime-runtime-capability-manifest/v0.1",
      runtimeId: "app-server",
      sessionId: "session-1",
      capabilities: [
        {
          id: "transport.jsonrpc",
          status: "supported",
          scope: "runtime",
        },
      ],
    });
    expect(appServerClient.listCapabilities).toHaveBeenCalledWith({
      appId: "agent-chat",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      limit: 10,
    });
  });

  it("resume contract 未覆盖 open actions 时应在前端 current gateway fail closed", async () => {
    const appServerClient = appServerClientMock();
    const client = createThreadClient({
      appServerClient,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.resumeAgentRuntimeThread({
        session_id: "session-1",
        turn_id: "turn-1",
        open_action_ids: ["action-1"],
        decisions: [],
      }),
    ).rejects.toThrow("Invalid Agent Runtime resume contract");
    expect(appServerClient.resumeAgentSessionThread).not.toHaveBeenCalled();
  });

  it("resume contract 应透传 workflowResume metadata 给 App Server current", async () => {
    const appServerClient = appServerClientMock();
    const client = createThreadClient({
      appServerClient,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.resumeAgentRuntimeThread({
        session_id: "session-1",
        turn_id: "turn-queued-1",
        open_action_ids: ["article-draft-review"],
        decisions: [
          {
            actionId: "article-draft-review",
            decision: "approved",
            metadata: {
              workflowResume: {
                workflowRunId: "turn-queued-1:content-article",
                workflowKey: "content_article_workflow",
                stepId: "draft",
              },
            },
          },
        ],
      }),
    ).resolves.toBe(true);

    expect(appServerClient.resumeAgentSessionThread).toHaveBeenCalledWith({
      sessionId: "session-1",
      resumeContract: expect.objectContaining({
        schemaVersion: "lime-runtime-resume-contract/v0.1",
        runtimeId: "app-server",
        sessionId: "session-1",
        turnId: "turn-queued-1",
        resumeMode: "selected-actions",
        openActionIds: ["article-draft-review"],
        decisions: [
          expect.objectContaining({
            actionId: "article-draft-review",
            decision: "approved",
            metadata: {
              workflowResume: {
                workflowRunId: "turn-queued-1:content-article",
                workflowKey: "content_article_workflow",
                stepId: "draft",
              },
            },
          }),
        ],
      }),
    });
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

    expect(
      appServerClient.listAgentSessionFileCheckpoints,
    ).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(appServerClient.getAgentSessionFileCheckpoint).toHaveBeenCalledWith({
      sessionId: "session-1",
      checkpointId: "checkpoint-1",
    });
    expect(appServerClient.diffAgentSessionFileCheckpoint).toHaveBeenCalledWith(
      {
        sessionId: "session-1",
        checkpointId: "checkpoint-1",
      },
    );
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

    await client.submitAgentRuntimeTurn(
      turnStartParams({
        sessionId: "session-1",
        turnId: "turn-1",
        eventName: "agentSession/event/session-1",
        queueIfBusy: true,
        queuedTurnId: "queued-1",
        skipPreSubmitResume: true,
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
        runtimeRequest: {
          providerPreference: "deepseek",
          modelPreference: "deepseek-v4-flash",
          workspaceId: "workspace-1",
          metadata: { source: "chat" },
        },
      }),
    );

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
        queuedTurnId: "queued-1",
        runtimeRequest: {
          providerPreference: "deepseek",
          modelPreference: "deepseek-v4-flash",
          workspaceId: "workspace-1",
          metadata: { source: "chat" },
        },
      },
      queueIfBusy: true,
      skipPreSubmitResume: true,
    });
    const startTurnParams = appServerClient.startTurn.mock.calls[0]?.[0];
    expect(startTurnParams?.runtimeOptions).not.toHaveProperty(
      "providerPreference",
    );
    expect(startTurnParams?.runtimeOptions).not.toHaveProperty(
      "modelPreference",
    );
    expect(startTurnParams?.runtimeOptions).not.toHaveProperty("metadata");
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
      client.submitAgentRuntimeTurn(
        turnStartParams({
          sessionId: "session-1",
          turnId: "turn-1",
          eventName: "agentSession/event/session-1",
        }),
      ),
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
    await expect(
      client.getAgentRuntimeThreadRead(" session-1 "),
    ).resolves.toEqual(
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

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "整理新闻", sessionId: "session-1", eventName: "event-1" }),
    );

    expect(appServerClient.startTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      input: {
        text: "整理新闻",
      },
      runtimeOptions: {
        stream: true,
        eventName: "event-1",
      },
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("App Server submit 参数将 Turn 输入与 current runtime 配置分离", () => {
    const expectedOutput = {
      artifactKind: "content_batch",
      outputFormat: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
            },
          },
          required: ["items"],
        },
        maxValidationRetries: 2,
      },
    };
    const structuredOutput = expectedOutput.outputFormat;
    const outputSchema = structuredOutput.schema;
    const params = turnStartParams({
      sessionId: "session-claw",
      turnId: "turn-claw",
      text: "继续执行完整 Claw 链路",
      eventName: "agent_stream_claw",
      queueIfBusy: true,
      queuedTurnId: "queued-claw",
      skipPreSubmitResume: true,
      expectedOutput,
      structuredOutput,
      outputSchema,
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
      runtimeRequest: {
        providerConfig: {
          providerId: "deepseek",
          providerName: "deepseek",
          modelName: "deepseek-v4-pro",
        },
        providerPreference: "deepseek",
        modelPreference: "deepseek-v4-pro",
        reasoningEffort: "high",
        thinkingEnabled: true,
        approvalPolicy: "on-request",
        sandboxPolicy: "workspace-write",
        workspaceId: "workspace-claw",
        webSearch: true,
        searchMode: "required",
        executionStrategy: "react",
        autoContinue: true,
        systemPrompt: "保留 Claw 原始系统提示",
        metadata: {
          harness: {
            source: "claw",
            workspace_skill_runtime_enable: {
              source: "manual_session_enable",
            },
          },
        },
      },
    });

    expect(params).toEqual({
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
        eventName: "agent_stream_claw",
        queuedTurnId: "queued-claw",
        expectedOutput,
        structuredOutput: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
              },
            },
            required: ["items"],
          },
          maxValidationRetries: 2,
        },
        outputSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
            },
          },
          required: ["items"],
        },
        runtimeRequest: {
          providerConfig: {
            providerId: "deepseek",
            providerName: "deepseek",
            modelName: "deepseek-v4-pro",
          },
          providerPreference: "deepseek",
          modelPreference: "deepseek-v4-pro",
          reasoningEffort: "high",
          thinkingEnabled: true,
          approvalPolicy: "on-request",
          sandboxPolicy: "workspace-write",
          workspaceId: "workspace-claw",
          webSearch: true,
          searchMode: "required",
          executionStrategy: "react",
          autoContinue: true,
          systemPrompt: "保留 Claw 原始系统提示",
          metadata: {
            harness: {
              source: "claw",
              workspace_skill_runtime_enable: {
                source: "manual_session_enable",
              },
            },
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
      "agent_stream_message-1",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", eventName: "agent_stream_message-1" }),
    );

    expect(listener).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        type: "text_delta",
        text: "第一段",
        event_id: "evt-1",
        renderer_event_received_at: expect.any(Number),
        sequence: 1,
        server_event_emitted_at: Date.parse("2026-06-06T00:00:00.000Z"),
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        timestamp: "2026-06-06T00:00:00.000Z",
      }),
    });
    unlisten();
  });

  it("App Server submit 返回 item.updated reasoning notification 时应投递到请求里的前端 stream event", async () => {
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
              eventId: "evt-reasoning-1",
              sequence: 3,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "item.updated",
              timestamp: "2026-06-06T00:00:02.000Z",
              payload: {
                item: {
                  id: "reasoning-1",
                  type: "reasoning",
                  text: "搜索后先筛掉低质量来源。",
                  status: "in_progress",
                  sequence: 3,
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
    });

    const listener = vi.fn();
    const unlisten = await listenAgentRuntimeEvent(
      "agent_stream_reasoning-1",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", eventName: "agent_stream_reasoning-1" }),
    );

    expect(listener).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        type: "item_updated",
        event_id: "evt-reasoning-1",
        sequence: 3,
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        item: expect.objectContaining({
          id: "reasoning-1",
          type: "reasoning",
          text: "搜索后先筛掉低质量来源。",
          status: "in_progress",
          turn_id: "turn-1",
        }),
      }),
    });
    unlisten();
  });

  it("App Server submit 返回乱序 notification 时应按 sequence 投递", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.startTurn).mockResolvedValueOnce({
      id: 1,
      result: {
        turn: {
          turnId: "turn-ordered",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-ordered",
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
              eventId: "evt-ordered-2",
              sequence: 2,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-ordered",
              type: "message.delta",
              timestamp: "2026-06-06T00:00:02.000Z",
              payload: { text: "第二段" },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-ordered-1",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-ordered",
              type: "message.delta",
              timestamp: "2026-06-06T00:00:01.000Z",
              payload: { text: "第一段" },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-ordered-3",
              sequence: 3,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-ordered",
              type: "turn.completed",
              timestamp: "2026-06-06T00:00:03.000Z",
              payload: {},
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
      "agent_stream_ordered",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", eventName: "agent_stream_ordered" }),
    );

    expect(
      listener.mock.calls.map(([event]) => event.payload.event_id),
    ).toEqual(["evt-ordered-1", "evt-ordered-2", "evt-ordered-3"]);
    unlisten();
  });

  it("App Server WebSearch/WebFetch 中间 reasoning notification 不应被序列门控丢弃", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.startTurn).mockResolvedValueOnce({
      id: 1,
      result: {
        turn: {
          turnId: "turn-web-tools",
          sessionId: "session-web-tools",
          threadId: "thread-web-tools",
          status: "accepted",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-web-tools",
            sessionId: "session-web-tools",
            threadId: "thread-web-tools",
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
              eventId: "evt-web-tools-1",
              sequence: 1,
              sessionId: "session-web-tools",
              threadId: "thread-web-tools",
              turnId: "turn-web-tools",
              type: "message.delta",
              timestamp: "2026-06-20T10:00:01.000Z",
              payload: { text: "我先联网核实目标页面来源。\n" },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-web-tools-2",
              sequence: 2,
              sessionId: "session-web-tools",
              threadId: "thread-web-tools",
              turnId: "turn-web-tools",
              type: "tool.started",
              timestamp: "2026-06-20T10:00:02.000Z",
              payload: {
                toolCallId: "tool-web-search",
                toolName: "WebSearch",
                arguments: { query: "Lime WebSearch rendering" },
              },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-web-tools-3",
              sequence: 3,
              sessionId: "session-web-tools",
              threadId: "thread-web-tools",
              turnId: "turn-web-tools",
              type: "tool.result",
              timestamp: "2026-06-20T10:00:03.000Z",
              payload: {
                toolCallId: "tool-web-search",
                toolName: "WebSearch",
                output: JSON.stringify({ results: [] }),
                success: true,
              },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-web-tools-4",
              sequence: 4,
              sessionId: "session-web-tools",
              threadId: "thread-web-tools",
              turnId: "turn-web-tools",
              type: "item.updated",
              timestamp: "2026-06-20T10:00:04.000Z",
              payload: {
                item: {
                  id: "reasoning-web-tools",
                  thread_id: "thread-web-tools",
                  turn_id: "turn-web-tools",
                  type: "reasoning",
                  text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
                  sequence: 3,
                  status: "in_progress",
                  started_at: "2026-06-20T10:00:04.000Z",
                  updated_at: "2026-06-20T10:00:04.000Z",
                },
              },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-web-tools-5",
              sequence: 5,
              sessionId: "session-web-tools",
              threadId: "thread-web-tools",
              turnId: "turn-web-tools",
              type: "tool.started",
              timestamp: "2026-06-20T10:00:05.000Z",
              payload: {
                toolCallId: "tool-web-fetch",
                toolName: "WebFetch",
                arguments: {
                  url: "https://example.com/lime-websearch-rendering",
                },
              },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-web-tools-6",
              sequence: 6,
              sessionId: "session-web-tools",
              threadId: "thread-web-tools",
              turnId: "turn-web-tools",
              type: "tool.result",
              timestamp: "2026-06-20T10:00:06.000Z",
              payload: {
                toolCallId: "tool-web-fetch",
                toolName: "WebFetch",
                output: "WebFetch 正文摘要。",
                success: true,
              },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-web-tools-7",
              sequence: 7,
              sessionId: "session-web-tools",
              threadId: "thread-web-tools",
              turnId: "turn-web-tools",
              type: "item.completed",
              timestamp: "2026-06-20T10:00:07.000Z",
              payload: {
                item: {
                  id: "reasoning-web-tools",
                  thread_id: "thread-web-tools",
                  turn_id: "turn-web-tools",
                  type: "reasoning",
                  text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
                  sequence: 3,
                  status: "completed",
                  started_at: "2026-06-20T10:00:04.000Z",
                  completed_at: "2026-06-20T10:00:07.000Z",
                  updated_at: "2026-06-20T10:00:07.000Z",
                },
              },
            },
          },
        },
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-web-tools-8",
              sequence: 8,
              sessionId: "session-web-tools",
              threadId: "thread-web-tools",
              turnId: "turn-web-tools",
              type: "turn.completed",
              timestamp: "2026-06-20T10:00:08.000Z",
              payload: {},
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
      "agent_stream_web_tools",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "验证网页搜索渲染", sessionId: "session-web-tools", eventName: "agent_stream_web_tools" }),
    );

    expect(listener.mock.calls.map(([event]) => event.payload.type)).toEqual([
      "text_delta",
      "tool_start",
      "tool_end",
      "item_updated",
      "tool_start",
      "tool_end",
      "item_completed",
      "turn_completed",
    ]);
    expect(listener.mock.calls[3]?.[0].payload.item).toMatchObject({
      id: "reasoning-web-tools",
      type: "reasoning",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
      turn_id: "turn-web-tools",
    });
    unlisten();
  });

  it("App Server submit 返回未配对 tool.result 时不应投递到前端 stream event", async () => {
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
              eventId: "evt-orphan-tool-result",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "tool.result",
              timestamp: "2026-06-06T00:00:00.000Z",
              payload: {
                toolCallId: "tool-orphan",
                output: "should be blocked",
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
      "agent_stream_message-orphan",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", eventName: "agent_stream_message-orphan" }),
    );

    expect(listener).not.toHaveBeenCalled();
    unlisten();
  });

  it("App Server submit 应消费 runtime-client pipeline fan-out 后投递多个前端 stream event", async () => {
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
              eventId: "evt-tool-completed",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "tool.completed",
              timestamp: "2026-06-06T00:00:00.000Z",
              payload: {
                toolCallId: "tool-fanout",
                toolName: "search",
                output: "done",
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
      "agent_stream_message-fanout",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", eventName: "agent_stream_message-fanout" }),
    );

    expect(listener.mock.calls.map(([event]) => event.payload.type)).toEqual([
      "tool_start",
      "tool_end",
    ]);
    expect(listener.mock.calls.map(([event]) => event.payload.tool_id)).toEqual(
      ["tool-fanout", "tool-fanout"],
    );
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
      "agent_stream_missing-turn",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", turnId: "turn-request", eventName: "agent_stream_missing-turn" }),
    );

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

  it("App Server runtime.status 应保留 retrying phase 供 GUI 展示恢复状态", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-retrying",
          sequence: 1,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "runtime.status",
          timestamp: "2026-06-06T00:00:00.000Z",
          payload: {
            status: {
              phase: "retrying",
              title: "正在恢复模型输出",
              detail: "模型通道在尾段暂时中断，正在补齐最终答复。",
              metadata: {
                agentui: {
                  eventClass: "run.status",
                },
              },
            },
          },
        },
      },
    });

    expect(payload).toMatchObject({
      type: "runtime_status",
      event_id: "evt-retrying",
      renderer_event_received_at: expect.any(Number),
      server_event_emitted_at: Date.parse("2026-06-06T00:00:00.000Z"),
      status: {
        phase: "retrying",
        title: "正在恢复模型输出",
        detail: "模型通道在尾段暂时中断，正在补齐最终答复。",
      },
    });
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
            type: "turn.completed",
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
      "agent_stream_message-drain",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", eventName: "agent_stream_message-drain" }),
    );

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
          type: "turn_completed",
          event_id: "evt-drain-2",
          session_id: "session-1",
          turn_id: "turn-1",
        }),
      });
    });

    expect(appServerClient.drainEvents).toHaveBeenCalledWith(1);
    unlisten();
  });

  it("App Server resume 后应继续 drain 并投递到固定 session event", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.resumeAgentSessionThread).mockResolvedValueOnce({
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
        resumed: true,
      },
      response: {
        id: 1,
        result: {
          resumed: true,
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
            eventId: "evt-resume-drain-1",
            sequence: 10,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "message.delta",
            timestamp: "2026-06-06T00:00:01.000Z",
            payload: {
              text: "继续输出",
            },
          },
        },
      },
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-resume-drain-2",
            sequence: 11,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "turn.completed",
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
      "agentSession/event/session-1",
      listener,
    );

    await expect(
      client.resumeAgentRuntimeThread({
        session_id: "session-1",
        turn_id: "turn-1",
      }),
    ).resolves.toBe(true);

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "text_delta",
          text: "继续输出",
          event_id: "evt-resume-drain-1",
          session_id: "session-1",
          turn_id: "turn-1",
        }),
      });
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "turn_completed",
          event_id: "evt-resume-drain-2",
          session_id: "session-1",
          turn_id: "turn-1",
        }),
      });
    });

    expect(appServerClient.drainEvents).toHaveBeenCalledWith(1);
    unlisten();
  });

  it("App Server drain 返回乱序事件时应按 sequence 投递", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.startTurn).mockResolvedValueOnce({
      id: 1,
      result: {
        turn: {
          turnId: "turn-drain-ordered",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-drain-ordered",
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
            eventId: "evt-drain-ordered-2",
            sequence: 2,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-drain-ordered",
            type: "message.delta",
            timestamp: "2026-06-06T00:00:02.000Z",
            payload: { text: "第二段" },
          },
        },
      },
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-drain-ordered-1",
            sequence: 1,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-drain-ordered",
            type: "message.delta",
            timestamp: "2026-06-06T00:00:01.000Z",
            payload: { text: "第一段" },
          },
        },
      },
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-drain-ordered-3",
            sequence: 3,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-drain-ordered",
            type: "turn.completed",
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
      "agent_stream_drain_ordered",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", turnId: "turn-drain-ordered", eventName: "agent_stream_drain_ordered" }),
    );

    await vi.waitFor(() => {
      expect(
        listener.mock.calls.map(([event]) => event.payload.event_id),
      ).toEqual([
        "evt-drain-ordered-1",
        "evt-drain-ordered-2",
        "evt-drain-ordered-3",
      ]);
    });
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
      "agent_stream_pending",
      listener,
    );
    const submitPromise = client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", turnId: "turn-pending", eventName: "agent_stream_pending" }),
    );

    await vi.waitFor(() => {
      expect(appServerClient.drainEvents).toHaveBeenCalledWith(1);
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
              type: "turn.completed",
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

  it("App Server 真实 turnId 与本地请求 turnId 不同时仍应投递完整当前事件", async () => {
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
    vi.mocked(appServerClient.drainEvents)
      .mockResolvedValueOnce([
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-real-turn-delta-1",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-real",
              type: "message.delta",
              timestamp: "2026-06-06T00:00:00.000Z",
              payload: {
                text: "继续输出已恢复",
              },
            },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-real-turn-completed",
              sequence: 2,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-real",
              type: "turn.completed",
              timestamp: "2026-06-06T00:00:01.000Z",
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
      "agent_stream_real_turn",
      listener,
    );
    const submitPromise = client.submitAgentRuntimeTurn(
      turnStartParams({ text: "继续输出", sessionId: "session-1", turnId: "pending-turn-local", eventName: "agent_stream_real_turn" }),
    );

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "text_delta",
          text: "继续输出已恢复",
          event_id: "evt-real-turn-delta-1",
          session_id: "session-1",
          turn_id: "turn-real",
        }),
      });
    });

    await vi.waitFor(() => {
      expect(appServerClient.drainEvents).toHaveBeenCalledWith(50);
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "turn_completed",
          event_id: "evt-real-turn-completed",
          session_id: "session-1",
          turn_id: "turn-real",
        }),
      });
    });

    resolveStartTurn?.({
      id: 1,
      result: {
        turn: {
          turnId: "turn-real",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "completed",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-real",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "completed",
          },
        },
      },
      messages: [],
      notifications: [],
    });
    await submitPromise;
    unlisten();
  });

  it("App Server drain 应在首事件前快速轮询，投递首事件后按活跃间隔追连续输出", async () => {
    vi.useFakeTimers();
    try {
      const appServerClient = appServerClientMock();
      let resolveStartTurn:
        | ((
            value: Awaited<
              ReturnType<AgentRuntimeAppServerClient["startTurn"]>
            >,
          ) => void)
        | undefined;
      vi.mocked(appServerClient.startTurn).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStartTurn = resolve;
        }),
      );
      vi.mocked(appServerClient.drainEvents)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
            params: {
              event: {
                eventId: "evt-fast-first-delta",
                sequence: 1,
                sessionId: "session-1",
                threadId: "thread-1",
                turnId: "turn-fast-first",
                type: "message.delta",
                timestamp: "2026-06-06T00:00:00.000Z",
                payload: {
                  text: "首字",
                },
              },
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
            params: {
              event: {
                eventId: "evt-fast-first-completed",
                sequence: 2,
                sessionId: "session-1",
                threadId: "thread-1",
                turnId: "turn-fast-first",
                type: "turn.completed",
                timestamp: "2026-06-06T00:00:01.000Z",
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
        "agent_stream_fast_first",
        listener,
      );
      const submitPromise = client.submitAgentRuntimeTurn(
        turnStartParams({ text: "生成草稿", sessionId: "session-1", turnId: "turn-fast-first", eventName: "agent_stream_fast_first" }),
      );

      await Promise.resolve();
      expect(appServerClient.drainEvents).toHaveBeenCalledTimes(1);
      expect(appServerClient.drainEvents).toHaveBeenLastCalledWith(1);

      await vi.advanceTimersByTimeAsync(23);
      expect(appServerClient.drainEvents).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(appServerClient.drainEvents).toHaveBeenCalledTimes(2);
      expect(appServerClient.drainEvents).toHaveBeenLastCalledWith(1);
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "text_delta",
          text: "首字",
          event_id: "evt-fast-first-delta",
          session_id: "session-1",
          turn_id: "turn-fast-first",
        }),
      });

      await vi.advanceTimersByTimeAsync(
        APP_SERVER_EVENT_DRAIN_ACTIVE_INTERVAL_MS - 1,
      );
      expect(appServerClient.drainEvents).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1);
      expect(appServerClient.drainEvents).toHaveBeenCalledTimes(3);
      expect(appServerClient.drainEvents).toHaveBeenLastCalledWith(50);
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "turn_completed",
          event_id: "evt-fast-first-completed",
          session_id: "session-1",
          turn_id: "turn-fast-first",
        }),
      });

      await vi.advanceTimersByTimeAsync(APP_SERVER_EVENT_DRAIN_INTERVAL_MS - 1);
      expect(appServerClient.drainEvents).toHaveBeenCalledTimes(3);

      resolveStartTurn?.({
        id: 1,
        result: {
          turn: {
            turnId: "turn-fast-first",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        },
        response: {
          id: 1,
          result: {
            turn: {
              turnId: "turn-fast-first",
              sessionId: "session-1",
              threadId: "thread-1",
              status: "accepted",
            },
          },
        },
        messages: [],
        notifications: [],
      });
      await submitPromise;
      unlisten();
    } finally {
      vi.useRealTimers();
    }
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
      "agent_stream_message-drain-completed",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", eventName: "agent_stream_message-drain-completed" }),
    );

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

  it("App Server drain 收到 legacy turn.final_done 不应关闭 current 路由", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.startTurn).mockResolvedValueOnce({
      id: 1,
      result: {
        turn: {
          turnId: "turn-legacy",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-legacy",
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
            eventId: "evt-drain-legacy-final-done",
            sequence: 2,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-legacy",
            type: "turn.final_done",
            timestamp: "2026-06-06T00:00:01.000Z",
            payload: {},
          },
        },
      },
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-drain-delta-after-legacy-final-done",
            sequence: 3,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-legacy",
            type: "message.delta",
            timestamp: "2026-06-06T00:00:02.000Z",
            payload: {
              text: "仍应投递",
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
      "agent_stream_message-drain-legacy-final-done",
      listener,
    );

    await client.submitAgentRuntimeTurn(
      turnStartParams({ text: "生成草稿", sessionId: "session-1", eventName: "agent_stream_message-drain-legacy-final-done" }),
    );

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          type: "text_delta",
          text: "仍应投递",
          event_id: "evt-drain-delta-after-legacy-final-done",
        }),
      });
    });
    expect(listener).not.toHaveBeenCalledWith({
      payload: expect.objectContaining({
        event_id: "evt-drain-legacy-final-done",
      }),
    });

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
      "agent_stream_message-error",
      listener,
    );

    await expect(
      client.submitAgentRuntimeTurn(
        turnStartParams({ text: "生成草稿", sessionId: "session-1", turnId: "turn-1", eventName: "agent_stream_message-error" }),
      ),
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
        type: "turn_failed",
        turn: expect.objectContaining({
          id: "turn-1",
          status: "failed",
          error_message: "external backend crashed after partial output",
        }),
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
      "App Server turn lifecycle is unavailable; Agent Runtime requires the App Server current lifecycle channel.",
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
      "agent_stream_cancel",
      listener,
    );

    await expect(
      client.interruptAgentRuntimeTurn({
        session_id: "session-1",
        turn_id: "turn-1",
        event_name: "agent_stream_cancel",
      }),
    ).resolves.toBe(true);

    expect(listener).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        type: "turn_canceled",
        event_id: "evt-canceled",
        session_id: "session-1",
        turn_id: "turn-1",
        turn: expect.objectContaining({
          id: "turn-1",
          status: "canceled",
          error_message: "本轮已中止",
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
      "App Server turn lifecycle is unavailable; Agent Runtime requires the App Server current lifecycle channel.",
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
      "App Server turn lifecycle is unavailable; Agent Runtime requires the App Server current lifecycle channel.",
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
    ).rejects.toThrow(
      "App Server turn lifecycle is unavailable; Agent Runtime requires the App Server current lifecycle channel.",
    );

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
      "agent_stream_message-1",
      listener,
    );

    await client.respondAgentRuntimeAction({
      session_id: "session-1",
      request_id: "req-1",
      action_type: "ask_user",
      confirmed: true,
      event_name: "agent_stream_message-1",
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

  it("App Server respond action 应先注册 event drain route 再发送 action/respond", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.drainEvents).mockResolvedValue([]);
    vi.mocked(appServerClient.respondAction).mockImplementationOnce(
      async () => {
        expect(appServerClient.drainEvents).toHaveBeenCalled();
        return {
          id: 2,
          result: {},
          response: {
            id: 2,
            result: {},
          },
          messages: [],
          notifications: [],
        };
      },
    );
    const client = createThreadClient({
      appServerClient,
      invokeCommand: vi.fn() as unknown as AgentRuntimeCommandInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
      enableAppServerEventDrain: true,
    });

    await client.respondAgentRuntimeAction({
      session_id: "session-1",
      request_id: "req-1",
      action_type: "tool_confirmation",
      decision: "allow_for_session",
      event_name: "agent_stream_message-1",
      action_scope: {
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
      },
    });

    expect(appServerClient.respondAction).toHaveBeenCalledWith({
      sessionId: "session-1",
      requestId: "req-1",
      actionType: "tool_confirmation",
      decision: "allow_for_session",
      eventName: "agent_stream_message-1",
      actionScope: {
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
      },
    });
  });

  it("App Server respond action 缺少 event_name 时应投递到 session stream event", async () => {
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
              eventId: "evt-action-resume-completed",
              sequence: 8,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "turn.completed",
              timestamp: "2026-06-06T00:00:02.000Z",
              payload: {},
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
      "agentSession/event/session-1",
      listener,
    );

    await client.respondAgentRuntimeAction({
      session_id: "session-1",
      request_id: "req-1",
      action_type: "tool_confirmation",
      decision: "allow_for_session",
      action_scope: {
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
      },
    });

    expect(appServerClient.respondAction).toHaveBeenCalledWith({
      sessionId: "session-1",
      requestId: "req-1",
      actionType: "tool_confirmation",
      decision: "allow_for_session",
      actionScope: {
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
      },
    });
    expect(listener).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        type: "turn_completed",
        event_id: "evt-action-resume-completed",
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 8,
        server_event_emitted_at: Date.parse("2026-06-06T00:00:02.000Z"),
      }),
    });
    unlisten();
  });

  it("request projection 应在未传可选项时保持精简 App Server 参数", () => {
    expect(
      turnStartParams({
        text: "继续",
        sessionId: "session-1",
        eventName: "agentSession/event/session-1",
      }),
    ).toEqual({
      sessionId: "session-1",
      input: {
        text: "继续",
      },
      runtimeOptions: {
        stream: true,
        eventName: "agentSession/event/session-1",
      },
    });

    expect(
      appServerActionRespondParamsFromRequest({
        session_id: "session-1",
        request_id: "req-1",
        action_type: "tool_confirmation",
        decision: "cancel",
      }),
    ).toEqual({
      sessionId: "session-1",
      requestId: "req-1",
      actionType: "tool_confirmation",
      decision: "cancel",
    });
  });

  it("App Server event payload projection 应覆盖 current event type", () => {
    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-thread",
            sequence: 1,
            sessionId: "session-1",
            threadId: "thread-1",
            type: "thread.started",
            timestamp: "2026-06-06T00:00:00.000Z",
            payload: {},
          },
        },
      }),
    ).toMatchObject({
      type: "thread_started",
      thread_id: "thread-1",
      event_id: "evt-thread",
      session_id: "session-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-turn-started",
            sequence: 2,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "turn.started",
            timestamp: "2026-06-06T00:00:01.000Z",
            payload: {
              turn: {
                id: "turn-1",
                prompt_text: "整理今天的国际新闻",
              },
            },
          },
        },
      }),
    ).toMatchObject({
      type: "turn_started",
      turn: {
        id: "turn-1",
        thread_id: "thread-1",
        prompt_text: "整理今天的国际新闻",
        status: "running",
      },
      event_id: "evt-turn-started",
      session_id: "session-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-provider-first-text",
            sequence: 10,
            sessionId: "session-1",
            turnId: "turn-1",
            type: "provider.first_text_delta.received",
            timestamp: "2026-06-06T00:00:08.000Z",
            payload: {
              provider: "openai",
              model: "gpt-4.1",
              attempt: 1,
              elapsed_ms: 1500,
              text_chars: 4,
              status: "running",
              provider_request_id: "req-provider-1",
              provider_request_id_header: "x-request-id",
            },
          },
        },
      }),
    ).toMatchObject({
      type: "provider_trace",
      runtime_event_type: "provider.first_text_delta.received",
      stage: "first_text_delta_received",
      provider: "openai",
      model: "gpt-4.1",
      attempt: 1,
      elapsed_ms: 1500,
      text_chars: 4,
      status: "running",
      provider_request_id: "req-provider-1",
      provider_request_id_header: "x-request-id",
      event_id: "evt-provider-first-text",
      renderer_event_received_at: expect.any(Number),
      sequence: 10,
      server_event_emitted_at: Date.parse("2026-06-06T00:00:08.000Z"),
      session_id: "session-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-plan-final",
            sequence: 10,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "plan.final",
            timestamp: "2026-06-06T00:00:08.000Z",
            payload: {
              text: "- [x] 读现状",
              revisionId: "update_plan:tool-plan",
              toolCallId: "tool-plan",
              source: "update_plan",
              plan: [{ step: "读现状", status: "completed" }],
            },
          },
        },
      }),
    ).toMatchObject({
      type: "plan_final",
      text: "- [x] 读现状",
      revisionId: "update_plan:tool-plan",
      toolCallId: "tool-plan",
      source: "update_plan",
      event_id: "evt-plan-final",
      sequence: 10,
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-reasoning",
            sequence: 11,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "reasoning.delta",
            timestamp: "2026-06-06T00:00:09.000Z",
            payload: {
              reasoningId: "runtime-thinking",
              delta: "先理解目标",
            },
          },
        },
      }),
    ).toMatchObject({
      type: "reasoning_delta",
      reasoningId: "runtime-thinking",
      text: "先理解目标",
      delta: "先理解目标",
      event_id: "evt-reasoning",
      sequence: 11,
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-reasoning-started",
            sequence: 12,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "reasoning.started",
            timestamp: "2026-06-06T00:00:09.100Z",
            payload: {
              reasoningId: "runtime-thinking",
            },
          },
        },
      }),
    ).toMatchObject({
      type: "reasoning_started",
      reasoningId: "runtime-thinking",
      event_id: "evt-reasoning-started",
      sequence: 12,
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-reasoning-final",
            sequence: 13,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "reasoning.final",
            timestamp: "2026-06-06T00:00:09.200Z",
            payload: {
              reasoningId: "runtime-thinking",
              text: "先理解目标",
            },
          },
        },
      }),
    ).toMatchObject({
      type: "reasoning_final",
      reasoningId: "runtime-thinking",
      text: "先理解目标",
      event_id: "evt-reasoning-final",
      sequence: 13,
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-reasoning-ended",
            sequence: 14,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "reasoning.ended",
            timestamp: "2026-06-06T00:00:09.300Z",
            payload: {
              reasoningId: "runtime-thinking",
              status: "completed",
            },
          },
        },
      }),
    ).toMatchObject({
      type: "reasoning_ended",
      reasoningId: "runtime-thinking",
      status: "completed",
      event_id: "evt-reasoning-ended",
      sequence: 14,
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-model-effective",
            sequence: 15,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "model.effective",
            timestamp: "2026-06-06T00:00:10.000Z",
            payload: {
              model: { providerId: "openai", modelId: "gpt-codex" },
              provider: "openai",
              modelName: "gpt-codex",
              source: "runtime_options",
              serviceModelSlot: "coding",
              requestedReasoningEffort: "high",
              reasoning: {
                supported: true,
                requestedLevel: "high",
                effectiveLevel: "high",
              },
              toolCalling: {
                supported: true,
                streaming: true,
              },
            },
          },
        },
      }),
    ).toMatchObject({
      type: "model_effective",
      model: { providerId: "openai", modelId: "gpt-codex" },
      provider: "openai",
      modelName: "gpt-codex",
      source: "runtime_options",
      serviceModelSlot: "coding",
      requestedReasoningEffort: "high",
      event_id: "evt-model-effective",
      sequence: 15,
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-message-created",
            sequence: 3,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "message.created",
            timestamp: "2026-06-06T00:00:01.500Z",
            payload: {
              role: "user",
              input: {
                text: "整理今天的国际新闻",
              },
            },
          },
        },
      }),
    ).toMatchObject({
      type: "item_started",
      item: {
        id: "evt-message-created",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 3,
        status: "completed",
        type: "user_message",
        content: "整理今天的国际新闻",
      },
    });

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-item-started",
            sequence: 4,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-1",
            type: "item.started",
            timestamp: "2026-06-06T00:00:01.750Z",
            payload: {
              item: {
                id: "item-1",
                type: "agent_message",
                text: "",
                phase: "final_answer",
              },
            },
          },
        },
      }),
    ).toMatchObject({
      type: "item_started",
      item: {
        id: "item-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 4,
        status: "in_progress",
        type: "agent_message",
        text: "",
        phase: "final_answer",
      },
    });

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
    ).toMatchObject({
      type: "artifact_snapshot",
      artifactId: "artifact-1",
      filePath: ".lime/artifacts/report.md",
      artifact: {
        artifactId: "artifact-1",
        filePath: ".lime/artifacts/report.md",
        file_path: ".lime/artifacts/report.md",
      },
      event_id: "evt-artifact",
      renderer_event_received_at: expect.any(Number),
      sequence: 3,
      server_event_emitted_at: Date.parse("2026-06-06T00:00:02.000Z"),
      session_id: "session-1",
      thread_id: undefined,
      turn_id: "turn-1",
      timestamp: "2026-06-06T00:00:02.000Z",
    });

    const artifactPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-article-artifact",
          sequence: 4,
          sessionId: "session-1",
          turnId: "turn-1",
          type: "artifact.snapshot",
          timestamp: "2026-06-06T00:00:02.500Z",
          payload: {
            artifact: {
              artifactId: "artifact-workspace-patch",
              filePath: ".lime/artifacts/content-factory/workspace-patch.json",
              content: '{"schemaVersion":"article-workspace.v1"}',
              metadata: {
                kind: "content_factory.workspace_patch",
              },
            },
          },
        },
      },
    });
    expect(parseAgentEvent(artifactPayload)).toMatchObject({
      type: "artifact_snapshot",
      artifact: {
        artifactId: "artifact-workspace-patch",
        filePath: ".lime/artifacts/content-factory/workspace-patch.json",
        content: '{"schemaVersion":"article-workspace.v1"}',
        metadata: {
          kind: "content_factory.workspace_patch",
        },
      },
    });

    const hookPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-worker-hook",
          sequence: 5,
          sessionId: "session-1",
          turnId: "turn-1",
          type: "plugin_worker.hook",
          timestamp: "2026-06-06T00:00:02.750Z",
          payload: {
            source: "plugin_task_worker",
            backend: "plugin_worker",
            appId: "content-factory-app",
            taskId: "turn-1:article-workspace-action",
            taskKind: "content.article.generate",
            status: "completed",
            hookKey: "prompt-submit",
            hookEvent: "prompt.submit",
            hookScope: "prompt",
            resultSummary: "Prepared prompt context for content task",
          },
        },
      },
    });
    expect(hookPayload).toMatchObject({
      type: "item_completed",
      item: {
        id: "evt-worker-hook:plugin-worker-hook",
        type: "turn_summary",
        status: "completed",
        text: "Prepared prompt context for content task",
        metadata: {
          source: "plugin_worker.hook",
          hookKey: "prompt-submit",
          hookEvent: "prompt.submit",
          hookScope: "prompt",
        },
      },
    });
    expect(parseAgentEvent(hookPayload)).toMatchObject({
      type: "item_completed",
      item: {
        id: "evt-worker-hook:plugin-worker-hook",
        type: "turn_summary",
        status: "completed",
        text: "Prepared prompt context for content task",
      },
    });

    const workflowRunPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-workflow-run",
          sequence: 6,
          sessionId: "session-1",
          turnId: "turn-1",
          type: "workflow.run.started",
          timestamp: "2026-06-06T00:00:02.800Z",
          payload: {
            appId: "content-factory-app",
            taskId: "turn-1:content_article_generate",
            taskKind: "content.article.generate",
            workflowRunId: "turn-1:content_article_generate:workflow",
            workflowKey: "content_article_workflow",
            workflowTitle: "写文章工作流",
            status: "running",
          },
        },
      },
    });
    expect(workflowRunPayload).toMatchObject({
      type: "runtime_status",
      runtime_event_type: "workflow.run.started",
      workflow_run_id: "turn-1:content_article_generate:workflow",
      workflow_key: "content_article_workflow",
      status: {
        metadata: {
          source: "workflow_read_model_refresh",
          visibility: "diagnostics",
          agentui: {
            status_kind: "workflow_read_model_refresh",
          },
        },
      },
    });
    expect(workflowRunPayload).not.toHaveProperty("item");

    const workflowStepProgressPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-workflow-step-progress",
          sequence: 7,
          sessionId: "session-1",
          turnId: "turn-1",
          type: "workflow.step.progress",
          timestamp: "2026-06-06T00:00:02.850Z",
          payload: {
            appId: "content-factory-app",
            taskId: "turn-1:content_article_generate",
            taskKind: "content.article.generate",
            workflowRunId: "turn-1:content_article_generate:workflow",
            workflowKey: "content_article_workflow",
            workflowTitle: "写文章工作流",
            stepId: "research",
            stepTitle: "资料检索",
            stepIndex: 0,
            stepCount: 5,
            status: "running",
            progressMessage: "整理用户需求、历史上下文和可引用资料。",
          },
        },
      },
    });
    expect(workflowStepProgressPayload).toMatchObject({
      type: "runtime_status",
      runtime_event_type: "workflow.step.progress",
      workflow_run_id: "turn-1:content_article_generate:workflow",
      workflow_key: "content_article_workflow",
      step_id: "research",
    });
    expect(workflowStepProgressPayload).not.toHaveProperty("item");

    const workflowStepCompletedPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-workflow-step-completed",
          sequence: 8,
          sessionId: "session-1",
          turnId: "turn-1",
          type: "workflow.step.completed",
          timestamp: "2026-06-06T00:00:02.900Z",
          payload: {
            appId: "content-factory-app",
            taskId: "turn-1:content_article_generate",
            workflowRunId: "turn-1:content_article_generate:workflow",
            workflowKey: "content_article_workflow",
            stepId: "research",
            stepTitle: "资料检索",
            status: "completed",
          },
        },
      },
    });
    expect(workflowStepCompletedPayload).toMatchObject({
      type: "runtime_status",
      runtime_event_type: "workflow.step.completed",
      workflow_run_id: "turn-1:content_article_generate:workflow",
      workflow_key: "content_article_workflow",
      step_id: "research",
    });
    expect(workflowStepCompletedPayload).not.toHaveProperty("item");

    expect(
      projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: "evt-status",
            sequence: 9,
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
      type: "turn_failed",
      event_id: "evt-failed",
      session_id: "session-1",
      turn_id: "turn-1",
      turn: {
        id: "turn-1",
        thread_id: "session-1",
        status: "failed",
        error_message: "standalone app-server backend is not configured",
      },
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
      type: "turn_canceled",
      turn: {
        id: "turn-1",
        thread_id: "session-1",
        prompt_text: "",
        status: "canceled",
        error_message: "本轮已中止",
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
              itemId: "item-final-batch",
              phase: "final_answer",
            },
          },
        },
      }),
    ).toMatchObject({
      type: "text_delta_batch",
      text: "最终答复",
      chunks: ["最终", "答复"],
      boundary: "provider",
      itemId: "item-final-batch",
      phase: "final_answer",
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
      type: "item_completed",
      item: {
        id: "item-1",
        type: "agent_message",
        text: "最终答复",
        phase: "final_answer",
        status: "completed",
      },
      event_id: "evt-item-message",
      session_id: "session-1",
      turn_id: "turn-1",
    });
  });

  it("App Server current tool/file/command events 应投影为 GUI 可解析过程事件", () => {
    const toolArgsPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-tool-args",
          sequence: 10,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "tool.args",
          timestamp: "2026-06-06T00:00:08.000Z",
          payload: {
            toolCallId: "tool-read",
            toolName: "Read",
            args: {
              path: "src/App.tsx",
              start_line: 2,
              end_line: 8,
            },
            rawArgs: '{"path":"src/App.tsx","start_line":2,"end_line":8}',
            source: "runtime_tool_start",
          },
        },
      },
    });

    expect(toolArgsPayload).toMatchObject({
      type: "tool_input_delta",
      tool_id: "tool-read",
      tool_name: "Read",
      delta: '{"path":"src/App.tsx","start_line":2,"end_line":8}',
      accumulated_arguments:
        '{"path":"src/App.tsx","start_line":2,"end_line":8}',
      provider: "runtime_tool_start",
    });
    expect(parseAgentEvent(toolArgsPayload)).toMatchObject({
      type: "tool_input_delta",
      tool_id: "tool-read",
      tool_name: "Read",
      accumulated_arguments:
        '{"path":"src/App.tsx","start_line":2,"end_line":8}',
    });

    const imageTaskCreatedPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-image-task-created",
          sequence: 11,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "image_task.created",
          timestamp: "2026-06-06T00:00:08.500Z",
          payload: {
            taskId: "task-image-1",
            artifactPath: ".lime/tasks/image_generate/task-image-1.json",
            response: {
              task_id: "task-image-1",
              task_type: "image_generate",
              task_family: "image",
              status: "pending_submit",
              normalized_status: "pending",
              artifact_path: ".lime/tasks/image_generate/task-image-1.json",
              record: {
                payload: {
                  prompt: "画一张广州夏天的图",
                  session_id: "session-1",
                  turn_id: "turn-1",
                },
              },
            },
          },
        },
      },
    });

    expect(imageTaskCreatedPayload).toMatchObject({
      type: "image_task_created",
      task_id: "task-image-1",
      task_type: "image_generate",
      task_family: "image",
      artifact_path: ".lime/tasks/image_generate/task-image-1.json",
      payload: {
        prompt: "画一张广州夏天的图",
        session_id: "session-1",
      },
    });
    expect(parseAgentEvent(imageTaskCreatedPayload)).toMatchObject({
      type: "image_task_created",
      task_id: "task-image-1",
      task_type: "image_generate",
    });

    const progressPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-tool-progress",
          sequence: 11,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "tool.progress",
          timestamp: "2026-06-06T00:00:09.000Z",
          payload: {
            toolCallId: "tool-read",
            message: "正在读取文件",
            progress: 1,
            total: 2,
            metadata: {
              notification_kind: "mcp_progress",
            },
          },
        },
      },
    });

    expect(progressPayload).toMatchObject({
      type: "tool_progress",
      tool_id: "tool-read",
      progress: {
        message: "正在读取文件",
        progress: 1,
        total: 2,
        metadata: {
          notification_kind: "mcp_progress",
        },
      },
    });
    expect(parseAgentEvent(progressPayload)).toMatchObject({
      type: "tool_progress",
      tool_id: "tool-read",
    });

    const outputDeltaPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-tool-output",
          sequence: 12,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "tool.output.delta",
          timestamp: "2026-06-06T00:00:10.000Z",
          payload: {
            toolCallId: "tool-read",
            delta: "1 | export {}",
            stream: "stdout",
            metadata: {
              outputRef: "output://tool-read",
            },
          },
        },
      },
    });

    expect(outputDeltaPayload).toMatchObject({
      type: "tool_output_delta",
      tool_id: "tool-read",
      delta: "1 | export {}",
      output_kind: "stdout",
      metadata: {
        outputRef: "output://tool-read",
      },
    });
    expect(parseAgentEvent(outputDeltaPayload)).toMatchObject({
      type: "tool_output_delta",
      tool_id: "tool-read",
      delta: "1 | export {}",
    });

    const fileReadPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-file-read",
          sequence: 13,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "file.read",
          timestamp: "2026-06-06T00:00:11.000Z",
          payload: {
            path: "src/App.tsx",
            toolCallId: "tool-read",
            toolName: "Read",
            outputRef: "output://file-read",
            contentRef: "content://file-read",
            refIds: ["output://file-read", "content://file-read"],
            startLine: 2,
            endLine: 8,
            fileType: "text",
          },
        },
      },
    });

    expect(fileReadPayload).toMatchObject({
      type: "item_completed",
      item: {
        id: "tool-read",
        type: "file_artifact",
        path: "src/App.tsx",
        source: "file_read",
        status: "completed",
        metadata: {
          eventClass: "file.read",
          outputRef: "output://file-read",
          contentRef: "content://file-read",
          startLine: 2,
          endLine: 8,
          fileType: "text",
        },
      },
    });
    expect(parseAgentEvent(fileReadPayload)).toMatchObject({
      type: "item_completed",
      item: {
        type: "file_artifact",
        path: "src/App.tsx",
      },
    });

    const commandStartedPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-command-started",
          sequence: 14,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "command.started",
          timestamp: "2026-06-06T00:00:12.000Z",
          payload: {
            commandId: "command-1",
            canonicalCommand:
              "npm test -- src/lib/api/agentRuntime/threadClient.test.ts",
            commandSummary: "npm test",
            cwd: "/repo",
          },
        },
      },
    });

    expect(commandStartedPayload).toMatchObject({
      type: "item_started",
      item: {
        id: "command-1",
        type: "command_execution",
        command: "npm test -- src/lib/api/agentRuntime/threadClient.test.ts",
        cwd: "/repo",
        status: "in_progress",
      },
    });
    expect(parseAgentEvent(commandStartedPayload)).toMatchObject({
      type: "item_started",
      item: {
        type: "command_execution",
        command: "npm test -- src/lib/api/agentRuntime/threadClient.test.ts",
      },
    });

    const commandOutputPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-command-output",
          sequence: 15,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "command.output",
          timestamp: "2026-06-06T00:00:12.500Z",
          payload: {
            commandId: "command-1",
            toolCallId: "command-1",
            outputRef: "output://npm-test",
            refIds: ["output://npm-test", "log://npm-test"],
            kind: "stdout",
            preview: "1 test passed",
          },
        },
      },
    });

    expect(commandOutputPayload).toMatchObject({
      type: "item_updated",
      item: {
        id: "command-1",
        type: "command_execution",
        status: "in_progress",
        aggregated_output: "1 test passed",
        metadata: {
          eventClass: "command.output",
          outputRef: "output://npm-test",
          refIds: ["output://npm-test", "log://npm-test"],
        },
      },
    });
    expect(parseAgentEvent(commandOutputPayload)).toMatchObject({
      type: "item_updated",
      item: {
        type: "command_execution",
        aggregated_output: "1 test passed",
      },
    });

    const commandExitedPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-command-exited",
          sequence: 16,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "command.exited",
          timestamp: "2026-06-06T00:00:13.000Z",
          payload: {
            commandId: "command-1",
            canonicalCommand:
              "npm test -- src/lib/api/agentRuntime/threadClient.test.ts",
            cwd: "/repo",
            output: "PASS threadClient.test.ts",
            exitCode: 0,
          },
        },
      },
    });

    expect(commandExitedPayload).toMatchObject({
      type: "item_completed",
      item: {
        id: "command-1",
        type: "command_execution",
        aggregated_output: "PASS threadClient.test.ts",
        exit_code: 0,
        status: "completed",
      },
    });
    expect(parseAgentEvent(commandExitedPayload)).toMatchObject({
      type: "item_completed",
      item: {
        type: "command_execution",
        status: "completed",
      },
    });

    const patchAppliedPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-patch-applied",
          sequence: 17,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "patch.applied",
          timestamp: "2026-06-06T00:00:14.000Z",
          payload: {
            patchId: "patch-1",
            changes: {
              "src/App.tsx": {
                kind: "update",
              },
            },
            stdout: "Done",
            success: true,
            autoApproved: false,
          },
        },
      },
    });

    expect(patchAppliedPayload).toMatchObject({
      type: "item_completed",
      item: {
        id: "patch-1",
        type: "patch",
        status: "completed",
        paths: ["src/App.tsx"],
        success: true,
        stdout: "Done",
        metadata: {
          eventClass: "patch.applied",
          autoApproved: false,
        },
      },
    });
    expect(parseAgentEvent(patchAppliedPayload)).toMatchObject({
      type: "item_completed",
      item: {
        type: "patch",
        paths: ["src/App.tsx"],
      },
    });

    const actionRequiredPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-action-required",
          sequence: 18,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "action.required",
          timestamp: "2026-06-06T00:00:15.000Z",
          payload: {
            request_id: "claw_request_turn_1",
            requestId: "approval-1",
            actionId: "approval-1",
            actionType: "tool_confirmation",
            toolName: "exec_command",
            arguments: {
              command: "npm test",
            },
            prompt: "允许执行测试？",
            scope: {
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
            },
          },
        },
      },
    });

    expect(actionRequiredPayload).toMatchObject({
      type: "action_required",
      request_id: "approval-1",
      action_type: "tool_confirmation",
      tool_name: "exec_command",
      arguments: {
        command: "npm test",
      },
      prompt: "允许执行测试？",
      scope: {
        session_id: "session-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
      },
    });
    expect(parseAgentEvent(actionRequiredPayload)).toMatchObject({
      type: "action_required",
      request_id: "approval-1",
      tool_name: "exec_command",
      arguments: {
        command: "npm test",
      },
    });

    const actionResolvedPayload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-action-resolved",
          sequence: 19,
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          type: "action.resolved",
          timestamp: "2026-06-06T00:00:16.000Z",
          payload: {
            request_id: "claw_request_turn_1",
            requestId: "approval-1",
            actionId: "approval-1",
            actionType: "tool_confirmation",
            approved: true,
            feedback: "继续",
            permissionMode: "allow",
          },
        },
      },
    });

    expect(actionResolvedPayload).toMatchObject({
      type: "action_resolved",
      request_id: "approval-1",
      action_type: "tool_confirmation",
      approved: true,
      feedback: "继续",
      permission_mode: "allow",
      data: {
        approved: true,
        feedback: "继续",
        permission_mode: "allow",
      },
    });
    expect(parseAgentEvent(actionResolvedPayload)).toMatchObject({
      type: "action_resolved",
      request_id: "approval-1",
      approved: true,
      feedback: "继续",
    });
  });
});
