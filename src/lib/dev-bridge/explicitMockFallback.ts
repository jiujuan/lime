import type { UnlistenFn } from "@/lib/desktop-host/event";

let mockCoreModulePromise: Promise<typeof import("../desktop-host/core")> | null =
  null;
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

export async function invokeExplicitMock<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invokeMockOnly } = await loadMockCoreModule();
  return invokeMockOnly<T>(cmd, args);
}

export async function listenExplicitMock<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  const { listen } = await loadMockEventModule();
  return listen<T>(event, handler);
}
