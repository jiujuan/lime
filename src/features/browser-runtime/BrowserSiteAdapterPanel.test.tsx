import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  changeInputValue,
  cleanupMountedBrowserSiteAdapterPanels,
  clickButtonByText,
  createBrowserProfile,
  createCatalogStatus,
  createChromeBridgeStatus,
  createChromeObserver,
  createProject,
  createSiteAdapter,
  createSiteRecommendation,
  createSiteRunResult,
  createZhihuAdapter,
  findInputByPlaceholder,
  flushMicrotasks,
  renderPanel,
} from "./browserSiteAdapterPanelTestFixtures";

const {
  mockSiteListAdapters,
  mockSiteRecommendAdapters,
  mockSiteGetAdapterCatalogStatus,
  mockGetChromeBridgeStatus,
  mockListBrowserProfiles,
  mockSiteRunAdapter,
  mockSiteSaveAdapterResult,
  mockListProjects,
  mockGetStoredResourceProjectId,
  mockSetStoredResourceProjectId,
  mockOnResourceProjectChange,
  mockSubscribeSiteAdapterCatalogChanged,
} = vi.hoisted(() => ({
  mockSiteListAdapters: vi.fn(),
  mockSiteRecommendAdapters: vi.fn(),
  mockSiteGetAdapterCatalogStatus: vi.fn(),
  mockGetChromeBridgeStatus: vi.fn(),
  mockListBrowserProfiles: vi.fn(),
  mockSiteRunAdapter: vi.fn(),
  mockSiteSaveAdapterResult: vi.fn(),
  mockListProjects: vi.fn(),
  mockGetStoredResourceProjectId: vi.fn(),
  mockSetStoredResourceProjectId: vi.fn(),
  mockOnResourceProjectChange: vi.fn(),
  mockSubscribeSiteAdapterCatalogChanged: vi.fn(),
}));

vi.mock("./api", () => ({
  browserRuntimeApi: {
    siteListAdapters: mockSiteListAdapters,
    siteRecommendAdapters: mockSiteRecommendAdapters,
    siteGetAdapterCatalogStatus: mockSiteGetAdapterCatalogStatus,
    getChromeBridgeStatus: mockGetChromeBridgeStatus,
    listBrowserProfiles: mockListBrowserProfiles,
    siteRunAdapter: mockSiteRunAdapter,
    siteSaveAdapterResult: mockSiteSaveAdapterResult,
  },
}));

vi.mock("@/lib/api/project", () => ({
  listProjects: mockListProjects,
}));

vi.mock("@/lib/resourceProjectSelection", () => ({
  getStoredResourceProjectId: mockGetStoredResourceProjectId,
  setStoredResourceProjectId: mockSetStoredResourceProjectId,
  onResourceProjectChange: mockOnResourceProjectChange,
}));

vi.mock("@/lib/siteAdapterCatalogBootstrap", () => ({
  subscribeSiteAdapterCatalogChanged: mockSubscribeSiteAdapterCatalogChanged,
}));

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");

  mockSiteListAdapters.mockResolvedValue([createSiteAdapter()]);
  mockSiteRecommendAdapters.mockResolvedValue([createSiteRecommendation()]);
  mockSiteGetAdapterCatalogStatus.mockResolvedValue(createCatalogStatus());
  mockListBrowserProfiles.mockResolvedValue([createBrowserProfile()]);
  mockGetChromeBridgeStatus.mockResolvedValue(createChromeBridgeStatus());
  mockSiteRunAdapter.mockImplementation(async (request) => ({
    ...createSiteRunResult(),
    saved_content:
      request.content_id || request.project_id
        ? {
            content_id: request.content_id || "content-auto-1",
            project_id: request.project_id || "project-1",
            title: request.content_id
              ? "当前主稿"
              : request.save_title ||
                "站点采集 github/search 2026-03-25 12:00:00",
          }
        : undefined,
    saved_project_id:
      request.project_id || (request.content_id ? "project-1" : undefined),
    saved_by: request.content_id
      ? "explicit_content"
      : request.project_id
        ? "explicit_project"
        : undefined,
  }));
  mockListProjects.mockResolvedValue([
    createProject(),
    createProject({
      id: "project-2",
      name: "竞品情报",
      rootPath: "/tmp/project-2",
      isDefault: false,
    }),
  ]);
  mockSiteSaveAdapterResult.mockImplementation(async (request) => ({
    content_id: request.content_id || "content-1",
    project_id: request.project_id || "project-1",
    title: request.content_id
      ? "当前主稿"
      : request.save_title || "站点采集 github/search 2026-03-25 12:00:00",
  }));
  mockGetStoredResourceProjectId.mockReturnValue("project-2");
  mockSetStoredResourceProjectId.mockImplementation(() => undefined);
  mockOnResourceProjectChange.mockImplementation(() => () => undefined);
  mockSubscribeSiteAdapterCatalogChanged.mockImplementation(() => vi.fn());
});

afterEach(() => {
  cleanupMountedBrowserSiteAdapterPanels();
  vi.clearAllMocks();
});

describe("BrowserSiteAdapterPanel", () => {
  it("工作台模式应支持把站点结果保存到资源项目", async () => {
    const onMessage = vi.fn();
    const onNavigate = vi.fn();
    const container = await renderPanel({ onMessage, onNavigate });

    expect(container.textContent).toContain("站点采集工作台");
    expect(container.textContent).toContain("竞品情报");
    expect(container.textContent).toContain("目录来源：服务端同步");
    expect(container.textContent).toContain("目录版本：tenant-sync-1");
    expect(container.textContent).toContain("租户：tenant-demo");
    expect(container.textContent).toContain("生效适配器：1");
    expect(container.textContent).toContain("服务端目录项：1");
    expect(container.textContent).toContain("推荐适配器");
    expect(container.textContent).toContain("已匹配标签页");

    await clickButtonByText(container, "执行站点命令");

    expect(container.textContent).toContain("执行成功");
    expect(container.textContent).toContain("返回 1 条结构化记录");
    expect(mockSiteRunAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter_name: "github/search",
        profile_key: "general_browser_assist",
        project_id: "project-2",
        save_title: "站点采集 github/search · model context protocol",
        args: expect.objectContaining({
          query: "model context protocol",
          limit: 5,
        }),
      }),
    );
    expect(mockSiteSaveAdapterResult).not.toHaveBeenCalled();
    expect(mockSetStoredResourceProjectId).toHaveBeenCalledWith("project-2", {
      source: "browser-runtime",
      emitEvent: true,
    });
    expect(onMessage).toHaveBeenNthCalledWith(1, {
      type: "success",
      text: "站点命令 github/search 执行完成，已保存到资源项目：竞品情报",
    });
    expect(container.textContent).toContain(
      "已保存：站点采集 github/search · model context protocol · 竞品情报",
    );

    await clickButtonByText(container, "打开已保存内容");

    expect(onNavigate).toHaveBeenCalledWith("agent", {
      projectId: "project-2",
      contentId: "content-auto-1",
      lockTheme: true,
      fromResources: true,
    });

    const saveTitleInput = findInputByPlaceholder(
      container,
      "留空则自动生成标题",
    );
    expect(saveTitleInput.value).toBe(
      "站点采集 github/search · model context protocol",
    );

    await changeInputValue(saveTitleInput, "GitHub MCP 自定义标题");
    await clickButtonByText(container, "结果文档");

    expect(mockSiteSaveAdapterResult).toHaveBeenCalledTimes(1);
    expect(mockSiteSaveAdapterResult).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        project_id: "project-2",
        save_title: "GitHub MCP 自定义标题",
        run_request: expect.objectContaining({
          adapter_name: "github/search",
          profile_key: "general_browser_assist",
          args: expect.objectContaining({
            query: "model context protocol",
            limit: 5,
          }),
        }),
        result: expect.objectContaining({
          adapter: "github/search",
          profile_key: "general_browser_assist",
        }),
      }),
    );
    expect(onMessage).toHaveBeenNthCalledWith(2, {
      type: "success",
      text: "已保存站点结果到资源项目：竞品情报",
    });
    expect(container.textContent).toContain("已保存：GitHub MCP 自定义标题");
  });

  it("未显式指定 profile_key 时应优先选择已连接的 existing_session 资料", async () => {
    mockListBrowserProfiles.mockResolvedValueOnce([
      createBrowserProfile({
        id: "profile-research",
        profile_key: "research_attach",
        name: "研究附着资料",
        description: "当前 Chrome",
        site_scope: null,
        launch_url: "https://github.com",
        transport_kind: "existing_session",
        profile_dir: "",
        managed_profile_dir: null,
      }),
      createBrowserProfile(),
    ]);
    mockGetChromeBridgeStatus.mockResolvedValueOnce(
      createChromeBridgeStatus({
      observer_count: 1,
        observers: [createChromeObserver()],
      }),
    );

    const container = await renderPanel({ selectedProfileKey: undefined });
    expect(container.textContent).toContain("当前将使用：research_attach");
    expect(container.textContent).toContain("已优先选择：");
    expect(container.textContent).toContain("研究附着资料");
    expect(container.textContent).toContain("模式：existing_session");

    await clickButtonByText(container, "执行站点命令");

    expect(mockSiteRunAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_key: "research_attach",
      }),
    );
  });

  it("点击推荐适配器后应切换当前适配器与推荐资料", async () => {
    mockSiteListAdapters.mockResolvedValueOnce([
      createSiteAdapter({ capabilities: ["search", "repository", "research"] }),
      createZhihuAdapter(),
    ]);
    mockSiteRecommendAdapters.mockResolvedValueOnce([
      createSiteRecommendation({
        adapter: createZhihuAdapter(),
        reason:
          "资料 知乎附着资料 已绑定站点范围 www.zhihu.com，可优先作为该适配器的执行上下文。",
        profile_key: "zhihu_attach",
        target_id: undefined,
        entry_url: "https://www.zhihu.com/search?type=content&q=AI%20Agent",
        score: 75,
      }),
    ]);
    mockListBrowserProfiles.mockResolvedValueOnce([
      createBrowserProfile(),
      createBrowserProfile({
        id: "profile-2",
        profile_key: "zhihu_attach",
        name: "知乎附着资料",
        description: "知乎登录态",
        site_scope: "www.zhihu.com",
        launch_url: "https://www.zhihu.com",
        transport_kind: "existing_session",
        profile_dir: "",
        managed_profile_dir: null,
      }),
    ]);

    const container = await renderPanel();

    await clickButtonByText(container, "zhihu/search");

    const adapterSelect = container.querySelector("select");
    expect(adapterSelect).toBeInstanceOf(HTMLSelectElement);
    expect((adapterSelect as HTMLSelectElement).value).toBe("zhihu/search");
    expect(container.textContent).toContain("当前将使用：zhihu_attach");
    expect(container.textContent).toContain("资料 知乎附着资料");
  });

  it("目录变更事件后应自动刷新站点目录与推荐状态", async () => {
    const container = await renderPanel();

    expect(mockSiteListAdapters).toHaveBeenCalledTimes(1);
    expect(mockSiteGetAdapterCatalogStatus).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("生效适配器：1");

    mockSiteListAdapters.mockResolvedValueOnce([
      createSiteAdapter(),
      createZhihuAdapter({
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
        example_args: { query: "AI Agent" },
        example: 'zhihu/search {"query":"AI Agent"}',
      }),
    ]);
    mockSiteRecommendAdapters.mockResolvedValueOnce([
      createSiteRecommendation({
        adapter: createZhihuAdapter({
          input_schema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
          example_args: { query: "AI Agent" },
          example: 'zhihu/search {"query":"AI Agent"}',
        }),
        reason: "服务端目录已刷新，可新增知乎脚本。",
        target_id: "mock-target-2",
        entry_url: "https://www.zhihu.com/search?type=content&q=AI%20Agent",
        score: 98,
      }),
    ]);
    mockSiteGetAdapterCatalogStatus.mockResolvedValueOnce(
      createCatalogStatus({
      registry_version: 4,
      catalog_version: "tenant-sync-2",
      synced_at: "2026-03-26T12:00:00.000Z",
      adapter_count: 2,
      }),
    );
    mockListBrowserProfiles.mockResolvedValueOnce([createBrowserProfile()]);
    mockGetChromeBridgeStatus.mockResolvedValueOnce(createChromeBridgeStatus());

    const changedListener =
      mockSubscribeSiteAdapterCatalogChanged.mock.calls[0]?.[0];
    expect(changedListener).toBeTypeOf("function");

    await act(async () => {
      changedListener?.({
        exists: true,
        source_kind: "server_synced",
        adapter_count: 2,
      });
    });
    await flushMicrotasks(2);

    expect(mockSiteListAdapters).toHaveBeenCalledTimes(2);
    expect(mockSiteGetAdapterCatalogStatus).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("目录版本：tenant-sync-2");
    expect(container.textContent).toContain("生效适配器：2");
    expect(container.textContent).toContain("zhihu/search");
  });

  it("站点不可达时应展示错误码与恢复建议", async () => {
    mockSiteRunAdapter.mockResolvedValueOnce(
      createSiteRunResult({
      ok: false,
      error_code: "site_unreachable",
      error_message: "导航站点失败: CDP 命令超时: Page.navigate",
      report_hint:
        "目标站点可能加载较慢、发生重定向，或当前网络暂时不可达；请先确认入口 URL 能正常打开，必要时增大 timeout_ms 后重试。",
      }),
    );

    const container = await renderPanel();
    await clickButtonByText(container, "执行站点命令");

    expect(container.textContent).toContain("执行失败");
    expect(container.textContent).toContain("错误码：site_unreachable");
    expect(container.textContent).toContain(
      "导航站点失败: CDP 命令超时: Page.navigate",
    );
    expect(container.textContent).toContain("建议：");
    expect(container.textContent).toContain("timeout_ms");
  });

  it("带初始站点脚本参数进入时应自动预填并执行", async () => {
    const onMessage = vi.fn();
    const container = await renderPanel({
      onMessage,
      currentProjectId: "project-1",
      currentContentId: "content-launch-1",
      initialAdapterName: "github/search",
      initialArgs: {
        query: "browser assist mcp",
        limit: 10,
      },
      initialAutoRun: true,
      initialSaveTitle: "GitHub 仓库线索 · browser assist mcp",
    });

    await flushMicrotasks(2);

    expect(mockSiteRunAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter_name: "github/search",
        content_id: "content-launch-1",
        project_id: undefined,
        save_title: undefined,
        args: {
          query: "browser assist mcp",
          limit: 10,
        },
      }),
    );
    expect(onMessage).toHaveBeenCalledWith({
      type: "success",
      text: "站点命令 github/search 执行完成，已写回当前主稿",
    });
    expect(container.textContent).toContain("执行成功");

    const argsTextarea = container.querySelector(
      "textarea",
    ) as HTMLTextAreaElement | null;
    expect(argsTextarea?.value).toContain("browser assist mcp");
  });

  it("要求附着会话且未连接当前 Chrome 时应阻止自动执行", async () => {
    mockGetChromeBridgeStatus.mockResolvedValueOnce(createChromeBridgeStatus());

    const onMessage = vi.fn();
    const container = await renderPanel({
      onMessage,
      currentProjectId: "project-1",
      currentContentId: "content-launch-1",
      initialAdapterName: "github/search",
      initialArgs: {
        query: "browser assist mcp",
        limit: 10,
      },
      initialAutoRun: true,
      initialRequireAttachedSession: true,
    });

    await flushMicrotasks(2);

    expect(mockSiteRunAdapter).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "当前技能要求附着会话；如果还没连接当前 Chrome，自动执行会被阻止。",
    );
    expect(container.textContent).toContain(
      "当前技能要求复用已附着的 Chrome 会话，请先连接当前 Chrome 并保持目标站点登录态。",
    );
    expect(onMessage).toHaveBeenCalledWith({
      type: "error",
      text: "当前技能要求复用已附着的 Chrome 会话，请先连接当前 Chrome 并保持目标站点登录态。",
    });
  });

  it("要求附着会话时应忽略托管资料并交给后端自动选择已连接会话", async () => {
    mockGetChromeBridgeStatus.mockResolvedValueOnce(
      createChromeBridgeStatus({
      observer_count: 1,
        observers: [createChromeObserver({ profile_key: "observer-only" })],
      }),
    );

    const container = await renderPanel({
      initialRequireAttachedSession: true,
    });

    expect(container.textContent).toContain("当前将使用：自动选择已连接会话");

    await clickButtonByText(container, "执行站点命令");

    expect(mockSiteRunAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter_name: "github/search",
        profile_key: undefined,
      }),
    );
  });

  it("存在当前 contentId 时应优先写回当前主稿", async () => {
    const onMessage = vi.fn();
    const onNavigate = vi.fn();
    const container = await renderPanel({
      onMessage,
      onNavigate,
      currentProjectId: "project-1",
      currentContentId: "content-current-1",
    });

    expect(container.textContent).toContain("写回当前主稿");
    expect(container.textContent).toContain("内容 ID：content-current-1");

    await clickButtonByText(container, "执行站点命令");

    expect(mockSiteRunAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter_name: "github/search",
        content_id: "content-current-1",
        project_id: undefined,
        save_title: undefined,
      }),
    );
    expect(onMessage).toHaveBeenCalledWith({
      type: "success",
      text: "站点命令 github/search 执行完成，已写回当前主稿",
    });
    expect(container.textContent).toContain("已写回：当前主稿 · 当前主稿");

    await clickButtonByText(container, "再次写回当前主稿");

    expect(mockSiteSaveAdapterResult).toHaveBeenCalledWith(
      expect.objectContaining({
        content_id: "content-current-1",
        project_id: undefined,
      }),
    );
    expect(onMessage).toHaveBeenLastCalledWith({
      type: "success",
      text: "已写回当前主稿",
    });

    await clickButtonByText(container, "打开当前主稿");

    expect(onNavigate).toHaveBeenCalledWith("agent", {
      projectId: "project-1",
      contentId: "content-current-1",
      lockTheme: true,
      fromResources: false,
    });
  });

  it("存在 markdown_relative_path 时应优先导航到导出结果文件", async () => {
    mockSiteRunAdapter.mockImplementationOnce(async () =>
      createSiteRunResult({
      saved_content: {
        content_id: "content-markdown-1",
        project_id: "project-2",
        title: "Google Cloud 周报",
        markdown_relative_path: "exports/social-article/google-cloud/index.md",
      },
      saved_project_id: "project-2",
      saved_by: "explicit_project",
      }),
    );

    const onNavigate = vi.fn();
    const container = await renderPanel({ onNavigate });

    await clickButtonByText(container, "执行站点命令");

    await clickButtonByText(container, "打开导出结果");

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        projectId: "project-2",
        contentId: "content-markdown-1",
        lockTheme: true,
        fromResources: true,
        initialProjectFileOpenTarget: expect.objectContaining({
          relativePath: "exports/social-article/google-cloud/index.md",
        }),
      }),
    );
  });
});
