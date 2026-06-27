import { describe, expect, it } from "vitest";
import {
  buildAgentFastResponseMetadata,
  resolveAgentRuntimeStatusPresentation,
  resolveAgentFastResponseRouting,
  resolveAgentFastResponseSearchMode,
} from "./fastResponseRouting";

const baseOptions = {
  mappedTheme: "general",
  isThemeWorkbench: false,
  contentId: null,
  messageCount: 0,
  sourceText: "帮我快速说明 TTFT 优化重点",
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
      reason: "first-turn-plain-text",
      label: "快速响应",
      serviceModelSlot: "responsive_chat",
      routingSlot: "responsive_chat_model",
    });
    expect("providerOverride" in decision).toBe(false);
    expect("modelOverride" in decision).toBe(false);
    expect(buildAgentFastResponseMetadata(decision)).toEqual({
      mode: "auto",
      label: "快速响应",
      profile_id: "responsive-chat-auto",
      profileId: "responsive-chat-auto",
      reason: "first-turn-plain-text",
      service_model_slot: "responsive_chat",
      routing_slot: "responsive_chat_model",
      routing_changed: false,
      resolver: "backend_service_model",
      runtime_status_presentation: "transient",
      model_reasoning_effort: "minimal",
      modelReasoningEffort: "minimal",
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

  it("快速响应路由应从结构化 profile 生成 metadata，避免散落硬编码", () => {
    const decision = resolveAgentFastResponseRouting({
      ...baseOptions,
      routingProfile: {
        id: "responsive-chat-debug",
        label: "Debug fast path",
        reasoningEffort: "low",
        resolver: "debug_resolver",
        routingChanged: true,
        routingSlot: "debug_routing_slot",
        runtimeStatusPresentation: "timeline",
        serviceModelSlot: "debug_service_slot",
      },
    });

    expect(decision).toMatchObject({
      enabled: true,
      label: "Debug fast path",
      profileId: "responsive-chat-debug",
      reasoningEffort: "low",
      resolver: "debug_resolver",
      routingChanged: true,
      routingSlot: "debug_routing_slot",
      runtimeStatusPresentation: "timeline",
      serviceModelSlot: "debug_service_slot",
    });
    expect(buildAgentFastResponseMetadata(decision)).toMatchObject({
      label: "Debug fast path",
      modelReasoningEffort: "low",
      model_reasoning_effort: "low",
      profile_id: "responsive-chat-debug",
      profileId: "responsive-chat-debug",
      resolver: "debug_resolver",
      routing_changed: true,
      routing_slot: "debug_routing_slot",
      runtime_status_presentation: "timeline",
      service_model_slot: "debug_service_slot",
    });
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
      sourceText: "请搜索最新 AI 新闻，并用一句话回答",
    });

    expect(decision.enabled).toBe(true);
    expect(decision.searchMode).toBe("allowed");
  });

  it("普通时效新闻整理不应靠前端文本黑名单退出快速响应候选", () => {
    const decision = resolveAgentFastResponseRouting({
      ...baseOptions,
      sourceText: "整理今天的国际新闻",
    });

    expect(decision.enabled).toBe(true);
    expect(decision.reason).toBe("first-turn-plain-text");
  });

  it("普通代码修复请求不应靠前端文本黑名单退出快速响应候选", () => {
    const decision = resolveAgentFastResponseRouting({
      ...baseOptions,
      sourceText: "请修复消息历史切换后图片卡片丢失的问题，并补一个回归测试",
    });

    expect(decision.enabled).toBe(true);
    expect(decision.reason).toBe("first-turn-plain-text");
  });

  it("只有显式 required 搜索模式才应禁用快速响应", () => {
    expect(
      resolveAgentFastResponseRouting({
        ...baseOptions,
        effectiveWebSearch: true,
        searchMode: "required",
        sourceText: "查一下今天的汇率，并用一句话回答",
      }).reason,
    ).toBe("heavy-capability-enabled");

    expect(
      resolveAgentFastResponseSearchMode({
        searchMode: "required",
        effectiveWebSearch: true,
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
    ).toBe("not-plain-first-turn-text");

    expect(
      resolveAgentFastResponseRouting({
        ...baseOptions,
        sourceText: "/image 生成一张图",
      }).reason,
    ).toBe("not-plain-first-turn-text");
  });
});
