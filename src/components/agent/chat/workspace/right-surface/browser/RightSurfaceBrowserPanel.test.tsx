import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RightSurfaceBrowserPanel } from "./RightSurfaceBrowserPanel";

vi.mock(
  "../../../components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel",
  () => ({
    CanvasWorkbenchBrowserPanel: ({
      initialUrl,
      onNavigate,
    }: {
      initialUrl?: string | null;
      onNavigate?: (url: string, title?: string | null) => void;
    }) => (
      <button
        type="button"
        data-testid="mock-canvas-browser-panel"
        data-initial-url={initialUrl ?? ""}
        onClick={() => onNavigate?.("https://example.com/", "Example")}
      >
        browser panel
      </button>
    ),
  }),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("RightSurfaceBrowserPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("应在右侧 surface 内渲染内嵌浏览器 panel", () => {
    act(() => {
      root.render(
        <RightSurfaceBrowserPanel
          initialUrl="https://example.com"
          controlMode="human_takeover"
          lifecycleState="human_controlling"
          sessionRef={{
            sourceRequestId: "right_surface_browser_1",
            browserSessionId: "browser-session-1",
            profileKey: "general_browser_assist",
            adapterKind: "cdp",
            launchUrl: "https://example.com",
            title: "Example",
          }}
        />,
      );
    });

    const panel = container.querySelector(
      '[data-testid="right-surface-browser-panel"]',
    );
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute("data-browser-session-id")).toBe(
      "browser-session-1",
    );
    expect(panel?.getAttribute("data-browser-control-mode")).toBe(
      "human_takeover",
    );
    expect(panel?.getAttribute("data-browser-control-owner")).toBe("human");
    expect(panel?.getAttribute("data-browser-human-takeover")).toBe("true");
    expect(panel?.getAttribute("data-browser-lifecycle-state")).toBe(
      "human_controlling",
    );
    expect(panel?.getAttribute("data-browser-profile-key")).toBe(
      "general_browser_assist",
    );
    expect(panel?.getAttribute("data-browser-adapter-kind")).toBe("cdp");
    expect(
      container.querySelector('[data-testid="right-surface-browser-panel"]'),
    ).toBeTruthy();
    expect(
      container
        .querySelector('[data-testid="mock-canvas-browser-panel"]')
      ?.getAttribute("data-initial-url"),
    ).toBe("https://example.com");
    expect(
      container.querySelector(
        '[data-testid="right-surface-browser-control-overlay"]',
      )?.textContent,
    ).toContain("agentChat.rightSurface.browserControl.human.label");
  });

  it("未激活时不挂载浏览器 view", () => {
    act(() => {
      root.render(<RightSurfaceBrowserPanel active={false} />);
    });

    expect(
      container.querySelector('[data-testid="right-surface-browser-panel"]'),
    ).toBeNull();
  });

  it("Agent 控制常态只暴露 flags，不渲染接管 overlay", () => {
    act(() => {
      root.render(
        <RightSurfaceBrowserPanel
          controlMode="agent"
          lifecycleState="live"
          sessionRef={{
            sourceRequestId: "right_surface_browser_2",
            browserSessionId: "browser-session-2",
            profileKey: "general_browser_assist",
            adapterKind: "cdp",
            launchUrl: "https://example.com",
            title: "Example",
          }}
        />,
      );
    });

    const panel = container.querySelector(
      '[data-testid="right-surface-browser-panel"]',
    );
    expect(panel?.getAttribute("data-browser-control-owner")).toBe("agent");
    expect(panel?.getAttribute("data-browser-human-takeover")).toBe("false");
    expect(
      container.querySelector(
        '[data-testid="right-surface-browser-control-overlay"]',
      ),
    ).toBeNull();
  });
});
