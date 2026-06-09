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

  it("应通过 Electron Host current 通道上报前端崩溃并保持参数投影", async () => {
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
      "report_frontend_crash 尚未接入前端崩溃诊断 Electron Host current 通道",
    );
  });

  it("遇到异常成功形态时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({ success: false });

    await expect(reportFrontendCrash({ message: "boom" })).rejects.toThrow(
      "report_frontend_crash did not return crash report result",
    );
  });
});
