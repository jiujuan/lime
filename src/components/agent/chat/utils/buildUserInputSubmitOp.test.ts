import { describe, expect, it } from "vitest";
import { createSubmitTurnRequestFromAgentOp } from "@/lib/api/agentProtocol";
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

  it("应迁移尚未同步到 runtime 的显式偏好并保留其他 metadata", () => {
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
          task: false,
          subagent: false,
        },
        recent_theme: "general",
        recent_session_mode: "general_workbench",
        recent_gate_key: "write_mode",
        recent_run_title: "社媒初稿",
      },
      syncedRecentPreferences: {
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
      thinking: true,
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
    const request = createSubmitTurnRequestFromAgentOp(op);
    expect(request.turn_config?.thinking_enabled).toBe(true);
    expect(request.turn_config?.metadata).toEqual({
      harness: {
        gate_key: "publish_confirm",
        run_title: "发布确认",
      },
    });
  });

  it("中途切换模型但会话尚未同步时应在 submit payload 带上当前模型", () => {
    const op = buildUserInputSubmitOp({
      content: "继续",
      images: [],
      sessionId: "session-model-pending",
      eventName: "aster_stream_model_pending",
      executionRuntime: {
        session_id: "session-model-pending",
        source: "runtime_snapshot",
        provider_selector: "deepseek",
        model_name: "deepseek-v4-flash",
        execution_strategy: "react",
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-v4-flash",
    });

    expect(op.preferences?.providerPreference).toBe("deepseek");
    expect(op.preferences?.modelPreference).toBe("deepseek-v4-flash");
  });

  it("App Server current turn/start 投影应携带完整 provider/model 偏好", () => {
    const op = buildUserInputSubmitOp({
      content: "继续",
      images: [],
      sessionId: "session-app-server-current",
      eventName: "aster_stream_app_server_current",
      workspaceId: "workspace-current",
      turnId: "turn-current-1",
      executionRuntime: {
        session_id: "session-app-server-current",
        source: "runtime_snapshot",
        provider_selector: "openai",
        model_name: "gpt-4.1",
        execution_strategy: "react",
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: "react",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "full-access",
      effectiveProviderType: "custom-provider",
      effectiveModel: "mimo-v2.5-pro",
    });

    const request = createSubmitTurnRequestFromAgentOp(op);

    expect(request.turn_config?.provider_preference).toBe("custom-provider");
    expect(request.turn_config?.model_preference).toBe("mimo-v2.5-pro");
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
          task: false,
          subagent: false,
        },
      },
      syncedRecentPreferences: {
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
    });

    expect(op.preferences?.providerPreference).toBeUndefined();
    expect(op.preferences?.modelPreference).toBeUndefined();
  });

  it("图片生成首发应提交聊天编排模型，避免 presentation 路由缺失或误锁图片模型槽位", () => {
    const op = buildUserInputSubmitOp({
      content: "@Nanobanana Pro 生成一张广州塔春天照片",
      images: [],
      sessionId: "session-image-1",
      eventName: "aster_stream_image",
      requestMetadata: {
        harness: {
          image_command_intent: {
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
    });

    expect(op.preferences?.providerConfig).toEqual({
      provider_id: "deepseek",
      provider_name: "deepseek",
      model_name: "deepseek-v4-pro",
    });
    expect(op.preferences?.providerPreference).toBe("deepseek");
    expect(op.preferences?.modelPreference).toBe("deepseek-v4-pro");

    const request = createSubmitTurnRequestFromAgentOp(op);
    expect(request.turn_config?.provider_preference).toBe("deepseek");
    expect(request.turn_config?.model_preference).toBe("deepseek-v4-pro");
    expect(request.turn_config?.metadata).toMatchObject({
      harness: {
        image_command_intent: {
          image_task: {
            provider_id: "fal",
            model: "fal-ai/nano-banana-pro",
          },
        },
      },
    });
  });

  it("图片生成命令已同步会话模型时仍应保留编排 provider_config", () => {
    const op = buildUserInputSubmitOp({
      content: "@Nanobanana Pro 生成一张广州塔春天照片",
      images: [],
      sessionId: "session-image-2",
      eventName: "aster_stream_image_synced",
      requestMetadata: {
        harness: {
          image_command_intent: {
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
      executionRuntime: {
        session_id: "session-image-2",
        source: "runtime_snapshot",
        provider_selector: "deepseek",
        model_name: "deepseek-v4-pro",
        execution_strategy: "react",
      },
      syncedRecentPreferences: null,
      syncedSessionModelPreference: {
        providerType: "deepseek",
        model: "deepseek-v4-pro",
      },
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-v4-pro",
    });

    expect(op.preferences?.providerConfig).toEqual({
      provider_id: "deepseek",
      provider_name: "deepseek",
      model_name: "deepseek-v4-pro",
    });
    expect(op.preferences?.providerPreference).toBeUndefined();
    expect(op.preferences?.modelPreference).toBeUndefined();

    const request = createSubmitTurnRequestFromAgentOp(op);
    expect(request.turn_config?.provider_config).toEqual({
      provider_id: "deepseek",
      provider_name: "deepseek",
      model_name: "deepseek-v4-pro",
    });
    expect(request.turn_config?.provider_preference).toBeUndefined();
    expect(request.turn_config?.model_preference).toBeUndefined();
  });

  it("图片生成命令当前有效模型为图片通道时应退回会话文本模型编排", () => {
    const op = buildUserInputSubmitOp({
      content: "@Agnes Image 2.1 Flash 生成一张广州夏天照片",
      images: [],
      sessionId: "session-image-agnes",
      eventName: "aster_stream_image_agnes",
      requestMetadata: {
        harness: {
          image_command_intent: {
            image_task: {
              prompt: "一张广州夏天照片",
              provider_id: "agnes",
              model: "agnes-image-2.1-flash",
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
      syncedSessionModelPreference: {
        providerType: "deepseek",
        model: "deepseek-v4-pro",
      },
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "agnes",
      effectiveModel: "agnes-image-2.1-flash",
    });

    expect(op.preferences?.providerConfig).toEqual({
      provider_id: "deepseek",
      provider_name: "deepseek",
      model_name: "deepseek-v4-pro",
    });
    expect(op.preferences?.providerPreference).toBeUndefined();
    expect(op.preferences?.modelPreference).toBeUndefined();

    const request = createSubmitTurnRequestFromAgentOp(op);
    expect(request.turn_config?.provider_config).toEqual({
      provider_id: "deepseek",
      provider_name: "deepseek",
      model_name: "deepseek-v4-pro",
    });
    expect(request.turn_config?.provider_preference).toBeUndefined();
    expect(request.turn_config?.model_preference).toBeUndefined();
  });

  it("图片生成命令没有文本模型候选时不应提交图片 provider 作为编排模型", () => {
    const op = buildUserInputSubmitOp({
      content: "@Agnes Image 2.1 Flash 生成一张广州夏天照片",
      images: [],
      sessionId: "session-image-no-text-model",
      eventName: "aster_stream_image_no_text",
      requestMetadata: {
        harness: {
          image_command_intent: {
            image_task: {
              prompt: "一张广州夏天照片",
              provider_id: "agnes",
              model: "agnes-image-2.1-flash",
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
      effectiveProviderType: "agnes",
      effectiveModel: "agnes-image-2.1-flash",
    });

    expect(op.preferences?.providerConfig).toBeUndefined();
    expect(op.preferences?.providerPreference).toBeUndefined();
    expect(op.preferences?.modelPreference).toBeUndefined();

    const request = createSubmitTurnRequestFromAgentOp(op);
    expect(request.turn_config?.provider_config).toBeUndefined();
    expect(request.turn_config?.provider_preference).toBeUndefined();
    expect(request.turn_config?.model_preference).toBeUndefined();
  });

  it("应同时透传显式搜索开关和搜索模式到 turn_config", () => {
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
      explicitToolPreferences: true,
    });

    expect(op.preferences?.webSearch).toBe(true);
    expect(op.preferences?.searchMode).toBe("required");
    const request = createSubmitTurnRequestFromAgentOp(op);
    expect(request.turn_config?.web_search).toBe(true);
    expect(request.turn_config?.search_mode).toBe("required");
  });

  it("应把输入框推理强度透传到 App Server turn_config", () => {
    const op = buildUserInputSubmitOp({
      content: "先深入推理再给出实施计划",
      images: [],
      sessionId: "session-reasoning-effort-1",
      eventName: "aster_stream_reasoning_effort",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.5",
      reasoningEffort: " high ",
    });

    expect(op.preferences?.reasoningEffort).toBe("high");

    const request = createSubmitTurnRequestFromAgentOp(op);

    expect(request.turn_config?.reasoning_effort).toBe("high");
  });

  it("应把未同步的显式搜索和思考开关迁移到 App Server turn_config", () => {
    const op = buildUserInputSubmitOp({
      content: "搜索并深度分析今天的 AI 新闻",
      images: [],
      sessionId: "session-search-thinking-1",
      eventName: "aster_stream_search_thinking",
      workspaceId: "workspace-search-thinking",
      requestMetadata: {
        harness: {
          preferences: {
            web_search: true,
            thinking: true,
          },
        },
      },
      executionRuntime: {
        session_id: "session-search-thinking-1",
        source: "runtime_snapshot",
        recent_preferences: {
          task: false,
          subagent: false,
        },
      },
      syncedRecentPreferences: {
        task: false,
        subagent: false,
      },
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: "react",
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.5",
      webSearch: true,
      thinking: true,
      explicitToolPreferences: true,
    });

    expect(op.preferences?.webSearch).toBe(true);
    expect(op.preferences?.thinking).toBe(true);
    expect(op.metadata).toBeUndefined();

    const request = createSubmitTurnRequestFromAgentOp(op);

    expect(request.turn_config?.web_search).toBe(true);
    expect(request.turn_config?.thinking_enabled).toBe(true);
    expect(request.turn_config?.metadata).toBeUndefined();
  });

  it("应把旧 metadata 显式偏好迁移到 turn_config 并清理旧承载", () => {
    const op = buildUserInputSubmitOp({
      content: "启用搜索和思考",
      images: [],
      sessionId: "session-legacy-prefs-1",
      eventName: "aster_stream_legacy_prefs",
      requestMetadata: {
        harness: {
          preferences: {
            webSearchEnabled: true,
            thinkingEnabled: true,
          },
          turn_purpose: "content_review",
        },
      },
      executionRuntime: null,
      syncedRecentPreferences: null,
      syncedSessionModelPreference: null,
      syncedExecutionStrategy: null,
      effectiveExecutionStrategy: "react",
      effectiveAccessMode: "current",
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.5",
    });

    const request = createSubmitTurnRequestFromAgentOp(op);

    expect(request.turn_config?.web_search).toBe(true);
    expect(request.turn_config?.thinking_enabled).toBe(true);
    expect(request.turn_config?.metadata).toEqual({
      harness: {
        turn_purpose: "content_review",
      },
    });
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
    });

    expect(op.preferences?.webSearch).toBeUndefined();
    expect(op.preferences?.thinking).toBeUndefined();
    expect(op.preferences?.executionStrategy).toBeUndefined();
    expect(op.preferences?.searchMode).toBeUndefined();
    expect(op.metadata).toBeUndefined();

    const request = createSubmitTurnRequestFromAgentOp(op);

    expect(request.turn_config?.web_search).toBeUndefined();
    expect(request.turn_config?.search_mode).toBeUndefined();
  });
});
