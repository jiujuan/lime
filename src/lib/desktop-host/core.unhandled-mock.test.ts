import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeViaHttp: vi.fn(),
  isDevBridgeAvailable: vi.fn(),
  normalizeDevBridgeError: vi.fn((cmd: string, error: unknown) => {
    if (error instanceof Error) {
      return new Error(`[${cmd}] ${error.message}`);
    }
    return new Error(`[${cmd}] ${String(error)}`);
  }),
}));

vi.mock("../dev-bridge/http-client", () => ({
  invokeViaHttp: mocks.invokeViaHttp,
  isDevBridgeAvailable: mocks.isDevBridgeAvailable,
  normalizeDevBridgeError: mocks.normalizeDevBridgeError,
}));

import { clearMocks, invokeMockOnly, mockCommand } from "./core";

describe("desktop-host/core 未注册 mock command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMocks();
  });

  it("显式 mock 入口遇到未注册命令时 fail closed", async () => {
    await expect(invokeMockOnly("legacy_command_removed")).rejects.toThrow(
      '未注册命令 "legacy_command_removed"',
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("测试显式注册的 mock command 仍可使用", async () => {
    mockCommand("test_only_current_fixture", () => ({ ok: true }));

    await expect(invokeMockOnly("test_only_current_fixture")).resolves.toEqual({
      ok: true,
    });
  });
});
