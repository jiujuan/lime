import { describe, expect, it } from "vitest";
import {
  WEB_TOOL_START_TIME,
  mockStreamingRenderer,
  render,
  renderZh,
} from "./MessageList.testHarness";
import type {
  Message,
  StreamingRendererCallProps,
} from "./MessageList.testHarness";

describe("MessageList failure and web tools", () => {
  it("provider 失败混入已输出正文时应隐藏内部错误并去重正文", async () => {
    const visibleText =
      "我先把今天的国际新闻证据抓回来，省得我们俩对着昨天的旧闻开会。";
    const detail =
      'execution backend error: Agent provider execution failed: Request failed: Resource not found (404): ***NotFoundError: NotFoundError: OpenAIException - {"detail":"Not Found"}';
    const messages: Message[] = [
      {
        id: "msg-user-news-not-found",
        role: "user",
        content: "帮我整理一下今天的国际新闻",
        timestamp: new Date("2026-07-09T08:20:00.000Z"),
      },
      {
        id: "msg-assistant-news-not-found",
        role: "assistant",
        content: [
          `${visibleText}执行失败： ${detail}`,
          visibleText,
          visibleText,
        ].join("\n\n"),
        contentParts: [
          {
            type: "text",
            text: [
              `${visibleText}执行失败： ${detail}`,
              visibleText,
              visibleText,
            ].join("\n\n"),
          },
        ],
        timestamp: new Date("2026-07-09T08:20:12.000Z"),
        runtimeStatus: {
          phase: "failed",
          title: "当前处理失败",
          detail,
          checkpoints: [],
        },
      },
    ];

    const container = await renderZh(messages);

    const assistantRenderer = container.querySelector(
      '[data-testid="streaming-renderer"]',
    );
    const visibleMatches = (assistantRenderer?.textContent || "").match(
      new RegExp(visibleText, "g"),
    );

    expect(assistantRenderer?.textContent).toContain(visibleText);
    expect(visibleMatches).toHaveLength(1);
    expect(container.textContent).toContain("当前处理失败");
    expect(container.textContent).not.toContain("执行失败");
    expect(container.textContent).not.toContain("OpenAIException");
    expect(container.textContent).not.toContain("NotFoundError");
  });

  it("失败回复已有时间线错误卡时不应在正文和底部重复长错误", async () => {
    const detail =
      "当前模型通道返回了计费或额度类错误，请检查该 Provider/模型通道的计费、配额或授权状态，或切换到其他可用模型后重试。";
    const messages: Message[] = [
      {
        id: "msg-user-provider-failed",
        role: "user",
        content: "你好",
        timestamp: new Date("2026-05-11T00:20:46Z"),
      },
      {
        id: "msg-assistant-provider-failed",
        role: "assistant",
        content: `执行失败：${detail}`,
        timestamp: new Date("2026-05-11T00:20:55Z"),
        runtimeTurnId: "turn-provider-failed",
        runtimeStatus: {
          phase: "failed",
          title: "当前处理失败",
          detail,
          checkpoints: [],
        },
      },
    ];

    const container = await renderZh(messages, {
      currentTurnId: "turn-provider-failed",
      turns: [
        {
          id: "turn-provider-failed",
          thread_id: "thread-1",
          prompt_text: "你好",
          status: "failed",
          error_message: detail,
          started_at: "2026-05-11T00:20:46Z",
          completed_at: "2026-05-11T00:20:55Z",
          created_at: "2026-05-11T00:20:46Z",
          updated_at: "2026-05-11T00:20:55Z",
        },
      ],
      threadItems: [
        {
          id: "error-provider-failed",
          thread_id: "thread-1",
          turn_id: "turn-provider-failed",
          sequence: 1,
          status: "failed",
          started_at: "2026-05-11T00:20:55Z",
          updated_at: "2026-05-11T00:20:55Z",
          type: "error",
          message: detail,
        },
      ],
    });

    const assistantRenderer = container.querySelector(
      '[data-testid="streaming-renderer"]',
    );
    const metaFooter = container.querySelector(
      '[data-testid="assistant-message-meta-footer"]',
    );
    const statusPill = container.querySelector(
      '[data-testid="message-runtime-status-pill"]',
    );

    expect(assistantRenderer?.textContent).toBe("<empty-assistant>");
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
    expect(statusPill?.textContent).toContain("当前处理失败");
    expect(statusPill?.textContent).not.toContain(detail);
    expect(metaFooter?.textContent).not.toContain(detail);
  });

  it("完成态 App Server reasoning 应与 WebSearch/WebFetch 按 turn 顺序进入同一内联过程", () => {
    const turnId = "turn-web-tools-reasoning";
    const messages: Message[] = [
      {
        id: "msg-user-web-tools-reasoning",
        role: "user",
        content: "验证网页搜索渲染",
        timestamp: new Date("2026-06-20T14:48:10.000Z"),
      },
      {
        id: "msg-assistant-web-tools-reasoning",
        role: "assistant",
        content: "网页搜索渲染结论：最终正文继续输出。",
        timestamp: new Date("2026-06-20T14:48:14.000Z"),
        runtimeTurnId: turnId,
      },
    ];

    render(messages, {
      currentTurnId: turnId,
      turns: [
        {
          id: turnId,
          thread_id: "thread-web-tools",
          prompt_text: "验证网页搜索渲染",
          status: "completed",
          started_at: "2026-06-20T14:48:10.000Z",
          completed_at: "2026-06-20T14:48:14.000Z",
          created_at: "2026-06-20T14:48:10.000Z",
          updated_at: "2026-06-20T14:48:14.000Z",
        },
      ],
      threadItems: [
        {
          id: "tool-web-search",
          thread_id: "thread-web-tools",
          turn_id: turnId,
          sequence: 1,
          type: "tool_call",
          tool_name: "WebSearch",
          arguments: { query: "Lime WebSearch rendering" },
          output: JSON.stringify({
            results: [
              {
                title: "Lime WebSearch Rendering Source",
                url: "https://example.com/lime-websearch-rendering",
                snippet: "Search source used to verify inline rendering",
              },
            ],
          }),
          success: true,
          status: "completed",
          started_at: "2026-06-20T14:48:11.000Z",
          completed_at: "2026-06-20T14:48:11.200Z",
          updated_at: "2026-06-20T14:48:11.200Z",
        },
        {
          id: "reasoning-web-tools",
          thread_id: "thread-web-tools",
          turn_id: turnId,
          sequence: 2,
          type: "reasoning",
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T14:48:11.300Z",
          completed_at: "2026-06-20T14:48:11.400Z",
          updated_at: "2026-06-20T14:48:11.400Z",
        },
        {
          id: "tool-web-fetch",
          thread_id: "thread-web-tools",
          turn_id: turnId,
          sequence: 3,
          type: "tool_call",
          tool_name: "WebFetch",
          arguments: { url: "https://example.com/lime-websearch-rendering" },
          output: JSON.stringify({
            bytes: 2048,
            code: 200,
            codeText: "OK",
            result: "WebFetch 正文摘要。",
          }),
          success: true,
          status: "completed",
          started_at: "2026-06-20T14:48:11.500Z",
          completed_at: "2026-06-20T14:48:11.700Z",
          updated_at: "2026-06-20T14:48:11.700Z",
        },
        {
          id: "assistant-web-tools-final",
          thread_id: "thread-web-tools",
          turn_id: turnId,
          sequence: 4,
          type: "agent_message",
          phase: "final_answer",
          text: "网页搜索渲染结论：最终正文继续输出。",
          status: "completed",
          started_at: "2026-06-20T14:48:12.000Z",
          completed_at: "2026-06-20T14:48:14.000Z",
          updated_at: "2026-06-20T14:48:14.000Z",
        },
      ],
    });

    const call = mockStreamingRenderer.mock.calls.at(-1)?.[0] as
      | StreamingRendererCallProps
      | undefined;

    expect(call?.contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(call?.contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("实时 WebSearch/WebFetch 已在消息层时仍应显示 timeline 中间 reasoning", () => {
    const turnId = "turn-realtime-web-tools-sparse-reasoning";
    const finalText =
      "网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。";
    const messages: Message[] = [
      {
        id: "msg-assistant-realtime-web-tools",
        role: "assistant",
        content: finalText,
        timestamp: new Date("2026-06-20T14:49:14.000Z"),
        runtimeTurnId: turnId,
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "realtime-tool-web-search",
              name: "WebSearch",
              arguments: JSON.stringify({
                query: "Lime WebSearch rendering",
              }),
              status: "completed",
              startTime: WEB_TOOL_START_TIME,
              result: {
                success: true,
                output: JSON.stringify({
                  results: [
                    {
                      title: "Lime WebSearch Rendering Source",
                      url: "https://example.com/lime-websearch-rendering",
                      snippet: "Search source used to verify inline rendering",
                    },
                  ],
                }),
              },
            },
          },
          {
            type: "tool_use",
            toolCall: {
              id: "realtime-tool-web-fetch",
              name: "WebFetch",
              arguments: JSON.stringify({
                url: "https://example.com/lime-websearch-rendering",
              }),
              status: "completed",
              startTime: WEB_TOOL_START_TIME,
              result: {
                success: true,
                output: JSON.stringify({
                  bytes: 2048,
                  code: 200,
                  codeText: "OK",
                  result: "WebFetch 正文摘要。",
                }),
              },
            },
          },
          {
            type: "text",
            text: finalText,
          },
        ],
      },
    ];

    render(messages, {
      currentTurnId: turnId,
      turns: [
        {
          id: turnId,
          thread_id: "thread-realtime-web-tools",
          prompt_text: "验证网页搜索渲染",
          status: "completed",
          started_at: "2026-06-20T14:49:10.000Z",
          completed_at: "2026-06-20T14:49:14.000Z",
          created_at: "2026-06-20T14:49:10.000Z",
          updated_at: "2026-06-20T14:49:14.000Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-realtime-web-tools",
          thread_id: "thread-realtime-web-tools",
          turn_id: turnId,
          sequence: 3,
          type: "reasoning",
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T14:49:11.300Z",
          completed_at: "2026-06-20T14:49:11.400Z",
          updated_at: "2026-06-20T14:49:11.400Z",
        },
        {
          id: "summary-realtime-web-tools",
          thread_id: "thread-realtime-web-tools",
          turn_id: turnId,
          sequence: 4,
          type: "turn_summary",
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T14:49:11.000Z",
          completed_at: "2026-06-20T14:49:12.000Z",
          updated_at: "2026-06-20T14:49:12.000Z",
        },
      ],
    });

    const call = mockStreamingRenderer.mock.calls.at(-1)?.[0] as
      | StreamingRendererCallProps
      | undefined;

    expect(call?.contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(call?.contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("完成后 currentTurnId 已清空时仍应把 WebSearch/WebFetch 中间 reasoning 合入消息层过程", () => {
    const turnId = "turn-completed-web-tools-sparse-reasoning";
    const finalText =
      "网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。";
    const messages: Message[] = [
      {
        id: "msg-assistant-completed-web-tools",
        role: "assistant",
        content: finalText,
        timestamp: new Date("2026-06-20T14:51:14.000Z"),
        runtimeTurnId: turnId,
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "completed-tool-web-search",
              name: "WebSearch",
              arguments: JSON.stringify({
                query: "Lime WebSearch rendering",
              }),
              status: "completed",
              startTime: WEB_TOOL_START_TIME,
              result: {
                success: true,
                output: JSON.stringify({
                  results: [
                    {
                      title: "Lime WebSearch Rendering Source",
                      url: "https://example.com/lime-websearch-rendering",
                      snippet: "Search source used to verify inline rendering",
                    },
                  ],
                }),
              },
            },
          },
          {
            type: "tool_use",
            toolCall: {
              id: "completed-tool-web-fetch",
              name: "WebFetch",
              arguments: JSON.stringify({
                url: "https://example.com/lime-websearch-rendering",
              }),
              status: "completed",
              startTime: WEB_TOOL_START_TIME,
              result: {
                success: true,
                output: JSON.stringify({
                  bytes: 2048,
                  code: 200,
                  codeText: "OK",
                  result: "WebFetch 正文摘要。",
                }),
              },
            },
          },
          {
            type: "text",
            text: finalText,
          },
        ],
      },
    ];

    render(messages, {
      currentTurnId: null,
      turns: [
        {
          id: turnId,
          thread_id: "thread-completed-web-tools",
          prompt_text: "验证网页搜索渲染",
          status: "completed",
          started_at: "2026-06-20T14:51:10.000Z",
          completed_at: "2026-06-20T14:51:14.000Z",
          created_at: "2026-06-20T14:51:10.000Z",
          updated_at: "2026-06-20T14:51:14.000Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-completed-web-tools",
          thread_id: "thread-completed-web-tools",
          turn_id: turnId,
          sequence: 3,
          type: "reasoning",
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T14:51:11.300Z",
          completed_at: "2026-06-20T14:51:11.400Z",
          updated_at: "2026-06-20T14:51:11.400Z",
        },
        {
          id: "summary-completed-web-tools",
          thread_id: "thread-completed-web-tools",
          turn_id: turnId,
          sequence: 4,
          type: "turn_summary",
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T14:51:11.000Z",
          completed_at: "2026-06-20T14:51:12.000Z",
          updated_at: "2026-06-20T14:51:12.000Z",
        },
      ],
    });

    const call = mockStreamingRenderer.mock.calls.at(-1)?.[0] as
      | StreamingRendererCallProps
      | undefined;

    expect(call?.contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(call?.contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });
});
