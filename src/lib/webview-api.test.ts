import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";

import {
  getBrowserBackendPolicy,
  getBrowserBackendsStatus,
  getChromeBridgeEndpointInfo,
  getChromeBridgeStatus,
  getChromeProfileSessions,
} from "./webview-api";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
  safeListen: vi.fn(),
}));

function createDiagnosticList(command: string): unknown[] {
  const result: unknown[] = [];
  Object.defineProperty(result, "__diagnostic", {
    value: {
      source: "electron-host-diagnostic",
      command,
      status: "degraded",
    },
    enumerable: false,
  });
  return result;
}

function createDiagnosticObject(command: string): Record<string, unknown> {
  return {
    diagnostic: {
      source: "electron-host-diagnostic",
      command,
      status: "degraded",
    },
  };
}

describe("webview-api Browser bridge diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Chrome profile sessions 收到 Electron empty diagnostic list 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(
      createDiagnosticList("get_chrome_profile_sessions"),
    );

    await expect(getChromeProfileSessions()).rejects.toThrow(
      "get_chrome_profile_sessions 尚未接入真实 Browser bridge current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("Browser bridge 对象级诊断返回应 fail closed", async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      ["get_chrome_bridge_endpoint_info", getChromeBridgeEndpointInfo],
      ["get_chrome_bridge_status", getChromeBridgeStatus],
      ["get_browser_backend_policy", getBrowserBackendPolicy],
      ["get_browser_backends_status", getBrowserBackendsStatus],
    ];

    for (const [command, action] of cases) {
      vi.mocked(safeInvoke).mockResolvedValueOnce(
        createDiagnosticObject(command),
      );

      await expect(action()).rejects.toThrow(
        `${command} 尚未接入真实 Browser bridge current 通道，收到 electron-host-diagnostic 诊断返回。`,
      );
    }
  });

  it("Browser bridge 真实 current 返回不应被诊断检测拦截", async () => {
    const endpointInfo = {
      server_running: true,
      host: "127.0.0.1",
      port: 32123,
      observer_ws_url: "ws://127.0.0.1:32123/observer",
      control_ws_url: "ws://127.0.0.1:32123/control",
      bridge_key: "bridge-key",
    };
    const bridgeStatus = {
      endpoint: endpointInfo,
      observers: [],
      controls: [],
      pending_commands: [],
    };
    const backendPolicy = {
      preferred_backend: "existing_session",
      fallback_enabled: false,
      updated_at: "2026-06-08T00:00:00.000Z",
    };
    const backendsStatus = {
      policy: backendPolicy,
      backends: [],
      updated_at: "2026-06-08T00:00:00.000Z",
    };

    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(endpointInfo)
      .mockResolvedValueOnce(bridgeStatus)
      .mockResolvedValueOnce(backendPolicy)
      .mockResolvedValueOnce(backendsStatus);

    await expect(getChromeProfileSessions()).resolves.toEqual([]);
    await expect(getChromeBridgeEndpointInfo()).resolves.toEqual(endpointInfo);
    await expect(getChromeBridgeStatus()).resolves.toEqual(bridgeStatus);
    await expect(getBrowserBackendPolicy()).resolves.toEqual(backendPolicy);
    await expect(getBrowserBackendsStatus()).resolves.toEqual(backendsStatus);

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "get_chrome_profile_sessions");
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "get_chrome_bridge_endpoint_info",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(3, "get_chrome_bridge_status");
    expect(safeInvoke).toHaveBeenNthCalledWith(4, "get_browser_backend_policy");
    expect(safeInvoke).toHaveBeenNthCalledWith(5, "get_browser_backends_status");
  });
});
