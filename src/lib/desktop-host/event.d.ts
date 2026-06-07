/**
 * Mock for @/lib/desktop-host/event
 */
type DesktopHostEvent<T> = {
    event: string;
    payload: T;
};
type EventCallback<T> = (event: DesktopHostEvent<T>) => void;
type UnlistenFn = () => void;
/**
 * Mock listen function
 */
export declare function listen<T = any>(event: string, handler: EventCallback<T>): Promise<UnlistenFn>;
/**
 * Mock once function
 */
export declare function once<T = any>(event: string, handler: EventCallback<T>): Promise<UnlistenFn>;
/**
 * Mock emit function - 用于触发事件
 */
export declare function emit(event: string, payload?: any): Promise<void>;
/**
 * 手动触发一个事件（用于测试）
 */
export declare function triggerEvent(event: string, payload?: any): void;
/**
 * 清除所有事件监听器
 */
export declare function clearAllListeners(): void;
export type { UnlistenFn };
export type DesktopHostEventPayload<T> = {
    event: string;
    payload: T;
};
export type EventTarget = any;
export declare const DESKTOP_HOST_BACKEND_COMPAT: {
    loadDesktopHostCompat: () => Promise<void>;
};
