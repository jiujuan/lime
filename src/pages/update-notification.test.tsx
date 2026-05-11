import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCloseUpdateWindow,
  mockDismissUpdateNotification,
  mockDownloadUpdate,
  mockGetCurrentWindow,
  mockRecordUpdateNotificationAction,
  mockRemindUpdateLater,
  mockShellOpen,
  mockSkipUpdateVersion,
} = vi.hoisted(() => ({
  mockCloseUpdateWindow: vi.fn(async () => undefined),
  mockDismissUpdateNotification: vi.fn(async () => undefined),
  mockDownloadUpdate: vi.fn(async () => undefined),
  mockGetCurrentWindow: vi.fn(() => ({
    close: vi.fn(async () => undefined),
    startDragging: vi.fn(async () => undefined),
  })),
  mockRecordUpdateNotificationAction: vi.fn(async () => undefined),
  mockRemindUpdateLater: vi.fn(async () => undefined),
  mockShellOpen: vi.fn(async () => undefined),
  mockSkipUpdateVersion: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: mockGetCurrentWindow,
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: mockShellOpen,
}));

vi.mock("@/lib/api/appUpdate", () => ({
  closeUpdateWindow: mockCloseUpdateWindow,
  dismissUpdateNotification: mockDismissUpdateNotification,
  downloadUpdate: mockDownloadUpdate,
  recordUpdateNotificationAction: mockRecordUpdateNotificationAction,
  remindUpdateLater: mockRemindUpdateLater,
  skipUpdateVersion: mockSkipUpdateVersion,
}));

import { changeLimeLocale } from "@/i18n/createI18n";
import { UpdateNotificationPage } from "./update-notification";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

async function flushEffects(times = 4) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

async function renderUpdateNotification(path: string) {
  window.history.pushState({}, "", path);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<UpdateNotificationPage />);
  });
  await flushEffects();

  mountedRoots.push({ root, container });
  return container;
}

function getText(container: HTMLElement) {
  return (container.textContent ?? "").replace(/\s+/g, " ").trim();
}

function findButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`未找到按钮文本: ${text}`);
  }
  return button as HTMLButtonElement;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  await changeLimeLocale("en-US");
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }

  window.history.pushState({}, "", "/");
  await changeLimeLocale("zh-CN");
  vi.clearAllMocks();
});

describe("UpdateNotificationPage", () => {
  it("应通过 common namespace 渲染英文更新提醒窗口文案", async () => {
    const container = await renderUpdateNotification(
      "/update-notification?current=1.0.0&latest=1.2.0&download_url=https%3A%2F%2Fexample.com%2Frelease",
    );

    const text = getText(container);
    expect(text).toContain("New version 1.2.0");
    expect(text).toContain("(current 1.0.0)");
    expect(text).toContain("In 1 day");
    expect(text).toContain("In 3 days");
    expect(text).toContain("Next week");
    expect(text).toContain("Update now");
    expect(text).not.toContain("发现新版本");
    expect(
      container.querySelector('button[aria-label="Close reminder"]'),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(
      container.querySelector('button[aria-label="Skip this version"]'),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(
      container.querySelector(
        'button[aria-label="View release page in browser"]',
      ),
    ).toBeInstanceOf(HTMLButtonElement);
  });

  it("立即更新过程中的按钮状态应使用 common namespace 文案", async () => {
    let resolveDownload: (() => void) | undefined;
    mockDownloadUpdate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    const container = await renderUpdateNotification(
      "/update-notification?current=1.0.0&latest=1.2.0",
    );

    await act(async () => {
      findButtonByText(container, "Update now").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRecordUpdateNotificationAction).toHaveBeenCalledWith(
      "update_now",
    );
    expect(mockDownloadUpdate).toHaveBeenCalledTimes(1);
    expect(getText(container)).toContain("Downloading");

    resolveDownload?.();
    await flushEffects();
  });
});
