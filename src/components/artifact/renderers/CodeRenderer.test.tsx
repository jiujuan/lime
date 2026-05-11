import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { CodeRenderer } from "./CodeRenderer";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const content = Object.prototype.hasOwnProperty.call(overrides, "content")
    ? overrides.content
    : "const demo = true;\nconsole.log(demo);";
  const contentLength = typeof content === "string" ? content.length : 0;
  return {
    id: "code-artifact",
    type: "code",
    title: "demo.ts",
    content: content as string,
    status: "complete",
    meta: {
      language: "typescript",
      filename: "demo.ts",
      ...overrides.meta,
    },
    position: { start: 0, end: contentLength },
    createdAt: 1_777_777_000,
    updatedAt: 1_777_777_999,
    ...overrides,
  };
}

function renderCodeRenderer(
  overrides: Partial<Artifact> = {},
  props: Partial<ComponentProps<typeof CodeRenderer>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <CodeRenderer artifact={buildArtifact(overrides)} {...props} />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

function expectButtonTitle(container: HTMLElement, title: string) {
  expect(container.querySelector(`button[title="${title}"]`)).not.toBeNull();
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async () => undefined),
    },
  });

  await changeLimeLocale("en-US");
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }

    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }

  await changeLimeLocale("zh-CN");
  vi.clearAllMocks();
});

describe("CodeRenderer", () => {
  it("应通过 errors namespace 渲染英文代码工具栏 chrome", () => {
    const container = renderCodeRenderer(
      {
        title: "index.html",
        content: "<main>Hello</main>",
        meta: { language: "html", filename: "index.html" },
      },
      {
        isStreaming: true,
        viewMode: "preview",
        previewSize: "mobile",
        onViewModeChange: vi.fn(),
        onPreviewSizeChange: vi.fn(),
      },
    );
    const text = container.textContent ?? "";

    expect(text).toContain("Generating...");
    expect(text).toContain("Source");
    expect(text).toContain("Preview");
    expect(text).toContain("Copy");
    expect(text).not.toContain("生成中");
    expect(text).not.toContain("源码");
    expectButtonTitle(container, "Copy code");
    expectButtonTitle(container, "Phone");
    expectButtonTitle(container, "Tablet");
    expectButtonTitle(container, "Desktop");
    expectButtonTitle(container, "Refresh preview");
    expect(
      container.querySelector('iframe[title="HTML preview"]'),
    ).not.toBeNull();
  });

  it("代码内容缺失时应通过 errors namespace 渲染英文错误态", async () => {
    const container = renderCodeRenderer({
      content: undefined as unknown as string,
    });

    await act(async () => {
      await Promise.resolve();
    });

    const text = container.textContent ?? "";

    expect(text).toContain("Code render failed");
    expect(text).toContain("Code content is empty");
    expect(text).toContain("Original content:");
    expect(text).not.toContain("代码渲染失败");
    expect(text).not.toContain("代码内容为空");
  });
});
