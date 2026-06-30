import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import { changeLimeLocale } from "@/i18n/createI18n";
import { clearArtifactFrameRegistry } from "./artifactFrameRegistry";
import { registerArtifactFrameRenderer } from "./artifactFrameRegistry";
import { MessageArtifactCards } from "./MessageArtifactCards";

vi.mock("./MarkdownRenderer", () => ({
  MarkdownRenderer: ({
    content,
    isStreaming,
    renderMode,
  }: {
    content: string;
    isStreaming?: boolean;
    renderMode?: string;
  }) => (
    <div
      data-testid="markdown-renderer"
      data-is-streaming={isStreaming ? "yes" : "no"}
      data-render-mode={renderMode || "standard"}
    >
      {content}
    </div>
  ),
}));

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const content = overrides.content ?? "# 公众号文章草稿\n\n正文内容";
  return {
    id: overrides.id ?? "artifact-article-1",
    type: overrides.type ?? "document",
    title: overrides.title ?? "公众号文章草稿",
    content,
    status: overrides.status ?? "complete",
    meta: overrides.meta ?? {},
    position: overrides.position ?? { start: 0, end: content.length },
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    error: overrides.error,
  };
}

async function renderCards(props: React.ComponentProps<typeof MessageArtifactCards>) {
  await changeLimeLocale("zh-CN");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<MessageArtifactCards {...props} />);
    await Promise.resolve();
  });
  mountedRoots.push({ container, root });
  return container;
}

afterEach(() => {
  for (const { container, root } of mountedRoots.splice(0)) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
  clearArtifactFrameRegistry();
});

describe("MessageArtifactCards", () => {
  it("文章产物应在独立 ArtifactFrame 内完整渲染正文并可打开右侧编辑器", async () => {
    const onArtifactClick = vi.fn();
    const fullArticle = [
      "# 公众号文章草稿",
      "",
      "这是第一段正文，应该在独立产物框里完整展示。",
      "",
      "## 三轮资料检索",
      "",
      "- 第一轮：确认主题和读者。",
      "- 第二轮：整理场景痛点。",
      "- 第三轮：收敛结构和发布检查。",
      "",
      "## 正文草稿",
      "",
      "这是第二段正文，点击框头后应打开右侧 Article Editor。",
    ].join("\n");
    const artifact = createArtifact({
      content: fullArticle,
      meta: {
        openedFrom: "right_surface_article_workspace",
        articleWorkspace: {
          objectKind: "articleDraft",
        },
        articleWorkspaceCardPreview: {
          counts: {
            researchRounds: 3,
            outlineSections: 5,
            imageSlots: 2,
          },
        },
      },
    });

    const container = await renderCards({
      artifacts: [artifact],
      messageId: "msg-article",
      onArtifactClick,
    });

    expect(container.querySelector('[data-testid="article-artifact-frame"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="article-artifact-frame-process"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="article-artifact-frame-body"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="article-artifact-renderer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="article-artifact-frame-facts"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("文章产物");
    expect(container.textContent).toContain("完整正文");
    expect(container.textContent).toContain("正文草稿");
    expect(container.textContent).toContain("展开右侧编辑器");
    expect(container.textContent).toContain("已完成 3 轮资料检索");
    expect(container.textContent).not.toContain("articleArtifacts");
    expect(container.textContent).toContain(
      "这是第一段正文，应该在独立产物框里完整展示。",
    );
    expect(container.textContent).toContain(
      "这是第二段正文，点击框头后应打开右侧 Article Editor。",
    );
    expect(container.textContent).toContain("3 轮资料检索");
    expect(container.textContent).toContain("5 个文章小节");
    expect(container.textContent).toContain("2 个配图位");

    const openButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="article-artifact-frame"] button',
    );
    act(() => {
      openButton?.click();
    });

    expect(onArtifactClick).toHaveBeenCalledWith(artifact);
  });

  it("普通文档产物应继续使用轻量文件卡", async () => {
    const artifact = createArtifact({
      id: "artifact-doc-1",
      title: "demo.md",
      content: "# Demo",
      meta: {
        filePath: "docs/demo.md",
      },
    });

    const container = await renderCards({
      artifacts: [artifact],
      messageId: "msg-doc",
    });

    expect(container.querySelector('[data-testid="artifact-frame"]')).toBeNull();
    expect(container.querySelector('[data-testid="message-artifact-card"]')).not.toBeNull();
    expect(container.textContent).toContain("demo.md");
    expect(container.textContent).toContain("docs/demo.md");
  });

  it("新增的自定义 artifact frame renderer 应能接入消息列表", async () => {
    clearArtifactFrameRegistry();
    registerArtifactFrameRenderer({
      id: "chartArtifacts",
      priority: 20,
      supports: (artifact) => artifact.meta.kind === "chartArtifacts",
      component: ({ artifact }) => (
        <section data-testid="chart-artifact-frame">
          {artifact.title}
        </section>
      ),
    });

    const artifact = createArtifact({
      id: "artifact-chart-1",
      title: "图表产物",
      meta: {
        kind: "chartArtifacts",
      },
    });

    const container = await renderCards({
      artifacts: [artifact],
      messageId: "msg-chart",
    });

    expect(container.querySelector('[data-testid="chart-artifact-frame"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="message-artifact-card"]')).toBeNull();
    expect(container.textContent).toContain("图表产物");
  });
});
