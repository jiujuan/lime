import { describe, expect, it, vi } from "vitest";
import {
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CLEAR,
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_READ,
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_SET,
  APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE,
} from "@/lib/api/appServer";
import {
  createObjectiveClient,
  type AgentRuntimeObjectiveAppServerClient,
} from "./objectiveClient";
import type {
  AgentRuntimeClearObjectiveResult,
  AgentRuntimeContinueObjectiveResult,
  ManagedObjective,
} from "./sessionTypes";

const managedObjective: ManagedObjective = {
  objective_id: "objective-1",
  workspace_id: "workspace-1",
  owner_kind: "agent_session",
  owner_id: "session-1",
  objective_text: "完成生产命令 current 迁移",
  success_criteria: ["前端网关 fail closed", "旧 facade 不伪成功"],
  status: "active",
  budget_policy: null,
  risk_policy: null,
  approval_policy: null,
  continuation_policy: null,
  last_audit_summary: null,
  last_evidence_pack_ref: null,
  last_artifact_refs: [],
  blocker_reason: null,
  created_at: "2026-06-08T08:00:00.000Z",
  updated_at: "2026-06-08T08:00:00.000Z",
};

const clearResult: AgentRuntimeClearObjectiveResult = {
  cleared: true,
};

const continueResult: AgentRuntimeContinueObjectiveResult = {
  submitted: true,
  queued_turn_id: "queued-1",
  objective: managedObjective,
};

const appServerManagedObjective = {
  objectiveId: "objective-1",
  workspaceId: "workspace-1",
  ownerKind: "agent_session",
  ownerId: "session-1",
  objectiveText: "完成生产命令 current 迁移",
  successCriteria: ["前端网关 fail closed", "旧 facade 不伪成功"],
  status: "active",
  budgetPolicy: null,
  riskPolicy: null,
  approvalPolicy: null,
  continuationPolicy: null,
  lastAuditSummary: null,
  lastEvidencePackRef: null,
  lastArtifactRefs: [],
  blockerReason: null,
  createdAt: "2026-06-08T08:00:00.000Z",
  updatedAt: "2026-06-08T08:00:00.000Z",
};

function createAppServerResponse<T>(result: T) {
  return {
    id: 1,
    result,
    response: {
      id: 1,
      result,
    },
    notifications: [],
    messages: [],
  };
}

function createAppServerClient(
  results: {
    read?: unknown;
    set?: unknown;
    update?: unknown;
    clear?: unknown;
    continue?: unknown;
    audit?: unknown;
  } = {},
) {
  const appServerClient = {
    readAgentSessionObjective: vi
      .fn()
      .mockResolvedValue(createAppServerResponse(results.read ?? {})),
    setAgentSessionObjective: vi
      .fn()
      .mockResolvedValue(createAppServerResponse(results.set ?? {})),
    updateAgentSessionObjectiveStatus: vi
      .fn()
      .mockResolvedValue(createAppServerResponse(results.update ?? {})),
    clearAgentSessionObjective: vi
      .fn()
      .mockResolvedValue(createAppServerResponse(results.clear ?? {})),
    continueAgentSessionObjective: vi
      .fn()
      .mockResolvedValue(createAppServerResponse(results.continue ?? {})),
    auditAgentSessionObjective: vi
      .fn()
      .mockResolvedValue(createAppServerResponse(results.audit ?? {})),
  };
  return appServerClient as AgentRuntimeObjectiveAppServerClient;
}

describe("agentRuntime objectiveClient", () => {
  it("objective 全量网关应通过 App Server current methods，并把 camelCase objective 投影为运行时旧形状", async () => {
    const invokeCommand = vi.fn();
    const appServerClient = createAppServerClient({
      read: { objective: appServerManagedObjective },
      set: { objective: appServerManagedObjective },
      update: { objective: appServerManagedObjective },
      clear: clearResult,
      continue: {
        submitted: true,
        queuedTurnId: "queued-1",
        objective: appServerManagedObjective,
        turn: {
          turnId: "turn-1",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      audit: { objective: appServerManagedObjective },
    });
    const client = createObjectiveClient({
      appServerClient,
    });

    await expect(client.getAgentRuntimeObjective("session-1")).resolves.toEqual(
      managedObjective,
    );
    await expect(
      client.setAgentRuntimeObjective({
        sessionId: "session-1",
        workspaceId: "workspace-1",
        objectiveText: "完成生产命令 current 迁移",
        successCriteria: ["前端网关 fail closed"],
      }),
    ).resolves.toEqual(managedObjective);
    await expect(
      client.updateAgentRuntimeObjectiveStatus({
        sessionId: "session-1",
        status: "blocked",
        blockerReason: "等待共享写集释放",
      }),
    ).resolves.toEqual(managedObjective);
    await expect(
      client.clearAgentRuntimeObjective({
        sessionId: "session-1",
        ownerKind: "agent_session",
        ownerId: "session-1",
      }),
    ).resolves.toEqual(clearResult);
    await expect(
      client.continueAgentRuntimeObjective({
        sessionId: "session-1",
        ownerKind: "agent_session",
        ownerId: "session-1",
      }),
    ).resolves.toEqual(continueResult);
    await expect(
      client.auditAgentRuntimeObjective({
        sessionId: "session-1",
        ownerKind: "agent_session",
        ownerId: "session-1",
      }),
    ).resolves.toEqual(managedObjective);

    expect(appServerClient.readAgentSessionObjective).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(appServerClient.setAgentSessionObjective).toHaveBeenCalledWith({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      objectiveText: "完成生产命令 current 迁移",
      successCriteria: ["前端网关 fail closed"],
      budgetPolicy: undefined,
      riskPolicy: undefined,
      approvalPolicy: undefined,
      continuationPolicy: undefined,
    });
    expect(
      appServerClient.updateAgentSessionObjectiveStatus,
    ).toHaveBeenCalledWith({
      sessionId: "session-1",
      status: "blocked",
      blockerReason: "等待共享写集释放",
    });
    expect(appServerClient.clearAgentSessionObjective).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(appServerClient.continueAgentSessionObjective).toHaveBeenCalledWith({
      sessionId: "session-1",
      ownerKind: "agent_session",
      ownerId: "session-1",
    });
    expect(appServerClient.auditAgentSessionObjective).toHaveBeenCalledWith({
      sessionId: "session-1",
      ownerKind: "agent_session",
      ownerId: "session-1",
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("get / update 允许 App Server 返回空 objective", async () => {
    const appServerClient = createAppServerClient({
      read: {},
      update: { objective: undefined },
    });
    const client = createObjectiveClient({
      appServerClient,
    });

    await expect(
      client.getAgentRuntimeObjective("session-empty"),
    ).resolves.toBe(null);
    await expect(
      client.updateAgentRuntimeObjectiveStatus({
        sessionId: "session-empty",
        status: "paused",
      }),
    ).resolves.toBe(null);
  });

  it("CRUD 收到假成功、错误 envelope 或错误状态时应 fail closed", async () => {
    const appServerClient = createAppServerClient({
      read: { success: true },
      set: {
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      },
      update: {
        objective: {
          ...appServerManagedObjective,
          status: "mystery",
        },
      },
      clear: {},
      continue: { submitted: true, queuedTurnId: "queued-1" },
      audit: {
        objective: {
          ...appServerManagedObjective,
          status: "mystery",
        },
      },
    });
    const client = createObjectiveClient({
      appServerClient,
    });

    await expect(client.getAgentRuntimeObjective("session-1")).rejects.toThrow(
      `${APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_READ} did not return managed objective`,
    );
    await expect(
      client.setAgentRuntimeObjective({
        sessionId: "session-1",
        objectiveText: "继续迁移",
      }),
    ).rejects.toThrow(
      `${APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_SET} did not return managed objective`,
    );
    await expect(
      client.updateAgentRuntimeObjectiveStatus({
        sessionId: "session-1",
        status: "paused",
      }),
    ).rejects.toThrow(
      `${APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE} did not return managed objective`,
    );
    await expect(
      client.clearAgentRuntimeObjective({ sessionId: "session-1" }),
    ).rejects.toThrow(
      `${APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CLEAR} did not return objective clear result`,
    );
    await expect(
      client.auditAgentRuntimeObjective({ sessionId: "session-1" }),
    ).rejects.toThrow(
      `${APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_AUDIT} did not return managed objective`,
    );
    await expect(
      client.continueAgentRuntimeObjective({ sessionId: "session-1" }),
    ).rejects.toThrow(
      `${APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE} did not return objective continue result`,
    );
  });
});
