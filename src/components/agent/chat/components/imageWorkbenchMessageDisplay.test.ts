import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import {
  resolveImageWorkbenchMessageDisplayState,
  resolveImageWorkbenchProcessDisplayState,
  resolveImageWorkbenchRendererProcessState,
} from "./imageWorkbenchMessageDisplay";

function createImageMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "assistant-image-message",
    role: "assistant",
    content: "图片任务已提交，正在生成。",
    timestamp: new Date("2026-05-14T08:00:00.000Z"),
    imageWorkbenchPreview: {
      taskId: "task-image-1",
      prompt: "青柠插画",
      status: "running",
    },
    ...overrides,
  };
}

describe("imageWorkbenchMessageDisplay", () => {
  it("图片任务协议正文应被移出可见正文，但预览态过程仍可见", () => {
    const message = createImageMessage({
      contentParts: [
        { type: "thinking", text: "先确认青柠插画风格。" },
        { type: "text", text: "图片任务已提交，正在生成。" },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-image-1",
            name: "lime_create_image_generation_task",
            arguments: JSON.stringify({ prompt: "青柠插画" }),
            status: "completed",
            startTime: new Date("2026-05-14T08:00:01.000Z"),
            endTime: new Date("2026-05-14T08:00:02.000Z"),
          },
        },
      ],
      toolCalls: [
        {
          id: "tool-image-1",
          name: "lime_create_image_generation_task",
          arguments: JSON.stringify({ prompt: "青柠插画" }),
          status: "completed",
          startTime: new Date("2026-05-14T08:00:01.000Z"),
          endTime: new Date("2026-05-14T08:00:02.000Z"),
        },
      ],
    });

    const displayState = resolveImageWorkbenchMessageDisplayState({
      message,
      rawDisplayContent: message.content,
    });
    const processState = resolveImageWorkbenchProcessDisplayState({
      message,
      sanitizedContentParts: message.contentParts,
      shouldDeferMessageDetails: false,
      shouldFoldSuppressedProcessFlow:
        displayState.shouldFoldSuppressedProcessFlow,
      shouldSuppressImageProcessFlow: displayState.shouldSuppressProcessFlow,
    });
    const rendererState = resolveImageWorkbenchRendererProcessState({
      actionContent: "",
      message,
      rendererActionRequests: undefined,
      rendererContentParts: processState.displayContentParts,
      rendererToolCalls: message.toolCalls,
      shouldSuppressRendererProcessFlow:
        processState.shouldSuppressRendererProcessFlow,
    });

    expect(displayState.visibleRawDisplayContent).toBe("");
    expect(processState.shouldFoldSuppressedProcessFlow).toBe(false);
    expect(processState.shouldSuppressRendererProcessFlow).toBe(false);
    expect(processState.displayContentParts).toBeUndefined();
    expect(rendererState.shouldRenderInlineProcess).toBe(false);
    expect(rendererState.contentParts).toBeUndefined();
    expect(rendererState.toolCalls).toBeUndefined();
  });

  it("图片任务已有自然正文时只把正文交给 renderer，内部思考和工具不外显", () => {
    const message = createImageMessage({
      content: "好啊，我按花城汇视角来生成广州塔春天照片。",
      contentParts: [
        { type: "thinking", text: "先判断花城汇视角和春天元素。" },
        { type: "text", text: "好啊，我按花城汇视角来生成广州塔春天照片。" },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-image-natural-1",
            name: "lime_create_image_generation_task",
            arguments: JSON.stringify({ prompt: "广州塔春天照片" }),
            status: "completed",
            startTime: new Date("2026-05-14T08:00:01.000Z"),
            endTime: new Date("2026-05-14T08:00:02.000Z"),
          },
        },
      ],
      toolCalls: [
        {
          id: "tool-image-natural-1",
          name: "lime_create_image_generation_task",
          arguments: JSON.stringify({ prompt: "广州塔春天照片" }),
          status: "completed",
          startTime: new Date("2026-05-14T08:00:01.000Z"),
          endTime: new Date("2026-05-14T08:00:02.000Z"),
        },
      ],
    });
    const displayState = resolveImageWorkbenchMessageDisplayState({
      message,
      rawDisplayContent: message.content,
    });
    const processState = resolveImageWorkbenchProcessDisplayState({
      message,
      sanitizedContentParts: message.contentParts,
      shouldDeferMessageDetails: false,
      shouldFoldSuppressedProcessFlow:
        displayState.shouldFoldSuppressedProcessFlow,
      shouldSuppressImageProcessFlow: displayState.shouldSuppressProcessFlow,
    });
    const rendererState = resolveImageWorkbenchRendererProcessState({
      actionContent: message.content,
      message,
      rendererContentParts: processState.displayContentParts,
      rendererToolCalls: message.toolCalls,
      shouldSuppressRendererProcessFlow:
        processState.shouldSuppressRendererProcessFlow,
    });

    expect(displayState.visibleRawDisplayContent).toBe(message.content);
    expect(rendererState.shouldRenderInlineProcess).toBe(true);
    expect(rendererState.contentParts?.map((part) => part.type)).toEqual(["text"]);
    expect(rendererState.toolCalls).toBeUndefined();
  });

  it("只有旧提交摘要且没有过程时，应只保留图片轻卡入口", () => {
    const message = createImageMessage();
    const displayState = resolveImageWorkbenchMessageDisplayState({
      message,
      rawDisplayContent: message.content,
    });
    const processState = resolveImageWorkbenchProcessDisplayState({
      message,
      sanitizedContentParts: undefined,
      shouldDeferMessageDetails: false,
      shouldFoldSuppressedProcessFlow:
        displayState.shouldFoldSuppressedProcessFlow,
      shouldSuppressImageProcessFlow: displayState.shouldSuppressProcessFlow,
    });
    const rendererState = resolveImageWorkbenchRendererProcessState({
      actionContent: "",
      message,
      rendererContentParts: processState.displayContentParts,
      shouldSuppressRendererProcessFlow:
        processState.shouldSuppressRendererProcessFlow,
    });

    expect(displayState.visibleRawDisplayContent).toBe("");
    expect(processState.shouldFoldSuppressedProcessFlow).toBe(false);
    expect(processState.shouldSuppressRendererProcessFlow).toBe(false);
    expect(rendererState.shouldRenderInlineProcess).toBe(false);
  });

  it("图片任务失败时应隐藏模型生成的协议错误解释正文", () => {
    const message = createImageMessage({
      content: [
        "好的，马上用漫画风格来生成！",
        "",
        "看来这个请求没有完成。",
        "-32603: -32002: lime_create_image_generation_task",
      ].join("\n"),
      imageWorkbenchPreview: {
        taskId: "task-image-failed-1",
        prompt: "漫画风格人物",
        status: "failed",
      },
    });

    const displayState = resolveImageWorkbenchMessageDisplayState({
      message,
      rawDisplayContent: message.content,
    });

    expect(displayState.visibleRawDisplayContent).toBe("");
    expect(displayState.hasLeadContent).toBe(false);
    expect(displayState.shouldSuppressAssistantText).toBe(true);
  });

});
