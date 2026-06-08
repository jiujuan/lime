import { describe, expect, it } from "vitest";

import {
  agentRuntimeObjectiveMocks,
  resetAgentRuntimeObjectiveMocks,
} from "./agentRuntimeObjectiveMocks";

describe("agentRuntimeObjectiveMocks", () => {
  it("Agent Runtime objective / thread read 不再注册 desktop-host 默认 mock", () => {
    expect(agentRuntimeObjectiveMocks).not.toHaveProperty(
      "agent_runtime_get_thread_read",
    );
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
