import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

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
    expect(text).toContain("5 audited");
    expect(text).not.toContain("终端页面");
    expect(text).toContain("1 total");
    expect(text).toContain("Document Canvas");
    expect(text).not.toContain("Voice Input");
    expect(text).not.toContain("Global running");
    expect(text).not.toContain("Runtime status");
    expect(text).not.toContain("settings.hotkeys");
    expect(text).not.toContain("Screenshot Chat");
    expect(text).not.toContain("Voice Translation Mode");
  });

  it("应把首屏和统计说明收进 tips", async () => {
    renderComponent();
    await waitForLoad();

    expect(getBodyText()).not.toContain(
      "Showing implemented hotkeys for macOS. Entries come directly from each module",
    );

    const heroTip = await hoverTip("Audited hotkeys info");
    expect(getBodyText()).toContain(
      "Showing implemented hotkeys for macOS. Entries come directly from each module",
    );
    await leaveTip(heroTip);

    const statTip = await hoverTip("Audit info");
    expect(getBodyText()).toContain(
      "This page only lists hotkeys that are implemented and verified.",
    );
    await leaveTip(statTip);
  });
});
