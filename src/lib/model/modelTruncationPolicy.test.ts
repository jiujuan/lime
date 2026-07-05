import { describe, expect, it } from "vitest";
import {
  buildModelTruncationPolicy,
  DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES,
} from "./modelTruncationPolicy";

describe("modelTruncationPolicy", () => {
  it("缺字段时使用 Codex fallback 的 10000 bytes 截断策略", () => {
    expect(buildModelTruncationPolicy(null)).toEqual({
      mode: "bytes",
      limit: DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES,
      truncation_policy: {
        mode: "bytes",
        limit: DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES,
      },
    });
  });

  it("保留 Codex bytes / tokens 两种截断模式", () => {
    expect(
      buildModelTruncationPolicy({
        truncation_policy: {
          mode: "bytes",
          limit: 12_000,
        },
      }),
    ).toEqual({
      mode: "bytes",
      limit: 12_000,
      truncation_policy: {
        mode: "bytes",
        limit: 12_000,
      },
    });

    expect(
      buildModelTruncationPolicy({
        truncationPolicy: {
          mode: "tokens",
          limit: 4_096,
        },
      }),
    ).toEqual({
      mode: "tokens",
      limit: 4_096,
      truncation_policy: {
        mode: "tokens",
        limit: 4_096,
      },
    });
  });

  it("非法 mode 或 limit fail-closed 到默认 bytes policy", () => {
    for (const truncation_policy of [
      { mode: "lines", limit: 10_000 },
      { mode: "tokens", limit: 0 },
      { mode: "bytes", limit: -1 },
      { mode: "bytes", limit: Number.MAX_SAFE_INTEGER + 1 },
      null,
      "tokens:4096",
    ]) {
      expect(buildModelTruncationPolicy({ truncation_policy })).toEqual({
        mode: "bytes",
        limit: DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES,
        truncation_policy: {
          mode: "bytes",
          limit: DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES,
        },
      });
    }
  });

  it("不会从 context、tools、runtime features 或 picker/catalog 字段推断截断策略", () => {
    expect(
      buildModelTruncationPolicy({
        context_window: 128_000,
        max_context_window: 128_000,
        auto_compact_token_limit: 90_000,
        supports_parallel_tool_calls: true,
        runtime_features: ["large-output"],
        tool_mode: "code_mode",
        tier: "max",
        provider_name: "OpenAI",
      } as Record<string, unknown>),
    ).toEqual({
      mode: "bytes",
      limit: DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES,
      truncation_policy: {
        mode: "bytes",
        limit: DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES,
      },
    });
  });
});
