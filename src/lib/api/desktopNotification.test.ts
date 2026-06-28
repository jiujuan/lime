import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { showDesktopNotification } from "./desktopNotification";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("desktopNotification API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("通过 Electron Host current 通道发送桌面通知", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({ status: "sent" });

    await expect(
      showDesktopNotification({
        body: "Lime local output · +520 ms",
        tag: "claw-trace-regression-alert-123",
        title: "Regression alert: Critical",
      }),
    ).resolves.toEqual({ status: "sent" });

    expect(safeInvoke).toHaveBeenCalledWith("show_desktop_notification", {
      request: {
        body: "Lime local output · +520 ms",
        tag: "claw-trace-regression-alert-123",
        title: "Regression alert: Critical",
      },
    });
  });

  it("遇到 diagnostic facade 时 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "show_desktop_notification",
        source: "electron-host-diagnostic",
      },
    });

    await expect(
      showDesktopNotification({
        body: "body",
        tag: "tag",
        title: "title",
      }),
    ).rejects.toThrow(
      "show_desktop_notification 尚未接入真实桌面通知 Electron Host current 通道",
    );
  });

  it("拒绝非桌面通知结果形态", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({ success: true });

    await expect(
      showDesktopNotification({
        body: "body",
        tag: "tag",
        title: "title",
      }),
    ).rejects.toThrow(
      "show_desktop_notification did not return desktop notification result",
    );
  });
});
