import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const { mockUseComponentDebug } = vi.hoisted(() => ({
  mockUseComponentDebug: vi.fn(),
}));

const { mockGetConfig, mockSaveConfig } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSaveConfig: vi.fn(),
}));

const {
  mockClearServiceSkillCatalogCache,
  mockGetServiceSkillCatalog,
  mockSubscribeServiceSkillCatalogChanged,
} = vi.hoisted(() => ({
  mockClearServiceSkillCatalogCache: vi.fn(),
  mockGetServiceSkillCatalog: vi.fn(),
  mockSubscribeServiceSkillCatalogChanged: vi.fn(),
}));

const { mockGetLogs, mockGetPersistedLogsTail } = vi.hoisted(() => ({
  mockGetLogs: vi.fn(),
  mockGetPersistedLogsTail: vi.fn(),
}));

const {
  mockGetServerDiagnostics,
  mockGetLogStorageDiagnostics,
  mockGetWindowsStartupDiagnostics,
} = vi.hoisted(() => ({
  mockGetServerDiagnostics: vi.fn(),
  mockGetLogStorageDiagnostics: vi.fn(),
  mockGetWindowsStartupDiagnostics: vi.fn(),
}));

const {
  mockBuildCrashDiagnosticPayload,
  mockClearCrashDiagnosticHistory,
  mockCollectRuntimeSnapshotForDiagnostic,
  mockCollectGeneralWorkbenchDocumentStateForDiagnostic,
  mockCopyCrashDiagnosticJsonToClipboard,
  mockCopyCrashDiagnosticToClipboard,
  mockExportCrashDiagnosticToJson,
  mockIsClipboardPermissionDeniedError,
  mockNormalizeCrashReportingConfig,
  mockOpenCrashDiagnosticDownloadDirectory,
} = vi.hoisted(() => ({
  mockBuildCrashDiagnosticPayload: vi.fn(),
  mockClearCrashDiagnosticHistory: vi.fn(),
  mockCollectRuntimeSnapshotForDiagnostic: vi.fn(),
  mockCollectGeneralWorkbenchDocumentStateForDiagnostic: vi.fn(),
  mockCopyCrashDiagnosticJsonToClipboard: vi.fn(),
  mockCopyCrashDiagnosticToClipboard: vi.fn(),
  mockExportCrashDiagnosticToJson: vi.fn(),
  mockIsClipboardPermissionDeniedError: vi.fn(),
  mockNormalizeCrashReportingConfig: vi.fn(),
  mockOpenCrashDiagnosticDownloadDirectory: vi.fn(),
}));

const {
  mockEmitServiceSkillCatalogBootstrap,
  mockExtractServiceSkillCatalogFromBootstrapPayload,
} = vi.hoisted(() => ({
  mockEmitServiceSkillCatalogBootstrap: vi.fn(),
  mockExtractServiceSkillCatalogFromBootstrapPayload: vi.fn(),
}));

const {
  mockClearSiteAdapterCatalogCache,
  mockEmitSiteAdapterCatalogBootstrap,
  mockExtractSiteAdapterCatalogFromBootstrapPayload,
  mockSubscribeSiteAdapterCatalogChanged,
} = vi.hoisted(() => ({
  mockClearSiteAdapterCatalogCache: vi.fn(),
  mockEmitSiteAdapterCatalogBootstrap: vi.fn(),
  mockExtractSiteAdapterCatalogFromBootstrapPayload: vi.fn(),
  mockSubscribeSiteAdapterCatalogChanged: vi.fn(),
}));

const {
  mockSiteGetAdapterCatalogStatus,
  mockSiteImportAdapterYamlBundle,
  mockSiteListAdapters,
} = vi.hoisted(() => ({
  mockSiteGetAdapterCatalogStatus: vi.fn(),
  mockSiteImportAdapterYamlBundle: vi.fn(),
  mockSiteListAdapters: vi.fn(),
}));

vi.mock("@/contexts/ComponentDebugContext", () => ({
  useComponentDebug: mockUseComponentDebug,
}));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  saveConfig: mockSaveConfig,
}));

vi.mock("@/lib/api/serviceSkills", () => ({
  clearServiceSkillCatalogCache: mockClearServiceSkillCatalogCache,
  getServiceSkillCatalog: mockGetServiceSkillCatalog,
  subscribeServiceSkillCatalogChanged: mockSubscribeServiceSkillCatalogChanged,
}));

vi.mock("@/lib/api/logs", () => ({
  getLogs: mockGetLogs,
  getPersistedLogsTail: mockGetPersistedLogsTail,
}));

vi.mock("@/lib/api/serverRuntime", () => ({
  getServerDiagnostics: mockGetServerDiagnostics,
  getLogStorageDiagnostics: mockGetLogStorageDiagnostics,
  getWindowsStartupDiagnostics: mockGetWindowsStartupDiagnostics,
}));

vi.mock("@/lib/crashDiagnostic", () => ({
  buildCrashDiagnosticPayload: mockBuildCrashDiagnosticPayload,
  clearCrashDiagnosticHistory: mockClearCrashDiagnosticHistory,
  collectRuntimeSnapshotForDiagnostic: mockCollectRuntimeSnapshotForDiagnostic,
  collectGeneralWorkbenchDocumentStateForDiagnostic:
    mockCollectGeneralWorkbenchDocumentStateForDiagnostic,
  CLEAR_CRASH_DIAGNOSTIC_HISTORY_CONFIRM_TEXT: "确认清空诊断信息？",
  copyCrashDiagnosticJsonToClipboard: mockCopyCrashDiagnosticJsonToClipboard,
  copyCrashDiagnosticToClipboard: mockCopyCrashDiagnosticToClipboard,
  exportCrashDiagnosticToJson: mockExportCrashDiagnosticToJson,
  isClipboardPermissionDeniedError: mockIsClipboardPermissionDeniedError,
  normalizeCrashReportingConfig: mockNormalizeCrashReportingConfig,
  openCrashDiagnosticDownloadDirectory:
    mockOpenCrashDiagnosticDownloadDirectory,
}));

vi.mock("@/lib/serviceSkillCatalogBootstrap", () => ({
  emitServiceSkillCatalogBootstrap: mockEmitServiceSkillCatalogBootstrap,
  extractServiceSkillCatalogFromBootstrapPayload:
    mockExtractServiceSkillCatalogFromBootstrapPayload,
}));

vi.mock("@/lib/siteAdapterCatalogBootstrap", () => ({
  clearSiteAdapterCatalogCache: mockClearSiteAdapterCatalogCache,
  emitSiteAdapterCatalogBootstrap: mockEmitSiteAdapterCatalogBootstrap,
  extractSiteAdapterCatalogFromBootstrapPayload:
    mockExtractSiteAdapterCatalogFromBootstrapPayload,
  subscribeSiteAdapterCatalogChanged: mockSubscribeSiteAdapterCatalogChanged,
}));

vi.mock("@/lib/webview-api", () => ({
  siteGetAdapterCatalogStatus: mockSiteGetAdapterCatalogStatus,
  siteImportAdapterYamlBundle: mockSiteImportAdapterYamlBundle,
  siteListAdapters: mockSiteListAdapters,
}));

vi.mock("../shared/ClipboardPermissionGuideCard", () => ({
  ClipboardPermissionGuideCard: () => (
    <div>Clipboard permission card placeholder</div>
  ),
}));

vi.mock("../shared/WorkspaceRepairHistoryCard", () => ({
  WorkspaceRepairHistoryCard: () => <div>Repair history card placeholder</div>,
}));

import { DeveloperSettings } from ".";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const remoteCatalog = {
  version: "tenant-2026-03-24",
  tenantId: "tenant-demo",
  syncedAt: "2026-03-24T12:00:00.000Z",
  items: [
    {
      id: "tenant-skill-1",
      title: "租户技能 1",
    },
    {
      id: "tenant-skill-2",
      title: "租户技能 2",
    },
  ],
};

const seededCatalog = {
  version: "client-seed-2026-03-24",
  tenantId: "local-seeded",
  syncedAt: "2026-03-24T00:00:00.000Z",
  items: [
    {
      id: "seeded-skill-1",
      title: "Seeded 技能 1",
    },
  ],
};

const siteCatalogStatus = {
  exists: false,
  source_kind: "bundled" as const,
  registry_version: 1,
  directory: "/tmp/lime/site-adapters/server-synced",
  adapter_count: 2,
};

const siteAdapters = [
  {
    name: "github/search",
    domain: "github.com",
    description: "GitHub 搜索",
    read_only: true,
    capabilities: ["search"],
    input_schema: { type: "object" },
    example_args: {},
    example: 'github/search {"query":"lime"}',
    source_kind: "bundled" as const,
  },
  {
    name: "zhihu/hot",
    domain: "www.zhihu.com",
    description: "知乎热榜",
    read_only: true,
    capabilities: ["hot"],
    input_schema: { type: "object" },
    example_args: {},
    example: 'zhihu/hot {"limit":10}',
    source_kind: "bundled" as const,
  },
];

const mounted: Mounted[] = [];

function renderComponent(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<DeveloperSettings />);
  });

  mounted.push({ container, root });
  return container;
}

async function flushEffects(times = 8) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`未找到按钮: ${text}`);
  }
  return button as HTMLButtonElement;
}

function findSwitch(
  container: HTMLElement,
  ariaLabel: string,
): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${ariaLabel}"]`,
  );
  if (!button) {
    throw new Error(`未找到开关: ${ariaLabel}`);
  }
  return button;
}

function findTextarea(
  container: HTMLElement,
  ariaLabel: string,
): HTMLTextAreaElement {
  const textarea = container.querySelector<HTMLTextAreaElement>(
    `textarea[aria-label="${ariaLabel}"]`,
  );
  if (!textarea) {
    throw new Error(`未找到输入框: ${ariaLabel}`);
  }
  return textarea;
}

async function clickButton(button: HTMLButtonElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushEffects();
  });
}

async function waitForLazyPanels() {
  await flushEffects();
  if (typeof vi.dynamicImportSettled === "function") {
    await vi.dynamicImportSettled();
  }
  await flushEffects();
}

async function inputTextarea(textarea: HTMLTextAreaElement, value: string) {
  const prototype = Object.getPrototypeOf(textarea) as HTMLTextAreaElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  const setValue = descriptor?.set;
  if (!setValue) {
    throw new Error("未找到 textarea value setter");
  }

  await act(async () => {
    setValue.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flushEffects();
  });
}

function getBodyText() {
  return document.body.textContent ?? "";
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  await changeLimeLocale("en-US");

  mockUseComponentDebug.mockReturnValue({
    enabled: false,
    setEnabled: vi.fn(),
    componentInfo: null,
    showComponentInfo: vi.fn(),
    hideComponentInfo: vi.fn(),
  });

  mockGetConfig.mockResolvedValue({
    developer: {
      workspace_harness_enabled: false,
    },
    crash_reporting: {
      enabled: true,
      dsn: null,
      environment: "production",
      sample_rate: 1,
      send_pii: false,
    },
  });
  mockGetLogs.mockResolvedValue([{ level: "error", message: "boom" }]);
  mockSaveConfig.mockResolvedValue(undefined);
  mockGetPersistedLogsTail.mockResolvedValue([
    { level: "info", message: "ok" },
  ]);
  mockGetServerDiagnostics.mockResolvedValue({ ok: true });
  mockGetLogStorageDiagnostics.mockResolvedValue({ ok: true });
  mockGetWindowsStartupDiagnostics.mockResolvedValue({ ok: true });

  mockCollectRuntimeSnapshotForDiagnostic.mockResolvedValue({
    runtimeSnapshot: { summary: "runtime" },
    collectionNotes: ["note-a"],
  });
  mockCollectGeneralWorkbenchDocumentStateForDiagnostic.mockResolvedValue({
    documentId: "doc-1",
  });
  mockNormalizeCrashReportingConfig.mockImplementation((config) => config);
  mockBuildCrashDiagnosticPayload.mockReturnValue({ payload: "diagnostic" });
  mockCopyCrashDiagnosticToClipboard.mockResolvedValue(undefined);
  mockCopyCrashDiagnosticJsonToClipboard.mockResolvedValue(undefined);
  mockExportCrashDiagnosticToJson.mockReturnValue({
    fileName: "diagnostic.json",
    locationHint: "/tmp",
  });
  mockOpenCrashDiagnosticDownloadDirectory.mockResolvedValue({
    openedPath: "/tmp",
  });
  mockClearCrashDiagnosticHistory.mockResolvedValue(undefined);
  mockIsClipboardPermissionDeniedError.mockReturnValue(false);
  mockGetServiceSkillCatalog.mockResolvedValue(remoteCatalog);
  mockSubscribeServiceSkillCatalogChanged.mockImplementation(() => vi.fn());
  mockClearServiceSkillCatalogCache.mockImplementation(() => undefined);
  mockExtractServiceSkillCatalogFromBootstrapPayload.mockReturnValue(
    remoteCatalog,
  );
  mockSiteGetAdapterCatalogStatus.mockResolvedValue(siteCatalogStatus);
  mockSiteImportAdapterYamlBundle.mockResolvedValue({
    directory: "/tmp/lime/site-adapters/imported",
    adapter_count: 1,
    catalog_version: null,
  });
  mockSiteListAdapters.mockResolvedValue(siteAdapters);
  mockClearSiteAdapterCatalogCache.mockResolvedValue(siteCatalogStatus);
  mockSubscribeSiteAdapterCatalogChanged.mockImplementation(() => vi.fn());
  mockExtractSiteAdapterCatalogFromBootstrapPayload.mockImplementation(
    (payload) =>
      (
        payload as {
          siteAdapterCatalog?: {
            adapters?: unknown[];
          };
        }
      ).siteAdapterCatalog ?? null,
  );
});

afterEach(async () => {
  while (mounted.length > 0) {
    const target = mounted.pop();
    if (!target) {
      break;
    }

    act(() => {
      target.root.unmount();
    });
    target.container.remove();
  }

  vi.clearAllMocks();
  await changeLimeLocale("zh-CN");
});

describe("DeveloperSettings", () => {
  it("应渲染清理后的Developer页和必要分区", async () => {
    const container = renderComponent();
    await flushEffects();

    const text = container.textContent ?? "";
    expect(text).toContain("Developer");
    expect(text).toContain(
      "Turn these on while troubleshooting, then turn them off again.",
    );
    expect(text).toContain("Debug Toggles");
    expect(text).toContain("Workspace debug info");
    expect(text).toContain("Service Skill Catalog Debugging");
    expect(text).toContain("Site Script Catalog Debugging");
    expect(text).toContain("Preparing Site Script Catalog Debugging");
    expect(text).toContain("Component view debug");
    expect(text).toContain("Diagnostic Logs");
    expect(text).toContain("Workspace Repair History");
    expect(text).toContain("Repair history card placeholder");
    expect(text).not.toContain("settings.developer");
  });

  it("应移除开发页冗余说明卡片和提示噪音", async () => {
    renderComponent();
    await flushEffects();

    const text = getBodyText();
    expect(text).not.toContain("诊断建议");
    expect(text).not.toContain("动作清单");
    expect(text).not.toContain("首屏说明已收纳");
    expect(text).not.toContain("页面结构问题");
    expect(text).not.toContain("闪退或启动异常");
    expect(text).not.toContain("自愈链路核对");
    expect(text).not.toContain(
      "首屏先保留处理工作台、组件调试和诊断动作，目录联调、自愈记录与权限卡片按需加载，减少进入设置后的等待感。",
    );
    expect(
      document.body.querySelector(
        "button[aria-label='Developer settings hero details']",
      ),
    ).toBeNull();
    expect(
      document.body.querySelector(
        "button[aria-label='Workspace debug info details']",
      ),
    ).toBeNull();
  });

  it("切换组件Debug Toggles后应调用 setEnabled", async () => {
    const setEnabled = vi.fn();
    mockUseComponentDebug.mockReturnValue({
      enabled: false,
      setEnabled,
      componentInfo: null,
      showComponentInfo: vi.fn(),
      hideComponentInfo: vi.fn(),
    });

    const container = renderComponent();
    await clickButton(findSwitch(container, "Toggle component view debug"));

    expect(setEnabled).toHaveBeenCalledTimes(1);
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it("切换处理工作台开关后应保存 developer.workspace_harness_enabled", async () => {
    const container = renderComponent();
    await flushEffects();

    await clickButton(findSwitch(container, "Toggle workspace debug info"));

    expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        developer: expect.objectContaining({
          workspace_harness_enabled: true,
        }),
      }),
    );
    expect(container.textContent).toContain(
      "Workspace debug collection is on. Tool inventory and environment summaries load when Harness opens.",
    );
  });

  it("点击Copy diagnostics后应构建并复制诊断载荷", async () => {
    const container = renderComponent();

    await clickButton(findButton(container, "Copy diagnostics"));
    await flushEffects();

    expect(mockCollectRuntimeSnapshotForDiagnostic).toHaveBeenCalledTimes(1);
    expect(mockBuildCrashDiagnosticPayload).toHaveBeenCalledTimes(1);
    expect(mockCopyCrashDiagnosticToClipboard).toHaveBeenCalledWith({
      payload: "diagnostic",
    });
    expect(container.textContent).toContain(
      "Diagnostics copied. You can send them directly to developers.",
    );
  });

  it("复制诊断因剪贴板权限失败时应显示权限指引", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockCopyCrashDiagnosticToClipboard.mockRejectedValueOnce(
      new Error("clipboard denied"),
    );
    mockIsClipboardPermissionDeniedError.mockReturnValue(true);

    try {
      const container = renderComponent();

      await clickButton(findButton(container, "Copy diagnostics"));
      await flushEffects();

      expect(container.textContent).toContain(
        "Clipboard permission card placeholder",
      );
      expect(container.textContent).toContain("clipboard denied");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("点击Load Current Catalog后应把 serviceSkillCatalog 写入调试输入框", async () => {
    const container = renderComponent();
    await waitForLazyPanels();

    await clickButton(findButton(container, "Load Current Catalog"));
    await flushEffects();

    const textarea = findTextarea(
      container,
      "Service skill catalog debug input",
    );
    expect(textarea.value).toContain('"tenantId": "tenant-demo"');
    expect(container.textContent).toContain(
      "Current catalog written to debug editor",
    );
  });

  it("输入 JSON 后Inject via Event应调用 bootstrap 桥接", async () => {
    const container = renderComponent();
    await waitForLazyPanels();
    const textarea = findTextarea(
      container,
      "Service skill catalog debug input",
    );

    await inputTextarea(
      textarea,
      JSON.stringify(
        {
          serviceSkillCatalog: remoteCatalog,
        },
        null,
        2,
      ),
    );
    await clickButton(findButton(container, "Inject via Event"));
    await flushEffects();

    expect(
      mockExtractServiceSkillCatalogFromBootstrapPayload,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceSkillCatalog: expect.objectContaining({
          tenantId: "tenant-demo",
        }),
      }),
    );
    expect(mockEmitServiceSkillCatalogBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceSkillCatalog: expect.objectContaining({
          tenantId: "tenant-demo",
        }),
      }),
    );
    expect(container.textContent).toContain(
      "Injected catalog through bootstrap event: 2 items",
    );
  });

  it("Clear Catalog Cache后应回退 seeded 目录并展示提示", async () => {
    mockGetServiceSkillCatalog.mockResolvedValueOnce(remoteCatalog);
    mockGetServiceSkillCatalog.mockResolvedValueOnce(seededCatalog);

    const container = renderComponent();
    await waitForLazyPanels();

    await clickButton(findButton(container, "Clear Catalog Cache"));
    await flushEffects();

    expect(mockClearServiceSkillCatalogCache).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      "Remote catalog cache cleared; falling back to seeded: 1 items",
    );
  });

  it("应展示站点脚本目录摘要", async () => {
    const container = renderComponent();
    await waitForLazyPanels();

    expect(container.textContent).toContain("Site Script Catalog Debugging");
    expect(container.textContent).toContain("Bundled");
    expect(container.textContent).toContain("github/search");
    expect(container.textContent).toContain("zhihu/hot");
  });

  it("导入外部来源 YAML 后应调用 Lime 标准导入命令并刷新摘要", async () => {
    const container = renderComponent();
    await waitForLazyPanels();
    const textarea = findTextarea(container, "Site source YAML import input");

    mockSiteGetAdapterCatalogStatus.mockResolvedValueOnce({
      exists: true,
      source_kind: "imported",
      registry_version: 1,
      directory: "/tmp/lime/site-adapters/imported",
      catalog_version: "imported-2026-03-28",
      adapter_count: 1,
    });
    mockSiteListAdapters.mockResolvedValueOnce([
      {
        name: "reddit/hot",
        domain: "www.reddit.com",
        description: "Reddit 热门帖子",
        read_only: true,
        capabilities: ["research", "hot"],
        input_schema: { type: "object" },
        example_args: {},
        example: 'reddit/hot {"subreddit":"rust"}',
        source_kind: "imported" as const,
      },
    ]);

    await inputTextarea(
      textarea,
      [
        "site: reddit",
        "name: hot",
        "description: Reddit 热门帖子",
        "domain: www.reddit.com",
        "pipeline:",
        "  - navigate: https://www.reddit.com",
        "  - evaluate: |",
        "      (() => [])()",
      ].join("\n"),
    );
    await clickButton(findButton(container, "Import to Lime Standard"));
    await flushEffects();

    expect(mockSiteImportAdapterYamlBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        yaml_bundle: expect.stringContaining("site: reddit"),
      }),
    );
    expect(mockSiteGetAdapterCatalogStatus).toHaveBeenCalledTimes(2);
    expect(mockSiteListAdapters).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain(
      "Imported 1 external adapters to the Lime standard; 1 are currently effective",
    );
    expect(container.textContent).toContain("Imported");
    expect(container.textContent).toContain("reddit/hot");
  });

  it("输入 JSON 后注入站点脚本目录应调用 bootstrap 桥接", async () => {
    const container = renderComponent();
    await waitForLazyPanels();
    const textarea = findTextarea(
      container,
      "Site adapter catalog debug input",
    );

    await inputTextarea(
      textarea,
      JSON.stringify(
        {
          siteAdapterCatalog: {
            adapters: [{ name: "github/search" }, { name: "zhihu/hot" }],
          },
        },
        null,
        2,
      ),
    );
    await clickButton(findButton(container, "Inject Site Catalog"));
    await flushEffects();

    expect(
      mockExtractSiteAdapterCatalogFromBootstrapPayload,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        siteAdapterCatalog: expect.objectContaining({
          adapters: expect.any(Array),
        }),
      }),
    );
    expect(mockEmitSiteAdapterCatalogBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({
        siteAdapterCatalog: expect.objectContaining({
          adapters: expect.any(Array),
        }),
      }),
    );
    expect(container.textContent).toContain(
      "Injected site adapter catalog through bootstrap event: 2 items",
    );
  });

  it("清空站点脚本目录缓存后应提示回退到Bundled", async () => {
    const container = renderComponent();
    await waitForLazyPanels();

    await clickButton(findButton(container, "Clear Site Catalog Cache"));
    await flushEffects();

    expect(mockClearSiteAdapterCatalogCache).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      "Site adapter catalog cache cleared; falling back to bundled: 2 items",
    );
  });

  it("站点目录变更事件后应自动刷新开发页摘要", async () => {
    const container = renderComponent();
    await waitForLazyPanels();

    expect(mockSiteGetAdapterCatalogStatus).toHaveBeenCalledTimes(1);
    expect(mockSiteListAdapters).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Bundled");

    mockSiteGetAdapterCatalogStatus.mockResolvedValueOnce({
      exists: true,
      source_kind: "server_synced",
      registry_version: 2,
      directory: "/tmp/lime/site-adapters/server-synced",
      catalog_version: "tenant-site-2026-03-27",
      tenant_id: "tenant-demo",
      synced_at: "2026-03-27T08:00:00.000Z",
      adapter_count: 1,
    });
    mockSiteListAdapters.mockResolvedValueOnce([
      {
        name: "bilibili/hot",
        domain: "www.bilibili.com",
        description: "B 站热榜",
        read_only: true,
        capabilities: ["hot"],
        input_schema: { type: "object" },
        example_args: {},
        example: 'bilibili/hot {"limit":10}',
        source_kind: "server_synced" as const,
      },
    ]);

    const changedListener =
      mockSubscribeSiteAdapterCatalogChanged.mock.calls[0]?.[0];
    expect(changedListener).toBeTypeOf("function");

    await act(async () => {
      changedListener?.({
        exists: true,
        source_kind: "server_synced",
        adapter_count: 1,
      });
      await flushEffects();
    });

    expect(mockSiteGetAdapterCatalogStatus).toHaveBeenCalledTimes(2);
    expect(mockSiteListAdapters).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Server Synced");
    expect(container.textContent).toContain("bilibili/hot");
    expect(container.textContent).toContain("tenant-site-2026-03-27");
  });
});
