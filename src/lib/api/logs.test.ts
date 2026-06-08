import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  clearDiagnosticLogHistory,
  clearLogs,
  getLogs,
  getPersistedLogsTail,
} from "./logs";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("logs API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应代理读取日志命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([{ timestamp: "t", level: "info", message: "m" }])
      .mockResolvedValueOnce([
        { timestamp: "t2", level: "warn", message: "m2" },
      ]);

    await expect(getLogs()).resolves.toEqual([
      expect.objectContaining({ level: "info" }),
    ]);
    await expect(getPersistedLogsTail(250)).resolves.toEqual([
      expect.objectContaining({ level: "warn" }),
    ]);
  });

  it("应代理清理日志命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(clearLogs()).resolves.toBeUndefined();
    await expect(clearDiagnosticLogHistory()).resolves.toBeUndefined();
  });

  it("后端报错时应向上传递异常", async () => {
    vi.mocked(safeInvoke).mockRejectedValueOnce(new Error("boom"));

    await expect(getPersistedLogsTail(200)).rejects.toThrow("boom");
  });

  it("日志列表遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    const diagnosticList: unknown[] = [];
    Object.defineProperty(diagnosticList, "__diagnostic", {
      value: {
        command: "get_logs",
        source: "electron-empty-diagnostic",
      },
      enumerable: false,
    });

    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticList);

    await expect(getLogs()).rejects.toThrow(
      "get_logs 尚未接入真实日志诊断 current 通道",
    );
  });

  it("日志读取遇到非数组或缺字段条目时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce([{ timestamp: "t", level: "info" }]);

    await expect(getLogs()).rejects.toThrow(
      "get_logs did not return log entries",
    );
    await expect(getPersistedLogsTail()).rejects.toThrow(
      "get_persisted_logs_tail did not return log entries",
    );
  });

  it("日志读取遇到错误 envelope 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      error: {
        code: "COMMAND_UNSUPPORTED",
        message: "not available",
      },
    });

    await expect(getLogs()).rejects.toThrow(
      "get_logs did not return log entries",
    );
  });

  it("日志清理遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "clear_logs",
        category: "electron-diagnostic-facade",
      },
    });

    await expect(clearLogs()).rejects.toThrow(
      "clear_logs 尚未接入真实日志诊断 current 通道",
    );
  });
});
