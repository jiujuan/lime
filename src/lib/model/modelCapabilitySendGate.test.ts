import { describe, expect, it } from "vitest";
import type { ModelCapabilitySummary } from "./inferModelCapabilities";
import type { EnhancedModelMetadata } from "@/lib/types/modelRegistry";
import {
  MODEL_INPUT_CAPABILITY_GAP_ERROR_PREFIX,
  assertModelInputCapabilityAllowed,
  buildModelCapabilitySendGateInput,
  evaluateModelInputCapability,
  mergeModelInputCapabilityGateMetadata,
  resolveModelRegistryEntryForSelection,
  resolveModelCapabilitySummaryForSelection,
} from "./modelCapabilitySendGate";

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

function summaryWithInputModalities(
  inputModalities: ModelCapabilitySummary["input_modalities"],
): ModelCapabilitySummary {
  return {
    ...textOnlySummary,
    capabilities: {
      ...textOnlySummary.capabilities,
      vision: inputModalities.includes("image"),
    },
    task_families: inputModalities.includes("image")
      ? ["chat", "vision_understanding"]
      : ["chat"],
    input_modalities: inputModalities,
    supports_media_input: inputModalities.some((modality) =>
      ["image", "audio", "video", "file"].includes(modality),
    ),
  };
}

function modelFixture(
  overrides: Partial<EnhancedModelMetadata>,
): EnhancedModelMetadata {
  return {
    id: "gpt-4.1",
    display_name: "GPT 4.1",
    provider_id: "openai",
    provider_name: "OpenAI",
    family: "gpt-4",
    tier: "pro",
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
    deployment_source: "user_cloud",
    management_plane: "local_settings",
    canonical_model_id: null,
    provider_model_id: null,
    alias_source: null,
    pricing: null,
    limits: {
      context_length: 128000,
      max_output_tokens: 4096,
      requests_per_minute: null,
      tokens_per_minute: null,
    },
    status: "active",
    release_date: null,
    is_latest: true,
    description: null,
    source: "api",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("modelCapabilitySendGate", () => {
  it("应从发送草稿归一出稳定的输入模态集合", () => {
    expect(
      buildModelCapabilitySendGateInput({
        text: "  帮我分析这张图  ",
        imageCount: 2,
        parts: ["image", "file", null, undefined],
      }),
    ).toEqual({
      requiredInputModalities: ["text", "image", "file"],
    });
  });

  it("空文本且无附件时不阻塞发送", () => {
    const input = buildModelCapabilitySendGateInput({ text: "   " });

    expect(evaluateModelInputCapability(textOnlySummary, input)).toMatchObject({
      status: "allowed",
      requiredInputModalities: [],
      missingInputModalities: [],
      requiresMediaInput: false,
    });
  });

  it("文本模型可通过纯文本输入", () => {
    const input = buildModelCapabilitySendGateInput({ text: "hello" });

    expect(evaluateModelInputCapability(textOnlySummary, input)).toMatchObject({
      status: "allowed",
      requiredInputModalities: ["text"],
      missingInputModalities: [],
    });
  });

  it("文本模型遇到图片输入时应返回 capability gap", () => {
    const input = buildModelCapabilitySendGateInput({
      text: "describe",
      imageCount: 1,
    });

    expect(evaluateModelInputCapability(textOnlySummary, input)).toMatchObject({
      status: "blocked",
      requiredInputModalities: ["text", "image"],
      missingInputModalities: ["image"],
      requiresMediaInput: true,
      reason: "missing_input_modalities",
    });
  });

  it("视觉模型可通过图片输入", () => {
    const input = buildModelCapabilitySendGateInput({
      text: "describe",
      imageCount: 1,
    });

    expect(
      evaluateModelInputCapability(
        summaryWithInputModalities(["text", "image"]),
        input,
      ),
    ).toMatchObject({
      status: "allowed",
      requiredInputModalities: ["text", "image"],
      missingInputModalities: [],
      requiresMediaInput: true,
    });
  });

  it("媒体总开关不能替代精确 input modality", () => {
    const input = buildModelCapabilitySendGateInput({
      text: "read this file",
      fileCount: 1,
    });

    expect(
      evaluateModelInputCapability(
        summaryWithInputModalities(["text", "image"]),
        input,
      ),
    ).toMatchObject({
      status: "blocked",
      missingInputModalities: ["file"],
    });
  });

  it("缺少模型 summary 时返回 unknown，由调用方决定 warning 或 fail-closed", () => {
    const input = buildModelCapabilitySendGateInput({
      text: "describe",
      imageCount: 1,
    });

    expect(evaluateModelInputCapability(null, input)).toMatchObject({
      status: "unknown",
      missingInputModalities: ["text", "image"],
      reason: "missing_capability_summary",
    });
  });

  it("最终发送边界可把 unknown / blocked capability gap 转成稳定错误码", () => {
    const imageInput = buildModelCapabilitySendGateInput({
      text: "describe",
      imageCount: 1,
    });

    expect(() =>
      assertModelInputCapabilityAllowed(textOnlySummary, imageInput, {
        failClosedOnUnknown: true,
      }),
    ).toThrow(`${MODEL_INPUT_CAPABILITY_GAP_ERROR_PREFIX}:`);

    expect(() =>
      assertModelInputCapabilityAllowed(null, imageInput, {
        failClosedOnUnknown: true,
      }),
    ).toThrow(`${MODEL_INPUT_CAPABILITY_GAP_ERROR_PREFIX}:`);
  });

  it("应按 provider/model selection 解析 selected model capability summary", () => {
    const summary = resolveModelCapabilitySummaryForSelection({
      providerType: "openai",
      model: "gpt-4.1-vision",
      models: [
        modelFixture({ id: "gpt-4.1", input_modalities: ["text"] }),
        modelFixture({
          id: "gpt-4.1-vision",
          capabilities: {
            ...textOnlySummary.capabilities,
            vision: true,
          },
          input_modalities: ["text", "image"],
          task_families: ["chat", "vision_understanding"],
        }),
      ],
    });

    expect(summary).toMatchObject({
      input_modalities: ["text", "image"],
      supports_media_input: true,
    });
  });

  it("同名模型跨 Provider 时应优先匹配 provider selection", () => {
    const openaiModel = modelFixture({
      id: "shared-model",
      provider_id: "openai",
      provider_name: "OpenAI",
      input_modalities: ["text"],
    });
    const relayModel = modelFixture({
      id: "shared-model",
      provider_id: "relay",
      provider_name: "Relay",
      input_modalities: ["text", "image"],
    });

    expect(
      resolveModelRegistryEntryForSelection({
        providerType: "relay",
        model: "shared-model",
        models: [openaiModel, relayModel],
      }),
    ).toBe(relayModel);
  });

  it("应把 capability gate 合并进 harness metadata 并覆盖旧证据", () => {
    const gate = evaluateModelInputCapability(
      summaryWithInputModalities(["text", "image"]),
      buildModelCapabilitySendGateInput({
        text: "describe",
        imageCount: 1,
      }),
    );

    expect(
      mergeModelInputCapabilityGateMetadata(
        {
          source: "prepare",
          harness: {
            existing_signal: true,
            model_input_capability_gate: {
              status: "unknown",
            },
          },
        },
        gate,
      ),
    ).toMatchObject({
      source: "prepare",
      harness: {
        existing_signal: true,
        model_input_capability_gate: {
          status: "allowed",
          requiredInputModalities: ["text", "image"],
          supportedInputModalities: ["text", "image"],
          missingInputModalities: [],
        },
      },
    });
  });
});
