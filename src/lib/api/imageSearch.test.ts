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
      total: 1,
      total_hits: 1,
      hits: [
        {
          id: 101,
          preview_url: "https://pixabay.example/preview.jpg",
          large_image_url: "https://pixabay.example/large.jpg",
          image_width: 1200,
          image_height: 800,
          tags: "workspace, desk",
          page_url: "https://pixabay.example/photo/101",
          user: "pixabay-user",
        },
      ],
    };
    vi.mocked(safeInvoke).mockResolvedValueOnce(response);

    await expect(searchPixabayImages(req)).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        hits: [
          expect.objectContaining({
            preview_url: "https://pixabay.example/preview.jpg",
            previewUrl: "https://pixabay.example/preview.jpg",
            large_image_url: "https://pixabay.example/large.jpg",
            largeImageUrl: "https://pixabay.example/large.jpg",
            image_width: 1200,
            imageWidth: 1200,
            image_height: 800,
            imageHeight: 800,
            page_url: "https://pixabay.example/photo/101",
            pageUrl: "https://pixabay.example/photo/101",
          }),
        ],
      }),
    );

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

  it("Pixabay 搜索收到空壳 hit 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      total: 1,
      hits: [{ success: true }],
    });

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
      total: 1,
      provider: "pexels",
      hits: [
        {
          id: "201",
          thumbnailUrl: "https://pexels.example/thumb.jpg",
          contentUrl: "https://pexels.example/full.jpg",
          width: 1600,
          height: 900,
          name: "Workspace",
          hostPageUrl: "https://pexels.example/photo/201",
        },
      ],
    };
    vi.mocked(safeInvoke).mockResolvedValueOnce(response);

    await expect(searchWebImages(req)).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        provider: "pexels",
        hits: [
          expect.objectContaining({
            thumbnail_url: "https://pexels.example/thumb.jpg",
            thumbnailUrl: "https://pexels.example/thumb.jpg",
            content_url: "https://pexels.example/full.jpg",
            contentUrl: "https://pexels.example/full.jpg",
            host_page_url: "https://pexels.example/photo/201",
            hostPageUrl: "https://pexels.example/photo/201",
          }),
        ],
      }),
    );

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

  it("Web 图片搜索收到缺 URL 的 hit 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      total: 1,
      provider: "pexels",
      hits: [
        {
          id: "201",
          width: 1600,
          height: 900,
          name: "Workspace",
        },
      ],
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
