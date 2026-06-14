import { describe, expect, it, vi } from "vitest";
import { createSubagentClient } from "./subagentClient";
import type { AgentRuntimeCommandInvoke } from "./transport";

describe("agentRuntime subagentClient", () => {
  it("public subagent residual 没有 current method 时应 fail closed 且不调用 legacy command gateway", async () => {
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createSubagentClient({ invokeCommand });

    await expect(
      client.spawnAgentRuntimeSubagent({
        parent_session_id: "session-parent",
        message: "审阅当前迁移计划",
        name: "Reviewer",
      }),
    ).rejects.toThrow("Public subagent control is retired");
    await expect(
      client.sendAgentRuntimeSubagentInput({
        id: "agent-1",
        message: "继续",
      }),
    ).rejects.toThrow("Public subagent control is retired");
    await expect(
      client.waitAgentRuntimeSubagents({
        ids: ["agent-1"],
        timeout_ms: 1000,
      }),
    ).rejects.toThrow("Public subagent control is retired");
    await expect(
      client.resumeAgentRuntimeSubagent({ id: "agent-1" }),
    ).rejects.toThrow("Public subagent control is retired");
    await expect(
      client.closeAgentRuntimeSubagent({ id: "agent-1" }),
    ).rejects.toThrow("Public subagent control is retired");

    expect(invokeCommand).not.toHaveBeenCalled();
  });
});
