import { describe, expect, it } from "vitest";

import { resolveMessageListItemProjection } from "./messageListItemProjection";
import type { Message } from "../types";

function buildImportedProjection(
  message: Message,
  timelineItems: NonNullable<
    Parameters<typeof resolveMessageListItemProjection>[0]["group"]["timeline"]
  >["items"] = [
    {
      id: "command-codex-import",
      type: "command_execution",
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
  return resolveMessageListItemProjection({
    activeCurrentTurnId: null,
    activePendingA2UISource: null,
    canOpenSavedSiteContent: false,
    expandedHistoricalAssistantMessageIds: new Set(),
    expandedHistoricalTimelineKeys: new Set(),
    expandedLongHistoricalMessageIds: new Set(),
    group: {
      lastAssistantId: message.id,
      timeline: {
        turn: {
          id: "turn-imported-history",
          status: "completed",
        },
        items: timelineItems,
      },
    } as never,
    hasActiveInteractiveRuntime: true,
    isRestoredHistoryWindow: false,
    isSending: true,
    lastAssistantMessageId: message.id,
    message,
    shouldDeferHistoricalAssistantMessageDetails: () => false,
    shouldDeferThreadItemsScan: false,
    streamingTextOverlay: null,
  });
}

describe("messageListItemProjection imported history", () => {
  it("本地历史导入命令应保留 imported 元数据供渲染层默认展开", () => {
    const projection = buildImportedProjection({
      id: "assistant-codex-import-command",
      role: "assistant",
      content: "已完成修复。",
      timestamp: new Date("2026-06-02T10:02:00.000Z"),
    });

    expect(projection.rendererContentParts?.[0]).toMatchObject({
      type: "tool_use",
      toolCall: {
        name: "exec_command",
        result: {
          metadata: {
            imported: true,
            source_client: "codex",
            exit_code: 0,
          },
        },
      },
    });
    const toolPart = projection.rendererContentParts?.[0];
    expect(toolPart?.type).toBe("tool_use");
    expect(
      toolPart?.type === "tool_use"
        ? JSON.parse(toolPart.toolCall.arguments || "{}")
        : null,
    ).toEqual({
      command: "npm test",
      cwd: "/workspace/imported-codex",
    });
  });

  it("本地历史导入命令即使没有额外助手过程文本也应显示为过程记录", () => {
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
      "tool_use",
    ]);
    expect(projection.rendererContentParts?.[0]).toMatchObject({
      type: "tool_use",
      toolCall: {
        name: "exec_command",
        result: {
          metadata: {
            imported: true,
            source_client: "codex",
            exit_code: 0,
          },
        },
      },
    });
  });
});
