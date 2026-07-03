import { describe, expect, it } from "vitest";
import { parseInlineHostCommandShortcodes } from "./inlineHostCommandShortcodes";

describe("inlineHostCommandShortcodes", () => {
  it("应把文章中的 @配图 shortcode 解析成 document-inline host command request", () => {
    const markdown = [
      "# 广州夏天",
      "",
      "## 花城大道",
      "",
      "这里是午后街景段落。",
      "",
      "[@配图 一张广州夏天午后的城市照片，阳光明亮，街边绿树和高楼，真实摄影风格，前景有广州塔珠江新城的花城大道]",
    ].join("\n");

    const result = parseInlineHostCommandShortcodes(markdown);

    expect(result.requests).toEqual([
      expect.objectContaining({
        commandKey: "image_generate",
        commandName: "配图",
        prompt:
          "一张广州夏天午后的城市照片，阳光明亮，街边绿树和高楼，真实摄影风格，前景有广州塔珠江新城的花城大道",
        slotId: "article-image-slot-1",
        anchorSectionTitle: "花城大道",
        anchorText: "这里是午后街景段落。",
      }),
    ]);
    expect(result.materializedMarkdown).toContain(
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    );
    expect(result.materializedMarkdown).not.toContain("[@配图");
  });

  it("不应解析代码块、inline code、链接和图片 alt 中的 shortcode", () => {
    const markdown = [
      "```md",
      "[@配图 代码块里不处理]",
      "```",
      "",
      "这是一段 `[@配图 inline code 不处理]`。",
      "",
      "链接 [@配图 链接文本不处理](https://example.com)。",
      "",
      "图片 ![@配图 alt 不处理](https://example.com/a.png)。",
      "",
      "[@配图 只处理这一条]",
    ].join("\n");

    const result = parseInlineHostCommandShortcodes(markdown);

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.prompt).toBe("只处理这一条");
    expect(result.materializedMarkdown).toContain(
      "`[@配图 inline code 不处理]`",
    );
    expect(result.materializedMarkdown).toContain(
      "[@配图 链接文本不处理](https://example.com)",
    );
    expect(result.materializedMarkdown).toContain(
      "![@配图 alt 不处理](https://example.com/a.png)",
    );
  });

  it("默认最多处理三条配图 shortcode，剩余占位保持原文", () => {
    const markdown = [
      "[@配图 第一张]",
      "[@配图 第二张]",
      "[@配图 第三张]",
      "[@配图 第四张]",
    ].join("\n");

    const result = parseInlineHostCommandShortcodes(markdown);

    expect(result.requests.map((request) => request.slotId)).toEqual([
      "article-image-slot-1",
      "article-image-slot-2",
      "article-image-slot-3",
    ]);
    expect(result.skippedImageCommandCount).toBe(1);
    expect(result.materializedMarkdown).toContain("[@配图 第四张]");
  });

  it("已有正文 slot 时新增 shortcode 应使用下一个可用 slot，避免覆盖旧图", () => {
    const markdown = [
      "# 标题",
      "",
      "![已有配图](https://example.com/old.png)",
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
      "",
      "[@配图 第二张图]",
    ].join("\n");

    const result = parseInlineHostCommandShortcodes(markdown);

    expect(result.requests.map((request) => request.slotId)).toEqual([
      "article-image-slot-2",
    ]);
    expect(result.materializedMarkdown).toContain(
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    );
    expect(result.materializedMarkdown).toContain(
      "<!-- lime:image-task-slot:article-image-slot-2 -->",
    );
  });
});
