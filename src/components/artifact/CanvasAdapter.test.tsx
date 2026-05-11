import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { CanvasAdapter } from "./CanvasAdapter";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const content =
    overrides.content ??
    JSON.stringify({
      id: "design-artifact-i18n",
      title: "Localized Design",
      canvas: { width: 1080, height: 1440 },
      layers: [
        {
          id: "hero",
          name: "Hero",
          type: "image",
          assetId: "asset-hero",
          x: 0,
          y: 0,
          width: 1080,
          height: 1440,
          zIndex: 1,
          visible: true,
          locked: false,
        },
      ],
      assets: [
        {
          id: "asset-hero",
          kind: "subject",
          src: "",
          width: 1080,
          height: 1440,
          provider: "fal",
          modelId: "demo",
          createdAt: "2026-05-11T00:00:00.000Z",
        },
      ],
      editHistory: [],
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
    });

  return {
    id: "canvas-artifact",
    type: "canvas:design",
    title: "design.json",
    content,
    status: "complete",
    meta: { filename: "design.json", ...overrides.meta },
    position: { start: 0, end: content.length },
    createdAt: 1_777_777_000,
    updatedAt: 1_777_777_999,
    ...overrides,
  };
}

function renderCanvasAdapter(overrides: Partial<Artifact> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<CanvasAdapter artifact={buildArtifact(overrides)} />);
  });

  mountedRoots.push({ root, container });
  return container;
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
});

describe("CanvasAdapter", () => {
  it("应通过 workspace namespace 渲染英文设计 Canvas 预览 chrome", () => {
    const container = renderCanvasAdapter();
    const text = container.textContent ?? "";

    expect(text).toContain("Layered design Canvas");
    expect(text).toContain("Visible layers");
    expect(text).toContain("Assets");
    expect(text).toContain("Generated");
    expect(text).toContain("Current layer");
    expect(text).toContain("Layer summary");
    expect(text).toContain("Image / z 1");
    expect(text).toContain("Visible");
    expect(text).toContain("Editable");
    expect(text).toContain("Edit");
    expect(text).not.toContain("图层摘要");
    expect(text).not.toContain("显示图层");
    expect(
      container.querySelector('button[title="Open in full editor"]'),
    ).not.toBeNull();
  });

  it("不支持的 Canvas 类型应通过 workspace namespace 渲染英文提示", () => {
    const container = renderCanvasAdapter({
      type: "canvas:unknown" as Artifact["type"],
    });
    const text = container.textContent ?? "";

    expect(text).toContain("Unsupported Canvas type");
    expect(text).toContain('Type "canvas:unknown" cannot be rendered here yet');
    expect(text).not.toContain("不支持的 Canvas 类型");
  });
});
