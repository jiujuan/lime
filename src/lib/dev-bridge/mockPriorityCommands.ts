import {
  isBridgeTruthEvent,
  shouldDisallowMockFallbackCommand,
} from "./commandPolicy";

/**
 * 产品路径不再允许浏览器模式优先走 mock。
 *
 * 保留空集合只为契约扫描和旧导入提供显式 fail-closed 锚点；
 * 测试夹具必须走 invokeMockOnly，不能从 safeInvoke / invoke 自动回退。
 */
const mockPriorityCommands = new Set<string>([]);

export function shouldPreferMockInBrowser(cmd: string): boolean {
  return mockPriorityCommands.has(cmd);
}

export function shouldDisallowMockFallbackInBrowser(cmd: string): boolean {
  return shouldDisallowMockFallbackCommand(cmd);
}

export function shouldDisallowMockEventFallbackInBrowser(
  eventName: string,
): boolean {
  return isBridgeTruthEvent(eventName);
}
