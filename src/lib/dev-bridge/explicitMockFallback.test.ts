import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeMockOnly: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("../desktop-host/core", () => ({
  invokeMockOnly: mocks.invokeMockOnly,
}));

vi.mock("../desktop-host/event", () => ({
  listen: mocks.listen,
}));

import { invokeExplicitMock, listenExplicitMock } from "./explicitMockFallback";

describe("explicitMockFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("测试环境允许显式委托 mock fixture", async () => {
    const unlisten = vi.fn();
    const handler = vi.fn();
    mocks.invokeMockOnly.mockResolvedValueOnce({ ok: true });
    mocks.listen.mockResolvedValueOnce(unlisten);

    await expect(invokeExplicitMock("workspace_list")).resolves.toEqual({
      ok: true,
    });
    await expect(
      listenExplicitMock("workspace://ready", handler),
    ).resolves.toBe(unlisten);

    expect(mocks.invokeMockOnly).toHaveBeenCalledWith(
      "workspace_list",
      undefined,
    );
    expect(mocks.listen).toHaveBeenCalledWith("workspace://ready", handler);
  });

  it("生产环境禁止显式 renderer mock fallback", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITEST", "");

    try {
      await expect(invokeExplicitMock("workspace_list")).rejects.toThrow(
        "invokeExplicitMock 只能在测试环境使用",
      );
      await expect(
        listenExplicitMock("workspace://ready", vi.fn()),
      ).rejects.toThrow("listenExplicitMock 只能在测试环境使用");
      expect(mocks.invokeMockOnly).not.toHaveBeenCalled();
      expect(mocks.listen).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
