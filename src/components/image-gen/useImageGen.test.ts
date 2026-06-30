/**
 * @file useImageGen Fal 调用测试
 * @description 验证 Fal 图片生成关键回退链路
 * @module components/image-gen/useImageGen.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __imageGenFalTestUtils } from "./useImageGen";
import { silenceConsole } from "./test-utils";

const {
  buildOpenAICompatibleImageRequest,
  buildNewApiResponsesImageRequest,
  extractImageBase64FromResponsesStreamEvent,
  normalizeOpenAICompatibleImageReferences,
  requestImageFromNewApiResponsesStream,
  requestImageFromNewApi,
  requestImageFromGemini,
  buildFalInput,
  requestImageFromFal,
  resolveFalEndpointModelCandidates,
} = __imageGenFalTestUtils;

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createTextResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

function createSseResponse(events: string[]): Response {
  return new Response(events.join("\n\n") + "\n\n", {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("useImageGen Fal 调用链路", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    silenceConsole();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("nano-banana-pro 同步请求应使用官方 schema", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        images: [{ url: "https://cdn.example.com/sync-ok.png" }],
      }),
    );

    const imageUrl = await requestImageFromFal(
      "https://fal.run",
      "test-fal-key",
      "fal-ai/nano-banana-pro",
      "a red apple",
      [],
      "1024x1024",
    );

    expect(imageUrl).toBe("https://cdn.example.com/sync-ok.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://fal.run/fal-ai/nano-banana-pro",
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({
      Authorization: "Key test-fal-key",
    });

    const payload = JSON.parse(requestInit?.body ?? "{}") as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      prompt: "a red apple",
      num_images: 1,
      aspect_ratio: "1:1",
      output_format: "png",
      safety_tolerance: "4",
    });
    expect(payload).not.toHaveProperty("image_size");
    expect(payload).not.toHaveProperty("enable_safety_checker");
    expect(payload).not.toHaveProperty("image_url");
    expect(payload).not.toHaveProperty("image_urls");
  });

  it("1792x1024 应映射为 Fal 支持的 16:9，而不是 7:4", () => {
    const payload = buildFalInput(
      "a spring cafe",
      [],
      "1792x1024",
      "fal-ai/nano-banana-pro",
      true,
    ) as Record<string, unknown>;

    expect(payload.aspect_ratio).toBe("16:9");
  });

  it("Fal Host 带 /fal-ai 历史路径时应自动归一化，避免重复拼接", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        images: [{ url: "https://cdn.example.com/normalized-host.png" }],
      }),
    );

    const imageUrl = await requestImageFromFal(
      "https://fal.run/fal-ai",
      "test-fal-key",
      "fal-ai/nano-banana-pro",
      "normalize host",
      [],
      "1024x1024",
    );

    expect(imageUrl).toBe("https://cdn.example.com/normalized-host.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://fal.run/fal-ai/nano-banana-pro",
    );
  });

  it("nano-banana 遇到过短 prompt 时应自动扩写，避免服务端 422", () => {
    const payload = buildFalInput(
      "春天",
      [],
      "1024x1024",
      "fal-ai/nano-banana-pro",
      true,
    ) as Record<string, unknown>;

    expect(payload.prompt).toBe("请围绕“春天”生成一张图像");
  });

  it("同步失败后应回退到 /response 结果地址并返回图片", async () => {
    fetchMock
      .mockResolvedValueOnce(createTextResponse("sync primary failed", 500))
      .mockResolvedValueOnce(createJsonResponse({ request_id: "req-1" }, 200))
      .mockResolvedValueOnce(createJsonResponse({ status: "COMPLETED" }))
      .mockResolvedValueOnce(
        createJsonResponse({
          images: [{ url: "https://cdn.example.com/queue-ok.png" }],
        }),
      );

    const imageUrl = await requestImageFromFal(
      "https://fal.run",
      "test-fal-key",
      "fal-ai/nano-banana-pro",
      "a robot cat",
      [],
      "1024x1024",
    );

    expect(imageUrl).toBe("https://cdn.example.com/queue-ok.png");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://queue.fal.run/fal-ai/nano-banana-pro",
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://queue.fal.run/fal-ai/nano-banana-pro/requests/req-1/status",
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "https://queue.fal.run/fal-ai/nano-banana-pro/requests/req-1/response",
    );
  });

  it("带参考图时应先尝试 /edit，再回退基础端点且基础端点不应继续携带 edit 图参", async () => {
    const endpointCandidates = resolveFalEndpointModelCandidates(
      "fal-ai/nano-banana-pro",
      true,
    );
    expect(endpointCandidates).toEqual([
      "fal-ai/nano-banana-pro/edit",
      "fal-ai/nano-banana-pro",
    ]);

    fetchMock
      .mockResolvedValueOnce(createTextResponse("edit primary failed", 404))
      .mockResolvedValueOnce(createTextResponse("edit queue failed", 500))
      .mockResolvedValueOnce(
        createJsonResponse({
          images: [{ url: "https://cdn.example.com/base-fallback.png" }],
        }),
      );

    const imageUrl = await requestImageFromFal(
      "https://fal.run",
      "test-fal-key",
      "fal-ai/nano-banana-pro",
      "edit this image",
      ["https://cdn.example.com/reference.png"],
      "1024x1024",
    );

    expect(imageUrl).toBe("https://cdn.example.com/base-fallback.png");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://fal.run/fal-ai/nano-banana-pro/edit",
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://fal.run/fal-ai/nano-banana-pro",
    );

    const editPayload = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body?: string })?.body ?? "{}",
    ) as Record<string, unknown>;
    const basePayload = JSON.parse(
      (fetchMock.mock.calls[2]?.[1] as { body?: string })?.body ?? "{}",
    ) as Record<string, unknown>;

    expect(editPayload).toMatchObject({
      image_urls: ["https://cdn.example.com/reference.png"],
    });
    expect(basePayload).not.toHaveProperty("image_urls");
    expect(basePayload).not.toHaveProperty("image_url");
  });
});

describe("useImageGen New API 图片接口", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    silenceConsole();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("无参考图时应使用 /v1/images/generations JSON 请求", () => {
    const request = buildOpenAICompatibleImageRequest(
      "gpt-images-2",
      "a quiet studio",
      [],
      "1024x1024",
    );

    expect(request.endpointPath).toBe("/v1/images/generations");
    expect(request.logTag).toBe("new-api/images");
    expect(request.payload).toEqual({
      model: "gpt-images-2",
      prompt: "a quiet studio",
      n: 1,
      size: "1024x1024",
    });
  });

  it("有参考图时应使用 /v1/images/edits 且通过 images.image_url 传图", () => {
    const request = buildOpenAICompatibleImageRequest(
      "gpt-images-2",
      "turn it into a poster",
      ["https://cdn.example.com/reference.png"],
      "1024x1024",
    );

    expect(request.endpointPath).toBe("/v1/images/edits");
    expect(request.logTag).toBe("new-api/images-edit");
    expect(request.payload).toEqual({
      model: "gpt-images-2",
      prompt: "turn it into a poster",
      n: 1,
      size: "1024x1024",
      images: [{ image_url: "https://cdn.example.com/reference.png" }],
    });
  });

  it("New API edits 不接受无法直接传给中转站的参考图协议", () => {
    expect(() =>
      normalizeOpenAICompatibleImageReferences(["blob:http://example.local/1"]),
    ).toThrow("OpenAI 图片编辑仅支持 http/https URL 或 data:image base64 参考图");
  });

  it("Responses 流式请求应使用外层模型和 image_generation 工具模型", () => {
    const request = buildNewApiResponsesImageRequest("gpt-images-2", "生成图片");

    expect(request).toEqual({
      model: "gpt-5.5",
      input: "生成图片",
      tools: [{ type: "image_generation", model: "gpt-images-2" }],
      stream: true,
    });
  });

  it("应从 Responses SSE 的 image_generation_call.result 提取图片 base64", () => {
    const base64Image = "a".repeat(128);
    const extracted = extractImageBase64FromResponsesStreamEvent(
      [
        "event: response.output_item.done",
        `data: ${JSON.stringify({
          item: {
            type: "image_generation_call",
            result: base64Image,
          },
        })}`,
      ].join("\n"),
    );

    expect(extracted).toBe(base64Image);
  });

  it("New API Responses 流式 fallback 应返回 SSE 图片结果", async () => {
    const base64Image = "c".repeat(128);
    fetchMock.mockResolvedValueOnce(
      createSseResponse([
        [
          "event: response.output_item.done",
          `data: ${JSON.stringify({
            item: {
              type: "image_generation_call",
              result: base64Image,
            },
          })}`,
        ].join("\n"),
      ]),
    );

    const imageUrl = await requestImageFromNewApiResponsesStream(
      "https://airgate.example.com/v1",
      "test-new-api-key",
      "gpt-images-2",
      "make a clean icon",
      [],
      "1024x1024",
    );

    expect(imageUrl.imageUrl).toBe(`data:image/png;base64,${base64Image}`);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://airgate.example.com/v1/responses",
    );

    const payload = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body?: string })?.body ?? "{}",
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({
      model: "gpt-5.5",
      tools: [{ type: "image_generation", model: "gpt-images-2" }],
      stream: true,
    });
  });

  it("gpt-images-2 主路径应先使用 Responses 流式 image_generation", async () => {
    const base64Image = "e".repeat(128);
    fetchMock.mockResolvedValueOnce(
      createSseResponse([
        [
          "event: response.output_item.done",
          `data: ${JSON.stringify({
            item: {
              type: "image_generation_call",
              result: base64Image,
            },
          })}`,
        ].join("\n"),
      ]),
    );

    const imageUrl = await requestImageFromNewApi(
      "https://airgate.example.com/v1",
      "test-new-api-key",
      "gpt-images-2",
      "make a clean icon",
      [],
      "1024x1024",
    );

    expect(imageUrl).toBe(`data:image/png;base64,${base64Image}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://airgate.example.com/v1/responses",
    );
  });

  it("Responses 流式遇到额度错误时不应继续 fallback 其他端点", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            message: "Token quota exhausted",
            type: "new_api_error",
          },
        },
        401,
      ),
    );

    await expect(
      requestImageFromNewApi(
        "https://airgate.example.com/v1",
        "test-new-api-key",
        "gpt-images-2",
        "make a clean icon",
        [],
        "1024x1024",
      ),
    ).rejects.toThrow("Responses image_generation 调用失败");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://airgate.example.com/v1/responses",
    );
  });

  it("Responses 返回 input must be a list 时应按消息数组重试", async () => {
    const base64Image = "d".repeat(128);
    fetchMock
      .mockResolvedValueOnce(createTextResponse("Input must be a list", 400))
      .mockResolvedValueOnce(
        createSseResponse([
          [
            "event: response.output_item.done",
            `data: ${JSON.stringify({
              item: {
                type: "image_generation_call",
                result: base64Image,
              },
            })}`,
          ].join("\n"),
        ]),
      );

    const imageUrl = await requestImageFromNewApiResponsesStream(
      "https://airgate.example.com",
      "test-new-api-key",
      "gpt-images-2",
      "make a clean icon",
      [],
      "1024x1024",
    );

    expect(imageUrl.imageUrl).toBe(`data:image/png;base64,${base64Image}`);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryPayload = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as { body?: string })?.body ?? "{}",
    ) as Record<string, unknown>;
    expect(retryPayload.input).toEqual([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: expect.stringContaining("请生成一张图片"),
          },
        ],
      },
    ]);
  });
});

describe("useImageGen Gemini 图片接口", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    silenceConsole();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("应通过 interactions 和 x-goog-api-key 请求 Gemini 图片", async () => {
    const base64Image = "g".repeat(128);
    const referenceImage = `data:image/png;base64,${"r".repeat(128)}`;
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        output_image: {
          data: base64Image,
        },
      }),
    );

    const imageUrl = await requestImageFromGemini(
      "https://generativelanguage.googleapis.com",
      "test-gemini-key",
      "gemini-3.1-flash-image",
      "make a clean icon",
      [referenceImage],
      "1024x1024",
    );

    expect(imageUrl).toBe(`data:image/png;base64,${base64Image}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };

    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({
      "x-goog-api-key": "test-gemini-key",
    });

    const payload = JSON.parse(requestInit?.body ?? "{}") as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      model: "gemini-3.1-flash-image",
      response_format: {
        type: "image",
        mime_type: "image/png",
        aspect_ratio: "1:1",
        image_size: "1K",
      },
    });
    expect(payload.input).toEqual([
      {
        type: "text",
        text: "make a clean icon",
      },
      {
        type: "image",
        mime_type: "image/png",
        data: "r".repeat(128),
      },
    ]);
  });
});
