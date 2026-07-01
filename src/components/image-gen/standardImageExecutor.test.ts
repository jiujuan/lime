import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestImagesFromStandardImagesApi } from "./standardImageExecutor";
import { silenceConsole } from "./test-utils";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createTextResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

describe("standardImageExecutor", () => {
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

  it("应调用 /v1/images/generations 并返回 URL 列表", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        data: [
          { url: "https://cdn.example.com/one.png" },
          { url: "https://cdn.example.com/two.png" },
        ],
      }),
    );

    const urls = await requestImagesFromStandardImagesApi({
      apiHost: "https://api.example.com/v1",
      apiKey: "test-key",
      model: "gpt-image-1",
      prompt: "a quiet studio",
      count: 2,
      size: "1024x1024",
    });

    expect(urls).toEqual([
      "https://cdn.example.com/one.png",
      "https://cdn.example.com/two.png",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: "a quiet studio",
          n: 2,
          size: "1024x1024",
        }),
      }),
    );
  });

  it("应把 b64_json 转成 data URL", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        data: [{ b64_json: "a".repeat(128) }],
      }),
    );

    await expect(
      requestImagesFromStandardImagesApi({
        apiHost: "https://api.example.com",
        apiKey: "test-key",
        model: "gpt-image-1",
        prompt: "base64 image",
        count: 1,
        size: "1024x1024",
      }),
    ).resolves.toEqual([`data:image/png;base64,${"a".repeat(128)}`]);
  });

  it("标准 data 为空时应从响应嵌套字段兜底解析图片", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        output: [
          {
            content: [
              {
                image_url: {
                  url: "https://cdn.example.com/fallback.png",
                },
              },
            ],
          },
        ],
      }),
    );

    await expect(
      requestImagesFromStandardImagesApi({
        apiHost: "https://api.example.com",
        apiKey: "test-key",
        model: "gpt-image-1",
        prompt: "fallback image",
        count: 1,
        size: "1024x1024",
      }),
    ).resolves.toEqual(["https://cdn.example.com/fallback.png"]);
  });

  it("错误响应应抛出状态码和响应预览", async () => {
    fetchMock.mockResolvedValueOnce(createTextResponse("bad request", 400));

    await expect(
      requestImagesFromStandardImagesApi({
        apiHost: "https://api.example.com",
        apiKey: "test-key",
        model: "gpt-image-1",
        prompt: "bad request image",
        count: 1,
        size: "1024x1024",
      }),
    ).rejects.toThrow("请求失败: 400 - bad request");
  });
});
