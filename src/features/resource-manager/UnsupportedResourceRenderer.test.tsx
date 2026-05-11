import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { UnsupportedResourceRenderer } from "./UnsupportedResourceRenderer";
import type { ResourceManagerItem } from "./types";

const mountedRenderers: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderUnsupported(item: ResourceManagerItem) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<UnsupportedResourceRenderer item={item} />);
  });

  mountedRenderers.push({ root, container });
  return container;
}

describe("UnsupportedResourceRenderer", () => {
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

  it("未知资源空态应走 workspace 英文资源", () => {
    const container = renderUnsupported({
      id: "unknown-default",
      kind: "unknown",
      filePath: "/tmp/archive.bin",
      mimeType: "application/x-custom",
    });

    expect(container.textContent).toContain(
      "Unknown resource preview is not supported yet",
    );
    expect(container.textContent).toContain(
      "Lime has identified this resource entry, but there is no safe built-in renderer for it yet.",
    );
    expect(container.textContent).toContain("Untitled resource");
    expect(container.textContent).toContain("Type: application/x-custom");
    expect(container.textContent).toContain(
      "A fuller document converter or system preview can be connected later.",
    );
    expect(container.textContent).not.toContain("未知资源暂不支持预览");
    expect(container.textContent).not.toContain("未命名资源");
    expect(container.textContent).not.toContain("类型：");
  });

  it("资源标题与路径应继续作为 runtime 数据展示", () => {
    const container = renderUnsupported({
      id: "unknown-runtime",
      kind: "unknown",
      title: "Runtime package",
      filePath: "/tmp/runtime.package",
    });

    expect(container.textContent).toContain("Runtime package");
    expect(container.textContent).toContain("/tmp/runtime.package");
    expect(container.textContent).not.toContain("Untitled resource");
  });
});
