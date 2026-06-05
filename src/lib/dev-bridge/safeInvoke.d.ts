/**
 * @file Safe Desktop Host Invoke 封装
 * @description 提供安全的 Desktop Host 调用，支持多层 fallback：
 *   1. Electron IPC (current Desktop Host)
 *   2. legacy Desktop Host IPC (兼容 adapter)
 *   3. HTTP Bridge (开发模式)
 *   4. Mock (仅测试/非浏览器调试场景)
 *
 * @module dev-bridge/safeInvoke
 */
import type { UnlistenFn } from "@/lib/desktop-host/event";
export interface InvokeErrorBufferEntry {
    timestamp: string;
    command: string;
    transport: "legacy-ipc" | "electron-ipc" | "http-bridge" | "fallback-invoke";
    error: string;
    args_preview?: Record<string, unknown>;
}
export interface InvokeTraceBufferEntry {
    timestamp: string;
    command: string;
    transport: "legacy-ipc" | "electron-ipc" | "http-bridge" | "fallback-invoke";
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
 * 支持多种模式：Electron IPC -> legacy Desktop Host IPC -> HTTP Bridge -> Mock。
 * 在浏览器开发模式下，模型 / Provider / Agent 运行时等真相命令
 * 若 HTTP Bridge 失败，会直接报错；其余非真相命令才允许回退到 mock。
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
