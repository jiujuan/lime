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
import type { InstalledPluginState } from "@/features/plugin/types";
import type { PluginMarketplaceRegistrySnapshot } from "./marketplace/marketplaceRegistryLoader";
import type { PluginRegistryItem } from "./manifest/types";
import type { PluginMarketplaceItem } from "./marketplace/types";
import type { PluginMarketplaceActionDeps } from "./marketplace/pluginMarketplaceActions";
import type { PluginMarketplaceViewItem } from "./marketplace/pluginMarketplaceViewModel";
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
    pluginSignatureTrustRoots: [],
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
    sourceKind: "plugin_catalog",
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
            activationEntries: [
              {
                key: "content_article_generate",
                title: "写文章",
                aliases: ["@写文章", "@写作"],
                kind: "plugin",
                intent: "at_command",
                taskKind: "content.article.generate",
                workflow: "content_article_workflow",
                outputArtifactKind: "content_factory.workspace_patch",
                rightSurface: "articleWorkspace",
                expectedObjects: ["articleDraft"],
                defaultObjectKind: "articleDraft",
              },
            ],
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

function installedState(appId: string): InstalledPluginState {
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
    manifest: {} as InstalledPluginState["manifest"],
    projection: {} as InstalledPluginState["projection"],
    readiness: {} as InstalledPluginState["readiness"],
    installMode: "in_lime",
    runtimeProfileSummary:
      {} as InstalledPluginState["runtimeProfileSummary"],
    setup: {} as InstalledPluginState["setup"],
    disabled: false,
    installedAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  } as InstalledPluginState;
}

function expectActionProfile() {
  return expect.objectContaining({
    capabilities: expect.objectContaining({
      "lime.agent": expect.objectContaining({ enabled: true }),
      "lime.workflow": expect.objectContaining({ enabled: true }),
      "lime.storage": expect.objectContaining({ enabled: true }),
      "lime.artifacts": expect.objectContaining({ enabled: true }),
    }),
  });
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

  it("未连接云端时仍应加载插件工作台", async () => {
    const loader = vi.fn(async () => snapshot());
    const container = await renderPage({
      runtimeContext: null,
      loader,
    });

    expect(loader).toHaveBeenCalledWith(
      "",
      { query: undefined, category: undefined, sort: "name" },
      expect.objectContaining({
        profile: expectActionProfile(),
      }),
    );
    expect(container.textContent).not.toContain(
      "plugin.marketplace.cloudRequired.title",
    );
    expect(container.textContent).toContain("Research Kit");
    expect(
      container.querySelector('[data-testid="plugin-marketplace-list"]'),
    ).not.toBeNull();
  });

  it("云端 session token 失效时仍保留插件工作台且不暴露 token 错误", async () => {
    const loader = vi.fn(async () => {
      throw new Error("invalid auth token");
    });
    const container = await renderPage({ loader });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain(
      "plugin.marketplace.cloudRequired.title",
    );
    expect(container.textContent).not.toContain(
      "plugin.marketplace.error.title",
    );
    expect(container.textContent).not.toContain("invalid auth token");
    expect(
      container.querySelector('[data-testid="plugin-marketplace-search"]'),
    ).not.toBeNull();
  });

  it("应加载云端 marketplace 并展示只读插件列表", async () => {
    const loader = vi.fn(async () => snapshot());
    const container = await renderPage({ loader });

    expect(loader).toHaveBeenCalledWith(
      "tenant-0001",
      { query: undefined, category: undefined, sort: "name" },
      expect.objectContaining({
        profile: expectActionProfile(),
      }),
    );
    expect(container.textContent).toContain("Research Kit");
    expect(container.textContent).toContain("Notes Kit");
    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-action-research-kit@limecloud"]',
    );
    expect(action?.disabled).toBe(false);
    expect(
      container.querySelector(
        '[data-testid="plugin-marketplace-card-research-kit@limecloud"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="plugin-marketplace-detail-empty"]',
      ),
    ).toBeNull();
  });

  it("空插件目录仍应提供本地安装入口并刷新列表", async () => {
    const emptySnapshot = snapshot();
    emptySnapshot.marketplace.items = [];
    emptySnapshot.registry = [];
    emptySnapshot.projectionInputs = [];
    const loader = vi
      .fn()
      .mockResolvedValueOnce(emptySnapshot)
      .mockResolvedValueOnce(snapshot());
    const installLocalPackage: NonNullable<
      PluginMarketplaceActionDeps["installLocalPackage"]
    > = vi.fn(async () => installedState("local-kit"));
    const selectLocalDirectory = vi.fn(async () => "/tmp/local-plugin");
    const dispatchChanged = vi.fn();
    const container = await renderPage({
      loader,
      actionDeps: {
        selectLocalDirectory,
        installLocalPackage,
        dispatchChanged,
      },
    });

    const localInstall = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-local-install"]',
    );
    expect(localInstall?.disabled).toBe(false);
    expect(container.textContent).toContain("plugin.marketplace.empty.title");

    await act(async () => {
      localInstall?.click();
      await Promise.resolve();
    });
    await flushEffects(6);

    expect(selectLocalDirectory).toHaveBeenCalledWith({
      title: "plugin.marketplace.localInstall.dialogTitle",
    });
    expect(installLocalPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        appDir: "/tmp/local-plugin",
        profile: expectActionProfile(),
      }),
    );
    expect(dispatchChanged).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("本地安装取消选择目录时不应显示错误", async () => {
    const localSnapshot = snapshot();
    localSnapshot.marketplace.items[0] = marketplaceItem(
      "research-kit@limecloud",
      {
        displayName: "Research Kit",
        install: {
          local: true,
          cloud: false,
          authentication: "on_use",
        },
      },
    );
    localSnapshot.registry[0] = registryItem("research-kit@limecloud", {
      displayName: "Research Kit",
      installed: false,
      enabled: false,
      capabilityStates: ["installable"],
      activationState: "blocked",
      rendererState: "missing_renderer",
      historyState: "unavailable",
      blockerCodes: ["PLUGIN_INSTALL_UNAVAILABLE"],
    });
    const loader = vi.fn(async () => localSnapshot);
    const installLocalPackage = vi.fn();
    const selectLocalDirectory = vi.fn(async () => null);
    const container = await renderPage({
      loader,
      actionDeps: {
        selectLocalDirectory,
        installLocalPackage,
      },
    });

    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-action-research-kit@limecloud"]',
    );
    await act(async () => {
      action?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(selectLocalDirectory).toHaveBeenCalled();
    expect(installLocalPackage).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(
      "plugin.marketplace.actionError.title",
    );
  });

  it("本地安装应使用应用中心当前 runtime profile 生成 readiness", async () => {
    const localSnapshot = snapshot();
    localSnapshot.marketplace.items[0] = marketplaceItem(
      "research-kit@limecloud",
      {
        displayName: "Research Kit",
        install: {
          local: true,
          cloud: false,
          authentication: "on_use",
        },
      },
    );
    localSnapshot.registry[0] = registryItem("research-kit@limecloud", {
      displayName: "Research Kit",
      installed: false,
      enabled: false,
      capabilityStates: ["installable"],
      activationState: "blocked",
      rendererState: "missing_renderer",
      historyState: "unavailable",
      blockerCodes: ["PLUGIN_INSTALL_UNAVAILABLE"],
    });
    const loader = vi.fn(async () => localSnapshot);
    const installLocalPackage: NonNullable<
      PluginMarketplaceActionDeps["installLocalPackage"]
    > = vi.fn(async () => ({}) as InstalledPluginState);
    const selectLocalDirectory = vi.fn(async () => "/tmp/content-factory-app");
    const container = await renderPage({
      loader,
      actionDeps: {
        selectLocalDirectory,
        installLocalPackage,
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

    expect(installLocalPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        appDir: "/tmp/content-factory-app",
        profile: expectActionProfile(),
      }),
    );
  });

  it("应以独立页面展示插件详情并支持返回列表切换当前插件", async () => {
    const loader = vi.fn(async () => snapshot());
    const onNavigate = vi.fn();
    const container = await renderPage({ loader, onNavigate });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-detail-notes-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(onNavigate).toHaveBeenCalledWith(
      "plugins",
      expect.objectContaining({
        selectedPluginId: "notes-kit@limecloud",
      }),
    );
    expect(
      container.querySelector('[data-testid="plugin-marketplace-detail-page"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="plugin-marketplace-list"]'),
    ).toBeNull();
    let detailPanel = container.querySelector(
      '[data-testid="plugin-marketplace-detail-panel"]',
    );
    expect(detailPanel?.textContent).toContain("Notes Kit");
    expect(detailPanel?.textContent).toContain(
      "plugin.marketplace.blocker.disabled",
    );
    expect(detailPanel?.textContent).not.toContain("PLUGIN_DISABLED");
    expect(detailPanel?.textContent).toContain(
      "plugin.marketplace.detail.nextStepEnable",
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-detail-back"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(onNavigate).toHaveBeenCalledWith(
      "plugins",
      expect.objectContaining({
        statusFilter: "all",
      }),
    );
    expect(
      container.querySelector('[data-testid="plugin-marketplace-list"]'),
    ).not.toBeNull();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-detail-research-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(onNavigate).toHaveBeenCalledWith(
      "plugins",
      expect.objectContaining({
        selectedPluginId: "research-kit@limecloud",
      }),
    );
    detailPanel = container.querySelector(
      '[data-testid="plugin-marketplace-detail-panel"]',
    );
    expect(detailPanel?.textContent).toContain("Research Kit");
    expect(detailPanel?.textContent).toContain(
      "https://packages.limecloud.example/plugins/research-kit-1.0.0.lpkg",
    );
    expect(detailPanel?.textContent).toContain(
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
        initialUserPrompt: "@写文章 ",
        autoRunInitialPromptOnMount: false,
        initialAutoSendRequestMetadata: {
          harness: {
            plugin_activation_intent: {
              source: "plugin_marketplace_open",
              trigger: "@写文章",
              plugin_id: "notes-kit@limecloud",
              active_plugin_ui_id: "notes-kit",
              active_entry_key: "content_article_generate",
              entry_task_kind: "content.article.generate",
              entry_workflow_key: "content_article_workflow",
              entry_output_artifact_kind: "content_factory.workspace_patch",
              entry_right_surface: "articleWorkspace",
              entry_expected_objects: ["articleDraft"],
            },
          },
        },
        immersiveHome: false,
        newChatAt: expect.any(Number),
      }),
    );
  });

  it("插件详情技能入口应预填显式 @插件:技能 输入并等待用户发送", async () => {
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

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-detail-notes-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

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
        autoRunInitialPromptOnMount: false,
        initialAutoSendRequestMetadata: {
          harness: {
            plugin_activation_intent: {
              source: "plugin_marketplace_open",
              trigger: "@Notes Kit:Article Writer",
              plugin_id: "notes-kit@limecloud",
              active_plugin_ui_id: "notes-kit",
              active_entry_key: "notes-kit",
              selected_skill_keys: ["article-writer"],
            },
          },
        },
        immersiveHome: false,
        newChatAt: expect.any(Number),
      }),
    );
  });

  it("只读历史插件应先选择历史会话，再打开恢复入口且不自动执行", async () => {
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
    const historySessionLoader = vi.fn(async () => ({
      pluginId: "notes-kit@limecloud",
      pluginLabel: "Notes Kit",
      candidates: [
        {
          key: "notes-session-1:history_restore",
          sessionId: "notes-session-1",
          title: "Notes history",
          updatedAt: 1710000123000,
          messagesCount: 4,
          pluginId: "notes-kit@limecloud",
          activePluginUiId: "notes-kit",
          activeEntryKey: "notes-kit",
          artifactRefs: ["artifact-1"],
          source: "history_restore" as const,
        },
      ],
    }));
    const onNavigate = vi.fn();
    const container = await renderPage({
      loader,
      historySessionLoader,
      onNavigate,
    });

    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-action-notes-kit@limecloud"]',
    );
    expect(action?.disabled).toBe(false);

    await act(async () => {
      action?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(historySessionLoader).toHaveBeenCalledWith(
      expect.objectContaining({ pluginId: "notes-kit@limecloud" }),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "plugins",
      expect.objectContaining({
        selectedPluginId: "notes-kit@limecloud",
      }),
    );
    onNavigate.mockClear();
    const sessionAction = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-history-session-notes-session-1"]',
    );
    expect(sessionAction?.disabled).toBe(false);

    await act(async () => {
      sessionAction?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "claw",
        initialSessionId: "notes-session-1",
        immersiveHome: false,
        entryBannerMessage: "plugin.marketplace.history.entryBanner",
        initialRequestMetadata: {
          harness: {
            plugin_history_restore: {
              session_id: "notes-session-1",
              plugin_id: "notes-kit@limecloud",
              active_plugin_ui_id: "notes-kit",
              active_entry_key: "notes-kit",
              artifact_refs: ["artifact-1"],
            },
          },
        },
        newChatAt: expect.any(Number),
      }),
    );
  });

  it("可安装插件应调用 current Plugin cloud install API 并刷新列表", async () => {
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

    expect(installCloudRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        app: expect.objectContaining({
          appId: "research-kit",
          displayName: "Research Kit",
          packageUrl:
            "https://packages.limecloud.example/plugins/research-kit-1.0.0.lpkg",
        }),
        profile: expectActionProfile(),
      }),
    );
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("安装成功后刷新失败不应把主动作显示为安装失败", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce(snapshot())
      .mockRejectedValueOnce(
        new Error("timed out waiting for app-server message after 30000ms"),
      );
    const installCloudRelease: NonNullable<
      PluginMarketplaceActionDeps["installCloudRelease"]
    > = vi.fn(async (request) => installedState(request.app.appId));
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
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

    expect(installCloudRelease).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain(
      "timed out waiting for app-server message after 30000ms",
    );
    expect(container.textContent).not.toContain(
      "plugin.marketplace.actionError.title",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[plugin-marketplace] action refresh failed",
      expect.any(Error),
    );
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
    registrationSnapshot.registry[0] = registryItem("research-kit@limecloud", {
      displayName: "Research Kit",
      capabilityStates: ["installable"],
      activationState: "blocked",
      blockerCodes: [
        "PLUGIN_MARKETPLACE_BLOCKED:registration required",
        "PLUGIN_ACTIVATION_BLOCKED",
      ],
    });
    const loader = vi.fn(async () => registrationSnapshot);
    const submitPluginRegistrationCode: NonNullable<
      PluginMarketplaceActionDeps["submitPluginRegistrationCode"]
    > = vi.fn(async () => ({
      schemaVersion: "plugin-marketplace/v1",
      tenantId: "tenant-0001",
      generatedAt: "2026-06-25T01:02:03.000Z",
      marketplaceName: "limecloud",
      items: [],
    }));
    const container = await renderPage({
      loader,
      actionDeps: {
        submitPluginRegistrationCode,
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

    expect(submitPluginRegistrationCode).toHaveBeenCalledWith(
      "tenant-0001",
      "research-kit",
      { code: "REG-001" },
      "limecloud",
    );
    expect(loader).toHaveBeenCalledTimes(2);
    expect(codeInput?.value).toBe("");
  });

  it("原生目录授权项没有 appId 时仍应提交插件注册码并刷新列表", async () => {
    const registrationSnapshot = snapshot();
    registrationSnapshot.marketplace.items[0] = marketplaceItem(
      "native-kit@limecloud",
      {
        pluginName: "native-kit",
        displayName: "Native Kit",
        sourceKind: "plugin_catalog",
        appId: undefined,
        package: undefined,
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        blockedReason: "registration required",
      },
    );
    registrationSnapshot.registry[0] = registryItem("native-kit@limecloud", {
      displayName: "Native Kit",
      capabilityStates: ["installable"],
      activationState: "blocked",
      blockerCodes: [
        "PLUGIN_MARKETPLACE_BLOCKED:registration required",
        "PLUGIN_ACTIVATION_BLOCKED",
      ],
    });
    const loader = vi.fn(async () => registrationSnapshot);
    const submitPluginRegistrationCode: NonNullable<
      PluginMarketplaceActionDeps["submitPluginRegistrationCode"]
    > = vi.fn(async () => ({
      schemaVersion: "plugin-marketplace/v1",
      tenantId: "tenant-0001",
      generatedAt: "2026-06-25T01:02:03.000Z",
      marketplaceName: "limecloud",
      items: [],
    }));
    const resolveRuntimeContext = vi.fn(() => runtimeContext());
    const container = await renderPage({
      loader,
      actionDeps: {
        submitPluginRegistrationCode,
        resolveRuntimeContext,
        dispatchChanged: vi.fn(),
      },
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-detail-native-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(
      container.querySelector(
        '[data-testid="plugin-marketplace-registration-panel"]',
      ),
    ).not.toBeNull();

    const codeInput = container.querySelector<HTMLInputElement>(
      '[data-testid="plugin-marketplace-registration-code-native-kit@limecloud"]',
    );
    await act(async () => {
      if (codeInput) {
        setInputValue(codeInput, "NATIVE-001");
      }
      await Promise.resolve();
    });
    await flushEffects(2);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="plugin-marketplace-registration-submit-native-kit@limecloud"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(submitPluginRegistrationCode).toHaveBeenCalledWith(
      "tenant-0001",
      "native-kit",
      { code: "NATIVE-001" },
      "limecloud",
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
    expect(
      container.querySelector('[data-testid="plugin-marketplace-detail-page"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="plugin-marketplace-list"]'),
    ).not.toBeNull();
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
      activationEntries: [],
      skills: [],
      capabilityProfile: {
        sections: [],
        summary: {
          uiCount: 0,
          subagentCount: 0,
          workflowCount: 0,
          toolCount: 0,
          connectorCount: 0,
          hookCount: 0,
          skillCount: 0,
        },
      },
      needsAttention: false,
      blockerCodes: [],
      visibleBlockers: [],
      primaryAction: {
        kind: "open",
        labelKey: "plugin.marketplace.action.open",
        disabled: false,
        blockerCodes: [],
      },
    } as PluginMarketplaceViewItem;

    expect(buildPluginMarketplaceOpenAgentParams(item)).toMatchObject({
      agentEntry: "new-task",
      initialUserPrompt: "@fallback-plugin ",
      autoRunInitialPromptOnMount: false,
      initialAutoSendRequestMetadata: {
        harness: {
          plugin_activation_intent: {
            source: "plugin_marketplace_open",
            trigger: "@fallback-plugin",
            plugin_id: "fallback-plugin",
          },
        },
      },
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
      activationEntries: [],
      skills: [],
      capabilityProfile: {
        sections: [],
        summary: {
          uiCount: 0,
          subagentCount: 0,
          workflowCount: 0,
          toolCount: 0,
          connectorCount: 0,
          hookCount: 0,
          skillCount: 0,
        },
      },
      needsAttention: true,
      blockerCodes: ["PLUGIN_DISABLED"],
      visibleBlockers: [],
      primaryAction: {
        kind: "view_history",
        labelKey: "plugin.marketplace.action.viewHistory",
        disabled: false,
        blockerCodes: [],
      },
    } as PluginMarketplaceViewItem;

    expect(
      buildPluginMarketplaceHistoryAgentParams(item, {
        key: "history-session:history_restore",
        sessionId: "history-session",
        title: "History Session",
        updatedAt: 1710000000000,
        messagesCount: 2,
        pluginId: "history-plugin",
        activePluginUiId: "history-app",
        activeEntryKey: "history-entry",
        artifactRefs: ["artifact-1"],
        source: "history_restore",
      }),
    ).toMatchObject({
      agentEntry: "claw",
      initialSessionId: "history-session",
      immersiveHome: false,
      entryBannerMessage: "plugin.marketplace.history.entryBanner",
      initialRequestMetadata: {
        harness: {
          plugin_history_restore: {
            session_id: "history-session",
            plugin_id: "history-plugin",
            active_plugin_ui_id: "history-app",
            active_entry_key: "history-entry",
            artifact_refs: ["artifact-1"],
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
