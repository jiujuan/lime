import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { reportFrontendCrash } from "./frontendCrash";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("frontendCrash API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应代理前端崩溃上报命令", async () => {
    const report = { message: "boom" };
    vi.mocked(safeInvoke).mockResolvedValueOnce({ success: true });

    await expect(reportFrontendCrash(report)).resolves.toBeUndefined();

    expect(safeInvoke).toHaveBeenCalledWith("report_frontend_crash", {
      report,
    });
  });

  it("遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
      },
    });

    await expect(reportFrontendCrash({ message: "boom" })).rejects.toThrow(
      "report_frontend_crash 尚未接入真实前端崩溃诊断 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });
});
