import { beforeEach, describe, expect, it, vi } from "vitest";
import { isDevBridgeAvailable, safeInvoke } from "@/lib/dev-bridge";
import { reportFrontendDebugLog } from "./frontendDebug";

vi.mock("@/lib/dev-bridge", () => ({
  isDevBridgeAvailable: vi.fn(() => false),
  safeInvoke: vi.fn(),
}));

describe("frontendDebug API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应代理前端调试日志上报命令", async () => {
    vi.mocked(isDevBridgeAvailable).mockReturnValue(false);
    vi.mocked(safeInvoke).mockResolvedValueOnce({ success: true });

    await expect(
      reportFrontendDebugLog({
        message: "AgentChatPage.loadData.start",
        category: "agent",
      }),
    ).resolves.toBeUndefined();
  });

  it("浏览器 dev shell 下应 fail closed，不能静默跳过真实上报", async () => {
    vi.mocked(isDevBridgeAvailable).mockReturnValue(true);

    await expect(
      reportFrontendDebugLog({
        message: "AgentChatPage.loadData.start",
        category: "agent",
      }),
    ).rejects.toThrow(
      "report_frontend_debug_log 尚未接入浏览器 DevBridge current 通道",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(isDevBridgeAvailable).mockReturnValue(false);
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
      },
    });

    await expect(
      reportFrontendDebugLog({
        message: "AgentChatPage.loadData.start",
        category: "agent",
      }),
    ).rejects.toThrow(
      "report_frontend_debug_log 尚未接入真实前端调试日志 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });
});
