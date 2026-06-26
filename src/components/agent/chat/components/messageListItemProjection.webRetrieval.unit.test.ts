import { describe, expect, it } from "vitest";

import { buildProjection, type Message } from "./messageListItemProjection.testHarness";

describe("messageListItemProjection web retrieval", () => {
  it("流式正文 overlay 不应把最终正文插到网页搜索过程前", () => {
    const message: Message = {
      id: "assistant-live-overlay-search",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
      contentParts: [
        {
          type: "text",
          text: "我先联网核实今天的国际新闻，再整理成简报。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-web-search",
            name: "web_search",
            arguments: '{"query":"2026-06-02 international news"}',
            status: "completed",
            result: {
              success: true,
              output: "已搜索网页 5 次",
            },
          } as never,
        },
      ],
    };

    const projection = buildProjection(message, null, {
      streamingTextOverlay: {
        messageId: message.id,
        eventName: "response.output_text.delta",
        content: "## 今日国际新闻简报\n\n- 第一条要闻。",
        phase: "final_answer",
        updatedAt: Date.parse("2026-06-02T10:00:02.000Z"),
      },
    });

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);
    expect(parts[0]?.type === "text" ? parts[0].text : "").toContain(
      "我先联网核实",
    );
    expect(parts[1]?.type === "tool_use" ? parts[1].toolCall.name : "").toBe(
      "web_search",
    );
    expect(parts[2]?.type === "text" ? parts[2].text : "").toContain(
      "今日国际新闻简报",
    );
    expect(projection.displayContent).toBe("");
    expect(projection.actionContent).toBe(
      "## 今日国际新闻简报\n\n- 第一条要闻。",
    );
  });

  it("完成态 WebTools contentParts 缺首段 text 时不应从完整 content 恢复导语", () => {
    const message: Message = {
      id: "assistant-completed-web-tools-missing-intro-part",
      role: "assistant",
      content:
        "我先联网核实目标页面来源。\n\n网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。\n\n## 五年级选购指南\n\n- 第一条建议。",
      timestamp: new Date("2026-06-22T01:00:00.000Z"),
      isThinking: false,
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "web-search-rendering",
            name: "WebSearch",
            arguments: '{"query":"Lime WebSearch rendering"}',
            status: "completed",
            startTime: new Date("2026-06-22T01:00:01.000Z"),
            endTime: new Date("2026-06-22T01:00:02.000Z"),
            result: {
              success: true,
              output: "Lime WebSearch Rendering Source",
            },
          } as never,
        },
        {
          type: "tool_use",
          toolCall: {
            id: "web-fetch-rendering",
            name: "WebFetch",
            arguments:
              '{"url":"https://example.com/lime-websearch-rendering"}',
            status: "completed",
            startTime: new Date("2026-06-22T01:00:02.000Z"),
            endTime: new Date("2026-06-22T01:00:03.000Z"),
            result: {
              success: true,
              output: "Fetched page snapshot",
            },
          } as never,
        },
        {
          type: "thinking",
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          metadata: {
            source: "thread_item_reasoning",
            threadItemId: "web-reasoning-rendering",
          },
        },
        {
          type: "text",
          text: "网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。\n\n## 五年级选购指南\n\n- 第一条建议。",
        },
      ],
    };

    const projection = buildProjection(message, null, {
      isSending: false,
    });

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "tool_use",
      "thinking",
      "text",
    ]);
    expect(projection.rendererContentParts?.[0]).toMatchObject({
      type: "tool_use",
    });
    expect(projection.actionContent).not.toContain(
      "我先联网核实目标页面来源。",
    );
    expect(projection.actionContent).toContain("网页搜索渲染结论");
  });

  it("网页搜索仍在运行时显式 final_answer overlay 应作为正文排在过程后", () => {
    const message: Message = {
      id: "assistant-running-search-overlay",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-running",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
      ],
      {
        turnStatus: "running",
        streamingTextOverlay: {
          messageId: message.id,
          eventName: "response.output_text.delta",
          content: "## 今日 AI 新闻\n\n- 第一条要闻。",
          phase: "final_answer",
          updatedAt: Date.parse("2026-06-02T10:00:03.000Z"),
        },
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["tool_use", "text"]);
    expect(parts[1]).toMatchObject({
      type: "text",
      text: "## 今日 AI 新闻\n\n- 第一条要闻。",
    });
    expect(projection.actionContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererContent).toBe(
      "## 今日 AI 新闻\n\n- 第一条要闻。",
    );
    expect(projection.rendererRawContent).toBe(
      "## 今日 AI 新闻\n\n- 第一条要闻。",
    );
    expect(JSON.stringify(parts)).not.toContain('"type":"thinking"');
  });

  it("搜索运行中首字正文已提交时，应保留工具前导语但不显示无 phase overlay", () => {
    const message: Message = {
      id: "assistant-running-search-overlay-prefix",
      role: "assistant",
      content: "我",
      timestamp: new Date("2026-06-24T10:00:00.000Z"),
      isThinking: true,
      contentParts: [
        {
          type: "text",
          text: "我",
          metadata: {
            source: "agent_text_delta",
            sequence: 1,
          },
        },
        {
          type: "tool_use",
          metadata: {
            sequence: 2,
          },
          toolCall: {
            id: "tool-web-search-prefix",
            name: "web_search",
            arguments:
              '{"query":"2026-06-24 international news latest headlines"}',
            status: "running",
          } as never,
        },
      ],
    };

    const projection = buildProjection(message, null, {
      isSending: true,
      turnStatus: "running",
      streamingTextOverlay: {
        messageId: message.id,
        eventName: "response.output_text.delta",
        content: "我会先联网核实今天（2026-06-24）的国际新闻头条。",
        updatedAt: Date.parse("2026-06-24T10:00:03.000Z"),
      },
    });

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["text", "tool_use"]);
    expect(parts[0]).toMatchObject({
      type: "text",
      text: "我",
    });
    expect(parts[1]).toMatchObject({
      type: "tool_use",
      toolCall: expect.objectContaining({
        id: "tool-web-search-prefix",
        status: "running",
      }),
    });
    expect(JSON.stringify(parts)).not.toContain("我会先联网核实今天");
    expect(
      parts.some(
        (part) =>
          part.type === "thinking" &&
          part.text.includes("我会先联网核实今天"),
      ),
    ).toBe(false);
  });

  it("完成后已有结构化 contentParts 时不应再用 timeline 重建另一组过程流", () => {
    const message: Message = {
      id: "assistant-completed-content-parts-owner",
      role: "assistant",
      content: "live final answer",
      timestamp: new Date("2026-06-24T10:00:00.000Z"),
      isThinking: false,
      contentParts: [
        {
          type: "text",
          text: "live commentary before search",
          metadata: {
            source: "agent_text_delta",
            phase: "commentary",
            sequence: 1,
            turnId: "turn-content-parts-owner",
          },
        },
        {
          type: "tool_use",
          metadata: { sequence: 2 },
          toolCall: {
            id: "web-search-content-parts-owner",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "rendering owner" }),
            status: "completed",
            result: {
              success: true,
              output: "live search output",
            },
          } as never,
        },
        {
          type: "thinking",
          text: "live reasoning between tools",
          metadata: {
            source: "thread_item_reasoning",
            threadItemId: "reasoning-content-parts-owner",
            sequence: 3,
            turnId: "turn-content-parts-owner",
          },
        },
        {
          type: "tool_use",
          metadata: { sequence: 4 },
          toolCall: {
            id: "web-fetch-content-parts-owner",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://example.com/rendering-owner",
            }),
            status: "completed",
            result: {
              success: true,
              output: "live fetch output",
            },
          } as never,
        },
        {
          type: "text",
          text: "live final answer",
          metadata: {
            source: "agent_text_delta",
            phase: "final_answer",
            sequence: 5,
            turnId: "turn-content-parts-owner",
          },
        },
      ],
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "timeline-commentary-content-parts-owner",
          type: "agent_message",
          thread_id: "thread-content-parts-owner",
          turn_id: "turn-content-parts-owner",
          sequence: 1,
          phase: "commentary",
          text: "timeline commentary should not replace live contentParts",
          status: "completed",
          started_at: "2026-06-24T10:00:00.000Z",
          completed_at: "2026-06-24T10:00:00.500Z",
          updated_at: "2026-06-24T10:00:00.500Z",
        } as never,
        {
          id: "web-search-content-parts-owner",
          type: "tool_call",
          thread_id: "thread-content-parts-owner",
          turn_id: "turn-content-parts-owner",
          sequence: 2,
          tool_name: "WebSearch",
          arguments: { query: "rendering owner" },
          output: "timeline search output",
          status: "completed",
          started_at: "2026-06-24T10:00:01.000Z",
          completed_at: "2026-06-24T10:00:02.000Z",
          updated_at: "2026-06-24T10:00:02.000Z",
        } as never,
        {
          id: "reasoning-content-parts-owner",
          type: "reasoning",
          thread_id: "thread-content-parts-owner",
          turn_id: "turn-content-parts-owner",
          sequence: 3,
          text: "timeline reasoning should not replace live contentParts",
          status: "completed",
          started_at: "2026-06-24T10:00:02.000Z",
          completed_at: "2026-06-24T10:00:03.000Z",
          updated_at: "2026-06-24T10:00:03.000Z",
        } as never,
        {
          id: "web-fetch-content-parts-owner",
          type: "tool_call",
          thread_id: "thread-content-parts-owner",
          turn_id: "turn-content-parts-owner",
          sequence: 4,
          tool_name: "WebFetch",
          arguments: { url: "https://example.com/rendering-owner" },
          output: "timeline fetch output",
          status: "completed",
          started_at: "2026-06-24T10:00:03.000Z",
          completed_at: "2026-06-24T10:00:04.000Z",
          updated_at: "2026-06-24T10:00:04.000Z",
        } as never,
        {
          id: "timeline-final-content-parts-owner",
          type: "agent_message",
          thread_id: "thread-content-parts-owner",
          turn_id: "turn-content-parts-owner",
          sequence: 5,
          phase: "final_answer",
          text: "timeline final should not replace live contentParts",
          status: "completed",
          started_at: "2026-06-24T10:00:04.000Z",
          completed_at: "2026-06-24T10:00:05.000Z",
          updated_at: "2026-06-24T10:00:05.000Z",
        } as never,
      ],
      {
        isSending: false,
        turnId: "turn-content-parts-owner",
        turnStatus: "completed",
      },
    );

    const serialized = JSON.stringify(projection.rendererContentParts);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(serialized).toContain("live commentary before search");
    expect(serialized).toContain("live reasoning between tools");
    expect(serialized).toContain("live final answer");
    expect(serialized).not.toContain("timeline commentary should not replace");
    expect(serialized).not.toContain("timeline reasoning should not replace");
    expect(serialized).not.toContain("timeline final should not replace");
  });

  it("搜索运行中 commentary overlay 不应作为最终正文，commentary item 应按序作为可见文本渲染", () => {
    const message: Message = {
      id: "assistant-running-search-commentary-overlay",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-24T10:00:00.000Z"),
      isThinking: true,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-before-commentary",
          thread_id: "thread-running-search",
          turn_id: "turn-running-search-commentary",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-24T10:00:01.000Z",
          updated_at: "2026-06-24T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天国际新闻",
        } as never,
        {
          id: "commentary-after-search",
          type: "agent_message",
          turn_id: "turn-running-search-commentary",
          sequence: 2,
          phase: "commentary",
          text: "我会继续读取来源并筛选重复报道。",
          status: "in_progress",
          started_at: "2026-06-24T10:00:03.000Z",
          updated_at: "2026-06-24T10:00:03.000Z",
        } as never,
      ],
      {
        isSending: true,
        turnStatus: "running",
        streamingTextOverlay: {
          messageId: message.id,
          eventName: "message.delta",
          content: "我会继续读取来源并筛选重复报道。",
          phase: "commentary",
          updatedAt: Date.parse("2026-06-24T10:00:03.000Z"),
        },
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["tool_use", "text"]);
    expect(parts[1]).toMatchObject({
      type: "text",
      text: "我会继续读取来源并筛选重复报道。",
      metadata: {
        phase: "commentary",
        source: "agent_thread_item",
        threadItemId: "commentary-after-search",
        turnId: "turn-running-search-commentary",
        sequence: 2,
      },
    });
    expect(
      parts.some(
        (part) =>
          part.type === "thinking" &&
          part.text.includes("我会继续读取来源并筛选重复报道"),
      ),
    ).toBe(false);
    expect(projection.actionContent).toBe("");
  });

  it("网页搜索状态滞后为 running 时，已到达的 final_answer 应继续穿插显示", () => {
    const message: Message = {
      id: "assistant-running-search-final-item",
      role: "assistant",
      content: "## 今日 AI 新闻\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-running-before-final",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
        {
          id: "assistant-running-final-answer",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          phase: "final_answer",
          text: "## 今日 AI 新闻\n\n- 第一条要闻。",
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:04.000Z",
          updated_at: "2026-06-02T10:00:04.000Z",
        } as never,
      ],
      {
        turnStatus: "running",
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(projection.actionContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererRawContent).toBe(
      "## 今日 AI 新闻\n\n- 第一条要闻。",
    );
    expect(parts[0]?.type === "tool_use" ? parts[0].toolCall.status : "").toBe(
      "running",
    );
    expect(parts[1]?.type === "text" ? parts[1].text : "").toContain(
      "今日 AI 新闻",
    );
  });

  it("网页搜索 tool_call 状态滞后为 running 时，已到达的 final_answer 应继续穿插显示", () => {
    const message: Message = {
      id: "assistant-running-string-search-final-item",
      role: "assistant",
      content: "## 今日 AI 新闻\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-running-string-before-final",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "running",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "tool_call",
          tool_name: "WebSearch",
          arguments: { query: "今天 AI 行业公开新闻" },
          output: "",
        } as never,
        {
          id: "assistant-final-after-running-string-search",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          phase: "final_answer",
          text: "## 今日 AI 新闻\n\n- 第一条要闻。",
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:04.000Z",
          updated_at: "2026-06-02T10:00:04.000Z",
        } as never,
      ],
      {
        turnStatus: "running",
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(projection.actionContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererRawContent).toBe(
      "## 今日 AI 新闻\n\n- 第一条要闻。",
    );
    expect(parts[0]?.type === "tool_use" ? parts[0].toolCall.status : "").toBe(
      "running",
    );
    expect(parts[1]?.type === "text" ? parts[1].text : "").toContain(
      "今日 AI 新闻",
    );
  });

  it("网页搜索仍在运行且 message.content 已有正文时也不应显示到工具下方", () => {
    const message: Message = {
      id: "assistant-running-search-message-content",
      role: "assistant",
      content: "## 今日 AI 新闻\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
      thinkingContent: "我正在继续等待搜索结果。",
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-running-before-message-content",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
      ],
      {
        turnStatus: "running",
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["thinking", "tool_use"]);
    expect(projection.actionContent).toBe("");
    expect(projection.rendererContent).toBe("");
    expect(projection.rendererRawContent).toBe("");
    expect(JSON.stringify(parts)).not.toContain("今日 AI 新闻");
  });

  it("turn 已完成且不再发送时，旧 running 网页搜索残留不应吞掉最终正文", () => {
    const message: Message = {
      id: "assistant-running-search-final-item-turn-completed",
      role: "assistant",
      content: "## 今日 AI 新闻\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: false,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-still-running-after-turn-completed",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
        {
          id: "assistant-final-arrived-before-search-terminal",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          phase: "final_answer",
          text: "## 今日 AI 新闻\n\n- 第一条要闻。",
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:04.000Z",
          updated_at: "2026-06-02T10:00:04.000Z",
        } as never,
      ],
      {
        turnStatus: "completed",
        isSending: false,
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(projection.actionContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererRawContent).toBe(
      "## 今日 AI 新闻\n\n- 第一条要闻。",
    );
    expect(parts[0]?.type === "tool_use" ? parts[0].toolCall.status : "").toBe(
      "completed",
    );
    expect(parts[1]?.type === "text" ? parts[1].text : "").toContain(
      "今日 AI 新闻",
    );
  });

  it("turn 暂标完成且发送态未释放时，final_answer 已到达也不应被 running 搜索残留吞掉", () => {
    const message: Message = {
      id: "assistant-running-search-final-item-still-sending",
      role: "assistant",
      content: "## 今日 AI 新闻\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: false,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-still-running-while-sending",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
        {
          id: "assistant-final-arrived-before-search-terminal-sending",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          phase: "final_answer",
          text: "## 今日 AI 新闻\n\n- 第一条要闻。",
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:04.000Z",
          updated_at: "2026-06-02T10:00:04.000Z",
        } as never,
      ],
      {
        turnStatus: "completed",
        isSending: true,
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(projection.actionContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererRawContent).toBe(
      "## 今日 AI 新闻\n\n- 第一条要闻。",
    );
    expect(parts[0]?.type === "tool_use" ? parts[0].toolCall.status : "").toBe(
      "running",
    );
    expect(parts[1]?.type === "text" ? parts[1].text : "").toContain(
      "今日 AI 新闻",
    );
  });

  it("无 timeline 的完成态 contentParts running 搜索残留不应吞掉最终正文", () => {
    const message: Message = {
      id: "assistant-stale-running-tool-content-parts",
      role: "assistant",
      content: "根据多源检索结果，以下是主要国际新闻整理。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: false,
      contentParts: [
        {
          type: "text",
          text: "我来搜索今天的国际新闻。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-web-search-stale-running",
            name: "WebSearch",
            status: "running",
            startTime: new Date("2026-06-02T10:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "根据多源检索结果，以下是主要国际新闻整理。",
        },
      ],
    };

    const projection = buildProjection(message, null, {
      isSending: false,
    });

    expect(projection.rendererContent).toBe(
      "根据多源检索结果，以下是主要国际新闻整理。",
    );
    expect(projection.actionContent).toBe(
      "根据多源检索结果，以下是主要国际新闻整理。",
    );
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
  });

  it("运行中的网页搜索应优先保留更完整的本地 thinkingContent", () => {
    const message: Message = {
      id: "assistant-running-search-thinking",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
      thinkingContent: "The search plan is forming.",
      contentParts: [
        {
          type: "thinking",
          text: "The",
        },
      ],
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-running-thinker",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
      ],
      {
        turnStatus: "running",
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["thinking", "tool_use"]);
    expect(parts[0]?.type === "thinking" ? parts[0].text : "").toBe(
      "The search plan is forming.",
    );
    expect(projection.actionContent).toBe("");
  });

  it("搜索已完成但 active turn 仍在整理最终答复时，应保持过程活跃且不伪造正文", () => {
    const message: Message = {
      id: "assistant-search-synthesizing",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      isThinking: false,
      runtimeStatus: {
        phase: "synthesizing",
        title: "正在整理最终答复",
        detail: "搜索已经完成，正在组织最终回答。",
      },
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "web-search-synthesizing-completed",
          type: "web_search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          action: "search",
          query: "学习机 权威评测 对比",
          output: JSON.stringify({
            results: [
              {
                title: "学习机权威评测",
                url: "https://example.com/review",
                snippet: "评测摘要",
              },
            ],
          }),
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:04.000Z",
          updated_at: "2026-06-02T10:00:04.000Z",
        },
      ] as never,
      {
        isSending: false,
        turnStatus: "running",
      },
    );

    expect(projection.actionContent).toBe("");
    expect(projection.rendererRawContent).toBe("");
    expect(projection.isActiveProcessOnlyOutput).toBe(true);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
    ]);
    expect(projection.primaryTimeline?.items).toBeUndefined();
  });

  it("running 搜索后的 commentary 不应越序成为最终正文", () => {
    const message: Message = {
      id: "assistant-live-search-running",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      isThinking: true,
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-search-plan",
        type: "agent_message",
        turn_id: "turn-live-search-running",
        sequence: 1,
        phase: "commentary",
        text: "我先设计几组搜索查询，并对比权威来源。",
        status: "completed",
        started_at: "2026-06-02T10:00:01.000Z",
        completed_at: "2026-06-02T10:00:02.000Z",
        updated_at: "2026-06-02T10:00:02.000Z",
      },
      {
        id: "web-search-first",
        type: "web_search",
        turn_id: "turn-live-search-running",
        sequence: 2,
        action: "search",
        query: "学习机 权威 评测 对比",
        output: "搜索结果摘要",
        status: "completed",
        started_at: "2026-06-02T10:00:03.000Z",
        completed_at: "2026-06-02T10:00:04.000Z",
        updated_at: "2026-06-02T10:00:04.000Z",
      },
      {
        id: "web-search-running",
        type: "web_search",
        turn_id: "turn-live-search-running",
        sequence: 3,
        action: "search",
        query: "科大讯飞 学习机 评测 竞品",
        output: "",
        status: "in_progress",
        started_at: "2026-06-02T10:00:05.000Z",
        updated_at: "2026-06-02T10:00:05.000Z",
      },
      {
        id: "assistant-search-progress",
        type: "agent_message",
        turn_id: "turn-live-search-running",
        sequence: 4,
        phase: "commentary",
        text: "来帮你搜索和分析一下不同学习机的评测结论。",
        status: "completed",
        started_at: "2026-06-02T10:00:06.000Z",
        completed_at: "2026-06-02T10:00:07.000Z",
        updated_at: "2026-06-02T10:00:07.000Z",
      },
    ] as never);

    expect(projection.actionContent).toBe("");
    expect(projection.rendererRawContent).toBe("");
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "tool_use",
      "text",
    ]);
    expect(projection.rendererContentParts?.[3]).toMatchObject({
      type: "text",
      text: "来帮你搜索和分析一下不同学习机的评测结论。",
      metadata: {
        phase: "commentary",
        source: "agent_thread_item",
        threadItemId: "assistant-search-progress",
        turnId: "turn-live-search-running",
        sequence: 4,
      },
    });
  });

  it("搜索后的累计思考不应回写到搜索前的思考块", () => {
    const message: Message = {
      id: "assistant-thinking-after-search",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-20T10:00:00.000Z"),
      isThinking: true,
      thinkingContent: "先确定搜索范围。搜索结果还要筛掉广告。",
      contentParts: [
        {
          type: "thinking",
          text: "先确定搜索范围。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-search-after-thinking",
            name: "web_search",
            arguments: JSON.stringify({
              query: "五年级 学习机 评测 对比",
            }),
            status: "running",
            startTime: new Date("2026-06-20T10:00:01.000Z"),
          },
        },
      ],
    };

    const projection = buildProjection(message, null, {
      isSending: true,
      turnStatus: "running",
    });

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "thinking",
    ]);
    expect(projection.rendererContentParts?.[0]).toMatchObject({
      type: "thinking",
      text: "先确定搜索范围。",
    });
    expect(projection.rendererContentParts?.[2]).toMatchObject({
      type: "thinking",
      text: "搜索结果还要筛掉广告。",
    });
  });

  it("网页检索工具已在消息内联时应把 timeline 中间 reasoning 合并进同一渲染过程", () => {
    const message: Message = {
      id: "assistant-web-tools-inline",
      role: "assistant",
      content:
        "网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。",
      timestamp: new Date("2026-06-20T10:00:00.000Z"),
      isThinking: false,
      runtimeTurnId: "turn-web-tools-inline",
      contentParts: [
        {
          type: "tool_use",
          metadata: { sequence: 2 },
          toolCall: {
            id: "tool-web-search-inline",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                results: [
                  {
                    title: "Lime WebSearch Rendering Source",
                    url: "https://example.com/lime-websearch-rendering",
                    snippet: "Search source used to verify inline rendering",
                  },
                ],
              }),
            },
          } as never,
        },
        {
          type: "tool_use",
          metadata: { sequence: 4 },
          toolCall: {
            id: "tool-web-fetch-inline",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://example.com/lime-websearch-rendering",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                bytes: 2048,
                code: 200,
                codeText: "OK",
                result: "# 页面正文",
              }),
            },
          } as never,
        },
        {
          type: "text",
          text: "网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。",
        },
      ],
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "reasoning-web-tools-inline",
          thread_id: "thread-web-tools-inline",
          turn_id: "turn-web-tools-inline",
          type: "reasoning",
          sequence: 3,
          status: "completed",
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          started_at: "",
          completed_at: "",
          updated_at: "",
        } as never,
        {
          id: "runtime-summary-web-tools-inline",
          thread_id: "thread-web-tools-inline",
          turn_id: "turn-web-tools-inline",
          type: "turn_summary",
          sequence: 5,
          status: "completed",
          text: "已搜索网页 1 次，读取网页 1 次",
          started_at: "2026-06-20T10:00:00.000Z",
          completed_at: "2026-06-20T10:00:01.000Z",
          updated_at: "2026-06-20T10:00:01.000Z",
        } as never,
      ],
      {
        hasActiveInteractiveRuntime: false,
        isSending: false,
        turnStatus: "completed",
      },
    );

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(projection.rendererContentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });
});
