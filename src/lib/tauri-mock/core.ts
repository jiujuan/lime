/**
 * Mock for @tauri-apps/api/core
 */

import {
  invokeViaHttp,
  isDevBridgeAvailable,
  normalizeDevBridgeError,
} from "../dev-bridge/http-client";
import { shouldPreferMockInBrowser } from "../dev-bridge/mockPriorityCommands";
import { browserMocks } from "./browserMocks";
import { configSystemMocks } from "./configSystemMocks";
import { clearCompanionMocks, companionMocks } from "./companionMocks";
import { agentRuntimeMocks } from "./agentRuntimeMocks";
import { agentAppMocks } from "./agentAppMocks";
import { fileSystemMocks } from "./fileSystemMocks";
import { clearKnowledgeMocks, knowledgeMocks } from "./knowledgeMocks";
import {
  clearLayeredDesignMocks,
  layeredDesignMocks,
} from "./layeredDesignMocks";
import { logMocks } from "./logMocks";
import { mcpMocks } from "./mcpMocks";
import { mediaTaskMocks } from "./mediaTaskMocks";
import { memoryMocks } from "./memoryMocks";
import { modelMocks } from "./modelMocks";
import { providerMocks } from "./providerMocks";
import { sessionFileMocks } from "./sessionFileMocks";
import { skillManagementMocks } from "./skillManagementMocks";
import { clearSkillForgeMocks, skillForgeMocks } from "./skillForgeMocks";
import { runtimeToolInventoryMocks } from "./runtimeToolInventoryMocks";
import { updateMocks } from "./updateMocks";
import { workspaceMocks } from "./workspaceMocks";
import { voiceMocks } from "./voiceMocks";

// 模拟的命令处理器
const mockCommands = new Map<string, (...args: any[]) => any>();
const shouldLogMockInfo = import.meta.env.MODE !== "test";

function logMockInfo(...args: Parameters<typeof console.log>) {
  if (!shouldLogMockInfo) {
    return;
  }
  console.log(...args);
}

// 默认 mock 数据
const defaultMocks: Record<string, any> = {
  execution_run_get_general_workbench_state: () => ({
    run_state: "idle",
    current_gate_key: "idle",
    queue_items: [],
    latest_terminal: null,
    recent_terminals: [],
    updated_at: new Date(0).toISOString(),
  }),

  ...companionMocks,
  ...knowledgeMocks,
  ...skillForgeMocks,
  ...configSystemMocks,
  ...browserMocks,

  ...agentRuntimeMocks,
  ...agentAppMocks,
  ...runtimeToolInventoryMocks,

  ...skillManagementMocks,
  ...providerMocks,
  ...mediaTaskMocks,
  ...memoryMocks,
  ...sessionFileMocks,
  ...layeredDesignMocks,
  ...modelMocks,
  ...mcpMocks,

  ...fileSystemMocks,
  ...logMocks,

  ...voiceMocks,
  ...updateMocks,

  ...workspaceMocks,
};

async function invokeDefaultMock<T = any>(
  cmd: string,
  args?: Record<string, unknown>,
  options: { log?: boolean } = {},
): Promise<T> {
  if (options.log !== false) {
    logMockInfo(`[Mock] invoke: ${cmd}`, args);
  }

  if (mockCommands.has(cmd)) {
    const handler = mockCommands.get(cmd)!;
    return handler(args);
  }

  if (cmd in defaultMocks) {
    return defaultMocks[cmd](args);
  }

  console.warn(`[Mock] Unhandled command: ${cmd}`);
  return undefined as T;
}

/**
 * 显式 mock 入口，供 DevBridge 失败后的 fallback 使用。
 * 这里不能再次探测 HTTP bridge，否则会把一次后端未就绪放大成多条 console error。
 */
export async function invokeMockOnly<T = any>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invokeDefaultMock<T>(cmd, args);
}

/**
 * Mock invoke function
 */
export async function invoke<T = any>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  logMockInfo(`[Mock] invoke: ${cmd}`, args);

  if (mockCommands.has(cmd)) {
    const handler = mockCommands.get(cmd)!;
    return handler(args);
  }

  if (isDevBridgeAvailable() && !shouldPreferMockInBrowser(cmd)) {
    try {
      return await invokeViaHttp<T>(cmd, args);
    } catch (error) {
      if (cmd in defaultMocks) {
        console.warn(
          `[Mock] Bridge unavailable or unsupported, fallback to mock: ${cmd}`,
        );
        return defaultMocks[cmd](args);
      }
      throw normalizeDevBridgeError(cmd, error);
    }
  }

  return invokeDefaultMock<T>(cmd, args, { log: false });
}

/**
 * Register a mock command handler
 */
export function mockCommand(cmd: string, handler: (...args: any[]) => any) {
  mockCommands.set(cmd, handler);
}

/**
 * Clear all mock commands
 */
export function clearMocks() {
  mockCommands.clear();
  clearCompanionMocks();
  clearKnowledgeMocks();
  clearSkillForgeMocks();
  clearLayeredDesignMocks();
}

/**
 * Mock convertFileSrc function
 * 在真实 Tauri 环境中，这个函数将本地文件路径转换为可在 webview 中使用的 URL
 * 在 mock 环境中，直接返回原始路径（或 blob URL 如果需要）
 */
export function convertFileSrc(filePath: string, _protocol?: string): string {
  // 在 mock 环境中，返回一个占位符或原始路径
  // 实际图片无法在 web 环境中显示，但不会导致构建错误
  logMockInfo(`[Mock] convertFileSrc: ${filePath}`);
  return filePath;
}

// 导出类型以保持兼容
export type { InvokeOptions } from "@tauri-apps/api/core";
