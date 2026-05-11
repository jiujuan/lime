import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { PdfResourceRenderer } from "./PdfResourceRenderer";
import type { ResourceManagerItem } from "./types";

const mountedRenderers: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderPdf(item: ResourceManagerItem) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<PdfResourceRenderer item={item} />);
  });

  mountedRenderers.push({ root, container });
  return container;
}

describe("PdfResourceRenderer", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await changeLimeLocale("en-US");
  });

  afterEach(async () => {
    for (const item of mountedRenderers.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
    await changeLimeLocale("zh-CN");
    vi.unstubAllGlobals();
  });

  it("缺少 src 时应展示 workspace namespace 英文空态", () => {
    const container = renderPdf({
      id: "pdf-empty",
      kind: "pdf",
      title: "Runtime PDF",
      src: "   ",
    });

    expect(container.textContent).toContain("PDF preview address missing");
    expect(container.textContent).toContain(
      "This resource has no local path or loadable URL",
    );
    expect(container.textContent).not.toContain("PDF 缺少可预览地址");
    expect(container.textContent).not.toContain("暂时无法在窗口内预览");
  });

  it("iframe 默认 title 应走 workspace namespace，runtime title 仍可覆盖", () => {
    const defaultContainer = renderPdf({
      id: "pdf-default",
      kind: "pdf",
      src: "asset:///tmp/default.pdf",
    });
    const runtimeContainer = renderPdf({
      id: "pdf-runtime",
      kind: "pdf",
      title: "Runtime Spec",
      src: "asset:///tmp/runtime.pdf",
    });

    expect(
      defaultContainer
        .querySelector('[data-testid="resource-manager-pdf-frame"]')
        ?.getAttribute("title"),
    ).toBe("PDF preview");
    expect(
      runtimeContainer
        .querySelector('[data-testid="resource-manager-pdf-frame"]')
        ?.getAttribute("title"),
    ).toBe("Runtime Spec");
  });
});
