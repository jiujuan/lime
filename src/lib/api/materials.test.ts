import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteMaterial,
  getMaterialContent,
  getMaterialCount,
  importMaterialFromUrl,
  listMaterials,
  normalizeMaterial,
  updateMaterial,
  uploadMaterial,
} from "./materials";

const appServerMocks = vi.hoisted(() => ({
  listProjectMaterials: vi.fn(),
  countProjectMaterials: vi.fn(),
  uploadProjectMaterial: vi.fn(),
  importProjectMaterialFromUrl: vi.fn(),
  updateProjectMaterial: vi.fn(),
  deleteProjectMaterial: vi.fn(),
  readProjectMaterialContent: vi.fn(),
}));

vi.mock("./appServer", () => ({
  APP_SERVER_METHOD_PROJECT_MATERIAL_LIST: "projectMaterial/list",
  APP_SERVER_METHOD_PROJECT_MATERIAL_COUNT: "projectMaterial/count",
  APP_SERVER_METHOD_PROJECT_MATERIAL_UPLOAD: "projectMaterial/upload",
  APP_SERVER_METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL:
    "projectMaterial/importFromUrl",
  APP_SERVER_METHOD_PROJECT_MATERIAL_UPDATE: "projectMaterial/update",
  APP_SERVER_METHOD_PROJECT_MATERIAL_DELETE: "projectMaterial/delete",
  APP_SERVER_METHOD_PROJECT_MATERIAL_CONTENT: "projectMaterial/content",
  createAppServerClient: () => appServerMocks,
}));

describe("materials API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizeMaterial 应兼容 snake_case 并转换秒级时间戳", () => {
    const material = normalizeMaterial(
      {
        id: "m1",
        project_id: "project-1",
        material_type: "image",
        file_path: "/tmp/demo.png",
        file_size: 2048,
        mime_type: "image/png",
        created_at: 1_700_000_000,
      },
      "fallback-project",
    );

    expect(material).toEqual(
      expect.objectContaining({
        id: "m1",
        projectId: "project-1",
        type: "image",
        filePath: "/tmp/demo.png",
        fileSize: 2048,
        mimeType: "image/png",
        createdAt: 1_700_000_000_000,
      }),
    );
  });

  it("listMaterials 应通过 App Server current 返回规范化后的素材数组", async () => {
    appServerMocks.listProjectMaterials.mockResolvedValueOnce({
      result: {
        materials: [
          {
            id: "m1",
            project_id: "project-1",
            material_type: "image",
            file_path: "/tmp/demo.png",
          },
        ],
      },
    });

    await expect(listMaterials("project-1")).resolves.toEqual([
      expect.objectContaining({
        id: "m1",
        projectId: "project-1",
        type: "image",
        filePath: "/tmp/demo.png",
      }),
    ]);

    expect(appServerMocks.listProjectMaterials).toHaveBeenCalledWith({
      projectId: "project-1",
      filter: null,
    });
  });

  it("listMaterials 遇到非数组返回时不应伪装成空列表", async () => {
    appServerMocks.listProjectMaterials.mockResolvedValueOnce({
      result: {
        materials: { id: "m1" },
      },
    });

    await expect(listMaterials("project-1")).rejects.toThrow(
      "projectMaterial/list did not return a materials array",
    );
  });

  it("getMaterialCount 应调用 App Server 统计方法", async () => {
    appServerMocks.countProjectMaterials.mockResolvedValueOnce({
      result: { count: 3 },
    });

    await expect(getMaterialCount("project-2")).resolves.toBe(3);
    expect(appServerMocks.countProjectMaterials).toHaveBeenCalledWith({
      projectId: "project-2",
    });
  });

  it("getMaterialCount 遇到非数字返回时不应伪装成 0", async () => {
    appServerMocks.countProjectMaterials.mockResolvedValueOnce({
      result: { count: "3" },
    });

    await expect(getMaterialCount("project-2")).rejects.toThrow(
      "projectMaterial/count did not return a number",
    );
  });

  it("uploadMaterial 应发送 App Server current 请求并规范化返回值", async () => {
    appServerMocks.uploadProjectMaterial.mockResolvedValueOnce({
      result: {
        material: {
          id: "m2",
          project_id: "project-3",
          material_type: "image",
          file_path: "/tmp/upload.png",
        },
      },
    });

    await expect(
      uploadMaterial({
        projectId: "project-3",
        name: "upload.png",
        type: "image",
        filePath: "/tmp/upload.png",
        tags: ["demo"],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "m2",
        projectId: "project-3",
        type: "image",
        filePath: "/tmp/upload.png",
      }),
    );

    expect(appServerMocks.uploadProjectMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-3",
        filePath: "/tmp/upload.png",
      }),
    );
  });

  it("uploadMaterial 遇到非素材对象时应 fail closed", async () => {
    appServerMocks.uploadProjectMaterial.mockResolvedValueOnce({
      result: { material: null },
    });

    await expect(
      uploadMaterial({
        projectId: "project-3",
        name: "upload.png",
        type: "image",
        filePath: "/tmp/upload.png",
      }),
    ).rejects.toThrow("projectMaterial/upload did not return a material object");
  });

  it("importMaterialFromUrl 应通过 App Server current 返回导入素材 id", async () => {
    appServerMocks.importProjectMaterialFromUrl.mockResolvedValueOnce({
      result: {
        material: {
          id: "m3",
          projectId: "project-4",
          type: "image",
          name: "remote-image",
          tags: [],
          createdAt: 1,
        },
      },
    });

    await expect(
      importMaterialFromUrl({
        projectId: "project-4",
        name: "remote-image",
        type: "image",
        url: "https://example.com/demo.png",
        tags: ["pixabay"],
      }),
    ).resolves.toEqual({ id: "m3" });

    expect(appServerMocks.importProjectMaterialFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-4",
        url: "https://example.com/demo.png",
      }),
    );
  });

  it("importMaterialFromUrl 遇到非素材结果时应 fail closed", async () => {
    appServerMocks.importProjectMaterialFromUrl.mockResolvedValueOnce({
      result: {},
    });

    await expect(
      importMaterialFromUrl({
        projectId: "project-4",
        name: "remote-image",
        type: "image",
        url: "https://example.com/demo.png",
      }),
    ).rejects.toThrow(
      "projectMaterial/importFromUrl did not return an imported material id",
    );
  });

  it("updateMaterial / deleteMaterial / getMaterialContent 应代理到 App Server current", async () => {
    appServerMocks.updateProjectMaterial.mockResolvedValueOnce({
      result: {
        material: {
          id: "m4",
          projectId: "project-5",
          type: "text",
        },
      },
    });
    appServerMocks.deleteProjectMaterial.mockResolvedValueOnce({ result: {} });
    appServerMocks.readProjectMaterialContent.mockResolvedValueOnce({
      result: { content: "hello" },
    });

    await expect(updateMaterial("m4", { name: "new-name" })).resolves.toEqual(
      expect.objectContaining({
        id: "m4",
        projectId: "project-5",
        type: "text",
      }),
    );
    await expect(deleteMaterial("m4")).resolves.toBeUndefined();
    await expect(getMaterialContent("m4")).resolves.toBe("hello");

    expect(appServerMocks.updateProjectMaterial).toHaveBeenCalledWith({
      id: "m4",
      update: { name: "new-name" },
    });
    expect(appServerMocks.deleteProjectMaterial).toHaveBeenCalledWith({
      id: "m4",
    });
    expect(appServerMocks.readProjectMaterialContent).toHaveBeenCalledWith({
      id: "m4",
    });
  });

  it("deleteMaterial 遇到 mock-like payload 时不应伪装成成功", async () => {
    appServerMocks.deleteProjectMaterial.mockResolvedValueOnce({
      result: { success: true },
    });

    await expect(deleteMaterial("m4")).rejects.toThrow(
      "projectMaterial/delete did not return void",
    );
  });

  it("getMaterialContent 遇到非字符串内容时应 fail closed", async () => {
    appServerMocks.readProjectMaterialContent.mockResolvedValueOnce({
      result: { content: null },
    });

    await expect(getMaterialContent("m4")).rejects.toThrow(
      "projectMaterial/content did not return content text",
    );
  });
});
