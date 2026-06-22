import { describe, expect, it } from "vitest";
import type { ContentPart } from "../types";
import { buildAgentStreamProcessBoundaryTextCommitPatch } from "./agentStreamProcessBoundaryCommit";

const retainPersistedThinkingPart = (part: ContentPart): boolean =>
  part.type === "thinking" &&
  part.metadata?.source === "thread_item_reasoning" &&
  Boolean(part.metadata.threadItemId);

const toolStartTime = new Date("2026-06-22T10:00:00.000Z");

describe("agentStreamProcessBoundaryCommit", () => {
  it("工具过程插入前应把尚未刷新的 accumulatedContent 提交到 contentParts", () => {
    expect(
      buildAgentStreamProcessBoundaryTextCommitPatch({
        accumulatedContent: "我先联网核实目标页面来源。\n",
        renderedContent: "",
        parts: [],
        shouldRetainThinkingPart: retainPersistedThinkingPart,
        surfaceThinkingDeltas: true,
      }),
    ).toEqual({
      content: "我先联网核实目标页面来源。\n",
      contentParts: [
        {
          type: "text",
          text: "我先联网核实目标页面来源。\n",
        },
      ],
    });
  });

  it("工具过程插入前应只追加相对现有文本的 pending 部分", () => {
    expect(
      buildAgentStreamProcessBoundaryTextCommitPatch({
        accumulatedContent: "第一段。第二段。",
        renderedContent: "第一段。",
        parts: [{ type: "text", text: "第一段。" }],
        shouldRetainThinkingPart: retainPersistedThinkingPart,
        surfaceThinkingDeltas: true,
      }),
    ).toEqual({
      content: "第一段。第二段。",
      contentParts: [{ type: "text", text: "第一段。第二段。" }],
    });
  });

  it("已有工具边界时应把 pending 最终正文追加到工具后", () => {
    expect(
      buildAgentStreamProcessBoundaryTextCommitPatch({
        accumulatedContent: "第一段。最终补充。",
        renderedContent: "第一段。",
        parts: [
          { type: "text", text: "第一段。" },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-a",
              name: "Read",
              arguments: "{}",
              status: "completed",
              startTime: toolStartTime,
            },
          },
        ],
        shouldRetainThinkingPart: retainPersistedThinkingPart,
        surfaceThinkingDeltas: true,
      }),
    ).toEqual({
      content: "第一段。最终补充。",
      contentParts: [
        { type: "text", text: "第一段。" },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-a",
            name: "Read",
            arguments: "{}",
            status: "completed",
            startTime: toolStartTime,
          },
        },
        { type: "text", text: "最终补充。" },
      ],
    });
  });

  it("隐藏 thinking 时仍应保留持久化 reasoning part", () => {
    const persistedThinking = {
      type: "thinking" as const,
      text: "搜索结果还需要继续筛掉广告软文。",
      metadata: {
        source: "thread_item_reasoning",
        threadItemId: "reasoning-1",
      },
    };
    expect(
      buildAgentStreamProcessBoundaryTextCommitPatch({
        accumulatedContent: "最终正文。",
        renderedContent: "",
        parts: [persistedThinking],
        shouldRetainThinkingPart: retainPersistedThinkingPart,
        surfaceThinkingDeltas: false,
      }),
    ).toEqual({
      content: "最终正文。",
      contentParts: [persistedThinking, { type: "text", text: "最终正文。" }],
    });
  });
});
