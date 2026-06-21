import { describe, expect, it } from "vitest";
import {
  mockTokenUsageDisplay,
  mockStreamingRenderer,
  render,
  renderZh,
  upsertAgentStreamTextOverlay,
} from "./MessageList.testHarness";
import type {
  Message,
} from "./MessageList.testHarness";

describe("MessageList streaming turns", () => {
  it("首字前等待态遇到提前完成的 turn 时，不应在消息尾部显示已完成", async () => {
    const now = new Date("2026-06-07T10:00:00.000Z");
    const messages: Message[] = [
      {
        id: "msg-user-first-token-completed-turn",
        role: "user",
        content: "请用一句话解释启动状态",
        timestamp: now,
      },
      {
        id: "msg-assistant-first-token-completed-turn",
        role: "assistant",
        content: "",
        timestamp: new Date(now.getTime() + 1000),
        isThinking: true,
        runtimeStatus: {
          phase: "routing",
          title: "正在生成回复",
          detail: "运行时已开始处理，等待首个输出。",
        },
      },
    ];

    const container = await renderZh(messages, {
      currentTurnId: "turn-first-token-completed",
      isSending: true,
      threadRead: {
        thread_id: "thread-first-token-completed",
        status: "completed",
      },
      turns: [
        {
          id: "turn-first-token-completed",
          thread_id: "thread-first-token-completed",
          prompt_text: "请用一句话解释启动状态",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:12.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:12.000Z",
        },
      ],
    });

    expect(
      container.querySelector(
        '[data-testid="assistant-first-token-runtime-status"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
    expect(container.textContent).toContain("正在生成回复");
    expect(container.textContent).not.toContain("等待首个输出");
    expect(
      container
        .querySelector('[data-testid="assistant-first-token-runtime-status"]')
        ?.getAttribute("aria-label"),
    ).toContain("正在处理请求，等待开始输出。");
    expect(container.textContent).not.toContain("已完成");
    expect(container.textContent).not.toContain("00:12");
  });

  it("当前回合运行且只有执行轨迹时，应在消息结算区显示小型输出提示", () => {
    const now = new Date("2026-05-12T09:00:00.000Z");
    const messages: Message[] = [
      {
        id: "msg-user-active-loading",
        role: "user",
        content: "帮我整理国内新闻",
        timestamp: now,
      },
      {
        id: "msg-assistant-active-loading",
        role: "assistant",
        content: "",
        timestamp: new Date(now.getTime() + 1000),
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-active-loading",
      turns: [
        {
          id: "turn-active-loading",
          thread_id: "thread-active-loading",
          prompt_text: "帮我整理国内新闻",
          status: "running",
          started_at: "2026-05-12T09:00:00.000Z",
          created_at: "2026-05-12T09:00:00.000Z",
          updated_at: "2026-05-12T09:00:04.000Z",
        },
      ],
      threadRead: {
        thread_id: "thread-active-loading",
        status: "running",
      },
      threadItems: [
        {
          id: "search-active-loading-1",
          thread_id: "thread-active-loading",
          turn_id: "turn-active-loading",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-12T09:00:01.000Z",
          completed_at: "2026-05-12T09:00:02.000Z",
          updated_at: "2026-05-12T09:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "国内新闻 2026年5月 最新",
          output: "已找到 10 个可参考来源",
        },
      ],
    });

    const indicator = container.querySelector(
      '[data-testid="assistant-streaming-inline-indicator"]',
    );

    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute("data-status")).toBe("running");
    expect(indicator?.textContent).toContain("Writing...");
    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="assistant-active-execution-indicator"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
  });

  it("assistant 消息结算区应以内联模式承载 token usage", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-inline-usage",
        role: "assistant",
        content: "本轮已完成。",
        timestamp: now,
        usage: {
          input_tokens: 1_200,
          output_tokens: 300,
          cached_input_tokens: 0,
        },
      },
    ];

    render(messages);

    expect(mockTokenUsageDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        inline: true,
      }),
    );
  });

  it("第二轮开始后，上一轮 assistant 的工具调用块不应被从正文投影中剥离", () => {
    const firstTurnTime = new Date("2026-04-15T09:00:00.000Z");
    const secondTurnTime = new Date("2026-04-15T09:00:10.000Z");
    const completedToolCall = {
      id: "tool-read-1",
      name: "Read",
      arguments: '{"file_path":"/repo/src/index.ts"}',
      status: "completed" as const,
      startTime: new Date("2026-04-15T09:00:01.000Z"),
      endTime: new Date("2026-04-15T09:00:02.000Z"),
      result: {
        success: true,
        output: "export const answer = 42;",
      },
    };
    const messages: Message[] = [
      {
        id: "msg-user-first-turn",
        role: "user",
        content: "先分析项目结构",
        timestamp: firstTurnTime,
      },
      {
        id: "msg-assistant-first-turn",
        role: "assistant",
        content: "已经整理完第一轮分析。",
        timestamp: new Date("2026-04-15T09:00:03.000Z"),
        toolCalls: [completedToolCall],
        contentParts: [
          {
            type: "tool_use",
            toolCall: completedToolCall,
          },
          {
            type: "text",
            text: "已经整理完第一轮分析。",
          },
        ],
      },
      {
        id: "msg-user-second-turn",
        role: "user",
        content: "继续追问第二轮",
        timestamp: secondTurnTime,
      },
      {
        id: "msg-assistant-second-turn",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-15T09:00:11.000Z"),
        isThinking: true,
        contentParts: [
          {
            type: "thinking",
            text: "准备继续查看模块边界。",
          },
        ],
        runtimeStatus: {
          phase: "preparing",
          title: "准备继续分析",
          detail: "正在建立第二轮上下文。",
          checkpoints: ["等待下一步工具调用"],
        },
      },
    ];

    render(messages);

    const firstAssistantCall = mockStreamingRenderer.mock.calls.find(
      ([props]) => props.content === "已经整理完第一轮分析。",
    )?.[0];
    const secondAssistantCall = mockStreamingRenderer.mock.calls.find(
      ([props]) => props.content === "",
    )?.[0];

    expect(firstAssistantCall?.contentParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool_use",
        }),
      ]),
    );
    expect(firstAssistantCall?.thinkingContent).toBeUndefined();
    expect(secondAssistantCall?.contentParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "thinking",
        }),
      ]),
    );
  });

  it("第二轮流式输出时，第一轮完整正文与工具过程不应被截断或覆盖", () => {
    const firstTurnCompletedText = [
      "第一轮已经完成。",
      "这一轮包含完整的结果说明和一段较长的正文，用来模拟用户反馈里被截断的历史回复。",
      "## 第一轮结论",
      "",
      "- 已完成分析",
      "- 已保留工具过程",
    ].join("\n");
    const firstCompletedToolCall = {
      id: "tool-web-search-first-turn",
      name: "web_search",
      arguments: '{"query":"first turn"}',
      status: "completed" as const,
      startTime: new Date("2026-04-15T09:00:01.000Z"),
      endTime: new Date("2026-04-15T09:00:02.000Z"),
      result: {
        success: true,
        output: "已搜索网页 3 次",
      },
    };
    const messages: Message[] = [
      {
        id: "msg-user-first-turn-complete",
        role: "user",
        content: "先完成第一轮分析",
        timestamp: new Date("2026-04-15T09:00:00.000Z"),
      },
      {
        id: "msg-assistant-first-turn-complete",
        role: "assistant",
        content: firstTurnCompletedText,
        timestamp: new Date("2026-04-15T09:00:03.000Z"),
        toolCalls: [firstCompletedToolCall],
        contentParts: [
          {
            type: "tool_use",
            toolCall: firstCompletedToolCall,
          },
          {
            type: "text",
            text: firstTurnCompletedText,
          },
        ],
      },
      {
        id: "msg-user-second-turn-running",
        role: "user",
        content: "继续第二轮",
        timestamp: new Date("2026-04-15T09:00:10.000Z"),
      },
      {
        id: "msg-assistant-second-turn-running",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-15T09:00:11.000Z"),
        isThinking: true,
        runtimeStatus: {
          phase: "preparing",
          title: "准备第二轮",
          detail: "正在建立第二轮上下文。",
          checkpoints: ["等待第二轮工具调用"],
        },
      },
    ];

    upsertAgentStreamTextOverlay({
      messageId: "msg-assistant-second-turn-running",
      eventName: "response.output_text.delta",
      content: "第二轮正在继续输出。",
      updatedAt: Date.parse("2026-04-15T09:00:12.000Z"),
    });

    render(messages, {
      isSending: true,
      currentTurnId: "turn-second-running",
      turns: [
        {
          id: "turn-first-complete",
          thread_id: "thread-1",
          prompt_text: "先完成第一轮分析",
          status: "completed",
          started_at: "2026-04-15T09:00:00.000Z",
          completed_at: "2026-04-15T09:00:05.000Z",
          created_at: "2026-04-15T09:00:00.000Z",
          updated_at: "2026-04-15T09:00:05.000Z",
        },
        {
          id: "turn-second-running",
          thread_id: "thread-1",
          prompt_text: "继续第二轮",
          status: "running",
          started_at: "2026-04-15T09:00:10.000Z",
          created_at: "2026-04-15T09:00:10.000Z",
          updated_at: "2026-04-15T09:00:11.000Z",
        },
      ],
      threadItems: [
        {
          id: "tool-first-turn",
          thread_id: "thread-1",
          turn_id: "turn-first-complete",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-15T09:00:01.000Z",
          completed_at: "2026-04-15T09:00:02.000Z",
          updated_at: "2026-04-15T09:00:02.000Z",
          type: "tool_call",
          tool_name: "web_search",
          arguments: { query: "first turn" },
          output: "已搜索网页 3 次",
          success: true,
        },
      ],
    });

    const firstAssistantCall = mockStreamingRenderer.mock.calls.find(
      ([props]) => props.content === firstTurnCompletedText,
    )?.[0];
    const secondAssistantCall = mockStreamingRenderer.mock.calls.find(
      ([props]) => props.content === "第二轮正在继续输出。",
    )?.[0];

    expect(firstAssistantCall?.content).toContain("第一轮已经完成。");
    expect(firstAssistantCall?.content).toContain("## 第一轮结论");
    expect(firstAssistantCall?.isStreaming).toBe(false);
    expect(firstAssistantCall?.contentParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool_use",
        }),
        expect.objectContaining({
          type: "text",
          text: firstTurnCompletedText,
        }),
      ]),
    );
    expect(secondAssistantCall?.content).toBe("第二轮正在继续输出。");
    expect(secondAssistantCall?.content).not.toContain("第一轮已经完成。");
    expect(secondAssistantCall?.isStreaming).toBe(true);
  });

});
