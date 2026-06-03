import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createMockAgentChatUnifiedState,
  flushEffects,
  getIndexTestMocks,
  mockBrowserAssistCompletedSession,
  mountPage,
  observedWorkspaceIds,
  renderPage,
} from "./index.testFixtures";
import * as fileBrowserModule from "@/lib/api/fileBrowser";
import * as webviewApiModule from "@/lib/webview-api";

const {
  mockCanvasWorkbenchLayout,
  mockCanvasWorkbenchLayoutState,
  mockJotaiState,
  mockMessageList,
  mockToast,
  mockUseAgentChatUnified,
  mockUseSessionFiles,
} = getIndexTestMocks();

describe("AgentChatPage 通用工作台", { timeout: 20_000 }, () => {
  it("历史旧导出结果与同会话新到的 saved_content 都不应自动打开画布，应等待用户手动点开", async () => {
    mockCanvasWorkbenchLayoutState.renderPreview = true;
    vi.spyOn(fileBrowserModule, "readFilePreview").mockResolvedValue({
      path: "/tmp/project-site-export/exports/x-article-export/latest/index.md",
      content: "# 最新导出\n\n![封面](images/cover.png)",
      isBinary: false,
      size: 42,
      error: null,
    });

    let messages = [
      {
        id: "msg-site-user-1",
        role: "user" as const,
        content: "帮我导出这篇 X 长文",
        timestamp: new Date("2026-04-08T10:00:00.000Z"),
      },
      {
        id: "msg-site-assistant-old",
        role: "assistant" as const,
        content: "历史导出已完成",
        timestamp: new Date("2026-04-08T10:00:01.000Z"),
        toolCalls: [
          {
            id: "tool-site-old",
            name: "site_run_adapter",
            status: "completed" as const,
            startTime: new Date("2026-04-08T10:00:01.100Z"),
            endTime: new Date("2026-04-08T10:00:02.000Z"),
            result: {
              success: true,
              output: "ok",
              metadata: {
                tool_family: "site",
                saved_content: {
                  content_id: "content-site-export",
                  project_id: "project-site-export",
                  markdown_relative_path:
                    "exports/x-article-export/history/index.md",
                },
              },
            },
          },
        ],
      },
    ];

    mockUseAgentChatUnified.mockImplementation(
      ({ workspaceId }: { workspaceId: string }) => {
        observedWorkspaceIds.push(workspaceId);
        return createMockAgentChatUnifiedState({
          messages,
          sessionId: "session-site-export",
        });
      },
    );

    const mounted = mountPage({
      projectId: "project-site-export",
      contentId: "content-site-export",
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    expect(fileBrowserModule.readFilePreview).not.toHaveBeenCalled();
    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");

    messages = [
      ...messages,
      {
        id: "msg-site-assistant-new",
        role: "assistant" as const,
        content: "最新导出已完成",
        timestamp: new Date("2099-04-09T12:00:01.000Z"),
        toolCalls: [
          {
            id: "tool-site-new",
            name: "site_run_adapter",
            status: "completed" as const,
            startTime: new Date("2099-04-09T12:00:01.100Z"),
            endTime: new Date("2099-04-09T12:00:02.000Z"),
            result: {
              success: true,
              output: "ok",
              metadata: {
                tool_family: "site",
                saved_content: {
                  content_id: "content-site-export",
                  project_id: "project-site-export",
                  markdown_relative_path:
                    "exports/x-article-export/latest/index.md",
                },
              },
            },
          },
        ],
      },
    ];

    mounted.rerender({});
    await flushEffects(12);

    expect(fileBrowserModule.readFilePreview).not.toHaveBeenCalled();
    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
  });

  it("历史任务携带 initialProjectFileOpenTarget 时应直接恢复真实 Markdown 文件预览", async () => {
    mockCanvasWorkbenchLayoutState.renderPreview = true;
    vi.spyOn(fileBrowserModule, "readFilePreview").mockResolvedValue({
      path: "/tmp/project-history-export/exports/x-article-export/history/index.md",
      content: "# 历史导出\n\n![插图](images/history-cover.png)",
      isBinary: false,
      size: 52,
      error: null,
    });

    const container = renderPage({
      projectId: "project-history-export",
      contentId: "content-history-export",
      theme: "general",
      lockTheme: true,
      initialProjectFileOpenTarget: {
        relativePath: "exports/x-article-export/history/index.md",
        requestKey: 20260409,
      },
    });
    await flushEffects(12);

    expect(fileBrowserModule.readFilePreview).toHaveBeenCalledTimes(1);
    expect(fileBrowserModule.readFilePreview).toHaveBeenCalledWith(
      "/tmp/project-history-export/exports/x-article-export/history/index.md",
      64 * 1024,
    );
    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat-canvas");

    const generalCanvas = container.querySelector(
      '[data-testid="general-canvas"]',
    ) as HTMLDivElement | null;
    expect(generalCanvas).not.toBeNull();
    expect(generalCanvas?.dataset.filename).toBe(
      "exports/x-article-export/history/index.md",
    );
    expect(generalCanvas?.dataset.baseFilePath).toBe(
      "/tmp/project-history-export/exports/x-article-export/history/index.md",
    );
    expect(generalCanvas?.dataset.contentType).toBe("markdown");
    expect(generalCanvas?.dataset.content || "").toContain(
      "![插图](images/history-cover.png)",
    );
    expect(
      container.querySelector('[data-testid="artifact-renderer"]'),
    ).toBeNull();
  });

  it("同项目内打开 saved site content 时应直接恢复真实 Markdown 文件预览", async () => {
    mockCanvasWorkbenchLayoutState.renderPreview = true;
    vi.spyOn(fileBrowserModule, "readFilePreview").mockResolvedValue({
      path: "/tmp/project-inline-export/exports/x-article-export/latest/index.md",
      content: "# 当前导出\n\n![封面](images/cover.png)",
      isBinary: false,
      size: 43,
      error: null,
    });

    const onNavigate = vi.fn();
    const container = renderPage({
      projectId: "project-inline-export",
      theme: "general",
      lockTheme: true,
      onNavigate,
    });
    await flushEffects(10);

    const latestMessageListProps = mockMessageList.mock.calls.at(-1)?.[0] as
      | {
          onOpenSavedSiteContent?: (target: {
            projectId: string;
            contentId: string;
            preferredTarget: "project_file" | "content";
            projectFile?: {
              relativePath?: string | null;
            } | null;
          }) => void | Promise<void>;
        }
      | undefined;

    await act(async () => {
      await latestMessageListProps?.onOpenSavedSiteContent?.({
        projectId: "project-inline-export",
        contentId: "content-inline-export",
        preferredTarget: "project_file",
        projectFile: {
          relativePath: "exports/x-article-export/latest/index.md",
        },
      });
    });
    await flushEffects(12);

    expect(onNavigate).not.toHaveBeenCalled();
    expect(fileBrowserModule.readFilePreview).toHaveBeenCalledWith(
      "/tmp/project-inline-export/exports/x-article-export/latest/index.md",
      64 * 1024,
    );
    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat-canvas");

    const generalCanvas = container.querySelector(
      '[data-testid="general-canvas"]',
    ) as HTMLDivElement | null;
    expect(generalCanvas).not.toBeNull();
    expect(generalCanvas?.dataset.filename).toBe(
      "exports/x-article-export/latest/index.md",
    );
    expect(generalCanvas?.dataset.baseFilePath).toBe(
      "/tmp/project-inline-export/exports/x-article-export/latest/index.md",
    );
    expect(generalCanvas?.dataset.contentType).toBe("markdown");
    expect(generalCanvas?.dataset.content || "").toContain(
      "![封面](images/cover.png)",
    );
  });

  it("工具结果只提供文件路径时应读取真实文件预览再打开通用画布", async () => {
    mockCanvasWorkbenchLayoutState.renderPreview = true;
    vi.spyOn(fileBrowserModule, "readFilePreview").mockResolvedValue({
      path: "/tmp/project-tool-file/src/components/App.tsx",
      content: "export function App() {\n  return <main>Lime</main>;\n}\n",
      isBinary: false,
      size: 56,
      error: null,
    });

    const container = renderPage({
      projectId: "project-tool-file",
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    const latestMessageListProps = mockMessageList.mock.calls.at(-1)?.[0] as
      | {
          onFileClick?: (fileName: string, content: string) => void;
        }
      | undefined;

    act(() => {
      latestMessageListProps?.onFileClick?.("src/components/App.tsx", "");
    });
    await flushEffects(12);

    expect(fileBrowserModule.readFilePreview).toHaveBeenCalledWith(
      "/tmp/project-tool-file/src/components/App.tsx",
      64 * 1024,
    );
    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat-canvas");

    const generalCanvas = container.querySelector(
      '[data-testid="general-canvas"]',
    ) as HTMLDivElement | null;
    expect(generalCanvas).not.toBeNull();
    expect(generalCanvas?.dataset.filename).toBe("src/components/App.tsx");
    expect(generalCanvas?.dataset.baseFilePath).toBe(
      "/tmp/project-tool-file/src/components/App.tsx",
    );
    expect(generalCanvas?.dataset.contentType).toBe("code");
    expect(generalCanvas?.dataset.content || "").toContain(
      "return <main>Lime</main>;",
    );
  });

  it("点击执行卡片里的结果文件按钮时应打开真实导出 Markdown 预览", async () => {
    mockCanvasWorkbenchLayoutState.renderPreview = true;
    vi.spyOn(webviewApiModule, "siteRunAdapter").mockResolvedValue({
      ok: true,
      adapter: "x/article-export",
      domain: "x.com",
      profile_key: "attached-x",
      session_id: "session-browser-1",
      target_id: "target-1",
      entry_url: "https://x.com/GoogleCloudTech/article/2033953579824758855",
      source_url: "https://x.com/GoogleCloudTech/article/2033953579824758855",
      saved_content: {
        content_id: "content-inline-export",
        project_id: "project-inline-export",
        title: "Google Cloud Tech 文章导出",
        markdown_relative_path: "exports/x-article-export/latest/index.md",
      },
      saved_by: "context_content",
    });
    vi.spyOn(fileBrowserModule, "readFilePreview").mockResolvedValue({
      path: "/tmp/project-inline-export/exports/x-article-export/latest/index.md",
      content: "# 当前导出\n\n![封面](images/cover.png)",
      isBinary: false,
      size: 43,
      error: null,
    });

    const container = renderPage({
      projectId: "project-inline-export",
      contentId: "content-inline-export",
      theme: "general",
      lockTheme: true,
      initialSiteSkillLaunch: {
        adapterName: "x/article-export",
        args: {
          postUrl: "https://x.com/GoogleCloudTech/article/2033953579824758855",
        },
        autoRun: true,
        profileKey: "attached-x",
        requireAttachedSession: true,
        skillTitle: "X 文章转存",
      },
    });
    await flushEffects(12);

    const button = container.querySelector(
      '[data-testid="service-skill-execution-open-saved-content"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    act(() => {
      button?.click();
    });
    await flushEffects(12);

    expect(fileBrowserModule.readFilePreview).toHaveBeenCalledWith(
      "/tmp/project-inline-export/exports/x-article-export/latest/index.md",
      64 * 1024,
    );
    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat-canvas");

    const generalCanvas = container.querySelector(
      '[data-testid="general-canvas"]',
    ) as HTMLDivElement | null;
    expect(generalCanvas).not.toBeNull();
    expect(generalCanvas?.dataset.filename).toBe(
      "exports/x-article-export/latest/index.md",
    );
    expect(generalCanvas?.dataset.baseFilePath).toBe(
      "/tmp/project-inline-export/exports/x-article-export/latest/index.md",
    );
    expect(generalCanvas?.dataset.content || "").toContain(
      "![封面](images/cover.png)",
    );
  });

  it("真实导出路径打开失败时不应回退到裸 index.md 任务文件", async () => {
    mockCanvasWorkbenchLayoutState.renderPreview = true;
    mockUseSessionFiles.mockReturnValue({
      saveFile: vi.fn(async () => undefined),
      files: [
        {
          name: "index.md",
          fileType: "document",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      readFile: vi.fn(async (name: string) =>
        name === "index.md" ? "# 过程文件\n\n这不是正式导出。" : null,
      ),
      meta: null,
    });
    vi.spyOn(webviewApiModule, "siteRunAdapter").mockResolvedValue({
      ok: true,
      adapter: "x/article-export",
      domain: "x.com",
      profile_key: "attached-x",
      session_id: "session-browser-1",
      target_id: "target-1",
      entry_url: "https://x.com/GoogleCloudTech/article/2033953579824758855",
      source_url: "https://x.com/GoogleCloudTech/article/2033953579824758855",
      saved_content: {
        content_id: "content-inline-export",
        project_id: "project-inline-export",
        title: "Google Cloud Tech 文章导出",
        markdown_relative_path: "exports/x-article-export/latest/index.md",
      },
      saved_by: "context_content",
    });
    vi.spyOn(fileBrowserModule, "readFilePreview").mockResolvedValue({
      path: "/tmp/project-inline-export/exports/x-article-export/latest/index.md",
      content: null,
      isBinary: false,
      size: 0,
      error: "ENOENT: no such file or directory",
    });

    const container = renderPage({
      projectId: "project-inline-export",
      contentId: "content-inline-export",
      theme: "general",
      lockTheme: true,
      initialSiteSkillLaunch: {
        adapterName: "x/article-export",
        args: {
          postUrl: "https://x.com/GoogleCloudTech/article/2033953579824758855",
        },
        autoRun: true,
        profileKey: "attached-x",
        requireAttachedSession: true,
        skillTitle: "X 文章转存",
      },
    });
    await flushEffects(14);

    const button = container.querySelector(
      '[data-testid="service-skill-execution-open-saved-content"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    act(() => {
      button?.click();
    });
    await flushEffects(12);

    expect(fileBrowserModule.readFilePreview).toHaveBeenCalledWith(
      "/tmp/project-inline-export/exports/x-article-export/latest/index.md",
      64 * 1024,
    );
    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(mockToast.error).toHaveBeenCalledWith(
      "打开导出文件失败: ENOENT: no such file or directory",
    );
    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
    expect(
      container.querySelector('[data-testid="general-canvas"]'),
    ).toBeNull();
  });

  it("浏览器工具返回真实会话后不应再自动打开浏览器协助画布", async () => {
    mockBrowserAssistCompletedSession();

    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
    expect(mockJotaiState.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "browser-assist:general",
          type: "browser_assist",
          title: "Rokid",
          meta: expect.objectContaining({
            sessionId: "browser-session-1",
            profileKey: "general_browser_assist",
            url: "https://www.rokid.com",
          }),
        }),
      ]),
    );
    expect(
      container.querySelector('[data-testid="canvas-workbench-layout-mock"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="artifact-renderer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="artifact-toolbar"]'),
    ).toBeNull();
    expect(mockCanvasWorkbenchLayout).not.toHaveBeenCalled();
  });

});
