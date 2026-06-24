import { describe, expect, it } from "vitest";
import {
  mergeHydratedContentParts,
  mergeHydratedToolStateContentParts,
} from "./agentChatHistoryProcess";

const WEB_SEARCH_START_TIME = new Date("2026-06-22T01:00:00.000Z");
const WEB_FETCH_START_TIME = new Date("2026-06-22T01:00:02.000Z");

describe("agentChatHistoryProcess", () => {
  it("远端 hydrate 新增 commentary text 时应按 sequence 插入工具过程前", () => {
    const merged = mergeHydratedContentParts(
      [
        {
          type: "tool_use",
          toolCall: {
            id: "web-search",
            name: "WebSearch",
            arguments: '{"query":"Lime WebSearch rendering"}',
            status: "completed",
            startTime: WEB_SEARCH_START_TIME,
          },
          metadata: {
            sequence: 3,
          },
        },
        { type: "text", text: "网页搜索渲染结论：最终正文。" },
      ],
      [
        {
          type: "text",
          text: "我先联网核实目标页面来源。",
          metadata: {
            source: "agent_thread_item",
            threadItemId: "agent-message-commentary",
            phase: "commentary",
            sequence: 2,
            turnId: "turn-web-tools",
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "web-search",
            name: "WebSearch",
            arguments: '{"query":"Lime WebSearch rendering"}',
            status: "completed",
            startTime: WEB_SEARCH_START_TIME,
          },
          metadata: {
            sequence: 3,
          },
        },
        { type: "text", text: "网页搜索渲染结论：最终正文。" },
      ],
    );

    expect(merged?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);
    expect(merged?.[0]).toMatchObject({
      type: "text",
      text: "我先联网核实目标页面来源。",
      metadata: {
        threadItemId: "agent-message-commentary",
        phase: "commentary",
        sequence: 2,
      },
    });
  });

  it("合并远端 WebTools hydrate 时应保留本地导语在工具过程前", () => {
    const merged = mergeHydratedContentParts(
      [
        { type: "text", text: "我先联网核实目标页面来源。" },
        {
          type: "tool_use",
          toolCall: {
            id: "web-search",
            name: "WebSearch",
            arguments: '{"query":"Lime WebSearch rendering"}',
            status: "running",
            startTime: WEB_SEARCH_START_TIME,
          },
          metadata: {
            sequence: 2,
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "web-fetch",
            name: "WebFetch",
            arguments:
              '{"url":"https://example.com/lime-websearch-rendering"}',
            status: "running",
            startTime: WEB_FETCH_START_TIME,
          },
          metadata: {
            sequence: 4,
          },
        },
        { type: "text", text: "网页搜索渲染结论：最终正文。" },
      ],
      [
        {
          type: "tool_use",
          toolCall: {
            id: "web-search",
            name: "WebSearch",
            arguments: '{"query":"Lime WebSearch rendering"}',
            status: "completed",
            startTime: WEB_SEARCH_START_TIME,
            result: {
              success: true,
              output: "source",
            },
          },
          metadata: {
            sequence: 2,
          },
        },
        {
          type: "thinking",
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          metadata: {
            source: "thread_item_reasoning",
            threadItemId: "reasoning-web-tools",
            sequence: 3,
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "web-fetch",
            name: "WebFetch",
            arguments:
              '{"url":"https://example.com/lime-websearch-rendering"}',
            status: "completed",
            startTime: WEB_FETCH_START_TIME,
            result: {
              success: true,
              output: "page",
            },
          },
          metadata: {
            sequence: 4,
          },
        },
        {
          type: "text",
          text: "网页搜索渲染结论：最终正文。",
        },
      ],
    );

    expect(merged?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(merged?.[0]).toMatchObject({
      type: "text",
      text: "我先联网核实目标页面来源。",
    });
    expect(merged?.[1]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "web-search",
        status: "completed",
      },
    });
    expect(merged?.[2]).toMatchObject({
      type: "thinking",
      metadata: {
        threadItemId: "reasoning-web-tools",
      },
    });
    expect(merged?.[3]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "web-fetch",
        status: "completed",
      },
    });
  });

  it("远端 hydrate 新增的工具应插入最终正文前，而不是追加到消息尾部", () => {
    const merged = mergeHydratedContentParts(
      [
        { type: "text", text: "我先联网核实目标页面来源。" },
        {
          type: "tool_use",
          toolCall: {
            id: "web-fetch",
            name: "WebFetch",
            arguments:
              '{"url":"https://example.com/lime-websearch-rendering"}',
            status: "completed",
            startTime: WEB_FETCH_START_TIME,
          },
        },
        { type: "text", text: "网页搜索渲染结论：最终正文。" },
      ],
      [
        {
          type: "tool_use",
          toolCall: {
            id: "web-search",
            name: "WebSearch",
            arguments: '{"query":"Lime WebSearch rendering"}',
            status: "completed",
            startTime: WEB_SEARCH_START_TIME,
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "web-fetch",
            name: "WebFetch",
            arguments:
              '{"url":"https://example.com/lime-websearch-rendering"}',
            status: "completed",
            startTime: WEB_FETCH_START_TIME,
          },
        },
        {
          type: "text",
          text: "网页搜索渲染结论：最终正文。",
        },
      ],
    );

    expect(merged?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "tool_use",
      "text",
    ]);
    expect(merged?.[1]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "web-search",
      },
    });
    expect(merged?.[2]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "web-fetch",
      },
    });
  });

  it("保留本地可见输出时应合入远端持久化 reasoning，且不重复 final text", () => {
    const merged = mergeHydratedToolStateContentParts(
      [
        { type: "text", text: "我先联网核实目标页面来源。" },
        {
          type: "tool_use",
          toolCall: {
            id: "web-search",
            name: "WebSearch",
            arguments: '{"query":"Lime WebSearch rendering"}',
            status: "running",
            startTime: WEB_SEARCH_START_TIME,
          },
          metadata: {
            sequence: 2,
          },
        },
        { type: "text", text: "网页搜索渲染结论：最终正文。" },
      ],
      [
        {
          type: "tool_use",
          toolCall: {
            id: "web-search",
            name: "WebSearch",
            arguments: '{"query":"Lime WebSearch rendering"}',
            status: "completed",
            startTime: WEB_SEARCH_START_TIME,
            result: {
              success: true,
              output: "source",
            },
          },
          metadata: {
            sequence: 2,
          },
        },
        {
          type: "thinking",
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          metadata: {
            source: "thread_item_reasoning",
            threadItemId: "reasoning-web-tools",
            sequence: 3,
          },
        },
        {
          type: "text",
          text: "网页搜索渲染结论：最终正文。",
        },
      ],
    );

    expect(merged?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "thinking",
      "text",
    ]);
    expect(merged?.[0]).toMatchObject({
      type: "text",
      text: "我先联网核实目标页面来源。",
    });
    expect(merged?.[1]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "web-search",
        status: "completed",
      },
    });
    expect(merged?.[2]).toMatchObject({
      type: "thinking",
      metadata: {
        threadItemId: "reasoning-web-tools",
      },
    });
  });
});
