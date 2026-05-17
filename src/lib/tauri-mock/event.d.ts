/**
 * Mock for @tauri-apps/api/event
 */
type EventCallback<T> = (event: T) => void;
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
export type TauriEvent<T> = {
    event: Event;
    payload: T;
};
export type EventTarget = any;
export declare const TAURI_BACKEND_COMPAT: {
    loadTauriCompat: () => Promise<void>;
};
