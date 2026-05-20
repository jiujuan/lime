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
});
