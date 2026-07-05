import { describe, expect, it } from "vitest";
import {
  buildModelContextPolicy,
  DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT,
} from "./modelContextPolicy";

describe("modelContextPolicy", () => {
  it("默认缺字段时 fail-closed，但保留 Codex effective context percent 默认值", () => {
    expect(buildModelContextPolicy(null)).toEqual({
      context_window: null,
      max_context_window: null,
      resolved_context_window: null,
      effective_context_window_percent: DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT,
      model_context_window: null,
      auto_compact_token_limit: null,
    });
  });

  it("resolved context window 优先使用 context_window，缺失时使用 max_context_window", () => {
    expect(
      buildModelContextPolicy({
        context_window: 273_000,
        max_context_window: 400_000,
      }),
    ).toMatchObject({
      context_window: 273_000,
      max_context_window: 400_000,
      resolved_context_window: 273_000,
      model_context_window: 259_350,
    });

    expect(
      buildModelContextPolicy({
        maxContextWindow: 400_000,
      }),
    ).toMatchObject({
      context_window: null,
      max_context_window: 400_000,
      resolved_context_window: 400_000,
      model_context_window: 380_000,
    });
  });

  it("auto compact token limit 默认取 resolved context window 的 90%，显式配置会被该上限钳制", () => {
    expect(
      buildModelContextPolicy({
        contextWindow: 100_000,
      }),
    ).toMatchObject({
      auto_compact_token_limit: 90_000,
    });

    expect(
      buildModelContextPolicy({
        contextWindow: 100_000,
        autoCompactTokenLimit: 95_000,
      }),
    ).toMatchObject({
      auto_compact_token_limit: 90_000,
    });

    expect(
      buildModelContextPolicy({
        contextWindow: 100_000,
        auto_compact_token_limit: 72_000,
      }),
    ).toMatchObject({
      auto_compact_token_limit: 72_000,
    });
  });

  it("无 context window 时只保留显式 auto compact limit", () => {
    expect(
      buildModelContextPolicy({
        autoCompactTokenLimit: 64_000,
      }),
    ).toMatchObject({
      resolved_context_window: null,
      model_context_window: null,
      auto_compact_token_limit: 64_000,
    });
  });

  it("effective context window percent 驱动模型可用 context window，非法值回到默认值", () => {
    expect(
      buildModelContextPolicy({
        context_window: 128_000,
        effective_context_window_percent: 50,
      }),
    ).toMatchObject({
      effective_context_window_percent: 50,
      model_context_window: 64_000,
    });

    expect(
      buildModelContextPolicy({
        context_window: 128_000,
        effectiveContextWindowPercent: 125,
      }),
    ).toMatchObject({
      effective_context_window_percent: DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT,
      model_context_window: 121_600,
    });
  });

  it("不会从 picker/catalog 字段推断 context policy", () => {
    expect(
      buildModelContextPolicy({
        tier: "max",
        status: "active",
        pricing: { input_per_million: 1 },
        provider_name: "OpenAI",
      } as Record<string, unknown>),
    ).toEqual({
      context_window: null,
      max_context_window: null,
      resolved_context_window: null,
      effective_context_window_percent: DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT,
      model_context_window: null,
      auto_compact_token_limit: null,
    });
  });
});
