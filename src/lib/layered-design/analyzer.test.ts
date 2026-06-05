import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeLayeredDesignFlatImage,
  createLayeredDesignFlatImageAnalyzerFromStructuredProvider,
} from "./index";
import type { LayeredDesignFlatImageTextOcrProviderInput } from "./index";

const recognizeLayeredDesignTextMock = vi.hoisted(() => vi.fn());
const analyzeLayeredDesignFlatImageNativeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/layeredDesignAnalysis", () => ({
  analyzeLayeredDesignFlatImageNative: analyzeLayeredDesignFlatImageNativeMock,
  recognizeLayeredDesignText: recognizeLayeredDesignTextMock,
}));

const CREATED_AT = "2026-05-06T03:00:00.000Z";

beforeEach(() => {
  analyzeLayeredDesignFlatImageNativeMock.mockReset();
  recognizeLayeredDesignTextMock.mockReset();
  analyzeLayeredDesignFlatImageNativeMock.mockResolvedValue({
    supported: false,
    engine: "mock-native-analyzer",
    message: "mock native analyzer unavailable",
  });
  recognizeLayeredDesignTextMock.mockResolvedValue({
    supported: false,
    engine: "mock-native-ocr",
    blocks: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubAnalyzerImageAndCanvasEnvironment(): void {
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
  let dataUrlIndex = 0;
  vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
    const element = originalCreateElement(tagName);

    if (tagName.toLowerCase() === "canvas") {
      const context = {
        canvas: element,
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        ellipse: vi.fn(),
        fill: vi.fn(),
        getImageData: vi.fn(() => ({
          data: Uint8ClampedArray.from([240, 241, 242, 255]),
        })),
        globalCompositeOperation: "source-over",
        fillStyle: "#000000",
      };

      Object.defineProperty(element, "getContext", {
        configurable: true,
        value: () => context,
      });
      Object.defineProperty(element, "toDataURL", {
        configurable: true,
        value: () =>
          [
            "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMQ==",
            "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMg==",
            "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMw==",
            "data:image/png;base64,aGV1cmlzdGljLWNyb3AtNA==",
            "data:image/png;base64,aGV1cmlzdGljLWNyb3AtNQ==",
            "data:image/png;base64,c3ViamVjdC1tYXNr",
            "data:image/png;base64,c3ViamVjdC1yZ2Jh",
            "data:image/png;base64,aGV1cmlzdGljLWNsZWFuLXBsYXRl",
          ][dataUrlIndex++] ?? "data:image/png;base64,ZmFsbGJhY2s=",
      });
    }

    return element;
  }) as typeof document.createElement);
}

describe("LayeredDesign structured analyzer adapter", () => {
  it("structured analyzer provider 失败时 adapter 应回退本地 heuristic", async () => {
    stubAnalyzerImageAndCanvasEnvironment();

    const analyze = vi.fn(async () => {
      throw new Error("真实 analyzer 暂不可用");
    });
    const analyzer = createLayeredDesignFlatImageAnalyzerFromStructuredProvider(
      {
        analyze,
      },
    );

    const result = await analyzer({
      image: {
        src: "data:image/png;base64,flat",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
      createdAt: CREATED_AT,
    });

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result.analysis).toMatchObject({
      analyzer: {
        kind: "local_heuristic",
        label: "本地 heuristic analyzer",
      },
      outputs: {
        candidateRaster: true,
        candidateMask: true,
        cleanPlate: true,
      },
    });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.cleanPlate.status).toBe("succeeded");
  });

  it("默认 local heuristic analyzer 应通过 structured adapter 输出真实 mask 与近似 clean plate", async () => {
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
    let dataUrlIndex = 0;
    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
    ) => {
      const element = originalCreateElement(tagName);

      if (tagName.toLowerCase() === "canvas") {
        const context = {
          canvas: element,
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          beginPath: vi.fn(),
          ellipse: vi.fn(),
          fill: vi.fn(),
          getImageData: vi.fn(() => ({
            data: Uint8ClampedArray.from([240, 241, 242, 255]),
          })),
          globalCompositeOperation: "source-over",
          fillStyle: "#000000",
        };

        Object.defineProperty(element, "getContext", {
          configurable: true,
          value: () => context,
        });
        Object.defineProperty(element, "toDataURL", {
          configurable: true,
          value: () =>
            [
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMQ==",
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMg==",
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMw==",
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtNA==",
              "data:image/png;base64,c3ViamVjdC1tYXNr",
              "data:image/png;base64,c3ViamVjdC1yZ2Jh",
              "data:image/png;base64,aGV1cmlzdGljLWNsZWFuLXBsYXRl",
            ][dataUrlIndex++] ?? "data:image/png;base64,ZmFsbGJhY2s=",
        });
      }

      return element;
    }) as typeof document.createElement);

    const result = await analyzeLayeredDesignFlatImage({
      image: {
        src: "data:image/png;base64,flat",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
      createdAt: CREATED_AT,
    });

    expect(result.analysis).toMatchObject({
      analyzer: {
        kind: "local_heuristic",
        label: "本地 heuristic analyzer",
      },
      outputs: {
        candidateRaster: true,
        candidateMask: true,
        cleanPlate: true,
        ocrText: false,
      },
    });
    expect(result.cleanPlate).toMatchObject({
      status: "succeeded",
      asset: {
        id: "heuristic-clean-plate-asset",
        kind: "clean_plate",
        src: expect.stringMatching(/^data:image\/png;base64,/),
      },
    });
    expect(result.candidates[0]).toMatchObject({
      id: "subject-candidate",
      layer: {
        assetId: "subject-asset",
        maskAssetId: "subject-candidate-mask",
        alphaMode: "mask",
      },
      assets: [
        {
          id: "subject-asset",
          src: expect.stringMatching(/^data:image\/png;base64,/),
          hasAlpha: true,
        },
        {
          id: "subject-candidate-mask",
          kind: "mask",
          src: expect.stringMatching(/^data:image\/png;base64,/),
        },
      ],
    });
  });

  it("TextDetector 可用时默认 analyzer 应把标题候选升级为可编辑 TextLayer", async () => {
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
    vi.stubGlobal(
      "TextDetector",
      class {
        async detect(): Promise<
          Array<{
            rawValue: string;
            boundingBox: {
              x: number;
              y: number;
              width: number;
              height: number;
            };
          }>
        > {
          return [
            {
              rawValue: "霓虹开幕",
              boundingBox: {
                x: 24,
                y: 18,
                width: 520,
                height: 96,
              },
            },
          ];
        }
      },
    );

    const originalCreateElement = document.createElement.bind(document);
    let dataUrlIndex = 0;
    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
    ) => {
      const element = originalCreateElement(tagName);

      if (tagName.toLowerCase() === "canvas") {
        const context = {
          canvas: element,
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          beginPath: vi.fn(),
          ellipse: vi.fn(),
          fill: vi.fn(),
          getImageData: vi.fn(() => ({
            data: Uint8ClampedArray.from([240, 241, 242, 255]),
          })),
          globalCompositeOperation: "source-over",
          fillStyle: "#000000",
        };

        Object.defineProperty(element, "getContext", {
          configurable: true,
          value: () => context,
        });
        Object.defineProperty(element, "toDataURL", {
          configurable: true,
          value: () =>
            [
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMQ==",
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMg==",
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMw==",
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtNA==",
              "data:image/png;base64,c3ViamVjdC1tYXNr",
              "data:image/png;base64,c3ViamVjdC1yZ2Jh",
              "data:image/png;base64,aGV1cmlzdGljLWNsZWFuLXBsYXRl",
            ][dataUrlIndex++] ?? "data:image/png;base64,ZmFsbGJhY2s=",
        });
      }

      return element;
    }) as typeof document.createElement);

    const result = await analyzeLayeredDesignFlatImage({
      image: {
        src: "data:image/png;base64,flat",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
      createdAt: CREATED_AT,
    });

    expect(result.analysis.outputs).toMatchObject({
      candidateRaster: true,
      candidateMask: true,
      cleanPlate: true,
      ocrText: true,
    });
    expect(
      result.candidates.find(
        (candidate) => candidate.id === "headline-candidate",
      ),
    ).toMatchObject({
      layer: {
        type: "text",
        text: "霓虹开幕",
        align: "center",
        color: "#111111",
      },
    });
    expect(recognizeLayeredDesignTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "headline-candidate",
      }),
    );
  });

  it("native OCR 可用时默认 analyzer 应优先使用原生结果", async () => {
    stubAnalyzerImageAndCanvasEnvironment();

    const browserDetect = vi.fn(async () => [
      {
        rawValue: "浏览器标题",
        boundingBox: {
          x: 24,
          y: 18,
          width: 520,
          height: 96,
        },
      },
    ]);
    vi.stubGlobal(
      "TextDetector",
      class {
        detect = browserDetect;
      },
    );
    recognizeLayeredDesignTextMock.mockImplementation(async (input) => ({
      supported: true,
      engine: "mock-native-ocr",
      blocks: [
        {
          text:
            input.candidateId === "body-text-candidate"
              ? "原生正文"
              : "原生标题",
          boundingBox: {
            x: 18,
            y: 12,
            width: 480,
            height: 88,
          },
          confidence: 0.92,
        },
      ],
    }));

    const result = await analyzeLayeredDesignFlatImage({
      image: {
        src: "data:image/png;base64,flat",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
      createdAt: CREATED_AT,
    });

    expect(recognizeLayeredDesignTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "headline-candidate",
      }),
    );
    expect(recognizeLayeredDesignTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "body-text-candidate",
      }),
    );
    expect(browserDetect).not.toHaveBeenCalled();
    expect(result.analysis).toMatchObject({
      analyzer: {
        label: "本地 heuristic analyzer + Desktop Host native OCR",
      },
      outputs: {
        ocrText: true,
      },
    });
    expect(
      result.candidates.find(
        (candidate) => candidate.id === "headline-candidate",
      ),
    ).toMatchObject({
      layer: {
        type: "text",
        text: "原生标题",
      },
    });
    expect(
      result.candidates.find(
        (candidate) => candidate.id === "body-text-candidate",
      ),
    ).toMatchObject({
      layer: {
        type: "text",
        text: "原生正文",
      },
    });
  });

  it("注入 OCR provider 时默认 analyzer 应优先用该来源生成 TextLayer", async () => {
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
    let dataUrlIndex = 0;
    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
    ) => {
      const element = originalCreateElement(tagName);

      if (tagName.toLowerCase() === "canvas") {
        const context = {
          canvas: element,
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          beginPath: vi.fn(),
          ellipse: vi.fn(),
          fill: vi.fn(),
          getImageData: vi.fn(() => ({
            data: Uint8ClampedArray.from([240, 241, 242, 255]),
          })),
          globalCompositeOperation: "source-over",
          fillStyle: "#000000",
        };

        Object.defineProperty(element, "getContext", {
          configurable: true,
          value: () => context,
        });
        Object.defineProperty(element, "toDataURL", {
          configurable: true,
          value: () =>
            [
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMQ==",
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMg==",
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtMw==",
              "data:image/png;base64,aGV1cmlzdGljLWNyb3AtNA==",
              "data:image/png;base64,c3ViamVjdC1tYXNr",
              "data:image/png;base64,c3ViamVjdC1yZ2Jh",
              "data:image/png;base64,aGV1cmlzdGljLWNsZWFuLXBsYXRl",
            ][dataUrlIndex++] ?? "data:image/png;base64,ZmFsbGJhY2s=",
        });
      }

      return element;
    }) as typeof document.createElement);

    const detectText = vi.fn(
      async (input: LayeredDesignFlatImageTextOcrProviderInput) => {
        expect(input.candidate.asset.kind).toBe("text_raster");

        return [
          {
            text:
              input.candidate.id === "body-text-candidate"
                ? "跨端正文"
                : "跨端标题",
            boundingBox: {
              x: 18,
              y: 12,
              width: 480,
              height: 88,
            },
            confidence: 0.92,
          },
        ];
      },
    );

    const result = await analyzeLayeredDesignFlatImage({
      image: {
        src: "data:image/png;base64,flat",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
      textOcrProvider: {
        label: "测试 native OCR",
        detectText,
      },
      createdAt: CREATED_AT,
    });

    expect(detectText).toHaveBeenCalledTimes(2);
    expect(detectText).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({ id: "headline-candidate" }),
      }),
    );
    expect(detectText).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({ id: "body-text-candidate" }),
      }),
    );
    expect(result.analysis).toMatchObject({
      analyzer: {
        label: "本地 heuristic analyzer + 测试 native OCR",
      },
      outputs: {
        candidateRaster: true,
        candidateMask: true,
        cleanPlate: true,
        ocrText: true,
      },
    });
    expect(
      result.candidates.find(
        (candidate) => candidate.id === "headline-candidate",
      ),
    ).toMatchObject({
      layer: {
        type: "text",
        text: "跨端标题",
        align: "center",
        color: "#111111",
      },
    });
    expect(
      result.candidates.find(
        (candidate) => candidate.id === "body-text-candidate",
      ),
    ).toMatchObject({
      layer: {
        type: "text",
        text: "跨端正文",
      },
    });
  });

  it("同一 OCR 候选返回多块文本时应拆成多个独立 TextLayer", async () => {
    stubAnalyzerImageAndCanvasEnvironment();

    const detectText = vi.fn(
      async (input: LayeredDesignFlatImageTextOcrProviderInput) => {
        if (input.candidate.id !== "headline-candidate") {
          return [];
        }

        return [
          {
            text: "春季新品",
            boundingBox: {
              x: 18,
              y: 12,
              width: 320,
              height: 58,
            },
            confidence: 0.93,
            params: {
              modelSlotExecution: {
                slotId: "ocr-runtime",
                attempt: 1,
              },
            },
          },
          {
            text: "立即预约",
            boundingBox: {
              x: 60,
              y: 92,
              width: 180,
              height: 42,
            },
            confidence: 0.87,
          },
        ];
      },
    );

    const result = await analyzeLayeredDesignFlatImage({
      image: {
        src: "data:image/png;base64,flat",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
      textOcrProvider: {
        label: "多块 OCR",
        detectText,
      },
      createdAt: CREATED_AT,
    });

    expect(detectText).toHaveBeenCalledTimes(2);
    expect(
      result.candidates.find(
        (candidate) => candidate.id === "headline-candidate",
      ),
    ).toBeUndefined();
    expect(
      result.candidates.find(
        (candidate) => candidate.id === "headline-candidate-text-1",
      ),
    ).toMatchObject({
      confidence: 0.93,
      layer: {
        type: "text",
        name: "标题文字候选 1",
        text: "春季新品",
        x: 126,
        y: 96,
        width: 320,
        height: 58,
        zIndex: 40,
        fontSize: 46,
        params: {
          modelSlotExecution: {
            slotId: "ocr-runtime",
            attempt: 1,
          },
          ocrSourceCandidateId: "headline-candidate",
          ocrBlockIndex: 0,
          ocrBlockCount: 2,
        },
      },
    });
    expect(
      result.candidates.find(
        (candidate) => candidate.id === "headline-candidate-text-2",
      ),
    ).toMatchObject({
      confidence: 0.87,
      layer: {
        type: "text",
        name: "标题文字候选 2",
        text: "立即预约",
        x: 168,
        y: 176,
        width: 180,
        height: 42,
        zIndex: 41,
        fontSize: 34,
        params: {
          ocrSourceCandidateId: "headline-candidate",
          ocrBlockIndex: 1,
          ocrBlockCount: 2,
        },
      },
    });
  });
});
