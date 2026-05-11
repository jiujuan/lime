import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { SvgRenderer } from "./SvgRenderer";

vi.mock("./CodeRenderer", () => ({
  CodeRenderer: () => <div data-testid="code-renderer" />,
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "svg-artifact",
    type: "svg",
    title: "Demo SVG",
    content: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>',
    status: "complete",
    meta: { filename: "demo.svg" },
    position: { start: 0, end: 64 },
    createdAt: 1_777_777_000,
    updatedAt: 1_777_777_999,
    ...overrides,
  };
}

function renderSvgRenderer(
  overrides: Partial<Artifact> = {},
  options: { isStreaming?: boolean } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SvgRenderer
        artifact={buildArtifact(overrides)}
        isStreaming={options.isStreaming}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

function getButtonByTitle(container: HTMLElement, title: string) {
  const button = container.querySelector(`button[title="${title}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`未找到按钮 title: ${title}`);
  }
  return button;
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

describe("SvgRenderer", () => {
  it("应通过 errors namespace 渲染英文预览控制文案", () => {
    const container = renderSvgRenderer({}, { isStreaming: true });
    const text = container.textContent ?? "";

    expect(text).toContain("Preview");
    expect(text).toContain("Source");
    expect(text).toContain("Generating...");
    expect(getButtonByTitle(container, "Preview mode")).toBeTruthy();
    expect(getButtonByTitle(container, "Source mode")).toBeTruthy();
    expect(getButtonByTitle(container, "Zoom out")).toBeTruthy();
    expect(getButtonByTitle(container, "Zoom in")).toBeTruthy();
    expect(getButtonByTitle(container, "Fit to view")).toBeTruthy();
    expect(getButtonByTitle(container, "Download SVG")).toBeTruthy();
    expect(text).not.toContain("生成中");
    expect(text).not.toContain("预览");
  });

  it("SVG 内容无效时应通过 errors namespace 渲染英文错误状态", () => {
    const container = renderSvgRenderer({ content: "not-svg" });
    const text = container.textContent ?? "";

    expect(text).toContain("SVG render failed");
    expect(text).toContain(
      "Invalid SVG content. Check that it is valid SVG code.",
    );
    expect(text).not.toContain("SVG 渲染失败");
    expect(text).not.toContain("SVG 内容格式无效");
  });
});
