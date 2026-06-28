import type { Artifact } from "@/lib/artifact/types";
import type { WriteArtifactContext } from "../types";
import { isHiddenConversationArtifactPath } from "../utils/internalArtifactVisibility";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readArtifactSource(
  artifact: Pick<Artifact, "meta">,
  context?: Pick<WriteArtifactContext, "source">,
): WriteArtifactContext["source"] | null {
  if (context?.source) {
    return context.source;
  }

  const source = artifact.meta.source;
  return source === "tool_start" ||
    source === "artifact_snapshot" ||
    source === "tool_result" ||
    source === "message_content"
    ? source
    : null;
}

function readArtifactFilePath(artifact: Pick<Artifact, "meta">): string | null {
  return (
    readNonEmptyString(artifact.meta.filePath) ??
    readNonEmptyString(artifact.meta.path) ??
    readNonEmptyString(artifact.meta.filename)
  );
}

function hasReadableArtifactContent(
  artifact: Pick<Artifact, "content" | "meta">,
): boolean {
  return Boolean(
    artifact.content.trim() ||
      readNonEmptyString(artifact.meta.previewText) ||
      artifact.meta.artifactDocument,
  );
}

function isArtifactReadyForCanvas(
  artifact: Pick<Artifact, "status" | "meta">,
  context?: Pick<WriteArtifactContext, "status" | "metadata">,
): boolean {
  const phase =
    readNonEmptyString(context?.metadata?.writePhase) ??
    readNonEmptyString(artifact.meta.writePhase);
  const status = context?.status ?? artifact.status;
  return (
    status === "complete" ||
    phase === "persisted" ||
    phase === "completed"
  );
}

export function shouldKeepGeneralArtifactInBackground(
  artifact: Pick<Artifact, "type" | "status" | "content" | "meta">,
  context?: Pick<WriteArtifactContext, "source">,
): boolean {
  const source = readArtifactSource(artifact, context);
  if (source === "tool_result") {
    return true;
  }

  if (artifact.type === "document" && source === "tool_start") {
    return true;
  }

  if (artifact.type === "document" && source === "artifact_snapshot") {
    const filePath = readArtifactFilePath(artifact);
    return (
      isHiddenConversationArtifactPath(filePath) ||
      !hasReadableArtifactContent(artifact)
    );
  }

  return false;
}

export function shouldAutoSelectGeneralArtifact(
  artifact: Pick<Artifact, "type" | "status" | "content" | "meta">,
): boolean {
  return !shouldKeepGeneralArtifactInBackground(artifact);
}

export function shouldOpenGeneralArtifactCanvas(
  artifact: Pick<Artifact, "type" | "status" | "content" | "meta">,
  context?: Pick<WriteArtifactContext, "source" | "status" | "metadata">,
): boolean {
  return (
    artifact.type === "document" &&
    isArtifactReadyForCanvas(artifact, context) &&
    !shouldKeepGeneralArtifactInBackground(artifact, context)
  );
}
