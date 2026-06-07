/**
 * @file Safe Desktop Host Invoke 封装
 * @description 提供安全的 Desktop Host 调用。current 主链固定为：
 *   前端 -> Electron IPC -> App Server JSON-RPC -> RuntimeCore / backend。
 *   HTTP Bridge 仅保留为浏览器开发诊断通道，失败时不再回退 mock。
 *
 * @module dev-bridge/safeInvoke
 */
import type { UnlistenFn } from "@/lib/desktop-host/event";
export interface InvokeErrorBufferEntry {
    timestamp: string;
    command: string;
    transport: "electron-ipc" | "http-bridge" | "unavailable";
    error: string;
    args_preview?: Record<string, unknown>;
}
export interface InvokeTraceBufferEntry {
    timestamp: string;
    command: string;
    transport: "electron-ipc" | "http-bridge" | "unavailable";
    status: "success" | "error";
    duration_ms: number;
    error?: string;
    args_preview?: Record<string, unknown>;
}
export declare function getInvokeErrorBuffer(limit?: number): InvokeErrorBufferEntry[];
export declare function getInvokeTraceBuffer(limit?: number): InvokeTraceBufferEntry[];
export declare function clearInvokeErrorBuffer(): void;
export declare function clearInvokeTraceBuffer(): void;
/**
 * 安全的 Desktop Host invoke 封装
 * current 主链：Electron IPC -> App Server JSON-RPC。
 * 浏览器开发态可走 HTTP Bridge，失败时直接抛出，不再回退 mock 或 legacy desktop host。
 */
export declare function safeInvoke<T = any>(cmd: string, args?: Record<string, unknown>): Promise<T>;
/**
 * 安全的 Desktop Host listen 封装
 * 优先使用真实的 Desktop Host event API
 */
export declare function safeListen<T = any>(event: string, handler: (event: {
    payload: T;
}) => void): Promise<UnlistenFn>;
export declare function hasNativeDesktopHostEventSupport(): boolean;
/**
 * 安全的 Desktop Host emit 封装
 * 优先使用真实的 Desktop Host event API
 */
export declare function safeEmit(event: string, payload?: unknown): Promise<void>;
