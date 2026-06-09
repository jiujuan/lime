import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGalleryMetadata,
  deleteGalleryMetadata,
  getGalleryMaterial,
  listGalleryMaterialsByImageCategory,
  listGalleryMaterialsByLayoutCategory,
  listGalleryMaterialsByMood,
  updateGalleryMetadata,
} from "./galleryMaterials";

const appServerMocks = vi.hoisted(() => ({
  getGalleryMaterial: vi.fn(),
  createGalleryMaterialMetadata: vi.fn(),
  updateGalleryMaterialMetadata: vi.fn(),
  deleteGalleryMaterialMetadata: vi.fn(),
  listGalleryMaterialsByImageCategory: vi.fn(),
  listGalleryMaterialsByLayoutCategory: vi.fn(),
  listGalleryMaterialsByMood: vi.fn(),
}));

vi.mock("./appServer", () => ({
  APP_SERVER_METHOD_GALLERY_MATERIAL_GET: "galleryMaterial/get",
  APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_CREATE:
    "galleryMaterialMetadata/create",
  APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_UPDATE:
    "galleryMaterialMetadata/update",
  APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_DELETE:
    "galleryMaterialMetadata/delete",
  APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY:
    "galleryMaterial/listByImageCategory",
  APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY:
    "galleryMaterial/listByLayoutCategory",
  APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_MOOD: "galleryMaterial/listByMood",
  createAppServerClient: () => appServerMocks,
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

  it("应通过 App Server current 获取单个素材", async () => {
    appServerMocks.getGalleryMaterial.mockResolvedValueOnce({
      result: { material: createMaterial("m1") },
    });

    await expect(getGalleryMaterial("m1")).resolves.toEqual(
      expect.objectContaining({ id: "m1" }),
    );
    expect(appServerMocks.getGalleryMaterial).toHaveBeenCalledWith({
      materialId: "m1",
    });
  });

  it("应通过 App Server current 代理素材元数据写操作", async () => {
    appServerMocks.createGalleryMaterialMetadata.mockResolvedValueOnce({
      result: { metadata: createMetadata("m2") },
    });
    appServerMocks.updateGalleryMaterialMetadata.mockResolvedValueOnce({
      result: { metadata: createMetadata("m2") },
    });
    appServerMocks.deleteGalleryMaterialMetadata.mockResolvedValueOnce({
      result: {},
    });

    await expect(
      createGalleryMetadata({
        materialId: "m2",
        colors: ["#fff"],
      }),
    ).resolves.toEqual(expect.objectContaining({ materialId: "m2" }));
    await expect(
      updateGalleryMetadata("m2", {
        materialId: "different",
        colors: ["#000"],
      }),
    ).resolves.toEqual(expect.objectContaining({ materialId: "m2" }));
    await expect(deleteGalleryMetadata("m2")).resolves.toBeUndefined();

    expect(appServerMocks.createGalleryMaterialMetadata).toHaveBeenCalledWith({
      materialId: "m2",
      colors: ["#fff"],
    });
    expect(appServerMocks.updateGalleryMaterialMetadata).toHaveBeenCalledWith({
      materialId: "m2",
      metadata: { materialId: "m2", colors: ["#000"] },
    });
    expect(appServerMocks.deleteGalleryMaterialMetadata).toHaveBeenCalledWith({
      materialId: "m2",
    });
  });

  it("应通过 App Server current 查询不同维度的素材", async () => {
    appServerMocks.listGalleryMaterialsByImageCategory.mockResolvedValueOnce({
      result: { materials: [createMaterial("img-1")] },
    });
    appServerMocks.listGalleryMaterialsByLayoutCategory.mockResolvedValueOnce({
      result: { materials: [createMaterial("layout-1")] },
    });
    appServerMocks.listGalleryMaterialsByMood.mockResolvedValueOnce({
      result: { materials: [createMaterial("color-1")] },
    });

    await expect(
      listGalleryMaterialsByImageCategory("project-1", "background"),
    ).resolves.toEqual([expect.objectContaining({ id: "img-1" })]);
    await expect(
      listGalleryMaterialsByLayoutCategory("project-1", "grid"),
    ).resolves.toEqual([expect.objectContaining({ id: "layout-1" })]);
    await expect(
      listGalleryMaterialsByMood("project-1", "warm"),
    ).resolves.toEqual([expect.objectContaining({ id: "color-1" })]);

    expect(
      appServerMocks.listGalleryMaterialsByImageCategory,
    ).toHaveBeenCalledWith({
      projectId: "project-1",
      category: "background",
    });
    expect(
      appServerMocks.listGalleryMaterialsByLayoutCategory,
    ).toHaveBeenCalledWith({
      projectId: "project-1",
      category: "grid",
    });
    expect(appServerMocks.listGalleryMaterialsByMood).toHaveBeenCalledWith({
      projectId: "project-1",
      mood: "warm",
    });
  });

  it("素材不存在时应返回 null", async () => {
    appServerMocks.getGalleryMaterial.mockResolvedValueOnce({ result: {} });

    await expect(getGalleryMaterial("missing")).resolves.toBeNull();
  });

  it("收到非图库素材结果形状或 error envelope 时应 fail closed", async () => {
    appServerMocks.getGalleryMaterial
      .mockResolvedValueOnce({
        result: { material: { id: "m1", type: "image" } },
      })
      .mockResolvedValueOnce({
        result: {
          material: {
            ...createMaterial("m1"),
            error: "unsupported",
          },
        },
      });

    await expect(getGalleryMaterial("m1")).rejects.toThrow(
      "galleryMaterial/get did not return gallery material",
    );
    await expect(getGalleryMaterial("m1")).rejects.toThrow(
      "galleryMaterial/get returned an error envelope",
    );
  });

  it("收到非图库元数据或 delete 假结果时应 fail closed", async () => {
    appServerMocks.createGalleryMaterialMetadata
      .mockResolvedValueOnce({ result: { metadata: { materialId: "m2" } } })
      .mockResolvedValueOnce({
        result: {
          metadata: {
            ...createMetadata("m2"),
            error: "unsupported",
          },
        },
      });
    appServerMocks.updateGalleryMaterialMetadata.mockResolvedValueOnce({
      result: {
        metadata: {
          materialId: "m2",
          colors: [],
          createdAt: 1,
        },
      },
    });
    appServerMocks.deleteGalleryMaterialMetadata.mockResolvedValueOnce({
      result: { success: true },
    });

    await expect(
      createGalleryMetadata({
        materialId: "m2",
        colors: ["#fff"],
      }),
    ).rejects.toThrow(
      "galleryMaterialMetadata/create did not return gallery material metadata",
    );
    await expect(
      createGalleryMetadata({
        materialId: "m2",
        colors: ["#fff"],
      }),
    ).rejects.toThrow(
      "galleryMaterialMetadata/create returned an error envelope",
    );
    await expect(
      updateGalleryMetadata("m2", {
        materialId: "m2",
        colors: ["#000"],
      }),
    ).rejects.toThrow(
      "galleryMaterialMetadata/update did not return gallery material metadata",
    );
    await expect(deleteGalleryMetadata("m2")).rejects.toThrow(
      "galleryMaterialMetadata/delete did not return void result",
    );
  });

  it("收到非图库素材列表形状时应 fail closed", async () => {
    appServerMocks.listGalleryMaterialsByImageCategory
      .mockResolvedValueOnce({ result: { materials: [{ id: "img-1" }] } })
      .mockResolvedValueOnce({
        result: {
          materials: [
            {
              ...createMaterial("img-1"),
              error: "unsupported",
            },
          ],
        },
      });

    await expect(
      listGalleryMaterialsByImageCategory("project-1"),
    ).rejects.toThrow(
      "galleryMaterial/listByImageCategory did not return gallery materials",
    );
    await expect(
      listGalleryMaterialsByImageCategory("project-1"),
    ).rejects.toThrow(
      "galleryMaterial/listByImageCategory returned an error envelope",
    );
  });
});
