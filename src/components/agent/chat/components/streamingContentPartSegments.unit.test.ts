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
