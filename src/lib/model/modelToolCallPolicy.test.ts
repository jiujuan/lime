import { describe, expect, it } from "vitest";
import { buildModelToolCallPolicy } from "./modelToolCallPolicy";

describe("modelToolCallPolicy", () => {
  it("默认 fail-closed，不打开并行工具调用", () => {
    expect(buildModelToolCallPolicy(null)).toEqual({
      supports_parallel_tool_calls: false,
      parallel_tool_calls: false,
    });
  });

  it("只在模型显式声明 supports_parallel_tool_calls=true 时打开 request flag", () => {
    expect(
      buildModelToolCallPolicy({
        supports_parallel_tool_calls: true,
      }),
    ).toEqual({
      supports_parallel_tool_calls: true,
      parallel_tool_calls: true,
    });

    expect(
      buildModelToolCallPolicy({
        supportsParallelToolCalls: true,
      }),
    ).toEqual({
      supports_parallel_tool_calls: true,
      parallel_tool_calls: true,
    });
  });

  it("非 boolean true 不视为模型能力声明", () => {
    expect(
      buildModelToolCallPolicy({
        supports_parallel_tool_calls: "true",
      }),
    ).toEqual({
      supports_parallel_tool_calls: false,
      parallel_tool_calls: false,
    });
  });

  it("不会从 tools、runtime features 或 picker/catalog 字段推断并行工具调用", () => {
    expect(
      buildModelToolCallPolicy({
        capabilities: { tools: true },
        runtime_features: ["tools", "function_calling"],
        input_modalities: ["text", "image"],
        tier: "max",
        status: "active",
        pricing: { input_per_million: 1 },
        provider_name: "OpenAI",
      } as Record<string, unknown>),
    ).toEqual({
      supports_parallel_tool_calls: false,
      parallel_tool_calls: false,
    });
  });
});
