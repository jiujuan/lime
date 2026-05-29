import { describe, expect, it } from "vitest";
import type { AgentThreadItem, Message } from "../types";
import {
  createInlineCoverageMatcher,
  mergeStreamingOverlayContentParts,
  resolveInlineProcessCoverage,
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
});
