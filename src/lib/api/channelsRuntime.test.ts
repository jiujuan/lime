import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  discordChannelProbe,
  gatewayChannelStart,
  gatewayChannelStatus,
  gatewayTunnelCreate,
  gatewayTunnelStatus,
  telegramChannelProbe,
  wechatChannelListAccounts,
} from "./channelsRuntime";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("channelsRuntime API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应代理渠道运行时命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ channel: "telegram" })
      .mockResolvedValueOnce({ account_id: "default", ok: true })
      .mockResolvedValueOnce({ account_id: "default", ok: true });

    await expect(
      gatewayChannelStart({ channel: "telegram", accountId: "default" }),
    ).resolves.toEqual(expect.objectContaining({ channel: "telegram" }));
    await expect(
      telegramChannelProbe({ accountId: "default" }),
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(
      discordChannelProbe({ accountId: "default" }),
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
  });

  it("应代理隧道运行时命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        result: { ok: true },
        status: { running: false },
      })
      .mockResolvedValueOnce({ running: true });

    await expect(
      gatewayTunnelCreate({ tunnelName: "lime", persist: true }),
    ).resolves.toEqual(expect.objectContaining({ result: expect.any(Object) }));
    await expect(gatewayTunnelStatus()).resolves.toEqual(
      expect.objectContaining({ running: true }),
    );
  });

  it("渠道状态遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "gateway_channel_status",
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(gatewayChannelStatus({ channel: "wechat" })).rejects.toThrow(
      "gateway_channel_status 尚未接入真实 Channels current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("微信账号列表遇到 Electron empty diagnostic list 时应 fail closed", async () => {
    const diagnosticList: unknown[] = [];
    Object.defineProperty(diagnosticList, "__diagnostic", {
      value: {
        command: "wechat_channel_list_accounts",
        source: "electron-empty-diagnostic",
        status: "degraded",
      },
      enumerable: false,
    });

    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticList);

    await expect(wechatChannelListAccounts()).rejects.toThrow(
      "wechat_channel_list_accounts 尚未接入真实 Channels current 通道，收到 electron-empty-diagnostic 诊断返回。",
    );
  });

  it("隧道状态遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "gateway_tunnel_status",
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(gatewayTunnelStatus()).rejects.toThrow(
      "gateway_tunnel_status 尚未接入真实 Channels current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });
});
