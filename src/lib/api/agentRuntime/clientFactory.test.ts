import { describe, expect, it, vi } from "vitest";
import {
  createAgentRuntimeClient,
  type AgentRuntimeAppServerClient,
} from "./clientFactory";
import type { AgentRuntimeLifecycleClient } from "./threadClient";

const appServerCheckpointSummary = {
  checkpointId: "checkpoint-1",
  turnId: "turn-1",
  path: "src/App.tsx",
  source: "tool_result",
  updatedAt: "2026-06-06T00:00:00.000Z",
  validationIssueCount: 0,
};

const appServerManagedObjective = {
  objectiveId: "objective-1",
  workspaceId: "workspace-1",
  ownerKind: "agent_session",
  ownerId: "session-1",
  objectiveText: "完成生产命令 current 迁移",
  successCriteria: ["前端网关 fail closed"],
  status: "active",
  budgetPolicy: null,
  riskPolicy: null,
  approvalPolicy: null,
  continuationPolicy: null,
  lastAuditSummary: null,
  lastEvidencePackRef: null,
  lastArtifactRefs: [],
  blockerReason: null,
  createdAt: "2026-06-06T00:00:00.000Z",
  updatedAt: "2026-06-06T00:00:00.000Z",
};

function appServerClientMock(): AgentRuntimeAppServerClient {
  return {
    startSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "desktop",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
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
    updateSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          title: "新标题",
          model: "gpt-5.4",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:01.000Z",
          messagesCount: 0,
        },
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    archiveManySessions: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        updatedSessionIds: ["session-1"],
        updatedCount: 1,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    request: vi.fn().mockImplementation((method: string) => {
      if (method === "workspaceSkillBindings/list") {
        return Promise.resolve({
          id: 1,
          result: {
            bindings: {
              request: {
                workspace_root: "/tmp/work",
                caller: "assistant",
                surface: {
                  workbench: true,
                  browser_assist: false,
                },
              },
              warnings: [],
              counts: {
                registered_total: 1,
                ready_for_manual_enable_total: 1,
                blocked_total: 0,
                query_loop_visible_total: 0,
                tool_runtime_visible_total: 0,
                launch_enabled_total: 0,
              },
              bindings: [],
            },
          },
          response: {
            id: 1,
            result: {},
          },
          messages: [],
          notifications: [],
        });
      }

      return Promise.resolve({
        id: 1,
        result: {
          sessions: [
            {
              sessionId: "session-1",
              threadId: "thread-1",
              title: "Session 1",
              model: "gpt-5.4",
              createdAt: "2026-06-06T00:00:00.000Z",
              updatedAt: "2026-06-06T00:00:00.000Z",
              messagesCount: 0,
            },
          ],
        },
        response: {
          id: 1,
          result: {},
        },
        messages: [],
        notifications: [],
      });
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
    listAgentSessionFileCheckpoints: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        checkpointCount: 1,
        checkpoints: [appServerCheckpointSummary],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    getAgentSessionFileCheckpoint: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        checkpoint: appServerCheckpointSummary,
        livePath: "/tmp/work/src/App.tsx",
        snapshotPath: "/tmp/work/.lime/checkpoints/checkpoint-1/App.tsx",
        versionHistory: [],
        validationIssues: [],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    diffAgentSessionFileCheckpoint: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        checkpoint: appServerCheckpointSummary,
        diff: [],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    restoreAgentSessionFileCheckpoint: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        checkpoint: appServerCheckpointSummary,
        livePath: "src/App.tsx",
        snapshotPath: ".lime/checkpoints/checkpoint-1/App.tsx",
        backupPath: null,
        restoredAt: "2026-06-06T00:00:01.000Z",
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    listCapabilities: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        capabilities: [],
        runtimeCapabilityManifest: {
          schemaVersion: "lime-runtime-capability-manifest/v0.1",
          runtimeId: "app-server",
          generatedAt: "2026-06-12T00:00:00.000Z",
          capabilities: [],
        },
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    readAgentSessionObjective: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        objective: appServerManagedObjective,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    setAgentSessionObjective: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        objective: appServerManagedObjective,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    updateAgentSessionObjectiveStatus: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        objective: appServerManagedObjective,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    clearAgentSessionObjective: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        cleared: true,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    continueAgentSessionObjective: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        submitted: true,
        queuedTurnId: "queued-1",
        objective: appServerManagedObjective,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    auditAgentSessionObjective: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        objective: appServerManagedObjective,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    exportEvidence: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "running",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:03.000Z",
        },
        turns: [],
        events: [],
        artifacts: [],
        exportedAt: "2026-06-06T00:00:04.000Z",
        evidencePack: {
          packRelativeRoot: ".lime/harness/sessions/session-1/evidence",
          packAbsoluteRoot:
            "/tmp/work/.lime/harness/sessions/session-1/evidence",
          exportedAt: "2026-06-06T00:00:05.000Z",
          threadStatus: "running",
          latestTurnStatus: "accepted",
          turnCount: 2,
          itemCount: 6,
          pendingRequestCount: 1,
          queuedTurnCount: 0,
          recentArtifactCount: 1,
          knownGaps: [],
          artifacts: [],
        },
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    exportHandoffBundle: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        workspaceId: "workspace-1",
        workspaceRoot: "/tmp/work",
        bundleRelativeRoot: ".lime/harness/sessions/session-1",
        bundleAbsoluteRoot: "/tmp/work/.lime/harness/sessions/session-1",
        exportedAt: "2026-06-06T00:00:06.000Z",
        threadStatus: "running",
        pendingRequestCount: 1,
        queuedTurnCount: 0,
        activeSubagentCount: 0,
        todoTotal: 0,
        todoPending: 0,
        todoInProgress: 0,
        todoCompleted: 0,
        artifacts: [
          {
            kind: "handoff",
            title: "handoff.md",
            relativePath: ".lime/harness/sessions/session-1/handoff.md",
            absolutePath:
              "/tmp/work/.lime/harness/sessions/session-1/handoff.md",
            bytes: 128,
          },
        ],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    exportReplayCase: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        workspaceId: "workspace-1",
        workspaceRoot: "/tmp/work",
        replayRelativeRoot: ".lime/harness/sessions/session-1/replay",
        replayAbsoluteRoot: "/tmp/work/.lime/harness/sessions/session-1/replay",
        handoffBundleRelativeRoot: ".lime/harness/sessions/session-1",
        evidencePackRelativeRoot: ".lime/harness/sessions/session-1/evidence",
        exportedAt: "2026-06-06T00:00:07.000Z",
        threadStatus: "running",
        pendingRequestCount: 1,
        queuedTurnCount: 0,
        linkedHandoffArtifactCount: 1,
        linkedEvidenceArtifactCount: 1,
        recentArtifactCount: 0,
        artifacts: [],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    exportAnalysisHandoff: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        workspaceId: "workspace-1",
        workspaceRoot: "/tmp/work",
        sanitizedWorkspaceRoot: "/tmp/work",
        analysisRelativeRoot: ".lime/harness/sessions/session-1/analysis",
        analysisAbsoluteRoot:
          "/tmp/work/.lime/harness/sessions/session-1/analysis",
        handoffBundleRelativeRoot: ".lime/harness/sessions/session-1",
        evidencePackRelativeRoot: ".lime/harness/sessions/session-1/evidence",
        replayCaseRelativeRoot: ".lime/harness/sessions/session-1/replay",
        exportedAt: "2026-06-06T00:00:08.000Z",
        threadStatus: "running",
        pendingRequestCount: 1,
        queuedTurnCount: 0,
        title: "analysis",
        copyPrompt: "review",
        artifacts: [],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    exportReviewDecisionTemplate: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        workspaceId: "workspace-1",
        workspaceRoot: "/tmp/work",
        reviewRelativeRoot: ".lime/harness/sessions/session-1/review",
        reviewAbsoluteRoot: "/tmp/work/.lime/harness/sessions/session-1/review",
        analysisRelativeRoot: ".lime/harness/sessions/session-1/analysis",
        analysisAbsoluteRoot:
          "/tmp/work/.lime/harness/sessions/session-1/analysis",
        handoffBundleRelativeRoot: ".lime/harness/sessions/session-1",
        evidencePackRelativeRoot: ".lime/harness/sessions/session-1/evidence",
        replayCaseRelativeRoot: ".lime/harness/sessions/session-1/replay",
        exportedAt: "2026-06-06T00:00:09.000Z",
        threadStatus: "running",
        pendingRequestCount: 1,
        queuedTurnCount: 0,
        title: "review",
        defaultDecisionStatus: "pending_review",
        decision: {
          decisionStatus: "pending_review",
          riskLevel: "unknown",
          riskTags: [],
          followupActions: [],
          regressionRequirements: [],
        },
        decisionStatusOptions: ["pending_review"],
        riskLevelOptions: ["unknown"],
        reviewChecklist: [],
        analysisArtifacts: [],
        artifacts: [],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    saveReviewDecision: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        workspaceId: "workspace-1",
        workspaceRoot: "/tmp/work",
        reviewRelativeRoot: ".lime/harness/sessions/session-1/review",
        reviewAbsoluteRoot: "/tmp/work/.lime/harness/sessions/session-1/review",
        analysisRelativeRoot: ".lime/harness/sessions/session-1/analysis",
        analysisAbsoluteRoot:
          "/tmp/work/.lime/harness/sessions/session-1/analysis",
        handoffBundleRelativeRoot: ".lime/harness/sessions/session-1",
        evidencePackRelativeRoot: ".lime/harness/sessions/session-1/evidence",
        replayCaseRelativeRoot: ".lime/harness/sessions/session-1/replay",
        exportedAt: "2026-06-06T00:00:10.000Z",
        threadStatus: "running",
        pendingRequestCount: 1,
        queuedTurnCount: 0,
        title: "review",
        defaultDecisionStatus: "pending_review",
        decision: {
          decisionStatus: "accepted",
          riskLevel: "low",
          riskTags: [],
          followupActions: [],
          regressionRequirements: [],
        },
        decisionStatusOptions: ["accepted"],
        riskLevelOptions: ["low"],
        reviewChecklist: [],
        analysisArtifacts: [],
        artifacts: [],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    drainEvents: vi.fn().mockResolvedValue([]),
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
      response: { id: 1, result: {} },
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
      response: { id: 4, result: {} },
      messages: [],
      notifications: [],
    }),
  } as AgentRuntimeLifecycleClient;
}

describe("agentRuntime clientFactory", () => {
  it("传入 invoke 时 queue/session control 应走 App Server current，且不再暴露 retired site adapter surface", async () => {
    const invoke = vi.fn();
    const appServerClient = appServerClientMock();
    const client = createAgentRuntimeClient({ invoke, appServerClient });

    await expect(
      client.resumeAgentRuntimeThread({
        session_id: "session-1",
      }),
    ).resolves.toBe(true);
    expect(client).not.toHaveProperty("siteListAdapters");
    expect(client).not.toHaveProperty("siteRunAdapter");
    expect(client).not.toHaveProperty("spawnAgentRuntimeSubagent");
    expect(client).not.toHaveProperty("waitAgentRuntimeSubagents");

    expect(appServerClient.resumeAgentSessionThread).toHaveBeenCalledWith({
      sessionId: "session-1",
      resumeContract: expect.objectContaining({
        schemaVersion: "lime-runtime-resume-contract/v0.1",
        sessionId: "session-1",
      }),
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("仅注入 bridgeInvoke 时 queue/session control 不应回退到 legacy bridgeInvoke", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce(true);
    const appServerClient = appServerClientMock();
    const client = createAgentRuntimeClient({ bridgeInvoke, appServerClient });

    await expect(
      client.resumeAgentRuntimeThread({
        session_id: "session-1",
      }),
    ).resolves.toBe(true);

    expect(appServerClient.resumeAgentSessionThread).toHaveBeenCalledWith({
      sessionId: "session-1",
      resumeContract: expect.objectContaining({
        schemaVersion: "lime-runtime-resume-contract/v0.1",
        sessionId: "session-1",
      }),
    });
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("session create/list/get 应走同一个 App Server client，不复用 legacy bridgeInvoke", async () => {
    const appServerClient = appServerClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.createAgentRuntimeSession("workspace-1", "新会话", "react"),
    ).resolves.toBe("session-1");
    await expect(
      client.listAgentRuntimeSessions({ workspaceId: "workspace-1" }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "session-1",
        thread_id: "thread-1",
        name: "Session 1",
      }),
    ]);
    await expect(client.getAgentRuntimeSession("session-1")).resolves.toEqual(
      expect.objectContaining({
        id: "session-1",
        thread_id: "thread-1",
      }),
    );
    await expect(
      client.updateAgentRuntimeSession({
        session_id: "session-1",
        name: "新标题",
        archived: true,
      }),
    ).resolves.toBeUndefined();
    await expect(client.deleteAgentRuntimeSession("session-1")).resolves.toBe(
      undefined,
    );

    expect(appServerClient.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "desktop",
        workspaceId: "workspace-1",
      }),
    );
    expect(appServerClient.request).toHaveBeenCalledWith("agentSession/list", {
      workspaceId: "workspace-1",
    });
    expect(appServerClient.readSession).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(appServerClient.updateSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      title: "新标题",
      archived: true,
    });
    expect(appServerClient.updateSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      archived: true,
    });
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("App Server detail 缺省旧数组字段时 get session 应补齐为可 hydrate 结构", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.readSession).mockResolvedValueOnce({
      id: 1,
      result: {
        session: {
          sessionId: "session-failed",
          threadId: "thread-failed",
          appId: "agent-chat",
          status: "failed",
          createdAt: "2026-06-07T04:39:20.025Z",
          updatedAt: "2026-06-07T04:42:05.905Z",
        },
        turns: [
          {
            turnId: "turn-failed",
            sessionId: "session-failed",
            threadId: "thread-failed",
            status: "failed",
            startedAt: "2026-06-07T04:39:20.100Z",
            completedAt: "2026-06-07T04:42:05.905Z",
          },
        ],
        detail: {
          id: "session-failed",
          thread_id: "thread-failed",
          created_at: 1780807160025,
          updated_at: 1780807325905,
          thread_read: {
            thread_id: "thread-failed",
            status: "failed",
          },
        },
      },
      response: {
        id: 1,
        result: {
          session: {
            sessionId: "session-failed",
            threadId: "thread-failed",
            appId: "agent-chat",
            status: "failed",
            createdAt: "2026-06-07T04:39:20.025Z",
            updatedAt: "2026-06-07T04:42:05.905Z",
          },
          turns: [
            {
              turnId: "turn-failed",
              sessionId: "session-failed",
              threadId: "thread-failed",
              status: "failed",
              startedAt: "2026-06-07T04:39:20.100Z",
              completedAt: "2026-06-07T04:42:05.905Z",
            },
          ],
          detail: {
            id: "session-failed",
            thread_id: "thread-failed",
            created_at: 1780807160025,
            updated_at: 1780807325905,
            thread_read: {
              thread_id: "thread-failed",
              status: "failed",
            },
          },
        },
      },
      messages: [],
      notifications: [],
    });
    const client = createAgentRuntimeClient({
      appServerClient,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.getAgentRuntimeSession("session-failed"),
    ).resolves.toMatchObject({
      id: "session-failed",
      messages: [],
      turns: [
        {
          id: "turn-failed",
          thread_id: "thread-failed",
          status: "failed",
        },
      ],
      items: [],
      queued_turns: [],
      todo_items: [],
      child_subagent_sessions: [],
      thread_read: {
        status: "failed",
      },
    });
  });

  it("turn lifecycle 应走 App Server client，不复用 legacy bridgeInvoke", async () => {
    const appServerClient = appServerClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await client.submitAgentRuntimeTurn({
      message: "继续",
      session_id: "session-1",
      event_name: "event-1",
      workspace_id: "workspace-1",
    });

    expect(appServerClient.startTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      input: {
        text: "继续",
      },
      runtimeOptions: {
        stream: true,
        eventName: "event-1",
        hostOptions: {
          asterChatRequest: {
            message: "继续",
            session_id: "session-1",
            event_name: "event-1",
            workspace_id: "workspace-1",
          },
        },
      },
    });
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("turn lifecycle 可由标准 runtime client facade 注入，聚合工厂不直连旧命令", async () => {
    const appServerClient = appServerClientMock();
    const standardRuntimeClient = standardRuntimeClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      standardRuntimeClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.submitAgentRuntimeTurn({
        message: "继续",
        session_id: "session-1",
        event_name: "event-1",
      }),
    ).resolves.toBeUndefined();
    await expect(
      client.getAgentRuntimeThreadRead("session-1"),
    ).resolves.toMatchObject({
      thread_id: "thread-1",
      status: "idle",
    });

    expect(standardRuntimeClient.startTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      input: {
        text: "继续",
      },
      runtimeOptions: {
        stream: true,
        eventName: "event-1",
        hostOptions: {
          asterChatRequest: {
            message: "继续",
            session_id: "session-1",
            event_name: "event-1",
            workspace_id: "",
          },
        },
      },
    });
    expect(standardRuntimeClient.readThread).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(appServerClient.startTurn).not.toHaveBeenCalled();
    expect(appServerClient.readSession).not.toHaveBeenCalled();
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("file checkpoint 应走 App Server client，不复用 legacy bridgeInvoke", async () => {
    const appServerClient = appServerClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.listAgentRuntimeFileCheckpoints({ session_id: "session-1" }),
    ).resolves.toMatchObject({
      session_id: "session-1",
      checkpoint_count: 1,
    });

    expect(
      appServerClient.listAgentSessionFileCheckpoints,
    ).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("evidence pack export 应走 App Server client，不复用 legacy bridgeInvoke", async () => {
    const appServerClient = appServerClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.exportAgentRuntimeEvidencePack("session-1"),
    ).resolves.toMatchObject({
      session_id: "session-1",
      thread_id: "thread-1",
      pack_relative_root: ".lime/harness/sessions/session-1/evidence",
    });

    expect(appServerClient.exportEvidence).toHaveBeenCalledWith({
      sessionId: "session-1",
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    });
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("handoff bundle export 应走 App Server client，不复用 legacy bridgeInvoke", async () => {
    const appServerClient = appServerClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.exportAgentRuntimeHandoffBundle("session-1"),
    ).resolves.toMatchObject({
      session_id: "session-1",
      thread_id: "thread-1",
      bundle_relative_root: ".lime/harness/sessions/session-1",
    });

    expect(appServerClient.exportHandoffBundle).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("workspace skill bindings 应走 App Server client，不复用 legacy bridgeInvoke", async () => {
    const appServerClient = appServerClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.listWorkspaceSkillBindings({
        workspaceRoot: "/tmp/work",
        caller: "assistant",
        workbench: true,
      }),
    ).resolves.toMatchObject({
      counts: {
        registered_total: 1,
        ready_for_manual_enable_total: 1,
      },
    });

    expect(appServerClient.request).toHaveBeenCalledWith(
      "workspaceSkillBindings/list",
      {
        workspaceRoot: "/tmp/work",
        caller: "assistant",
        workbench: true,
      },
    );
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });
});
