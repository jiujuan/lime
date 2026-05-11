import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const { mockUseTranslation } = vi.hoisted(() => {
  const translations = {
    "settings.experimental.updateCheck.action.testWindow":
      "Test update prompt from i18n",
    "settings.experimental.updateCheck.autoCheck.aria":
      "Toggle auto check from i18n",
    "settings.experimental.updateCheck.autoCheck.title":
      "Automatic check title from i18n",
    "settings.experimental.updateCheck.interval.weekly": "Weekly from i18n",
    "settings.experimental.updateCheck.metrics.title":
      "Metrics title from i18n",
    "settings.experimental.updateCheck.metrics.updateNow":
      "Shown {{shown}} times and update now {{updateNow}} times from i18n",
    "settings.experimental.updateCheck.skippedVersion.title":
      "Skipped version from i18n",
    "settings.experimental.updateCheck.title": "Auto update checks from i18n",
  } as Record<string, string>;

  const mockTranslate = vi.fn((key: string, options?: unknown) => {
    if (typeof options === "string") {
      return translations[key] ?? options;
    }

    const template =
      translations[key] ??
      (options && typeof options === "object"
        ? (options as Record<string, unknown>).defaultValue
        : undefined) ??
      key;

    return String(template).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(
        options && typeof options === "object"
          ? ((options as Record<string, unknown>)[name] ?? "")
          : "",
      ),
    );
  });

  return {
    mockUseTranslation: vi.fn((_namespace?: string) => ({
      i18n: { language: "en-US" },
      t: mockTranslate,
    })),
  };
});

vi.mock("@/lib/api/appUpdate", () => ({
  getUpdateCheckSettings: mockGetUpdateCheckSettings,
  getUpdateNotificationMetrics: mockGetUpdateNotificationMetrics,
  setUpdateCheckSettings: mockSetUpdateCheckSettings,
  testUpdateWindow: mockTestUpdateWindow,
}));

vi.mock("react-i18next", () => ({
  useTranslation: mockUseTranslation,
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
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.includes(text),
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

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();

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

afterEach(() => {
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
});

describe("UpdateCheckSettings", () => {
  it("应从 settings namespace 渲染自动更新检查与指标文案", async () => {
    const container = renderComponent();
    await waitForLoad();

    const text = getText(container);
    expect(mockUseTranslation).toHaveBeenCalledWith("settings");
    expect(text).toContain("Auto update checks from i18n");
    expect(text).toContain("Automatic check title from i18n");
    expect(text).toContain("Weekly from i18n");
    expect(text).toContain("Skipped version from i18n");
    expect(text).toContain("Metrics title from i18n");
    expect(text).toContain(
      "Shown 20 times and update now 3 times from i18n",
    );
  });

  it("关闭自动检查时应保存完整更新配置", async () => {
    const container = renderComponent();
    await waitForLoad();

    await clickButton(findButtonByLabel(container, "Toggle auto check from i18n"));

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

    await clickButton(findButtonByText(container, "Test update prompt from i18n"));

    expect(mockTestUpdateWindow).toHaveBeenCalledTimes(1);
  });
});
