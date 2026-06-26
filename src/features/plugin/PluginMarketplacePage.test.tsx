import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupMountedRoots,
  flushEffects,
  mountHarness,
  setupReactActEnvironment,
  type MountedRoot,
} from "@/components/workspace/hooks/testUtils";
import type { OemCloudRuntimeContext } from "@/lib/api/oemCloudRuntime";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import type { PluginMarketplaceRegistrySnapshot } from "./marketplace/marketplaceRegistryLoader";
import type { PluginRegistryItem } from "./manifest/types";
import type { PluginMarketplaceItem } from "./marketplace/types";
import type { PluginMarketplaceActionDeps } from "./marketplace/pluginMarketplaceActions";
import {
  PluginMarketplacePage,
  type PluginMarketplacePageProps,
} from "./PluginMarketplacePage";
import {
  buildPluginMarketplaceHistoryAgentParams,
  buildPluginMarketplaceOpenAgentParams,
} from "./PluginMarketplacePageNavigation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mountedRoots: MountedRoot[] = [];

function runtimeContext(): OemCloudRuntimeContext {
  return {
    baseUrl: "https://cloud.example.com",
    controlPlaneBaseUrl: "https://cloud.example.com/api",
    sceneBaseUrl: "https://cloud.example.com/scene-api",
    gatewayBaseUrl: "https://cloud.example.com/gateway-api",
    tenantId: "tenant-0001",
    sessionToken: "session-token-001",
    hubProviderName: "Lime Cloud",
    loginPath: "/login",
    desktopClientId: "desktop-client",
    desktopOauthRedirectUrl: "lime://oauth/callback",
    desktopOauthNextPath: "/welcome",
    agentAppSignatureTrustRoots: [],
  };
}

function marketplaceItem(
  pluginKey: string,
  overrides: Partial<PluginMarketplaceItem> = {},
): PluginMarketplaceItem {
  const pluginName = pluginKey.split("@")[0] ?? pluginKey;
  return {
    pluginKey,
    pluginName,
    marketplaceName: "limecloud",
    displayName: overrides.displayName ?? pluginName,
    description: `${pluginName} plugin`,
    version: "1.0.0",
    category: "research",
    categories: ["research"],
    sourceKind: "agent_app_release",
    appId: pluginName,
    enabled: true,
    installState: "available",
    activationState: "activatable",
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_USE",
    },
    package: {
      releaseId: `${pluginName}-release-001`,
      packageUrl: `https://packages.limecloud.example/plugins/${pluginName}-1.0.0.lpkg`,
      packageHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      manifestHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    ...overrides,
  };
}

function registryItem(
  pluginId: string,
  overrides: Partial<PluginRegistryItem> = {},
): PluginRegistryItem {
  return {
    pluginId,
    displayName: overrides.displayName ?? pluginId,
    version: "1.0.0",
    installed: false,
    enabled: false,
    capabilityStates: ["installable"],
    activationState: "blocked",
    rendererState: "missing_renderer",
    historyState: "unavailable",
    blockerCodes: ["PLUGIN_ACTIVATION_BLOCKED"],
    ...overrides,
  };
}

function snapshot(): PluginMarketplaceRegistrySnapshot {
  return {
    marketplace: {
      schemaVersion: "plugin-marketplace/v1",
      tenantId: "tenant-0001",
      generatedAt: "2026-06-25T00:00:00.000Z",
      marketplaceName: "limecloud",
      items: [
        marketplaceItem("research-kit@limecloud", {
          displayName: "Research Kit",
          description: "Research workflow",
          category: "research",
          categories: ["research"],
        }),
        marketplaceItem("notes-kit@limecloud", {
          displayName: "Notes Kit",
          description: "Writing workflow",
          category: "writing",
          categories: ["writing"],
          manifestSummary: {
            skills: [
              {
                id: "article-writer",
                title: "Article Writer",
                description: "Draft articles",
              },
            ],
          },
        }),
      ],
    },
    installed: {
      states: [],
      issues: [],
    },
    projectionInputs: [],
    registry: [
      registryItem("research-kit@limecloud", {
        displayName: "Research Kit",
      }),
      registryItem("notes-kit@limecloud", {
        displayName: "Notes Kit",
        installed: true,
        enabled: false,
        capabilityStates: [],
        activationState: "disabled",
        historyState: "unavailable",
        blockerCodes: [
          "PLUGIN_DISABLED",
          "PLUGIN_RENDERER_UNAVAILABLE",
          "PLUGIN_WORKSPACE_MISSING",
        ],
      }),
    ],
  };
}

async function renderPage(props: Partial<PluginMarketplacePageProps> = {}) {
  const mounted = mountHarness(
    PluginMarketplacePage,
    {
      runtimeContext: runtimeContext(),
      ...props,
    },
    mountedRoots,
  );
  await flushEffects(8);
  return mounted.container;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function installedState(appId: string): InstalledAgentAppState {
  return {
    appId,
    identity: {
      sourceKind: "cloud_release",
      sourceUri: `https://packages.limecloud.example/plugins/${appId}-1.0.0.lpkg`,
      appId,
      appVersion: "1.0.0",
      packageHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      manifestHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      loadedAt: "2026-06-25T00:00:00.000Z",
    },
    manifest: {} as InstalledAgentAppState["manifest"],
    projection: {} as InstalledAgentAppState["projection"],
    readiness: {} as InstalledAgentAppState["readiness"],
    installMode: "in_lime",
    runtimeProfileSummary:
      {} as InstalledAgentAppState["runtimeProfileSummary"],
    setup: {} as InstalledAgentAppState["setup"],
    disabled: false,
    installedAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  } as InstalledAgentAppState;
}

function uninstallPreview(appId: string) {
  return {
    appId,
    packageHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    mode: "keep-data" as const,
    generatedAt: "2026-06-25T01:02:03.000Z",
    deletedTargetCount: 1,
    retainedTargetCount: 2,
    targets: [],
    warnings: [],
  };
}

describe("PluginMarketplacePage", () => {
  beforeEach(() => {
    setupReactActEnvironment();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    vi.restoreAllMocks();
  });

  it("未连接云端时应显示阻断态且不加载 marketplace", async () => {
    const loader = vi.fn(async () => snapshot());
    const container = await renderPage({
      runtimeContext: null,
      loader,
    });

    expect(container.textContent).toContain(
      "plugin.marketplace.cloudRequired.title",
    );
    expect(loader).not.toHaveBeenCalled();
  });

  it("应加载云端 marketplace 并展示只读插件列表", async () => {
    const loader = vi.fn(async () => snapshot());
    const container = await renderPage({ loader });

    expect(loader).toHaveBeenCalledWith(
      "tenant-0001",
      { query: undefined, category: undefined, sort: "name" },
      undefined,
    );
    expect(container.textContent).toContain("Research Kit");
    expect(container.textContent).toContain("Notes Kit");
    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-action-research-kit@limecloud"]',
    );
    expect(action?.disabled).toBe(false);
    expect(
      container.querySelector(
        '[data-testid="plugin-marketplace-row-research-kit@limecloud"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="plugin-marketplace-detail-panel"]',
      ),
    ).not.toBeNull();
  });

  it("应展示插件详情并支持从列表切换当前插件", async () => {
    const loader = vi.fn(async () => snapshot());
    const container = await renderPage({ loader });

    const detailPanel = container.querySelector(
      '[data-testid="plugin-marketplace-detail-panel"]',
    );
    expect(detailPanel?.textContent).toContain("Notes Kit");
    expect(detailPanel?.textContent).toContain("PLUGIN_DISABLED");
    expect(detailPanel?.textContent).toContain(
      "plugin.marketplace.detail.nextStepEnable",
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-detail-research-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    const switchedPanel = container.querySelector(
      '[data-testid="plugin-marketplace-detail-panel"]',
    );
    expect(switchedPanel?.textContent).toContain("Research Kit");
    expect(switchedPanel?.textContent).toContain(
      "https://packages.limecloud.example/plugins/research-kit-1.0.0.lpkg",
    );
    expect(switchedPanel?.textContent).toContain(
      "plugin.marketplace.detail.nextStepInstall",
    );
  });

  it("插件名称为空时应显示 fallback 标识且保持动作可点击", async () => {
    const emptyNameSnapshot = snapshot();
    emptyNameSnapshot.marketplace.items[0] = marketplaceItem(
      "empty-kit@limecloud",
      {
        pluginName: " ",
        displayName: " ",
        appId: "empty-kit",
      },
    );
    emptyNameSnapshot.registry[0] = registryItem("empty-kit@limecloud", {
      displayName: " ",
    });
    const loader = vi.fn(async () => emptyNameSnapshot);
    const container = await renderPage({ loader });

    expect(container.textContent).toContain("empty-kit@limecloud");
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="plugin-marketplace-action-empty-kit@limecloud"]',
      )?.disabled,
    ).toBe(false);
  });

  it("已安装且可激活插件应能打开到显式插件输入入口", async () => {
    const openSnapshot = snapshot();
    openSnapshot.registry[1] = registryItem("notes-kit@limecloud", {
      displayName: "Notes Kit",
      installed: true,
      enabled: true,
      capabilityStates: ["activatable"],
      activationState: "activatable",
      historyState: "read_write",
      blockerCodes: ["PLUGIN_RENDERER_UNAVAILABLE"],
    });
    const loader = vi.fn(async () => openSnapshot);
    const onNavigate = vi.fn();
    const container = await renderPage({ loader, onNavigate });

    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-action-notes-kit@limecloud"]',
    );
    expect(action?.disabled).toBe(false);

    await act(async () => {
      action?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "new-task",
        initialUserPrompt: "@Notes Kit ",
        immersiveHome: false,
        newChatAt: expect.any(Number),
      }),
    );
  });

  it("插件详情技能入口应预填显式 @插件:技能 输入且不自动发送", async () => {
    const openSnapshot = snapshot();
    openSnapshot.registry[1] = registryItem("notes-kit@limecloud", {
      displayName: "Notes Kit",
      installed: true,
      enabled: true,
      capabilityStates: ["activatable"],
      activationState: "activatable",
      historyState: "read_write",
      blockerCodes: [],
    });
    const loader = vi.fn(async () => openSnapshot);
    const onNavigate = vi.fn();
    const container = await renderPage({ loader, onNavigate });

    expect(
      container.querySelector('[data-testid="plugin-marketplace-skill-panel"]'),
    ).not.toBeNull();
    const skillAction = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-skill-notes-kit@limecloud-article-writer"]',
    );
    expect(skillAction?.disabled).toBe(false);

    await act(async () => {
      skillAction?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "new-task",
        initialUserPrompt: "@Notes Kit:Article Writer ",
        immersiveHome: false,
        newChatAt: expect.any(Number),
      }),
    );
  });

  it("只读历史插件应打开到历史恢复入口且不自动执行", async () => {
    const historySnapshot = snapshot();
    historySnapshot.registry[1] = registryItem("notes-kit@limecloud", {
      displayName: "Notes Kit",
      installed: true,
      enabled: true,
      capabilityStates: ["read_only_history"],
      activationState: "blocked",
      historyState: "read_only_history",
      blockerCodes: ["PLUGIN_ACTIVATION_BLOCKED"],
    });
    const loader = vi.fn(async () => historySnapshot);
    const onNavigate = vi.fn();
    const container = await renderPage({ loader, onNavigate });

    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-action-notes-kit@limecloud"]',
    );
    expect(action?.disabled).toBe(false);

    await act(async () => {
      action?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "claw",
        immersiveHome: false,
        entryBannerMessage: "plugin.marketplace.history.entryBanner",
        initialRequestMetadata: {
          harness: {
            plugin_history_restore: {
              session_id: "plugin-history:notes-kit@limecloud",
              plugin_id: "notes-kit@limecloud",
              active_agent_app_id: "notes-kit",
              active_entry_key: "notes-kit",
            },
          },
        },
        newChatAt: expect.any(Number),
      }),
    );
  });

  it("可安装插件应调用 current Agent App cloud install API 并刷新列表", async () => {
    const loader = vi.fn(async () => snapshot());
    const installCloudRelease: NonNullable<
      PluginMarketplaceActionDeps["installCloudRelease"]
    > = vi.fn(async (request) => installedState(request.app.appId));
    const container = await renderPage({
      loader,
      actionDeps: {
        installCloudRelease,
        dispatchChanged: vi.fn(),
      },
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-action-research-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(installCloudRelease).toHaveBeenCalledWith({
      app: expect.objectContaining({
        appId: "research-kit",
        displayName: "Research Kit",
        packageUrl:
          "https://packages.limecloud.example/plugins/research-kit-1.0.0.lpkg",
      }),
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("安装时授权插件应提交注册码并刷新列表", async () => {
    const registrationSnapshot = snapshot();
    registrationSnapshot.marketplace.items[0] = marketplaceItem(
      "research-kit@limecloud",
      {
        displayName: "Research Kit",
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        blockedReason: "registration required",
      },
    );
    registrationSnapshot.registry[0] = registryItem(
      "research-kit@limecloud",
      {
        displayName: "Research Kit",
        capabilityStates: ["installable"],
        activationState: "blocked",
        blockerCodes: [
          "PLUGIN_MARKETPLACE_BLOCKED:registration required",
          "PLUGIN_ACTIVATION_BLOCKED",
        ],
      },
    );
    const loader = vi.fn(async () => registrationSnapshot);
    const submitRegistrationCode: NonNullable<
      PluginMarketplaceActionDeps["submitRegistrationCode"]
    > = vi.fn(async () => ({
      payload: {
        schemaVersion: "agent-app-catalog/v1",
        generatedAt: "2026-06-25T01:02:03.000Z",
        apps: [],
      },
      source: "remote" as const,
    }));
    const container = await renderPage({
      loader,
      actionDeps: {
        submitRegistrationCode,
        dispatchChanged: vi.fn(),
      },
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-detail-research-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    const detailPanel = container.querySelector(
      '[data-testid="plugin-marketplace-detail-panel"]',
    );
    expect(detailPanel?.textContent).toContain(
      "plugin.marketplace.detail.nextStepRegistration",
    );
    expect(
      container.querySelector(
        '[data-testid="plugin-marketplace-registration-panel"]',
      ),
    ).not.toBeNull();
    const submitButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-registration-submit-research-kit@limecloud"]',
    );
    expect(submitButton?.disabled).toBe(true);

    const codeInput = container.querySelector<HTMLInputElement>(
      '[data-testid="plugin-marketplace-registration-code-research-kit@limecloud"]',
    );
    await act(async () => {
      if (codeInput) {
        setInputValue(codeInput, "REG-001");
      }
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(submitButton?.disabled).toBe(false);
    await act(async () => {
      submitButton?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(submitRegistrationCode).toHaveBeenCalledWith(
      "research-kit",
      "REG-001",
    );
    expect(loader).toHaveBeenCalledTimes(2);
    expect(codeInput?.value).toBe("");
  });

  it("已安装但禁用插件应调用 current disabled-set API 并刷新列表", async () => {
    const loader = vi.fn(async () => snapshot());
    const setDisabled: NonNullable<PluginMarketplaceActionDeps["setDisabled"]> =
      vi.fn(async () => ({
        states: [],
        issues: [],
      }));
    const container = await renderPage({
      loader,
      actionDeps: {
        setDisabled,
        now: () => "2026-06-25T01:02:03.000Z",
        dispatchChanged: vi.fn(),
      },
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-action-notes-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(setDisabled).toHaveBeenCalledWith({
      appId: "notes-kit",
      disabled: false,
      updatedAt: "2026-06-25T01:02:03.000Z",
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("已安装且启用插件应在详情管理区支持禁用", async () => {
    const installedSnapshot = snapshot();
    installedSnapshot.registry[0] = registryItem("research-kit@limecloud", {
      displayName: "Research Kit",
      installed: true,
      enabled: true,
      capabilityStates: ["activatable"],
      activationState: "activatable",
      historyState: "read_write",
      blockerCodes: [],
    });
    const loader = vi.fn(async () => installedSnapshot);
    const setDisabled: NonNullable<PluginMarketplaceActionDeps["setDisabled"]> =
      vi.fn(async () => ({
        states: [],
        issues: [],
      }));
    const container = await renderPage({
      loader,
      actionDeps: {
        setDisabled,
        now: () => "2026-06-25T01:02:03.000Z",
        dispatchChanged: vi.fn(),
      },
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-detail-research-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    const managementPanel = container.querySelector(
      '[data-testid="plugin-marketplace-management-panel"]',
    );
    expect(managementPanel?.textContent).toContain(
      "plugin.marketplace.management.title",
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-manage-disable-research-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(setDisabled).toHaveBeenCalledWith({
      appId: "research-kit",
      disabled: true,
      updatedAt: "2026-06-25T01:02:03.000Z",
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("卸载取消确认时不调用卸载 API", async () => {
    const installedSnapshot = snapshot();
    installedSnapshot.registry[0] = registryItem("research-kit@limecloud", {
      displayName: "Research Kit",
      installed: true,
      enabled: true,
      capabilityStates: ["activatable"],
      activationState: "activatable",
      historyState: "read_write",
      blockerCodes: [],
    });
    const loader = vi.fn(async () => installedSnapshot);
    const previewUninstall: NonNullable<
      PluginMarketplaceActionDeps["previewUninstall"]
    > = vi.fn(async () => uninstallPreview("research-kit"));
    const uninstall: NonNullable<PluginMarketplaceActionDeps["uninstall"]> =
      vi.fn(async () => ({
        status: "uninstalled",
        rehearsal: uninstallPreview("research-kit"),
        list: {
          states: [],
          issues: [],
        },
        removedTargetCount: 1,
        missingTargetCount: 0,
      }));
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const container = await renderPage({
      loader,
      actionDeps: {
        previewUninstall,
        uninstall,
        dispatchChanged: vi.fn(),
      },
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-detail-research-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-manage-uninstall-research-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });

    expect(window.confirm).toHaveBeenCalledWith(
      "plugin.marketplace.management.uninstallConfirm",
    );
    expect(previewUninstall).not.toHaveBeenCalled();
    expect(uninstall).not.toHaveBeenCalled();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("确认卸载时应调用 current keep-data uninstall API 并刷新列表", async () => {
    const installedSnapshot = snapshot();
    installedSnapshot.registry[0] = registryItem("research-kit@limecloud", {
      displayName: "Research Kit",
      installed: true,
      enabled: true,
      capabilityStates: ["activatable"],
      activationState: "activatable",
      historyState: "read_write",
      blockerCodes: [],
    });
    const loader = vi.fn(async () => installedSnapshot);
    const previewUninstall: NonNullable<
      PluginMarketplaceActionDeps["previewUninstall"]
    > = vi.fn(async () => uninstallPreview("research-kit"));
    const uninstall: NonNullable<PluginMarketplaceActionDeps["uninstall"]> =
      vi.fn(async () => ({
        status: "uninstalled",
        rehearsal: uninstallPreview("research-kit"),
        list: {
          states: [],
          issues: [],
        },
        removedTargetCount: 1,
        missingTargetCount: 0,
      }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const container = await renderPage({
      loader,
      actionDeps: {
        previewUninstall,
        uninstall,
        dispatchChanged: vi.fn(),
      },
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-detail-research-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-manage-uninstall-research-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(previewUninstall).toHaveBeenCalledWith({
      appId: "research-kit",
      mode: "keep-data",
    });
    expect(uninstall).toHaveBeenCalledWith({
      appId: "research-kit",
      mode: "keep-data",
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("打开参数应在显示名为空时回落到插件标识", () => {
    const item = {
      pluginId: "fallback-plugin",
      pluginName: "",
      marketplaceName: "limecloud",
      displayName: " ",
      marketplaceItemDisplayName: " ",
      description: "",
      version: "1.0.0",
      categories: [],
      sourceKind: "plugin_catalog",
      policy: {
        installation: "INSTALLED_BY_DEFAULT",
        authentication: "ON_USE",
      },
      installed: true,
      enabled: true,
      installable: false,
      activatable: true,
      renderable: true,
      readOnlyHistory: false,
      skills: [],
      needsAttention: false,
      blockerCodes: [],
      primaryAction: {
        kind: "open",
        labelKey: "plugin.marketplace.action.open",
        disabled: false,
        blockerCodes: [],
      },
    };

    expect(buildPluginMarketplaceOpenAgentParams(item)).toMatchObject({
      agentEntry: "new-task",
      initialUserPrompt: "@fallback-plugin ",
    });
  });

  it("历史入口参数应携带只读恢复 metadata", () => {
    const item = {
      pluginId: "history-plugin",
      pluginName: "history-entry",
      marketplaceName: "limecloud",
      displayName: "History Plugin",
      marketplaceItemDisplayName: "History Plugin",
      description: "",
      version: "1.0.0",
      categories: [],
      sourceKind: "plugin_catalog",
      appId: "history-app",
      policy: {
        installation: "INSTALLED_BY_DEFAULT",
        authentication: "ON_USE",
      },
      installed: true,
      enabled: false,
      installable: false,
      activatable: false,
      renderable: false,
      readOnlyHistory: true,
      skills: [],
      needsAttention: true,
      blockerCodes: ["PLUGIN_DISABLED"],
      primaryAction: {
        kind: "view_history",
        labelKey: "plugin.marketplace.action.viewHistory",
        disabled: false,
        blockerCodes: [],
      },
    };

    expect(buildPluginMarketplaceHistoryAgentParams(item)).toMatchObject({
      agentEntry: "claw",
      immersiveHome: false,
      entryBannerMessage: "plugin.marketplace.history.entryBanner",
      initialRequestMetadata: {
        harness: {
          plugin_history_restore: {
            session_id: "plugin-history:history-plugin",
            plugin_id: "history-plugin",
            active_agent_app_id: "history-app",
            active_entry_key: "history-entry",
          },
        },
      },
    });
  });

  it("应支持页面内搜索与刷新", async () => {
    const loader = vi.fn(async () => snapshot());
    const container = await renderPage({ loader });

    const search = container.querySelector<HTMLInputElement>(
      '[data-testid="plugin-marketplace-search"]',
    );
    await act(async () => {
      if (search) {
        setInputValue(search, "notes");
      }
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(container.textContent).not.toContain("Research Kit");
    expect(container.textContent).toContain("Notes Kit");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-refresh"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
