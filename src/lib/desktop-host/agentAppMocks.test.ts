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

  it("只保留 installed list 的 Agent App 默认 mock", () => {
    expect(agentAppMocks).toHaveProperty("agent_app_list_installed");
  });

  it("Agent App package / install / uninstall / shell / picker 默认 mock 不再注册", () => {
    const packageCommands = [
      "agent_app_inspect_local_package",
      "agent_app_fetch_cloud_package",
      "agent_app_save_installed_state",
      "agent_app_set_disabled",
      "agent_app_uninstall_rehearsal",
      "agent_app_uninstall",
      "agent_app_select_directory",
      "agent_app_launch_shell",
    ];

    for (const command of packageCommands) {
      expect(agentAppMocks).not.toHaveProperty(command);
    }
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
