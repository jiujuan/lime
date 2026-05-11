import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { DocumentRenderer } from "./DocumentRenderer";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "document-artifact-1",
    type: "document",
    title: "Release Notes",
    content: "# Release Notes\n\n- shipped",
    status: "streaming",
    meta: {},
    position: { start: 0, end: 26 },
    createdAt: 1_777_777_000,
    updatedAt: 1_777_777_999,
    ...overrides,
  };
}

function renderDocumentRenderer(artifact = buildArtifact()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <DocumentRenderer artifact={artifact} isStreaming={true} tone="light" />,
    );
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

describe("DocumentRenderer", () => {
  it("应通过 workspace namespace 渲染英文文档工具栏 chrome", () => {
    const container = renderDocumentRenderer();
    const text = container.textContent ?? "";

    expect(text).toContain("Preview");
    expect(text).toContain("Source");
    expect(text).toContain("Generating...");
    expect(text).not.toContain("预览");
    expect(text).not.toContain("源码");
    expect(text).not.toContain("生成中");
  });
});
