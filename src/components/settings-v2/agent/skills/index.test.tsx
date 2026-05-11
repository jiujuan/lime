import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

vi.mock("@/components/skills/SkillsPage", () => ({
  SkillsPage: ({ hideHeader }: { hideHeader?: boolean }) => (
    <div data-testid="skills-page">
      SkillsPage hideHeader={String(Boolean(hideHeader))}
    </div>
  ),
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
});
