import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeLayeredDesignFlatImage,
  createLayeredDesignFlatImageAnalysisResultFromStructuredResult,
  createLayeredDesignFlatImageAnalyzerFromStructuredProvider,
  createLayeredDesignFlatImageDraftDocument,
  createLayeredDesignNativeStructuredAnalyzerProvider,
  createLayeredDesignNativeTextOcrProvider,
} from "./index";

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
});

describe("LayeredDesign structured analyzer pure adapter", () => {
  it("native OCR provider 应把 Tauri 命令输出映射为 analyzer text blocks", async () => {
    const recognizeText = vi.fn(async () => ({
      supported: true,
      engine: "mock-native-ocr",
      blocks: [
        {
          text: "主标题",
          boundingBox: {
            x: 10,
            y: 12,
            width: 240,
            height: 64,
          },
          confidence: 0.91,
        },
      ],
    }));
    const provider = createLayeredDesignNativeTextOcrProvider(recognizeText);

    await expect(
      provider.detectText({
        image: {
          src: "data:image/png;base64,flat",
          width: 900,
          height: 1400,
          mimeType: "image/png",
        },
        candidate: {
          id: "headline-candidate",
          name: "标题候选",
          role: "text",
          rect: {
            x: 100,
            y: 120,
            width: 520,
            height: 120,
          },
          asset: {
            id: "headline-asset",
            kind: "text_raster",
            src: "data:image/png;base64,crop",
            width: 520,
            height: 120,
            hasAlpha: false,
            createdAt: CREATED_AT,
          },
        },
      }),
    ).resolves.toEqual([
      {
        text: "主标题",
        boundingBox: {
          x: 10,
          y: 12,
          width: 240,
          height: 64,
        },
        confidence: 0.91,
      },
    ]);
    expect(recognizeText).toHaveBeenCalledWith({
      imageSrc: "data:image/png;base64,crop",
      width: 520,
      height: 120,
      candidateId: "headline-candidate",
    });
  });

  it("应把 structured analyzer 结果投影为 current extraction seam", () => {
    const result =
      createLayeredDesignFlatImageAnalysisResultFromStructuredResult({
        analyzer: {
          kind: "structured_pipeline",
          label: "测试 structured analyzer",
        },
        generatedAt: CREATED_AT,
        candidates: [
          {
            id: "subject-candidate",
            type: "image",
            role: "subject",
            name: "人物主体",
            confidence: 0.93,
            rect: {
              x: 120,
              y: 220,
              width: 760,
              height: 980,
            },
            image: {
              id: "subject-rgba",
              src: "data:image/png;base64,c3ViamVjdC1yZ2Jh",
              width: 760,
              height: 980,
              hasAlpha: true,
              params: {
                seed: "native_heuristic_subject_masked",
                foregroundPixelCount: 312_000,
                detectedForegroundPixelCount: 0,
                ellipseFallbackApplied: true,
                totalPixelCount: 760 * 980,
              },
            },
            mask: {
              id: "subject-mask",
              src: "data:image/png;base64,c3ViamVjdC1tYXNr",
              width: 760,
              height: 980,
            },
          },
          {
            id: "headline-candidate",
            type: "text",
            role: "text",
            name: "标题文案",
            confidence: 0.88,
            rect: {
              x: 156,
              y: 104,
              width: 700,
              height: 148,
            },
            text: "霓虹开幕",
            fontSize: 72,
            color: "#f97316",
            align: "center",
          },
        ],
        cleanPlate: {
          asset: {
            id: "clean-plate-asset",
            src: "data:image/png;base64,Y2xlYW4tcGxhdGU=",
            width: 1080,
            height: 1440,
            hasAlpha: false,
            params: {
              seed: "native_heuristic_clean_plate",
              filledPixelCount: 312_000,
              totalSubjectPixelCount: 312_000,
              maskApplied: true,
            },
          },
          message: "背景已修补。",
        },
      });

    expect(result.analysis).toMatchObject({
      analyzer: {
        kind: "structured_pipeline",
        label: "测试 structured analyzer",
      },
      outputs: {
        candidateRaster: true,
        candidateMask: true,
        cleanPlate: true,
        ocrText: true,
      },
      generatedAt: CREATED_AT,
    });
    expect(result.cleanPlate).toMatchObject({
      status: "succeeded",
      message: "背景已修补。",
      asset: {
        id: "clean-plate-asset",
        kind: "clean_plate",
      },
    });
    expect(result.candidates[0]).toMatchObject({
      id: "subject-candidate",
      role: "subject",
      layer: {
        id: "subject-candidate-layer",
        type: "image",
        assetId: "subject-rgba",
        maskAssetId: "subject-mask",
        alphaMode: "mask",
      },
      assets: [
        {
          id: "subject-rgba",
          kind: "subject",
        },
        {
          id: "subject-mask",
          kind: "mask",
        },
      ],
    });
    expect(result.candidates[1]).toMatchObject({
      id: "headline-candidate",
      role: "text",
      layer: {
        id: "headline-candidate-layer",
        type: "text",
        text: "霓虹开幕",
        align: "center",
      },
    });
  });

  it("注入 structured analyzer provider 时应直接替换本地 heuristic 来源", async () => {
    const textOcrProvider = {
      label: "外部 OCR",
      detectText: vi.fn(async () => []),
    };
    const analyze = vi.fn(async () => ({
      analyzer: {
        kind: "structured_pipeline" as const,
        label: "测试真实 analyzer provider",
      },
      candidates: [
        {
          id: "provider-headline",
          type: "text" as const,
          role: "text" as const,
          name: "Provider 标题",
          confidence: 0.94,
          rect: {
            x: 120,
            y: 96,
            width: 640,
            height: 120,
          },
          text: "真实 analyzer 标题",
          fontSize: 64,
          color: "#111111",
          align: "center" as const,
        },
      ],
      cleanPlate: {
        status: "not_requested" as const,
        message: "由外部 analyzer 决定本轮不生成 clean plate。",
      },
    }));

    const result = await analyzeLayeredDesignFlatImage({
      image: {
        src: "data:image/png;base64,flat",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
      structuredAnalyzerProvider: { analyze },
      textOcrProvider,
      createdAt: CREATED_AT,
    });

    expect(analyze).toHaveBeenCalledWith({
      image: {
        src: "data:image/png;base64,flat",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
      createdAt: CREATED_AT,
      textOcrProvider,
    });
    expect(textOcrProvider.detectText).not.toHaveBeenCalled();
    expect(result.analysis).toMatchObject({
      analyzer: {
        kind: "structured_pipeline",
        label: "测试真实 analyzer provider",
      },
      outputs: {
        candidateRaster: false,
        candidateMask: false,
        cleanPlate: false,
        ocrText: true,
      },
      generatedAt: CREATED_AT,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: "provider-headline",
      layer: {
        type: "text",
        text: "真实 analyzer 标题",
      },
    });
  });

  it("native structured analyzer provider 应代理 Tauri analyzer 命令", async () => {
    analyzeLayeredDesignFlatImageNativeMock.mockResolvedValueOnce({
      supported: true,
      engine: "native_heuristic_analyzer",
      result: {
        analyzer: {
          kind: "local_heuristic",
          label: "Tauri native heuristic analyzer",
        },
        generatedAt: CREATED_AT,
        candidates: [
          {
            id: "native-subject",
            type: "image",
            role: "subject",
            name: "Native 主体",
            confidence: 0.9,
            rect: {
              x: 120,
              y: 180,
              width: 620,
              height: 860,
            },
            image: {
              id: "native-subject-asset",
              kind: "subject",
              src: "data:image/png;base64,native",
              width: 620,
              height: 860,
              hasAlpha: true,
            },
          },
        ],
        cleanPlate: {
          status: "not_requested",
        },
      },
    });

    const provider = createLayeredDesignNativeStructuredAnalyzerProvider();
    await expect(
      provider.analyze({
        image: {
          src: "data:image/png;base64,flat",
          width: 900,
          height: 1400,
          mimeType: "image/png",
        },
        createdAt: CREATED_AT,
      }),
    ).resolves.toMatchObject({
      analyzer: {
        label: "Tauri native heuristic analyzer",
      },
      candidates: [
        {
          id: "native-subject",
        },
      ],
    });
    expect(analyzeLayeredDesignFlatImageNativeMock).toHaveBeenCalledWith({
      image: {
        src: "data:image/png;base64,flat",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
      createdAt: CREATED_AT,
    });
  });

  it("native structured analyzer provider unsupported 时应抛错交给 fallback", async () => {
    analyzeLayeredDesignFlatImageNativeMock.mockResolvedValueOnce({
      supported: false,
      engine: "native_heuristic_analyzer",
      message: "native analyzer 暂不可用",
    });

    const provider = createLayeredDesignNativeStructuredAnalyzerProvider();
    await expect(
      provider.analyze({
        image: {
          src: "https://example.test/flat.png",
          width: 900,
          height: 1400,
        },
        createdAt: CREATED_AT,
      }),
    ).rejects.toThrow("native analyzer 暂不可用");
  });

  it("应把 structured analyzer provider 包装成 DesignCanvas 可注入 analyzer", async () => {
    const textOcrProvider = {
      label: "Adapter OCR",
      detectText: vi.fn(async () => []),
    };
    const analyze = vi.fn(async () => ({
      analyzer: {
        kind: "structured_pipeline" as const,
        label: "Adapter structured analyzer",
      },
      candidates: [
        {
          id: "adapter-subject",
          type: "image" as const,
          role: "subject" as const,
          confidence: 0.91,
          rect: {
            x: 80,
            y: 180,
            width: 520,
            height: 760,
          },
          image: {
            id: "adapter-subject-rgba",
            src: "data:image/png;base64,YWRhcHRlci1zdWJqZWN0",
            width: 520,
            height: 760,
            hasAlpha: true,
          },
        },
      ],
    }));
    const analyzer = createLayeredDesignFlatImageAnalyzerFromStructuredProvider(
      { analyze },
      { textOcrProvider },
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

    expect(analyze).toHaveBeenCalledWith({
      image: {
        src: "data:image/png;base64,flat",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
      createdAt: CREATED_AT,
      textOcrProvider,
    });
    expect(result.analysis).toMatchObject({
      analyzer: {
        label: "Adapter structured analyzer",
      },
      outputs: {
        candidateRaster: true,
        candidateMask: false,
        cleanPlate: false,
        ocrText: false,
      },
    });
    expect(result.candidates[0]).toMatchObject({
      id: "adapter-subject",
      layer: {
        type: "image",
        assetId: "adapter-subject-rgba",
      },
    });
  });

  it("structured analyzer provider 失败且禁用 fallback 时 adapter 应保留错误", async () => {
    const analyze = vi.fn(async () => {
      throw new Error("真实 analyzer 暂不可用");
    });
    const analyzer = createLayeredDesignFlatImageAnalyzerFromStructuredProvider(
      {
        analyze,
      },
      {
        fallbackAnalyzer: null,
      },
    );

    await expect(
      analyzer({
        image: {
          src: "data:image/png;base64,flat",
          width: 900,
          height: 1400,
          mimeType: "image/png",
        },
        createdAt: CREATED_AT,
      }),
    ).rejects.toThrow("真实 analyzer 暂不可用");
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("应允许 structured analyzer 结果直接创建 flat image draft", () => {
    const result =
      createLayeredDesignFlatImageAnalysisResultFromStructuredResult({
        analyzer: {
          kind: "structured_pipeline",
          label: "测试 structured analyzer",
        },
        generatedAt: CREATED_AT,
        candidates: [
          {
            id: "subject-candidate",
            type: "image",
            role: "subject",
            name: "人物主体",
            confidence: 0.93,
            rect: {
              x: 120,
              y: 220,
              width: 760,
              height: 980,
            },
            image: {
              id: "subject-rgba",
              src: "data:image/png;base64,c3ViamVjdC1yZ2Jh",
              width: 760,
              height: 980,
              hasAlpha: true,
              params: {
                seed: "native_heuristic_subject_masked",
                foregroundPixelCount: 312_000,
                detectedForegroundPixelCount: 0,
                ellipseFallbackApplied: true,
                totalPixelCount: 760 * 980,
              },
            },
            mask: {
              id: "subject-mask",
              src: "data:image/png;base64,c3ViamVjdC1tYXNr",
              width: 760,
              height: 980,
            },
          },
          {
            id: "headline-candidate",
            type: "text",
            role: "text",
            name: "标题文案",
            confidence: 0.88,
            rect: {
              x: 156,
              y: 104,
              width: 700,
              height: 148,
            },
            text: "霓虹开幕",
            fontSize: 72,
            color: "#f97316",
            align: "center",
          },
        ],
        cleanPlate: {
          asset: {
            id: "clean-plate-asset",
            src: "data:image/png;base64,Y2xlYW4tcGxhdGU=",
            width: 1080,
            height: 1440,
            hasAlpha: false,
            params: {
              seed: "native_heuristic_clean_plate",
              filledPixelCount: 312_000,
              totalSubjectPixelCount: 312_000,
              maskApplied: true,
            },
          },
          message: "背景已修补。",
        },
      });
    const draft = createLayeredDesignFlatImageDraftDocument({
      title: "structured-flat",
      image: {
        src: "data:image/png;base64,ZmxhdC1zdHJ1Y3R1cmVk",
        width: 1080,
        height: 1440,
        fileName: "structured-flat.png",
        mimeType: "image/png",
      },
      analysis: result.analysis,
      candidates: result.candidates,
      cleanPlate: result.cleanPlate,
      createdAt: CREATED_AT,
    });

    expect(draft.layers.map((layer) => layer.id)).toEqual([
      "extraction-background-image",
      "subject-candidate-layer",
      "headline-candidate-layer",
    ]);
    expect(draft.layers[0]).toMatchObject({
      id: "extraction-background-image",
      assetId: "clean-plate-asset",
    });
    expect(draft.extraction?.analysis?.outputs).toMatchObject({
      candidateRaster: true,
      candidateMask: true,
      cleanPlate: true,
      ocrText: true,
    });
    expect(
      draft.assets.find((asset) => asset.id === "subject-rgba")?.params,
    ).toMatchObject({
      seed: "native_heuristic_subject_masked",
      foregroundPixelCount: 312_000,
      detectedForegroundPixelCount: 0,
      ellipseFallbackApplied: true,
      totalPixelCount: 760 * 980,
    });
    expect(
      draft.assets.find((asset) => asset.id === "clean-plate-asset")?.params,
    ).toMatchObject({
      seed: "native_heuristic_clean_plate",
      filledPixelCount: 312_000,
      totalSubjectPixelCount: 312_000,
      maskApplied: true,
    });
    expect(
      draft.extraction?.candidates.find(
        (candidate) => candidate.id === "subject-candidate",
      ),
    ).toMatchObject({
      layer: {
        maskAssetId: "subject-mask",
        alphaMode: "mask",
      },
    });
    expect(
      draft.extraction?.candidates.find(
        (candidate) => candidate.id === "headline-candidate",
      ),
    ).toMatchObject({
      layer: {
        type: "text",
        text: "霓虹开幕",
      },
    });
  });

  it("clean plate 失败时不应把 outputs.cleanPlate 标成已可用", () => {
    const result =
      createLayeredDesignFlatImageAnalysisResultFromStructuredResult({
        analyzer: {
          kind: "structured_pipeline",
          label: "测试 structured analyzer",
        },
        generatedAt: CREATED_AT,
        candidates: [],
        cleanPlate: {
          status: "failed",
          message: "背景修补失败。",
        },
      });

    expect(result.analysis.outputs).toMatchObject({
      candidateRaster: false,
      candidateMask: false,
      cleanPlate: false,
      ocrText: false,
    });
    expect(result.cleanPlate).toMatchObject({
      status: "failed",
      message: "背景修补失败。",
    });
  });
});
