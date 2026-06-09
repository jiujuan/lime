import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  discordChannelProbe,
  feishuChannelProbe,
  gatewayChannelStart,
  gatewayChannelStop,
  gatewayChannelStatus,
  gatewayTunnelDetectCloudflared,
  gatewayTunnelInstallCloudflared,
  gatewayTunnelCreate,
  gatewayTunnelProbe,
  gatewayTunnelRestart,
  gatewayTunnelStart,
  gatewayTunnelStop,
  gatewayTunnelStatus,
  gatewayTunnelSyncWebhookUrl,
  telegramChannelProbe,
  wechatChannelListAccounts,
  wechatChannelLoginStart,
  wechatChannelLoginWait,
  wechatChannelProbe,
  wechatChannelRemoveAccount,
  wechatChannelSetRuntimeModel,
} from "./channelsRuntime";

const appServerReadGatewayChannelStatusMock = vi.hoisted(() => vi.fn());
const appServerStartGatewayChannelMock = vi.hoisted(() => vi.fn());
const appServerStopGatewayChannelMock = vi.hoisted(() => vi.fn());
const appServerProbeTelegramChannelMock = vi.hoisted(() => vi.fn());
const appServerProbeFeishuChannelMock = vi.hoisted(() => vi.fn());
const appServerProbeDiscordChannelMock = vi.hoisted(() => vi.fn());
const appServerProbeWechatChannelMock = vi.hoisted(() => vi.fn());
const appServerStartWechatChannelLoginMock = vi.hoisted(() => vi.fn());
const appServerWaitWechatChannelLoginMock = vi.hoisted(() => vi.fn());
const appServerListWechatChannelAccountsMock = vi.hoisted(() => vi.fn());
const appServerRemoveWechatChannelAccountMock = vi.hoisted(() => vi.fn());
const appServerSetWechatChannelRuntimeModelMock = vi.hoisted(() => vi.fn());
const appServerProbeGatewayTunnelMock = vi.hoisted(() => vi.fn());
const appServerDetectGatewayTunnelCloudflaredMock = vi.hoisted(() => vi.fn());
const appServerInstallGatewayTunnelCloudflaredMock = vi.hoisted(() =>
  vi.fn(),
);
const appServerCreateGatewayTunnelMock = vi.hoisted(() => vi.fn());
const appServerStartGatewayTunnelMock = vi.hoisted(() => vi.fn());
const appServerStopGatewayTunnelMock = vi.hoisted(() => vi.fn());
const appServerRestartGatewayTunnelMock = vi.hoisted(() => vi.fn());
const appServerReadGatewayTunnelStatusMock = vi.hoisted(() => vi.fn());
const appServerSyncGatewayTunnelWebhookUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

vi.mock("./appServer", () => ({
  APP_SERVER_METHOD_DISCORD_CHANNEL_PROBE: "discordChannel/probe",
  APP_SERVER_METHOD_FEISHU_CHANNEL_PROBE: "feishuChannel/probe",
  APP_SERVER_METHOD_GATEWAY_CHANNEL_START: "gatewayChannel/start",
  APP_SERVER_METHOD_GATEWAY_CHANNEL_STOP: "gatewayChannel/stop",
  APP_SERVER_METHOD_GATEWAY_CHANNEL_STATUS: "gatewayChannel/status",
  APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT:
    "gatewayTunnel/cloudflared/detect",
  APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL:
    "gatewayTunnel/cloudflared/install",
  APP_SERVER_METHOD_GATEWAY_TUNNEL_CREATE: "gatewayTunnel/create",
  APP_SERVER_METHOD_GATEWAY_TUNNEL_PROBE: "gatewayTunnel/probe",
  APP_SERVER_METHOD_GATEWAY_TUNNEL_RESTART: "gatewayTunnel/restart",
  APP_SERVER_METHOD_GATEWAY_TUNNEL_START: "gatewayTunnel/start",
  APP_SERVER_METHOD_GATEWAY_TUNNEL_STATUS: "gatewayTunnel/status",
  APP_SERVER_METHOD_GATEWAY_TUNNEL_STOP: "gatewayTunnel/stop",
  APP_SERVER_METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL:
    "gatewayTunnel/syncWebhookUrl",
  APP_SERVER_METHOD_TELEGRAM_CHANNEL_PROBE: "telegramChannel/probe",
  APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE:
    "wechatChannel/account/remove",
  APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_LIST:
    "wechatChannel/accounts/list",
  APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_START: "wechatChannel/login/start",
  APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_WAIT: "wechatChannel/login/wait",
  APP_SERVER_METHOD_WECHAT_CHANNEL_PROBE: "wechatChannel/probe",
  APP_SERVER_METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET:
    "wechatChannel/runtimeModel/set",
  createAppServerClient: () => ({
    readGatewayChannelStatus: appServerReadGatewayChannelStatusMock,
    startGatewayChannel: appServerStartGatewayChannelMock,
    stopGatewayChannel: appServerStopGatewayChannelMock,
    probeTelegramChannel: appServerProbeTelegramChannelMock,
    probeFeishuChannel: appServerProbeFeishuChannelMock,
    probeDiscordChannel: appServerProbeDiscordChannelMock,
    probeWechatChannel: appServerProbeWechatChannelMock,
    startWechatChannelLogin: appServerStartWechatChannelLoginMock,
    waitWechatChannelLogin: appServerWaitWechatChannelLoginMock,
    listWechatChannelAccounts: appServerListWechatChannelAccountsMock,
    removeWechatChannelAccount: appServerRemoveWechatChannelAccountMock,
    setWechatChannelRuntimeModel: appServerSetWechatChannelRuntimeModelMock,
    probeGatewayTunnel: appServerProbeGatewayTunnelMock,
    detectGatewayTunnelCloudflared:
      appServerDetectGatewayTunnelCloudflaredMock,
    installGatewayTunnelCloudflared:
      appServerInstallGatewayTunnelCloudflaredMock,
    createGatewayTunnel: appServerCreateGatewayTunnelMock,
    startGatewayTunnel: appServerStartGatewayTunnelMock,
    stopGatewayTunnel: appServerStopGatewayTunnelMock,
    restartGatewayTunnel: appServerRestartGatewayTunnelMock,
    readGatewayTunnelStatus: appServerReadGatewayTunnelStatusMock,
    syncGatewayTunnelWebhookUrl: appServerSyncGatewayTunnelWebhookUrlMock,
  }),
}));

describe("channelsRuntime API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createChannelStatus(channel = "telegram") {
    return {
      channel,
      status: {
        running_accounts: 0,
        accounts: [],
      },
    };
  }

  function createTunnelStatus(overrides: Record<string, unknown> = {}) {
    return {
      running: false,
      provider: "cloudflare",
      mode: "named",
      binary: "cloudflared",
      localUrl: "http://127.0.0.1:17654",
      ...overrides,
    };
  }

  it("渠道运行时命令应通过 App Server current", async () => {
    appServerStartGatewayChannelMock.mockResolvedValueOnce({
      result: createChannelStatus("telegram"),
    });
    appServerProbeTelegramChannelMock.mockResolvedValueOnce({
      result: {
        accountId: "default",
        ok: true,
        message: "telegram ok",
      },
    });
    appServerProbeDiscordChannelMock.mockResolvedValueOnce({
      result: {
        accountId: "default",
        ok: true,
        message: "discord ok",
      },
    });
    appServerProbeFeishuChannelMock.mockResolvedValueOnce({
      result: {
        accountId: "default",
        ok: true,
        message: "feishu ok",
      },
    });
    appServerProbeWechatChannelMock.mockResolvedValueOnce({
      result: {
        accountId: "wechat-default",
        ok: true,
        message: "wechat ok",
      },
    });
    appServerStopGatewayChannelMock.mockResolvedValueOnce({
      result: createChannelStatus("telegram"),
    });

    await expect(
      gatewayChannelStart({ channel: "telegram", accountId: "default" }),
    ).resolves.toEqual(expect.objectContaining({ channel: "telegram" }));
    await expect(
      telegramChannelProbe({ accountId: "default" }),
    ).resolves.toEqual(expect.objectContaining({ account_id: "default" }));
    await expect(
      discordChannelProbe({ accountId: "default" }),
    ).resolves.toEqual(expect.objectContaining({ account_id: "default" }));
    await expect(
      feishuChannelProbe({ accountId: "default" }),
    ).resolves.toEqual(expect.objectContaining({ account_id: "default" }));
    await expect(
      wechatChannelProbe({ accountId: "wechat-default" }),
    ).resolves.toEqual(expect.objectContaining({ accountId: "wechat-default" }));
    await expect(
      gatewayChannelStop({ channel: "telegram", accountId: "default" }),
    ).resolves.toEqual(expect.objectContaining({ channel: "telegram" }));
    expect(appServerStartGatewayChannelMock).toHaveBeenCalledWith({
      channel: "telegram",
      accountId: "default",
      pollTimeoutSecs: undefined,
    });
    expect(appServerStopGatewayChannelMock).toHaveBeenCalledWith({
      channel: "telegram",
      accountId: "default",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "gateway_channel_start",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "telegram_channel_probe",
      expect.anything(),
    );
  });

  it("隧道运行时命令应通过 App Server current", async () => {
    appServerCreateGatewayTunnelMock.mockResolvedValueOnce({
      result: {
        result: { ok: true, tunnelName: "lime", message: "created" },
        status: createTunnelStatus(),
      },
    });
    appServerReadGatewayTunnelStatusMock.mockResolvedValueOnce({
      result: createTunnelStatus({ running: true }),
    });

    await expect(
      gatewayTunnelCreate({ tunnelName: "lime", persist: true }),
    ).resolves.toEqual(
      expect.objectContaining({
        result: expect.objectContaining({ tunnel_name: "lime" }),
        status: expect.objectContaining({
          local_url: "http://127.0.0.1:17654",
        }),
      }),
    );
    await expect(gatewayTunnelStatus()).resolves.toEqual(
      expect.objectContaining({
        running: true,
        local_url: "http://127.0.0.1:17654",
      }),
    );
    expect(appServerCreateGatewayTunnelMock).toHaveBeenCalledWith({
      tunnelName: "lime",
      dnsName: undefined,
      persist: true,
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "gateway_tunnel_create",
      expect.anything(),
    );
  });

  it("应代理微信登录、账号删除、运行模型与隧道安装命令", async () => {
    appServerStartWechatChannelLoginMock.mockResolvedValueOnce({
      result: {
        sessionKey: "login-session-1",
        qrcodeUrl: "https://example.com/qr.png",
        message: "scan",
      },
    });
    appServerWaitWechatChannelLoginMock.mockResolvedValueOnce({
      result: {
        connected: true,
        botToken: "token",
        accountId: "wechat-default",
        message: "connected",
      },
    });
    appServerRemoveWechatChannelAccountMock.mockResolvedValueOnce({
      result: {},
    });
    appServerSetWechatChannelRuntimeModelMock.mockResolvedValueOnce({
      result: { runtimeModel: "openai/gpt-5.4" },
    });
    appServerProbeGatewayTunnelMock.mockResolvedValueOnce({
      result: {
        ok: true,
        provider: "cloudflare",
        mode: "named",
        binary: "cloudflared",
        configReady: true,
        message: "ready",
      },
    });
    appServerDetectGatewayTunnelCloudflaredMock.mockResolvedValueOnce({
      result: {
        installed: true,
        binary: "cloudflared",
        platform: "darwin-arm64",
        installSupported: true,
        requiresPrivilege: false,
        message: "installed",
      },
    });
    appServerInstallGatewayTunnelCloudflaredMock.mockResolvedValueOnce({
      result: {
        ok: true,
        attempted: false,
        platform: "darwin-arm64",
        installed: true,
        stdout: "",
        stderr: "",
        message: "installed",
      },
    });
    appServerStartGatewayTunnelMock.mockResolvedValueOnce({
      result: createTunnelStatus({ running: true }),
    });
    appServerStopGatewayTunnelMock.mockResolvedValueOnce({
      result: createTunnelStatus({ running: false }),
    });
    appServerRestartGatewayTunnelMock.mockResolvedValueOnce({
      result: createTunnelStatus({ running: true }),
    });
    appServerSyncGatewayTunnelWebhookUrlMock.mockResolvedValueOnce({
      result: {
        channel: "feishu",
        webhookPath: "/webhook/feishu",
        publicBaseUrl: "https://lime.example.com",
        webhookUrl: "https://lime.example.com/webhook/feishu",
        persisted: true,
      },
    });

    await expect(wechatChannelLoginStart()).resolves.toEqual(
      expect.objectContaining({ sessionKey: "login-session-1" }),
    );
    await expect(
      wechatChannelLoginWait({ sessionKey: "login-session-1" }),
    ).resolves.toEqual(expect.objectContaining({ connected: true }));
    await expect(
      wechatChannelRemoveAccount({ accountId: "wechat-default" }),
    ).resolves.toBeUndefined();
    await expect(
      wechatChannelSetRuntimeModel({
        providerId: "openai",
        modelId: "gpt-5.4",
      }),
    ).resolves.toBe("openai/gpt-5.4");
    await expect(gatewayTunnelProbe()).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    );
    await expect(gatewayTunnelDetectCloudflared()).resolves.toEqual(
      expect.objectContaining({ installed: true }),
    );
    await expect(
      gatewayTunnelInstallCloudflared({ confirm: true }),
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(gatewayTunnelStart()).resolves.toEqual(
      expect.objectContaining({ running: true }),
    );
    await expect(gatewayTunnelStop()).resolves.toEqual(
      expect.objectContaining({ running: false }),
    );
    await expect(gatewayTunnelRestart()).resolves.toEqual(
      expect.objectContaining({ running: true }),
    );
    await expect(
      gatewayTunnelSyncWebhookUrl({ channel: "feishu" }),
    ).resolves.toEqual(expect.objectContaining({ persisted: true }));
    expect(appServerInstallGatewayTunnelCloudflaredMock).toHaveBeenCalledWith({
      confirm: true,
    });
    expect(appServerSyncGatewayTunnelWebhookUrlMock).toHaveBeenCalledWith({
      channel: "feishu",
      accountId: undefined,
      webhookPath: undefined,
      persist: true,
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "wechat_channel_login_start",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "wechat_channel_set_runtime_model",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "gateway_tunnel_start",
      expect.anything(),
    );
  });

  it("应校验渠道状态返回形态", async () => {
    appServerReadGatewayChannelStatusMock
      .mockResolvedValueOnce({
        result: {
          channel: "wechat",
          status: {
            running_accounts: 0,
            accounts: [],
          },
        },
      })
      .mockResolvedValueOnce({ result: { success: true } });

    await expect(gatewayChannelStatus({ channel: "wechat" })).resolves.toEqual(
      expect.objectContaining({
        channel: "wechat",
        status: expect.objectContaining({ running_accounts: 0 }),
      }),
    );
    expect(appServerReadGatewayChannelStatusMock).toHaveBeenCalledWith({
      channel: "wechat",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "gateway_channel_status",
      expect.anything(),
    );

    await expect(gatewayChannelStatus({ channel: "wechat" })).rejects.toThrow(
      "gatewayChannel/status 未返回有效渠道运行状态",
    );
  });

  it("渠道状态通过 App Server current 透传后端错误", async () => {
    appServerReadGatewayChannelStatusMock.mockRejectedValueOnce(
      new Error("App Server down"),
    );

    await expect(gatewayChannelStatus({ channel: "wechat" })).rejects.toThrow(
      "App Server down",
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "gateway_channel_status",
      expect.anything(),
    );
  });

  it("微信账号列表通过 App Server current 透传后端错误", async () => {
    appServerListWechatChannelAccountsMock.mockRejectedValueOnce(
      new Error("App Server down"),
    );

    await expect(wechatChannelListAccounts()).rejects.toThrow(
      "App Server down",
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "wechat_channel_list_accounts",
      expect.anything(),
    );
  });

  it("应校验微信账号列表返回形态", async () => {
    appServerListWechatChannelAccountsMock
      .mockResolvedValueOnce({
        result: {
          accounts: [
            {
              accountId: "wechat-default",
              enabled: true,
              name: "默认微信",
              baseUrl: "http://127.0.0.1:8080",
              cdnBaseUrl: "http://127.0.0.1:8081",
              hasToken: false,
              scannerUserId: "scanner-1",
            },
          ],
        },
      })
      .mockResolvedValueOnce({ result: { items: [] } })
      .mockResolvedValueOnce({
        result: {
          accounts: [
            {
              account_id: "wechat-default",
              enabled: true,
            },
          ],
        },
      });

    await expect(wechatChannelListAccounts()).resolves.toEqual([
      expect.objectContaining({
        accountId: "wechat-default",
        baseUrl: "http://127.0.0.1:8080",
        cdnBaseUrl: "http://127.0.0.1:8081",
        hasToken: false,
        scannerUserId: "scanner-1",
      }),
    ]);
    expect(appServerListWechatChannelAccountsMock).toHaveBeenCalledWith();
    expect(safeInvoke).not.toHaveBeenCalledWith("wechat_channel_list_accounts");
    await expect(wechatChannelListAccounts()).rejects.toThrow(
      "wechatChannel/accounts/list 未返回有效微信账号列表",
    );
    await expect(wechatChannelListAccounts()).rejects.toThrow(
      "wechatChannel/accounts/list 未返回有效微信账号列表",
    );
  });

  it("隧道状态通过 App Server current 透传后端错误", async () => {
    appServerReadGatewayTunnelStatusMock.mockRejectedValueOnce(
      new Error("App Server down"),
    );

    await expect(gatewayTunnelStatus()).rejects.toThrow("App Server down");
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "gateway_tunnel_status",
      expect.anything(),
    );
  });

  it("渠道 start/stop/probe/login App Server 错误形态不应吞成成功", async () => {
    appServerStartGatewayChannelMock.mockResolvedValueOnce({
      result: { success: true },
    });
    appServerStopGatewayChannelMock.mockResolvedValueOnce({
      result: { success: true },
    });
    appServerProbeTelegramChannelMock.mockResolvedValueOnce({
      result: { accountId: "default", ok: true },
    });
    appServerStartWechatChannelLoginMock.mockResolvedValueOnce({
      result: { sessionKey: "login-session-1" },
    });
    appServerWaitWechatChannelLoginMock.mockResolvedValueOnce({
      result: { connected: true },
    });
    appServerRemoveWechatChannelAccountMock.mockResolvedValueOnce({
      result: { success: true },
    });
    appServerSetWechatChannelRuntimeModelMock.mockResolvedValueOnce({
      result: { success: true },
    });

    await expect(gatewayChannelStart({ channel: "telegram" })).rejects.toThrow(
      "gatewayChannel/start 未返回有效渠道运行状态",
    );
    await expect(gatewayChannelStop({ channel: "telegram" })).rejects.toThrow(
      "gatewayChannel/stop 未返回有效渠道运行状态",
    );
    await expect(telegramChannelProbe()).rejects.toThrow(
      "telegramChannel/probe 未返回有效渠道探测结果",
    );
    await expect(wechatChannelLoginStart()).rejects.toThrow(
      "wechatChannel/login/start 未返回有效微信登录启动结果",
    );
    await expect(
      wechatChannelLoginWait({ sessionKey: "login-session-1" }),
    ).rejects.toThrow("wechatChannel/login/wait 未返回有效微信登录等待结果");
    await expect(
      wechatChannelRemoveAccount({ accountId: "wechat-default" }),
    ).rejects.toThrow("wechatChannel/account/remove 未返回空结果");
    await expect(
      wechatChannelSetRuntimeModel({
        providerId: "openai",
        modelId: "gpt-5.4",
      }),
    ).rejects.toThrow("wechatChannel/runtimeModel/set 未返回有效运行模型结果");
  });

  it("隧道命令遇到错误形态时不应吞成成功", async () => {
    appServerProbeGatewayTunnelMock.mockResolvedValueOnce({
      result: { success: true },
    });
    appServerDetectGatewayTunnelCloudflaredMock.mockResolvedValueOnce({
      result: { installed: true },
    });
    appServerInstallGatewayTunnelCloudflaredMock.mockResolvedValueOnce({
      result: { ok: true },
    });
    appServerCreateGatewayTunnelMock.mockResolvedValueOnce({
      result: {
        result: { ok: true, tunnelName: "lime", message: "created" },
        status: { running: true },
      },
    });
    appServerStartGatewayTunnelMock.mockResolvedValueOnce({
      result: { running: true },
    });
    appServerStopGatewayTunnelMock.mockResolvedValueOnce({
      result: { running: false },
    });
    appServerRestartGatewayTunnelMock.mockResolvedValueOnce({
      result: { running: true },
    });
    appServerReadGatewayTunnelStatusMock.mockResolvedValueOnce({
      result: { running: true },
    });
    appServerSyncGatewayTunnelWebhookUrlMock.mockResolvedValueOnce({
      result: { channel: "feishu", persisted: true },
    });

    await expect(gatewayTunnelProbe()).rejects.toThrow(
      "gatewayTunnel/probe 未返回有效隧道探测结果",
    );
    await expect(gatewayTunnelDetectCloudflared()).rejects.toThrow(
      "gatewayTunnel/cloudflared/detect 未返回有效 cloudflared 安装状态",
    );
    await expect(gatewayTunnelInstallCloudflared()).rejects.toThrow(
      "gatewayTunnel/cloudflared/install 未返回有效 cloudflared 安装结果",
    );
    await expect(gatewayTunnelCreate()).rejects.toThrow(
      "gatewayTunnel/create 未返回有效隧道状态",
    );
    await expect(gatewayTunnelStart()).rejects.toThrow(
      "gatewayTunnel/start 未返回有效隧道状态",
    );
    await expect(gatewayTunnelStop()).rejects.toThrow(
      "gatewayTunnel/stop 未返回有效隧道状态",
    );
    await expect(gatewayTunnelRestart()).rejects.toThrow(
      "gatewayTunnel/restart 未返回有效隧道状态",
    );
    await expect(gatewayTunnelStatus()).rejects.toThrow(
      "gatewayTunnel/status 未返回有效隧道状态",
    );
    await expect(
      gatewayTunnelSyncWebhookUrl({ channel: "feishu" }),
    ).rejects.toThrow(
      "gatewayTunnel/syncWebhookUrl 未返回有效隧道 webhook 同步结果",
    );
  });
});
