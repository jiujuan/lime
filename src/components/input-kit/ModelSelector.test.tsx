import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const {
  mockUseConfiguredProviders,
  mockUseProviderModels,
  mockFilterModelsByTheme,
} = vi.hoisted(() => ({
  mockUseConfiguredProviders: vi.fn(),
  mockUseProviderModels: vi.fn(),
  mockFilterModelsByTheme: vi.fn(),
}));

vi.mock("@/hooks/useConfiguredProviders", () => ({
  useConfiguredProviders: (...args: unknown[]) =>
    mockUseConfiguredProviders(...args),
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

vi.mock("@/components/agent/chat/utils/modelThemePolicy", () => ({
  filterModelsByTheme: (...args: unknown[]) => mockFilterModelsByTheme(...args),
}));

import { ModelSelector } from "./ModelSelector";

interface MountedRoot {
  root: Root;
  container: HTMLDivElement;
}

const mountedRoots: MountedRoot[] = [];

function createModelMetadata(id: string) {
  return {
    id,
    display_name: id,
    provider_id: "fal",
    provider_name: "Fal",
    family: null,
    tier: "pro" as const,
    capabilities: {
      vision: false,
      tools: false,
      streaming: false,
      json_mode: false,
      function_calling: false,
      reasoning: false,
    },
    pricing: null,
    limits: {
      context_length: null,
      max_output_tokens: null,
      requests_per_minute: null,
      tokens_per_minute: null,
    },
    status: "active" as const,
    release_date: null,
    is_latest: false,
    description: null,
    source: "custom" as const,
    created_at: 0,
    updated_at: 0,
  };
}

function renderModelSelector(
  props: Partial<React.ComponentProps<typeof ModelSelector>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const mergedProps: React.ComponentProps<typeof ModelSelector> = {
    providerType: "custom-codex",
    setProviderType: vi.fn(),
    model: "gpt-5.3-codex",
    setModel: vi.fn(),
    activeTheme: "general",
    ...props,
  };

  act(() => {
    root.render(<ModelSelector {...mergedProps} />);
  });

  mountedRoots.push({ root, container });
  return { container, props: mergedProps };
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await changeLimeLocale("zh-CN");

  vi.clearAllMocks();
  window.localStorage.clear();

  mockUseConfiguredProviders.mockReturnValue({
    providers: [
      {
        key: "custom-codex",
        label: "Codex Custom",
        registryId: "custom-codex",
        fallbackRegistryId: "codex",
        type: "codex",
        providerId: "custom-codex",
        apiHost: "https://api.openai.com/v1",
      },
    ],
    loading: false,
  });

  mockUseProviderModels.mockReturnValue({
    modelIds: ["gpt-5.3-codex", "gpt-5.2-codex"],
    models: [
      {
        id: "gpt-5.3-codex",
        capabilities: {
          vision: true,
          tools: true,
          streaming: true,
          json_mode: true,
          function_calling: true,
          reasoning: true,
        },
      },
      {
        id: "gpt-5.2-codex",
        capabilities: {
          vision: false,
          tools: true,
          streaming: true,
          json_mode: true,
          function_calling: true,
          reasoning: false,
        },
      },
    ],
    loading: false,
    error: null,
  });

  mockFilterModelsByTheme.mockImplementation((_theme, models) => ({
    models,
    usedFallback: false,
    filteredOutCount: 0,
    policyName: "none",
  }));
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  window.localStorage.clear();
  await changeLimeLocale("zh-CN");
});

describe("ModelSelector", () => {
  it("只有模型没有 provider 时不应展示成 Lime Hub 的已选模型", () => {
    const { container } = renderModelSelector({
      providerType: "",
      model: "gpt-5.5",
    });

    expect(container.textContent).toContain("选择模型");
    expect(container.textContent).not.toContain("gpt-5.5");
  });

  it("后端回填原始 providerId 时，应解析到真实受管 Provider 读取模型", () => {
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
          fallbackRegistryId: "openai",
          type: "openai",
          providerId: "openai",
          apiHost: "https://api.openai.com/v1",
        },
      ],
      loading: false,
    });

    renderModelSelector({
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

  it("禁用后台预加载时，关闭状态下应延后加载模型选择数据", () => {
    renderModelSelector({
      backgroundPreload: "disabled",
    });

    expect(mockUseConfiguredProviders).toHaveBeenCalledWith({
      autoLoad: false,
    });
    expect(mockUseProviderModels).toHaveBeenCalledWith(
      expect.objectContaining({ key: "custom-codex" }),
      expect.objectContaining({
        returnFullMetadata: true,
        autoLoad: false,
        liveFetchOnly: true,
        hasApiKey: true,
      }),
    );
  });

  it("默认后台预加载开启时，应在未展开选择器前纠正失效持久化模型", async () => {
    const setModel = vi.fn();

    mockUseProviderModels.mockReturnValue({
      modelIds: ["gpt-5.2-codex", "gpt-5.1-codex-mini"],
      models: [
        {
          id: "gpt-5.2-codex",
          capabilities: {
            vision: true,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: true,
          },
        },
        {
          id: "gpt-5.1-codex-mini",
          capabilities: {
            vision: false,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: false,
          },
        },
      ],
      loading: false,
      error: null,
    });

    renderModelSelector({
      model: "gpt-5.9-codex-preview",
      setModel,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockUseProviderModels).toHaveBeenCalledWith(
      expect.objectContaining({ key: "custom-codex" }),
      expect.objectContaining({
        returnFullMetadata: true,
        autoLoad: true,
      }),
    );
    expect(setModel).toHaveBeenCalledWith("gpt-5.2-codex");
  });

  it("打开选择器后应加载数据并回退到兼容模型", () => {
    const setModel = vi.fn();
    const { container } = renderModelSelector({
      model: "gpt-5.3-codex",
      setModel,
    });

    const trigger = container.querySelector(
      'button[role="combobox"]',
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("未找到模型选择触发器");
    }

    act(() => {
      trigger.click();
    });

    expect(setModel).toHaveBeenCalledWith("gpt-5.2-codex");
  });

  it("切换供应商时应同步切换到该供应商的首个已配置模型，避免沿用旧模型", () => {
    const setProviderType = vi.fn();
    const setModel = vi.fn();
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "lime-hub",
          label: "Lime 云端",
          registryId: "lime-hub",
          type: "openai",
          providerId: "lime-hub",
          apiHost: "https://llm.limeai.run",
          customModels: ["gpt-5.5"],
        },
        {
          key: "deepseek",
          label: "DeepSeek",
          registryId: "deepseek",
          type: "openai",
          providerId: "deepseek",
          apiHost: "https://api.deepseek.com",
          customModels: ["deepseek-chat", "deepseek-reasoner"],
        },
      ],
      loading: false,
    });
    mockUseProviderModels.mockReturnValue({
      modelIds: ["gpt-5.5"],
      models: [createModelMetadata("gpt-5.5")],
      loading: false,
      error: null,
    });

    const { container } = renderModelSelector({
      providerType: "lime-hub",
      setProviderType,
      model: "gpt-5.5",
      setModel,
    });

    const trigger = container.querySelector(
      'button[role="combobox"]',
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("未找到模型选择触发器");
    }

    act(() => {
      trigger.click();
    });

    const deepseekButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("DeepSeek"));
    if (!deepseekButton) {
      throw new Error("未找到 DeepSeek 供应商按钮");
    }

    act(() => {
      deepseekButton.click();
    });

    expect(setProviderType).toHaveBeenCalledWith("deepseek");
    expect(setModel).toHaveBeenCalledWith("deepseek-chat");
    expect(setModel).not.toHaveBeenCalledWith("gpt-5.5");
  });

  it("模型过滤清空本地模型时应展示调用方提供的图片模型回退", () => {
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "fal",
          label: "Fal",
          registryId: "fal",
          fallbackRegistryId: "openai",
          type: "openai",
          providerId: "fal",
          apiHost: "https://fal.run/fal-ai",
          customModels: ["gpt-5.2-pro"],
        },
      ],
      loading: false,
    });
    mockUseProviderModels.mockReturnValue({
      modelIds: ["gpt-5.2-pro"],
      models: [createModelMetadata("gpt-5.2-pro")],
      loading: false,
      error: null,
    });

    const { container } = renderModelSelector({
      providerType: "fal",
      model: "",
      modelFilter: (item) => item.id.startsWith("fal-ai/"),
      getFallbackModels: () => [createModelMetadata("fal-ai/nano-banana-pro")],
    });

    const trigger = container.querySelector(
      'button[role="combobox"]',
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("未找到模型选择触发器");
    }

    act(() => {
      trigger.click();
    });

    const pageText = document.body.textContent || "";
    expect(pageText).toContain("fal-ai/nano-banana-pro");
    expect(pageText).not.toContain("gpt-5.2-pro");
    expect(pageText).not.toContain("暂无可用模型");
  });

  it("展开后应显示模型的思考与多模态能力标签", () => {
    mockUseProviderModels.mockReturnValue({
      modelIds: ["gpt-5.3-codex", "text-only-chat"],
      models: [
        {
          id: "gpt-5.3-codex",
          capabilities: {
            vision: true,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: true,
          },
        },
        {
          id: "text-only-chat",
          capabilities: {
            vision: false,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: false,
          },
        },
      ],
      loading: false,
      error: null,
    });

    const { container } = renderModelSelector();

    const trigger = container.querySelector(
      'button[role="combobox"]',
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("未找到模型选择触发器");
    }

    act(() => {
      trigger.click();
    });

    const pageText = document.body.textContent || "";
    expect(pageText).toContain("支持思考");
    expect(pageText).toContain("支持多模态");
    expect(pageText).toContain("无多模态");
  });

  it("en-US locale 应展示 common namespace 里的模型选择 chrome", async () => {
    await changeLimeLocale("en-US");
    mockUseProviderModels.mockReturnValue({
      modelIds: ["gpt-5.3-codex", "text-only-chat"],
      models: [
        {
          id: "gpt-5.3-codex",
          capabilities: {
            vision: true,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: true,
          },
        },
        {
          id: "text-only-chat",
          capabilities: {
            vision: false,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: false,
          },
        },
      ],
      loading: false,
      error: null,
    });

    const { container } = renderModelSelector({
      onManageProviders: vi.fn(),
    });

    const trigger = container.querySelector(
      'button[role="combobox"]',
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("未找到模型选择触发器");
    }

    act(() => {
      trigger.click();
    });

    const pageText = document.body.textContent || "";
    expect(pageText).toContain("Model selection");
    expect(pageText).toContain("Currently organized by General chat");
    expect(pageText).toContain("Providers");
    expect(pageText).toContain("Model list");
    expect(pageText).toContain("Supports reasoning");
    expect(pageText).toContain("No multimodal");
    expect(pageText).toContain("Manage providers");
    expect(pageText).not.toContain("模型选择");
    expect(pageText).not.toContain("支持思考");
  });

  it("展开后应把 Lime 云端模型与本地供应商分组显示", () => {
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "lime-hub",
          label: "Lime 云端",
          registryId: "lime-hub",
          type: "openai",
          providerId: "lime-hub",
          apiHost: "https://llm.limeai.run",
        },
        {
          key: "custom-codex",
          label: "Codex Custom",
          registryId: "custom-codex",
          fallbackRegistryId: "codex",
          type: "codex",
          providerId: "custom-codex",
          apiHost: "https://api.openai.com/v1",
        },
      ],
      loading: false,
    });
    mockUseProviderModels.mockReturnValue({
      modelIds: ["gpt-5.5", "deepseek-v4-flash"],
      models: [
        {
          id: "gpt-5.5",
          capabilities: {
            vision: true,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: true,
          },
        },
        {
          id: "deepseek-v4-flash",
          capabilities: {
            vision: false,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: false,
          },
        },
      ],
      loading: false,
      error: null,
    });

    const { container } = renderModelSelector({
      providerType: "lime-hub",
      model: "gpt-5.5",
    });

    const trigger = container.querySelector(
      'button[role="combobox"]',
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("未找到模型选择触发器");
    }

    act(() => {
      trigger.click();
    });

    const pageText = document.body.textContent || "";
    expect(pageText).toContain("云端模型");
    expect(pageText).toContain("本地与自定义");
    expect(pageText).toContain("Lime 云端");
    expect(pageText).toContain("Codex Custom");
    expect(pageText).toContain("gpt-5.5");
    expect(pageText).toContain("deepseek-v4-flash");
    expect(pageText).not.toContain("暂无可用模型");
  });

  it("Lime Hub 未登录时应在下拉框提示登录且不展示本地兜底模型", () => {
    const onManageProviders = vi.fn();
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "lime-hub",
          label: "Lime 云端",
          registryId: "lime-hub",
          type: "openai",
          providerId: "lime-hub",
          apiHost: "https://llm.limeai.run",
          customModels: [],
          authStatus: "login_required",
        },
      ],
      loading: false,
    });
    mockUseProviderModels.mockReturnValue({
      modelIds: ["gpt-5.5", "gpt-5.4"],
      models: [createModelMetadata("gpt-5.5"), createModelMetadata("gpt-5.4")],
      loading: false,
      error: null,
    });

    const { container } = renderModelSelector({
      providerType: "lime-hub",
      model: "gpt-5.5",
      onManageProviders,
    });

    expect(container.textContent).toContain("Lime 云端");
    expect(container.textContent).toContain("需要登录");

    const trigger = container.querySelector(
      'button[role="combobox"]',
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("未找到模型选择触发器");
    }

    act(() => {
      trigger.click();
    });

    expect(mockUseProviderModels).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "lime-hub",
        providerId: "lime-hub",
        authStatus: "login_required",
      }),
      expect.objectContaining({
        returnFullMetadata: true,
        autoLoad: false,
      }),
    );

    const pageText = document.body.textContent || "";
    expect(pageText).toContain("云端模型");
    expect(pageText).toContain("Lime 云端");
    expect(pageText).toContain("需要登录");
    expect(pageText).toContain("登录后会自动同步 Lime Hub 的可用模型");
    expect(pageText).toContain("去登录");
    expect(pageText).not.toContain("gpt-5.5");
    expect(pageText).not.toContain("gpt-5.4");

    const loginButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("去登录"));
    if (!loginButton) {
      throw new Error("未找到去登录按钮");
    }

    act(() => {
      loginButton.click();
    });

    expect(onManageProviders).toHaveBeenCalledTimes(1);
  });

  it("未知 anthropic-compatible Provider 应在选择器中展示显式缓存提示", () => {
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "custom-anthropic-compatible",
          label: "GLM Anthropic",
          registryId: "custom-anthropic-compatible",
          fallbackRegistryId: "anthropic",
          type: "anthropic-compatible",
          providerId: "custom-anthropic-compatible",
          apiHost: "https://api.example.com/anthropic",
        },
      ],
      loading: false,
    });
    mockUseProviderModels.mockReturnValue({
      modelIds: ["glm-5.1"],
      models: [
        {
          id: "glm-5.1",
          capabilities: {
            vision: true,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: true,
          },
        },
      ],
      loading: false,
      error: null,
    });

    const { container } = renderModelSelector({
      providerType: "custom-anthropic-compatible",
      model: "glm-5.1",
    });

    const trigger = container.querySelector(
      'button[role="combobox"]',
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("未找到模型选择触发器");
    }

    act(() => {
      trigger.click();
    });

    const pageText = document.body.textContent || "";
    expect(pageText).toContain("显式缓存");
    expect(pageText).toContain("未声明自动 Prompt Cache");
    expect(pageText).toContain("cache_control");
  });

  it.each([
    {
      label: "GLM Anthropic",
      apiHost: "https://open.bigmodel.cn/api/anthropic",
      model: "glm-5.1",
    },
    {
      label: "Z.AI Anthropic",
      apiHost: "https://api.z.ai/api/anthropic",
      model: "glm-4.7",
    },
    {
      label: "Kimi Anthropic",
      apiHost: "https://api.moonshot.cn/anthropic",
      model: "kimi-k2.5",
    },
    {
      label: "Kimi Global Anthropic",
      apiHost: "https://api.moonshot.ai/anthropic",
      model: "kimi-k2.5",
    },
    {
      label: "Kimi Code Subscription",
      apiHost: "https://api.kimi.com/coding/",
      model: "k2p5",
    },
    {
      label: "MiniMax Anthropic",
      apiHost: "https://api.minimaxi.com/anthropic",
      model: "minimax-m1",
    },
    {
      label: "MiniMax Global Anthropic",
      apiHost: "https://api.minimax.io/anthropic",
      model: "minimax-m1",
    },
    {
      label: "Alibaba Coding Anthropic",
      apiHost: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
      model: "qwen3-coder-plus",
    },
    {
      label: "Alibaba Global Coding Anthropic",
      apiHost: "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic",
      model: "qwen3-coder-plus",
    },
    {
      label: "MiMo Anthropic",
      apiHost: "https://token-plan-cn.xiaomimimo.com/anthropic",
      model: "mimo-v2-flash",
    },
  ])("$label 不应在选择器中误报显式缓存提示", ({ label, apiHost, model }) => {
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "custom-anthropic-compatible",
          label,
          registryId: "custom-anthropic-compatible",
          fallbackRegistryId: "anthropic",
          type: "anthropic-compatible",
          providerId: "custom-anthropic-compatible",
          apiHost,
        },
      ],
      loading: false,
    });
    mockUseProviderModels.mockReturnValue({
      modelIds: [model],
      models: [
        {
          id: model,
          capabilities: {
            vision: true,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: true,
          },
        },
      ],
      loading: false,
      error: null,
    });

    const { container } = renderModelSelector({
      providerType: "custom-anthropic-compatible",
      model,
    });

    const trigger = container.querySelector(
      'button[role="combobox"]',
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("未找到模型选择触发器");
    }

    act(() => {
      trigger.click();
    });

    const pageText = document.body.textContent || "";
    expect(pageText).not.toContain("显式缓存");
    expect(pageText).not.toContain("未声明自动 Prompt Cache");
  });

  it("显式声明 automatic 的 anthropic-compatible Provider 不应在选择器中误报显式缓存提示", () => {
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "custom-anthropic-compatible",
          label: "GLM Anthropic Automatic",
          registryId: "custom-anthropic-compatible",
          fallbackRegistryId: "anthropic",
          type: "anthropic-compatible",
          providerId: "custom-anthropic-compatible",
          apiHost: "https://open.bigmodel.cn/api/anthropic",
          promptCacheMode: "automatic",
        },
      ],
      loading: false,
    });
    mockUseProviderModels.mockReturnValue({
      modelIds: ["glm-5.1"],
      models: [
        {
          id: "glm-5.1",
          capabilities: {
            vision: true,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: true,
          },
        },
      ],
      loading: false,
      error: null,
    });

    const { container } = renderModelSelector({
      providerType: "custom-anthropic-compatible",
      model: "glm-5.1",
    });

    const trigger = container.querySelector(
      'button[role="combobox"]',
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("未找到模型选择触发器");
    }

    act(() => {
      trigger.click();
    });

    const pageText = document.body.textContent || "";
    expect(pageText).not.toContain("显式缓存");
    expect(pageText).not.toContain("未声明自动 Prompt Cache");
  });

  it("无 Provider 引导关闭后应隐藏，并在重新挂载时保持关闭状态", () => {
    mockUseConfiguredProviders.mockReturnValue({
      providers: [],
      loading: false,
    });
    mockUseProviderModels.mockReturnValue({
      modelIds: [],
      models: [],
      loading: false,
      error: null,
    });

    const firstRender = renderModelSelector({
      providerType: "",
      model: "",
    });

    expect(firstRender.container.textContent).toContain("工具模型未配置");

    const dismissButton = firstRender.container.querySelector(
      'button[aria-label="关闭工具模型未配置提示"]',
    ) as HTMLButtonElement | null;
    if (!dismissButton) {
      throw new Error("未找到关闭引导按钮");
    }

    act(() => {
      dismissButton.click();
    });

    expect(firstRender.container.textContent ?? "").not.toContain(
      "工具模型未配置",
    );
    expect(
      window.localStorage.getItem(
        "lime_model_selector_no_provider_guide_dismissed_v1",
      ),
    ).toBe("1");

    const secondRender = renderModelSelector({
      providerType: "",
      model: "",
    });

    expect(secondRender.container.textContent ?? "").not.toContain(
      "工具模型未配置",
    );
  });
});
