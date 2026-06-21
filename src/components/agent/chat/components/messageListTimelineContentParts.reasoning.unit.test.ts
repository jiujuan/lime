import { describe, expect, it } from "vitest";

import { buildTimelineInlineContentParts } from "./messageListTimelineContentParts";
import {
  buildThreadItems,
  TOOL_FETCH_START_TIME,
  TOOL_START_TIME,
  type Message,
} from "./messageListTimelineContentParts.testHarness";

describe("messageListTimelineContentParts reasoning merge", () => {
  it("已有内联思考时不应再插入重复的持久化 reasoning", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "thinking",
        text: "先拆解历史恢复的消息结构。",
      },
      {
        type: "text",
        text: "总结完成。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "总结完成。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-duplicate-inline-thinking",
          type: "reasoning",
          turn_id: "turn-duplicate-inline-thinking",
          sequence: 1,
          text: "先拆解历史恢复的消息结构。",
          status: "completed",
          started_at: "2026-06-20T10:00:00.500Z",
          completed_at: "2026-06-20T10:00:01.000Z",
          updated_at: "2026-06-20T10:00:01.000Z",
        },
      ]),
    });

    expect(contentParts).toBeUndefined();
  });

  it("已有工具过程时应把唯一稀疏 reasoning 按时间插入同一流程", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T10:00:00.000Z"),
          endTime: new Date("2026-06-20T10:00:00.200Z"),
        },
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-fetch",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T10:00:01.000Z"),
          endTime: new Date("2026-06-20T10:00:01.200Z"),
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-between-web-tools",
          type: "reasoning",
          turn_id: "turn-between-web-tools",
          sequence: 2,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T10:00:00.500Z",
          completed_at: "2026-06-20T10:00:00.800Z",
          updated_at: "2026-06-20T10:00:00.800Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("实时工具过程缺少时间戳时应按 timeline sequence 插入稀疏 reasoning", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search-sequence",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          startTime: TOOL_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-fetch-sequence",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          startTime: TOOL_FETCH_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-between-web-tools-by-sequence",
          type: "reasoning",
          turn_id: "turn-between-web-tools-by-sequence",
          sequence: 2,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "in_progress",
          started_at: "2026-06-20T12:00:00.200Z",
          updated_at: "2026-06-20T12:00:00.200Z",
        },
        {
          id: "runtime-summary-web-tools-sequence",
          type: "turn_summary",
          turn_id: "turn-between-web-tools-by-sequence",
          sequence: 4,
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T12:00:00.000Z",
          completed_at: "2026-06-20T12:00:00.500Z",
          updated_at: "2026-06-20T12:00:00.500Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("完成态 hydrate 后应使用工具 content part metadata sequence 插入 WebSearch 中间 reasoning", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        metadata: { sequence: 2 },
        toolCall: {
          id: "tool-search-metadata-sequence",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          startTime: TOOL_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "tool_use",
        metadata: { sequence: 4 },
        toolCall: {
          id: "tool-fetch-metadata-sequence",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          startTime: TOOL_FETCH_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-between-web-tools-after-hydrate",
          type: "reasoning",
          turn_id: "turn-between-web-tools-after-hydrate",
          sequence: 3,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "",
          completed_at: "",
          updated_at: "",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[0]).toMatchObject({
      type: "tool_use",
      metadata: { sequence: 2 },
    });
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("turn_summary 不应阻断已有工具过程中的稀疏 reasoning 合并", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search-with-summary",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T11:00:00.000Z"),
          endTime: new Date("2026-06-20T11:00:00.200Z"),
        },
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-fetch-with-summary",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T11:00:01.000Z"),
          endTime: new Date("2026-06-20T11:00:01.200Z"),
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "runtime-summary-web-tools",
          type: "turn_summary",
          turn_id: "turn-web-tools-with-summary",
          sequence: 1,
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T11:00:00.000Z",
          completed_at: "2026-06-20T11:00:02.000Z",
          updated_at: "2026-06-20T11:00:02.000Z",
        },
        {
          id: "reasoning-web-tools-with-summary",
          type: "reasoning",
          turn_id: "turn-web-tools-with-summary",
          sequence: 2,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T11:00:00.500Z",
          completed_at: "2026-06-20T11:00:00.800Z",
          updated_at: "2026-06-20T11:00:00.800Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
  });

  it("完整 WebSearch timeline 已有工具项时仍应把中间 reasoning 合并进内联工具过程", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        metadata: { sequence: 2 },
        toolCall: {
          id: "tool-search-complete-timeline",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T13:00:00.000Z"),
          endTime: new Date("2026-06-20T13:00:00.200Z"),
        },
      },
      {
        type: "tool_use",
        metadata: { sequence: 4 },
        toolCall: {
          id: "tool-fetch-complete-timeline",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T13:00:01.000Z"),
          endTime: new Date("2026-06-20T13:00:01.200Z"),
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "tool-search-complete-timeline",
          type: "tool_call",
          tool_name: "WebSearch",
          arguments: { query: "Lime WebSearch rendering" },
          output: "",
          success: true,
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 2,
          status: "completed",
          started_at: "2026-06-20T13:00:00.000Z",
          completed_at: "2026-06-20T13:00:00.200Z",
          updated_at: "2026-06-20T13:00:00.200Z",
          metadata: { sequence: 2 },
        },
        {
          id: "reasoning-complete-web-tools",
          type: "reasoning",
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 3,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T13:00:00.500Z",
          completed_at: "2026-06-20T13:00:00.800Z",
          updated_at: "2026-06-20T13:00:00.800Z",
        },
        {
          id: "tool-fetch-complete-timeline",
          type: "tool_call",
          tool_name: "WebFetch",
          arguments: {
            url: "https://example.com/lime-websearch-rendering",
          },
          output: "",
          success: true,
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 4,
          status: "completed",
          started_at: "2026-06-20T13:00:01.000Z",
          completed_at: "2026-06-20T13:00:01.200Z",
          updated_at: "2026-06-20T13:00:01.200Z",
          metadata: { sequence: 4 },
        },
        {
          id: "runtime-summary-complete-web-tools",
          type: "turn_summary",
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 5,
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T13:00:00.000Z",
          completed_at: "2026-06-20T13:00:01.500Z",
          updated_at: "2026-06-20T13:00:01.500Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });
});
