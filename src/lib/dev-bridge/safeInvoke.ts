/**
 * @file Safe Desktop Host Invoke 封装
 * @description 提供安全的 Desktop Host 调用。current 主链固定为：
 *   前端 -> Electron IPC -> App Server JSON-RPC -> RuntimeCore / backend。
 *   HTTP Bridge 仅保留为浏览器开发诊断通道，失败时不再回退 mock。
 *
 * @module dev-bridge/safeInvoke
 */

import type { UnlistenFn } from "@/lib/desktop-host/event";
import {
  hasDevBridgeEventListenerCapability,
  invokeViaHttp,
  isDevBridgeAvailable,
  listenViaHttpEvent,
  normalizeDevBridgeError,
  resolveBridgeRequestTimeoutMs,
} from "./http-client";
import { shouldDisallowMockEventFallbackInBrowser } from "./mockPriorityCommands";
import {
  getElectronHostBridge,
  isElectronHostCommandAvailable,
} from "@/lib/electron-host";

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

const INVOKE_ERROR_BUFFER_KEY = "lime_invoke_error_buffer_v1";
const INVOKE_ERROR_BUFFER_LIMIT = 120;
const INVOKE_TRACE_BUFFER_KEY = "lime_invoke_trace_buffer_v1";
const INVOKE_TRACE_BUFFER_LIMIT = 240;
const INVOKE_ERROR_TEXT_LIMIT = 800;
const USER_TIMING_PREFIX = "lime:safeInvoke";

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._-]+\b/gi, "Bearer ***"],
  [/\bapi[_-]?key\s*[:=]\s*["']?[A-Za-z0-9._-]+["']?/gi, "api_key=***"],
  [
    /\baccess[_-]?token\s*[:=]\s*["']?[A-Za-z0-9._-]+["']?/gi,
    "access_token=***",
  ],
  [
    /\brefresh[_-]?token\s*[:=]\s*["']?[A-Za-z0-9._-]+["']?/gi,
    "refresh_token=***",
  ],
  [/\btoken\s*[:=]\s*["']?[A-Za-z0-9._-]{10,}["']?/gi, "token=***"],
  [/\bsk-[A-Za-z0-9]{12,}\b/g, "sk-***"],
];

function sanitizeText(input: string): string {
  let sanitized = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[depth_limited]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = sanitizeValue(nestedValue, depth + 1);
    }
    return output;
  }
  return sanitizeText(String(value));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const core = error.message || error.name || "Unknown error";
    return sanitizeText(core).slice(0, INVOKE_ERROR_TEXT_LIMIT);
  }
  return sanitizeText(String(error || "Unknown error")).slice(
    0,
    INVOKE_ERROR_TEXT_LIMIT,
  );
}

function supportsUserTiming(): boolean {
  return (
    typeof performance !== "undefined" &&
    typeof performance.mark === "function" &&
    typeof performance.measure === "function"
  );
}

function sanitizeTimingLabel(input: string): string {
  const normalized = input.replace(/[^a-zA-Z0-9:_-]+/g, "_").slice(0, 120);
  return normalized || "invoke";
}

function createSafeUnlisten(unlisten: UnlistenFn): UnlistenFn {
  let active = true;

  return () => {
    if (!active) {
      return;
    }
    active = false;

    try {
      unlisten();
    } catch (error) {
      console.warn("[safeListen] 取消事件监听失败，已忽略。", error);
    }
  };
}

function normalizeDevBridgeListenError(event: string, error: unknown): Error {
  return new Error(
    `[DevBridge] 浏览器模式无法连接事件桥，事件 "${event}" 监听失败。请先启动 Electron 开发入口（npm run dev），并确认桌面宿主桥接可用。原始错误: ${toErrorMessage(error)}`,
  );
}

function normalizeDesktopHostListenError(event: string, error: unknown): Error {
  return new Error(
    `[Desktop Host] 原生事件桥不可用，事件 "${event}" 监听失败。请确认当前窗口的 event 插件桥接已经初始化完成，并检查前端预加载桥接是否可用。原始错误: ${toErrorMessage(error)}`,
  );
}

function shouldFailClosedOnMissingNativeEventBridge(event: string): boolean {
  return shouldDisallowMockEventFallbackInBrowser(event);
}

function electronUnsupportedCommandError(command: string): Error {
  return new Error(
    `[Electron] Desktop Host 尚未支持命令 "${command}"。该命令不能回退到 legacy desktop host、DevBridge mock 或 renderer mock；请经 Electron Desktop Host bridge 迁移到 App Server JSON-RPC。`,
  );
}

function electronHostUnavailableError(command: string): Error {
  return new Error(
    `[Electron] Desktop Host IPC 不可用，命令 "${command}" 无法进入 App Server JSON-RPC 主链。请通过 Electron 桌面入口运行，或启动开发 HTTP bridge 诊断通道。`,
  );
}

function electronInvokeTimeoutError(command: string, timeoutMs: number): Error {
  return new Error(
    `[Electron] Desktop Host IPC 命令 "${command}" 在 ${timeoutMs}ms 内未返回，已按 fail-closed 结束；该命令不能回退到 legacy desktop host、DevBridge mock 或 renderer mock。`,
  );
}

async function invokeElectronHostWithTimeout<T>(
  invoke: () => Promise<T>,
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const timeoutMs = resolveBridgeRequestTimeoutMs(command, args);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return await invoke();
  }

  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      reject(electronInvokeTimeoutError(command, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([invoke(), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

function startInvokeTiming(command: string): string | null {
  if (!supportsUserTiming()) {
    return null;
  }
  const timingId = `${USER_TIMING_PREFIX}:${sanitizeTimingLabel(command)}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  try {
    performance.mark(`${timingId}:start`);
    return timingId;
  } catch {
    return null;
  }
}

function finishInvokeTiming(
  timingId: string | null,
  command: string,
  transport: InvokeTraceBufferEntry["transport"],
  status: InvokeTraceBufferEntry["status"],
): void {
  if (!timingId || !supportsUserTiming()) {
    return;
  }

  const startMark = `${timingId}:start`;
  const endMark = `${timingId}:end`;
  const measureName = `${USER_TIMING_PREFIX}:${sanitizeTimingLabel(command)}:${transport}:${status}`;

  try {
    performance.mark(endMark);
    performance.measure(measureName, startMark, endMark);
  } catch {
    // ignore
  } finally {
    try {
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
    } catch {
      // ignore
    }
  }
}

function readInvokeErrorBuffer(): InvokeErrorBufferEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(INVOKE_ERROR_BUFFER_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (item): item is InvokeErrorBufferEntry =>
          item &&
          typeof item === "object" &&
          typeof item.timestamp === "string" &&
          typeof item.command === "string" &&
          typeof item.transport === "string" &&
          typeof item.error === "string",
      )
      .slice(-INVOKE_ERROR_BUFFER_LIMIT);
  } catch {
    return [];
  }
}

function writeInvokeErrorBuffer(items: InvokeErrorBufferEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      INVOKE_ERROR_BUFFER_KEY,
      JSON.stringify(items.slice(-INVOKE_ERROR_BUFFER_LIMIT)),
    );
  } catch {
    // ignore
  }
}

function readInvokeTraceBuffer(): InvokeTraceBufferEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(INVOKE_TRACE_BUFFER_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (item): item is InvokeTraceBufferEntry =>
          item &&
          typeof item === "object" &&
          typeof item.timestamp === "string" &&
          typeof item.command === "string" &&
          typeof item.transport === "string" &&
          (item.status === "success" || item.status === "error") &&
          typeof item.duration_ms === "number",
      )
      .slice(-INVOKE_TRACE_BUFFER_LIMIT);
  } catch {
    return [];
  }
}

function writeInvokeTraceBuffer(items: InvokeTraceBufferEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      INVOKE_TRACE_BUFFER_KEY,
      JSON.stringify(items.slice(-INVOKE_TRACE_BUFFER_LIMIT)),
    );
  } catch {
    // ignore
  }
}

function recordInvokeError(
  command: string,
  args: Record<string, unknown> | undefined,
  error: unknown,
  transport: InvokeErrorBufferEntry["transport"],
): void {
  const current = readInvokeErrorBuffer();
  const entry: InvokeErrorBufferEntry = {
    timestamp: new Date().toISOString(),
    command: sanitizeText(command),
    transport,
    error: toErrorMessage(error),
    args_preview: args
      ? (sanitizeValue(args) as Record<string, unknown>)
      : undefined,
  };
  current.push(entry);
  writeInvokeErrorBuffer(current);
}

function recordInvokeTrace(
  command: string,
  args: Record<string, unknown> | undefined,
  transport: InvokeTraceBufferEntry["transport"],
  status: InvokeTraceBufferEntry["status"],
  startedAt: number,
  error?: unknown,
): void {
  const current = readInvokeTraceBuffer();
  const entry: InvokeTraceBufferEntry = {
    timestamp: new Date().toISOString(),
    command: sanitizeText(command),
    transport,
    status,
    duration_ms: Math.max(0, Date.now() - startedAt),
    error: error ? toErrorMessage(error) : undefined,
    args_preview: args
      ? (sanitizeValue(args) as Record<string, unknown>)
      : undefined,
  };
  current.push(entry);
  writeInvokeTraceBuffer(current);
}

export function getInvokeErrorBuffer(limit = 50): InvokeErrorBufferEntry[] {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(200, Math.max(1, Math.floor(limit)))
    : 50;
  return readInvokeErrorBuffer().slice(-safeLimit);
}

export function getInvokeTraceBuffer(limit = 80): InvokeTraceBufferEntry[] {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(300, Math.max(1, Math.floor(limit)))
    : 80;
  return readInvokeTraceBuffer().slice(-safeLimit);
}

export function clearInvokeErrorBuffer(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(INVOKE_ERROR_BUFFER_KEY);
  } catch {
    // ignore
  }
}

export function clearInvokeTraceBuffer(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(INVOKE_TRACE_BUFFER_KEY);
  } catch {
    // ignore
  }
}

/**
 * 安全的 Desktop Host invoke 封装
 * current 主链：Electron IPC -> App Server JSON-RPC。
 * 浏览器开发态可走 HTTP Bridge，失败时直接抛出，不再回退 mock 或 legacy desktop host。
 */
export async function safeInvoke<T = any>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const startedAt = Date.now();
  const timingId = startInvokeTiming(cmd);

  const electronHost = getElectronHostBridge();
  if (electronHost && isElectronHostCommandAvailable(cmd)) {
    try {
      const result = await invokeElectronHostWithTimeout(
        () => electronHost.invoke<T>(cmd, args),
        cmd,
        args,
      );
      recordInvokeTrace(cmd, args, "electron-ipc", "success", startedAt);
      finishInvokeTiming(timingId, cmd, "electron-ipc", "success");
      return result;
    } catch (error) {
      recordInvokeError(cmd, args, error, "electron-ipc");
      recordInvokeTrace(cmd, args, "electron-ipc", "error", startedAt, error);
      finishInvokeTiming(timingId, cmd, "electron-ipc", "error");
      throw error;
    }
  }
  if (electronHost) {
    const error = electronUnsupportedCommandError(cmd);
    recordInvokeError(cmd, args, error, "electron-ipc");
    recordInvokeTrace(cmd, args, "electron-ipc", "error", startedAt, error);
    finishInvokeTiming(timingId, cmd, "electron-ipc", "error");
    throw error;
  }

  // 浏览器开发模式下尝试 HTTP 桥接。失败时直接暴露真实错误。
  if (isDevBridgeAvailable()) {
    try {
      const result = await invokeViaHttp(cmd, args);
      recordInvokeTrace(cmd, args, "http-bridge", "success", startedAt);
      finishInvokeTiming(timingId, cmd, "http-bridge", "success");
      return result as T;
    } catch (error) {
      const normalizedError = normalizeDevBridgeError(cmd, error);
      recordInvokeError(cmd, args, normalizedError, "http-bridge");
      recordInvokeTrace(
        cmd,
        args,
        "http-bridge",
        "error",
        startedAt,
        normalizedError,
      );

      finishInvokeTiming(timingId, cmd, "http-bridge", "error");
      throw normalizedError;
    }
  }

  const error = electronHostUnavailableError(cmd);
  recordInvokeError(cmd, args, error, "unavailable");
  recordInvokeTrace(cmd, args, "unavailable", "error", startedAt, error);
  finishInvokeTiming(timingId, cmd, "unavailable", "error");
  throw error;
}

/**
 * 安全的 Desktop Host listen 封装
 * 优先使用真实的 Desktop Host event API
 */
export async function safeListen<T = any>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  const electronHost = getElectronHostBridge();
  if (electronHost) {
    try {
      const listen = electronHost.listen ?? electronHost.on;
      if (listen) {
        const unlisten = await listen<T>(event, handler as never);
        return createSafeUnlisten(unlisten);
      }
    } catch (error) {
      if (shouldFailClosedOnMissingNativeEventBridge(event)) {
        throw normalizeDesktopHostListenError(event, error);
      }
      console.warn(
        `[safeListen] Electron 事件桥调用失败，跳过监听: ${event}`,
        error,
      );
      return () => {};
    }
  }

  if (hasDevBridgeEventListenerCapability()) {
    try {
      return createSafeUnlisten(await listenViaHttpEvent(event, handler));
    } catch (error) {
      throw normalizeDevBridgeListenError(event, error);
    }
  }

  throw normalizeDesktopHostListenError(
    event,
    new Error("Electron IPC 事件桥未就绪"),
  );
}

export function hasNativeDesktopHostEventSupport(): boolean {
  const electronHost = getElectronHostBridge();
  return Boolean(electronHost?.listen || electronHost?.on);
}

/**
 * 安全的 Desktop Host emit 封装
 * 优先使用真实的 Desktop Host event API
 */
export async function safeEmit(
  event: string,
  payload?: unknown,
): Promise<void> {
  const electronHost = getElectronHostBridge();
  if (electronHost) {
    return electronHost.emit(event, payload);
  }

  throw new Error(
    `[Electron] Desktop Host IPC 不可用，事件 "${event}" 无法发送。`,
  );
}
