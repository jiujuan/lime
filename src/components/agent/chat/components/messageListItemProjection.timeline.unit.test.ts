import { describe, expect, it } from "vitest";

import {
  buildProjection,
  type Message,
} from "./messageListItemProjection.testHarness";
import type { AgentThreadItem } from "../types";

function buildTimelineProjection(
  message: Message,
  timelineItems: AgentThreadItem[],
) {
  return buildProjection(message, timelineItems, {
    turnId: "turn-commentary-process-final",
  });
}

describe("messageListItemProjection timeline", () => {
  it("已完成长过程应在折叠态只显示 final，展开后恢复 commentary 与 canonical 过程", () => {
    const turnId = "turn-completed-compact-process";
    const commentary = "我先核对当前 tracker，再给出结论。";
    const finalAnswer = "核对完成，当前实现已经对齐。";
    const toolParts = Array.from({ length: 10 }, (_, index) => ({
      type: "tool_use" as const,
      metadata: { sequence: index + 2, turnId },
      toolCall: {
        id: `inline-tool-${index + 1}`,
        name: "Bash",
        arguments: JSON.stringify({ command: `echo ${index + 1}` }),
        status: "completed" as const,
        result: { success: true, output: `output ${index + 1}` },
        startTime: new Date("2026-07-16T10:00:01.000Z"),
        endTime: new Date("2026-07-16T10:00:02.000Z"),
      },
    }));
    const message: Message = {
      id: "assistant-completed-compact-process",
      role: "assistant",
      content: finalAnswer,
      timestamp: new Date("2026-07-16T10:01:00.000Z"),
      contentParts: [
        {
          type: "text",
          text: commentary,
          metadata: { phase: "commentary", sequence: 1, turnId },
        },
        ...toolParts,
        {
          type: "text",
          text: finalAnswer,
          metadata: { phase: "final_answer", sequence: 12, turnId },
        },
      ],
    };
    const timelineItems: AgentThreadItem[] = Array.from(
      { length: 10 },
      (_, index) => ({
        id: `canonical-tool-${index + 1}`,
        type: "tool_call",
        thread_id: "thread-completed-compact-process",
        turn_id: turnId,
        sequence: index + 2,
        tool_name: "Bash",
        arguments: { command: `echo ${index + 1}` },
        output: `output ${index + 1}`,
        success: true,
        status: "completed",
        started_at: "2026-07-16T10:00:01.000Z",
        completed_at: "2026-07-16T10:00:02.000Z",
        updated_at: "2026-07-16T10:00:02.000Z",
      }),
    );

    const collapsed = buildProjection(message, timelineItems, {
      turnId,
      turnStatus: "completed",
      isSending: false,
    });

    expect(collapsed.shouldRenderCompactPrimaryTimeline).toBe(true);
    expect(collapsed.primaryTimeline?.items).toHaveLength(10);
    expect(collapsed.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
    ]);
    expect(collapsed.actionContent).toBe(finalAnswer);

    const expanded = buildProjection(message, timelineItems, {
      turnId,
      turnStatus: "completed",
      isSending: false,
      expandHistoricalTimeline: true,
    });

    expect(expanded.shouldRenderCompactPrimaryTimeline).toBe(false);
    expect(expanded.primaryTimeline?.items).toHaveLength(10);
    expect(expanded.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "text",
    ]);
    expect(expanded.actionContent).toBe(`${commentary}\n\n${finalAnswer}`);
  });

  it("canonical compact 在历史细节延迟时仍应保留同一 turn 的全部 final", () => {
    const turnId = "turn-completed-multiple-finals";
    const firstFinal = `第一段最终答复：${"完整结论。".repeat(180)}`;
    const secondFinal = "第二段最终答复：继续按同一 canonical turn 推进。";
    const message: Message = {
      id: "assistant-completed-multiple-finals",
      role: "assistant",
      content: secondFinal,
      timestamp: new Date("2026-07-16T10:01:00.000Z"),
      contentParts: [
        {
          type: "text",
          text: "我先执行检查。",
          metadata: {
            phase: "commentary",
            threadItemId: "commentary-multiple-finals",
            sequence: 1,
            turnId,
          },
        },
        {
          type: "text",
          text: firstFinal,
          metadata: {
            phase: "final_answer",
            threadItemId: "first-final",
            sequence: 2,
            turnId,
          },
        },
        {
          type: "text",
          text: "压缩后继续执行。",
          metadata: {
            phase: "commentary",
            threadItemId: "commentary-after-first-final",
            sequence: 3,
            turnId,
          },
        },
        {
          type: "text",
          text: secondFinal,
          metadata: {
            phase: "final_answer",
            threadItemId: "second-final",
            sequence: 14,
            turnId,
          },
        },
      ],
    };
    const timelineItems: AgentThreadItem[] = Array.from(
      { length: 10 },
      (_, index) => ({
        id: `canonical-multiple-final-tool-${index + 1}`,
        type: "tool_call",
        thread_id: "thread-completed-multiple-finals",
        turn_id: turnId,
        sequence: index + 4,
        tool_name: "Bash",
        arguments: { command: `echo ${index + 1}` },
        output: "ok",
        success: true,
        status: "completed",
        started_at: "2026-07-16T10:00:01.000Z",
        completed_at: "2026-07-16T10:00:02.000Z",
        updated_at: "2026-07-16T10:00:02.000Z",
      }),
    );

    const projection = buildProjection(message, timelineItems, {
      turnId,
      turnStatus: "completed",
      isRestoredHistoryWindow: true,
      isSending: false,
      shouldDeferMessageDetails: true,
    });

    expect(projection.shouldRenderCompactPrimaryTimeline).toBe(true);
    expect(projection.shouldPreviewHistoricalAssistantMessage).toBe(false);
    expect(projection.actionContent).toBe(`${firstFinal}\n\n${secondFinal}`);
    expect(projection.rendererContent).toBe(`${firstFinal}\n\n${secondFinal}`);
  });

  it("message 没有 contentParts 时应从 canonical timeline 恢复 commentary 与 final 正文", () => {
    const turnId = "turn-canonical-text-only";
    const commentary = "我会先运行测试并检查失败。";
    const finalAnswer = "已完成修复。";
    const message: Message = {
      id: "assistant-canonical-text-only",
      role: "assistant",
      content: finalAnswer,
      timestamp: new Date("2026-07-16T10:01:00.000Z"),
    };
    const timelineItems: AgentThreadItem[] = [
      {
        id: "canonical-commentary",
        type: "agent_message",
        thread_id: "thread-canonical-text-only",
        turn_id: turnId,
        sequence: 1,
        phase: "commentary",
        text: commentary,
        status: "completed",
        started_at: "2026-07-16T10:00:00.000Z",
        completed_at: "2026-07-16T10:00:01.000Z",
        updated_at: "2026-07-16T10:00:01.000Z",
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `canonical-text-tool-${index + 1}`,
        type: "tool_call" as const,
        thread_id: "thread-canonical-text-only",
        turn_id: turnId,
        sequence: index + 2,
        tool_name: "Bash",
        arguments: { command: `echo ${index + 1}` },
        output: `output ${index + 1}`,
        success: true,
        status: "completed" as const,
        started_at: "2026-07-16T10:00:01.000Z",
        completed_at: "2026-07-16T10:00:02.000Z",
        updated_at: "2026-07-16T10:00:02.000Z",
      })),
      {
        id: "canonical-final",
        type: "agent_message",
        thread_id: "thread-canonical-text-only",
        turn_id: turnId,
        sequence: 12,
        phase: "final_answer",
        text: finalAnswer,
        status: "completed",
        started_at: "2026-07-16T10:00:03.000Z",
        completed_at: "2026-07-16T10:00:04.000Z",
        updated_at: "2026-07-16T10:00:04.000Z",
      },
    ];

    for (const expandHistoricalTimeline of [false, true]) {
      const projection = buildProjection(message, timelineItems, {
        turnId,
        turnStatus: "canceled",
        isSending: false,
        expandHistoricalTimeline,
      });

      expect(projection.rendererContentParts?.map((part) => part.type)).toEqual(
        expandHistoricalTimeline ? ["text", "text"] : ["text"],
      );
      expect(projection.actionContent).toBe(
        expandHistoricalTimeline
          ? `${commentary}\n\n${finalAnswer}`
          : finalAnswer,
      );
      expect(
        projection.rendererContentParts?.some(
          (part) => part.type === "thinking" || part.type === "tool_use",
        ),
      ).toBe(false);
      expect(projection.primaryTimeline?.items).toHaveLength(10);
    }
  });

  it("展开态应按 canonical identity 保留同文 agent messages", () => {
    const turnId = "turn-repeated-agent-messages";
    const repeatedText = "继续检查。";
    const finalAnswer = "检查完成。";
    const projection = buildProjection(
      {
        id: "assistant-repeated-agent-messages",
        role: "assistant",
        content: finalAnswer,
        timestamp: new Date("2026-07-16T10:01:00.000Z"),
      },
      [
        ...["commentary-1", "commentary-2"].map((id, index) => ({
          id,
          type: "agent_message" as const,
          thread_id: "thread-repeated-agent-messages",
          turn_id: turnId,
          sequence: index + 1,
          phase: "commentary",
          text: repeatedText,
          status: "completed" as const,
          started_at: "2026-07-16T10:00:00.000Z",
          completed_at: "2026-07-16T10:00:01.000Z",
          updated_at: "2026-07-16T10:00:01.000Z",
        })),
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `tool-${index}`,
          type: "tool_call" as const,
          thread_id: "thread-repeated-agent-messages",
          turn_id: turnId,
          sequence: index + 3,
          tool_name: "Bash",
          arguments: { command: `echo ${index}` },
          output: "ok",
          success: true,
          status: "completed" as const,
          started_at: "2026-07-16T10:00:01.000Z",
          completed_at: "2026-07-16T10:00:02.000Z",
          updated_at: "2026-07-16T10:00:02.000Z",
        })),
        {
          id: "final-1",
          type: "agent_message",
          thread_id: "thread-repeated-agent-messages",
          turn_id: turnId,
          sequence: 13,
          phase: "final_answer",
          text: finalAnswer,
          status: "completed",
          started_at: "2026-07-16T10:00:03.000Z",
          completed_at: "2026-07-16T10:00:04.000Z",
          updated_at: "2026-07-16T10:00:04.000Z",
        },
      ],
      {
        turnId,
        turnStatus: "completed",
        isSending: false,
        expandHistoricalTimeline: true,
      },
    );

    const textParts = (projection.rendererContentParts || []).filter(
      (part) => part.type === "text",
    );
    expect(textParts.map((part) => part.text)).toEqual([
      repeatedText,
      repeatedText,
      finalAnswer,
    ]);
    expect(textParts.map((part) => part.metadata?.threadItemId)).toEqual([
      "commentary-1",
      "commentary-2",
      "final-1",
    ]);
  });

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

  it("运行中工具 timeline 不应把已提交导语挪到搜索过程后", () => {
    const message: Message = {
      id: "assistant-live-search-preface",
      role: "assistant",
      content:
        "要求我帮忙整理今天的国际新闻。今天是2026年7月2日。我需要搜索最新的国际新闻来提供帮助。",
      timestamp: new Date("2026-07-02T10:00:06.000Z"),
      isThinking: true,
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
          thread_id: "thread-live-search-preface",
          turn_id: "turn-live-search-preface",
          sequence: 2,
          action: "web_search",
          query: "2026年7月2日 国际新闻",
          status: "in_progress",
          started_at: "2026-07-02T10:00:02.000Z",
          updated_at: "2026-07-02T10:00:03.000Z",
        },
      ],
      {
        turnId: "turn-live-search-preface",
        turnStatus: "running",
        isSending: true,
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["text", "tool_use"]);
    expect(parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("要求我帮忙整理今天的国际新闻"),
    });
    expect(parts[1]).toMatchObject({
      type: "tool_use",
      toolCall: expect.objectContaining({
        id: "web-search-running",
        status: "running",
      }),
    });
    expect(projection.actionContent).toContain("要求我帮忙整理今天的国际新闻");
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

  it("历史恢复 active turn 的 reasoning 已在 contentParts 中时不应再走外置 thinking 通道", () => {
    const message: Message = {
      id: "assistant-history-replay",
      role: "assistant",
      content: "我会先保留 reasoning，再等待 MCP 返回后继续。",
      timestamp: new Date("2026-07-09T10:00:05.000Z"),
      isThinking: false,
      thinkingContent: "先确认本地图片和远程参考图都应作为结构化输入恢复。",
      runtimeTurnId: "turn-history-replay",
      contentParts: [
        {
          type: "thinking",
          text: "先确认本地图片和远程参考图都应作为结构化输入恢复。",
          metadata: {
            source: "thread_item_reasoning",
            threadItemId: "history-replay-visual-reasoning",
            turnId: "turn-history-replay",
            sequence: 3,
          },
        },
        {
          type: "tool_use",
          metadata: {
            source: "agent_thread_item",
            threadItemId: "history-replay-visual-mcp-read-file",
            turnId: "turn-history-replay",
            sequence: 4,
          },
          toolCall: {
            id: "history-replay-visual-mcp-read-file",
            name: "mcp__filesystem__read_file",
            arguments: JSON.stringify({ path: "README.md" }),
            status: "running",
            metadata: {
              source: "agent_thread_item",
              threadItemId: "history-replay-visual-mcp-read-file",
              turnId: "turn-history-replay",
              sequence: 4,
            },
            startTime: new Date("2026-07-09T10:00:04.000Z"),
          },
        },
        {
          type: "text",
          text: "我会先保留 reasoning，再等待 MCP 返回后继续。",
        },
      ],
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "history-replay-visual-reasoning",
          type: "reasoning",
          thread_id: "thread-history-replay",
          turn_id: "turn-history-replay",
          sequence: 3,
          text: "先确认本地图片和远程参考图都应作为结构化输入恢复。",
          summary: ["先确认本地图片和远程参考图都应作为结构化输入恢复。"],
          status: "completed",
          started_at: "2026-07-09T10:00:03.000Z",
          completed_at: "2026-07-09T10:00:03.000Z",
          updated_at: "2026-07-09T10:00:03.000Z",
        },
        {
          id: "history-replay-visual-mcp-read-file",
          type: "tool_call",
          thread_id: "thread-history-replay",
          turn_id: "turn-history-replay",
          sequence: 4,
          tool_name: "mcp__filesystem__read_file",
          arguments: { path: "README.md" },
          status: "in_progress",
          started_at: "2026-07-09T10:00:04.000Z",
          updated_at: "2026-07-09T10:00:04.000Z",
        },
      ],
      {
        turnId: "turn-history-replay",
        turnStatus: "running",
        isSending: false,
      },
    );

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(projection.rendererThinkingContent).toBeUndefined();
    expect(projection.rendererContentParts?.[0]).toMatchObject({
      type: "thinking",
      metadata: {
        threadItemId: "history-replay-visual-reasoning",
      },
    });
    expect(projection.rendererContentParts?.[1]).toMatchObject({
      type: "tool_use",
      metadata: {
        threadItemId: "history-replay-visual-mcp-read-file",
      },
    });
    expect(projection.primaryTimeline).toBeNull();
    expect(projection.trailingTimeline).toBeNull();
  });

  it("reasoning 已在 contentParts 中且 timeline 只有等价 reasoning 时不应再显示第二个思考卡片", () => {
    const finalText = "你好。直接说事，我来处理，省得我们俩先拿空气开会。";
    const message: Message = {
      id: "assistant-cheeky-greeting-history",
      role: "assistant",
      content: finalText,
      timestamp: new Date("2026-07-09T10:00:05.000Z"),
      isThinking: false,
      thinkingContent: "**Crafting concise cheeky greeting**",
      runtimeTurnId: "turn-cheeky-greeting",
      contentParts: [
        {
          type: "thinking",
          text: "**Crafting concise cheeky greeting**",
          metadata: {
            source: "thread_item_reasoning",
            threadItemId: "reasoning-cheeky-greeting-inline",
            turnId: "turn-cheeky-greeting",
            sequence: 1,
          },
        },
        {
          type: "text",
          text: finalText,
        },
      ],
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "reasoning-cheeky-greeting-timeline",
          type: "reasoning",
          thread_id: "thread-cheeky-greeting",
          turn_id: "turn-cheeky-greeting",
          sequence: 1,
          text: "Crafting concise cheeky greeting",
          summary: ["Crafting concise cheeky greeting"],
          status: "completed",
          started_at: "2026-07-09T10:00:03.000Z",
          completed_at: "2026-07-09T10:00:03.000Z",
          updated_at: "2026-07-09T10:00:03.000Z",
        },
      ],
      {
        turnId: "turn-cheeky-greeting",
        turnStatus: "completed",
        isSending: false,
      },
    );

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "text",
    ]);
    expect(projection.rendererThinkingContent).toBeUndefined();
    expect(projection.primaryTimeline).toBeNull();
    expect(projection.trailingTimeline).toBeNull();
  });
});
