import { afterEach, describe, expect, it, vi } from "vitest";
import { showDesktopNotification } from "@/lib/api/desktopNotification";
import {
  desktopHostClawTraceRegressionAlertNotifier,
  notifyClawTraceRegressionAlert,
} from "./clawTraceRegressionAlertNotifier";

vi.mock("@/lib/api/desktopNotification", () => ({
  showDesktopNotification: vi.fn(),
}));

type MockNotificationConstructor = {
  new (title: string, options?: { body?: string; tag?: string }): unknown;
  calls: Array<{ body?: string; tag?: string; title: string }>;
  permission?: "default" | "denied" | "granted";
};

const originalNotificationDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "Notification",
);

function installNotificationMock(
  permission: MockNotificationConstructor["permission"],
): MockNotificationConstructor {
  const calls: MockNotificationConstructor["calls"] = [];
  const NotificationMock = vi.fn(function (
    this: unknown,
    title: string,
    options?: { body?: string; tag?: string },
  ) {
    calls.push({
      body: options?.body,
      tag: options?.tag,
      title,
    });
    return this;
  }) as unknown as MockNotificationConstructor;
  NotificationMock.calls = calls;
  NotificationMock.permission = permission;
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: NotificationMock,
  });
  return NotificationMock;
}

describe("clawTraceRegressionAlertNotifier", () => {
  afterEach(() => {
    if (originalNotificationDescriptor) {
      Object.defineProperty(
        globalThis,
        "Notification",
        originalNotificationDescriptor,
      );
    } else {
      Reflect.deleteProperty(globalThis, "Notification");
    }
    vi.mocked(showDesktopNotification).mockReset();
    vi.restoreAllMocks();
  });

  it("不支持 Notification 时返回 unsupported", () => {
    Reflect.deleteProperty(globalThis, "Notification");

    expect(
      notifyClawTraceRegressionAlert({
        body: "body",
        tag: "tag",
        title: "title",
      }),
    ).toBe("unsupported");
  });

  it("权限未授予时不自动请求权限", () => {
    const NotificationMock = installNotificationMock("default");

    expect(
      notifyClawTraceRegressionAlert({
        body: "body",
        tag: "tag",
        title: "title",
      }),
    ).toBe("permission_not_requested");
    expect(NotificationMock.calls).toEqual([]);
  });

  it("权限拒绝时不发送通知", () => {
    const NotificationMock = installNotificationMock("denied");

    expect(
      notifyClawTraceRegressionAlert({
        body: "body",
        tag: "tag",
        title: "title",
      }),
    ).toBe("permission_denied");
    expect(NotificationMock.calls).toEqual([]);
  });

  it("权限已授予时发送 summary-only 通知标题与正文", () => {
    const NotificationMock = installNotificationMock("granted");

    expect(
      notifyClawTraceRegressionAlert({
        body: "Lime local output · +520 ms",
        tag: "record-1",
        title: "Regression alert: Critical",
      }),
    ).toBe("sent");
    expect(NotificationMock.calls).toEqual([
      {
        body: "Lime local output · +520 ms",
        tag: "record-1",
        title: "Regression alert: Critical",
      },
    ]);
  });

  it("Notification 构造失败时返回 failed", () => {
    const NotificationMock = vi.fn(() => {
      throw new Error("blocked");
    }) as unknown as MockNotificationConstructor;
    NotificationMock.calls = [];
    NotificationMock.permission = "granted";
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: NotificationMock,
    });

    expect(
      notifyClawTraceRegressionAlert({
        body: "body",
        tag: "tag",
        title: "title",
      }),
    ).toBe("failed");
  });

  it("桌面 Host adapter 通过 Electron Host API 发送 summary-only 通知", async () => {
    vi.mocked(showDesktopNotification).mockResolvedValueOnce({
      status: "sent",
    });

    await expect(
      desktopHostClawTraceRegressionAlertNotifier.notify({
        body: "Lime local output · +520 ms",
        tag: "claw-trace-regression-alert-123",
        title: "Regression alert: Critical",
      }),
    ).resolves.toBe("sent");

    expect(showDesktopNotification).toHaveBeenCalledWith({
      body: "Lime local output · +520 ms",
      silent: false,
      tag: "claw-trace-regression-alert-123",
      title: "Regression alert: Critical",
    });
  });

  it("桌面 Host adapter 透传 unsupported 并把异常归一为 failed", async () => {
    vi.mocked(showDesktopNotification)
      .mockResolvedValueOnce({
        reason: "electron_notification_unsupported",
        status: "unsupported",
      })
      .mockRejectedValueOnce(new Error("bridge unavailable"));

    await expect(
      desktopHostClawTraceRegressionAlertNotifier.notify({
        body: "body",
        tag: "tag",
        title: "title",
      }),
    ).resolves.toBe("unsupported");
    await expect(
      desktopHostClawTraceRegressionAlertNotifier.notify({
        body: "body",
        tag: "tag",
        title: "title",
      }),
    ).resolves.toBe("failed");
  });
});
