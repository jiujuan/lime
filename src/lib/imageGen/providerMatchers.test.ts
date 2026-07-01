import { describe, expect, it } from "vitest";
import {
  isFalImageProviderLike,
  isLikelyImageGenerationModelId,
  isLikelyImageGenerationSearchText,
  isLikelyFalImageModelId,
  isResponsesImageGenerationModelId,
} from "./providerMatchers";

describe("imageGen/providerMatchers", () => {
  it("应识别 Responses 图片模型 ID", () => {
    expect(isResponsesImageGenerationModelId("gpt-images-2")).toBe(true);
    expect(isResponsesImageGenerationModelId("openai/gpt-image-2")).toBe(true);
    expect(isResponsesImageGenerationModelId("relay-gpt-images-2")).toBe(true);
    expect(isResponsesImageGenerationModelId("gpt-image-1")).toBe(false);
    expect(isResponsesImageGenerationModelId("gpt-5.2-pro")).toBe(false);
  });

  it("应识别 Fal provider 与 host 形态", () => {
    expect(
      isFalImageProviderLike({
        providerId: "fal-custom",
        providerType: "openai",
        apiHost: "https://example.test",
      }),
    ).toBe(true);
    expect(
      isFalImageProviderLike({
        id: "openai",
        type: "openai",
        api_host: "https://queue.fal.run/fal-ai",
      }),
    ).toBe(true);
    expect(
      isFalImageProviderLike({
        id: "openai",
        type: "openai",
        api_host: "https://api.openai.com/v1",
      }),
    ).toBe(false);
  });

  it("应识别 Fal 图片模型 ID", () => {
    expect(isLikelyFalImageModelId("fal-ai/nano-banana-pro")).toBe(true);
    expect(
      isLikelyFalImageModelId("fal-ai/bytedance/seedream/v4/text-to-image"),
    ).toBe(true);
    expect(isLikelyFalImageModelId("gpt-5.2-pro")).toBe(false);
  });

  it("应识别 OpenAI 兼容中转返回的图片模型 ID", () => {
    expect(isLikelyImageGenerationModelId("agnes-image-2.1-flash")).toBe(true);
    expect(isLikelyImageGenerationModelId("gpt-images-2")).toBe(true);
    expect(isLikelyImageGenerationModelId("doubao-seedream-4-0")).toBe(true);
    expect(isLikelyImageGenerationModelId("midjourney-v7")).toBe(true);
    expect(isLikelyImageGenerationModelId("glm-image")).toBe(true);
    expect(isLikelyImageGenerationModelId("中文生图模型")).toBe(true);
    expect(isLikelyImageGenerationModelId("gpt-5.2-pro")).toBe(false);
  });

  it("应区分生图 search text 与视觉理解 image-input 信号", () => {
    expect(
      isLikelyImageGenerationSearchText("OpenAI image generation model"),
    ).toBe(true);
    expect(isLikelyImageGenerationSearchText("gpt image 2")).toBe(true);
    expect(isLikelyImageGenerationSearchText("image-input chat model")).toBe(
      false,
    );
    expect(isLikelyImageGenerationModelId("provider-image-input-chat")).toBe(
      false,
    );
  });
});
