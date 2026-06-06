import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAllListeners, emit, listen, once, triggerEvent } from "./event";

function clearElectronBridge(): void {
  delete (window as any).electronAPI;
}

describe("desktop-host/event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    clearElectronBridge();
    clearAllListeners();
  });

  it("Electron 事件桥可用时委托真实 bridge", async () => {
    const unlisten = vi.fn();
    const bridgeListen = vi.fn(
      (_event: string, handler: (event: unknown) => void) => {
        handler({ event: "config-changed", payload: { ok: true } });
        return unlisten;
      },
    );
    const bridgeEmit = vi.fn().mockResolvedValue(undefined);
    const handler = vi.fn();
    (window as any).electronAPI = {
      invoke: vi.fn(),
      listen: bridgeListen,
      emit: bridgeEmit,
    };

    const resultUnlisten = await listen("config-changed", handler);
    await emit("config-changed", { ok: true });
    resultUnlisten();

    expect(bridgeListen).toHaveBeenCalledWith(
      "config-changed",
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith({
      event: "config-changed",
      payload: { ok: true },
    });
    expect(bridgeEmit).toHaveBeenCalledWith("config-changed", { ok: true });
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("测试环境允许内存事件夹具", async () => {
    const handler = vi.fn();
    const unlisten = await listen("fixture-event", handler);

    await emit("fixture-event", { count: 1 });
    unlisten();
    await emit("fixture-event", { count: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      event: "fixture-event",
      payload: { count: 1 },
    });
  });

  it("once 在测试夹具中只触发一次", async () => {
    const handler = vi.fn();
    await once("once-event", handler);

    await emit("once-event", 1);
    await emit("once-event", 2);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      event: "once-event",
      payload: 1,
    });
  });

  it("非测试环境无 Electron 事件桥时 fail-closed", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITEST", "");

    try {
      await expect(listen("config-changed", vi.fn())).rejects.toThrow(
        "listen 只能在测试环境使用",
      );
      await expect(emit("config-changed")).rejects.toThrow(
        "emit 只能在测试环境使用",
      );
      expect(() => triggerEvent("config-changed")).toThrow(
        "triggerEvent 只能在测试环境使用",
      );
      expect(() => clearAllListeners()).toThrow(
        "clearAllListeners 只能在测试环境使用",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
