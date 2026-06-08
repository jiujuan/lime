import { describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { searchPixabayImages, searchWebImages } from "./imageSearch";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("imageSearch API", () => {
  it("应通过 native 命令搜索 Pixabay 图片", async () => {
    const req = {
      query: "workspace",
      page: 1,
      perPage: 20,
      orientation: "landscape",
    };
    const response = {
      total: 0,
      total_hits: 0,
      hits: [],
    };
    vi.mocked(safeInvoke).mockResolvedValueOnce(response);

    await expect(searchPixabayImages(req)).resolves.toEqual(response);

    expect(safeInvoke).toHaveBeenCalledWith("search_pixabay_images", { req });
  });

  it("Pixabay 搜索收到非搜索结果时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({ success: true });

    await expect(
      searchPixabayImages({
        query: "workspace",
        page: 1,
        perPage: 20,
      }),
    ).rejects.toThrow(
      "search_pixabay_images did not return a Pixabay image search result",
    );
  });

  it("应通过 native 命令搜索 Web 图片", async () => {
    const req = {
      query: "workspace",
      page: 2,
      perPage: 12,
      aspect: "landscape" as const,
    };
    const response = {
      total: 0,
      provider: "pexels",
      hits: [],
    };
    vi.mocked(safeInvoke).mockResolvedValueOnce(response);

    await expect(searchWebImages(req)).resolves.toEqual(response);

    expect(safeInvoke).toHaveBeenCalledWith("search_web_images", { req });
  });

  it("Web 图片搜索收到非搜索结果时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      total: 0,
      hits: [],
    });

    await expect(
      searchWebImages({
        query: "workspace",
        page: 1,
        perPage: 20,
      }),
    ).rejects.toThrow(
      "search_web_images did not return a web image search result",
    );
  });
});
