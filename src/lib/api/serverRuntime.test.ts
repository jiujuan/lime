import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  exportSupportBundle,
  getLogStorageDiagnostics,
  getServerDiagnostics,
  getWindowsStartupDiagnostics,
} from "./serverRuntime";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("serverRuntime API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应代理诊断类命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ generated_at: "now", running: true })
      .mockResolvedValueOnce({
        current_log_exists: true,
        in_memory_log_count: 0,
      })
      .mockResolvedValueOnce({ bundle_path: "/tmp/a.zip" })
      .mockResolvedValueOnce({
        platform: "windows",
        checks: [],
        has_blocking_issues: false,
        has_warnings: false,
      });

    await expect(getServerDiagnostics()).resolves.toEqual(
      expect.objectContaining({ running: true }),
    );
    await expect(getLogStorageDiagnostics()).resolves.toEqual(
      expect.objectContaining({ current_log_exists: true }),
    );
    await expect(exportSupportBundle()).resolves.toEqual(
      expect.objectContaining({ bundle_path: "/tmp/a.zip" }),
    );
    await expect(getWindowsStartupDiagnostics()).resolves.toEqual(
      expect.objectContaining({ platform: "windows" }),
    );
  });

  it("诊断命令遇到 degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      generated_at: "now",
      running: false,
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "get_server_diagnostics",
        status: "degraded",
      },
    });

    await expect(getServerDiagnostics()).rejects.toThrow(
      "get_server_diagnostics 尚未接入真实诊断 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("support bundle 遇到 desktop-host mock marker 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      bundle_path: "mock://Lime-Support.zip",
      output_directory: "mock://",
      generated_at: "now",
      platform: "mock-web",
      included_sections: ["meta/manifest.json"],
      omitted_sections: [],
    });

    await expect(exportSupportBundle()).rejects.toThrow(
      "export_support_bundle 尚未接入真实诊断 current 通道，收到 desktop-host mock 返回。",
    );
  });

  it("Windows 启动诊断遇到 desktop-host mock marker 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      platform: "mock-web",
      checks: [],
      has_blocking_issues: false,
      has_warnings: false,
    });

    await expect(getWindowsStartupDiagnostics()).rejects.toThrow(
      "get_windows_startup_diagnostics 尚未接入真实诊断 current 通道，收到 desktop-host mock 返回。",
    );
  });
});
