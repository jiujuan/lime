import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AnalyzeLayeredDesignFlatImage } from "./DesignCanvas.testFixtures";
import {
  CREATED_AT,
  MockFlatImageFileReader,
  renderDesignCanvas,
  changeInputValue,
  setCheckboxValue,
  clickButtonAsync,
  waitForCanvasState,
} from "./DesignCanvas.testFixtures";

describe("DesignCanvas", () => {
  it("应渲染图层栏、画布和属性栏，并展示 LayeredDesignDocument 信息", () => {
    renderDesignCanvas();

    expect(document.body.textContent).toContain("LayeredDesignDocument");
    expect(document.body.textContent).toContain("图层化海报");
    expect(document.body.textContent).toContain("角色层");
    expect(document.body.textContent).toContain("标题层");
    expect(document.body.textContent).toContain("1080 x 1440");
  });

  it("应暴露 design.json、PSD-like manifest、preview 和 assets 的工程导出入口", () => {
    renderDesignCanvas();

    expect(document.body.textContent).toContain("导出设计工程");
    expect(document.body.textContent).not.toContain("PNG 导出待接入");
  });

  it("应在 DesignCanvas 主路径暴露可复跑的模型拆层端点配置入口", () => {
    renderDesignCanvas();

    expect(document.body.textContent).toContain("模型拆层端点");
    expect(document.body.textContent).toContain(
      "上传扁平图和“重新拆层”会优先走当前 canvas:design",
    );
    expect(
      document.querySelector('input[aria-label="拆层模型端点 URL"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('input[aria-label="启用拆层模型端点"]'),
    ).not.toBeNull();

    changeInputValue("拆层模型端点 URL", "http://127.0.0.1:52081/model-slot");
    setCheckboxValue("启用拆层模型端点", true);

    expect(document.body.textContent).toContain(
      "已启用：http://127.0.0.1:52081/model-slot",
    );
    expect(
      window.localStorage.getItem("lime.layeredDesign.analyzerEndpoint"),
    ).toContain("http://127.0.0.1:52081/model-slot");
  });

  it("导出设计工程应下载单个 ZIP，而不是散落下载多个文件", async () => {
    const downloads: string[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createObjectUrlMock = vi.fn(() => "blob:design-zip");
    const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "revokeObjectURL",
    );

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
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
      renderDesignCanvas();

      await clickButtonAsync("导出设计工程");

      expect(downloads).toEqual(["design-test.layered-design.zip"]);
      expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).toContain("已下载 ZIP 工程包");
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

      if (revokeObjectUrlDescriptor) {
        Object.defineProperty(
          URL,
          "revokeObjectURL",
          revokeObjectUrlDescriptor,
        );
      } else {
        const mutableUrl = URL as Omit<typeof URL, "revokeObjectURL"> & {
          revokeObjectURL?: unknown;
        };
        delete mutableUrl.revokeObjectURL;
      }
    }
  });

  it("上传扁平图应创建 extraction draft 并切换到当前 DesignCanvas", async () => {
    globalThis.FileReader = MockFlatImageFileReader as never;
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 900;
        naturalHeight = 1400;
        width = 900;
        height = 1400;

        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
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
          value: () => "data:image/png;base64,ZGVzaWduLWNhbnZhcy1oZXVyaXN0aWM=",
        });
      }

      return element;
    }) as typeof document.createElement);
    const analyzeFlatImage: AnalyzeLayeredDesignFlatImage = vi
      .fn()
      .mockResolvedValue({
        analysis: {
          analyzer: {
            kind: "local_heuristic",
            label: "本地 heuristic analyzer",
          },
          outputs: {
            candidateRaster: true,
            candidateMask: false,
            cleanPlate: false,
            ocrText: false,
          },
          generatedAt: CREATED_AT,
        },
        cleanPlate: {
          status: "not_requested",
          message: "当前候选来自本地 heuristic 裁片；尚未执行 clean plate。",
        },
        candidates: [
          {
            id: "subject-candidate",
            role: "subject",
            confidence: 0.74,
            layer: {
              id: "subject-layer",
              name: "主体候选",
              type: "image",
              assetId: "subject-asset",
              x: 144,
              y: 224,
              width: 612,
              height: 980,
              zIndex: 20,
              alphaMode: "embedded",
            },
            assets: [
              {
                id: "subject-asset",
                kind: "subject",
                src: "data:image/png;base64,c3ViamVjdA==",
                width: 612,
                height: 980,
                hasAlpha: false,
                createdAt: CREATED_AT,
              },
            ],
          },
          {
            id: "headline-candidate",
            role: "text",
            confidence: 0.62,
            layer: {
              id: "headline-layer",
              name: "标题文字候选",
              type: "image",
              assetId: "headline-asset",
              x: 108,
              y: 84,
              width: 684,
              height: 252,
              zIndex: 40,
              alphaMode: "embedded",
            },
            assets: [
              {
                id: "headline-asset",
                kind: "text_raster",
                src: "data:image/png;base64,aGVhZGxpbmU=",
                width: 684,
                height: 252,
                hasAlpha: false,
                createdAt: CREATED_AT,
              },
            ],
          },
          {
            id: "logo-candidate",
            role: "logo",
            confidence: 0.48,
            issues: ["low_confidence"],
            layer: {
              id: "logo-layer",
              name: "Logo 候选",
              type: "image",
              assetId: "logo-asset",
              x: 54,
              y: 84,
              width: 252,
              height: 224,
              zIndex: 48,
              alphaMode: "embedded",
            },
            assets: [
              {
                id: "logo-asset",
                kind: "logo",
                src: "data:image/png;base64,bG9nbw==",
                width: 252,
                height: 224,
                hasAlpha: false,
                createdAt: CREATED_AT,
              },
            ],
          },
          {
            id: "fragment-candidate",
            role: "background_fragment",
            confidence: 0.22,
            issues: ["low_confidence"],
            layer: {
              id: "fragment-layer",
              name: "边角碎片",
              type: "effect",
              assetId: "fragment-asset",
              x: 648,
              y: 1008,
              width: 198,
              height: 308,
              zIndex: 56,
              alphaMode: "embedded",
            },
            assets: [
              {
                id: "fragment-asset",
                kind: "effect",
                src: "data:image/png;base64,ZnJhZ21lbnQ=",
                width: 198,
                height: 308,
                hasAlpha: false,
                createdAt: CREATED_AT,
              },
            ],
          },
        ],
      });

    const mounted = renderDesignCanvas(undefined, {
      analyzeFlatImage,
    });
    const input = mounted.container.querySelector(
      '[data-testid="design-canvas-flat-image-input"]',
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();

    const file = new File(["flat"], "teaser-poster.png", {
      type: "image/png",
    });

    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [file],
      });
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitForCanvasState(
      () => mounted.readState().document.title === "teaser-poster",
      "上传扁平图后 DesignCanvas 状态未切换到 extraction draft。",
    );

    expect(analyzeFlatImage).toHaveBeenCalledWith({
      image: expect.objectContaining({
        src: "data:image/png;base64,ZmxhdC1pbWFnZQ==",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      }),
      createdAt: expect.any(String),
    });
    expect(mounted.readState().document.title).toBe("teaser-poster");
    expect(
      mounted.readState().document.layers.map((layer) => layer.id),
    ).toEqual([
      "extraction-background-image",
      "subject-layer",
      "headline-layer",
    ]);
    expect(mounted.readState().selectedLayerId).toBe("headline-layer");
    expect(mounted.readState().document.extraction).toMatchObject({
      sourceAssetId: "teaser-poster-source-image",
      review: {
        status: "pending",
      },
      analysis: {
        analyzer: {
          kind: "local_heuristic",
          label: "本地 heuristic analyzer",
        },
        outputs: {
          candidateRaster: true,
          candidateMask: false,
          cleanPlate: false,
          ocrText: false,
        },
      },
      cleanPlate: {
        status: "not_requested",
        message: "当前候选来自本地 heuristic 裁片；尚未执行 clean plate。",
      },
      candidates: [
        {
          id: "subject-candidate",
          selected: true,
        },
        {
          id: "headline-candidate",
          selected: true,
        },
        {
          id: "logo-candidate",
          selected: false,
          issues: ["low_confidence"],
        },
        {
          id: "fragment-candidate",
          selected: false,
          issues: ["low_confidence"],
        },
      ],
    });
    expect(mounted.readState().document.assets[0]).toMatchObject({
      kind: "source_image",
      src: "data:image/png;base64,ZmxhdC1pbWFnZQ==",
    });
    expect(document.body.textContent).toContain("本地 heuristic analyzer");
    expect(document.body.textContent).toContain("进入图层编辑");
    expect(JSON.stringify(mounted.readState().document)).not.toMatch(
      /poster_generate|canvas:poster|ImageTaskViewer/,
    );
  });

  it("上传扁平图启用模型拆层端点失败时应回退 current analyzer", async () => {
    globalThis.FileReader = MockFlatImageFileReader as never;
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 90;
        naturalHeight = 140;
        width = 90;
        height = 140;

        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.stubGlobal("createImageBitmap", undefined);
    const fallbackAnalyzeFlatImage: AnalyzeLayeredDesignFlatImage = vi
      .fn()
      .mockResolvedValue({
        analysis: {
          analyzer: {
            kind: "local_heuristic",
            label: "测试 fallback analyzer",
          },
          outputs: {
            candidateRaster: true,
            candidateMask: false,
            cleanPlate: false,
            ocrText: false,
          },
          generatedAt: CREATED_AT,
        },
        cleanPlate: {
          status: "not_requested",
          message: "测试 fallback clean plate。",
        },
        candidates: [
          {
            id: "fallback-subject",
            role: "subject",
            confidence: 0.8,
            layer: {
              id: "fallback-subject-layer",
              name: "fallback 主体",
              type: "image",
              assetId: "fallback-subject-asset",
              x: 10,
              y: 10,
              width: 60,
              height: 90,
              zIndex: 20,
              alphaMode: "embedded",
            },
            assets: [
              {
                id: "fallback-subject-asset",
                kind: "subject",
                src: "data:image/png;base64,ZmFsbGJhY2s=",
                width: 60,
                height: 90,
                hasAlpha: false,
                createdAt: CREATED_AT,
              },
            ],
          },
        ],
      });

    window.localStorage.setItem(
      "lime.layeredDesign.analyzerEndpoint",
      JSON.stringify({
        enabled: true,
        endpointUrl: "http://127.0.0.1:52081/model-slot",
      }),
    );

    const mounted = renderDesignCanvas(undefined, {
      analyzeFlatImage: fallbackAnalyzeFlatImage,
    });
    expect(document.body.textContent).toContain(
      "已启用：http://127.0.0.1:52081/model-slot",
    );

    const input = mounted.container.querySelector(
      '[data-testid="design-canvas-flat-image-input"]',
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();

    const file = new File(["flat"], "model-slot-poster.png", {
      type: "image/png",
    });

    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [file],
      });
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitForCanvasState(
      () => mounted.readState().document.title === "model-slot-poster",
      "上传扁平图后未通过 model slot analyzer 创建 extraction draft。",
      120,
    );

    expect(fallbackAnalyzeFlatImage).toHaveBeenCalled();
    expect(document.body.textContent).toContain("模型拆层端点已启用");
    expect(
      mounted.readState().document.extraction?.analysis?.analyzer,
    ).toMatchObject({
      label: "测试 fallback analyzer",
    });
    expect(JSON.stringify(mounted.readState().document)).not.toMatch(
      /poster_generate|canvas:poster|ImageTaskViewer/,
    );
  });
});
