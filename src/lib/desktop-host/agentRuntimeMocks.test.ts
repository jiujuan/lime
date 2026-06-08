import { describe, expect, it } from "vitest";

import { agentRuntimeMocks } from "./agentRuntimeMocks";

describe("agentRuntimeMocks", () => {
  it("App Server session current 命令不再伪造 legacy session mock 成功结果", () => {
    expect(() => agentRuntimeMocks.agent_runtime_create_session()).toThrow(
      "agent_runtime_create_session 已迁移到 App Server JSON-RPC agentSession/start",
    );
    expect(() => agentRuntimeMocks.agent_runtime_list_sessions()).toThrow(
      "agent_runtime_list_sessions 已迁移到 App Server JSON-RPC agentSession/list",
    );
    expect(() => agentRuntimeMocks.agent_runtime_get_session()).toThrow(
      "agent_runtime_get_session 已迁移到 App Server JSON-RPC agentSession/read",
    );
  });

  it("subagent 公开 compat facade 不再注册 desktop-host 默认 mock", () => {
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_spawn_subagent",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_send_subagent_input",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_wait_subagents",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_resume_subagent",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_close_subagent",
    );
  });
});
