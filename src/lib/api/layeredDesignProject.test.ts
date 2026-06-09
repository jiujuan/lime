import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  readLayeredDesignProjectExport,
  saveLayeredDesignProjectExport,
} from "./layeredDesignProject";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("layeredDesignProject API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveLayeredDesignProjectExport 应代理到 project export 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      projectRootPath: "/workspace",
      exportDirectoryPath:
        "/workspace/.lime/layered-designs/doc.layered-design",
      exportDirectoryRelativePath: ".lime/layered-designs/doc.layered-design",
      designPath:
        "/workspace/.lime/layered-designs/doc.layered-design/design.json",
      manifestPath:
        "/workspace/.lime/layered-designs/doc.layered-design/export-manifest.json",
      previewPngPath:
        "/workspace/.lime/layered-designs/doc.layered-design/preview.png",
      assetCount: 0,
      fileCount: 1,
      bytesWritten: 128,
      remoteReferenceAssetCount: 0,
      cachedRemoteAssetCount: 0,
      uncachedRemoteAssetCount: 0,
    });

    const request = {
      projectRootPath: "/workspace",
      documentId: "doc",
      title: "Document",
      files: [
        {
          relativePath: "design.json",
          mimeType: "application/json",
          encoding: "utf8" as const,
          content: "{}",
        },
      ],
    };

    await expect(saveLayeredDesignProjectExport(request)).resolves.toEqual(
      expect.objectContaining({
        projectRootPath: "/workspace",
        assetCount: 0,
        fileCount: 1,
      }),
    );
    expect(safeInvoke).toHaveBeenCalledWith(
      "save_layered_design_project_export",
      { request },
    );
  });

  it("saveLayeredDesignProjectExport 遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "save_layered_design_project_export",
        source: "electron",
      },
    });

    await expect(
      saveLayeredDesignProjectExport({
        projectRootPath: "/workspace",
        documentId: "doc",
        title: "Document",
        files: [],
      }),
    ).rejects.toThrow(
      "save_layered_design_project_export 尚未接入真实 Layered Design project export current 通道",
    );
  });

  it("saveLayeredDesignProjectExport 收到非导出结果时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        error:
          "Electron host command is not supported: save_layered_design_project_export",
      });

    const request = {
      projectRootPath: "/workspace",
      documentId: "doc",
      title: "Document",
      files: [],
    };

    await expect(saveLayeredDesignProjectExport(request)).rejects.toThrow(
      "save_layered_design_project_export did not return a layered design project export result",
    );
    await expect(saveLayeredDesignProjectExport(request)).rejects.toThrow(
      "save_layered_design_project_export returned an error envelope",
    );
  });

  it("saveLayeredDesignProjectExport 收到带 error 的伪导出结果时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      projectRootPath: "/workspace",
      exportDirectoryPath:
        "/workspace/.lime/layered-designs/doc.layered-design",
      exportDirectoryRelativePath: ".lime/layered-designs/doc.layered-design",
      designPath:
        "/workspace/.lime/layered-designs/doc.layered-design/design.json",
      manifestPath:
        "/workspace/.lime/layered-designs/doc.layered-design/export-manifest.json",
      assetCount: 0,
      fileCount: 1,
      bytesWritten: 128,
      remoteReferenceAssetCount: 0,
      cachedRemoteAssetCount: 0,
      uncachedRemoteAssetCount: 0,
      error:
        "Electron host command is not supported: save_layered_design_project_export",
    });

    await expect(
      saveLayeredDesignProjectExport({
        projectRootPath: "/workspace",
        documentId: "doc",
        title: "Document",
        files: [],
      }),
    ).rejects.toThrow(
      "save_layered_design_project_export returned an error envelope",
    );
  });

  it("readLayeredDesignProjectExport 应代理到 project export 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      projectRootPath: "/workspace",
      exportDirectoryPath:
        "/workspace/.lime/layered-designs/doc.layered-design",
      exportDirectoryRelativePath: ".lime/layered-designs/doc.layered-design",
      designPath:
        "/workspace/.lime/layered-designs/doc.layered-design/design.json",
      designJson: "{}",
      assetCount: 0,
      fileCount: 1,
    });

    const request = {
      projectRootPath: "/workspace",
      exportDirectoryRelativePath: ".lime/layered-designs/doc.layered-design",
    };

    await expect(readLayeredDesignProjectExport(request)).resolves.toEqual(
      expect.objectContaining({
        projectRootPath: "/workspace",
        designJson: "{}",
      }),
    );
    expect(safeInvoke).toHaveBeenCalledWith(
      "read_layered_design_project_export",
      { request },
    );
  });

  it("readLayeredDesignProjectExport 遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "read_layered_design_project_export",
        source: "electron",
      },
    });

    await expect(
      readLayeredDesignProjectExport({ projectRootPath: "/workspace" }),
    ).rejects.toThrow(
      "read_layered_design_project_export 尚未接入真实 Layered Design project export current 通道",
    );
  });

  it("readLayeredDesignProjectExport 收到非工程文档时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        projectRootPath: "/workspace",
        exportDirectoryPath:
          "/workspace/.lime/layered-designs/doc.layered-design",
        exportDirectoryRelativePath: ".lime/layered-designs/doc.layered-design",
        designPath:
          "/workspace/.lime/layered-designs/doc.layered-design/design.json",
        assetCount: 0,
        fileCount: 1,
      })
      .mockResolvedValueOnce({
        error:
          "Electron host command is not supported: read_layered_design_project_export",
      });

    await expect(
      readLayeredDesignProjectExport({ projectRootPath: "/workspace" }),
    ).rejects.toThrow(
      "read_layered_design_project_export did not return a layered design project export document",
    );
    await expect(
      readLayeredDesignProjectExport({ projectRootPath: "/workspace" }),
    ).rejects.toThrow(
      "read_layered_design_project_export returned an error envelope",
    );
  });

  it("readLayeredDesignProjectExport 收到带 error 的伪工程文档时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      projectRootPath: "/workspace",
      exportDirectoryPath:
        "/workspace/.lime/layered-designs/doc.layered-design",
      exportDirectoryRelativePath: ".lime/layered-designs/doc.layered-design",
      designPath:
        "/workspace/.lime/layered-designs/doc.layered-design/design.json",
      designJson: "{}",
      assetCount: 0,
      fileCount: 1,
      error:
        "Electron host command is not supported: read_layered_design_project_export",
    });

    await expect(
      readLayeredDesignProjectExport({ projectRootPath: "/workspace" }),
    ).rejects.toThrow(
      "read_layered_design_project_export returned an error envelope",
    );
  });
});
