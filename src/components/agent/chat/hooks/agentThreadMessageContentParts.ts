import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type { ContentPart, MessageMediaReference } from "../types";
import { buildAgentTextDeltaContentPartMetadata } from "../utils/contentPartTimeline";

type AgentMessageItem = Extract<AgentThreadItem, { type: "agent_message" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function isInlineMediaUri(uri: string): boolean {
  return uri.trimStart().toLowerCase().startsWith("data:");
}

function normalizeNonInlineSourceReference(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized || isInlineMediaUri(normalized)) {
    return null;
  }
  return normalized;
}

function buildBaseMetadata(
  item: AgentMessageItem,
  index: number,
): Record<string, unknown> {
  return {
    itemId: item.id,
    threadItemId: item.id,
    turnId: item.turn_id,
    sequence: item.sequence,
    contentPartIndex: index,
    ...(item.phase ? { phase: item.phase } : {}),
  };
}

function contentPartTextFallback(params: {
  caption: string | null;
  title: string | null;
  uri: string;
}): string {
  return params.caption ?? params.title ?? params.uri;
}

function buildMediaReference(params: {
  caption: string | null;
  title: string | null;
  uri: string;
  mimeType: string | null;
  mediaKind: string | null;
  sourceUri: string | null;
  sourcePath: string | null;
  previewUrl: string | null;
  sha256: string | null;
  byteSize?: number;
}): MessageMediaReference {
  return {
    uri: params.uri,
    ...(params.mediaKind ? { kind: params.mediaKind } : {}),
    ...(params.mimeType ? { mimeType: params.mimeType } : {}),
    ...(params.title ? { title: params.title } : {}),
    ...(params.caption ? { caption: params.caption } : {}),
    ...(params.sourceUri ? { sourceUri: params.sourceUri } : {}),
    ...(params.sourcePath ? { sourcePath: params.sourcePath } : {}),
    ...(params.previewUrl ? { previewUrl: params.previewUrl } : {}),
    ...(params.sha256 ? { sha256: params.sha256 } : {}),
    ...(typeof params.byteSize === "number"
      ? { byteSize: params.byteSize }
      : {}),
  };
}

function buildTextContentPart(
  item: AgentMessageItem,
  part: Record<string, unknown>,
  index: number,
): ContentPart | null {
  const text = normalizeString(part.text);
  if (!text) {
    return null;
  }
  const metadata = {
    ...buildAgentTextDeltaContentPartMetadata({
      itemId: item.id,
      phase: item.phase,
      sequence: item.sequence,
      turnId: item.turn_id,
    }),
    contentPartIndex: index,
    threadItemId: item.id,
  };
  return { type: "text", text, metadata };
}

function buildMediaReferenceContentPart(
  item: AgentMessageItem,
  part: Record<string, unknown>,
  index: number,
): ContentPart | null {
  const sourceReference = isRecord(part.reference) ? part.reference : null;
  const uri = normalizeString(sourceReference?.uri);
  if (!uri || isInlineMediaUri(uri)) {
    return null;
  }

  const caption = normalizeString(part.caption);
  const title = normalizeString(sourceReference?.title);
  const mimeType =
    normalizeString(sourceReference?.mime_type) ??
    normalizeString(sourceReference?.mimeType);
  const sourceUri =
    normalizeNonInlineSourceReference(sourceReference?.source_uri) ??
    normalizeNonInlineSourceReference(sourceReference?.sourceUri);
  const sourcePath =
    normalizeString(sourceReference?.source_path) ??
    normalizeString(sourceReference?.sourcePath);
  const previewUrl =
    normalizeNonInlineSourceReference(sourceReference?.preview_url) ??
    normalizeNonInlineSourceReference(sourceReference?.previewUrl);
  const sha256 = normalizeString(sourceReference?.sha256);
  const byteSize =
    typeof sourceReference?.byte_size === "number" &&
    Number.isFinite(sourceReference.byte_size)
      ? sourceReference.byte_size
      : typeof sourceReference?.byteSize === "number" &&
          Number.isFinite(sourceReference.byteSize)
        ? sourceReference.byteSize
      : undefined;
  const mediaKind = normalizeString(part.kind);

  const mediaReference = buildMediaReference({
    caption,
    title,
    uri,
    mimeType,
    mediaKind,
    sourceUri,
    sourcePath,
    previewUrl,
    sha256,
    byteSize,
  });
  if (!mediaReference.caption && !mediaReference.title) {
    mediaReference.caption = contentPartTextFallback({ caption, title, uri });
  }

  return {
    type: "media_reference",
    reference: mediaReference,
    metadata: {
      ...buildBaseMetadata(item, index),
      source: "agent_media_reference",
      referenceUri: uri,
      ...(mediaKind ? { mediaKind } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(title ? { title } : {}),
      ...(caption ? { caption } : {}),
      ...(sourceUri ? { sourceUri } : {}),
      ...(sourcePath ? { sourcePath } : {}),
      ...(previewUrl ? { previewUrl } : {}),
      ...(sha256 ? { sha256 } : {}),
      ...(typeof byteSize === "number" ? { byteSize } : {}),
    },
  };
}

export function messageContentPartsFromAgentThreadItem(
  item: AgentMessageItem,
): ContentPart[] {
  if (!Array.isArray(item.contentParts)) {
    return [];
  }

  return item.contentParts.flatMap((part, index) => {
    if (!isRecord(part)) {
      return [];
    }
    const partType = normalizeString(part.type);
    if (partType === "text") {
      const textPart = buildTextContentPart(item, part, index);
      return textPart ? [textPart] : [];
    }
    if (partType === "media") {
      const mediaPart = buildMediaReferenceContentPart(item, part, index);
      return mediaPart ? [mediaPart] : [];
    }
    return [];
  });
}
