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
import type { PluginRegistryItem } from "./manifest/types";
import type { PluginMarketplaceItem } from "./marketplace/types";
import type { PluginMarketplaceRegistrySnapshot } from "./marketplace/marketplaceRegistryLoader";
import {
  PluginMarketplacePage,
  type PluginMarketplacePageProps,
} from "./PluginMarketplacePage";

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

function marketplaceItem(): PluginMarketplaceItem {
  return {
    pluginKey: "content-factory@limecloud",
    pluginName: "content-factory",
    marketplaceName: "limecloud",
    displayName: "内容工厂",
    description: "内容工厂应用",
    version: "1.0.0",
    category: "writing",
    categories: ["writing"],
    sourceKind: "plugin_catalog",
    appId: "content-factory",
    enabled: true,
    installState: "available",
    activationState: "activatable",
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_USE",
    },
  };
}

function registryItem(): PluginRegistryItem {
  return {
    pluginId: "content-factory@limecloud",
    displayName: "内容工厂",
    version: "1.0.0",
    installed: true,
    enabled: true,
    capabilityStates: ["activatable"],
    activationState: "activatable",
    rendererState: "missing_renderer",
    historyState: "read_write",
    blockerCodes: ["PLUGIN_RENDERER_UNAVAILABLE"],
  };
}

function snapshot(): PluginMarketplaceRegistrySnapshot {
  return {
    marketplace: {
      schemaVersion: "plugin-marketplace/v1",
      tenantId: "tenant-0001",
      generatedAt: "2026-06-25T00:00:00.000Z",
      marketplaceName: "limecloud",
      items: [marketplaceItem()],
    },
    installed: {
      states: [],
      issues: [],
    },
    projectionInputs: [],
    registry: [registryItem()],
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

describe("PluginMarketplacePage visible blockers", () => {
  beforeEach(() => {
    setupReactActEnvironment();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    vi.restoreAllMocks();
  });

  it("已安装可激活应用不应显示 renderer 诊断码且仍可打开", async () => {
    const loader = vi.fn(async () => snapshot());
    const onNavigate = vi.fn();
    const container = await renderPage({ loader, onNavigate });

    expect(container.textContent).not.toContain("PLUGIN_RENDERER_UNAVAILABLE");
    const detailAction = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-detail-content-factory@limecloud"]',
    );
    await act(async () => {
      detailAction?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(container.textContent).toContain(
      "plugin.marketplace.detail.noBlockers",
    );

    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-marketplace-action-content-factory@limecloud"]',
    );
    expect(action?.disabled).toBe(false);

    await act(async () => {
      action?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        initialUserPrompt: "@内容工厂 ",
        autoRunInitialPromptOnMount: false,
      }),
    );
  });
});
