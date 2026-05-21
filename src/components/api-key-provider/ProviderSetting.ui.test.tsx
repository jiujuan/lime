import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderWithKeysDisplay } from "@/lib/api/apiKeyProvider";
import settingsZhCN from "@/i18n/resources/zh-CN/settings.json";
import {
  findModelBoundImageCommandEntryForModel,
  getCurrentSkillCatalogSnapshot,
} from "@/lib/api/skillCatalog";

const { mockFetchProviderModelsAuto } = vi.hoisted(() => ({
  mockFetchProviderModelsAuto: vi.fn(),
}));

vi.mock("@/lib/api/modelRegistry", () => ({
  fetchProviderModelsAuto: (...args: unknown[]) =>
    mockFetchProviderModelsAuto(...args),
  normalizeFetchProviderModelsSource: (result: {
    source: "Api" | "Error";
    models: unknown[];
    error: string | null;
  }) => result.source,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

import { ProviderSetting } from "./ProviderSetting";

const settingsDictionary = settingsZhCN as Record<string, string>;

function interpolateTemplate(
  template: string,
  values?: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(values?.[name] ?? ""),
  );
}

function createTranslate(dictionary: Record<string, string>) {
  return (
    key: string,
    fallbackOrOptions?: string | { defaultValue?: string },
  ) => {
    if (typeof fallbackOrOptions === "string") {
      return fallbackOrOptions;
    }

    if (fallbackOrOptions && typeof fallbackOrOptions === "object") {
      const template =
        dictionary[key] ||
        (typeof fallbackOrOptions.defaultValue === "string"
          ? fallbackOrOptions.defaultValue
          : key);
      return interpolateTemplate(
        template,
        fallbackOrOptions as Record<string, unknown>,
      );
    }

    return dictionary[key] || key;
  };
}

const translate = createTranslate(settingsDictionary);

interface MountedRoot {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedRoot[] = [];

function createProvider(
  overrides: Partial<ProviderWithKeysDisplay> = {},
): ProviderWithKeysDisplay {
  return {
    id: "deepseek",
    name: "DeepSeek",
    type: "openai",
    api_host: "https://api.deepseek.com",
    is_system: false,
    group: "mainstream",
    enabled: true,
    sort_order: 1,
    api_key_count: 1,
    custom_models: ["deepseek-chat"],
    created_at: new Date("2026-03-15T00:00:00.000Z").toISOString(),
    updated_at: new Date("2026-03-15T00:00:00.000Z").toISOString(),
    api_keys: [
      {
        id: "key-001",
        provider_id: "deepseek",
        api_key_masked: "sk-****1234",
        alias: "生产账号",
        enabled: true,
        usage_count: 12,
        error_count: 0,
        last_used_at: new Date("2026-03-15T08:00:00.000Z").toISOString(),
        created_at: new Date("2026-03-14T00:00:00.000Z").toISOString(),
      },
    ],
    ...overrides,
  };
}

function renderSetting(
  provider: ProviderWithKeysDisplay | null,
  props: Partial<React.ComponentProps<typeof ProviderSetting>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ProviderSetting provider={provider} {...props} />);
  });

  mountedRoots.push({ container, root });
  return container;
}

async function flushEffects(times = 2) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

function changeInput(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getApiModelSuggestionLabels(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="api-model-suggestion"]',
    ),
  ).map((button) => button.textContent?.trim() ?? "");
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  vi.clearAllMocks();
  mockFetchProviderModelsAuto.mockResolvedValue({
    source: "Api",
    models: [{ id: "deepseek-chat" }],
    error: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();

  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }

    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

describe("ProviderSetting", () => {
  it("空状态应提示选择或添加模型", async () => {
    const container = renderSetting(null);
    await flushEffects();

    expect(container.textContent ?? "").toContain("选择或添加模型");
    expect(container.textContent ?? "").toContain("密钥、模型优先级和测试连接");
  });

  it("详情页应保留密钥保存、模型优先级和测试连接", async () => {
    const container = renderSetting(createProvider());
    await flushEffects();
    const text = container.textContent ?? "";

    expect(text).toContain("DeepSeek");
    expect(text).toContain("API 密钥");
    expect(text).toContain("保存密钥");
    expect(text).toContain("模型优先级");
    expect(text).toContain("从接口获取");
    expect(text).toContain("测试连接");
    expect(text).toContain("主模型");
    expect(text).toContain("deepseek-chat");
    expect(text).not.toContain("协议配置表单");
    expect(text).not.toContain("连接验证");
    expect(text).not.toContain("支持的模型");
    expect(
      container.querySelector('[data-testid="provider-simple-card"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="provider-test-connection-button"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="provider-api-key-save-button"]'),
    ).not.toBeNull();
  });

  it("Lime Hub 未登录时应展示登录提示，不展示模型配置表单", async () => {
    const onLogin = vi.fn();
    const container = renderSetting(
      createProvider({
        id: "lime-hub",
        name: "Lime 云端",
        custom_models: [],
        api_keys: [],
        api_key_count: 0,
      }),
      {
        authStatus: "login_required",
        onLogin,
      },
    );
    await flushEffects();

    expect(
      container.querySelector('[data-testid="provider-login-required"]'),
    ).not.toBeNull();
    expect(container.textContent ?? "").toContain("Lime 云端");
    expect(container.textContent ?? "").toContain("需要登录");
    expect(container.textContent ?? "").toContain(
      "登录后会自动同步 Lime Hub 的可用模型",
    );
    expect(container.textContent ?? "").not.toContain("模型优先级");
    expect(container.textContent ?? "").not.toContain("从接口获取");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="provider-login-button"]',
        )
        ?.click();
      await Promise.resolve();
    });

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("手动添加模型应直接更新 custom_models", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const container = renderSetting(createProvider({ custom_models: [] }), {
      onUpdate,
    });
    await flushEffects();

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="model-draft-input"]',
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="model-draft-add-button"]',
    );

    expect(input).not.toBeNull();
    expect(button).not.toBeNull();

    await act(async () => {
      changeInput(input!, "deepseek-reasoner");
      await Promise.resolve();
    });

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(onUpdate).toHaveBeenCalledWith("deepseek", {
      custom_models: ["deepseek-reasoner"],
    });
    expect(container.textContent ?? "").toContain("deepseek-reasoner");
  });

  it("接口获取失败时不展示错误来源夹带的非实时模型", async () => {
    mockFetchProviderModelsAuto.mockResolvedValueOnce({
      source: "Error",
      models: [{ id: "wrong-fallback-model" }],
      error: "API 获取失败，本地模型兜底已下线。",
    });
    const container = renderSetting(createProvider({ custom_models: [] }));
    await flushEffects();

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="fetch-models-button"]',
    );

    await act(async () => {
      button?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchProviderModelsAuto).toHaveBeenCalledWith("deepseek");
    expect(container.textContent ?? "").toContain("API 获取失败");
    expect(container.textContent ?? "").not.toContain("wrong-fallback-model");
    expect(
      container.querySelector('[data-testid="api-model-suggestions"]'),
    ).toBeNull();
  });

  it("Responses 图片入口不支持 /models 时应保留手动图片模型并显示确认态", async () => {
    mockFetchProviderModelsAuto.mockResolvedValueOnce({
      source: "Error",
      models: [],
      error: "当前 Responses 兼容入口未提供标准 /models 接口。",
      diagnostic_hint: null,
    });
    const container = renderSetting(
      createProvider({
        id: "airgate-openai-images",
        name: "OpenAI-gpt-images-2",
        type: "openai",
        api_host: "https://code.ylsagi.com/codex",
        custom_models: ["gpt-images-2"],
      }),
    );
    await flushEffects();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="fetch-models-button"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = container.querySelector<HTMLElement>(
      '[data-testid="model-fetch-status"]',
    );
    expect(status?.textContent ?? "").toContain("已确认 Responses 图片模型");
    expect(status?.textContent ?? "").toContain("gpt-images-2");
    expect(status?.className ?? "").toContain("border-emerald-200");
    expect(container.textContent ?? "").toContain("gpt-images-2");
    expect(
      container.querySelector('[data-testid="api-model-suggestions"]'),
    ).toBeNull();
  });

  it("Responses 图片入口缺少声明模型时仍提示手动添加", async () => {
    mockFetchProviderModelsAuto.mockResolvedValueOnce({
      source: "Error",
      models: [],
      error: "当前 Responses 兼容入口未提供标准 /models 接口。",
      diagnostic_hint: null,
    });
    const container = renderSetting(
      createProvider({
        id: "airgate-openai-images",
        name: "OpenAI-gpt-images-2",
        type: "openai-response",
        api_host: "https://api.openai.com/v1",
        custom_models: [],
      }),
    );
    await flushEffects();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="fetch-models-button"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = container.querySelector<HTMLElement>(
      '[data-testid="model-fetch-status"]',
    );
    expect(status?.textContent ?? "").toContain(
      "该 Responses 图片入口不提供标准 /models 枚举",
    );
    expect(status?.textContent ?? "").toContain("请手动添加 gpt-images-2");
    expect(status?.className ?? "").toContain("border-sky-200");
  });

  it("Responses 图片入口返回已声明图片模型时应显示确认态", async () => {
    mockFetchProviderModelsAuto.mockResolvedValueOnce({
      source: "Api",
      models: [{ id: "gpt-images-2" }],
      error: null,
      diagnostic_hint:
        "当前 Responses 图片入口不提供标准 /models 枚举；已使用 Provider 中声明的图片模型作为可用模型，并写入 10 天缓存。",
    });
    const container = renderSetting(
      createProvider({
        id: "airgate-openai-images",
        name: "OpenAI-gpt-images-2",
        type: "openai",
        api_host: "https://code.ylsagi.com/codex",
        custom_models: ["gpt-images-2"],
      }),
    );
    await flushEffects();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="fetch-models-button"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = container.querySelector<HTMLElement>(
      '[data-testid="model-fetch-status"]',
    );
    expect(status?.textContent ?? "").toContain("已确认 1 个模型");
    expect(status?.textContent ?? "").toContain("已包含全部结果");
    expect(status?.className ?? "").toContain("border-emerald-200");
    expect(container.textContent ?? "").not.toContain(
      "该 Responses 图片入口不提供标准 /models 枚举",
    );
    expect(
      container.querySelector('[data-testid="api-model-suggestions"]'),
    ).toBeNull();
  });

  it("图片模型行应能创建本地 @命令绑定", async () => {
    const container = renderSetting(
      createProvider({
        id: "airgate-openai-images",
        name: "OpenAI Images",
        type: "openai",
        api_host: "https://api.openai.com/v1",
        custom_models: ["gpt-images-2"],
      }),
    );
    await flushEffects();

    const createButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="create-image-command-button"]',
    );
    expect(createButton).not.toBeNull();
    expect(createButton?.textContent ?? "").toContain("创建 @命令");

    await act(async () => {
      createButton?.click();
      await Promise.resolve();
    });

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="image-command-trigger-input"]',
    );
    expect(input?.value).toBe("@GPT Images 2");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="image-command-save-button"]',
        )
        ?.click();
      await Promise.resolve();
    });

    expect(container.textContent ?? "").toContain("已创建 @GPT Images 2");
    expect(container.textContent ?? "").toContain("已绑定 @GPT Images 2");
    expect(
      findModelBoundImageCommandEntryForModel(
        getCurrentSkillCatalogSnapshot(),
        "airgate-openai-images",
        "gpt-images-2",
      ),
    ).toMatchObject({
      commandKey: "image_model_gpt_images_2",
      binding: {
        requestDefaults: expect.objectContaining({
          modelBoundImageTask: "true",
          providerId: "airgate-openai-images",
          model: "gpt-images-2",
          executorMode: "responses_image_generation",
        }),
      },
    });
  });

  it("Fal Provider 不支持 /models 时应保留手动模型并显示确认态", async () => {
    mockFetchProviderModelsAuto.mockResolvedValueOnce({
      source: "Error",
      models: [],
      error: "Fal 不提供标准 /models 枚举。",
      diagnostic_hint: "请在 Provider 中手动添加 fal-ai/... 模型 ID。",
    });
    const container = renderSetting(
      createProvider({
        id: "fal",
        name: "Fal",
        type: "openai",
        api_host: "https://fal.run/fal-ai",
        custom_models: ["fal-ai/nano-banana-pro"],
      }),
    );
    await flushEffects();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="fetch-models-button"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = container.querySelector<HTMLElement>(
      '[data-testid="model-fetch-status"]',
    );
    expect(status?.textContent ?? "").toContain("已确认 Fal 模型");
    expect(status?.textContent ?? "").toContain("fal-ai/nano-banana-pro");
    expect(status?.className ?? "").toContain("border-emerald-200");
    expect(container.textContent ?? "").toContain("fal-ai/nano-banana-pro");
    expect(container.textContent ?? "").not.toContain("API 获取失败");
    expect(
      container.querySelector('[data-testid="api-model-suggestions"]'),
    ).toBeNull();
  });

  it("Fal Provider 没有 API Key 时仍可确认手动声明模型", async () => {
    mockFetchProviderModelsAuto.mockResolvedValueOnce({
      source: "Api",
      models: [{ id: "fal-ai/nano-banana-pro" }],
      error: null,
    });
    const container = renderSetting(
      createProvider({
        id: "fal",
        name: "Fal",
        type: "openai",
        api_host: "https://fal.run/fal-ai",
        api_key_count: 0,
        api_keys: [],
        custom_models: ["fal-ai/nano-banana-pro"],
      }),
    );
    await flushEffects();

    const fetchButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="fetch-models-button"]',
    );
    const connectionButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="provider-test-connection-button"]',
    );
    expect(fetchButton?.disabled).toBe(false);
    expect(connectionButton?.disabled).toBe(true);
    expect(container.textContent ?? "").toContain(
      "先填写 API 密钥，再测试连接",
    );
    expect(container.textContent ?? "").not.toContain("API 密钥（可选）");

    await act(async () => {
      fetchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchProviderModelsAuto).toHaveBeenCalledWith("fal");
    const status = container.querySelector<HTMLElement>(
      '[data-testid="model-fetch-status"]',
    );
    expect(status?.textContent ?? "").toContain("已确认 1 个模型");
    expect(status?.textContent ?? "").not.toContain("请先填写并保存 API 密钥");
  });

  it("Fal Provider 只有非 Fal 模型时应提示添加 fal-ai 模型", async () => {
    mockFetchProviderModelsAuto.mockResolvedValueOnce({
      source: "Error",
      models: [],
      error: "Fal 不提供标准 /models 枚举。",
      diagnostic_hint:
        "当前模型优先级没有可用 Fal 图片模型；请手动添加 fal-ai/nano-banana-pro。",
    });
    const container = renderSetting(
      createProvider({
        id: "fal",
        name: "Fal",
        type: "openai",
        api_host: "https://fal.run/fal-ai",
        custom_models: ["gpt-5.2-pro"],
      }),
    );
    await flushEffects();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="fetch-models-button"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = container.querySelector<HTMLElement>(
      '[data-testid="model-fetch-status"]',
    );
    expect(status?.textContent ?? "").toContain(
      "当前模型优先级没有可用 Fal 图片模型",
    );
    expect(status?.textContent ?? "").toContain("fal-ai/nano-banana-pro");
    expect(status?.className ?? "").toContain("border-sky-200");
    expect(container.textContent ?? "").not.toContain("API 获取失败");
  });

  it("Fal Provider 命中旧缓存里的非 Fal 模型时不应显示确认态", async () => {
    mockFetchProviderModelsAuto.mockResolvedValueOnce({
      source: "Api",
      models: [{ id: "gpt-5.2-pro" }],
      error: null,
      from_cache: true,
    });
    const container = renderSetting(
      createProvider({
        id: "fal",
        name: "Fal",
        type: "openai",
        api_host: "https://fal.run/fal-ai",
        custom_models: ["gpt-5.2-pro"],
      }),
    );
    await flushEffects();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="fetch-models-button"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = container.querySelector<HTMLElement>(
      '[data-testid="model-fetch-status"]',
    );
    expect(status?.textContent ?? "").toContain("当前没有可用 Fal 图片模型");
    expect(status?.textContent ?? "").toContain("fal-ai/nano-banana-pro");
    expect(status?.textContent ?? "").not.toContain("已确认 1 个模型");
    expect(status?.className ?? "").toContain("border-sky-200");
  });

  it("接口获取成功后点击模型建议才加入优先级", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    mockFetchProviderModelsAuto.mockResolvedValueOnce({
      source: "Api",
      models: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }],
      error: null,
    });
    const container = renderSetting(createProvider({ custom_models: [] }), {
      onUpdate,
    });
    await flushEffects();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="fetch-models-button"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent ?? "").toContain("接口返回 2 个模型");
    expect(onUpdate).not.toHaveBeenCalled();

    const suggestions = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="api-model-suggestion"]',
      ),
    );
    expect(suggestions.map((button) => button.textContent?.trim())).toContain(
      "deepseek-chat",
    );

    await act(async () => {
      suggestions[0]?.click();
      await Promise.resolve();
    });

    expect(onUpdate).toHaveBeenCalledWith("deepseek", {
      custom_models: ["deepseek-chat"],
    });
  });

  it("接口获取成功后应展示完整模型列表，并支持筛选长列表", async () => {
    const apiModels = Array.from({ length: 12 }, (_, index) => ({
      id: `provider-model-${String(index + 1).padStart(2, "0")}`,
    }));
    mockFetchProviderModelsAuto.mockResolvedValueOnce({
      source: "Api",
      models: apiModels,
      error: null,
    });
    const container = renderSetting(createProvider({ custom_models: [] }));
    await flushEffects();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="fetch-models-button"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent ?? "").toContain("接口返回 12 个模型");
    expect(container.textContent ?? "").toContain("显示 12 / 12 个");
    expect(getApiModelSuggestionLabels(container)).toHaveLength(12);
    expect(getApiModelSuggestionLabels(container)).toContain(
      "provider-model-12",
    );

    const filterInput = container.querySelector<HTMLInputElement>(
      '[data-testid="api-model-filter-input"]',
    );

    await act(async () => {
      changeInput(filterInput!, "model-12");
      await Promise.resolve();
    });

    expect(container.textContent ?? "").toContain("显示 1 / 12 个");
    expect(getApiModelSuggestionLabels(container)).toEqual([
      "provider-model-12",
    ]);
  });

  it("非系统 Provider 应展示删除配置按钮，并在确认后调用删除回调", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDeleteProvider = vi.fn().mockResolvedValue(true);
    const container = renderSetting(createProvider(), {
      onDeleteProvider,
    });
    await flushEffects();

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="provider-delete-button"]',
    );

    expect(button).not.toBeNull();
    expect(button?.textContent ?? "").toContain("删除配置");

    await act(async () => {
      button?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledWith(
      "确认删除「DeepSeek」配置？此操作会移除该服务商和关联密钥。",
    );
    expect(onDeleteProvider).toHaveBeenCalledWith("deepseek");

    confirmSpy.mockRestore();
  });

  it("系统 Provider 也应展示删除配置按钮，并说明只移除本地配置", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDeleteProvider = vi.fn().mockResolvedValue(true);
    const container = renderSetting(createProvider({ is_system: true }), {
      onDeleteProvider,
    });
    await flushEffects();

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="provider-delete-button"]',
    );

    expect(button).not.toBeNull();

    await act(async () => {
      button?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledWith(
      "确认删除「DeepSeek」配置？此操作会移除该服务商的已启用模型和本地 API 密钥，系统服务商入口仍可重新添加。",
    );
    expect(onDeleteProvider).toHaveBeenCalledWith("deepseek");

    confirmSpy.mockRestore();
  });

  it("编辑 API 密钥后可显式保存，不必先测试连接", async () => {
    const onAddApiKey = vi.fn().mockResolvedValue(undefined);
    const onTestConnection = vi.fn().mockResolvedValue({
      success: true,
    });
    const container = renderSetting(createProvider(), {
      onAddApiKey,
      onTestConnection,
    });
    await flushEffects();

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="provider-api-key-input"]',
    );
    const saveButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="provider-api-key-save-button"]',
    );

    expect(saveButton).not.toBeNull();
    expect(saveButton?.disabled).toBe(true);

    await act(async () => {
      changeInput(input!, "sk-updated-key");
      await Promise.resolve();
    });

    expect(container.textContent ?? "").toContain("未保存");
    expect(saveButton?.disabled).toBe(false);

    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onAddApiKey).toHaveBeenCalledWith("deepseek", "sk-updated-key");
    expect(onTestConnection).not.toHaveBeenCalled();
    expect(container.textContent ?? "").toContain("API 密钥已保存");
    expect(
      container.querySelector('[data-testid="api-key-status"]'),
    ).not.toBeNull();
  });

  it("保存 API 密钥遇到重复 Key 时应视为已保存", async () => {
    const onAddApiKey = vi.fn().mockRejectedValue("该 API Key 已存在");
    const container = renderSetting(createProvider(), {
      onAddApiKey,
    });
    await flushEffects();

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="provider-api-key-input"]',
    );
    const saveButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="provider-api-key-save-button"]',
    );

    await act(async () => {
      changeInput(input!, "sk-duplicated-key");
      await Promise.resolve();
    });

    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = container.querySelector<HTMLElement>(
      '[data-testid="api-key-status"]',
    );
    expect(status?.textContent ?? "").toContain(
      "这个 API 密钥已在当前服务商中",
    );
    expect(status?.className ?? "").toContain("border-emerald-200");
    expect(status?.textContent ?? "").not.toContain("保存 API 密钥失败");
  });

  it("保存 API 密钥失败时应展示后端返回的字符串原因", async () => {
    const onAddApiKey = vi.fn().mockRejectedValue("Provider 不存在: missing");
    const container = renderSetting(createProvider(), {
      onAddApiKey,
    });
    await flushEffects();

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="provider-api-key-input"]',
    );
    const saveButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="provider-api-key-save-button"]',
    );

    await act(async () => {
      changeInput(input!, "sk-missing-provider");
      await Promise.resolve();
    });

    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const status = container.querySelector<HTMLElement>(
      '[data-testid="api-key-status"]',
    );
    expect(status?.textContent ?? "").toContain("Provider 不存在: missing");
    expect(status?.textContent ?? "").not.toContain("保存 API 密钥失败");
  });

  it("测试连接应先保存新密钥，并只显示简洁状态", async () => {
    const onAddApiKey = vi.fn().mockResolvedValue(undefined);
    const onTestConnection = vi.fn().mockResolvedValue({
      success: true,
      latencyMs: 128,
    });
    const container = renderSetting(
      createProvider({ api_key_count: 0, api_keys: [] }),
      {
        onAddApiKey,
        onTestConnection,
      },
    );
    await flushEffects();

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="provider-api-key-input"]',
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="provider-test-connection-button"]',
    );

    await act(async () => {
      changeInput(input!, "sk-new-key");
      await Promise.resolve();
    });

    expect(button?.disabled).toBe(false);

    await act(async () => {
      button?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onAddApiKey).toHaveBeenCalledWith("deepseek", "sk-new-key");
    expect(onTestConnection).toHaveBeenCalledWith("deepseek");
    expect(container.textContent ?? "").toContain("连接成功 · 128ms");
    expect(container.textContent ?? "").not.toContain("错误详情");
    expect(container.textContent ?? "").not.toContain("对话测试");
  });
});
