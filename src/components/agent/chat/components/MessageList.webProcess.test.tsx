import { describe, expect, it } from "vitest";
import {
  isMockToolUsePart,
  findStreamingRendererCallByContent,
  mockStreamingRenderer,
  render,
} from "./MessageList.testHarness";
import type {
  Message,
} from "./MessageList.testHarness";

describe("MessageList web process", () => {
  it("当前运行回合已有内联过程时，应让 StreamingRenderer 承担穿插式过程", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-active-interleaved-process",
        role: "assistant",
        content: "",
        timestamp: now,
        isThinking: true,
        thinkingContent: "The search plan is forming.",
        contentParts: [
          {
            type: "thinking",
            text: "The search plan is forming.",
          },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-active-search-1",
              name: "web_search",
              arguments: JSON.stringify({
                query: "international news May 9 2026 headlines",
              }),
              status: "running",
              startTime: now,
            },
          },
        ],
        toolCalls: [
          {
            id: "tool-active-search-1",
            name: "web_search",
            arguments: JSON.stringify({
              query: "international news May 9 2026 headlines",
            }),
            status: "running",
            startTime: now,
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-active-interleaved-process",
      turns: [
        {
          id: "turn-active-interleaved-process",
          thread_id: "thread-active-interleaved-process",
          prompt_text: "总结一下今天的国际新闻",
          status: "running",
          started_at: "2026-05-09T09:00:00Z",
          created_at: "2026-05-09T09:00:00Z",
          updated_at: "2026-05-09T09:00:02Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-active-interleaved-process",
          thread_id: "thread-active-interleaved-process",
          turn_id: "turn-active-interleaved-process",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-05-09T09:00:01Z",
          updated_at: "2026-05-09T09:00:01Z",
          type: "reasoning",
          text: "The",
        },
        {
          id: "search-active-interleaved-process",
          thread_id: "thread-active-interleaved-process",
          turn_id: "turn-active-interleaved-process",
          sequence: 2,
          status: "in_progress",
          started_at: "2026-05-09T09:00:02Z",
          updated_at: "2026-05-09T09:00:02Z",
          type: "web_search",
          action: "web_search",
          query: "international news May 9 2026 headlines",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingContent: "The search plan is forming.",
        contentParts: [
          { type: "thinking", text: "The search plan is forming." },
          expect.objectContaining({ type: "tool_use" }),
        ],
      }),
    );
  });

  it("历史 web_search timeline 应统一投影为同一回复内的网页搜索过程", () => {
    const now = new Date("2026-06-02T09:00:10.000Z");
    const messages: Message[] = [
      {
        id: "msg-history-news-search",
        role: "assistant",
        content: "## 国际新闻简报\n\n- 多个来源已经交叉确认。",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-history-news-search",
      turns: [
        {
          id: "turn-history-news-search",
          thread_id: "thread-history-news-search",
          prompt_text: "帮我整理一下今天的国际新闻",
          status: "completed",
          started_at: "2026-06-02T09:00:00Z",
          completed_at: "2026-06-02T09:00:10Z",
          created_at: "2026-06-02T09:00:00Z",
          updated_at: "2026-06-02T09:00:10Z",
        },
      ],
      threadItems: [
        {
          id: "agent-message-history-news-intro",
          thread_id: "thread-history-news-search",
          turn_id: "turn-history-news-search",
          sequence: 1,
          status: "completed",
          started_at: "2026-06-02T09:00:01Z",
          completed_at: "2026-06-02T09:00:01Z",
          updated_at: "2026-06-02T09:00:01Z",
          type: "agent_message",
          text: "我先联网核实今天的国际新闻，再整理成简报。",
        },
        {
          id: "web-search-history-news-1",
          thread_id: "thread-history-news-search",
          turn_id: "turn-history-news-search",
          sequence: 2,
          status: "completed",
          started_at: "2026-06-02T09:00:02Z",
          completed_at: "2026-06-02T09:00:03Z",
          updated_at: "2026-06-02T09:00:03Z",
          type: "web_search",
          action: "search",
          query: "today international news",
          output: JSON.stringify({
            results: [
              {
                title: "Reuters World News",
                url: "https://www.reuters.com/world/",
              },
            ],
          }),
        },
        {
          id: "web-search-history-news-2",
          thread_id: "thread-history-news-search",
          turn_id: "turn-history-news-search",
          sequence: 3,
          status: "completed",
          started_at: "2026-06-02T09:00:04Z",
          completed_at: "2026-06-02T09:00:05Z",
          updated_at: "2026-06-02T09:00:05Z",
          type: "web_search",
          action: "openPage",
          query: "https://apnews.com/hub/world-news",
          output: "[AP World News](https://apnews.com/hub/world-news)",
        },
        {
          id: "agent-message-history-news-final",
          thread_id: "thread-history-news-search",
          turn_id: "turn-history-news-search",
          sequence: 4,
          status: "completed",
          started_at: "2026-06-02T09:00:06Z",
          completed_at: "2026-06-02T09:00:08Z",
          updated_at: "2026-06-02T09:00:08Z",
          type: "agent_message",
          text: "## 国际新闻简报\n\n- 多个来源已经交叉确认。",
        },
      ],
    });

    const call = mockStreamingRenderer.mock.calls.at(-1)?.[0] as
      | {
          rawContent?: string;
          contentParts?: Array<{
            type: string;
            text?: string;
            toolCall?: { name: string; arguments?: string; result?: unknown };
          }>;
        }
      | undefined;
    const contentParts = call?.contentParts || [];

    expect(contentParts.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "tool_use",
      "text",
    ]);
    expect(contentParts[0]?.text).toContain("我先联网核实今天的国际新闻");
    expect(contentParts[1]?.toolCall?.name).toBe("web_search");
    expect(contentParts[1]?.toolCall?.arguments).toContain(
      "today international news",
    );
    expect(contentParts[2]?.toolCall?.name).toBe("web_search");
    expect(contentParts[2]?.toolCall?.arguments).toContain("openPage");
    expect(contentParts[3]?.text).toContain("国际新闻简报");
    expect(contentParts[3]?.text).not.toContain("我先联网核实今天的国际新闻");
    expect(call?.rawContent).toContain("国际新闻简报");
    expect(call?.rawContent).toContain("我先联网核实今天的国际新闻");
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
  });

  it("内联高层工具过程不应吞掉不同工具名的底层执行轨迹", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-service-tool",
        role: "assistant",
        content: "文章已经保存到项目。",
        timestamp: now,
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "tool-service-1",
              name: "lime_run_service_skill",
              arguments: JSON.stringify({ skill_id: "x_article_export" }),
              status: "completed",
              result: { success: true, output: "saved" },
              startTime: now,
              endTime: now,
            },
          },
          {
            type: "text",
            text: "文章已经保存到项目。",
          },
        ],
      },
    ];

    render(messages, {
      currentTurnId: "turn-service-tool",
      turns: [
        {
          id: "turn-service-tool",
          thread_id: "thread-1",
          prompt_text: "继续保存文章",
          status: "completed",
          started_at: "2026-04-09T12:00:00Z",
          completed_at: "2026-04-09T12:00:05Z",
          created_at: "2026-04-09T12:00:00Z",
          updated_at: "2026-04-09T12:00:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-read-1",
          thread_id: "thread-1",
          turn_id: "turn-service-tool",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-09T12:00:01Z",
          completed_at: "2026-04-09T12:00:02Z",
          updated_at: "2026-04-09T12:00:02Z",
          type: "tool_call",
          tool_name: "Read",
          arguments: { file_path: "article.md" },
        },
        {
          id: "item-write-1",
          thread_id: "thread-1",
          turn_id: "turn-service-tool",
          sequence: 2,
          status: "completed",
          started_at: "2026-04-09T12:00:03Z",
          completed_at: "2026-04-09T12:00:04Z",
          updated_at: "2026-04-09T12:00:04Z",
          type: "tool_call",
          tool_name: "Write",
          arguments: { file_path: "article.md" },
        },
      ],
    });

    const rendererCall = findStreamingRendererCallByContent(
      "文章已经保存到项目。",
    );
    const toolNames = (rendererCall?.contentParts || [])
      .filter(isMockToolUsePart)
      .map((part) => part.toolCall.name);
    expect(toolNames).toEqual(["Read", "Write"]);
  });

  it("完成态 timeline 已有计划时应内联计划块并保留本地思考顺序", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-inline-process",
        role: "assistant",
        content: "已经整理完执行思路。",
        timestamp: now,
        contentParts: [
          {
            type: "thinking",
            text: "先对照用户截图，再确认 thread item 是否有重复来源。",
          },
          {
            type: "text",
            text: "已经整理完执行思路。",
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-inline-process",
      turns: [
        {
          id: "turn-inline-process",
          thread_id: "thread-1",
          prompt_text: "继续收口消息流",
          status: "completed",
          started_at: "2026-03-29T12:00:00Z",
          completed_at: "2026-03-29T12:00:03Z",
          created_at: "2026-03-29T12:00:00Z",
          updated_at: "2026-03-29T12:00:03Z",
        },
      ],
      threadItems: [
        {
          id: "item-inline-process-plan",
          thread_id: "thread-1",
          turn_id: "turn-inline-process",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-29T12:00:01Z",
          completed_at: "2026-03-29T12:00:02Z",
          updated_at: "2026-03-29T12:00:02Z",
          type: "plan",
          text: "1. 合并 assistant turn\n2. 收拢补充 timeline",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        renderProposedPlanBlocks: true,
        thinkingContent: undefined,
        contentParts: [
          {
            type: "thinking",
            text: "先对照用户截图，再确认 thread item 是否有重复来源。",
          },
          {
            type: "text",
            text:
              "<proposed_plan>\n" +
              "1. 合并 assistant turn\n" +
              "2. 收拢补充 timeline\n" +
              "</proposed_plan>",
          },
          { type: "text", text: "已经整理完执行思路。" },
        ],
      }),
    );
  });

});
