import type { UnlistenFn } from "@tauri-apps/api/event";
export declare function invokeExplicitMock<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
export declare function listenExplicitMock<T>(event: string, handler: (event: {
    payload: T;
}) => void): Promise<UnlistenFn>;
