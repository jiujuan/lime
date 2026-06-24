import { describe, expect, it } from "vitest";

import { buildTimelineInlineContentParts } from "./messageListTimelineContentParts";
import { buildThreadItems } from "./messageListTimelineContentParts.testHarness";

describe("messageListTimelineContentParts", () => {
  it("没有 agent_message 时仍应渲染 timeline 工具过程", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "",
      items: buildThreadItems([
        {
          id: "web-search-running",
          type: "web_search",
          turn_id: "turn-running-search",
          sequence: 1,
          action: "web_search",
          query: "今天 AI 行业公开新闻",
          status: "in_progress",
          started_at: "2026-06-18T10:00:00.000Z",
          updated_at: "2026-06-18T10:00:01.000Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual(["tool_use"]);
    expect(
      contentParts?.[0]?.type === "tool_use"
        ? contentParts[0].toolCall.status
        : "",
    ).toBe("running");
  });

  it("单条 reasoning 也应进入结构化 contentParts", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "",
      items: buildThreadItems([
        {
          id: "reasoning-single",
          type: "reasoning",
          turn_id: "turn-single-reasoning",
          sequence: 1,
          text: "先确认搜索目标，再开始读取来源。",
          status: "in_progress",
          started_at: "2026-06-24T10:00:00.000Z",
          updated_at: "2026-06-24T10:00:01.000Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual(["thinking"]);
    expect(contentParts?.[0]).toMatchObject({
      type: "thinking",
      text: "先确认搜索目标，再开始读取来源。",
    });
  });

  it("只有 update_plan 工具项时不应生成旧工具过程", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "",
      items: buildThreadItems([
        {
          id: "tool-update-plan-only",
          type: "tool_call",
          turn_id: "turn-update-plan-only",
          sequence: 1,
          tool_name: "update_plan",
          arguments: {
            plan: [{ step: "整理计划", status: "in_progress" }],
          },
          output: "ok",
          success: true,
          status: "completed",
          started_at: "2026-06-18T10:00:00.000Z",
          completed_at: "2026-06-18T10:00:01.000Z",
          updated_at: "2026-06-18T10:00:01.000Z",
        },
      ]),
    });

    expect(contentParts).toBeUndefined();
  });

  it("标准 plan item 存在时不应重复展示 update_plan 工具卡", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "计划已更新。",
      items: buildThreadItems([
        {
          id: "plan-from-update-plan",
          type: "plan",
          turn_id: "turn-update-plan",
          sequence: 1,
          text: "- [x] 整理计划\n- [ ] 执行修改",
          status: "completed",
          started_at: "2026-06-18T10:00:00.000Z",
          completed_at: "2026-06-18T10:00:01.000Z",
          updated_at: "2026-06-18T10:00:01.000Z",
          metadata: {
            revisionId: "update_plan:tool-update-plan",
            source: "update_plan",
            tool_call_id: "tool-update-plan",
          },
        },
        {
          id: "tool-update-plan",
          type: "tool_call",
          turn_id: "turn-update-plan",
          sequence: 2,
          tool_name: "UpdatePlanTool",
          arguments: {
            plan: [
              { step: "整理计划", status: "completed" },
              { step: "执行修改", status: "in_progress" },
            ],
          },
          output: "ok",
          success: true,
          status: "completed",
          started_at: "2026-06-18T10:00:02.000Z",
          completed_at: "2026-06-18T10:00:03.000Z",
          updated_at: "2026-06-18T10:00:03.000Z",
        },
        {
          id: "assistant-update-plan-final",
          type: "agent_message",
          turn_id: "turn-update-plan",
          sequence: 3,
          phase: "final_answer",
          text: "计划已更新。",
          status: "completed",
          started_at: "2026-06-18T10:00:04.000Z",
          completed_at: "2026-06-18T10:00:05.000Z",
          updated_at: "2026-06-18T10:00:05.000Z",
        },
      ]),
    });

    expect(contentParts?.some((part) => part.type === "tool_use")).toBe(false);
    expect(contentParts?.map((part) => part.type)).toEqual(["text", "text"]);
    expect(
      contentParts?.[0]?.type === "text" ? contentParts[0].text : "",
    ).toContain("<proposed_plan>");
    expect(
      contentParts?.[1]?.type === "text" ? contentParts[1].text : "",
    ).toContain("计划已更新。");
  });

  it("只有 timeline 工具过程但已有最终正文时应把正文接在工具后", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "第一轮已经完成。\n\n## 第一轮结论",
      items: buildThreadItems([
        {
          id: "web-search-completed",
          type: "web_search",
          turn_id: "turn-completed-search",
          sequence: 1,
          action: "web_search",
          query: "first turn",
          status: "completed",
          started_at: "2026-06-18T10:00:00.000Z",
          completed_at: "2026-06-18T10:00:02.000Z",
          updated_at: "2026-06-18T10:00:02.000Z",
          results: [],
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(
      contentParts?.[1]?.type === "text" ? contentParts[1].text : "",
    ).toContain("第一轮结论");
  });

  it("应按事件序保留工具前的 commentary 首句", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "我已经看完关键文件，下面是改进建议。",
      items: buildThreadItems([
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
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[0]).toMatchObject({
      type: "text",
      text: "我来帮你分析这个项目的改进空间。先让我了解一下项目结构和关键文件。",
      metadata: {
        phase: "commentary",
        source: "agent_thread_item",
        threadItemId: "assistant-commentary-intro",
        turnId: "turn-commentary-process-final",
        sequence: 1,
      },
    });
    expect(contentParts?.[1]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "command-list-project",
        name: "exec_command",
        status: "completed",
      },
    });
    expect(contentParts?.[2]).toMatchObject({
      type: "text",
      text: "我已经看完关键文件，下面是改进建议。",
    });
  });

  it("历史未知动态 MCP 工具应保持工具族顺序并进入渲染内容", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "最终结论：动态 MCP 线索已经汇总。",
      items: buildThreadItems([
        {
          id: "assistant-dynamic-mcp-intro",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          phase: "final_answer",
          text: "我先查一下外部系统里的相关线索。",
          status: "completed",
          started_at: "2026-06-02T10:02:00.000Z",
          completed_at: "2026-06-02T10:02:01.000Z",
          updated_at: "2026-06-02T10:02:01.000Z",
        },
        {
          id: "tool-dynamic-mcp-search",
          type: "tool_call",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          tool_name: "mcp__github__search_code",
          arguments: { query: "runtime empty final" },
          output:
            "src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts",
          success: true,
          status: "completed",
          started_at: "2026-06-02T10:02:02.000Z",
          completed_at: "2026-06-02T10:02:03.000Z",
          updated_at: "2026-06-02T10:02:03.000Z",
        },
        {
          id: "tool-dynamic-mcp-read",
          type: "tool_call",
          turn_id: "turn-legacy-unphased-final",
          sequence: 3,
          tool_name: "mcp__docs__read_page",
          arguments: { path: "docs/runtime.md" },
          output: "Runtime notes",
          success: true,
          status: "completed",
          started_at: "2026-06-02T10:02:04.000Z",
          completed_at: "2026-06-02T10:02:05.000Z",
          updated_at: "2026-06-02T10:02:05.000Z",
        },
        {
          id: "assistant-dynamic-mcp-final",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 4,
          phase: "final_answer",
          text: "最终结论：动态 MCP 线索已经汇总。",
          status: "completed",
          started_at: "2026-06-02T10:02:06.000Z",
          completed_at: "2026-06-02T10:02:07.000Z",
          updated_at: "2026-06-02T10:02:07.000Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "tool_use",
      toolCall: {
        name: "mcp__github__search_code",
        status: "completed",
      },
    });
    expect(contentParts?.[2]).toMatchObject({
      type: "tool_use",
      toolCall: {
        name: "mcp__docs__read_page",
        status: "completed",
      },
    });
  });
});
