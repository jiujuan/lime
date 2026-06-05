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

import {
  core as desktopHostCore,
  event as desktopHostEvent,
} from "@/lib/desktop-host/api";
import type { UnlistenFn } from "@/lib/desktop-host/event";
import {
  hasDevBridgeEventListenerCapability,
  invokeViaHttp,
  isDevBridgeAvailable,
  listenViaHttpEvent,
  normalizeDevBridgeError,
} from "./http-client";
import { invokeExplicitMock, listenExplicitMock } from "./explicitMockFallback";
import {
  shouldDisallowMockEventFallbackInBrowser,
  shouldDisallowMockFallbackInBrowser,
  shouldPreferMockInBrowser,
} from "./mockPriorityCommands";
import {
  getLegacyDesktopHostGlobal,
  hasDesktopHostEventCapability,
  hasDesktopHostEventListenerCapability,
  hasDesktopHostInvokeCapability,
  hasDesktopHostRuntimeMarkers,
} from "@/lib/desktop-runtime";
import {
  getElectronHostBridge,
  isElectronDevBridgeFallbackAvailable,
  isElectronHostCommandAvailable,
} from "@/lib/electron-host";

const { invoke: baseInvoke } = desktopHostCore;
const { listen: baseListen, emit: baseEmit } = desktopHostEvent;

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

function canUseExplicitBrowserMockFallback(): boolean {
  return typeof window !== "undefined" && !hasDesktopHostRuntimeMarkers();
}

async function invokeFallbackTransport<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return (await baseInvoke(cmd, args)) as T;
  } catch (error) {
    if (!canUseExplicitBrowserMockFallback()) {
      throw error;
    }
    return invokeExplicitMock<T>(cmd, args);
  }
}

async function invokeBrowserMockFallbackTransport<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (canUseExplicitBrowserMockFallback()) {
    return invokeExplicitMock<T>(cmd, args);
  }
  return invokeFallbackTransport<T>(cmd, args);
}

async function listenFallbackTransport<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  try {
    return createSafeUnlisten(await baseListen(event, handler));
  } catch (error) {
    if (!canUseExplicitBrowserMockFallback()) {
      throw error;
    }
    return createSafeUnlisten(await listenExplicitMock(event, handler));
  }
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

function getLegacyDesktopHostGlobalEventListen():
  | ((event: string, handler: (event: { payload: unknown }) => void) => unknown)
  | null {
  const legacyHostGlobal = getLegacyDesktopHostGlobal() as {
    event?: {
      listen?: unknown;
    };
  } | null;

  return typeof legacyHostGlobal?.event?.listen === "function"
    ? (legacyHostGlobal.event.listen as (
        event: string,
        handler: (event: { payload: unknown }) => void,
      ) => unknown)
    : null;
}

function shouldFailClosedOnMissingNativeEventBridge(event: string): boolean {
  return shouldDisallowMockEventFallbackInBrowser(event);
}

function shouldUseElectronDevBridgeForCommand(command: string): boolean {
  return (
    isElectronDevBridgeFallbackAvailable() &&
    !isElectronHostCommandAvailable(command)
  );
}

function shouldUseElectronDevBridgeForEvent(event: string): boolean {
  return (
    isElectronDevBridgeFallbackAvailable() &&
    shouldDisallowMockEventFallbackInBrowser(event)
  );
}

function electronUnsupportedCommandError(command: string): Error {
  return new Error(
    `[Electron] Desktop Host 尚未支持命令 "${command}"。该命令不能回退到 legacy DevBridge 或 mock；请迁移到 App Server current 主链或补齐 Electron host adapter。`,
  );
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
 * 支持多种模式：Electron IPC -> legacy Desktop Host IPC -> HTTP Bridge -> Mock。
 * 在浏览器开发模式下，模型 / Provider / Agent 运行时等真相命令
 * 若 HTTP Bridge 失败，会直接报错；其余非真相命令才允许回退到 mock。
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
      const result = await electronHost.invoke<T>(cmd, args);
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
  if (electronHost && shouldDisallowMockFallbackInBrowser(cmd)) {
    const error = electronUnsupportedCommandError(cmd);
    recordInvokeError(cmd, args, error, "electron-ipc");
    recordInvokeTrace(cmd, args, "electron-ipc", "error", startedAt, error);
    finishInvokeTiming(timingId, cmd, "electron-ipc", "error");
    throw error;
  }

  const legacyHostGlobal = getLegacyDesktopHostGlobal() as {
    core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  } | null;

  if (typeof legacyHostGlobal?.core?.invoke === "function") {
    try {
      const result = (await legacyHostGlobal.core.invoke(cmd, args)) as T;
      recordInvokeTrace(cmd, args, "legacy-ipc", "success", startedAt);
      finishInvokeTiming(timingId, cmd, "legacy-ipc", "success");
      return result;
    } catch (error) {
      recordInvokeError(cmd, args, error, "legacy-ipc");
      recordInvokeTrace(cmd, args, "legacy-ipc", "error", startedAt, error);
      finishInvokeTiming(timingId, cmd, "legacy-ipc", "error");
      throw error;
    }
  }

  if (typeof legacyHostGlobal?.invoke === "function") {
    try {
      const result = (await legacyHostGlobal.invoke(cmd, args)) as T;
      recordInvokeTrace(cmd, args, "legacy-ipc", "success", startedAt);
      finishInvokeTiming(timingId, cmd, "legacy-ipc", "success");
      return result;
    } catch (error) {
      recordInvokeError(cmd, args, error, "legacy-ipc");
      recordInvokeTrace(cmd, args, "legacy-ipc", "error", startedAt, error);
      finishInvokeTiming(timingId, cmd, "legacy-ipc", "error");
      throw error;
    }
  }

  // legacy Desktop Host IPC 尚未就绪时不再轮询等待，直接 fall through 到后续通道。
  if (hasDesktopHostInvokeCapability()) {
    try {
      const result = (await baseInvoke(cmd, args)) as T;
      recordInvokeTrace(cmd, args, "legacy-ipc", "success", startedAt);
      finishInvokeTiming(timingId, cmd, "legacy-ipc", "success");
      return result;
    } catch (error) {
      recordInvokeError(cmd, args, error, "legacy-ipc");
      recordInvokeTrace(cmd, args, "legacy-ipc", "error", startedAt, error);
      finishInvokeTiming(timingId, cmd, "legacy-ipc", "error");
      throw error;
    }
  }

  // 2. 浏览器开发模式下，部分原生/非关键命令直接优先走 mock。
  if (isDevBridgeAvailable() && shouldPreferMockInBrowser(cmd)) {
    try {
      const result = await invokeFallbackTransport<T>(cmd, args);
      recordInvokeTrace(cmd, args, "fallback-invoke", "success", startedAt);
      finishInvokeTiming(timingId, cmd, "fallback-invoke", "success");
      return result;
    } catch (error) {
      recordInvokeError(cmd, args, error, "fallback-invoke");
      recordInvokeTrace(
        cmd,
        args,
        "fallback-invoke",
        "error",
        startedAt,
        error,
      );
      finishInvokeTiming(timingId, cmd, "fallback-invoke", "error");
      throw error;
    }
  }

  // 3. Dev 模式下尝试 HTTP 桥接。
  if (isDevBridgeAvailable() || shouldUseElectronDevBridgeForCommand(cmd)) {
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

      if (shouldDisallowMockFallbackInBrowser(cmd)) {
        finishInvokeTiming(timingId, cmd, "http-bridge", "error");
        throw normalizedError;
      }

      try {
        const result = await invokeBrowserMockFallbackTransport<T>(cmd, args);
        recordInvokeTrace(cmd, args, "fallback-invoke", "success", startedAt);
        finishInvokeTiming(timingId, cmd, "fallback-invoke", "success");
        return result;
      } catch (fallbackError) {
        recordInvokeError(cmd, args, fallbackError, "fallback-invoke");
        recordInvokeTrace(
          cmd,
          args,
          "fallback-invoke",
          "error",
          startedAt,
          fallbackError,
        );
        finishInvokeTiming(timingId, cmd, "fallback-invoke", "error");
        throw normalizedError;
      }
    }
  }

  // 4. Fallback 到 desktop-host mock。
  try {
    const result = await invokeFallbackTransport<T>(cmd, args);
    recordInvokeTrace(cmd, args, "fallback-invoke", "success", startedAt);
    finishInvokeTiming(timingId, cmd, "fallback-invoke", "success");
    return result;
  } catch (error) {
    recordInvokeError(cmd, args, error, "fallback-invoke");
    recordInvokeTrace(cmd, args, "fallback-invoke", "error", startedAt, error);
    finishInvokeTiming(timingId, cmd, "fallback-invoke", "error");
    throw error;
  }
}

/**
 * 安全的 Desktop Host listen 封装
 * 优先使用真实的 Desktop Host event API
 */
export async function safeListen<T = any>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  const legacyHostGlobalListen = getLegacyDesktopHostGlobalEventListen();
  if (legacyHostGlobalListen) {
    try {
      const unlisten = await legacyHostGlobalListen(event, handler as never);
      return createSafeUnlisten(
        typeof unlisten === "function" ? (unlisten as UnlistenFn) : () => {},
      );
    } catch (error) {
      if (shouldFailClosedOnMissingNativeEventBridge(event)) {
        throw normalizeDesktopHostListenError(event, error);
      }
      console.warn(
        `[safeListen] Desktop Host 全局事件桥调用失败，跳过监听: ${event}`,
        error,
      );
      return () => {};
    }
  }

  // 同步检查即可，不轮询等待，避免首屏并发监听全部阻塞
  if (hasDesktopHostEventListenerCapability()) {
    try {
      return createSafeUnlisten(await baseListen(event, handler));
    } catch (error) {
      if (hasDesktopHostRuntimeMarkers()) {
        if (shouldFailClosedOnMissingNativeEventBridge(event)) {
          throw normalizeDesktopHostListenError(event, error);
        }
        console.warn(
          `[safeListen] Desktop Host 事件桥调用失败，跳过监听: ${event}`,
          error,
        );
        return () => {};
      }
      throw error;
    }
  }

  const electronHost = getElectronHostBridge();
  if (electronHost && shouldUseElectronDevBridgeForEvent(event)) {
    try {
      return createSafeUnlisten(await listenViaHttpEvent(event, handler));
    } catch (error) {
      throw normalizeDevBridgeListenError(event, error);
    }
  }

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
      if (!hasDesktopHostRuntimeMarkers()) {
        if (shouldDisallowMockEventFallbackInBrowser(event)) {
          throw normalizeDevBridgeListenError(event, error);
        }
        return createSafeUnlisten(await listenExplicitMock(event, handler));
      }
      console.warn(
        `[safeListen] DevBridge 事件流调用失败，跳过监听: ${event}`,
        error,
      );
      return () => {};
    }
  }

  if (hasDesktopHostRuntimeMarkers()) {
    if (shouldFailClosedOnMissingNativeEventBridge(event)) {
      throw normalizeDesktopHostListenError(event, new Error("Desktop Host 事件桥未就绪"));
    }
    console.warn(`[safeListen] Desktop Host 事件桥未就绪，跳过监听: ${event}`);
    return () => {};
  }

  return listenFallbackTransport(event, handler);
}

export function hasNativeDesktopHostEventSupport(): boolean {
  return hasDesktopHostEventListenerCapability();
}

/**
 * 安全的 Desktop Host emit 封装
 * 优先使用真实的 Desktop Host event API
 */
export async function safeEmit(
  event: string,
  payload?: unknown,
): Promise<void> {
  const legacyHostGlobal = getLegacyDesktopHostGlobal() as {
    event?: {
      emit?: (event: string, payload?: unknown) => Promise<void>;
    };
  } | null;

  if (typeof legacyHostGlobal?.event?.emit === "function") {
    return legacyHostGlobal.event.emit(event, payload);
  }

  // 同步检查，不轮询
  if (hasDesktopHostEventCapability()) {
    return baseEmit(event, payload);
  }

  const electronHost = getElectronHostBridge();
  if (electronHost) {
    return electronHost.emit(event, payload);
  }

  if (hasDesktopHostRuntimeMarkers()) {
    console.warn(`[safeEmit] Desktop Host 事件桥未就绪，跳过发送: ${event}`);
    return;
  }

  return baseEmit(event, payload);
}
