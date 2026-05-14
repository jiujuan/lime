import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAppLabPage } from "./AgentAppLabPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (typeof params?.count === "number") {
        return `${key}:${params.count}`;
      }
      return key;
    },
  }),
}));

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mountedPages: MountedPage[] = [];

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<AgentAppLabPage />);
  });

  mountedPages.push({ container, root });
  return container;
}

describe("AgentAppLabPage", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    while (mountedPages.length > 0) {
      const mounted = mountedPages.pop();
      if (!mounted) {
        continue;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    vi.unstubAllGlobals();
  });

  it("应展示 fixture entries、blocked readiness 和 cleanup dry-run", () => {
    const container = renderPage();

    expect(container.querySelector('[data-testid="agent-app-lab-page"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="agent-app-entry-card"]')).toHaveLength(3);
    expect(container.querySelector('[data-testid="agent-app-readiness-blocked"]')).not.toBeNull();
    expect(container.textContent).toContain("shenlan-content-engineering");
    expect(container.textContent).toContain("package-fnv1a-");
    expect(container.textContent).toContain("<LimeAppData>/agent-apps/storage/shenlan-content-engineering");
  });
});
