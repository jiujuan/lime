import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupMountedRoots,
  renderIntoDom,
  setReactActEnvironment,
  type MountedRoot,
} from "@/components/image-gen/test-utils";
import { changeLimeLocale } from "@/i18n/createI18n";

const { mockUseGalleryMaterial, mockConvertLocalFileSrc } = vi.hoisted(() => ({
  mockUseGalleryMaterial: vi.fn(),
  mockConvertLocalFileSrc: vi.fn(),
}));

vi.mock("@/hooks/useGalleryMaterial", () => ({
  useGalleryMaterial: mockUseGalleryMaterial,
}));

vi.mock("@/lib/api/fileSystem", () => ({
  convertLocalFileSrc: mockConvertLocalFileSrc,
}));

import { ImageGallery } from "./ImageGallery";

const mountedRoots: MountedRoot[] = [];

function renderGallery(
  props: Partial<ComponentProps<typeof ImageGallery>> = {},
) {
  return renderIntoDom(
    <ImageGallery projectId="project-1" {...props} />,
    mountedRoots,
  ).container;
}

describe("ImageGallery", () => {
  beforeEach(async () => {
    setReactActEnvironment();
    await changeLimeLocale("zh-CN");
    vi.clearAllMocks();
    mockConvertLocalFileSrc.mockReturnValue("asset://preview.png");
    mockUseGalleryMaterial.mockReturnValue({
      materials: [
        {
          id: "image-1",
          type: "image",
          projectId: "project-1",
          name: "预览图",
          filePath: "/tmp/preview.png",
          tags: [],
          createdAt: 1,
        },
      ],
      loading: false,
      filter: { type: "image" },
      setFilter: vi.fn(),
    });
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
  });

  it("本地图片预览应走统一文件 URL 转换", () => {
    const container = renderGallery();
    const image = container.querySelector("img");

    expect(image).toBeInstanceOf(HTMLImageElement);
    expect(mockConvertLocalFileSrc).toHaveBeenCalledWith("/tmp/preview.png");
    expect(image?.getAttribute("src")).toBe("asset://preview.png");
  });

  it("英文界面应使用 workspace namespace 文案", async () => {
    await changeLimeLocale("en-US");
    const container = renderGallery({ selectedIds: ["image-1"] });

    expect(container.querySelector("input")?.getAttribute("placeholder")).toBe(
      "Search images...",
    );
    expect(
      container.querySelector('button[aria-label="Grid view"]'),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(
      container.querySelector('button[aria-label="List view"]'),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(container.textContent).toContain("All");
    expect(container.textContent).toContain("Product");
    expect(container.textContent).toContain("1 image(s), 1 selected");
    expect(container.textContent).toContain(
      "Double-click an image to insert it into the current canvas",
    );
  });
});
