import type { Artifact } from "@/lib/artifact/types";
import {
  resolveArtifactProtocolDocumentPayload,
  resolveArtifactProtocolPreviewText,
} from "@/lib/artifact-protocol";
import type {
  ArtifactDocumentBlock,
  ArtifactDocumentSource,
} from "@/lib/artifact-document";
import {
  buildWorkspaceArticleWorkspaceFromUnknown,
  buildWorkspaceArticleWorkspaceViewModel,
} from "../workspace/workspaceArticleWorkspaceModel";

export interface ArticleArtifactFrameModel {
  renderer: "articleArtifacts";
  title: string;
  markdown: string;
  summary?: string;
  sourceCount: number;
  imageSlotCount: number;
  outlineSectionCount: number;
  researchRoundCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function readRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
}

function readArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function readArtifactKind(artifact: Artifact): string | null {
  return readString(
    artifact.meta.artifactKind,
    artifact.meta.kind,
    artifact.meta.outputArtifactKind,
  );
}

function readArtifactRenderer(artifact: Artifact): string | null {
  return readString(
    artifact.meta.renderer,
    artifact.meta.artifactRenderer,
    artifact.meta.renderAs,
  );
}

function countMarkdownHeadings(markdown: string): number {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^#{2,3}\s+\S/.test(line.trim())).length;
}

function resolveBlockMarkdown(block: ArtifactDocumentBlock): string {
  switch (block.type) {
    case "section_header":
      return [
        `## ${block.title}`,
        typeof block.description === "string" ? block.description : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    case "hero_summary":
      return [
        block.title ? `# ${block.title}` : "",
        block.summary,
        ...(Array.isArray(block.highlights)
          ? block.highlights.map((item) => `- ${item}`)
          : []),
      ]
        .filter(Boolean)
        .join("\n\n");
    case "key_points":
      return [
        block.title ? `## ${block.title}` : "",
        ...block.items.map((item) => `- ${item}`),
      ]
        .filter(Boolean)
        .join("\n");
    case "rich_text":
      return (
        readString(
          block.markdown,
          block.text,
          typeof block.content === "string" ? block.content : null,
        ) ?? ""
      );
    case "callout":
      return [block.title ? `### ${block.title}` : "", block.body]
        .filter(Boolean)
        .join("\n\n");
    case "checklist":
      return [
        block.title ? `## ${block.title}` : "",
        ...block.items.map(
          (item) => `- [${item.state === "done" ? "x" : " "}] ${item.text}`,
        ),
      ]
        .filter(Boolean)
        .join("\n");
    case "quote":
      return `> ${block.text || block.quote || ""}`.trim();
    case "image":
      return block.caption
        ? `![${block.alt || block.caption}](${block.url})`
        : "";
    case "code_block":
      return [`\`\`\`${block.language || ""}`, block.code, "```"].join("\n");
    default:
      return "";
  }
}

function resolveArtifactDocumentMarkdown(artifact: Artifact): string | null {
  const document = resolveArtifactProtocolDocumentPayload({
    content: artifact.content,
    metadata: artifact.meta,
  });
  if (!document) {
    return null;
  }

  return document.blocks
    .map(resolveBlockMarkdown)
    .filter((block) => block.trim())
    .join("\n\n")
    .trim();
}

function countArtifactDocumentSources(artifact: Artifact): number {
  const document = resolveArtifactProtocolDocumentPayload({
    content: artifact.content,
    metadata: artifact.meta,
  });
  return document?.sources.length ?? 0;
}

function resolveArtifactDocumentSummary(artifact: Artifact): string | null {
  const document = resolveArtifactProtocolDocumentPayload({
    content: artifact.content,
    metadata: artifact.meta,
  });
  return document
    ? (resolveArtifactProtocolPreviewText(document) ?? null)
    : null;
}

function readArticleWorkspaceObjectKind(artifact: Artifact): string | null {
  const articleWorkspace = readRecord(artifact.meta.articleWorkspace);
  return readString(
    articleWorkspace?.objectKind,
    articleWorkspace?.object_kind,
  );
}

function readArticleWorkspaceMetrics(
  artifact: Artifact,
): Pick<
  ArticleArtifactFrameModel,
  "imageSlotCount" | "outlineSectionCount" | "researchRoundCount"
> {
  const preview = readRecord(artifact.meta.articleWorkspaceCardPreview);
  const counts = readRecord(preview?.counts);
  return {
    imageSlotCount: readNumber(counts?.imageSlots),
    outlineSectionCount: readNumber(counts?.outlineSections),
    researchRoundCount: readNumber(counts?.researchRounds),
  };
}

function resolveWorkspacePatchArticleMarkdown(artifact: Artifact): {
  markdown: string;
  summary?: string;
  sources: ArtifactDocumentSource[];
  imageSlotCount: number;
  outlineSectionCount: number;
  researchRoundCount: number;
} | null {
  const workspacePatch = readRecord(
    artifact.meta.contentFactoryWorkspacePatch,
    artifact.meta.workspace_patch,
  );
  const workspace = workspacePatch
    ? buildWorkspaceArticleWorkspaceFromUnknown(workspacePatch, "threadRead")
    : null;
  if (!workspace) {
    return null;
  }

  const viewModel = buildWorkspaceArticleWorkspaceViewModel(workspace);
  const selectedObject = viewModel.selectedObject;
  if (selectedObject.ref.kind !== "articleDraft") {
    return null;
  }

  const source = selectedObject.source ?? {};
  const markdown = readString(
    source.documentText,
    source.document_text,
    source.finalMarkdown,
    source.final_markdown,
    source.markdown,
    source.processMarkdown,
    source.process_markdown,
    source.body,
    source.content,
    source.text,
    source.excerpt,
  );
  if (!markdown) {
    return null;
  }

  const selectedPreview = viewModel.selectedPreview;
  return {
    markdown,
    summary:
      selectedObject.summary ??
      readString(source.summary, source.description) ??
      selectedPreview.documentText?.slice(0, 160) ??
      undefined,
    sources: readArray(source.citations).map((citation, index) => {
      const record = readRecord(citation) ?? {};
      return {
        id: readString(record.id) ?? `citation-${index + 1}`,
        type: "message" as const,
        label: readString(record.title, record.label) ?? `Citation ${index + 1}`,
        snippet: readString(record.summary, record.snippet) ?? undefined,
      };
    }),
    imageSlotCount: readArray(source.imageSlots).length || selectedPreview.imageSlots.length,
    outlineSectionCount:
      readArray(source.outline).length || selectedPreview.outline.length,
    researchRoundCount:
      readArray(source.researchRounds).length ||
      selectedPreview.researchRounds.length,
  };
}

function isArticleArtifact(artifact: Artifact): boolean {
  const objectKind = readArticleWorkspaceObjectKind(artifact);
  if (objectKind === "articleDraft") {
    return true;
  }

  const artifactKind = readArtifactKind(artifact);
  if (artifactKind === "articleDraft" || artifactKind === "articleArtifacts") {
    return true;
  }

  const renderer = readArtifactRenderer(artifact);
  if (renderer === "articleArtifacts") {
    return true;
  }

  const fileName = readString(artifact.meta.filename, artifact.title) ?? "";
  return /(^|[/_.-])(article|draft|文章|草稿)([/_.-]|$)/i.test(fileName);
}

export function resolveArticleArtifactFrameModel(
  artifact: Artifact,
): ArticleArtifactFrameModel | null {
  const articleLike =
    isArticleArtifact(artifact) ||
    Boolean(resolveWorkspacePatchArticleMarkdown(artifact));
  if (!articleLike) {
    return null;
  }

  const workspaceArticle = resolveWorkspacePatchArticleMarkdown(artifact);
  const documentMarkdown = resolveArtifactDocumentMarkdown(artifact);
  const markdown =
    workspaceArticle?.markdown ||
    documentMarkdown ||
    (isArticleArtifact(artifact) ? artifact.content.trim() : "");

  if (!markdown) {
    return null;
  }

  const productMetrics = readArticleWorkspaceMetrics(artifact);
  return {
    renderer: "articleArtifacts",
    title: artifact.title,
    markdown,
    summary:
      workspaceArticle?.summary ??
      resolveArtifactDocumentSummary(artifact) ??
      undefined,
    sourceCount:
      workspaceArticle?.sources.length ||
      countArtifactDocumentSources(artifact),
    imageSlotCount:
      workspaceArticle?.imageSlotCount || productMetrics.imageSlotCount,
    outlineSectionCount:
      workspaceArticle?.outlineSectionCount ||
      productMetrics.outlineSectionCount ||
      countMarkdownHeadings(markdown),
    researchRoundCount:
      workspaceArticle?.researchRoundCount || productMetrics.researchRoundCount,
  };
}
