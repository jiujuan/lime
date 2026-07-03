function isTestMockSdkEnvironment(): boolean {
  return Boolean(
    !import.meta.env?.PROD &&
    (import.meta.env?.MODE === "test" || import.meta.env?.VITEST),
  );
}

export function assertTestMockSdkEnvironment(apiName: string): void {
  if (isTestMockSdkEnvironment()) {
    return;
  }
  throw new Error(
    `[Mock] ${apiName} 只能在测试环境使用；生产路径必须进入 Electron Desktop Host IPC / App Server JSON-RPC。`,
  );
}
