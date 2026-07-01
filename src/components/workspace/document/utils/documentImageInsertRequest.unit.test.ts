import { describe, expect, it } from "vitest";
import type { CanvasImageInsertRequest } from "@/lib/canvasImageInsertBus";
import {
  applyDocumentImageInsertRequest,
  hasDocumentImageInsertPlacement,
} from "./documentImageInsertRequest";
import { upsertDocumentImageTaskPlaceholder } from "./imageTaskPlaceholder";

function createRequest(
  overrides: Partial<CanvasImageInsertRequest>,
): CanvasImageInsertRequest {
  return {
    requestId: "request-1",
    createdAt: Date.now(),
    projectId: "project-1",
    contentId: "content-1",
    canvasType: "document",
    anchorHint: "section_end",
    source: "manual",
    image: {
      id: "image-1",
      previewUrl: "https://example.com/generated.png",
      contentUrl: "https://example.com/generated.png",
      title: "正文配图",
    },
    ...overrides,
  };
}

describe("documentImageInsertRequest", () => {
  it("带 slot 的请求应原位替换占位块，而不是追加到文末", () => {
    const markdown = `# 标题

![旧占位](pending-image-task://task-old?status=running&prompt=%E6%AD%A3%E6%96%87%E9%85%8D%E5%9B%BE)
<!-- lime:image-task-slot:hero -->

文末内容。`;

    const result = applyDocumentImageInsertRequest(
      markdown,
      createRequest({
        taskId: "task-new",
        slotId: "hero",
        sectionTitle: "标题",
      }),
    );

    expect(result.changed).toBe(true);
    expect(result.locationLabel).toBe("文档指定配图位");
    expect(result.content).toContain(
      "![旧占位](https://example.com/generated.png)",
    );
    expect(result.content).toContain("lime:image-task-slot:hero");
    expect(
      result.content.match(/https:\/\/example\.com\/generated\.png/g),
    ).toHaveLength(1);
    expect(result.content).not.toContain("pending-image-task://");
  });

  it("缺少 slot marker 时应按选中文本锚点插入", () => {
    const markdown = `# 标题

## 核心观点
这里是被选中的核心观点段落。

这里是核心观点补充说明。`;

    const result = applyDocumentImageInsertRequest(
      markdown,
      createRequest({
        taskId: "task-anchor",
        sectionTitle: "核心观点",
        anchorText: "这里是被选中的核心观点段落。",
      }),
    );

    const imageIndex = result.content.indexOf(
      "https://example.com/generated.png",
    );
    expect(result.changed).toBe(true);
    expect(result.locationLabel).toBe("文档选中文本附近");
    expect(imageIndex).toBeGreaterThan(
      result.content.indexOf("被选中的核心观点段落"),
    );
    expect(imageIndex).toBeLessThan(result.content.indexOf("核心观点补充说明"));
  });

  it("没有定位元数据的请求保持普通文末插入语义", () => {
    const markdown = "# 标题\n\n正文。";
    const request = createRequest({
      taskId: null,
      slotId: null,
      sectionTitle: null,
      anchorText: null,
    });

    expect(hasDocumentImageInsertPlacement(request)).toBe(false);
    const result = applyDocumentImageInsertRequest(markdown, request);

    expect(result.changed).toBe(true);
    expect(result.locationLabel).toBe("文档正文末尾");
    expect(result.content).toContain(
      "![正文配图](https://example.com/generated.png)",
    );
    expect(result.content.indexOf("正文。")).toBeLessThan(
      result.content.indexOf("https://example.com/generated.png"),
    );
  });

  it("失败或取消占位更新不应写入成功图片 URL", () => {
    const running = `# 标题

![正文配图](pending-image-task://task-inline?status=running&prompt=%E6%AD%A3%E6%96%87%E9%85%8D%E5%9B%BE)
<!-- lime:image-task-slot:hero -->`;

    const failed = upsertDocumentImageTaskPlaceholder(running, {
      taskId: "task-inline",
      prompt: "正文配图",
      status: "failed",
      slotId: "hero",
    });
    const cancelled = upsertDocumentImageTaskPlaceholder(running, {
      taskId: "task-inline",
      prompt: "正文配图",
      status: "cancelled",
      slotId: "hero",
    });

    expect(failed).toContain("status=failed");
    expect(cancelled).toContain("status=cancelled");
    expect(failed).not.toContain("https://example.com/generated.png");
    expect(cancelled).not.toContain("https://example.com/generated.png");
  });
});
