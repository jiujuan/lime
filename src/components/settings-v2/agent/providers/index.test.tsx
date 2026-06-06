import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import {
  clickButton,
  cleanupMountedProviderPages,
  companionWorkspaceLabel,
  createAccessState,
  createApiKeyProviders,
  createCloudOfferAccessState,
  createLoggedInSession,
  createPetStatus,
  getBodyText,
  hoverTip,
  leaveTip,
  renderPage,
  translate,
} from "./cloudProviderSettingsTestFixtures";

const {
  mockUseOemCloudAccess,
  mockFormatOemCloudDateTime,
  mockGetCompanionPetStatus,
  mockLaunchCompanionPet,
  mockListenCompanionPetStatus,
  mockSendCompanionPetCommand,
  mockApiKeyProviderGetProviders,
  mockSubscribeProviderDataChanged,
  mockSubscribeAppConfigChanged,
  mockGetConfig,
  mockSaveConfig,
  mockOpenUrl,
  mockUseTranslation,
} = vi.hoisted(() => {
  return {
    mockUseOemCloudAccess: vi.fn(),
    mockFormatOemCloudDateTime: vi.fn((value?: string) => `fmt:${value ?? ""}`),
    mockGetCompanionPetStatus: vi.fn(),
    mockLaunchCompanionPet: vi.fn(),
    mockListenCompanionPetStatus: vi.fn(),
    mockSendCompanionPetCommand: vi.fn(),
    mockApiKeyProviderGetProviders: vi.fn(),
    mockSubscribeProviderDataChanged: vi.fn(),
    mockSubscribeAppConfigChanged: vi.fn(),
    mockGetConfig: vi.fn(),
    mockSaveConfig: vi.fn(),
    mockOpenUrl: vi.fn(),
    mockUseTranslation: vi.fn(),
  };
});

vi.mock("@/components/api-key-provider", () => ({
  ApiKeyProviderSection: ({ className }: { className?: string }) => (
    <div data-testid="api-key-provider-stub" className={className}>
      API Key Provider 设置占位
    </div>
  ),
}));

vi.mock("@/components/input-kit", () => ({
  ModelSelector: ({
    providerType,
    model,
    activeTheme,
    placeholderLabel,
  }: {
    providerType: string;
    model: string;
    activeTheme?: string;
    placeholderLabel?: string;
  }) => (
    <div data-testid="provider-settings-model-selector">
      {activeTheme ? `[${activeTheme}] ` : ""}
      {providerType || placeholderLabel || "自动选择"} /{" "}
      {model || placeholderLabel || "自动选择"}
    </div>
  ),
}));

vi.mock("@/lib/api/companion", () => ({
  getCompanionPetStatus: () => mockGetCompanionPetStatus(),
  launchCompanionPet: () => mockLaunchCompanionPet(),
  listenCompanionPetStatus: (...args: unknown[]) =>
    mockListenCompanionPetStatus(...args),
  sendCompanionPetCommand: (...args: unknown[]) =>
    mockSendCompanionPetCommand(...args),
}));

vi.mock("@/lib/api/apiKeyProvider", () => ({
  apiKeyProviderApi: {
    getProviders: (...args: unknown[]) =>
      mockApiKeyProviderGetProviders(...args),
  },
}));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
  saveConfig: (...args: unknown[]) => mockSaveConfig(...args),
  subscribeAppConfigChanged: (...args: unknown[]) =>
    mockSubscribeAppConfigChanged(...args),
}));

vi.mock("@/lib/providerDataEvents", () => ({
  subscribeProviderDataChanged: (...args: unknown[]) =>
    mockSubscribeProviderDataChanged(...args),
}));

vi.mock("@/lib/openUrl", () => ({
  openUrl: (...args: unknown[]) => mockOpenUrl(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: mockUseTranslation,
}));

vi.mock("@/hooks/useOemCloudAccess", () => ({
  useOemCloudAccess: () => mockUseOemCloudAccess(),
  formatOemCloudDateTime: (value?: string) => mockFormatOemCloudDateTime(value),
  formatOemCloudAccessModeLabel: (value?: string) => value || "未知",
  formatOemCloudConfigModeLabel: (value?: string) => value || "未知",
  formatOemCloudModelsSourceLabel: (value?: string) => value || "未知",
  formatOemCloudOfferStateLabel: (value?: string) => value || "未知",
}));

function createMockAppConfig(options: { companionEnabled?: boolean } = {}) {
  return {
    navigation: {
      enabled_items: options.companionEnabled ? ["companion"] : [],
    },
    workspace_preferences: {
      companion_defaults: {
        general: {
          preferredProviderId: "deepseek",
          preferredModelId: "deepseek-chat",
          allowFallback: false,
        },
      },
    },
  };
}

function enableCompanionEntry() {
  mockGetConfig.mockResolvedValue(
    createMockAppConfig({ companionEnabled: true }),
  );
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  mockUseTranslation.mockImplementation((_namespace?: string) => ({
    t: translate,
    i18n: {
      language: "zh-CN",
      resolvedLanguage: "zh-CN",
    },
  }));

  mockUseOemCloudAccess.mockReturnValue(createAccessState());
  mockGetCompanionPetStatus.mockResolvedValue(createPetStatus());
  mockLaunchCompanionPet.mockResolvedValue({
    launched: true,
    resolved_path: "/Applications/Lime Pet.app/Contents/MacOS/Lime Pet",
    endpoint: "ws://127.0.0.1:45554/companion/pet",
    message: null,
  });
  mockListenCompanionPetStatus.mockResolvedValue(vi.fn());
  mockSendCompanionPetCommand.mockResolvedValue({
    delivered: true,
    connected: true,
  });
  mockApiKeyProviderGetProviders.mockResolvedValue(createApiKeyProviders());
  mockSubscribeProviderDataChanged.mockReturnValue(vi.fn());
  mockSubscribeAppConfigChanged.mockReturnValue(vi.fn());
  mockGetConfig.mockResolvedValue(createMockAppConfig());
  mockSaveConfig.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  cleanupMountedProviderPages();
});

describe("CloudProviderSettings", () => {
  it("桌宠页应把 Companion 说明和桥接 hint 收进 tips", async () => {
    enableCompanionEntry();

    await renderPage({ initialView: "companion" });

    expect(getBodyText()).not.toContain(
      "桌宠通过本地 Companion 通道复用 Lime 的 AI 服务商状态",
    );
    expect(getBodyText()).not.toContain(
      "Lime 负责本地 Companion 宿主，桌宠作为独立原生壳接入。",
    );

    const introTip = await hoverTip("桌宠 Companion 说明");
    expect(getBodyText()).toContain(
      "桌宠通过本地 Companion 通道复用 Lime 的 AI 服务商状态",
    );
    await leaveTip(introTip);

    const bridgeTip = await hoverTip("桥接状态说明");
    expect(getBodyText()).toContain(
      "Lime 负责本地 Companion 宿主，桌宠作为独立原生壳接入。",
    );
    await leaveTip(bridgeTip);
  });

  it("桌宠入口关闭时应只显示本地 Provider 主区", async () => {
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        runtime: null,
        configuredTarget: null,
      }),
    );

    const { container } = await renderPage();
    const text = container.textContent ?? "";
    const settingsTab = container.querySelector(
      '[data-testid="provider-workspace-tab-settings"]',
    );
    const cloudTab = container.querySelector(
      '[data-testid="provider-workspace-tab-cloud"]',
    );
    const companionTab = container.querySelector(
      '[data-testid="provider-workspace-tab-companion"]',
    );

    expect(mockUseTranslation).toHaveBeenCalledWith("settings");
    expect(
      container.querySelector('[data-testid="provider-workspace-switcher"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="api-key-provider-stub"]')
        ?.className,
    ).toContain("h-[calc(100vh-220px)]");
    expect(
      container.querySelectorAll('[data-testid="provider-workspace-switcher"]')
        .length,
    ).toBe(0);
    expect(text).toContain("API Key Provider 设置占位");
    expect(
      container.querySelector('[data-testid="companion-provider-card"]'),
    ).toBeNull();
    expect(mockGetCompanionPetStatus).not.toHaveBeenCalled();
    expect(mockListenCompanionPetStatus).not.toHaveBeenCalled();
    expect(mockSubscribeProviderDataChanged).not.toHaveBeenCalled();
    expect(text).not.toContain("把本地 Provider 配置和 OEM 云端服务拆开管理");
    expect(text).not.toContain("把本地 Provider 配置和品牌云端服务拆开管理");
    expect(text).not.toContain("默认先进入“服务商设置”处理 Provider");
    expect(text).not.toContain("public/oem-runtime-config.js");
    expect(settingsTab).toBeNull();
    expect(cloudTab).toBeNull();
    expect(companionTab).toBeNull();
    expect(container.textContent ?? "").not.toContain("当前版本未配置云端服务");
    expect(container.textContent ?? "").not.toContain(
      "public/oem-runtime-config.js",
    );
    expect(settingsTab).toBeNull();
    expect(companionTab).toBeNull();
  });

  it("OEM 运行时也应默认隐藏桌宠和云端 tab", async () => {
    const baseState = createAccessState();
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        hubProviderName: "Partner Hub",
        runtime: {
          ...baseState.runtime,
          hubProviderName: "Partner Hub",
        },
      }),
    );

    const { container } = await renderPage({ initialView: "settings" });

    const settingsTab = container.querySelector(
      '[data-testid="provider-workspace-tab-settings"]',
    );
    const cloudTab = container.querySelector(
      '[data-testid="provider-workspace-tab-cloud"]',
    );
    const companionTab = container.querySelector(
      '[data-testid="provider-workspace-tab-companion"]',
    );

    expect(settingsTab).toBeNull();
    expect(container.textContent ?? "").toContain("API Key Provider 设置占位");
    expect(cloudTab).toBeNull();
    expect(companionTab).toBeNull();
  });

  it("未登录时 initialView=cloud 不应自动打开登录页或渲染云端 tab", async () => {
    const handleGoogleLogin = vi.fn().mockResolvedValue(undefined);
    const openUserCenter = vi.fn();
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({ handleGoogleLogin, openUserCenter }),
    );

    const { container } = await renderPage({ initialView: "cloud" });

    const settingsTab = container.querySelector(
      '[data-testid="provider-workspace-tab-settings"]',
    );
    const cloudTab = container.querySelector(
      '[data-testid="provider-workspace-tab-cloud"]',
    );
    const text = container.textContent ?? "";

    expect(text).toContain("API Key Provider 设置占位");
    expect(text).not.toContain("已打开 Lime Hub 登录页");
    expect(text).not.toContain("已在浏览器打开 Lime Hub 用户中心");
    expect(text).not.toContain("云端服务");
    expect(settingsTab).toBeNull();
    expect(cloudTab).toBeNull();
    expect(handleGoogleLogin).not.toHaveBeenCalled();
    expect(openUserCenter).not.toHaveBeenCalled();
  });

  it("开启桌宠系统入口后应显示桌宠管理 tab", async () => {
    enableCompanionEntry();

    const { container } = await renderPage();

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="provider-workspace-switcher"]'),
      ).not.toBeNull();
    });

    const settingsTab = container.querySelector(
      '[data-testid="provider-workspace-tab-settings"]',
    );
    const companionTab = container.querySelector(
      '[data-testid="provider-workspace-tab-companion"]',
    );

    expect(settingsTab?.getAttribute("data-state")).toBe("active");
    expect(companionTab?.getAttribute("data-state")).toBe("inactive");
    expect(container.textContent ?? "").toContain("桌宠管理");
  });

  it("配置变更后应按可选系统入口状态刷新桌宠管理 tab", async () => {
    let configChangedListener: (() => void) | null = null;
    mockSubscribeAppConfigChanged.mockImplementation((listener: () => void) => {
      configChangedListener = listener;
      return vi.fn();
    });
    mockGetConfig
      .mockResolvedValueOnce(createMockAppConfig())
      .mockResolvedValueOnce(createMockAppConfig({ companionEnabled: true }));

    const { container } = await renderPage();

    expect(
      container.querySelector(
        '[data-testid="provider-workspace-tab-companion"]',
      ),
    ).toBeNull();

    await vi.waitFor(() => {
      expect(configChangedListener).not.toBeNull();
    });

    await act(async () => {
      configChangedListener?.();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector(
          '[data-testid="provider-workspace-tab-companion"]',
        ),
      ).not.toBeNull();
    });
  });

  it("未登录时不再通过云端 tab 打开品牌云端登录入口", async () => {
    const handleGoogleLogin = vi.fn().mockResolvedValue(undefined);
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({ handleGoogleLogin }),
    );

    const { container } = await renderPage();

    const text = container.textContent ?? "";
    expect(text).toContain("API Key Provider 设置占位");
    expect(text).not.toContain("云端服务");
    expect(text).not.toContain("已打开 Lime Hub 登录页，请在浏览器完成授权。");
    expect(text).not.toContain("正在打开 Lime Hub 登录");
    expect(text).not.toContain("重新打开登录页");
    expect(text).not.toContain("去个人中心登录");
    expect(text).not.toContain("云端页面承接什么");
    expect(handleGoogleLogin).not.toHaveBeenCalled();
  });

  it("未登录且登录页打开失败时不再渲染客户端登录页或云端 tab", async () => {
    const handleGoogleLogin = vi
      .fn()
      .mockRejectedValue(new Error("登录页没有被浏览器打开，可能被弹窗拦截。"));
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        handleGoogleLogin,
        errorMessage: "登录页没有被浏览器打开，可能被弹窗拦截。",
      }),
    );

    const { container } = await renderPage();

    const text = container.textContent ?? "";
    expect(text).toContain("登录页没有被浏览器打开，可能被弹窗拦截。");
    expect(text).toContain("API Key Provider 设置占位");
    expect(text).not.toContain("云端服务");
    expect(text).not.toContain("打开 Lime Hub 用户中心失败");
    expect(text).not.toContain("Lime Hub 登录页未打开");
    expect(text).not.toContain("https://user.limeai.run/login?");
    expect(text).not.toContain("复制链接");
    expect(handleGoogleLogin).not.toHaveBeenCalled();
  });

  it("已登录时不再渲染云端 tab 或客户端商业页", async () => {
    const openUserCenter = vi.fn();

    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        session: createLoggedInSession(),
        subscription: {
          id: "subscription-001",
          tenantId: "tenant-0001",
          userId: "user-001",
          planId: "plan-pro",
          planKey: "pro",
          planName: "Pro",
          status: "active",
          billingCycle: "monthly",
          currentPeriodStart: "2026-04-01T00:00:00.000Z",
          currentPeriodEnd: "2026-05-01T00:00:00.000Z",
          autoRenew: true,
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
        creditAccount: {
          tenantId: "tenant-0001",
          balance: 120000,
          reserved: 0,
          currency: "credits",
          updatedAt: "2026-04-27T00:00:00.000Z",
        },
        defaultProviderSummary: "Lime Hub 主服务 · gpt-5.2-pro",
        openUserCenter,
      }),
    );

    const { container } = await renderPage();

    const text = container.textContent ?? "";
    expect(
      container.querySelector('[data-testid="oem-cloud-user-center-handoff"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="provider-workspace-tab-cloud"]'),
    ).toBeNull();
    expect(text).toContain("API Key Provider 设置占位");
    expect(text).not.toContain("云端服务");
    expect(text).not.toContain("已在浏览器打开 Lime Hub 用户中心。");
    expect(text).not.toContain("由用户中心托管");
    expect(text).not.toContain("云端管理已迁移到服务端");
    expect(text).not.toContain("套餐与价格");
    expect(text).not.toContain("用量与账单");
    expect(text).not.toContain("积分管理");
    expect(text).not.toContain("可用积分");
    expect(text).not.toContain("当前套餐");
    expect(text).not.toContain("120,000");
    expect(text).not.toContain("SDK 调用");
    expect(text).not.toContain("OpenAI SDK");
    expect(text).not.toContain("Anthropic SDK");
    expect(text).not.toContain("最小 curl 测试");
    expect(text).not.toContain("GPT-5.2 Pro");
    expect(text).not.toContain("设为默认");
    expect(openUserCenter).not.toHaveBeenCalled();
  });

  it("已登录时不再在客户端渲染购买、账单、积分和 API Key 管理入口", async () => {
    const openUserCenter = vi.fn();

    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        session: createLoggedInSession(),
        pendingPayment: {
          kind: "plan_order",
          orderId: "order-001",
          title: "Pro",
          paymentChannel: "epay",
          paymentReference: "https://pay.limeai.run/order-001",
          amountCents: 9900,
          status: "pending",
          createdAt: "2026-04-27T00:00:00.000Z",
          updatedAt: "2026-04-27T00:00:00.000Z",
        },
        billingDashboard: {
          billingSummary: {
            currency: "CNY",
            nextPaymentAmountCents: 9900,
            autoRenew: true,
            totalSpentCents: 19900,
          },
          subscription: null,
          currentPlan: null,
          orders: [],
        },
        preference: {
          providerSource: "oem_cloud",
          providerKey: "lime-hub-main",
        },
        openUserCenter,
      }),
    );

    const { container } = await renderPage();

    const text = container.textContent ?? "";
    expect(
      container.querySelector('[data-testid="cloud-commerce-web-entry-card"]'),
    ).toBeNull();
    expect(text).toContain("API Key Provider 设置占位");
    expect(text).not.toContain("云端服务");
    expect(text).not.toContain("打开套餐与价格");
    expect(text).not.toContain("查看用量与账单");
    expect(text).not.toContain("管理积分");
    expect(text).not.toContain("管理 API Key");
    expect(text).not.toContain("待支付：Pro");
    expect(text).not.toContain("去用户中心处理");
    expect(text).not.toContain("继续支付");
    expect(text).not.toContain("创建 API Key");
    expect(text).not.toContain("轮换 Key");
    expect(text).not.toContain("撤销 Key");
    expect(text).not.toContain("支付后台配置");
    expect(text).not.toContain("选择适合你的套餐");
    expect(openUserCenter).not.toHaveBeenCalled();
    expect(mockOpenUrl).not.toHaveBeenCalled();
  });

  it("已下发 taxonomy 时也不再由客户端渲染品牌模型目录", async () => {
    mockUseOemCloudAccess.mockReturnValue(
      createCloudOfferAccessState({
        selectedModels: [
          {
            id: "model-002",
            offerId: "offer-001",
            modelId: "relay-gpt-images-2",
            displayName: "Relay GPT Images 2",
            abilities: ["chat", "vision_understanding"],
            task_families: ["image_generation"],
            input_modalities: ["text"],
            output_modalities: ["image"],
            runtime_features: ["images_api"],
            canonical_model_id: "openai/gpt-images-2",
            alias_source: "oem",
            recommended: true,
            description: "应优先使用统一 taxonomy",
          },
        ],
      }),
    );

    const { container } = await renderPage();

    const text = container.textContent ?? "";
    expect(text).toContain("API Key Provider 设置占位");
    expect(text).not.toContain("云端服务");
    expect(text).not.toContain("由用户中心托管");
    expect(text).not.toContain("云端管理已迁移到服务端");
    expect(text).not.toContain("Relay GPT Images 2");
    expect(text).not.toContain("图片生成");
    expect(text).not.toContain("视觉理解");
    expect(text).not.toContain("对话");
    expect(text).not.toContain(
      "实际映射：relay-gpt-images-2 → openai/gpt-images-2",
    );
  });

  it("单个云端来源时不再渲染本地 Offer 网格", async () => {
    mockUseOemCloudAccess.mockReturnValue(createCloudOfferAccessState());

    const { container } = await renderPage();

    const offerGrid = container.querySelector(
      '[data-testid="oem-cloud-offer-grid"]',
    );

    expect(offerGrid).toBeNull();
    expect(container.textContent ?? "").toContain("API Key Provider 设置占位");
    expect(container.textContent ?? "").not.toContain("云端服务");
    expect(container.textContent ?? "").not.toContain("由用户中心托管");
  });

  it("桌宠管理页应展示桌宠桥接卡片和脱敏边界说明", async () => {
    enableCompanionEntry();
    mockGetCompanionPetStatus.mockResolvedValue(
      createPetStatus({
        connected: true,
        client_id: "lime-pet",
        platform: "macos",
        capabilities: ["provider-overview"],
        last_event: "pet.ready",
        last_state: "walking",
      }),
    );

    const { container } = await renderPage();

    expect(
      container.querySelector('[data-testid="companion-provider-card"]'),
    ).toBeNull();

    await vi.waitFor(() => {
      expect(
        container.querySelector(
          '[data-testid="provider-workspace-tab-companion"]',
        ),
      ).not.toBeNull();
    });

    await clickButton(container, "桌宠管理", 0);

    const text = container.textContent ?? "";

    expect(
      container.querySelector('[data-testid="companion-provider-card"]'),
    ).not.toBeNull();
    expect(text).toContain(companionWorkspaceLabel);

    const introTip = await hoverTip("桌宠 Companion 说明");
    expect(getBodyText()).toContain(
      "桌宠通过本地 Companion 通道复用 Lime 的 AI 服务商状态",
    );
    expect(getBodyText()).toContain(
      "不会直接读取 API Key、OAuth 凭证或本地凭证文件",
    );
    await leaveTip(introTip);

    expect(text).toContain("桌宠已连接");
    expect(text).toContain("Provider 概览");
    expect(text).toContain("桌宠视角预览");
    expect(text).toContain("DeepSeek");
    expect(text).toContain("可用 1");
    expect(text).toContain("需关注 0");
    expect(text).toContain("接入检查");
    expect(text).toContain("当前链路已就绪，可以直接点击“立即同步到桌宠”。");
    expect(text).toContain("桌宠能力偏好");
    expect(text).toContain("桌宠通用模型");
    expect(text).not.toContain("桌宠语音播报");
    expect(
      container.querySelectorAll(
        "[data-testid='provider-settings-model-selector']",
      ),
    ).toHaveLength(1);
  });

  it("带 initialView=companion 时应默认打开桌宠管理页", async () => {
    enableCompanionEntry();

    const { container } = await renderPage({ initialView: "companion" });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="companion-provider-card"]'),
      ).not.toBeNull();
    });
    expect(container.textContent ?? "").toContain(companionWorkspaceLabel);
  });

  it("点击开启桌宠后应调用 launch 接口并展示启动反馈", async () => {
    enableCompanionEntry();

    mockGetCompanionPetStatus
      .mockResolvedValueOnce(createPetStatus())
      .mockResolvedValueOnce(
        createPetStatus({
          server_listening: true,
          connected: false,
          last_event: "pet.launch_requested",
        }),
      );

    const { container } = await renderPage();

    await vi.waitFor(() => {
      expect(
        container.querySelector(
          '[data-testid="provider-workspace-tab-companion"]',
        ),
      ).not.toBeNull();
    });

    await clickButton(container, "桌宠管理", 0);

    await clickButton(container, "开启桌宠", 2);

    expect(mockLaunchCompanionPet).toHaveBeenCalledTimes(1);
    expect(container.textContent ?? "").toContain("已请求开启桌宠");
  });

  it("未安装桌宠时应展示安装引导并支持一键打开下载页", async () => {
    enableCompanionEntry();

    mockLaunchCompanionPet.mockResolvedValue({
      launched: false,
      resolved_path: null,
      endpoint: "ws://127.0.0.1:45554/companion/pet",
      message:
        "未找到 Lime Pet 可执行产物，请先安装桌宠应用或通过 app_path 显式指定。",
    });
    mockGetCompanionPetStatus
      .mockResolvedValueOnce(createPetStatus())
      .mockResolvedValueOnce(createPetStatus());

    const { container } = await renderPage({ initialView: "companion" });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="companion-provider-card"]'),
      ).not.toBeNull();
    });

    await clickButton(container, "开启桌宠", 2);

    expect(
      container.querySelector('[data-testid="companion-install-guide"]'),
    ).not.toBeNull();
    expect(container.textContent ?? "").toContain("还没有安装 Lime Pet");
    expect(container.textContent ?? "").toContain("下载安装 Lime Pet");

    await clickButton(container, "下载安装 Lime Pet");

    expect(mockOpenUrl).toHaveBeenCalledWith(
      "https://github.com/limecloud/lime-pet/releases/latest",
    );
  });

  it("桌宠已连接且支持 provider 概览时，应允许手动同步摘要", async () => {
    enableCompanionEntry();

    mockGetCompanionPetStatus.mockResolvedValue(
      createPetStatus({
        connected: true,
        capabilities: ["provider-overview"],
        last_event: "pet.ready",
      }),
    );

    const { container } = await renderPage();

    await vi.waitFor(() => {
      expect(
        container.querySelector(
          '[data-testid="provider-workspace-tab-companion"]',
        ),
      ).not.toBeNull();
    });

    await clickButton(container, "桌宠管理", 0);

    await clickButton(container, "立即同步到桌宠", 2);

    expect(mockSendCompanionPetCommand).toHaveBeenCalledWith({
      event: "pet.provider_overview",
      payload: {
        providers: [
          {
            provider_type: "deepseek",
            display_name: "DeepSeek",
            total_count: 1,
            healthy_count: 1,
            available: true,
            needs_attention: false,
          },
        ],
        total_provider_count: 1,
        available_provider_count: 1,
        needs_attention_provider_count: 0,
      },
    });
    expect(container.textContent ?? "").toContain(
      "已同步 1 个服务商摘要到桌宠",
    );
    expect(container.textContent ?? "").toContain(
      "当前链路已就绪，可以直接点击“立即同步到桌宠”。",
    );
  });

  it("桌宠已连接但未声明 provider 概览能力时，应展示诊断并禁用手动同步", async () => {
    enableCompanionEntry();

    mockGetCompanionPetStatus.mockResolvedValue(
      createPetStatus({
        connected: true,
        client_id: "lime-pet",
        platform: "windows",
        capabilities: [],
        last_event: "pet.ready",
      }),
    );

    const { container } = await renderPage();

    await vi.waitFor(() => {
      expect(
        container.querySelector(
          '[data-testid="provider-workspace-tab-companion"]',
        ),
      ).not.toBeNull();
    });

    await clickButton(container, "桌宠管理", 0);

    const syncButton = container.querySelector(
      '[data-testid="companion-sync-preview"]',
    ) as HTMLButtonElement | null;
    const text = container.textContent ?? "";

    expect(syncButton).not.toBeNull();
    expect(syncButton?.disabled).toBe(true);
    expect(text).toContain("能力未声明");
    expect(text).toContain("当前桌宠已连接，但尚未声明 Provider 概览能力");

    const identityTip = await hoverTip("桌宠身份说明");
    expect(getBodyText()).toContain("平台：Windows");
    await leaveTip(identityTip);
  });
});
