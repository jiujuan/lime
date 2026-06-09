import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import {
  ARTIFACT_DOCUMENT_SCHEMA_VERSION,
  type ArtifactDocumentV1,
} from "@/lib/artifact-document";
import { ArtifactDocumentRenderer } from "./ArtifactDocumentRenderer";

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: vi.fn(),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildDocument(
  overrides: Partial<ArtifactDocumentV1> = {},
): ArtifactDocumentV1 {
  return {
    schemaVersion: ARTIFACT_DOCUMENT_SCHEMA_VERSION,
    artifactId: "artifact-document-i18n",
    kind: "report",
    title: "Quarterly operating review",
    status: "ready",
    language: "en-US",
    summary: "A structured review for leadership.",
    blocks: [
      {
        id: "hero",
        type: "hero_summary",
        title: "Executive summary",
        summary: "Stabilize the current delivery loop before expanding.",
        highlights: ["Delivery loop is healthy"],
      },
      {
        id: "section",
        type: "section_header",
        title: "Execution focus",
        description: "Keep the main path measurable.",
      },
      {
        id: "table",
        type: "table",
        columns: ["Metric", "Value"],
        rows: [["Adoption", "High"]],
      },
      {
        id: "citation",
        type: "citation_list",
        items: [{ sourceId: "" }],
      },
      {
        id: "image",
        type: "image",
        url: "",
      },
    ],
    sources: [
      {
        id: "source-1",
        type: "web",
        label: "Release notes",
        locator: { url: "https://example.com/release-notes" },
        snippet: "Source snippet",
      },
    ],
    metadata: {
      theme: "general",
      audience: "leadership",
      intent: "quarterly review",
    },
    ...overrides,
  };
}

function renderArtifactDocument(overrides: Partial<ArtifactDocumentV1> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ArtifactDocumentRenderer document={buildDocument(overrides)} />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await changeLimeLocale("en-US");
  vi.mocked(openExternalUrlWithSystemBrowser).mockResolvedValue(undefined);
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

describe("ArtifactDocumentRenderer", () => {
  it("应通过 workspace namespace 渲染英文结构化文档阅读面 chrome", () => {
    const container = renderArtifactDocument();
    const text = container.textContent ?? "";

    expect(text).toContain("Report");
    expect(text).toContain("Readable");
    expect(text).toContain("Theme General");
    expect(text).toContain("For leadership");
    expect(text).toContain("Goal quarterly review");
    expect(text).toContain("Language en-US");
    expect(text).toContain("Blocks");
    expect(text).toContain("Visible content blocks in this reading view");
    expect(text).toContain("Sections");
    expect(text).toContain("Section hierarchy is split out");
    expect(text).toContain("Sources");
    expect(text).toContain("Search, file, and tool references");
    expect(text).toContain("Highlights");
    expect(text).toContain("Summary highlights and key points");
    expect(text).toContain("Section");
    expect(text).toContain("Point 01");
    expect(text).toContain("Table");
    expect(text).toContain("References");
    expect(text).toContain("Source 1");
    expect(text).toContain("Image placeholder");
    expect(text).toContain("Image is unavailable, so a placeholder is shown.");
    expect(text).toContain("Source appendix");
    expect(text).not.toContain("结构块");
    expect(text).not.toContain("图片占位图");
    expect(text).not.toContain("来源附录");
  });

  it("失败恢复提示应通过 workspace namespace 渲染英文说明", () => {
    const container = renderArtifactDocument({ status: "failed" });
    const text = container.textContent ?? "";

    expect(text).toContain("Recovered draft");
    expect(text).toContain(
      "The model could not generate a structured document, so the original content is shown below.",
    );
    expect(text).not.toContain("模型未能生成结构化文档");
  });

  it("citation 与 source appendix 的 http/https 链接应交给系统浏览器 current 网关", async () => {
    const container = renderArtifactDocument({
      blocks: [
        {
          id: "citation",
          type: "citation_list",
          items: [{ sourceId: "source-1" }],
        },
      ],
    });
    const links = Array.from(container.querySelectorAll("a")).filter(
      (link) =>
        link.getAttribute("href") === "https://example.com/release-notes",
    );

    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute("target")).toBeNull();
      expect(link.getAttribute("rel")).toBe("noreferrer noopener");
    }

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    await act(async () => {
      links[0]?.dispatchEvent(clickEvent);
      await Promise.resolve();
    });

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(openExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://example.com/release-notes",
    );
  });
});
