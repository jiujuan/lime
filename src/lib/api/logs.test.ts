import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDiagnosticLogHistory,
  clearLogs,
  getLogs,
  getPersistedLogsTail,
} from "./logs";

const appServerMocks = vi.hoisted(() => ({
  listLogs: vi.fn(),
  readPersistedLogTail: vi.fn(),
  clearLogs: vi.fn(),
  clearDiagnosticLogHistory: vi.fn(),
}));

vi.mock("./appServer", () => ({
  APP_SERVER_METHOD_LOG_LIST: "log/list",
  APP_SERVER_METHOD_LOG_PERSISTED_TAIL: "log/persistedTail",
  APP_SERVER_METHOD_LOG_CLEAR: "log/clear",
  APP_SERVER_METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR:
    "log/diagnosticHistory/clear",
  createAppServerClient: () => appServerMocks,
}));

describe("logs API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 App Server current 读取日志", async () => {
    appServerMocks.listLogs.mockResolvedValueOnce({
      result: {
        entries: [{ timestamp: "t", level: "info", message: "m" }],
      },
    });
    appServerMocks.readPersistedLogTail.mockResolvedValueOnce({
      result: {
        entries: [{ timestamp: "t2", level: "warn", message: "m2" }],
      },
    });

    await expect(getLogs()).resolves.toEqual([
      expect.objectContaining({ level: "info" }),
    ]);
    await expect(getPersistedLogsTail(250)).resolves.toEqual([
      expect.objectContaining({ level: "warn" }),
    ]);
    expect(appServerMocks.listLogs).toHaveBeenCalledWith();
    expect(appServerMocks.readPersistedLogTail).toHaveBeenCalledWith({
      lines: 250,
    });
  });

  it("应通过 App Server current 清理日志", async () => {
    appServerMocks.clearLogs.mockResolvedValueOnce({
      result: { cleared: true },
    });
    appServerMocks.clearDiagnosticLogHistory.mockResolvedValueOnce({
      result: { cleared: true },
    });

    await expect(clearLogs()).resolves.toBeUndefined();
    await expect(clearDiagnosticLogHistory()).resolves.toBeUndefined();
  });

  it("应归一化 persisted tail 行数范围", async () => {
    appServerMocks.readPersistedLogTail
      .mockResolvedValueOnce({ result: { entries: [] } })
      .mockResolvedValueOnce({ result: { entries: [] } })
      .mockResolvedValueOnce({ result: { entries: [] } });

    await getPersistedLogsTail(5);
    await getPersistedLogsTail(2_000);
    await getPersistedLogsTail(Number.NaN);

    expect(appServerMocks.readPersistedLogTail).toHaveBeenNthCalledWith(1, {
      lines: 20,
    });
    expect(appServerMocks.readPersistedLogTail).toHaveBeenNthCalledWith(2, {
      lines: 1000,
    });
    expect(appServerMocks.readPersistedLogTail).toHaveBeenNthCalledWith(3, {
      lines: 200,
    });
  });

  it("后端报错时应向上传递异常", async () => {
    appServerMocks.readPersistedLogTail.mockRejectedValueOnce(
      new Error("boom"),
    );

    await expect(getPersistedLogsTail(200)).rejects.toThrow("boom");
  });

  it("日志读取遇到非数组或缺字段条目时应 fail closed", async () => {
    appServerMocks.listLogs.mockResolvedValueOnce({
      result: { entries: { items: [] } },
    });
    appServerMocks.readPersistedLogTail.mockResolvedValueOnce({
      result: { entries: [{ timestamp: "t", level: "info" }] },
    });

    await expect(getLogs()).rejects.toThrow(
      "log/list did not return log entries",
    );
    await expect(getPersistedLogsTail()).rejects.toThrow(
      "log/persistedTail did not return log entries",
    );
  });

  it("日志清理遇到无效 App Server result 时应 fail closed", async () => {
    appServerMocks.clearLogs.mockResolvedValueOnce({
      result: { success: true },
    });
    appServerMocks.clearDiagnosticLogHistory.mockResolvedValueOnce({
      result: undefined,
    });

    await expect(clearLogs()).rejects.toThrow(
      "log/clear did not return log clear result",
    );
    await expect(clearDiagnosticLogHistory()).rejects.toThrow(
      "log/diagnosticHistory/clear did not return log clear result",
    );
  });
});
