import type { UnlistenFn } from "@/lib/desktop-host/event";

let mockCoreModulePromise: Promise<
  typeof import("../desktop-host/core")
> | null = null;
let mockEventModulePromise: Promise<
  typeof import("../desktop-host/event")
> | null = null;

function loadMockCoreModule() {
  mockCoreModulePromise ??= import("../desktop-host/core");
  return mockCoreModulePromise;
}

function loadMockEventModule() {
  mockEventModulePromise ??= import("../desktop-host/event");
  return mockEventModulePromise;
}

function isTestEnvironment(): boolean {
  return Boolean(import.meta.env?.MODE === "test" || import.meta.env?.VITEST);
}

function assertExplicitMockFallbackTestEnvironment(apiName: string): void {
  if (isTestEnvironment()) {
    return;
  }
  throw new Error(
    `[Mock] ${apiName} 只能在测试环境使用；生产路径必须进入 Electron Desktop Host IPC / App Server JSON-RPC。`,
  );
}

export async function invokeExplicitMock<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  assertExplicitMockFallbackTestEnvironment("invokeExplicitMock");
  const { invokeMockOnly } = await loadMockCoreModule();
  return invokeMockOnly<T>(cmd, args);
}

export async function listenExplicitMock<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  assertExplicitMockFallbackTestEnvironment("listenExplicitMock");
  const { listen } = await loadMockEventModule();
  return listen<T>(event, handler);
}
