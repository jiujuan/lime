import { describe, expect, it } from "vitest";

import { pluginMocks } from "./pluginMocks";

describe("pluginMocks", () => {
  it("Plugin UI runtime 旧 facade 不再注册默认 mock", () => {
    expect(pluginMocks).not.toHaveProperty("plugin_start_ui_runtime");
    expect(pluginMocks).not.toHaveProperty(
      "plugin_get_ui_runtime_status",
    );
    expect(pluginMocks).not.toHaveProperty("plugin_stop_ui_runtime");
  });

  it("Plugin installed list 默认 mock 不再注册", () => {
    expect(pluginMocks).not.toHaveProperty("plugin_list_installed");
  });

  it("Plugin package / install / uninstall / shell / picker 默认 mock 不再注册", () => {
    const packageCommands = [
      "plugin_list_installed",
      "plugin_inspect_local_package",
      "plugin_fetch_cloud_package",
      "plugin_save_installed_state",
      "plugin_set_disabled",
      "plugin_uninstall_rehearsal",
      "plugin_uninstall",
      "plugin_select_directory",
      "plugin_launch_shell",
    ];

    for (const command of packageCommands) {
      expect(pluginMocks).not.toHaveProperty(command);
    }
  });

  it("Plugin runtime task facade 不再注册默认 mock", () => {
    expect(pluginMocks).not.toHaveProperty("plugin_runtime_start_task");
    expect(pluginMocks).not.toHaveProperty("plugin_runtime_cancel_task");
    expect(pluginMocks).not.toHaveProperty("plugin_runtime_get_task");
    expect(pluginMocks).not.toHaveProperty(
      "plugin_runtime_submit_host_response",
    );
  });
});
