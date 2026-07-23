import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Message } from "../types";
import {
  buildImageWorkbenchPreviewResourceManagerInput,
  importImageWorkbenchOutputToResource,
  resolveImageWorkbenchPreviewImages,
} from "./imageWorkbenchResourceManager";

const materialMocks = vi.hoisted(() => ({
  importMaterialFromUrl: vi.fn(),
}));

vi.mock("@/lib/api/materials", () => ({
  importMaterialFromUrl: materialMocks.importMaterialFromUrl,
}));

describe("imageWorkbenchResourceManager", () => {
  beforeEach(async () => {
    await changeLimeLocale("zh-CN");
    localStorage.clear();
    materialMocks.importMaterialFromUrl.mockReset();
    materialMocks.importMaterialFromUrl.mockResolvedValue({
      id: "material-image-1",
    });
  });

  it("当前图片任务输出应直接按 URL 导入资源库", async () => {
    await expect(
      importImageWorkbenchOutputToResource({
        projectId: " project-1 ",
        output: {
          id: "task-image-1:output:1",
          taskId: "task-image-1",
          hookImageId: "task-image-1:hook:1",
          refId: "img-task-image-1-1",
          url: " https://example.com/image-1.png ",
          prompt: "青柠/主图",
          createdAt: new Date("2026-05-14T00:00:00.000Z").getTime(),
          providerName: "GPT Images",
          modelName: "gpt-image-2",
          size: "1024x1024",
          applyTarget: null,
        },
      }),
    ).resolves.toEqual({ materialId: "material-image-1" });

    expect(materialMocks.importMaterialFromUrl).toHaveBeenCalledWith({
      projectId: "project-1",
      name: expect.stringMatching(/^青柠 主图-\d{8}-\d{6}\.png$/),
      type: "image",
      url: "https://example.com/image-1.png",
      tags: ["image-gen"],
    });
  });

  it("消息内图片点击应构造资源管理器会话并按点击图片定位", () => {
    const message: Message = {
      id: "message-image-preview",
      role: "assistant",
      content: "已生成图片",
      timestamp: new Date("2026-05-14T00:00:00.000Z"),
      imageWorkbenchPreview: {
        taskId: "task-preview",
        prompt: "章节配图",
        status: "complete",
        imageUrl: "https://example.com/cover.png",
        previewImages: [
          "https://example.com/cover.png",
          "https://example.com/chapter-2.png",
        ],
        providerName: "GPT Images",
        modelName: "gpt-image-2",
        projectId: "project-1",
        contentId: "content-1",
      },
    };

    const input = buildImageWorkbenchPreviewResourceManagerInput({
      message,
      preview: message.imageWorkbenchPreview!,
      selection: {
        imageUrl: "https://example.com/chapter-2.png",
        imageIndex: 1,
      },
      threadId: "thread-1",
    });

    expect(input).toMatchObject({
      sourceLabel: "图片生成",
      initialIndex: 1,
      sourceContext: {
        kind: "image_task",
        taskId: "task-preview",
        projectId: "project-1",
        contentId: "content-1",
        threadId: "thread-1",
        messageId: "message-image-preview",
        sourcePage: "message-image-preview",
      },
    });
    expect(input?.items).toHaveLength(2);
    expect(input?.items[1]).toMatchObject({
      kind: "image",
      src: "https://example.com/chapter-2.png",
      sourceContext: {
        kind: "image_task",
        outputId: "task-preview:preview-2",
        messageId: "message-image-preview",
      },
    });
  });

  it("消息卡根区域打开时也应进入资源管理器并默认定位首张图", () => {
    const message: Message = {
      id: "message-image-preview-root",
      role: "assistant",
      content: "已生成图片",
      timestamp: new Date("2026-05-14T00:00:00.000Z"),
      imageWorkbenchPreview: {
        taskId: "task-preview-root",
        prompt: "章节配图",
        status: "complete",
        imageUrl: "https://example.com/chapter-1.png",
        previewImages: [
          "https://example.com/chapter-1.png",
          "https://example.com/chapter-2.png",
        ],
        projectId: "project-1",
        contentId: "content-1",
      },
    };

    const input = buildImageWorkbenchPreviewResourceManagerInput({
      message,
      preview: message.imageWorkbenchPreview!,
      threadId: "thread-1",
    });

    expect(input).toMatchObject({
      initialIndex: 0,
      sourceContext: {
        kind: "image_task",
        taskId: "task-preview-root",
        threadId: "thread-1",
        messageId: "message-image-preview-root",
        sourcePage: "message-image-preview",
      },
    });
    expect(input?.items.map((item) => item.src)).toEqual([
      "https://example.com/chapter-1.png",
      "https://example.com/chapter-2.png",
    ]);
  });

  it("预览图片列表应按展示顺序去重，避免点击后续图片回到第一张", () => {
    expect(
      resolveImageWorkbenchPreviewImages({
        taskId: "task-preview",
        prompt: "青柠",
        status: "complete",
        imageUrl: "https://example.com/main.png",
        previewImages: [
          "https://example.com/a.png",
          "https://example.com/main.png",
          "https://example.com/a.png",
        ],
      }),
    ).toEqual(["https://example.com/a.png", "https://example.com/main.png"]);
  });

  it("没有可用图片时不打开资源管理器，交给工作台兜底", () => {
    const message: Message = {
      id: "message-without-image",
      role: "assistant",
      content: "生成失败",
      timestamp: new Date("2026-05-14T00:00:00.000Z"),
    };

    expect(
      buildImageWorkbenchPreviewResourceManagerInput({
        message,
        preview: {
          taskId: "task-failed",
          prompt: "青柠",
          status: "failed",
        },
      }),
    ).toBeNull();
  });
});
