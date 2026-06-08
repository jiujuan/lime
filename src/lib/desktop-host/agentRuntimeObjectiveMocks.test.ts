import { describe, expect, it } from "vitest";

import {
  agentRuntimeObjectiveMocks,
  resetAgentRuntimeObjectiveMocks,
} from "./agentRuntimeObjectiveMocks";

describe("agentRuntimeObjectiveMocks", () => {
  it("保留 thread read 读模型夹具但不伪造 managed objective", () => {
    expect(
      agentRuntimeObjectiveMocks.agent_runtime_get_thread_read({
      sessionId: "session-a",
      }),
    ).toEqual({
      thread_id: "session-a",
      status: "idle",
      pending_requests: [],
      incidents: [],
      queued_turns: [],
      managed_objective: null,
    });
  });

  it("objective 控制面不再注册 desktop-host 默认 mock", () => {
    expect(agentRuntimeObjectiveMocks).not.toHaveProperty(
      "agent_runtime_get_objective",
    );
    expect(agentRuntimeObjectiveMocks).not.toHaveProperty(
      "agent_runtime_set_objective",
    );
    expect(agentRuntimeObjectiveMocks).not.toHaveProperty(
      "agent_runtime_update_objective_status",
    );
    expect(agentRuntimeObjectiveMocks).not.toHaveProperty(
      "agent_runtime_clear_objective",
    );
    expect(agentRuntimeObjectiveMocks).not.toHaveProperty(
      "agent_runtime_continue_objective",
    );
    expect(agentRuntimeObjectiveMocks).not.toHaveProperty(
      "agent_runtime_audit_objective",
    );
  });

  it("reset 保持幂等以兼容 default mock resetter", () => {
    expect(resetAgentRuntimeObjectiveMocks()).toBeUndefined();
  });
});
