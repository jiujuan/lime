import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { mergeHydratedMessagesWithLocalState } from "./agentChatHistoryLocalMerge";

describe("agentChatHistoryLocalMerge image tasks", () => {
  it("read model 只恢复图片轻卡时应按 taskId 保留本地 usage 和思考", () => {
    const localMessages: Message[] = [
      {
        id: "local-user-image",
        role: "user",
        content: "@配图 生成一张深圳夏天午后的照片",
        timestamp: new Date("2026-07-03T10:00:00.000Z"),
      },
      {
        id: "local-assistant-image",
        role: "assistant",
        content: "我先确认深圳午后的光线和街景。",
        timestamp: new Date("2026-07-03T10:00:01.000Z"),
        isThinking: false,
        thinkingContent: "先确认光线、街景和真实摄影质感。",
        contentParts: [
          { type: "thinking", text: "先确认光线、街景和真实摄影质感。" },
          { type: "text", text: "我先确认深圳午后的光线和街景。" },
        ],
        usage: {
          input_tokens: 31_000,
          output_tokens: 119,
          cached_input_tokens: 0,
        },
        imageWorkbenchPreview: {
          taskId: "task-shenzhen-summer",
          prompt: "深圳夏天午后的照片",
          status: "complete",
          imageUrl: "https://example.com/shenzhen.png",
          imageCount: 1,
          caption: "画面已生成。",
        },
      },
    ];
    const hydratedMessages: Message[] = [
      {
        id: "remote-user-image",
        role: "user",
        content: "@配图 生成一张深圳夏天午后的照片",
        timestamp: new Date("2026-07-03T10:00:00.500Z"),
      },
      {
        id: "remote-image-tool-message",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-07-03T10:00:02.000Z"),
        isThinking: false,
        imageWorkbenchPreview: {
          taskId: "task-shenzhen-summer",
          prompt: "深圳夏天午后的照片",
          status: "complete",
          imageUrl: "https://example.com/shenzhen.png",
          imageCount: 1,
          caption: "画面已生成。",
        },
      },
    ];

    const merged = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      id: "local-assistant-image",
      content: "我先确认深圳午后的光线和街景。",
      thinkingContent: "先确认光线、街景和真实摄影质感。",
      usage: {
        input_tokens: 31_000,
        output_tokens: 119,
        cached_input_tokens: 0,
      },
      imageWorkbenchPreview: {
        taskId: "task-shenzhen-summer",
      },
    });
    expect(merged[1]?.contentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "text",
    ]);
  });
});
