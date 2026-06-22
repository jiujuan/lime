import { describe, expect, it } from "vitest";
import {
  isMockToolUsePart,
  mockStreamingRenderer,
  render,
} from "./MessageList.testHarness";
import type {
  AgentThreadItem,
  AgentThreadTurn,
  Message,
} from "./MessageList.testHarness";

describe("MessageList imported history codex import", () => {
  it("续聊后的本地历史导入过程不应折叠掉命令记录入口", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "codex",
    };
    const importedTurn: AgentThreadTurn = {
      id: "turn-imported-history",
      thread_id: "thread-imported-history",
      prompt_text: "请运行测试并修复失败",
      status: "completed",
      started_at: "2026-06-17T06:50:48.053Z",
      completed_at: "2026-06-17T06:50:48.236Z",
      created_at: "2026-06-17T06:50:48.053Z",
      updated_at: "2026-06-17T06:50:48.236Z",
    };
    const continuationTurn: AgentThreadTurn = {
      id: "turn-imported-continuation",
      thread_id: "thread-imported-history",
      prompt_text: "在这个导入会话里继续总结下一步",
      status: "completed",
      started_at: "2026-06-17T06:50:48.923Z",
      completed_at: "2026-06-17T06:50:49.019Z",
      created_at: "2026-06-17T06:50:48.923Z",
      updated_at: "2026-06-17T06:50:49.019Z",
    };
    const messages: Message[] = [
      {
        id: "turn-imported-history:user",
        role: "user",
        content: "请运行测试并修复失败",
        timestamp: new Date("2026-06-17T06:50:48.053Z"),
      },
      {
        id: "turn-imported-history:assistant",
        role: "assistant",
        content: "已完成修复。",
        runtimeTurnId: importedTurn.id,
        timestamp: new Date("2026-06-17T06:50:48.236Z"),
      },
      {
        id: "turn-imported-continuation:user",
        role: "user",
        content: "在这个导入会话里继续总结下一步",
        timestamp: new Date("2026-06-17T06:50:48.923Z"),
      },
      {
        id: "turn-imported-continuation:assistant",
        role: "assistant",
        content:
          "这条导入会话已经恢复了原始问题、执行记录、文件变更和只读确认记录。",
        runtimeTurnId: continuationTurn.id,
        timestamp: new Date("2026-06-17T06:50:49.019Z"),
      },
    ];
    const threadItems: AgentThreadItem[] = [
      {
        id: "imported-progress",
        type: "agent_message",
        thread_id: importedTurn.thread_id,
        turn_id: importedTurn.id,
        sequence: 2,
        text: "我会先运行测试并检查失败。",
        status: "completed",
        started_at: "2026-06-17T06:50:48.060Z",
        completed_at: "2026-06-17T06:50:48.070Z",
        updated_at: "2026-06-17T06:50:48.070Z",
        metadata: importedMetadata,
      },
      {
        id: "imported-reasoning",
        type: "reasoning",
        thread_id: importedTurn.thread_id,
        turn_id: importedTurn.id,
        sequence: 3,
        text: "需要先确认测试失败点。",
        status: "completed",
        started_at: "2026-06-17T06:50:48.071Z",
        completed_at: "2026-06-17T06:50:48.080Z",
        updated_at: "2026-06-17T06:50:48.080Z",
        metadata: importedMetadata,
      },
      {
        id: "imported-command",
        type: "command_execution",
        thread_id: importedTurn.thread_id,
        turn_id: importedTurn.id,
        sequence: 5,
        command: "npm test",
        cwd: "/workspace/imported-codex",
        aggregated_output: "ok",
        exit_code: 0,
        status: "completed",
        started_at: "2026-06-17T06:50:48.081Z",
        completed_at: "2026-06-17T06:50:48.090Z",
        updated_at: "2026-06-17T06:50:48.090Z",
        metadata: importedMetadata,
      },
      {
        id: "imported-read-md",
        type: "tool_call",
        thread_id: importedTurn.thread_id,
        turn_id: importedTurn.id,
        sequence: 11,
        tool_name: "read_file",
        arguments: {
          path: "/workspace/imported-local-history/docs/imported-preview.md",
        },
        output: "导入会话 Markdown 预览内容",
        success: true,
        status: "completed",
        started_at: "2026-06-17T06:50:48.101Z",
        completed_at: "2026-06-17T06:50:48.110Z",
        updated_at: "2026-06-17T06:50:48.110Z",
        metadata: importedMetadata,
      },
      {
        id: "imported-read-html",
        type: "tool_call",
        thread_id: importedTurn.thread_id,
        turn_id: importedTurn.id,
        sequence: 12,
        tool_name: "read_file",
        arguments: {
          path: "/workspace/imported-local-history/docs/imported-preview.html",
        },
        output: "导入会话 HTML 预览内容",
        success: true,
        status: "completed",
        started_at: "2026-06-17T06:50:48.111Z",
        completed_at: "2026-06-17T06:50:48.120Z",
        updated_at: "2026-06-17T06:50:48.120Z",
        metadata: importedMetadata,
      },
      {
        id: "imported-read-docx",
        type: "tool_call",
        thread_id: importedTurn.thread_id,
        turn_id: importedTurn.id,
        sequence: 13,
        tool_name: "read_file",
        arguments: {
          path: "/workspace/imported-local-history/docs/imported-preview.docx",
        },
        output: "导入会话 DOCX 预览内容",
        success: true,
        status: "completed",
        started_at: "2026-06-17T06:50:48.121Z",
        completed_at: "2026-06-17T06:50:48.130Z",
        updated_at: "2026-06-17T06:50:48.130Z",
        metadata: importedMetadata,
      },
      {
        id: "imported-search",
        type: "web_search",
        thread_id: importedTurn.thread_id,
        turn_id: importedTurn.id,
        sequence: 14,
        action: "search_query",
        output: '"search_query"',
        status: "completed",
        started_at: "2026-06-17T06:50:48.131Z",
        completed_at: "2026-06-17T06:50:48.140Z",
        updated_at: "2026-06-17T06:50:48.140Z",
        metadata: importedMetadata,
      },
      {
        id: "imported-patch",
        type: "patch",
        thread_id: importedTurn.thread_id,
        turn_id: importedTurn.id,
        sequence: 15,
        text: "Patch changed /workspace/imported-codex/src/lib.rs",
        paths: ["/workspace/imported-codex/src/lib.rs"],
        success: true,
        status: "completed",
        started_at: "2026-06-17T06:50:48.141Z",
        completed_at: "2026-06-17T06:50:48.150Z",
        updated_at: "2026-06-17T06:50:48.150Z",
        metadata: importedMetadata,
      },
      {
        id: "imported-final",
        type: "agent_message",
        thread_id: importedTurn.thread_id,
        turn_id: importedTurn.id,
        sequence: 20,
        phase: "final_answer",
        text: "已完成修复。",
        status: "completed",
        started_at: "2026-06-17T06:50:48.220Z",
        completed_at: "2026-06-17T06:50:48.236Z",
        updated_at: "2026-06-17T06:50:48.236Z",
        metadata: importedMetadata,
      },
    ];

    const container = render(messages, {
      turns: [importedTurn, continuationTurn],
      threadItems,
      currentTurnId: null,
      sessionHistoryWindow: {
        loadedMessages: 4,
        totalMessages: 4,
        isLoadingFull: false,
        error: null,
      },
    });

    expect(
      container.querySelector(
        '[data-testid="message-list-historical-timeline-preview:leading"]',
      ),
    ).toBeNull();
    const importedAssistantRendererCall = mockStreamingRenderer.mock.calls.find(
      ([props]) => {
        const rendererProps = props as {
          content?: string;
          contentParts?: Array<Record<string, unknown>>;
        };
        return (
          rendererProps.content?.includes("已完成修复。") &&
          rendererProps.contentParts?.some((part) => part.type === "tool_use")
        );
      },
    )?.[0] as
      | { content?: string; contentParts?: Array<Record<string, unknown>> }
      | undefined;

    const importedContentParts =
      importedAssistantRendererCall?.contentParts || [];
    expect(importedAssistantRendererCall?.content).toContain(
      "我会先运行测试并检查失败。",
    );
    expect(importedAssistantRendererCall?.content).toContain("已完成修复。");
    expect(importedContentParts.map((part) => part.type)).toEqual(
      expect.arrayContaining([
        "thinking",
        "tool_use",
        "file_changes_batch",
        "text",
      ]),
    );
    expect(
      importedContentParts.find((part) => part.type === "thinking"),
    ).toMatchObject({
      type: "thinking",
      text: "需要先确认测试失败点。",
    });
    expect(
      importedContentParts.find(
        (part) =>
          isMockToolUsePart(part) && part.toolCall.id === "imported-command",
      ),
    ).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "imported-command",
        name: "exec_command",
        result: {
          metadata: expect.objectContaining({
            imported: true,
            imported_synthetic: true,
            source_client: "codex",
          }),
        },
      },
    });
    expect(
      importedContentParts.find(
        (part) =>
          isMockToolUsePart(part) && part.toolCall.id === "imported-search",
      ),
    ).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "imported-search",
        name: "web_search",
        result: {
          metadata: expect.objectContaining({
            imported: true,
            imported_synthetic: true,
            source_client: "codex",
          }),
        },
      },
    });
    expect(
      importedContentParts.find(
        (part) =>
          isMockToolUsePart(part) && part.toolCall.id === "imported-read-docx",
      ),
    ).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "imported-read-docx",
        name: "read_file",
        result: {
          metadata: expect.objectContaining({
            imported: true,
            imported_synthetic: true,
            source_client: "codex",
          }),
        },
      },
    });
    expect(
      importedContentParts.find((part) => part.type === "file_changes_batch"),
    ).toMatchObject({
      type: "file_changes_batch",
      aggregate: {
        fileCount: 1,
        files: [
          expect.objectContaining({
            path: "/workspace/imported-codex/src/lib.rs",
          }),
        ],
      },
    });
  });
});
