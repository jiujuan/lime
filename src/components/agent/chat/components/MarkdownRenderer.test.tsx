import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n/config";
import { changeLimeLocale } from "@/i18n/createI18n";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import * as fileBrowserModule from "@/lib/api/fileBrowser";
import {
  hasDesktopHostInvokeCapability,
  hasDesktopHostRuntimeMarkers,
} from "@/lib/desktop-runtime";
import { MarkdownRenderer } from "./MarkdownRenderer";

const mockConvertLocalFileSrc = vi.fn((path: string) => `asset://${path}`);

vi.mock("react-syntax-highlighter", () => ({
  Prism: ({
    children,
    language,
    className,
    style,
    customStyle,
    codeTagProps,
  }: {
    children: React.ReactNode;
    language?: string;
    className?: string;
    style?: Record<string, unknown>;
    customStyle?: React.CSSProperties;
    codeTagProps?: {
      style?: React.CSSProperties;
    };
  }) => (
    <pre
      data-testid="syntax-highlighter"
      data-language={language}
      className={className}
      data-theme={(style as { __theme?: string } | undefined)?.__theme}
      data-font-family={customStyle?.fontFamily}
      data-text-shadow={customStyle?.textShadow}
      data-font-ligatures={String(codeTagProps?.style?.fontVariantLigatures)}
    >
      <code
        data-testid="syntax-highlighter-code"
        data-inline-code={String((codeTagProps as any)?.["data-inline-code"])}
        data-display={codeTagProps?.style?.display}
        data-padding={String(codeTagProps?.style?.padding)}
        data-border={String(codeTagProps?.style?.border)}
        data-border-radius={String(codeTagProps?.style?.borderRadius)}
        data-background={String(codeTagProps?.style?.background)}
        data-color={String(codeTagProps?.style?.color)}
      >
        {children}
      </code>
    </pre>
  ),
}));

vi.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
  oneDark: { __theme: "dark" },
  oneLight: { __theme: "light" },
}));

vi.mock("./ArtifactPlaceholder", () => ({
  ArtifactPlaceholder: ({ language }: { language: string }) => (
    <div data-testid="artifact-placeholder">{language}</div>
  ),
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
      data-testid="a2ui-task-card"
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
      data-testid="a2ui-task-loading-card"
      data-compact={String(compact)}
      className={className}
    />
  ),
}));

vi.mock("@/lib/api/fileSystem", () => ({
  convertLocalFileSrc: (path: string) => mockConvertLocalFileSrc(path),
}));

vi.mock("@/lib/api/fileBrowser", () => ({
  readFilePreview: vi.fn(),
}));

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: vi.fn(),
}));

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostInvokeCapability: vi.fn(),
  hasDesktopHostRuntimeMarkers: vi.fn(),
}));

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

interface RenderOptions {
  baseFilePath?: string;
  isStreaming?: boolean;
  collapseCodeBlocks?: boolean;
  shouldCollapseCodeBlock?: (language: string, code: string) => boolean;
  showBlockActions?: boolean;
  onQuoteContent?: (content: string) => void;
  readOnlyA2UI?: boolean;
}

const mountedRoots: MountedHarness[] = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
  vi.mocked(openExternalUrlWithSystemBrowser).mockResolvedValue(undefined);
  vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(false);
  vi.mocked(hasDesktopHostRuntimeMarkers).mockReturnValue(false);
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
  mockConvertLocalFileSrc.mockClear();
});

function render(
  content: string,
  {
    baseFilePath,
    isStreaming = false,
    collapseCodeBlocks = false,
    shouldCollapseCodeBlock,
    showBlockActions = false,
    onQuoteContent,
    readOnlyA2UI = false,
  }: RenderOptions = {},
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <MarkdownRenderer
        content={content}
        baseFilePath={baseFilePath}
        isStreaming={isStreaming}
        collapseCodeBlocks={collapseCodeBlocks}
        shouldCollapseCodeBlock={shouldCollapseCodeBlock}
        showBlockActions={showBlockActions}
        onQuoteContent={onQuoteContent}
        readOnlyA2UI={readOnlyA2UI}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

function renderHarness(
  content: string,
  {
    baseFilePath,
    isStreaming = false,
    collapseCodeBlocks = false,
    shouldCollapseCodeBlock,
    showBlockActions = false,
    onQuoteContent,
    readOnlyA2UI = false,
  }: RenderOptions = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const rerender = (
    nextContent: string,
    {
      baseFilePath: nextBaseFilePath = baseFilePath,
      isStreaming: nextIsStreaming = isStreaming,
      collapseCodeBlocks: nextCollapseCodeBlocks = collapseCodeBlocks,
      shouldCollapseCodeBlock:
        nextShouldCollapseCodeBlock = shouldCollapseCodeBlock,
      showBlockActions: nextShowBlockActions = showBlockActions,
      onQuoteContent: nextOnQuoteContent = onQuoteContent,
      readOnlyA2UI: nextReadOnlyA2UI = readOnlyA2UI,
    }: RenderOptions = {},
  ) => {
    act(() => {
      root.render(
        <MarkdownRenderer
          content={nextContent}
          baseFilePath={nextBaseFilePath}
          isStreaming={nextIsStreaming}
          collapseCodeBlocks={nextCollapseCodeBlocks}
          shouldCollapseCodeBlock={nextShouldCollapseCodeBlock}
          showBlockActions={nextShowBlockActions}
          onQuoteContent={nextOnQuoteContent}
          readOnlyA2UI={nextReadOnlyA2UI}
        />,
      );
    });
  };

  rerender(content, {
    isStreaming,
    collapseCodeBlocks,
    shouldCollapseCodeBlock,
    showBlockActions,
    onQuoteContent,
    readOnlyA2UI,
  });

  mountedRoots.push({ container, root });
  return { container, rerender };
}

describe("MarkdownRenderer", () => {
  it("代码块复制按钮应使用中文文案并反馈复制状态", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const content = ["```bash", "echo hello", "```"].join("\n");
    const container = render(content);
    const button = container.querySelector("button");

    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("复制");
    expect(container.textContent).toContain("bash");
    expect(container.textContent).toContain("1 行");
    expect(button?.hasAttribute("data-markdown-code-action")).toBe(true);

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("echo hello");
    expect(container.querySelector("button")?.textContent).toContain("已复制");

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(container.querySelector("button")?.textContent).toContain("复制");
  });

  it("输出内容区块应支持复制与引用按钮", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onQuoteContent = vi.fn();
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const container = render("第一段输出\n\n第二段输出", {
      showBlockActions: true,
      onQuoteContent,
    });

    const quoteButton = container.querySelector(
      'button[aria-label="引用内容区块"]',
    );
    const copyButton = container.querySelector(
      'button[aria-label="复制内容区块"]',
    );

    expect(quoteButton).not.toBeNull();
    expect(copyButton).not.toBeNull();

    await act(async () => {
      quoteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onQuoteContent).toHaveBeenCalledWith("第一段输出\n\n第二段输出");

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(writeText).toHaveBeenCalledWith("第一段输出\n\n第二段输出");
  });

  it("base64 图片说明文案应保持精简中文", () => {
    const content = "![示例图](data:image/png;base64,ZmFrZQ==)";

    const container = render(content);

    expect(container.textContent).toContain("图片 · 点击查看大图");
  });

  it("开发分析正文应渲染标题、表格、粗体和行内代码，而不是露出原始 Markdown", () => {
    const content = [
      "## BADOUCMS 架构分析",
      "",
      "| 发现 | 说明 |",
      "| --- | --- |",
      "| **底层框架** | `ThinkPHP` |",
    ].join("\n");

    const container = render(content);

    expect(
      container.querySelector('h2[data-markdown-heading-level="2"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="markdown-table-scroll"] table'),
    ).not.toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("底层框架");
    expect(
      container.querySelector('code[data-inline-code="true"]')?.textContent,
    ).toBe("ThinkPHP");
    expect(container.textContent).not.toContain("## BADOUCMS");
    expect(container.textContent).not.toContain("| 发现 | 说明 |");
  });

  it("markdown 围栏里确实是表格时应拆掉围栏并渲染为表格", () => {
    const content = [
      "```markdown",
      "| 文件 | 作用 |",
      "| --- | --- |",
      "| build.bat | Windows 构建入口 |",
      "```",
    ].join("\n");

    const container = render(content);

    expect(
      container.querySelector('[data-testid="markdown-table-scroll"] table'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="markdown-syntax-code-block"]'),
    ).toBeNull();
    expect(container.textContent).toContain("build.bat");
    expect(container.textContent).not.toContain("```");
  });

  it("markdown 围栏里不是表格时应继续作为代码块显示", () => {
    const content = ["```markdown", "**强调示例**", "```"].join("\n");

    const container = render(content);

    expect(
      container.querySelector('[data-testid="markdown-syntax-code-block"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="markdown-table-scroll"]'),
    ).toBeNull();
  });

  it("http/https 链接应交给系统浏览器而不是当前 WebView", async () => {
    const container = render("[Node.js](https://nodejs.org)");
    const link = container.querySelector("a");

    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("https://nodejs.org");
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    await act(async () => {
      link?.dispatchEvent(clickEvent);
      await Promise.resolve();
    });

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(openExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://nodejs.org",
    );
  });

  it("非 http/https 链接不应触发系统浏览器打开", () => {
    const container = render("[章节](#install)");
    const link = container.querySelector("a");
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    link?.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(openExternalUrlWithSystemBrowser).not.toHaveBeenCalled();
  });

  it("带 baseFilePath 时应把相对图片路径解析为本地文件资源", () => {
    const container = render("![配图](images/hero.png)", {
      baseFilePath:
        "/Users/coso/.proxycast/projects/default/exports/x-article/google/index.md",
    });

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(mockConvertLocalFileSrc).toHaveBeenCalledWith(
      "/Users/coso/.proxycast/projects/default/exports/x-article/google/images/hero.png",
    );
    expect(image?.getAttribute("src")).toBe(
      "asset:///Users/coso/.proxycast/projects/default/exports/x-article/google/images/hero.png",
    );
  });

  it("应通过同目录 meta.json 将远程图片替换为本地下载资源", async () => {
    vi.mocked(fileBrowserModule.readFilePreview).mockResolvedValue({
      path: "/Users/coso/.lime/projects/default/exports/x-article/google/meta.json",
      content: JSON.stringify({
        markdown_relative_path: "exports/x-article/google/index.md",
        images: [
          {
            original_url: "https://cdn.example.com/hero.png",
            markdown_path: "images/hero.png",
          },
        ],
      }),
      isBinary: false,
      size: 160,
      error: null,
    });

    const container = render("![配图](https://cdn.example.com/hero.png)", {
      baseFilePath:
        "/Users/coso/.lime/projects/default/exports/x-article/google/index.md",
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fileBrowserModule.readFilePreview).toHaveBeenCalledWith(
      "/Users/coso/.lime/projects/default/exports/x-article/google/meta.json",
      64 * 1024,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(mockConvertLocalFileSrc).toHaveBeenCalledWith(
      "/Users/coso/.lime/projects/default/exports/x-article/google/images/hero.png",
    );
    expect(image?.getAttribute("src")).toBe(
      "asset:///Users/coso/.lime/projects/default/exports/x-article/google/images/hero.png",
    );
  });

  it("http/https 图片点击应交给系统浏览器 current 网关", async () => {
    const originalWindowOpen = window.open;
    const windowOpen = vi.fn();
    window.open = windowOpen as unknown as typeof window.open;

    try {
      const container = render("![远程图](https://cdn.example.com/hero.png)");
      const image = container.querySelector("img");

      expect(image).not.toBeNull();

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      await act(async () => {
        image?.dispatchEvent(clickEvent);
        await Promise.resolve();
      });

      expect(clickEvent.defaultPrevented).toBe(true);
      expect(openExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
        "https://cdn.example.com/hero.png",
      );
      expect(windowOpen).not.toHaveBeenCalled();
    } finally {
      window.open = originalWindowOpen;
    }
  });

  it("Desktop Host 下 base64 图片点击不应回退 window.open", () => {
    vi.mocked(hasDesktopHostRuntimeMarkers).mockReturnValue(true);
    const originalWindowOpen = window.open;
    const windowOpen = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    window.open = windowOpen as unknown as typeof window.open;

    try {
      const container = render("![示例图](data:image/png;base64,ZmFrZQ==)");
      const image = container.querySelector("img");

      expect(image).not.toBeNull();

      image?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(windowOpen).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "[MarkdownRenderer] Desktop Host image preview cannot fall back to browser window",
        "data:image/png;base64,ZmFrZQ==",
      );
    } finally {
      window.open = originalWindowOpen;
      consoleError.mockRestore();
    }
  });

  it("Desktop Host 下本地图片点击不应回退 window.open", () => {
    vi.mocked(hasDesktopHostInvokeCapability).mockReturnValue(true);
    const originalWindowOpen = window.open;
    const windowOpen = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    window.open = windowOpen as unknown as typeof window.open;

    try {
      const container = render("![配图](images/hero.png)", {
        baseFilePath:
          "/Users/coso/.proxycast/projects/default/exports/x-article/google/index.md",
      });
      const image = container.querySelector("img");
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      expect(image).not.toBeNull();

      image?.dispatchEvent(clickEvent);

      expect(clickEvent.defaultPrevented).toBe(true);
      expect(windowOpen).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "[MarkdownRenderer] Desktop Host image preview cannot fall back to browser window",
        "asset:///Users/coso/.proxycast/projects/default/exports/x-article/google/images/hero.png",
      );
    } finally {
      window.open = originalWindowOpen;
      consoleError.mockRestore();
    }
  });

  it("非 Desktop Host 下本地图片点击保留浏览器预览", () => {
    const originalWindowOpen = window.open;
    const windowOpen = vi.fn();
    window.open = windowOpen as unknown as typeof window.open;

    try {
      const container = render("![配图](images/hero.png)", {
        baseFilePath:
          "/Users/coso/.proxycast/projects/default/exports/x-article/google/index.md",
      });
      const image = container.querySelector("img");
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      expect(image).not.toBeNull();

      image?.dispatchEvent(clickEvent);

      expect(clickEvent.defaultPrevented).toBe(false);
      expect(windowOpen).toHaveBeenCalledWith(
        "asset:///Users/coso/.proxycast/projects/default/exports/x-article/google/images/hero.png",
        "_blank",
      );
    } finally {
      window.open = originalWindowOpen;
    }
  });

  it("应归一化 ./ 和 ../ 相对图片路径并保留查询串", () => {
    const container = render(
      "![配图](./images/../images/hero.png?raw=1#preview)",
      {
        baseFilePath:
          "/Users/coso/.proxycast/projects/default/exports/x-article/google/nested/index.md",
      },
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(mockConvertLocalFileSrc).toHaveBeenCalledWith(
      "/Users/coso/.proxycast/projects/default/exports/x-article/google/nested/images/hero.png",
    );
    expect(image?.getAttribute("src")).toBe(
      "asset:///Users/coso/.proxycast/projects/default/exports/x-article/google/nested/images/hero.png?raw=1#preview",
    );
  });

  it("绝对路径图片应复用本地资源转换并保留 hash", () => {
    const container = render("![配图](/Users/coso/demo/assets/cover.png#hero)");

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(mockConvertLocalFileSrc).toHaveBeenCalledWith(
      "/Users/coso/demo/assets/cover.png",
    );
    expect(image?.getAttribute("src")).toBe(
      "asset:///Users/coso/demo/assets/cover.png#hero",
    );
  });

  it("Markdown 表格应包裹在横向滚动容器中，避免窄列压缩", () => {
    const content = [
      "| 模块 | 输入 | 输出 | 备注 |",
      "| --- | --- | --- | --- |",
      "| Browser Runtime | 页面信息 | 结构化摘要 | 主链 |",
    ].join("\n");

    const container = render(content);
    const tableScroll = container.querySelector(
      '[data-testid="markdown-table-scroll"]',
    );

    expect(tableScroll).not.toBeNull();
    const table = tableScroll?.querySelector("table");
    const headerCell = table?.querySelector("th");
    expect(table).not.toBeNull();
    expect(headerCell).not.toBeNull();
    const headerBackground = getComputedStyle(
      headerCell as HTMLElement,
    ).backgroundColor;
    const rgbMatch = /rgb\((\d+), (\d+), (\d+)\)/.exec(headerBackground);
    expect(rgbMatch).not.toBeNull();
    const [, red = "0", green = "0", blue = "0"] = rgbMatch ?? [];
    expect(Number(red)).toBeGreaterThanOrEqual(240);
    expect(Number(green)).toBeGreaterThanOrEqual(240);
    expect(Number(blue)).toBeGreaterThanOrEqual(240);
    expect(container.textContent).toContain("Browser Runtime");
  });

  it("应把模型压成单行的紧凑竖线表格恢复为 GFM 表格", () => {
    const content =
      "| 事件 | 要点 ||------|| 美伊霍尔木兹海峡交火 | 美军空袭伊朗油轮及境内发射场 || 停火谈判 | 美国要求伊朗在周五前答复止战方案 || 特朗普威胁 | 若伊朗拒绝，将发动更猛烈打击 |";

    const container = render(content);
    const tableScroll = container.querySelector(
      '[data-testid="markdown-table-scroll"]',
    );
    const table = tableScroll?.querySelector("table");

    expect(table).not.toBeNull();
    expect(table?.querySelectorAll("th")).toHaveLength(2);
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(table?.textContent).toContain("美伊霍尔木兹海峡交火");
    expect(table?.textContent).toContain("美国要求伊朗在周五前答复止战方案");
  });

  it("旧历史压缩 Markdown 应恢复块级结构，避免表格吞掉后续正文", () => {
    const content =
      "##结论`/Users/coso/.yansu-agent` 是 **Yansu Agent 桌面/本地代理应用的数据目录**，不是普通项目目录。它包含：- 本地可执行依赖：`bin/`、`git/`、`opencli/`- 本地 AI/识别模型：`models/`、`sherpa/`- 活动记录与截图：`activity/`、`activity.db`---##目录体积分布主要占用如下：| 路径 | 大小 | 判断 ||---|---:|---|| `activity/` | **974M** | 最大头，主要是截图快照 || `models/` | **729M** | 本地 ONNX 模型 || `sherpa/` | **229M** | 语音识别/音频相关模型 |最值得关注的是：```text/Users/coso/.yansu-agent/activity/snapshots/2026-05-26973M/Users/coso/.yansu-agent/models/gliner-pii-base/model.onnx634M```---##关键发现###1. `activity/` 是最大空间来源";

    const container = render(content);
    const headings = container.querySelectorAll(
      "[data-markdown-heading-level]",
    );
    const table = container.querySelector(
      '[data-testid="markdown-table-scroll"] table',
    );
    const codeBlock = container.querySelector(
      '[data-testid="markdown-plain-code-block"]',
    );

    expect(headings).toHaveLength(4);
    expect(headings[0]?.textContent).toContain("结论");
    expect(headings[1]?.textContent).toContain("目录体积分布");
    expect(headings[2]?.textContent).toContain("关键发现");
    expect(headings[3]?.textContent).toContain("activity/");
    expect(container.querySelectorAll("li")).toHaveLength(3);
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(table?.textContent).not.toContain("关键发现");
    expect(codeBlock).not.toBeNull();
    expect(codeBlock?.textContent).toContain(
      "/Users/coso/.yansu-agent/activity/snapshots/2026-05-26",
    );
  });

  it("压成单段的编号建议与 Markdown 模板应恢复为列表和标题", () => {
    const content =
      "抱歉，我这边尝试调用联网检索，但当前工具面只返回了 WebSearch/WebFetch 的注册信息，没有实际返回新闻搜索结果。为了避免编造“今日新闻”，我不能直接给出未经核实的国际新闻摘要。你可以任选一种方式继续： 1. 你发我几个新闻链接或截图，我帮你整理成： - 今日国际要闻摘要 - 按地区/主题分类 - 每条一句话版 - 适合朋友圈/日报/会议简报的版本 2. 你复制一段新闻列表过来，我可以快速压缩成一页简报。 3. 如果联网工具恢复，我可以按这个结构帮你整理： ## 今日国际新闻简报模板### 一、地缘政治与冲突-事件：-关键进展：-影响：### 二、国际外交-事件：-相关国家/组织：-后续看点：### 三、经济与市场-事件：-对全球市场/能源/贸易的影响：### 四、科技与产业-事件：-影响范围：";

    const container = render(content);
    const orderedItems = container.querySelectorAll("ol > li");
    const headings = container.querySelectorAll(
      "[data-markdown-heading-level]",
    );
    const bulletItems = container.querySelectorAll("ul > li");

    expect(orderedItems).toHaveLength(3);
    expect(orderedItems[0]?.textContent).toContain("你发我几个新闻链接或截图");
    expect(orderedItems[1]?.textContent).toContain("你复制一段新闻列表过来");
    expect(orderedItems[2]?.textContent).toContain("如果联网工具恢复");
    expect(headings).toHaveLength(5);
    expect(headings[0]?.textContent).toContain("今日国际新闻简报模板");
    expect(headings[1]?.textContent).toContain("地缘政治与冲突");
    expect(bulletItems.length).toBeGreaterThanOrEqual(8);
    expect(container.textContent).not.toContain("模板### 一");
    expect(container.textContent).not.toContain("继续： 1.");
  });

  it("压成单段的简报应恢复标题、时间口径和分节列表", () => {
    const content =
      "## 今日简报**时间口径：2026 年 6 月 2 日；主要依据可核实来源。---## 一、地缘政治- 第一条事件 来源：[Source A](https://example.com/a)- 第二条事件**观察重点：*局势变化仍需继续关注。---## 任意小节1. 第一项2. 第二项3. 第三项";

    const container = render(content);
    const headings = container.querySelectorAll(
      "[data-markdown-heading-level]",
    );
    const paragraphs = container.querySelectorAll("p");
    const links = container.querySelectorAll("a");
    const orderedItems = container.querySelectorAll("ol > li");
    const bulletItems = container.querySelectorAll("ul > li");

    expect(headings).toHaveLength(3);
    expect(headings[0]?.textContent).toBe("今日简报");
    expect(paragraphs[0]?.textContent).toContain("时间口径");
    expect(links[0]?.getAttribute("href")).toBe("https://example.com/a");
    expect(bulletItems.length).toBeGreaterThanOrEqual(2);
    expect(orderedItems).toHaveLength(3);
    expect(container.textContent).not.toContain("简报**时间口径");
    expect(container.textContent).not.toContain("小节1.");
  });

  it("真实压缩国际新闻简报应恢复来源、标题和影响判断边界", () => {
    const content =
      "## 今日国际新闻简报｜2026年6月2日>口径：根据已检索到的 **NPR、AP News、Al Jazeera** 等公开页面整理；Reuters/BBC 部分页面抓取受限，因此以下以可核验页面内容为主。### 一句话总览今天国际新闻的主线集中在 **中东冲突升级、美伊/伊以相关紧张、刚果 Ebola 疫情、东欧俄乌外溢风险、非洲与拉美政治动态，以及 AI/科技资本市场动向**。---##1. 中东：以色列、黎巴嫩、伊朗、美国相关局势升温- **以色列在黎巴嫩南部和加沙的军事行动继续引发地区紧张。**- NPR 报道称，伊朗因以色列在黎巴嫩、加沙的行动，**暂停与美国的相关谈判**。- Al Jazeera 报道称，伊朗警告以色列在黎巴嫩和加沙的攻击可能威胁美国推动的停火谈判。- AP News 页面头条显示，美国轰炸伊朗军事设施，并拦截伊朗向驻科威特美军发射的导弹。**影响判断：**中东局势正从局部冲突向更广泛的美伊、伊以、以黎关系扩散，短期内会继续影响能源、航运与地区安全预期。---##2.以色列控制周边土地问题引发争议- NPR关注以色列近年来在 **加沙、黎巴嫩、叙利亚邻近区域** 控制土地的问题。-以方称这些区域是安全缓冲区，但以色列国内也有人主张更永久性地扩大边界。**影响判断：**这类“临时安全区”是否长期化，将影响未来停火安排、边境谈判和地区政治格局。---## 今日值得继续关注的3 条主线1. **中东是否进一步升级** 特别是美国、伊朗、以色列、黎巴嫩真主党之间是否出现新一轮军事行动或谈判破裂。2. **刚果 Ebola 疫情是否外溢**重点看 WHO 后续评估、周边国家防控措施，以及疫苗/治疗资源调配。---##主要信息来源- [NPR World News](https://www.npr.org/sections/world/)- [AP News World](https://apnews.com/world-news)- [Al Jazeera News](https://www.aljazeera.com/news/)";

    const container = render(content);
    const headings = Array.from(
      container.querySelectorAll("[data-markdown-heading-level]"),
    ).map((heading) => heading.textContent);
    const bulletItems = Array.from(container.querySelectorAll("ul > li")).map(
      (item) => item.textContent,
    );
    const orderedItems = container.querySelectorAll("ol > li");
    const links = Array.from(container.querySelectorAll("a")).map((link) =>
      link.getAttribute("href"),
    );

    expect(headings).toEqual([
      "今日国际新闻简报｜2026年6月2日",
      "一句话总览",
      "1. 中东：以色列、黎巴嫩、伊朗、美国相关局势升温",
      "2. 以色列控制周边土地问题引发争议",
      "今日值得继续关注的3 条主线",
      "主要信息来源",
    ]);
    expect(container.querySelector("blockquote")?.textContent).toContain(
      "NPR、AP News、Al Jazeera",
    );
    expect(bulletItems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("以色列在黎巴嫩南部和加沙"),
        expect.stringContaining("NPR 报道称"),
        expect.stringContaining("以方称这些区域是安全缓冲区"),
        expect.stringContaining("NPR World News"),
      ]),
    );
    expect(orderedItems).toHaveLength(2);
    expect(links).toEqual([
      "https://www.npr.org/sections/world/",
      "https://apnews.com/world-news",
      "https://www.aljazeera.com/news/",
    ]);
    expect(container.textContent).not.toContain("总览今天");
    expect(container.textContent).not.toContain("升温-");
    expect(container.textContent).not.toContain("导弹。影响判断");
    expect(container.textContent).not.toContain("##主要信息来源");
  });

  it("局部压缩的列表项应在来源、观察重点和后续关注处恢复块级边界", () => {
    const content = [
      "## 二、俄乌战争：联合国呼吁降温",
      "- 联合国强调乌克兰战争需要降级，近期袭击增加 联合国方面警告，乌克兰战事中的袭击活动上升，呼吁各方避免进一步升级。 来源：UN News**观察重点：**俄乌战争仍是欧洲安全核心风险，近期袭击增加意味着谈判空间可能继续收窄，民用基础设施、人道援助与能源供应仍面临压力。",
      "## 三、Gaza、西岸与阿富汗：人道问题持续",
      "- 联合国发布“世界新闻简报”，涉及 Gaza、西岸、阿富汗等地动态 当日联合国简报提及 Gaza、西岸与阿富汗局势。 来源：UN News- Gaza 难民营中以足球活动提供短暂喘息 联合国报道提到，前职业球员组织足球比赛。",
      "## 六、气候与社会议题",
      "- 全球气温预计仍将接近纪录高位 联合国相关机构警告，全球温度仍可能维持在接近历史纪录的水平。- **联合国提醒：禁止儿童使用社交媒体不是唯一答案，平台应“安全设计”** 联合国人权相关报道强调，保护儿童线上安全不能只靠简单禁令。",
      "## 任意后续小节",
      "黎巴嫩—以色列边境是否进一步升级2. Gaza 停火与人道物资准入是否改善3. 俄乌双方袭击频率是否继续上升",
    ].join("\n\n");

    const container = render(content);
    const listItems = Array.from(container.querySelectorAll("li")).map(
      (item) => item.textContent,
    );
    const paragraphs = Array.from(container.querySelectorAll("p")).map(
      (paragraph) => paragraph.textContent,
    );

    expect(listItems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("联合国强调乌克兰战争需要降级"),
        expect.stringContaining("Gaza 难民营中以足球活动"),
        expect.stringContaining("联合国提醒："),
        expect.stringContaining("禁止儿童使用社交媒体"),
        expect.stringContaining("Gaza 停火与人道物资准入是否改善"),
        expect.stringContaining("俄乌双方袭击频率是否继续上升"),
      ]),
    );
    expect(container.textContent).toContain("黎巴嫩—以色列边境是否进一步升级");
    expect(paragraphs).toEqual(
      expect.arrayContaining([
        "观察重点：",
        expect.stringContaining("俄乌战争仍是欧洲安全核心风险"),
      ]),
    );
    expect(container.textContent).not.toContain("UN News观察重点");
    expect(container.textContent).not.toContain("UN News**观察重点");
    expect(container.textContent).not.toContain("UN News- Gaza");
    expect(container.textContent).not.toContain("水平。- 联合国提醒");
    expect(container.textContent).not.toContain("安全设计”**");
    expect(container.textContent).not.toContain("升级2.");
  });

  it("任意标题后的无编号首项和后续编号应按结构恢复", () => {
    const content = "## 任意标题\n\n第一项内容2. 第二项内容3. 第三项内容";

    const container = render(content);
    const listItems = Array.from(container.querySelectorAll("li")).map(
      (item) => item.textContent,
    );

    expect(listItems).toEqual(["第一项内容", "第二项内容", "第三项内容"]);
    expect(container.textContent).not.toContain("内容2.");
    expect(container.textContent).not.toContain("内容3.");
  });

  it("不应改写代码块里的紧凑竖线文本", () => {
    const content = [
      "```text",
      "| 事件 | 要点 ||------|| 示例 | 保持原文 |",
      "```",
    ].join("\n");

    const container = render(content);

    expect(
      container.querySelector('[data-testid="markdown-table-scroll"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="markdown-plain-code-block"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("||------||");
  });

  it("长文报告块应渲染标题层级、引用卡与分隔线", () => {
    const content = [
      "# Hermes Engine 选型建议",
      "",
      "这是导语段，用来概括结论与适用范围。",
      "",
      "## 为什么优先考虑它",
      "",
      "> 结论先行：优先保证稳定交付，再谈极限性能。",
      "",
      "---",
      "",
      "### 对比表",
      "",
      "| 方案 | 优势 |",
      "| --- | --- |",
      "| A | 稳定 |",
    ].join("\n");

    const container = render(content);

    expect(
      container.querySelector('h1[data-markdown-heading-level="1"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('h2[data-markdown-heading-level="2"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="markdown-blockquote-card"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="markdown-divider"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="markdown-table-scroll"]'),
    ).not.toBeNull();
  });

  it("聊天内联 A2UI 应使用紧凑卡片尺寸", () => {
    const content = [
      "```a2ui",
      JSON.stringify({
        id: "a2ui-demo",
        root: "root",
        data: {},
        components: [
          {
            id: "root",
            component: "Text",
            text: "请选择开始方式",
            variant: "body",
          },
        ],
      }),
      "```",
    ].join("\n");

    const container = render(content);
    const card = container.querySelector('[data-testid="a2ui-task-card"]');

    expect(card?.getAttribute("data-compact")).toBe("true");
    expect(card?.className).toContain("max-w-[432px]");
  });

  it("历史 Markdown A2UI 代码块应只读回显并移除提交回调", () => {
    const content = [
      "```a2ui",
      JSON.stringify({
        id: "history-a2ui-demo",
        root: "root",
        data: {},
        components: [
          {
            id: "root",
            component: "Text",
            text: "历史表单",
            variant: "body",
          },
        ],
        submitAction: { label: "提交", action: { name: "submit" } },
      }),
      "```",
    ].join("\n");

    const container = render(content, { readOnlyA2UI: true });
    const card = container.querySelector('[data-testid="a2ui-task-card"]');

    expect(card?.getAttribute("data-preview")).toBe("true");
    expect(card?.getAttribute("data-has-on-submit")).toBe("no");
  });

  it("标题后的正文应保持聊天正文排版，不应缩小变灰", () => {
    const container = document.createElement("div");
    container.style.setProperty("--foreground", "17 24 39");
    container.style.setProperty("--muted-foreground", "100 116 139");
    container.style.fontSize = "15px";
    container.style.lineHeight = "1.7";
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <MarkdownRenderer
          content={"## 小结\n\n这段正文应该和聊天正文保持同一字号与主色。"}
        />,
      );
    });

    mountedRoots.push({ container, root });

    const heading = container.querySelector(
      'h2[data-markdown-heading-level="2"]',
    );
    const paragraph = container.querySelector("p");

    expect(heading).not.toBeNull();
    expect(paragraph).not.toBeNull();
    expect(getComputedStyle(paragraph as Element).fontSize).toBe("1em");
    expect(document.head.textContent).not.toContain("h1 + p");
    expect(document.head.textContent).not.toContain("h2 + p");
    expect(document.head.textContent).not.toContain("h3 + p");
  });

  it("非流式时应保留 raw html 渲染能力", () => {
    const content = [
      "前置文本",
      "",
      '<div class="rendered-html">原始 HTML</div>',
      "",
      "后置文本",
    ].join("\n");

    const container = render(content);

    expect(container.querySelector(".rendered-html")).not.toBeNull();
    expect(container.textContent).toContain("原始 HTML");
  });

  it("大段流式输出时应跳过 raw html 重解析", () => {
    const content = [
      "A".repeat(2_200),
      "",
      '<div class="rendered-html">原始 HTML</div>',
      "",
      "结尾文本",
    ].join("\n");

    const container = render(content, { isStreaming: true });

    expect(container.querySelector(".rendered-html")).toBeNull();
    expect(container.textContent).toContain("结尾文本");
  });

  it("流式结束后应立即恢复完整 raw html 渲染", () => {
    vi.useFakeTimers();
    const content = [
      "A".repeat(2_200),
      "",
      '<div class="rendered-html">原始 HTML</div>',
      "",
      "结尾文本",
    ].join("\n");

    const { container, rerender } = renderHarness(content, {
      isStreaming: true,
    });
    expect(container.querySelector(".rendered-html")).toBeNull();

    rerender(content, { isStreaming: false });
    expect(container.querySelector(".rendered-html")).not.toBeNull();
  });

  it("持续流式输出时应周期性刷新正文，而不是等到停止后才一起出现", () => {
    vi.useFakeTimers();
    const { container, rerender } = renderHarness("第一行", {
      isStreaming: true,
    });

    act(() => {
      vi.advanceTimersByTime(10);
    });
    rerender("第一行\n第二行", { isStreaming: true });

    act(() => {
      vi.advanceTimersByTime(10);
    });
    rerender("第一行\n第二行\n第三行", { isStreaming: true });

    act(() => {
      vi.advanceTimersByTime(10);
    });
    rerender("第一行\n第二行\n第三行\n第四行", { isStreaming: true });

    act(() => {
      vi.advanceTimersByTime(8);
    });

    expect(container.textContent).toContain("第三行");
    expect(container.textContent).not.toBe("第一行");
  });

  it("逐块判定返回 false 时应保持对话内联代码渲染", () => {
    const shouldCollapseCodeBlock = vi.fn(() => false);
    const content = ["```ts", "const answer = 42;", "```"].join("\n");

    const container = render(content, {
      collapseCodeBlocks: true,
      shouldCollapseCodeBlock,
    });

    expect(shouldCollapseCodeBlock).toHaveBeenCalledWith(
      "ts",
      "const answer = 42;",
    );
    expect(
      container.querySelector('[data-testid="artifact-placeholder"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="syntax-highlighter"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("const answer = 42;");
  });

  it("代码块高亮应关闭 textShadow 与字体连字，避免中英混排发虚", () => {
    const content = ["```typescript", "const answer = 42;", "```"].join("\n");

    const container = render(content);
    const syntaxHighlighter = container.querySelector(
      '[data-testid="syntax-highlighter"]',
    );

    expect(syntaxHighlighter?.getAttribute("data-text-shadow")).toBe("none");
    expect(syntaxHighlighter?.getAttribute("data-font-ligatures")).toBe("none");
    expect(syntaxHighlighter?.getAttribute("data-font-family")).toContain(
      "ui-monospace",
    );
  });

  it("代码块应改用浅色主题与浅底容器，避免整片黑底压过正文", () => {
    const content = ["```typescript", "const answer = 42;", "```"].join("\n");

    const container = render(content);
    const syntaxHighlighter = container.querySelector(
      '[data-testid="syntax-highlighter"]',
    );
    const codeBlock = container.querySelector(
      '[data-testid="markdown-syntax-code-block"]',
    );

    expect(syntaxHighlighter?.getAttribute("data-theme")).toBe("light");
    expect(codeBlock).not.toBeNull();
    const backgroundColor = getComputedStyle(
      codeBlock as HTMLElement,
    ).backgroundColor;
    const rgbMatch = /rgb\((\d+), (\d+), (\d+)\)/.exec(backgroundColor);
    expect(rgbMatch).not.toBeNull();
    const [, red = "0", green = "0", blue = "0"] = rgbMatch ?? [];
    expect(Number(red)).toBeGreaterThanOrEqual(240);
    expect(Number(green)).toBeGreaterThanOrEqual(240);
    expect(Number(blue)).toBeGreaterThanOrEqual(240);
  });

  it("inline code 应单独标记，块级代码不应再继承胶囊样式", () => {
    const content = [
      "行内 `npm run dev`",
      "",
      "```ts",
      "const answer = 42;",
      "```",
    ].join("\n");

    const container = render(content);
    const inlineCode = container.querySelector('code[data-inline-code="true"]');
    const blockCode = container.querySelector(
      '[data-testid="syntax-highlighter-code"]',
    );

    expect(inlineCode?.textContent).toContain("npm run dev");
    expect(blockCode?.getAttribute("data-inline-code")).toBe("undefined");
    expect(blockCode?.getAttribute("data-display")).toBe("block");
    expect(blockCode?.getAttribute("data-padding")).toBe("0");
    expect(blockCode?.getAttribute("data-border")).toBe("none");
    expect(blockCode?.getAttribute("data-border-radius")).toBe("0");
    expect(blockCode?.getAttribute("data-background")).toBe("transparent");
    expect(blockCode?.getAttribute("data-color")).toBe("inherit");
  });

  it("代码块语言解析应兼容大小写与常见别名", () => {
    const content = ["```SHELL", "echo hello", "```"].join("\n");

    const container = render(content);
    const syntaxHighlighter = container.querySelector(
      '[data-testid="syntax-highlighter"]',
    );

    expect(syntaxHighlighter?.getAttribute("data-language")).toBe("bash");
    expect(container.textContent).toContain("bash");
    expect(container.textContent).toContain("1 行");
  });

  it("显式 flow 代码块应渲染为流程视图而不是语法高亮", () => {
    const content = [
      "```flow",
      '用户操作 -> 点击"添加模型"',
      "↓",
      "选择服务商 -> 下拉选择 (OpenAI/Claude/自定义 API)",
      "↓",
      "填写信息 -> API Key、Base URL、模型（可选）",
      "```",
    ].join("\n");

    const container = render(content);

    expect(
      container.querySelector('[data-testid="markdown-flow-code-block"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="syntax-highlighter"]'),
    ).toBeNull();
    expect(container.textContent).toContain("5 行");
  });

  it("text 代码块即使包含流程箭头也应保持普通文本视图", () => {
    const content = [
      "```text",
      '用户操作 -> 点击"添加模型"',
      "↓",
      "选择服务商 -> 下拉选择 (OpenAI/Claude/自定义 API)",
      "↓",
      "填写信息 -> API Key、Base URL、模型（可选）",
      "```",
    ].join("\n");

    const container = render(content);

    expect(
      container.querySelector('[data-testid="markdown-flow-code-block"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="markdown-plain-code-block"]'),
    ).not.toBeNull();
  });

  it("带箭头的 Markdown 大纲代码块不应误渲染为流程胶囊", () => {
    const content = [
      "```",
      "导出 PDF / 分享",
      "↓",
      "---",
      "## 11.5 余料管理页面",
      "### 列表字段",
      "- 余料编号；",
      "- 图片；",
      "- 分类；",
      "↓",
      "## 12. AI 能力规划",
      "- 图像识别；",
      "- 图像生成；",
      "```",
    ].join("\n");

    const container = render(content);

    expect(
      container.querySelector('[data-testid="markdown-flow-code-block"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="markdown-plain-code-block"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("12 行");
    expect(container.textContent).toContain("## 11.5 余料管理页面");
  });

  it("伪代码目录块即使标注为 typescript 也应降级为纯文本视图", () => {
    const content = [
      "```typescript",
      "- AppLayout (应用主布局: Sidebar + Header + Content)",
      "- Sidebar (侧边导航栏)",
      "- Header (顶部导航栏)",
      "- PageHeader (页面标题与操作区)",
      "- ContentContainer (内容容器)",
      "- EmptyState (空状态占位)",
      "```",
    ].join("\n");

    const container = render(content);
    const plainBlock = container.querySelector(
      '[data-testid="markdown-plain-code-block"]',
    );

    expect(plainBlock).not.toBeNull();
    expect(
      plainBlock?.querySelector('[data-testid="markdown-plain-code-content"]'),
    ).not.toBeNull();
    expect(plainBlock?.querySelector("pre")).toBeNull();
    expect(
      container.querySelector('[data-testid="syntax-highlighter"]'),
    ).toBeNull();
    expect(container.textContent).toContain("AppLayout");
    expect(container.textContent).toContain("6 行");
  });

  it("逐块判定返回 true 时才应渲染 artifact 占位卡", () => {
    const content = ["```tsx", "export default function Demo() {}", "```"].join(
      "\n",
    );

    const container = render(content, {
      collapseCodeBlocks: true,
      shouldCollapseCodeBlock: () => true,
    });

    expect(
      container.querySelector('[data-testid="artifact-placeholder"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="syntax-highlighter"]'),
    ).toBeNull();
  });
});
