import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mermaid from "mermaid";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { MermaidRenderer } from "./MermaidRenderer";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const content = overrides.content ?? "graph TD; A-->B;";
  return {
    id: "mermaid-artifact",
    type: "mermaid",
    title: "diagram.mmd",
    content,
    status: "complete",
    meta: { filename: "diagram", ...overrides.meta },
    position: { start: 0, end: content.length },
    createdAt: 1_777_777_000,
    updatedAt: 1_777_777_999,
    ...overrides,
  };
}

function renderMermaidRenderer(
  overrides: Partial<Artifact> = {},
  options: { isStreaming?: boolean } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <MermaidRenderer
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
  vi.mocked(mermaid.initialize).mockClear();
  vi.mocked(mermaid.render).mockResolvedValue({
    svg: "<svg><text>ok</text></svg>",
    diagramType: "flowchart",
    bindFunctions: undefined,
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
  vi.restoreAllMocks();
});

describe("MermaidRenderer", () => {
  it("应通过 errors namespace 渲染英文 Mermaid 预览 chrome", () => {
    const container = renderMermaidRenderer({}, { isStreaming: true });
    const text = container.textContent ?? "";

    expect(text).toContain("Preview");
    expect(text).toContain("Source");
    expect(text).toContain("Default");
    expect(text).toContain("Export");
    expect(text).toContain("Generating diagram...");
    expect(text).toContain("Wait for generation to finish before previewing.");
    expect(text).not.toContain("预览");
    expect(text).not.toContain("正在生成图表");
    expectButtonTitle(container, "Preview mode");
    expectButtonTitle(container, "Source mode");
    expectButtonTitle(container, "Zoom out");
    expectButtonTitle(container, "Zoom in");
    expectButtonTitle(container, "Fit to view");
    expectButtonTitle(container, "Switch theme");
    expectButtonTitle(container, "Export diagram");
  });

  it("Mermaid 渲染失败时应通过 errors namespace 渲染英文错误态", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("bad syntax"));
    const container = renderMermaidRenderer();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = container.textContent ?? "";

    expect(text).toContain("Mermaid syntax error");
    expect(text).toContain("bad syntax");
    expect(text).toContain("Source content:");
    expect(text).not.toContain("Mermaid 语法错误");
    expect(text).not.toContain("源码内容");
  });
});
