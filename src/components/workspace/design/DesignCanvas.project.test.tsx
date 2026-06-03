import { describe, expect, it, vi } from "vitest";
import {
  createLayeredDesignDocument,
  createTextLayer,
} from "@/lib/layered-design";
import {
  CREATED_AT,
  createDocument,
  createProjectExportOutput,
  createProjectExportReadOutput,
  renderDesignCanvas,
  clickButtonAsync,
} from "./DesignCanvas.testFixtures";

describe("DesignCanvas project export", () => {
  it("绑定工作区时应把设计工程保存到项目目录，而不是触发浏览器下载", async () => {
    const saveProjectExport = vi
      .fn()
      .mockResolvedValue(createProjectExportOutput(6, 1));
    const createObjectUrlMock = vi.fn(() => "blob:should-not-download");
    const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    const originalCreateElement = document.createElement.bind(document);
    const downloads: string[] = [];

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlMock,
    });
    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
    ) => {
      const element = originalCreateElement(tagName);

      if (tagName.toLowerCase() === "canvas") {
        Object.defineProperty(element, "getContext", {
          configurable: true,
          value: () => ({ drawImage: vi.fn() }),
        });
        Object.defineProperty(element, "toDataURL", {
          configurable: true,
          value: () => "data:image/png;base64,cHJldmlldy1wbmc=",
        });
      }

      if (tagName.toLowerCase() === "a") {
        Object.defineProperty(element, "click", {
          configurable: true,
          value: () => {
            downloads.push((element as HTMLAnchorElement).download);
          },
        });
      }

      return element;
    }) as typeof document.createElement);

    try {
      vi.stubGlobal(
        "Image",
        class {
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;

          set src(_value: string) {
            queueMicrotask(() => this.onload?.());
          }
        },
      );

      const documentWithEmbeddedAsset = createDocument();
      renderDesignCanvas(
        {
          type: "design",
          document: {
            ...documentWithEmbeddedAsset,
            assets: documentWithEmbeddedAsset.assets.map((asset) =>
              asset.id === "asset-subject"
                ? { ...asset, src: "data:image/png;base64,YXNzZXQtcG5n" }
                : asset,
            ),
          },
          selectedLayerId: "headline",
          zoom: 0.72,
        },
        {
          projectRootPath: "/workspace",
          saveProjectExport,
          analyzerModelSlotConfigs: [
            {
              id: "test-clean-slot",
              kind: "clean_plate",
              label: "Test clean slot",
              modelId: "test-clean-v1",
              metadata: {
                productionReady: true,
                requiresHumanReview: false,
              },
            },
          ],
        },
      );

      await clickButtonAsync("导出设计工程");

      expect(saveProjectExport).toHaveBeenCalledWith(
        expect.objectContaining({
          projectRootPath: "/workspace",
          documentId: "design-test",
          title: "图层化海报",
          directoryName: "design-test.layered-design",
          files: expect.arrayContaining([
            expect.objectContaining({
              relativePath: "design.json",
              encoding: "utf8",
            }),
            expect.objectContaining({
              relativePath: "psd-like-manifest.json",
              encoding: "utf8",
            }),
            expect.objectContaining({
              relativePath: "trial.psd",
              encoding: "base64",
            }),
            expect.objectContaining({
              relativePath: "preview.png",
              encoding: "base64",
            }),
            expect.objectContaining({
              relativePath: "assets/asset-subject.png",
              encoding: "base64",
            }),
          ]),
        }),
      );
      expect(JSON.stringify(saveProjectExport.mock.calls[0][0])).not.toMatch(
        /poster_generate|canvas:poster|ImageTaskViewer/,
      );
      const manifestFile = saveProjectExport.mock.calls[0][0].files.find(
        (file: { relativePath?: string }) =>
          file.relativePath === "export-manifest.json",
      );
      expect(JSON.parse(manifestFile?.content ?? "{}")).toMatchObject({
        analyzerModelSlots: [
          {
            config: {
              id: "test-clean-slot",
              kind: "clean_plate",
              modelId: "test-clean-v1",
            },
            readiness: {
              valid: true,
              productionGate: {
                readyForProduction: true,
              },
            },
          },
        ],
      });
      expect(downloads).toEqual([]);
      expect(createObjectUrlMock).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain("已保存图层设计工程");
    } finally {
      if (createObjectUrlDescriptor) {
        Object.defineProperty(
          URL,
          "createObjectURL",
          createObjectUrlDescriptor,
        );
      } else {
        const mutableUrl = URL as Omit<typeof URL, "createObjectURL"> & {
          createObjectURL?: unknown;
        };
        delete mutableUrl.createObjectURL;
      }
    }
  });

  it("绑定工作区保存后应提示未缓存的远程图片资产", async () => {
    const saveProjectExport = vi.fn().mockResolvedValue(
      createProjectExportOutput(7, 1, {
        remoteReferenceAssetCount: 1,
        cachedRemoteAssetCount: 0,
        uncachedRemoteAssetCount: 1,
      }),
    );
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
    ) => {
      const element = originalCreateElement(tagName);

      if (tagName.toLowerCase() === "canvas") {
        Object.defineProperty(element, "getContext", {
          configurable: true,
          value: () => ({ drawImage: vi.fn() }),
        });
        Object.defineProperty(element, "toDataURL", {
          configurable: true,
          value: () => "data:image/png;base64,cHJldmlldy1wbmc=",
        });
      }

      return element;
    }) as typeof document.createElement);

    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );

    renderDesignCanvas(undefined, {
      projectRootPath: "/workspace",
      saveProjectExport,
    });

    await clickButtonAsync("导出设计工程");

    expect(saveProjectExport).toHaveBeenCalled();
    expect(document.body.textContent).toContain("远程图片资产未缓存到 assets/");
    expect(document.body.textContent).toContain("离线迁移前请重新缓存远程资产");
    expect(JSON.stringify(saveProjectExport.mock.calls[0][0])).not.toMatch(
      /poster_generate|canvas:poster|ImageTaskViewer/,
    );
  }, 10_000);

  it("打开最近工程应从项目目录恢复 LayeredDesignDocument 并继续编辑", async () => {
    const restoredDocument = createLayeredDesignDocument({
      id: "restored-design",
      title: "恢复的图层设计",
      canvas: { width: 1200, height: 900, backgroundColor: "#eef2ff" },
      layers: [
        createTextLayer({
          id: "restored-headline",
          name: "恢复标题",
          type: "text",
          text: "继续编辑",
          x: 80,
          y: 90,
          width: 640,
          height: 120,
          zIndex: 5,
          source: "planned",
        }),
      ],
      assets: [],
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    const readProjectExport = vi
      .fn()
      .mockResolvedValue(
        createProjectExportReadOutput(JSON.stringify(restoredDocument)),
      );
    const mounted = renderDesignCanvas(undefined, {
      projectRootPath: "/workspace",
      readProjectExport,
    });

    await clickButtonAsync("打开最近工程");

    expect(readProjectExport).toHaveBeenCalledWith({
      projectRootPath: "/workspace",
    });
    expect(mounted.readState().document).toMatchObject({
      id: "restored-design",
      title: "恢复的图层设计",
      canvas: expect.objectContaining({ width: 1200, height: 900 }),
    });
    expect(mounted.readState().selectedLayerId).toBe("restored-headline");
    expect(document.body.textContent).toContain("已打开图层设计工程");
    expect(JSON.stringify(mounted.readState().document)).not.toMatch(
      /poster_generate|canvas:poster|ImageTaskViewer/,
    );
  });
});
