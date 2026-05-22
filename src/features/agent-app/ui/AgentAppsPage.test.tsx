import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildInstalledAgentAppState } from "../install/installedAppState";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildAgentAppLabResolvedSetupState } from "../install/labInstallFlow";
import { buildPackageIdentity } from "../install/packageIdentity";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import type {
  AppManifest,
  CloudBootstrapApp,
  HostCapabilityProfile,
  InstalledAgentAppState,
} from "../types";
import { AgentAppsPage } from "./AgentAppsPage";

const LOCAL_APP_DIR = "/tmp/lime/content-factory-app";
const REMOVED_MACHINE_PATH = [
  "/Users",
  "coso",
  "Documents",
  "dev",
  "ai",
  "limecloud",
  "content-factory-app",
].join("/");

const apiMocks = vi.hoisted(() => ({
  getAgentAppCloudCatalog: vi.fn(),
  installCloudAgentAppRelease: vi.fn(),
  installLocalAgentAppPackage: vi.fn(),
  launchAgentAppShell: vi.fn(),
  listInstalledAgentApps: vi.fn(),
  selectLocalAgentAppDirectory: vi.fn(),
  reviewCloudAgentAppRelease: vi.fn(),
  reviewLocalAgentAppPackage: vi.fn(),
  saveInstalledAgentAppState: vi.fn(),
  previewAgentAppUninstall: vi.fn(),
  setAgentAppDisabled: vi.fn(),
  submitAgentAppRegistrationCode: vi.fn(),
  uninstallAgentApp: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === "agentApp.apps.launch.uiMounted") {
        return `ui:${String(params?.title)}:${String(params?.route)}`;
      }
      if (key === "agentApp.apps.launch.workflowCompleted") {
        return `workflow:${String(params?.title)}:${String(params?.runId)}`;
      }
      if (key === "agentApp.apps.launch.entryCompleted") {
        return `entry:${String(params?.title)}:${String(params?.runId)}`;
      }
      if (key === "agentApp.apps.launch.shellLaunched") {
        return `shell:${String(params?.title)}:${String(params?.target)}`;
      }
      if (key === "agentApp.apps.launch.shellBlocked") {
        return `blocked:${String(params?.codes)}`;
      }
      if (key === "agentApp.apps.uninstallPreview.summary") {
        return `delete:${String(params?.deleted)} retain:${String(
          params?.retained,
        )}`;
      }
      if (key === "agentApp.apps.surface.title") {
        return `using:${String(params?.title)}`;
      }
      if (typeof params?.count === "number") {
        return `${key}:${params.count}`;
      }
      return key;
    },
  }),
}));

vi.mock("@/lib/api/agentApps", () => ({
  AGENT_APPS_CHANGED_EVENT: "lime:agent-apps-changed",
  getAgentAppCloudCatalog: apiMocks.getAgentAppCloudCatalog,
  installCloudAgentAppRelease: apiMocks.installCloudAgentAppRelease,
  installLocalAgentAppPackage: apiMocks.installLocalAgentAppPackage,
  launchAgentAppShell: apiMocks.launchAgentAppShell,
  listInstalledAgentApps: apiMocks.listInstalledAgentApps,
  previewAgentAppUninstall: apiMocks.previewAgentAppUninstall,
  reviewCloudAgentAppRelease: apiMocks.reviewCloudAgentAppRelease,
  reviewLocalAgentAppPackage: apiMocks.reviewLocalAgentAppPackage,
  saveInstalledAgentAppState: apiMocks.saveInstalledAgentAppState,
  selectLocalAgentAppDirectory: apiMocks.selectLocalAgentAppDirectory,
  setAgentAppDisabled: apiMocks.setAgentAppDisabled,
  submitAgentAppRegistrationCode: apiMocks.submitAgentAppRegistrationCode,
  uninstallAgentApp: apiMocks.uninstallAgentApp,
}));

vi.mock("@/lib/api/fileSystem", () => ({
  convertLocalFileSrc: (path: string) => `asset://${path}`,
}));

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mountedPages: MountedPage[] = [];
const installedStates: InstalledAgentAppState[] = [];

function buildReadyState(
  params: {
    disabled?: boolean;
    installMode?: InstalledAgentAppState["installMode"];
    manifest?: AppManifest;
    profile?: HostCapabilityProfile;
  } = {},
): InstalledAgentAppState {
  const manifest = params.manifest ?? (contentFactoryFixture as AppManifest);
  const loadedAt = "2026-05-15T00:00:00.000Z";
  const identity = buildPackageIdentity({
    manifest,
    sourceKind: "local_folder",
    sourceUri: LOCAL_APP_DIR,
    loadedAt,
  });
  const setupPreview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    profile: params.profile,
    loadedAt,
    checkedAt: loadedAt,
    generatedAt: loadedAt,
  });
  const setup = buildAgentAppLabResolvedSetupState(setupPreview.projection);
  const preview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    setup,
    profile: params.profile,
    loadedAt,
    checkedAt: loadedAt,
    generatedAt: loadedAt,
  });

  return buildInstalledAgentAppState({
    preview,
    installMode: params.installMode,
    setup,
    disabled: params.disabled,
    installedAt: loadedAt,
    updatedAt: loadedAt,
  });
}

function buildStandaloneState(): InstalledAgentAppState {
  return buildReadyState({
    installMode: "standalone",
    manifest: {
      ...(contentFactoryFixture as AppManifest),
      manifestVersion: "0.8.0",
      install: {
        modes: ["in_lime", "standalone", "runtime_backed"],
        runtime: { minVersion: "0.8.0" },
        standalone: {
          shell: "lime-app-shell",
          bundleId: "ai.limecloud.contentfactory",
        },
        runtimeBacked: {
          requires: "lime-runtime",
          minVersion: "0.8.0",
        },
        branding: {
          name: "内容工厂",
          windowTitle: "内容工厂",
        },
      },
    },
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: true,
    }),
  });
}

async function renderPage(
  pageParams?: {
    selectedAgentAppId?: string;
    launchAgentAppEntryKey?: string;
    launchRequestKey?: number;
  },
  onNavigate?: Parameters<typeof AgentAppsPage>[0]["onNavigate"],
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <AgentAppsPage onNavigate={onNavigate} pageParams={pageParams} />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  mountedPages.push({ container, root });
  return container;
}

async function flush(times = 8) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function openAppDetail(
  container: HTMLElement,
  appId = "content-factory-app",
) {
  const detailButton = container.querySelector(
    `[data-testid="agent-apps-open-detail-${appId}"]`,
  ) as HTMLButtonElement | null;
  expect(detailButton).not.toBeNull();
  await act(async () => {
    detailButton?.click();
    await Promise.resolve();
  });
  await flush();
}

function installState(state: InstalledAgentAppState): InstalledAgentAppState {
  installedStates.splice(0, installedStates.length, state);
  return state;
}

function buildReviewResult(state: InstalledAgentAppState) {
  return {
    state,
    review: {
      id: `${state.appId}:${state.identity.appVersion}`,
      appId: state.appId,
      displayName: state.manifest.displayName,
      version: state.identity.appVersion,
      manifestVersion: state.manifest.manifestVersion,
      sourceKind: state.identity.sourceKind,
      sourceUri: state.identity.sourceUri,
      sourceState: {
        kind: "local-selected",
        labelKey: "agentApp.apps.sourceState.localSelected",
        tone: "sky",
        canReview: true,
      },
      packageHash: state.identity.packageHash,
      manifestHash: state.identity.manifestHash,
      entryCount: state.projection.entries.length,
      capabilityCount: state.projection.requiredCapabilities.length,
      requiredCapabilityKeys: state.projection.requiredCapabilities.map(
        (item) => item.capability,
      ),
      permissionCount: state.manifest.permissions.length,
      storageNamespace: state.projection.storage?.namespace,
      cleanupTargetCount: 3,
      readinessStatus: state.readiness.status,
      blockerCount: state.readiness.blockers.length,
      warningCount: state.readiness.warnings.length,
      generatedAt: state.updatedAt,
    },
  };
}

function expectInstallReviewDialog(container: HTMLElement) {
  const overlay = container.querySelector(
    '[data-testid="agent-apps-install-review-overlay"]',
  );
  const dialog = container.querySelector(
    '[data-testid="agent-apps-install-review"]',
  );

  expect(overlay).not.toBeNull();
  expect(dialog).not.toBeNull();
  expect(dialog?.getAttribute("role")).toBe("dialog");
  expect(dialog?.getAttribute("aria-modal")).toBe("true");
  expect(dialog?.textContent).toContain("agentApp.apps.installReview.title");
  expect(
    container
      .querySelector('[data-testid="agent-apps-page"]')
      ?.lastElementChild?.getAttribute("data-testid"),
  ).not.toBe("agent-apps-install-review");
}

function setupDefaultApiMocks() {
  apiMocks.getAgentAppCloudCatalog.mockResolvedValue({
    source: "seeded",
    payload: {
      schemaVersion: "0.3",
      tenantId: "seeded",
      generatedAt: "2026-05-15T00:00:00.000Z",
      apps: [
        {
          appId: "content-factory-app",
          displayName: "内容工厂",
          version: "0.3.0",
          registrationRequired: false,
          registrationState: "not_required",
          enabled: true,
          packageUrl:
            "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
          packageHash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          manifestHash:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          capabilityRequirements: {},
          defaultEntries: ["dashboard"],
          policyDefaults: {},
          toolAvailability: [],
        },
      ],
    },
  });
  apiMocks.listInstalledAgentApps.mockImplementation(async () => ({
    states: installedStates.map((state) => structuredClone(state)),
    issues: [],
  }));
  apiMocks.launchAgentAppShell.mockResolvedValue({
    appId: "content-factory-app",
    status: "launched",
    installMode: "standalone",
    shellKind: "app_shell",
    descriptorVersion: 1,
    devShell: true,
    blockerCodes: [],
    runtimeStatus: {
      appId: "content-factory-app",
      status: "running",
      baseUrl: "http://127.0.0.1:4199",
      entryUrl: "http://127.0.0.1:4199/dashboard",
      entryKey: "dashboard",
      route: "/dashboard",
    },
    shellWindow: {
      label: "agent-app-shell-content-factory-app-standalone",
      title: "内容工厂",
      url: "http://127.0.0.1:4199/dashboard",
      reused: false,
    },
    launchedAt: "2026-05-15T00:00:00.000Z",
  });
  apiMocks.selectLocalAgentAppDirectory.mockResolvedValue(LOCAL_APP_DIR);
  apiMocks.reviewLocalAgentAppPackage.mockImplementation(async () =>
    buildReviewResult(buildReadyState()),
  );
  apiMocks.reviewCloudAgentAppRelease.mockImplementation(
    async (_params: { app: CloudBootstrapApp }) =>
      buildReviewResult(buildReadyState()),
  );
  apiMocks.saveInstalledAgentAppState.mockImplementation(
    async (request: { state: InstalledAgentAppState }) =>
      installState(request.state),
  );
  apiMocks.installLocalAgentAppPackage.mockImplementation(async () =>
    installState(buildReadyState()),
  );
  apiMocks.installCloudAgentAppRelease.mockImplementation(
    async (_params: { app: CloudBootstrapApp }) =>
      installState(buildReadyState()),
  );
  apiMocks.submitAgentAppRegistrationCode.mockResolvedValue({
    source: "remote",
    payload: {
      schemaVersion: "agent-app-cloud-bootstrap/v1",
      tenantId: "tenant-0001",
      generatedAt: "2026-05-15T00:01:00.000Z",
      apps: [
        {
          appId: "content-factory-app",
          displayName: "内容工厂",
          version: "0.3.0",
          registrationRequired: true,
          registrationState: "active",
          enabled: true,
          packageUrl:
            "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
          packageHash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          manifestHash:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          capabilityRequirements: {},
          defaultEntries: ["dashboard"],
          policyDefaults: {},
          toolAvailability: [],
        },
      ],
    },
  });
  apiMocks.setAgentAppDisabled.mockImplementation(
    async (request: {
      appId: string;
      disabled: boolean;
      updatedAt?: string;
    }) => {
      const nextStates = installedStates.map((state) =>
        state.appId === request.appId
          ? {
              ...structuredClone(state),
              disabled: request.disabled,
              updatedAt: request.updatedAt ?? "2026-05-15T00:01:00.000Z",
            }
          : structuredClone(state),
      );
      installedStates.splice(0, installedStates.length, ...nextStates);
      return { states: nextStates, issues: [] };
    },
  );
  apiMocks.previewAgentAppUninstall.mockResolvedValue({
    appId: "content-factory-app",
    packageHash: "package-fnv1a-test",
    mode: "delete-data",
    generatedAt: "2026-05-15T00:02:00.000Z",
    deletedTargetCount: 2,
    retainedTargetCount: 1,
    targets: [
      {
        kind: "path",
        value: "<LimeAppData>/agent-apps/installed/content-factory-app.json",
        safeToDelete: true,
        action: "delete",
        reason: "Installed state.",
      },
      {
        kind: "namespace",
        value: "<LimeAppData>/agent-apps/storage/content-factory-app",
        safeToDelete: true,
        action: "retain",
        reason: "App data.",
      },
    ],
    warnings: ["DRY_RUN_ONLY"],
  });
  apiMocks.uninstallAgentApp.mockImplementation(
    async (request: {
      appId: string;
      mode: "keep-data" | "delete-data";
      confirmationPhrase?: string;
    }) => {
      const state = installedStates.find(
        (item) => item.appId === request.appId,
      );
      const expectedPhrase = state
        ? `DELETE_AGENT_APP_DATA ${request.appId} ${state.identity.packageHash}`
        : "";
      const confirmed =
        request.mode !== "delete-data" ||
        request.confirmationPhrase === expectedPhrase;
      if (confirmed) {
        installedStates.splice(
          0,
          installedStates.length,
          ...installedStates.filter((item) => item.appId !== request.appId),
        );
      }
      return {
        status: confirmed ? "deleted" : "blocked",
        rehearsal: {
          appId: request.appId,
          packageHash: state?.identity.packageHash ?? "package-fnv1a-test",
          mode: request.mode,
          generatedAt: "2026-05-15T00:03:00.000Z",
          deletedTargetCount: 2,
          retainedTargetCount: 0,
          targets: [],
          warnings: [],
        },
        list: {
          states: installedStates.map((state) => structuredClone(state)),
          issues: [],
        },
        removedTargetCount: confirmed ? 2 : 0,
        missingTargetCount: 0,
        blockerCodes: confirmed ? [] : ["CONFIRMATION_MISMATCH"],
        deleteEvidence: null,
      };
    },
  );
}

describe("AgentAppsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    installedStates.splice(0, installedStates.length);
    setupDefaultApiMocks();
  });

  afterEach(() => {
    while (mountedPages.length > 0) {
      const mounted = mountedPages.pop();
      if (!mounted) {
        continue;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    vi.unstubAllGlobals();
  });

  it("应展示本地安装源和 Cloud catalog，并在审查确认后从本地安装第一个 Agent App", async () => {
    const container = await renderPage();
    await flush();

    expect(container.textContent).toContain("agentApp.apps.center.title");
    expect(container.textContent).toContain("agentApp.apps.center.description");
    expect(
      container
        .querySelector('[data-testid="agent-apps-search"]')
        ?.getAttribute("placeholder"),
    ).toBe("agentApp.apps.center.searchPlaceholder");
    expect(container.textContent).not.toContain(REMOVED_MACHINE_PATH);
    expect(
      container.querySelector(
        '[data-testid="agent-apps-list-row-content-factory-app"]',
      ),
    ).not.toBeNull();
    const fallbackIcon = container.querySelector(
      '[data-testid="agent-apps-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(fallbackIcon?.getAttribute("src")).toContain("data:image/svg+xml");
    expect(decodeURIComponent(fallbackIcon?.getAttribute("src") ?? "")).toContain(
      "内容工厂",
    );
    expect(
      container.querySelector(
        '[data-testid="agent-apps-open-detail-content-factory-app"]',
      )?.textContent,
    ).toContain("agentApp.apps.center.action.details");
    expect(
      container.querySelector('[data-testid="agent-apps-detail"]'),
    ).toBeNull();
    expect(container.textContent).toContain(
      "agentApp.apps.center.source.cloud",
    );
    expect(container.textContent).toContain(
      "agentApp.apps.center.status.installable",
    );

    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installLocal?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.selectLocalAgentAppDirectory).toHaveBeenCalledWith({
      title: "agentApp.apps.localSource.dialogTitle",
    });
    expect(apiMocks.reviewLocalAgentAppPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        appDir: LOCAL_APP_DIR,
      }),
    );
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expectInstallReviewDialog(container);

    const confirmInstall = container.querySelector(
      '[data-testid="agent-apps-install-review-confirm"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      confirmInstall?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.saveInstalledAgentAppState).toHaveBeenCalledWith({
      state: expect.objectContaining({
        appId: "content-factory-app",
      }),
    });
    expect(
      container.querySelector(
        '[data-testid="agent-apps-installed-content-factory-app"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("内容工厂");
  });

  it("正式入口页面壳和主按钮应接入 Lime 主题变量", async () => {
    const container = await renderPage();
    await flush();

    const page = container.querySelector('[data-testid="agent-apps-page"]');
    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;

    expect(page?.className).toContain("lime-workbench-theme-scope");
    expect(page?.className).toContain("bg-[color:var(--lime-app-bg)]");
    expect(installLocal?.className).toContain(
      "bg-[color:var(--lime-text-strong)]",
    );
    expect(installLocal?.className).toContain("rounded-full");
    expect(
      container
        .querySelector('[data-testid="agent-apps-list"]')
        ?.closest("section")?.className,
    ).toContain("space-y-4");
    expect(
      container
        .querySelector('[data-testid="agent-apps-list"]')
        ?.className,
    ).toContain("lg:grid-cols-3");
    expect(
      container
        .querySelector('[data-testid="agent-apps-list-row-content-factory-app"]')
        ?.className,
    ).toContain("min-h-[188px]");
  });

  it("本地 App 卡片应优先展示 manifest 声明的图标", async () => {
    installedStates.push(
      buildReadyState({
        manifest: {
          ...(contentFactoryFixture as AppManifest),
          install: {
            branding: {
              name: "内容工厂",
              icon: "./assets/icon.svg",
              windowTitle: "内容工厂",
            },
          },
        },
      }),
    );
    const container = await renderPage();
    await flush();

    const icon = container.querySelector(
      '[data-testid="agent-apps-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(icon?.getAttribute("src")).toBe(
      `asset://${LOCAL_APP_DIR}/assets/icon.svg`,
    );

    await openAppDetail(container);

    const detailIcon = container.querySelector(
      '[data-testid="agent-apps-detail-icon-content-factory-app"] img',
    ) as HTMLImageElement | null;
    expect(detailIcon?.getAttribute("src")).toBe(
      `asset://${LOCAL_APP_DIR}/assets/icon.svg`,
    );
  });

  it("详情弹窗应支持关闭并回到卡片列表", async () => {
    const container = await renderPage();
    await flush();

    await openAppDetail(container);

    expect(
      container.querySelector('[data-testid="agent-apps-detail-overlay"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-detail"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="agent-apps-detail"]')
        ?.getAttribute("role"),
    ).toBe("dialog");
    expect(
      container
        .querySelector('[data-testid="agent-apps-list"]')
        ?.className,
    ).toContain("lg:grid-cols-3");

    const closeDetail = container.querySelector(
      '[data-testid="agent-apps-close-detail"]',
    ) as HTMLButtonElement | null;
    expect(closeDetail?.getAttribute("aria-label")).toBe(
      "agentApp.apps.center.detail.close",
    );
    expect(closeDetail?.textContent).toContain(
      "agentApp.apps.center.detail.close",
    );

    await act(async () => {
      closeDetail?.click();
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-apps-detail"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-detail-overlay"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="agent-apps-list-row-content-factory-app"]',
      ),
    ).not.toBeNull();
  });

  it("应用中心应支持云端/本地来源筛选、搜索和分页", async () => {
    apiMocks.getAgentAppCloudCatalog.mockResolvedValue({
      source: "remote",
      payload: {
        schemaVersion: "agent-app-cloud-bootstrap/v1",
        tenantId: "tenant-0001",
        generatedAt: "2026-05-15T00:00:00.000Z",
        apps: Array.from({ length: 25 }, (_, index) => {
          const number = index + 1;
          return {
            appId: `bulk-app-${number}`,
            displayName: `批量应用 ${String(number).padStart(2, "0")}`,
            version: `1.0.${number}`,
            registrationRequired: false,
            registrationState: "not_required",
            enabled: true,
            packageUrl: `https://lime.local/agent-apps/bulk-app-${number}.zip`,
            packageHash:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            manifestHash:
              "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            capabilityRequirements: {},
            defaultEntries: ["dashboard"],
            policyDefaults: {},
            toolAvailability: [],
          } satisfies CloudBootstrapApp;
        }),
      },
    });

    const container = await renderPage();
    await flush();

    expect(
      container.querySelector(
        '[data-testid="agent-apps-list-row-bulk-app-21"]',
      ),
    ).toBeNull();

    const nextPage = container.querySelector(
      '[data-testid="agent-apps-pagination-next"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      nextPage?.click();
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector(
        '[data-testid="agent-apps-list-row-bulk-app-21"]',
      ),
    ).not.toBeNull();

    const search = container.querySelector(
      '[data-testid="agent-apps-search"]',
    ) as HTMLInputElement | null;
    await act(async () => {
      if (search) {
        search.value = "25";
        search.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector(
        '[data-testid="agent-apps-list-row-bulk-app-25"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="agent-apps-list-row-bulk-app-21"]',
      ),
    ).toBeNull();

    const localFilter = container.querySelector(
      '[data-testid="agent-apps-source-filter-local"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      localFilter?.click();
      await Promise.resolve();
    });
    await flush();

    expect(container.textContent).toContain(
      "agentApp.apps.center.empty.noMatches",
    );
  });

  it("取消选择本地目录时不应生成安装审查或写入 repository", async () => {
    apiMocks.selectLocalAgentAppDirectory.mockResolvedValue(null);
    const container = await renderPage();
    await flush();

    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installLocal?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewLocalAgentAppPackage).not.toHaveBeenCalled();
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="agent-apps-install-review"]'),
    ).toBeNull();
  });

  it("本地 package 非法时不应写入 repository", async () => {
    apiMocks.reviewLocalAgentAppPackage.mockRejectedValue(
      new Error("APP.md invalid"),
    );
    const container = await renderPage();
    await flush();

    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installLocal?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewLocalAgentAppPackage).toHaveBeenCalled();
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="agent-apps-install-review"]'),
    ).toBeNull();
  });

  it("本地企业定制包未激活注册码时应展示本地化阻断文案", async () => {
    const error = new Error("raw registration required");
    error.name = "AgentAppRegistrationRequiredError";
    apiMocks.reviewLocalAgentAppPackage.mockRejectedValue(error);
    const container = await renderPage();
    await flush();

    const installLocal = container.querySelector(
      '[data-testid="agent-apps-install-local"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installLocal?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewLocalAgentAppPackage).toHaveBeenCalled();
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "agentApp.apps.toast.failed",
      expect.objectContaining({
        description: "agentApp.apps.registration.localInstallBlocked",
      }),
    );
  });

  it("企业定制 Cloud App 未注册前应阻断安装并提交注册码", async () => {
    apiMocks.getAgentAppCloudCatalog.mockResolvedValue({
      source: "remote",
      payload: {
        schemaVersion: "agent-app-cloud-bootstrap/v1",
        tenantId: "tenant-0001",
        generatedAt: "2026-05-15T00:00:00.000Z",
        apps: [
          {
            appId: "content-factory-app",
            displayName: "内容工厂",
            version: "0.3.0",
            registrationRequired: true,
            registrationState: "required",
            registrationHint: "请输入企业注册码",
            enabled: false,
            disabledReason: "registration required",
            packageUrl: "",
            packageHash: "",
            manifestHash: "",
            capabilityRequirements: {},
            defaultEntries: ["dashboard"],
            policyDefaults: {},
            toolAvailability: [],
          },
        ],
      },
    });

    const container = await renderPage();
    await flush();

    const installCloud = container.querySelector(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    expect(installCloud?.disabled).toBe(true);
    expect(
      container.querySelector(
        '[data-testid="agent-apps-registration-content-factory-app"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-detail"]'),
    ).toBeNull();

    await openAppDetail(container);

    const input = container.querySelector(
      '[data-testid="agent-apps-registration-code-content-factory-app"]',
    ) as HTMLInputElement | null;
    await act(async () => {
      if (input) {
        input.value = "CF-REG-2026";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await Promise.resolve();
    });

    const submit = container.querySelector(
      '[data-testid="agent-apps-submit-registration-content-factory-app"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      submit?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.submitAgentAppRegistrationCode).toHaveBeenCalledWith(
      "content-factory-app",
      "CF-REG-2026",
    );
    expect(apiMocks.installCloudAgentAppRelease).not.toHaveBeenCalled();

    expect(
      container.querySelector(
        '[data-testid="agent-apps-source-state-content-factory-app"]',
      )?.textContent,
    ).toContain("agentApp.apps.sourceState.registrationActive");

    const enabledInstallCloud = container.querySelector(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    expect(enabledInstallCloud?.disabled).toBe(false);
    await act(async () => {
      enabledInstallCloud?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewCloudAgentAppRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        app: expect.objectContaining({
          appId: "content-factory-app",
          registrationState: "active",
        }),
      }),
    );
    expectInstallReviewDialog(container);
  });

  it("已安装旧版 Cloud App 需要重新激活时，主按钮应提示输入激活码而不是假装一键更新", async () => {
    installedStates.push(
      buildReadyState({
        manifest: {
          ...(contentFactoryFixture as AppManifest),
          version: "0.2.0",
        },
      }),
    );
    apiMocks.getAgentAppCloudCatalog.mockResolvedValue({
      source: "remote",
      payload: {
        schemaVersion: "agent-app-cloud-bootstrap/v1",
        tenantId: "tenant-0001",
        generatedAt: "2026-05-15T00:00:00.000Z",
        apps: [
          {
            appId: "content-factory-app",
            displayName: "内容工厂",
            version: "0.3.0",
            registrationRequired: true,
            registrationState: "required",
            registrationHint: "请输入企业注册码",
            enabled: false,
            disabledReason: "registration required",
            packageUrl: "",
            packageHash: "",
            manifestHash: "",
            capabilityRequirements: {},
            defaultEntries: ["dashboard"],
            policyDefaults: {},
            toolAvailability: [],
          },
        ],
      },
    });

    const container = await renderPage();
    await flush();

    expect(container.textContent).toContain(
      "agentApp.apps.center.status.registration",
    );
    expect(container.textContent).toContain(
      "agentApp.apps.center.action.activate",
    );
    expect(container.textContent).not.toContain(
      "agentApp.apps.center.action.updateOneClick",
    );

    const activateButton = container.querySelector(
      '[data-testid="agent-apps-update-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    expect(activateButton?.disabled).toBe(false);
    await act(async () => {
      activateButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-apps-detail"]'),
    ).not.toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      "agentApp.apps.registration.codeRequired",
    );
    expect(apiMocks.reviewCloudAgentAppRelease).not.toHaveBeenCalled();
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
  });

  it("已安装旧版 Cloud App 可更新时应打开居中安装审查弹窗", async () => {
    installedStates.push(
      buildReadyState({
        manifest: {
          ...(contentFactoryFixture as AppManifest),
          version: "0.2.0",
        },
      }),
    );

    const container = await renderPage();
    await flush();

    expect(container.textContent).toContain(
      "agentApp.apps.center.status.update",
    );
    const updateButton = container.querySelector(
      '[data-testid="agent-apps-update-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    expect(updateButton?.disabled).toBe(false);

    await act(async () => {
      updateButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewCloudAgentAppRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        app: expect.objectContaining({
          appId: "content-factory-app",
          version: "0.3.0",
        }),
      }),
    );
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expectInstallReviewDialog(container);
  });

  it("Cloud App 已满足注册条件时应先生成安装审查再写入 installed state", async () => {
    const container = await renderPage();
    await flush();

    expect(
      container.querySelector(
        '[data-testid="agent-apps-source-state-content-factory-app"]',
      )?.textContent,
    ).toContain("agentApp.apps.sourceState.cloudDiscovered");

    const installCloud = container.querySelector(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      installCloud?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.reviewCloudAgentAppRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        app: expect.objectContaining({
          appId: "content-factory-app",
        }),
        catalogSource: "seeded",
      }),
    );
    expect(apiMocks.saveInstalledAgentAppState).not.toHaveBeenCalled();
    expectInstallReviewDialog(container);

    const confirmInstall = container.querySelector(
      '[data-testid="agent-apps-install-review-confirm"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      confirmInstall?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.saveInstalledAgentAppState).toHaveBeenCalledWith({
      state: expect.objectContaining({
        appId: "content-factory-app",
      }),
    });
  });

  it("Cloud App 缺少 hash 时应阻断安装审查", async () => {
    apiMocks.getAgentAppCloudCatalog.mockResolvedValue({
      source: "remote",
      payload: {
        schemaVersion: "agent-app-cloud-bootstrap/v1",
        tenantId: "tenant-0001",
        generatedAt: "2026-05-15T00:00:00.000Z",
        apps: [
          {
            appId: "content-factory-app",
            displayName: "内容工厂",
            version: "0.3.0",
            registrationRequired: false,
            registrationState: "not_required",
            enabled: true,
            packageUrl:
              "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
            packageHash: "",
            manifestHash: "",
            capabilityRequirements: {},
            defaultEntries: ["dashboard"],
            policyDefaults: {},
            toolAvailability: [],
          },
        ],
      },
    });
    const container = await renderPage();
    await flush();

    expect(
      container.querySelector(
        '[data-testid="agent-apps-source-state-content-factory-app"]',
      )?.textContent,
    ).toContain("agentApp.apps.sourceState.hashMissing");
    const installCloud = container.querySelector(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    ) as HTMLButtonElement | null;
    expect(installCloud?.disabled).toBe(true);
    expect(apiMocks.reviewCloudAgentAppRelease).not.toHaveBeenCalled();
  });

  it("已安装 App 应支持启动 UI entry、禁用/启用和卸载演练", async () => {
    installedStates.push(
      buildReadyState({
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const container = await renderPage();
    await flush();

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="agent-apps-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-apps-launch-summary"]')
        ?.textContent,
    ).toContain("ui:项目首页:/dashboard");

    const moreInfo = container.querySelector(
      '[data-testid="agent-apps-more-info"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      moreInfo?.click();
      await Promise.resolve();
    });
    await flush();

    const disableButton = container.querySelector(
      '[data-testid="agent-apps-disable"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      disableButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.setAgentAppDisabled).toHaveBeenCalledWith({
      appId: "content-factory-app",
      disabled: true,
      updatedAt: expect.any(String),
    });
    expect(container.textContent).toContain(
      "agentApp.apps.center.status.disabled",
    );

    const enableButton = container.querySelector(
      '[data-testid="agent-apps-enable"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      enableButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.setAgentAppDisabled).toHaveBeenLastCalledWith({
      appId: "content-factory-app",
      disabled: false,
      updatedAt: expect.any(String),
    });

    const uninstallButton = container.querySelector(
      '[data-testid="agent-apps-uninstall-delete-data"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      uninstallButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.previewAgentAppUninstall).toHaveBeenCalledWith({
      appId: "content-factory-app",
      mode: "delete-data",
    });
    expect(
      container.querySelector('[data-testid="agent-apps-uninstall-preview"]')
        ?.textContent,
    ).toContain("delete:2 retain:1");
    expect(
      container.querySelector('[data-testid="agent-apps-cleanup-evidence"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-residual-audit"]')
        ?.textContent,
    ).toContain("agentApp.lab.manager.evidence.residual.pendingDeletion");
    const evidenceJson = container.querySelector(
      '[data-testid="agent-apps-cleanup-evidence-json"]',
    )?.textContent;
    expect(evidenceJson).toContain('"namespaceKind": "overlay"');
    expect(evidenceJson).toContain('"category": "secret-ref"');
    expect(evidenceJson).not.toContain("sk-secret-value");

    const confirmButton = container.querySelector(
      '[data-testid="agent-apps-uninstall-confirm"]',
    ) as HTMLButtonElement | null;
    const phrase = container.querySelector(
      '[data-testid="agent-apps-delete-data-confirmation-phrase"]',
    )?.textContent;
    const confirmationInput = container.querySelector(
      '[data-testid="agent-apps-delete-data-confirmation-input"]',
    ) as HTMLInputElement | null;
    expect(phrase).toContain("DELETE_AGENT_APP_DATA content-factory-app");
    expect(confirmButton?.disabled).toBe(true);
    expect(
      container.querySelector(
        '[data-testid="agent-apps-delete-data-confirmation-status"]',
      )?.textContent,
    ).toContain("agentApp.apps.uninstallPreview.deleteDataGate.mismatch");
    await act(async () => {
      if (confirmationInput && phrase) {
        setInputValue(confirmationInput, phrase);
      }
      await Promise.resolve();
    });
    await flush();
    const readyConfirmButton = container.querySelector(
      '[data-testid="agent-apps-uninstall-confirm"]',
    ) as HTMLButtonElement | null;
    expect(readyConfirmButton?.disabled).toBe(false);

    await act(async () => {
      readyConfirmButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.uninstallAgentApp).toHaveBeenCalledWith({
      appId: "content-factory-app",
      mode: "delete-data",
      confirmationPhrase: phrase,
    });
    const appRowAfterUninstall = container.querySelector(
      '[data-testid="agent-apps-list-row-content-factory-app"]',
    );
    expect(appRowAfterUninstall?.textContent).toContain(
      "agentApp.apps.center.status.installable",
    );
    expect(
      container.querySelector('[data-testid="agent-apps-uninstall-preview"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-launch-summary"]')
        ?.textContent,
    ).toContain("agentApp.apps.uninstall.completed");
  });

  it("正式入口点击 UI entry 时应导航到独立 runtime surface", async () => {
    installedStates.push(
      buildReadyState({
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const onNavigate = vi.fn();
    const container = await renderPage(undefined, onNavigate);
    await flush();

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="agent-apps-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(onNavigate).toHaveBeenCalledWith(
      "agent-app",
      expect.objectContaining({
        appId: "content-factory-app",
        entryKey: "dashboard",
        launchRequestKey: expect.any(Number),
      }),
    );
    expect(
      container.querySelector('[data-testid="agent-apps-mounted-ui"]'),
    ).toBeNull();
  });

  it("standalone App 点击 UI entry 时应通过 Shell launch 命令启动", async () => {
    installedStates.push(buildStandaloneState());
    const onNavigate = vi.fn();
    const container = await renderPage(undefined, onNavigate);
    await flush();

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="agent-apps-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.launchAgentAppShell).toHaveBeenCalledWith({
      descriptor: expect.objectContaining({
        appId: "content-factory-app",
        installMode: "standalone",
        runtimeProfile: expect.objectContaining({
          installMode: "standalone",
          shellKind: "app_shell",
        }),
        entry: expect.objectContaining({
          entryKey: "dashboard",
          route: "/dashboard",
        }),
        isolation: expect.objectContaining({
          packageMount: "read-only",
          secrets: "refs-only",
          sideEffects: "runtime-broker",
          evidence: "runtime-provenance",
        }),
      }),
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="agent-apps-launch-summary"]')
        ?.textContent,
    ).toContain("shell:项目首页:http://127.0.0.1:4199/dashboard");
    expect(toast.success).toHaveBeenCalledWith(
      "shell:项目首页:http://127.0.0.1:4199/dashboard",
    );
  });

  it("普通用户首屏不暴露本地路径，更多信息展开后才显示诊断细节", async () => {
    installedStates.push(
      buildReadyState({
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const container = await renderPage();
    await flush();

    expect(container.textContent).not.toContain(LOCAL_APP_DIR);

    await openAppDetail(container);

    const moreInfo = container.querySelector(
      '[data-testid="agent-apps-more-info"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      moreInfo?.click();
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-apps-more-info-content"]')
        ?.textContent,
    ).toContain(LOCAL_APP_DIR);
  });

  it("从导航进入 disabled App 时应被 lifecycle launch gate 阻断", async () => {
    installedStates.push(
      buildReadyState({
        disabled: true,
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const onNavigate = vi.fn();
    const container = await renderPage(
      {
        selectedAgentAppId: "content-factory-app",
        launchAgentAppEntryKey: "dashboard",
        launchRequestKey: 2,
      },
      onNavigate,
    );
    await flush();

    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="agent-apps-mounted-ui"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="agent-apps-launch-summary"]'),
    ).toBeNull();
  });

  it("已安装 App 应支持启动 workflow entry", async () => {
    installedStates.push(
      buildReadyState({
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const container = await renderPage();
    await flush();

    await openAppDetail(container);

    const launchButton = container.querySelector(
      '[data-testid="agent-apps-launch-entry-content_scenario_planning"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-apps-launch-summary"]')
        ?.textContent,
    ).toContain(
      "workflow:内容场景规划:content_scenario_planning-workflow-runtime-1",
    );
  });

  it("从导航进入已安装 App 时应自动打开默认 UI entry", async () => {
    installedStates.push(
      buildReadyState({
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    );
    const container = await renderPage({
      selectedAgentAppId: "content-factory-app",
      launchAgentAppEntryKey: "dashboard",
      launchRequestKey: 1,
    });
    await flush();

    expect(
      container.querySelector('[data-testid="agent-apps-mounted-ui"]')
        ?.textContent,
    ).toContain("项目首页");
    expect(
      container.querySelector('[data-testid="agent-apps-launch-summary"]')
        ?.textContent,
    ).toContain("ui:项目首页:/dashboard");
  });
});
