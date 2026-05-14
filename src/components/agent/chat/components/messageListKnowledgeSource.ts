import type { Artifact } from "@/lib/artifact/types";
import { resolveArtifactProtocolFilePath } from "@/lib/artifact-protocol";
import { isHiddenConversationArtifactPath } from "../utils/internalArtifactVisibility";

export interface MessageListKnowledgeSource {
  sourceName?: string;
  description?: string | null;
  content: string;
}

function resolveKnowledgeSourceFromArtifact(
  artifact: Artifact,
): MessageListKnowledgeSource | null {
  if (
    isHiddenConversationArtifactPath(resolveArtifactProtocolFilePath(artifact))
  ) {
    return null;
  }

  const text = (artifact.content || "").trim();
  if (
    artifact.status === "error" ||
    text.length < 24 ||
    !["document", "code", "canvas:document"].includes(artifact.type)
  ) {
    return null;
  }

  const filename =
    typeof artifact.meta?.filename === "string" && artifact.meta.filename.trim()
      ? artifact.meta.filename.trim()
      : undefined;
  const title = (artifact.title || "").trim();

  return {
    sourceName: filename || title || undefined,
    description: title || filename || null,
    content: artifact.content,
  };
}

export function resolveKnowledgeSourceFromArtifacts(
  artifacts: Artifact[] | undefined,
): MessageListKnowledgeSource | null {
  const visibleArtifacts =
    artifacts?.filter(
      (artifact) =>
        !isHiddenConversationArtifactPath(
          resolveArtifactProtocolFilePath(artifact),
        ),
    ) ?? [];

  return [...visibleArtifacts]
    .reverse()
    .reduce<MessageListKnowledgeSource | null>(
      (matched, artifact) =>
        matched || resolveKnowledgeSourceFromArtifact(artifact),
      null,
    );
}
