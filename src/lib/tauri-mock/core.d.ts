/**
 * Mock for @tauri-apps/api/core
 */
/**
 * 显式 mock 入口，供 DevBridge 失败后的 fallback 使用。
 * 这里不能再次探测 HTTP bridge，否则会把一次后端未就绪放大成多条 console error。
 */
export declare function invokeMockOnly<T = any>(cmd: string, args?: Record<string, unknown>): Promise<T>;
/**
 * Mock invoke function
 */
export declare function invoke<T = any>(cmd: string, args?: Record<string, unknown>): Promise<T>;
/**
 * Register a mock command handler
 */
export declare function mockCommand(cmd: string, handler: (...args: any[]) => any): void;
/**
 * Clear all mock commands
 */
export declare function clearMocks(): void;
/**
 * Mock convertFileSrc function
 * 在真实 Tauri 环境中，这个函数将本地文件路径转换为可在 webview 中使用的 URL
 * 在 mock 环境中，直接返回原始路径（或 blob URL 如果需要）
 */
export declare function convertFileSrc(filePath: string, _protocol?: string): string;
export type { InvokeOptions } from "@tauri-apps/api/core";
