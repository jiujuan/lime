import { describe, expect, it } from "vitest";
import type { AgentThreadItem, Message } from "../types";
import {
  createInlineCoverageMatcher,
  hasPersistedReasoningTimelineItem,
  mergeStreamingOverlayContentParts,
  resolveInlineProcessCoverage,
  shouldKeepInlineProcessForActiveAssistant,
} from "./messageListInlineProcess";

describe("messageListInlineProcess", () => {
  it("流式 overlay 应追加到已提交文本之后，保留工具穿插顺序", () => {
    const parts = [
      { type: "text", text: "先说明。" },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-1",
          name: "Bash",
          status: "completed",
        },
      },
    ] as unknown as Message["contentParts"];

    expect(
      mergeStreamingOverlayContentParts(parts, "先说明。再继续。"),
    ).toEqual([
      { type: "text", text: "先说明。" },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-1",
          name: "Bash",
          status: "completed",
        },
      },
      { type: "text", text: "再继续。" },
    ]);
  });

  it("流式 overlay 与前置过程说明不连续时应追加到工具之后", () => {
    const parts = [
      { type: "text", text: "我先联网核实今天的国际新闻。" },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search",
          name: "web_search",
          status: "completed",
        },
      },
    ] as unknown as Message["contentParts"];

    expect(
      mergeStreamingOverlayContentParts(
        parts,
        "## 今日国际新闻简报\n\n- 第一条要闻。",
      ),
    ).toEqual([
      { type: "text", text: "我先联网核实今天的国际新闻。" },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search",
          name: "web_search",
          status: "completed",
        },
      },
      { type: "text", text: "## 今日国际新闻简报\n\n- 第一条要闻。" },
    ]);
  });

  it("流式 overlay 修正工具后的尾部正文时不应把正文挪到工具前", () => {
    const parts = [
      { type: "text", text: "我先查证来源。" },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search",
          name: "web_search",
          status: "completed",
        },
      },
      { type: "text", text: "## 简报\n\n- 初稿。" },
    ] as unknown as Message["contentParts"];

    expect(
      mergeStreamingOverlayContentParts(
        parts,
        "## 简报\n\n- 修正后的最终稿。",
      ),
    ).toEqual([
      { type: "text", text: "我先查证来源。" },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search",
          name: "web_search",
          status: "completed",
        },
      },
      { type: "text", text: "## 简报\n\n- 修正后的最终稿。" },
    ]);
  });

  it("内联命令与搜索工具应覆盖对应 timeline 项，避免外置重复展示", () => {
    const coverage = resolveInlineProcessCoverage({
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "tool-command-1",
            name: "Bash",
            status: "completed",
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-search-1",
            name: "web_search",
            status: "completed",
          },
        },
      ] as unknown as Message["contentParts"],
    });
    const isCovered = createInlineCoverageMatcher(coverage);

    expect(
      isCovered({
        id: "timeline-command-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "completed",
        started_at: "2026-05-30T09:10:00.000Z",
        completed_at: "2026-05-30T09:10:01.000Z",
        updated_at: "2026-05-30T09:10:01.000Z",
        type: "command_execution",
        command: "ls",
        cwd: "/tmp",
      } satisfies AgentThreadItem),
    ).toBe(true);
    expect(
      isCovered({
        id: "timeline-search-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 2,
        status: "completed",
        started_at: "2026-05-30T09:10:01.000Z",
        completed_at: "2026-05-30T09:10:02.000Z",
        updated_at: "2026-05-30T09:10:02.000Z",
        type: "web_search",
        action: "web_search",
        query: "lime",
      } satisfies AgentThreadItem),
    ).toBe(true);
  });

  it("已有持久化 reasoning 时不应继续保留 message thinking 兜底", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      content: "最终回答",
      timestamp: new Date("2026-06-17T08:00:00.000Z"),
      thinkingContent: "这段只应作为未持久化时的临时兜底。",
      contentParts: [
        {
          type: "thinking",
          text: "这段只应作为未持久化时的临时兜底。",
        },
        { type: "text", text: "最终回答" },
      ],
    } satisfies Message;

    const timelineItems: AgentThreadItem[] = [
      {
        id: "reasoning-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "completed",
        started_at: "2026-06-17T08:00:00.000Z",
        completed_at: "2026-06-17T08:00:01.000Z",
        updated_at: "2026-06-17T08:00:01.000Z",
        type: "reasoning",
        text: "这段由 timeline 承载。",
      },
    ];

    expect(hasPersistedReasoningTimelineItem(timelineItems)).toBe(true);
    expect(
      shouldKeepInlineProcessForActiveAssistant(
        message,
        true,
        true,
        true,
        true,
        "最终回答",
        false,
      ),
    ).toBe(false);
  });
});
