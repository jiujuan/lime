import { describe, expect, it } from "vitest";
import { updateMocks } from "./updateMocks";

describe("updateMocks", () => {
  it("不再注册 updater 默认 mock", () => {
    const updaterCommands = [
      "check_update",
      "check_for_updates",
      "get_update_check_settings",
      "get_update_notification_metrics",
      "record_update_notification_action",
      "download_update",
      "start_update_install_session",
      "get_update_install_session",
      "skip_update_version",
      "remind_update_later",
      "dismiss_update_notification",
      "close_update_window",
      "open_update_window",
      "set_update_check_settings",
      "test_update_window",
    ];

    for (const command of updaterCommands) {
      expect(updateMocks).not.toHaveProperty(command);
    }
  });
});
