import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { MessageList } from "./MessageList";
import type {
  AgentThreadItem,
  AgentThreadTurn,
  Message,
  MessagePreviewTarget,
} from "../types";
import {
  clearAgentUiPerformanceMetrics,
  getAgentUiPerformanceMetrics,
} from "@/lib/agentUiPerformanceMetrics";
import {
  clearAllAgentStreamTextOverlays,
  upsertAgentStreamTextOverlay,
} from "../hooks/agentStreamTextOverlayStore";

const IMAGE_WORKBENCH_FOCUS_EVENT = "lime:image-workbench-focus";
const IMAGE_WORKBENCH_TASK_ACTION_EVENT = "lime:image-workbench-task-action";
const VIDEO_WORKBENCH_TASK_ACTION_EVENT = "lime:video-workbench-task-action";
type MockConfiguredProvider = {
  key: string;
  label?: string;
  registryId?: string;
  type?: string;
  providerId?: string;
};

const mockUseConfiguredProviders = vi.fn((_options?: unknown) => ({
  providers: [] as MockConfiguredProvider[],
  loading: false,
}));
const mockFindConfiguredProviderBySelection = vi.fn(
  (
    _providers: MockConfiguredProvider[],
    _selection?: string | null,
  ): MockConfiguredProvider | null => null,
);
const mockTokenUsageDisplay = vi.fn(
  ({
    promptCacheNotice,
    inline,
  }: {
    promptCacheNotice?: {
      label?: string;
    } | null;
    inline?: boolean;
  }) => (
    <div data-testid="token-usage-display" data-inline={inline ? "yes" : "no"}>
      {promptCacheNotice?.label || "token-usage-display"}
    </div>
  ),
);

vi.mock("@/hooks/useConfiguredProviders", () => ({
  useConfiguredProviders: (options?: unknown) =>
    mockUseConfiguredProviders(options),
  findConfiguredProviderBySelection: (
    providers: MockConfiguredProvider[],
    selection?: string | null,
  ) => mockFindConfiguredProviderBySelection(providers, selection),
  resolveConfiguredProviderPromptCacheSupportNotice: (
    providers: MockConfiguredProvider[],
    selection?: string | null,
  ) => {
    const selectedProvider = mockFindConfiguredProviderBySelection(
      providers,
      selection,
    );
    const normalizedConfiguredType = (selectedProvider?.type || "")
      .trim()
      .toLowerCase();
    const normalizedSelection = (selection || "").trim().toLowerCase();

    if (normalizedConfiguredType === "anthropic-compatible") {
      return {
        label: "未声明自动缓存",
        detail:
          "当前 Provider 未声明支持自动 Prompt Cache；如需复用前缀，请使用显式 cache_control 标记。",
        source: "configured_provider" as const,
      };
    }

    if (normalizedSelection === "anthropic-compatible") {
      return {
        label: "未声明自动缓存",
        detail:
          "当前 Provider 未声明支持自动 Prompt Cache；当前提示基于 Provider 选择器回退判断，如需复用前缀，请使用显式 cache_control 标记。",
        source: "selection_fallback" as const,
      };
    }

    return null;
  },
}));

vi.mock("./MarkdownRenderer", () => ({
  MarkdownRenderer: ({
    content,
    readOnlyA2UI,
    renderA2UIInline,
    renderMode,
  }: {
    content: string;
    readOnlyA2UI?: boolean;
    renderA2UIInline?: boolean;
    renderMode?: string;
  }) => (
    <div
      data-testid="markdown-renderer"
      data-read-only-a2ui={readOnlyA2UI ? "yes" : "no"}
      data-render-a2ui-inline={
        renderA2UIInline === undefined ? "default" : String(renderA2UIInline)
      }
      data-render-mode={renderMode || "standard"}
    >
      {content || "<empty>"}
    </div>
  ),
}));

const mockStreamingRenderer = vi.fn(
  ({
    content,
    contentParts,
    thinkingContent,
    toolCalls,
    onOpenSavedSiteContent,
    suppressProcessFlow,
    showRuntimeStatusInline,
    renderProposedPlanBlocks,
    showContentBlockActions,
    onQuoteContent,
    markdownRenderMode,
    readOnlyA2UI,
    readOnlyActionRequests,
  }: {
    content: string;
    contentParts?: unknown[];
    thinkingContent?: string;
    toolCalls?: unknown[];
    renderA2UIInline?: boolean;
    suppressedActionRequestId?: string | null;
    suppressProcessFlow?: boolean;
    showRuntimeStatusInline?: boolean;
    renderProposedPlanBlocks?: boolean;
    showContentBlockActions?: boolean;
    onQuoteContent?: (content: string) => void;
    markdownRenderMode?: string;
    readOnlyA2UI?: boolean;
    readOnlyActionRequests?: boolean;
    onOpenSavedSiteContent?: (target: {
      projectId: string;
      contentId: string;
      title?: string;
    }) => void;
  }) => (
    <div
      data-testid="streaming-renderer"
      data-content-parts={contentParts?.length ?? 0}
      data-tool-calls={toolCalls?.length ?? 0}
      data-has-thinking-content={thinkingContent ? "yes" : "no"}
      data-has-open-saved-site-content={onOpenSavedSiteContent ? "yes" : "no"}
      data-suppress-process-flow={suppressProcessFlow ? "yes" : "no"}
      data-show-runtime-status-inline={showRuntimeStatusInline ? "yes" : "no"}
      data-render-proposed-plan-blocks={renderProposedPlanBlocks ? "yes" : "no"}
      data-show-content-block-actions={showContentBlockActions ? "yes" : "no"}
      data-has-on-quote-content={onQuoteContent ? "yes" : "no"}
      data-markdown-render-mode={markdownRenderMode || "standard"}
      data-read-only-a2ui={readOnlyA2UI ? "yes" : "no"}
      data-read-only-action-requests={readOnlyActionRequests ? "yes" : "no"}
    >
      {content || "<empty-assistant>"}
    </div>
  ),
);
const mockAgentThreadTimeline = vi.fn(
  ({
    actionRequests,
    items,
    onOpenSavedSiteContent,
    placement,
    turn,
  }: {
    actionRequests?: Array<Record<string, unknown>>;
    items?: AgentThreadItem[];
    onOpenSavedSiteContent?: (target: {
      projectId: string;
      contentId: string;
      title?: string;
    }) => void;
    deferCompletedSingleDetails?: boolean;
    placement?: "leading" | "trailing" | "default";
    turn?: { id?: string } | null;
  }) => (
    <div
      data-testid={`agent-thread-timeline:${placement || "default"}`}
      data-has-open-saved-site-content={onOpenSavedSiteContent ? "yes" : "no"}
      data-turn-id={turn?.id || ""}
    >
      执行轨迹{actionRequests?.length ? `:${actionRequests.length}` : ""}
      {(items || [])
        .filter((item) => item.type === "file_artifact")
        .map((item) => (
          <span
            key={item.id}
            data-testid="timeline-file-artifact-card"
            data-artifact-path={item.path}
          />
        ))}
    </div>
  ),
);

vi.mock("./StreamingRenderer", () => ({
  StreamingRenderer: (props: {
    content: string;
    renderA2UIInline?: boolean;
    suppressedActionRequestId?: string | null;
    markdownRenderMode?: string;
    readOnlyA2UI?: boolean;
    readOnlyActionRequests?: boolean;
  }) => mockStreamingRenderer(props),
}));

vi.mock("./TokenUsageDisplay", () => ({
  TokenUsageDisplay: (props: {
    promptCacheNotice?: {
      label?: string;
    } | null;
    inline?: boolean;
  }) => mockTokenUsageDisplay(props),
}));

vi.mock("./AgentThreadTimeline", () => ({
  AgentThreadTimeline: (props: {
    actionRequests?: Array<Record<string, unknown>>;
    deferCompletedSingleDetails?: boolean;
    items?: AgentThreadItem[];
    placement?: "leading" | "trailing" | "default";
  }) => mockAgentThreadTimeline(props),
}));

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("en-US");
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
  clearAgentUiPerformanceMetrics();
  clearAllAgentStreamTextOverlays();
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.useRealTimers();
  vi.clearAllMocks();
  clearAgentUiPerformanceMetrics();
  clearAllAgentStreamTextOverlays();
  mockUseConfiguredProviders.mockImplementation(() => ({
    providers: [],
    loading: false,
  }));
  mockFindConfiguredProviderBySelection.mockImplementation(() => null);
  await changeLimeLocale("en-US");
});

function render(
  messages: Message[],
  props?: Partial<React.ComponentProps<typeof MessageList>>,
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<MessageList messages={messages} {...props} />);
  });

  mountedRoots.push({ container, root });
  return container;
}

async function renderZh(
  messages: Message[],
  props?: Partial<React.ComponentProps<typeof MessageList>>,
): Promise<HTMLDivElement> {
  await changeLimeLocale("zh-CN");
  return render(messages, props);
}

function setScrollMetrics(
  element: HTMLElement,
  metrics: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  },
) {
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    writable: true,
    value: metrics.scrollTop,
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: metrics.scrollHeight,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: metrics.clientHeight,
  });
}

function createConversationMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `message-${index + 1}`,
    role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `消息 ${index + 1}`,
    timestamp: new Date(
      `2026-04-25T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
    ),
  }));
}

describe("MessageList", () => {
  it("应在同一滚动区域顶部渲染 leadingContent", () => {
    const container = render(
      [
        {
          id: "assistant-1",
          role: "assistant",
          content: "第一条消息",
        } as Message,
      ],
      {
        leadingContent: (
          <div data-testid="leading-probe">scene summary heading</div>
        ),
      },
    );

    const leadingContent = container.querySelector(
      '[data-testid="message-list-leading-content"]',
    );
    const messageColumn = container.querySelector(
      '[data-testid="message-list-column"]',
    );

    expect(leadingContent?.textContent).toContain("scene summary heading");
    expect(messageColumn?.firstElementChild).toBe(leadingContent);
    expect(messageColumn?.textContent).toContain("第一条消息");
    expect(messageColumn?.className).toContain("justify-start");
  });

  it("应在同一滚动区域尾部渲染 trailingContent", () => {
    const container = render(
      [
        {
          id: "assistant-1",
          role: "assistant",
          content: "第一条消息",
        } as Message,
      ],
      {
        trailingContent: (
          <div data-testid="trailing-probe">inline a2ui card</div>
        ),
      },
    );

    const trailingContent = container.querySelector(
      '[data-testid="message-list-trailing-content"]',
    );
    const messageColumn = container.querySelector(
      '[data-testid="message-list-column"]',
    );

    expect(trailingContent?.textContent).toContain("inline a2ui card");
    expect(messageColumn?.lastElementChild?.previousElementSibling).toBe(
      trailingContent,
    );
  });

  it("短对话发送首帧也应吸顶展示，避免完成前后跳动", () => {
    const container = render(
      [
        {
          id: "msg-user-first-frame",
          role: "user",
          content: "你好",
          timestamp: new Date("2026-04-25T10:00:00.000Z"),
        } as Message,
      ],
      { isSending: true },
    );

    const messageColumn = container.querySelector(
      '[data-testid="message-list-column"]',
    );

    expect(messageColumn?.textContent).toContain("你好");
    expect(messageColumn?.className).toContain("min-h-full");
    expect(messageColumn?.className).toContain("justify-start");
    expect(messageColumn?.className).not.toContain("justify-end");
  });

  it("用户消息应使用紧凑中性气泡，并把时间与操作区放在气泡外", async () => {
    const onEditMessage = vi.fn();
    const container = await renderZh(
      [
        {
          id: "msg-user-visual-footer",
          role: "user",
          content: "帮我整理一下今天的国际新闻",
          timestamp: new Date("2026-06-01T02:57:00.000Z"),
        } as Message,
      ],
      { onEditMessage },
    );

    const userBubble = container.querySelector<HTMLElement>(
      '[data-message-role="user"][data-visual-tone="neutral-user"]',
    );
    const footer = container.querySelector<HTMLElement>(
      '[data-testid="user-message-footer"]',
    );
    const timestamp = container.querySelector<HTMLElement>(
      '[data-testid="user-message-timestamp"]',
    );
    const editButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="编辑消息"]',
    );

    expect(userBubble).not.toBeNull();
    expect(userBubble?.textContent).toContain("帮我整理一下今天的国际新闻");
    expect(userBubble?.contains(footer)).toBe(false);
    expect(footer).not.toBeNull();
    expect(footer?.className).toContain("user-message-footer");
    expect(timestamp?.textContent?.trim()).toBeTruthy();
    expect(
      container.querySelector('button[aria-label="复制消息"]'),
    ).not.toBeNull();
    expect(editButton).not.toBeNull();

    act(() => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onEditMessage).toHaveBeenCalledWith(
      "msg-user-visual-footer",
      "帮我整理一下今天的国际新闻",
    );
  });

  it("执行中新消息应贴底自动跟随且不显示查看最新入口", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    mountedRoots.push({ container: host, root });
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const scrollIntoViewMock = vi.fn();
    const initialMessages = createConversationMessages(6);
    const nextMessages: Message[] = [
      ...initialMessages,
      {
        id: "assistant-live-tail",
        role: "assistant",
        content: "最新输出还在继续",
        timestamp: new Date("2026-04-25T10:06:00.000Z"),
      },
    ];

    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
    window.requestAnimationFrame = ((callback: (timestamp: number) => void) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;

    try {
      act(() => {
        root.render(<MessageList messages={initialMessages} isSending />);
      });
      scrollIntoViewMock.mockClear();

      const scrollContainer = host.querySelector<HTMLElement>(
        '[data-testid="message-list-scroll-container"]',
      );
      expect(scrollContainer).not.toBeNull();
      expect(
        host.querySelector('[data-testid="message-list-jump-to-latest"]'),
      ).toBeNull();
      setScrollMetrics(scrollContainer as HTMLElement, {
        scrollTop: 536,
        scrollHeight: 1000,
        clientHeight: 400,
      });

      act(() => {
        root.render(<MessageList messages={nextMessages} isSending />);
      });

      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "end",
      });
      expect(
        host.querySelector('[data-testid="message-list-jump-to-latest"]'),
      ).toBeNull();
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  it("执行中流式追加同一条消息时也应贴底自动跟随", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    mountedRoots.push({ container: host, root });
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const scrollIntoViewMock = vi.fn();
    const messages: Message[] = [
      {
        id: "user-stream-follow",
        role: "user",
        content: "继续输出",
        timestamp: new Date("2026-04-25T10:00:00.000Z"),
      },
      {
        id: "assistant-stream-follow",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-25T10:00:01.000Z"),
      },
    ];

    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
    window.requestAnimationFrame = ((callback: (timestamp: number) => void) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;

    try {
      act(() => {
        root.render(<MessageList messages={messages} isSending />);
      });
      scrollIntoViewMock.mockClear();

      const scrollContainer = host.querySelector<HTMLElement>(
        '[data-testid="message-list-scroll-container"]',
      );
      expect(scrollContainer).not.toBeNull();
      setScrollMetrics(scrollContainer as HTMLElement, {
        scrollTop: 0,
        scrollHeight: 1200,
        clientHeight: 400,
      });

      act(() => {
        upsertAgentStreamTextOverlay({
          messageId: "assistant-stream-follow",
          eventName: "response.output_text.delta",
          content: "第一段流式内容",
          updatedAt: 1,
        });
      });

      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: "auto",
        block: "end",
      });
      expect(
        host.querySelector('[data-testid="message-list-jump-to-latest"]'),
      ).toBeNull();
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  it("流式正文 overlay 应优先渲染并替代首 token 占位", () => {
    upsertAgentStreamTextOverlay({
      messageId: "assistant-overlay",
      eventName: "agent-runtime-overlay-test",
      content: "overlay 正文已经可见",
    });

    const container = render([
      {
        id: "assistant-overlay",
        role: "assistant",
        content: "",
        isThinking: true,
        timestamp: new Date("2026-05-09T10:00:00.000Z"),
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "tool-1",
              name: "read_file",
              status: "running",
              startTime: new Date("2026-05-09T10:00:00.000Z"),
            },
          },
        ],
      } as Message,
    ]);

    expect(container.textContent).not.toContain("正在准备回复");
    expect(mockStreamingRenderer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: "overlay 正文已经可见",
        contentParts: expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            text: "overlay 正文已经可见",
          }),
        ]),
        isStreaming: true,
      }),
    );
  });

  it("流式正文 overlay 不应刷掉当前 thinking 过程", () => {
    upsertAgentStreamTextOverlay({
      messageId: "assistant-overlay-thinking",
      eventName: "agent-runtime-overlay-thinking-test",
      content: "正文已经开始输出。",
    });

    render([
      {
        id: "assistant-overlay-thinking",
        role: "assistant",
        content: "",
        isThinking: true,
        thinkingContent: "先检查目录结构，再输出结论。",
        timestamp: new Date("2026-05-30T09:00:00.000Z"),
      } as Message,
    ]);

    expect(mockStreamingRenderer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: "正文已经开始输出。",
        thinkingContent: "先检查目录结构，再输出结论。",
        contentParts: [
          { type: "thinking", text: "先检查目录结构，再输出结论。" },
          { type: "text", text: "正文已经开始输出。" },
        ],
        isStreaming: true,
      }),
    );
  });

  it("任务中心发送首帧也应吸顶展示", () => {
    const container = render(
      [
        {
          id: "msg-user-task-center-first-frame",
          role: "user",
          content: "从任务中心开始对话",
          timestamp: new Date("2026-04-25T10:00:00.000Z"),
        } as Message,
      ],
      {
        emptyStateVariant: "task-center",
        isSending: true,
      },
    );

    const messageColumn = container.querySelector(
      '[data-testid="message-list-column"]',
    );

    expect(messageColumn?.textContent).toContain("从任务中心开始对话");
    expect(messageColumn?.className).toContain("justify-start");
    expect(messageColumn?.className).not.toContain("justify-end");
  });

  it("已完成的旧会话短消息应吸顶展示，避免打开历史时贴近输入区", () => {
    const container = render(
      [
        {
          id: "msg-user-history-short",
          role: "user",
          content: "打开旧会话",
          timestamp: new Date("2026-04-25T10:00:00.000Z"),
        } as Message,
        {
          id: "msg-assistant-history-short",
          role: "assistant",
          content: "这是历史回复",
          timestamp: new Date("2026-04-25T10:00:01.000Z"),
        } as Message,
      ],
      {
        currentTurnId: "turn-history-completed",
        turns: [
          {
            id: "turn-history-completed",
            thread_id: "session-history-short",
            prompt_text: "打开旧会话",
            status: "completed",
            started_at: "2026-04-25T10:00:00.000Z",
            completed_at: "2026-04-25T10:00:01.000Z",
            created_at: "2026-04-25T10:00:00.000Z",
            updated_at: "2026-04-25T10:00:01.000Z",
          },
        ],
      },
    );

    const messageColumn = container.querySelector(
      '[data-testid="message-list-column"]',
    );

    expect(messageColumn?.textContent).toContain("打开旧会话");
    expect(messageColumn?.className).toContain("justify-start");
    expect(messageColumn?.className).not.toContain("justify-end");
  });

  it("自动恢复生成会话时应展示恢复占位而不是空白引导", () => {
    const container = render([], { isRestoringSession: true });

    expect(
      container.querySelector('[data-testid="message-list-restoring-session"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Restoring generation session...");
    expect(container.textContent).toContain(
      "Syncing the latest generation session. Please wait.",
    );
    expect(container.textContent).not.toContain("Start a new conversation");
  });

  it("旧会话首屏只加载尾部历史时应提供继续加载入口", () => {
    const onLoadFullHistory = vi.fn();
    const container = render(createConversationMessages(2), {
      sessionHistoryWindow: {
        loadedMessages: 2,
        totalMessages: 320,
        isLoadingFull: false,
        error: null,
      },
      onLoadFullHistory,
    });

    expect(
      container.querySelector(
        '[data-testid="message-list-persisted-history-window"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("latest 2 / 320 messages");

    const button = container.querySelector(
      '[data-testid="message-list-load-full-history"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("Load more history");

    act(() => {
      button?.click();
    });

    expect(onLoadFullHistory).toHaveBeenCalledTimes(1);
  });

  it("旧会话首帧应先渲染消息文本并延后历史 timeline", async () => {
    vi.useFakeTimers();
    const messages = createConversationMessages(60);
    const turns: AgentThreadTurn[] = Array.from({ length: 30 }, (_, index) => {
      const startMinute = String(index * 2).padStart(2, "0");
      const completedMinute = String(index * 2 + 1).padStart(2, "0");
      return {
        id: `turn-${index + 1}`,
        thread_id: "thread-history",
        prompt_text: `消息 ${index * 2 + 1}`,
        status: "completed",
        started_at: `2026-04-25T10:${startMinute}:00.000Z`,
        completed_at: `2026-04-25T10:${completedMinute}:00.000Z`,
        created_at: `2026-04-25T10:${startMinute}:00.000Z`,
        updated_at: `2026-04-25T10:${completedMinute}:00.000Z`,
      };
    });
    const threadItems: AgentThreadItem[] = turns.map((turn, index) => ({
      id: `reasoning-${index + 1}`,
      thread_id: turn.thread_id,
      turn_id: turn.id,
      sequence: 1,
      status: "completed",
      started_at: turn.started_at,
      completed_at: turn.completed_at,
      updated_at: turn.updated_at,
      type: "tool_call",
      tool_name: "Read",
      arguments: { file_path: `/repo/history-${index + 1}.ts` },
    }));

    const container = render(messages, {
      currentTurnId: "turn-30",
      turns,
      threadItems,
    });

    expect(container.textContent).toContain("消息 60");
    expect(mockAgentThreadTimeline).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockAgentThreadTimeline).toHaveBeenCalled();
    expect(mockAgentThreadTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        deferCompletedSingleDetails: true,
        isCurrentTurn: false,
      }),
    );
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).not.toBeNull();
  });

  it("旧会话已分页窗口首帧应只挂载更小的尾部批次", () => {
    vi.useFakeTimers();
    const messages = createConversationMessages(40);
    const container = render(messages, {
      sessionHistoryWindow: {
        loadedMessages: 40,
        totalMessages: 188,
        isLoadingFull: false,
        error: null,
      },
    });

    expect(container.textContent).toContain("latest 40 / 188 messages");
    expect(container.textContent).toContain("消息 40");
    expect(container.textContent).toContain("消息 31");
    expect(container.textContent).not.toContain("消息 30");
    expect(container.textContent).toContain(
      "30 earlier messages can be expanded",
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(container.textContent).not.toContain("消息 30");

    const expandButton = container.querySelector(
      '[data-testid="message-list-expand-history"]',
    ) as HTMLButtonElement | null;

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("消息 30");
  });

  it("旧会话消息较少但执行过程很多时也应延后构建 timeline", async () => {
    vi.useFakeTimers();
    const turn: AgentThreadTurn = {
      id: "turn-history-many-items",
      thread_id: "thread-history-many-items",
      prompt_text: "检查慢历史",
      status: "completed",
      started_at: "2026-04-25T10:00:00.000Z",
      completed_at: "2026-04-25T10:01:00.000Z",
      created_at: "2026-04-25T10:00:00.000Z",
      updated_at: "2026-04-25T10:01:00.000Z",
    };
    const threadItems: AgentThreadItem[] = Array.from(
      { length: 30 },
      (_, index): AgentThreadItem => {
        const base = {
          id: `history-heavy-item-${index + 1}`,
          thread_id: turn.thread_id,
          turn_id: turn.id,
          sequence: index + 1,
          status: "completed" as const,
          started_at: "2026-04-25T10:00:00.000Z",
          completed_at: "2026-04-25T10:01:00.000Z",
          updated_at: "2026-04-25T10:01:00.000Z",
        };

        if (index % 2 === 0) {
          return {
            ...base,
            type: "tool_call",
            tool_name: "Bash",
            arguments: { command: `echo ${index}` },
            output: `输出 ${index}`,
          };
        }

        return {
          ...base,
          type: "reasoning",
          text: `思考 ${index}`,
        };
      },
    );
    const container = render(
      [
        {
          id: "msg-user-history-many-items",
          role: "user",
          content: "检查慢历史",
          timestamp: new Date("2026-04-25T10:00:00.000Z"),
        } as Message,
        {
          id: "msg-assistant-history-many-items",
          role: "assistant",
          content: "历史结果",
          timestamp: new Date("2026-04-25T10:01:00.000Z"),
        } as Message,
      ],
      {
        currentTurnId: turn.id,
        turns: [turn],
        threadItems,
        sessionHistoryWindow: {
          loadedMessages: 2,
          totalMessages: 170,
          isLoadingFull: false,
          error: null,
        },
      },
    );

    expect(container.textContent).toContain("历史结果");
    expect(
      container.querySelector(
        '[data-testid="message-list-historical-timeline-preview:leading"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
    expect(mockAgentThreadTimeline).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(880);
    });

    expect(
      container.querySelector(
        '[data-testid="message-list-historical-timeline-preview:leading"]',
      ),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(60);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container.querySelector(
        '[data-testid="message-list-historical-timeline-preview:leading"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).not.toBeNull();
    expect(mockAgentThreadTimeline).not.toHaveBeenCalled();
  });

  it("已分页旧会话展开执行过程前不应扫描 threadItems，展开后只纳入尾部相关 turns", async () => {
    vi.useFakeTimers();
    const turns: AgentThreadTurn[] = Array.from({ length: 8 }, (_, index) => {
      const minute = String(index + 1).padStart(2, "0");
      return {
        id: `turn-window-${index + 1}`,
        thread_id: "thread-windowed-history",
        prompt_text: `历史问题 ${index + 1}`,
        status: "completed",
        started_at: `2026-04-25T10:${minute}:00.000Z`,
        completed_at: `2026-04-25T10:${minute}:30.000Z`,
        created_at: `2026-04-25T10:${minute}:00.000Z`,
        updated_at: `2026-04-25T10:${minute}:30.000Z`,
      };
    });
    const threadItems: AgentThreadItem[] = turns.flatMap((turn, turnIndex) =>
      Array.from(
        { length: 5 },
        (_, itemIndex): AgentThreadItem => ({
          id: `turn-window-${turnIndex + 1}-item-${itemIndex + 1}`,
          thread_id: turn.thread_id,
          turn_id: turn.id,
          sequence: itemIndex + 1,
          status: "completed",
          started_at: turn.started_at,
          completed_at: turn.completed_at,
          updated_at: turn.updated_at,
          type: "tool_call",
          tool_name: "Read",
          arguments: { file_path: `/repo/file-${itemIndex + 1}.ts` },
        }),
      ),
    );

    const container = render(
      [
        {
          id: "msg-user-windowed-history",
          role: "user",
          content: "打开尾部旧会话",
          timestamp: new Date("2026-04-25T10:08:00.000Z"),
        } as Message,
        {
          id: "msg-assistant-windowed-history",
          role: "assistant",
          content: "这是尾部旧会话结果",
          timestamp: new Date("2026-04-25T10:08:30.000Z"),
        } as Message,
      ],
      {
        sessionId: "session-windowed-history",
        currentTurnId: "turn-window-8",
        turns,
        threadItems,
        sessionHistoryWindow: {
          loadedMessages: 2,
          totalMessages: 220,
          isLoadingFull: false,
          error: null,
        },
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

    const commit = getAgentUiPerformanceMetrics().find(
      (entry) => entry.phase === "messageList.commit",
    );

    expect(commit?.metrics).toEqual(
      expect.objectContaining({
        renderedTurnsCount: 2,
        shouldDeferHistoricalTimeline: true,
        threadItemsCount: 0,
        threadItemsScanDeferred: true,
        turnsCount: 8,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(940);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const deferredPreview = container.querySelector<HTMLButtonElement>(
      '[data-testid="message-list-historical-timeline-preview:leading"]',
    );
    expect(deferredPreview).not.toBeNull();
    expect(deferredPreview?.textContent).toContain(
      "Expand to load execution details",
    );
    const idleCommit = getAgentUiPerformanceMetrics()
      .filter((entry) => entry.phase === "messageList.commit")
      .find(
        (entry) =>
          entry.metrics.threadItemsScanDeferred === true &&
          entry.metrics.canBuildHistoricalTimeline === true,
      );
    expect(idleCommit?.metrics).toEqual(
      expect.objectContaining({
        renderedTurnsCount: 2,
        threadItemsCount: 0,
        turnsCount: 8,
      }),
    );

    await act(async () => {
      deferredPreview?.click();
      await Promise.resolve();
    });

    const expandedCommit = getAgentUiPerformanceMetrics()
      .filter((entry) => entry.phase === "messageList.commit")
      .find(
        (entry) =>
          entry.metrics.threadItemsScanDeferred === false &&
          entry.metrics.threadItemsCount === 10,
      );

    expect(expandedCommit?.metrics).toEqual(
      expect.objectContaining({
        renderedTurnsCount: 2,
        threadItemsCount: 10,
        turnsCount: 8,
      }),
    );
  });

  it("旧会话首帧应延后历史助手 contentParts 与 Markdown 细节扫描", async () => {
    vi.useFakeTimers();
    const turn: AgentThreadTurn = {
      id: "turn-history-content-parts",
      thread_id: "thread-history-content-parts",
      prompt_text: "检查 content parts",
      status: "completed",
      started_at: "2026-04-25T10:00:00.000Z",
      completed_at: "2026-04-25T10:01:00.000Z",
      created_at: "2026-04-25T10:00:00.000Z",
      updated_at: "2026-04-25T10:01:00.000Z",
    };
    const threadItems: AgentThreadItem[] = Array.from(
      { length: 30 },
      (_, index): AgentThreadItem => ({
        id: `history-content-parts-tool-${index + 1}`,
        thread_id: turn.thread_id,
        turn_id: turn.id,
        sequence: index + 1,
        status: "completed",
        started_at: turn.started_at,
        completed_at: turn.completed_at,
        updated_at: turn.updated_at,
        type: "tool_call",
        tool_name: "Read",
        arguments: { file_path: `/repo/history-${index + 1}.ts` },
      }),
    );
    const container = render(
      [
        {
          id: "msg-user-history-content-parts",
          role: "user",
          content: "检查 content parts",
          timestamp: new Date("2026-04-25T10:00:00.000Z"),
        } as Message,
        {
          id: "msg-assistant-history-content-parts",
          role: "assistant",
          content: "历史 content parts 正文",
          contentParts: [
            {
              type: "text",
              text: "历史 content parts 正文",
            },
            {
              type: "tool_use",
              toolCall: {
                id: "tool-history-content-parts",
                name: "Read",
                arguments: JSON.stringify({ file_path: "/repo/history.ts" }),
                status: "completed",
                result: { success: true, output: "ok" },
                startTime: new Date("2026-04-25T10:00:10.000Z"),
                endTime: new Date("2026-04-25T10:00:11.000Z"),
              },
            },
          ],
          timestamp: new Date("2026-04-25T10:01:00.000Z"),
        } as Message,
      ],
      {
        sessionId: "session-history-content-parts",
        currentTurnId: turn.id,
        turns: [turn],
        threadItems,
        sessionHistoryWindow: {
          loadedMessages: 2,
          totalMessages: 180,
          isLoadingFull: false,
          error: null,
        },
      },
    );

    expect(
      container.querySelector(
        '[data-testid="message-list-historical-markdown-preview"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="streaming-renderer"]'),
    ).toBeNull();
    expect(mockStreamingRenderer).not.toHaveBeenCalled();
    const markdownPreview = container.querySelector(
      '[data-testid="message-list-historical-markdown-preview"]',
    );
    const previewMarkdownRenderer = markdownPreview?.querySelector(
      '[data-testid="markdown-renderer"]',
    );
    expect(previewMarkdownRenderer?.getAttribute("data-render-mode")).toBe(
      "light",
    );
    expect(
      previewMarkdownRenderer?.getAttribute("data-render-a2ui-inline"),
    ).toBe("false");
    expect(markdownPreview?.textContent).toContain("历史 content parts 正文");
    const commit = getAgentUiPerformanceMetrics().find(
      (entry) => entry.phase === "messageList.commit",
    );
    expect(commit?.metrics).toEqual(
      expect.objectContaining({
        historicalContentPartsDeferredCount: 1,
        historicalMarkdownDeferredCount: 1,
        messageListComputeMs: expect.any(Number),
        messageListThreadItemsScanMs: expect.any(Number),
        messageListTimelineBuildMs: expect.any(Number),
        threadItemsScanDeferred: true,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(940);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const hydratedCommit = getAgentUiPerformanceMetrics()
      .filter((entry) => entry.phase === "messageList.commit")
      .find((entry) => entry.metrics.historicalContentPartsDeferredCount === 0);
    expect(
      container.querySelector(
        '[data-testid="message-list-historical-markdown-preview"]',
      ),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalled();
    expect(hydratedCommit?.metrics).toEqual(
      expect.objectContaining({
        historicalContentPartsDeferredCount: 0,
        historicalMarkdownDeferredCount: 0,
        threadItemsCount: 0,
        threadItemsScanDeferred: true,
      }),
    );
  });

  it("旧会话 idle 后应分批恢复历史 Markdown hydrate，避免一次性挂载", async () => {
    vi.useFakeTimers();
    const turn: AgentThreadTurn = {
      id: "turn-history-markdown-batches",
      thread_id: "thread-history-markdown-batches",
      prompt_text: "检查 markdown hydrate",
      status: "completed",
      started_at: "2026-04-25T10:00:00.000Z",
      completed_at: "2026-04-25T10:01:00.000Z",
      created_at: "2026-04-25T10:00:00.000Z",
      updated_at: "2026-04-25T10:01:00.000Z",
    };
    const threadItems: AgentThreadItem[] = Array.from(
      { length: 30 },
      (_, index): AgentThreadItem => ({
        id: `history-markdown-batch-tool-${index + 1}`,
        thread_id: turn.thread_id,
        turn_id: turn.id,
        sequence: index + 1,
        status: "completed",
        started_at: turn.started_at,
        completed_at: turn.completed_at,
        updated_at: turn.updated_at,
        type: "tool_call",
        tool_name: "Read",
        arguments: { file_path: `/repo/batch-${index + 1}.ts` },
      }),
    );
    const messages: Message[] = Array.from({ length: 10 }, (_, index) => ({
      id: `msg-history-markdown-batch-${index + 1}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content:
        index % 2 === 0
          ? `用户问题 ${index + 1}`
          : `## 历史回复 ${index + 1}\n\n- 需要分批 hydrate`,
      timestamp: new Date(
        `2026-04-25T10:00:${String(index + 1).padStart(2, "0")}.000Z`,
      ),
    }));

    const container = render(messages, {
      sessionId: "session-history-markdown-batches",
      currentTurnId: turn.id,
      turns: [turn],
      threadItems,
      sessionHistoryWindow: {
        loadedMessages: messages.length,
        totalMessages: 220,
        isLoadingFull: false,
        error: null,
      },
    });

    expect(
      container.querySelectorAll(
        '[data-testid="message-list-historical-markdown-preview"]',
      ),
    ).toHaveLength(5);
    expect(
      container.querySelectorAll('[data-testid="streaming-renderer"]'),
    ).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(940);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container.querySelectorAll('[data-testid="streaming-renderer"]'),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll(
        '[data-testid="message-list-historical-markdown-preview"]',
      ),
    ).toHaveLength(3);

    act(() => {
      vi.advanceTimersByTime(160);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container.querySelectorAll('[data-testid="streaming-renderer"]'),
    ).toHaveLength(4);
    expect(
      container.querySelectorAll(
        '[data-testid="message-list-historical-markdown-preview"]',
      ),
    ).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(160);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container.querySelectorAll('[data-testid="streaming-renderer"]'),
    ).toHaveLength(5);
    expect(
      container.querySelectorAll(
        '[data-testid="message-list-historical-markdown-preview"]',
      ),
    ).toHaveLength(0);
  });

  it("已分页旧会话的完成执行过程应先折叠为轻量摘要，点击后再挂载真实 timeline", () => {
    const turn: AgentThreadTurn = {
      id: "turn-history-heavy",
      thread_id: "thread-history-heavy",
      prompt_text: "打开慢历史",
      status: "completed",
      started_at: "2026-04-25T10:00:00.000Z",
      completed_at: "2026-04-25T10:01:00.000Z",
      created_at: "2026-04-25T10:00:00.000Z",
      updated_at: "2026-04-25T10:01:00.000Z",
    };
    const threadItems: AgentThreadItem[] = Array.from(
      { length: 10 },
      (_, index) => ({
        id: `history-tool-${index + 1}`,
        thread_id: turn.thread_id,
        turn_id: turn.id,
        sequence: index + 1,
        status: "completed",
        started_at: "2026-04-25T10:00:00.000Z",
        completed_at: "2026-04-25T10:01:00.000Z",
        updated_at: "2026-04-25T10:01:00.000Z",
        type: "tool_call",
        tool_name: "Bash",
        arguments: { command: `echo ${index + 1}` },
        output: `输出 ${index + 1}`,
      }),
    );
    const container = render(
      [
        {
          id: "msg-user-heavy-history",
          role: "user",
          content: "打开慢历史",
          timestamp: new Date("2026-04-25T10:00:00.000Z"),
        } as Message,
        {
          id: "msg-assistant-heavy-history",
          role: "assistant",
          content: "这是旧会话的最终回复",
          contentParts: [
            {
              type: "text",
              text: "这是旧会话的最终回复",
            },
          ],
          timestamp: new Date("2026-04-25T10:01:00.000Z"),
        } as Message,
      ],
      {
        turns: [turn],
        threadItems,
        currentTurnId: turn.id,
        sessionHistoryWindow: {
          loadedMessages: 2,
          totalMessages: 170,
          isLoadingFull: false,
          error: null,
        },
      },
    );

    expect(
      container.querySelector(
        '[data-testid="message-list-historical-timeline-preview:leading"]',
      ),
    ).not.toBeNull();
    expect(mockAgentThreadTimeline).not.toHaveBeenCalled();
    expect(mockStreamingRenderer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentParts: undefined,
        markdownRenderMode: "light",
      }),
    );

    const expandButton = container.querySelector(
      '[data-testid="message-list-historical-timeline-preview:leading"]',
    ) as HTMLButtonElement | null;

    act(() => {
      expandButton?.click();
    });

    expect(mockAgentThreadTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        placement: "leading",
        isCurrentTurn: false,
      }),
    );
  });

  it("旧会话里的超长历史助手消息应先渲染轻量预览，点击后再展开完整正文", () => {
    const longContent = `开头内容 ${"长历史 ".repeat(8000)} 末尾完整内容`;
    const container = render(
      [
        {
          id: "msg-user-long-history",
          role: "user",
          content: "打开超长历史",
          timestamp: new Date("2026-04-25T10:00:00.000Z"),
        } as Message,
        {
          id: "msg-assistant-long-history",
          role: "assistant",
          content: longContent,
          timestamp: new Date("2026-04-25T10:00:01.000Z"),
        } as Message,
      ],
      {
        sessionHistoryWindow: {
          loadedMessages: 2,
          totalMessages: 120,
          isLoadingFull: false,
          error: null,
        },
      },
    );

    const preview = container.querySelector(
      '[data-testid="message-list-long-history-preview"]',
    );

    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain("This history message is long");
    expect(preview?.textContent).toContain("plain-text preview");
    expect(preview?.textContent).not.toContain("末尾完整内容");
    expect(mockStreamingRenderer).not.toHaveBeenCalled();

    const expandButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Show full content"),
    ) as HTMLButtonElement | undefined;

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container.querySelector(
        '[data-testid="message-list-long-history-preview"]',
      ),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("末尾完整内容"),
        markdownRenderMode: "light",
      }),
    );
  });

  it("旧会话里的长助手回复应先用轻量 Markdown 预览，避免首帧挂载完整渲染器", () => {
    const oldAssistantContent = [
      "## BADOUCMS 架构分析",
      "",
      "| 发现 | 说明 |",
      "| --- | --- |",
      "| **底层框架** | `ThinkPHP` |",
      "",
      `旧回复开头 ${"历史分析 ".repeat(360)} 旧回复末尾完整内容`,
    ].join("\n");
    const latestAssistantContent = "最新回复保持完整";
    const container = render(
      [
        {
          id: "msg-user-old-compact",
          role: "user",
          content: "旧问题",
          timestamp: new Date("2026-04-25T10:00:00.000Z"),
        } as Message,
        {
          id: "msg-assistant-old-compact",
          role: "assistant",
          content: oldAssistantContent,
          timestamp: new Date("2026-04-25T10:00:01.000Z"),
        } as Message,
        {
          id: "msg-user-latest-compact",
          role: "user",
          content: "最新问题",
          timestamp: new Date("2026-04-25T10:01:00.000Z"),
        } as Message,
        {
          id: "msg-assistant-latest-compact",
          role: "assistant",
          content: latestAssistantContent,
          timestamp: new Date("2026-04-25T10:01:01.000Z"),
        } as Message,
      ],
      {
        sessionHistoryWindow: {
          loadedMessages: 4,
          totalMessages: 88,
          isLoadingFull: false,
          error: null,
        },
      },
    );

    const preview = container.querySelector(
      '[data-testid="message-list-historical-assistant-preview"]',
    );

    expect(preview).not.toBeNull();
    const previewMarkdown = preview?.querySelector(
      '[data-testid="markdown-renderer"]',
    );
    expect(previewMarkdown?.getAttribute("data-render-mode")).toBe("light");
    expect(previewMarkdown?.getAttribute("data-render-a2ui-inline")).toBe(
      "false",
    );
    expect(previewMarkdown?.getAttribute("data-read-only-a2ui")).toBe("yes");
    expect(previewMarkdown?.textContent).toContain("## BADOUCMS 架构分析");
    expect(preview?.textContent).toContain("This assistant reply is long");
    expect(preview?.textContent).not.toContain("旧回复末尾完整内容");
    expect(container.textContent).toContain(latestAssistantContent);
    expect(mockStreamingRenderer).not.toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("旧回复末尾完整内容"),
      }),
    );

    const expandButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Show full content"),
    ) as HTMLButtonElement | undefined;

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container.querySelector(
        '[data-testid="message-list-historical-assistant-preview"]',
      ),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("旧回复末尾完整内容"),
        markdownRenderMode: "light",
      }),
    );
  });

  it("非旧会话助手正文应保持标准 Markdown 渲染模式", () => {
    render([
      {
        id: "msg-user-live-standard-markdown",
        role: "user",
        content: "实时对话",
        timestamp: new Date("2026-04-25T10:00:00.000Z"),
      } as Message,
      {
        id: "msg-assistant-live-standard-markdown",
        role: "assistant",
        content: "```ts\nconsole.log('live')\n```",
        timestamp: new Date("2026-04-25T10:00:01.000Z"),
      } as Message,
    ]);

    expect(mockStreamingRenderer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        markdownRenderMode: "standard",
      }),
    );
  });

  it("任务中心空列表时应展示最近对话空态而不是普通新对话文案", () => {
    const container = render([], {
      emptyStateVariant: "task-center",
    });

    expect(
      container.querySelector('[data-testid="message-list-empty-task-center"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="message-list-empty-task-center"]')
        ?.className,
    ).toContain("max-w-[560px]");
    expect(
      container.querySelector('[data-testid="message-list-empty-task-center"]')
        ?.className,
    ).not.toContain("rounded-[30px]");
    expect(container.textContent).toContain("Chat");
    expect(container.textContent).toContain("Recent chats");
    expect(container.textContent).toContain(
      "Recent chats, sessions to continue, and earlier archives are gathered here so you can return to the last working context.",
    );
    expect(container.textContent).toContain(
      "When there are no chats yet, start from “New chat”. Results, materials, and intermediate steps will stay here later.",
    );
    expect(container.textContent).toContain(
      "Chats to continue appear on the left first",
    );
    expect(container.textContent).toContain(
      "Recent chats and archives are organized by time",
    );
    expect(container.textContent).toContain(
      "Restoring sessions return here automatically",
    );
    expect(container.textContent).not.toContain("Start a new conversation");
  });

  it("应过滤空白 user 消息，避免渲染空白气泡", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-empty",
        role: "user",
        content: "",
        timestamp: now,
      },
      {
        id: "msg-user-text",
        role: "user",
        content: "请继续生成",
        timestamp: now,
      },
      {
        id: "msg-assistant",
        role: "assistant",
        content: "好的，我继续处理。",
        timestamp: now,
      },
    ];

    const container = render(messages);

    const markdownTexts = Array.from(
      container.querySelectorAll('[data-testid="markdown-renderer"]'),
    ).map((node) => node.textContent);
    expect(markdownTexts).toEqual(["请继续生成"]);

    const streamingTexts = Array.from(
      container.querySelectorAll('[data-testid="streaming-renderer"]'),
    ).map((node) => node.textContent);
    expect(streamingTexts).toEqual(["好的，我继续处理。"]);
  });

  it("大历史会话应先展示最近消息，并允许用户立即展开更早内容", () => {
    const messages = createConversationMessages(90);
    const container = render(messages);

    const historyWindow = container.querySelector(
      '[data-testid="message-list-history-window"]',
    );
    const expandButton = container.querySelector(
      '[data-testid="message-list-expand-history"]',
    ) as HTMLButtonElement | null;

    expect(historyWindow).not.toBeNull();
    expect(container.textContent).toContain("To open the chat faster");
    expect(container.textContent).toContain("消息 90");
    expect(container.textContent).not.toContain("消息 1");
    expect(expandButton).not.toBeNull();

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container.querySelector('[data-testid="message-list-history-window"]'),
    ).toBeNull();
    expect(container.textContent).toContain("消息 1");
  });

  it("user peer 包络正文应直接渲染为专门协作卡片", () => {
    const container = render([
      {
        id: "msg-user-peer",
        role: "user",
        content: `<teammate-message teammate_id="researcher" summary="同步结果">
继续验证
</teammate-message>`,
      } as Message,
    ]);

    expect(
      container.querySelector('[data-testid="runtime-peer-message-cards"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("协作者消息");
    expect(container.textContent).toContain("来自 researcher");
    expect(container.textContent).toContain("同步结果");
    expect(container.textContent).toContain("继续验证");
    expect(container.textContent).not.toContain("teammate-message");
  });

  it("应向助手消息透传内联 A2UI 开关", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant",
        role: "assistant",
        content: "```a2ui\n{}\n```",
        timestamp: now,
      },
    ];

    render(messages);
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ renderA2UIInline: true }),
    );

    render(messages, { renderA2UIInline: false });
    expect(mockStreamingRenderer).toHaveBeenLastCalledWith(
      expect.objectContaining({ renderA2UIInline: false }),
    );
  });

  it("assistant 消息带 contextTrace 时不应在聊天主线渲染上下文轨迹块", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-context-trace",
        role: "assistant",
        content: "我已经处理完成。",
        timestamp: now,
        contextTrace: [
          {
            stage: "memory_injection",
            detail: "query_len=8,injected=2",
          },
        ],
      },
    ];

    const container = render(messages);

    expect(container.textContent).toContain("我已经处理完成。");
    expect(container.textContent).not.toContain("上下文轨迹");
    expect(container.textContent).not.toContain("memory_injection");
    expect(container.textContent).not.toContain("query_len=8,injected=2");
  });

  it("anthropic-compatible 自定义 Provider 无缓存命中时应透传自动缓存提示", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-usage",
        role: "assistant",
        content: "本轮已完成。",
        timestamp: now,
        usage: {
          input_tokens: 1_500,
          output_tokens: 500,
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

    const container = render(messages, {
      providerType: "custom-provider-id",
    });

    expect(container.textContent).toContain("未声明自动缓存");
    expect(mockTokenUsageDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        promptCacheNotice: expect.objectContaining({
          label: "未声明自动缓存",
        }),
      }),
    );
  });

  it("anthropic-compatible 自定义 Provider 存在缓存写入时不应再透传自动缓存提示", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-cache-write",
        role: "assistant",
        content: "本轮已完成。",
        timestamp: now,
        usage: {
          input_tokens: 1_500,
          output_tokens: 500,
          cached_input_tokens: 0,
          cache_creation_input_tokens: 256,
        },
      },
    ];

    mockUseConfiguredProviders.mockImplementation(() => ({
      providers: [
        {
          key: "custom-provider-id",
          label: "Kimi Anthropic",
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

    const container = render(messages, {
      providerType: "custom-provider-id",
    });

    expect(container.textContent).not.toContain("未声明自动缓存");
    expect(mockTokenUsageDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        promptCacheNotice: undefined,
      }),
    );
  });

  it("旧会话恢复首帧不应立即自动加载 Provider 缓存提示配置", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-restored-usage",
        role: "assistant",
        content: "旧会话结果。",
        timestamp: now,
        usage: {
          input_tokens: 1_200,
          output_tokens: 300,
          cached_input_tokens: 0,
        },
      },
    ];

    render(messages, {
      providerType: "custom-provider-id",
      sessionHistoryWindow: {
        loadedMessages: 40,
        totalMessages: 320,
        isLoadingFull: false,
        error: null,
      },
    });

    expect(mockUseConfiguredProviders).toHaveBeenCalledWith({
      autoLoad: false,
    });
  });

  it("旧会话首帧应记录可汇总的渲染采样数值", async () => {
    const messages = createConversationMessages(32);

    render(messages, {
      sessionId: "session-metrics",
      sessionHistoryWindow: {
        loadedMessages: 32,
        totalMessages: 160,
        isLoadingFull: false,
        error: null,
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    const commit = getAgentUiPerformanceMetrics().find(
      (entry) => entry.phase === "messageList.commit",
    );
    expect(commit).toEqual(
      expect.objectContaining({
        sessionId: "session-metrics",
        metrics: expect.objectContaining({
          hiddenHistoryCount: expect.any(Number),
          messagesCount: 32,
          persistedHiddenHistoryCount: 128,
          renderedMessagesCount: expect.any(Number),
        }),
      }),
    );
  });

  it("复杂任务完成后应把运行状态、耗时与 token 结算收口到最后一条 assistant 消息尾部", async () => {
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

  it("assistant 占位消息只有启动态 runtimeStatus 时，应渲染轻量首字前占位", () => {
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
    expect(container.textContent).toContain(
      "The runtime has started processing and is waiting for the first output.",
    );
    expect(container.textContent).not.toContain("直接回答优先");
  });

  it("当前回合运行且只有执行轨迹时，应在消息结算区显示小型输出提示", () => {
    const now = new Date("2026-05-12T09:00:00.000Z");
    const messages: Message[] = [
      {
        id: "msg-user-active-loading",
        role: "user",
        content: "帮我整理国内新闻",
        timestamp: now,
      },
      {
        id: "msg-assistant-active-loading",
        role: "assistant",
        content: "",
        timestamp: new Date(now.getTime() + 1000),
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-active-loading",
      turns: [
        {
          id: "turn-active-loading",
          thread_id: "thread-active-loading",
          prompt_text: "帮我整理国内新闻",
          status: "running",
          started_at: "2026-05-12T09:00:00.000Z",
          created_at: "2026-05-12T09:00:00.000Z",
          updated_at: "2026-05-12T09:00:04.000Z",
        },
      ],
      threadRead: {
        thread_id: "thread-active-loading",
        status: "running",
      },
      threadItems: [
        {
          id: "search-active-loading-1",
          thread_id: "thread-active-loading",
          turn_id: "turn-active-loading",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-12T09:00:01.000Z",
          completed_at: "2026-05-12T09:00:02.000Z",
          updated_at: "2026-05-12T09:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "国内新闻 2026年5月 最新",
          output: "已找到 10 个可参考来源",
        },
      ],
    });

    const indicator = container.querySelector(
      '[data-testid="assistant-streaming-inline-indicator"]',
    );

    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute("data-status")).toBe("running");
    expect(indicator?.textContent).toContain("Writing...");
    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="assistant-active-execution-indicator"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-runtime-status-line"]'),
    ).toBeNull();
  });

  it("assistant 消息结算区应以内联模式承载 token usage", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-inline-usage",
        role: "assistant",
        content: "本轮已完成。",
        timestamp: now,
        usage: {
          input_tokens: 1_200,
          output_tokens: 300,
          cached_input_tokens: 0,
        },
      },
    ];

    render(messages);

    expect(mockTokenUsageDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        inline: true,
      }),
    );
  });

  it("第二轮开始后，上一轮 assistant 的工具调用块不应被从正文投影中剥离", () => {
    const firstTurnTime = new Date("2026-04-15T09:00:00.000Z");
    const secondTurnTime = new Date("2026-04-15T09:00:10.000Z");
    const completedToolCall = {
      id: "tool-read-1",
      name: "Read",
      arguments: '{"file_path":"/repo/src/index.ts"}',
      status: "completed" as const,
      startTime: new Date("2026-04-15T09:00:01.000Z"),
      endTime: new Date("2026-04-15T09:00:02.000Z"),
      result: {
        success: true,
        output: "export const answer = 42;",
      },
    };
    const messages: Message[] = [
      {
        id: "msg-user-first-turn",
        role: "user",
        content: "先分析项目结构",
        timestamp: firstTurnTime,
      },
      {
        id: "msg-assistant-first-turn",
        role: "assistant",
        content: "已经整理完第一轮分析。",
        timestamp: new Date("2026-04-15T09:00:03.000Z"),
        toolCalls: [completedToolCall],
        contentParts: [
          {
            type: "tool_use",
            toolCall: completedToolCall,
          },
          {
            type: "text",
            text: "已经整理完第一轮分析。",
          },
        ],
      },
      {
        id: "msg-user-second-turn",
        role: "user",
        content: "继续追问第二轮",
        timestamp: secondTurnTime,
      },
      {
        id: "msg-assistant-second-turn",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-15T09:00:11.000Z"),
        isThinking: true,
        contentParts: [
          {
            type: "thinking",
            text: "准备继续查看模块边界。",
          },
        ],
        runtimeStatus: {
          phase: "preparing",
          title: "准备继续分析",
          detail: "正在建立第二轮上下文。",
          checkpoints: ["等待下一步工具调用"],
        },
      },
    ];

    render(messages);

    const firstAssistantCall = mockStreamingRenderer.mock.calls.find(
      ([props]) => props.content === "已经整理完第一轮分析。",
    )?.[0];
    const secondAssistantCall = mockStreamingRenderer.mock.calls.find(
      ([props]) => props.content === "",
    )?.[0];

    expect(firstAssistantCall?.contentParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool_use",
        }),
      ]),
    );
    expect(firstAssistantCall?.thinkingContent).toBeUndefined();
    expect(secondAssistantCall?.contentParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "thinking",
        }),
      ]),
    );
  });

  it("图片任务消息卡应在聊天区渲染预览并支持展开图片画布", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench",
        role: "assistant",
        content: "图片生成已完成，共生成 1 张。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-1",
          prompt: "一颗戴耳机的青柠，科技感插画风格",
          status: "complete",
          imageUrl: "https://example.com/generated.png",
          imageCount: 1,
          size: "1024x1024",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    let focusDetail: Record<string, unknown> | null = null;
    const handleFocus = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      focusDetail = event.detail as Record<string, unknown>;
    };
    window.addEventListener(IMAGE_WORKBENCH_FOCUS_EVENT, handleFocus);

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-1"]',
    ) as HTMLDivElement | null;

    expect(previewCard?.textContent).toContain("图片生成");
    expect(previewCard?.textContent).not.toContain("一颗戴耳机的青柠");
    expect(previewCard?.textContent).not.toContain("已生成");
    expect(previewCard?.textContent).not.toContain("可在右侧继续查看与使用");
    expect(container.textContent).not.toContain("图片生成已完成");
    expect(previewCard?.className).not.toContain("max-w-[620px]");
    expect(
      previewCard?.querySelector(
        '[data-testid="image-workbench-message-preview-single-media-task-1"]',
      )?.className,
    ).toContain("w-[358px]");
    expect(previewCard?.querySelector("img")).not.toBeNull();

    act(() => {
      previewCard?.click();
    });

    expect(focusDetail).toEqual({
      projectId: "project-1",
      contentId: "content-1",
    });
    window.removeEventListener(IMAGE_WORKBENCH_FOCUS_EVENT, handleFocus);
  });

  it("图片任务消息应隐藏旧提交详情表，只保留自然正文和轻量工具条", async () => {
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-verbose-template",
        role: "assistant",
        content:
          "好的！我来为你生成一张三国群像海报。\n\n任务已创建成功！这里是生成详情：\n\n| 项目 | 内容 |\n| --- | --- |\n| 画面构图 | 刘关张桃园三结义居中 |\n| 风格 | 国风电影感 |\n| 尺寸 | 1792 x 1024 |\n| 色调 | 墨黑、赤红、暗金 |\n| 模型 | fal-ai/nano-banana-pro |\n| 状态 | 已进入队列，正在生成中... |\n\n生成完成后图片会显示在对话中，稍等一下即可看到效果。",
        timestamp: new Date(),
        imageWorkbenchPreview: {
          taskId: "task-verbose-template",
          prompt: "三国主要人物群像海报",
          mode: "generate",
          status: "complete",
          imageUrl: "https://example.com/three-kingdoms.png",
          imageCount: 1,
          runtimeContract: {
            model: "fal-ai/nano-banana-pro",
          },
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-verbose-template"]',
    );

    expect(previewCard?.textContent).toContain("图片生成");
    expect(previewCard?.textContent).toContain("Nanobanana Pro");
    expect(container.textContent).not.toContain("任务已创建成功");
    expect(container.textContent).not.toContain("这里是生成详情");
    expect(container.textContent).not.toContain("画面构图");
    expect(container.textContent).not.toContain("已进入队列");
    expect(container.textContent).not.toContain("稍等一下即可看到效果");
    expect(previewCard?.querySelector("img")).not.toBeNull();
  });

  it("图片任务消息应在同一条 assistant 回复里保留自然铺垫、轻卡、图片和结果描述", async () => {
    const messages: Message[] = [
      {
        id: "msg-user-image-workbench-natural",
        role: "user",
        content: "@Nanobanana Pro 生成一张广州塔，从花城汇看过去的春天的照片",
        timestamp: new Date(),
      },
      {
        id: "msg-assistant-image-workbench-natural",
        role: "assistant",
        content: "收到，我按花城汇视角来生成广州塔的春天照片。",
        timestamp: new Date(),
        usage: {
          input_tokens: 31_000,
          output_tokens: 120,
          cached_input_tokens: 0,
        },
        contentParts: [
          { type: "text", text: "我先按你的描述创建异步图片任务" },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-image-natural",
              name: "limeCreateImageGenerationTask",
              arguments: "{}",
              status: "completed",
              startTime: new Date(),
              endTime: new Date(),
            },
          },
        ],
        toolCalls: [
          {
            id: "tool-image-natural",
            name: "limeCreateImageGenerationTask",
            arguments: "{}",
            status: "completed",
            startTime: new Date(),
            endTime: new Date(),
          },
        ],
        imageWorkbenchPreview: {
          taskId: "task-natural-image",
          prompt: "一张广州塔，从花城汇看过去的春天的照片",
          mode: "generate",
          status: "complete",
          imageUrl: "https://example.com/guangzhou-tower.png",
          imageCount: 1,
          modelName: "fal-ai/nano-banana-pro",
          caption: null,
        },
      },
    ];

    const container = await renderZh(messages);
    const text = container.textContent || "";
    const leadRenderer = container.querySelector(
      '[data-testid="streaming-renderer"]',
    );

    expect(text).toContain("收到，我按花城汇视角来生成广州塔的春天照片。");
    expect(text).not.toContain("先获取下工具参数");
    expect(text).not.toContain("马上生成");
    expect(text).toContain("图片生成");
    expect(text).toContain("Nanobanana Pro");
    expect(text).not.toContain("我继续改");
    expect(
      container.querySelector('[data-testid="token-usage-display"]'),
    ).not.toBeNull();
    expect(text).not.toContain("limeCreateImageGenerationTask");
    expect(text).not.toContain("异步图片任务");
    expect(
      container.querySelector(
        '[data-testid="image-workbench-assistant-header"]',
      ),
    ).toBeNull();
    expect(leadRenderer).not.toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "收到，我按花城汇视角来生成广州塔的春天照片。",
        suppressProcessFlow: false,
        toolCalls: expect.arrayContaining([
          expect.objectContaining({ id: "tool-image-natural" }),
        ]),
        contentParts: undefined,
      }),
    );
    expect(
      container.querySelector('[data-testid="message-user-command-tag"]')
        ?.textContent,
    ).toBe("@Nanobanana Pro");
    expect(
      container.querySelector('[data-testid="message-user-command-content"]')
        ?.textContent,
    ).toContain("广州塔");
    expect(leadRenderer).not.toBeNull();
  });

  it("同一会话连续两次图片生成应分别保留用户指令、自然铺垫和对应轻卡", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-image-turn-1",
        role: "user",
        content: "@配图 生成一张广州塔春天照片",
        timestamp: now,
      },
      {
        id: "msg-assistant-image-turn-1",
        role: "assistant",
        content: "我先生成广州塔春天照片，保留春天的光线和城市视角。",
        timestamp: new Date(now.getTime() + 1_000),
        thinkingContent: "先判断广州塔照片的季节和视角。",
        contentParts: [
          { type: "thinking", text: "先判断广州塔照片的季节和视角。" },
          {
            type: "text",
            text: "我先生成广州塔春天照片，保留春天的光线和城市视角。",
          },
        ],
        imageWorkbenchPreview: {
          taskId: "task-image-turn-1",
          prompt: "广州塔春天照片",
          mode: "generate",
          status: "complete",
          imageUrl: "https://example.com/guangzhou-tower.png",
          imageCount: 1,
          modelName: "gpt-images-2",
          caption: "第一张已经好了，可以继续调春天氛围。",
        },
      },
      {
        id: "msg-user-image-turn-2",
        role: "user",
        content: "@配图 再生成一张青柠极简插画",
        timestamp: new Date(now.getTime() + 2_000),
      },
      {
        id: "msg-assistant-image-turn-2",
        role: "assistant",
        content: "这次换成青柠极简插画，我会把画面压得更干净。",
        timestamp: new Date(now.getTime() + 3_000),
        thinkingContent: "再判断青柠插画的极简构图。",
        contentParts: [
          { type: "thinking", text: "再判断青柠插画的极简构图。" },
          {
            type: "text",
            text: "这次换成青柠极简插画，我会把画面压得更干净。",
          },
        ],
        imageWorkbenchPreview: {
          taskId: "task-image-turn-2",
          prompt: "青柠极简插画",
          mode: "generate",
          status: "complete",
          imageUrl: "https://example.com/lime-minimal.png",
          imageCount: 1,
          modelName: "gpt-images-2",
          caption: "第二张也好了，可以继续改构图。",
        },
      },
    ];

    const container = await renderZh(messages);
    const commandTags = Array.from(
      container.querySelectorAll('[data-testid="message-user-command-tag"]'),
    ).map((node) => node.textContent);
    const leadTexts = mockStreamingRenderer.mock.calls
      .map((call) => call[0].content as string | undefined)
      .filter((content): content is string => Boolean(content));

    expect(commandTags).toEqual(["@配图", "@配图"]);
    expect(leadTexts).toEqual([
      "我先生成广州塔春天照片，保留春天的光线和城市视角。",
      "这次换成青柠极简插画，我会把画面压得更干净。",
    ]);
    expect(
      mockStreamingRenderer.mock.calls.map((call) => call[0].thinkingContent),
    ).toEqual(["先判断广州塔照片的季节和视角。", "再判断青柠插画的极简构图。"]);
    expect(
      mockStreamingRenderer.mock.calls.every(
        (call) => !call[0].toolCalls && !call[0].contentParts,
      ),
    ).toBe(true);
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-task-image-turn-1"]',
      )?.textContent,
    ).toContain("第一张已经好了");
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-task-image-turn-2"]',
      )?.textContent,
    ).toContain("第二张也好了");
    expect(container.textContent).not.toContain("任务 ID");
    expect(container.textContent).not.toContain("任务已提交");
  });

  it("用户消息带已安装 Skill route 时应保留 @ Skill 标签展示", async () => {
    const container = await renderZh([
      {
        id: "msg-user-installed-skill",
        role: "user",
        content: "帮我写一篇关于三国的故事",
        timestamp: new Date(),
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "brand-product-knowledge-builder",
          skillName: "brand-product-knowledge-builder",
        },
      } as Message,
    ]);

    const skillTag = container.querySelector(
      '[data-testid="message-user-skill-tag"]',
    );

    expect(skillTag?.textContent).toContain("@");
    expect(skillTag?.textContent).toContain("brand-product-knowledge-builder");
    expect(
      container.querySelector('[data-testid="message-user-command-tag"]'),
    ).toBeNull();
    expect(container.textContent).toContain("帮我写一篇关于三国的故事");
  });

  it("用户消息仅通过 builtin command route 进入时，也应保留 @命令 标签展示", async () => {
    const container = await renderZh([
      {
        id: "msg-user-builtin-route-only-image-command",
        role: "user",
        content: "生成一张广州塔，从花城汇看过去的春天照片",
        timestamp: new Date(),
        inputCapabilityRoute: {
          kind: "builtin_command",
          commandKey: "image_generate",
          commandPrefix: "@配图",
        },
      } as Message,
    ]);

    expect(
      container.querySelector('[data-testid="message-user-command-tag"]')
        ?.textContent,
    ).toBe("@配图");
    expect(
      container.querySelector('[data-testid="message-user-command-content"]')
        ?.textContent,
    ).toContain("广州塔");
  });

  it("历史助手消息没有图片轻卡时，也不应继续展示旧图片任务详情模板", async () => {
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-legacy-template-only",
        role: "assistant",
        content:
          "好的，我来为你生成一张青柠插画！\n\n✅ 青柠插画生成任务已创建\n\n任务 ID: 013dbd1b-0fc0-45de-a1c8-f78489ccc11c\nPrompt：一颗鲜嫩的青柠，水彩插画风格\n参数：\n🎨 风格：水彩插画\n📐 尺寸：1024×1024\n🤖 模型：fal-ai/nano-banana-pro\n🔧 Provider：fal\n任务已提交进入队列，你可以在 图片工作台（Image Workbench）中查看生成进度和最终结果。稍后如果已生成，你可以直接打开查看~",
        timestamp: new Date(),
      },
    ];

    const container = await renderZh(messages);

    expect(container.textContent).not.toContain("任务 ID");
    expect(container.textContent).not.toContain("Image Workbench");
    expect(container.textContent).not.toContain("生成进度和最终结果");
    expect(container.textContent).not.toContain("稍后如果已生成");
  });

  it("图片任务消息卡不应在聊天区展示 LimeCore 策略输入标签", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-policy",
        role: "assistant",
        content: "图片生成已完成，共生成 1 张。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-policy-1",
          prompt: "一颗戴耳机的青柠，科技感插画风格",
          status: "complete",
          imageUrl: "https://example.com/generated.png",
          imageCount: 1,
          size: "1024x1024",
          projectId: "project-1",
          contentId: "content-1",
          runtimeContract: {
            contractKey: "image_generation",
            routingSlot: "image_task",
            limecorePolicyEvaluationStatus: "input_gap",
            limecorePolicyEvaluationDecision: "ask",
            limecorePolicyEvaluationPendingRefs: [
              "model_catalog",
              "provider_offer",
              "tenant_feature_flags",
            ],
          },
        },
      },
    ];

    const container = render(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-policy-1"]',
    );

    expect(previewCard?.textContent).toContain("Image Generation");
    expect(previewCard?.textContent).not.toContain(
      "LimeCore 策略输入待命中: 3",
    );
  });

  it("图片任务消息应保留思考并把内部工具过程折叠到同一回复里", () => {
    const container = render(
      [
        {
          id: "msg-assistant-image-workbench-process-flow",
          role: "assistant",
          content: "已成功提交分镜任务。",
          timestamp: new Date(),
          contentParts: [
            { type: "thinking", text: "先执行图片技能。" },
            { type: "text", text: "已成功提交分镜任务。" },
          ],
          toolCalls: [
            {
              id: "tool-image-skill",
              name: "skill",
              arguments: JSON.stringify({ skill: "image_generate" }),
              status: "completed",
              result: {
                success: true,
                output: "processing",
              },
              startTime: new Date(),
              endTime: new Date(),
            },
          ],
          imageWorkbenchPreview: {
            taskId: "task-image-process-flow",
            prompt: "三国主要人物分镜",
            status: "running",
            imageCount: 9,
            expectedImageCount: 9,
            layoutHint: "storyboard_3x3",
            projectId: "project-1",
            contentId: "content-1",
          },
        } as Message,
      ],
      {
        currentTurnId: "turn-image-process-flow",
        turns: [
          {
            id: "turn-image-process-flow",
            thread_id: "thread-image-process-flow",
            prompt_text: "@分镜 生成三国人物分镜",
            status: "completed",
            started_at: "2026-04-24T01:36:56Z",
            completed_at: "2026-04-24T01:37:12Z",
            created_at: "2026-04-24T01:36:56Z",
            updated_at: "2026-04-24T01:37:12Z",
          },
        ],
        threadItems: [
          {
            id: "summary-image-process-flow",
            thread_id: "thread-image-process-flow",
            turn_id: "turn-image-process-flow",
            sequence: 1,
            status: "completed",
            started_at: "2026-04-24T01:36:56Z",
            completed_at: "2026-04-24T01:37:12Z",
            updated_at: "2026-04-24T01:37:12Z",
            type: "turn_summary",
            text: "已完成思考 3 步，正在提交图片任务",
          },
        ],
      },
    );

    expect(mockStreamingRenderer).toHaveBeenCalledTimes(1);
    const rendererProps = mockStreamingRenderer.mock.calls[0]?.[0] as
      | {
          content?: string;
          thinkingContent?: string;
          contentParts?: unknown[];
          toolCalls?: unknown[];
        }
      | undefined;
    expect(rendererProps).toMatchObject({
      content: "",
      thinkingContent: "先执行图片技能。",
      suppressProcessFlow: false,
    });
    expect(rendererProps?.contentParts).toBeUndefined();
    expect(rendererProps?.toolCalls).toEqual([
      expect.objectContaining({ id: "tool-image-skill" }),
    ]);
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-task-image-process-flow"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
  });

  it("旧图片提交过程消息没有轻卡时应隐藏协议正文并折叠保留过程", () => {
    const container = render(
      [
        {
          id: "msg-assistant-image-submit-leak",
          role: "assistant",
          content:
            "我来为你生成一张广州塔从花城汇视角的春天照片。图片生成任务已提交！正在为你生成从花城汇看广州塔的春天照片。",
          timestamp: new Date(),
          isThinking: true,
          contentParts: [
            { type: "thinking", text: "开始中 广州塔春天照片" },
            {
              type: "text",
              text: '进度：正在生成工具输入：{"prompt":"广州塔"}',
            },
          ],
          toolCalls: [
            {
              id: "tool-image-generate",
              name: "lime_create_image_generation_task",
              arguments: JSON.stringify({ prompt: "广州塔" }),
              status: "completed",
              result: { success: true },
              startTime: new Date(),
              endTime: new Date(),
            },
          ],
        } as Message,
      ],
      {
        currentTurnId: "turn-image-submit-leak",
        turns: [
          {
            id: "turn-image-submit-leak",
            thread_id: "thread-image-submit-leak",
            prompt_text: "@Nanobanana Pro 生成广州塔春天照片",
            status: "running",
            started_at: "2026-04-24T01:36:56Z",
            created_at: "2026-04-24T01:36:56Z",
            updated_at: "2026-04-24T01:37:12Z",
          },
        ],
        threadItems: [
          {
            id: "summary-image-submit-leak",
            thread_id: "thread-image-submit-leak",
            turn_id: "turn-image-submit-leak",
            sequence: 1,
            status: "in_progress",
            started_at: "2026-04-24T01:36:56Z",
            updated_at: "2026-04-24T01:37:12Z",
            type: "turn_summary",
            text: '进度：正在生成工具输入：{"prompt":"广州塔"}',
          },
        ],
      },
    );

    expect(container.textContent).not.toContain("图片生成任务已提交");
    expect(container.textContent).not.toContain("工具输入");
    expect(mockStreamingRenderer).toHaveBeenCalledTimes(1);
    const rendererProps = mockStreamingRenderer.mock.calls[0]?.[0] as
      | {
          content?: string;
          contentParts?: unknown[];
          rawContent?: string;
          suppressProcessFlow?: boolean;
          toolCalls?: unknown[];
        }
      | undefined;
    expect(rendererProps).toMatchObject({
      content: "",
      rawContent: "",
      suppressProcessFlow: false,
    });
    expect(rendererProps?.contentParts).toEqual([
      { type: "thinking", text: "开始中 广州塔春天照片" },
    ]);
    expect(rendererProps?.toolCalls).toEqual([
      expect.objectContaining({ id: "tool-image-generate" }),
    ]);
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
  });

  it("视频任务消息卡应在聊天区渲染预览并支持打开工作区查看", () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-video-task",
        role: "assistant",
        content: "视频任务已提交，正在生成。",
        timestamp: now,
        taskPreview: {
          kind: "video_generate",
          taskId: "task-video-1",
          taskType: "video_generate",
          prompt: "新品发布会短视频，镜头缓慢推进主角产品",
          status: "running",
          progress: 42,
          durationSeconds: 15,
          aspectRatio: "16:9",
          resolution: "720p",
          projectId: "project-video-1",
          contentId: "content-video-1",
        },
      },
    ];

    const container = render(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-video-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("视频生成");
    expect(previewCard?.textContent).toContain("16:9");
    expect(previewCard?.textContent).toContain("720p");
    expect(previewCard?.textContent).toContain("42%");

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "task",
        preview: expect.objectContaining({
          kind: "video_generate",
          taskId: "task-video-1",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-video-task",
      }),
    );
  });

  it("失败的视频任务卡应提供重新生成动作，并通过事件总线下发而不是误触发打开工作区", () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-video-failed",
        role: "assistant",
        content: "视频任务失败。",
        timestamp: now,
        taskPreview: {
          kind: "video_generate",
          taskId: "task-video-failed-1",
          taskType: "video_generate",
          prompt: "新品发布会短视频，镜头缓慢推进主角产品",
          status: "failed",
          durationSeconds: 15,
          aspectRatio: "16:9",
          resolution: "720p",
          projectId: "project-video-1",
          contentId: "content-video-1",
        },
      },
    ];

    let actionDetail: Record<string, unknown> | null = null;
    const handleAction = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      actionDetail = event.detail as Record<string, unknown>;
    };
    window.addEventListener(VIDEO_WORKBENCH_TASK_ACTION_EVENT, handleAction);

    const container = render(messages, { onOpenMessagePreview });
    const actionButton = container.querySelector(
      '[data-testid="task-message-preview-action-task-video-failed-1-retry"]',
    ) as HTMLButtonElement | null;

    expect(actionButton?.textContent).toContain("重新生成");

    act(() => {
      actionButton?.click();
    });

    expect(actionDetail).toEqual({
      action: "retry",
      taskId: "task-video-failed-1",
      projectId: "project-video-1",
      contentId: "content-video-1",
    });
    expect(onOpenMessagePreview).not.toHaveBeenCalled();

    window.removeEventListener(VIDEO_WORKBENCH_TASK_ACTION_EVENT, handleAction);
  });

  it("进行中的视频任务卡应提供取消动作，并继续保留打开工作区能力", () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-video-running-action",
        role: "assistant",
        content: "视频任务进行中。",
        timestamp: now,
        taskPreview: {
          kind: "video_generate",
          taskId: "task-video-running-action-1",
          taskType: "video_generate",
          prompt: "新品发布会短视频，镜头缓慢推进主角产品",
          status: "running",
          progress: 18,
          durationSeconds: 15,
          aspectRatio: "16:9",
          resolution: "720p",
          projectId: "project-video-1",
          contentId: "content-video-1",
        },
      },
    ];

    let actionDetail: Record<string, unknown> | null = null;
    const handleAction = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      actionDetail = event.detail as Record<string, unknown>;
    };
    window.addEventListener(VIDEO_WORKBENCH_TASK_ACTION_EVENT, handleAction);

    const container = render(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-video-running-action-1"]',
    ) as HTMLButtonElement | null;
    const actionButton = container.querySelector(
      '[data-testid="task-message-preview-action-task-video-running-action-1-cancel"]',
    ) as HTMLButtonElement | null;

    expect(actionButton?.textContent).toContain("取消任务");

    act(() => {
      actionButton?.click();
    });

    expect(actionDetail).toEqual({
      action: "cancel",
      taskId: "task-video-running-action-1",
      projectId: "project-video-1",
      contentId: "content-video-1",
    });
    expect(onOpenMessagePreview).not.toHaveBeenCalled();

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "task",
        preview: expect.objectContaining({
          kind: "video_generate",
          taskId: "task-video-running-action-1",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-video-running-action",
      }),
    );

    window.removeEventListener(VIDEO_WORKBENCH_TASK_ACTION_EVENT, handleAction);
  });

  it("通用任务消息卡应在聊天区渲染预览并支持打开对应产物", () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-resource-task",
        role: "assistant",
        content: "素材检索任务已提交。",
        timestamp: now,
        taskPreview: {
          kind: "modal_resource_search",
          taskId: "task-resource-1",
          taskType: "modal_resource_search",
          prompt: "咖啡馆木桌背景",
          title: "公众号头图素材",
          status: "running",
          artifactPath:
            ".lime/tasks/modal_resource_search/task-resource-1.json",
          metaItems: ["image", "公众号头图", "8 个候选"],
        },
      },
    ];

    const container = render(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-resource-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("素材检索");
    expect(previewCard?.textContent).toContain("公众号头图素材");
    expect(previewCard?.textContent).toContain("8 个候选");

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "task",
        preview: expect.objectContaining({
          kind: "modal_resource_search",
          taskId: "task-resource-1",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-resource-task",
      }),
    );
  });

  it("配音任务消息卡应展示 audio_generate 预览并支持打开运行时文档", () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-audio-task",
        role: "assistant",
        content: "配音任务已提交。",
        timestamp: now,
        taskPreview: {
          kind: "audio_generate",
          taskId: "task-audio-1",
          taskType: "audio_generate",
          prompt: "欢迎来到 Lime 多模态工作台。",
          title: "配音生成任务",
          status: "running",
          artifactPath: ".lime/runtime/audio-generate/task-audio-1.md",
          taskFilePath: ".lime/tasks/audio_generate/task-audio-1.json",
          metaItems: ["warm_female", "8 秒"],
          voice: "warm_female",
          durationMs: 8200,
        },
      },
    ];

    const container = render(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-audio-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("配音生成");
    expect(previewCard?.textContent).toContain("欢迎来到 Lime 多模态工作台");
    expect(previewCard?.textContent).toContain("warm_female");
    expect(previewCard?.textContent).toContain("源任务");

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "task",
        preview: expect.objectContaining({
          kind: "audio_generate",
          taskId: "task-audio-1",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-audio-task",
      }),
    );
  });

  it("失败的配音任务卡应展示 provider 错误码与原因", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-audio-task-failed",
        role: "assistant",
        content: "配音任务失败。",
        timestamp: now,
        taskPreview: {
          kind: "audio_generate",
          taskId: "task-audio-failed-1",
          taskType: "audio_generate",
          prompt: "欢迎来到 Lime 多模态工作台。",
          title: "配音生成任务",
          status: "failed",
          artifactPath: ".lime/runtime/audio-generate/task-audio-failed-1.md",
          taskFilePath: ".lime/tasks/audio_generate/task-audio-failed-1.json",
          errorCode: "audio_provider_unconfigured",
          errorMessage:
            "未找到可用的 voice_generation provider/API Key: missing-provider。",
          statusMessage:
            "配音 Provider 未配置，请先在语音生成设置中选择可用 Provider；任务保留在 audio_generate，不会回退 legacy TTS。",
        },
      },
    ];

    const container = render(messages);
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-audio-failed-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("执行失败");
    expect(previewCard?.textContent).toContain("audio_provider_unconfigured");
    expect(previewCard?.textContent).toContain(
      "未找到可用的 voice_generation provider/API Key",
    );
    expect(previewCard?.textContent).toContain("不会回退 legacy TTS");
  });

  it("转写任务消息卡应展示 transcript 路径与 provider 错误", () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-transcription-task",
        role: "assistant",
        content: "转写任务已同步。",
        timestamp: now,
        taskPreview: {
          kind: "transcription_generate",
          taskId: "task-transcription-1",
          taskType: "transcription_generate",
          prompt: "请转写访谈音频",
          title: "内容转写任务",
          status: "complete",
          artifactPath:
            ".lime/runtime/transcription-generate/task-transcription-1.md",
          taskFilePath:
            ".lime/tasks/transcription_generate/task-transcription-1.json",
          transcriptPath: ".lime/runtime/transcripts/task-transcription-1.txt",
          language: "zh-CN",
          outputFormat: "txt",
          transcriptSegments: [
            {
              id: "segment-1",
              index: 1,
              startMs: 1000,
              endMs: 3500,
              speaker: "主持人",
              text: "欢迎来到 Lime 访谈。",
            },
          ],
          statusMessage:
            "转写结果已同步，工作区已从 transcript 读取可校对文本。",
        },
      },
    ];

    const container = render(messages, { onOpenMessagePreview });
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-transcription-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("内容转写");
    expect(previewCard?.textContent).toContain("请转写访谈音频");
    expect(previewCard?.textContent).toContain("转写结果");
    expect(previewCard?.textContent).toContain("task-transcription-1.txt");
    expect(previewCard?.textContent).toContain("1 段时间轴");
    expect(previewCard?.textContent).toContain("时间轴预览");
    expect(previewCard?.textContent).toContain("主持人：欢迎来到 Lime 访谈。");

    act(() => {
      previewCard?.click();
    });

    expect(onOpenMessagePreview).toHaveBeenCalledWith(
      {
        kind: "task",
        preview: expect.objectContaining({
          kind: "transcription_generate",
          taskId: "task-transcription-1",
        }),
      },
      expect.objectContaining({
        id: "msg-assistant-transcription-task",
      }),
    );
  });

  it("失败的转写任务卡应展示 transcript 错误码与原因", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-transcription-task-failed",
        role: "assistant",
        content: "转写任务失败。",
        timestamp: now,
        taskPreview: {
          kind: "transcription_generate",
          taskId: "task-transcription-failed-1",
          taskType: "transcription_generate",
          prompt: "请转写访谈音频",
          title: "内容转写任务",
          status: "failed",
          artifactPath:
            ".lime/runtime/transcription-generate/task-transcription-failed-1.md",
          taskFilePath:
            ".lime/tasks/transcription_generate/task-transcription-failed-1.json",
          errorCode: "transcription_provider_unconfigured",
          errorMessage:
            "未找到可用的 audio_transcription provider/API Key: missing-provider。",
          statusMessage:
            "转写 Provider 未配置，请先在转写设置中选择可用 Provider；任务保留在 transcription_generate，不会回退 frontend ASR。",
        },
      },
    ];

    const container = render(messages);
    const previewCard = container.querySelector(
      '[data-testid="task-message-preview-task-transcription-failed-1"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("执行失败");
    expect(previewCard?.textContent).toContain(
      "transcription_provider_unconfigured",
    );
    expect(previewCard?.textContent).toContain(
      "未找到可用的 audio_transcription provider/API Key",
    );
    expect(previewCard?.textContent).toContain("不会回退 frontend ASR");
  });

  it("联网搜图结果消息卡应展示缩略图候选", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-resource-search-preview",
        role: "assistant",
        content: "已找到一组图片素材候选。",
        timestamp: now,
        taskPreview: {
          kind: "modal_resource_search",
          taskId: "resource-search:tool-1",
          taskType: "modal_resource_search",
          prompt: "cozy coffee table",
          title: "Pexels 图片候选",
          status: "complete",
          artifactPath: ".lime/runtime/resource-search/tool-1.md",
          metaItems: ["Pexels", "3 个候选"],
          imageCandidates: [
            {
              id: "hit-1",
              thumbnailUrl: "https://pexels.example/1-thumb.jpg",
              contentUrl: "https://pexels.example/1.jpg",
              name: "cozy coffee table 1",
            },
            {
              id: "hit-2",
              thumbnailUrl: "https://pexels.example/2-thumb.jpg",
              contentUrl: "https://pexels.example/2.jpg",
              name: "cozy coffee table 2",
            },
            {
              id: "hit-3",
              thumbnailUrl: "https://pexels.example/3-thumb.jpg",
              contentUrl: "https://pexels.example/3.jpg",
              name: "cozy coffee table 3",
            },
          ],
        },
      },
    ];

    const container = render(messages);
    const media = container.querySelector(
      '[data-testid="task-message-preview-media-resource-search:tool-1"]',
    );

    expect(media).not.toBeNull();
    expect(
      container.querySelector('img[src="https://pexels.example/1-thumb.jpg"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('img[src="https://pexels.example/2-thumb.jpg"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('img[src="https://pexels.example/3-thumb.jpg"]'),
    ).toBeTruthy();
  });

  it("修图任务消息卡应收敛为裸结果图", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-edit-preview",
        role: "assistant",
        content: "修图任务已完成。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-edit-1",
          prompt: "去掉背景里的广告牌，保留主体人物",
          mode: "edit",
          status: "complete",
          imageUrl: "https://example.com/edited.png",
          imageCount: 1,
          sourceImageUrl: "https://example.com/source.png",
          sourceImagePrompt: "原始街景海报",
          sourceImageRef: "img-source-1",
          sourceImageCount: 1,
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-edit-1"]',
    );

    expect(previewCard?.textContent).toContain("图片编辑");
    expect(previewCard?.querySelector("img")).not.toBeNull();
    expect(previewCard?.textContent).not.toContain("已修图");
    expect(previewCard?.textContent).not.toContain("来源图");
    expect(previewCard?.textContent).not.toContain("原始街景海报");
  });

  it("图片任务完成但图片仍在工作台时，不应继续显示生成中占位", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-complete-without-image",
        role: "assistant",
        content: "图片任务已完成。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-complete-without-image",
          prompt: "赛博青柠实验室，电影感光影",
          status: "complete",
          imageCount: 2,
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-complete-without-image"]',
    );

    expect(previewCard?.textContent).toContain("图片暂时无法显示");
    expect(previewCard?.textContent).not.toContain("已生成");
    expect(previewCard?.textContent).not.toContain("可在右侧继续查看与使用");
    expect(previewCard?.textContent).not.toContain("图片任务卡");
  });

  it("图片任务已经完成时，不应继续向用户暴露同步中的过渡文案", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-complete-sync-copy",
        role: "assistant",
        content: "图片任务已完成。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-complete-sync-copy",
          prompt: "广州塔清晨薄雾氛围图",
          status: "complete",
          imageUrl: "https://example.com/guangzhou-tower-morning.png",
          imageCount: 1,
          statusMessage: "图片任务已提交，正在同步任务状态。",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-complete-sync-copy"]',
    );

    expect(previewCard?.textContent).toContain("图片生成");
    expect(previewCard?.textContent).not.toContain("已生成");
    expect(previewCard?.textContent).not.toContain("可在右侧继续查看与使用");
    expect(previewCard?.textContent).not.toContain("正在同步任务状态");
    expect(previewCard?.textContent).not.toContain("图片任务已提交");
  });

  it("失败的图片任务卡应提供单独重试按钮，并继续保留打开查看能力", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-failed",
        role: "assistant",
        content: "图片任务失败。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-failed-1",
          prompt: "青柠品牌 KV",
          status: "failed",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    let actionDetail: Record<string, unknown> | null = null;
    const handleAction = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      actionDetail = event.detail as Record<string, unknown>;
    };
    window.addEventListener(IMAGE_WORKBENCH_TASK_ACTION_EVENT, handleAction);

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-failed-1"]',
    ) as HTMLButtonElement | null;
    const retryButton = container.querySelector(
      '[data-testid="image-workbench-message-preview-action-task-failed-1-retry"]',
    ) as HTMLButtonElement | null;

    expect(previewCard?.textContent).toContain("生成失败");
    expect(retryButton?.textContent).toContain("重试");

    act(() => {
      retryButton?.click();
    });

    expect(actionDetail).toEqual({
      action: "retry",
      taskId: "task-failed-1",
      projectId: "project-1",
      contentId: "content-1",
    });

    window.removeEventListener(IMAGE_WORKBENCH_TASK_ACTION_EVENT, handleAction);
  });

  it("生成中的图片任务卡应展示同会话占位，但不再展示取消按钮", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-running",
        role: "assistant",
        content: "图片任务处理中。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-running-1",
          prompt: "青柠宇航员海报",
          status: "running",
          phase: "queued",
          statusMessage: "任务已进入队列，等待图片服务分配执行槽位。",
          attemptCount: 2,
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    expect(container.textContent).toContain("正在生成图片");
    expect(container.textContent).not.toContain(
      "任务已进入队列，等待图片服务分配执行槽位。",
    );
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-action-task-running-1-cancel"]',
      ),
    ).toBeNull();
  });

  it("失败的图片任务卡不暴露底层错误，即使原状态标记不可重试也提供单独重试入口", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-failed-no-retry",
        role: "assistant",
        content: "图片任务失败。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-failed-no-retry",
          prompt: "青柠品牌 KV",
          status: "failed",
          retryable: false,
          statusMessage: "FAL 请求参数无效，请先调整配置。",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-failed-no-retry"]',
    );

    expect(previewCard?.textContent).toContain("生成失败");
    expect(previewCard?.textContent).not.toContain(
      "FAL 请求参数无效，请先调整配置。",
    );
    expect(previewCard?.textContent).not.toContain("不可重试");
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-action-task-failed-no-retry-retry"]',
      )?.textContent,
    ).toContain("重试");
  });

  it("已取消的图片任务卡应显示独立状态且不再展示重试按钮", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-cancelled",
        role: "assistant",
        content: "图片任务已取消。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-cancelled-1",
          prompt: "青柠像素头像",
          status: "cancelled",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-cancelled-1"]',
    );

    expect(previewCard?.textContent).toContain("已取消");
    expect(previewCard?.textContent).not.toContain("打开查看");
    expect(
      container.querySelector(
        '[data-testid="image-workbench-message-preview-action-task-cancelled-1-retry"]',
      ),
    ).toBeNull();
  });

  it("图片任务卡点击后仍应打开右侧查看区，而不是丢失导航能力", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-cancelled-open",
        role: "assistant",
        content: "图片任务已取消。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-open-1",
          prompt: "青柠像素头像",
          status: "cancelled",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    let focusDetail: Record<string, unknown> | null = null;
    const handleFocus = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      focusDetail = event.detail as Record<string, unknown>;
    };
    window.addEventListener(IMAGE_WORKBENCH_FOCUS_EVENT, handleFocus);

    const container = render(messages);
    const previewCard = container.querySelector(
      '[data-testid="image-workbench-message-preview-task-open-1"]',
    ) as HTMLDivElement | null;

    act(() => {
      previewCard?.click();
    });

    expect(focusDetail).toEqual({
      projectId: "project-1",
      contentId: "content-1",
    });

    window.removeEventListener(IMAGE_WORKBENCH_FOCUS_EVENT, handleFocus);
  });

  it("图片任务卡默认不再渲染任何底部操作按钮", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-actions-hidden",
        role: "assistant",
        content: "图片任务处理中。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-actions-hidden",
          prompt: "青柠宇航员海报",
          status: "running",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = render(messages);
    expect(
      container.querySelectorAll(
        '[data-testid^="image-workbench-message-preview-action-"]',
      ).length,
    ).toBe(0);
  });

  it("3x3 分镜消息卡应渲染九宫格摘要而不是单图卡", async () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-storyboard",
        role: "assistant",
        content: "3x3 分镜已完成。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-storyboard-preview-1",
          prompt: "三国主要人物分镜",
          status: "complete",
          imageCount: 9,
          imageUrl: "https://example.com/storyboard-primary.png",
          previewImages: Array.from(
            { length: 9 },
            (_, index) => `https://example.com/storyboard-${index + 1}.png`,
          ),
          layoutHint: "storyboard_3x3",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages);
    const grid = container.querySelector(
      '[data-testid="image-workbench-message-preview-grid-task-storyboard-preview-1"]',
    ) as HTMLDivElement | null;

    expect(container.textContent).toContain("图片生成");
    expect(container.textContent).not.toContain(
      "3x3 分镜已经完成，可在右侧继续查看与使用。",
    );
    expect(container.textContent).not.toContain("9 张");
    expect(grid?.className).toContain("grid-cols-3");
    expect(grid?.querySelectorAll("img")).toHaveLength(9);
    expect(grid?.textContent).not.toContain("1");
    expect(grid?.textContent).not.toContain("9");
  });

  it("点击九宫格后面的图片时应把具体图片选择传给工作台", async () => {
    const now = new Date();
    const onOpenMessagePreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-image-workbench-storyboard-select",
        role: "assistant",
        content: "已生成章节配图。",
        timestamp: now,
        imageWorkbenchPreview: {
          taskId: "task-storyboard-select",
          prompt: "章节配图",
          status: "complete",
          imageCount: 3,
          imageUrl: "https://example.com/chapter-1.png",
          previewImages: [
            "https://example.com/chapter-1.png",
            "https://example.com/chapter-2.png",
            "https://example.com/chapter-3.png",
          ],
          layoutHint: "storyboard_3x3",
          projectId: "project-1",
          contentId: "content-1",
        },
      },
    ];

    const container = await renderZh(messages, { onOpenMessagePreview });
    const secondImageButton = container.querySelector(
      '[data-testid="image-workbench-message-preview-media-task-storyboard-select-2"]',
    ) as HTMLButtonElement | null;

    act(() => {
      secondImageButton?.click();
    });

    const [target, message] = onOpenMessagePreview.mock.calls[0] as [
      MessagePreviewTarget,
      Message,
    ];
    expect(message.id).toBe("msg-assistant-image-workbench-storyboard-select");
    expect(target).toEqual({
      kind: "image_workbench",
      preview: expect.objectContaining({
        taskId: "task-storyboard-select",
      }),
      selection: {
        imageUrl: "https://example.com/chapter-2.png",
        imageIndex: 1,
      },
    });
  });

  it("当前活动 assistant A2UI 应继续在消息正文里内联渲染", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-active-a2ui",
        role: "assistant",
        content: "```a2ui\n{}\n```",
        timestamp: now,
      },
    ];

    render(messages, {
      activePendingA2UISource: {
        kind: "assistant_message",
        messageId: "msg-assistant-active-a2ui",
      },
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ renderA2UIInline: true }),
    );
  });

  it("当前活动 action_request 不应再被底部面板抑制", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-action",
        role: "assistant",
        content: "请先确认执行方式。",
        timestamp: now,
        actionRequests: [
          {
            requestId: "req-action-1",
            actionType: "ask_user",
            status: "pending",
            prompt: "请选择执行方式",
            questions: [{ question: "请选择执行方式" }],
          },
        ],
      },
    ];

    render(messages, {
      activePendingA2UISource: {
        kind: "action_request",
        requestId: "req-action-1",
      },
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ suppressedActionRequestId: null }),
    );
  });

  it("非活动历史 assistant A2UI 与 action_request 应只读回显，不能再次提交", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-history-a2ui",
        role: "assistant",
        content: "```a2ui\n{}\n```",
        timestamp: now,
        actionRequests: [
          {
            requestId: "req-history-ask",
            actionType: "ask_user",
            status: "pending",
            prompt: "请选择执行方式",
            questions: [
              {
                question: "请选择执行方式",
                options: [{ label: "直接执行" }, { label: "稍后处理" }],
              },
            ],
          },
        ],
      },
    ];

    render(messages);

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        readOnlyA2UI: true,
        readOnlyActionRequests: true,
      }),
    );
  });

  it("当前活动 assistant action_request 仍保持可提交，不降级为历史只读", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-current-action",
        role: "assistant",
        content: "请先确认执行方式。",
        timestamp: now,
        actionRequests: [
          {
            requestId: "req-current-ask",
            actionType: "ask_user",
            status: "pending",
            prompt: "请选择执行方式",
            questions: [{ question: "请选择执行方式" }],
          },
        ],
      },
    ];

    render(messages, {
      pendingActions: [
        {
          requestId: "req-current-ask",
          actionType: "ask_user",
          status: "pending",
          prompt: "请选择执行方式",
          questions: [{ question: "请选择执行方式" }],
        },
      ],
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        readOnlyA2UI: false,
        readOnlyActionRequests: false,
      }),
    );
  });

  it("应向助手消息正文透传已保存站点内容打开回调", () => {
    const onOpenSavedSiteContent = vi.fn();
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-site-open",
        role: "assistant",
        content: "已保存站点结果。",
        timestamp: now,
      },
    ];

    render(messages, { onOpenSavedSiteContent });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ onOpenSavedSiteContent }),
    );
  });

  it("已完成 assistant 消息有内联工具序列时应交给正文按顺序渲染", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-process-suppressed",
        role: "assistant",
        content: "最终说明",
        timestamp: now,
        thinkingContent: "这段思考应只留在执行轨迹中。",
        contentParts: [
          {
            type: "thinking",
            text: "这段思考应只留在执行轨迹中。",
          },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-process-suppressed-1",
              name: "functions.exec_command",
              arguments: JSON.stringify({ cmd: "rg -n process src" }),
              status: "completed",
              result: { success: true, output: "ok" },
              startTime: now,
              endTime: now,
            },
          },
          {
            type: "text",
            text: "最终说明",
          },
        ],
        toolCalls: [
          {
            id: "tool-process-suppressed-1",
            name: "functions.exec_command",
            arguments: JSON.stringify({ cmd: "rg -n process src" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: now,
            endTime: now,
          },
        ],
      },
    ];

    render(messages, {
      currentTurnId: "turn-process-suppressed",
      turns: [
        {
          id: "turn-process-suppressed",
          thread_id: "thread-1",
          prompt_text: "继续执行",
          status: "running",
          started_at: "2026-03-28T12:00:00Z",
          created_at: "2026-03-28T12:00:00Z",
          updated_at: "2026-03-28T12:00:01Z",
        },
      ],
      threadItems: [
        {
          id: "item-process-suppressed",
          thread_id: "thread-1",
          turn_id: "turn-process-suppressed",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-28T12:00:01Z",
          completed_at: "2026-03-28T12:00:02Z",
          updated_at: "2026-03-28T12:00:02Z",
          type: "tool_call",
          tool_name: "functions.exec_command",
          arguments: { cmd: "rg -n process src" },
        },
      ],
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        suppressProcessFlow: false,
        thinkingContent: "这段思考应只留在执行轨迹中。",
        toolCalls: [
          expect.objectContaining({
            id: "tool-process-suppressed-1",
            status: "completed",
          }),
        ],
        contentParts: [
          { type: "thinking", text: "这段思考应只留在执行轨迹中。" },
          expect.objectContaining({ type: "tool_use" }),
          { type: "text", text: "最终说明" },
        ],
      }),
    );
  });

  it("当前完成回合缺少持久化 reasoning 时应临时保留本地思考过程", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-thinking-fallback",
        role: "user",
        content: "先分析再回答",
        timestamp: now,
      },
      {
        id: "msg-assistant-thinking-fallback",
        role: "assistant",
        content: "最终说明",
        timestamp: now,
        thinkingContent: "先分析意图。",
        contentParts: [
          {
            type: "thinking",
            text: "先分析意图。",
          },
          {
            type: "text",
            text: "最终说明",
          },
        ],
      },
    ];

    render(messages, {
      currentTurnId: "turn-thinking-fallback",
      turns: [
        {
          id: "turn-thinking-fallback",
          thread_id: "thread-1",
          prompt_text: "先分析再回答",
          status: "completed",
          started_at: "2026-03-28T12:00:00Z",
          completed_at: "2026-03-28T12:00:02Z",
          created_at: "2026-03-28T12:00:00Z",
          updated_at: "2026-03-28T12:00:02Z",
        },
      ],
      threadItems: [],
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingContent: "先分析意图。",
        contentParts: [
          { type: "thinking", text: "先分析意图。" },
          { type: "text", text: "最终说明" },
        ],
      }),
    );
  });

  it("当前尾部 assistant 已完成但 reasoning 尚未持久化时也应继续显示思考内容", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-tail-thinking-fallback",
        role: "user",
        content: "帮我分析一下",
        timestamp: now,
      },
      {
        id: "msg-assistant-tail-thinking-fallback",
        role: "assistant",
        content: "这是最终回答。",
        timestamp: now,
        thinkingContent: "先列提纲，再组织答案。",
        contentParts: [
          {
            type: "thinking",
            text: "先列提纲，再组织答案。",
          },
          {
            type: "text",
            text: "这是最终回答。",
          },
        ],
      },
    ];

    render(messages, {
      currentTurnId: null,
      turns: [
        {
          id: "turn-tail-thinking-fallback",
          thread_id: "thread-1",
          prompt_text: "帮我分析一下",
          status: "completed",
          started_at: "2026-03-28T12:00:00Z",
          completed_at: "2026-03-28T12:00:02Z",
          created_at: "2026-03-28T12:00:00Z",
          updated_at: "2026-03-28T12:00:02Z",
        },
      ],
      threadItems: [],
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingContent: "先列提纲，再组织答案。",
        contentParts: [
          { type: "thinking", text: "先列提纲，再组织答案。" },
          { type: "text", text: "这是最终回答。" },
        ],
      }),
    );
  });

  it("当前尾部 assistant 完成后 turn timeline 暂缺时应继续显示本地思考内容", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-tail-runtime-thinking-fallback",
        role: "user",
        content: "先思考再回答",
        timestamp: now,
      },
      {
        id: "msg-assistant-tail-runtime-thinking-fallback",
        role: "assistant",
        content: "这是最终回答。",
        timestamp: now,
        runtimeTurnId: "turn-tail-runtime-thinking-fallback",
        thinkingContent: "先梳理约束。",
        contentParts: [
          {
            type: "thinking",
            text: "先梳理约束。",
          },
          {
            type: "text",
            text: "这是最终回答。",
          },
        ],
      },
    ];

    render(messages, {
      currentTurnId: null,
      turns: [],
      threadItems: [],
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingContent: "先梳理约束。",
        contentParts: [
          { type: "thinking", text: "先梳理约束。" },
          { type: "text", text: "这是最终回答。" },
        ],
      }),
    );
  });

  it("已完成的直执 Skill 消息即使不在尾部，也不应丢失本地思考内容", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-skill-inline-process",
        role: "user",
        content: "整理产品资料",
        timestamp: now,
      },
      {
        id: "msg-assistant-skill-inline-process",
        role: "assistant",
        content: "产品知识库说明。",
        timestamp: now,
        runtimeTurnId: "skill-exec-msg-assistant-skill-inline-process",
        thinkingContent: "先读取 Skill，再分析产品资料边界。",
        contentParts: [
          {
            type: "thinking",
            text: "先读取 Skill，再分析产品资料边界。",
          },
          {
            type: "text",
            text: "产品知识库说明。",
          },
        ],
      },
      {
        id: "msg-user-after-skill-inline-process",
        role: "user",
        content: "继续",
        timestamp: now,
      },
      {
        id: "msg-assistant-after-skill-inline-process",
        role: "assistant",
        content: "继续回答。",
        timestamp: now,
      },
    ];

    render(messages, {
      currentTurnId: null,
      turns: [],
      threadItems: [],
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "产品知识库说明。",
        thinkingContent: "先读取 Skill，再分析产品资料边界。",
        contentParts: [
          {
            type: "thinking",
            text: "先读取 Skill，再分析产品资料边界。",
          },
          {
            type: "text",
            text: "产品知识库说明。",
          },
        ],
      }),
    );
  });

  it("已完成的服务型 Skill 消息即使不在尾部，也不应丢失本地思考内容", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-service-skill-inline-process",
        role: "user",
        content: "整理产品资料",
        timestamp: now,
      },
      {
        id: "msg-assistant-service-skill-inline-process",
        role: "assistant",
        content: "产品知识库说明。",
        timestamp: now,
        runtimeTurnId: "turn-service-skill-inline-process",
        inlineProcessRetention: "skill",
        thinkingContent: "先读取服务型 Skill，再分析产品资料边界。",
        contentParts: [
          {
            type: "thinking",
            text: "先读取服务型 Skill，再分析产品资料边界。",
          },
          {
            type: "text",
            text: "产品知识库说明。",
          },
        ],
      },
      {
        id: "msg-user-after-service-skill-inline-process",
        role: "user",
        content: "继续",
        timestamp: now,
      },
      {
        id: "msg-assistant-after-service-skill-inline-process",
        role: "assistant",
        content: "继续回答。",
        timestamp: now,
      },
    ];

    render(messages, {
      currentTurnId: null,
      turns: [],
      threadItems: [],
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "产品知识库说明。",
        thinkingContent: "先读取服务型 Skill，再分析产品资料边界。",
        contentParts: [
          {
            type: "thinking",
            text: "先读取服务型 Skill，再分析产品资料边界。",
          },
          {
            type: "text",
            text: "产品知识库说明。",
          },
        ],
      }),
    );
  });

  it("已完成的直执 Skill 消息已有 turn timeline 时仍应保留内联思考内容", () => {
    const now = new Date();
    const turnId = "skill-exec-analysis-retained";
    const messages: Message[] = [
      {
        id: "msg-user-skill-retained-with-timeline",
        role: "user",
        content: "@analysis 帮我分析一下今天的国际形势",
        timestamp: now,
      },
      {
        id: "msg-assistant-skill-retained-with-timeline",
        role: "assistant",
        content: "国际形势分析结果。",
        timestamp: now,
        runtimeTurnId: turnId,
        inlineProcessRetention: "skill",
        thinkingContent: "先读取 analysis Skill，再拆解地区变量。",
        contentParts: [
          {
            type: "thinking",
            text: "先读取 analysis Skill，再拆解地区变量。",
          },
          {
            type: "text",
            text: "国际形势分析结果。",
          },
        ],
      },
    ];

    render(messages, {
      currentTurnId: turnId,
      turns: [
        {
          id: turnId,
          thread_id: "thread-1",
          prompt_text: "@analysis 帮我分析一下今天的国际形势",
          status: "completed",
          started_at: "2026-05-13T12:00:00Z",
          completed_at: "2026-05-13T12:00:02Z",
          created_at: "2026-05-13T12:00:00Z",
          updated_at: "2026-05-13T12:00:02Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-skill-retained-with-timeline",
          thread_id: "thread-1",
          turn_id: turnId,
          sequence: 1,
          status: "completed",
          started_at: "2026-05-13T12:00:00Z",
          completed_at: "2026-05-13T12:00:01Z",
          updated_at: "2026-05-13T12:00:01Z",
          type: "reasoning",
          text: "先读取 analysis Skill，再拆解地区变量。",
        },
      ],
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "国际形势分析结果。",
        thinkingContent: "先读取 analysis Skill，再拆解地区变量。",
        contentParts: [
          {
            type: "thinking",
            text: "先读取 analysis Skill，再拆解地区变量。",
          },
          {
            type: "text",
            text: "国际形势分析结果。",
          },
        ],
      }),
    );
  });

  it("当前尾部 assistant 完成后 turn 记录暂缺时应按 runtimeTurnId 保留过程 timeline", () => {
    const now = new Date("2026-05-12T10:00:02.000Z");
    const messages: Message[] = [
      {
        id: "msg-user-orphan-runtime-timeline",
        role: "user",
        content: "保留过程",
        timestamp: new Date("2026-05-12T10:00:00.000Z"),
      },
      {
        id: "msg-assistant-orphan-runtime-timeline",
        role: "assistant",
        content: "最终回答。",
        timestamp: now,
        runtimeTurnId: "turn-orphan-runtime-timeline",
      },
    ];

    const container = render(messages, {
      currentTurnId: null,
      turns: [],
      threadItems: [
        {
          id: "reasoning-orphan-runtime-timeline",
          thread_id: "thread-1",
          turn_id: "turn-orphan-runtime-timeline",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-12T10:00:01.000Z",
          completed_at: "2026-05-12T10:00:02.000Z",
          updated_at: "2026-05-12T10:00:02.000Z",
          type: "reasoning",
          text: "先确认过程是否还在。",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="agent-thread-timeline:leading"]')
        ?.getAttribute("data-turn-id"),
    ).toBe("turn-orphan-runtime-timeline");
    expect(mockAgentThreadTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: "reasoning-orphan-runtime-timeline",
            type: "reasoning",
          }),
        ],
      }),
    );
  });

  it("消息内已有思考顺序时不应被持久化 reasoning 顶到正文外", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-thinking-persisted",
        role: "user",
        content: "先分析再回答",
        timestamp: now,
      },
      {
        id: "msg-assistant-thinking-persisted",
        role: "assistant",
        content: "最终说明",
        timestamp: now,
        thinkingContent: "先分析意图。",
        contentParts: [
          {
            type: "thinking",
            text: "先分析意图。",
          },
          {
            type: "text",
            text: "最终说明",
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-thinking-persisted",
      turns: [
        {
          id: "turn-thinking-persisted",
          thread_id: "thread-1",
          prompt_text: "先分析再回答",
          status: "completed",
          started_at: "2026-03-28T12:00:00Z",
          completed_at: "2026-03-28T12:00:02Z",
          created_at: "2026-03-28T12:00:00Z",
          updated_at: "2026-03-28T12:00:02Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-thinking-persisted",
          thread_id: "thread-1",
          turn_id: "turn-thinking-persisted",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-28T12:00:00Z",
          completed_at: "2026-03-28T12:00:01Z",
          updated_at: "2026-03-28T12:00:01Z",
          type: "reasoning",
          text: "先分析意图。",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingContent: "先分析意图。",
        contentParts: [
          { type: "thinking", text: "先分析意图。" },
          { type: "text", text: "最终说明" },
        ],
      }),
    );
  });

  it("完成态 timeline 多段 reasoning 应按 sequence 穿插到正文流", () => {
    const now = new Date("2026-05-30T09:10:00.000Z");
    const messages: Message[] = [
      {
        id: "msg-user-timeline-interleaved-reasoning",
        role: "user",
        content: "帮我分析一下这个文件夹",
        timestamp: now,
      },
      {
        id: "msg-assistant-timeline-interleaved-reasoning",
        role: "assistant",
        content: "我先围绕你给出的路径做只读侦查。\n\n已确认该目录存在。",
        timestamp: new Date("2026-05-30T09:10:05.000Z"),
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-timeline-interleaved-reasoning",
      turns: [
        {
          id: "turn-timeline-interleaved-reasoning",
          thread_id: "thread-timeline-interleaved-reasoning",
          prompt_text: "帮我分析一下这个文件夹",
          status: "completed",
          started_at: "2026-05-30T09:10:00.000Z",
          completed_at: "2026-05-30T09:10:05.000Z",
          created_at: "2026-05-30T09:10:00.000Z",
          updated_at: "2026-05-30T09:10:05.000Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-timeline-interleaved-1",
          thread_id: "thread-timeline-interleaved-reasoning",
          turn_id: "turn-timeline-interleaved-reasoning",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-30T09:10:00.500Z",
          completed_at: "2026-05-30T09:10:01.000Z",
          updated_at: "2026-05-30T09:10:01.000Z",
          type: "reasoning",
          text: "Inspecting folder for details",
        },
        {
          id: "agent-timeline-interleaved-1",
          thread_id: "thread-timeline-interleaved-reasoning",
          turn_id: "turn-timeline-interleaved-reasoning",
          sequence: 2,
          status: "completed",
          started_at: "2026-05-30T09:10:01.000Z",
          completed_at: "2026-05-30T09:10:01.500Z",
          updated_at: "2026-05-30T09:10:01.500Z",
          type: "agent_message",
          text: "我先围绕你给出的路径做只读侦查。",
        },
        {
          id: "tool-timeline-interleaved-1",
          thread_id: "thread-timeline-interleaved-reasoning",
          turn_id: "turn-timeline-interleaved-reasoning",
          sequence: 3,
          status: "completed",
          started_at: "2026-05-30T09:10:01.500Z",
          completed_at: "2026-05-30T09:10:02.000Z",
          updated_at: "2026-05-30T09:10:02.000Z",
          type: "command_execution",
          command: "ls /Users/coso/yansu-agent",
          cwd: "/Users/coso",
          aggregated_output: "activity models sherpa bin",
          exit_code: 0,
        },
        {
          id: "reasoning-timeline-interleaved-2",
          thread_id: "thread-timeline-interleaved-reasoning",
          turn_id: "turn-timeline-interleaved-reasoning",
          sequence: 4,
          status: "completed",
          started_at: "2026-05-30T09:10:02.500Z",
          completed_at: "2026-05-30T09:10:03.000Z",
          updated_at: "2026-05-30T09:10:03.000Z",
          type: "reasoning",
          text: "Analyzing file sizes",
        },
        {
          id: "agent-timeline-interleaved-2",
          thread_id: "thread-timeline-interleaved-reasoning",
          turn_id: "turn-timeline-interleaved-reasoning",
          sequence: 5,
          status: "completed",
          started_at: "2026-05-30T09:10:04.000Z",
          completed_at: "2026-05-30T09:10:05.000Z",
          updated_at: "2026-05-30T09:10:05.000Z",
          type: "agent_message",
          text: "已确认该目录存在。",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingContent: undefined,
        contentParts: [
          { type: "thinking", text: "Inspecting folder for details" },
          { type: "text", text: "我先围绕你给出的路径做只读侦查。" },
          expect.objectContaining({ type: "tool_use" }),
          { type: "thinking", text: "Analyzing file sizes" },
          { type: "text", text: "已确认该目录存在。" },
        ],
      }),
    );
  });

  it("已完成短答也应把持久化 reasoning 保留到执行轨迹", () => {
    const now = new Date("2026-05-09T06:02:56.361Z");
    const messages: Message[] = [
      {
        id: "msg-user-fast-plain-answer",
        role: "user",
        content: "只回答一个字：好",
        timestamp: new Date("2026-05-09T06:02:54.927Z"),
      },
      {
        id: "msg-assistant-fast-plain-answer",
        role: "assistant",
        content: "好",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-fast-plain-answer",
      turns: [
        {
          id: "turn-fast-plain-answer",
          thread_id: "thread-fast-plain-answer",
          prompt_text: "只回答一个字：好",
          status: "completed",
          started_at: "2026-05-09T06:02:54.278Z",
          completed_at: "2026-05-09T06:02:56.366Z",
          created_at: "2026-05-09T06:02:54.278Z",
          updated_at: "2026-05-09T06:02:56.366Z",
        },
      ],
      threadItems: [
        {
          id: "turn-summary-fast-plain-answer",
          thread_id: "thread-fast-plain-answer",
          turn_id: "turn-fast-plain-answer",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-09T06:02:54.281Z",
          completed_at: "2026-05-09T06:02:56.365Z",
          updated_at: "2026-05-09T06:02:56.365Z",
          type: "turn_summary",
          text: "直接回答优先\n当前请求无需默认升级为搜索或任务，先直接给出结果，必要时再调用工具。",
          metadata: {
            sourceType: "runtime_status",
            surface: "runtime_status",
            visibility: "diagnostics",
            persistence: "transient",
          },
        },
        {
          id: "user-fast-plain-answer",
          thread_id: "thread-fast-plain-answer",
          turn_id: "turn-fast-plain-answer",
          sequence: 2,
          status: "completed",
          started_at: "2026-05-09T06:02:54.278Z",
          completed_at: "2026-05-09T06:02:54.927Z",
          updated_at: "2026-05-09T06:02:54.927Z",
          type: "user_message",
          content: "只回答一个字：好",
        },
        {
          id: "reasoning-fast-plain-answer",
          thread_id: "thread-fast-plain-answer",
          turn_id: "turn-fast-plain-answer",
          sequence: 3,
          status: "completed",
          started_at: "2026-05-09T06:02:55.716Z",
          completed_at: "2026-05-09T06:02:56.361Z",
          updated_at: "2026-05-09T06:02:56.361Z",
          type: "reasoning",
          text: "我们被要求只回答一个字：好。直接回复即可。",
          summary: ["我们被要求只回答一个字：好。直接回复即可。"],
        },
        {
          id: "assistant-fast-plain-answer",
          thread_id: "thread-fast-plain-answer",
          turn_id: "turn-fast-plain-answer",
          sequence: 4,
          status: "completed",
          started_at: "2026-05-09T06:02:56.289Z",
          completed_at: "2026-05-09T06:02:56.361Z",
          updated_at: "2026-05-09T06:02:56.361Z",
          type: "agent_message",
          text: "好",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).not.toBeNull();
    const leadingTimelineProps = mockAgentThreadTimeline.mock.calls.find(
      ([props]) => props?.placement === "leading",
    )?.[0] as { items?: AgentThreadItem[] } | undefined;
    expect(leadingTimelineProps?.items).toEqual([
      expect.objectContaining({
        type: "reasoning",
        id: "reasoning-fast-plain-answer",
      }),
    ]);
    expect(container.textContent).toContain("好");
    expect(container.textContent).toContain("执行轨迹");
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "好",
        thinkingContent: undefined,
        contentParts: undefined,
      }),
    );
  });

  it("历史对话恢复时也应保留已持久化 reasoning 执行轨迹", () => {
    const now = new Date("2026-05-09T06:02:56.361Z");
    const messages: Message[] = [
      {
        id: "msg-user-history-reasoning",
        role: "user",
        content: "只回答一个字：好",
        timestamp: new Date("2026-05-09T06:02:54.927Z"),
      },
      {
        id: "msg-assistant-history-reasoning",
        role: "assistant",
        content: "好",
        timestamp: now,
      },
    ];

    render(messages, {
      isRestoringSession: true,
      turns: [
        {
          id: "turn-history-reasoning",
          thread_id: "thread-history-reasoning",
          prompt_text: "只回答一个字：好",
          status: "completed",
          started_at: "2026-05-09T06:02:54.278Z",
          completed_at: "2026-05-09T06:02:56.366Z",
          created_at: "2026-05-09T06:02:54.278Z",
          updated_at: "2026-05-09T06:02:56.366Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-history-answer",
          thread_id: "thread-history-reasoning",
          turn_id: "turn-history-reasoning",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-09T06:02:55.716Z",
          completed_at: "2026-05-09T06:02:56.361Z",
          updated_at: "2026-05-09T06:02:56.361Z",
          type: "reasoning",
          text: "我们被要求只回答一个字：好。直接回复即可。",
          summary: ["我们被要求只回答一个字：好。直接回复即可。"],
        },
        {
          id: "assistant-history-answer",
          thread_id: "thread-history-reasoning",
          turn_id: "turn-history-reasoning",
          sequence: 2,
          status: "completed",
          started_at: "2026-05-09T06:02:56.289Z",
          completed_at: "2026-05-09T06:02:56.361Z",
          updated_at: "2026-05-09T06:02:56.361Z",
          type: "agent_message",
          text: "好",
        },
      ],
    });

    const leadingTimelineProps = mockAgentThreadTimeline.mock.calls.find(
      ([props]) => props?.placement === "leading",
    )?.[0] as { items?: AgentThreadItem[] } | undefined;
    expect(leadingTimelineProps?.items).toEqual([
      expect.objectContaining({
        type: "reasoning",
        id: "reasoning-history-answer",
      }),
    ]);
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "好",
        thinkingContent: undefined,
      }),
    );
  });

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
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "已经修好消息顺序。",
        suppressProcessFlow: false,
        contentParts: [
          { type: "thinking", text: "先定位历史恢复路径。" },
          expect.objectContaining({ type: "tool_use" }),
          { type: "text", text: "已经修好消息顺序。" },
        ],
        thinkingContent: "先定位历史恢复路径。",
        toolCalls: [
          expect.objectContaining({
            id: "tool-restored-inline-process",
            status: "completed",
          }),
        ],
      }),
    );
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

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCalls: [
          expect.objectContaining({
            id: "tool-active-turn-1",
            status: "running",
          }),
        ],
        contentParts: [
          expect.objectContaining({
            type: "tool_use",
          }),
          {
            type: "text",
            text: "正在分析依赖关系。",
          },
        ],
      }),
    );
  });

  it("当前运行回合已有内联过程时，应让 StreamingRenderer 承担穿插式过程", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-active-interleaved-process",
        role: "assistant",
        content: "",
        timestamp: now,
        isThinking: true,
        thinkingContent: "The search plan is forming.",
        contentParts: [
          {
            type: "thinking",
            text: "The search plan is forming.",
          },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-active-search-1",
              name: "web_search",
              arguments: JSON.stringify({
                query: "international news May 9 2026 headlines",
              }),
              status: "running",
              startTime: now,
            },
          },
        ],
        toolCalls: [
          {
            id: "tool-active-search-1",
            name: "web_search",
            arguments: JSON.stringify({
              query: "international news May 9 2026 headlines",
            }),
            status: "running",
            startTime: now,
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-active-interleaved-process",
      turns: [
        {
          id: "turn-active-interleaved-process",
          thread_id: "thread-active-interleaved-process",
          prompt_text: "总结一下今天的国际新闻",
          status: "running",
          started_at: "2026-05-09T09:00:00Z",
          created_at: "2026-05-09T09:00:00Z",
          updated_at: "2026-05-09T09:00:02Z",
        },
      ],
      threadItems: [
        {
          id: "reasoning-active-interleaved-process",
          thread_id: "thread-active-interleaved-process",
          turn_id: "turn-active-interleaved-process",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-05-09T09:00:01Z",
          updated_at: "2026-05-09T09:00:01Z",
          type: "reasoning",
          text: "The",
        },
        {
          id: "search-active-interleaved-process",
          thread_id: "thread-active-interleaved-process",
          turn_id: "turn-active-interleaved-process",
          sequence: 2,
          status: "in_progress",
          started_at: "2026-05-09T09:00:02Z",
          updated_at: "2026-05-09T09:00:02Z",
          type: "web_search",
          action: "web_search",
          query: "international news May 9 2026 headlines",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingContent: "The search plan is forming.",
        contentParts: [
          { type: "thinking", text: "The search plan is forming." },
          expect.objectContaining({ type: "tool_use" }),
        ],
        toolCalls: [
          expect.objectContaining({
            id: "tool-active-search-1",
            status: "running",
          }),
        ],
      }),
    );
  });

  it("历史 web_search timeline 应统一投影为同一回复内的网页搜索过程", () => {
    const now = new Date("2026-06-02T09:00:10.000Z");
    const messages: Message[] = [
      {
        id: "msg-history-news-search",
        role: "assistant",
        content: "## 国际新闻简报\n\n- 多个来源已经交叉确认。",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-history-news-search",
      turns: [
        {
          id: "turn-history-news-search",
          thread_id: "thread-history-news-search",
          prompt_text: "帮我整理一下今天的国际新闻",
          status: "completed",
          started_at: "2026-06-02T09:00:00Z",
          completed_at: "2026-06-02T09:00:10Z",
          created_at: "2026-06-02T09:00:00Z",
          updated_at: "2026-06-02T09:00:10Z",
        },
      ],
      threadItems: [
        {
          id: "agent-message-history-news-intro",
          thread_id: "thread-history-news-search",
          turn_id: "turn-history-news-search",
          sequence: 1,
          status: "completed",
          started_at: "2026-06-02T09:00:01Z",
          completed_at: "2026-06-02T09:00:01Z",
          updated_at: "2026-06-02T09:00:01Z",
          type: "agent_message",
          text: "我先联网核实今天的国际新闻，再整理成简报。",
        },
        {
          id: "web-search-history-news-1",
          thread_id: "thread-history-news-search",
          turn_id: "turn-history-news-search",
          sequence: 2,
          status: "completed",
          started_at: "2026-06-02T09:00:02Z",
          completed_at: "2026-06-02T09:00:03Z",
          updated_at: "2026-06-02T09:00:03Z",
          type: "web_search",
          action: "search",
          query: "today international news",
          output: JSON.stringify({
            results: [
              {
                title: "Reuters World News",
                url: "https://www.reuters.com/world/",
              },
            ],
          }),
        },
        {
          id: "web-search-history-news-2",
          thread_id: "thread-history-news-search",
          turn_id: "turn-history-news-search",
          sequence: 3,
          status: "completed",
          started_at: "2026-06-02T09:00:04Z",
          completed_at: "2026-06-02T09:00:05Z",
          updated_at: "2026-06-02T09:00:05Z",
          type: "web_search",
          action: "openPage",
          query: "https://apnews.com/hub/world-news",
          output: "[AP World News](https://apnews.com/hub/world-news)",
        },
        {
          id: "agent-message-history-news-final",
          thread_id: "thread-history-news-search",
          turn_id: "turn-history-news-search",
          sequence: 4,
          status: "completed",
          started_at: "2026-06-02T09:00:06Z",
          completed_at: "2026-06-02T09:00:08Z",
          updated_at: "2026-06-02T09:00:08Z",
          type: "agent_message",
          text: "## 国际新闻简报\n\n- 多个来源已经交叉确认。",
        },
      ],
    });

    const call = mockStreamingRenderer.mock.calls.at(-1)?.[0] as
      | {
          rawContent?: string;
          contentParts?: Array<{
            type: string;
            text?: string;
            toolCall?: { name: string; arguments?: string; result?: unknown };
          }>;
        }
      | undefined;
    const contentParts = call?.contentParts || [];

    expect(contentParts.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "tool_use",
      "text",
    ]);
    expect(contentParts[0]?.text).toContain("我先联网核实今天的国际新闻");
    expect(contentParts[1]?.toolCall?.name).toBe("web_search");
    expect(contentParts[1]?.toolCall?.arguments).toContain(
      "today international news",
    );
    expect(contentParts[2]?.toolCall?.name).toBe("web_search");
    expect(contentParts[2]?.toolCall?.arguments).toContain("openPage");
    expect(contentParts[3]?.text).toContain("国际新闻简报");
    expect(contentParts[3]?.text).not.toContain("我先联网核实今天的国际新闻");
    expect(call?.rawContent).toContain("国际新闻简报");
    expect(call?.rawContent).not.toContain("我先联网核实今天的国际新闻");
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
  });

  it("内联高层工具过程不应吞掉不同工具名的底层执行轨迹", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-service-tool",
        role: "assistant",
        content: "文章已经保存到项目。",
        timestamp: now,
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "tool-service-1",
              name: "lime_run_service_skill",
              arguments: JSON.stringify({ skill_id: "x_article_export" }),
              status: "completed",
              result: { success: true, output: "saved" },
              startTime: now,
              endTime: now,
            },
          },
          {
            type: "text",
            text: "文章已经保存到项目。",
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-service-tool",
      turns: [
        {
          id: "turn-service-tool",
          thread_id: "thread-1",
          prompt_text: "继续保存文章",
          status: "completed",
          started_at: "2026-04-09T12:00:00Z",
          completed_at: "2026-04-09T12:00:05Z",
          created_at: "2026-04-09T12:00:00Z",
          updated_at: "2026-04-09T12:00:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-read-1",
          thread_id: "thread-1",
          turn_id: "turn-service-tool",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-09T12:00:01Z",
          completed_at: "2026-04-09T12:00:02Z",
          updated_at: "2026-04-09T12:00:02Z",
          type: "tool_call",
          tool_name: "Read",
          arguments: { file_path: "article.md" },
        },
        {
          id: "item-write-1",
          thread_id: "thread-1",
          turn_id: "turn-service-tool",
          sequence: 2,
          status: "completed",
          started_at: "2026-04-09T12:00:03Z",
          completed_at: "2026-04-09T12:00:04Z",
          updated_at: "2026-04-09T12:00:04Z",
          type: "tool_call",
          tool_name: "Write",
          arguments: { file_path: "article.md" },
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).not.toBeNull();
  });

  it("完成态 timeline 已有计划时应禁用正文计划块解析并保留内联思考顺序", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-inline-process",
        role: "assistant",
        content: "已经整理完执行思路。",
        timestamp: now,
        contentParts: [
          {
            type: "thinking",
            text: "先对照用户截图，再确认 thread item 是否有重复来源。",
          },
          {
            type: "text",
            text: "已经整理完执行思路。",
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-inline-process",
      turns: [
        {
          id: "turn-inline-process",
          thread_id: "thread-1",
          prompt_text: "继续收口消息流",
          status: "completed",
          started_at: "2026-03-29T12:00:00Z",
          completed_at: "2026-03-29T12:00:03Z",
          created_at: "2026-03-29T12:00:00Z",
          updated_at: "2026-03-29T12:00:03Z",
        },
      ],
      threadItems: [
        {
          id: "item-inline-process-plan",
          thread_id: "thread-1",
          turn_id: "turn-inline-process",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-29T12:00:01Z",
          completed_at: "2026-03-29T12:00:02Z",
          updated_at: "2026-03-29T12:00:02Z",
          type: "plan",
          text: "1. 合并 assistant turn\n2. 收拢补充 timeline",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        renderProposedPlanBlocks: false,
        thinkingContent: undefined,
        contentParts: [
          {
            type: "thinking",
            text: "先对照用户截图，再确认 thread item 是否有重复来源。",
          },
          { type: "text", text: "已经整理完执行思路。" },
        ],
      }),
    );
  });

  it("正文已承载过程流时，file_artifact 仍应作为尾部补充信息展示", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-inline-artifact",
        role: "assistant",
        content: "结果已经整理好了。",
        timestamp: now,
        contentParts: [
          {
            type: "thinking",
            text: "先整理结果，再把产物路径落盘。",
          },
          {
            type: "text",
            text: "结果已经整理好了。",
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-inline-artifact",
      turns: [
        {
          id: "turn-inline-artifact",
          thread_id: "thread-1",
          prompt_text: "继续整理产物",
          status: "completed",
          started_at: "2026-03-29T13:00:00Z",
          completed_at: "2026-03-29T13:00:03Z",
          created_at: "2026-03-29T13:00:00Z",
          updated_at: "2026-03-29T13:00:03Z",
        },
      ],
      threadItems: [
        {
          id: "item-inline-artifact",
          thread_id: "thread-1",
          turn_id: "turn-inline-artifact",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-29T13:00:01Z",
          completed_at: "2026-03-29T13:00:02Z",
          updated_at: "2026-03-29T13:00:02Z",
          type: "file_artifact",
          path: "notes/agent-summary.md",
          source: "artifact_snapshot",
          content: "# Summary",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).not.toBeNull();
  });

  it("不应把 .lime/artifacts 下的内部 artifact 文稿 JSON 渲染成尾部时间线", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-hidden-artifact-json",
        role: "assistant",
        content: "已生成内部文稿快照。",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-hidden-artifact-json",
      turns: [
        {
          id: "turn-hidden-artifact-json",
          thread_id: "thread-1",
          prompt_text: "生成内部 artifact 文稿",
          status: "completed",
          started_at: "2026-04-10T10:35:00Z",
          completed_at: "2026-04-10T10:35:03Z",
          created_at: "2026-04-10T10:35:00Z",
          updated_at: "2026-04-10T10:35:03Z",
        },
      ],
      threadItems: [
        {
          id: "item-hidden-artifact-json",
          thread_id: "thread-1",
          turn_id: "turn-hidden-artifact-json",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-10T10:35:01Z",
          completed_at: "2026-04-10T10:35:02Z",
          updated_at: "2026-04-10T10:35:02Z",
          type: "file_artifact",
          path: ".lime/artifacts/thread-1/report.artifact.json",
          source: "artifact_snapshot",
          content: '{"schemaVersion":"artifact_document.v1"}',
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
  });

  it("同一路径的 file_artifact 重复出现时，尾部时间线只应保留更完整的一条", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-duplicate-artifact",
        role: "assistant",
        content: "导出完成。",
        timestamp: now,
      },
    ];

    render(messages, {
      currentTurnId: "turn-duplicate-artifact",
      turns: [
        {
          id: "turn-duplicate-artifact",
          thread_id: "thread-1",
          prompt_text: "导出 index.md",
          status: "completed",
          started_at: "2026-04-10T09:57:00Z",
          completed_at: "2026-04-10T09:57:05Z",
          created_at: "2026-04-10T09:57:00Z",
          updated_at: "2026-04-10T09:57:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-artifact-duplicate-empty",
          thread_id: "thread-1",
          turn_id: "turn-duplicate-artifact",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-10T09:57:01Z",
          completed_at: "2026-04-10T09:57:02Z",
          updated_at: "2026-04-10T09:57:02Z",
          type: "file_artifact",
          path: "exports/x-article-export/google/index.md",
          source: "artifact_snapshot",
          content: "",
        },
        {
          id: "item-artifact-duplicate-rich",
          thread_id: "thread-1",
          turn_id: "turn-duplicate-artifact",
          sequence: 2,
          status: "completed",
          started_at: "2026-04-10T09:57:03Z",
          completed_at: "2026-04-10T09:57:04Z",
          updated_at: "2026-04-10T09:57:04Z",
          type: "file_artifact",
          path: "exports/x-article-export/google/index.md",
          source: "artifact_snapshot",
          content: "# 最新导出\n\n这里是完整预览。",
        },
      ],
    });

    const trailingTimelineProps = mockAgentThreadTimeline.mock.calls.find(
      ([props]) => props?.placement === "trailing",
    )?.[0] as { items?: Array<Record<string, unknown>> } | undefined;

    expect(trailingTimelineProps?.items).toHaveLength(1);
    expect(trailingTimelineProps?.items?.[0]).toEqual(
      expect.objectContaining({
        path: "exports/x-article-export/google/index.md",
        content: "# 最新导出\n\n这里是完整预览。",
      }),
    );
  });

  it("同一路径产物同时存在消息 artifacts 与尾部 file_artifact 时只显示时间线卡片", () => {
    const now = new Date();
    const artifactContent = "# 最新导出\n\n这里是完整预览。";
    const messages: Message[] = [
      {
        id: "msg-assistant-dedup-artifact-card",
        role: "assistant",
        content: "导出完成。",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-dedup-report",
            type: "document",
            title: "report.md",
            content: artifactContent,
            status: "complete",
            meta: {
              filePath: "exports\\x-article-export\\google\\report.md",
              filename: "report.md",
            },
            position: { start: 0, end: artifactContent.length },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-dedup-artifact-card",
      turns: [
        {
          id: "turn-dedup-artifact-card",
          thread_id: "thread-1",
          prompt_text: "导出 report.md",
          status: "completed",
          started_at: "2026-04-10T10:30:00Z",
          completed_at: "2026-04-10T10:30:05Z",
          created_at: "2026-04-10T10:30:00Z",
          updated_at: "2026-04-10T10:30:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-dedup-artifact-card",
          thread_id: "thread-1",
          turn_id: "turn-dedup-artifact-card",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-10T10:30:01Z",
          completed_at: "2026-04-10T10:30:02Z",
          updated_at: "2026-04-10T10:30:02Z",
          type: "file_artifact",
          path: "exports/x-article-export/google/report.md",
          source: "artifact_snapshot",
          content: artifactContent,
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="message-artifact-card"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-testid="timeline-file-artifact-card"]'),
    ).toHaveLength(1);
  });

  it("绝对路径消息产物与文件名时间线产物等价时不应重复显示普通产物卡", () => {
    const now = new Date();
    const artifactContent = "# 山冶工造 PRD";
    const messages: Message[] = [
      {
        id: "msg-assistant-dedup-absolute-artifact",
        role: "assistant",
        content: "PRD 已生成。",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-dedup-absolute-prd",
            type: "document",
            title: "山冶工造_PRD_V2_完整版.md",
            content: artifactContent,
            status: "complete",
            meta: {
              filePath:
                "C:\\Users\\Administrator\\AppData\\Local\\lime\\projects\\default\\山冶工造_PRD_V2_完整版.md",
              filename: "山冶工造_PRD_V2_完整版.md",
            },
            position: { start: 0, end: artifactContent.length },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-dedup-absolute-artifact",
      turns: [
        {
          id: "turn-dedup-absolute-artifact",
          thread_id: "thread-1",
          prompt_text: "生成 PRD",
          status: "completed",
          started_at: "2026-05-26T23:55:00Z",
          completed_at: "2026-05-26T23:55:05Z",
          created_at: "2026-05-26T23:55:00Z",
          updated_at: "2026-05-26T23:55:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-dedup-absolute-artifact",
          thread_id: "thread-1",
          turn_id: "turn-dedup-absolute-artifact",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-26T23:55:01Z",
          completed_at: "2026-05-26T23:55:02Z",
          updated_at: "2026-05-26T23:55:02Z",
          type: "file_artifact",
          path: "山冶工造_PRD_V2_完整版.md",
          source: "artifact_snapshot",
          content: artifactContent,
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="message-artifact-card"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-testid="timeline-file-artifact-card"]'),
    ).toHaveLength(1);
  });

  it("已有尾部 file_artifact 卡片时，不应再额外渲染消息级在画布中打开入口", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-artifact-card-only",
        role: "assistant",
        content: "导出完成。",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-artifact-card-only",
      turns: [
        {
          id: "turn-artifact-card-only",
          thread_id: "thread-1",
          prompt_text: "导出 index.md",
          status: "completed",
          started_at: "2026-04-10T10:20:00Z",
          completed_at: "2026-04-10T10:20:05Z",
          created_at: "2026-04-10T10:20:00Z",
          updated_at: "2026-04-10T10:20:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-artifact-card-only",
          thread_id: "thread-1",
          turn_id: "turn-artifact-card-only",
          sequence: 1,
          status: "completed",
          started_at: "2026-04-10T10:20:01Z",
          completed_at: "2026-04-10T10:20:02Z",
          updated_at: "2026-04-10T10:20:02Z",
          type: "file_artifact",
          path: "exports/x-article-export/google/index.md",
          source: "artifact_snapshot",
          content: "# 最新导出\n\n这里是完整预览。",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="message-canvas-shortcut"]'),
    ).toBeNull();
  });

  it("运行中的 turn_summary 应作为尾部过程状态展示，而不是顶到消息头部", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-running-summary",
        role: "assistant",
        content: "",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-running-summary",
      turns: [
        {
          id: "turn-running-summary",
          thread_id: "thread-1",
          prompt_text: "继续搜索 GitHub",
          status: "running",
          started_at: "2026-03-30T10:00:00Z",
          created_at: "2026-03-30T10:00:00Z",
          updated_at: "2026-03-30T10:00:05Z",
        },
      ],
      threadItems: [
        {
          id: "summary-running-1",
          thread_id: "thread-1",
          turn_id: "turn-running-summary",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-03-30T10:00:00Z",
          updated_at: "2026-03-30T10:00:05Z",
          type: "turn_summary",
          text: "正在打开 GitHub 搜索页",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).not.toBeNull();
  });

  it("正文已有 runtime status 时，运行中的 turn_summary 不应再重复进入时间线", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-runtime-status",
        role: "assistant",
        content: "",
        timestamp: now,
        isThinking: true,
        runtimeStatus: {
          phase: "routing",
          title: "正在打开 GitHub",
          detail: "已连上浏览器，准备进入搜索页。",
          checkpoints: ["浏览器已就绪"],
        },
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-runtime-status",
      turns: [
        {
          id: "turn-runtime-status",
          thread_id: "thread-1",
          prompt_text: "继续搜索 GitHub",
          status: "running",
          started_at: "2026-03-30T10:10:00Z",
          created_at: "2026-03-30T10:10:00Z",
          updated_at: "2026-03-30T10:10:05Z",
        },
      ],
      threadItems: [
        {
          id: "summary-runtime-status-1",
          thread_id: "thread-1",
          turn_id: "turn-runtime-status",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-03-30T10:10:00Z",
          updated_at: "2026-03-30T10:10:05Z",
          type: "turn_summary",
          text: "正在打开 GitHub 搜索页",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
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
    expect(container.textContent).toContain("Generating reply");
    expect(container.textContent).not.toContain("正在打开 GitHub");
  });

  it("首字前已有运行中 turn_summary 时仍应优先展示轻量等待占位", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-first-token-with-summary",
        role: "assistant",
        content: "",
        timestamp: now,
        isThinking: true,
        runtimeStatus: {
          phase: "preparing",
          title: "已接收请求，正在准备执行",
          detail:
            "系统正在初始化本轮执行环境并整理上下文，稍后会继续返回更详细进度。",
          checkpoints: ["请求已接收"],
        },
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-first-token-with-summary",
      turns: [
        {
          id: "turn-first-token-with-summary",
          thread_id: "thread-1",
          prompt_text: "你好",
          status: "running",
          started_at: "2026-03-30T10:20:00Z",
          created_at: "2026-03-30T10:20:00Z",
          updated_at: "2026-03-30T10:20:05Z",
        },
      ],
      threadItems: [
        {
          id: "summary-first-token-1",
          thread_id: "thread-1",
          turn_id: "turn-first-token-with-summary",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-03-30T10:20:00Z",
          updated_at: "2026-03-30T10:20:05Z",
          type: "turn_summary",
          text: "已接收请求，正在准备执行",
        },
      ],
    });

    expect(
      container.querySelector(
        '[data-testid="assistant-first-token-runtime-status"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Preparing reply");
    expect(container.textContent).not.toContain("已接收请求，正在准备执行");
  });

  it("本地工具批次的阶段结论不应再进入主消息流时间线", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-local-batch",
        role: "assistant",
        content: "",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-local-batch",
      turns: [
        {
          id: "turn-local-batch",
          thread_id: "thread-1",
          prompt_text: "分析本地仓库",
          status: "running",
          started_at: "2026-04-14T10:00:00Z",
          created_at: "2026-04-14T10:00:00Z",
          updated_at: "2026-04-14T10:00:10Z",
        },
      ],
      threadItems: [
        {
          id: "summary-local-batch-1",
          thread_id: "thread-1",
          turn_id: "turn-local-batch",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-04-14T10:00:00Z",
          updated_at: "2026-04-14T10:00:10Z",
          type: "turn_summary",
          text: "已完成一批本地分析\n已完成这一批本地仓库的文件读取，正在整理这一批结果并判断是否还需要继续取证。",
          metadata: {
            sourceType: "runtime_status",
            surface: "runtime_status",
            visibility: "diagnostics",
            persistence: "transient",
          },
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("已完成一批本地分析");
    expect(container.textContent).not.toContain("正在整理这一批结果");
  });

  it("已完成且已有真实过程项的 turn_summary 不应再单独占用消息头部或尾部", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-finished-summary",
        role: "assistant",
        content: "已经打开 GitHub 并完成搜索。",
        timestamp: now,
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-finished-summary",
      turns: [
        {
          id: "turn-finished-summary",
          thread_id: "thread-1",
          prompt_text: "帮我找 AI Agent 项目",
          status: "completed",
          started_at: "2026-03-30T11:00:00Z",
          completed_at: "2026-03-30T11:00:05Z",
          created_at: "2026-03-30T11:00:00Z",
          updated_at: "2026-03-30T11:00:05Z",
        },
      ],
      threadItems: [
        {
          id: "summary-finished-1",
          thread_id: "thread-1",
          turn_id: "turn-finished-summary",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-30T11:00:00Z",
          completed_at: "2026-03-30T11:00:01Z",
          updated_at: "2026-03-30T11:00:01Z",
          type: "turn_summary",
          text: "已打开 GitHub 搜索页面",
        },
        {
          id: "tool-finished-1",
          thread_id: "thread-1",
          turn_id: "turn-finished-summary",
          sequence: 2,
          status: "completed",
          started_at: "2026-03-30T11:00:02Z",
          completed_at: "2026-03-30T11:00:04Z",
          updated_at: "2026-03-30T11:00:04Z",
          type: "tool_call",
          tool_name: "browser_navigate",
          arguments: { url: "https://github.com/search?q=ai+agent" },
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-timeline:leading"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-timeline:trailing"]'),
    ).toBeNull();
    expect(mockAgentThreadTimeline).toHaveBeenCalledTimes(1);
  });

  it("应按回合分组展示同一轮用户与后续助手回复", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-1",
        role: "user",
        content: "先打开公众号后台",
        timestamp: new Date(now.getTime()),
      },
      {
        id: "msg-assistant-1",
        role: "assistant",
        content: "已打开登录页。",
        timestamp: new Date(now.getTime() + 1000),
      },
      {
        id: "msg-assistant-2",
        role: "assistant",
        content: "等待你完成扫码。",
        timestamp: new Date(now.getTime() + 2000),
      },
      {
        id: "msg-user-2",
        role: "user",
        content: "我已扫码，继续发布",
        timestamp: new Date(now.getTime() + 3000),
      },
      {
        id: "msg-assistant-3",
        role: "assistant",
        content: "已继续执行发布流程。",
        timestamp: new Date(now.getTime() + 4000),
      },
    ];

    const container = render(messages);
    const groups = Array.from(
      container.querySelectorAll('[data-testid="message-turn-group"]'),
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.textContent).toContain("先打开公众号后台");
    expect(groups[0]?.textContent).toContain("已打开登录页。");
    expect(groups[0]?.textContent).toContain("等待你完成扫码。");
    expect(groups[1]?.textContent).toContain("我已扫码，继续发布");
    expect(groups[1]?.textContent).toContain("已继续执行发布流程。");
    expect(
      container.querySelector('[data-testid="message-turn-group:1:header"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="message-turn-group:2:divider"]'),
    ).toBeNull();
  });

  it("用户消息不再渲染引用按钮，避免和 Codex 风格的 hover footer 冲突", () => {
    const onQuoteMessage = vi.fn();
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-quote",
        role: "user",
        content: "请引用这一段内容",
        timestamp: now,
      },
    ];

    const container = render(messages, { onQuoteMessage });
    const quoteButton = container.querySelector(
      'button[aria-label="Quote message"]',
    );

    expect(quoteButton).toBeNull();
    expect(onQuoteMessage).not.toHaveBeenCalled();
    expect(container.querySelector('button[aria-label="编辑消息"]')).toBeNull();
  });

  it("助手正文应将区块级引用/复制能力透传给 StreamingRenderer", () => {
    const onQuoteMessage = vi.fn();
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-block-actions",
        role: "assistant",
        content: "这是需要块级操作的输出",
        timestamp: now,
      },
    ];

    render(messages, { onQuoteMessage });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        showContentBlockActions: true,
        onQuoteContent: expect.any(Function),
      }),
    );
  });

  it("助手结果应支持保存为技能草稿", () => {
    const onSaveMessageAsSkill = vi.fn();
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-save-skill",
        role: "assistant",
        content:
          "这是一段足够长的结果说明，用来验证助手消息上会出现保存为技能的入口。",
        timestamp: now,
      },
    ];

    const container = render(messages, { onSaveMessageAsSkill });
    const saveButton = container.querySelector(
      'button[aria-label="Save as Skill"]',
    );

    expect(saveButton).not.toBeNull();

    act(() => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSaveMessageAsSkill).toHaveBeenCalledWith({
      messageId: "msg-assistant-save-skill",
      content:
        "这是一段足够长的结果说明，用来验证助手消息上会出现保存为技能的入口。",
    });
  });

  it("助手结果应支持保存到灵感库", () => {
    const onSaveMessageAsInspiration = vi.fn();
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-save-memory",
        role: "assistant",
        content:
          "这是一段足够长的结果说明，用来验证助手消息上会出现保存到灵感库的入口。",
        timestamp: now,
      },
    ];

    const container = render(messages, { onSaveMessageAsInspiration });
    const saveButton = container.querySelector(
      'button[aria-label="Save to inspiration"]',
    );

    expect(saveButton).not.toBeNull();

    act(() => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSaveMessageAsInspiration).toHaveBeenCalledWith({
      messageId: "msg-assistant-save-memory",
      content:
        "这是一段足够长的结果说明，用来验证助手消息上会出现保存到灵感库的入口。",
    });
  });

  it("助手结果应支持保存到项目资料", () => {
    const onSaveMessageAsKnowledge = vi.fn();
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-save-knowledge",
        role: "assistant",
        content:
          "这是一段足够长的项目事实说明，用来验证助手消息上会出现保存到项目资料的入口。",
        timestamp: now,
      },
    ];

    const container = render(messages, { onSaveMessageAsKnowledge });
    const saveButton = container.querySelector(
      'button[aria-label="Save to project knowledge"]',
    );
    const messageActions = container.querySelector(
      '[data-testid="message-actions"]',
    );

    expect(saveButton).not.toBeNull();
    expect(messageActions?.className).toContain("message-actions-persistent");

    act(() => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSaveMessageAsKnowledge).toHaveBeenCalledWith({
      messageId: "msg-assistant-save-knowledge",
      content:
        "这是一段足够长的项目事实说明，用来验证助手消息上会出现保存到项目资料的入口。",
    });
  });

  it("助手结果带产物时应优先把产物正文保存到项目资料", () => {
    const onSaveMessageAsKnowledge = vi.fn();
    const now = new Date();
    const artifactContent =
      "# 谢晶营销文案包 v1.0\n\n这是一份已经写入项目目录的 Markdown 产物，应该作为项目资料来源。";
    const messages: Message[] = [
      {
        id: "msg-assistant-save-artifact-knowledge",
        role: "assistant",
        content:
          "文件已生成，下面是摘要。这里不应该覆盖真正的 Markdown 产物正文。",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-knowledge-output",
            type: "document",
            title: "谢晶_营销文案包_KnowledgeV2_E2E.md",
            content: artifactContent,
            status: "complete",
            meta: {
              filename: "谢晶_营销文案包_KnowledgeV2_E2E.md",
            },
            position: { start: 0, end: artifactContent.length },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages, { onSaveMessageAsKnowledge });
    expect(container.textContent).toContain("Document artifact");
    expect(container.textContent).toContain("Can save to project knowledge");
    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Save this document"),
    );

    expect(saveButton).not.toBeNull();

    act(() => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSaveMessageAsKnowledge).toHaveBeenCalledWith({
      messageId: "msg-assistant-save-artifact-knowledge",
      content: artifactContent,
      sourceName: "谢晶_营销文案包_KnowledgeV2_E2E.md",
      description: "谢晶_营销文案包_KnowledgeV2_E2E.md",
    });
  });

  it("聊天主列与助手消息气泡应保持更宽的桌面阅读宽度", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-wide-reading",
        role: "assistant",
        content: "这里是一段较长的结构化输出，用于验证桌面阅读宽度。",
        timestamp: now,
      },
    ];

    const container = render(messages);
    const messageColumn = container.querySelector(
      '[data-testid="message-list-column"]',
    );
    const assistantBubble = container.querySelector('[aria-label="Lime"]');

    expect(messageColumn?.className).toContain("max-w-[1040px]");
    expect(assistantBubble).not.toBeNull();
    expect(
      window.getComputedStyle(assistantBubble as Element).maxWidth,
    ).toContain("1040px");
  });

  it("助手消息不应再渲染旧的继续处理标签或品牌头像", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-seed",
        role: "user",
        content: "继续",
        timestamp: new Date(now.getTime()),
      },
      {
        id: "msg-assistant-first",
        role: "assistant",
        content: "第一条回复",
        timestamp: new Date(now.getTime() + 1000),
      },
      {
        id: "msg-assistant-second",
        role: "assistant",
        content: "第二条回复",
        timestamp: new Date(now.getTime() + 2000),
      },
    ];

    const container = render(messages);

    expect(container.textContent).not.toContain("阶段 00");
    expect(container.textContent).not.toContain("继续处理");
    expect(container.querySelector('img[alt="Lime"]')).toBeNull();
  });

  it("用户图片消息不应渲染内部图片占位文本", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-user-image",
        role: "user",
        content: "[Image #1]",
        images: [
          {
            mediaType: "image/png",
            data: "aGVsbG8=",
          },
        ],
        timestamp: now,
      },
    ];

    const container = render(messages);

    expect(
      container.querySelector('[data-testid="markdown-renderer"]'),
    ).toBeNull();
    const image = container.querySelector('img[alt="attachment"]');
    expect(image).toBeTruthy();
    expect(container.textContent).not.toContain("[Image #1]");
  });

  it("助手内部图片标签应在主消息里隐藏", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-image",
        role: "assistant",
        content: "[Image #1]",
        timestamp: now,
      },
    ];

    const container = render(messages);

    expect(
      container.querySelector('[data-testid="streaming-renderer"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("[Image #1]");
  });

  it("助手消息包含 artifacts 时应渲染产物卡片并响应点击", () => {
    const now = new Date();
    const onArtifactClick = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-artifact",
        role: "assistant",
        content: "已生成文档",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-demo",
            type: "document",
            title: "demo.md",
            content: "# Demo",
            status: "complete",
            meta: {
              filePath: "docs/demo.md",
              filename: "demo.md",
            },
            position: { start: 0, end: 0 },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <MessageList messages={messages} onArtifactClick={onArtifactClick} />,
      );
    });

    mountedRoots.push({ container, root });

    const artifactShell = container.querySelector(
      '[data-testid="message-artifact-card"]',
    );
    expect(artifactShell?.className).toContain("border-slate-200");
    expect(artifactShell?.className).not.toContain("bg-sky-50");
    const artifactCard = container.querySelector("button");
    expect(artifactCard?.textContent).toContain("demo.md");
    expect(artifactCard?.textContent).toContain("docs/demo.md");
    expect(container.textContent).toContain("Document artifact");

    act(() => {
      artifactCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onArtifactClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "artifact-demo",
        title: "demo.md",
      }),
    );
  });

  it("文件变更汇总已覆盖同一路径时不应再渲染重复 artifact 卡片", () => {
    const now = new Date();
    const turnId = "turn-file-change-dedup";
    const messages: Message[] = [
      {
        id: "msg-assistant-file-change-dedup",
        role: "assistant",
        content: "CODE_RUNTIME_DONE",
        timestamp: now,
        contentParts: [
          { type: "text", text: "CODE_RUNTIME_DONE" },
          {
            type: "file_changes_batch",
            aggregate: {
              files: [
                {
                  path: "src/greeting.ts",
                  kind: "update",
                  linesAdded: 1,
                  linesRemoved: 1,
                  diff: [],
                  truncated: false,
                  source: "backend",
                  status: "completed",
                },
              ],
              totalAdded: 1,
              totalRemoved: 1,
              fileCount: 1,
            },
          },
        ],
        artifacts: [
          {
            id: "artifact-greeting",
            type: "code",
            title: "greeting.ts",
            content:
              "export function greeting() { return 'Hello Lime Runtime'; }",
            status: "complete",
            meta: {
              filePath:
                "/Users/coso/Library/Application Support/lime/projects/demo/src/greeting.ts",
              filename: "greeting.ts",
            },
            position: { start: 0, end: 64 },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages, {
      currentTurnId: turnId,
      turns: [
        {
          id: turnId,
          thread_id: "thread-1",
          prompt_text: "修复 greeting.ts",
          status: "completed",
          started_at: "2026-06-02T10:01:00.000Z",
          completed_at: "2026-06-02T10:01:05.000Z",
          created_at: "2026-06-02T10:01:00.000Z",
          updated_at: "2026-06-02T10:01:05.000Z",
        },
      ],
      threadItems: [
        {
          id: "artifact-file-change-document",
          thread_id: "thread-1",
          turn_id: turnId,
          sequence: 3,
          type: "file_artifact",
          path: ".lime/qc/code-runtime-fixture/src/greeting.ts",
          source: "artifact_snapshot",
          content:
            "export function greeting() { return 'Hello Lime Runtime'; }",
          status: "completed",
          started_at: "2026-06-02T10:01:01.000Z",
          completed_at: "2026-06-02T10:01:02.000Z",
          updated_at: "2026-06-02T10:01:02.000Z",
        },
        {
          id: "artifact-file-change-absolute",
          thread_id: "thread-1",
          turn_id: turnId,
          sequence: 4,
          type: "file_artifact",
          path: "/Users/coso/Library/Application Support/lime/projects/code-runtime-fixture/src/greeting.ts",
          source: "tool_result",
          content: "点击在画布中打开完整内容。",
          status: "completed",
          started_at: "2026-06-02T10:01:03.000Z",
          completed_at: "2026-06-02T10:01:04.000Z",
          updated_at: "2026-06-02T10:01:04.000Z",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="message-artifact-card"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="timeline-file-artifact-card"]'),
    ).toBeNull();
    expect(
      container
        .querySelector('[data-testid="streaming-renderer"]')
        ?.getAttribute("data-content-parts"),
    ).toBe("2");
  });

  it("内容发布主链产物卡片应优先显示预览/上传/发布语义标题", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-content-post-artifact",
        role: "assistant",
        content: "已整理渠道预览稿",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-content-post-preview",
            type: "document",
            title: "20260408-preview.md",
            content: "# 春日咖啡活动",
            status: "complete",
            meta: {
              filePath: "content-posts/20260408-preview.md",
              filename: "20260408-preview.md",
              contentPostIntent: "preview",
              contentPostLabel: "渠道预览稿",
              contentPostPlatformLabel: "小红书",
            },
            position: { start: 0, end: 0 },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages);

    expect(container.textContent).toContain("渠道预览稿");
    expect(container.textContent).toContain(
      "content-posts/20260408-preview.md",
    );
    const titleNode = Array.from(container.querySelectorAll("div")).find(
      (node) => node.textContent === "渠道预览稿",
    );
    expect(titleNode?.textContent).toBe("渠道预览稿");
  });

  it("不应把 .lime/tasks 下的内部任务快照 JSON 渲染成用户可见产物卡片", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-hidden-task-json",
        role: "assistant",
        content: "图片任务进行中",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-hidden-task-json",
            type: "code",
            title: "task-image-1.json",
            content: '{"status":"running"}',
            status: "complete",
            meta: {
              filePath: ".lime/tasks/image_generate/task-image-1.json",
              filename: "task-image-1.json",
            },
            position: { start: 0, end: 0 },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages);
    expect(container.textContent).toContain("图片任务进行中");
    expect(container.textContent).not.toContain("task-image-1.json");
  });

  it("不应把 .lime/artifacts 下的内部 artifact 文稿 JSON 渲染成用户可见产物卡片", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-hidden-conversation-artifact-json",
        role: "assistant",
        content: "内部文稿已同步。",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-hidden-conversation-artifact-json",
            type: "document",
            title: "report.artifact.json",
            content: '{"schemaVersion":"artifact_document.v1"}',
            status: "complete",
            meta: {
              filePath: ".lime/artifacts/thread-1/report.artifact.json",
              filename: "report.artifact.json",
            },
            position: { start: 0, end: 0 },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages);
    expect(container.textContent).toContain("内部文稿已同步。");
    expect(container.textContent).not.toContain("report.artifact.json");
  });

  it("应先渲染思考与过程，再渲染正文，最后再落产物", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-order",
        role: "assistant",
        content: "已生成发布文案",
        timestamp: now,
        artifacts: [
          {
            id: "artifact-order",
            type: "document",
            title: "publish.md",
            content: "# Publish",
            status: "complete",
            meta: {
              filePath: "articles/publish.md",
              filename: "publish.md",
            },
            position: { start: 0, end: 0 },
            createdAt: now.getTime(),
            updatedAt: now.getTime(),
          },
        ],
      },
    ];

    const container = render(messages, {
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-1",
          prompt_text: "发布文章",
          status: "completed",
          started_at: "2026-03-15T09:00:00Z",
          completed_at: "2026-03-15T09:00:05Z",
          created_at: "2026-03-15T09:00:00Z",
          updated_at: "2026-03-15T09:00:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-15T09:00:01Z",
          completed_at: "2026-03-15T09:00:02Z",
          updated_at: "2026-03-15T09:00:02Z",
          type: "plan",
          text: "1. 打开页面\n2. 发布文章",
        },
      ],
    });

    const streaming = container.querySelector(
      '[data-testid="streaming-renderer"]',
    );
    const leadingTimeline = container.querySelector(
      '[data-testid="agent-thread-timeline:leading"]',
    );
    const artifactButton = Array.from(
      container.querySelectorAll("button"),
    ).find((node) => node.textContent?.includes("publish.md"));

    expect(streaming).not.toBeNull();
    expect(artifactButton).toBeDefined();
    expect(leadingTimeline).not.toBeNull();
    const streamingNode = streaming as Node;
    const timelineNode = leadingTimeline as Node;
    const artifactButtonNode = artifactButton as Node;
    expect(
      timelineNode.compareDocumentPosition(streamingNode) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      streamingNode.compareDocumentPosition(artifactButtonNode) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("助手消息上的 actionRequests 应继续留在正文链路，不再重复透传给 timeline", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-action",
        role: "assistant",
        content: "请先确认文章标题。",
        timestamp: now,
        actionRequests: [
          {
            requestId: "req-ask-title",
            actionType: "ask_user",
            prompt: "请先确认文章标题",
            questions: [{ question: "这篇文章的最终标题是什么？" }],
          },
        ],
      },
    ];

    render(messages, {
      turns: [
        {
          id: "turn-action",
          thread_id: "thread-1",
          prompt_text: "确认文章标题",
          status: "aborted",
          started_at: "2026-03-15T09:00:00Z",
          completed_at: "2026-03-15T09:00:05Z",
          created_at: "2026-03-15T09:00:00Z",
          updated_at: "2026-03-15T09:00:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-action-1",
          thread_id: "thread-1",
          turn_id: "turn-action",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-15T09:00:01Z",
          completed_at: "2026-03-15T09:00:02Z",
          updated_at: "2026-03-15T09:00:02Z",
          type: "tool_call",
          tool_name: "browser_navigate",
          arguments: { url: "https://mp.weixin.qq.com" },
        },
      ],
    });

    const timelineProps = mockAgentThreadTimeline.mock.calls.map(
      ([props]) =>
        props as {
          actionRequests?: Array<Record<string, unknown>>;
          placement?: string;
        },
    );

    expect(
      timelineProps.every((props) => props.actionRequests === undefined),
    ).toBe(true);
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        renderProposedPlanBlocks: true,
      }),
    );
  });

  it("应向执行轨迹透传已保存站点内容打开回调", () => {
    const onOpenSavedSiteContent = vi.fn();
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-site-timeline",
        role: "assistant",
        content: "站点结果已沉淀。",
        timestamp: now,
      },
    ];

    render(messages, {
      onOpenSavedSiteContent,
      turns: [
        {
          id: "turn-site-open",
          thread_id: "thread-1",
          prompt_text: "采集站点内容",
          status: "completed",
          started_at: "2026-03-25T09:00:00Z",
          completed_at: "2026-03-25T09:00:05Z",
          created_at: "2026-03-25T09:00:00Z",
          updated_at: "2026-03-25T09:00:05Z",
        },
      ],
      threadItems: [
        {
          id: "item-site-open-1",
          thread_id: "thread-1",
          turn_id: "turn-site-open",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-25T09:00:01Z",
          completed_at: "2026-03-25T09:00:02Z",
          updated_at: "2026-03-25T09:00:02Z",
          type: "tool_call",
          tool_name: "lime_site_run",
          arguments: { adapter_name: "github/search" },
        },
      ],
    });

    expect(mockAgentThreadTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ onOpenSavedSiteContent }),
    );
  });

  it("当前 turn 已映射到较早助手消息时，不应被最新助手消息抢占", () => {
    const messages: Message[] = [
      {
        id: "msg-user-earlier",
        role: "user",
        content: "先做第一轮分析",
        timestamp: new Date("2026-03-15T09:00:00Z"),
      },
      {
        id: "msg-assistant-earlier",
        role: "assistant",
        content: "先给出一段中间反馈。",
        timestamp: new Date("2026-03-15T09:00:05Z"),
      },
      {
        id: "msg-user-latest",
        role: "user",
        content: "继续下一轮",
        timestamp: new Date("2026-03-15T09:00:10Z"),
      },
      {
        id: "msg-assistant-latest",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-15T09:00:20Z"),
        runtimeStatus: {
          phase: "preparing",
          title: "排队中",
          detail: "等待上一轮完成后继续。",
          checkpoints: [],
        },
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-latest",
      turns: [
        {
          id: "turn-latest",
          thread_id: "thread-1",
          prompt_text: "继续执行",
          status: "running",
          started_at: "2026-03-15T09:00:00Z",
          completed_at: "2026-03-15T09:00:06Z",
          created_at: "2026-03-15T09:00:00Z",
          updated_at: "2026-03-15T09:00:06Z",
        },
      ],
      threadItems: [
        {
          id: "item-latest",
          thread_id: "thread-1",
          turn_id: "turn-latest",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-15T09:00:01Z",
          completed_at: "2026-03-15T09:00:02Z",
          updated_at: "2026-03-15T09:00:02Z",
          type: "plan",
          text: "继续执行当前任务",
        },
      ],
    });

    const streamingNodes = Array.from(
      container.querySelectorAll('[data-testid="streaming-renderer"]'),
    );
    const timelineNodes = Array.from(
      container.querySelectorAll(
        '[data-testid="agent-thread-timeline:leading"]',
      ),
    );

    expect(streamingNodes).toHaveLength(1);
    expect(timelineNodes).toHaveLength(1);
    expect(
      (timelineNodes[0] as Node).compareDocumentPosition(
        streamingNodes[0] as Node,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="assistant-message-meta-footer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-thread-reliability-panel"]'),
    ).toBeNull();
  });

  it("应不再在消息区渲染 reliability panel，避免占用对话列表空间", () => {
    const messages: Message[] = [
      {
        id: "msg-assistant-earlier",
        role: "assistant",
        content: "较早的中间反馈。",
        timestamp: new Date("2026-03-15T09:00:05Z"),
      },
      {
        id: "msg-assistant-latest",
        role: "assistant",
        content: "最新回合的输出。",
        timestamp: new Date("2026-03-15T09:00:20Z"),
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-latest",
      turns: [
        {
          id: "turn-latest",
          thread_id: "thread-1",
          prompt_text: "继续执行发布",
          status: "running",
          started_at: "2026-03-15T09:00:00Z",
          created_at: "2026-03-15T09:00:00Z",
          updated_at: "2026-03-15T09:00:06Z",
        },
      ],
      threadItems: [
        {
          id: "item-latest",
          thread_id: "thread-1",
          turn_id: "turn-latest",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-15T09:00:01Z",
          completed_at: "2026-03-15T09:00:02Z",
          updated_at: "2026-03-15T09:00:02Z",
          type: "plan",
          text: "继续执行当前任务",
        },
      ],
      pendingActions: [
        {
          requestId: "req-1",
          actionType: "ask_user",
          prompt: "请确认是否继续发布",
          status: "pending",
        },
      ],
    });

    const timelineNodes = Array.from(
      container.querySelectorAll('[data-testid^="agent-thread-timeline:"]'),
    );

    expect(
      container.querySelector('[data-testid="agent-thread-reliability-panel"]'),
    ).toBeNull();
    expect(timelineNodes).toHaveLength(1);
  });

  it("继续回合的执行过程应挂在第二次对话组而不是第一次失败组", () => {
    const messages: Message[] = [
      {
        id: "msg-user-first",
        role: "user",
        content: "帮我做一份 PPT 大纲",
        timestamp: new Date("2026-05-11T00:20:46Z"),
      },
      {
        id: "msg-assistant-first",
        role: "assistant",
        content: "执行失败：402 Payment Required",
        timestamp: new Date("2026-05-11T00:20:47Z"),
        runtimeTurnId: "turn-first",
      },
      {
        id: "msg-user-continue",
        role: "user",
        content: "继续",
        timestamp: new Date("2026-05-11T00:26:18Z"),
      },
      {
        id: "msg-assistant-continue",
        role: "assistant",
        content: "好的",
        timestamp: new Date("2026-05-11T00:26:19Z"),
        runtimeTurnId: "turn-continue",
      },
    ];

    const container = render(messages, {
      currentTurnId: "turn-continue",
      turns: [
        {
          id: "turn-first",
          thread_id: "thread-1",
          prompt_text: "帮我做一份 PPT 大纲",
          status: "failed",
          started_at: "2026-05-11T00:20:46Z",
          completed_at: "2026-05-11T00:20:47Z",
          created_at: "2026-05-11T00:20:46Z",
          updated_at: "2026-05-11T00:20:47Z",
        },
        {
          id: "turn-continue",
          thread_id: "thread-1",
          prompt_text: "继续",
          status: "completed",
          started_at: "2026-05-11T00:26:18Z",
          completed_at: "2026-05-11T00:26:24Z",
          created_at: "2026-05-11T00:26:18Z",
          updated_at: "2026-05-11T00:26:24Z",
        },
      ],
      threadItems: [
        {
          id: "error-first",
          thread_id: "thread-1",
          turn_id: "turn-first",
          sequence: 1,
          status: "failed",
          started_at: "2026-05-11T00:20:47Z",
          updated_at: "2026-05-11T00:20:47Z",
          type: "error",
          message: "Agent provider execution failed: 402 Payment Required",
        },
        {
          id: "process-continue",
          thread_id: "thread-1",
          turn_id: "turn-continue",
          sequence: 1,
          status: "completed",
          started_at: "2026-05-11T00:26:19Z",
          completed_at: "2026-05-11T00:26:24Z",
          updated_at: "2026-05-11T00:26:24Z",
          type: "plan",
          text: "等待用户补充 PPT 信息",
        },
      ],
    });

    const firstAssistant = Array.from(
      container.querySelectorAll('[data-testid="streaming-renderer"]'),
    ).find((node) => node.textContent?.includes("402 Payment Required"));
    const continueAssistant = Array.from(
      container.querySelectorAll('[data-testid="streaming-renderer"]'),
    ).find((node) => node.textContent?.includes("好的"));
    const continueTimeline = container.querySelector(
      '[data-testid^="agent-thread-timeline:"][data-turn-id="turn-continue"]',
    );

    expect(firstAssistant).toBeTruthy();
    expect(continueAssistant).toBeTruthy();
    expect(continueTimeline).toBeTruthy();
    expect(
      (continueTimeline as Node).compareDocumentPosition(
        continueAssistant as Node,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      (continueTimeline as Node).compareDocumentPosition(
        firstAssistant as Node,
      ) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it("失败回复已有时间线错误卡时不应在正文和底部重复长错误", async () => {
    const detail =
      "当前模型通道返回了计费或额度类错误，请检查该 Provider/模型通道的计费、配额或授权状态，或切换到其他可用模型后重试。";
    const messages: Message[] = [
      {
        id: "msg-user-provider-failed",
        role: "user",
        content: "你好",
        timestamp: new Date("2026-05-11T00:20:46Z"),
      },
      {
        id: "msg-assistant-provider-failed",
        role: "assistant",
        content: `执行失败：${detail}`,
        timestamp: new Date("2026-05-11T00:20:55Z"),
        runtimeTurnId: "turn-provider-failed",
        runtimeStatus: {
          phase: "failed",
          title: "当前处理失败",
          detail,
          checkpoints: [],
        },
      },
    ];

    const container = await renderZh(messages, {
      currentTurnId: "turn-provider-failed",
      turns: [
        {
          id: "turn-provider-failed",
          thread_id: "thread-1",
          prompt_text: "你好",
          status: "failed",
          error_message: detail,
          started_at: "2026-05-11T00:20:46Z",
          completed_at: "2026-05-11T00:20:55Z",
          created_at: "2026-05-11T00:20:46Z",
          updated_at: "2026-05-11T00:20:55Z",
        },
      ],
      threadItems: [
        {
          id: "error-provider-failed",
          thread_id: "thread-1",
          turn_id: "turn-provider-failed",
          sequence: 1,
          status: "failed",
          started_at: "2026-05-11T00:20:55Z",
          updated_at: "2026-05-11T00:20:55Z",
          type: "error",
          message: detail,
        },
      ],
    });

    const assistantRenderer = container.querySelector(
      '[data-testid="streaming-renderer"]',
    );
    const statusLine = container.querySelector(
      '[data-testid="inputbar-runtime-status-line"]',
    );

    expect(assistantRenderer?.textContent).toBe("<empty-assistant>");
    expect(statusLine?.textContent).toContain("失败");
    expect(statusLine?.textContent).toContain("00:09");
    expect(statusLine?.textContent).not.toContain(detail);
  });
});
