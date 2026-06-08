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

  it("checkpoint / handoff / review / replay residual mock 不再伪造成功结果", () => {
    const commands = [
      "agent_runtime_list_file_checkpoints",
      "agent_runtime_get_file_checkpoint",
      "agent_runtime_diff_file_checkpoint",
      "agent_runtime_restore_file_checkpoint",
      "agent_runtime_export_analysis_handoff",
      "agent_runtime_export_handoff_bundle",
      "agent_runtime_export_review_decision_template",
      "agent_runtime_save_review_decision",
      "agent_runtime_export_replay_case",
    ];

    for (const command of commands) {
      expect(() => agentRuntimeMocks[command]?.()).toThrow(
        `${command} 仍属于 P9 Agent Runtime`,
      );
    }
  });
});
