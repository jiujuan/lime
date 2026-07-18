import { describe, expect, it } from "vitest";
import type { ContentPart } from "../types";
import { coalesceAdjacentDisplayContentParts } from "./streamingContentPartSegments";

describe("coalesceAdjacentDisplayContentParts", () => {
  it("合并连续 text 和 thinking part，并保留工具作为边界", () => {
    const parts: ContentPart[] = [
      { type: "text", text: "第一段" },
      { type: "text", text: "继续" },
      {
        type: "thinking",
        text: "用户想",
      },
      {
        type: "thinking",
        text: "了解今天的国际新闻",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search-boundary",
          name: "web_search",
          arguments: "{}",
          status: "completed",
          startTime: new Date("2026-06-24T00:00:00.000Z"),
        },
      },
      { type: "text", text: "第二段" },
      { type: "text", text: "继续" },
    ];

    expect(coalesceAdjacentDisplayContentParts(parts)).toEqual([
      { type: "text", text: "第一段继续" },
      {
        type: "thinking",
        text: "用户想了解今天的国际新闻",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search-boundary",
          name: "web_search",
          arguments: "{}",
          status: "completed",
          startTime: new Date("2026-06-24T00:00:00.000Z"),
        },
      },
      { type: "text", text: "第二段继续" },
    ]);
  });

  it("增量 thinking 重叠时只保留最长连续文本", () => {
    const parts: ContentPart[] = [
      { type: "thinking", text: "先搜索 Reuters" },
      { type: "thinking", text: "Reuters 和 BBC" },
    ];

    expect(coalesceAdjacentDisplayContentParts(parts)).toEqual([
      { type: "thinking", text: "先搜索 Reuters 和 BBC" },
    ]);
  });

  it("thinking 快照被修订时只保留已完成的后一版，避免重复展示两段近似思考", () => {
    const parts: ContentPart[] = [
      {
        type: "thinking",
        text: "用户想要整理今天的国际新闻。今天是206年7月18日，我需要搜索最新的来提供准确的信息让我使用WebSearch来获取",
      },
      {
        type: "thinking",
        text: "用户想要整理今天的国际新闻。今天是2026年7月18日，我需要搜索最新的国际新闻来提供准确的信息。让我使用WebSearch来获取最新的国际新闻。",
      },
    ];

    expect(coalesceAdjacentDisplayContentParts(parts)).toEqual([
      {
        type: "thinking",
        text: "用户想要整理今天的国际新闻。今天是2026年7月18日，我需要搜索最新的国际新闻来提供准确的信息。让我使用WebSearch来获取最新的国际新闻。",
      },
    ]);
  });

  it("Markdown 强调形态相同的 thinking 不应重复拼接", () => {
    const parts: ContentPart[] = [
      { type: "thinking", text: "**Crafting concise cheeky greeting**" },
      { type: "thinking", text: "Crafting concise cheeky greeting" },
    ];

    const merged = coalesceAdjacentDisplayContentParts(parts);

    expect(merged).toEqual([
      { type: "thinking", text: "**Crafting concise cheeky greeting**" },
    ]);
  });

  it("相邻最终正文 text 相同但 Markdown 形态不同时只渲染一次", () => {
    const finalText = "你好。直接说事，我来处理，省得我们俩先拿空气开会。";
    const parts: ContentPart[] = [
      { type: "text", text: finalText },
      { type: "text", text: `**${finalText}**` },
    ];

    const merged = coalesceAdjacentDisplayContentParts(parts);

    expect(merged).toEqual([{ type: "text", text: finalText }]);
  });

  it("带事件 metadata 的相邻 text part 应保留独立边界", () => {
    const parts: ContentPart[] = [
      {
        type: "text",
        text: "我会先联网核实今天的主要国际新闻。",
        metadata: { source: "agent_thread_item", sequence: 1 },
      },
      {
        type: "text",
        text: "我再补一个交叉对照。",
        metadata: { source: "agent_thread_item", sequence: 7 },
      },
    ];

    expect(coalesceAdjacentDisplayContentParts(parts)).toBe(parts);
  });

  it("没有连续同类 part 时保持原数组引用，避免制造无意义重渲染", () => {
    const parts: ContentPart[] = [
      { type: "text", text: "第一段" },
      {
        type: "thinking",
        text: "中间思考",
      },
      { type: "text", text: "第二段" },
    ];

    expect(coalesceAdjacentDisplayContentParts(parts)).toBe(parts);
  });
});
