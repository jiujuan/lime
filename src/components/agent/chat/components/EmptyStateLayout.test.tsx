import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyStateLayout } from "./EmptyStateLayout";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const heroCopy = {
  eyebrow: "创作",
  slogan: "青柠一下，灵感即来",
  description: "",
  supportingDescription: "",
};

const chromeCopy = {
  starterRowLabel: "起手",
  starterManagerLabel: "管理",
  guideCardsLabel: "引导",
  moreSkillsDrawerLabel: "更多",
  galleryTitle: "更多做法",
  secondScreenLabel: "更多做法",
  projectConversationsMoreLabel: (count: number) => `更多 ${count} 个对话`,
  recentSessionDefaultActionLabel: "继续",
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
});

function renderLayout() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  act(() => {
    root?.render(
      <EmptyStateLayout
        heroCopy={heroCopy}
        chromeCopy={chromeCopy}
        prioritySlot={<div data-testid="priority-slot">输入区</div>}
        isGeneralTheme
        galleryItems={[]}
        onSelectGalleryItem={vi.fn()}
      />,
    );
  });

  return host;
}

describe("EmptyStateLayout", () => {
  it("首屏应整体下移 100px，而不是只移动输入区", () => {
    const container = renderLayout();
    const firstScreen = container.querySelector(
      '[data-testid="empty-state-first-screen"]',
    ) as HTMLElement | null;
    const prioritySlot = container.querySelector(
      '[data-testid="priority-slot"]',
    );

    expect(firstScreen).toBeTruthy();
    expect(firstScreen?.style.getPropertyValue(
      "--empty-state-first-screen-offset-y",
    )).toBe("100px");
    expect(firstScreen?.textContent).toContain("青柠一下，灵感即来");
    expect(firstScreen?.contains(prioritySlot)).toBe(true);
  });
});
