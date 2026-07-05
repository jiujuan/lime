import { describe, expect, it } from "vitest";
import { buildModelNativeToolPolicy } from "./modelNativeToolPolicy";
import {
  buildModelRequestPolicyMetadata,
  mergeModelRequestPolicyMetadata,
  resolveModelRequestPolicyMetadataForSelection,
} from "./modelRequestPolicyMetadata";
import { buildModelResponsesPolicy } from "./modelResponsesPolicy";
import { buildModelToolCallPolicy } from "./modelToolCallPolicy";
import { buildModelTruncationPolicy } from "./modelTruncationPolicy";
import type { EnhancedModelMetadata } from "@/lib/types/modelRegistry";

function modelFixture(
  overrides: Partial<EnhancedModelMetadata> = {},
): EnhancedModelMetadata {
  return {
    id: "gpt-4.1",
    display_name: "GPT 4.1",
    provider_id: "openai",
    provider_name: "OpenAI",
    family: "gpt-4",
    tier: "pro",
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      json_mode: true,
      function_calling: true,
      reasoning: true,
    },
    task_families: ["chat", "vision_understanding"],
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    runtime_features: ["streaming", "tool_calling", "responses_api"],
    deployment_source: "user_cloud",
    management_plane: "local_settings",
    canonical_model_id: "openai/gpt-4.1",
    provider_model_id: "gpt-4.1-2026-07-01",
    alias_source: "official",
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

describe("modelRequestPolicyMetadata", () => {
  it("没有 registry-facing policy 时不输出 request metadata", () => {
    expect(buildModelRequestPolicyMetadata(modelFixture())).toBeUndefined();
  });

  it("只把 selected registry model 的 policy 写入 request metadata", () => {
    const policyModel = modelFixture({
      responses_policy: buildModelResponsesPolicy({
        use_responses_lite: true,
      }),
      tool_call_policy: buildModelToolCallPolicy({
        supports_parallel_tool_calls: true,
      }),
      truncation_policy: buildModelTruncationPolicy({
        truncation_policy: {
          mode: "tokens",
          limit: 2048,
        },
      }),
      native_tool_policy: buildModelNativeToolPolicy({
        shell_type: "unified_exec",
        apply_patch_tool_type: "freeform",
        experimental_supported_tools: ["spec_plan"],
      }),
    });

    expect(
      resolveModelRequestPolicyMetadataForSelection({
        models: [policyModel],
        providerType: "OpenAI",
        model: "gpt-4.1-2026-07-01",
      }),
    ).toMatchObject({
      source: "model_registry",
      provider_id: "openai",
      model_id: "gpt-4.1",
      responses_policy: {
        request_mode: "responses_lite",
        requires_responses_lite_header: true,
      },
      tool_call_policy: {
        supports_parallel_tool_calls: true,
        parallel_tool_calls: true,
      },
      truncation_policy: {
        mode: "tokens",
        limit: 2048,
      },
      native_tool_policy: {
        preferred_shell_surface: "unified_exec",
        apply_patch_tool_enabled: true,
        experimental_supported_tools: ["spec_plan"],
      },
    });
  });

  it("合并 metadata 时保留已有 harness 信号并覆盖 model_request_policy", () => {
    const policy = buildModelRequestPolicyMetadata(
      modelFixture({
        responses_policy: buildModelResponsesPolicy({
          use_responses_lite: true,
        }),
      }),
    );

    expect(
      mergeModelRequestPolicyMetadata(
        {
          source: "prepare",
          harness: {
            existing_signal: true,
            model_request_policy: {
              source: "stale",
            },
          },
        },
        policy,
      ),
    ).toMatchObject({
      source: "prepare",
      harness: {
        existing_signal: true,
        model_request_policy: {
          source: "model_registry",
          provider_id: "openai",
          model_id: "gpt-4.1",
          responses_policy: {
            request_mode: "responses_lite",
          },
        },
      },
    });
  });
});
