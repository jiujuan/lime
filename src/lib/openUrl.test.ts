import { beforeEach, describe, expect, it, vi } from "vitest";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import { openUrl } from "./openUrl";

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: vi.fn(),
}));

describe("openUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 externalUrl current 网关打开外部链接", async () => {
    vi.mocked(openExternalUrlWithSystemBrowser).mockResolvedValueOnce(
      undefined,
    );

    await expect(
      openUrl("https://limechat.app/releases/latest"),
    ).resolves.toBeUndefined();

    expect(openExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://limechat.app/releases/latest",
    );
  });

  it("current 网关失败时不回退 window.open 旁路", async () => {
    const windowOpenSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null);

    vi.mocked(openExternalUrlWithSystemBrowser).mockRejectedValueOnce(
      new Error("open_external_url unavailable"),
    );

    await expect(
      openUrl("https://limechat.app/releases/latest"),
    ).rejects.toThrow("open_external_url unavailable");

    expect(windowOpenSpy).not.toHaveBeenCalled();
    windowOpenSpy.mockRestore();
  });
});
