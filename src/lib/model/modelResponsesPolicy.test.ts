import { describe, expect, it } from "vitest";
import {
  buildModelResponsesPolicy,
  shouldSendParallelToolCallsForResponses,
} from "./modelResponsesPolicy";

describe("modelResponsesPolicy", () => {
  it("默认使用标准 Responses 请求形态", () => {
    expect(buildModelResponsesPolicy(null)).toEqual({
      use_responses_lite: false,
      request_mode: "responses",
      instructions_location: "request_field",
      tools_location: "request_field",
      reasoning_context: "default",
      parallel_tool_calls_allowed: true,
      requires_responses_lite_header: false,
    });
  });

  it("use_responses_lite=true 时切换为 Codex Responses Lite 请求形态", () => {
    expect(
      buildModelResponsesPolicy({
        use_responses_lite: true,
      }),
    ).toEqual({
      use_responses_lite: true,
      request_mode: "responses_lite",
      instructions_location: "input_prefix",
      tools_location: "input_prefix",
      reasoning_context: "all_turns",
      parallel_tool_calls_allowed: false,
      requires_responses_lite_header: true,
    });
  });

  it("支持 generated TS camelCase 字段，非 true 值不打开 lite", () => {
    expect(
      buildModelResponsesPolicy({
        useResponsesLite: true,
      }).request_mode,
    ).toBe("responses_lite");
    expect(
      buildModelResponsesPolicy({
        useResponsesLite: "true",
      }).request_mode,
    ).toBe("responses");
  });

  it("parallel tool calls 受 Responses Lite request mode 二次门禁", () => {
    const standard = buildModelResponsesPolicy({});
    const lite = buildModelResponsesPolicy({ use_responses_lite: true });

    expect(shouldSendParallelToolCallsForResponses(standard, true)).toBe(true);
    expect(shouldSendParallelToolCallsForResponses(standard, false)).toBe(false);
    expect(shouldSendParallelToolCallsForResponses(lite, true)).toBe(false);
  });

  it("不会从 protocol、runtime features、tool support 或 picker/catalog 字段推断", () => {
    expect(
      buildModelResponsesPolicy({
        protocol: "openai_responses",
        runtime_features: ["responses_api"],
        supports_parallel_tool_calls: true,
        capabilities: { tools: true },
        provider_name: "OpenAI",
        display_name: "GPT",
      } as Record<string, unknown>),
    ).toEqual({
      use_responses_lite: false,
      request_mode: "responses",
      instructions_location: "request_field",
      tools_location: "request_field",
      reasoning_context: "default",
      parallel_tool_calls_allowed: true,
      requires_responses_lite_header: false,
    });
  });
});
