/* eslint-disable react-refresh/only-export-components */
import { act as reactAct } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast as sonnerToast } from "sonner";
import { expect, vi } from "vitest";
import contentFactoryFixtureData from "../testing/fixtures/content-factory-app.json";
import { buildInstalledPluginState } from "../install/installedAppState";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildPluginLabResolvedSetupState } from "../install/labInstallFlow";
import {
  buildLocalPluginSourceState,
  type PluginInstallReview,
} from "../install/installReview";
import { buildPackageIdentity } from "../install/packageIdentity";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import { buildPluginHostLifecycleSnapshot } from "../host";
import type {
  AppManifest,
  CloudBootstrapApp,
  HostCapabilityProfile,
  InstalledPluginState,
} from "../types";
import { PluginsPage } from "./PluginsPage";

export const act = reactAct;
export const toast = sonnerToast;

const contentFactoryBaseFixture = contentFactoryFixtureData as AppManifest;

function buildContentFactoryUiRuntimeFixture(): AppManifest {
  return {
    ...contentFactoryBaseFixture,
    version: "0.3.0",
    requires: {
      sdk: "@lime/app-sdk@^0.11.0",
      capabilities: [
        "lime.agent",
        "lime.artifacts",
        "lime.evidence",
        "lime.knowledge",
        "lime.media",
        "lime.policy",
        "lime.storage",
        "lime.ui",
      ],
    },
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
    getPluginCloudCatalog: vi.fn(),
    installCloudPluginRelease: vi.fn(),
    installLocalPluginPackage: vi.fn(),
    launchPluginShell: vi.fn(),
    listPluginHostLifecycleSnapshots: vi.fn(),
    listInstalledPlugins: vi.fn(),
    selectLocalPluginDirectory: vi.fn(),
    reviewCloudPluginRelease: vi.fn(),
    reviewLocalPluginPackage: vi.fn(),
    saveInstalledPluginState: vi.fn(),
    previewPluginUninstall: vi.fn(),
    requestWorkspaceRightSurface: vi.fn(),
    listPluginReleaseSubmissions: vi.fn(),
    listPlatformPluginAuditLogs: vi.fn(),
    listClientPluginReleaseSubmissions: vi.fn(),
    approvePluginReleaseSubmission: vi.fn(),
    rejectPluginReleaseSubmission: vi.fn(),
    createClientPluginPackageUploadSession: vi.fn(),
    uploadClientPluginPackageContent: vi.fn(),
    completeClientPluginPackageUploadSession: vi.fn(),
    createClientPluginReleaseSubmission: vi.fn(),
    setPluginDisabled: vi.fn(),
    submitPluginRegistrationCode: vi.fn(),
    uninstallPlugin: vi.fn(),
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
      if (key === "plugin.apps.launch.uiMounted") {
        return `ui:${String(params?.title)}:${String(params?.route)}`;
      }
      if (key === "plugin.apps.launch.workflowCompleted") {
        return `workflow:${String(params?.title)}:${String(params?.runId)}`;
      }
      if (key === "plugin.apps.launch.shellLaunched") {
        return `shell:${String(params?.title)}:${String(params?.target)}`;
      }
      if (key === "plugin.apps.launch.shellBlocked") {
        return `blocked:${String(params?.codes)}`;
      }
      if (key === "plugin.apps.uninstall.blocked") {
        return `blocked:${String(params?.codes)}`;
      }
      if (key === "plugin.apps.uninstallPreview.summary") {
        return `delete:${String(params?.deleted)} retain:${String(
          params?.retained,
        )}`;
      }
      if (key === "plugin.apps.surface.title") {
        return `using:${String(params?.title)}`;
      }
      if (key === "plugin.apps.launchTarget.targetFallback") {
        return `Claw ${String(params?.index)}`;
      }
      if (key === "plugin.apps.launchTarget.targetHint") {
        return `target:${String(params?.target)}`;
      }
      if (typeof params?.count === "number") {
        return `${key}:${params.count}`;
      }
      return key;
    },
  }),
}));

vi.mock("@/lib/api/plugins", () => ({
  PLUGINS_CHANGED_EVENT: "lime:plugins-changed",
  getPluginCloudCatalog: hoistedMocks.apiMocks.getPluginCloudCatalog,
  installCloudPluginRelease: hoistedMocks.apiMocks.installCloudPluginRelease,
  installLocalPluginPackage: hoistedMocks.apiMocks.installLocalPluginPackage,
  launchPluginShell: hoistedMocks.apiMocks.launchPluginShell,
  listPluginHostLifecycleSnapshots:
    hoistedMocks.apiMocks.listPluginHostLifecycleSnapshots,
  listInstalledPlugins: hoistedMocks.apiMocks.listInstalledPlugins,
  previewPluginUninstall: hoistedMocks.apiMocks.previewPluginUninstall,
  reviewCloudPluginRelease: hoistedMocks.apiMocks.reviewCloudPluginRelease,
  reviewLocalPluginPackage: hoistedMocks.apiMocks.reviewLocalPluginPackage,
  saveInstalledPluginState: hoistedMocks.apiMocks.saveInstalledPluginState,
  selectLocalPluginDirectory: hoistedMocks.apiMocks.selectLocalPluginDirectory,
  setPluginDisabled: hoistedMocks.apiMocks.setPluginDisabled,
  submitPluginRegistrationCode:
    hoistedMocks.apiMocks.submitPluginRegistrationCode,
  uninstallPlugin: hoistedMocks.apiMocks.uninstallPlugin,
  buildPluginHostLifecycleForInstalledState: (state: InstalledPluginState) => ({
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
      articleWorkspace: {
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

vi.mock("@/lib/api/oemCloudPluginPublish", () => ({
  listPluginReleaseSubmissions:
    hoistedMocks.apiMocks.listPluginReleaseSubmissions,
  listPlatformPluginAuditLogs:
    hoistedMocks.apiMocks.listPlatformPluginAuditLogs,
  listClientPluginReleaseSubmissions:
    hoistedMocks.apiMocks.listClientPluginReleaseSubmissions,
  approvePluginReleaseSubmission:
    hoistedMocks.apiMocks.approvePluginReleaseSubmission,
  rejectPluginReleaseSubmission:
    hoistedMocks.apiMocks.rejectPluginReleaseSubmission,
  createClientPluginPackageUploadSession:
    hoistedMocks.apiMocks.createClientPluginPackageUploadSession,
  uploadClientPluginPackageContent:
    hoistedMocks.apiMocks.uploadClientPluginPackageContent,
  completeClientPluginPackageUploadSession:
    hoistedMocks.apiMocks.completeClientPluginPackageUploadSession,
  createClientPluginReleaseSubmission:
    hoistedMocks.apiMocks.createClientPluginReleaseSubmission,
  summarizePluginPublishPreflight: (response: {
    valid: boolean;
    blockers: unknown[];
    warnings?: unknown[];
    targetImpact?: Array<{ action: string }>;
  }) => ({
    valid: response.valid,
    blockerCount: response.blockers.length,
    warningCount: response.warnings?.length ?? 0,
    targetCount: response.targetImpact?.length ?? 0,
    updatedTargetCount:
      response.targetImpact?.filter((item) => item.action === "updated")
        .length ?? 0,
  }),
}));

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mountedPages: MountedPage[] = [];
export const installedStates: InstalledPluginState[] = [];

export function buildReadyState(
  params: {
    disabled?: boolean;
    installMode?: InstalledPluginState["installMode"];
    manifest?: AppManifest;
    profile?: HostCapabilityProfile;
  } = {},
): InstalledPluginState {
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
  const setup = buildPluginLabResolvedSetupState(setupPreview.projection);
  const preview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    setup,
    profile: params.profile,
    loadedAt,
    checkedAt: loadedAt,
    generatedAt: loadedAt,
  });

  return buildInstalledPluginState({
    preview,
    installMode: params.installMode,
    setup,
    disabled: params.disabled,
    installedAt: loadedAt,
    updatedAt: loadedAt,
  });
}

function buildHostLifecycleSnapshotForTest(state: InstalledPluginState) {
  return buildPluginHostLifecycleSnapshot({
    manifest: state.manifest,
    readiness: state.readiness,
    installedState: state,
    generatedAt: state.updatedAt,
  });
}

export function buildStandaloneState(): InstalledPluginState {
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
  pageParams?: Parameters<typeof PluginsPage>[0]["pageParams"],
  onNavigate?: Parameters<typeof PluginsPage>[0]["onNavigate"],
  rightSurfaceTarget?: Parameters<typeof PluginsPage>[0]["rightSurfaceTarget"],
  rightSurfaceTargets?: Parameters<
    typeof PluginsPage
  >[0]["rightSurfaceTargets"],
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <PluginsPage
        onNavigate={onNavigate}
        pageParams={pageParams}
        rightSurfaceTarget={rightSurfaceTarget}
        rightSurfaceTargets={rightSurfaceTargets}
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
    `[data-testid="plugins-open-detail-${appId}"]`,
  ) as HTMLButtonElement | null;
  expect(detailButton).not.toBeNull();
  await act(async () => {
    detailButton?.click();
    await Promise.resolve();
  });
  await flush();
}

function installState(state: InstalledPluginState): InstalledPluginState {
  installedStates.splice(0, installedStates.length, state);
  return state;
}

export function buildReviewResult(
  state: InstalledPluginState,
  reviewOverrides: Partial<PluginInstallReview> = {},
) {
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
      sourceState: buildLocalPluginSourceState(),
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
      ...reviewOverrides,
    },
  };
}

export function expectInstallReviewDialog(container: HTMLElement) {
  const overlay = container.querySelector(
    '[data-testid="plugins-install-review-overlay"]',
  );
  const dialog = container.querySelector(
    '[data-testid="plugins-install-review"]',
  );

  expect(overlay).not.toBeNull();
  expect(dialog).not.toBeNull();
  expect(dialog?.getAttribute("role")).toBe("dialog");
  expect(dialog?.getAttribute("aria-modal")).toBe("true");
  expect(dialog?.textContent).toContain("plugin.apps.installReview.title");
  expect(
    container
      .querySelector('[data-testid="plugins-page"]')
      ?.lastElementChild?.getAttribute("data-testid"),
  ).not.toBe("plugins-install-review");
}

function setupDefaultApiMocks() {
  apiMocks.getPluginCloudCatalog.mockResolvedValue({
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
            "https://lime.local/plugins/content-factory-app/releases/0.3.0/package.zip",
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
  apiMocks.listInstalledPlugins.mockImplementation(async () => ({
    states: installedStates.map((state) => structuredClone(state)),
    issues: [],
  }));
  apiMocks.listPluginHostLifecycleSnapshots.mockImplementation(async () => ({
    snapshots: installedStates.map((state) =>
      structuredClone(buildHostLifecycleSnapshotForTest(state)),
    ),
    issues: [],
  }));
  apiMocks.launchPluginShell.mockResolvedValue({
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
      containerId: "plugin-shell-content-factory-app-standalone",
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
      label: "plugin-shell-content-factory-app-standalone",
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
      origin: "plugin_center",
      priority: "foreground",
      status: "pending",
      requestedAt: "2026-05-15T00:00:00.000Z",
      reason: "plugin_shell_surface_ready",
      candidateId: "content-factory-app",
      metadata: {},
    },
  });
  apiMocks.listPluginReleaseSubmissions.mockResolvedValue({ items: [] });
  apiMocks.listPlatformPluginAuditLogs.mockResolvedValue({ items: [] });
  apiMocks.listClientPluginReleaseSubmissions.mockResolvedValue({ items: [] });
  apiMocks.approvePluginReleaseSubmission.mockImplementation(
    async (submissionId: string) => ({
      submission: {
        id: submissionId,
        status: "published",
      },
    }),
  );
  apiMocks.rejectPluginReleaseSubmission.mockImplementation(
    async (submissionId: string, payload: { reason: string }) => ({
      id: submissionId,
      status: "rejected",
      reviewNotes: payload.reason,
    }),
  );
  apiMocks.createClientPluginPackageUploadSession.mockRejectedValue(
    new Error("upload session mock not configured"),
  );
  apiMocks.uploadClientPluginPackageContent.mockRejectedValue(
    new Error("upload content mock not configured"),
  );
  apiMocks.completeClientPluginPackageUploadSession.mockRejectedValue(
    new Error("complete upload mock not configured"),
  );
  apiMocks.createClientPluginReleaseSubmission.mockRejectedValue(
    new Error("release submission mock not configured"),
  );
  apiMocks.selectLocalPluginDirectory.mockResolvedValue(LOCAL_APP_DIR);
  apiMocks.reviewLocalPluginPackage.mockImplementation(async () =>
    buildReviewResult(buildReadyState()),
  );
  apiMocks.reviewCloudPluginRelease.mockImplementation(
    async (_params: { app: CloudBootstrapApp }) => {
      const state = buildReadyState();
      return buildReviewResult(state, {
        sourceKind: "cloud_release",
        sourceUri:
          "https://lime.local/plugins/content-factory-app/releases/0.3.0/package.zip",
        packageUrl:
          "https://lime.local/plugins/content-factory-app/releases/0.3.0/package.zip",
        releaseEvidence: {
          appId: state.appId,
          version: state.identity.appVersion,
          catalogSource: "seeded",
          sourceKind: "fetched_package",
          packageHashDeclared: true,
          manifestHashDeclared: true,
          signatureDeclared: false,
          declaredPackageHash: state.identity.packageHash,
          declaredManifestHash: state.identity.manifestHash,
          actualPackageHash: state.identity.packageHash,
          actualManifestHash: state.identity.manifestHash,
          packageHashMatched: true,
          manifestHashMatched: true,
          signaturePolicy: "optional",
          signatureVerificationStatus: "not_configured",
          packageVerificationStatus: "verified",
          status: "warning",
          blockerCodes: [],
          warningCodes: ["signature_missing"],
        },
      });
    },
  );
  apiMocks.saveInstalledPluginState.mockImplementation(
    async (request: { state: InstalledPluginState }) =>
      installState(request.state),
  );
  apiMocks.installLocalPluginPackage.mockImplementation(async () =>
    installState(buildReadyState()),
  );
  apiMocks.installCloudPluginRelease.mockImplementation(
    async (_params: { app: CloudBootstrapApp }) =>
      installState(buildReadyState()),
  );
  apiMocks.submitPluginRegistrationCode.mockResolvedValue({
    source: "remote",
    payload: {
      schemaVersion: "plugin-cloud-bootstrap/v1",
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
            "https://lime.local/plugins/content-factory-app/releases/0.3.0/package.zip",
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
  apiMocks.setPluginDisabled.mockImplementation(
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
  apiMocks.previewPluginUninstall.mockImplementation(
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
          value: `<LimeAppData>/plugins/installed/${request.appId}.json`,
          safeToDelete: true,
          action: "delete",
          reason: "Installed state.",
        },
        {
          kind: "namespace",
          value: `<LimeAppData>/plugins/storage/${request.appId}`,
          safeToDelete: true,
          action: "retain",
          reason: "App data.",
        },
      ],
      warnings: ["DRY_RUN_ONLY"],
    }),
  );
  apiMocks.uninstallPlugin.mockImplementation(
    async (request: {
      appId: string;
      mode: "keep-data" | "delete-data";
      confirmationPhrase?: string;
    }) => {
      const state = installedStates.find(
        (item) => item.appId === request.appId,
      );
      const expectedPhrase = state
        ? `DELETE_PLUGIN_DATA ${request.appId} ${state.identity.packageHash}`
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

export function resetPluginsPageTest() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  installedStates.splice(0, installedStates.length);
  setupDefaultApiMocks();
}

export function cleanupPluginsPageTest() {
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
