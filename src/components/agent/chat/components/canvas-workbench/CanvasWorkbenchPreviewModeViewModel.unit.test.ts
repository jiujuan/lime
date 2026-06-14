import { describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import type { CanvasWorkbenchResolvedSelection } from "../CanvasWorkbenchLayoutViewModel";
import {
  resolveCanvasWorkbenchPreferredPreviewModeFromPath,
  resolveCanvasWorkbenchPreviewModeState,
} from "./CanvasWorkbenchPreviewModeViewModel";

function createSelection(
  overrides: Partial<CanvasWorkbenchResolvedSelection>,
): CanvasWorkbenchResolvedSelection {
  return {
    selectionKey: "workspace-file:/workspace/README.md",
    entrySource: "workspace-file",
    title: "README.md",
    tabLabel: "README.md",
    kindLabel: "文件",
    target: {
      kind: "default-canvas",
      title: "README.md",
      content: "# 标题",
      filePath: "/workspace/README.md",
      absolutePath: "/workspace/README.md",
    },
    content: "# 标题",
    previousContent: null,
    selectionPath: "/workspace/README.md",
    ...overrides,
  };
}

function createArtifact(type: Artifact["type"], language = ""): Artifact {
  return {
    id: "artifact-1",
    type,
    title: "index.html",
    content: "<!doctype html><html><body>OK</body></html>",
    status: "complete",
    meta: { language },
    position: { start: 0, end: 0 },
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("CanvasWorkbenchPreviewModeViewModel", () => {
  it("应按 Markdown 文件启用 Markdown 与 Code 模式", () => {
    const state = resolveCanvasWorkbenchPreviewModeState(
      createSelection({
        selectionPath: "/workspace/docs/README.md",
        title: "README.md",
      }),
    );

    expect(state.defaultMode).toBe("markdown");
    expect(state.language).toBe("markdown");
    expect(state.modes.markdown.enabled).toBe(true);
    expect(state.modes.html.enabled).toBe(false);
    expect(state.modes.code.enabled).toBe(true);
  });

  it("应按 HTML 文件或内容启用 HTML 与 Code 模式", () => {
    const state = resolveCanvasWorkbenchPreviewModeState(
      createSelection({
        selectionPath: "/workspace/index.html",
        title: "index.html",
        content: "<html><body>OK</body></html>",
      }),
    );

    expect(state.defaultMode).toBe("html");
    expect(state.language).toBe("html");
    expect(state.modes.markdown.enabled).toBe(false);
    expect(state.modes.html.enabled).toBe(true);
    expect(state.modes.code.enabled).toBe(true);
  });

  it("应按代码扩展名默认进入 Code 模式", () => {
    const state = resolveCanvasWorkbenchPreviewModeState(
      createSelection({
        selectionPath: "/workspace/src/App.tsx",
        title: "App.tsx",
        content: "export function App() { return null; }",
      }),
    );

    expect(state.defaultMode).toBe("code");
    expect(state.language).toBe("tsx");
    expect(state.modes.markdown.enabled).toBe(false);
    expect(state.modes.html.enabled).toBe(false);
    expect(state.modes.code.enabled).toBe(true);
  });

  it("空文本文件仍应允许 Code 模式预览", () => {
    const state = resolveCanvasWorkbenchPreviewModeState(
      createSelection({
        selectionPath: "/workspace/empty.txt",
        title: "empty.txt",
        content: "",
        target: {
          kind: "default-canvas",
          title: "empty.txt",
          content: "",
          filePath: "/workspace/empty.txt",
          absolutePath: "/workspace/empty.txt",
        },
      }),
    );

    expect(state.defaultMode).toBe("code");
    expect(state.hasContent).toBe(true);
    expect(state.modes.code.enabled).toBe(true);
  });

  it("应优先使用 artifact 类型和语言推断模式", () => {
    const state = resolveCanvasWorkbenchPreviewModeState(
      createSelection({
        title: "preview",
        selectionPath: undefined,
        target: {
          kind: "artifact",
          title: "preview",
          artifact: createArtifact("html", "html"),
        },
      }),
    );

    expect(state.defaultMode).toBe("html");
    expect(state.language).toBe("html");
    expect(state.modes.html.enabled).toBe(true);
  });

  it("路径默认模式推断应区分 Markdown、HTML 与 Code", () => {
    expect(
      resolveCanvasWorkbenchPreferredPreviewModeFromPath("README.md"),
    ).toBe("markdown");
    expect(
      resolveCanvasWorkbenchPreferredPreviewModeFromPath("index.htm"),
    ).toBe("html");
    expect(
      resolveCanvasWorkbenchPreferredPreviewModeFromPath("src/main.rs"),
    ).toBe("code");
  });
});
