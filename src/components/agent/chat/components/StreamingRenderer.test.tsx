import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingRenderer } from "./StreamingRenderer";
import type {
  AgentToolCallState,
  AgentToolResultMetadata,
} from "@/lib/api/agentProtocol";
import type {
  AgentRuntimeStatus,
  ActionRequired,
  ContentPart,
  WriteArtifactContext,
} from "../types";

const parseAIResponseMock = vi.fn();
const listAgentRuntimeFileCheckpointsMock = vi.fn();
const restoreAgentRuntimeFileCheckpointMock = vi.fn();
const mockMarkdownRenderer = vi.fn(
  ({
    content,
    showBlockActions,
    onQuoteContent,
    renderMode,
  }: {
    content: string;
    showBlockActions?: boolean;
    onQuoteContent?: (content: string) => void;
    renderMode?: "standard" | "light";
  }) => (
    <div
      data-testid="markdown-renderer"
      data-show-block-actions={showBlockActions ? "yes" : "no"}
      data-has-on-quote-content={onQuoteContent ? "yes" : "no"}
      data-render-mode={renderMode || "standard"}
    >
      {content}
    </div>
  ),
);

vi.mock("@/components/workspace/a2ui/parser", () => ({
  parseAIResponse: (...args: unknown[]) => parseAIResponseMock(...args),
}));

vi.mock("@/components/workspace/a2ui/taskCardPresets", () => ({
  CHAT_A2UI_TASK_CARD_PRESET: {},
  TIMELINE_A2UI_TASK_CARD_PRESET: {},
}));

vi.mock("@/lib/artifact/hooks/useDebouncedValue", () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

vi.mock("@/lib/api/agentRuntime", () => ({
  listAgentRuntimeFileCheckpoints: (...args: unknown[]) =>
    listAgentRuntimeFileCheckpointsMock(...args),
  restoreAgentRuntimeFileCheckpoint: (...args: unknown[]) =>
    restoreAgentRuntimeFileCheckpointMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === "agentChat.fileChangesSummary.summary") {
        return `已编辑 ${values?.count ?? 0} 个文件`;
      }
      if (key === "agentChat.fileChangesSummary.review") {
        return "审核";
      }
      if (key === "agentChat.fileChangesSummary.undo") {
        return "撤销";
      }
      if (key === "agentChat.fileChangesSummary.undoUnavailable") {
        return "没有可用的文件快照";
      }
      if (key === "agentChat.fileChangesSummary.undoConfirmTitle") {
        return "撤销这些文件改动？";
      }
      if (key === "agentChat.fileChangesSummary.undoConfirmDescription") {
        return `将从运行时文件快照恢复 ${values?.count ?? 0} 个文件，并保留当前文件备份。`;
      }
      if (key === "agentChat.fileChangesSummary.undoConfirmAction") {
        return "确认撤销";
      }
      if (key === "agentChat.fileChangesSummary.undoCancel") {
        return "取消";
      }
      if (key === "agentChat.fileChangesSummary.undoRestoring") {
        return "正在撤销文件改动…";
      }
      if (key === "agentChat.fileChangesSummary.undoSuccess") {
        return `已撤销 ${values?.count ?? 0} 个文件改动`;
      }
      if (key === "agentChat.fileChangesSummary.undoFailed") {
        return `撤销失败：${values?.error ?? ""}`;
      }
      if (key.startsWith("agentChat.fileChangesSummary.undoError.")) {
        return key;
      }
      if (key === "agentChat.fileChangesSummary.expandFiles") {
        return `展开其余 ${values?.count ?? 0} 个文件`;
      }
      if (key === "agentChat.fileChangesSummary.collapseFiles") {
        return "收起文件";
      }
      if (key === "agentChat.fileChangesSummary.writing") {
        return "正在写入文件…";
      }
      if (key === "agentChat.fileChangesSummary.reviewCanvasTitle") {
        return `${values?.path ?? ""} 的变更审阅`;
      }
      if (key === "agentChat.fileChangesSummary.reviewCanvasStatus") {
        return `状态：${values?.status ?? ""}`;
      }
      if (key === "agentChat.fileChangesSummary.reviewStatus.modified") {
        return "修改";
      }
      if (key === "agentChat.fileChangesSummary.reviewStatus.added") {
        return "新增";
      }
      if (key === "agentChat.fileChangesSummary.reviewStatus.deleted") {
        return "删除";
      }
      if (key === "agentChat.fileChangesSummary.reviewStatus.unknown") {
        return "变更";
      }
      if (key === "agentChat.fileChangesSummary.reviewAdditions") {
        return `+${values?.count ?? 0} 行`;
      }
      if (key === "agentChat.fileChangesSummary.reviewDeletions") {
        return `-${values?.count ?? 0} 行`;
      }
      if (key === "agentChat.fileChangesSummary.reviewHunks") {
        return `${values?.count ?? 0} 处变更`;
      }
      return key;
    },
  }),
}));

vi.mock("./MarkdownRenderer", () => ({
  MarkdownRenderer: (props: {
    content: string;
    showBlockActions?: boolean;
    onQuoteContent?: (content: string) => void;
    renderMode?: "standard" | "light";
  }) => mockMarkdownRenderer(props),
}));

vi.mock("./A2UITaskCard", () => ({
  A2UITaskCard: ({
    compact,
    className,
    preview,
    onSubmit,
  }: {
    compact?: boolean;
    className?: string;
    preview?: boolean;
    onSubmit?: unknown;
  }) => (
    <div
      data-testid="a2ui-card"
      data-compact={String(compact)}
      data-preview={String(preview)}
      data-has-on-submit={onSubmit ? "yes" : "no"}
      className={className}
    />
  ),
  A2UITaskLoadingCard: ({
    compact,
    className,
  }: {
    compact?: boolean;
    className?: string;
  }) => (
    <div
      data-testid="a2ui-loading-card"
      data-compact={String(compact)}
      className={className}
    />
  ),
}));

vi.mock("./DecisionPanel", () => ({
  DecisionPanel: () => <div data-testid="decision-panel" />,
}));

vi.mock("./AgentPlanBlock", () => ({
  AgentPlanBlock: ({
    content,
    isComplete,
  }: {
    content: string;
    isComplete?: boolean;
  }) => (
    <div data-testid="agent-plan-block">
      {isComplete === false ? "进行中:" : "完成:"}
      {content}
    </div>
  ),
}));

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  parseAIResponseMock.mockImplementation((content: string) => ({
    parts: content.trim() ? [{ type: "text", content: content.trim() }] : [],
    hasA2UI: false,
    hasWriteFile: false,
    hasPending: false,
  }));
});

afterEach(() => {
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
});

function renderHarness(props: {
  content: string;
  isStreaming?: boolean;
  thinkingContent?: string;
  contentParts?: ContentPart[];
  renderA2UIInline?: boolean;
  runtimeStatus?: AgentRuntimeStatus;
  showRuntimeStatusInline?: boolean;
  toolCalls?: AgentToolCallState[];
  actionRequests?: ActionRequired[];
  promoteActionRequestsToA2UI?: boolean;
  onPermissionResponse?: (payload: unknown) => void;
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: WriteArtifactContext,
  ) => void;
  onFileClick?: (fileName: string, content: string) => void;
  fileChangesUndoSessionId?: string | null;
  onOpenSavedSiteContent?: (target: {
    projectId: string;
    contentId: string;
    title?: string;
  }) => void;
  suppressProcessFlow?: boolean;
  showContentBlockActions?: boolean;
  onQuoteContent?: (content: string) => void;
  markdownRenderMode?: "standard" | "light";
  readOnlyA2UI?: boolean;
  readOnlyActionRequests?: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const rerender = (nextProps: typeof props) => {
    act(() => {
      root.render(<StreamingRenderer {...nextProps} />);
    });
  };

  rerender(props);
  mountedRoots.push({ container, root });

  return { container, rerender };
}

function createSavedSiteMetadata(): AgentToolResultMetadata {
  return {
    tool_family: "site",
    saved_project_id: "project-1",
    saved_content: {
      content_id: "content-1",
      project_id: "project-1",
      title: "Google Cloud Tech 文章导出",
      markdown_relative_path: "saved/x-article-export/article.md",
      images_relative_dir: "saved/x-article-export/images",
      image_count: 2,
    },
  };
}

describe("StreamingRenderer", () => {
  it("交错内容应隐藏紧邻工具调用的调度自述", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "ToolSearch 只返回了元数据，让我直接调用 WebSearch 进行多组检索。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-narration-hidden",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "latest openai api" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-04-01T10:00:00.000Z"),
            endTime: new Date("2026-04-01T10:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "已经整理出 3 个可信来源。",
        },
      ],
    });

    expect(container.textContent).not.toContain("只返回了元数据");
    expect(
      container.querySelector('[data-testid="streaming-process-group"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("已经整理出 3 个可信来源。");
  });

  it("交错检索过程不应把工具前后的短过渡片段渲染成正文", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我",
        },
        {
          type: "thinking",
          text: "Searching for current sources.",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-source-search-renderer",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "current sources" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "先联网核实可用来源。",
        },
        {
          type: "text",
          text: "调研简报：\n\n- 已确认主要来源。",
        },
      ],
      isStreaming: false,
    });

    expect(
      container.querySelector('[data-testid="streaming-process-group"]'),
    ).toBeTruthy();
    expect(container.textContent).not.toContain(
      "Searching for current sources",
    );
    expect(container.textContent).not.toContain("先联网核实");
    expect(container.textContent).not.toContain("我先");
    expect(container.textContent).not.toContain("我");
    expect(container.textContent).toContain("调研简报");
    expect(container.textContent).toContain("已确认主要来源");
  });

  it("交错图片查看过程应保持顺序并支持展开图片预览", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先查看你给的截图。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-view-image-renderer",
            name: "ViewImageTool",
            arguments: JSON.stringify({
              path: "/workspace/assets/dashboard.png",
            }),
            status: "completed",
            result: {
              success: true,
              output:
                "Viewed image: /workspace/assets/dashboard.png\nFormat: image/png\nImage content is attached to this tool result.",
              metadata: {
                model_visible_image: true,
                image_url: "data:image/png;base64,ZGFzaGJvYXJk",
                mime_type: "image/png",
              },
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "最终观察：截图里有一个仪表盘。",
        },
      ],
      isStreaming: false,
    });

    const renderedText = container.textContent || "";
    expect(renderedText.indexOf("我先查看你给的截图。")).toBeLessThan(
      renderedText.indexOf("已查看 1 张图片"),
    );
    expect(renderedText.indexOf("已查看 1 张图片")).toBeLessThan(
      renderedText.indexOf("最终观察：截图里有一个仪表盘。"),
    );
    expect(renderedText).not.toContain("Viewed image");
    expect(renderedText).not.toContain("data:image");

    const groupButton = container.querySelector(
      '[data-testid="streaming-process-group"] button',
    );
    act(() => {
      groupButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const detailButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.title === "展开过程详情",
    );
    act(() => {
      detailButton?.click();
    });

    const previewImage = container.querySelector("img");
    expect(previewImage?.getAttribute("src")).toBe(
      "data:image/png;base64,ZGFzaGJvYXJk",
    );
    expect(container.textContent).not.toContain(
      "data:image/png;base64,ZGFzaGJvYXJk",
    );
  });

  it("Codex 导入工具组应默认展开并显示命令参数", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "codex-import-command",
            name: "Bash",
            arguments: JSON.stringify({
              command: "npm test",
              cwd: "/workspace/imported-codex",
            }),
            status: "completed",
            result: {
              success: true,
              output: "Exit code: 0\nOutput:\nok",
              metadata: {
                imported: true,
                source_client: "codex",
                exit_code: 0,
              },
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "codex-import-search",
            name: "web_search",
            arguments: JSON.stringify({
              action: "search_query",
              query: "Lime Codex import",
            }),
            status: "completed",
            result: {
              success: true,
              output: "search result summary",
              metadata: {
                imported: true,
                source_client: "codex",
              },
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
      ],
    });

    const processGroup = container.querySelector(
      '[data-testid="streaming-process-group"]',
    );
    const processGroupButton = processGroup?.querySelector("button");

    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("npm test");
    expect(container.textContent).toContain("Lime Codex import");
  });

  it("应过滤 assistant 正文中的工具协议残留", () => {
    const { container } = renderHarness({
      content:
        '<tool_call import={"name":"Read","arguments":{"file_path":"article.md"}}>{"ok":true}</tool_call>\n\n已完成 Markdown 保存。',
    });

    expect(container.textContent).toContain("已完成 Markdown 保存。");
    expect(container.textContent).not.toContain("tool_call");
    expect(container.textContent).not.toContain("file_path");
  });

  it("应把 runtime 协作包络渲染成专门消息卡片", () => {
    const { container } = renderHarness({
      content: `<teammate-message teammate_id="researcher" summary="同步结果">
继续验证
</teammate-message>`,
    });

    expect(
      container.querySelector('[data-testid="runtime-peer-message-cards"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("协作者消息");
    expect(container.textContent).toContain("来自 researcher");
    expect(container.textContent).toContain("同步结果");
    expect(container.textContent).toContain("继续验证");
    expect(container.textContent).not.toContain("teammate-message");
  });

  it("纯文本内容应短路跳过结构化解析", () => {
    renderHarness({
      content: "这是普通文本输出，不包含结构化标签。",
      isStreaming: true,
    });

    expect(parseAIResponseMock).not.toHaveBeenCalled();
  });

  it("流式纯文本首帧应立即显示前缀，避免等待下一帧才吐字", () => {
    const fullText = "这是第一段流式输出，应该马上可见。";
    const { container } = renderHarness({
      content: fullText,
      isStreaming: true,
    });

    const renderedText = container.textContent || "";
    expect(renderedText.length).toBeGreaterThan(0);
    expect(fullText.startsWith(renderedText)).toBe(true);
    expect(renderedText.length).toBeLessThan(fullText.length);
  });

  it("流式正文积压较多时应快速追上最新目标文本", () => {
    vi.useFakeTimers();
    const fullText = "流式输出".repeat(80);
    const { container } = renderHarness({
      content: fullText,
      isStreaming: true,
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const renderedText = container.textContent || "";
    expect(renderedText.length).toBeGreaterThan(120);
    expect(fullText.startsWith(renderedText)).toBe(true);
  });

  it("开启正文块操作时应向 MarkdownRenderer 透传引用/复制能力", () => {
    const onQuoteContent = vi.fn();

    renderHarness({
      content: "这是最终输出",
      showContentBlockActions: true,
      onQuoteContent,
    });

    expect(mockMarkdownRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "这是最终输出",
        showBlockActions: true,
        onQuoteContent,
      }),
    );
  });

  it("历史恢复轻量模式应向 MarkdownRenderer 透传 light 渲染模式", () => {
    renderHarness({
      content: "这是历史会话正文\n\n```ts\nconsole.log('heavy')\n```",
      markdownRenderMode: "light",
    });

    expect(mockMarkdownRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("这是历史会话正文"),
        renderMode: "light",
      }),
    );
  });

  it("交错内容重复渲染时应复用已缓存解析结果", () => {
    const structuredText = '<write_file path="demo.md">hello</write_file>';
    parseAIResponseMock.mockImplementation((content: string) => {
      if (content === structuredText) {
        return {
          parts: [
            {
              type: "write_file",
              content: "hello",
              filePath: "demo.md",
            },
          ],
          hasA2UI: false,
          hasWriteFile: true,
          hasPending: false,
        };
      }

      return {
        parts: content.trim()
          ? [{ type: "text", content: content.trim() }]
          : [],
        hasA2UI: false,
        hasWriteFile: false,
        hasPending: false,
      };
    });
    const contentParts: ContentPart[] = [
      { type: "text", text: structuredText },
      { type: "text", text: "普通文本" },
    ];

    const { rerender } = renderHarness({
      content: structuredText,
      contentParts,
      isStreaming: true,
    });

    expect(parseAIResponseMock).toHaveBeenCalledTimes(1);

    rerender({
      content: structuredText,
      contentParts: [...contentParts],
      isStreaming: true,
    });

    expect(parseAIResponseMock).toHaveBeenCalledTimes(1);
  });

  it("连续探索工具应默认折叠成批次摘要", () => {
    const { container } = renderHarness({
      content: "",
      toolCalls: [
        {
          id: "tool-search-1",
          name: "Grep",
          arguments: JSON.stringify({
            pattern: "tool_use_summary",
            path: "/workspace/src",
          }),
          status: "completed",
          result: { success: true, output: "found" },
          startTime: new Date("2026-04-01T10:00:00.000Z"),
          endTime: new Date("2026-04-01T10:00:01.000Z"),
        },
        {
          id: "tool-read-1",
          name: "Read",
          arguments: JSON.stringify({
            file_path: "/workspace/src/query.ts",
          }),
          status: "completed",
          result: { success: true, output: "file contents" },
          startTime: new Date("2026-04-01T10:00:02.000Z"),
          endTime: new Date("2026-04-01T10:00:03.000Z"),
        },
      ],
    });

    expect(container.textContent).toContain("已探索项目");
    expect(container.textContent).toContain("查看了 1 个文件，搜索 1 次");
    expect(container.textContent).toContain("最新线索：query.ts");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
  });

  it("文件变更批次应渲染为可展开的文件审查卡", () => {
    const onFileClick = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "file_changes_batch",
          aggregate: {
            fileCount: 1,
            totalAdded: 18,
            totalRemoved: 7,
            files: [
              {
                path: "src/components/CreationFlow.tsx",
                kind: "update",
                linesAdded: 18,
                linesRemoved: 7,
                truncated: false,
                source: "backend",
                status: "completed",
                diff: [
                  {
                    kind: "add",
                    value:
                      "主图里面的编辑，比如文字拖拽、放大、缩小、选择字号、选择字体这些都还不能用",
                  },
                  {
                    kind: "add",
                    value: "这个底部这个图片滚动有实际意义吗，感觉很碍手碍脚。",
                  },
                  {
                    kind: "add",
                    value:
                      "样板中心的厂家这里直接多个厂家标签切换，显示出他的最新样板款式的列表",
                  },
                  {
                    kind: "add",
                    value: "设置好了，点击生成图片，不能直接生成图片",
                  },
                  {
                    kind: "remove",
                    value: "旧的主图入口说明",
                  },
                ],
              },
            ],
          },
        },
      ],
      onFileClick,
    });

    const card = container.querySelector(
      '[data-testid="file-changes-summary-card"]',
    );
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("已编辑 1 个文件");
    expect(card?.textContent).toContain("+18");
    expect(card?.textContent).toContain("-7");
    expect(card?.textContent).toContain("审核");
    expect(card?.textContent).toContain("撤销");
    expect(
      container.querySelectorAll(
        '[data-testid="file-changes-summary-file-row"]',
      ),
    ).toHaveLength(1);
    expect(card?.textContent).toContain("src/components/CreationFlow.tsx");
    expect(card?.textContent).not.toContain("主图里面的编辑");
    expect(card?.textContent).not.toContain("旧的主图入口说明");

    const reviewButton = Array.from(
      card?.querySelectorAll("button") || [],
    ).find((button) => button.textContent?.includes("审核"));
    act(() => {
      reviewButton?.click();
    });
    expect(onFileClick).toHaveBeenCalledTimes(1);
    expect(onFileClick.mock.calls[0]?.[0]).toBe(
      "src/components/CreationFlow.tsx",
    );
    expect(onFileClick.mock.calls[0]?.[1]).toContain(
      "# src/components/CreationFlow.tsx 的变更审阅",
    );
    expect(onFileClick.mock.calls[0]?.[1]).toContain("- 状态：修改");
    expect(onFileClick.mock.calls[0]?.[1]).toContain("+主图里面的编辑");
    expect(onFileClick.mock.calls[0]?.[1]).toContain("-旧的主图入口说明");
    expect(card?.textContent).not.toContain("主图里面的编辑");

    const fileRow = container.querySelector(
      '[data-testid="file-changes-summary-file-row"]',
    ) as HTMLButtonElement | null;
    act(() => {
      fileRow?.click();
    });
    expect(onFileClick).toHaveBeenCalledTimes(2);
    expect(fileRow?.getAttribute("aria-expanded")).toBe("true");
  });

  it("文件变更审查卡应支持折叠长文件列表；缺少 session 时撤销不可用", () => {
    const files = Array.from({ length: 8 }, (_, index) => ({
      path: `src/generated/file-${index + 1}.ts`,
      kind: "update" as const,
      linesAdded: index + 1,
      linesRemoved: index,
      truncated: false,
      source: "backend" as const,
      status: "completed" as const,
      diff: [{ kind: "add" as const, value: `新增第 ${index + 1} 行` }],
    }));
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "file_changes_batch",
          aggregate: {
            fileCount: files.length,
            totalAdded: 36,
            totalRemoved: 28,
            files,
          },
        },
      ],
    });

    const card = container.querySelector(
      '[data-testid="file-changes-summary-card"]',
    );
    expect(card?.textContent).toContain("已编辑 8 个文件");
    expect(card?.textContent).toContain("收起文件");
    expect(
      container.querySelectorAll(
        '[data-testid="file-changes-summary-file-row"]',
      ),
    ).toHaveLength(8);

    const undoButton = Array.from(card?.querySelectorAll("button") || []).find(
      (button) => button.textContent?.includes("撤销"),
    ) as HTMLButtonElement | undefined;
    expect(undoButton?.disabled).toBe(true);
    expect(undoButton?.title).toBe("没有可用的文件快照");

    const toggle = container.querySelector(
      '[data-testid="file-changes-summary-toggle"]',
    ) as HTMLButtonElement | null;
    act(() => {
      toggle?.click();
    });

    expect(card?.textContent).toContain("展开其余 2 个文件");
    expect(
      container.querySelectorAll(
        '[data-testid="file-changes-summary-file-row"]',
      ),
    ).toHaveLength(6);
  });

  it("文件变更审查卡撤销应通过 session checkpoint 调用真实恢复命令", async () => {
    listAgentRuntimeFileCheckpointsMock.mockResolvedValue({
      session_id: "session-code-runtime",
      thread_id: "thread-code-runtime",
      checkpoint_count: 1,
      checkpoints: [
        {
          checkpoint_id: "checkpoint-greeting",
          turn_id: "turn-code-runtime",
          path: ".lime/qc/code-runtime-fixture/src/greeting.ts",
          snapshot_path: ".lime/file-checkpoints/checkpoint-greeting.ts",
          source: "artifact_snapshot",
          updated_at: "2026-06-02T10:01:00.000Z",
          validation_issue_count: 0,
        },
      ],
    });
    restoreAgentRuntimeFileCheckpointMock.mockResolvedValue({
      session_id: "session-code-runtime",
      thread_id: "thread-code-runtime",
      checkpoint: { checkpoint_id: "checkpoint-greeting" },
      live_path: "src/greeting.ts",
      snapshot_path: ".lime/checkpoints/greeting.ts",
      backup_path: ".lime/file-checkpoint-backups/greeting.ts",
      restored_at: "2026-06-02T10:02:00.000Z",
    });

    const { container } = renderHarness({
      content: "",
      fileChangesUndoSessionId: "session-code-runtime",
      contentParts: [
        {
          type: "file_changes_batch",
          aggregate: {
            fileCount: 1,
            totalAdded: 3,
            totalRemoved: 1,
            files: [
              {
                path: "src/greeting.ts",
                kind: "update",
                linesAdded: 3,
                linesRemoved: 1,
                truncated: false,
                source: "backend",
                status: "completed",
                diff: [],
              },
            ],
          },
        },
      ],
    });

    const card = container.querySelector(
      '[data-testid="file-changes-summary-card"]',
    );
    const undoButton = Array.from(card?.querySelectorAll("button") || []).find(
      (button) => button.textContent?.includes("撤销"),
    ) as HTMLButtonElement | undefined;
    expect(undoButton?.disabled).toBe(false);

    act(() => {
      undoButton?.click();
    });

    const confirmButton = container.querySelector(
      '[data-testid="file-changes-summary-undo-confirm"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      confirmButton?.click();
    });

    expect(listAgentRuntimeFileCheckpointsMock).toHaveBeenCalledWith({
      session_id: "session-code-runtime",
    });
    expect(restoreAgentRuntimeFileCheckpointMock).toHaveBeenCalledWith({
      session_id: "session-code-runtime",
      checkpoint_id: "checkpoint-greeting",
      confirm_restore: true,
      create_backup: true,
    });
    expect(container.textContent).toContain("已撤销 1 个文件改动");
  });

  it("文件变更审查卡应隐藏绝对路径前缀并向工作台传入完整 diff", () => {
    const onFileClick = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "file_changes_batch",
          aggregate: {
            fileCount: 1,
            totalAdded: 1,
            totalRemoved: 1,
            files: [
              {
                path: "/Users/coso/Library/Application Support/lime/projects/Demo/.lime/qc/code-runtime-fixture/src/greeting.ts",
                kind: "update",
                linesAdded: 1,
                linesRemoved: 1,
                truncated: false,
                source: "backend",
                status: "completed",
                diff: [
                  { kind: "context", value: "const a = 1;" },
                  { kind: "context", value: "const b = 2;" },
                  { kind: "context", value: "const c = 3;" },
                  { kind: "remove", value: "旧 runtime 入口" },
                  { kind: "add", value: "新 runtime 入口" },
                ],
              },
            ],
          },
        },
      ],
      onFileClick,
    });

    const fileRow = container.querySelector(
      '[data-testid="file-changes-summary-file-row"]',
    ) as HTMLButtonElement | null;
    expect(container.textContent).toContain(
      ".lime/qc/code-runtime-fixture/src/greeting.ts",
    );
    expect(container.textContent).not.toContain(
      "/Users/coso/Library/Application Support/lime/projects/Demo",
    );

    act(() => {
      fileRow?.click();
    });

    expect(onFileClick.mock.calls[0]?.[0]).toBe(
      "/Users/coso/Library/Application Support/lime/projects/Demo/.lime/qc/code-runtime-fixture/src/greeting.ts",
    );
    expect(onFileClick.mock.calls[0]?.[1]).toContain(" const a = 1;");
    expect(onFileClick.mock.calls[0]?.[1]).toContain("-旧 runtime 入口");
    expect(onFileClick.mock.calls[0]?.[1]).toContain("+新 runtime 入口");
  });

  it("普通工具列表应透传已保存站点内容打开回调", () => {
    const onOpenSavedSiteContent = vi.fn();
    const { container } = renderHarness({
      content: "工具执行完成",
      toolCalls: [
        {
          id: "tool-site-run-streaming-list",
          name: "lime_site_run",
          arguments: JSON.stringify({
            adapter_name: "x/article-export",
            skill_title: "X 文章转存",
          }),
          status: "completed",
          result: {
            success: true,
            output: "ok",
            metadata: createSavedSiteMetadata(),
          },
          startTime: new Date("2026-03-25T10:00:00.000Z"),
          endTime: new Date("2026-03-25T10:00:01.000Z"),
        },
      ],
      onOpenSavedSiteContent,
    });

    const markdownButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("在下方预览导出 Markdown"));
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeTruthy();
    expect(markdownButton).toBeTruthy();

    act(() => {
      markdownButton?.click();
    });

    expect(onOpenSavedSiteContent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        contentId: "content-1",
        preferredTarget: "project_file",
      }),
    );
  });

  it("交错工具片段应透传已保存站点内容打开回调", () => {
    const onOpenSavedSiteContent = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "tool-site-run-streaming-item",
            name: "lime_site_run",
            arguments: JSON.stringify({
              adapter_name: "x/article-export",
              skill_title: "X 文章转存",
            }),
            status: "completed",
            result: {
              success: true,
              output: "ok",
              metadata: createSavedSiteMetadata(),
            },
            startTime: new Date("2026-03-25T10:01:00.000Z"),
            endTime: new Date("2026-03-25T10:01:01.000Z"),
          },
        },
      ],
      onOpenSavedSiteContent,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton).toBeTruthy();

    act(() => {
      processGroupButton?.click();
    });

    const markdownButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("在下方预览导出 Markdown"));
    expect(markdownButton).toBeTruthy();

    act(() => {
      markdownButton?.click();
    });

    expect(onOpenSavedSiteContent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        contentId: "content-1",
      }),
    );
  });

  it("非交错模式应将思考和工具收敛为同一执行过程组", () => {
    const { container } = renderHarness({
      content: "最终结论",
      thinkingContent: "先检查滚动触发逻辑\n再确认输出展开时机",
      toolCalls: [
        {
          id: "tool-process-group-fallback",
          name: "functions.exec_command",
          arguments: JSON.stringify({ cmd: "rg -n scrollKey src" }),
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-03-25T10:02:00.000Z"),
          endTime: new Date("2026-03-25T10:02:01.000Z"),
        },
      ],
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("先检查滚动触发逻辑");
    expect(container.textContent).toContain("已运行 1 条命令");
    expect(
      container.querySelector('[data-testid="streaming-process-group"]'),
    ).toBeTruthy();

    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("先检查滚动触发逻辑");
    expect(
      container
        .querySelector('[data-testid="inline-tool-process-step"]')
        ?.getAttribute("data-grouped"),
    ).toBe("yes");
    expect(container.textContent).toContain("最终结论");
  });

  it("交错内容中的思考与工具应按连续执行流分组", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先检查 auto-scroll 触发条件\n确认是否只跟踪最后一项",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-process-group-interleaved",
            name: "functions.exec_command",
            arguments: JSON.stringify({
              cmd: "sed -n '1,120p' src/messages.tsx",
            }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-03-25T10:03:00.000Z"),
            endTime: new Date("2026-03-25T10:03:01.000Z"),
          },
        },
        {
          type: "thinking",
          text: "根因已经定位\n准备收口实现",
        },
        {
          type: "text",
          text: "已经定位到滚动没有跟随增量输出。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("已运行 1 条命令");
    expect(container.textContent).not.toContain("先检查 auto-scroll 触发条件");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
    expect(container.textContent).toContain("已经定位到滚动没有跟随增量输出。");

    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("先检查 auto-scroll 触发条件");
    expect(
      container
        .querySelector('[data-testid="inline-tool-process-step"]')
        ?.getAttribute("data-grouped"),
    ).toBe("yes");
  });

  it("交错内容里相邻多次命令应折叠为一条过程摘要", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先盘点目录",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-interleaved-1",
            name: "Bash",
            arguments: JSON.stringify({ command: "ls /tmp" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:00.000Z"),
            endTime: new Date("2026-05-29T10:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-interleaved-2",
            name: "Bash",
            arguments: JSON.stringify({ command: "stat /tmp" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:02.000Z"),
            endTime: new Date("2026-05-29T10:00:03.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-interleaved-3",
            name: "Bash",
            arguments: JSON.stringify({ command: "du -sh /tmp" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:04.000Z"),
            endTime: new Date("2026-05-29T10:00:05.000Z"),
          },
        },
        {
          type: "text",
          text: "目录已盘点。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("已运行 3 条命令");
    expect(container.textContent).not.toContain("先盘点目录");
    expect(
      container.querySelectorAll('[data-testid="inline-tool-process-step"]')
        .length,
    ).toBe(0);
    expect(container.textContent).toContain("目录已盘点。");

    act(() => {
      processGroupButton?.click();
    });

    const expandedToolSteps = container.querySelectorAll(
      '[data-testid="inline-tool-process-step"]',
    );
    expect(expandedToolSteps.length).toBe(3);
    expect(expandedToolSteps[0]?.getAttribute("data-grouped")).toBe("yes");
    expect(container.textContent).toContain("先盘点目录");
  });

  it("消息仍在输出时，已失败的工具批次也应默认折叠，避免工具输出切开正文", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "## 调研简报\n\n摘要：已整理出当前可用的主要来源。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-failed-after-answer-1",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "current sources" }),
            status: "failed",
            result: {
              success: false,
              output: "Execution failed: HTTP 401 Unknown Error",
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-failed-after-answer-2",
            name: "WebFetch",
            arguments: JSON.stringify({ url: "https://example.com/source" }),
            status: "failed",
            result: {
              success: false,
              output: "Fetching data issues",
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
      ],
      isStreaming: true,
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );

    expect(processGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("调研简报");
    expect(container.textContent).toContain("已搜索网页 1 次");
    expect(container.textContent).toContain("current sources");
    expect(container.textContent).toContain("https://example.com/source");
    expect(container.textContent).not.toContain("Execution failed");
    expect(container.textContent).not.toContain("Fetching data issues");
  });

  it("消息仍在输出时，运行中的工具批次也应默认折叠，避免实时输出切开正文", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先核实今天的国际新闻，再整理成简报。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-running-fetch-1",
            name: "WebFetch",
            arguments: JSON.stringify({ url: "https://example.com/world" }),
            status: "running",
            result: {
              success: true,
              output: "raw html payload should stay hidden while grouped",
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-running-fetch-2",
            name: "WebFetch",
            arguments: JSON.stringify({ url: "https://example.com/news" }),
            status: "completed",
            result: {
              success: true,
              output: "another raw payload should stay hidden while grouped",
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
        {
          type: "text",
          text: "## 国际新闻简报\n\n- 正在整理已确认来源。",
        },
      ],
      isStreaming: true,
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );

    expect(processGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("我先核实今天的国际新闻");
    expect(container.textContent).toContain("已搜索关键线索");
    expect(container.textContent).toContain("国际新闻简报");
    expect(container.textContent).not.toContain("raw html payload");
    expect(container.textContent).not.toContain("another raw payload");
  });

  it("交错网页搜索应作为同一条回复里的轻量过程块，不切断最终简报", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先联网核实今天的国际新闻，再整理成简报。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-search-1",
            name: "web_search",
            arguments: JSON.stringify({ query: "today international news" }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                results: [
                  {
                    title: "Reuters World News",
                    url: "https://www.reuters.com/world/",
                  },
                ],
              }),
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-search-2",
            name: "mcp__news__web_search",
            arguments: JSON.stringify({ query: "global headlines" }),
            status: "completed",
            result: {
              success: true,
              output: "[AP World News](https://apnews.com/hub/world-news)",
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-search-3",
            name: "WebSearchTool",
            arguments: JSON.stringify({ query: "UN international news" }),
            status: "completed",
            result: {
              success: true,
              output: "https://news.un.org/en/",
            },
            startTime: new Date("2026-06-02T09:00:04.000Z"),
            endTime: new Date("2026-06-02T09:00:05.000Z"),
          },
        },
        {
          type: "text",
          text: "## 国际新闻简报\n\n- 多个来源已经交叉确认。\n- 以下按地区和影响排序。",
        },
      ],
      isStreaming: false,
    });

    const renderedText = container.textContent || "";
    const introIndex = renderedText.indexOf("我先联网核实今天的国际新闻");
    const processIndex = renderedText.indexOf("已搜索网页 3 次");
    const briefingIndex = renderedText.indexOf("国际新闻简报");

    expect(introIndex).toBeGreaterThanOrEqual(0);
    expect(processIndex).toBeGreaterThan(introIndex);
    expect(briefingIndex).toBeGreaterThan(processIndex);
    expect(renderedText).toContain("today international news");
    expect(renderedText).toContain("Reuters World News");
    expect(renderedText).toContain("global headlines");
    expect(renderedText).toContain("AP World News");
    expect(renderedText).toContain("多个来源已经交叉确认");
    expect(renderedText).not.toContain('"results"');
    expect(renderedText).not.toContain("https://apnews.com/hub/world-news");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
  });

  it("网页搜索批次混入 WebFetch 时展开态也只展示搜索来源摘要", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我会先联网核实今天的主要国际新闻来源。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-mixed-search",
            name: "web_search",
            arguments: JSON.stringify({ query: "June 2 2026 world news" }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                results: [
                  {
                    title: "Reuters World News",
                    url: "https://www.reuters.com/world/",
                  },
                ],
              }),
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-mixed-fetch-failed",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://www.reuters.com/world/",
            }),
            status: "failed",
            result: {
              success: false,
              output: "503 Service Unavailable",
              error: "503 Service Unavailable",
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-mixed-fetch-ok",
            name: "WebFetch",
            arguments: JSON.stringify({ url: "https://news.un.org/en/" }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                code: 200,
                result: "raw page payload should not be rendered",
              }),
            },
            startTime: new Date("2026-06-02T09:00:04.000Z"),
            endTime: new Date("2026-06-02T09:00:05.000Z"),
          },
        },
        {
          type: "text",
          text: "## 今日国际新闻简报\n\n- 已按来源整理。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.textContent).toContain("已搜索网页 1 次");
    expect(container.textContent).not.toContain("失败 3 个步骤");
    expect(container.textContent).not.toContain("raw page payload");
    expect(container.textContent).not.toContain("503 Service Unavailable");

    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("June 2 2026 world news");
    expect(container.textContent).toContain("Reuters World News");
    expect(container.textContent).toContain("https://www.reuters.com/world/");
    expect(container.textContent).toContain("https://news.un.org/en/");
    expect(container.textContent).not.toContain("raw page payload");
    expect(container.textContent).not.toContain("503 Service Unavailable");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
  });

  it("网页搜索失败批次应折叠诊断 JSON，避免错误详情铺满对话", () => {
    const missingCredentialOutput = JSON.stringify({
      metadata: {
        durationSeconds: 0.12,
        web_search: {
          attempts: [
            {
              provider: "tavily",
              error: "缺少环境变量 TAVILY_API_KEY",
            },
          ],
        },
      },
      output: "缺少环境变量 TAVILY_API_KEY",
    });
    const failedSearchToolCalls = Array.from({ length: 4 }, (_, index) => ({
      type: "tool_use" as const,
      toolCall: {
        id: `tool-news-failed-search-${index + 1}`,
        name: "web_search",
        arguments: JSON.stringify({
          query: `international news source ${index + 1}`,
        }),
        status: "failed" as const,
        result: {
          success: false,
          output: missingCredentialOutput,
          error: missingCredentialOutput,
        },
        startTime: new Date(`2026-06-02T09:00:0${index}.000Z`),
        endTime: new Date(`2026-06-02T09:00:0${index + 1}.000Z`),
      },
    }));
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先联网核实今天的国际新闻。",
        },
        ...failedSearchToolCalls,
        {
          type: "text",
          text: "## 国际新闻简报\n\n- 当前搜索链路缺少凭证，先基于已有上下文整理。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );

    expect(processGroupButton?.textContent).toContain("已搜索网页 4 次");
    expect(container.textContent).toContain("国际新闻简报");
    expect(container.textContent).toContain("international news source 4");
    expect(container.textContent).not.toContain('"metadata"');
    expect(container.textContent).not.toContain("TAVILY_API_KEY");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();

    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("international news source 1");
    expect(container.textContent).toContain("international news source 4");
    expect(container.textContent).not.toContain('"metadata"');
    expect(container.textContent).not.toContain("TAVILY_API_KEY");
  });

  it("交错工具之间的过程状态自述不应作为正文块显示", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "tool-status-narration-before",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "current sources" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "第一轮搜索结果质量不高，我继续从更可靠的页面聚合要点，避免把无关结果混进去。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-status-narration-after",
            name: "WebFetch",
            arguments: JSON.stringify({ url: "https://example.com/source" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
        {
          type: "text",
          text: "## 调研简报\n\n- 已确认主要来源。",
        },
      ],
      isStreaming: false,
    });

    expect(container.textContent).not.toContain("第一轮搜索结果质量不高");
    expect(container.textContent).toContain("调研简报");
    expect(container.textContent).toContain("已确认主要来源");
  });

  it("交错内容里的工具折叠不应跨正文合并", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "先说明检查目标。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-before-text-1",
            name: "Bash",
            arguments: JSON.stringify({ command: "ls /tmp" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:00.000Z"),
            endTime: new Date("2026-05-29T10:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-before-text-2",
            name: "Bash",
            arguments: JSON.stringify({ command: "pwd" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:02.000Z"),
            endTime: new Date("2026-05-29T10:00:03.000Z"),
          },
        },
        {
          type: "text",
          text: "中间结论已经确认。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-after-text-1",
            name: "Bash",
            arguments: JSON.stringify({ command: "git status --short" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:04.000Z"),
            endTime: new Date("2026-05-29T10:00:05.000Z"),
          },
        },
        {
          type: "text",
          text: "最终结论。",
        },
      ],
      isStreaming: false,
    });

    expect(
      container.querySelectorAll('[data-testid="streaming-process-group"]')
        .length,
    ).toBe(2);

    const renderedText = container.textContent || "";
    const firstTextIndex = renderedText.indexOf("先说明检查目标。");
    const firstGroupIndex = renderedText.indexOf("已运行 2 条命令");
    const middleTextIndex = renderedText.indexOf("中间结论已经确认。");
    const secondGroupIndex = renderedText.indexOf("已运行 1 条命令");
    const finalTextIndex = renderedText.indexOf("最终结论。");

    expect(firstTextIndex).toBeGreaterThanOrEqual(0);
    expect(firstGroupIndex).toBeGreaterThan(firstTextIndex);
    expect(middleTextIndex).toBeGreaterThan(firstGroupIndex);
    expect(secondGroupIndex).toBeGreaterThan(middleTextIndex);
    expect(finalTextIndex).toBeGreaterThan(secondGroupIndex);
  });

  it("任务板工具应按正文片段穿插展示且不泄露任务 JSON", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先把工作拆成任务板。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-task-create-1",
            name: "TaskCreateTool",
            arguments: JSON.stringify({
              subject: "整理国际新闻",
              description: "按来源交叉验证并输出摘要",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                task: {
                  id: "1",
                  subject: "整理国际新闻",
                },
              }),
              metadata: {
                task: {
                  id: "1",
                  subject: "整理国际新闻",
                  description: "按来源交叉验证并输出摘要",
                  status: "pending",
                },
                task_list_id: "board-main",
                task_list: [
                  {
                    id: "1",
                    content: "整理国际新闻",
                    status: "pending",
                  },
                ],
                tasks: [
                  {
                    id: "1",
                    subject: "整理国际新闻",
                    description: "按来源交叉验证并输出摘要",
                    status: "pending",
                  },
                ],
              },
            },
            startTime: new Date("2026-06-02T09:10:00.000Z"),
            endTime: new Date("2026-06-02T09:10:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-task-list-1",
            name: "TaskListTool",
            arguments: JSON.stringify({}),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                tasks: [
                  {
                    id: "1",
                    subject: "整理国际新闻",
                    status: "pending",
                  },
                ],
              }),
              metadata: {
                task_list_id: "board-main",
                tasks: [
                  {
                    id: "1",
                    subject: "整理国际新闻",
                    status: "pending",
                  },
                ],
              },
            },
            startTime: new Date("2026-06-02T09:10:02.000Z"),
            endTime: new Date("2026-06-02T09:10:03.000Z"),
          },
        },
        {
          type: "text",
          text: "任务板已建立，接下来开始执行。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-task-update-1",
            name: "TaskUpdateTool",
            arguments: JSON.stringify({
              task_id: "1",
              status: "completed",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                success: true,
                taskId: "1",
                updatedFields: ["status"],
                statusChange: {
                  from: "pending",
                  to: "completed",
                },
              }),
              metadata: {
                success: true,
                task_id: "1",
                task_list_id: "board-main",
                status_change: {
                  from: "pending",
                  to: "completed",
                },
              },
            },
            startTime: new Date("2026-06-02T09:10:04.000Z"),
            endTime: new Date("2026-06-02T09:10:05.000Z"),
          },
        },
        {
          type: "text",
          text: "最终结论：任务板状态已经同步完成。",
        },
      ],
      isStreaming: false,
    });

    const renderedText = container.textContent || "";
    const introIndex = renderedText.indexOf("我先把工作拆成任务板。");
    const firstProcessIndex = renderedText.indexOf("已处理 2 项安排");
    const middleTextIndex =
      renderedText.indexOf("任务板已建立，接下来开始执行。");
    const updateProcessIndex = renderedText.indexOf("已处理 1 项安排");
    const finalTextIndex =
      renderedText.indexOf("最终结论：任务板状态已经同步完成。");

    expect(introIndex).toBeGreaterThanOrEqual(0);
    expect(firstProcessIndex).toBeGreaterThan(introIndex);
    expect(middleTextIndex).toBeGreaterThan(firstProcessIndex);
    expect(updateProcessIndex).toBeGreaterThan(middleTextIndex);
    expect(finalTextIndex).toBeGreaterThan(updateProcessIndex);
    expect(renderedText).not.toContain('"task_list_id"');
    expect(renderedText).not.toContain('"updatedFields"');
    expect(renderedText).not.toContain('"tasks"');

    const processGroupButtons = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButtons.length).toBe(2);

    act(() => {
      processGroupButtons[0]?.click();
      processGroupButtons[1]?.click();
    });

    const expandedText = container.textContent || "";
    expect(expandedText).toContain("整理国际新闻");
    expect(expandedText).toContain("已更新任务 1");
    expect(expandedText).not.toContain("task_list_id");
    expect(expandedText).not.toContain("updatedFields");
    expect(expandedText).not.toContain('"tasks"');
  });

  it("交错内容里只有思考时也应渲染为轻量折叠过程行", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先理解截图里的消息顺序\n再核对历史恢复路径",
        },
        {
          type: "text",
          text: "已经确认历史恢复路径也需要穿插显示。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(processGroupButton?.textContent).toContain("已完成思考");
    expect(container.textContent).not.toContain("先理解截图里的消息顺序");
    expect(
      container.querySelector('[data-testid="thinking-block"]'),
    ).toBeNull();
    expect(container.textContent).toContain(
      "已经确认历史恢复路径也需要穿插显示。",
    );

    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("先理解截图里的消息顺序");
    expect(
      container
        .querySelector('[data-testid="thinking-block"]')
        ?.getAttribute("data-visual-style"),
    ).toBe("grouped-inline");
  });

  it("抑制过程流时，非交错模式不应重复渲染思考、工具和确认卡", () => {
    const { container } = renderHarness({
      content: "最终回答内容",
      thinkingContent: "这段思考应由 timeline 承载",
      toolCalls: [
        {
          id: "tool-suppressed-fallback",
          name: "functions.exec_command",
          arguments: JSON.stringify({ cmd: "rg -n duplicate src" }),
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-03-28T12:10:00.000Z"),
          endTime: new Date("2026-03-28T12:10:01.000Z"),
        },
      ],
      actionRequests: [
        {
          requestId: "req-suppressed-fallback",
          actionType: "tool_confirmation",
          status: "pending",
          prompt: "请确认是否继续",
        },
      ],
      onPermissionResponse: vi.fn(),
      suppressProcessFlow: true,
    });

    expect(
      container.querySelector('[data-testid="streaming-process-group"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
    expect(container.textContent).toContain("最终回答内容");
  });

  it("抑制过程流时，交错模式只保留正文片段", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "这段思考应由 timeline 渲染",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-suppressed-interleaved",
            name: "functions.exec_command",
            arguments: JSON.stringify({ cmd: "sed -n '1,80p' src/app.tsx" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-03-28T12:12:00.000Z"),
            endTime: new Date("2026-03-28T12:12:01.000Z"),
          },
        },
        {
          type: "action_required",
          actionRequired: {
            requestId: "req-suppressed-interleaved",
            actionType: "tool_confirmation",
            status: "pending",
            prompt: "请确认是否继续",
          },
        },
        {
          type: "text",
          text: "这里只保留最终正文。",
        },
      ],
      onPermissionResponse: vi.fn(),
      suppressProcessFlow: true,
    });

    expect(
      container.querySelector('[data-testid="streaming-process-group"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
    expect(container.textContent).toContain("这里只保留最终正文。");
  });

  it("关闭内联 A2UI 时应仅保留普通文本片段", () => {
    parseAIResponseMock.mockReturnValue({
      parts: [
        { type: "text", content: "请先补充以下信息：" },
        { type: "a2ui", content: { type: "form", children: [] } },
      ],
      hasA2UI: true,
      hasWriteFile: false,
      hasPending: false,
    });

    const { container } = renderHarness({
      content: "```a2ui\n{}\n```",
      renderA2UIInline: false,
    });

    expect(container.querySelector('[data-testid="a2ui-card"]')).toBeNull();
    expect(container.textContent).toContain("请先补充以下信息：");
  });

  it("聊天流内联 A2UI 应使用紧凑尺寸", () => {
    parseAIResponseMock.mockReturnValue({
      parts: [
        { type: "text", content: "请先补充以下信息：" },
        { type: "a2ui", content: { type: "form", children: [] } },
      ],
      hasA2UI: true,
      hasWriteFile: false,
      hasPending: false,
    });

    const { container } = renderHarness({
      content: "```a2ui\n{}\n```",
      renderA2UIInline: true,
    });

    const card = container.querySelector('[data-testid="a2ui-card"]');
    expect(card?.getAttribute("data-compact")).toBe("true");
    expect(card?.className).toContain("max-w-[432px]");
  });

  it("历史内联 A2UI 应只读回显并移除提交回调", () => {
    parseAIResponseMock.mockReturnValue({
      parts: [
        {
          type: "a2ui",
          content: {
            id: "history-a2ui",
            root: "root",
            components: [{ id: "root", component: "Text", text: "旧表单" }],
            submitAction: { label: "提交", action: { name: "submit" } },
          },
        },
      ],
      hasA2UI: true,
      hasWriteFile: false,
      hasPending: false,
    });

    const { container } = renderHarness({
      content: "```a2ui\n{}\n```",
      renderA2UIInline: true,
      readOnlyA2UI: true,
    });

    const card = container.querySelector('[data-testid="a2ui-card"]');
    expect(card?.getAttribute("data-preview")).toBe("true");
    expect(card?.getAttribute("data-has-on-submit")).toBe("no");
  });

  it("历史 pending ask_user 应渲染只读 A2UI 回显而不是可提交 DecisionPanel", () => {
    const { container } = renderHarness({
      content: "",
      actionRequests: [
        {
          requestId: "req-history-pending",
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
      readOnlyActionRequests: true,
      onPermissionResponse: vi.fn(),
    });

    expect(container.querySelector('[data-testid="a2ui-card"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
  });

  it("pending_write_file 应触发流式 onWriteFile 回调", () => {
    const onWriteFile = vi.fn();
    parseAIResponseMock.mockReturnValue({
      parts: [
        {
          type: "pending_write_file",
          content: "# 草稿\n正在生成中",
          filePath: "notes/live.md",
        },
      ],
      hasA2UI: false,
      hasWriteFile: true,
      hasPending: true,
    });

    const { container } = renderHarness({
      content: '<write_file path="notes/live.md"># 草稿\n正在生成中',
      isStreaming: true,
      onWriteFile,
    });

    expect(
      container.querySelector('[data-testid="streaming-write-file-card"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("正在生成 live.md");
    expect(container.textContent).toContain("生成中");
    expect(container.textContent).toContain("notes/live.md");
    expect(container.textContent).not.toContain("写入notes/live.md");
    expect(onWriteFile).toHaveBeenCalledTimes(1);
    expect(onWriteFile).toHaveBeenCalledWith(
      "# 草稿\n正在生成中",
      "notes/live.md",
      expect.objectContaining({
        source: "message_content",
        status: "streaming",
        metadata: expect.objectContaining({
          writePhase: "streaming",
          lastUpdateSource: "message_content",
          isPartial: true,
        }),
      }),
    );
  });

  it("应将 proposed_plan 片段渲染为独立计划卡片", () => {
    const { container } = renderHarness({
      content:
        "先说明一下\n<proposed_plan>\n- 调研\n- 汇总\n</proposed_plan>\n然后开始执行",
    });

    expect(
      container.querySelector('[data-testid="agent-plan-block"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("完成:- 调研");
    expect(container.textContent).toContain("- 汇总");
    expect(container.textContent).toContain("先说明一下");
    expect(container.textContent).toContain("然后开始执行");
  });

  it("等待首个事件时不应再把 agent 运行状态插入正文顶部", () => {
    const { container } = renderHarness({
      content: "",
      isStreaming: true,
      runtimeStatus: {
        phase: "preparing",
        title: "正在准备处理",
        detail: "正在理解请求并准备当前阶段。",
        checkpoints: ["对话优先执行", "等待首个事件"],
      },
      showRuntimeStatusInline: true,
    });

    expect(
      container.querySelector('[data-testid="agent-runtime-status"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("正在准备处理");
  });

  it("高风险服务进入稳妥顺序处理时，正文顶部不应再出现运行态卡", () => {
    const { container } = renderHarness({
      content: "",
      isStreaming: true,
      runtimeStatus: {
        phase: "routing",
        title: "当前服务较忙，稍后开始处理",
        detail:
          "当前服务在同时处理过多请求时容易直接失败，系统已切换为更稳妥的顺序处理。",
        checkpoints: ["当前服务仅同时处理 1 条此类请求"],
        metadata: {
          concurrency_scope: "provider_global",
          concurrency_phase: "queued",
          retryable_overload: true,
        },
      },
      showRuntimeStatusInline: true,
    });

    expect(
      container.querySelector('[data-testid="agent-runtime-status"]'),
    ).toBeNull();
  });

  it("正文已经开始输出后，不应再在正文区域重复渲染运行态", () => {
    const { container } = renderHarness({
      content: "我来帮你先打开 GitHub 搜索页。",
      isStreaming: true,
      runtimeStatus: {
        phase: "routing",
        title: "正在搜索 GitHub",
        detail: "已经打开搜索页，准备补充筛选条件。",
        checkpoints: ["浏览器已就绪", "准备应用最近更新时间筛选"],
      },
      showRuntimeStatusInline: true,
    });

    expect(
      container.querySelector('[data-testid="agent-runtime-status"]'),
    ).toBeNull();
  });

  it("交错内容模式下也不应在正文区域渲染运行态卡", () => {
    const { container } = renderHarness({
      content: "",
      isStreaming: true,
      runtimeStatus: {
        phase: "context",
        title: "正在整理搜索结果",
        detail: "已拿到页面内容，正在提取最近一个月更新的仓库。",
        checkpoints: ["页面内容已获取"],
      },
      showRuntimeStatusInline: true,
      contentParts: [
        {
          type: "text",
          text: "我已经打开 GitHub 搜索页，接下来开始筛选结果。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-runtime-status-inline",
            name: "browser_snapshot",
            arguments: JSON.stringify({ page: "github-search" }),
            status: "running",
            result: undefined,
            startTime: new Date("2026-03-30T12:00:00.000Z"),
          },
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-runtime-status"]'),
    ).toBeNull();
  });

  it("已取消的运行状态也不应在正文顶部额外渲染状态卡", () => {
    const { container } = renderHarness({
      content: "",
      isStreaming: true,
      runtimeStatus: {
        phase: "cancelled",
        title: "图片任务已取消",
        detail: "任务已停止，不会继续生成新的图片结果。",
        checkpoints: ["已保留当前任务记录", "可在图片画布重新生成"],
      },
      showRuntimeStatusInline: true,
    });

    expect(
      container.querySelector('[data-testid="agent-runtime-status"]'),
    ).toBeNull();
  });

  it("思考内容进入流式阶段后应展开，完成后自动折叠", () => {
    const { container, rerender } = renderHarness({
      content: "",
      thinkingContent: "第一步：分析问题",
      isStreaming: false,
    });

    const initialDetails = container.querySelector("details");
    expect(initialDetails).toBeTruthy();
    expect((initialDetails as HTMLDetailsElement).open).toBe(false);

    rerender({
      content: "",
      thinkingContent: "第一步：分析问题\n第二步：调用工具",
      isStreaming: true,
    });

    const streamingDetails = container.querySelector("details");
    expect(streamingDetails).toBeTruthy();
    expect((streamingDetails as HTMLDetailsElement).open).toBe(true);
    expect(container.textContent).toContain("思考中");
    expect(container.textContent).toContain("第二步：调用工具");

    rerender({
      content: "",
      thinkingContent: "第一步：分析问题\n第二步：调用工具",
      isStreaming: false,
    });

    const completedDetails = container.querySelector("details");
    expect(completedDetails).toBeTruthy();
    expect((completedDetails as HTMLDetailsElement).open).toBe(false);
    expect(container.textContent).toContain("已完成思考");
    expect(container.textContent).not.toContain("第二步：调用工具");
  });

  it("思考块应使用统一状态标签，并在完成态保留首行摘要", () => {
    const { container, rerender } = renderHarness({
      content: "",
      thinkingContent: "先生成一版草稿\n- 再根据反馈快速迭代",
      isStreaming: false,
    });

    expect(container.textContent).toContain("已完成思考");
    expect(container.textContent).toContain("先生成一版草稿");
    expect(container.textContent).not.toContain("思考中");

    rerender({
      content: "",
      thinkingContent: "先生成一版草稿\n- 再根据反馈快速迭代",
      isStreaming: true,
    });

    expect(container.textContent).toContain("思考中");
    expect(container.textContent).toContain("先生成一版草稿");
  });

  it("包含工具的运行中过程组应默认折叠，完成后保持摘要", () => {
    const { container, rerender } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先确认过程组行高\n再和工具行对齐",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-process-group-running",
            name: "functions.exec_command",
            arguments: JSON.stringify({ cmd: "rg -n thinking src" }),
            status: "running",
            startTime: new Date("2026-03-29T08:40:00.000Z"),
          },
        },
      ],
      isStreaming: true,
    });

    const runningProcessGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(runningProcessGroup).not.toBeNull();
    expect(runningProcessGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("先确认过程组行高");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();

    rerender({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先确认过程组行高\n再和工具行对齐",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-process-group-running",
            name: "functions.exec_command",
            arguments: JSON.stringify({ cmd: "rg -n thinking src" }),
            status: "completed",
            startTime: new Date("2026-03-29T08:40:00.000Z"),
            result: { success: true, output: "ok" },
            endTime: new Date("2026-03-29T08:40:01.000Z"),
          },
        },
      ],
      isStreaming: false,
    });

    const completedProcessGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(completedProcessGroup).not.toBeNull();
    expect(completedProcessGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("已运行 1 条命令");
    expect(container.textContent).not.toContain("先确认过程组行高");
  });

  it("内容工作台工具过程组应保持正文前后顺序并隐藏协议细节", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "先把内容工作台任务放在正确位置。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-content-video-1",
            name: "lime_create_video_generation_task",
            arguments: JSON.stringify({ prompt: "产品演示短片" }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                artifact_path: ".lime/tasks/video_generate/demo.json",
              }),
            },
            startTime: new Date("2026-06-03T08:00:00.000Z"),
            endTime: new Date("2026-06-03T08:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-content-audio-1",
            name: "lime_create_audio_generation_task",
            arguments: JSON.stringify({ prompt: "播客旁白" }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                artifact_path: ".lime/tasks/audio_generate/demo.json",
              }),
            },
            startTime: new Date("2026-06-03T08:00:02.000Z"),
            endTime: new Date("2026-06-03T08:00:03.000Z"),
          },
        },
        {
          type: "text",
          text: "内容任务已发起，继续整理最终说明。",
        },
      ],
    });

    const markdownNodes = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-testid="markdown-renderer"]',
      ),
    );
    const introNode = markdownNodes.find((node) =>
      node.textContent?.includes("先把内容工作台任务放在正确位置。"),
    );
    const finalNode = markdownNodes.find((node) =>
      node.textContent?.includes("内容任务已发起，继续整理最终说明。"),
    );
    const processGroup = container.querySelector<HTMLElement>(
      '[data-testid="streaming-process-group"]',
    );

    expect(introNode).not.toBeNull();
    expect(processGroup).not.toBeNull();
    expect(finalNode).not.toBeNull();
    expect(
      introNode!.compareDocumentPosition(processGroup!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      processGroup!.compareDocumentPosition(finalNode!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const groupText = processGroup?.textContent || "";
    expect(groupText).toContain("2");

    const text = container.textContent || "";
    expect(text).not.toContain(".lime/tasks");
    expect(text).not.toContain("artifact_path");
    expect(text).not.toContain("lime_create_video_generation_task");
  });

  it("思考块展开后应压平被切碎成多行的过程 prose", () => {
    const { container } = renderHarness({
      content: "",
      thinkingContent: [
        "目录",
        "",
        "也",
        "",
        "不存在。",
        "",
        "可能",
        "",
        "整个",
        "",
        ".lime",
        "",
        "目录",
        "",
        "都不",
        "",
        "存在。",
      ].join("\n"),
      isStreaming: true,
    });

    const details = container.querySelector("details");
    act(() => {
      if (details) {
        (details as HTMLDetailsElement).open = true;
      }
      details?.dispatchEvent(new Event("toggle", { bubbles: true }));
    });

    expect(mockMarkdownRenderer).toHaveBeenCalled();
    const latestCall =
      mockMarkdownRenderer.mock.calls[
        mockMarkdownRenderer.mock.calls.length - 1
      ];
    expect(latestCall?.[0]?.content).toBe(
      "目录也不存在。可能整个 .lime 目录都不存在。",
    );
  });

  it("过程组中的思考与工具应默认压缩为摘要", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先确认过程组行高\n再和工具行对齐",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-thinking-inline-style",
            name: "functions.exec_command",
            arguments: JSON.stringify({ cmd: "rg -n thinking src" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-03-29T08:40:00.000Z"),
            endTime: new Date("2026-03-29T08:40:01.000Z"),
          },
        },
      ],
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroup).not.toBeNull();
    expect(processGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("已运行 1 条命令");
    expect(container.textContent).not.toContain("先确认过程组行高");
    expect(
      container.querySelector('[data-testid="thinking-block"]'),
    ).toBeNull();

    act(() => {
      processGroup?.click();
    });

    expect(
      container
        .querySelector('[data-testid="thinking-block"]')
        ?.getAttribute("data-visual-style"),
    ).toBe("grouped-inline");
  });

  it("仅思考过程组应把状态作为外层标题，展开后再显示思考正文", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "**Inspecting folder for details**",
        },
      ],
      isStreaming: false,
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroup).not.toBeNull();
    expect(processGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(processGroup?.textContent).toContain("已完成思考");
    expect(processGroup?.textContent).not.toContain(
      "**Inspecting folder for details**",
    );
    expect(container.textContent).not.toContain(
      "**Inspecting folder for details**",
    );

    act(() => {
      processGroup?.click();
    });

    expect(processGroup?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain(
      "**Inspecting folder for details**",
    );
    expect(
      container
        .querySelector('[data-testid="thinking-block"]')
        ?.getAttribute("data-visual-style"),
    ).toBe("grouped-inline");
  });

  it("提升为对话内 A2UI 的待处理问答应渲染为可提交卡片", () => {
    const { container } = renderHarness({
      content: "",
      actionRequests: [
        {
          requestId: "req-ask-1",
          actionType: "ask_user",
          status: "pending",
          prompt: "请选择执行模式",
          questions: [{ question: "请选择执行模式" }],
        },
        {
          requestId: "req-tool-1",
          actionType: "tool_confirmation",
          status: "pending",
          prompt: "请确认是否继续",
        },
      ],
      promoteActionRequestsToA2UI: true,
      onPermissionResponse: vi.fn(),
    });

    expect(
      container.querySelectorAll('[data-testid="decision-panel"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-testid="a2ui-card"]'),
    ).toHaveLength(1);
    expect(
      container
        .querySelector('[data-testid="a2ui-card"]')
        ?.getAttribute("data-has-on-submit"),
    ).toBe("yes");
  });

  it("已排队的 ask_user 应继续以内联只读 A2UI 卡片回显", () => {
    const { container } = renderHarness({
      content: "",
      actionRequests: [
        {
          requestId: "req-ask-queued",
          actionType: "ask_user",
          status: "queued",
          prompt: "请选择渠道",
          questions: [
            {
              question: "请选择渠道",
              options: [{ label: "小红书" }, { label: "视频号" }],
            },
          ],
          submittedUserData: { answer: "小红书" },
        },
      ],
      promoteActionRequestsToA2UI: true,
      onPermissionResponse: vi.fn(),
    });

    expect(
      container.querySelectorAll('[data-testid="a2ui-card"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
  });

  it("交错内容中的已提交问答应渲染为只读 A2UI 卡片", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "action_required",
          actionRequired: {
            requestId: "req-ask-submitted",
            actionType: "ask_user",
            status: "submitted",
            prompt: "请选择执行模式",
            questions: [
              {
                question: "请选择执行模式",
                options: [{ label: "自动执行" }, { label: "逐步确认" }],
              },
            ],
            submittedUserData: { answer: "自动执行" },
          },
        },
      ],
    });

    expect(
      container.querySelectorAll('[data-testid="a2ui-card"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="decision-panel"]'),
    ).toBeNull();
  });

  it("交错 action_required 应保留前后正文的 DOM 顺序", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "需要你的决定。",
        },
        {
          type: "action_required",
          actionRequired: {
            requestId: "approval-inline-order",
            actionType: "tool_confirmation",
            status: "pending",
            toolName: "Bash",
            prompt: "允许执行命令吗？",
          },
        },
        {
          type: "text",
          text: "最终结果如下。",
        },
      ],
      onPermissionResponse: vi.fn(),
    });

    const markdownNodes = container.querySelectorAll(
      '[data-testid="markdown-renderer"]',
    );
    const decisionPanel = container.querySelector(
      '[data-testid="decision-panel"]',
    );

    expect(markdownNodes).toHaveLength(2);
    expect(markdownNodes[0]?.textContent).toContain("需要你的决定");
    expect(markdownNodes[1]?.textContent).toContain("最终结果");
    expect(decisionPanel).not.toBeNull();
    expect(
      markdownNodes[0].compareDocumentPosition(decisionPanel as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      (decisionPanel as Node).compareDocumentPosition(markdownNodes[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
