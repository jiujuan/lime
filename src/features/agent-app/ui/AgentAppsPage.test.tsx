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

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mountedPages: MountedPage[] = [];
const installedStates: InstalledAgentAppState[] = [];

function buildReadyState(params: {
  disabled?: boolean;
  profile?: HostCapabilityProfile;
} = {}): InstalledAgentAppState {
  const manifest = contentFactoryFixture as AppManifest;
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
    setup,
    disabled: params.disabled,
    installedAt: loadedAt,
    updatedAt: loadedAt,
  });
}

async function renderPage(pageParams?: {
  selectedAgentAppId?: string;
  launchAgentAppEntryKey?: string;
  launchRequestKey?: number;
}, onNavigate?: Parameters<typeof AgentAppsPage>[0]["onNavigate"]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<AgentAppsPage onNavigate={onNavigate} pageParams={pageParams} />);
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
  apiMocks.selectLocalAgentAppDirectory.mockResolvedValue(LOCAL_APP_DIR);
  apiMocks.reviewLocalAgentAppPackage.mockImplementation(async () =>
    buildReviewResult(buildReadyState()),
  );
  apiMocks.reviewCloudAgentAppRelease.mockImplementation(
    async (_params: { app: CloudBootstrapApp }) =>
      buildReviewResult(buildReadyState()),
  );
  apiMocks.saveInstalledAgentAppState.mockImplementation(
    async (request: { state: InstalledAgentAppState }) => installState(request.state),
  );
  apiMocks.installLocalAgentAppPackage.mockImplementation(async () =>
    installState(buildReadyState()),
  );
  apiMocks.installCloudAgentAppRelease.mockImplementation(
    async (_params: { app: CloudBootstrapApp }) => installState(buildReadyState()),
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
    async (request: { appId: string; disabled: boolean; updatedAt?: string }) => {
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
    async (request: { appId: string; mode: "keep-data" | "delete-data" }) => {
      return {
        rehearsal: {
          appId: request.appId,
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
        removedTargetCount: 0,
        missingTargetCount: 0,
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

    expect(container.textContent).toContain("agentApp.apps.localSource.title");
    expect(container.textContent).toContain("agentApp.apps.badge.formalEntry");
    expect(container.textContent).toContain("agentApp.apps.boundaryNote");
    expect(container.textContent).toContain("agentApp.apps.localSource.description");
    expect(container.textContent).not.toContain(REMOVED_MACHINE_PATH);
    expect(container.textContent).toContain("agentApp.apps.cloudSource.title");
    expect(container.textContent).toContain("content-factory-app@0.3.0");
    expect(container.textContent).toContain("agentApp.apps.installed.empty");

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
    expect(
      container.querySelector('[data-testid="agent-apps-install-review"]')
        ?.textContent,
    ).toContain("agentApp.apps.installReview.title");

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
    expect(
      container.querySelector('[data-testid="agent-apps-install-review"]')
        ?.textContent,
    ).toContain("agentApp.apps.installReview.title");
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
    expect(
      container.querySelector('[data-testid="agent-apps-install-review"]')
        ?.textContent,
    ).toContain("agentApp.apps.installReview.title");

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
    expect(container.textContent).toContain("agentApp.apps.status.disabled");

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
    ).toContain(
      "agentApp.lab.manager.evidence.residual.pendingDeletion",
    );
    const evidenceJson = container.querySelector(
      '[data-testid="agent-apps-cleanup-evidence-json"]',
    )?.textContent;
    expect(evidenceJson).toContain('"namespaceKind": "overlay"');
    expect(evidenceJson).toContain('"category": "secret-ref"');
    expect(evidenceJson).not.toContain("sk-secret-value");

    const confirmButton = container.querySelector(
      '[data-testid="agent-apps-uninstall-confirm"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMocks.uninstallAgentApp).toHaveBeenCalledWith({
      appId: "content-factory-app",
      mode: "delete-data",
    });
    expect(container.textContent).toContain("content-factory-app@");
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
    ).toContain("workflow:内容场景规划:content_scenario_planning-workflow-runtime-1");
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
