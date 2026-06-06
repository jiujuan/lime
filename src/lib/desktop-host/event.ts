/**
 * Desktop Host event bridge.
 *
 * 生产路径只能委托 Electron Desktop Host 事件桥。
 * 内存事件夹具只允许测试环境使用。
 */

import { getElectronHostBridge } from "@/lib/electron-host";

type DesktopHostEvent<T> = {
  event: string;
  payload: T;
};
type EventCallback<T> = (event: DesktopHostEvent<T>) => void;
type UnlistenFn = () => void;

// 存储事件监听器
const listeners = new Map<string, Set<EventCallback<any>>>();
const shouldLogMockEventInfo = import.meta.env.MODE !== "test";

function isTestEnvironment(): boolean {
  return Boolean(import.meta.env?.MODE === "test" || import.meta.env?.VITEST);
}

function assertTestEventFixture(apiName: string): void {
  if (isTestEnvironment()) {
    return;
  }
  throw new Error(
    `[Mock] ${apiName} 只能在测试环境使用；生产事件必须进入 Electron Desktop Host IPC。`,
  );
}

function logMockEventInfo(...args: Parameters<typeof console.log>) {
  if (!shouldLogMockEventInfo) {
    return;
  }
  console.log(...args);
}

export async function listen<T = any>(
  event: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  const electronHost = getElectronHostBridge();
  if (electronHost) {
    const listenBridge = electronHost.listen ?? electronHost.on;
    if (listenBridge) {
      const unlisten = await listenBridge(event, handler as never);
      return unlisten;
    }
  }

  assertTestEventFixture("listen");
  logMockEventInfo(`[Mock] listen: ${event}`);

  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }

  listeners.get(event)!.add(handler);

  // 返回 unlisten 函数
  return () => {
    const set = listeners.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        listeners.delete(event);
      }
    }
    logMockEventInfo(`[Mock] unlisten: ${event}`);
  };
}

export async function once<T = any>(
  event: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  let unlisten: UnlistenFn | null = null;

  const wrappedHandler = (data: DesktopHostEvent<T>) => {
    handler(data);
    unlisten?.();
  };

  unlisten = await listen(event, wrappedHandler);
  return unlisten;
}

export async function emit(event: string, payload?: any): Promise<void> {
  const electronHost = getElectronHostBridge();
  if (electronHost?.emit) {
    return electronHost.emit(event, payload);
  }
  if (electronHost?.send) {
    electronHost.send(event, payload);
    return;
  }

  assertTestEventFixture("emit");
  logMockEventInfo(`[Mock] emit: ${event}`, payload);

  const set = listeners.get(event);
  if (set) {
    set.forEach((handler) => {
      try {
        handler({ event, payload });
      } catch (e) {
        console.error(`[Mock] Error in event handler for ${event}:`, e);
      }
    });
  }
}

/**
 * 手动触发一个事件（用于测试）
 */
export function triggerEvent(event: string, payload?: any) {
  assertTestEventFixture("triggerEvent");
  emit(event, payload);
}

/**
 * 清除所有事件监听器
 */
export function clearAllListeners() {
  assertTestEventFixture("clearAllListeners");
  listeners.clear();
}

// 导出类型
export type { UnlistenFn };

// 重新导出 EventTarget 等类型（如果需要）
export type DesktopHostEventPayload<T> = {
  event: string;
  payload: T;
};

export type EventTarget = any;

export const DESKTOP_HOST_BACKEND_COMPAT = {
  loadDesktopHostCompat: async () => {},
};
