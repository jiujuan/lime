import { describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { searchPixabayImages, searchWebImages } from "./imageSearch";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("imageSearch API", () => {
  it("Pixabay 搜索在缺少 App Server current owner 时应 fail closed", async () => {
    await expect(
      searchPixabayImages({
        query: "workspace",
        page: 1,
        perPage: 20,
      }),
    ).rejects.toThrow(
      "Image Search 尚未接入 App Server / RuntimeCore current 通道",
    );

    expect(safeInvoke).not.toHaveBeenCalledWith(
      "search_pixabay_images",
      expect.anything(),
    );
  });

  it("Web 图片搜索在缺少 App Server current owner 时应 fail closed", async () => {
    await expect(
      searchWebImages({
        query: "workspace",
        page: 1,
        perPage: 20,
      }),
    ).rejects.toThrow(
      "Image Search 尚未接入 App Server / RuntimeCore current 通道",
    );

    expect(safeInvoke).not.toHaveBeenCalledWith(
      "search_web_images",
      expect.anything(),
    );
  });
});
