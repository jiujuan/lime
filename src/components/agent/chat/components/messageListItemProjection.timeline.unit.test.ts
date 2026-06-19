import { describe, expect, it } from "vitest";

import { resolveMessageListItemProjection } from "./messageListItemProjection";
import type { AgentThreadItem, Message } from "../types";

function buildTimelineProjection(message: Message, timelineItems: AgentThreadItem[]) {
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
          id: "turn-commentary-process-final",
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

describe("messageListItemProjection timeline", () => {
  it("timeline 中的 commentary 首句应保留在工具过程之前，且不污染最终正文", () => {
    const message: Message = {
      id: "assistant-commentary-process",
      role: "assistant",
      content: "我已经看完关键文件，下面是改进建议。",
      timestamp: new Date("2026-06-02T10:00:06.000Z"),
      isThinking: false,
    };

    const projection = buildTimelineProjection(message, [
      {
        id: "assistant-commentary-intro",
        type: "agent_message",
        turn_id: "turn-commentary-process-final",
        sequence: 1,
        phase: "commentary",
        text: "我来帮你分析这个项目的改进空间。先让我了解一下项目结构和关键文件。",
        status: "completed",
        started_at: "2026-06-02T10:00:00.000Z",
        completed_at: "2026-06-02T10:00:01.000Z",
        updated_at: "2026-06-02T10:00:01.000Z",
      },
      {
        id: "command-list-project",
        type: "command_execution",
        turn_id: "turn-commentary-process-final",
        sequence: 2,
        command: "ls -la /repo",
        cwd: "/repo",
        aggregated_output: "README.md\npackage.json",
        exit_code: 0,
        status: "completed",
        started_at: "2026-06-02T10:00:02.000Z",
        completed_at: "2026-06-02T10:00:03.000Z",
        updated_at: "2026-06-02T10:00:03.000Z",
      },
      {
        id: "assistant-final-answer",
        type: "agent_message",
        turn_id: "turn-commentary-process-final",
        sequence: 3,
        phase: "final_answer",
        text: "我已经看完关键文件，下面是改进建议。",
        status: "completed",
        started_at: "2026-06-02T10:00:04.000Z",
        completed_at: "2026-06-02T10:00:05.000Z",
        updated_at: "2026-06-02T10:00:05.000Z",
      },
    ]);

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(parts[0]?.type === "thinking" ? parts[0].text : "").toBe(
      "我来帮你分析这个项目的改进空间。先让我了解一下项目结构和关键文件。",
    );
    expect(parts[1]?.type === "tool_use" ? parts[1].toolCall.id : "").toBe(
      "command-list-project",
    );
    expect(parts[2]?.type === "text" ? parts[2].text : "").toBe(
      "我已经看完关键文件，下面是改进建议。",
    );
    expect(projection.actionContent).toBe(
      "我已经看完关键文件，下面是改进建议。",
    );
  });
});
