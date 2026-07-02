import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockHasDesktopHostInvokeCapability, mockOpenResourceManagerWindow } =
  vi.hoisted(() => {
    return {
      mockHasDesktopHostInvokeCapability: vi.fn(),
      mockOpenResourceManagerWindow: vi.fn(),
    };
  });

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostInvokeCapability: mockHasDesktopHostInvokeCapability,
}));

vi.mock("@/lib/api/resourceManagerWindow", () => ({
  openResourceManagerWindow: mockOpenResourceManagerWindow,
}));

vi.mock("@/lib/api/fileSystem", () => ({
  convertLocalFileSrc: (path: string) => `asset://${path}`,
}));

import { openResourceManager } from "./openResourceManager";
import {
  RESOURCE_MANAGER_ACTIVE_SESSION_KEY,
  readResourceManagerSession,
} from "./resourceManagerSession";

describe("openResourceManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockHasDesktopHostInvokeCapability.mockReturnValue(false);
    mockOpenResourceManagerWindow.mockResolvedValue(true);
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("Web 环境应写入会话并用浏览器窗口打开", async () => {
    const sessionId = await openResourceManager({
      items: [{ src: "https://example.com/a.pdf" }],
      sourceLabel: "项目资料",
      sourceContext: {
        kind: "project_resource",
        projectId: "project-1",
        contentId: "content-1",
      },
    });

    expect(sessionId).toBeTruthy();
    expect(localStorage.getItem(RESOURCE_MANAGER_ACTIVE_SESSION_KEY)).toBe(
      sessionId,
    );
    expect(readResourceManagerSession(sessionId)).toEqual(
      expect.objectContaining({
        sourceLabel: "项目资料",
        sourceContext: expect.objectContaining({
          kind: "project_resource",
          projectId: "project-1",
          contentId: "content-1",
        }),
      }),
    );
    expect(window.open).toHaveBeenCalledWith(
      `/resource-manager?session=${encodeURIComponent(sessionId!)}`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("Desktop Host 环境应创建独立 resource-manager 窗口", async () => {
    mockHasDesktopHostInvokeCapability.mockReturnValue(true);

    const sessionId = await openResourceManager({
      items: [{ src: "https://example.com/a.png", kind: "image" }],
    });

    expect(mockOpenResourceManagerWindow).toHaveBeenCalledWith({
      sessionId,
    });
    expect(window.open).not.toHaveBeenCalled();
  });

  it("Desktop Host 重复打开时仍委托 current Host 命令切换 session", async () => {
    mockHasDesktopHostInvokeCapability.mockReturnValue(true);

    const sessionId = await openResourceManager({
      items: [{ src: "https://example.com/a.png", kind: "image" }],
    });

    expect(mockOpenResourceManagerWindow).toHaveBeenCalledTimes(1);
    expect(mockOpenResourceManagerWindow).toHaveBeenCalledWith({
      sessionId,
    });
  });

  it("Desktop Host 独立窗口失败时应抛错且不回退 window.open", async () => {
    mockHasDesktopHostInvokeCapability.mockReturnValue(true);
    mockOpenResourceManagerWindow.mockRejectedValueOnce(
      new Error("window bridge unavailable"),
    );

    await expect(
      openResourceManager({
        items: [{ src: "https://example.com/a.png", kind: "image" }],
      }),
    ).rejects.toThrow(
      "Desktop Host 独立资源管理器窗口打开失败：window bridge unavailable",
    );

    expect(window.open).not.toHaveBeenCalled();
  });
});
