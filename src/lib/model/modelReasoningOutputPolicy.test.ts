import { describe, expect, it } from "vitest";
import {
  buildModelReasoningOutputPolicy,
  normalizeModelReasoningSummary,
  normalizeModelVerbosity,
  resolveModelReasoningSummaryForRequest,
  resolveModelVerbosityForRequest,
} from "./modelReasoningOutputPolicy";

describe("modelReasoningOutputPolicy", () => {
  it("默认按 Codex 兼容语义输出 auto summary，并 fail-closed verbosity", () => {
    expect(buildModelReasoningOutputPolicy(null)).toEqual({
      default_reasoning_summary: "auto",
      support_verbosity: false,
      default_verbosity: null,
      can_set_verbosity: false,
    });
  });

  it("只归一 Codex reasoning summary 与 verbosity 枚举值", () => {
    expect(normalizeModelReasoningSummary(" concise ")).toBe("concise");
    expect(normalizeModelReasoningSummary("future-summary")).toBeNull();
    expect(normalizeModelVerbosity("HIGH")).toBe("high");
    expect(normalizeModelVerbosity("verbose")).toBeNull();

    expect(
      buildModelReasoningOutputPolicy({
        default_reasoning_summary: "detailed",
        support_verbosity: true,
        default_verbosity: "low",
      }),
    ).toEqual({
      default_reasoning_summary: "detailed",
      support_verbosity: true,
      default_verbosity: "low",
      can_set_verbosity: true,
    });
  });

  it("支持 camelCase generated TS 字段，同时忽略不支持模型的默认 verbosity", () => {
    expect(
      buildModelReasoningOutputPolicy({
        defaultReasoningSummary: "none",
        supportVerbosity: false,
        defaultVerbosity: "high",
      }),
    ).toEqual({
      default_reasoning_summary: "none",
      support_verbosity: false,
      default_verbosity: null,
      can_set_verbosity: false,
    });
  });

  it("request summary 沿用 Codex：支持 summaries 时用请求值覆盖默认，none 表示省略", () => {
    const policy = buildModelReasoningOutputPolicy({
      default_reasoning_summary: "detailed",
    });

    expect(
      resolveModelReasoningSummaryForRequest(policy, true, "concise"),
    ).toBe("concise");
    expect(
      resolveModelReasoningSummaryForRequest(policy, true, "future-summary"),
    ).toBe("detailed");
    expect(resolveModelReasoningSummaryForRequest(policy, true, "none")).toBeNull();
    expect(
      resolveModelReasoningSummaryForRequest(policy, false, "concise"),
    ).toBeNull();
  });

  it("request verbosity 只有模型支持时才发送，请求值覆盖默认", () => {
    const policy = buildModelReasoningOutputPolicy({
      support_verbosity: true,
      default_verbosity: "low",
    });

    expect(resolveModelVerbosityForRequest(policy, "high")).toBe("high");
    expect(resolveModelVerbosityForRequest(policy, "verbose")).toBe("low");
    expect(
      resolveModelVerbosityForRequest(
        { support_verbosity: false, default_verbosity: "low" },
        "high",
      ),
    ).toBeNull();
  });

  it("不会从 capability summary、runtime features 或 picker/catalog 字段推断输出策略", () => {
    expect(
      buildModelReasoningOutputPolicy({
        capabilities: { reasoning: true },
        runtime_features: ["verbosity"],
        input_modalities: ["text", "image"],
        tier: "max",
        status: "active",
        pricing: { input_per_million: 1 },
        provider_name: "OpenAI",
        supports_reasoning_summaries: true,
      } as Record<string, unknown>),
    ).toEqual({
      default_reasoning_summary: "auto",
      support_verbosity: false,
      default_verbosity: null,
      can_set_verbosity: false,
    });
  });
});
