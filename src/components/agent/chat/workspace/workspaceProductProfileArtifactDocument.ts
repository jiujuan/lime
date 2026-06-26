import {
  ARTIFACT_DOCUMENT_SCHEMA_VERSION,
  type ArtifactChecklistItem,
  type ArtifactDocumentBlock,
  type ArtifactDocumentKind,
  type ArtifactDocumentSource,
  type ArtifactDocumentStatus,
  type ArtifactDocumentV1,
} from "@/lib/artifact-document";
import { buildWorkspaceProductObjectKey } from "./workspaceProductProfileSelection";
import type {
  WorkspaceProductObject,
  WorkspaceProductProfile,
  WorkspaceProductProfilePreviewChecklistItem,
  WorkspaceProductProfileStructuredPreview,
  WorkspaceProductProfileSurfaceLayout,
} from "./workspaceProductProfileModel";
import {
  resolveWorkspaceProductProfileImageLocalPath,
  resolveWorkspaceProductProfileImageRenderSrc,
  resolveWorkspaceProductProfileImageSourceLabel,
} from "./workspaceProductProfileImagePreview";

export interface WorkspaceProductProfileArtifactDocumentInput {
  artifactIds: string[];
  layout: WorkspaceProductProfileSurfaceLayout;
  object: WorkspaceProductObject;
  preview: WorkspaceProductProfileStructuredPreview;
  profile: WorkspaceProductProfile;
  now?: number;
}

export function buildWorkspaceProductProfileArtifactDocument({
  artifactIds,
  layout,
  now,
  object,
  preview,
  profile,
}: WorkspaceProductProfileArtifactDocumentInput): ArtifactDocumentV1 {
  const artifactId = buildArtifactDocumentId(profile, object, artifactIds);
  const versionNo = readObjectVersionNo(object);
  const versionId = `${artifactId}:v${versionNo}`;
  const createdAt = new Date(now ?? Date.now()).toISOString();
  const blocks = buildArtifactDocumentBlocks({ layout, object, preview });
  const sources = buildArtifactDocumentSources({ artifactIds, object });

  return {
    schemaVersion: ARTIFACT_DOCUMENT_SCHEMA_VERSION,
    artifactId,
    workspaceId: profile.workspaceId ?? undefined,
    threadId: undefined,
    turnId: object.ref.sourceTurnId ?? undefined,
    kind: resolveArtifactDocumentKind(object.ref.kind),
    title: object.title,
    status: resolveArtifactDocumentStatus(object.status),
    language: "zh-CN",
    summary: object.summary ?? preview.documentText?.slice(0, 160),
    blocks,
    sources,
    metadata: {
      generatedBy: "automation",
      currentVersionId: versionId,
      currentVersionNo: versionNo,
      versionHistory: [
        {
          id: versionId,
          artifactId,
          versionNo,
          title: object.title,
          kind: resolveArtifactDocumentKind(object.ref.kind),
          status: resolveArtifactDocumentStatus(object.status),
          summary: object.summary ?? undefined,
          createdBy: "automation",
          createdAt,
        },
      ],
      currentVersionDiff: {
        targetVersionId: versionId,
        targetVersionNo: versionNo,
        addedCount: blocks.length,
        removedCount: 0,
        updatedCount: 0,
        movedCount: 0,
        changedBlocks: blocks.map((block, index) => ({
          blockId: block.id,
          changeType: "added",
          afterType: block.type,
          afterIndex: index,
          afterText: resolveBlockText(block),
        })),
      },
      sourceRunBinding: {
        turnId: object.ref.sourceTurnId ?? undefined,
        taskId: object.ref.sourceTaskId ?? readString(object.source?.taskId),
        appId: profile.appId,
        sessionId: profile.sessionId,
      },
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
    },
  };
}

function buildArtifactDocumentBlocks({
  layout,
  object,
  preview,
}: Pick<
  WorkspaceProductProfileArtifactDocumentInput,
  "layout" | "object" | "preview"
>): ArtifactDocumentBlock[] {
  if (layout === "imageGrid" && preview.images.length > 0) {
    return preview.images.slice(0, 12).map((image, index) => ({
      id: `image-${index + 1}`,
      type: "image",
      url:
        resolveWorkspaceProductProfileImageRenderSrc(image) ??
        resolveWorkspaceProductProfileImageSourceLabel(image) ??
        "",
      alt: image.alt ?? image.title,
      caption: [image.title, image.prompt].filter(Boolean).join(" - "),
      metadata: {
        originalUrl: image.url ?? undefined,
        localPath:
          resolveWorkspaceProductProfileImageLocalPath(image) ?? undefined,
      },
    }));
  }

  if (layout === "storyboard" && preview.storyboard.length > 0) {
    return preview.storyboard.slice(0, 24).map((row, index) => ({
      id: `shot-${index + 1}`,
      type: "rich_text",
      contentFormat: "markdown",
      content: [
        `### ${index + 1}. ${row.title}`,
        row.description,
        row.visualPrompt,
        row.duration,
      ]
        .filter(Boolean)
        .join("\n\n"),
      markdown: [
        `### ${index + 1}. ${row.title}`,
        row.description,
        row.visualPrompt,
        row.duration,
      ]
        .filter(Boolean)
        .join("\n\n"),
    }));
  }

  if (layout === "checklist" && preview.checklist.length > 0) {
    return [
      {
        id: "checklist",
        type: "checklist",
        title: object.title,
        items: preview.checklist.map(readChecklistDocumentItem),
      },
    ];
  }

  if (layout === "briefForm" && preview.briefFields.length > 0) {
    return preview.briefFields.map((field, index) => ({
      id: `brief-${field.key || index + 1}`,
      type: "callout",
      tone: "neutral",
      title: field.label,
      body: field.value,
    }));
  }

  return [
    {
      id: "body",
      type: "rich_text",
      contentFormat: "markdown",
      content: preview.documentText || object.summary || object.title,
      markdown: preview.documentText || object.summary || object.title,
    },
  ];
}

function buildArtifactDocumentSources({
  artifactIds,
  object,
}: Pick<
  WorkspaceProductProfileArtifactDocumentInput,
  "artifactIds" | "object"
>): ArtifactDocumentSource[] {
  const sources: ArtifactDocumentSource[] = [];
  const taskKind = readString(object.source?.taskKind);
  const taskId = readString(object.source?.taskId, object.ref.sourceTaskId);
  if (taskKind || taskId || object.ref.sourceTurnId) {
    sources.push({
      id: "source-task",
      type: "tool",
      label: taskKind || taskId || "Product Profile",
      locator: {
        toolCallId: taskId || undefined,
        turnId: object.ref.sourceTurnId ?? undefined,
      },
      reliability: "derived",
    });
  }
  for (const artifactId of artifactIds) {
    sources.push({
      id: `artifact-${sanitizeId(artifactId)}`,
      type: "file",
      label: artifactId,
      locator: {
        path: artifactId,
      },
      reliability: "derived",
    });
  }
  return sources;
}

function readChecklistDocumentItem(
  item: WorkspaceProductProfilePreviewChecklistItem,
  index: number,
): ArtifactChecklistItem {
  return {
    id: item.id || `item-${index + 1}`,
    text: item.notes ? `${item.title}: ${item.notes}` : item.title,
    state:
      item.status === "done" || item.status === "ready" ? "done" : "todo",
  };
}

function buildArtifactDocumentId(
  profile: WorkspaceProductProfile,
  object: WorkspaceProductObject,
  artifactIds: readonly string[],
): string {
  const sourceRef = artifactIds[0] ?? buildWorkspaceProductObjectKey(object);
  return `artifact-document:${sanitizeId(profile.appId)}:${sanitizeId(sourceRef)}`;
}

function resolveArtifactDocumentKind(kind: string): ArtifactDocumentKind {
  switch (kind) {
    case "contentBrief":
      return "brief";
    case "deliveryChecklist":
      return "plan";
    case "videoStoryboard":
    case "imageGenerationSet":
      return "brief";
    default:
      return "report";
  }
}

function resolveArtifactDocumentStatus(status: string): ArtifactDocumentStatus {
  switch (status) {
    case "draft":
      return "draft";
    case "generating":
      return "streaming";
    case "failed":
      return "failed";
    case "archived":
      return "archived";
    default:
      return "ready";
  }
}

function readObjectVersionNo(object: WorkspaceProductObject): number {
  const parsed = Number.parseInt(object.ref.version ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function resolveBlockText(block: ArtifactDocumentBlock): string {
  if (block.type === "rich_text") {
    return typeof block.markdown === "string" ? block.markdown : "";
  }
  if (block.type === "callout") {
    return [block.title, block.body].filter(Boolean).join("\n");
  }
  if (block.type === "checklist") {
    return block.items.map((item) => item.text).join("\n");
  }
  if (block.type === "image") {
    return [block.caption, block.url].filter(Boolean).join("\n");
  }
  return "";
}

function sanitizeId(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._:-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "product-profile"
  );
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}
