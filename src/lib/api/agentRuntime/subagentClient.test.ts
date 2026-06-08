import { describe, expect, it, vi } from "vitest";
import { createSubagentClient } from "./subagentClient";
import type { AgentRuntimeCommandInvoke } from "./transport";
import type {
  AgentRuntimeCloseSubagentResponse,
  AgentRuntimeResumeSubagentResponse,
  AgentRuntimeSpawnSubagentResponse,
  AgentRuntimeStatusSnapshot,
  AgentRuntimeWaitSubagentsResponse,
} from "./types";

const runningStatus: AgentRuntimeStatusSnapshot = {
  session_id: "agent-1",
  kind: "running",
  latest_turn_id: "turn-1",
  latest_turn_status: "running",
  queued_turn_count: 0,
  closed: false,
};

const closedStatus: AgentRuntimeStatusSnapshot = {
  session_id: "agent-1",
  kind: "closed",
  latest_turn_status: "closed",
  closed: true,
};

const spawnResponse: AgentRuntimeSpawnSubagentResponse = {
  agent_id: "agent-1",
  nickname: "Reviewer",
};

const waitResponse: AgentRuntimeWaitSubagentsResponse = {
  status: {
    "agent-1": runningStatus,
  },
  timed_out: false,
};

const resumeResponse: AgentRuntimeResumeSubagentResponse = {
  status: runningStatus,
  cascade_session_ids: ["agent-1"],
  changed_session_ids: ["agent-1"],
};

const closeResponse: AgentRuntimeCloseSubagentResponse = {
  previous_status: closedStatus,
  cascade_session_ids: ["agent-1"],
  changed_session_ids: ["agent-1"],
};

function createInvokeCommand(results: unknown[]) {
  const invokeCommand = vi.fn();
  for (const result of results) {
    invokeCommand.mockResolvedValueOnce(result);
  }
  return invokeCommand;
}

describe("agentRuntime subagentClient", () => {
  it("应通过 Agent Runtime command gateway 调用 subagent 控制面并校验返回形态", async () => {
    const invokeCommand = createInvokeCommand([
      spawnResponse,
      { submission_id: "submission-1" },
      waitResponse,
      resumeResponse,
      closeResponse,
    ]);
    const client = createSubagentClient({
      invokeCommand: invokeCommand as AgentRuntimeCommandInvoke,
    });

    await expect(
      client.spawnAgentRuntimeSubagent({
        parent_session_id: "session-parent",
        message: "审阅当前迁移计划",
        name: "Reviewer",
      }),
    ).resolves.toEqual(spawnResponse);
    await expect(
      client.sendAgentRuntimeSubagentInput({
        id: "agent-1",
        message: "继续",
      }),
    ).resolves.toEqual({ submission_id: "submission-1" });
    await expect(
      client.waitAgentRuntimeSubagents({
        ids: ["agent-1"],
        timeout_ms: 1000,
      }),
    ).resolves.toEqual(waitResponse);
    await expect(
      client.resumeAgentRuntimeSubagent({ id: "agent-1" }),
    ).resolves.toEqual(resumeResponse);
    await expect(
      client.closeAgentRuntimeSubagent({ id: "agent-1" }),
    ).resolves.toEqual(closeResponse);

    expect(invokeCommand).toHaveBeenNthCalledWith(
      1,
      "agent_runtime_spawn_subagent",
      {
        request: {
          parent_session_id: "session-parent",
          message: "审阅当前迁移计划",
          name: "Reviewer",
        },
      },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      2,
      "agent_runtime_send_subagent_input",
      {
        request: {
          id: "agent-1",
          message: "继续",
        },
      },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      3,
      "agent_runtime_wait_subagents",
      {
        request: {
          ids: ["agent-1"],
          timeout_ms: 1000,
        },
      },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      4,
      "agent_runtime_resume_subagent",
      {
        request: {
          id: "agent-1",
        },
      },
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      5,
      "agent_runtime_close_subagent",
      {
        request: {
          id: "agent-1",
        },
      },
    );
  });

  it("spawn / send 收到假成功或错误 envelope 时应 fail closed", async () => {
    const invokeCommand = createInvokeCommand([
      { success: true },
      {
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      },
    ]);
    const client = createSubagentClient({
      invokeCommand: invokeCommand as AgentRuntimeCommandInvoke,
    });

    await expect(
      client.spawnAgentRuntimeSubagent({
        parent_session_id: "session-parent",
        message: "启动子代理",
      }),
    ).rejects.toThrow(
      "agent_runtime_spawn_subagent did not return subagent spawn response",
    );
    await expect(
      client.sendAgentRuntimeSubagentInput({
        id: "agent-1",
        message: "继续",
      }),
    ).rejects.toThrow(
      "agent_runtime_send_subagent_input did not return subagent input response",
    );
  });

  it("wait 收到错误状态快照时应 fail closed", async () => {
    const invokeCommand = createInvokeCommand([
      {
        status: {
          "agent-1": {
            session_id: "agent-1",
            kind: "mystery",
          },
        },
        timed_out: false,
      },
    ]);
    const client = createSubagentClient({
      invokeCommand: invokeCommand as AgentRuntimeCommandInvoke,
    });

    await expect(
      client.waitAgentRuntimeSubagents({ ids: ["agent-1"] }),
    ).rejects.toThrow(
      "agent_runtime_wait_subagents did not return subagent wait response",
    );
  });

  it("resume / close 收到缺字段控制结果时应 fail closed", async () => {
    const invokeCommand = createInvokeCommand([
      {
        status: runningStatus,
        cascade_session_ids: ["agent-1"],
      },
      {
        previous_status: closedStatus,
        cascade_session_ids: ["agent-1"],
        changed_session_ids: [1],
      },
    ]);
    const client = createSubagentClient({
      invokeCommand: invokeCommand as AgentRuntimeCommandInvoke,
    });

    await expect(
      client.resumeAgentRuntimeSubagent({ id: "agent-1" }),
    ).rejects.toThrow(
      "agent_runtime_resume_subagent did not return subagent resume response",
    );
    await expect(
      client.closeAgentRuntimeSubagent({ id: "agent-1" }),
    ).rejects.toThrow(
      "agent_runtime_close_subagent did not return subagent close response",
    );
  });
});
