import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  analyzeLayeredDesignFlatImageNative,
  recognizeLayeredDesignText,
} from "./layeredDesignAnalysis";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("layeredDesignAnalysis API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 current Desktop Host 命令代理图层设计 OCR", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      supported: true,
      engine: "mock-native-ocr",
      blocks: [
        {
          text: "霓虹开幕",
          boundingBox: {
            x: 12,
            y: 16,
            width: 320,
            height: 72,
          },
          confidence: 0.9,
        },
      ],
    });

    await expect(
      recognizeLayeredDesignText({
        imageSrc: "data:image/png;base64,ZmFrZQ==",
        width: 640,
        height: 180,
        candidateId: "headline-candidate",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        supported: true,
        engine: "mock-native-ocr",
        blocks: [expect.objectContaining({ text: "霓虹开幕" })],
      }),
    );

    expect(safeInvoke).toHaveBeenCalledWith("recognize_layered_design_text", {
      request: {
        imageSrc: "data:image/png;base64,ZmFrZQ==",
        width: 640,
        height: 180,
        candidateId: "headline-candidate",
      },
    });
  });

  it("recognizeLayeredDesignText 应保留合法 unsupported fallback", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        supported: false,
        engine: "vision_unsupported",
        blocks: [],
        message: "当前平台不支持 native OCR",
      })
      .mockResolvedValueOnce({
        supported: false,
        engine: "vision_unsupported",
        blocks: [],
        message: "Electron host command is not supported",
        error:
          "Electron host command is not supported: recognize_layered_design_text",
      });

    const request = {
      imageSrc: "data:image/png;base64,ZmFrZQ==",
      width: 640,
      height: 180,
    };

    await expect(recognizeLayeredDesignText(request)).resolves.toEqual({
      supported: false,
      engine: "vision_unsupported",
      blocks: [],
      message: "当前平台不支持 native OCR",
    });
    await expect(recognizeLayeredDesignText(request)).rejects.toThrow(
      "recognize_layered_design_text returned an error envelope",
    );
  });

  it("recognizeLayeredDesignText 收到 unsupported host error envelope 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      error: "Electron host command is not supported: recognize_layered_design_text",
    });

    await expect(
      recognizeLayeredDesignText({
        imageSrc: "data:image/png;base64,ZmFrZQ==",
        width: 640,
        height: 180,
      }),
    ).rejects.toThrow(
      "recognize_layered_design_text returned an error envelope",
    );
  });

  it("recognizeLayeredDesignText 遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "recognize_layered_design_text",
        source: "electron-host-diagnostic",
      },
    });

    await expect(
      recognizeLayeredDesignText({
        imageSrc: "data:image/png;base64,ZmFrZQ==",
        width: 640,
        height: 180,
      }),
    ).rejects.toThrow(
      "recognize_layered_design_text 尚未接入真实 Layered Design extraction current 通道",
    );
  });

  it("recognizeLayeredDesignText 应校验返回形态", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        supported: true,
        engine: "mock-native-ocr",
      })
      .mockResolvedValueOnce({
        supported: true,
        engine: "mock-native-ocr",
        blocks: [{ text: "标题", confidence: "high" }],
      });

    const request = {
      imageSrc: "data:image/png;base64,ZmFrZQ==",
      width: 640,
      height: 180,
    };

    await expect(recognizeLayeredDesignText(request)).rejects.toThrow(
      "recognize_layered_design_text 未返回有效图层文字识别结果",
    );
    await expect(recognizeLayeredDesignText(request)).rejects.toThrow(
      "recognize_layered_design_text 未返回有效图层文字识别结果",
    );
    await expect(recognizeLayeredDesignText(request)).rejects.toThrow(
      "recognize_layered_design_text 未返回有效图层文字识别结果",
    );
  });

  it("应通过 current Desktop Host 命令代理扁平图 structured analyzer", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      supported: true,
      engine: "native_heuristic_analyzer",
      result: {
        analyzer: {
          kind: "local_heuristic",
          label: "Desktop Host native heuristic analyzer",
        },
        generatedAt: "2026-05-07T00:00:00.000Z",
        candidates: [],
        cleanPlate: {
          status: "not_requested",
        },
      },
    });

    await expect(
      analyzeLayeredDesignFlatImageNative({
        image: {
          src: "data:image/png;base64,ZmFrZQ==",
          width: 900,
          height: 1400,
          mimeType: "image/png",
        },
        createdAt: "2026-05-07T00:00:00.000Z",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        supported: true,
        engine: "native_heuristic_analyzer",
        result: expect.objectContaining({
          analyzer: expect.objectContaining({
            label: "Desktop Host native heuristic analyzer",
          }),
        }),
      }),
    );

    expect(safeInvoke).toHaveBeenCalledWith(
      "analyze_layered_design_flat_image",
      {
        request: {
          image: {
            src: "data:image/png;base64,ZmFrZQ==",
            width: 900,
            height: 1400,
            mimeType: "image/png",
          },
          createdAt: "2026-05-07T00:00:00.000Z",
        },
      },
    );
  });

  it("analyzeLayeredDesignFlatImageNative 应保留合法 unsupported fallback", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        supported: false,
        engine: "native_heuristic_analyzer",
        message: "当前来源不支持 native structured analyzer",
      })
      .mockResolvedValueOnce({
        supported: false,
        engine: "native_heuristic_analyzer",
        message: "Electron host command is not supported",
        error:
          "Electron host command is not supported: analyze_layered_design_flat_image",
      });

    const request = {
      image: {
        src: "https://example.com/remote.png",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
    };

    await expect(analyzeLayeredDesignFlatImageNative(request)).resolves.toEqual({
      supported: false,
      engine: "native_heuristic_analyzer",
      message: "当前来源不支持 native structured analyzer",
    });
    await expect(analyzeLayeredDesignFlatImageNative(request)).rejects.toThrow(
      "analyze_layered_design_flat_image returned an error envelope",
    );
  });

  it("analyzeLayeredDesignFlatImageNative 收到 unsupported host error envelope 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      error:
        "Electron host command is not supported: analyze_layered_design_flat_image",
    });

    await expect(
      analyzeLayeredDesignFlatImageNative({
        image: {
          src: "https://example.com/remote.png",
          width: 900,
          height: 1400,
          mimeType: "image/png",
        },
      }),
    ).rejects.toThrow(
      "analyze_layered_design_flat_image returned an error envelope",
    );
  });

  it("analyzeLayeredDesignFlatImageNative 遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "analyze_layered_design_flat_image",
        source: "electron-host-diagnostic",
      },
    });

    await expect(
      analyzeLayeredDesignFlatImageNative({
        image: {
          src: "data:image/png;base64,ZmFrZQ==",
          width: 900,
          height: 1400,
          mimeType: "image/png",
        },
      }),
    ).rejects.toThrow(
      "analyze_layered_design_flat_image 尚未接入真实 Layered Design extraction current 通道",
    );
  });

  it("analyzeLayeredDesignFlatImageNative 应校验返回形态", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        supported: true,
        engine: "native_heuristic_analyzer",
      })
      .mockResolvedValueOnce({
        supported: "yes",
        engine: "native_heuristic_analyzer",
      });

    const request = {
      image: {
        src: "data:image/png;base64,ZmFrZQ==",
        width: 900,
        height: 1400,
        mimeType: "image/png",
      },
    };

    await expect(analyzeLayeredDesignFlatImageNative(request)).rejects.toThrow(
      "analyze_layered_design_flat_image 未返回有效图层扁平图分析结果",
    );
    await expect(analyzeLayeredDesignFlatImageNative(request)).rejects.toThrow(
      "analyze_layered_design_flat_image 未返回有效图层扁平图分析结果",
    );
    await expect(analyzeLayeredDesignFlatImageNative(request)).rejects.toThrow(
      "analyze_layered_design_flat_image 未返回有效图层扁平图分析结果",
    );
  });
});
