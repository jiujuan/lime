import { describe, expect, it, vi } from "vitest";
import { createObjectiveClient } from "./objectiveClient";
import type { AgentRuntimeCommandInvoke } from "./transport";
import type {
  AgentRuntimeClearObjectiveResult,
  AgentRuntimeContinueObjectiveResult,
  ManagedObjective,
} from "./types";

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

function createInvokeCommand(results: unknown[]) {
  const invokeCommand = vi.fn();
  for (const result of results) {
    invokeCommand.mockResolvedValueOnce(result);
  }
  return invokeCommand;
}

describe("agentRuntime objectiveClient", () => {
  it("应通过 Agent Runtime command gateway 调用 objective 控制面并校验返回形态", async () => {
    const invokeCommand = createInvokeCommand([
      managedObjective,
      managedObjective,
      managedObjective,
      clearResult,
      continueResult,
      managedObjective,
    ]);
    const client = createObjectiveClient({
      invokeCommand: invokeCommand as AgentRuntimeCommandInvoke,
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

    expect(invokeCommand).toHaveBeenNthCalledWith(1, "agent_runtime_get_objective", {
      sessionId: "session-1",
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(2, "agent_runtime_set_objective", {
      request: {
        session_id: "session-1",
        workspace_id: "workspace-1",
        objective_text: "完成生产命令 current 迁移",
        success_criteria: ["前端网关 fail closed"],
        budget_policy: null,
        risk_policy: null,
        approval_policy: null,
        continuation_policy: null,
      },
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(
      3,
      "agent_runtime_update_objective_status",
      {
        request: {
          session_id: "session-1",
          status: "blocked",
          blocker_reason: "等待共享写集释放",
        },
      },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      4,
      "agent_runtime_clear_objective",
      {
        request: {
          session_id: "session-1",
          owner_kind: "agent_session",
          owner_id: "session-1",
        },
      },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      5,
      "agent_runtime_continue_objective",
      {
        request: {
          session_id: "session-1",
          owner_kind: "agent_session",
          owner_id: "session-1",
        },
      },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      6,
      "agent_runtime_audit_objective",
      {
        request: {
          session_id: "session-1",
          owner_kind: "agent_session",
          owner_id: "session-1",
        },
      },
    );
  });

  it("get / update 允许真实 null objective", async () => {
    const invokeCommand = createInvokeCommand([null, null]);
    const client = createObjectiveClient({
      invokeCommand: invokeCommand as AgentRuntimeCommandInvoke,
    });

    await expect(client.getAgentRuntimeObjective("session-empty")).resolves.toBe(
      null,
    );
    await expect(
      client.updateAgentRuntimeObjectiveStatus({
        sessionId: "session-empty",
        status: "paused",
      }),
    ).resolves.toBe(null);
  });

  it("managed objective 收到假成功、错误 envelope 或错误状态时应 fail closed", async () => {
    const invokeCommand = createInvokeCommand([
      { success: true },
      {
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      },
      {
        ...managedObjective,
        status: "mystery",
      },
    ]);
    const client = createObjectiveClient({
      invokeCommand: invokeCommand as AgentRuntimeCommandInvoke,
    });

    await expect(client.getAgentRuntimeObjective("session-1")).rejects.toThrow(
      "agent_runtime_get_objective did not return managed objective",
    );
    await expect(
      client.setAgentRuntimeObjective({
        sessionId: "session-1",
        objectiveText: "继续迁移",
      }),
    ).rejects.toThrow(
      "agent_runtime_set_objective did not return managed objective",
    );
    await expect(
      client.auditAgentRuntimeObjective({ sessionId: "session-1" }),
    ).rejects.toThrow(
      "agent_runtime_audit_objective did not return managed objective",
    );
  });

  it("clear / continue 收到缺字段结果时应 fail closed", async () => {
    const invokeCommand = createInvokeCommand([
      {},
      {
        submitted: true,
        queued_turn_id: "queued-1",
      },
    ]);
    const client = createObjectiveClient({
      invokeCommand: invokeCommand as AgentRuntimeCommandInvoke,
    });

    await expect(
      client.clearAgentRuntimeObjective({ sessionId: "session-1" }),
    ).rejects.toThrow(
      "agent_runtime_clear_objective did not return objective clear result",
    );
    await expect(
      client.continueAgentRuntimeObjective({ sessionId: "session-1" }),
    ).rejects.toThrow(
      "agent_runtime_continue_objective did not return objective continue result",
    );
  });
});
