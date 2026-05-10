import { describe, expect, it } from "vitest";
import type { ConfiguredProvider } from "@/hooks/useConfiguredProviders";
import {
  buildAgentFastResponseMetadata,
  buildAgentFastResponseSystemPrompt,
  resolveAgentFastResponseModel,
  resolveAgentFastResponseSearchMode,
  shouldUseAgentFastResponseSelection,
} from "./fastResponseModel";

function provider(
  overrides: Partial<ConfiguredProvider> = {},
): ConfiguredProvider {
  return {
    key: "deepseek",
    label: "DeepSeek",
    registryId: "deepseek",
    type: "deepseek",
    providerId: "deepseek",
    customModels: [],
    ...overrides,
  };
}

const baseOptions = {
  mappedTheme: "general",
  isThemeWorkbench: false,
  contentId: null,
  messageCount: 0,
  sourceText: "请只回复一个字：好",
  imagesCount: 0,
  currentProviderType: "lime-hub",
  currentModel: "gpt-5.5",
  configuredProviders: [provider()],
  toolPreferences: {
    webSearch: false,
    thinking: false,
    task: false,
    subagent: false,
  },
};

describe("resolveAgentFastResponseModel", () => {
  it("应为慢首字或 DeepSeek 推理模型预加载快速响应 Provider", () => {
    expect(
      shouldUseAgentFastResponseSelection({
        providerType: "lime-hub",
        model: "gpt-5.5",
      }),
    ).toBe(true);
    expect(
      shouldUseAgentFastResponseSelection({
        providerType: "deepseek",
        model: "deepseek-reasoner",
      }),
    ).toBe(true);
    expect(
      shouldUseAgentFastResponseSelection({
        providerType: "deepseek",
        model: "deepseek-chat",
      }),
    ).toBe(false);
  });

  it("首轮轻量普通对话应选择 DeepSeek 快速响应模型", () => {
    const decision = resolveAgentFastResponseModel(baseOptions);

    expect(decision).toMatchObject({
      enabled: true,
      providerOverride: "deepseek",
      modelOverride: "deepseek-chat",
      reason: "first-turn-low-latency",
      label: "快速响应",
      routingChanged: true,
    });
    expect(buildAgentFastResponseMetadata(decision)).toEqual({
      mode: "auto",
      label: "快速响应",
      reason: "first-turn-low-latency",
      provider: "deepseek",
      model: "deepseek-chat",
      routing_changed: true,
    });
  });

  it("只以 mappedTheme 判断通用对话，兼容 Claw/Harness 的现役入口命名", () => {
    const decision = resolveAgentFastResponseModel({
      ...baseOptions,
      mappedTheme: "general",
    });

    expect(decision.enabled).toBe(true);
  });

  it("显式模型覆盖或服务模型覆盖优先，不应自动改路由", () => {
    expect(
      resolveAgentFastResponseModel({
        ...baseOptions,
        hasExplicitProviderOverride: true,
      }).reason,
    ).toBe("explicit-model-override");

    expect(
      resolveAgentFastResponseModel({
        ...baseOptions,
        hasServiceModelOverride: true,
      }).reason,
    ).toBe("explicit-model-override");
  });

  it("联网搜索 allowed 只提供候选能力，不应靠文本关键词禁用快速响应", () => {
    const decision = resolveAgentFastResponseModel({
      ...baseOptions,
      effectiveWebSearch: true,
      toolPreferences: {
        ...baseOptions.toolPreferences,
        webSearch: true,
      },
      sourceText: "请搜索最新 AI 新闻，并用一句话回答",
    });

    expect(decision.enabled).toBe(true);
    expect(decision.searchMode).toBe("allowed");
  });

  it("只有显式 required 搜索模式才应禁用快速响应", () => {
    expect(
      resolveAgentFastResponseModel({
        ...baseOptions,
        effectiveWebSearch: true,
        searchMode: "required",
        sourceText: "查一下今天的汇率",
      }).reason,
    ).toBe("heavy-capability-enabled");

    expect(
      resolveAgentFastResponseSearchMode({
        searchMode: "required",
        effectiveWebSearch: true,
        toolPreferences: baseOptions.toolPreferences,
      }),
    ).toBe("required");
  });

  it("上下文和历史续聊不应进入快速响应", () => {
    expect(
      resolveAgentFastResponseModel({
        ...baseOptions,
        contentId: "content-1",
      }).reason,
    ).toBe("content-bound");

    expect(
      resolveAgentFastResponseModel({
        ...baseOptions,
        messageCount: 2,
      }).reason,
    ).toBe("not-first-turn");
  });

  it("Provider 列表未返回 DeepSeek 时仍应使用内置快速路由", () => {
    const decision = resolveAgentFastResponseModel({
      ...baseOptions,
      configuredProviders: [],
    });

    expect(decision).toMatchObject({
      enabled: true,
      providerOverride: "deepseek",
      modelOverride: "deepseek-chat",
      reason: "first-turn-low-latency",
      routingChanged: true,
    });
  });

  it("LimeHub 慢首字模型首轮短文本不等待 Provider 列表即可使用内置快速路由", () => {
    const decision = resolveAgentFastResponseModel({
      ...baseOptions,
      currentProviderType: "lime-hub",
      currentModel: "gpt-5.5",
      configuredProviders: undefined,
    });

    expect(decision).toMatchObject({
      enabled: true,
      providerOverride: "deepseek",
      modelOverride: "deepseek-chat",
      reason: "first-turn-low-latency",
      routingChanged: true,
    });
  });

  it("DeepSeek 自定义模型没有 chat 时仍应选择非推理 chat 模型", () => {
    const decision = resolveAgentFastResponseModel({
      ...baseOptions,
      configuredProviders: [
        provider({
          customModels: ["deepseek-v4-pro", "deepseek-v4-flash"],
        }),
      ],
    });

    expect(decision).toMatchObject({
      enabled: true,
      providerOverride: "deepseek",
      modelOverride: "deepseek-chat",
    });
  });

  it("当前 DeepSeek 推理/Flash 模型也应切到非推理 chat 模型", () => {
    const decision = resolveAgentFastResponseModel({
      ...baseOptions,
      currentProviderType: "deepseek",
      currentModel: "deepseek-v4-flash",
      configuredProviders: [
        provider({
          customModels: ["deepseek-v4-pro", "deepseek-v4-flash"],
        }),
      ],
    });

    expect(decision).toMatchObject({
      enabled: true,
      providerOverride: "deepseek",
      modelOverride: "deepseek-chat",
      reason: "first-turn-low-latency",
    });
  });

  it("当前已经在 DeepSeek 推理模型时不依赖 Provider 列表完成降级", () => {
    const decision = resolveAgentFastResponseModel({
      ...baseOptions,
      currentProviderType: "deepseek",
      currentModel: "deepseek-reasoner",
      configuredProviders: undefined,
    });

    expect(decision).toMatchObject({
      enabled: true,
      providerOverride: "deepseek",
      modelOverride: "deepseek-chat",
      reason: "first-turn-low-latency",
    });
  });

  it("当前已经是 DeepSeek chat 时也应启用短提示词快速响应但不切模型", () => {
    const decision = resolveAgentFastResponseModel({
      ...baseOptions,
      currentProviderType: "deepseek",
      currentModel: "deepseek-chat",
    });

    expect(decision).toMatchObject({
      enabled: true,
      providerOverride: "deepseek",
      modelOverride: "deepseek-chat",
      reason: "first-turn-short-prompt",
      routingChanged: false,
    });
    expect(buildAgentFastResponseMetadata(decision)).toEqual({
      mode: "auto",
      label: "快速响应",
      reason: "first-turn-short-prompt",
      provider: "deepseek",
      model: "deepseek-chat",
      routing_changed: false,
    });
  });

  it("当前模型不是已知慢首字模型或快速响应模型时不应覆盖", () => {
    expect(
      resolveAgentFastResponseModel({
        ...baseOptions,
        currentProviderType: "lime-hub",
        currentModel: "claude-sonnet-4-5",
      }).reason,
    ).toBe("current-model-not-slow");
  });

  it("快速响应系统提示词应保持短路径且约束单字输出", () => {
    const prompt = buildAgentFastResponseSystemPrompt(
      new Date("2026-05-01T00:00:00Z"),
    );

    expect(prompt).toContain("快速响应助手");
    expect(prompt).toContain("只输出一个字");
    expect(prompt).toContain("不主动联网");
    expect(prompt.length).toBeLessThan(260);
  });

  it("联网搜索 allowed 时系统提示词应交给模型按需决定是否使用工具", () => {
    const prompt = buildAgentFastResponseSystemPrompt(
      new Date("2026-05-01T00:00:00Z"),
      { searchMode: "allowed" },
    );

    expect(prompt).toContain("联网搜索只是候选能力");
    expect(prompt).toContain("需要实时或外部证据时再用工具");
    expect(prompt).not.toContain("不主动联网");
    expect(prompt.length).toBeLessThan(260);
  });
});
