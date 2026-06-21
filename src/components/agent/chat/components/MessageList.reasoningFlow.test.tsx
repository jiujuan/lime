import { describe, expect, it } from "vitest";
import {
  findStreamingRendererCallByContent,
  mockStreamingRenderer,
  mockAgentThreadTimeline,
  render,
} from "./MessageList.testHarness";
import type {
  AgentThreadItem,
  Message,
} from "./MessageList.testHarness";

describe("MessageList reasoning flow", () => {
  it("较长已完成回答应保留安全思考入口但不泄露 reasoning 正文", () => {
    const now = new Date("2026-05-09T07:12:00.000Z");
    const messages: Message[] = [
      {
        id: "msg-user-long-answer-thinking-status",
        role: "user",
        content: "解释首字等待为什么影响体验",
        timestamp: new Date("2026-05-09T07:11:55.000Z"),
      },
      {
        id: "msg-assistant-long-answer-thinking-status",
        role: "assistant",
        content:
          "首字等待会影响用户对系统是否接收请求、是否仍在工作以及后续结果是否可靠的判断，因此需要尽快给出状态反馈。这个反馈不需要暴露内部推理，只要稳定告诉用户任务已经进入处理，就能显著降低等待焦虑。",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-long-answer-thinking-status",
      turns: [
        {
          id: "turn-long-answer-thinking-status",
          thread_id: "thread-long-answer-thinking-status",
          prompt_text: "解释首字等待为什么影响体验",
          status: "completed",
          started_at: "2026-05-09T07:11:55.000Z",
          completed_at: "2026-05-09T07:12:00.000Z",
          created_at: "2026-05-09T07:11:55.000Z",
          updated_at: "2026-05-09T07:12:00.000Z",
        },
      ],
      threadItems: [
        {
          id: "turn-summary-long-answer-thinking-status",
          thread_id: "thread-long-answer-thinking-status",
          turn_id: "turn-long-answer-thinking-status",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-09T07:11:55.000Z",
          completed_at: "2026-05-09T07:12:00.000Z",
          updated_at: "2026-05-09T07:12:00.000Z",
          type: "turn_summary",
          text: "直接回答优先\n当前请求无需默认升级为搜索或任务。",
          metadata: {
            sourceType: "runtime_status",
            surface: "runtime_status",
            visibility: "diagnostics",
            persistence: "transient",
          },
        },
        {
          id: "reasoning-long-answer-thinking-status",
          thread_id: "thread-long-answer-thinking-status",
          turn_id: "turn-long-answer-thinking-status",
          sequence: 2,
          status: "completed",
          started_at: "2026-05-09T07:11:56.000Z",
          completed_at: "2026-05-09T07:11:58.000Z",
          updated_at: "2026-05-09T07:11:58.000Z",
          type: "reasoning",
          text: "我们被要求解释首字等待为什么影响体验，需要先拆解心理反馈与系统状态。",
          summary: [
            "我们被要求解释首字等待为什么影响体验，需要先拆解心理反馈与系统状态。",
          ],
        },
        {
          id: "assistant-long-answer-thinking-status",
          thread_id: "thread-long-answer-thinking-status",
          turn_id: "turn-long-answer-thinking-status",
          sequence: 3,
          status: "completed",
          started_at: "2026-05-09T07:11:59.000Z",
          completed_at: "2026-05-09T07:12:00.000Z",
          updated_at: "2026-05-09T07:12:00.000Z",
          type: "agent_message",
          text: messages[1]?.content || "",
        },
      ],
    });

    const leadingTimelineProps = mockAgentThreadTimeline.mock.calls.find(
      ([props]) => props?.placement === "leading",
    )?.[0] as { items?: AgentThreadItem[] } | undefined;

    expect(leadingTimelineProps?.items).toEqual([
      expect.objectContaining({
        type: "reasoning",
        id: "reasoning-long-answer-thinking-status",
      }),
    ]);
    expect(container.textContent).toContain("执行轨迹");
    expect(container.textContent).not.toContain("我们被要求解释首字等待");
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingContent: undefined,
      }),
    );
  });

  it("简单流式回答的 diagnostics reasoning 不应在首字前暴露为思考卡", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-fast-streaming-reasoning",
        role: "assistant",
        content: "",
        timestamp: now,
        isThinking: true,
        thinkingContent:
          "The user only asked for a marker, so answer directly.",
        contentParts: [
          {
            type: "thinking",
            text: "The user only asked for a marker, so answer directly.",
          },
        ],
        runtimeStatus: {
          phase: "routing",
          title: "正在生成回复",
          detail: "等待首个输出。",
          metadata: {
            sourceType: "runtime_status",
            surface: "runtime_status",
            visibility: "diagnostics",
            persistence: "transient",
          },
        },
      },
    ];

    const container = render(messages, {
      isSending: true,
    });

    expect(
      container.querySelector(
        '[data-testid="assistant-first-token-runtime-status"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("思考中");
    expect(container.textContent).not.toContain("The user only asked");
    expect(mockStreamingRenderer).not.toHaveBeenCalled();
  });

  it("首字前运行中的 reasoning 时间线不应先于答案暴露为思考卡", () => {
    const now = new Date("2026-05-12T05:45:00.000Z");
    const messages: Message[] = [
      {
        id: "msg-assistant-pre-answer-thread-reasoning",
        role: "assistant",
        content: "",
        timestamp: now,
        isThinking: true,
        runtimeStatus: {
          phase: "routing",
          title: "正在生成回复",
          detail: "运行时已开始处理，等待首个输出。",
          metadata: {
            sourceType: "runtime_status",
            surface: "runtime_status",
            visibility: "diagnostics",
            persistence: "transient",
          },
        },
      },
    ];

    const container = render(messages, {
      isSending: true,
      currentTurnId: "turn-pre-answer-thread-reasoning",
      turns: [
        {
          id: "turn-pre-answer-thread-reasoning",
          thread_id: "thread-pre-answer-thread-reasoning",
          prompt_text: "只回答一个标记",
          status: "running",
          started_at: "2026-05-12T05:45:00.000Z",
          created_at: "2026-05-12T05:45:00.000Z",
          updated_at: "2026-05-12T05:45:02.000Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-pre-answer-thread",
          thread_id: "thread-pre-answer-thread-reasoning",
          turn_id: "turn-pre-answer-thread-reasoning",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-05-12T05:45:01.000Z",
          updated_at: "2026-05-12T05:45:02.000Z",
          type: "reasoning",
          text: "The user only asked for a marker, so answer directly.",
          summary: ["The user only asked for a marker, so answer directly."],
        },
      ],
    });

    expect(
      container.querySelector(
        '[data-testid="assistant-first-token-runtime-status"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("思考中");
    expect(container.textContent).not.toContain("The user only asked");
    expect(mockStreamingRenderer).not.toHaveBeenCalled();
  });

  it("流式 assistant 消息仍应向正文传递当前过程状态", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-streaming-process",
        role: "assistant",
        content: "",
        timestamp: now,
        isThinking: true,
        thinkingContent: "先读取当前实现。",
        contentParts: [
          {
            type: "thinking",
            text: "先读取当前实现。",
          },
        ],
        toolCalls: [
          {
            id: "tool-streaming-process-1",
            name: "Read",
            arguments: JSON.stringify({ file_path: "src/app.tsx" }),
            status: "running",
            startTime: now,
          },
        ],
      },
    ];

    render(messages);

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingContent: "先读取当前实现。",
        toolCalls: [
          expect.objectContaining({
            id: "tool-streaming-process-1",
            status: "running",
          }),
        ],
        contentParts: [{ type: "thinking", text: "先读取当前实现。" }],
      }),
    );
  });

  it("流式正文已出现但过程由 timeline 承载时，应把思考区放在正文气泡外", () => {
    const now = new Date("2026-05-11T09:40:00.000Z");
    const messages: Message[] = [
      {
        id: "msg-user-streaming-timeline-process",
        role: "user",
        content: "帮我做 PPT 大纲，先确认关键信息",
        timestamp: now,
      },
      {
        id: "msg-assistant-streaming-timeline-process",
        role: "assistant",
        content: "好的，要帮您做 PPT 大纲，我先确认几个关键点。",
        timestamp: now,
        isThinking: true,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-streaming-timeline-process",
      turns: [
        {
          id: "turn-streaming-timeline-process",
          thread_id: "thread-streaming-timeline-process",
          prompt_text: "帮我做 PPT 大纲，先确认关键信息",
          status: "running",
          started_at: "2026-05-11T09:40:00.000Z",
          created_at: "2026-05-11T09:40:00.000Z",
          updated_at: "2026-05-11T09:40:02.000Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-streaming-timeline-process",
          thread_id: "thread-streaming-timeline-process",
          turn_id: "turn-streaming-timeline-process",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-05-11T09:40:01.000Z",
          updated_at: "2026-05-11T09:40:02.000Z",
          type: "reasoning",
          text: "正在判断需要补充哪些 PPT 输入。",
        },
      ],
    });

    expect(
      container.querySelector(
        '[data-testid="assistant-primary-timeline-shell"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).not.toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "好的，要帮您做 PPT 大纲，我先确认几个关键点。",
        thinkingContent: undefined,
      }),
    );
  });

  it("已完成旧消息残留 runtimeStatus 时仍应尊重 contentParts 思考顺序", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-stale-runtime",
        role: "assistant",
        content: "这是最终回答。",
        timestamp: now,
        runtimeStatus: {
          phase: "routing",
          title: "历史运行态",
          detail: "旧版本残留的运行态不应影响正文。",
        },
        thinkingContent: "这段思考应跟随正文顺序显示。",
        contentParts: [
          {
            type: "thinking",
            text: "这段思考应跟随正文顺序显示。",
          },
          {
            type: "text",
            text: "这是最终回答。",
          },
        ],
      },
    ];

    render(messages);

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingContent: "这段思考应跟随正文顺序显示。",
        contentParts: [
          { type: "thinking", text: "这段思考应跟随正文顺序显示。" },
          { type: "text", text: "这是最终回答。" },
        ],
      }),
    );
  });

  it("恢复历史对话时只有内联思考的已完成助手消息也应按正文顺序渲染", () => {
    const messages: Message[] = [
      {
        id: "msg-user-restored-inline-thinking",
        role: "user",
        content: "先思考再总结",
        timestamp: new Date("2026-05-29T11:00:00.000Z"),
      },
      {
        id: "msg-assistant-restored-inline-thinking",
        role: "assistant",
        content: "总结完成。",
        thinkingContent: "先拆解历史恢复的消息结构。",
        contentParts: [
          {
            type: "thinking",
            text: "先拆解历史恢复的消息结构。",
          },
          {
            type: "text",
            text: "总结完成。",
          },
        ],
        timestamp: new Date("2026-05-29T11:00:02.000Z"),
      },
    ];

    const container = render(messages, {
      isRestoringSession: true,
      sessionHistoryWindow: {
        loadedMessages: 2,
        totalMessages: 18,
        isLoadingFull: false,
        error: null,
      },
      turns: [
        {
          id: "turn-restored-inline-thinking",
          thread_id: "thread-restored-inline-thinking",
          prompt_text: "先思考再总结",
          status: "completed",
          started_at: "2026-05-29T11:00:00.000Z",
          completed_at: "2026-05-29T11:00:02.000Z",
          created_at: "2026-05-29T11:00:00.000Z",
          updated_at: "2026-05-29T11:00:02.000Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-restored-inline-thinking",
          thread_id: "thread-restored-inline-thinking",
          turn_id: "turn-restored-inline-thinking",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-29T11:00:00.500Z",
          completed_at: "2026-05-29T11:00:01.500Z",
          updated_at: "2026-05-29T11:00:01.500Z",
          type: "reasoning",
          text: "先拆解历史恢复的消息结构。",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "总结完成。",
        thinkingContent: "先拆解历史恢复的消息结构。",
        contentParts: [
          { type: "thinking", text: "先拆解历史恢复的消息结构。" },
          { type: "text", text: "总结完成。" },
        ],
      }),
    );
  });

  it("已完成工具调用应保留在正文内与文字按顺序穿插展示", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-inline-tool",
        role: "assistant",
        content: "已经定位到问题根因。",
        timestamp: now,
        contentParts: [
          { type: "thinking", text: "先检查文件变更。" },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-inline-1",
              name: "functions.exec_command",
              arguments: JSON.stringify({ cmd: "rg -n issue src" }),
              status: "completed",
              result: { success: true, output: "ok" },
              startTime: now,
              endTime: now,
            },
          },
          {
            type: "text",
            text: "已经定位到问题根因。",
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-inline-tool",
      turns: [
        {
          id: "turn-inline-tool",
          thread_id: "thread-1",
          prompt_text: "继续排查",
          status: "completed",
          started_at: "2026-03-28T12:00:00Z",
          completed_at: "2026-03-28T12:00:03Z",
          created_at: "2026-03-28T12:00:00Z",
          updated_at: "2026-03-28T12:00:03Z",
        },
      ],
      threadItems: [
        {
          id: "item-inline-tool",
          thread_id: "thread-1",
          turn_id: "turn-inline-tool",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-28T12:00:01Z",
          completed_at: "2026-03-28T12:00:02Z",
          updated_at: "2026-03-28T12:00:02Z",
          type: "tool_call",
          tool_name: "functions.exec_command",
          arguments: { cmd: "rg -n issue src" },
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="assistant-primary-timeline-shell"]',
      ),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        suppressProcessFlow: false,
        contentParts: [
          { type: "thinking", text: "先检查文件变更。" },
          expect.objectContaining({ type: "tool_use" }),
          { type: "text", text: "已经定位到问题根因。" },
        ],
      }),
    );
  });

  it("恢复历史对话时有内联过程的已完成助手消息不应退化成纯最终正文", () => {
    const messages: Message[] = [
      {
        id: "msg-user-restored-inline-process",
        role: "user",
        content: "修一下消息顺序",
        timestamp: new Date("2026-05-29T10:00:00.000Z"),
      } as Message,
      {
        id: "msg-assistant-restored-inline-process",
        role: "assistant",
        content: "已经修好消息顺序。",
        contentParts: [
          {
            type: "thinking",
            text: "先定位历史恢复路径。",
          },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-restored-inline-process",
              name: "Bash",
              arguments: JSON.stringify({ command: "npm test -- MessageList" }),
              status: "completed",
              result: { success: true, output: "ok" },
              startTime: new Date("2026-05-29T10:00:01.000Z"),
              endTime: new Date("2026-05-29T10:00:03.000Z"),
            },
          },
          {
            type: "text",
            text: "已经修好消息顺序。",
          },
        ],
        toolCalls: [
          {
            id: "tool-restored-inline-process",
            name: "Bash",
            arguments: JSON.stringify({ command: "npm test -- MessageList" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:01.000Z"),
            endTime: new Date("2026-05-29T10:00:03.000Z"),
          },
        ],
        thinkingContent: "先定位历史恢复路径。",
        timestamp: new Date("2026-05-29T10:00:04.000Z"),
      } as Message,
    ];

    render(messages, {
      sessionHistoryWindow: {
        loadedMessages: 2,
        totalMessages: 42,
        isLoadingFull: false,
        error: null,
      },
    });

    expect(mockAgentThreadTimeline).not.toHaveBeenCalled();
    const rendererCall = findStreamingRendererCallByContent(
      "已经修好消息顺序。",
    );
    expect(rendererCall).toMatchObject({
      suppressProcessFlow: false,
      thinkingContent: "先定位历史恢复路径。",
      toolCalls: undefined,
    });
    expect(rendererCall?.contentParts).toEqual([
      { type: "thinking", text: "先定位历史恢复路径。" },
      expect.objectContaining({
        type: "tool_use",
        toolCall: expect.objectContaining({
          id: "tool-restored-inline-process",
          name: "Bash",
          status: "completed",
        }),
      }),
      { type: "text", text: "已经修好消息顺序。" },
    ]);
  });

  it("当前回合仍在运行时，即使 assistant 非 streaming 占位也应继续透传工具调用", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-active-turn",
        role: "assistant",
        content: "正在分析依赖关系。",
        timestamp: now,
        runtimeStatus: {
          phase: "routing",
          title: "处理中",
          detail: "正在读取多个 crate 的依赖。",
        },
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "tool-active-turn-1",
              name: "functions.exec_command",
              arguments: JSON.stringify({
                cmd: "sed -n '1,120p' Cargo.toml",
              }),
              status: "running",
              startTime: now,
            },
          },
          {
            type: "text",
            text: "正在分析依赖关系。",
          },
        ],
        toolCalls: [
          {
            id: "tool-active-turn-1",
            name: "functions.exec_command",
            arguments: JSON.stringify({
              cmd: "sed -n '1,120p' Cargo.toml",
            }),
            status: "running",
            startTime: now,
          },
        ],
      },
    ];

    render(messages, {
      currentTurnId: "turn-active-turn",
      turns: [
        {
          id: "turn-active-turn",
          thread_id: "thread-active-turn",
          prompt_text: "继续分析",
          status: "running",
          started_at: "2026-04-15T10:00:00Z",
          created_at: "2026-04-15T10:00:00Z",
          updated_at: "2026-04-15T10:00:03Z",
        },
      ],
      threadRead: {
        thread_id: "thread-active-turn",
        status: "running",
      },
    });

    const rendererCall = findStreamingRendererCallByContent(
      "正在分析依赖关系。",
    );
    expect(rendererCall).toMatchObject({ toolCalls: undefined });
    expect(rendererCall?.contentParts).toEqual([
      expect.objectContaining({
        type: "tool_use",
        toolCall: expect.objectContaining({
          id: "tool-active-turn-1",
          status: "running",
        }),
      }),
      {
        type: "text",
        text: "正在分析依赖关系。",
      },
    ]);
  });

});
