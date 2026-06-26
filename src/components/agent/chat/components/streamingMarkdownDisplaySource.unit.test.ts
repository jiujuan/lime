import { describe, expect, it } from "vitest";

import { resolveStreamingMarkdownDisplaySource } from "./streamingMarkdownDisplaySource";

describe("streamingMarkdownDisplaySource", () => {
  it("流式内容应把未完成行保留为即时 tail", () => {
    expect(resolveStreamingMarkdownDisplaySource("首字", true)).toEqual({
      markdown: "",
      pendingTail: "首字",
    });

    expect(
      resolveStreamingMarkdownDisplaySource("第一行\n第二行", true),
    ).toEqual({
      markdown: "第一行\n",
      pendingTail: "第二行",
    });
  });

  it("完成态应把全部内容交给 Markdown renderer", () => {
    expect(
      resolveStreamingMarkdownDisplaySource("第一行\n第二行", false),
    ).toEqual({
      markdown: "第一行\n第二行",
      pendingTail: "",
    });
  });

  it("结构化流式内容应保留给结构化解析器处理", () => {
    expect(resolveStreamingMarkdownDisplaySource("<a2ui", true)).toEqual({
      markdown: "<a2ui",
      pendingTail: "",
    });
  });
});
