import { describe, expect, it } from "vitest";
import {
  getModelOutputModalities,
  getModelTaskFamilies,
  inferModelCapabilities,
  inferModelTaskFamilies,
  inferVisionCapability,
} from "./inferModelCapabilities";

describe("inferModelCapabilities", () => {
  it("应将 gpt-5.4 识别为支持视觉的模型", () => {
    expect(
      inferVisionCapability({
        modelId: "gpt-5.4",
        providerId: "codex",
      }),
    ).toBe(true);
  });

  it("应避免将生图模型误判为视觉聊天模型", () => {
    expect(
      inferVisionCapability({
        modelId: "gemini-3-pro-image-preview",
        providerId: "gemini",
      }),
    ).toBe(false);
  });

  it("应保留 thinking 模型的推理能力推断", () => {
    expect(
      inferModelCapabilities({
        modelId: "gpt-5.4-thinking",
        providerId: "openai",
      }),
    ).toMatchObject({
      vision: true,
      reasoning: true,
      tools: true,
      streaming: true,
      json_mode: true,
      function_calling: true,
    });
  });

  it("应将 gpt-images-2 识别为图片生成模型而非视觉理解模型", () => {
    expect(
      inferModelTaskFamilies({
        modelId: "gpt-images-2",
        providerId: "new-api",
        providerType: "openai",
      }),
    ).toContain("image_generation");
    expect(
      inferModelTaskFamilies({
        modelId: "gpt-images-2",
        providerId: "new-api",
        providerType: "openai",
      }),
    ).not.toContain("vision_understanding");
  });

  it("应从统一 schema 解析图片模型的输出模态", () => {
    expect(
      getModelOutputModalities({
        id: "gpt-image-1",
        provider_id: "openai",
        family: null,
        description: "OpenAI image generation model",
        source: "embedded",
        capabilities: {
          vision: false,
          tools: false,
          streaming: true,
          json_mode: false,
          function_calling: false,
          reasoning: false,
        },
        task_families: ["image_generation"],
        input_modalities: ["text"],
        output_modalities: ["image"],
      }),
    ).toEqual(["image"]);
  });

  it("缺少显式 schema 时仍应把多模态聊天模型识别为视觉理解 + 对话", () => {
    expect(
      getModelTaskFamilies({
        id: "gpt-4o",
        provider_id: "openai",
        family: "gpt-4o",
        description: null,
        source: "embedded",
        capabilities: {
          vision: true,
          tools: true,
          streaming: true,
          json_mode: true,
          function_calling: true,
          reasoning: false,
        },
      }),
    ).toEqual(expect.arrayContaining(["chat", "vision_understanding"]));
  });

  it("显式 image 输入且输出文本时应识别为视觉理解模型", () => {
    const taxonomyParams = {
      modelId: "provider-vlm-chat",
      providerId: "custom-provider",
      explicitInputModalities: ["text", "image"],
      explicitOutputModalities: ["text"],
    };

    expect(inferModelTaskFamilies(taxonomyParams)).toEqual(
      expect.arrayContaining(["chat", "vision_understanding"]),
    );
    expect(inferModelCapabilities(taxonomyParams)).toMatchObject({
      vision: true,
    });
  });

  it("image-input 命名的聊天模型不应被统一图片 matcher 误判为生图模型", () => {
    expect(
      inferModelTaskFamilies({
        modelId: "provider-image-input-chat",
        providerId: "custom-provider",
        explicitInputModalities: ["text", "image"],
        explicitOutputModalities: ["text"],
      }),
    ).toEqual(expect.arrayContaining(["chat", "vision_understanding"]));
    expect(
      inferModelTaskFamilies({
        modelId: "provider-image-input-chat",
        providerId: "custom-provider",
        explicitInputModalities: ["text", "image"],
        explicitOutputModalities: ["text"],
      }),
    ).not.toContain("image_generation");
  });

  it("显式 chat 任务族不应遮蔽图片输入和已知视觉模型信号", () => {
    expect(
      inferModelTaskFamilies({
        modelId: "provider-vlm-chat",
        providerId: "custom-provider",
        explicitTaskFamilies: ["chat"],
        explicitInputModalities: ["text", "image"],
        explicitOutputModalities: ["text"],
        capabilities: { vision: false },
      }),
    ).toEqual(expect.arrayContaining(["chat", "vision_understanding"]));

    expect(
      inferModelCapabilities({
        modelId: "o3",
        providerId: "openai",
        explicitTaskFamilies: ["chat"],
        capabilities: { vision: false },
      }),
    ).toMatchObject({ vision: true });
  });

  it("应识别现代 Provider 中命名不含 vision 的图片输入模型", () => {
    const cases = [
      { modelId: "o3", providerId: "openai" },
      { modelId: "o4-mini", providerId: "openai" },
      { modelId: "grok-4.3", providerId: "xai" },
      { modelId: "mistral-small-latest", providerId: "mistral" },
      { modelId: "qwen3.5-27b", providerId: "alibaba" },
      { modelId: "gemma-3-27b-it", providerId: "google" },
    ];

    for (const item of cases) {
      expect(inferVisionCapability(item), item.modelId).toBe(true);
    }
  });

  it("应避免把同系列无图片输入的小模型误判为视觉模型", () => {
    const cases = [
      { modelId: "o1-mini", providerId: "openai" },
      { modelId: "o1-preview", providerId: "openai" },
      { modelId: "o3-mini", providerId: "openai" },
      { modelId: "grok-3-mini", providerId: "xai" },
      { modelId: "gemma-3n-e4b-it", providerId: "google" },
    ];

    for (const item of cases) {
      expect(inferVisionCapability(item), item.modelId).toBe(false);
    }
  });

  it("别名模型应能从实际 provider 或 canonical id 继承视觉能力", () => {
    expect(
      inferModelCapabilities({
        modelId: "relay-fast-default",
        providerId: "openai",
        providerModelId: "o3",
      }),
    ).toMatchObject({ vision: true });

    expect(
      inferModelCapabilities({
        modelId: "relay-grok-latest",
        providerId: "xai",
        canonicalModelId: "grok-4.3",
      }),
    ).toMatchObject({ vision: true });
  });
});
