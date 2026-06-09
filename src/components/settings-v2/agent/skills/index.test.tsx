import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const { mockOpenExternalUrlWithSystemBrowser } = vi.hoisted(() => ({
  mockOpenExternalUrlWithSystemBrowser: vi.fn(),
}));

vi.mock("@/components/skills/SkillsPage", () => ({
  SkillsPage: ({ hideHeader }: { hideHeader?: boolean }) => (
    <div data-testid="skills-page">
      SkillsPage hideHeader={String(Boolean(hideHeader))}
    </div>
  ),
}));
vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: mockOpenExternalUrlWithSystemBrowser,
}));

import { ExtensionsSettings } from ".";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderComponent() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ExtensionsSettings />);
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

  vi.clearAllMocks();
  await changeLimeLocale("en-US");
  mockOpenExternalUrlWithSystemBrowser.mockResolvedValue(undefined);
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

  await changeLimeLocale("zh-CN");
});

describe("ExtensionsSettings", () => {
  it("应通过 settings namespace 渲染英文高级技能入口文案", () => {
    const container = renderComponent();
    const text = container.textContent ?? "";

    expect(text).toContain("Advanced Skill Entry");
    expect(text).toContain("Issue Feedback");
    expect(text).not.toContain("高级技能入口");
    expect(
      container.querySelector("[data-testid='skills-page']")?.textContent,
    ).toContain("hideHeader=true");

    const helpTrigger = container.querySelector(
      "button[aria-label='Advanced skill entry help']",
    );
    expect(helpTrigger).toBeInstanceOf(HTMLButtonElement);
    expect(text).not.toContain("settings.agent.skills.advancedEntry");
  });

  it("反馈链接应走 Desktop Host 外链网关", async () => {
    const container = renderComponent();
    const link = Array.from(container.querySelectorAll("a")).find((anchor) =>
      anchor.textContent?.includes("Issue Feedback"),
    );

    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect(link?.getAttribute("href")).toBe(
      "https://github.com/aiclientproxy/lime/issues",
    );
    expect(link?.getAttribute("target")).toBeNull();
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      link?.dispatchEvent(clickEvent);
      await Promise.resolve();
    });

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(mockOpenExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://github.com/aiclientproxy/lime/issues",
    );
  });
});
