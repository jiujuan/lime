import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchResultPreviewList } from "./SearchResultPreviewList";
import { changeLimeLocale } from "@/i18n/createI18n";

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: RenderResult[] = [];

function renderList() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const items = Array.from({ length: 6 }, (_, index) => ({
    id: `result-${index + 1}`,
    title: `Result ${index + 1}`,
    url: `https://example.com/${index + 1}`,
    hostname: "example.com",
    snippet: `Summary ${index + 1}`,
  }));

  act(() => {
    root.render(
      <SearchResultPreviewList
        items={items}
        onOpenUrl={vi.fn()}
        collapsedCount={4}
      />,
    );
  });

  const rendered = { container, root };
  mountedRoots.push(rendered);
  return rendered;
}

function renderInlineList() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SearchResultPreviewList
        items={[
          {
            id: "long-url-result",
            title: "Learning Tablet Guide",
            url: "https://example.com/products/learning/tablet/fifth-grade/buying-guide?utm_source=yahoo",
            hostname: "example.com",
            snippet: "Guide summary",
          },
        ]}
        onOpenUrl={vi.fn()}
        variant="inline"
      />,
    );
  });

  const rendered = { container, root };
  mountedRoots.push(rendered);
  return rendered;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("en-US");
});

afterEach(async () => {
  vi.useRealTimers();
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  document.body.innerHTML = "";
  await changeLimeLocale("zh-CN");
});

describe("SearchResultPreviewList", () => {
  it("uses agent namespace resources when collapsing and expanding results", () => {
    const { container } = renderList();

    expect(container.textContent).toContain("Result 1");
    expect(container.textContent).toContain("Result 4");
    expect(container.textContent).not.toContain("Result 5");
    expect(container.textContent).toContain("Show 2 more results");

    const toggleButton = container.querySelector(
      'button[aria-label="Expand search results"]',
    ) as HTMLButtonElement | null;

    act(() => {
      toggleButton?.click();
    });

    expect(container.textContent).toContain("Result 5");
    expect(container.textContent).toContain("Result 6");
    expect(container.textContent).toContain("Collapse results");

    const collapseButton = container.querySelector(
      'button[aria-label="Collapse search results"]',
    ) as HTMLButtonElement | null;

    act(() => {
      collapseButton?.click();
    });

    expect(container.textContent).not.toContain("Result 5");
    expect(container.textContent).not.toContain("Result 6");
    expect(container.textContent).toContain("Show 2 more results");
    expect(container.textContent).not.toContain("展开其余");
    expect(container.textContent).not.toContain("收起结果");
  });

  it("keeps the hover preview open only while the pointer stays in the region", () => {
    vi.useFakeTimers();
    const { container } = renderList();
    const trigger = container.querySelector(
      'button[aria-label="Open search result: Result 1"]',
    ) as HTMLButtonElement | null;

    act(() => {
      trigger?.dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
        }),
      );
    });

    expect(document.body.textContent).toContain("Summary 1");

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
        }),
      );
      vi.advanceTimersByTime(140);
    });

    expect(document.body.textContent).not.toContain("Summary 1");
  });

  it("renders inline sources as compact source labels instead of raw long URLs", () => {
    const { container } = renderInlineList();

    expect(container.textContent).toContain("Learning Tablet Guide");
    expect(container.textContent).toContain(
      "example.com/products/learning/tablet/fifth-g…",
    );
    expect(container.textContent).not.toContain("utm_source=yahoo");
    expect(container.textContent).not.toContain("https://example.com");
  });
});
