import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SendMessageFn } from "./agentChatShared";
import { createAgentChatSendMessage } from "./agentChatSendMessage";
import { listSlashEntryUsage } from "../skill-selection/slashEntryUsage";
import type { ModelCapabilitySummary } from "@/lib/model/inferModelCapabilities";

type CreateSendMessageOptions = Parameters<
  typeof createAgentChatSendMessage
>[0];

beforeEach(() => {
  window.localStorage.clear();
});

const textAndImageModelCapabilitySummary: ModelCapabilitySummary = {
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
  output_modalities: ["text"],
  runtime_features: ["streaming", "tool_calling"],
  supports_tools: true,
  supports_reasoning: false,
  supports_prompt_cache: false,
  supports_media_input: true,
  supports_media_output: false,
  context_length: 128000,
  max_output_tokens: 4096,
};

function createTestAgentChatSendMessage(
  options: CreateSendMessageOptions,
): SendMessageFn {
  return createAgentChatSendMessage({
    resolveModelCapabilitySummary: vi.fn(async () => null),
    ...options,
  });
}

describe("createAgentChatSendMessage", () => {
  it("普通消息应直接透传到 rawSendMessage", async () => {
    const rawSendMessage = vi.fn<SendMessageFn>(async () => undefined);
    const sendMessage = createTestAgentChatSendMessage({
      baseStatusSnapshot: {
        sessionId: "session-1",
        currentTurnId: "turn-1",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
        queuedTurnsCount: 0,
        isSending: false,
      },
      rawSendMessage,
      compactSession: vi.fn(async () => undefined),
      clearMessages: vi.fn(),
      createFreshSession: vi.fn(async () => null),
      appendAssistantMessage: vi.fn(),
      notifyInfo: vi.fn(),
      notifySuccess: vi.fn(),
    });

    await sendMessage("继续执行", [], false, false, false, "react", "gpt-5.4");

    expect(rawSendMessage).toHaveBeenCalledTimes(1);
    expect(rawSendMessage).toHaveBeenCalledWith(
      "继续执行",
      [],
      false,
      false,
      false,
      "react",
      "gpt-5.4",
      undefined,
      undefined,
    );
  });

  it("普通消息应从当前 picker provider/model 注入模型能力摘要", async () => {
    const rawSendMessage = vi.fn<SendMessageFn>(async () => undefined);
    const resolveModelCapabilitySummary = vi.fn(
      async () => textAndImageModelCapabilitySummary,
    );
    const sendMessage = createTestAgentChatSendMessage({
      baseStatusSnapshot: {
        sessionId: "session-1",
        currentTurnId: "turn-1",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
        queuedTurnsCount: 0,
        isSending: false,
      },
      rawSendMessage,
      compactSession: vi.fn(async () => undefined),
      clearMessages: vi.fn(),
      createFreshSession: vi.fn(async () => null),
      appendAssistantMessage: vi.fn(),
      notifyInfo: vi.fn(),
      notifySuccess: vi.fn(),
      resolveModelCapabilitySummary,
    });

    await sendMessage("分析这张图", [], false, false, false, "react", "gpt-5.4");

    expect(resolveModelCapabilitySummary).toHaveBeenCalledWith({
      providerType: "openai",
      model: "gpt-5.4",
    });
    expect(rawSendMessage.mock.calls[0]?.[8]).toEqual({
      modelCapabilitySummary: textAndImageModelCapabilitySummary,
    });
  });

  it("显式传入模型能力摘要时不应再用 picker 选择覆盖", async () => {
    const rawSendMessage = vi.fn<SendMessageFn>(async () => undefined);
    const resolveModelCapabilitySummary = vi.fn(
      async () => textAndImageModelCapabilitySummary,
    );
    const sendOptions = {
      requestMetadata: { source: "test" },
      modelCapabilitySummary: null,
    };
    const sendMessage = createTestAgentChatSendMessage({
      baseStatusSnapshot: {
        sessionId: "session-1",
        currentTurnId: "turn-1",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
        queuedTurnsCount: 0,
        isSending: false,
      },
      rawSendMessage,
      compactSession: vi.fn(async () => undefined),
      clearMessages: vi.fn(),
      createFreshSession: vi.fn(async () => null),
      appendAssistantMessage: vi.fn(),
      notifyInfo: vi.fn(),
      notifySuccess: vi.fn(),
      resolveModelCapabilitySummary,
    });

    await sendMessage(
      "继续执行",
      [],
      false,
      false,
      false,
      "react",
      "gpt-5.4",
      undefined,
      sendOptions,
    );

    expect(resolveModelCapabilitySummary).not.toHaveBeenCalled();
    expect(rawSendMessage.mock.calls[0]?.[8]).toBe(sendOptions);
  });

  it("发送选项中的 provider/model override 应作为能力摘要解析选择", async () => {
    const rawSendMessage = vi.fn<SendMessageFn>(async () => undefined);
    const resolveModelCapabilitySummary = vi.fn(
      async () => textAndImageModelCapabilitySummary,
    );
    const sendMessage = createTestAgentChatSendMessage({
      baseStatusSnapshot: {
        sessionId: "session-1",
        currentTurnId: "turn-1",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
        queuedTurnsCount: 0,
        isSending: false,
      },
      rawSendMessage,
      compactSession: vi.fn(async () => undefined),
      clearMessages: vi.fn(),
      createFreshSession: vi.fn(async () => null),
      appendAssistantMessage: vi.fn(),
      notifyInfo: vi.fn(),
      notifySuccess: vi.fn(),
      resolveModelCapabilitySummary,
    });

    await sendMessage(
      "翻译这段内容",
      [],
      false,
      false,
      false,
      "react",
      "ignored-positional-model",
      undefined,
      {
        providerOverride: "translation-provider",
        modelOverride: "translation-model",
      },
    );

    expect(resolveModelCapabilitySummary).toHaveBeenCalledWith({
      providerType: "translation-provider",
      model: "translation-model",
    });
    expect(rawSendMessage.mock.calls[0]?.[8]).toEqual({
      providerOverride: "translation-provider",
      modelOverride: "translation-model",
      modelCapabilitySummary: textAndImageModelCapabilitySummary,
    });
  });

  it("命中本地 slash 命令时应跳过 rawSendMessage", async () => {
    const rawSendMessage = vi.fn<SendMessageFn>(async () => undefined);
    const appendAssistantMessage = vi.fn();
    const sendMessage = createTestAgentChatSendMessage({
      baseStatusSnapshot: {
        sessionId: "session-status",
        currentTurnId: "turn-status",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
        queuedTurnsCount: 2,
        isSending: false,
      },
      rawSendMessage,
      compactSession: vi.fn(async () => undefined),
      clearMessages: vi.fn(),
      createFreshSession: vi.fn(async () => null),
      appendAssistantMessage,
      notifyInfo: vi.fn(),
      notifySuccess: vi.fn(),
    });

    await sendMessage("/status", [], false, false, false, "react", "gpt-5.4");

    expect(rawSendMessage).not.toHaveBeenCalled();
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining("当前会话状态："),
    );
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining("gpt-5.4"),
    );
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining("对话执行"),
    );
    expect(listSlashEntryUsage()).toEqual([
      expect.objectContaining({
        kind: "command",
        entryId: "status",
      }),
    ]);
  });

  it("命中 prompt slash 命令时应转换 prompt 后透传", async () => {
    const rawSendMessage = vi.fn<SendMessageFn>(async () => undefined);
    const sendMessage = createTestAgentChatSendMessage({
      baseStatusSnapshot: {
        sessionId: "session-review",
        currentTurnId: "turn-review",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
        queuedTurnsCount: 0,
        isSending: false,
      },
      rawSendMessage,
      compactSession: vi.fn(async () => undefined),
      clearMessages: vi.fn(),
      createFreshSession: vi.fn(async () => null),
      appendAssistantMessage: vi.fn(),
      notifyInfo: vi.fn(),
      notifySuccess: vi.fn(),
    });

    await sendMessage("/review lime-rs", [], false, false, false);

    expect(rawSendMessage).toHaveBeenCalledTimes(1);
    expect(rawSendMessage.mock.calls[0]?.[0]).toContain(
      "请对以下对象进行代码审查",
    );
    expect(rawSendMessage.mock.calls[0]?.[0]).toContain("lime-rs");
    expect(listSlashEntryUsage()).toEqual([
      expect.objectContaining({
        kind: "command",
        entryId: "review",
        replayText: "lime-rs",
      }),
    ]);
  });

  it("命中 /subagents 时应打开 Subagents 面板并跳过 rawSendMessage", async () => {
    const rawSendMessage = vi.fn<SendMessageFn>(async () => undefined);
    const onOpenSubagents = vi.fn();
    const sendMessage = createTestAgentChatSendMessage({
      baseStatusSnapshot: {
        sessionId: "session-subagents",
        currentTurnId: "turn-subagents",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
        queuedTurnsCount: 0,
        isSending: false,
      },
      rawSendMessage,
      compactSession: vi.fn(async () => undefined),
      clearMessages: vi.fn(),
      createFreshSession: vi.fn(async () => null),
      appendAssistantMessage: vi.fn(),
      notifyInfo: vi.fn(),
      notifySuccess: vi.fn(),
      onOpenSubagents,
    });

    await sendMessage("/subagents", [], false, false, false);

    expect(rawSendMessage).not.toHaveBeenCalled();
    expect(onOpenSubagents).toHaveBeenCalledTimes(1);
    expect(listSlashEntryUsage()).toEqual([
      expect.objectContaining({
        kind: "command",
        entryId: "subagents",
      }),
    ]);
  });

  it("命中 /agent alias 时也应打开 Subagents 面板", async () => {
    const rawSendMessage = vi.fn<SendMessageFn>(async () => undefined);
    const onOpenSubagents = vi.fn();
    const sendMessage = createTestAgentChatSendMessage({
      baseStatusSnapshot: {
        sessionId: "session-agent-alias",
        currentTurnId: "turn-agent-alias",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
        queuedTurnsCount: 0,
        isSending: false,
      },
      rawSendMessage,
      compactSession: vi.fn(async () => undefined),
      clearMessages: vi.fn(),
      createFreshSession: vi.fn(async () => null),
      appendAssistantMessage: vi.fn(),
      notifyInfo: vi.fn(),
      notifySuccess: vi.fn(),
      onOpenSubagents,
    });

    await sendMessage("/agent", [], false, false, false);

    expect(rawSendMessage).not.toHaveBeenCalled();
    expect(onOpenSubagents).toHaveBeenCalledTimes(1);
    expect(listSlashEntryUsage()).toEqual([
      expect.objectContaining({
        kind: "command",
        entryId: "subagents",
      }),
    ]);
  });

  it("skipUserMessage 为 true 时应绕过 slash 分流", async () => {
    const rawSendMessage = vi.fn<SendMessageFn>(async () => undefined);
    const appendAssistantMessage = vi.fn();
    const sendMessage = createTestAgentChatSendMessage({
      baseStatusSnapshot: {
        sessionId: "session-skip",
        currentTurnId: "turn-skip",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
        queuedTurnsCount: 0,
        isSending: false,
      },
      rawSendMessage,
      compactSession: vi.fn(async () => undefined),
      clearMessages: vi.fn(),
      createFreshSession: vi.fn(async () => null),
      appendAssistantMessage,
      notifyInfo: vi.fn(),
      notifySuccess: vi.fn(),
    });

    await sendMessage("/status", [], false, false, true);

    expect(rawSendMessage).toHaveBeenCalledTimes(1);
    expect(rawSendMessage).toHaveBeenCalledWith(
      "/status",
      [],
      false,
      false,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(appendAssistantMessage).not.toHaveBeenCalled();
  });
});
