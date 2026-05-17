/**
 * 浏览器模式下优先走 mock 的命令集合。
 *
 * 这些命令要么依赖当前 DevBridge 尚未桥接的原生能力，
 * 要么即使缺少真实后端也不应阻塞默认页面渲染。
 */
export declare function shouldPreferMockInBrowser(cmd: string): boolean;
export declare function shouldDisallowMockFallbackInBrowser(cmd: string): boolean;
export declare function shouldDisallowMockEventFallbackInBrowser(eventName: string): boolean;
