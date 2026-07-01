/**
 * @file Gemini 图片执行器测试
 * @description 验证 Gemini / Google 图片生成请求、参考图和输出格式
 * @module components/image-gen/geminiImageExecutor.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestImageFromGemini } from "./geminiImageExecutor";
import { silenceConsole } from "./test-utils";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Gemini 图片执行器", () => {
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

  it("裸 base64 参考图应转为 Gemini image content part", async () => {
    const base64Image = "i".repeat(128);
    const referenceImage = "s".repeat(128);
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        output_image: {
          data: base64Image,
        },
      }),
    );

    await requestImageFromGemini(
      "generativelanguage.googleapis.com",
      "test-gemini-key",
      "gemini-3.1-flash-image",
      "make a clean icon",
      [referenceImage],
      "1792x1024",
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );

    const payload = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body?: string })?.body ?? "{}",
    ) as Record<string, unknown>;

    expect(payload).toMatchObject({
      response_format: {
        aspect_ratio: "16:9",
        image_size: "2K",
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
        data: referenceImage,
      },
    ]);
  });
});
