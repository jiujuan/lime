import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import settingsZhCN from "@/i18n/resources/zh-CN/settings.json";
import { CloudProviderSettings } from ".";

const settingsDictionary = settingsZhCN as Record<string, string>;

export const companionWorkspaceLabel =
  settingsDictionary["settings.providers.workspaceView.companion.label"];

function interpolateTemplate(
  template: string,
  values?: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(values?.[name] ?? ""),
  );
}

export const translate = (key: string, options?: unknown) => {
  if (typeof options === "string") {
    return options;
  }

  if (options && typeof options === "object") {
    const values = options as Record<string, unknown>;
    const template =
      settingsDictionary[key] ||
      (typeof values.defaultValue === "string" ? values.defaultValue : key);
    return interpolateTemplate(template, values);
  }

  return settingsDictionary[key] || key;
};

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mounted: MountedPage[] = [];

export function createOffer(overrides: Record<string, unknown> = {}) {
  return {
    providerKey: "lime-hub-main",
    displayName: "Lime Hub 主服务",
    source: "oem_cloud",
    state: "available_ready",
    description: "统一下发的云端目录",
    visible: true,
    loggedIn: true,
    accountStatus: "logged_in",
    subscriptionStatus: "active",
    quotaStatus: "ok",
    canInvoke: true,
    defaultModel: "gpt-5.2-pro",
    effectiveAccessMode: "session",
    apiKeyModeEnabled: false,
    tenantOverrideApplied: false,
    configMode: "managed",
    modelsSource: "hub_catalog",
    developerAccessVisible: false,
    availableModelCount: 2,
    fallbackToLocalAllowed: true,
    currentPlan: "Pro",
    creditsSummary: "余额充足",
    tags: [],
    ...overrides,
  };
}

export function createAccessState(overrides: Record<string, unknown> = {}) {
  return {
    runtime: {
      baseUrl: "https://user.limeai.run",
      controlPlaneBaseUrl: "https://user.limeai.run/api",
      sceneBaseUrl: "https://user.limeai.run/scene-api",
      gatewayBaseUrl: "https://user.limeai.run/gateway-api",
      tenantId: "tenant-0001",
      sessionToken: null,
      hubProviderName: "Lime Hub",
      loginPath: "/login",
      desktopClientId: "desktop-client",
      desktopOauthRedirectUrl: "lime://oauth/callback",
      desktopOauthNextPath: "/welcome",
    },
    configuredTarget: {
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
    },
    hubProviderName: "Lime Hub",
    session: null,
    bootstrap: null,
    offers: [],
    preference: null,
    paymentConfigs: [],
    plans: [],
    subscription: null,
    creditAccount: null,
    creditsDashboard: null,
    topupPackages: [],
    usageDashboard: null,
    billingDashboard: null,
    orders: [],
    creditTopupOrders: [],
    accessTokens: [],
    activeAccessToken: null,
    lastIssuedRawToken: null,
    commerceErrorMessage: null,
    selectedOffer: null,
    selectedModels: [],
    defaultCloudOffer: null,
    activeCloudOffer: null,
    initializing: false,
    refreshing: false,
    loadingCommerce: false,
    loadingDetail: false,
    openingGoogleLogin: false,
    savingDefault: "",
    managingToken: "",
    errorMessage: null,
    infoMessage: null,
    defaultProviderSummary: null,
    defaultProviderSourceLabel: "未设定",
    activeAccessModeLabel: "登录会话",
    activeConfigModeLabel: "托管模式",
    activeModelsSourceLabel: "云端目录",
    activeDeveloperAccessEnabled: false,
    activeDeveloperAccessLabel: "已关闭",
    handleRefresh: vi.fn(),
    handleGoogleLogin: vi.fn(),
    openOfferDetail: vi.fn(),
    handleSetDefault: vi.fn(),
    handleCreateAccessToken: vi.fn(),
    handleRotateAccessToken: vi.fn(),
    handleRevokeAccessToken: vi.fn(),
    handleDismissIssuedToken: vi.fn(),
    openUserCenter: vi.fn(),
    ...overrides,
  };
}

export function createLoggedInSession() {
  return {
    tenant: { id: "tenant-0001" },
    user: {
      id: "user-001",
      email: "operator@example.com",
      displayName: "Demo Operator",
    },
    session: {
      id: "session-001",
      expiresAt: "2026-03-25T08:00:00.000Z",
    },
  };
}

export function createCloudOfferAccessState(
  overrides: Record<string, unknown> = {},
) {
  const offer = createOffer();
  return createAccessState({
    session: createLoggedInSession(),
    offers: [offer],
    preference: {
      providerSource: "oem_cloud",
      providerKey: "lime-hub-main",
    },
    selectedOffer: {
      ...offer,
      access: {
        offerId: "offer-001",
        accessMode: "session",
        hubTokenEnabled: false,
      },
    },
    defaultCloudOffer: offer,
    activeCloudOffer: offer,
    ...overrides,
  });
}

export function createPetStatus(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: "ws://127.0.0.1:45554/companion/pet",
    server_listening: true,
    connected: false,
    client_id: null,
    platform: null,
    capabilities: [],
    last_event: null,
    last_error: null,
    last_state: "idle",
    ...overrides,
  };
}

export function createApiKeyProviders() {
  return [
    {
      id: "deepseek",
      name: "DeepSeek",
      type: "openai",
      api_host: "https://api.deepseek.com/v1",
      is_system: false,
      group: "cloud",
      enabled: true,
      sort_order: 5,
      api_version: undefined,
      project: undefined,
      location: undefined,
      region: undefined,
      custom_models: [],
      api_key_count: 1,
      api_keys: [
        {
          id: "key-deepseek-1",
          provider_id: "deepseek",
          api_key_masked: "sk-***1234",
          alias: "主 Key",
          enabled: true,
          usage_count: 0,
          error_count: 0,
          last_used_at: undefined,
          created_at: "2026-04-01T00:00:00Z",
        },
      ],
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    },
  ];
}

export async function renderPage(
  props: {
    initialView?: "settings" | "cloud" | "companion";
  } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<CloudProviderSettings {...props} />);
    await Promise.resolve();
    await Promise.resolve();
  });

  const page = { container, root };
  mounted.push(page);
  return page;
}

export function cleanupMountedProviderPages() {
  while (mounted.length > 0) {
    const current = mounted.pop();
    if (!current) {
      break;
    }

    act(() => {
      current.root.unmount();
    });
    current.container.remove();
  }
}

export function findButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );

  if (!button) {
    throw new Error(`未找到按钮: ${text}`);
  }
  return button as HTMLButtonElement;
}

export async function clickButton(
  container: HTMLElement,
  text: string,
  flushCount = 1,
) {
  await act(async () => {
    findButton(container, text).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    for (let index = 0; index < flushCount; index += 1) {
      await Promise.resolve();
    }
  });
}

export function getBodyText() {
  return document.body.textContent ?? "";
}

export async function hoverTip(ariaLabel: string) {
  const trigger = document.body.querySelector(
    `button[aria-label='${ariaLabel}']`,
  );
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`未找到提示按钮: ${ariaLabel}`);
  }

  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await Promise.resolve();
  });

  return trigger;
}

export async function leaveTip(trigger: HTMLButtonElement | null) {
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await Promise.resolve();
  });
}
