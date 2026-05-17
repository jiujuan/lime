/**
 * 开发桥接 HTTP 客户端
 *
 * 在开发模式下，当 Tauri IPC 不可用时（浏览器环境），
 * 通过 HTTP 与运行中的 Tauri 后端通信。
 */
export interface InvokeRequest {
    cmd: string;
    args?: unknown;
}
export interface InvokeResponse {
    result?: unknown;
    error?: string;
}
export declare function resolveBridgeRequestTimeoutMs(cmd: string): number;
export declare function normalizeDevBridgeError(cmd: string, error: unknown): Error;
/**
 * 检查开发桥接是否可用
 *
 * @returns true 如果在 dev 模式且 Tauri 不可用
 */
export declare function isDevBridgeAvailable(): boolean;
export declare function hasDevBridgeEventListenerCapability(): boolean;
export declare function listenViaHttpEvent<T = unknown>(event: string, handler: (event: {
    payload: T;
}) => void): Promise<() => void>;
/**
 * 通过 HTTP 桥接调用 Tauri 命令
 *
 * @param cmd - 命令名称
 * @param args - 命令参数
 * @returns Promise<T> 命令执行结果
 */
export declare function invokeViaHttp<T = unknown>(cmd: string, args?: unknown): Promise<T>;
/**
 * 健康检查 - 测试与后端的连接
 *
 * @returns Promise<boolean> true 如果连接成功
 */
export declare function healthCheck(): Promise<boolean>;
/** @internal 仅供测试重置 DevBridge HTTP 状态 */
export declare function __resetDevBridgeHttpStateForTests(): void;
/**
 * 获取桥接状态信息
 */
export interface BridgeStatus {
    available: boolean;
    connected: boolean;
    mode: "tauri" | "http" | "mock";
}
/**
 * 获取当前桥接状态
 */
export declare function getBridgeStatus(): BridgeStatus;
