import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseTranslation } = vi.hoisted(() => {
  const translations: Record<string, string> = {
    "workspace.a2uiSubmissionNotice.action.collapse": "Show less",
    "workspace.a2uiSubmissionNotice.action.expand": "Show more",
  };

  return {
    mockUseTranslation: vi.fn(() => ({
      t: (key: string, fallback?: string) =>
        translations[key] ?? fallback ?? key,
    })),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: mockUseTranslation,
}));

import { A2UISubmissionNotice } from "./A2UISubmissionNotice";

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

function renderNotice() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <A2UISubmissionNotice
        notice={{
          title: "Details received",
          summary:
            "The submitted details are intentionally long enough to expose the expand and collapse action.",
        }}
        visible={true}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mockUseTranslation.mockClear();
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("A2UISubmissionNotice", () => {
  it("应使用 workspace namespace 渲染展开与收起动作", () => {
    const container = renderNotice();
    const toggle = container.querySelector("button");

    expect(mockUseTranslation).toHaveBeenCalledWith("workspace");
    expect(toggle).toBeInstanceOf(HTMLButtonElement);
    expect(toggle?.textContent).toContain("Show more");
    expect(toggle?.textContent).not.toContain("展开");

    act(() => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(toggle?.textContent).toContain("Show less");
    expect(toggle?.textContent).not.toContain("收起");
  });
});
