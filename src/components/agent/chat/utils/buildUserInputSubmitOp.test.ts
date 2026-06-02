import { describe, expect, it } from "vitest";
import { buildUserInputSubmitOp } from "./buildUserInputSubmitOp";

describe("buildUserInputSubmitOp", () => {
  it("应构造最小 user_input op，并裁掉 steady-state 字段", () => {
    const op = buildUserInputSubmitOp({
      content: "继续生成社媒初稿",
      images: [
        {
          data: "base64-image",
          mediaType: "image/png",
        },
      ],
      sessionId: "session-social-1",
      eventName: "aster_stream_x",
      workspaceId: "workspace-1",
      turnId: "turn-1",
      systemPrompt: "system",
      queueIfBusy: true,
      requestMetadata: {
        harness: {
          preferences: {
            web_search: false,
            thinking: true,
          },
          theme: "general",
          session_mode: "general_workbench",
          gate_key: "write_mode",
          run_title: "社媒初稿",
          content_id: "content-social-1",
        },
      },
      executionRuntime: {
        session_id: "session-social-1",
        source: "runtime_snapshot",
        provider_selector: "openai",
        model_name: "gpt-4.1",
        execution_strategy: "react",
        recent_preferences: {
          webSearch: false,
          thinking: true,
          task: false,
          subagent: false,
        },
        recent_theme: "general",
        recent_session_mode: "general_workbench",
        recent_gate_key: "write_mode",
        recent_run_title: "社媒初稿",
        recent_content_id: "content-social-1",
      },
      syncedRecentPreferences: {
        webSearch: false,
        thinking: true,
        task: false,
        subagent: false,
      },
      syncedSessionModelPreference: {
        providerType: "openai",
        model: "gpt-4.1",
      },
      syncedExecutionStrategy: "react",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-4.1",
      webSearch: false,
      thinking: true,
    });

    expect(op).toEqual({
      type: "user_input",
      text: "继续生成社媒初稿",
      sessionId: "session-social-1",
      eventName: "aster_stream_x",
      workspaceId: "workspace-1",
      turnId: "turn-1",
      images: [
        {
          data: "base64-image",
          media_type: "image/png",
        },
      ],
      preferences: {
        providerPreference: undefined,
        modelPreference: undefined,
        thinking: undefined,
        approvalPolicy: "on-request",
        sandboxPolicy: "workspace-write",
        executionStrategy: undefined,
        webSearch: undefined,
        autoContinue: undefined,
      },
      systemPrompt: "system",
      metadata: undefined,
      queueIfBusy: true,
      skipPreSubmitResume: undefined,
    });
  });

  it("应保留尚未同步到 runtime 的显式偏好与 metadata", () => {
    const op = buildUserInputSubmitOp({
      content: "切到发布确认",
      images: [],
      sessionId: "session-social-1",
      eventName: "aster_stream_y",
      turnId: "turn-2",
      requestMetadata: {
        harness: {
          preferences: {
            thinking: true,
          },
          theme: "general",
          session_mode: "general_workbench",
          gate_key: "publish_confirm",
          run_title: "发布确认",
        },
      },
      executionRuntime: {
        session_id: "session-social-1",
        source: "runtime_snapshot",
        provider_selector: "openai",
        model_name: "gpt-4.1",
        execution_strategy: "react",
        recent_preferences: {
          webSearch: false,
          thinking: false,
          task: false,
          subagent: false,
        },
        recent_theme: "general",
        recent_session_mode: "general_workbench",
        recent_gate_key: "write_mode",
        recent_run_title: "社媒初稿",
      },
      syncedRecentPreferences: {
        webSearch: false,
        thinking: false,
        task: false,
        subagent: false,
      },
      syncedSessionModelPreference: {
        providerType: "openai",
        model: "gpt-4.1",
      },
      syncedExecutionStrategy: "react",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "full-access",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5",
      modelOverride: "gpt-5",
      webSearch: false,
      thinking: true,
      autoContinue: {
        enabled: true,
        fast_mode_enabled: false,
        continuation_length: 2,
        sensitivity: 0.5,
      },
    });

    expect(op.preferences).toEqual({
      providerPreference: undefined,
      modelPreference: "gpt-5",
      thinking: undefined,
      approvalPolicy: "never",
      sandboxPolicy: "danger-full-access",
      executionStrategy: undefined,
      webSearch: undefined,
      autoContinue: {
        enabled: true,
        fast_mode_enabled: false,
        continuation_length: 2,
        sensitivity: 0.5,
      },
    });
    expect(op.metadata).toEqual({
      harness: {
        gate_key: "publish_confirm",
        run_title: "发布确认",
      },
    });
  });

  it("provider 发生切换时应同时提交 provider/model 偏好", () => {
    const op = buildUserInputSubmitOp({
      content: "使用翻译服务模型",
      images: [],
      sessionId: "session-translation-1",
      eventName: "aster_stream_translation",
      executionRuntime: {
        session_id: "session-translation-1",
        source: "runtime_snapshot",
        provider_selector: "openai",
        model_name: "gpt-4.1",
        execution_strategy: "react",
        recent_preferences: {
          webSearch: false,
          thinking: false,
          task: false,
          subagent: false,
        },
      },
      syncedRecentPreferences: {
        webSearch: false,
        thinking: false,
        task: false,
        subagent: false,
      },
      syncedSessionModelPreference: {
        providerType: "openai",
        model: "gpt-4.1",
      },
      syncedExecutionStrategy: "react",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "translation-provider",
      effectiveModel: "translation-model",
      modelOverride: "translation-model",
      webSearch: false,
      thinking: false,
    });

    expect(op.preferences?.providerPreference).toBe("translation-provider");
    expect(op.preferences?.modelPreference).toBe("translation-model");
  });

  it("应透传首页首发的 submit 快路径标记", () => {
    const op = buildUserInputSubmitOp({
      content: "只回答一个字：好",
      images: [],
      sessionId: "session-fast-1",
      eventName: "aster_stream_fast",
      queueIfBusy: true,
      skipPreSubmitResume: true,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-chat",
    });

    expect(op.skipPreSubmitResume).toBe(true);
  });

  it("快速响应应只提交后端路由槽位，不提交当前前端 provider/model", () => {
    const op = buildUserInputSubmitOp({
      content: "只回答一个字：好",
      images: [],
      sessionId: "session-fast-routing-1",
      eventName: "aster_stream_fast_routing",
      requestMetadata: {
        harness: {
          fast_response_routing: {
            service_model_slot: "responsive_chat",
            routing_slot: "responsive_chat_model",
            resolver: "backend_service_model",
          },
          browser_assist: {
            enabled: true,
            profile_key: "general_browser_assist",
          },
        },
      },
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-v4-pro",
      webSearch: false,
      thinking: false,
    });

    expect(op.preferences?.providerPreference).toBeUndefined();
    expect(op.preferences?.modelPreference).toBeUndefined();
    expect(op.metadata).toEqual({
      harness: {
        fast_response_routing: {
          service_model_slot: "responsive_chat",
          routing_slot: "responsive_chat_model",
          resolver: "backend_service_model",
          fallback_provider_preference: "deepseek",
          fallback_model_preference: "deepseek-v4-pro",
        },
        browser_assist: {
          enabled: true,
          profile_key: "general_browser_assist",
        },
      },
    });
  });

  it("模型状态不完整时不应提交空 provider 或孤立 model 偏好", () => {
    const op = buildUserInputSubmitOp({
      content: "分析这个文件夹",
      images: [],
      sessionId: "session-partial-model",
      eventName: "aster_stream_partial_model",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "",
      effectiveModel: "gpt-5.5",
      webSearch: false,
      thinking: false,
    });

    expect(op.preferences?.providerPreference).toBeUndefined();
    expect(op.preferences?.modelPreference).toBeUndefined();
  });

  it("图片生成首发应把聊天编排模型放进 provider_config，避免误锁图片模型槽位", () => {
    const op = buildUserInputSubmitOp({
      content: "@Nanobanana Pro 生成一张广州塔春天照片",
      images: [],
      sessionId: "session-image-1",
      eventName: "aster_stream_image",
      requestMetadata: {
        harness: {
          image_skill_launch: {
            skill_name: "image_generate",
            image_task: {
              prompt: "一张广州塔春天照片",
              provider_id: "fal",
              model: "fal-ai/nano-banana-pro",
              runtime_contract: {
                contract_key: "image_generation",
                routing_slot: "image_generation_model",
              },
            },
          },
        },
      },
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-v4-pro",
      webSearch: false,
      thinking: false,
    });

    expect(op.preferences?.providerConfig).toEqual({
      provider_id: "deepseek",
      provider_name: "deepseek",
      model_name: "deepseek-v4-pro",
    });
    expect(op.preferences?.providerPreference).toBeUndefined();
    expect(op.preferences?.modelPreference).toBeUndefined();
  });

  it("应只透传显式搜索模式，不提交旧 webSearch 开关", () => {
    const op = buildUserInputSubmitOp({
      content: "请搜索最新 AI 新闻",
      images: [],
      sessionId: "session-search-1",
      eventName: "aster_stream_search",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-chat",
      webSearch: true,
      searchMode: "required",
    });

    expect(op.preferences?.webSearch).toBeUndefined();
    expect(op.preferences?.searchMode).toBe("required");
  });

  it("输入框自然语言新闻请求不应提交搜索、思考或旧执行策略选择", () => {
    const op = buildUserInputSubmitOp({
      content: "整理今天的国际新闻",
      images: [],
      sessionId: "session-news-1",
      eventName: "aster_stream_news",
      workspaceId: "workspace-news",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.5",
      webSearch: false,
      thinking: false,
    });

    expect(op.preferences?.webSearch).toBeUndefined();
    expect(op.preferences?.thinking).toBeUndefined();
    expect(op.preferences?.executionStrategy).toBeUndefined();
    expect(op.preferences?.searchMode).toBeUndefined();
    expect(op.metadata).toBeUndefined();
  });
});
