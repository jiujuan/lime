import { describe, expect, it } from "vitest";
import type { ModelCapabilitySummary } from "./inferModelCapabilities";
import {
  buildModelCapabilitySendGateInput,
  evaluateModelInputCapability,
} from "./modelCapabilitySendGate";
import { buildModelInputSendPolicy } from "./modelInputSendPolicy";

const textOnlySummary: ModelCapabilitySummary = {
  capabilities: {
    vision: false,
    tools: true,
    streaming: true,
    json_mode: true,
    function_calling: true,
    reasoning: false,
  },
  task_families: ["chat"],
  input_modalities: ["text"],
  output_modalities: ["text"],
  runtime_features: ["streaming", "tool_calling"],
  supports_tools: true,
  supports_reasoning: false,
  supports_prompt_cache: false,
  supports_media_input: false,
  supports_media_output: false,
  context_length: 128000,
  max_output_tokens: 4096,
};

const visionSummary: ModelCapabilitySummary = {
  ...textOnlySummary,
  capabilities: {
    ...textOnlySummary.capabilities,
    vision: true,
  },
  task_families: ["chat", "vision_understanding"],
  input_modalities: ["text", "image"],
  supports_media_input: true,
};

describe("modelInputSendPolicy", () => {
  it("允许已满足 capability 的输入继续发送", () => {
    const gate = evaluateModelInputCapability(
      visionSummary,
      buildModelCapabilitySendGateInput({
        text: "describe",
        imageCount: 1,
      }),
    );

    expect(buildModelInputSendPolicy(gate)).toEqual({
      status: "enabled",
      canSubmit: true,
      shouldWarn: false,
      shouldDisableComposer: false,
      failClosedAtSubmit: false,
      reason: null,
      requiredInputModalities: ["text", "image"],
      missingInputModalities: [],
    });
  });

  it("对明确缺失的媒体能力禁用提交", () => {
    const gate = evaluateModelInputCapability(
      textOnlySummary,
      buildModelCapabilitySendGateInput({
        text: "describe",
        imageCount: 1,
      }),
    );

    expect(buildModelInputSendPolicy(gate)).toMatchObject({
      status: "blocked",
      canSubmit: false,
      shouldWarn: true,
      shouldDisableComposer: true,
      failClosedAtSubmit: true,
      reason: "missing_input_modalities",
      missingInputModalities: ["image"],
    });
  });

  it("媒体输入缺少模型 summary 时按最终 submit fail-closed 策略禁用", () => {
    const gate = evaluateModelInputCapability(
      null,
      buildModelCapabilitySendGateInput({
        text: "describe",
        imageCount: 1,
      }),
    );

    expect(buildModelInputSendPolicy(gate)).toMatchObject({
      status: "blocked",
      canSubmit: false,
      shouldWarn: true,
      shouldDisableComposer: true,
      failClosedAtSubmit: true,
      reason: "missing_capability_summary",
      missingInputModalities: ["text", "image"],
    });
  });

  it("纯文本缺少模型 summary 时只提示 warning，不阻断提交", () => {
    const gate = evaluateModelInputCapability(
      null,
      buildModelCapabilitySendGateInput({
        text: "hello",
      }),
    );

    expect(buildModelInputSendPolicy(gate)).toMatchObject({
      status: "warning",
      canSubmit: true,
      shouldWarn: true,
      shouldDisableComposer: false,
      failClosedAtSubmit: false,
      reason: "missing_capability_summary",
      missingInputModalities: ["text"],
    });
  });

  it("可显式让 unknown media 先警告，交给 submit 边界最终兜底", () => {
    const gate = evaluateModelInputCapability(
      null,
      buildModelCapabilitySendGateInput({
        text: "describe",
        imageCount: 1,
      }),
    );

    expect(
      buildModelInputSendPolicy(gate, {
        failClosedOnUnknownMedia: false,
      }),
    ).toMatchObject({
      status: "warning",
      canSubmit: true,
      shouldWarn: true,
      shouldDisableComposer: false,
      failClosedAtSubmit: false,
      reason: "missing_capability_summary",
    });
  });
});
