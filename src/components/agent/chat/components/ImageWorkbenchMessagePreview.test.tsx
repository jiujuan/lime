import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { MessageImageWorkbenchPreview } from "../types";
import { ImageWorkbenchMessagePreview } from "./ImageWorkbenchMessagePreview";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderPreview(preview: MessageImageWorkbenchPreview) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ImageWorkbenchMessagePreview preview={preview} />);
  });

  mountedRoots.push({ root, container });
  return { container };
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
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
  await changeLimeLocale("zh-CN");
});

describe("ImageWorkbenchMessagePreview", () => {
  it("renders a complete image with the lightweight tool strip and no task chrome", () => {
    const { container } = renderPreview({
      taskId: "image-preview-complete",
      prompt: "",
      mode: "generate",
      status: "complete",
      imageUrl: "data:image/png;base64,aW1hZ2U=",
      imageCount: 1,
      caption: "搞定，已生成这张图。",
      runtimeContract: {
        model: "fal-ai/nano-banana-pro",
      },
    });

    expect(container.textContent).toContain("Image Generation");
    expect(container.textContent).toContain("Nanobanana Pro");
    expect(container.textContent).toContain("搞定，已生成这张图。");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,aW1hZ2U=",
    );
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Open image result",
    );
    expect(container.textContent).not.toContain(
      "No prompt provided for this task.",
    );
    expect(container.textContent).not.toContain("Generated");
    expect(container.textContent).not.toContain(
      "The image result is complete. Open the right panel to review and use it.",
    );
    expect(container.textContent).not.toContain("Result synced");
    expect(container.textContent).not.toContain("当前任务未提供提示词");
  });

  it("hides legacy task-card status and source chrome in chat preview", () => {
    const { container } = renderPreview({
      taskId: "image-preview-variation",
      prompt: "Create a softer visual direction",
      mode: "variation",
      status: "partial",
      imageCount: 2,
      expectedImageCount: 4,
      sourceImageCount: 2,
    });

    expect(container.textContent).toContain("Image Redraw");
    expect(container.textContent).toContain("Image is temporarily unavailable");
    expect(container.textContent).not.toContain("2/4 images");
    expect(container.textContent).not.toContain("Partially complete");
    expect(container.textContent).not.toContain(
      "Returned 2 / 4 variation result item(s); the remaining results are not complete.",
    );
    expect(container.textContent).not.toContain(
      "Reference images: Attached 2 reference image(s).",
    );
    expect(container.textContent).not.toContain("参考图");
    expect(container.textContent).not.toContain("部分完成");
  });
});
