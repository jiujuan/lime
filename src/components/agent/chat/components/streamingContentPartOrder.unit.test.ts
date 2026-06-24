import { describe, expect, it } from "vitest";
import type { ContentPart } from "../types";
import { orderStreamingContentPartsForDisplay } from "./streamingContentPartOrder";

function toolPart(id: string, sequence?: number): ContentPart {
  return {
    type: "tool_use",
    ...(sequence !== undefined ? { metadata: { sequence } } : {}),
    toolCall: {
      id,
      name: id,
      arguments: "{}",
      status: "completed",
      startTime: new Date("2026-06-24T00:00:00.000Z"),
    },
  };
}

describe("orderStreamingContentPartsForDisplay", () => {
  it("带 sequence 的文本应与工具过程按事件序展示", () => {
    const firstText: ContentPart = {
      type: "text",
      text: "第一段",
      metadata: { source: "agent_text_delta", sequence: 1 },
    };
    const secondText: ContentPart = {
      type: "text",
      text: "第二段",
      metadata: { source: "agent_text_delta", sequence: 7 },
    };
    const search = toolPart("web_search", 2);
    const fetch = toolPart("WebFetch", 5);

    expect(
      orderStreamingContentPartsForDisplay([
        search,
        fetch,
        firstText,
        secondText,
      ]),
    ).toEqual([firstText, search, fetch, secondText]);
  });

  it("缺少 sequence 的普通文本仍应作为排序边界", () => {
    const unsequencedText: ContentPart = {
      type: "text",
      text: "旧历史文本",
    };
    const laterTool = toolPart("later", 3);
    const earlierTool = toolPart("earlier", 1);

    expect(
      orderStreamingContentPartsForDisplay([
        laterTool,
        unsequencedText,
        earlierTool,
      ]),
    ).toEqual([laterTool, unsequencedText, earlierTool]);
  });

  it("任一过程 part 缺少 sequence 时不跨到达顺序重排", () => {
    const sequencedTool = toolPart("sequenced", 3);
    const unsequencedTool = toolPart("unsequenced");
    const earlyText: ContentPart = {
      type: "text",
      text: "早期文本",
      metadata: { source: "agent_text_delta", sequence: 1 },
    };

    expect(
      orderStreamingContentPartsForDisplay([
        sequencedTool,
        unsequencedTool,
        earlyText,
      ]),
    ).toEqual([sequencedTool, unsequencedTool, earlyText]);
  });
});
