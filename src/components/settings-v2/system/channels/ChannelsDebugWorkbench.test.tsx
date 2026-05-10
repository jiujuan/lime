import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetConfig,
  mockSaveConfig,
  mockUseConfiguredProviders,
  mockDiscordChannelProbe,
  mockFeishuChannelProbe,
  mockGatewayChannelStart,
  mockGatewayChannelStatus,
  mockGatewayChannelStop,
  mockGatewayTunnelCreate,
  mockGatewayTunnelDetectCloudflared,
  mockGatewayTunnelInstallCloudflared,
  mockGatewayTunnelProbe,
  mockGatewayTunnelRestart,
  mockGatewayTunnelStart,
  mockGatewayTunnelStatus,
  mockGatewayTunnelStop,
  mockGatewayTunnelSyncWebhookUrl,
  mockTelegramChannelProbe,
  mockWechatChannelListAccounts,
  mockWechatChannelLoginStart,
  mockWechatChannelLoginWait,
  mockWechatChannelProbe,
  mockWechatChannelRemoveAccount,
  mockQrCodeToDataUrl,
  mockUseTranslation,
} = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSaveConfig: vi.fn(),
  mockUseConfiguredProviders: vi.fn(),
  mockDiscordChannelProbe: vi.fn(),
  mockFeishuChannelProbe: vi.fn(),
  mockGatewayChannelStart: vi.fn(),
  mockGatewayChannelStatus: vi.fn(),
  mockGatewayChannelStop: vi.fn(),
  mockGatewayTunnelCreate: vi.fn(),
  mockGatewayTunnelDetectCloudflared: vi.fn(),
  mockGatewayTunnelInstallCloudflared: vi.fn(),
  mockGatewayTunnelProbe: vi.fn(),
  mockGatewayTunnelRestart: vi.fn(),
  mockGatewayTunnelStart: vi.fn(),
  mockGatewayTunnelStatus: vi.fn(),
  mockGatewayTunnelStop: vi.fn(),
  mockGatewayTunnelSyncWebhookUrl: vi.fn(),
  mockTelegramChannelProbe: vi.fn(),
  mockWechatChannelListAccounts: vi.fn(),
  mockWechatChannelLoginStart: vi.fn(),
  mockWechatChannelLoginWait: vi.fn(),
  mockWechatChannelProbe: vi.fn(),
  mockWechatChannelRemoveAccount: vi.fn(),
  mockQrCodeToDataUrl: vi.fn(),
  mockUseTranslation: vi.fn((_namespace?: string) => ({
    t: (key: string, options?: unknown) => {
      if (typeof options === "string") {
        return options;
      }

      if (options && typeof options === "object") {
        const values = options as Record<string, unknown>;
        const template =
          typeof values.defaultValue === "string" ? values.defaultValue : key;
        return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
          String(values[name] ?? ""),
        );
      }

      return key;
    },
  })),
}));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  saveConfig: mockSaveConfig,
}));

vi.mock("@/hooks/useConfiguredProviders", () => ({
  useConfiguredProviders: mockUseConfiguredProviders,
  findConfiguredProviderBySelection: (
    providers: Array<{ key: string; providerId?: string }>,
    selection?: string | null,
  ) => {
    const normalizedSelection = (selection || "").trim().toLowerCase();
    const keyMatch =
      providers.find(
        (provider) => provider.key.trim().toLowerCase() === normalizedSelection,
      ) ?? null;
    const providerIdMatch =
      providers.find(
        (provider) =>
          (provider.providerId || "").trim().toLowerCase() ===
          normalizedSelection,
      ) ?? null;

    if (keyMatch && providerIdMatch && keyMatch !== providerIdMatch) {
      if (!keyMatch.providerId && providerIdMatch.providerId) {
        return providerIdMatch;
      }
    }

    return keyMatch ?? providerIdMatch ?? null;
  },
}));

vi.mock("@/lib/api/channelsRuntime", () => ({
  discordChannelProbe: mockDiscordChannelProbe,
  feishuChannelProbe: mockFeishuChannelProbe,
  gatewayChannelStart: mockGatewayChannelStart,
  gatewayChannelStatus: mockGatewayChannelStatus,
  gatewayChannelStop: mockGatewayChannelStop,
  gatewayTunnelCreate: mockGatewayTunnelCreate,
  gatewayTunnelDetectCloudflared: mockGatewayTunnelDetectCloudflared,
  gatewayTunnelInstallCloudflared: mockGatewayTunnelInstallCloudflared,
  gatewayTunnelProbe: mockGatewayTunnelProbe,
  gatewayTunnelRestart: mockGatewayTunnelRestart,
  gatewayTunnelStart: mockGatewayTunnelStart,
  gatewayTunnelStatus: mockGatewayTunnelStatus,
  gatewayTunnelStop: mockGatewayTunnelStop,
  gatewayTunnelSyncWebhookUrl: mockGatewayTunnelSyncWebhookUrl,
  telegramChannelProbe: mockTelegramChannelProbe,
  wechatChannelListAccounts: mockWechatChannelListAccounts,
  wechatChannelLoginStart: mockWechatChannelLoginStart,
  wechatChannelLoginWait: mockWechatChannelLoginWait,
  wechatChannelProbe: mockWechatChannelProbe,
  wechatChannelRemoveAccount: mockWechatChannelRemoveAccount,
}));

vi.mock("./ChannelLogTailPanel", () => ({
  ChannelLogTailPanel: () => <div data-testid="channel-log-tail-panel" />,
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: mockQrCodeToDataUrl,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: mockUseTranslation,
}));

import { ChannelsDebugWorkbench } from "./ChannelsDebugWorkbench";

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mountedPages: MountedPage[] = [];

function createConfig() {
  return {
    channels: {
      telegram: {
        enabled: true,
        bot_token: "123456:telegram-token",
        allowed_user_ids: ["10001"],
        default_model: "openai/gpt-4.1",
      },
      discord: {
        enabled: false,
        bot_token: "",
        allowed_server_ids: [],
        default_model: undefined,
        default_account: "default",
        accounts: {},
        dm_policy: "pairing",
        allow_from: [],
        group_policy: "allowlist",
        group_allow_from: [],
        streaming: "partial",
        reply_to_mode: "off",
      },
      feishu: {
        enabled: true,
        app_id: "cli_test_demo",
        app_secret: "secret",
        default_model: "openai/gpt-4.1",
        dm_policy: "pairing",
        allow_from: ["ou_test"],
        group_policy: "allowlist",
        group_allow_from: [],
      },
      wechat: {
        enabled: true,
        bot_token: "",
        base_url: "https://ilinkai.weixin.qq.com",
        cdn_base_url: "https://novac2c.cdn.weixin.qq.com/c2c",
        default_model: "openai/gpt-4.1",
        default_account: "wechat_1",
        accounts: {
          wechat_1: {
            enabled: true,
            name: "微信一号",
            base_url: "https://ilinkai.weixin.qq.com",
          },
        },
        dm_policy: "pairing",
        allow_from: ["wx_user_1"],
        group_policy: "allowlist",
        group_allow_from: [],
      },
    },
    gateway: {
      tunnel: {
        enabled: false,
        provider: "cloudflare",
        mode: "managed",
        local_host: "127.0.0.1",
        local_port: 3000,
        cloudflare: {},
      },
    },
  } as any;
}

function renderPage(
  props: Partial<ComponentProps<typeof ChannelsDebugWorkbench>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ChannelsDebugWorkbench initialSubPage="config" {...props} />);
  });

  mountedPages.push({ container, root });
  return container;
}

async function flushEffects(times = 6) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

describe("ChannelsDebugWorkbench", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    mockGetConfig.mockResolvedValue(createConfig());
    mockSaveConfig.mockResolvedValue(undefined);
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "openai",
          label: "OpenAI",
          type: "openai",
          registryId: "openai",
          customModels: ["gpt-4.1"],
        },
      ],
      loading: false,
    });

    mockDiscordChannelProbe.mockResolvedValue({ ok: true });
    mockFeishuChannelProbe.mockResolvedValue({ ok: true });
    mockGatewayChannelStart.mockResolvedValue({ ok: true });
    mockGatewayChannelStatus.mockResolvedValue({ ok: true });
    mockGatewayChannelStop.mockResolvedValue({ ok: true });
    mockGatewayTunnelCreate.mockResolvedValue({ ok: true });
    mockGatewayTunnelDetectCloudflared.mockResolvedValue({ ok: true });
    mockGatewayTunnelInstallCloudflared.mockResolvedValue({ ok: true });
    mockGatewayTunnelProbe.mockResolvedValue({ ok: true });
    mockGatewayTunnelRestart.mockResolvedValue({ ok: true });
    mockGatewayTunnelStart.mockResolvedValue({ ok: true });
    mockGatewayTunnelStatus.mockResolvedValue({ ok: true });
    mockGatewayTunnelStop.mockResolvedValue({ ok: true });
    mockGatewayTunnelSyncWebhookUrl.mockResolvedValue({ ok: true });
    mockTelegramChannelProbe.mockResolvedValue({ ok: true });
    mockWechatChannelListAccounts.mockResolvedValue([]);
    mockWechatChannelLoginStart.mockResolvedValue({
      sessionKey: "wechat-session",
      qrcodeUrl: "wechat-login-qr",
      message: "ok",
    });
    mockWechatChannelLoginWait.mockResolvedValue({ connected: false });
    mockWechatChannelProbe.mockResolvedValue({ ok: true });
    mockWechatChannelRemoveAccount.mockResolvedValue({ ok: true });
    mockQrCodeToDataUrl.mockResolvedValue("data:image/png;base64,qr");
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

    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("旧的概览或配置入口应直接落到日志与检查区，且不再暴露渠道配置表单", async () => {
    renderPage();
    await flushEffects(10);

    const text = document.body.textContent ?? "";
    expect(text).toContain("日志与检查");
    expect(text).toContain("这里只保留网关、日志和运行检查");
    expect(text).toContain("日志");
    expect(text).toContain("运行");
    expect(
      document.body.querySelector('[data-testid="channel-log-tail-panel"]'),
    ).not.toBeNull();
    expect(text).not.toContain("配置说明（通用）");
    expect(text).not.toContain("当前渠道：");
    expect(text).not.toContain("启用 Discord Bot");
    expect(text).not.toContain("当前配置摘要");
    expect(text).not.toContain("配置提示");
    expect(text).not.toContain("探测账号");
    expect(text).not.toContain("扫码登录");
    expect(text).not.toContain("Discord Gateway 调试工具");
  });

  it("网关与隧道表单应通过 settings namespace 渲染外层文案", async () => {
    renderPage({ initialSubPage: "gateway" });
    await flushEffects(10);

    const text = document.body.textContent ?? "";
    expect(text).toContain("网关与隧道");
    expect(text).toContain("Gateway 公共隧道");
    expect(text).toContain("启用隧道");
    expect(
      Array.from(document.body.querySelectorAll("input")).some(
        (input) => input.placeholder === "默认使用 PATH 中 cloudflared",
      ),
    ).toBe(true);
    expect(text).toContain("同步飞书回调 URL");
    expect(text).toContain("最近结果");
  });

  it("Telegram 与 Feishu 运行控制应通过 settings namespace 渲染", async () => {
    renderPage({ initialDebugTab: "feishu" });
    await flushEffects(10);

    const text = document.body.textContent ?? "";
    expect(text).toContain("运行");
    expect(text).toContain("Feishu Gateway 运行控制");
    expect(text).toContain("用于状态查询、启停和重启");
    expect(text).toContain("账号 ID");
    expect(text).toContain("查询状态");
    expect(text).toContain("启动");
    expect(text).toContain("停止");
    expect(text).toContain("重启");
    expect(text).toContain("最近结果");
  });

  it("微信运行控制和兼容扫码排障应通过 settings namespace 渲染", async () => {
    renderPage({ initialDebugTab: "wechat" });
    await flushEffects(10);

    const text = document.body.textContent ?? "";
    expect(text).toContain("微信 Gateway 运行控制");
    expect(text).toContain("账号 ID 留空时按默认配置解析");
    expect(text).toContain("列出账号");
    expect(text).toContain("兼容扫码排障");
    expect(text).toContain("生成二维码");
    expect(text).toContain("已配置账号");
    expect(text).toContain("删除时清理本地缓存数据");
    expect(text).toContain("最近结果");
  });
});
