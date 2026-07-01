import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { silenceConsole } from "./test-utils";
import {
  __localImageServerExecutorTestUtils,
  requestImagesFromLocalImageServer,
} from "./localImageServerExecutor";
import { __localImageServerErrorsTestUtils } from "./localImageServerErrors";

const { mockGetConfig } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
}));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
}));

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

describe("localImageServerExecutor", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    silenceConsole();
    mockGetConfig.mockResolvedValue({
      server: {
        host: "0.0.0.0",
        port: 48100,
        api_key: "local-server-key",
        tls: { enable: false },
      },
      default_provider: "openai",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("应把 0.0.0.0 归一到本机访问地址", () => {
    expect(
      __localImageServerExecutorTestUtils.buildLocalImageGenerationUrl({
        host: "0.0.0.0",
        port: 48100,
      }),
    ).toBe("http://127.0.0.1:48100/v1/images/generations");
  });

  it("应调用本机图片服务并用 x-provider-id 锁定 Provider", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        data: [{ url: "https://cdn.example.com/generated.png" }],
      }),
    );

    const urls = await requestImagesFromLocalImageServer({
      providerId: "fal",
      model: "fal-ai/nano-banana-pro",
      prompt: "青柠插画",
      count: 1,
      size: "1024x1024",
      referenceImages: ["https://cdn.example.com/ref.png"],
    });

    expect(urls).toEqual(["https://cdn.example.com/generated.png"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:48100/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer local-server-key",
          "x-provider-id": "fal",
        }),
        body: JSON.stringify({
          model: "fal-ai/nano-banana-pro",
          prompt: "青柠插画",
          n: 1,
          size: "1024x1024",
          reference_images: ["https://cdn.example.com/ref.png"],
        }),
      }),
    );
  });

  it("应将缺 API Key 归类为 missing_api_key", async () => {
    mockGetConfig.mockResolvedValueOnce({
      server: {
        host: "127.0.0.1",
        port: 48100,
        api_key: "   ",
        tls: { enable: false },
      },
      default_provider: "openai",
    });

    await expect(
      requestImagesFromLocalImageServer({
        providerId: "fal",
        model: "fal-ai/nano-banana-pro",
        prompt: "青柠插画",
        count: 1,
        size: "1024x1024",
      }),
    ).rejects.toMatchObject({
      name: "LocalImageServerError",
      kind: "missing_api_key",
      status: 401,
      message: "本机图片服务缺少 API Key，请检查服务配置。",
    });
  });

  it("应将 401/403 归类为 authentication_failed", () => {
    const error =
      __localImageServerErrorsTestUtils.classifyLocalImageServerError({
        response: createJsonResponse(
          {
            error: {
              code: "AuthenticationFailed",
              message: "Invalid API key",
            },
          },
          403,
        ),
        rawText: JSON.stringify({
          error: { code: "AuthenticationFailed", message: "Invalid API key" },
        }),
        parsedJson: {
          error: {
            code: "AuthenticationFailed",
            message: "Invalid API key",
          },
        },
      });

    expect(error).toMatchObject({
      name: "LocalImageServerError",
      kind: "authentication_failed",
      status: 403,
      serverCode: "AuthenticationFailed",
      message: "Invalid API key",
    });
  });

  it("应将 no_image_provider 归类为 no_image_provider", () => {
    const error =
      __localImageServerErrorsTestUtils.classifyLocalImageServerError({
        response: createJsonResponse(
          {
            error: {
              code: "no_image_provider",
              message: "No image-capable API Key Provider configured",
            },
          },
          503,
        ),
        rawText: JSON.stringify({
          error: {
            code: "no_image_provider",
            message: "No image-capable API Key Provider configured",
          },
        }),
        parsedJson: {
          error: {
            code: "no_image_provider",
            message: "No image-capable API Key Provider configured",
          },
        },
      });

    expect(error).toMatchObject({
      kind: "no_image_provider",
      status: 503,
      serverCode: "no_image_provider",
    });
  });

  it("应将 configured_provider_missing_key 归类为 configured_provider_missing_key", () => {
    const error =
      __localImageServerErrorsTestUtils.classifyLocalImageServerError({
        response: createJsonResponse(
          {
            error: {
              code: "configured_provider_missing_key",
              message: "默认图片服务没有可用的 API Key。",
            },
          },
          503,
        ),
        rawText: JSON.stringify({
          error: {
            code: "configured_provider_missing_key",
            message: "默认图片服务没有可用的 API Key。",
          },
        }),
        parsedJson: {
          error: {
            code: "configured_provider_missing_key",
            message: "默认图片服务没有可用的 API Key。",
          },
        },
      });

    expect(error).toMatchObject({
      kind: "configured_provider_missing_key",
      status: 503,
      serverCode: "configured_provider_missing_key",
    });
  });

  it("应将 configured_provider_missing_model 归类为 configured_provider_missing_model", () => {
    const error =
      __localImageServerErrorsTestUtils.classifyLocalImageServerError({
        response: createJsonResponse(
          {
            error: {
              code: "configured_provider_missing_model",
              message: "默认图片服务没有可用图片模型。",
            },
          },
          503,
        ),
        rawText: JSON.stringify({
          error: {
            code: "configured_provider_missing_model",
            message: "默认图片服务没有可用图片模型。",
          },
        }),
        parsedJson: {
          error: {
            code: "configured_provider_missing_model",
            message: "默认图片服务没有可用图片模型。",
          },
        },
      });

    expect(error).toMatchObject({
      kind: "configured_provider_missing_model",
      status: 503,
      serverCode: "configured_provider_missing_model",
    });
  });

  it("应将无效 JSON 归类为 invalid_json", () => {
    const error =
      __localImageServerErrorsTestUtils.classifyLocalImageServerError({
        response: createTextResponse("not-json", 200),
        rawText: "not-json",
        parsedJson: null,
      });

    expect(error).toMatchObject({
      kind: "invalid_json",
      status: 200,
      message: "本机图片服务返回了无效 JSON。",
    });
  });

  it("应将无图响应归类为 missing_image", () => {
    const error =
      __localImageServerErrorsTestUtils.classifyLocalImageServerError({
        response: createJsonResponse({ data: [] }, 200),
        rawText: JSON.stringify({ data: [] }),
        parsedJson: { data: [] },
      });

    expect(error).toMatchObject({
      kind: "missing_image",
      status: 200,
      message: "本机图片服务未返回可解析图片。",
    });
  });

  it("应保留非 2xx 失败的原始响应摘要", () => {
    const error =
      __localImageServerErrorsTestUtils.classifyLocalImageServerError({
        response: createTextResponse("image server failed", 500),
        rawText: "image server failed",
        parsedJson: null,
      });

    expect(error).toMatchObject({
      kind: "request_failed",
      status: 500,
    });
    expect(error.message).toContain("本机图片服务请求失败: 500");
    expect(error.message).toContain("image server failed");
  });
});
