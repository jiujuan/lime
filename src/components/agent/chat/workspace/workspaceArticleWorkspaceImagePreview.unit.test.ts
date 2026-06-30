import { describe, expect, it, vi } from "vitest";
import {
  resolveWorkspaceArticleWorkspaceImageLocalPath,
  resolveWorkspaceArticleWorkspaceImageRenderSrc,
  resolveWorkspaceArticleWorkspaceImageSourceLabel,
} from "./workspaceArticleWorkspaceImagePreview";

vi.mock("@/lib/api/fileSystem", () => ({
  resolveLocalFilePreviewUrl: (path?: string | null) =>
    path?.startsWith("/") ? `asset://${path}` : null,
}));

describe("workspaceArticleWorkspaceImagePreview", () => {
  it("远程 URL 优先作为可渲染图片源", () => {
    expect(
      resolveWorkspaceArticleWorkspaceImageRenderSrc({
        url: "https://lime.local/image.png",
        localPath: "/tmp/image.png",
      }),
    ).toBe("https://lime.local/image.png");
  });

  it("没有远程 URL 时应把绝对本地路径转换为 asset URL", () => {
    expect(
      resolveWorkspaceArticleWorkspaceImageRenderSrc({
        url: null,
        localPath: "/tmp/lime-content-factory/image.png",
      }),
    ).toBe("asset:///tmp/lime-content-factory/image.png");
  });

  it("相对路径只作为来源证据保留，不伪造可渲染 URL", () => {
    const image = {
      url: null,
      cachedPath: ".lime/content-factory/image.png",
    };

    expect(resolveWorkspaceArticleWorkspaceImageRenderSrc(image)).toBeNull();
    expect(resolveWorkspaceArticleWorkspaceImageLocalPath(image)).toBe(
      ".lime/content-factory/image.png",
    );
    expect(resolveWorkspaceArticleWorkspaceImageSourceLabel(image)).toBe(
      ".lime/content-factory/image.png",
    );
  });
});
