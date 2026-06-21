import { describe, expect, it } from "vitest";

import { buildTimelineInlineContentParts } from "./messageListTimelineContentParts";
import type { AgentThreadItem, Message } from "../types";

const TOOL_START_TIME = new Date("2026-06-20T12:00:00.000Z");
const TOOL_FETCH_START_TIME = new Date("2026-06-20T12:00:01.000Z");

function buildThreadItems(
  items: Array<Record<string, unknown> & { turn_id: string; thread_id?: string }>,
): AgentThreadItem[] {
  return items.map((item) => ({
    ...item,
    thread_id: item.thread_id ?? `thread-${item.turn_id}`,
  })) as AgentThreadItem[];
}

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

  it("本地历史导入的单条思考也应按来源顺序进入正文过程流", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "codex",
    };
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "已确认处理方案。",
      items: buildThreadItems([
        {
          id: "reasoning-imported-single",
          type: "reasoning",
          turn_id: "turn-imported-single-reasoning",
          sequence: 1,
          text: "先判断用户截图里的第一句为什么没有展示在最前面。",
          summary: ["先判断用户截图里的第一句为什么没有展示在最前面。"],
          metadata: importedMetadata,
          status: "completed",
          started_at: "2026-06-02T09:00:00.000Z",
          completed_at: "2026-06-02T09:00:01.000Z",
          updated_at: "2026-06-02T09:00:01.000Z",
        },
        {
          id: "assistant-imported-single-final",
          type: "agent_message",
          turn_id: "turn-imported-single-reasoning",
          sequence: 2,
          phase: "final_answer",
          text: "已确认处理方案。",
          metadata: importedMetadata,
          status: "completed",
          started_at: "2026-06-02T09:00:02.000Z",
          completed_at: "2026-06-02T09:00:03.000Z",
          updated_at: "2026-06-02T09:00:03.000Z",
        },
      ]),
    });

    expect(contentParts).toEqual([
      {
        type: "thinking",
        text: "先判断用户截图里的第一句为什么没有展示在最前面。",
        metadata: importedMetadata,
      },
      {
        type: "text",
        text: "已确认处理方案。",
      },
    ]);
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
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[0]).toMatchObject({
      type: "thinking",
      text: "我来帮你分析这个项目的改进空间。先让我了解一下项目结构和关键文件。",
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

  it("本地历史导入计划应按事件序穿插在思考和命令之间", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "codex",
    };
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "计划已经整理完。",
      items: buildThreadItems([
        {
          id: "reasoning-before-plan",
          type: "reasoning",
          turn_id: "turn-imported-plan",
          sequence: 1,
          text: "先判断应该如何拆分当前修复。",
          status: "completed",
          started_at: "2026-06-02T10:03:00.000Z",
          completed_at: "2026-06-02T10:03:01.000Z",
          updated_at: "2026-06-02T10:03:01.000Z",
          metadata: importedMetadata,
        },
        {
          id: "plan-imported-update-plan",
          type: "plan",
          turn_id: "turn-imported-plan",
          sequence: 2,
          text: "- [x] 核对计划事件\n- [ ] 投影计划内容",
          status: "completed",
          started_at: "2026-06-02T10:03:02.000Z",
          completed_at: "2026-06-02T10:03:03.000Z",
          updated_at: "2026-06-02T10:03:03.000Z",
          metadata: importedMetadata,
        },
        {
          id: "command-after-plan",
          type: "command_execution",
          turn_id: "turn-imported-plan",
          sequence: 3,
          command: "cargo test",
          cwd: "/workspace/app",
          aggregated_output: "ok",
          exit_code: 0,
          status: "completed",
          started_at: "2026-06-02T10:03:04.000Z",
          completed_at: "2026-06-02T10:03:05.000Z",
          updated_at: "2026-06-02T10:03:05.000Z",
          metadata: importedMetadata,
        },
        {
          id: "assistant-after-plan",
          type: "agent_message",
          turn_id: "turn-imported-plan",
          sequence: 4,
          phase: "final_answer",
          text: "计划已经整理完。",
          status: "completed",
          started_at: "2026-06-02T10:03:06.000Z",
          completed_at: "2026-06-02T10:03:07.000Z",
          updated_at: "2026-06-02T10:03:07.000Z",
          metadata: importedMetadata,
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "text",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "text",
      text: "<proposed_plan>\n- [x] 核对计划事件\n- [ ] 投影计划内容\n</proposed_plan>",
    });
    expect(contentParts?.[2]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "command-after-plan",
        name: "exec_command",
        status: "completed",
      },
    });
  });

  it("只有导入计划和最终正文时也应生成内联计划块", () => {
    const importedMetadata = {
      imported: true,
      source_client: "codex",
    };
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "继续执行计划。",
      items: buildThreadItems([
        {
          id: "plan-only-imported",
          type: "plan",
          turn_id: "turn-imported-plan-only",
          sequence: 1,
          text: "- [ ] 继续执行计划",
          status: "completed",
          started_at: "2026-06-02T10:04:00.000Z",
          completed_at: "2026-06-02T10:04:01.000Z",
          updated_at: "2026-06-02T10:04:01.000Z",
          metadata: importedMetadata,
        },
        {
          id: "assistant-plan-only",
          type: "agent_message",
          turn_id: "turn-imported-plan-only",
          sequence: 2,
          phase: "final_answer",
          text: "继续执行计划。",
          status: "completed",
          started_at: "2026-06-02T10:04:02.000Z",
          completed_at: "2026-06-02T10:04:03.000Z",
          updated_at: "2026-06-02T10:04:03.000Z",
          metadata: importedMetadata,
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual(["text"]);
    expect(contentParts?.[0]).toMatchObject({
      type: "text",
      text: "<proposed_plan>\n- [ ] 继续执行计划\n</proposed_plan>\n继续执行计划。",
    });
  });

  it("本地历史导入过程应把命令、搜索和补丁还原为同一条正文过程", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "codex",
    };
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "已完成修复。",
      items: buildThreadItems([
        {
          id: "assistant-codex-import-progress",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          text: "我会先运行测试并检查失败。",
          status: "completed",
          started_at: "2026-06-02T10:01:00.000Z",
          completed_at: "2026-06-02T10:01:01.000Z",
          updated_at: "2026-06-02T10:01:01.000Z",
          metadata: importedMetadata,
        },
        {
          id: "reasoning-codex-import",
          type: "reasoning",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          text: "需要先确认测试失败点。",
          status: "completed",
          started_at: "2026-06-02T10:01:02.000Z",
          completed_at: "2026-06-02T10:01:03.000Z",
          updated_at: "2026-06-02T10:01:03.000Z",
          metadata: importedMetadata,
        },
        {
          id: "command-codex-import-process",
          type: "command_execution",
          turn_id: "turn-legacy-unphased-final",
          sequence: 3,
          command: "npm test",
          cwd: "/workspace/imported-codex",
          aggregated_output: "ok",
          exit_code: 0,
          metadata: importedMetadata,
          status: "completed",
          started_at: "2026-06-02T10:01:04.000Z",
          completed_at: "2026-06-02T10:01:05.000Z",
          updated_at: "2026-06-02T10:01:05.000Z",
        },
        {
          id: "search-codex-import-process",
          type: "web_search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 4,
          action: "search_query",
          output: '"search_query"',
          metadata: importedMetadata,
          status: "completed",
          started_at: "2026-06-02T10:01:06.000Z",
          completed_at: "2026-06-02T10:01:07.000Z",
          updated_at: "2026-06-02T10:01:07.000Z",
        },
        {
          id: "patch-codex-import-process",
          type: "patch",
          turn_id: "turn-legacy-unphased-final",
          sequence: 5,
          text: "Patch changed /workspace/imported-codex/src/lib.rs",
          paths: ["/workspace/imported-codex/src/lib.rs"],
          success: true,
          metadata: importedMetadata,
          status: "completed",
          started_at: "2026-06-02T10:01:08.000Z",
          completed_at: "2026-06-02T10:01:09.000Z",
          updated_at: "2026-06-02T10:01:09.000Z",
        },
        {
          id: "assistant-codex-import-process-final",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 6,
          phase: "final_answer",
          text: "已完成修复。",
          status: "completed",
          started_at: "2026-06-02T10:01:58.000Z",
          completed_at: "2026-06-02T10:02:00.000Z",
          updated_at: "2026-06-02T10:02:00.000Z",
          metadata: importedMetadata,
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "text",
      "thinking",
      "tool_use",
      "tool_use",
      "file_changes_batch",
      "text",
    ]);
    expect(contentParts?.[2]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "command-codex-import-process",
        name: "exec_command",
        result: {
          metadata: expect.objectContaining(importedMetadata),
        },
      },
    });
    expect(contentParts?.[3]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "search-codex-import-process",
        name: "web_search",
        result: {
          metadata: expect.objectContaining(importedMetadata),
        },
      },
    });
    expect(contentParts?.[4]).toMatchObject({
      type: "file_changes_batch",
      aggregate: {
        fileCount: 1,
        files: [
          expect.objectContaining({
            path: "/workspace/imported-codex/src/lib.rs",
            linesAdded: 0,
            linesRemoved: 0,
            status: "completed",
          }),
        ],
      },
    });
  });

  it("只有导入的上下文压缩和子代理过程时也不应跳过最终正文", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "codex",
    };
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "已完成上下文整理。",
      items: buildThreadItems([
        {
          id: "context-compaction-imported",
          type: "context_compaction",
          turn_id: "turn-imported-specialized-process",
          sequence: 1,
          stage: "completed",
          trigger: "auto",
          detail: "Context compacted before continuing.",
          status: "completed",
          started_at: "2026-06-02T10:05:00.000Z",
          completed_at: "2026-06-02T10:05:01.000Z",
          updated_at: "2026-06-02T10:05:01.000Z",
          metadata: importedMetadata,
        },
        {
          id: "subagent-imported",
          type: "subagent_activity",
          turn_id: "turn-imported-specialized-process",
          sequence: 2,
          status_label: "completed",
          title: "review",
          summary: "Subagent finished imported review.",
          status: "completed",
          started_at: "2026-06-02T10:05:02.000Z",
          completed_at: "2026-06-02T10:05:03.000Z",
          updated_at: "2026-06-02T10:05:03.000Z",
          metadata: importedMetadata,
        },
        {
          id: "assistant-imported-specialized-final",
          type: "agent_message",
          turn_id: "turn-imported-specialized-process",
          sequence: 3,
          phase: "final_answer",
          text: "已完成上下文整理。",
          status: "completed",
          started_at: "2026-06-02T10:05:04.000Z",
          completed_at: "2026-06-02T10:05:05.000Z",
          updated_at: "2026-06-02T10:05:05.000Z",
          metadata: importedMetadata,
        },
      ]),
    });

    expect(contentParts).toEqual([
      {
        type: "text",
        text: "已完成上下文整理。",
      },
    ]);
  });

  it("已有内联思考时不应再插入重复的持久化 reasoning", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "thinking",
        text: "先拆解历史恢复的消息结构。",
      },
      {
        type: "text",
        text: "总结完成。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "总结完成。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-duplicate-inline-thinking",
          type: "reasoning",
          turn_id: "turn-duplicate-inline-thinking",
          sequence: 1,
          text: "先拆解历史恢复的消息结构。",
          status: "completed",
          started_at: "2026-06-20T10:00:00.500Z",
          completed_at: "2026-06-20T10:00:01.000Z",
          updated_at: "2026-06-20T10:00:01.000Z",
        },
      ]),
    });

    expect(contentParts).toBeUndefined();
  });

  it("已有工具过程时应把唯一稀疏 reasoning 按时间插入同一流程", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T10:00:00.000Z"),
          endTime: new Date("2026-06-20T10:00:00.200Z"),
        },
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-fetch",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T10:00:01.000Z"),
          endTime: new Date("2026-06-20T10:00:01.200Z"),
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-between-web-tools",
          type: "reasoning",
          turn_id: "turn-between-web-tools",
          sequence: 2,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T10:00:00.500Z",
          completed_at: "2026-06-20T10:00:00.800Z",
          updated_at: "2026-06-20T10:00:00.800Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("实时工具过程缺少时间戳时应按 timeline sequence 插入稀疏 reasoning", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search-sequence",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          startTime: TOOL_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-fetch-sequence",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          startTime: TOOL_FETCH_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-between-web-tools-by-sequence",
          type: "reasoning",
          turn_id: "turn-between-web-tools-by-sequence",
          sequence: 2,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "in_progress",
          started_at: "2026-06-20T12:00:00.200Z",
          updated_at: "2026-06-20T12:00:00.200Z",
        },
        {
          id: "runtime-summary-web-tools-sequence",
          type: "turn_summary",
          turn_id: "turn-between-web-tools-by-sequence",
          sequence: 4,
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T12:00:00.000Z",
          completed_at: "2026-06-20T12:00:00.500Z",
          updated_at: "2026-06-20T12:00:00.500Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("完成态 hydrate 后应使用工具 content part metadata sequence 插入 WebSearch 中间 reasoning", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        metadata: { sequence: 2 },
        toolCall: {
          id: "tool-search-metadata-sequence",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          startTime: TOOL_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "tool_use",
        metadata: { sequence: 4 },
        toolCall: {
          id: "tool-fetch-metadata-sequence",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          startTime: TOOL_FETCH_START_TIME,
          result: { success: true, output: "" },
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "reasoning-between-web-tools-after-hydrate",
          type: "reasoning",
          turn_id: "turn-between-web-tools-after-hydrate",
          sequence: 3,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "",
          completed_at: "",
          updated_at: "",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[0]).toMatchObject({
      type: "tool_use",
      metadata: { sequence: 2 },
    });
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

  it("turn_summary 不应阻断已有工具过程中的稀疏 reasoning 合并", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-search-with-summary",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T11:00:00.000Z"),
          endTime: new Date("2026-06-20T11:00:00.200Z"),
        },
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-fetch-with-summary",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T11:00:01.000Z"),
          endTime: new Date("2026-06-20T11:00:01.200Z"),
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "runtime-summary-web-tools",
          type: "turn_summary",
          turn_id: "turn-web-tools-with-summary",
          sequence: 1,
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T11:00:00.000Z",
          completed_at: "2026-06-20T11:00:02.000Z",
          updated_at: "2026-06-20T11:00:02.000Z",
        },
        {
          id: "reasoning-web-tools-with-summary",
          type: "reasoning",
          turn_id: "turn-web-tools-with-summary",
          sequence: 2,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T11:00:00.500Z",
          completed_at: "2026-06-20T11:00:00.800Z",
          updated_at: "2026-06-20T11:00:00.800Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
  });

  it("完整 WebSearch timeline 已有工具项时仍应把中间 reasoning 合并进内联工具过程", () => {
    const existingContentParts: NonNullable<Message["contentParts"]> = [
      {
        type: "tool_use",
        metadata: { sequence: 2 },
        toolCall: {
          id: "tool-search-complete-timeline",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T13:00:00.000Z"),
          endTime: new Date("2026-06-20T13:00:00.200Z"),
        },
      },
      {
        type: "tool_use",
        metadata: { sequence: 4 },
        toolCall: {
          id: "tool-fetch-complete-timeline",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/lime-websearch-rendering",
          }),
          status: "completed",
          result: { success: true, output: "" },
          startTime: new Date("2026-06-20T13:00:01.000Z"),
          endTime: new Date("2026-06-20T13:00:01.200Z"),
        },
      },
      {
        type: "text",
        text: "网页搜索渲染结论。",
      },
    ];

    const contentParts = buildTimelineInlineContentParts({
      displayContent: "网页搜索渲染结论。",
      existingContentParts,
      items: buildThreadItems([
        {
          id: "tool-search-complete-timeline",
          type: "tool_call",
          tool_name: "WebSearch",
          arguments: { query: "Lime WebSearch rendering" },
          output: "",
          success: true,
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 2,
          status: "completed",
          started_at: "2026-06-20T13:00:00.000Z",
          completed_at: "2026-06-20T13:00:00.200Z",
          updated_at: "2026-06-20T13:00:00.200Z",
          metadata: { sequence: 2 },
        },
        {
          id: "reasoning-complete-web-tools",
          type: "reasoning",
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 3,
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          status: "completed",
          started_at: "2026-06-20T13:00:00.500Z",
          completed_at: "2026-06-20T13:00:00.800Z",
          updated_at: "2026-06-20T13:00:00.800Z",
        },
        {
          id: "tool-fetch-complete-timeline",
          type: "tool_call",
          tool_name: "WebFetch",
          arguments: {
            url: "https://example.com/lime-websearch-rendering",
          },
          output: "",
          success: true,
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 4,
          status: "completed",
          started_at: "2026-06-20T13:00:01.000Z",
          completed_at: "2026-06-20T13:00:01.200Z",
          updated_at: "2026-06-20T13:00:01.200Z",
          metadata: { sequence: 4 },
        },
        {
          id: "runtime-summary-complete-web-tools",
          type: "turn_summary",
          turn_id: "turn-web-tools-complete-timeline",
          sequence: 5,
          text: "已搜索网页 1 次，读取网页 1 次",
          status: "completed",
          started_at: "2026-06-20T13:00:00.000Z",
          completed_at: "2026-06-20T13:00:01.500Z",
          updated_at: "2026-06-20T13:00:01.500Z",
        },
      ]),
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });
});
