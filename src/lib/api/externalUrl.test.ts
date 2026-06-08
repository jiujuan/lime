import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  openExternalUrlWithSystemBrowser,
  startOemCloudOAuthCallbackBridge,
} from "./externalUrl";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("externalUrl API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 native 命令打开系统默认浏览器", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);

    await expect(
      openExternalUrlWithSystemBrowser("https://user.limeai.run/login"),
    ).resolves.toBeUndefined();

    expect(safeInvoke).toHaveBeenCalledWith("open_external_url", {
      url: "https://user.limeai.run/login",
    });
  });

  it("应通过 native 命令启动 OEM Cloud OAuth 本机回调桥", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      callbackUrl: "http://127.0.0.1:18081/oauth/callback",
    });

    await expect(startOemCloudOAuthCallbackBridge()).resolves.toEqual({
      callbackUrl: "http://127.0.0.1:18081/oauth/callback",
    });

    expect(safeInvoke).toHaveBeenCalledWith(
      "start_oem_cloud_oauth_callback_bridge",
    );
  });

  it("打开外部链接遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
      },
    });

    await expect(
      openExternalUrlWithSystemBrowser("https://user.limeai.run/login"),
    ).rejects.toThrow(
      "open_external_url 尚未接入真实外部链接 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("OAuth 本机回调桥遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
      },
    });

    await expect(startOemCloudOAuthCallbackBridge()).rejects.toThrow(
      "start_oem_cloud_oauth_callback_bridge 尚未接入真实 OAuth 本机回调桥 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("OAuth 本机回调桥应校验返回地址形态", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ callbackUrl: "" });

    await expect(startOemCloudOAuthCallbackBridge()).rejects.toThrow(
      "start_oem_cloud_oauth_callback_bridge 未返回有效 OAuth 本机回调桥地址",
    );
    await expect(startOemCloudOAuthCallbackBridge()).rejects.toThrow(
      "start_oem_cloud_oauth_callback_bridge 未返回有效 OAuth 本机回调桥地址",
    );
  });
});
