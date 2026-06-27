import { afterEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import type { Message } from "../types";
import {
  prepareAgentStreamUserInputSend,
  resolvePreparedSendExpectingQueue,
  type AgentStreamUserInputSendPreparationEnv,
} from "./agentStreamUserInputSendPreparation";
import type { ActiveStreamState } from "./agentStreamSubmissionLifecycle";

function createStateSetter<T>(getValue: () => T, setValue: (value: T) => void) {
  return (next: T | ((prev: T) => T)) => {
    setValue(
      typeof next === "function" ? (next as (prev: T) => T)(getValue()) : next,
    );
  };
}

describe("agentStreamUserInputSendPreparation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createEnv(options?: {
    sessionId?: string | null;
    activeStream?: ActiveStreamState | null;
    queuedTurnsCount?: number;
    threadBusy?: boolean;
    providerType?: string;
    model?: string;
    reasoningEffort?: string;
  }): AgentStreamUserInputSendPreparationEnv {
    let messages: Message[] = [];
    let isSending = false;

    return {
      executionStrategy: "react",
      providerTypeRef: {
        current: options?.providerType ?? "openai",
      } as MutableRefObject<string>,
      modelRef: {
        current: options?.model ?? "gpt-5.4",
      } as MutableRefObject<string>,
      reasoningEffortRef: {
        current: options?.reasoningEffort ?? "",
      } as MutableRefObject<string>,
      sessionIdRef: {
        current: options?.sessionId ?? "session-1",
      } as MutableRefObject<string | null>,
      clawTraceEnabled: false,
      getWorkspaceIdForSubmit: () => "workspace-1",
      activeStreamRef: {
        current: options?.activeStream ?? null,
      } as MutableRefObject<ActiveStreamState | null>,
      getQueuedTurnsCount: () => options?.queuedTurnsCount ?? 0,
      isThreadBusy: () => options?.threadBusy ?? false,
      hasPendingPreparedSubmit: () => false,
      getSyncedSessionModelPreference: () => ({
        providerType: "openai",
        model: "gpt-5.4",
      }),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setIsSending: createStateSetter(
        () => isSending,
        (value) => {
          isSending = value;
        },
      ),
    };
  }

  it("同一会话仅残留 active stream 且 read model 已无活跃工作时不应进入 queue 模式", () => {
    expect(
      resolvePreparedSendExpectingQueue({
        activeStreamSessionId: "session-1",
        currentSessionId: "session-1",
        queuedTurnsCount: 0,
        threadBusy: false,
        pendingPreparedSubmit: false,
      }),
    ).toBe(false);
  });

  it("跨会话 active stream、真实 queued turn、busy read model 或 pending submit 仍应进入 queue 模式", () => {
    const base = {
      activeStreamSessionId: "session-1",
      currentSessionId: "session-1",
      queuedTurnsCount: 0,
      threadBusy: false,
      pendingPreparedSubmit: false,
    };

    expect(
      resolvePreparedSendExpectingQueue({
        ...base,
        activeStreamSessionId: "session-other",
      }),
    ).toBe(true);
    expect(
      resolvePreparedSendExpectingQueue({
        ...base,
        queuedTurnsCount: 1,
      }),
    ).toBe(true);
    expect(
      resolvePreparedSendExpectingQueue({
        ...base,
        threadBusy: true,
      }),
    ).toBe(true);
    expect(
      resolvePreparedSendExpectingQueue({
        ...base,
        pendingPreparedSubmit: true,
      }),
    ).toBe(true);
  });

  it("应归一化发送参数并注入 draft", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000001")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000002");

    let messages: Message[] = [];
    let isSending = false;
    const env = {
      ...createEnv(),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setIsSending: createStateSetter(
        () => isSending,
        (value) => {
          isSending = value;
        },
      ),
    };

    const result = prepareAgentStreamUserInputSend({
      content: "继续生成提纲",
      images: [],
      webSearch: true,
      thinking: true,
      skipUserMessage: false,
      options: {
        requestMetadata: { source: "test" },
      },
      env,
    });

    expect(result.effectiveExecutionStrategy).toBe("react");
    expect(result.effectiveProviderType).toBe("openai");
    expect(result.effectiveModel).toBe("gpt-5.4");
    expect(result.syncedSessionModelPreference).toEqual({
      providerType: "openai",
      model: "gpt-5.4",
    });
    expect(result.expectingQueue).toBe(false);
    expect(result.assistantMsgId).toBe("00000000-0000-0000-0000-000000000001");
    expect(result.userMsgId).toBe("00000000-0000-0000-0000-000000000002");
    expect(messages).toHaveLength(2);
    expect(isSending).toBe(true);
  });

  it("开启 Claw Trace 时应在发送准备阶段补齐 trace metadata", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000201")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000202")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000203")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000204")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000205")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000206")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000207");

    const result = prepareAgentStreamUserInputSend({
      content: "追踪首字延迟",
      images: [],
      skipUserMessage: false,
      options: {
        requestMetadata: { source: "test" },
      },
      env: {
        ...createEnv({ sessionId: "session-trace" }),
        clawTraceEnabled: true,
      },
    });

    expect(result.requestMetadata).toMatchObject({
      source: "test",
      agentUiPerformanceTrace: expect.objectContaining({
        requestId: expect.stringMatching(/^claw_request_/),
        runId: expect.stringMatching(/^claw_run_/),
        sessionId: "session-trace",
        source: "agent-chat",
        traceId: expect.stringMatching(/^claw_trace_/),
        workspaceId: "workspace-1",
        w3cTraceContext: expect.objectContaining({
          traceparent: expect.stringMatching(
            /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
          ),
          traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
        }),
      }),
    });
  });

  it("displayContent 应透传给用户消息草稿", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000101")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000102");

    let messages: Message[] = [];
    let isSending = false;
    const env = {
      ...createEnv(),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setIsSending: createStateSetter(
        () => isSending,
        (value) => {
          isSending = value;
        },
      ),
    };

    prepareAgentStreamUserInputSend({
      content: "/image_generate 生成 春日咖啡馆插画",
      images: [],
      skipUserMessage: false,
      options: {
        displayContent: "@配图 生成 春日咖啡馆插画",
      },
      env,
    });

    expect(messages[0]).toMatchObject({
      id: "00000000-0000-0000-0000-000000000102",
      role: "user",
      content: "@配图 生成 春日咖啡馆插画",
    });
    expect(isSending).toBe(true);
  });

  it("跨会话 active stream 时应进入 queue 模式，归一 legacy 策略并允许 model override", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
      "00000000-0000-0000-0000-000000000003",
    );

    let messages: Message[] = [];
    let isSending = false;
    const env = {
      ...createEnv({
        sessionId: "session-current",
        activeStream: {
          assistantMsgId: "assistant-queued",
          eventName: "event-queued",
          sessionId: "session-queued",
        },
        providerType: "claude",
        model: "sonnet",
      }),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setIsSending: createStateSetter(
        () => isSending,
        (value) => {
          isSending = value;
        },
      ),
      getSyncedSessionModelPreference: () => null,
    };

    const result = prepareAgentStreamUserInputSend({
      content: "继续生成提纲",
      images: [],
      skipUserMessage: true,
      executionStrategyOverride: "react",
      modelOverride: "opus",
      options: {
        assistantDraft: {
          content: "队列中",
        },
      },
      env,
    });

    expect(result.effectiveExecutionStrategy).toBe("react");
    expect(result.effectiveProviderType).toBe("claude");
    expect(result.effectiveModel).toBe("opus");
    expect(result.syncedSessionModelPreference).toBeNull();
    expect(result.expectingQueue).toBe(true);
    expect(result.userMsgId).toBeNull();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("队列中");
    expect(isSending).toBe(false);
  });

  it("同一会话 stale active stream 不应让下一轮误入队列", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000011")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000012");

    let messages: Message[] = [];
    let isSending = false;
    const env = {
      ...createEnv({
        sessionId: "session-stale",
        activeStream: {
          assistantMsgId: "assistant-stale",
          eventName: "event-stale",
          sessionId: "session-stale",
        },
      }),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setIsSending: createStateSetter(
        () => isSending,
        (value) => {
          isSending = value;
        },
      ),
    };

    const result = prepareAgentStreamUserInputSend({
      content: "继续生成提纲",
      images: [],
      skipUserMessage: false,
      env,
    });

    expect(result.expectingQueue).toBe(false);
    expect(messages).toHaveLength(2);
    expect(isSending).toBe(true);
  });

  it("应优先使用 options 里的 provider/model override", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000008")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000009");

    let messages: Message[] = [];
    let isSending = false;
    const env = {
      ...createEnv({
        providerType: "openai",
        model: "gpt-5.4-mini",
      }),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setIsSending: createStateSetter(
        () => isSending,
        (value) => {
          isSending = value;
        },
      ),
    };

    const result = prepareAgentStreamUserInputSend({
      content: "改成翻译链路",
      images: [],
      skipUserMessage: false,
      options: {
        providerOverride: "translation-provider",
        modelOverride: "translation-model",
      },
      env,
    });

    expect(result.effectiveProviderType).toBe("translation-provider");
    expect(result.effectiveModel).toBe("translation-model");
    expect(result.modelOverride).toBe("translation-model");
    expect(messages).toHaveLength(2);
    expect(isSending).toBe(true);
  });

  it("应允许单次发送覆盖系统提示词", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000108")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000109");

    const result = prepareAgentStreamUserInputSend({
      content: "请快速回答",
      images: [],
      skipUserMessage: false,
      systemPrompt: "默认系统提示",
      options: {
        systemPromptOverride: "快速响应系统提示",
      },
      env: createEnv(),
    });

    expect(result.systemPrompt).toBe("快速响应系统提示");
  });

  it("快速响应元数据应透传首字前轻量状态展示策略", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000118")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000119");

    const result = prepareAgentStreamUserInputSend({
      content: "只回答 OK",
      images: [],
      skipUserMessage: false,
      options: {
        requestMetadata: {
          harness: {
            fast_response_routing: {
              mode: "auto",
              runtime_status_presentation: "transient",
            },
          },
        },
      },
      env: createEnv(),
    });

    expect(result.runtimeStatusPresentation).toBe("transient");
  });

  it("Skill launch metadata 应标记助手草稿保留内联过程", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000128")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000129");

    let messages: Message[] = [];
    const env = {
      ...createEnv(),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
    };

    const result = prepareAgentStreamUserInputSend({
      content: "开始执行品牌知识库 Skill",
      images: [],
      skipUserMessage: false,
      options: {
        requestMetadata: {
          harness: {
            service_scene_launch: {
              kind: "local_service_skill",
              service_scene_run: {
                skill_id: "brand-product-knowledge-builder",
              },
            },
          },
        },
      },
      env,
    });

    expect(result.assistantMsg.inlineProcessRetention).toBe("skill");
    expect(messages[1]?.inlineProcessRetention).toBe("skill");
  });

  it("恢复态 thread 仍忙时也应直接进入 queue 模式", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000004")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000005");

    let messages: Message[] = [];
    let isSending = false;
    const env = {
      ...createEnv({
        threadBusy: true,
      }),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setIsSending: createStateSetter(
        () => isSending,
        (value) => {
          isSending = value;
        },
      ),
    };

    const result = prepareAgentStreamUserInputSend({
      content: "继续分析这个项目",
      images: [],
      skipUserMessage: false,
      env,
    });

    expect(result.expectingQueue).toBe(true);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.runtimeStatus?.title).toBe("已加入排队列表");
    expect(isSending).toBe(false);
  });

  it("首轮 submit 尚未完成时也应提前进入 queue 模式", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000006")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000007");

    let messages: Message[] = [];
    let isSending = false;
    const env = {
      ...createEnv({
        sessionId: null,
      }),
      hasPendingPreparedSubmit: () => true,
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setIsSending: createStateSetter(
        () => isSending,
        (value) => {
          isSending = value;
        },
      ),
    };

    const result = prepareAgentStreamUserInputSend({
      content: "继续处理首页首轮提交",
      images: [],
      skipUserMessage: false,
      env,
    });

    expect(result.expectingQueue).toBe(true);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.runtimeStatus?.title).toBe("已加入排队列表");
    expect(isSending).toBe(false);
  });
});
