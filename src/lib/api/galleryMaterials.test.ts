import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  createGalleryMetadata,
  deleteGalleryMetadata,
  getGalleryMaterial,
  listGalleryMaterialsByImageCategory,
  listGalleryMaterialsByLayoutCategory,
  listGalleryMaterialsByMood,
  updateGalleryMetadata,
} from "./galleryMaterials";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function createMaterial(id: string) {
  return {
    id,
    projectId: "project-1",
    name: `素材 ${id}`,
    type: "image" as const,
    tags: [],
    createdAt: 1,
  };
}

function createMetadata(materialId: string) {
  return {
    materialId,
    colors: ["#fff"],
    createdAt: 1,
    updatedAt: 2,
  };
}

describe("galleryMaterials API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应获取单个素材", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(createMaterial("m1"));

    await expect(getGalleryMaterial("m1")).resolves.toEqual(
      expect.objectContaining({ id: "m1" }),
    );
    expect(safeInvoke).toHaveBeenCalledWith("get_gallery_material", {
      materialId: "m1",
    });
  });

  it("应代理素材元数据写操作", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(createMetadata("m2"))
      .mockResolvedValueOnce(createMetadata("m2"))
      .mockResolvedValueOnce(undefined);

    await expect(
      createGalleryMetadata({
        materialId: "m2",
        colors: ["#fff"],
      }),
    ).resolves.toEqual(expect.objectContaining({ materialId: "m2" }));
    await expect(
      updateGalleryMetadata("m2", {
        materialId: "m2",
        colors: ["#000"],
      }),
    ).resolves.toEqual(expect.objectContaining({ materialId: "m2" }));
    await expect(deleteGalleryMetadata("m2")).resolves.toBeUndefined();
  });

  it("应代理不同维度的素材查询", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([createMaterial("img-1")])
      .mockResolvedValueOnce([createMaterial("layout-1")])
      .mockResolvedValueOnce([createMaterial("color-1")]);

    await expect(
      listGalleryMaterialsByImageCategory("project-1", "background"),
    ).resolves.toEqual([expect.objectContaining({ id: "img-1" })]);
    await expect(
      listGalleryMaterialsByLayoutCategory("project-1", "grid"),
    ).resolves.toEqual([expect.objectContaining({ id: "layout-1" })]);
    await expect(
      listGalleryMaterialsByMood("project-1", "warm"),
    ).resolves.toEqual([expect.objectContaining({ id: "color-1" })]);
  });

  it("收到对象级 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        source: "electron-degraded-facade",
      },
    });

    await expect(getGalleryMaterial("m-degraded")).rejects.toThrow(
      "get_gallery_material 尚未接入真实图库材料 current 通道",
    );
  });

  it("收到列表级 diagnostic facade 时应 fail closed", async () => {
    const degradedList = [] as unknown[] & {
      __diagnostic?: { category: string };
    };
    degradedList.__diagnostic = {
      category: "app-server-unavailable",
    };
    vi.mocked(safeInvoke).mockResolvedValueOnce(degradedList);

    await expect(
      listGalleryMaterialsByImageCategory("project-degraded"),
    ).rejects.toThrow(
      "list_gallery_materials_by_image_category 尚未接入真实图库材料 current 通道",
    );
  });

  it("收到非图库素材形状时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ id: "m1", type: "image" })
      .mockResolvedValueOnce({
        error: "Electron host command is not supported: get_gallery_material",
      });

    await expect(getGalleryMaterial("m1")).rejects.toThrow(
      "get_gallery_material did not return gallery material",
    );
    await expect(getGalleryMaterial("m1")).rejects.toThrow(
      "get_gallery_material returned an error envelope",
    );
  });

  it("收到带 error 的伪素材对象时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      ...createMaterial("m1"),
      error: "Electron host command is not supported: get_gallery_material",
    });

    await expect(getGalleryMaterial("m1")).rejects.toThrow(
      "get_gallery_material returned an error envelope",
    );
  });

  it("收到非图库元数据或 delete 假结果时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ materialId: "m2" })
      .mockResolvedValueOnce({
        materialId: "m2",
        colors: [],
        createdAt: 1,
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        ...createMetadata("m2"),
        error:
          "Electron host command is not supported: create_gallery_material_metadata",
      });

    await expect(
      createGalleryMetadata({
        materialId: "m2",
        colors: ["#fff"],
      }),
    ).rejects.toThrow(
      "create_gallery_material_metadata did not return gallery material metadata",
    );
    await expect(
      updateGalleryMetadata("m2", {
        materialId: "m2",
        colors: ["#000"],
      }),
    ).rejects.toThrow(
      "update_gallery_material_metadata did not return gallery material metadata",
    );
    await expect(deleteGalleryMetadata("m2")).rejects.toThrow(
      "delete_gallery_material_metadata did not return void result",
    );
    await expect(
      createGalleryMetadata({
        materialId: "m2",
        colors: ["#fff"],
      }),
    ).rejects.toThrow(
      "create_gallery_material_metadata returned an error envelope",
    );
  });

  it("收到非图库素材列表形状时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([{ id: "img-1" }])
      .mockResolvedValueOnce([
        {
          ...createMaterial("img-1"),
          error:
            "Electron host command is not supported: list_gallery_materials_by_image_category",
        },
      ]);

    await expect(
      listGalleryMaterialsByImageCategory("project-1"),
    ).rejects.toThrow(
      "list_gallery_materials_by_image_category did not return gallery materials",
    );
    await expect(
      listGalleryMaterialsByImageCategory("project-1"),
    ).rejects.toThrow(
      "list_gallery_materials_by_image_category returned an error envelope",
    );
  });
});
