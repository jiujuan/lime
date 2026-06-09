import { describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { searchPixabayImages, searchWebImages } from "./imageSearch";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("imageSearch API retired facade fail-closed", () => {
  it("Pixabay 搜索不应再调用旧 diagnostic/native facade", async () => {
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
    ).rejects.toThrow("旧 Tauri in-process command 已退役");

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("Web 图片搜索不应再调用旧 diagnostic/native facade", async () => {
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
    ).rejects.toThrow("旧 Tauri in-process command 已退役");

    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
