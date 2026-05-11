import { describe, expect, it } from "vitest";
import {
  buildAgentFastResponseMetadata,
  buildAgentFastResponseSystemPrompt,
  resolveAgentRuntimeStatusPresentation,
  resolveAgentFastResponseRouting,
  resolveAgentFastResponseSearchMode,
} from "./fastResponseRouting";

const baseOptions = {
  mappedTheme: "general",
  isThemeWorkbench: false,
  contentId: null,
  messageCount: 0,
  sourceText: "请只回复一个字：好",
  imagesCount: 0,
  toolPreferences: {
    webSearch: false,
    thinking: false,
    task: false,
    subagent: false,
  },
};

describe("resolveAgentFastResponseRouting", () => {
  it("首轮轻量普通对话只声明快速响应意图，不在前端选择 provider/model", () => {
    const decision = resolveAgentFastResponseRouting(baseOptions);

    expect(decision).toMatchObject({
      enabled: true,
      reason: "first-turn-short-prompt",
      label: "快速响应",
      serviceModelSlot: "responsive_chat",
      routingSlot: "responsive_chat_model",
    });
    expect("providerOverride" in decision).toBe(false);
    expect("modelOverride" in decision).toBe(false);
    expect(buildAgentFastResponseMetadata(decision)).toEqual({
      mode: "auto",
      label: "快速响应",
      reason: "first-turn-short-prompt",
      service_model_slot: "responsive_chat",
      routing_slot: "responsive_chat_model",
      routing_changed: false,
      resolver: "backend_service_model",
      runtime_status_presentation: "transient",
    });
  });

  it("快速响应元数据应声明运行状态只走轻量瞬态展示", () => {
    expect(
      resolveAgentRuntimeStatusPresentation({
        harness: {
          fast_response_routing: buildAgentFastResponseMetadata(
            resolveAgentFastResponseRouting(baseOptions),
          ),
        },
      }),
    ).toBe("transient");

    expect(resolveAgentRuntimeStatusPresentation(undefined)).toBe("timeline");
  });

  it("只以 mappedTheme 判断通用对话，兼容 Claw/Harness 的现役入口命名", () => {
    const decision = resolveAgentFastResponseRouting({
      ...baseOptions,
      mappedTheme: "general",
    });

    expect(decision.enabled).toBe(true);
  });

  it("显式模型覆盖或服务模型覆盖优先，不应自动改路由", () => {
    expect(
      resolveAgentFastResponseRouting({
        ...baseOptions,
        hasExplicitProviderOverride: true,
      }).reason,
    ).toBe("explicit-model-override");

    expect(
      resolveAgentFastResponseRouting({
        ...baseOptions,
        hasServiceModelOverride: true,
      }).reason,
    ).toBe("explicit-model-override");
  });

  it("联网搜索 allowed 只提供候选能力，不应靠文本关键词禁用快速响应", () => {
    const decision = resolveAgentFastResponseRouting({
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
      resolveAgentFastResponseRouting({
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
      resolveAgentFastResponseRouting({
        ...baseOptions,
        contentId: "content-1",
      }).reason,
    ).toBe("content-bound");

    expect(
      resolveAgentFastResponseRouting({
        ...baseOptions,
        messageCount: 2,
      }).reason,
    ).toBe("not-first-turn");
  });

  it("@ 或 / 命令不应被当成普通轻量对话", () => {
    expect(
      resolveAgentFastResponseRouting({
        ...baseOptions,
        sourceText: "@浏览器 打开 https://example.com",
      }).reason,
    ).toBe("not-lightweight-text");

    expect(
      resolveAgentFastResponseRouting({
        ...baseOptions,
        sourceText: "/image 生成一张图",
      }).reason,
    ).toBe("not-lightweight-text");
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
