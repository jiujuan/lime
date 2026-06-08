import { describe, expect, it } from "vitest";

import { agentAppMocks } from "./agentAppMocks";

describe("agentAppMocks", () => {
  it("Agent App UI runtime 旧 facade 不再注册默认 mock", () => {
    expect(agentAppMocks).not.toHaveProperty("agent_app_start_ui_runtime");
    expect(agentAppMocks).not.toHaveProperty(
      "agent_app_get_ui_runtime_status",
    );
    expect(agentAppMocks).not.toHaveProperty("agent_app_stop_ui_runtime");
  });

  it("保留仍需单独 current 判定的 Agent App mock", () => {
    expect(agentAppMocks).toHaveProperty("agent_app_list_installed");
    expect(agentAppMocks).toHaveProperty("agent_app_select_directory");
    expect(agentAppMocks).toHaveProperty("agent_app_launch_shell");
  });

  it("Agent App runtime task facade 不再注册默认 mock", () => {
    expect(agentAppMocks).not.toHaveProperty("agent_app_runtime_start_task");
    expect(agentAppMocks).not.toHaveProperty("agent_app_runtime_cancel_task");
    expect(agentAppMocks).not.toHaveProperty("agent_app_runtime_get_task");
    expect(agentAppMocks).not.toHaveProperty(
      "agent_app_runtime_submit_host_response",
    );
  });
});
