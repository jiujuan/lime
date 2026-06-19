import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineToolProcessStep } from "./InlineToolProcessStep";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { SearchResultPreviewItem } from "../utils/searchResultPreview";

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

interface RenderOptions {
  isMessageStreaming?: boolean;
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: unknown) => void;
  onOpenUrlPreview?: (item: SearchResultPreviewItem) => void;
  urlPreviewToolCalls?: ToolCallState[];
}

const mountedRoots: RenderResult[] = [];

function renderTool(
  toolCall: ToolCallState,
  options?: RenderOptions,
): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <InlineToolProcessStep
        toolCall={toolCall}
        isMessageStreaming={options?.isMessageStreaming}
        onFileClick={options?.onFileClick}
        onOpenSavedSiteContent={options?.onOpenSavedSiteContent}
        onOpenUrlPreview={options?.onOpenUrlPreview}
        urlPreviewToolCalls={options?.urlPreviewToolCalls}
      />,
    );
  });

  const rendered = { container, root };
  mountedRoots.push(rendered);
  return rendered;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
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
  vi.clearAllMocks();
});

describe("InlineToolProcessStep", () => {
  it("运行中的读取工具应展示前置意图摘要", () => {
    const { container } = renderTool({
      id: "tool-read-running-1",
      name: "Read",
      arguments: JSON.stringify({ file_path: "src/app.tsx" }),
      status: "running",
      startTime: new Date("2026-04-13T09:58:00.000Z"),
    });

    expect(container.textContent).toContain("先查看 app.tsx");
    expect(container.textContent).not.toContain("执行完成");
  });

  it("运行中的工具收到输出增量时应优先展示实时输出摘要", () => {
    const { container } = renderTool({
      id: "tool-streaming-output-1",
      name: "mcp__runner__execute",
      arguments: JSON.stringify({ command: "npm test" }),
      status: "running",
      result: {
        success: true,
        output: "正在运行 12 个测试用例",
        metadata: {
          streaming: true,
        },
      },
      progress: {
        message: "正在处理第 2 项",
        progress: 2,
        total: 4,
      },
      startTime: new Date("2026-05-09T10:00:00.000Z"),
    });

    expect(container.textContent).toContain("实时输出：正在运行 12 个测试用例");
    expect(container.textContent).not.toContain("进度：正在处理第 2 项");
  });

  it("工具过程摘要应随当前语言切换，不硬编码中文", async () => {
    await changeLimeLocale("en-US");

    const { container } = renderTool({
      id: "tool-streaming-output-i18n-1",
      name: "mcp__runner__execute",
      arguments: JSON.stringify({ command: "npm test" }),
      status: "running",
      result: {
        success: true,
        output: "running 12 tests",
      },
      progress: {
        message: "processing item 2",
        progress: 2,
        total: 4,
      },
      metadata: {
        execution_origin: "preload",
        skill_title: "analysis",
      },
      startTime: new Date("2026-05-09T10:00:00.000Z"),
    });

    expect(container.textContent).toContain("Live output: running 12 tests");
    expect(container.textContent).toContain("System pre-run");
    expect(container.textContent).toContain("Skill: analysis");
    expect(container.textContent).not.toContain("实时输出");
    expect(container.textContent).not.toContain("系统预执行");
  });

  it("高频工具过程摘要应随当前语言切换", async () => {
    await changeLimeLocale("en-US");

    const toolSearch = renderTool({
      id: "tool-summary-i18n-search-tool",
      name: "ToolSearch",
      arguments: JSON.stringify({ query: "select:Read,Write" }),
      status: "completed",
      result: {
        success: true,
        output: JSON.stringify({
          query: "select:Read,Write",
          count: 2,
          notes: [],
          tools: [{ name: "Read" }, { name: "Write" }],
        }),
      },
      startTime: new Date("2026-05-09T10:01:00.000Z"),
      endTime: new Date("2026-05-09T10:01:01.000Z"),
    });
    expect(toolSearch.container.textContent).toContain(
      "2 available tools confirmed",
    );
    expect(toolSearch.container.textContent).not.toContain("已确认可用工具");

    const webFetch = renderTool({
      id: "tool-summary-i18n-fetch-failed",
      name: "WebFetch",
      arguments: JSON.stringify({ url: "https://example.com/unavailable" }),
      status: "failed",
      result: {
        success: false,
        error: "404 Not Found",
        output: "",
      },
      startTime: new Date("2026-05-09T10:02:00.000Z"),
      endTime: new Date("2026-05-09T10:02:01.000Z"),
    });
    expect(webFetch.container.textContent).toContain(
      "Source temporarily unavailable",
    );
    expect(webFetch.container.textContent).not.toContain("来源暂时无法读取");

    const command = renderTool({
      id: "tool-summary-i18n-command",
      name: "Bash",
      arguments: JSON.stringify({ command: "git status --short" }),
      status: "running",
      startTime: new Date("2026-05-09T10:03:00.000Z"),
    });
    expect(command.container.textContent).toContain(
      "Checking workspace state first",
    );
    expect(command.container.textContent).not.toContain("先确认工作区状态");

    const browser = renderTool({
      id: "tool-summary-i18n-browser",
      name: "mcp__playwright__browser_navigate",
      arguments: JSON.stringify({ url: "https://example.com/page" }),
      status: "running",
      startTime: new Date("2026-05-09T10:04:00.000Z"),
    });
    expect(browser.container.textContent).toContain("Opening example.com");
    expect(browser.container.textContent).not.toContain("先打开");
  });

  it("任务、技能、MCP 与计划过程摘要应随当前语言切换", async () => {
    await changeLimeLocale("en-US");

    const skill = renderTool({
      id: "tool-summary-i18n-skill",
      name: "Skill",
      arguments: JSON.stringify({ name: "analysis" }),
      status: "running",
      startTime: new Date("2026-05-09T10:05:00.000Z"),
    });
    expect(skill.container.textContent).toContain(
      "Executing Skill analysis first",
    );
    expect(skill.container.textContent).not.toContain("先执行技能");

    const taskCreate = renderTool({
      id: "tool-summary-i18n-task-create",
      name: "TaskCreateTool",
      arguments: JSON.stringify({ title: "Daily trends" }),
      status: "completed",
      startTime: new Date("2026-05-09T10:06:00.000Z"),
      endTime: new Date("2026-05-09T10:06:01.000Z"),
    });
    expect(taskCreate.container.textContent).toContain("Started Daily trends");
    expect(taskCreate.container.textContent).not.toContain("已开始");

    const mcpResources = renderTool({
      id: "tool-summary-i18n-mcp-resources",
      name: "ListMcpResourcesTool",
      arguments: JSON.stringify({ server: "docs" }),
      status: "completed",
      startTime: new Date("2026-05-09T10:07:00.000Z"),
      endTime: new Date("2026-05-09T10:07:01.000Z"),
    });
    expect(mcpResources.container.textContent).toContain("Reviewed docs");
    expect(mcpResources.container.textContent).not.toContain("已查看");

    const mcpAuth = renderTool({
      id: "tool-summary-i18n-mcp-auth",
      name: "McpAuthTool",
      status: "completed",
      startTime: new Date("2026-05-09T10:08:00.000Z"),
      endTime: new Date("2026-05-09T10:08:01.000Z"),
    });
    expect(mcpAuth.container.textContent).toContain(
      "MCP authorization completed",
    );
    expect(mcpAuth.container.textContent).not.toContain("已完成 MCP 授权");

    const updatePlan = renderTool({
      id: "tool-summary-i18n-update-plan",
      name: "update_plan",
      status: "running",
      startTime: new Date("2026-05-09T10:09:00.000Z"),
    });
    expect(updatePlan.container.textContent).toContain("Updating plan first");
    expect(updatePlan.container.textContent).not.toContain("先更新计划");
  });

  it("ToolSearch 在流式阶段应保持结构化预览，不自动展开原始 JSON", () => {
    const { container } = renderTool(
      {
        id: "tool-search-streaming-1",
        name: "ToolSearch",
        arguments: JSON.stringify({ query: "select:Read,Write" }),
        status: "completed",
        result: {
          success: true,
          output: JSON.stringify({
            query: "select:Read,Write",
            count: 2,
            notes: [],
            tools: [{ name: "Read" }, { name: "Write" }],
          }),
        },
        startTime: new Date("2026-04-13T10:00:00.000Z"),
        endTime: new Date("2026-04-13T10:00:01.000Z"),
      },
      { isMessageStreaming: true },
    );

    expect(container.textContent).toContain("已确认可用工具 2 个");
    expect(container.textContent).toContain("查看文件");
    expect(container.textContent).toContain("保存文件");
    expect(container.textContent).not.toContain("查询：");
    expect(container.textContent).not.toContain("select:Read,Write");
    expect(
      container.querySelector(
        '[data-testid="inline-tool-process-tool-search-result"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="markdown-renderer"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain('"tools"');
  });

  it("超长工具结果在流式阶段应默认收起原始详情", () => {
    const { container } = renderTool(
      {
        id: "tool-read-large-streaming-1",
        name: "Read",
        arguments: JSON.stringify({ file_path: "src/main.ts" }),
        status: "completed",
        result: {
          success: true,
          output: "A".repeat(1600),
        },
        startTime: new Date("2026-04-13T10:05:00.000Z"),
        endTime: new Date("2026-04-13T10:05:01.000Z"),
      },
      { isMessageStreaming: true },
    );

    expect(container.textContent).toContain("已查看 main.ts");
    expect(
      container.querySelector('[data-testid="markdown-renderer"]'),
    ).toBeNull();
  });

  it("工具详情遇到伪标签输出时应先转义再渲染", () => {
    const { container } = renderTool({
      id: "tool-bash-ink-tags-1",
      name: "Bash",
      arguments: JSON.stringify({ command: "echo demo" }),
      status: "completed",
      result: {
        success: true,
        output: "<text>正在整理</text>\n<spinner />",
      },
      startTime: new Date("2026-04-13T10:07:00.000Z"),
      endTime: new Date("2026-04-13T10:07:01.000Z"),
    });

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    expect(container.textContent).toContain(
      "&lt;text&gt;正在整理&lt;/text&gt;",
    );
    expect(container.textContent).toContain("&lt;spinner /&gt;");
  });

  it("文件工具应暴露稳定打开入口并携带原始文件路径", () => {
    const onFileClick = vi.fn();
    const { container } = renderTool(
      {
        id: "tool-read-file-open-1",
        name: "read_file",
        arguments: JSON.stringify({
          path: "/tmp/imported-local-history/docs/imported-preview.docx",
        }),
        status: "completed",
        result: {
          success: true,
          output: "导入会话 DOCX 预览内容",
        },
        startTime: new Date("2026-06-17T10:08:00.000Z"),
        endTime: new Date("2026-06-17T10:08:01.000Z"),
      },
      { onFileClick },
    );

    const button = container.querySelector(
      '[data-testid="inline-tool-open-file"]',
    ) as HTMLButtonElement | null;

    expect(button).not.toBeNull();
    expect(button?.getAttribute("data-file-path")).toBe(
      "/tmp/imported-local-history/docs/imported-preview.docx",
    );

    act(() => {
      button?.click();
    });

    expect(onFileClick).toHaveBeenCalledWith(
      "/tmp/imported-local-history/docs/imported-preview.docx",
      "",
    );
  });

  it("导入文件工具参数为对象时也应暴露稳定打开入口", () => {
    const onFileClick = vi.fn();
    const filePath = "/tmp/imported-local-history/docs/imported-preview.md";
    const { container } = renderTool(
      {
        id: "tool-read-file-open-object-1",
        name: "read_file",
        arguments: { path: filePath },
        status: "completed",
        result: {
          success: true,
          output: "导入会话 Markdown 预览内容",
        },
        startTime: new Date("2026-06-17T10:08:00.000Z"),
        endTime: new Date("2026-06-17T10:08:01.000Z"),
      } as ToolCallState,
      { onFileClick },
    );

    const button = container.querySelector(
      '[data-testid="inline-tool-open-file"]',
    ) as HTMLButtonElement | null;

    expect(button).not.toBeNull();
    expect(button?.getAttribute("data-file-path")).toBe(filePath);

    act(() => {
      button?.click();
    });

    expect(onFileClick).toHaveBeenCalledWith(filePath, "");
  });

  it("工具详情遇到 TypeScript 尖括号语法时也应转义再渲染", () => {
    const { container } = renderTool({
      id: "tool-read-typescript-tags-1",
      name: "Read",
      arguments: JSON.stringify({ file_path: "src/schema.ts" }),
      status: "completed",
      result: {
        success: true,
        output:
          "type OutputSchema<T> = keyof T\ncontentBlockParam: ContentBlockParam<typeof schema>",
      },
      startTime: new Date("2026-04-13T10:08:00.000Z"),
      endTime: new Date("2026-04-13T10:08:01.000Z"),
    });

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    expect(container.textContent).toContain("&lt;T&gt;");
    expect(container.textContent).toContain("&lt;typeof schema&gt;");
  });

  it("Skill 过程步骤应能展开查看本次执行读取的 SKILL.md", () => {
    const { container } = renderTool({
      id: "skill:analysis-run-1",
      name: "Skill",
      arguments: JSON.stringify({
        skill: "analysis",
        display_name: "analysis",
        source: "SKILL.md",
      }),
      status: "completed",
      result: {
        success: true,
        output: "已从 SKILL.md 读取并执行 Skill：analysis",
        metadata: {
          tool_family: "skill",
          skill_name: "analysis",
          skill_display_name: "analysis",
          skill_source: "SKILL.md",
          agent_skills_standard: true,
          markdown_content_bytes: 86,
          skill_markdown_content:
            "---\nname: analysis\ndescription: 分析任务\n---\n\n# Analysis Skill\n\n必须先确认可见上下文。",
        },
      },
      startTime: new Date("2026-05-14T04:30:00.000Z"),
      endTime: new Date("2026-05-14T04:30:02.000Z"),
    });

    expect(container.textContent).toContain("已执行技能 analysis");
    expect(container.textContent).toContain("SKILL.md");
    expect(container.textContent).not.toContain("skill_markdown_content");

    act(() => {
      const skillButton = container.querySelector(
        'button[title="查看 SKILL.md"]',
      ) as HTMLButtonElement | null;
      skillButton?.click();
    });

    expect(
      container.querySelector(
        '[data-testid="inline-tool-skill-content-panel"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("执行时读取的 SKILL.md");
    expect(container.textContent).toContain("随本次执行记录保存");
    expect(container.textContent).toContain("Agent Skills 标准");
    expect(container.textContent).toContain("展开 SKILL.md 内容");
    expect(container.textContent).not.toContain("Analysis Skill");

    act(() => {
      const expandBodyButton = Array.from(
        container.querySelectorAll("button"),
      ).find((button) => button.textContent?.includes("展开 SKILL.md 内容")) as
        | HTMLButtonElement
        | undefined;
      expandBodyButton?.click();
    });

    expect(
      container.querySelector('[data-testid="inline-tool-skill-content-body"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("收起 SKILL.md 内容");
    expect(container.textContent).toContain("Analysis Skill");
    expect(container.textContent).toContain("必须先确认可见上下文。");
    expect(container.textContent).not.toContain("tool_family");
    expect(container.textContent).not.toContain("skill_markdown_content");
  });

  it("ToolSearch 展开后应展示结构化工具摘要，而不是原始 JSON", () => {
    const { container } = renderTool({
      id: "tool-search-1",
      name: "ToolSearch",
      arguments: JSON.stringify({ query: "select:Read,Write" }),
      status: "completed",
      result: {
        success: true,
        output: JSON.stringify({
          query: "select:Read,Write",
          count: 2,
          notes: [],
          tools: [
            {
              name: "Read",
              source: "native_registry",
              description: "Read a file from disk",
              always_visible: true,
            },
            {
              name: "Write",
              source: "native_registry",
              description: "Write content to a file",
              always_visible: true,
            },
          ],
        }),
      },
      startTime: new Date("2026-04-13T10:10:00.000Z"),
      endTime: new Date("2026-04-13T10:10:01.000Z"),
    });

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    expect(
      container.querySelector(
        '[data-testid="inline-tool-process-tool-search-result"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("已确认可用工具 2 个");
    expect(container.textContent).toContain("找到工具：2 个");
    expect(container.textContent).toContain("查看文件");
    expect(container.textContent).toContain("保存文件");
    expect(
      container.querySelector('[data-testid="markdown-renderer"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain('"always_visible":true');
    expect(container.textContent).not.toContain("Read a file from disk");
    expect(container.textContent).not.toContain("查询：select:Read,Write");
    expect(container.textContent).not.toContain("原生工具");
    expect(container.textContent).not.toContain("默认可见");
  });

  it("WebSearch 展开后应优先展示搜索结果列表并打开 URL 预览", () => {
    const onOpenUrlPreview = vi.fn();
    const { container } = renderTool(
      {
        id: "tool-search-web-1",
        name: "WebSearch",
        arguments: JSON.stringify({ query: "AI Agent 最新热点" }),
        status: "completed",
        result: {
          success: true,
          output: [
            "Xinhua world news summary at 0030 GMT, March 13",
            "https://example.com/xinhua",
            "全球要闻摘要，覆盖国际局势与市场动态。",
            "",
            "Friday morning news: March 13, 2026 | WORLD - wng.org",
            "https://example.com/wng",
            "补充国际动态与区域冲突更新。",
          ].join("\n"),
        },
        startTime: new Date("2026-04-13T10:20:00.000Z"),
        endTime: new Date("2026-04-13T10:20:01.000Z"),
      },
      { onOpenUrlPreview },
    );

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    expect(
      document.body.querySelector(
        '[aria-label="预览搜索结果：Xinhua world news summary at 0030 GMT, March 13"]',
      ),
    ).not.toBeNull();
    act(() => {
      const firstResult = document.body.querySelector(
        '[aria-label="预览搜索结果：Xinhua world news summary at 0030 GMT, March 13"]',
      ) as HTMLButtonElement | null;
      firstResult?.click();
    });

    expect(onOpenUrlPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Xinhua world news summary at 0030 GMT, March 13",
        url: "https://example.com/xinhua",
        snippet: "全球要闻摘要，覆盖国际局势与市场动态。",
      }),
    );
    expect(openExternalUrlWithSystemBrowser).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Friday morning news: March 13, 2026 | WORLD - wng.org",
    );
    expect(
      container.querySelector('[data-testid="markdown-renderer"]'),
    ).toBeNull();
  });

  it("WebSearch 点击 URL 预览时应复用同组 WebFetch 正文快照", () => {
    const onOpenUrlPreview = vi.fn();
    const { container } = renderTool(
      {
        id: "tool-search-web-with-fetch-1",
        name: "WebSearch",
        arguments: JSON.stringify({ query: "国际新闻" }),
        status: "completed",
        result: {
          success: true,
          output: JSON.stringify({
            results: [
              {
                title: "Reuters World News",
                url: "https://www.reuters.com/world/",
                snippet: "搜索结果摘要",
              },
            ],
          }),
        },
        startTime: new Date("2026-06-18T10:20:00.000Z"),
        endTime: new Date("2026-06-18T10:20:01.000Z"),
      },
      {
        onOpenUrlPreview,
        urlPreviewToolCalls: [
          {
            id: "tool-fetch-reuters-1",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://www.reuters.com/world/",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                title: "Reuters snapshot",
                markdown: "# Reuters snapshot\n\n正文来自 WebFetch。",
              }),
            },
            startTime: new Date("2026-06-18T10:20:02.000Z"),
            endTime: new Date("2026-06-18T10:20:03.000Z"),
          },
        ],
      },
    );

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });
    act(() => {
      const result = document.body.querySelector(
        '[aria-label="预览搜索结果：Reuters World News"]',
      ) as HTMLButtonElement | null;
      result?.click();
    });

    expect(onOpenUrlPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reuters World News",
        url: "https://www.reuters.com/world/",
        snippet: "搜索结果摘要",
        snapshotTitle: "Reuters snapshot",
        snapshotContent: "# Reuters snapshot\n\n正文来自 WebFetch。",
        snapshotSource: "web_fetch",
      }),
    );
  });

  it("WebSearch 协议错误应展示可操作提示，并保留原始错误供排查", () => {
    const { container } = renderTool({
      id: "tool-search-web-failed-1",
      name: "WebSearch",
      arguments: JSON.stringify({
        query: "AI Agent trends X Twitter April 2026",
      }),
      status: "failed",
      result: {
        success: false,
        error: "-32603: -32002: WebSearch",
        output: "",
      },
      startTime: new Date("2026-04-13T10:22:00.000Z"),
      endTime: new Date("2026-04-13T10:22:01.000Z"),
    });

    expect(container.textContent).toContain("搜索结果暂时无法读取");
    expect(container.textContent).toContain("搜索失败");
    expect(container.textContent).not.toContain("执行失败");

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    expect(container.textContent).toContain(
      "原始错误：-32603: -32002: WebSearch",
    );
  });

  it("Bash 协议错误折叠态应展示底层原因而不是内部错误码", () => {
    const { container } = renderTool({
      id: "tool-bash-failed-1",
      name: "Bash",
      arguments: JSON.stringify({
        command: "set -e\np='/Users/coso/.yansu-agent'\nls \"$p\"",
      }),
      status: "failed",
      result: {
        success: false,
        error: "-32603: -32002: sandbox 执行失败: Operation not permitted",
        output: "",
      },
      startTime: new Date("2026-04-13T10:22:00.000Z"),
      endTime: new Date("2026-04-13T10:22:01.000Z"),
    });

    expect(container.textContent).toContain(
      "执行失败：sandbox 执行失败: Operation not permitted",
    );
    expect(container.textContent).not.toContain("-32603");
    expect(container.textContent).not.toContain("-32002");

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    expect(container.textContent).toContain(
      "原始错误：-32603: -32002: sandbox 执行失败: Operation not permitted",
    );
  });

  it("WebFetch 获取失败应使用弱提示而不是执行失败", () => {
    const { container } = renderTool({
      id: "tool-fetch-failed-1",
      name: "WebFetch",
      arguments: JSON.stringify({
        url: "https://example.com/unavailable",
      }),
      status: "failed",
      result: {
        success: false,
        error: "404 Not Found",
        output: "",
      },
      startTime: new Date("2026-04-13T10:23:00.000Z"),
      endTime: new Date("2026-04-13T10:23:01.000Z"),
    });

    expect(container.textContent).toContain("来源暂时无法读取");
    expect(container.textContent).toContain("获取失败");
    expect(container.textContent).not.toContain("执行失败");
  });

  it("WebFetch 返回 RSS/XML 时应默认只展示弱摘要，不铺开原始 XML", () => {
    const { container } = renderTool({
      id: "tool-fetch-rss-1",
      name: "WebFetch",
      arguments: JSON.stringify({
        url: "https://example.com/rss.xml",
      }),
      status: "completed",
      result: {
        success: true,
        output:
          '<?xml version="1.0"?><rss><channel><title>News</title></channel><item><title>World</title></item></rss>',
      },
      startTime: new Date("2026-04-13T10:23:00.000Z"),
      endTime: new Date("2026-04-13T10:23:01.000Z"),
    });

    expect(container.textContent).toContain("来源暂时无法读取");
    expect(container.textContent).not.toContain("<?xml");
    expect(container.textContent).not.toContain("<rss>");
    expect(
      container.querySelector('[data-testid="markdown-renderer"]'),
    ).toBeNull();
  });

  it("WebSearch 超时诊断应默认只展示弱摘要，不铺开原始错误", () => {
    const { container } = renderTool({
      id: "tool-search-timeout-1",
      name: "WebSearch",
      arguments: JSON.stringify({
        query: "今日国际新闻",
      }),
      status: "completed",
      result: {
        success: true,
        output: "Timeout while reading https://example.com/rss.xml",
      },
      startTime: new Date("2026-04-13T10:23:00.000Z"),
      endTime: new Date("2026-04-13T10:23:01.000Z"),
    });

    expect(container.textContent).toContain("搜索结果暂时无法读取");
    expect(container.textContent).not.toContain("Timeout while reading");
    expect(
      container.querySelector('[data-testid="markdown-renderer"]'),
    ).toBeNull();
  });

  it("WebFetch 成功返回结构化 JSON 时应渲染正文而不是原始 JSON", () => {
    const { container } = renderTool({
      id: "tool-fetch-json-1",
      name: "WebFetch",
      arguments: JSON.stringify({
        url: "https://example.com/article",
      }),
      status: "completed",
      result: {
        success: true,
        output: JSON.stringify({
          url: "https://example.com/article",
          title: "Example Article",
          markdown: "# 页面标题\n\n正文 **重点**。",
        }),
      },
      startTime: new Date("2026-04-13T10:24:00.000Z"),
      endTime: new Date("2026-04-13T10:24:01.000Z"),
    });

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    const markdownRenderer = container.querySelector(
      '[data-testid="markdown-renderer"]',
    );
    expect(markdownRenderer?.textContent).toContain("# 页面标题");
    expect(markdownRenderer?.textContent).toContain("正文 **重点**。");
    expect(markdownRenderer?.textContent).not.toContain('"markdown"');
    expect(markdownRenderer?.textContent).not.toContain(
      "https://example.com/article",
    );
  });

  it("图片生成任务失败时不应展示内部错误码、工具名或长提示词", () => {
    const { container } = renderTool({
      id: "tool-image-generate-failed-1",
      name: "lime_create_image_generation_task",
      arguments: JSON.stringify({
        prompt: "A comic book style illustration of a formal statue",
      }),
      status: "failed",
      result: {
        success: false,
        error: "-32603: -32002: lime_create_image_generation_task",
        output: "",
      },
      startTime: new Date("2026-05-14T10:22:00.000Z"),
      endTime: new Date("2026-05-14T10:22:01.000Z"),
    });

    expect(container.textContent).toContain("生成失败");
    expect(container.textContent).not.toContain("开始失败");
    expect(container.textContent).not.toContain("-32603");
    expect(container.textContent).not.toContain("-32002");
    expect(container.textContent).not.toContain(
      "lime_create_image_generation_task",
    );
    expect(container.textContent).not.toContain(
      "A comic book style illustration",
    );

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    expect(container.textContent).toContain("生成失败");
    expect(container.textContent).not.toContain("-32603");
    expect(container.textContent).not.toContain(
      "lime_create_image_generation_task",
    );
  });

  it("内容工作台任务失败时不应展示内部错误码或工具名", () => {
    const { container } = renderTool({
      id: "tool-video-generate-failed-1",
      name: "lime_create_video_generation_task",
      arguments: JSON.stringify({
        prompt: "生成一个产品演示视频",
      }),
      status: "failed",
      result: {
        success: false,
        error: "-32603: -32002: lime_create_video_generation_task",
        output: "",
      },
      startTime: new Date("2026-05-14T10:22:00.000Z"),
      endTime: new Date("2026-05-14T10:22:01.000Z"),
    });

    expect(container.textContent).toContain("视频生成失败");
    expect(container.textContent).not.toContain("-32603");
    expect(container.textContent).not.toContain("-32002");
    expect(container.textContent).not.toContain(
      "lime_create_video_generation_task",
    );

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    expect(container.textContent).toContain("视频生成失败");
    expect(container.textContent).not.toContain("-32603");
    expect(container.textContent).not.toContain(
      "lime_create_video_generation_task",
    );
  });

  it("完成态过程卡不应重复展示执行完成与原始工具名", () => {
    const { container } = renderTool({
      id: "tool-inline-ask-user-1",
      name: "request_user_input",
      arguments: JSON.stringify({ question: "需要继续吗？" }),
      status: "completed",
      result: {
        success: true,
        output: "用户已确认继续。",
      },
      startTime: new Date("2026-04-13T10:30:00.000Z"),
      endTime: new Date("2026-04-13T10:30:01.000Z"),
    });

    expect(container.textContent).toContain("已收集 需要继续吗？");
    expect(container.textContent).not.toContain("执行完成");
    expect(container.textContent).not.toContain("Ask User Question");
  });

  it("站点导出按钮副文案应优先展示短文件名", () => {
    const onOpenSavedSiteContent = vi.fn();
    const { container } = renderTool(
      {
        id: "tool-inline-site-run-1",
        name: "lime_site_run",
        arguments: JSON.stringify({
          adapter_name: "x/article",
          args: { url: "https://x.com/google/article/1" },
        }),
        status: "completed",
        result: {
          success: true,
          output: "ok",
          metadata: {
            tool_family: "site",
            saved_content: {
              content_id: "content-inline-site-1",
              project_id: "project-inline-site-1",
              title: "Google Cloud 周报",
              markdown_relative_path:
                "exports/social-article/google-cloud/index.md",
              image_count: 3,
            },
            saved_by: "context_project",
          },
        },
        startTime: new Date("2026-04-13T10:40:00.000Z"),
        endTime: new Date("2026-04-13T10:40:01.000Z"),
      },
      { onOpenSavedSiteContent },
    );

    expect(container.textContent).toContain(
      "结果已自动保存到当前项目：Google Cloud 周报",
    );
    expect(container.textContent).toContain("已导出 Markdown 文稿");
    expect(container.textContent).toContain("附带图片 3 张");

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("在下方预览导出 Markdown"),
    ) as HTMLButtonElement | undefined;

    expect(openButton).toBeDefined();
    expect(openButton?.textContent).toContain("index.md");
    expect(openButton?.textContent).not.toContain(
      "exports/social-article/google-cloud/index.md",
    );

    act(() => {
      openButton?.click();
    });

    expect(onOpenSavedSiteContent).toHaveBeenCalledWith({
      projectId: "project-inline-site-1",
      contentId: "content-inline-site-1",
      title: "Google Cloud 周报",
      preferredTarget: "project_file",
      projectFile: {
        relativePath: "exports/social-article/google-cloud/index.md",
      },
    });
  });

  it("站点保存提示应随当前语言切换", async () => {
    await changeLimeLocale("en-US");
    const { container } = renderTool(
      {
        id: "tool-inline-site-run-i18n-1",
        name: "lime_site_run",
        arguments: JSON.stringify({
          adapter_name: "x/article",
          args: { url: "https://x.com/google/article/1" },
        }),
        status: "completed",
        result: {
          success: true,
          output: "ok",
          metadata: {
            tool_family: "site",
            saved_content: {
              content_id: "content-inline-site-i18n-1",
              project_id: "project-inline-site-i18n-1",
              title: "Google Cloud weekly",
              markdown_relative_path:
                "exports/social-article/google-cloud/index.md",
              image_count: 3,
            },
            saved_by: "context_project",
          },
        },
        startTime: new Date("2026-04-13T10:40:00.000Z"),
        endTime: new Date("2026-04-13T10:40:01.000Z"),
      },
      { onOpenSavedSiteContent: vi.fn() },
    );

    expect(container.textContent).toContain(
      "Result saved to current project: Google Cloud weekly",
    );
    expect(container.textContent).toContain("Markdown draft exported");
    expect(container.textContent).toContain("3 images attached");
    expect(container.textContent).toContain("Preview exported Markdown below");
    expect(container.textContent).not.toContain("已保存到当前项目");
    expect(container.textContent).not.toContain("附带图片");
  });
});
