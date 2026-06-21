import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import { renderTool } from "./InlineToolProcessStep.testHarness";

describe("InlineToolProcessStep site results", () => {
  it("站点导出按钮副文案应优先展示短文件名", () => {
    const onOpenSavedSiteContent = vi.fn();
    const { container } = renderTool(
      {
        id: "tool-inline-site-run-1",
        name: "lime_site_run",
        arguments: JSON.stringify({
          adapter_name: "x/article",
          args: { url: "https://x.com/google/article/1" },
        }),
        status: "completed",
        result: {
          success: true,
          output: "ok",
          metadata: {
            tool_family: "site",
            saved_content: {
              content_id: "content-inline-site-1",
              project_id: "project-inline-site-1",
              title: "Google Cloud 周报",
              markdown_relative_path:
                "exports/social-article/google-cloud/index.md",
              image_count: 3,
            },
            saved_by: "context_project",
          },
        },
        startTime: new Date("2026-04-13T10:40:00.000Z"),
        endTime: new Date("2026-04-13T10:40:01.000Z"),
      },
      { onOpenSavedSiteContent },
    );

    expect(container.textContent).toContain(
      "结果已自动保存到当前项目：Google Cloud 周报",
    );
    expect(container.textContent).toContain("已导出 Markdown 文稿");
    expect(container.textContent).toContain("附带图片 3 张");

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("在下方预览导出 Markdown"),
    ) as HTMLButtonElement | undefined;

    expect(openButton).toBeDefined();
    expect(openButton?.textContent).toContain("index.md");
    expect(openButton?.textContent).not.toContain(
      "exports/social-article/google-cloud/index.md",
    );

    act(() => {
      openButton?.click();
    });

    expect(onOpenSavedSiteContent).toHaveBeenCalledWith({
      projectId: "project-inline-site-1",
      contentId: "content-inline-site-1",
      title: "Google Cloud 周报",
      preferredTarget: "project_file",
      projectFile: {
        relativePath: "exports/social-article/google-cloud/index.md",
      },
    });
  });

  it("站点保存提示应随当前语言切换", async () => {
    await changeLimeLocale("en-US");
    const { container } = renderTool(
      {
        id: "tool-inline-site-run-i18n-1",
        name: "lime_site_run",
        arguments: JSON.stringify({
          adapter_name: "x/article",
          args: { url: "https://x.com/google/article/1" },
        }),
        status: "completed",
        result: {
          success: true,
          output: "ok",
          metadata: {
            tool_family: "site",
            saved_content: {
              content_id: "content-inline-site-i18n-1",
              project_id: "project-inline-site-i18n-1",
              title: "Google Cloud weekly",
              markdown_relative_path:
                "exports/social-article/google-cloud/index.md",
              image_count: 3,
            },
            saved_by: "context_project",
          },
        },
        startTime: new Date("2026-04-13T10:40:00.000Z"),
        endTime: new Date("2026-04-13T10:40:01.000Z"),
      },
      { onOpenSavedSiteContent: vi.fn() },
    );

    expect(container.textContent).toContain(
      "Result saved to current project: Google Cloud weekly",
    );
    expect(container.textContent).toContain("Markdown draft exported");
    expect(container.textContent).toContain("3 images attached");
    expect(container.textContent).toContain("Preview exported Markdown below");
    expect(container.textContent).not.toContain("已保存到当前项目");
    expect(container.textContent).not.toContain("附带图片");
  });
});
