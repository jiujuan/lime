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
  it("uses agent namespace resources for complete generate preview chrome", () => {
    const { container } = renderPreview({
      taskId: "image-preview-complete",
      prompt: "",
      mode: "generate",
      status: "complete",
      imageCount: 1,
    });

    expect(container.textContent).toContain(
      "No prompt provided for this task.",
    );
    expect(container.textContent).toContain("Generated");
    expect(container.textContent).toContain(
      "The image result is complete. Open the right panel to review and use it.",
    );
    expect(container.textContent).toContain("Result synced");
    expect(container.textContent).not.toContain("当前任务未提供提示词");
    expect(container.textContent).not.toContain("已生成");
  });

  it("uses localized source footnote and image progress labels", () => {
    const { container } = renderPreview({
      taskId: "image-preview-variation",
      prompt: "Create a softer visual direction",
      mode: "variation",
      status: "partial",
      imageCount: 2,
      expectedImageCount: 4,
      sourceImageCount: 2,
    });

    expect(container.textContent).toContain("2/4 images");
    expect(container.textContent).toContain("Partially complete");
    expect(container.textContent).toContain(
      "Returned 2 / 4 variation result item(s); the remaining results are not complete.",
    );
    expect(container.textContent).toContain(
      "Reference images: Attached 2 reference image(s).",
    );
    expect(container.textContent).not.toContain("参考图");
    expect(container.textContent).not.toContain("部分完成");
  });
});
