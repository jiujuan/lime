import { describe, expect, it, vi } from "vitest";
import { createInitialDocumentState } from "@/components/workspace/canvas/canvasUtils";
import {
  applyDocumentInlineImageTaskSync,
  syncDocumentInlineImageTask,
} from "./workspaceDocumentInlineImageTaskSync";

function createTaskRecord(overrides: Record<string, unknown> = {}) {
  return {
    task_id: "task-inline",
    task_type: "image_generate",
    task_family: "image",
    status: "completed",
    normalized_status: "succeeded",
    relationships: {
      slot_id: "hero",
    },
    payload: {
      prompt: "正文配图",
      usage: "document-inline",
      anchor_section_title: "核心观点",
      anchor_text: "核心观点段落",
    },
    ...overrides,
  };
}

describe("workspaceDocumentInlineImageTaskSync", () => {
  it("应按每张 output 的 slotId 替换多个文稿配图位", () => {
    const markdown = `# 标题

![首图](pending-image-task://old-hero?status=running&prompt=%E9%A6%96%E5%9B%BE)
<!-- lime:image-task-slot:hero -->

## 核心观点
核心观点段落

![细节图](pending-image-task://old-detail?status=running&prompt=%E7%BB%86%E8%8A%82%E5%9B%BE)
<!-- lime:image-task-slot:detail -->`;

    const next = applyDocumentInlineImageTaskSync(markdown, {
      taskId: "task-inline",
      taskRecord: createTaskRecord(),
      outputs: [
        {
          url: "https://example.com/hero.png",
          prompt: "首图",
          slotId: "hero",
        },
        {
          url: "https://example.com/detail.png",
          prompt: "细节图",
          slotId: "detail",
        },
      ],
    });

    expect(next).toContain("![首图](https://example.com/hero.png)");
    expect(next).toContain("![细节图](https://example.com/detail.png)");
    expect(next).toContain("lime:image-task-slot:hero");
    expect(next).toContain("lime:image-task-slot:detail");
    expect(next).not.toContain("pending-image-task://");
  });

  it("失败状态只更新占位状态，不应写入成功图片", () => {
    const markdown = `# 标题

![首图](pending-image-task://task-inline?status=running&prompt=%E9%A6%96%E5%9B%BE)
<!-- lime:image-task-slot:hero -->`;

    const next = applyDocumentInlineImageTaskSync(markdown, {
      taskId: "task-inline",
      taskRecord: createTaskRecord({
        status: "failed",
        normalized_status: "failed",
      }),
      outputs: [
        {
          url: "https://example.com/should-not-appear.png",
          prompt: "首图",
          slotId: "hero",
        },
      ],
    });

    expect(next).toContain("status=failed");
    expect(next).toContain("pending-image-task://");
    expect(next).not.toContain("should-not-appear");
  });

  it("hook 接线应保持 document canvas 类型并只在内容变化时返回新状态", () => {
    const setCanvasState = vi.fn((updater) => {
      const previous = createInitialDocumentState(`# 标题

![首图](pending-image-task://task-inline?status=running&prompt=%E9%A6%96%E5%9B%BE)
<!-- lime:image-task-slot:hero -->`);
      return updater(previous);
    });

    const next = syncDocumentInlineImageTask({
      taskId: "task-inline",
      taskRecord: createTaskRecord(),
      outputs: [
        {
          url: "https://example.com/hero.png",
          prompt: "首图",
          slotId: "hero",
        },
      ],
      setCanvasState,
    });

    expect(next).toBeUndefined();
    expect(setCanvasState).toHaveBeenCalledWith(expect.any(Function));
    const updated = setCanvasState.mock.results[0]?.value;
    expect(updated).toMatchObject({
      type: "document",
      content: expect.stringContaining("https://example.com/hero.png"),
    });
  });
});
