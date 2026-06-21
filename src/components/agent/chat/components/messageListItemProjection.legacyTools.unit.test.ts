import { describe, expect, it } from "vitest";

import { buildProjection, type Message } from "./messageListItemProjection.testHarness";

describe("messageListItemProjection legacy tool sources", () => {
  it("旧 timeline 缺少 phase 时应只把最后一条 agent_message 当作最终正文", () => {
    const message: Message = {
      id: "assistant-history",
      role: "assistant",
      content: "## 今日国际新闻简报\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-process-search",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        text: "我会先做几组中英文检索。",
        status: "completed",
        started_at: "2026-06-02T10:00:01.000Z",
        completed_at: "2026-06-02T10:00:02.000Z",
        updated_at: "2026-06-02T10:00:02.000Z",
      },
      {
        id: "tool-web-search",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 3,
        tool_name: "web_search",
        arguments: { query: "world news headlines" },
        output: "搜索结果摘要",
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:00:03.000Z",
        completed_at: "2026-06-02T10:00:05.000Z",
        updated_at: "2026-06-02T10:00:05.000Z",
      },
      {
        id: "assistant-process-fetch",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 4,
        text: "我再打开几个页面交叉核对。",
        status: "completed",
        started_at: "2026-06-02T10:00:06.000Z",
        completed_at: "2026-06-02T10:00:07.000Z",
        updated_at: "2026-06-02T10:00:07.000Z",
      },
      {
        id: "tool-web-fetch-failed",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 5,
        tool_name: "WebFetch",
        arguments: { url: "https://example.invalid/news" },
        output: "",
        error: "请求失败",
        success: false,
        status: "failed",
        started_at: "2026-06-02T10:00:08.000Z",
        completed_at: "2026-06-02T10:00:09.000Z",
        updated_at: "2026-06-02T10:00:09.000Z",
      },
      {
        id: "assistant-final",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 6,
        text: "## 今日国际新闻简报\n\n- 第一条要闻。",
        status: "completed",
        started_at: "2026-06-02T10:00:28.000Z",
        completed_at: "2026-06-02T10:00:30.000Z",
        updated_at: "2026-06-02T10:00:30.000Z",
      },
    ] as never);

    expect(projection.actionContent).toBe(
      "## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererRawContent).toBe(
      "## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererRawContent).not.toContain("中英文检索");
    expect(projection.rendererRawContent).not.toContain("交叉核对");
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "tool_use",
      "text",
    ]);
  });

  it("timeline 已有工具 item 时不应再把 legacy message.toolCalls 作为第二套过程源", () => {
    const message: Message = {
      id: "assistant-live-thread-items-own-tools",
      role: "assistant",
      content: "## 结论\n\n- 已完成联网核验。",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      toolCalls: [
        {
          id: "legacy-web-search",
          name: "web_search",
          arguments: '{"query":"legacy duplicate"}',
          status: "completed",
          result: {
            success: true,
            output: "legacy duplicate output",
          },
          startTime: new Date("2026-06-02T10:00:03.000Z"),
          endTime: new Date("2026-06-02T10:00:05.000Z"),
        },
      ],
    };

    const projection = buildProjection(message, [
      {
        id: "tool-web-search-current",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 1,
        tool_name: "web_search",
        arguments: { query: "current thread item" },
        output: "current output",
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:00:03.000Z",
        completed_at: "2026-06-02T10:00:05.000Z",
        updated_at: "2026-06-02T10:00:05.000Z",
      },
      {
        id: "assistant-final",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        phase: "final_answer",
        text: "## 结论\n\n- 已完成联网核验。",
        status: "completed",
        started_at: "2026-06-02T10:00:28.000Z",
        completed_at: "2026-06-02T10:00:30.000Z",
        updated_at: "2026-06-02T10:00:30.000Z",
      },
    ] as never);

    expect(projection.rendererToolCalls).toBeUndefined();
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    const toolParts = projection.rendererContentParts?.filter(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "tool_use" }
      > => part.type === "tool_use",
    );
    expect(toolParts).toHaveLength(1);
    expect(toolParts?.[0]?.toolCall.id).toBe("tool-web-search-current");
    expect(JSON.stringify(projection.rendererContentParts)).not.toContain(
      "legacy duplicate",
    );
  });

  it("无 timeline 时应继续允许 legacy message.toolCalls 作为兼容过程源", () => {
    const message: Message = {
      id: "assistant-legacy-toolcalls-without-timeline",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      isThinking: true,
      toolCalls: [
        {
          id: "legacy-search-without-timeline",
          name: "web_search",
          arguments: '{"query":"legacy no timeline"}',
          status: "running",
          startTime: new Date("2026-06-02T10:00:03.000Z"),
        },
      ],
    };

    const projection = buildProjection(message, null, {
      isSending: true,
    });

    expect(projection.rendererToolCalls).toEqual([
      expect.objectContaining({ id: "legacy-search-without-timeline" }),
    ]);
    expect(projection.inlineProcessCoverage.hasInlineProcessEntries).toBe(true);
  });

  it("timeline 只有状态摘要时应继续允许 legacy message.toolCalls 兜底旧过程", () => {
    const message: Message = {
      id: "assistant-timeline-summary-blocks-legacy-tools",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      isThinking: true,
      toolCalls: [
        {
          id: "legacy-tool-while-summary-exists",
          name: "web_search",
          arguments: '{"query":"legacy summary duplicate"}',
          status: "running",
          startTime: new Date("2026-06-02T10:00:03.000Z"),
        },
      ],
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "turn-summary-current-source",
          type: "turn_summary",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          text: "正在连接搜索工具。",
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
        } as never,
      ],
      {
        isSending: true,
        turnStatus: "running",
      },
    );

    expect(projection.rendererToolCalls).toEqual([
      expect.objectContaining({ id: "legacy-tool-while-summary-exists" }),
    ]);
    expect(
      projection.inlineProcessCoverage.toolNameCounts.get("web_search"),
    ).toBe(1);
  });

  it("timeline 过程项未生成 tool_use part 时仍应禁用 legacy message.toolCalls", () => {
    const message: Message = {
      id: "assistant-context-compaction-blocks-legacy-tools",
      role: "assistant",
      content: "已整理上下文后继续。",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      isThinking: false,
      toolCalls: [
        {
          id: "legacy-tool-while-context-compaction-exists",
          name: "web_search",
          arguments: '{"query":"legacy context duplicate"}',
          status: "completed",
          result: {
            success: true,
            output: "legacy duplicate output",
          },
          startTime: new Date("2026-06-02T10:00:03.000Z"),
          endTime: new Date("2026-06-02T10:00:05.000Z"),
        },
      ],
    };

    const projection = buildProjection(message, [
      {
        id: "context-compaction-current-source",
        type: "context_compaction",
        turn_id: "turn-legacy-unphased-final",
        sequence: 1,
        stage: "completed",
        trigger: "manual",
        detail: "已压缩上下文。",
        status: "completed",
        started_at: "2026-06-02T10:00:01.000Z",
        completed_at: "2026-06-02T10:00:02.000Z",
        updated_at: "2026-06-02T10:00:02.000Z",
      } as never,
      {
        id: "assistant-final-after-compaction",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        phase: "final_answer",
        text: "已整理上下文后继续。",
        status: "completed",
        started_at: "2026-06-02T10:00:28.000Z",
        completed_at: "2026-06-02T10:00:30.000Z",
        updated_at: "2026-06-02T10:00:30.000Z",
      } as never,
    ] as never);

    expect(projection.rendererToolCalls).toBeUndefined();
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
    ]);
    expect(JSON.stringify(projection)).not.toContain(
      "legacy context duplicate",
    );
  });

  it("Codex 导入 timeline 应继续保留只读工具过程渲染", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "codex",
    };
    const message: Message = {
      id: "assistant-imported-codex-history",
      role: "assistant",
      content: "已完成导入会话复盘。",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "imported-reasoning",
        type: "reasoning",
        turn_id: "turn-legacy-unphased-final",
        sequence: 1,
        text: "先检查导入记录。",
        summary: ["先检查导入记录。"],
        metadata: importedMetadata,
        status: "completed",
        started_at: "2026-06-02T10:00:01.000Z",
        completed_at: "2026-06-02T10:00:02.000Z",
        updated_at: "2026-06-02T10:00:02.000Z",
      },
      {
        id: "imported-command",
        type: "command_execution",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        command: "npm test",
        cwd: "/workspace/imported-codex",
        aggregated_output: "ok",
        metadata: importedMetadata,
        status: "completed",
        started_at: "2026-06-02T10:00:03.000Z",
        completed_at: "2026-06-02T10:00:04.000Z",
        updated_at: "2026-06-02T10:00:04.000Z",
      },
      {
        id: "assistant-imported-final",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 3,
        phase: "final_answer",
        text: "已完成导入会话复盘。",
        metadata: importedMetadata,
        status: "completed",
        started_at: "2026-06-02T10:00:28.000Z",
        completed_at: "2026-06-02T10:00:30.000Z",
        updated_at: "2026-06-02T10:00:30.000Z",
      },
    ] as never);

    expect(projection.rendererToolCalls).toBeUndefined();
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(projection.primaryTimeline?.items).toBeUndefined();
    expect(projection.shouldRenderCompactPrimaryTimeline).toBe(false);
    expect(projection.actionContent).toBe("已完成导入会话复盘。");
  });
});
