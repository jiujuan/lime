/* eslint-disable react-refresh/only-export-components */
import { act as reactAct } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast as sonnerToast } from "sonner";
import { expect, vi } from "vitest";
import contentFactoryFixtureData from "../fixtures/content-factory-app.json";
import { buildInstalledAgentAppState } from "../install/installedAppState";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildAgentAppLabResolvedSetupState } from "../install/labInstallFlow";
import { buildPackageIdentity } from "../install/packageIdentity";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import { buildAgentAppHostLifecycleSnapshot } from "../host";
import type {
  AppManifest,
  CloudBootstrapApp,
  HostCapabilityProfile,
  InstalledAgentAppState,
} from "../types";
import { AgentAppsPage } from "./AgentAppsPage";

export const act = reactAct;
export const toast = sonnerToast;

const contentFactoryBaseFixture = contentFactoryFixtureData as AppManifest;

function buildContentFactoryUiRuntimeFixture(): AppManifest {
  return {
    ...contentFactoryBaseFixture,
    version: "0.3.0",
    runtimePackage: {
      ...contentFactoryBaseFixture.runtimePackage,
      ui: {
        path: "./dist/index.html",
      },
    },
    entries: [
      {
        key: "dashboard",
        kind: "page",
        title: "项目首页",
        route: "/dashboard",
        requiredCapabilities: ["lime.ui", "lime.agent", "lime.storage"],
      },
      ...contentFactoryBaseFixture.entries.map((entry) => ({ ...entry })),
    ],
    knowledgeTemplates: [
      {
        key: "project_knowledge",
        type: "project",
        required: true,
      },
    ],
    artifacts: [
      ...(contentFactoryBaseFixture.artifacts ?? []).map((artifact) => ({
        ...artifact,
      })),
      {
        key: "content_table",
        title: "内容表",
        type: "content_table",
      },
    ],
    evals: [
      ...(contentFactoryBaseFixture.evals ?? []).map((evalRule) => ({
        ...evalRule,
      })),
      {
        key: "fact_grounding",
        kind: "fact_grounding",
      },
    ],
    secrets: [
      ...(contentFactoryBaseFixture.secrets ?? []).map((secret) => ({
        ...secret,
      })),
      {
        key: "publish_api_key",
        provider: "host-secret",
      },
    ],
    overlayTemplates: [
      ...(contentFactoryBaseFixture.overlayTemplates ?? []).map((overlay) => ({
        ...overlay,
      })),
      {
        key: "content_review_overlay",
        scope: "entry",
      },
    ],
  };
}

export const contentFactoryFixture = buildContentFactoryUiRuntimeFixture();

export const LOCAL_APP_DIR = "/tmp/lime/content-factory-app";
export const REMOVED_MACHINE_PATH = [
  "/Users",
  "coso",
  "Documents",
  "dev",
  "ai",
  "limecloud",
  "content-factory-app",
].join("/");

const hoistedMocks = vi.hoisted(() => ({
  apiMocks: {
    getAgentAppCloudCatalog: vi.fn(),
    installCloudAgentAppRelease: vi.fn(),
    installLocalAgentAppPackage: vi.fn(),
    launchAgentAppShell: vi.fn(),
    listAgentAppHostLifecycleSnapshots: vi.fn(),
    listInstalledAgentApps: vi.fn(),
    selectLocalAgentAppDirectory: vi.fn(),
    reviewCloudAgentAppRelease: vi.fn(),
    reviewLocalAgentAppPackage: vi.fn(),
    saveInstalledAgentAppState: vi.fn(),
    previewAgentAppUninstall: vi.fn(),
    requestWorkspaceRightSurface: vi.fn(),
    setAgentAppDisabled: vi.fn(),
    submitAgentAppRegistrationCode: vi.fn(),
    uninstallAgentApp: vi.fn(),
  },
}));

export const { apiMocks } = hoistedMocks;

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
      if (key === "agentApp.apps.uninstall.blocked") {
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
  getAgentAppCloudCatalog: hoistedMocks.apiMocks.getAgentAppCloudCatalog,
  installCloudAgentAppRelease:
    hoistedMocks.apiMocks.installCloudAgentAppRelease,
  installLocalAgentAppPackage:
    hoistedMocks.apiMocks.installLocalAgentAppPackage,
  launchAgentAppShell: hoistedMocks.apiMocks.launchAgentAppShell,
  listAgentAppHostLifecycleSnapshots:
    hoistedMocks.apiMocks.listAgentAppHostLifecycleSnapshots,
  listInstalledAgentApps: hoistedMocks.apiMocks.listInstalledAgentApps,
  previewAgentAppUninstall: hoistedMocks.apiMocks.previewAgentAppUninstall,
  reviewCloudAgentAppRelease: hoistedMocks.apiMocks.reviewCloudAgentAppRelease,
  reviewLocalAgentAppPackage: hoistedMocks.apiMocks.reviewLocalAgentAppPackage,
  saveInstalledAgentAppState: hoistedMocks.apiMocks.saveInstalledAgentAppState,
  selectLocalAgentAppDirectory:
    hoistedMocks.apiMocks.selectLocalAgentAppDirectory,
  setAgentAppDisabled: hoistedMocks.apiMocks.setAgentAppDisabled,
  submitAgentAppRegistrationCode:
    hoistedMocks.apiMocks.submitAgentAppRegistrationCode,
  uninstallAgentApp: hoistedMocks.apiMocks.uninstallAgentApp,
  buildAgentAppHostLifecycleForInstalledState: (
    state: InstalledAgentAppState,
  ) => ({
    appId: state.appId,
    displayName: state.projection.app.displayName ?? state.appId,
    profiles: state.manifest.profiles ?? [],
    appCenterStatus: state.readiness.status,
    readinessStatus: state.readiness.status,
    rightSurface: {
      dock: "right",
      physicalDockCount: 1,
      defaultActiveTab: null,
      supportedTabs: [],
      productProfile: {
        enabled: false,
        objects: [],
        panes: [],
        rendererKinds: [],
      },
      historyRestore: {
        enabled: false,
        defaultTab: null,
        defaultPane: null,
        restoreSelection: false,
        restoreLayout: false,
        fallback: "artifactPreview",
      },
    },
    functions: [],
    blockers: [],
    followUps: [],
    generatedAt: state.updatedAt,
  }),
}));

vi.mock("@/lib/api/workspaceRightSurface", () => ({
  requestWorkspaceRightSurface:
    hoistedMocks.apiMocks.requestWorkspaceRightSurface,
}));

vi.mock("@/lib/api/fileSystem", () => ({
  convertLocalFileSrc: (path: string) => `asset://${path}`,
}));

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mountedPages: MountedPage[] = [];
export const installedStates: InstalledAgentAppState[] = [];

export function buildReadyState(
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

function buildHostLifecycleSnapshotForTest(state: InstalledAgentAppState) {
  return buildAgentAppHostLifecycleSnapshot({
    manifest: state.manifest,
    readiness: state.readiness,
    installedState: state,
    generatedAt: state.updatedAt,
  });
}

export function buildStandaloneState(): InstalledAgentAppState {
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

export async function renderPage(
  pageParams?: {
    selectedAgentAppId?: string;
    launchAgentAppEntryKey?: string;
    launchRequestKey?: number;
  },
  onNavigate?: Parameters<typeof AgentAppsPage>[0]["onNavigate"],
  rightSurfaceTarget?: Parameters<
    typeof AgentAppsPage
  >[0]["rightSurfaceTarget"],
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <AgentAppsPage
        onNavigate={onNavigate}
        pageParams={pageParams}
        rightSurfaceTarget={rightSurfaceTarget}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  mountedPages.push({ container, root });
  return container;
}

export async function flush(times = 8) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

export function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function openAppDetail(
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

export function buildReviewResult(state: InstalledAgentAppState) {
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

export function expectInstallReviewDialog(container: HTMLElement) {
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
  apiMocks.listAgentAppHostLifecycleSnapshots.mockImplementation(async () => ({
    snapshots: installedStates.map((state) =>
      structuredClone(buildHostLifecycleSnapshotForTest(state)),
    ),
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
    surface: {
      activeStrategy: "controlledBrowserWindow",
      supportedStrategies: ["controlledBrowserWindow", "webContentsView"],
      entryUrl: "http://127.0.0.1:4199/dashboard",
      containerId: "agent-app-shell-content-factory-app-standalone",
      embedding: {
        standaloneWindow: true,
        rightSurfaceDock: true,
        iframe: false,
        browserView: false,
      },
      isolation: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    },
    shellWindow: {
      label: "agent-app-shell-content-factory-app-standalone",
      title: "内容工厂",
      url: "http://127.0.0.1:4199/dashboard",
      reused: false,
    },
    launchedAt: "2026-05-15T00:00:00.000Z",
  });
  apiMocks.requestWorkspaceRightSurface.mockResolvedValue({
    status: "queued",
    requestId: "right_surface_app_1",
    pending: {
      requestId: "right_surface_app_1",
      workspaceId: "workspace-main",
      sessionId: "session-main",
      surfaceKind: "appSurface",
      origin: "agent_app_center",
      priority: "foreground",
      status: "pending",
      requestedAt: "2026-05-15T00:00:00.000Z",
      reason: "agent_app_shell_surface_ready",
      candidateId: "content-factory-app",
      metadata: {},
    },
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
  apiMocks.previewAgentAppUninstall.mockImplementation(
    async (request: { appId: string; mode: "keep-data" | "delete-data" }) => ({
      appId: request.appId,
      packageHash: "package-fnv1a-test",
      mode: request.mode,
      generatedAt: "2026-05-15T00:02:00.000Z",
      deletedTargetCount: request.mode === "delete-data" ? 2 : 1,
      retainedTargetCount: request.mode === "delete-data" ? 1 : 2,
      targets: [
        {
          kind: "path",
          value: `<LimeAppData>/agent-apps/installed/${request.appId}.json`,
          safeToDelete: true,
          action: "delete",
          reason: "Installed state.",
        },
        {
          kind: "namespace",
          value: `<LimeAppData>/agent-apps/storage/${request.appId}`,
          safeToDelete: true,
          action: "retain",
          reason: "App data.",
        },
      ],
      warnings: ["DRY_RUN_ONLY"],
    }),
  );
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
      const deleteDataConfirmed =
        request.mode === "delete-data" &&
        request.confirmationPhrase === expectedPhrase;
      const keepDataUninstalled = request.mode === "keep-data";
      if (keepDataUninstalled) {
        installedStates.splice(
          0,
          installedStates.length,
          ...installedStates.filter((item) => item.appId !== request.appId),
        );
      }
      const blocked = request.mode === "delete-data";
      return {
        status: blocked ? "blocked" : "uninstalled",
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
        removedTargetCount: keepDataUninstalled ? 2 : 0,
        missingTargetCount: keepDataUninstalled ? 0 : 0,
        blockerCodes: blocked
          ? [
              deleteDataConfirmed
                ? "DELETE_DATA_NOT_ENABLED_IN_CURRENT_PHASE"
                : "CONFIRMATION_MISMATCH",
            ]
          : [],
        deleteEvidence: null,
      };
    },
  );
}

export function resetAgentAppsPageTest() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  installedStates.splice(0, installedStates.length);
  setupDefaultApiMocks();
}

export function cleanupAgentAppsPageTest() {
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
}
