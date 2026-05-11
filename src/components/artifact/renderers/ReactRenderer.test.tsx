import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { ReactRenderer } from "./ReactRenderer";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const content = overrides.content ?? "const App = () => <div>Hello</div>;";
  return {
    id: "react-artifact",
    type: "react",
    title: "Component.jsx",
    content,
    status: "complete",
    meta: { language: "jsx", ...overrides.meta },
    position: { start: 0, end: content.length },
    createdAt: 1_777_777_000,
    updatedAt: 1_777_777_999,
    ...overrides,
  };
}

function renderReactRenderer(
  overrides: Partial<Artifact> = {},
  options: { isStreaming?: boolean } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ReactRenderer
        artifact={buildArtifact(overrides)}
        isStreaming={options.isStreaming}
      />,
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

  vi.spyOn(console, "error").mockImplementation(() => undefined);
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
  vi.restoreAllMocks();
});

describe("ReactRenderer", () => {
  it("应通过 errors namespace 渲染英文 React 预览 chrome", () => {
    const container = renderReactRenderer({}, { isStreaming: true });
    const text = container.textContent ?? "";

    expect(text).toContain("Preview");
    expect(text).toContain("Source");
    expect(text).toContain("Generating component...");
    expect(text).toContain("Wait for content generation to finish");
    expect(text).not.toContain("预览");
    expect(text).not.toContain("正在生成组件");
    expectButtonTitle(container, "Preview mode");
    expectButtonTitle(container, "Source mode");
  });

  it("JSX 编译失败时应通过 errors namespace 渲染英文错误态", async () => {
    const container = renderReactRenderer({
      content: "const App = () => <div>;",
    });

    await act(async () => {
      await Promise.resolve();
    });

    const text = container.textContent ?? "";

    expect(text).toContain("Compile / render error");
    expect(text).toContain("Retry");
    expect(text).toContain("Source content:");
    expect(text).not.toContain("编译/渲染错误");
    expect(text).not.toContain("源码内容");
  });
});
