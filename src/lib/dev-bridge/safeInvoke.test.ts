import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  baseInvoke: vi.fn(),
  baseListen: vi.fn(),
  baseEmit: vi.fn(),
  explicitMockInvoke: vi.fn(),
  explicitMockListen: vi.fn(),
  listenViaHttpEvent: vi.fn(),
  hasDevBridgeEventListenerCapability: vi.fn(),
  invokeViaHttp: vi.fn(),
  isDevBridgeAvailable: vi.fn(),
  normalizeDevBridgeError: vi.fn((cmd: string, error: unknown) => {
    if (error instanceof Error) {
      return new Error(`[${cmd}] ${error.message}`);
    }
    return new Error(`[${cmd}] ${String(error)}`);
  }),
}));

vi.mock("@/lib/desktop-host/api", () => ({
  core: {
    invoke: mocks.baseInvoke,
  },
  event: {
    listen: mocks.baseListen,
    emit: mocks.baseEmit,
  },
}));

vi.mock("./explicitMockFallback", () => ({
  invokeExplicitMock: mocks.explicitMockInvoke,
  listenExplicitMock: mocks.explicitMockListen,
}));

vi.mock("./http-client", () => ({
  hasDevBridgeEventListenerCapability:
    mocks.hasDevBridgeEventListenerCapability,
  invokeViaHttp: mocks.invokeViaHttp,
  isDevBridgeAvailable: mocks.isDevBridgeAvailable,
  listenViaHttpEvent: mocks.listenViaHttpEvent,
  normalizeDevBridgeError: mocks.normalizeDevBridgeError,
}));

vi.mock("./mockPriorityCommands", () => ({
  shouldPreferMockInBrowser: vi.fn(() => false),
  shouldDisallowMockEventFallbackInBrowser: vi.fn(() => false),
  shouldDisallowMockFallbackInBrowser: vi.fn(() => false),
}));

import {
  clearInvokeErrorBuffer,
  clearInvokeTraceBuffer,
  getInvokeErrorBuffer,
  getInvokeTraceBuffer,
  safeListen,
  safeInvoke,
} from "./safeInvoke";
import {
  shouldDisallowMockEventFallbackInBrowser,
  shouldDisallowMockFallbackInBrowser,
  shouldPreferMockInBrowser,
} from "./mockPriorityCommands";

const LEGACY_HOST_GLOBAL_KEY = ["__TA", "URI__"].join("");
const LEGACY_HOST_INTERNALS_KEY = ["__TA", "URI_INTERNALS__"].join("");

function rendererGlobals(): Record<string, any> {
  return window as unknown as Record<string, any>;
}

describe("safeInvoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDevBridgeAvailable.mockReturnValue(true);
    mocks.hasDevBridgeEventListenerCapability.mockReturnValue(false);
    window.localStorage.clear();
    clearInvokeErrorBuffer();
    clearInvokeTraceBuffer();
    delete rendererGlobals()[LEGACY_HOST_GLOBAL_KEY];
    delete rendererGlobals()[LEGACY_HOST_INTERNALS_KEY];
    delete (window as any).electronAPI;
  });

  it("浏览器开发模式下优先走 HTTP bridge", async () => {
    mocks.invokeViaHttp.mockResolvedValueOnce({ ok: true });

    const result = await safeInvoke("workspace_list");

    expect(result).toEqual({ ok: true });
    expect(mocks.invokeViaHttp).toHaveBeenCalledWith(
      "workspace_list",
      undefined,
    );
    expect(mocks.baseInvoke).not.toHaveBeenCalled();

    expect(getInvokeTraceBuffer()).toEqual([
      expect.objectContaining({
        command: "workspace_list",
        transport: "http-bridge",
        status: "success",
      }),
    ]);
  });

  it("HTTP bridge 失败时会直接回退到显式 mock，避免二次探测 HTTP", async () => {
    mocks.invokeViaHttp.mockRejectedValueOnce(new Error("Failed to fetch"));
    mocks.explicitMockInvoke.mockResolvedValueOnce(["mocked"]);

    await expect(safeInvoke("workspace_list")).resolves.toEqual(["mocked"]);

    expect(mocks.normalizeDevBridgeError).toHaveBeenCalled();
    expect(mocks.baseInvoke).not.toHaveBeenCalled();
    expect(mocks.explicitMockInvoke).toHaveBeenCalledWith(
      "workspace_list",
      undefined,
    );

    expect(getInvokeErrorBuffer()).toEqual([
      expect.objectContaining({
        command: "workspace_list",
        transport: "http-bridge",
      }),
    ]);
    expect(getInvokeTraceBuffer()).toEqual([
      expect.objectContaining({
        command: "workspace_list",
        transport: "http-bridge",
        status: "error",
      }),
      expect.objectContaining({
        command: "workspace_list",
        transport: "fallback-invoke",
        status: "success",
      }),
    ]);
  });

  it("模型与运行时真相命令在 bridge 失败时不应静默退回 mock", async () => {
    vi.mocked(shouldDisallowMockFallbackInBrowser).mockReturnValueOnce(true);
    mocks.invokeViaHttp.mockRejectedValueOnce(new Error("Failed to fetch"));

    await expect(safeInvoke("aster_agent_init")).rejects.toThrow(
      "[aster_agent_init] Failed to fetch",
    );

    expect(mocks.baseInvoke).not.toHaveBeenCalled();
    expect(mocks.explicitMockInvoke).not.toHaveBeenCalled();
    expect(getInvokeTraceBuffer()).toEqual([
      expect.objectContaining({
        command: "aster_agent_init",
        transport: "http-bridge",
        status: "error",
      }),
    ]);
  });

  it("mock 优先命令会直接走 fallback invoke", async () => {
    vi.mocked(shouldPreferMockInBrowser).mockReturnValueOnce(true);
    mocks.baseInvoke.mockResolvedValueOnce(["mock-first"]);

    await expect(safeInvoke("companion_get_pet_status")).resolves.toEqual([
      "mock-first",
    ]);

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
    expect(mocks.baseInvoke).toHaveBeenCalledWith(
      "companion_get_pet_status",
      undefined,
    );
  });

  it("HTTP bridge 与 mock 都失败时抛出 bridge 错误", async () => {
    mocks.invokeViaHttp.mockRejectedValueOnce(new Error("Failed to fetch"));
    mocks.explicitMockInvoke.mockRejectedValueOnce(new Error("mock failed"));

    await expect(safeInvoke("workspace_list")).rejects.toThrow(
      "[workspace_list] Failed to fetch",
    );
  });

  it("浏览器直开旧宿主 dev 页面时会从真实 invoke 退回显式 mock", async () => {
    vi.mocked(shouldPreferMockInBrowser).mockReturnValueOnce(true);
    mocks.baseInvoke.mockRejectedValueOnce(
      new TypeError("Cannot read properties of undefined (reading 'invoke')"),
    );
    mocks.explicitMockInvoke.mockResolvedValueOnce({ connected: false });

    await expect(safeInvoke("companion_get_pet_status")).resolves.toEqual({
      connected: false,
    });

    expect(mocks.baseInvoke).toHaveBeenCalledWith(
      "companion_get_pet_status",
      undefined,
    );
    expect(mocks.explicitMockInvoke).toHaveBeenCalledWith(
      "companion_get_pet_status",
      undefined,
    );
  });

  it("HTTP bridge 失败后不会再调用真实 invoke 探测", async () => {
    mocks.invokeViaHttp.mockRejectedValueOnce(new Error("Failed to fetch"));
    mocks.explicitMockInvoke.mockResolvedValueOnce([]);

    await expect(safeInvoke("workspace_list")).resolves.toEqual([]);

    expect(mocks.invokeViaHttp).toHaveBeenCalledWith(
      "workspace_list",
      undefined,
    );
    expect(mocks.baseInvoke).not.toHaveBeenCalled();
    expect(mocks.explicitMockInvoke).toHaveBeenCalledWith(
      "workspace_list",
      undefined,
    );
  });

  it("Electron host 声明支持命令时 safeInvoke 走 electron-ipc 并记录 trace", async () => {
    (window as any).electronAPI = {
      supportsCommand: (command: string) =>
        command === "app_server_handle_json_lines",
      invoke: vi.fn().mockResolvedValueOnce({ lines: [] }),
      listen: vi.fn(),
      emit: vi.fn(),
    };

    await expect(
      safeInvoke("app_server_handle_json_lines", {
        request: { lines: [] },
      }),
    ).resolves.toEqual({ lines: [] });

    expect((window as any).electronAPI.invoke).toHaveBeenCalledWith(
      "app_server_handle_json_lines",
      { request: { lines: [] } },
    );
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
    expect(getInvokeTraceBuffer()).toEqual([
      expect.objectContaining({
        command: "app_server_handle_json_lines",
        transport: "electron-ipc",
        status: "success",
      }),
    ]);
  });

  it("Electron host 未声明支持的非真相命令可继续走 HTTP bridge", async () => {
    (window as any).electronAPI = {
      supportsCommand: () => false,
      invoke: vi.fn(),
      listen: vi.fn(),
      emit: vi.fn(),
    };
    mocks.invokeViaHttp.mockResolvedValueOnce({ ok: true });

    await expect(safeInvoke("workspace_list")).resolves.toEqual({ ok: true });

    expect((window as any).electronAPI.invoke).not.toHaveBeenCalled();
    expect(mocks.invokeViaHttp).toHaveBeenCalledWith(
      "workspace_list",
      undefined,
    );
  });

  it("Electron host 未声明支持的真相命令直接失败，不回退 HTTP bridge 或 mock", async () => {
    vi.mocked(shouldDisallowMockFallbackInBrowser).mockReturnValueOnce(true);
    (window as any).electronAPI = {
      supportsCommand: () => false,
      invoke: vi.fn(),
      listen: vi.fn(),
      emit: vi.fn(),
    };

    await expect(safeInvoke("agent_runtime_list_sessions")).rejects.toThrow(
      'Desktop Host 尚未支持命令 "agent_runtime_list_sessions"',
    );

    expect((window as any).electronAPI.invoke).not.toHaveBeenCalled();
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
    expect(mocks.explicitMockInvoke).not.toHaveBeenCalled();
    expect(getInvokeTraceBuffer()).toEqual([
      expect.objectContaining({
        command: "agent_runtime_list_sessions",
        transport: "electron-ipc",
        status: "error",
      }),
    ]);
  });

  it("事件 internals 已就绪时 safeListen 走原生 event API", async () => {
    const unlisten = vi.fn();
    rendererGlobals()[LEGACY_HOST_INTERNALS_KEY] = {
      invoke: vi.fn(),
      transformCallback: vi.fn(),
    };
    mocks.baseListen.mockResolvedValueOnce(unlisten);

    const safeUnlisten = await safeListen("config-changed", vi.fn());

    safeUnlisten();
    safeUnlisten();

    expect(mocks.baseListen).toHaveBeenCalledWith(
      "config-changed",
      expect.any(Function),
    );
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("仅暴露全局旧宿主 event.listen 时 safeListen 也应走原生事件桥", async () => {
    const unlisten = vi.fn();
    const globalListen = vi.fn().mockResolvedValueOnce(unlisten);
    rendererGlobals()[LEGACY_HOST_GLOBAL_KEY] = {
      event: {
        listen: globalListen,
      },
    };

    const safeUnlisten = await safeListen("config-changed", vi.fn());

    safeUnlisten();
    safeUnlisten();

    expect(globalListen).toHaveBeenCalledWith(
      "config-changed",
      expect.any(Function),
    );
    expect(mocks.baseListen).not.toHaveBeenCalled();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("浏览器开发模式下 safeListen 优先走 HTTP 事件桥", async () => {
    const unlisten = vi.fn();
    mocks.hasDevBridgeEventListenerCapability.mockReturnValue(true);
    mocks.listenViaHttpEvent.mockResolvedValueOnce(unlisten);

    const safeUnlisten = await safeListen("config-changed", vi.fn());

    safeUnlisten();
    safeUnlisten();

    expect(mocks.listenViaHttpEvent).toHaveBeenCalledWith(
      "config-changed",
      expect.any(Function),
    );
    expect(mocks.baseListen).not.toHaveBeenCalled();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("事件桥失败且没有旧宿主标记时会退回显式 mock 监听", async () => {
    const unlisten = vi.fn();
    mocks.hasDevBridgeEventListenerCapability.mockReturnValue(true);
    mocks.listenViaHttpEvent.mockRejectedValueOnce(
      new Error("connection failed"),
    );
    mocks.explicitMockListen.mockResolvedValueOnce(unlisten);

    const safeUnlisten = await safeListen("companion-pet-status", vi.fn());

    safeUnlisten();
    safeUnlisten();

    expect(mocks.explicitMockListen).toHaveBeenCalledWith(
      "companion-pet-status",
      expect.any(Function),
    );
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("运行时真相事件在事件桥失败时不应静默退回显式 mock", async () => {
    mocks.hasDevBridgeEventListenerCapability.mockReturnValue(true);
    mocks.listenViaHttpEvent.mockRejectedValueOnce(
      new Error("connection failed"),
    );
    vi.mocked(shouldDisallowMockEventFallbackInBrowser).mockReturnValueOnce(
      true,
    );

    await expect(safeListen("aster_stream_session-1", vi.fn())).rejects.toThrow(
      '事件 "aster_stream_session-1" 监听失败',
    );

    expect(mocks.explicitMockListen).not.toHaveBeenCalled();
  });

  it("旧宿主标记存在但原生事件桥缺失时，运行时真相事件不应静默跳过监听", async () => {
    rendererGlobals()[LEGACY_HOST_GLOBAL_KEY] = {
      core: {
        invoke: vi.fn(),
      },
    };
    vi.mocked(shouldDisallowMockEventFallbackInBrowser).mockReturnValueOnce(
      true,
    );

    await expect(safeListen("aster_stream_session-1", vi.fn())).rejects.toThrow(
      '事件 "aster_stream_session-1" 监听失败',
    );

    expect(mocks.baseListen).not.toHaveBeenCalled();
    expect(mocks.explicitMockListen).not.toHaveBeenCalled();
  });

  it("旧宿主运行时存在但事件桥缺失时 safeListen 返回空清理函数", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    vi.useFakeTimers();
    rendererGlobals()[LEGACY_HOST_GLOBAL_KEY] = {
      core: {
        invoke: vi.fn(),
      },
    };

    try {
      const promise = safeListen("config-changed", vi.fn());
      await vi.advanceTimersByTimeAsync(3000);
      const unlisten = await promise;

      expect(typeof unlisten).toBe("function");
      expect(mocks.baseListen).not.toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("事件桥调用异常时 safeListen 降级为空清理函数", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    rendererGlobals()[LEGACY_HOST_INTERNALS_KEY] = {
      invoke: vi.fn(),
      transformCallback: vi.fn(),
    };
    mocks.baseListen.mockRejectedValueOnce(
      new TypeError(
        "Cannot read properties of undefined (reading 'transformCallback')",
      ),
    );

    try {
      const unlisten = await safeListen("companion-pet-status", vi.fn());

      expect(typeof unlisten).toBe("function");
      expect(mocks.baseListen).toHaveBeenCalledWith(
        "companion-pet-status",
        expect.any(Function),
      );
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it("旧宿主原生事件桥调用异常时，运行时真相事件应显式失败", async () => {
    rendererGlobals()[LEGACY_HOST_INTERNALS_KEY] = {
      invoke: vi.fn(),
      transformCallback: vi.fn(),
    };
    vi.mocked(shouldDisallowMockEventFallbackInBrowser).mockReturnValueOnce(
      true,
    );
    mocks.baseListen.mockRejectedValueOnce(
      new TypeError(
        "Cannot read properties of undefined (reading 'transformCallback')",
      ),
    );

    await expect(safeListen("aster_stream_session-1", vi.fn())).rejects.toThrow(
      '事件 "aster_stream_session-1" 监听失败',
    );
  });
});
