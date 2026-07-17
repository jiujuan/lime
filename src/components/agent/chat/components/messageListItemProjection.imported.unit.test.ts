import { describe, expect, it } from "vitest";

import {
  buildProjection,
  type Message,
  type ProjectionTimelineItems,
} from "./messageListItemProjection.testHarness";

function buildImportedProjection(
  message: Message,
  timelineItems: ProjectionTimelineItems = [
    {
      id: "command-codex-import",
      type: "command_execution",
      thread_id: "thread-imported-history",
      turn_id: "turn-imported-history",
      sequence: 1,
      command: "npm test",
      cwd: "/workspace/imported-codex",
      aggregated_output: "Exit code: 0\nOutput:\nok",
      exit_code: 0,
      metadata: {
        imported: true,
        source_client: "codex",
      },
      status: "completed",
      started_at: "2026-06-02T10:01:02.000Z",
      completed_at: "2026-06-02T10:01:03.000Z",
      updated_at: "2026-06-02T10:01:03.000Z",
    },
    {
      id: "assistant-codex-import-final",
      type: "agent_message",
      thread_id: "thread-imported-history",
      turn_id: "turn-imported-history",
      sequence: 2,
      phase: "final_answer",
      text: "已完成修复。",
      status: "completed",
      started_at: "2026-06-02T10:01:58.000Z",
      completed_at: "2026-06-02T10:02:00.000Z",
      updated_at: "2026-06-02T10:02:00.000Z",
    },
  ],
) {
  return buildProjection(message, timelineItems, {
    turnId: "turn-imported-history",
  });
}

describe("messageListItemProjection imported history", () => {
  it("本地历史导入命令应保留 imported 元数据供历史摘要使用", () => {
    const projection = buildImportedProjection({
      id: "assistant-codex-import-command",
      role: "assistant",
      content: "已完成修复。",
      timestamp: new Date("2026-06-02T10:02:00.000Z"),
    });

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
    ]);
    expect(projection.primaryTimeline?.items).toHaveLength(1);
    expect(projection.primaryTimeline?.items[0]).toMatchObject({
      type: "command_execution",
      metadata: {
        imported: true,
        source_client: "codex",
      },
    });
  });

  it("本地历史导入命令没有额外助手过程文本时仍只渲染最终正文", () => {
    const projection = buildImportedProjection(
      {
        id: "assistant-codex-import-command-only",
        role: "assistant",
        content: "已完成修复。",
        timestamp: new Date("2026-06-02T10:02:00.000Z"),
      },
      [
        {
          id: "command-codex-import",
          type: "command_execution",
          thread_id: "thread-imported-history",
          turn_id: "turn-imported-history",
          sequence: 1,
          command: "npm test",
          cwd: "/workspace/imported-codex",
          aggregated_output: "Exit code: 0\nOutput:\nok",
          exit_code: 0,
          metadata: {
            imported: true,
            source_client: "codex",
          },
          status: "completed",
          started_at: "2026-06-02T10:01:02.000Z",
          completed_at: "2026-06-02T10:01:03.000Z",
          updated_at: "2026-06-02T10:01:03.000Z",
        },
      ],
    );

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
    ]);
    expect(projection.rendererContentParts?.[0]).toEqual({
      type: "text",
      text: "已完成修复。",
    });
    expect(projection.primaryTimeline?.items).toHaveLength(1);
  });
});
