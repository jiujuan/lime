import { describe, expect, it } from "vitest";
import type { EnhancedModelMetadata } from "@/lib/types/modelRegistry";
import { filterModelsByTheme } from "./modelThemePolicy";

function createModel(
  id: string,
  overrides: Partial<EnhancedModelMetadata> = {},
): EnhancedModelMetadata {
  return {
    id,
    display_name: id,
    provider_id: "test-provider",
    provider_name: "Test Provider",
    family: null,
    tier: "pro",
    capabilities: {
      vision: false,
      tools: true,
      streaming: true,
      json_mode: true,
      function_calling: true,
      reasoning: false,
    },
    pricing: null,
    limits: {
      context_length: null,
      max_output_tokens: null,
      requests_per_minute: null,
      tokens_per_minute: null,
    },
    status: "active",
    release_date: null,
    is_latest: false,
    description: null,
    source: "local",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("modelThemePolicy", () => {
  it("模型列表短暂缺失时应返回空结果而不是崩溃", () => {
    expect(filterModelsByTheme("general", undefined)).toEqual({
      models: [],
      usedFallback: false,
      filteredOutCount: 0,
      policyName: "none",
    });
  });

  it("general 主题应保留聊天模型，并过滤掉图片模型", () => {
    const models = [
      createModel("gemini-3-pro-image-preview"),
      createModel("deepseek-reasoner", {
        capabilities: {
          vision: false,
          tools: true,
          streaming: true,
          json_mode: true,
          function_calling: true,
          reasoning: true,
        },
      }),
      createModel("deepseek-chat"),
    ];

    const result = filterModelsByTheme("general", models);

    expect(result.usedFallback).toBe(false);
    expect(result.models.map((model) => model.id)).toEqual([
      "deepseek-reasoner",
      "deepseek-chat",
    ]);
    expect(result.policyName).toBe("chat-only");
  });

  it("general 主题在无推理模型时仍应保留聊天模型", () => {
    const models = [
      createModel("gemini-3-pro-image-preview"),
      createModel("deepseek-chat"),
      createModel("text-embedding-3-large"),
    ];

    const result = filterModelsByTheme("general", models);

    expect(result.usedFallback).toBe(false);
    expect(result.models.map((model) => model.id)).toEqual(["deepseek-chat"]);
    expect(result.policyName).toBe("chat-only");
  });

  it("general 主题应过滤掉图像和非聊天模型", () => {
    const models = [
      createModel("gemini-3-pro-image-preview"),
      createModel("text-embedding-3-large"),
      createModel("gpt-4o"),
    ];

    const result = filterModelsByTheme("general", models);

    expect(result.usedFallback).toBe(false);
    expect(result.models.map((model) => model.id)).toEqual(["gpt-4o"]);
    expect(result.policyName).toBe("chat-only");
  });

  it("general 主题应过滤掉图片预览模型，但保留聊天预览模型", () => {
    const models = [
      createModel("gemini-3-pro-image-preview"),
      createModel("gemini-3-pro-preview"),
    ];

    const result = filterModelsByTheme("general", models);

    expect(result.usedFallback).toBe(false);
    expect(result.filteredOutCount).toBe(1);
    expect(result.models.map((model) => model.id)).toEqual([
      "gemini-3-pro-preview",
    ]);
    expect(result.policyName).toBe("chat-only");
  });

  it("general 主题应复用图片 matcher 过滤 OpenAI 兼容中转图片模型", () => {
    const models = [
      createModel("agnes-image-2.1-flash"),
      createModel("deepseek-chat"),
    ];

    const result = filterModelsByTheme("general", models);

    expect(result.usedFallback).toBe(false);
    expect(result.filteredOutCount).toBe(1);
    expect(result.models.map((model) => model.id)).toEqual(["deepseek-chat"]);
  });

  it("general 主题应保留显式支持视觉理解的多模态图片模型", () => {
    const models = [
      createModel("relay-vision-image-pro", {
        task_families: ["chat", "vision_understanding", "image_generation"],
        input_modalities: ["text", "image"],
        output_modalities: ["text", "image"],
      }),
      createModel("gpt-image-1", {
        task_families: ["image_generation"],
        input_modalities: ["text"],
        output_modalities: ["image"],
      }),
    ];

    const result = filterModelsByTheme("general", models);

    expect(result.usedFallback).toBe(false);
    expect(result.models.map((model) => model.id)).toEqual([
      "relay-vision-image-pro",
    ]);
  });

  it("general 主题只有图片生成模型时不应回退为聊天模型", () => {
    const models = [
      createModel("gpt-image-1", {
        task_families: ["image_generation"],
        input_modalities: ["text"],
        output_modalities: ["image"],
      }),
      createModel("gpt-images-2", {
        task_families: ["image_generation"],
        input_modalities: ["text"],
        output_modalities: ["image"],
      }),
    ];

    const result = filterModelsByTheme("general", models);

    expect(result).toEqual({
      models: [],
      usedFallback: false,
      filteredOutCount: 2,
      policyName: "chat-only",
    });
  });
});
