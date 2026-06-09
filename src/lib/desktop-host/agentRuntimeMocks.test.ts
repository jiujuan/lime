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

  it("App Server session update / delete current 命令不再注册默认 mock", () => {
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_update_session",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_delete_session",
    );
  });

  it("App Server evidence export current 命令不再注册默认 mock", () => {
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_export_evidence_pack",
    );
  });

  it("process / Aster legacy residual 不再注册 desktop-host 默认 mock", () => {
    expect(agentRuntimeMocks).not.toHaveProperty("agent_get_process_status");
    expect(agentRuntimeMocks).not.toHaveProperty("agent_start_process");
    expect(agentRuntimeMocks).not.toHaveProperty("agent_stop_process");
    expect(agentRuntimeMocks).not.toHaveProperty("aster_agent_init");
    expect(agentRuntimeMocks).not.toHaveProperty("aster_agent_status");
    expect(agentRuntimeMocks).not.toHaveProperty(
      "aster_agent_configure_provider",
    );
    expect(agentRuntimeMocks).not.toHaveProperty("aster_agent_reset");
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

  it("App Server file checkpoint current 命令不再注册 desktop-host 默认 mock", () => {
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_list_file_checkpoints",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_get_file_checkpoint",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_diff_file_checkpoint",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_restore_file_checkpoint",
    );
  });

  it("App Server current export 命令不再注册 desktop-host 默认 mock", () => {
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_export_analysis_handoff",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_export_handoff_bundle",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_export_review_decision_template",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_save_review_decision",
    );
    expect(agentRuntimeMocks).not.toHaveProperty(
      "agent_runtime_export_replay_case",
    );
  });
});
