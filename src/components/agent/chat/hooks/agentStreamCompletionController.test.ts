import { describe, expect, it } from "vitest";
import { limeI18nResources } from "@/i18n/createI18n";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import type { Message } from "../types";
import {
  AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
  buildAgentStreamCompletedAssistantMessagePatch,
  buildAgentStreamEmptyFinalErrorPlan,
  buildAgentStreamFinalDonePlan,
  buildAgentStreamMissingFinalReplyFailurePlan,
  buildAgentStreamMissingFinalReplyFailureSideEffectPlan,
  isAgentStreamEmptyFinalReplyError,
  reconcileAgentStreamFinalContentParts,
  resolveAgentStreamCompletedVisibleContent,
  resolveAgentStreamGracefulCompletionContent,
  shouldFailAgentStreamMissingFinalReply,
} from "./agentStreamCompletionController";

describe("agentStreamCompletionController", () => {
  it("空 final 文案应覆盖所有 current locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(limeI18nResources[locale].agent).toHaveProperty(
        "agentChat.emptyFinalReply.errorMessage",
      );
      expect(limeI18nResources[locale].agent).toHaveProperty(
        "agentChat.emptyFinalReply.fallbackContent",
      );
    }
  });

  it("应识别空最终回复错误", () => {
    expect(
      isAgentStreamEmptyFinalReplyError(
        `runtime error: ${AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE}`,
      ),
    ).toBe(true);
    expect(
      isAgentStreamEmptyFinalReplyError(
        "The model did not produce a final response. Try again.",
      ),
    ).toBe(true);
    expect(isAgentStreamEmptyFinalReplyError("普通错误")).toBe(false);
  });

  it("应判断空最终回复是否需要失败", () => {
    expect(
      shouldFailAgentStreamMissingFinalReply({
        accumulatedContent: "",
      }),
    ).toBe(true);
    expect(
      shouldFailAgentStreamMissingFinalReply({
        accumulatedContent: "<tool_call></tool_call>",
      }),
    ).toBe(true);
    expect(
      shouldFailAgentStreamMissingFinalReply({
        accumulatedContent: "<tool_call></tool_call>",
        hasMeaningfulCompletionSignal: true,
      }),
    ).toBe(false);
    expect(
      shouldFailAgentStreamMissingFinalReply({
        accumulatedContent: "最终答复",
        hasFinalAnswerRequiredProcessBoundary: true,
        hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary: false,
      }),
    ).toBe(true);
    expect(
      shouldFailAgentStreamMissingFinalReply({
        accumulatedContent: "最终答复",
        hasFinalAnswerRequiredProcessBoundary: true,
        hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary: true,
      }),
    ).toBe(false);
  });

  it("应解析可降级完成内容并剥离协议残留", () => {
    expect(
      resolveAgentStreamGracefulCompletionContent({
        accumulatedContent: " 最终答复 ",
      }),
    ).toBe("最终答复");
    expect(
      resolveAgentStreamGracefulCompletionContent({
        accumulatedContent: "<tool_call></tool_call>",
        fallbackContent: "兜底内容",
      }),
    ).toBe("兜底内容");
  });

  it("最终文本变化时应保留过程顺序并把最终正文放到过程后", () => {
    const parts = [
      { type: "text", text: "原始" },
      { type: "tool_use", toolCall: { id: "tool-a" } },
    ] as unknown as Message["contentParts"];

    expect(
      reconcileAgentStreamFinalContentParts({
        parts,
        finalContent: "最终",
        rawContent: "原始",
        surfaceThinkingDeltas: true,
      }),
    ).toEqual([
      { type: "text", text: "原始" },
      { type: "tool_use", toolCall: { id: "tool-a" } },
      { type: "text", text: "最终" },
    ]);
  });

  it("最终文本修正工具后的尾部正文时不应把正文挪到工具前", () => {
    const parts = [
      { type: "text", text: "我先查证来源。" },
      { type: "tool_use", toolCall: { id: "tool-search" } },
      { type: "text", text: "## 简报\n\n- 初稿。" },
    ] as unknown as Message["contentParts"];

    expect(
      reconcileAgentStreamFinalContentParts({
        parts,
        finalContent: "## 简报\n\n- 修正后的最终稿。",
        rawContent: "## 简报\n\n- 初稿。",
        surfaceThinkingDeltas: true,
      }),
    ).toEqual([
      { type: "text", text: "我先查证来源。" },
      { type: "tool_use", toolCall: { id: "tool-search" } },
      { type: "text", text: "## 简报\n\n- 修正后的最终稿。" },
    ]);
  });

  it("完成态修正文案时应保留已交错的文本槽位", () => {
    const parts = [
      { type: "text", text: "先说明。" },
      { type: "tool_use", toolCall: { id: "tool-a" } },
      { type: "text", text: "再总结。" },
    ] as unknown as Message["contentParts"];

    expect(
      reconcileAgentStreamFinalContentParts({
        parts,
        finalContent: "先说明。再总结。补充最终结论。",
        rawContent: "先说明。再总结。",
        surfaceThinkingDeltas: true,
      }),
    ).toEqual([
      { type: "text", text: "先说明。" },
      { type: "tool_use", toolCall: { id: "tool-a" } },
      { type: "text", text: "再总结。补充最终结论。" },
    ]);
  });

  it("完成态最终正文只是已有文本延伸时应追加尾巴，不把工具顶到后面", () => {
    const parts = [
      { type: "text", text: "第一段。" },
      { type: "tool_use", toolCall: { id: "tool-a" } },
    ] as unknown as Message["contentParts"];

    expect(
      reconcileAgentStreamFinalContentParts({
        parts,
        finalContent: "第一段。最终补充。",
        rawContent: "第一段。最终补充。",
        surfaceThinkingDeltas: true,
      }),
    ).toEqual([
      { type: "text", text: "第一段。" },
      { type: "tool_use", toolCall: { id: "tool-a" } },
      { type: "text", text: "最终补充。" },
    ]);
  });

  it("完成态 suffix 不应追加到早于 process boundary 的文本段", () => {
    const parts = [
      {
        type: "tool_use",
        metadata: { sequence: 2 },
        toolCall: { id: "tool-a" },
      },
      {
        type: "text",
        text: "第一段。",
        metadata: { source: "agent_text_delta", sequence: 1 },
      },
    ] as unknown as Message["contentParts"];

    expect(
      reconcileAgentStreamFinalContentParts({
        parts,
        finalContent: "第一段。第二段。",
        rawContent: "第一段。第二段。",
        surfaceThinkingDeltas: true,
      }),
    ).toEqual([
      {
        type: "tool_use",
        metadata: { sequence: 2 },
        toolCall: { id: "tool-a" },
      },
      {
        type: "text",
        text: "第一段。",
        metadata: { source: "agent_text_delta", sequence: 1 },
      },
      { type: "text", text: "第二段。" },
    ]);
  });

  it("完成态 reconcile 不应把 commentary text 当作最终正文", () => {
    const parts = [
      {
        type: "text",
        text: "我先联网核实目标页面来源。",
        metadata: {
          source: "agent_text_delta",
          itemId: "commentary-1",
          phase: "commentary",
          sequence: 1,
          turnId: "turn-1",
        },
      },
      {
        type: "tool_use",
        metadata: { sequence: 2 },
        toolCall: { id: "tool-a" },
      },
    ] as unknown as Message["contentParts"];

    expect(
      reconcileAgentStreamFinalContentParts({
        parts,
        finalContent: "最终正文。",
        rawContent: "最终正文。",
        surfaceThinkingDeltas: true,
      }),
    ).toEqual([
      {
        type: "text",
        text: "我先联网核实目标页面来源。",
        metadata: {
          source: "agent_text_delta",
          itemId: "commentary-1",
          phase: "commentary",
          sequence: 1,
          turnId: "turn-1",
        },
      },
      {
        type: "tool_use",
        metadata: { sequence: 2 },
        toolCall: { id: "tool-a" },
      },
      { type: "text", text: "最终正文。" },
    ]);
  });

  it("应在不展示 thinking 时过滤 thinking part", () => {
    const parts = [
      { type: "thinking", text: "推理" },
      { type: "text", text: "最终" },
    ] satisfies Message["contentParts"];

    expect(
      reconcileAgentStreamFinalContentParts({
        parts,
        finalContent: "最终",
        rawContent: "最终",
        surfaceThinkingDeltas: false,
      }),
    ).toEqual([{ type: "text", text: "最终" }]);
  });

  it("应构造完成态 assistant 消息 patch 并带回 usage", () => {
    const usage = { input_tokens: 1, output_tokens: 2 };

    expect(
      buildAgentStreamCompletedAssistantMessagePatch({
        parts: [{ type: "text", text: "原始" }],
        finalContent: "最终",
        rawContent: "原始",
        surfaceThinkingDeltas: true,
        usage,
      }),
    ).toEqual({
      isThinking: false,
      content: "最终",
      contentParts: [{ type: "text", text: "最终" }],
      thinkingContent: undefined,
      runtimeStatus: undefined,
      usage,
    });
  });

  it("完成态应收尾残留 running 工具，避免最终正文继续显示正在输出", () => {
    const startedAt = new Date("2026-06-07T10:34:54.000Z");
    const patch = buildAgentStreamCompletedAssistantMessagePatch({
      parts: [
        { type: "text", text: "我先搜索新闻。" },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-stale",
            name: "WebSearch",
            arguments: '{"query":"2026年6月7日 国际新闻"}',
            status: "running",
            startTime: startedAt,
          },
        },
        { type: "text", text: "根据多源检索结果，以下是摘要。" },
      ],
      toolCalls: [
        {
          id: "tool-news-stale",
          name: "WebSearch",
          arguments: '{"query":"2026年6月7日 国际新闻"}',
          status: "running",
          startTime: startedAt,
        },
      ],
      finalContent: "根据多源检索结果，以下是摘要。",
      previousContent: "我先搜索新闻。根据多源检索结果，以下是摘要。",
      rawContent: "根据多源检索结果，以下是摘要。",
      surfaceThinkingDeltas: true,
    });

    expect(patch.isThinking).toBe(false);
    expect(patch.toolCalls?.[0]).toMatchObject({
      id: "tool-news-stale",
      status: "completed",
      result: {
        success: true,
        output: "",
      },
    });
    expect(
      patch.contentParts?.find((part) => part.type === "tool_use"),
    ).toMatchObject({
      toolCall: {
        id: "tool-news-stale",
        status: "completed",
        result: {
          success: true,
          output: "",
        },
      },
    });
  });

  it("完成态最终正文较短时应保留已经显示给用户的前期输出", () => {
    expect(
      resolveAgentStreamCompletedVisibleContent({
        previousContent: "前期已经流式显示的说明。\n\n最终总结。",
        finalContent: "最终总结。",
      }),
    ).toBe("前期已经流式显示的说明。\n\n最终总结。");
  });

  it("完成态最终正文改写且不包含前期输出时应合并显示内容", () => {
    expect(
      buildAgentStreamCompletedAssistantMessagePatch({
        parts: [{ type: "text", text: "前期输出。" }],
        previousContent: "前期输出。",
        finalContent: "最终输出。",
        rawContent: "最终输出。",
        surfaceThinkingDeltas: true,
      }),
    ).toEqual({
      isThinking: false,
      content: "前期输出。\n\n最终输出。",
      contentParts: [{ type: "text", text: "前期输出。\n\n最终输出。" }],
      thinkingContent: undefined,
      runtimeStatus: undefined,
    });
  });

  it("完成态应在持久化 reasoning 接管前保留本地思考兜底", () => {
    expect(
      buildAgentStreamCompletedAssistantMessagePatch({
        parts: [
          { type: "thinking", text: "先分析意图。" },
          { type: "text", text: "最终" },
        ],
        finalContent: "最终",
        rawContent: "最终",
        surfaceThinkingDeltas: true,
        thinkingContent: " 先分析意图。 ",
      }),
    ).toEqual({
      isThinking: false,
      content: "最终",
      contentParts: [
        { type: "thinking", text: "先分析意图。" },
        { type: "text", text: "最终" },
      ],
      thinkingContent: "先分析意图。",
      runtimeStatus: undefined,
    });
  });

  it("关闭思考展示时完成态不应保留本地思考兜底", () => {
    expect(
      buildAgentStreamCompletedAssistantMessagePatch({
        parts: [
          { type: "thinking", text: "先分析意图。" },
          { type: "text", text: "最终" },
        ],
        finalContent: "最终",
        rawContent: "最终",
        surfaceThinkingDeltas: false,
        thinkingContent: "先分析意图。",
      }),
    ).toEqual({
      isThinking: false,
      content: "最终",
      contentParts: [{ type: "text", text: "最终" }],
      thinkingContent: undefined,
      runtimeStatus: undefined,
    });
  });

  it("应为 final_done 构造完成副作用计划", () => {
    expect(
      buildAgentStreamFinalDonePlan({
        accumulatedContent:
          '<tool_result>{"output":"saved"}</tool_result>\n\n已保存。',
        queuedTurnId: "queued-1",
        toolCallCount: 2,
      }),
    ).toEqual({
      type: "complete",
      finalContent: "已保存。",
      queuedTurnIds: ["queued-1"],
      requestLogPayload: {
        eventType: "chat_request_complete",
        status: "success",
        description: "请求完成，工具调用 2 次",
      },
    });
  });

  it("应为缺少最终回复的 final_done 构造失败计划并保留 usage", () => {
    const usage = { input_tokens: 5, output_tokens: 0 };

    expect(
      buildAgentStreamFinalDonePlan({
        accumulatedContent: "",
        hasMeaningfulCompletionSignal: false,
        queuedTurnId: "queued-missing",
        toolCallCount: 0,
        usage,
      }),
    ).toEqual({
      type: "missing_final_reply_failure",
      errorMessage: AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
      queuedTurnIds: ["queued-missing"],
      requestLogPayload: {
        eventType: "chat_request_error",
        status: "error",
        error: AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
      },
      toastMessage: AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
      usage,
    });
  });

  it("搜索等过程边界后没有 assistant 正文时应构造缺少最终回复失败计划", () => {
    expect(
      buildAgentStreamFinalDonePlan({
        accumulatedContent: "我先联网核实信息。",
        hasFinalAnswerRequiredProcessBoundary: true,
        hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary: false,
        queuedTurnId: "queued-search-no-final",
        toolCallCount: 1,
      }),
    ).toEqual({
      type: "missing_final_reply_failure",
      errorMessage: AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
      queuedTurnIds: ["queued-search-no-final"],
      requestLogPayload: {
        eventType: "chat_request_error",
        status: "error",
        error: AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
      },
      toastMessage: AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
    });
  });

  it("搜索等过程边界后已有 assistant 正文时应正常完成", () => {
    expect(
      buildAgentStreamFinalDonePlan({
        accumulatedContent: "我先联网核实信息。最终摘要。",
        hasFinalAnswerRequiredProcessBoundary: true,
        hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary: true,
        queuedTurnId: "queued-search-final",
        toolCallCount: 1,
      }),
    ).toEqual({
      type: "complete",
      finalContent: "我先联网核实信息。最终摘要。",
      queuedTurnIds: ["queued-search-final"],
      requestLogPayload: {
        eventType: "chat_request_complete",
        status: "success",
        description: "请求完成，工具调用 1 次",
      },
    });
  });

  it("应构造缺少最终回复失败副作用计划", () => {
    expect(
      buildAgentStreamMissingFinalReplyFailurePlan({
        errorMessage: "模型未输出最终答复：工具已完成",
        queuedTurnId: "queued-1",
      }),
    ).toEqual({
      type: "missing_final_reply_failure",
      errorMessage: "模型未输出最终答复：工具已完成",
      queuedTurnIds: ["queued-1"],
      requestLogPayload: {
        eventType: "chat_request_error",
        status: "error",
        error: "模型未输出最终答复：工具已完成",
      },
      toastMessage: AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
    });
  });

  it("应构造缺少最终回复失败的执行层副作用计划", () => {
    const usage = { input_tokens: 10, output_tokens: 0 };
    const failurePlan = buildAgentStreamMissingFinalReplyFailurePlan({
      errorMessage: "模型未输出最终答复：工具已完成",
      queuedTurnId: "queued-1",
      usage,
    });

    expect(
      buildAgentStreamMissingFinalReplyFailureSideEffectPlan(failurePlan),
    ).toEqual({
      errorMessage: "模型未输出最终答复：工具已完成",
      observerErrorMessage: "模型未输出最终答复：工具已完成",
      queuedTurnIds: ["queued-1"],
      requestLogPayload: {
        eventType: "chat_request_error",
        status: "error",
        error: "模型未输出最终答复：工具已完成",
      },
      shouldClearActiveStream: true,
      shouldClearPendingTextRenderTimer: true,
      shouldDisposeListener: true,
      shouldMarkFailedTimeline: true,
      toastMessage: AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
      usage,
    });
  });

  it("应为空 final error 按产物信号决定失败或软完成", () => {
    expect(
      buildAgentStreamEmptyFinalErrorPlan({
        errorMessage: "模型未输出最终答复：工具已完成",
        accumulatedContent: "",
        hasMeaningfulCompletionSignal: false,
      }),
    ).toEqual({
      type: "missing_final_reply_failure",
      errorMessage: "模型未输出最终答复：工具已完成",
      queuedTurnIds: [],
      requestLogPayload: {
        eventType: "chat_request_error",
        status: "error",
        error: "模型未输出最终答复：工具已完成",
      },
      toastMessage: AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
    });

    expect(
      buildAgentStreamEmptyFinalErrorPlan({
        errorMessage: "模型未输出最终答复：工具已完成",
        accumulatedContent: "",
        hasMeaningfulCompletionSignal: true,
        queuedTurnId: "queued-2",
      }),
    ).toEqual({
      type: "complete",
      finalContent: "本轮执行已完成，详细过程与产物已保留在当前对话中。",
      queuedTurnIds: ["queued-2"],
      requestLogPayload: {
        eventType: "chat_request_complete",
        status: "success",
        description: "请求完成，模型未补充最终总结，已降级保留当前过程结果",
      },
    });
  });
});
