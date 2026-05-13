import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const {
  mockGetVoiceInputConfig,
  mockGetHotkeyRuntimeStatus,
} = vi.hoisted(() => ({
  mockGetVoiceInputConfig: vi.fn(),
  mockGetHotkeyRuntimeStatus: vi.fn(),
}));

vi.mock("@/lib/api/asrProvider", () => ({
  getVoiceInputConfig: mockGetVoiceInputConfig,
}));

vi.mock("@/lib/api/hotkeys", () => ({
  getHotkeyRuntimeStatus: mockGetHotkeyRuntimeStatus,
}));

import { HotkeysSettings } from ".";

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
    root.render(<HotkeysSettings />);
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
  await flushEffects();
}

function getText(container: HTMLElement): string {
  return (container.textContent ?? "").replace(/\s+/g, " ").trim();
}

function getBodyText() {
  return document.body.textContent ?? "";
}

async function hoverTip(ariaLabel: string) {
  const trigger = document.body.querySelector(
    `button[aria-label='${ariaLabel}']`,
  );
  expect(trigger).toBeInstanceOf(HTMLButtonElement);

  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await flushEffects();
  });

  return trigger as HTMLButtonElement;
}

async function leaveTip(trigger: HTMLButtonElement | null) {
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await flushEffects();
  });
}

function findButtonByText(
  container: HTMLElement,
  text: string,
): HTMLButtonElement {
  const element = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(text),
  );
  if (!element) {
    throw new Error(`未找到按钮文本: ${text}`);
  }
  return element as HTMLButtonElement;
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

  await changeLimeLocale("en-US");
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: "MacIntel",
  });
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
  });

  vi.clearAllMocks();

  mockGetVoiceInputConfig.mockResolvedValue({
    enabled: true,
    shortcut: "CommandOrControl+Shift+V",
    processor: {
      polish_enabled: true,
      default_instruction_id: "default",
    },
    output: {
      mode: "type",
      type_delay_ms: 0,
    },
    instructions: [],
    sound_enabled: true,
    translate_instruction_id: "",
  });

  mockGetHotkeyRuntimeStatus.mockResolvedValue({
    voice: {
      shortcut_registered: true,
      registered_shortcut: "CommandOrControl+Shift+V",
      fn_supported: false,
      fn_registered: false,
      fn_fallback_shortcut: "CommandOrControl+Shift+V",
      fn_note: "Fn 按住录音当前仅支持 macOS；已使用普通语音快捷键回退。",
    },
  });
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

describe("HotkeysSettings", () => {
  it("应渲染简化后的已审计快捷键布局与分区", async () => {
    const container = renderComponent();
    await waitForLoad();

    const text = getText(container);
    expect(text).toContain("Hotkeys");
    expect(text).toContain("Review implemented and audited hotkeys.");
    expect(text).toContain("Global running 1 / 1");
    expect(text).toContain("Runtime status connected");
    expect(text).toContain("6 audited");
    expect(text).not.toContain("终端页面");
    expect(text).toContain("1 total");
    expect(text).toContain("Document Canvas");
    expect(text).not.toContain("settings.hotkeys");
    expect(text).not.toContain("Screenshot Chat");
    expect(text).not.toContain("Voice Translation Mode");
  });

  it("运行时状态读取失败时应回退到配置判断", async () => {
    mockGetHotkeyRuntimeStatus.mockRejectedValueOnce(new Error("bridge down"));

    const container = renderComponent();
    await waitForLoad();

    const text = getText(container);
    expect(text).toContain("Runtime status unreadable; using config fallback");
    expect(text).toContain("Global running 1 / 1");
  });

  it("加载失败后应支持重试", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockGetVoiceInputConfig
      .mockRejectedValueOnce(new Error("网络异常"))
      .mockResolvedValue({
        enabled: true,
        shortcut: "CommandOrControl+Shift+V",
        processor: {
          polish_enabled: true,
          default_instruction_id: "default",
        },
        output: {
          mode: "type",
          type_delay_ms: 0,
        },
        instructions: [],
        sound_enabled: true,
        translate_instruction_id: "",
      });

    try {
      const container = renderComponent();
      await waitForLoad();

      expect(getText(container)).toContain("Failed to load hotkeys: 网络异常");

      await clickButton(findButtonByText(container, "Retry"));
      await waitForLoad();

      expect(mockGetVoiceInputConfig).toHaveBeenCalledTimes(2);
      expect(getText(container)).toContain("Hotkeys");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("应展示语音快捷键未注册状态", async () => {
    mockGetVoiceInputConfig.mockResolvedValue({
      enabled: true,
      shortcut: "CommandOrControl+Shift+V",
      processor: {
        polish_enabled: true,
        default_instruction_id: "default",
      },
      output: {
        mode: "type",
        type_delay_ms: 0,
      },
      instructions: [],
      sound_enabled: true,
      translate_instruction_id: "",
    });
    mockGetHotkeyRuntimeStatus.mockResolvedValue({
      voice: {
        shortcut_registered: false,
        registered_shortcut: null,
        fn_supported: false,
        fn_registered: false,
        fn_fallback_shortcut: "CommandOrControl+Shift+V",
        fn_note: "Fn 按住录音当前仅支持 macOS；已使用普通语音快捷键回退。",
      },
    });

    const container = renderComponent();
    await waitForLoad();

    const text = getText(container);
    expect(text).toContain("Not registered");
    expect(text).not.toContain("__lime_unset_shortcut__");
  });

  it("应把首屏和统计说明收进 tips", async () => {
    renderComponent();
    await waitForLoad();

    expect(getBodyText()).not.toContain(
      "Showing implemented hotkeys for macOS. Global items read runtime registration status",
    );

    const heroTip = await hoverTip("Audited hotkeys info");
    expect(getBodyText()).toContain(
      "Showing implemented hotkeys for macOS. Global items read runtime registration status",
    );
    await leaveTip(heroTip);

    const statTip = await hoverTip("Audit info");
    expect(getBodyText()).toContain(
      "This page only lists hotkeys that are implemented and verified.",
    );
    await leaveTip(statTip);
  });
});
