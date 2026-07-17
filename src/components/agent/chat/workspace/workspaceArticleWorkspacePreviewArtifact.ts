import { createPreviewArtifact } from "@/lib/artifact/previewArtifact";
import type { Artifact } from "@/lib/artifact/types";
import { buildWorkspaceArticleWorkspaceArtifactDocument } from "./workspaceArticleWorkspaceArtifactDocument";
import { buildWorkspaceArticleObjectKey } from "./workspaceArticleWorkspaceSelection";
import type {
  WorkspaceArticleObject,
  WorkspaceArticleObjectSurfaceLayout,
  WorkspaceArticleWorkspace,
  WorkspaceArticleWorkspaceStructuredPreview,
} from "./workspaceArticleWorkspaceModel";
import {
  resolveWorkspaceArticleWorkspaceImageLocalPath,
  resolveWorkspaceArticleWorkspaceImageRenderSrc,
  resolveWorkspaceArticleWorkspaceImageSourceLabel,
} from "./workspaceArticleWorkspaceImagePreview";

export interface WorkspaceArticleWorkspacePreviewArtifactInput {
  articleWorkspace: WorkspaceArticleWorkspace;
  object: WorkspaceArticleObject;
  layout: WorkspaceArticleObjectSurfaceLayout;
  preview: WorkspaceArticleWorkspaceStructuredPreview;
  artifactIds: string[];
  now?: number;
}

export function buildWorkspaceArticleWorkspacePreviewArtifact({
  articleWorkspace,
  artifactIds,
  layout,
  now,
  object,
  preview,
}: WorkspaceArticleWorkspacePreviewArtifactInput): Artifact | null {
  const artifactRef = artifactIds[0];
  const sourceRef = artifactRef ?? buildWorkspaceArticleObjectKey(object);
  const artifactDocument = buildWorkspaceArticleWorkspaceArtifactDocument({
    artifactIds,
    layout,
    now,
    object,
    preview,
    articleWorkspace,
  });
  const meta = {
    openedFrom: "right_surface_article_workspace",
    artifactSchema: artifactDocument.schemaVersion,
    artifactKind: artifactDocument.kind,
    surfaceKind: layout,
    layout,
    artifactDocument,
    artifactTitle: artifactDocument.title,
    artifactDocumentId: artifactDocument.artifactId,
    artifactVersionId: artifactDocument.metadata.currentVersionId,
    artifactVersionNo: artifactDocument.metadata.currentVersionNo,
    ...(artifactRef ? { artifactRef, appServerArtifactRef: artifactRef } : {}),
    articleWorkspaceCardPreview: buildArticleWorkspaceCardPreviewFacts({
      artifactIds,
      layout,
      object,
      preview,
    }),
    articleWorkspace: {
      appId: articleWorkspace.appId,
      sessionId: articleWorkspace.sessionId,
      workspaceId: articleWorkspace.workspaceId ?? null,
      objectKind: object.ref.kind,
      objectId: object.ref.id,
      artifactIds,
      surfaceKind: layout,
      layout,
    },
    workspacePatch: articleWorkspace,
  };

  if (layout === "imageGrid") {
    const firstImage = preview.images.find((image) =>
      Boolean(resolveWorkspaceArticleWorkspaceImageRenderSrc(image)),
    );
    const firstImageSrc = firstImage
      ? resolveWorkspaceArticleWorkspaceImageRenderSrc(firstImage)
      : null;
    if (firstImage && firstImageSrc) {
      const localPath =
        resolveWorkspaceArticleWorkspaceImageLocalPath(firstImage);
      const sourcePath =
        resolveWorkspaceArticleWorkspaceImageSourceLabel(firstImage) ||
        firstImageSrc;
      return createPreviewArtifact({
        source: localPath ? "file" : "artifact",
        sourceRef: localPath || firstImage.id || sourceRef,
        path: localPath || sourcePath,
        title: firstImage.title || object.title,
        isBinary: true,
        mimeType: resolveImageMimeType(sourcePath),
        previewUrl: firstImageSrc,
        meta: {
          ...meta,
          articleWorkspaceImage: {
            id: firstImage.id,
            url: firstImage.url ?? null,
            localPath,
            sourcePath,
          },
        },
        now,
      }).artifact;
    }
  }

  const content = buildPreviewMarkdown({
    artifactIds,
    layout,
    object,
    preview,
  });
  if (
    layout === "document" &&
    object.ref.kind === "articleDraft" &&
    !content.trim()
  ) {
    return null;
  }
  if (!content.trim() && artifactIds.length === 0) {
    return null;
  }

  return createPreviewArtifact({
    source: "artifact",
    sourceRef,
    path: `${buildPreviewFileStem(object.title || object.ref.id)}.md`,
    title: object.title,
    content:
      content.trim() ||
      [`# ${object.title}`, "", ...artifactIds.map((id) => `- ${id}`)].join(
        "\n",
      ),
    meta,
    now,
  }).artifact;
}

export function isWorkspaceArticleWorkspacePreviewArtifact(
  artifact: Artifact,
): boolean {
  return artifact.meta.openedFrom === "right_surface_article_workspace";
}

function buildArticleWorkspaceCardPreviewFacts({
  artifactIds,
  layout,
  object,
  preview,
}: Pick<
  WorkspaceArticleWorkspacePreviewArtifactInput,
  "artifactIds" | "layout" | "object" | "preview"
>) {
  return {
    layout,
    summary: object.summary?.trim() || null,
    counts: {
      artifacts: artifactIds.length,
      briefFields: preview.briefFields.length,
      citations: preview.citations.length,
      images: preview.images.length,
      imageSlots: preview.imageSlots.length,
      outlineSections: preview.outline.length,
      researchRounds: preview.researchRounds.length,
      reviewNotes: preview.reviewNotes.length,
      storyboardScenes: preview.storyboard.length,
      checklistItems: preview.checklist.length,
    },
  };
}

function buildPreviewMarkdown({
  artifactIds,
  layout,
  object,
  preview,
}: Pick<
  WorkspaceArticleWorkspacePreviewArtifactInput,
  "artifactIds" | "layout" | "object" | "preview"
>): string {
  if (preview.documentText) {
    return preview.documentText;
  }

  if (layout === "document" && object.ref.kind === "articleDraft") {
    return "";
  }

  const lines: string[] = [`# ${object.title}`];
  if (object.summary) {
    lines.push("", object.summary);
  }

  if (layout === "storyboard" && preview.storyboard.length > 0) {
    lines.push(
      "",
      ...preview.storyboard.flatMap((row, index) => [
        `${index + 1}. ${row.title}`,
        ...[row.description, row.visualPrompt, row.duration]
          .filter((item): item is string => Boolean(item))
          .map((item) => `   ${item}`),
      ]),
    );
  }

  if (layout === "checklist" && preview.checklist.length > 0) {
    lines.push(
      "",
      ...preview.checklist.map((item) =>
        [
          `- ${item.title}`,
          item.status ? `(${item.status})` : "",
          item.notes ? `: ${item.notes}` : "",
        ].join(" "),
      ),
    );
  }

  if (layout === "briefForm" && preview.briefFields.length > 0) {
    lines.push(
      "",
      ...preview.briefFields.map((field) => `- ${field.label}: ${field.value}`),
    );
  }

  if (layout === "imageGrid" && preview.images.length > 0) {
    lines.push(
      "",
      ...preview.images.map((image) =>
        [
          `- ${image.title}`,
          resolveWorkspaceArticleWorkspaceImageSourceLabel(image)
            ? ` ${resolveWorkspaceArticleWorkspaceImageSourceLabel(image)}`
            : "",
          image.prompt ? ` ${image.prompt}` : "",
        ].join(""),
      ),
    );
  }

  if (artifactIds.length > 0) {
    lines.push("", ...artifactIds.map((id) => `- ${id}`));
  }

  return lines.join("\n").trim();
}

function resolveImageMimeType(url: string): string | undefined {
  const extension = url.split("?")[0]?.split("#")[0]?.split(".").pop();
  switch (extension?.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return undefined;
  }
}

function buildPreviewFileStem(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 80) || "article-workspace-preview"
  );
}
