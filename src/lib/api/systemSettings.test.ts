import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { openSystemSettingsUrl } from "./systemSettings";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("systemSettings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 Electron Host current 命令打开系统设置 URL", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);

    await expect(
      openSystemSettingsUrl(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      ),
    ).resolves.toBeUndefined();

    expect(safeInvoke).toHaveBeenCalledWith("open_system_settings_url", {
      url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    });
  });

  it("遇到 Electron diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
      },
    });

    await expect(
      openSystemSettingsUrl("ms-settings:clipboard"),
    ).rejects.toThrow(
      "open_system_settings_url 尚未接入真实系统设置壳 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("只接受真实空返回", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ success: true });

    await expect(
      openSystemSettingsUrl("ms-settings:clipboard"),
    ).resolves.toBeUndefined();
    await expect(
      openSystemSettingsUrl("ms-settings:clipboard"),
    ).rejects.toThrow(
      "open_system_settings_url did not return empty Electron host result",
    );
  });
});
