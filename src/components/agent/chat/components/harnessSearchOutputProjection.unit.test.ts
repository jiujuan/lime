import { describe, expect, it } from "vitest";
import type { HarnessOutputSignal } from "../utils/harnessState";
import {
  HARNESS_SEARCH_OUTPUT_VISIBLE_RESULT_LIMIT,
  buildHarnessSearchOutputProjection,
} from "./harnessSearchOutputProjection";

function buildSearchSignal(
  overrides: Partial<HarnessOutputSignal>,
): HarnessOutputSignal {
  return {
    id: "signal-search",
    toolCallId: "tool-search",
    toolName: "web_search",
    title: "联网检索摘要",
    summary: "2026年6月28日 国际新闻",
    ...overrides,
  };
}

describe("harnessSearchOutputProjection", () => {
  it("应从 legacy WebSearch JSON 包络中投影有效来源并隐藏原始诊断字段", () => {
    const signal = buildSearchSignal({
      content: JSON.stringify({
        metadata: {
          canonical: false,
          compat: true,
          source_event_ids: ["evt_de10722218cf484e8bf5e71b30d7a013"],
        },
        output: JSON.stringify({
          query: "2026年6月28日 国际新闻",
          results: [
            {
              tool_use_id: "web_search",
              content: [
                {
                  title: "Help",
                  url: "https://help.yahoo.com/kb/search-for-desktop",
                },
                {
                  title: "Yahoo Scout",
                  url: "https://scout.yahoo.com/chat?q=world+news",
                },
                {
                  title: "Reuters World News",
                  url: "https://www.reuters.com/world/",
                  summary: "Latest top stories",
                },
                {
                  title: "AP News World",
                  url: "https://apnews.com/world-news",
                  description: "Breaking world news",
                },
              ],
            },
          ],
        }),
        structuredContent: {
          web_search: {
            attempts: [{ provider: "multi_search_engine" }],
          },
        },
      }),
      preview:
        '{"metadata":{"source_event_ids":["evt_de10722218cf484e8bf5e71b30d7a013"]},"output":"[event_converter] 工具输出已截断"}',
    });

    const projection = buildHarnessSearchOutputProjection(signal);
    const renderedText = [
      projection.query,
      projection.previewText,
      ...projection.items.flatMap((item) => [
        item.title,
        item.url,
        item.snippet,
      ]),
    ]
      .filter(Boolean)
      .join("\n");

    expect(projection.resultCount).toBe(2);
    expect(projection.items).toEqual([
      expect.objectContaining({
        title: "Reuters World News",
        url: "https://www.reuters.com/world/",
        hostname: "reuters.com",
        snippet: "Latest top stories",
      }),
      expect.objectContaining({
        title: "AP News World",
        url: "https://apnews.com/world-news",
        hostname: "apnews.com",
        snippet: "Breaking world news",
      }),
    ]);
    expect(renderedText).not.toContain("source_event_ids");
    expect(renderedText).not.toContain("structuredContent");
    expect(renderedText).not.toContain("event_converter");
  });

  it("首屏结果应有硬上限，完整原文只作为详情可用状态保留", () => {
    const records = Array.from({ length: 9 }, (_, index) => ({
      title: `Result ${index + 1}`,
      url: `https://example.com/${index + 1}`,
    }));
    const signal = buildSearchSignal({
      content: JSON.stringify({ results: records }),
      preview: "短预览",
    });

    const projection = buildHarnessSearchOutputProjection(signal);

    expect(projection.resultCount).toBe(9);
    expect(projection.items).toHaveLength(
      HARNESS_SEARCH_OUTPUT_VISIBLE_RESULT_LIMIT,
    );
    expect(projection.rawDetailsAvailable).toBe(true);
  });

  it("无结构化结果时只保留短预览", () => {
    const signal = buildSearchSignal({
      preview: `${"长预览 ".repeat(120)}metadata source_event_ids`,
    });

    const projection = buildHarnessSearchOutputProjection(signal);

    expect(projection.items).toEqual([]);
    expect(projection.previewText?.length).toBeLessThanOrEqual(480);
    expect(projection.previewText?.endsWith("…")).toBe(true);
  });
});
