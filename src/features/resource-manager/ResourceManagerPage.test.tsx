import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  act,
  cleanupResourceManagerPageTest,
  renderPage,
  resetResourceManagerPageTest,
} from "./ResourceManagerPage.testFixtures";

describe("ResourceManagerPage", () => {
  beforeEach(resetResourceManagerPageTest);
  afterEach(cleanupResourceManagerPageTest);

  it("应渲染资源列表、当前图片和元信息", () => {
    const container = renderPage({
      id: "session-1",
      sourceLabel: "项目资料",
      initialIndex: 0,
      createdAt: Date.now(),
      items: [
        {
          id: "image-1",
          kind: "image",
          src: "https://example.com/1.png",
          filePath: "/tmp/1.png",
          title: "第一张",
          metadata: { size: "1024x1024", providerName: "测试模型" },
        },
        {
          id: "pdf-1",
          kind: "pdf",
          src: "asset:///tmp/a.pdf",
          filePath: "/tmp/a.pdf",
          title: "说明 PDF",
        },
      ],
    });

    expect(container.textContent).toContain("项目资料");
    expect(container.textContent).toContain("2 个资源");
    expect(container.textContent).toContain("第一张");
    expect(container.textContent).toContain("1024x1024");
    expect(
      container.querySelector('[data-testid="resource-manager-item-list"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('img[src="https://example.com/1.png"]'),
    ).toBeTruthy();

    const toolbar = container.querySelector(
      '[data-testid="resource-manager-type-toolbar"]',
    );
    expect(
      toolbar?.querySelector('button[aria-label="缩小图片"]'),
    ).toBeTruthy();
    expect(
      toolbar?.querySelector('button[aria-label="顺时针旋转"]'),
    ).toBeTruthy();
    expect(
      container
        .querySelector('[data-testid="resource-manager-image-stage"]')
        ?.querySelector('button[aria-label="缩小图片"]'),
    ).toBeNull();

    const zoomIn = toolbar?.querySelector('button[aria-label="放大图片"]');
    act(() => {
      zoomIn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(toolbar?.textContent).toContain("120%");
  });

  it("顶部工具栏应具备窄窗口自适应收缩边界", () => {
    const container = renderPage({
      id: "session-responsive-toolbar",
      sourceLabel: "很长的项目资料来源名称用于验证资源列表标题截断",
      initialIndex: 0,
      createdAt: Date.now(),
      items: [
        {
          id: "heic-1",
          kind: "image",
          src: "asset:///tmp/photo.heic",
          filePath: "/tmp/photo.heic",
          title: "一张标题很长的系统图片资源 photo.heic",
          mimeType: "image/heic",
        },
      ],
    });

    const topToolbar = container.querySelector(
      '[data-testid="resource-manager-top-toolbar"]',
    );
    const typeToolbar = container.querySelector(
      '[data-testid="resource-manager-type-toolbar"]',
    );
    const globalActions = container.querySelector(
      '[data-testid="resource-manager-global-actions"]',
    );
    const list = container.querySelector(
      '[data-testid="resource-manager-item-list"]',
    );
    const imageTypeLabel = Array.from(
      typeToolbar?.querySelectorAll("span") ?? [],
    ).find((node) => node.textContent === "图片");
    const openButton = typeToolbar?.querySelector(
      'button[aria-label="系统打开"]',
    );

    expect(topToolbar?.className).toContain(
      "grid-cols-[auto_minmax(0,1fr)_auto]",
    );
    expect(typeToolbar?.className).toContain("overflow-x-auto");
    expect(typeToolbar?.className).toContain("[&::-webkit-scrollbar]:hidden");
    expect(globalActions?.className).toContain("shrink-0");
    expect(list?.className).toContain("w-[clamp(14rem,28vw,18rem)]");
    expect(imageTypeLabel?.className).toContain("whitespace-nowrap");
    expect(openButton?.className).toContain("whitespace-nowrap");
  });

  it("不同类型应展示不同预览 UI", async () => {
    const container = renderPage({
      id: "session-types",
      initialIndex: 0,
      createdAt: Date.now(),
      items: [
        {
          id: "video-1",
          kind: "video",
          src: "asset:///tmp/a.mp4",
          title: "视频",
        },
        {
          id: "pdf-1",
          kind: "pdf",
          src: "asset:///tmp/a.pdf",
          filePath: "/tmp/a.pdf",
          title: "PDF",
        },
        { id: "md-1", kind: "markdown", content: "# 标题", title: "文稿" },
        {
          id: "office-1",
          kind: "office",
          src: "asset:///tmp/a.docx",
          filePath: "/tmp/a.docx",
          title: "Word",
        },
        {
          id: "data-1",
          kind: "data",
          title: "metrics.csv",
          content: "name,count\nfoo,1",
          mimeType: "text/csv",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="resource-manager-video-player"]'),
    ).toBeTruthy();
    expect(container.querySelector('button[aria-label="复制图片"]')).toBeNull();

    const second = container.querySelector(
      'button[aria-label="查看第 2 个资源"]',
    );
    act(() => {
      second?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="resource-manager-pdf-frame"]'),
    ).toBeTruthy();

    const third = container.querySelector(
      'button[aria-label="查看第 3 个资源"]',
    );
    await act(async () => {
      third?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-testid="mock-markdown-renderer"]')
        ?.textContent,
    ).toContain("# 标题");
    expect(
      container.querySelector('button[aria-label="复制内容"]'),
    ).toBeTruthy();

    const fourth = container.querySelector(
      'button[aria-label="查看第 4 个资源"]',
    );
    act(() => {
      fourth?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Word 文档 暂不内置预览");
    expect(container.textContent).toContain("后续可接入");
    expect(
      container.querySelector(
        '[data-testid="resource-manager-office-preview"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelectorAll('button[aria-label="系统打开"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('button[aria-label="定位文件"]'),
    ).toHaveLength(1);

    const fifth = container.querySelector(
      'button[aria-label="查看第 5 个资源"]',
    );
    await act(async () => {
      fifth?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("结构化数据预览");
    expect(
      container.querySelector('[data-testid="resource-manager-data-table"]'),
    ).toBeTruthy();
    expect(container.textContent).not.toContain(
      ["数据文件", "暂不内置预览"].join(""),
    );
  });
});
