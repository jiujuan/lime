import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { registerLightweightRenderers } from "./renderers";
import { ArtifactToolbar } from "./ArtifactToolbar";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "artifact-toolbar-1",
    type: "code",
    title: "index.html",
    content: "<main>Hello</main>",
    status: "streaming",
    meta: {
      language: "html",
      writePhase: "streaming",
    },
    position: { start: 0, end: 18 },
    createdAt: 1_777_777_000,
    updatedAt: 1_777_777_999,
    ...overrides,
  };
}

function renderToolbar(artifact = buildArtifact()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ArtifactToolbar
        artifact={artifact}
        viewMode="preview"
        previewSize="mobile"
        onViewModeChange={vi.fn()}
        onPreviewSizeChange={vi.fn()}
        onClose={vi.fn()}
        tone="light"
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

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async () => undefined),
    },
  });

  registerLightweightRenderers();
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

describe("ArtifactToolbar", () => {
  it("应通过 workspace namespace 渲染英文工具栏 chrome", () => {
    const container = renderToolbar();
    const text = container.textContent ?? "";

    expect(text).toContain("Code");
    expect(text).toContain("Writing");
    expect(text).not.toContain("代码");
    expect(text).not.toContain("正在写入");
    expectButtonTitle(container, "Source");
    expectButtonTitle(container, "Preview");
    expectButtonTitle(container, "Phone");
    expectButtonTitle(container, "Tablet");
    expectButtonTitle(container, "Desktop");
    expectButtonTitle(container, "Copy content");
    expectButtonTitle(container, "Download file");
    expectButtonTitle(container, "Open in new window");
    expectButtonTitle(container, "Close");
  });
});
