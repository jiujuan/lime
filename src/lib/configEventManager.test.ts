import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnlistenFn } from "@/lib/desktop-host/event";
import {
  ConfigEventManager,
  type ConfigEventManagerDependencies,
} from "./configEventManager";

describe("configEventManager", () => {
  let safeListen: ReturnType<typeof vi.fn>;
  let hasDesktopHostInvokeCapability: ReturnType<typeof vi.fn>;
  let configEventManager: ConfigEventManager;

  beforeEach(() => {
    safeListen = vi.fn(async () => vi.fn());
    hasDesktopHostInvokeCapability = vi.fn(() => true);
    configEventManager = new ConfigEventManager({
      safeListen:
        safeListen as unknown as ConfigEventManagerDependencies["safeListen"],
      hasDesktopHostInvokeCapability:
        hasDesktopHostInvokeCapability as unknown as ConfigEventManagerDependencies["hasDesktopHostInvokeCapability"],
    });
  });

  it("浏览器开发模式下不应占用 config-changed 事件桥连接", async () => {
    hasDesktopHostInvokeCapability.mockReturnValue(false);

    await configEventManager.subscribe();

    expect(safeListen).not.toHaveBeenCalled();
    expect(configEventManager.isSubscribed()).toBe(false);
  });

  it("取消订阅应阻止进行中的订阅回写状态", async () => {
    let resolveListen: (unlisten: UnlistenFn) => void = () => {};
    safeListen.mockReturnValue(
      new Promise<UnlistenFn>((resolve) => {
        resolveListen = resolve;
      }),
    );

    const subscribePromise = configEventManager.subscribe();

    expect(configEventManager.getState().subscribing).toBe(true);

    const staleUnlisten = vi.fn();
    configEventManager.unsubscribe();
    resolveListen(staleUnlisten);
    await subscribePromise;

    expect(staleUnlisten).toHaveBeenCalled();
    expect(configEventManager.isSubscribed()).toBe(false);
  });
});
