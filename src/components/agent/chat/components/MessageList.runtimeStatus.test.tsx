import { describe, expect, it, vi } from "vitest";
import * as inputbarRuntimeStatusLineModule from "../utils/inputbarRuntimeStatusLine";
import {
  mockUseConfiguredProviders,
  mockFindConfiguredProviderBySelection,
  render,
  renderZh,
} from "./MessageList.testHarness";
import type {
  AgentThreadTurn,
  Message,
  MockConfiguredProvider,
} from "./MessageList.testHarness";

vi.mock("../utils/inputbarRuntimeStatusLine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../utils/inputbarRuntimeStatusLine")>();
  return {
    ...actual,
    buildInputbarRuntimeStatusLineModel: vi.fn(
      actual.buildInputbarRuntimeStatusLineModel,
    ),
  };
});

describe("MessageList runtime status", () => {
  it("普通完成消息没有 runtime evidence 时不应构建输入栏运行状态", () => {
    vi.mocked(
      inputbarRuntimeStatusLineModule.buildInputbarRuntimeStatusLineModel,
    ).mockClear();
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-plain-completed",
        role: "user",
        content: "hello",
        timestamp: now,
      },
      {
        id: "msg-assistant-plain-completed",
        role: "assistant",
        content: "done",
        timestamp: new Date(now.getTime() + 1000),
      },
    ];

    const container = render(messages, {
      isSending: false,
      turns: [],
      threadItems: [],
      pendingActions: [],
      queuedTurns: [],
      childSubagentSessions: [],
      threadRead: {
        thread_id: "thread-plain-completed",
        status: "completed",
        pending_requests: [],
      },
    });

    expect(
      inputbarRuntimeStatusLineModule.buildInputbarRuntimeStatusLineModel,
    ).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
  });

  it("复杂任务完成后应把运行状态、耗时与 token 结算收口到最后一条 assistant 消息尾部", async () => {
    vi.mocked(
      inputbarRuntimeStatusLineModule.buildInputbarRuntimeStatusLineModel,
    ).mockClear();
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-task-card",
        role: "user",
        content: "分析 claudecode 项目为什么没有 task 视图",
        timestamp: now,
      },
      {
        id: "msg-assistant-task-card",
        role: "assistant",
        content: "已经定位到主聊天区没有任务投影层。",
        timestamp: now,
        usage: {
          input_tokens: 1_800,
          output_tokens: 640,
          cached_input_tokens: 0,
        },
      },
    ];

    mockUseConfiguredProviders.mockImplementation(() => ({
      providers: [
        {
          key: "custom-provider-id",
          label: "GLM Anthropic",
          registryId: "custom-provider-id",
          type: "anthropic-compatible",
          providerId: "custom-provider-id",
        },
      ],
      loading: false,
    }));
    mockFindConfiguredProviderBySelection.mockImplementation(
      (
        providers: MockConfiguredProvider[],
        selection?: string | null,
      ): MockConfiguredProvider | null =>
        Array.isArray(providers)
          ? (providers.find((provider) => provider.key === selection) ?? null)
          : null,
    );

    const container = await renderZh(messages, {
      providerType: "custom-provider-id",
      turns: [
        {
          id: "turn-task-card",
          thread_id: "thread-task-card",
          prompt_text: "分析 claudecode 项目为什么没有 task 视图",
          status: "completed",
          started_at: "2026-04-14T10:00:00Z",
          completed_at: "2026-04-14T10:00:06Z",
          created_at: "2026-04-14T10:00:00Z",
          updated_at: "2026-04-14T10:00:06Z",
        },
      ],
      currentTurnId: "turn-task-card",
      threadRead: {
        thread_id: "thread-task-card",
        status: "completed",
      },
      threadItems: [
        {
          id: "tool-read-task-card",
          type: "tool_call",
          thread_id: "thread-task-card",
          turn_id: "turn-task-card",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-14T10:00:01Z",
          completed_at: "2026-04-14T10:00:02Z",
          updated_at: "2026-04-14T10:00:02Z",
          tool_name: "Read",
          arguments: { file_path: "/repo/src/main.tsx" },
        },
        {
          id: "tool-list-task-card",
          type: "command_execution",
          thread_id: "thread-task-card",
          turn_id: "turn-task-card",
          sequence: 2,
          status: "completed",
          started_at: "2026-04-14T10:00:02Z",
          completed_at: "2026-04-14T10:00:03Z",
          updated_at: "2026-04-14T10:00:03Z",
          command: "ls /repo/src",
          cwd: "/repo",
        },
      ],
      childSubagentSessions: [
        {
          id: "sub-task-card-1",
          name: "子任务 1",
          created_at: now.getTime(),
          updated_at: now.getTime(),
          session_type: "subagent",
          runtime_status: "completed",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-task-strip"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("已完成");
    expect(container.textContent).toContain("00:06");
    expect(container.textContent).toContain("工具 读 1 / 列 1");
    expect(container.textContent).toContain("任务 0/1");
    expect(container.textContent).toContain("输入 1.8K / 输出 640");
    expect(container.textContent).toContain("缓存 0");
    expect(container.textContent).toContain("未声明自动缓存");
    expect(
      container.querySelector('[data-testid="token-usage-display"]'),
    ).toBeNull();
    expect(
      inputbarRuntimeStatusLineModule.buildInputbarRuntimeStatusLineModel,
    ).toHaveBeenCalled();
  });

  it("流式运行态不应再在消息底部重复渲染阶段 pill", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-runtime-footer",
        role: "assistant",
        content: "我先查看项目结构。",
        timestamp: now,
        isThinking: true,
        runtimeStatus: {
          phase: "context",
          title: "正在整理相关信息",
          detail: "已开始聚焦当前仓库。",
          checkpoints: ["首批只读工具待执行"],
        },
      },
    ];

    const container = render(messages);

    expect(
      container.querySelector('[data-testid="message-runtime-status-pill"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("正在整理相关信息");
  });

  it("assistant 已有正文且仍在发送时，不应在消息尾部追加处理中状态回复", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-active-status-tail",
        role: "user",
        content: "hello",
        timestamp: now,
      },
      {
        id: "msg-assistant-active-status-tail",
        role: "assistant",
        content: "我正在处理你的请求。",
        timestamp: new Date(now.getTime() + 1000),
        isThinking: true,
        runtimeStatus: {
          phase: "routing",
          title: "处理中",
          detail: "正在等待模型输出。",
          checkpoints: ["请求已发送"],
        },
      },
    ];

    const container = render(messages, {
      isSending: true,
    });

    expect(
      container.querySelector('[data-testid="streaming-renderer"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("我正在处理你的请求。");
    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="assistant-first-token-runtime-status"]',
      ),
    ).toBeNull();
    const inlineIndicator = container.querySelector(
      '[data-testid="assistant-streaming-inline-indicator"]',
    );
    expect(inlineIndicator).not.toBeNull();
    expect(inlineIndicator?.getAttribute("data-status")).toBe("running");
    expect(container.textContent).toContain("Writing...");
    expect(
      container.querySelector(
        '[data-testid="assistant-active-execution-indicator"]',
      ),
    ).toBeNull();
  });

  it("远端 failed runtimeStatus 应终止消息级正在输出指示", () => {
    const now = new Date("2026-06-07T09:30:00.000Z");
    const messages: Message[] = [
      {
        id: "msg-user-news",
        role: "user",
        content: "整理今天的国际新闻",
        timestamp: now,
      },
      {
        id: "msg-assistant-news-failed",
        role: "assistant",
        content:
          "执行失败：Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
        contentParts: [
          {
            type: "text",
            text: "执行失败：Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
          },
        ],
        timestamp: new Date("2026-06-07T09:30:12.000Z"),
        isThinking: true,
        runtimeStatus: {
          phase: "failed",
          title: "当前处理失败",
          detail:
            "Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
        },
      },
    ];

    const container = render(messages, {
      isSending: true,
    });

    expect(container.textContent).toContain("整理今天的国际新闻");
    expect(container.textContent).toContain("当前处理失败");
    expect(
      container.querySelector(
        '[data-testid="assistant-streaming-inline-indicator"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="message-runtime-status-pill"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="streaming-renderer"]')
        ?.getAttribute("data-is-streaming"),
    ).toBe("no");
  });

  it("完成态 assistant 有正文时不应被旧 running 工具状态拖回正在输出", () => {
    const now = new Date("2026-06-07T10:34:44.000Z");
    const messages: Message[] = [
      {
        id: "msg-user-news-complete",
        role: "user",
        content: "整理今天的国际新闻",
        timestamp: now,
      },
      {
        id: "msg-assistant-news-complete",
        role: "assistant",
        content: "根据多源检索结果，以下是 2026年6月7日 的主要国际新闻整理。",
        contentParts: [
          {
            type: "text",
            text: "我来搜索今天（2026年6月7日）的国际新闻。",
          },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-web-search-stale-running",
              name: "WebSearch",
              arguments: '{"query":"2026年6月7日 国际新闻"}',
              status: "running",
              startTime: now,
            },
          },
          {
            type: "text",
            text: "根据多源检索结果，以下是 2026年6月7日 的主要国际新闻整理。",
          },
        ],
        toolCalls: [
          {
            id: "tool-web-search-stale-running",
            name: "WebSearch",
            arguments: '{"query":"2026年6月7日 国际新闻"}',
            status: "running",
            startTime: now,
          },
        ],
        timestamp: new Date("2026-06-07T10:34:45.000Z"),
        isThinking: false,
      },
    ];

    const container = render(messages, {
      isSending: false,
    });

    expect(container.textContent).toContain("整理今天的国际新闻");
    expect(container.textContent).toContain("主要国际新闻整理");
    expect(
      container.querySelector(
        '[data-testid="assistant-streaming-inline-indicator"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="message-runtime-status-pill"]'),
    ).toBeNull();
    expect(
      container
        .querySelector('[data-testid="streaming-renderer"]')
        ?.getAttribute("data-is-streaming"),
    ).toBe("no");
  });

  it("搜索已完成但 turn 仍在整理最终答复时，应保持过程为活跃渲染", () => {
    const now = new Date("2026-06-07T10:40:00.000Z");
    const turn: AgentThreadTurn = {
      id: "turn-live-web-synthesizing",
      thread_id: "thread-live-web-synthesizing",
      prompt_text: "该买哪种学习机，帮我找权威评测对比",
      status: "running",
      started_at: "2026-06-07T10:40:00.000Z",
      created_at: "2026-06-07T10:40:00.000Z",
      updated_at: "2026-06-07T10:40:09.000Z",
    };
    const messages: Message[] = [
      {
        id: "msg-user-live-web-synthesizing",
        role: "user",
        content: "该买哪种学习机，帮我找权威评测对比",
        timestamp: now,
      },
      {
        id: "msg-assistant-live-web-synthesizing",
        role: "assistant",
        runtimeTurnId: turn.id,
        content: "",
        contentParts: [],
        timestamp: new Date("2026-06-07T10:40:09.000Z"),
        isThinking: false,
        runtimeStatus: {
          phase: "synthesizing",
          title: "正在整理最终答复",
          detail: "搜索已经完成，正在组织最终回答。",
        },
      },
    ];

    const container = render(messages, {
      currentTurnId: turn.id,
      isSending: false,
      turns: [turn],
      threadItems: [
        {
          id: "web-search-synthesizing-completed",
          type: "web_search",
          turn_id: turn.id,
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
          started_at: "2026-06-07T10:40:05.000Z",
          completed_at: "2026-06-07T10:40:08.000Z",
          updated_at: "2026-06-07T10:40:08.000Z",
        } as never,
      ],
      threadRead: {
        thread_id: "thread-live-web-synthesizing",
        status: "running",
        active_turn_id: turn.id,
        pending_requests: [],
      },
    });

    const renderer = container.querySelector(
      '[data-testid="streaming-renderer"]',
    );

    expect(renderer?.getAttribute("data-is-streaming")).toBe("yes");
    expect(renderer?.getAttribute("data-content-parts")).toBe("1");
    expect(renderer?.textContent).toContain("<empty-assistant>");
    expect(
      container.querySelectorAll('[data-testid="timeline-process-item"]'),
    ).toHaveLength(0);
  });

  it("read model 已完成且有最终正文时不应显示残留正在输出", () => {
    const now = new Date("2026-06-07T10:40:00.000Z");
    const turn: AgentThreadTurn = {
      id: "turn-live-web-completed",
      thread_id: "thread-live-web-completed",
      prompt_text: "该买哪种学习机，帮我找权威评测对比",
      status: "completed",
      started_at: "2026-06-07T10:40:00.000Z",
      completed_at: "2026-06-07T10:45:00.000Z",
      created_at: "2026-06-07T10:40:00.000Z",
      updated_at: "2026-06-07T10:45:00.000Z",
    };
    const messages: Message[] = [
      {
        id: "msg-user-live-web-completed",
        role: "user",
        content: "该买哪种学习机，帮我找权威评测对比",
        timestamp: now,
      },
      {
        id: "msg-assistant-live-web-completed",
        role: "assistant",
        runtimeTurnId: turn.id,
        content:
          "综合权威评测与产品参数，科大讯飞适合重视英语口语和错题整理的家庭。",
        contentParts: [
          {
            type: "text",
            text: "综合权威评测与产品参数，科大讯飞适合重视英语口语和错题整理的家庭。",
          },
        ],
        timestamp: new Date("2026-06-07T10:45:00.000Z"),
        isThinking: true,
        runtimeStatus: {
          phase: "synthesizing",
          title: "正在输出",
          detail: "模型尾段状态尚未从本地流清除。",
        },
      },
    ];

    const container = render(messages, {
      currentTurnId: null,
      isSending: false,
      turns: [turn],
      threadItems: [
        {
          id: "web-search-completed",
          type: "web_search",
          turn_id: turn.id,
          sequence: 1,
          action: "search",
          query: "学习机 权威评测 对比",
          output: "搜索结果摘要",
          status: "completed",
          started_at: "2026-06-07T10:40:05.000Z",
          completed_at: "2026-06-07T10:40:08.000Z",
          updated_at: "2026-06-07T10:40:08.000Z",
        } as never,
        {
          id: "assistant-final-completed",
          type: "agent_message",
          turn_id: turn.id,
          sequence: 2,
          phase: "final_answer",
          text: "综合权威评测与产品参数，科大讯飞适合重视英语口语和错题整理的家庭。",
          status: "completed",
          started_at: "2026-06-07T10:44:58.000Z",
          completed_at: "2026-06-07T10:45:00.000Z",
          updated_at: "2026-06-07T10:45:00.000Z",
        } as never,
      ],
      threadRead: {
        thread_id: "thread-live-web-completed",
        status: "completed",
        active_turn_id: undefined,
        pending_requests: [],
      },
    });

    expect(container.textContent).toContain("科大讯飞适合重视英语口语");
    expect(
      container.querySelector(
        '[data-testid="assistant-streaming-inline-indicator"]',
      ),
    ).toBeNull();
    expect(
      container
        .querySelector('[data-testid="streaming-renderer"]')
        ?.getAttribute("data-is-streaming"),
    ).toBe("no");
  });

  it("首个文本分片到来前，不应把运行态当作 assistant 回复渲染", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-empty-tail",
        role: "user",
        content: "你好",
        timestamp: now,
      },
      {
        id: "msg-assistant-empty-tail",
        role: "assistant",
        content: "",
        timestamp: new Date(now.getTime() + 1000),
        isThinking: true,
      },
    ];

    const container = render(messages, {
      isSending: true,
    });

    expect(
      container.querySelector('[data-testid="streaming-renderer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("处理中");
    expect(container.textContent).not.toContain("<empty-assistant>");
  });

  it("运行时权限确认提交后不应在消息尾部残留失败状态", () => {
    const now = new Date("2026-05-06T10:00:00.000Z");
    const internalError =
      "运行时权限声明需要真实确认，当前 turn 已在模型执行前等待用户确认：confirmationStatus=confirmed，askProfileKeys=web_search。已创建真实权限确认请求；请确认后重试或恢复本轮执行。";
    const messages: Message[] = [
      {
        id: "msg-user-runtime-permission",
        role: "user",
        content: "@搜索 OpenAI 最新模型公告",
        timestamp: now,
      },
      {
        id: "msg-assistant-runtime-permission",
        role: "assistant",
        content: "",
        timestamp: new Date(now.getTime() + 1000),
        actionRequests: [
          {
            requestId:
              "runtime_permission_confirmation:turn-runtime-permission",
            actionType: "elicitation",
            prompt:
              "当前执行需要确认运行时权限：web_search。确认后才允许继续模型执行；拒绝会保持阻断。",
            status: "submitted",
            submittedUserData: { answer: "允许本次执行" },
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-runtime-permission",
      turns: [
        {
          id: "turn-runtime-permission",
          thread_id: "thread-1",
          prompt_text: "@搜索 OpenAI 最新模型公告",
          status: "failed",
          error_message: internalError,
          started_at: "2026-05-06T10:00:00Z",
          completed_at: "2026-05-06T10:00:01Z",
          created_at: "2026-05-06T10:00:00Z",
          updated_at: "2026-05-06T10:00:01Z",
        },
      ],
      threadItems: [
        {
          id: "permission-request-submitted",
          thread_id: "thread-1",
          turn_id: "turn-runtime-permission",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-06T10:00:00Z",
          completed_at: "2026-05-06T10:00:00Z",
          updated_at: "2026-05-06T10:00:00Z",
          type: "request_user_input",
          request_id: "runtime_permission_confirmation:turn-runtime-permission",
          action_type: "elicitation",
          prompt:
            "当前执行需要确认运行时权限：web_search。确认后才允许继续模型执行；拒绝会保持阻断。",
          response: { answer: "允许本次执行" },
        },
        {
          id: "permission-error-submitted",
          thread_id: "thread-1",
          turn_id: "turn-runtime-permission",
          sequence: 2,
          status: "failed",
          started_at: "2026-05-06T10:00:01Z",
          completed_at: "2026-05-06T10:00:01Z",
          updated_at: "2026-05-06T10:00:01Z",
          type: "error",
          message: internalError,
        },
      ],
      pendingActions: [
        {
          requestId: "runtime_permission_confirmation:turn-runtime-permission",
          actionType: "elicitation",
          prompt:
            "当前执行需要确认运行时权限：web_search。确认后才允许继续模型执行；拒绝会保持阻断。",
          status: "submitted",
          submittedUserData: { answer: "允许本次执行" },
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("失败");
    expect(container.textContent).not.toContain("confirmationStatus");
    expect(container.textContent).not.toContain("askProfileKeys");
  });

  it("assistant 首条流式内容只有协议残留时，不应渲染空白气泡", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-protocol-tail",
        role: "user",
        content: "你好",
        timestamp: now,
      },
      {
        id: "msg-assistant-protocol-tail",
        role: "assistant",
        content: [
          "Built-in Tool: Read",
          "input:",
          '{"file_path":"/repo/src/index.ts"}',
          "output:",
          '{"ok":true}',
        ].join("\n"),
        timestamp: new Date(now.getTime() + 1000),
        isThinking: true,
      },
    ];

    const container = render(messages, {
      isSending: true,
    });

    expect(
      container.querySelector('[data-testid="streaming-renderer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("处理中");
    expect(container.textContent).not.toContain("Built-in Tool");
  });

  it("assistant 占位消息只有启动态 runtimeStatus 时，应保留规范输出占位但不展示启动说明", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-runtime-only",
        role: "user",
        content: "你好",
        timestamp: now,
      },
      {
        id: "msg-assistant-runtime-only",
        role: "assistant",
        content: "",
        timestamp: new Date(now.getTime() + 1000),
        isThinking: true,
        runtimeStatus: {
          phase: "routing",
          title: "正在启动处理流程",
          detail: "已开始处理，正在准备环境并等待第一条进展。",
          checkpoints: [
            "会话已建立",
            "对话优先执行",
            "直接回答优先",
            "等待首个模型事件",
          ],
        },
      },
    ];

    const container = render(messages, {
      isSending: true,
    });

    expect(
      container.querySelector('[data-testid="streaming-renderer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="assistant-first-token-runtime-status"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("思考中");
    expect(container.textContent).toContain("Generating reply");
    expect(container.textContent).not.toContain(
      "The runtime has started processing and is waiting for the first output.",
    );
    expect(container.textContent).not.toContain(
      "The request is being processed and output will start shortly.",
    );
    expect(container.textContent).not.toContain("直接回答优先");
  });
});
