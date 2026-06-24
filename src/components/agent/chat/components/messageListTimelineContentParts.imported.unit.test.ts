import { describe, expect, it } from "vitest";

import { buildTimelineInlineContentParts } from "./messageListTimelineContentParts";
import { buildThreadItems } from "./messageListTimelineContentParts.testHarness";

describe("messageListTimelineContentParts imported timeline", () => {
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
        metadata: {
          ...importedMetadata,
          source: "thread_item_reasoning",
          threadItemId: "reasoning-imported-single",
          turnId: "turn-imported-single-reasoning",
          sequence: 1,
        },
      },
      {
        type: "text",
        text: "已确认处理方案。",
        metadata: {
          ...importedMetadata,
          source: "agent_thread_item",
          threadItemId: "assistant-imported-single-final",
          turnId: "turn-imported-single-reasoning",
          sequence: 2,
          phase: "final_answer",
        },
      },
    ]);
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

    expect(contentParts?.map((part) => part.type)).toEqual(["text", "text"]);
    expect(contentParts?.[0]).toMatchObject({
      type: "text",
      text: "<proposed_plan>\n- [ ] 继续执行计划\n</proposed_plan>",
    });
    expect(contentParts?.[1]).toMatchObject({
      type: "text",
      text: "继续执行计划。",
      metadata: {
        source: "agent_thread_item",
        threadItemId: "assistant-plan-only",
        turnId: "turn-imported-plan-only",
        sequence: 2,
        phase: "final_answer",
      },
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
        metadata: {
          ...importedMetadata,
          source: "agent_thread_item",
          threadItemId: "assistant-imported-specialized-final",
          turnId: "turn-imported-specialized-process",
          sequence: 3,
          phase: "final_answer",
        },
      },
    ]);
  });
});
