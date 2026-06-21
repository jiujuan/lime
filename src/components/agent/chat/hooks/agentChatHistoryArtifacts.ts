import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import type { Artifact, ArtifactStatus, ArtifactType } from "@/lib/artifact/types";
import type { Message } from "../types";
import { mergeArtifacts } from "../utils/messageArtifacts";
import {
  asHistoryRecord,
  fileNameFromHistoryPath,
  parseHistoryTimestamp,
  readHistoryMetadataString,
  readHistoryNumber,
  readHistoryString,
} from "./agentChatHistoryPrimitives";

type HistoryArtifactSummary = {
  artifactRef?: unknown;
  eventId?: unknown;
  sequence?: unknown;
  turnId?: unknown;
  artifactId?: unknown;
  path?: unknown;
  title?: unknown;
  kind?: unknown;
  status?: unknown;
  contentStatus?: unknown;
  metadata?: unknown;
};

const HISTORY_ARTIFACT_TYPES = new Set<ArtifactType>([
  "document",
  "code",
  "html",
  "svg",
  "mermaid",
  "react",
  "browser_assist",
  "canvas:document",
  "canvas:video",
  "canvas:design",
]);

function historyArtifactTypeFromSummary(
  summary: HistoryArtifactSummary,
  path: string,
  metadata: Record<string, unknown> | null,
): ArtifactType {
  const explicit =
    readHistoryString(summary.kind) ||
    readHistoryMetadataString(metadata, ["artifact_type", "type", "kind"]);
  const normalizedExplicit = explicit.toLowerCase();
  if (HISTORY_ARTIFACT_TYPES.has(normalizedExplicit as ArtifactType)) {
    return normalizedExplicit as ArtifactType;
  }
  if (normalizedExplicit === "markdown" || normalizedExplicit === "text") {
    return "document";
  }
  const extension = fileNameFromHistoryPath(path)
    .split(".")
    .pop()
    ?.toLowerCase();
  if (extension === "html" || extension === "htm") {
    return "html";
  }
  if (extension === "svg") {
    return "svg";
  }
  if (extension === "mmd" || extension === "mermaid") {
    return "mermaid";
  }
  if (extension === "jsx" || extension === "tsx") {
    return "react";
  }
  if (extension === "md" || extension === "markdown" || extension === "txt") {
    return "document";
  }
  return "code";
}

function historyArtifactStatusFromSummary(
  summary: HistoryArtifactSummary,
): ArtifactStatus {
  const status = readHistoryString(summary.status).toLowerCase();
  if (status === "pending") {
    return "pending";
  }
  if (status === "streaming" || status === "running") {
    return "streaming";
  }
  if (status === "error" || status === "failed") {
    return "error";
  }
  return "complete";
}

function readHistoryArtifactSummaries(
  value: unknown,
): HistoryArtifactSummary[] {
  const record = asHistoryRecord(value);
  const artifacts = record?.artifacts;
  return Array.isArray(artifacts)
    ? artifacts.filter((artifact): artifact is HistoryArtifactSummary =>
        Boolean(asHistoryRecord(artifact)),
      )
    : [];
}

function collectHistoryArtifactSummaries(
  detail: AsterSessionDetail,
): HistoryArtifactSummary[] {
  const detailRecord = detail as AsterSessionDetail & {
    artifacts?: unknown;
    threadRead?: unknown;
  };
  return [
    ...readHistoryArtifactSummaries(detailRecord),
    ...readHistoryArtifactSummaries(detail.thread_read),
    ...readHistoryArtifactSummaries(detailRecord.threadRead),
  ];
}

function historyArtifactFromSummary(
  summary: HistoryArtifactSummary,
): Artifact | null {
  const metadata = asHistoryRecord(summary.metadata);
  const path =
    readHistoryString(summary.path) ||
    readHistoryMetadataString(metadata, [
      "filePath",
      "file_path",
      "path",
      "artifactPath",
      "artifact_path",
      "absolutePath",
      "absolute_path",
    ]);
  const id =
    readHistoryString(summary.artifactId) ||
    readHistoryString(summary.artifactRef) ||
    path ||
    readHistoryString(summary.eventId);
  if (!id || !path) {
    return null;
  }

  const title =
    readHistoryString(summary.title) ||
    readHistoryMetadataString(metadata, ["title", "filename", "fileName"]) ||
    fileNameFromHistoryPath(path);
  const previewText = readHistoryMetadataString(metadata, [
    "previewText",
    "preview_text",
    "contentPreview",
    "content_preview",
  ]);
  const now = Date.now();
  const timestamp =
    readHistoryNumber(metadata?.createdAt) ??
    readHistoryNumber(metadata?.updatedAt) ??
    now;

  return {
    id,
    type: historyArtifactTypeFromSummary(summary, path, metadata),
    title,
    content: previewText,
    status: historyArtifactStatusFromSummary(summary),
    meta: {
      ...(metadata ?? {}),
      artifactRef: readHistoryString(summary.artifactRef) || undefined,
      eventId: readHistoryString(summary.eventId) || undefined,
      sequence: readHistoryNumber(summary.sequence),
      turnId: readHistoryString(summary.turnId) || undefined,
      contentStatus: readHistoryString(summary.contentStatus) || undefined,
      filePath: path,
      artifactPath: path,
      path,
      previewText: previewText || undefined,
    },
    position: { start: 0, end: previewText.length },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function isCodeHistoryArtifact(artifact: Artifact): boolean {
  const metadata = asHistoryRecord(artifact.meta);
  const language = readHistoryMetadataString(metadata, [
    "language",
    "fileLanguage",
    "file_language",
  ]);
  if (language) {
    return true;
  }
  if (artifact.type === "code" || artifact.type === "react") {
    return true;
  }
  const path = readHistoryMetadataString(metadata, [
    "filePath",
    "file_path",
    "artifactPath",
    "artifact_path",
    "path",
  ]);
  const extension = fileNameFromHistoryPath(path)
    .split(".")
    .pop()
    ?.toLowerCase();
  return Boolean(
    extension &&
    [
      "c",
      "cc",
      "cpp",
      "cs",
      "css",
      "go",
      "h",
      "hpp",
      "java",
      "js",
      "jsx",
      "kt",
      "mjs",
      "py",
      "rs",
      "sql",
      "swift",
      "ts",
      "tsx",
    ].includes(extension),
  );
}

function historyMessageTextFromArtifacts(artifacts: Artifact[]): string {
  const firstCompleteArtifact =
    artifacts.find((artifact) => artifact.status === "complete") ??
    artifacts[0];
  if (!firstCompleteArtifact) {
    return "";
  }

  const metadata = asHistoryRecord(firstCompleteArtifact.meta);
  const explicitText = readHistoryMetadataString(metadata, [
    "completionText",
    "completion_text",
    "messageText",
    "message_text",
    "summaryText",
    "summary_text",
    "statusMessage",
    "status_message",
  ]);
  if (explicitText) {
    return explicitText;
  }

  return isCodeHistoryArtifact(firstCompleteArtifact)
    ? "已生成代码产物，可在工作台查看。"
    : "已生成产物，可在工作台查看。";
}

export function hydrateSessionDetailMessagesFromArtifacts(
  detail: AsterSessionDetail,
  topicId: string,
): Message[] {
  const artifacts = mergeArtifacts(
    collectHistoryArtifactSummaries(detail)
      .map(historyArtifactFromSummary)
      .filter((artifact): artifact is Artifact => artifact !== null),
  );
  if (artifacts.length === 0) {
    return [];
  }

  const content = historyMessageTextFromArtifacts(artifacts);
  const timestamp = parseHistoryTimestamp(
    detail.turns?.[0]?.completed_at ||
      detail.turns?.[0]?.updated_at ||
      detail.turns?.[0]?.started_at ||
      null,
  );
  return [
    {
      id: `${topicId}-app-server-artifacts`,
      role: "assistant",
      content,
      contentParts: content ? [{ type: "text", text: content }] : undefined,
      artifacts,
      timestamp,
      isThinking: false,
      runtimeTurnId: detail.turns?.[0]?.id,
    },
  ];
}
