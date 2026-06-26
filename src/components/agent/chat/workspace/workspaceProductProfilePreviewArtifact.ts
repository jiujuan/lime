import { createPreviewArtifact } from "@/lib/artifact/previewArtifact";
import type { Artifact } from "@/lib/artifact/types";
import { buildWorkspaceProductProfileArtifactDocument } from "./workspaceProductProfileArtifactDocument";
import { buildWorkspaceProductObjectKey } from "./workspaceProductProfileSelection";
import type {
  WorkspaceProductObject,
  WorkspaceProductProfile,
  WorkspaceProductProfileStructuredPreview,
  WorkspaceProductProfileSurfaceLayout,
} from "./workspaceProductProfileModel";
import {
  resolveWorkspaceProductProfileImageLocalPath,
  resolveWorkspaceProductProfileImageRenderSrc,
  resolveWorkspaceProductProfileImageSourceLabel,
} from "./workspaceProductProfileImagePreview";

export interface WorkspaceProductProfilePreviewArtifactInput {
  profile: WorkspaceProductProfile;
  object: WorkspaceProductObject;
  layout: WorkspaceProductProfileSurfaceLayout;
  preview: WorkspaceProductProfileStructuredPreview;
  artifactIds: string[];
  now?: number;
}

export function buildWorkspaceProductProfilePreviewArtifact({
  artifactIds,
  layout,
  now,
  object,
  preview,
  profile,
}: WorkspaceProductProfilePreviewArtifactInput): Artifact | null {
  const sourceRef = artifactIds[0] ?? buildWorkspaceProductObjectKey(object);
  const artifactDocument = buildWorkspaceProductProfileArtifactDocument({
    artifactIds,
    layout,
    now,
    object,
    preview,
    profile,
  });
  const meta = {
    openedFrom: "right_surface_product_profile",
    artifactSchema: artifactDocument.schemaVersion,
    artifactKind: artifactDocument.kind,
    surfaceKind: layout,
    layout,
    artifactDocument,
    artifactTitle: artifactDocument.title,
    artifactDocumentId: artifactDocument.artifactId,
    artifactVersionId: artifactDocument.metadata.currentVersionId,
    artifactVersionNo: artifactDocument.metadata.currentVersionNo,
    productProfile: {
      appId: profile.appId,
      sessionId: profile.sessionId,
      workspaceId: profile.workspaceId ?? null,
      objectKind: object.ref.kind,
      objectId: object.ref.id,
      artifactIds,
      surfaceKind: layout,
      layout,
    },
  };

  if (layout === "imageGrid") {
    const firstImage = preview.images.find((image) =>
      Boolean(resolveWorkspaceProductProfileImageRenderSrc(image)),
    );
    const firstImageSrc = firstImage
      ? resolveWorkspaceProductProfileImageRenderSrc(firstImage)
      : null;
    if (firstImage && firstImageSrc) {
      const localPath = resolveWorkspaceProductProfileImageLocalPath(firstImage);
      const sourcePath =
        resolveWorkspaceProductProfileImageSourceLabel(firstImage) ||
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
          productProfileImage: {
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

function buildPreviewMarkdown({
  artifactIds,
  layout,
  object,
  preview,
}: Pick<
  WorkspaceProductProfilePreviewArtifactInput,
  "artifactIds" | "layout" | "object" | "preview"
>): string {
  if (preview.documentText) {
    return preview.documentText;
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
          resolveWorkspaceProductProfileImageSourceLabel(image)
            ? ` ${resolveWorkspaceProductProfileImageSourceLabel(image)}`
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
      .slice(0, 80) || "product-profile-preview"
  );
}
