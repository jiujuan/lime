/**
 * Desktop Host fallback for renderer-side host commands.
 */
/**
 * 显式 mock 入口，供 DevBridge 失败后的 fallback 使用。
 * 这里不能再次探测 HTTP bridge，否则会把一次后端未就绪放大成多条 console error。
 */
export declare function invokeMockOnly<T = any>(cmd: string, args?: Record<string, unknown>): Promise<T>;
export declare function invoke<T = any>(cmd: string, args?: Record<string, unknown>): Promise<T>;
export declare function mockCommand(cmd: string, handler: (...args: any[]) => any): void;
export declare function clearMocks(): void;
export declare function convertFileSrc(filePath: string, _protocol?: string): string;
export type InvokeOptions = Record<string, unknown>;
