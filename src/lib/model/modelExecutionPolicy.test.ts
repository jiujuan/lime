import { describe, expect, it } from "vitest";
import {
  buildModelExecutionPolicy,
  normalizeModelImageDetail,
  normalizeModelToolMode,
} from "./modelExecutionPolicy";

describe("modelExecutionPolicy", () => {
  it("默认按 execution policy fail-closed", () => {
    expect(buildModelExecutionPolicy(null)).toEqual({
      tool_mode: null,
      supports_search_tool: false,
      web_search_tool_type: null,
      search_content_modalities: [],
      supports_image_detail_original: false,
      allowed_image_detail_values: ["auto", "low", "high"],
      default_image_detail: "high",
    });
  });

  it("归一 Codex tool_mode，未知值按省略处理", () => {
    expect(normalizeModelToolMode("code-mode-only")).toBe("code_mode_only");
    expect(normalizeModelToolMode("code_mode")).toBe("code_mode");
    expect(normalizeModelToolMode("future_tool_mode")).toBeNull();
  });

  it("搜索策略必须显式支持 search tool 才会打开", () => {
    expect(
      buildModelExecutionPolicy({
        supports_search_tool: false,
        web_search_tool_type: "text_and_image",
      }),
    ).toMatchObject({
      supports_search_tool: false,
      web_search_tool_type: null,
      search_content_modalities: [],
    });

    expect(
      buildModelExecutionPolicy({
        supports_search_tool: true,
        web_search_tool_type: "text_and_image",
      }),
    ).toMatchObject({
      supports_search_tool: true,
      web_search_tool_type: "text_and_image",
      search_content_modalities: ["text", "image"],
    });

    expect(
      buildModelExecutionPolicy({
        supportsSearchTool: true,
      }),
    ).toMatchObject({
      supports_search_tool: true,
      web_search_tool_type: "text",
      search_content_modalities: ["text"],
    });
  });

  it("图片 original detail 只有模型显式支持时才允许", () => {
    const defaultPolicy = buildModelExecutionPolicy({});
    const originalPolicy = buildModelExecutionPolicy({
      supports_image_detail_original: true,
    });

    expect(normalizeModelImageDetail(defaultPolicy, "original")).toBeNull();
    expect(normalizeModelImageDetail(defaultPolicy, "high")).toBe("high");
    expect(normalizeModelImageDetail(originalPolicy, "original")).toBe(
      "original",
    );
    expect(originalPolicy.allowed_image_detail_values).toEqual([
      "auto",
      "low",
      "high",
      "original",
    ]);
  });

  it("不会从 picker/catalog 字段推断 execution policy", () => {
    const inputWithPickerFields = {
      tier: "max",
      status: "active",
      pricing: { input_per_million: 1 },
      provider_name: "OpenAI",
    } as Record<string, unknown>;

    expect(buildModelExecutionPolicy(inputWithPickerFields)).toEqual({
      tool_mode: null,
      supports_search_tool: false,
      web_search_tool_type: null,
      search_content_modalities: [],
      supports_image_detail_original: false,
      allowed_image_detail_values: ["auto", "low", "high"],
      default_image_detail: "high",
    });
  });
});
