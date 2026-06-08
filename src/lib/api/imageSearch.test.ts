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
});
