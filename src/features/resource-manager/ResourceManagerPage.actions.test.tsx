import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RESOURCE_MANAGER_NAVIGATION_INTENT_KEY,
} from "./resourceManagerIntents";
import {
  act,
  cleanupResourceManagerPageTest,
  mockOpenPathWithDefaultApp,
  mockRevealPathInFinder,
  renderPage,
  resetResourceManagerPageTest,
} from "./ResourceManagerPage.testFixtures";

describe("ResourceManagerPage actions", () => {
  beforeEach(resetResourceManagerPageTest);
  afterEach(cleanupResourceManagerPageTest);

  it("本地资源应允许系统打开、定位文件和复制路径", async () => {
    const container = renderPage({
      id: "session-actions",
      initialIndex: 0,
      createdAt: Date.now(),
      items: [
        {
          id: "pdf-1",
          kind: "pdf",
          src: "asset:///tmp/1.pdf",
          filePath: "/tmp/1.pdf",
          title: "PDF",
        },
      ],
    });

    const openButton = container.querySelector('button[aria-label="系统打开"]');
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(mockOpenPathWithDefaultApp).toHaveBeenCalledWith("/tmp/1.pdf");

    const revealButton = container.querySelector(
      'button[aria-label="定位文件"]',
    );
    await act(async () => {
      revealButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(mockRevealPathInFinder).toHaveBeenCalledWith("/tmp/1.pdf");

    const copyButton = container.querySelector(
      'button[aria-label="复制路径 / 地址"]',
    );
    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/tmp/1.pdf");
    expect(container.querySelector('button[aria-label="更多操作"]')).toBeNull();
  });

  it("项目文件应把通用文件动作留在导航栏，更多菜单只展示业务动作", () => {
    const container = renderPage({
      id: "session-project-file-actions",
      sourceContext: {
        kind: "project_resource",
        projectId: "project-1",
        contentId: "content-1",
        sourcePage: "resources",
      },
      initialIndex: 0,
      createdAt: Date.now(),
      items: [
        {
          id: "pdf-1",
          kind: "pdf",
          src: "asset:///tmp/1.pdf",
          filePath: "/tmp/1.pdf",
          title: "PDF",
        },
      ],
    });

    expect(
      container.querySelectorAll('button[aria-label="复制路径 / 地址"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('button[aria-label="定位文件"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('button[aria-label="系统打开"]'),
    ).toHaveLength(1);

    const moreButton = container.querySelector('button[aria-label="更多操作"]');
    act(() => {
      moreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("回到项目资料");
    expect(container.textContent).not.toContain("复制路径 / 地址");
    expect(container.textContent).not.toContain("用系统应用打开");
  });

  it("图片任务来源应只展示任务相关菜单并写入回跳意图", () => {
    const container = renderPage({
      id: "session-image-task-actions",
      initialIndex: 0,
      createdAt: Date.now(),
      items: [
        {
          id: "image-1",
          kind: "image",
          src: "https://example.com/1.png",
          title: "任务图",
          sourceContext: {
            kind: "image_task",
            taskId: "task-1",
            outputId: "output-1",
            sourcePage: "image-task-viewer",
          },
        },
      ],
    });

    const moreButton = container.querySelector('button[aria-label="更多操作"]');
    act(() => {
      moreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("定位到图片任务");
    expect(container.textContent).toContain("作为后续任务输入");
    expect(container.textContent).not.toContain("转发");
    expect(container.textContent).not.toContain("收藏");
    expect(container.textContent).not.toContain("阅读原文");

    const locateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("定位到图片任务"),
    );
    act(() => {
      locateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      JSON.parse(localStorage.getItem(RESOURCE_MANAGER_NAVIGATION_INTENT_KEY)!),
    ).toEqual(
      expect.objectContaining({
        action: "locate_chat",
        item: expect.objectContaining({ id: "image-1", kind: "image" }),
        sourceContext: expect.objectContaining({
          kind: "image_task",
          taskId: "task-1",
          outputId: "output-1",
        }),
      }),
    );
  });

  it("项目文稿来源应展示项目回跳和原文入口，不再出现重复复制按钮", async () => {
    const container = renderPage({
      id: "session-project-actions",
      initialIndex: 0,
      createdAt: Date.now(),
      items: [
        {
          id: "md-1",
          kind: "markdown",
          content: "# 项目文稿",
          title: "项目文稿",
          sourceContext: {
            kind: "project_resource",
            projectId: "project-1",
            contentId: "content-1",
            originUrl: "https://example.com/source",
            sourcePage: "resources",
            resourceFolderId: "folder-1",
            resourceCategory: "document",
          },
        },
      ],
    });

    expect(
      container.querySelector('button[aria-label="复制内容"]'),
    ).toBeTruthy();
    expect(container.querySelector('button[aria-label="复制路径"]')).toBeNull();

    const moreButton = container.querySelector('button[aria-label="更多操作"]');
    act(() => {
      moreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("回到项目资料");
    expect(container.textContent).toContain("阅读原文");
    expect(container.textContent).not.toContain("保存到系统照片");
    expect(container.textContent).not.toContain("复制路径 / 地址");

    const projectButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("回到项目资料"),
    );
    act(() => {
      projectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      JSON.parse(localStorage.getItem(RESOURCE_MANAGER_NAVIGATION_INTENT_KEY)!),
    ).toEqual(
      expect.objectContaining({
        action: "open_project_resource",
        sourceContext: expect.objectContaining({
          kind: "project_resource",
          projectId: "project-1",
          contentId: "content-1",
          resourceFolderId: "folder-1",
          resourceCategory: "document",
        }),
      }),
    );

    act(() => {
      moreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const originButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("阅读原文"),
    );
    await act(async () => {
      originButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(window.open).toHaveBeenCalledWith(
      "https://example.com/source",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("应在顶部详情按钮中展示资源 Inspector 与业务来源", () => {
    const container = renderPage({
      id: "session-inspector",
      sourceContext: {
        kind: "project_resource",
        projectId: "project-1",
        contentId: "content-1",
        sourcePage: "resources",
      },
      initialIndex: 0,
      createdAt: Date.now(),
      items: [
        {
          id: "data-1",
          kind: "data",
          title: "metrics.json",
          content: '{"ok":true}',
          mimeType: "application/json",
        },
      ],
    });

    const infoButton = container.querySelector(
      'button[aria-label="切换资源详情"]',
    );
    act(() => {
      infoButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const inspector = container.querySelector(
      '[data-testid="resource-manager-inspector"]',
    );
    expect(inspector).toBeTruthy();
    expect(inspector?.textContent).toContain("资源详情");
    expect(inspector?.textContent).toContain("资源 ID");
    expect(inspector?.textContent).toContain("data-1");
    expect(inspector?.textContent).toContain("来源类型");
    expect(inspector?.textContent).toContain("project_resource");
    expect(inspector?.textContent).toContain("project-1");
  });
});
