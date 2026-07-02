import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import contentFactoryFixtureData from "../testing/fixtures/content-factory-app.json";
import { resolveAgentAppHostFlags } from "../featureFlag";
import { buildInstalledAgentAppState } from "../install/installedAppState";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import {
  buildAgentAppLabResolvedSetupState,
  evaluateAgentAppLabInstallFlow,
} from "../install/labInstallFlow";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import type { AppManifest, InstalledAgentAppState } from "../types";
import { AgentAppManagerPanel } from "./AgentAppManagerPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (typeof params?.count === "number") {
        return `${key}:${params.count}`;
      }
      if (typeof params?.status === "string") {
        return `${key}:${params.status}`;
      }
      return key;
    },
  }),
}));

interface MountedPanel {
  container: HTMLDivElement;
  root: Root;
}

const mountedPanels: MountedPanel[] = [];

const contentFactoryBaseFixture = contentFactoryFixtureData as AppManifest;

function buildContentFactoryManagerFixture(): AppManifest {
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
  };
}

function cloneInstalledStateForRepository(
  state: InstalledAgentAppState,
  params: {
    appId: string;
    displayName: string;
    disabled?: boolean;
  },
): InstalledAgentAppState {
  const next = structuredClone(state);
  const identity = {
    ...next.identity,
    appId: params.appId,
    sourceUri: `fixture:${params.appId}`,
    packageHash: `${next.identity.packageHash}-${params.appId}`,
    manifestHash: `${next.identity.manifestHash}-${params.appId}`,
  };

  next.appId = params.appId;
  next.identity = identity;
  next.manifest = {
    ...next.manifest,
    appId: params.appId,
    displayName: params.displayName,
    storage: next.manifest.storage
      ? { ...next.manifest.storage, namespace: params.appId }
      : undefined,
  };
  next.projection = {
    ...next.projection,
    app: {
      ...next.projection.app,
      appId: params.appId,
      displayName: params.displayName,
    },
    package: identity,
    storage: next.projection.storage
      ? { ...next.projection.storage, namespace: params.appId }
      : undefined,
    entries: next.projection.entries.map((entry) => ({
      ...entry,
      appId: params.appId,
      provenance: {
        ...entry.provenance,
        appId: params.appId,
        packageHash: identity.packageHash,
        manifestHash: identity.manifestHash,
      },
    })),
    provenance: {
      ...next.projection.provenance,
      appId: params.appId,
      packageHash: identity.packageHash,
      manifestHash: identity.manifestHash,
    },
  };
  next.readiness = {
    ...next.readiness,
    appId: params.appId,
  };
  next.disabled = params.disabled ?? false;
  return next;
}

function buildReadyManagerFixture() {
  const flags = resolveAgentAppHostFlags({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
  const fixture = buildContentFactoryManagerFixture();
  const profile = buildWorkflowRuntimeCapabilityProfile(flags);
  const setupPreview = buildInstalledAppPreview({
    fixture,
    profile,
    loadedAt: "2026-05-15T00:00:00.000Z",
    checkedAt: "2026-05-15T00:00:00.000Z",
    generatedAt: "2026-05-15T00:00:00.000Z",
  });
  const setup = buildAgentAppLabResolvedSetupState(setupPreview.projection);
  const preview = buildInstalledAppPreview({
    fixture,
    setup,
    profile,
    loadedAt: "2026-05-15T00:00:00.000Z",
    checkedAt: "2026-05-15T00:00:00.000Z",
    generatedAt: "2026-05-15T00:00:00.000Z",
  });
  const flow = evaluateAgentAppLabInstallFlow({
    preview,
    setup,
    flags,
    permissionDecision: "accepted",
    entryKey: "dashboard",
    operation: "mount-ui",
    now: "2026-05-15T00:00:00.000Z",
  });
  const primary = flow.installedState ?? buildInstalledAgentAppState({ preview, setup });
  const secondary = cloneInstalledStateForRepository(primary, {
    appId: "content-factory-playbook-app",
    displayName: "内容策略复盘 App",
  });
  return { flow, primary, secondary };
}

async function renderPanel(params?: {
  selectedAppId?: string;
  disabled?: boolean;
  repositoryIssueCount?: number;
  states?: InstalledAgentAppState[];
  evidence?: Parameters<typeof AgentAppManagerPanel>[0]["evidence"];
}) {
  const { flow, primary, secondary } = buildReadyManagerFixture();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onSelectApp = vi.fn();
  const onLaunchEntry = vi.fn();
  const onSetDisabled = vi.fn();
  const onPreviewUninstall = vi.fn();

  await act(async () => {
    root.render(
      <AgentAppManagerPanel
        flow={flow}
        disabled={params?.disabled ?? false}
        evidence={params?.evidence ?? null}
        capabilityHostAvailable={true}
        repositoryIssueCount={params?.repositoryIssueCount ?? 0}
        repositoryStates={params?.states ?? [primary, secondary]}
        selectedAppId={params?.selectedAppId}
        uiRuntimeAvailable={true}
        onLaunchEntry={onLaunchEntry}
        onPreviewUninstall={onPreviewUninstall}
        onSelectApp={onSelectApp}
        onSetDisabled={onSetDisabled}
      />,
    );
    await Promise.resolve();
  });

  mountedPanels.push({ container, root });
  return {
    container,
    onLaunchEntry,
    onPreviewUninstall,
    onSelectApp,
    onSetDisabled,
    primary,
    secondary,
  };
}

describe("AgentAppManagerPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    while (mountedPanels.length > 0) {
      const mounted = mountedPanels.pop();
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

  it("从 repository states 渲染多 App 列表并支持选择", async () => {
    const { container, onSelectApp } = await renderPanel({ repositoryIssueCount: 1 });

    expect(
      container.querySelector('[data-testid="agent-app-manager-repository-list"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-testid^="agent-app-manager-repository-app-"]'),
    ).toHaveLength(2);
    expect(container.textContent).toContain("agentApp.lab.manager.repositorySummary:2");
    expect(container.textContent).toContain("content-factory-app@0.3.0");
    expect(container.textContent).toContain("content-factory-playbook-app@0.3.0");

    const secondaryButton = container.querySelector(
      '[data-testid="agent-app-manager-repository-app-content-factory-playbook-app"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      secondaryButton?.click();
    });

    expect(onSelectApp).toHaveBeenCalledWith("content-factory-playbook-app");
  });

  it("entry launcher 和 lifecycle actions 绑定当前选中的 App state", async () => {
    const { container, onLaunchEntry, onSetDisabled, secondary } = await renderPanel({
      selectedAppId: "content-factory-playbook-app",
    });

    expect(
      container.querySelector('[data-testid="agent-app-manager-selected-app"]')?.textContent,
    ).toContain("fixture:content-factory-playbook-app");

    const launchButton = container.querySelector(
      '[data-testid="agent-app-manager-launch-entry-dashboard"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      launchButton?.click();
    });

    expect(onLaunchEntry).toHaveBeenCalledWith(
      expect.objectContaining({ key: "dashboard", appId: "content-factory-playbook-app" }),
      expect.objectContaining({ appId: "content-factory-playbook-app" }),
    );

    const disableButton = container.querySelector(
      '[data-testid="agent-app-manager-disable"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      disableButton?.click();
    });

    expect(onSetDisabled).toHaveBeenCalledWith(true, secondary);
  });

  it("展示 cleanup rehearsal JSON summary 并保留 selected app 身份", async () => {
    const { flow, secondary } = buildReadyManagerFixture();
    const evidence: Parameters<typeof AgentAppManagerPanel>[0]["evidence"] = {
      action: "uninstall-delete-data",
      appId: secondary.appId,
      appVersion: secondary.identity.appVersion,
      packageHash: secondary.identity.packageHash,
      manifestHash: secondary.identity.manifestHash,
      generatedAt: "2026-05-15T00:00:00.000Z",
      deletedTargetCount: 2,
      retainedTargetCount: 0,
      cleanupEvidence: {
        appId: secondary.appId,
        appVersion: secondary.identity.appVersion,
        packageHash: secondary.identity.packageHash,
        manifestHash: secondary.identity.manifestHash,
        strategy: "delete-data",
        generatedAt: "2026-05-15T00:00:00.000Z",
        targetCount: 2,
        deletedTargetCount: 2,
        retainedTargetCount: 0,
        blockedTargetCount: 1,
        warningCodes: ["DRY_RUN_ONLY"],
        targets: [
          {
            category: "installed-state",
            namespaceKind: "lifecycle",
            appData: false,
            kind: "path",
            value:
              "<LimeAppData>/agent-apps/installed/content-factory-playbook-app.json",
            exists: "unknown",
            safeToDelete: true,
            reason: "Installed Agent App state snapshot.",
            disposition: "delete",
          },
          {
            category: "storage-namespace",
            namespaceKind: "storage",
            appData: true,
            kind: "namespace",
            value:
              "<LimeAppData>/agent-apps/storage/content-factory-playbook-app",
            exists: "unknown",
            safeToDelete: true,
            reason: "App storage namespace.",
            disposition: "delete",
          },
        ],
        blockedTargets: [
          {
            category: "storage-namespace",
            namespaceKind: "storage",
            appData: true,
            kind: "path",
            value: "/Users/example/Documents/customer-notes.md",
            exists: "unknown",
            safeToDelete: true,
            reason: "Out-of-scope user document.",
            blockedReason: "OUT_OF_SCOPE",
          },
        ],
      },
      residualAudit: {
        appId: secondary.appId,
        appVersion: secondary.identity.appVersion,
        packageHash: secondary.identity.packageHash,
        manifestHash: secondary.identity.manifestHash,
        strategy: "delete-data",
        generatedAt: "2026-05-15T00:00:00.000Z",
        retainedTargets: [],
        pendingDeletionTargets: [
          {
            category: "installed-state",
            kind: "path",
            value:
              "<LimeAppData>/agent-apps/installed/content-factory-playbook-app.json",
            reason: "Installed Agent App state snapshot.",
          },
        ],
        blockedOutOfScopeTargets: [
          {
            category: "storage-namespace",
            kind: "path",
            value: "/Users/example/Documents/customer-notes.md",
            reason: "Out-of-scope user document.",
          },
        ],
        repositoryIssues: [],
        retainedCount: 0,
        pendingDeletionCount: 1,
        blockedOutOfScopeCount: 1,
        repositoryIssueCount: 0,
      },
    };
    const { container } = await renderPanel({
      selectedAppId: secondary.appId,
      evidence,
      states: [flow.installedState ?? secondary, secondary],
    });

    const json = container.querySelector(
      '[data-testid="agent-app-manager-evidence-json"]',
    );

    expect(json).not.toBeNull();
    expect(json?.textContent).toContain('"appId": "content-factory-playbook-app"');
    expect(json?.textContent).toContain('"strategy": "delete-data"');
    expect(json?.textContent).toContain('"blockedTargetCount": 1');
    expect(json?.textContent).not.toContain("secret-value");
    expect(
      container.querySelector('[data-testid="agent-app-manager-residual-audit"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="agent-app-manager-residual-pending"]')
        ?.textContent,
    ).toContain("agentApp.lab.manager.evidence.residual.pendingDeletion:1");
    expect(
      container.querySelector('[data-testid="agent-app-manager-residual-blocked"]')
        ?.textContent,
    ).toContain("agentApp.lab.manager.evidence.residual.blockedOutOfScope:1");
  });
});
