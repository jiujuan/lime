import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const {
  mockGetUpdateCheckSettings,
  mockGetUpdateNotificationMetrics,
  mockSetUpdateCheckSettings,
  mockTestUpdateWindow,
} = vi.hoisted(() => ({
  mockGetUpdateCheckSettings: vi.fn(),
  mockGetUpdateNotificationMetrics: vi.fn(),
  mockSetUpdateCheckSettings: vi.fn(),
  mockTestUpdateWindow: vi.fn(),
}));

vi.mock("@/lib/api/appUpdate", () => ({
  getUpdateCheckSettings: mockGetUpdateCheckSettings,
  getUpdateNotificationMetrics: mockGetUpdateNotificationMetrics,
  setUpdateCheckSettings: mockSetUpdateCheckSettings,
  testUpdateWindow: mockTestUpdateWindow,
}));

import { UpdateCheckSettings } from "./UpdateCheckSettings";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderComponent(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<UpdateCheckSettings />);
  });

  mounted.push({ container, root });
  return container;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitForLoad() {
  await flushEffects();
  await flushEffects();
}

function getText(container: HTMLElement) {
  return (container.textContent ?? "").replace(/\s+/g, " ").trim();
}

function findButtonByLabel(
  container: HTMLElement,
  label: string,
): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) {
    throw new Error(`未找到按钮: ${label}`);
  }
  return button;
}

function findButtonByText(
  container: HTMLElement,
  text: string,
): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`未找到按钮文本: ${text}`);
  }
  return button as HTMLButtonElement;
}

async function clickButton(button: HTMLButtonElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushEffects();
  });
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  await changeLimeLocale("en-US");

  mockGetUpdateCheckSettings.mockResolvedValue({
    check_interval_hours: 168,
    enabled: true,
    last_check_timestamp: 1760000000,
    remind_later_until: 1893456000,
    show_notification: true,
    skipped_version: "1.2.3",
  });
  mockGetUpdateNotificationMetrics.mockResolvedValue({
    dismiss_count: 4,
    dismiss_rate: 20,
    remind_later_count: 2,
    remind_later_rate: 10,
    shown_count: 20,
    skip_version_count: 1,
    skip_version_rate: 5,
    update_now_count: 3,
    update_now_rate: 15,
  });
  mockSetUpdateCheckSettings.mockResolvedValue(undefined);
  mockTestUpdateWindow.mockResolvedValue(undefined);
});

afterEach(async () => {
  while (mounted.length > 0) {
    const target = mounted.pop();
    if (!target) {
      break;
    }

    act(() => {
      target.root.unmount();
    });
    target.container.remove();
  }

  vi.clearAllMocks();
  await changeLimeLocale("zh-CN");
});

describe("UpdateCheckSettings", () => {
  it("应从 settings namespace 渲染自动更新检查与指标文案", async () => {
    const container = renderComponent();
    await waitForLoad();

    const text = getText(container);
    expect(text).toContain("Automatic Update Check");
    expect(text).toContain("Automatic update checks");
    expect(text).toContain("Weekly");
    expect(text).toContain("Skipped version");
    expect(text).toContain("Reminder conversion metrics");
    expect(text).toContain("Shown 20 times; update now 3 times (15%)");
    expect(text).toContain("Last check:");
    expect(text).toContain("Remind later until:");
    expect(text).not.toContain("settings.experimental.updateCheck");
    expect(text).not.toContain("自动更新检查");
  });

  it("关闭自动检查时应保存完整更新配置", async () => {
    const container = renderComponent();
    await waitForLoad();

    await clickButton(
      findButtonByLabel(container, "Toggle automatic update checks"),
    );

    expect(mockSetUpdateCheckSettings).toHaveBeenCalledWith({
      check_interval_hours: 168,
      enabled: false,
      last_check_timestamp: 1760000000,
      remind_later_until: 1893456000,
      show_notification: true,
      skipped_version: "1.2.3",
    });
  });

  it("开发环境测试按钮应调用更新弹窗测试入口", async () => {
    const container = renderComponent();
    await waitForLoad();

    await clickButton(findButtonByText(container, "Test update prompt"));

    expect(mockTestUpdateWindow).toHaveBeenCalledTimes(1);
  });
});
