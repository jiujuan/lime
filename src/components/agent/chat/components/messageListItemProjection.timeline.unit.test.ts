import { describe, expect, it } from "vitest";

import { buildProjection, type Message } from "./messageListItemProjection.testHarness";
import type { AgentThreadItem } from "../types";

function buildTimelineProjection(message: Message, timelineItems: AgentThreadItem[]) {
  return buildProjection(message, timelineItems, {
    turnId: "turn-commentary-process-final",
  });
}

describe("messageListItemProjection timeline", () => {
  it("running process 中的无 phase streaming overlay 不应作为孤立正文显示", () => {
    const message: Message = {
      id: "assistant-live-web-search",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-24T10:00:06.000Z"),
      isThinking: true,
      contentParts: [],
      runtimeStatus: {
        phase: "synthesizing",
        title: "正在输出",
        detail: "",
      },
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "web-search-running",
          type: "web_search",
          thread_id: "thread-live-web-search",
          turn_id: "turn-live-web-search",
          sequence: 2,
          action: "web_search",
          query: "Reuters world news June 24 2026 international headlines",
          status: "in_progress",
          started_at: "2026-06-24T10:00:02.000Z",
          updated_at: "2026-06-24T10:00:03.000Z",
        },
      ],
      {
        turnId: "turn-live-web-search",
        turnStatus: "running",
        isSending: true,
        streamingTextOverlay: {
          messageId: "assistant-live-web-search",
          eventName: "agent-runtime-live-web-search",
          content: "我",
          boundary: "render_flush",
          sequence: 3,
          updatedAt: Date.parse("2026-06-24T10:00:04.000Z"),
        },
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["tool_use"]);
    expect(parts.some((part) => part.type === "text")).toBe(false);
    expect(projection.hasAssistantBodyContent).toBe(true);
  });

  it("显式 final_answer streaming overlay 在 process 后仍应实时显示", () => {
    const message: Message = {
      id: "assistant-live-final",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-24T10:00:06.000Z"),
      isThinking: true,
      contentParts: [],
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "web-search-completed",
          type: "web_search",
          thread_id: "thread-live-final",
          turn_id: "turn-live-final",
          sequence: 2,
          action: "web_search",
          query: "international news",
          status: "completed",
          started_at: "2026-06-24T10:00:02.000Z",
          completed_at: "2026-06-24T10:00:03.000Z",
          updated_at: "2026-06-24T10:00:03.000Z",
        },
      ],
      {
        turnId: "turn-live-final",
        turnStatus: "running",
        isSending: true,
        streamingTextOverlay: {
          messageId: "assistant-live-final",
          eventName: "agent-runtime-live-final",
          content: "今日国际新闻摘要：",
          boundary: "render_flush",
          phase: "final_answer",
          sequence: 7,
          updatedAt: Date.parse("2026-06-24T10:00:04.000Z"),
        },
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["tool_use", "text"]);
    expect(parts[1]?.type === "text" ? parts[1].text : "").toBe(
      "今日国际新闻摘要：",
    );
  });

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
        thread_id: "thread-commentary-process-final",
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
        thread_id: "thread-commentary-process-final",
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
        thread_id: "thread-commentary-process-final",
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
      "text",
      "tool_use",
      "text",
    ]);
    expect(parts[0]?.type === "text" ? parts[0].text : "").toBe(
      "我来帮你分析这个项目的改进空间。先让我了解一下项目结构和关键文件。",
    );
    expect(parts[0]?.type === "text" ? parts[0].metadata : {}).toMatchObject({
      phase: "commentary",
      source: "agent_thread_item",
      threadItemId: "assistant-commentary-intro",
      turnId: "turn-commentary-process-final",
      sequence: 1,
    });
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
