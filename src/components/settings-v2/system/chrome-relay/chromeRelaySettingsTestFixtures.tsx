import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChromeRelaySettings } from ".";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

export const mockBrowserActionCapabilities = [
  {
    key: "read_page",
    label: "页面快照",
    description: "抓取当前页面快照。",
    group: "read",
    enabled: true,
  },
  {
    key: "find",
    label: "页面内查找",
    description: "在当前页面中查找文本。",
    group: "read",
    enabled: true,
  },
  {
    key: "navigate",
    label: "导航",
    description: "导航到目标地址。",
    group: "write",
    enabled: true,
  },
  {
    key: "click",
    label: "点击元素",
    description: "点击页面元素。",
    group: "write",
    enabled: true,
  },
] as const;

export function cloneBrowserActionCapabilities() {
  return mockBrowserActionCapabilities.map((capability) => ({
    ...capability,
  }));
}

export function renderComponent() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ChromeRelaySettings />);
  });
  mounted.push({ container, root });
  return container;
}

export function cleanupMountedChromeRelaySettings() {
  while (mounted.length > 0) {
    const target = mounted.pop();
    if (!target) break;
    act(() => {
      target.root.unmount();
    });
    target.container.remove();
  }
}

export async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

export function getBodyText() {
  return document.body.textContent ?? "";
}

export function findButton(
  container: HTMLElement,
  text: string,
): HTMLButtonElement {
  const target = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(text),
  );
  if (!target) {
    throw new Error(`未找到按钮: ${text}`);
  }
  return target as HTMLButtonElement;
}

export function findTabButton(
  container: HTMLElement,
  text: string,
): HTMLButtonElement {
  const target = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim().startsWith(text),
  );
  if (!target) {
    throw new Error(`未找到页签按钮: ${text}`);
  }
  return target as HTMLButtonElement;
}

export async function openAdvancedTab(container: HTMLElement) {
  const tabButton = findButton(container, "Open Advanced Tools");
  await act(async () => {
    tabButton.click();
    await flushEffects();
  });
}
