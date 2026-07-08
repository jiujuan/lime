import type { Artifact } from "@/lib/artifact/types";
import type { Message, MessagePreviewTarget } from "../types";

type MediaReferencePreviewTarget = Extract<
  MessagePreviewTarget,
  { kind: "media_reference" }
>;

export interface MediaReferencePreviewPageRequest {
  message: Message;
  target: MediaReferencePreviewTarget;
}

export interface MediaReferencePreviewPageOpenRequest {
  offset: number;
  length?: number;
}

function readStringMeta(
  meta: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumberMeta(
  meta: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = meta[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function readBooleanMeta(
  meta: Record<string, unknown>,
  key: string,
): boolean {
  return meta[key] === true;
}

function createFallbackMessage(messageId: string): Message {
  return {
    id: messageId,
    role: "assistant",
    content: "",
    timestamp: new Date(0),
  };
}

function resolvePaginationLength(artifact: Artifact): number | undefined {
  return (
    readNumberMeta(artifact.meta, "mediaPreviewPageLength") ??
    readNumberMeta(artifact.meta, "mediaPreviewChunkBytes")
  );
}

export function resolveMediaReferencePreviewPageIndex(
  artifact: Artifact,
): number | undefined {
  return readNumberMeta(artifact.meta, "mediaPreviewPageIndex");
}

export function resolveMediaReferencePreviewPageRequest(
  artifact: Artifact,
  messages: Message[],
): MediaReferencePreviewPageRequest | null {
  if (artifact.meta.mediaPreviewRequiresPagination !== true) {
    return null;
  }

  const messageId = readStringMeta(artifact.meta, "messageId");
  const uri = readStringMeta(artifact.meta, "mediaUri");
  const contentPartIndex = readNumberMeta(artifact.meta, "contentPartIndex");
  if (!messageId || !uri || contentPartIndex === undefined) {
    return null;
  }

  const message =
    messages.find((candidate) => candidate.id === messageId) ??
    createFallbackMessage(messageId);
  return {
    message,
    target: {
      kind: "media_reference",
      index: contentPartIndex,
      reference: {
        kind: readStringMeta(artifact.meta, "mediaKind"),
        uri,
        mimeType: readStringMeta(artifact.meta, "mediaMimeType"),
        title: artifact.title,
        sidecarRef: artifact.meta.sidecarRef,
        sha256: readStringMeta(artifact.meta, "mediaSha256"),
        byteSize: readNumberMeta(artifact.meta, "mediaByteSize"),
      },
    },
  };
}

export function resolveMediaReferencePreviewPageOpenRequest(
  artifact: Artifact,
  direction: "previous" | "next",
): MediaReferencePreviewPageOpenRequest | null {
  const canRead =
    direction === "previous"
      ? readBooleanMeta(artifact.meta, "mediaPreviewCanReadPreviousPage")
      : readBooleanMeta(artifact.meta, "mediaPreviewCanReadNextPage");
  const offset =
    direction === "previous"
      ? readNumberMeta(artifact.meta, "mediaPreviewPreviousOffset")
      : readNumberMeta(artifact.meta, "mediaPreviewNextOffset");
  if (!canRead || offset === undefined) {
    return null;
  }
  return {
    offset,
    length: resolvePaginationLength(artifact),
  };
}
