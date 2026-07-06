import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnhancedModelMetadata } from "@/lib/types/modelRegistry";
import { InputbarVisionCapabilityNotice } from "./InputbarVisionCapabilityNotice";

const mockUseConfiguredProviders = vi.fn();
const mockUseProviderModels = vi.fn();
const mockResolveVisionModel = vi.fn();

vi.mock("@/hooks/useConfiguredProviders", () => ({
  useConfiguredProviders: (options: unknown) =>
    mockUseConfiguredProviders(options),
  findConfiguredProviderBySelection: (
    providers: Array<{ key: string; providerId?: string }>,
    selection?: string | null,
  ) => {
    const normalizedSelection = (selection || "").trim().toLowerCase();
    const keyMatch =
      providers.find(
        (provider) => provider.key.trim().toLowerCase() === normalizedSelection,
      ) ?? null;
    const providerIdMatch =
      providers.find(
        (provider) =>
          (provider.providerId || "").trim().toLowerCase() ===
          normalizedSelection,
      ) ?? null;

    if (keyMatch && providerIdMatch && keyMatch !== providerIdMatch) {
      if (!keyMatch.providerId && providerIdMatch.providerId) {
        return providerIdMatch;
      }
    }

    return keyMatch ?? providerIdMatch ?? null;
  },
}));

vi.mock("@/hooks/useProviderModels", () => ({
  useProviderModels: (...args: unknown[]) => mockUseProviderModels(...args),
}));

vi.mock("@/lib/model/visionModelResolver", () => ({
  resolveVisionModel: (...args: unknown[]) => mockResolveVisionModel(...args),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function createModel(
  overrides: Partial<EnhancedModelMetadata>,
): EnhancedModelMetadata {
  return {
    id: "gpt-4.1",
    provider_id: "openai",
    provider_name: "OpenAI",
    display_name: "GPT 4.1",
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
    task_families: ["chat"],
    input_modalities: ["text"],
    output_modalities: ["text"],
    runtime_features: ["streaming", "tool_calling"],
    limits: {
      context_length: 128000,
      max_output_tokens: 4096,
      requests_per_minute: null,
      tokens_per_minute: null,
    },
    pricing: null,
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

function createVisionModel(
  overrides: Partial<EnhancedModelMetadata> = {},
): EnhancedModelMetadata {
  return createModel({
    id: "gpt-4.1-vision",
    display_name: "GPT 4.1 Vision",
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      json_mode: true,
      function_calling: true,
      reasoning: false,
    },
    task_families: ["chat", "vision_understanding"],
    input_modalities: ["text", "image"],
    ...overrides,
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  mockUseConfiguredProviders.mockReturnValue({
    providers: [
      {
        key: "openai",
        label: "OpenAI",
        registryId: "openai",
        type: "openai",
        providerId: "openai",
        apiHost: "https://api.openai.com/v1",
      },
    ],
    loading: false,
  });
  mockUseProviderModels.mockReturnValue({
    models: [
      createVisionModel({ id: "gpt-4.1", display_name: "GPT 4.1" }),
      createVisionModel(),
    ],
    loading: false,
    error: null,
    modelIds: ["gpt-4.1", "gpt-4.1-vision"],
  });
  mockResolveVisionModel.mockReturnValue({
    reason: "already_vision",
    targetModelId: "gpt-4.1",
  });
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

function renderNotice(
  props?: Partial<React.ComponentProps<typeof InputbarVisionCapabilityNotice>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <InputbarVisionCapabilityNotice
        hasPendingImages
        providerType="openai"
        model="gpt-4.1"
        {...props}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

describe("InputbarVisionCapabilityNotice", () => {
  it("后端回填原始 providerId 时，应使用真实受管 Provider 检查多模态能力", () => {
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "openai",
          label: "OpenAI",
          registryId: "openai",
          type: "openai",
        },
        {
          key: "openai_api_key",
          label: "OpenAI API Key",
          registryId: "openai",
          type: "openai",
          providerId: "openai",
          apiHost: "https://api.openai.com/v1",
        },
      ],
      loading: false,
    });

    renderNotice({
      providerType: "openai",
    });

    expect(mockUseProviderModels).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "openai_api_key",
        providerId: "openai",
      }),
      expect.objectContaining({
        returnFullMetadata: true,
        autoLoad: true,
        liveFetchOnly: true,
        hasApiKey: true,
      }),
    );
  });

  it("受管 API Key Provider 应按真实模型目录检查多模态能力", () => {
    renderNotice();

    expect(mockUseProviderModels).toHaveBeenCalledWith(
      expect.objectContaining({ key: "openai" }),
      expect.objectContaining({
        returnFullMetadata: true,
        autoLoad: true,
        liveFetchOnly: true,
        hasApiKey: true,
      }),
    );
  });

  it("当前模型支持多模态时不应展示提示", () => {
    const container = renderNotice();

    expect(
      container.querySelector('[data-testid="inputbar-vision-warning"]'),
    ).toBeNull();
  });

  it("模型能力加载中时不应禁用输入框", () => {
    const onPolicyChange = vi.fn();
    mockUseProviderModels.mockReturnValue({
      models: [],
      loading: true,
      error: null,
      modelIds: [],
    });

    const container = renderNotice({ onPolicyChange });

    expect(
      container.querySelector('[data-testid="inputbar-vision-warning"]'),
    ).toBeNull();
    expect(onPolicyChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        canSubmit: true,
        failClosedAtSubmit: false,
        reason: "missing_capability_summary",
        shouldDisableComposer: false,
        status: "warning",
      }),
    );
  });

  it("当前模型不支持多模态时应展示推荐模型提示", () => {
    const onPolicyChange = vi.fn();
    mockUseProviderModels.mockReturnValue({
      models: [createModel({ id: "gpt-4.1" }), createVisionModel()],
      loading: false,
      error: null,
      modelIds: ["gpt-4.1", "gpt-4.1-vision"],
    });
    mockResolveVisionModel.mockReturnValue({
      reason: "switched",
      targetModelId: "gpt-4.1-vision",
    });

    const container = renderNotice({ onPolicyChange });

    expect(container.textContent).toContain("gpt-4.1 不支持多模态图片理解");
    expect(container.textContent).toContain("gpt-4.1-vision");
    expect(onPolicyChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        canSubmit: false,
        failClosedAtSubmit: true,
        missingInputModalities: ["image"],
        reason: "missing_input_modalities",
        shouldDisableComposer: true,
        status: "blocked",
      }),
    );
  });

  it("当前 Provider 没有可用多模态模型时应展示 Provider 级提示", () => {
    mockUseProviderModels.mockReturnValue({
      models: [createModel({ id: "gpt-4.1" })],
      loading: false,
      error: null,
      modelIds: ["gpt-4.1"],
    });
    mockResolveVisionModel.mockReturnValue({
      reason: "no_vision_model",
      targetModelId: "",
    });

    const container = renderNotice();

    expect(container.textContent).toContain(
      "当前 Provider 暂无可用的多模态模型",
    );
  });
});
