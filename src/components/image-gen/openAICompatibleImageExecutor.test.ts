/**
 * @file OpenAI 兼容图片执行器测试
 * @description 验证 New API / OpenAI-compatible 图片生成和 Responses fallback 链路
 * @module components/image-gen/openAICompatibleImageExecutor.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildNewApiResponsesImageRequest,
  buildOpenAICompatibleImageRequest,
  normalizeOpenAICompatibleImageReferences,
  requestImageFromNewApi,
  requestImageFromNewApiResponsesStream,
} from "./openAICompatibleImageExecutor";
import { extractImageBase64FromResponsesStreamEvent } from "./imageResponseParsers";
import { silenceConsole } from "./test-utils";

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

describe("OpenAI 兼容图片执行器", () => {
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
    ).toThrow(
      "OpenAI 图片编辑仅支持 http/https URL 或 data:image base64 参考图",
    );
  });

  it("Responses 流式请求应使用外层模型和 image_generation 工具模型", () => {
    const request = buildNewApiResponsesImageRequest(
      "gpt-images-2",
      "生成图片",
    );

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

  it("gpt-image-1 不应误走 Responses 流式主路径", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        data: [{ url: "https://cdn.example.com/gpt-image-1.png" }],
      }),
    );

    const imageUrl = await requestImageFromNewApi(
      "https://airgate.example.com/v1",
      "test-new-api-key",
      "gpt-image-1",
      "make a clean icon",
      [],
      "1024x1024",
    );

    expect(imageUrl).toBe("https://cdn.example.com/gpt-image-1.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://airgate.example.com/v1/images/generations",
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
