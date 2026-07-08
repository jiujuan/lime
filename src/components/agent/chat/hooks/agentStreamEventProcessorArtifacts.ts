import type { Dispatch, SetStateAction } from "react";
import type {
  AgentEventArtifactSnapshot,
  AgentToolCallState,
} from "@/lib/api/agentProtocol";
import type { Artifact } from "@/lib/artifact/types";
import {
  extractArtifactProtocolPathsFromValue,
  isArtifactProtocolImagePath,
  resolveArtifactProtocolDocumentPayload,
  resolveArtifactProtocolFilePath,
  resolveArtifactProtocolPreviewText,
} from "@/lib/artifact-protocol";
import type {
  ContentPart,
  Message,
  MessageImageWorkbenchPreview,
  WriteArtifactContext,
} from "../types";
import {
  buildArtifactFromWrite,
  findMessageArtifact,
  upsertMessageArtifact,
} from "../utils/messageArtifacts";
import {
  collectArtifactDocumentSourcesFromToolCalls,
  mergeSourcesIntoArtifactDocument,
} from "../utils/artifactToolSources";
import { isHiddenInternalArtifactPath } from "../utils/internalArtifactVisibility";
import { readWorkspaceArticlePatchRecordFromMetadata } from "../workspace/workspaceArticleWorkspaceMetadata";

export interface BaseProcessorContext {
  assistantMsgId: string;
  activeSessionId: string;
  resolvedWorkspaceId: string;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}

export interface ArtifactWriteOptions {
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: WriteArtifactContext,
  ) => void;
}

export interface ToolTrackingContext {
  toolLogIdByToolId: Map<string, string>;
  toolStartedAtByToolId: Map<string, number>;
  toolNameByToolId: Map<string, string>;
}

function eventEnvelopeMetadata(
  data: object,
  existing?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const envelope = data as Partial<{
    event_id: string;
    sequence: number;
    session_id: string;
    thread_id: string;
    timestamp: string;
    turn_id: string;
  }>;
  const stableSequence =
    typeof existing?.sequence === "number" && Number.isFinite(existing.sequence)
      ? existing.sequence
      : typeof envelope.sequence === "number" &&
          Number.isFinite(envelope.sequence)
        ? envelope.sequence
        : undefined;
  const metadata = {
    ...(existing ?? {}),
    ...(typeof envelope.event_id === "string"
      ? { eventId: envelope.event_id }
      : {}),
    ...(stableSequence !== undefined ? { sequence: stableSequence } : {}),
    ...(typeof envelope.session_id === "string"
      ? { sessionId: envelope.session_id }
      : {}),
    ...(typeof envelope.thread_id === "string"
      ? { threadId: envelope.thread_id }
      : {}),
    ...(typeof envelope.turn_id === "string"
      ? { turnId: envelope.turn_id }
      : {}),
    ...(typeof envelope.timestamp === "string"
      ? { timestamp: envelope.timestamp }
      : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function toolUseContentPart(
  toolCall: AgentToolCallState,
  data: object,
  existing?: Extract<ContentPart, { type: "tool_use" }>,
): Extract<ContentPart, { type: "tool_use" }> {
  const metadata = eventEnvelopeMetadata(data, existing?.metadata);
  return {
    type: "tool_use",
    toolCall,
    ...(metadata ? { metadata } : {}),
  };
}

function normalizeToolNameForFileMutation(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function isFileMutationToolName(toolName: string): boolean {
  const normalized = normalizeToolNameForFileMutation(toolName);
  return [
    "write",
    "create",
    "save",
    "output",
    "edit",
    "patch",
    "update",
    "replace",
  ].some((keyword) => normalized.includes(keyword));
}

function resolveImageTaskPreviewProgressScore(
  preview?: MessageImageWorkbenchPreview,
): number {
  switch (preview?.status) {
    case "complete":
    case "failed":
    case "cancelled":
      return 3;
    case "partial":
      return 2;
    case "running":
      return 1;
    default:
      return 0;
  }
}

function mergeImageTaskPreviewByProgress(
  current: MessageImageWorkbenchPreview | undefined,
  candidate: MessageImageWorkbenchPreview | undefined,
): MessageImageWorkbenchPreview | undefined {
  if (!current) {
    return candidate;
  }
  if (!candidate || candidate.taskId !== current.taskId) {
    return current;
  }

  const candidateIsAtLeastAsFresh =
    resolveImageTaskPreviewProgressScore(candidate) >=
    resolveImageTaskPreviewProgressScore(current);
  return candidateIsAtLeastAsFresh
    ? {
        ...current,
        ...candidate,
      }
    : {
        ...candidate,
        ...current,
      };
}

export function collapseAssistantImageTaskPreviewDuplicates(params: {
  messages: Message[];
  assistantMsgId: string;
  taskId: string;
}): Message[] {
  let mergedPreview: MessageImageWorkbenchPreview | undefined;
  const retainedMessages: Message[] = [];

  params.messages.forEach((message) => {
    const preview = message.imageWorkbenchPreview;
    const isSameImageTask =
      message.role === "assistant" && preview?.taskId === params.taskId;
    if (message.id === params.assistantMsgId) {
      mergedPreview = mergeImageTaskPreviewByProgress(mergedPreview, preview);
      retainedMessages.push(message);
      return;
    }
    if (isSameImageTask) {
      mergedPreview = mergeImageTaskPreviewByProgress(mergedPreview, preview);
      return;
    }
    retainedMessages.push(message);
  });

  if (!mergedPreview) {
    return retainedMessages;
  }

  return retainedMessages.map((message) =>
    message.id === params.assistantMsgId
      ? {
          ...message,
          imageWorkbenchPreview: mergeImageTaskPreviewByProgress(
            message.imageWorkbenchPreview,
            mergedPreview,
          ),
        }
      : message,
  );
}

function extractPatchPath(rawText?: string): string | undefined {
  if (!rawText) {
    return undefined;
  }

  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    for (const prefix of [
      "*** Add File:",
      "*** Update File:",
      "*** Delete File:",
      "*** Move to:",
    ]) {
      if (trimmed.startsWith(prefix)) {
        const path = trimmed.slice(prefix.length).trim();
        if (path) {
          return path.replace(/\\/g, "/");
        }
      }
    }
  }

  return undefined;
}

export function shouldSkipBinaryArtifactWrite(params: {
  filePath: string;
  content: string;
  source: WriteArtifactContext["source"];
}): boolean {
  const isToolOrSnapshotSource =
    params.source === "tool_result" || params.source === "artifact_snapshot";
  if (isToolOrSnapshotSource && isHiddenInternalArtifactPath(params.filePath)) {
    return true;
  }

  return (
    params.content.length === 0 &&
    isArtifactProtocolImagePath(params.filePath) &&
    isToolOrSnapshotSource
  );
}

export function resolveArtifactSnapshotContent(
  data: AgentEventArtifactSnapshot,
): string {
  if (typeof data.artifact.content === "string") {
    return data.artifact.content;
  }

  const patch = readWorkspaceArticlePatchRecordFromMetadata(
    data.artifact.metadata ?? null,
  );
  if (!patch || typeof patch !== "object") {
    return "";
  }

  try {
    return JSON.stringify(patch);
  } catch {
    return "";
  }
}

function extractPatchText(
  toolArgs: Record<string, unknown> | null,
): string | undefined {
  if (!toolArgs) {
    return undefined;
  }

  for (const key of ["patch", "command", "cmd", "script"]) {
    const value = toolArgs[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value)) {
      const text = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .join("\n");
      if (text) {
        return text;
      }
    }
  }

  return undefined;
}

export function extractToolArgPath(
  toolArgs: Record<string, unknown> | null,
): string | undefined {
  if (!toolArgs) {
    return undefined;
  }

  const protocolPath = extractArtifactProtocolPathsFromValue(toolArgs)[0];
  if (protocolPath) {
    return protocolPath;
  }

  return extractPatchPath(extractPatchText(toolArgs));
}

export function extractWriteLikeContent(
  toolArgs: Record<string, unknown> | null,
): string | undefined {
  const directContent = extractToolArgContent(toolArgs);
  if (directContent !== undefined) {
    return directContent;
  }

  return undefined;
}

function extractToolArgContent(
  toolArgs: Record<string, unknown> | null,
): string | undefined {
  if (!toolArgs) {
    return undefined;
  }

  for (const key of ["content", "text", "contents", "body"]) {
    const value = toolArgs[key];
    if (typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

export function buildWriteMetadata(
  baseMetadata: Record<string, unknown> | undefined,
  options: {
    source: WriteArtifactContext["source"];
    phase: "preparing" | "streaming" | "persisted" | "completed" | "failed";
    content: string;
    isPartial: boolean;
  },
): WriteArtifactContext["metadata"] {
  const previewText = options.content.trim()
    ? options.content.slice(0, 480).trim()
    : undefined;
  const latestChunk = options.content.trim()
    ? options.content.slice(-240).trim()
    : undefined;

  return {
    ...(baseMetadata || {}),
    writePhase: options.phase,
    previewText,
    latestChunk,
    isPartial: options.isPartial,
    lastUpdateSource: options.source,
  };
}

function buildWriteMetadataWithToolSources({
  content,
  metadata,
  artifact,
  toolCalls,
}: {
  content: string;
  metadata: WriteArtifactContext["metadata"] | undefined;
  artifact?: Artifact;
  toolCalls: NonNullable<Message["toolCalls"]>;
}): {
  metadata: WriteArtifactContext["metadata"] | undefined;
  changed: boolean;
} {
  const toolSources = collectArtifactDocumentSourcesFromToolCalls(toolCalls);
  if (toolSources.length === 0) {
    return {
      metadata,
      changed: false,
    };
  }

  const existingArtifactDocument = artifact
    ? resolveArtifactProtocolDocumentPayload({
        content: artifact.content,
        metadata:
          artifact.meta && typeof artifact.meta === "object"
            ? (artifact.meta as Record<string, unknown>)
            : undefined,
      })
    : null;
  const currentArtifactDocument = resolveArtifactProtocolDocumentPayload({
    content,
    metadata,
    previous: existingArtifactDocument,
  });
  const mergedArtifactDocument = mergeSourcesIntoArtifactDocument(
    currentArtifactDocument,
    toolSources,
  );
  if (!mergedArtifactDocument || !currentArtifactDocument) {
    return {
      metadata,
      changed: false,
    };
  }

  const currentSourcesKey = JSON.stringify(
    currentArtifactDocument.sources || [],
  );
  const nextSourcesKey = JSON.stringify(mergedArtifactDocument.sources || []);
  if (currentSourcesKey === nextSourcesKey) {
    return {
      metadata,
      changed: false,
    };
  }

  return {
    metadata: {
      ...(metadata || {}),
      artifactSchema: mergedArtifactDocument.schemaVersion,
      artifactDocument: mergedArtifactDocument,
      previewText:
        typeof metadata?.previewText === "string" && metadata.previewText.trim()
          ? metadata.previewText
          : resolveArtifactProtocolPreviewText(mergedArtifactDocument),
    },
    changed: true,
  };
}

export function appendToolLiveLog(
  logs: string[] | undefined,
  message: string | undefined,
): string[] | undefined {
  const normalized = message?.trim();
  if (!normalized) {
    return logs;
  }

  const previous = logs || [];
  if (previous[previous.length - 1] === normalized) {
    return previous;
  }

  return [...previous, normalized].slice(-40);
}

export function mergeToolStreamMetadata(
  current: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
  extra?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const merged = {
    ...(current || {}),
    ...(incoming || {}),
    ...(extra || {}),
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function upsertAssistantWriteArtifact({
  assistantMsgId,
  setMessages,
  filePath,
  content,
  context,
}: {
  assistantMsgId: string;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  filePath: string;
  content: string;
  context: Omit<WriteArtifactContext, "artifact">;
}): Artifact | null {
  let nextArtifact: Artifact | null = null;

  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== assistantMsgId) {
        return message;
      }

      const existingArtifact = findMessageArtifact(message, {
        artifactId: context.artifactId,
        filePath,
      });
      const nextContent = resolveNextArtifactSnapshotContent(
        existingArtifact,
        content,
      );
      const { metadata: nextMetadata } = buildWriteMetadataWithToolSources({
        content: nextContent,
        metadata: context.metadata,
        artifact: existingArtifact,
        toolCalls: message.toolCalls || [],
      });
      nextArtifact = buildArtifactFromWrite({
        filePath,
        content: nextContent,
        context: {
          ...context,
          artifact: existingArtifact,
          artifactId: existingArtifact?.id || context.artifactId,
          metadata: nextMetadata,
        },
      });

      return upsertMessageArtifact(message, nextArtifact);
    }),
  );

  return nextArtifact;
}

function resolveNextArtifactSnapshotContent(
  existingArtifact: Artifact | undefined,
  incomingContent: string,
): string {
  if (!existingArtifact) {
    return incomingContent;
  }
  if (!incomingContent.length) {
    return existingArtifact.content;
  }
  if (
    existingArtifact.content.length > incomingContent.length &&
    existingArtifact.content.startsWith(incomingContent)
  ) {
    return existingArtifact.content;
  }
  return incomingContent;
}

export function refreshAssistantArtifactDocumentsFromToolSources({
  assistantMsgId,
  setMessages,
  onWriteFile,
}: BaseProcessorContext & ArtifactWriteOptions): Artifact[] {
  const emittedArtifacts: Artifact[] = [];

  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== assistantMsgId || !message.artifacts?.length) {
        return message;
      }

      const nextArtifacts = message.artifacts.map((artifact) => {
        const filePath = resolveArtifactProtocolFilePath(artifact);
        const { metadata: nextMetadata, changed } =
          buildWriteMetadataWithToolSources({
            content: artifact.content,
            metadata:
              artifact.meta && typeof artifact.meta === "object"
                ? (artifact.meta as WriteArtifactContext["metadata"])
                : undefined,
            artifact,
            toolCalls: message.toolCalls || [],
          });

        if (!changed) {
          return artifact;
        }

        const nextArtifact = buildArtifactFromWrite({
          filePath,
          content: artifact.content,
          context: {
            artifact,
            artifactId: artifact.id,
            source: "tool_result",
            sourceMessageId: assistantMsgId,
            status: artifact.status,
            metadata: nextMetadata,
          },
        });
        emittedArtifacts.push(nextArtifact);
        return nextArtifact;
      });

      const hasChanges = nextArtifacts.some(
        (artifact, index) => artifact !== message.artifacts?.[index],
      );
      if (!hasChanges) {
        return message;
      }

      return {
        ...message,
        artifacts: nextArtifacts,
      };
    }),
  );

  for (const artifact of emittedArtifacts) {
    const filePath = resolveArtifactProtocolFilePath(artifact);
    onWriteFile?.(artifact.content, filePath, {
      artifact,
      artifactId: artifact.id,
      source: "tool_result",
      sourceMessageId: assistantMsgId,
      status: artifact.status,
      metadata: artifact.meta,
    });
  }

  return emittedArtifacts;
}
