import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsTabs } from "@/types/settings";

const { mockUseTranslation } = vi.hoisted(() => {
  const translations: Record<string, string> = {
    "settings.layout.sidebar.experimentalBadge": "Labs badge from i18n",
    "settings.layout.sidebar.floatingNav.fallbackLabel":
      "Settings nav from i18n",
    "settings.layout.sidebar.floatingNav.openAria":
      "Open settings navigation from i18n",
  };

  return {
    mockUseTranslation: vi.fn((_namespace?: string) => ({
      t: (key: string, options?: unknown) => {
        if (typeof options === "string") {
          return translations[key] ?? options;
        }

        if (options && typeof options === "object") {
          const values = options as Record<string, unknown>;
          const template =
            translations[key] ??
            (typeof values.defaultValue === "string"
              ? values.defaultValue
              : key);
          return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
            String(values[name] ?? ""),
          );
        }

        return translations[key] ?? key;
      },
    })),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: mockUseTranslation,
}));

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

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
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

describe("SettingsSidebar", () => {
  it("应通过 settings namespace 渲染实验 badge 与浮动导航 aria", () => {
    const container = renderSidebar();

    expect(mockUseTranslation).toHaveBeenCalledWith("settings");
    expect(container.textContent).toContain("Labs badge from i18n");
    expect(
      container
        .querySelector('[data-testid="settings-floating-nav-button"]')
        ?.getAttribute("aria-label"),
    ).toBe("Open settings navigation from i18n");
  });

  it("无 active item 时应使用 settings namespace 的浮动导航兜底标题", () => {
    const container = renderSidebar("__missing__" as SettingsTabs);

    expect(container.textContent).toContain("Settings nav from i18n");
  });
});
