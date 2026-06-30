import { describe, expect, it } from "vitest";
import {
  findDefaultImageCapabilityProvider,
  isImageCapabilityProvider,
  resolveImageCapabilityModelIds,
  resolveImageCapabilityModels,
  resolveImageCapabilityProviderEntry,
  type ImageCapabilitySelectionCandidate,
} from "./catalog";

const providers: ImageCapabilitySelectionCandidate[] = [
  { id: "new-api", type: "openai", custom_models: ["gpt-images-2"] },
  {
    id: "gemini",
    type: "gemini",
    custom_models: ["gemini-3.1-flash-image"],
    api_host: "https://generativelanguage.googleapis.com",
  },
  { id: "zhipuai", type: "zhipuai", custom_models: ["cogview-4-250304"] },
  { id: "fal", type: "fal", custom_models: ["fal-ai/nano-banana-pro"] },
];

describe("imageGen/catalog", () => {
  it("应识别图片能力 Provider", () => {
    expect(isImageCapabilityProvider(providers[0]!)).toBe(true);
    expect(isImageCapabilityProvider(providers[1]!)).toBe(true);
    expect(isImageCapabilityProvider({ id: "tts", type: "audio" })).toBe(false);
  });

  it("应解析 Provider 条目", () => {
    expect(resolveImageCapabilityProviderEntry(providers[0]!)?.providerKey).toBe(
      "openai-images",
    );
    expect(resolveImageCapabilityProviderEntry(providers[1]!)?.providerKey).toBe(
      "gemini",
    );
    expect(resolveImageCapabilityProviderEntry(providers[2]!)?.providerKey).toBe(
      "zhipu",
    );
  });

  it("应优先选择 openai-like 默认 Provider", () => {
    expect(findDefaultImageCapabilityProvider(providers)?.id).toBe("new-api");
  });

  it("应解析 Provider 模型列表", () => {
    expect(resolveImageCapabilityModelIds(providers[0]!)).toContain(
      "gpt-images-2",
    );
    expect(resolveImageCapabilityModelIds(providers[1]!)).toContain(
      "gemini-3.1-flash-image",
    );
    expect(resolveImageCapabilityModels(providers[3]!)?.[0]?.id).toBe(
      "fal-ai/nano-banana-pro",
    );
  });
});
