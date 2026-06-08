import { describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { searchPixabayImages, searchWebImages } from "./imageSearch";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("imageSearch API diagnostic fail-closed", () => {
  it("Pixabay 搜索收到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "search_pixabay_images",
        source: "electron-host",
      },
    });

    await expect(
      searchPixabayImages({
        query: "workspace",
        page: 1,
        perPage: 20,
      }),
    ).rejects.toThrow(
      "search_pixabay_images 尚未接入真实 Image Search current 通道",
    );
  });

  it("Web 图片搜索收到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "search_web_images",
        source: "electron-host",
      },
    });

    await expect(
      searchWebImages({
        query: "workspace",
        page: 1,
        perPage: 20,
      }),
    ).rejects.toThrow(
      "search_web_images 尚未接入真实 Image Search current 通道",
    );
  });
});
