import { describe, expect, it } from "vitest";

import { buildTimelineInlineContentParts } from "./messageListTimelineContentParts";
import type { AgentThreadItem } from "../types";

describe("messageListTimelineContentParts", () => {
  it("本地历史导入的单条思考也应按来源顺序进入正文过程流", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "codex",
    };
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "已确认处理方案。",
      items: [
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
      ] as AgentThreadItem[],
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
      items: [
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
      ] as AgentThreadItem[],
    });

    expect(contentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);
    expect(contentParts?.[0]).toMatchObject({
      type: "text",
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
      items: [
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
      ] as AgentThreadItem[],
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
      items: [
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
      ] as AgentThreadItem[],
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
      items: [
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
      ] as AgentThreadItem[],
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
      items: [
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
      ] as AgentThreadItem[],
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
      items: [
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
      ] as AgentThreadItem[],
    });

    expect(contentParts).toEqual([
      {
        type: "text",
        text: "已完成上下文整理。",
      },
    ]);
  });
});
