import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import { renderSkillMarkdown } from "./skillMarkdownPreview";

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: vi.fn(),
}));

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(openExternalUrlWithSystemBrowser).mockResolvedValue(undefined);
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

function render(content: string): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(renderSkillMarkdown(content));
  });

  mountedRoots.push({ container, root });
  return container;
}

describe("skillMarkdownPreview", () => {
  it("http/https 链接应交给 externalUrl current 网关", async () => {
    const container = render("[文档](https://example.com/skill)");
    const link = container.querySelector("a");

    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("https://example.com/skill");
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
    expect(openExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://example.com/skill",
    );
  });

  it("非 http(s) 链接保留原生链接语义", async () => {
    const container = render("[章节](#usage)");
    const link = container.querySelector("a");

    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("#usage");
    expect(link?.getAttribute("rel")).toBeNull();

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    await act(async () => {
      link?.dispatchEvent(clickEvent);
      await Promise.resolve();
    });

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(openExternalUrlWithSystemBrowser).not.toHaveBeenCalled();
  });
});
