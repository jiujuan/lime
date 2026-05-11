import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { SettingsTabs } from "@/types/settings";

import { SettingsSidebar } from "./SettingsSidebar";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderSidebar(activeTab: SettingsTabs = SettingsTabs.Developer) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SettingsSidebar
        activeTab={activeTab}
        onTabChange={vi.fn()}
        onTabPrefetch={vi.fn()}
      />,
    );
  });

  mounted.push({ container, root });
  return container;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("en-US");
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

describe("SettingsSidebar", () => {
  it("应通过 settings namespace 渲染实验 badge 与浮动导航 aria", () => {
    const container = renderSidebar();

    expect(container.textContent).toContain("Labs");
    expect(
      container
        .querySelector('[data-testid="settings-floating-nav-button"]')
        ?.getAttribute("aria-label"),
    ).toBe("Open settings navigation");
    expect(container.textContent).not.toContain("settings.layout.sidebar");
  });

  it("无 active item 时应使用 settings namespace 的浮动导航兜底标题", () => {
    const container = renderSidebar("__missing__" as SettingsTabs);

    expect(container.textContent).toContain("Settings navigation");
    expect(container.textContent).not.toContain("打开设置导航");
  });
});
