import type { Dispatch, SetStateAction } from "react";
import type {
  AgentEventActionRequired,
  AgentEventArtifactSnapshot,
  AgentEventContextTrace,
  AgentEventToolEnd,
  AgentEventToolInputDelta,
  AgentEventToolOutputDelta,
  AgentEventToolProgress,
  AgentEventToolStart,
  AgentToolCallState,
} from "@/lib/api/agentProtocol";
import type { AsterExecutionStrategy } from "@/lib/api/agentRuntime";
import type { Artifact } from "@/lib/artifact/types";
import {
  extractArtifactProtocolPaths,
  extractArtifactProtocolPathsFromValue,
  isArtifactProtocolImagePath,
  resolveArtifactProtocolDocumentPayload,
  resolveArtifactProtocolFilePath,
  resolveArtifactProtocolPreviewText,
} from "@/lib/artifact-protocol";
import type {
  ActionRequired,
  ContentPart,
  Message,
  MessageImageWorkbenchPreview,
  WriteArtifactContext,
} from "../types";
import { activityLogger } from "@/lib/workspace/workbenchRuntime";
import {
  extractQuestionsFromRequestedSchema,
  isAskToolName,
  normalizeAskOptions,
  normalizeActionQuestions,
  parseJsonObject,
  resolveAskQuestionText,
  resolveAskRequestId,
  truncateForLog,
} from "./agentChatCoreUtils";
import { upsertAssistantActionRequest } from "./agentChatActionState";
import {
  isToolResultSuccessful,
  normalizeIncomingToolResult,
} from "./agentChatToolResult";
import { governActionRequest } from "../utils/actionRequestGovernance";
import {
  buildArtifactFromWrite,
  findMessageArtifact,
  upsertMessageArtifact,
} from "../utils/messageArtifacts";
import { aggregateFileChanges } from "../utils/fileChangeSummary";
import {
  collectArtifactDocumentSourcesFromToolCalls,
  mergeSourcesIntoArtifactDocument,
} from "../utils/artifactToolSources";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import { buildContextRuntimeStatus } from "../utils/agentRuntimeStatus";
import {
  buildImageTaskPreviewFromToolResult,
  buildTaskPreviewFromToolResult,
  buildToolResultArtifactFromToolResult,
} from "../utils/taskPreviewFromToolResult";

interface BaseProcessorContext {
  assistantMsgId: string;
  activeSessionId: string;
  resolvedWorkspaceId: string;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}

interface ArtifactWriteOptions {
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: WriteArtifactContext,
  ) => void;
}

interface ToolTrackingContext {
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

function toolUseContentPart(
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

function isFileMutationToolName(toolName: string): boolean {
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

function collapseAssistantImageTaskPreviewDuplicates(params: {
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

function shouldSkipBinaryArtifactWrite(params: {
  filePath: string;
  content: string;
  source: WriteArtifactContext["source"];
}): boolean {
  return (
    params.content.length === 0 &&
    isArtifactProtocolImagePath(params.filePath) &&
    (params.source === "tool_result" || params.source === "artifact_snapshot")
  );
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

function extractToolArgPath(
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

function extractWriteLikeContent(
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

function buildWriteMetadata(
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

function appendToolLiveLog(
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

function mergeToolStreamMetadata(
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

function upsertAssistantWriteArtifact({
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
      const nextContent =
        content.length > 0 || !existingArtifact
          ? content
          : existingArtifact.content;
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

function refreshAssistantArtifactDocumentsFromToolSources({
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

export function handleToolStartEvent({
  data,
  setPendingActions,
  onWriteFile,
  toolLogIdByToolId,
  toolStartedAtByToolId,
  toolNameByToolId,
  setMessages,
  assistantMsgId,
  activeSessionId,
  resolvedWorkspaceId,
}: BaseProcessorContext &
  ArtifactWriteOptions &
  ToolTrackingContext & {
    data: AgentEventToolStart;
    setPendingActions: Dispatch<SetStateAction<ActionRequired[]>>;
  }) {
  const startedAt = Date.now();
  const newToolCall = {
    id: data.tool_id,
    name: data.tool_name,
    arguments: data.arguments,
    status: "running" as const,
    startTime: new Date(),
  };

  if (!toolLogIdByToolId.has(data.tool_id)) {
    const toolLogId = activityLogger.log({
      eventType: "tool_start",
      status: "pending",
      title: `调用工具 ${data.tool_name}`,
      description: truncateForLog(data.arguments || "等待工具结果"),
      workspaceId: resolvedWorkspaceId,
      sessionId: activeSessionId,
      source: "aster-chat",
      correlationId: data.tool_id,
      metadata: {
        toolId: data.tool_id,
        toolName: data.tool_name,
      },
    });
    toolLogIdByToolId.set(data.tool_id, toolLogId);
    toolStartedAtByToolId.set(data.tool_id, startedAt);
    toolNameByToolId.set(data.tool_id, data.tool_name);
  }

  const toolArgs = parseJsonObject(data.arguments);
  const toolName = data.tool_name.toLowerCase();
  if (isFileMutationToolName(toolName)) {
    const filePath = extractToolArgPath(toolArgs);
    const fileContent = extractWriteLikeContent(toolArgs) || "";
    if (filePath) {
      const baseMetadata =
        toolArgs?.metadata && typeof toolArgs.metadata === "object"
          ? (toolArgs.metadata as Record<string, unknown>)
          : undefined;
      const writeContext: WriteArtifactContext = {
        artifactId: `artifact:${assistantMsgId}:${filePath}`,
        source: "tool_start",
        sourceMessageId: assistantMsgId,
        status: "streaming",
        metadata: buildWriteMetadata(baseMetadata, {
          source: "tool_start",
          phase: fileContent.trim() ? "streaming" : "preparing",
          content: fileContent,
          isPartial: true,
        }),
      };
      const nextArtifact = upsertAssistantWriteArtifact({
        assistantMsgId,
        setMessages,
        filePath,
        content: fileContent,
        context: writeContext,
      });
      const emittedArtifact =
        nextArtifact ||
        buildArtifactFromWrite({
          filePath,
          content: fileContent,
          context: writeContext,
        });

      if (emittedArtifact) {
        onWriteFile?.(fileContent, filePath, {
          artifact: emittedArtifact,
          artifactId: emittedArtifact.id,
          source: "tool_start",
          sourceMessageId: assistantMsgId,
          status: emittedArtifact.status,
          metadata: emittedArtifact.meta,
        });
      }
    }
  }

  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== assistantMsgId) {
        return message;
      }

      const updateToolCall = (
        toolCall: AgentToolCallState,
      ): AgentToolCallState =>
        toolCall.id === data.tool_id
          ? {
              ...toolCall,
              name: data.tool_name || toolCall.name,
              arguments: data.arguments ?? toolCall.arguments,
              status: "running",
              startTime: toolCall.startTime || new Date(),
            }
          : toolCall;
      const hasExistingToolCall = Boolean(
        message.toolCalls?.find((toolCall) => toolCall.id === data.tool_id),
      );

      if (hasExistingToolCall) {
        return {
          ...message,
          toolCalls: message.toolCalls?.map(updateToolCall),
          contentParts: message.contentParts?.map((part) =>
            part.type === "tool_use" && part.toolCall.id === data.tool_id
              ? toolUseContentPart(updateToolCall(part.toolCall), data, part)
              : part,
          ),
        };
      }

      return {
        ...message,
        toolCalls: [...(message.toolCalls || []), newToolCall],
        contentParts: [
          ...(message.contentParts || []),
          toolUseContentPart(newToolCall, data),
        ],
      };
    }),
  );

  if (!isAskToolName(data.tool_name)) {
    return;
  }

  const requestIdFromArgs = resolveAskRequestId(toolArgs);
  const question =
    (toolArgs && resolveAskQuestionText(toolArgs)) || "请提供继续执行所需信息";
  const questionList = toolArgs
    ? normalizeActionQuestions(toolArgs?.questions)
    : undefined;
  const askOptions = normalizeAskOptions(
    toolArgs?.options || toolArgs?.choices || toolArgs?.enum,
  );
  const explicitRequestId = requestIdFromArgs?.trim();
  const normalizedQuestions = questionList ?? [
    {
      question,
      options: askOptions,
      multiSelect: false,
    },
  ];

  const fallbackAction: ActionRequired = {
    requestId:
      explicitRequestId || `fallback:${data.tool_id || crypto.randomUUID()}`,
    actionType: "ask_user",
    prompt: question,
    isFallback: !explicitRequestId,
    questions: normalizedQuestions,
  };

  upsertAssistantActionRequest({
    assistantMsgId,
    actionData: fallbackAction,
    replaceByPrompt: true,
    setPendingActions,
    setMessages,
  });
}

export function handleToolInputDeltaEvent({
  data,
  toolLogIdByToolId,
  toolStartedAtByToolId,
  toolNameByToolId,
  setMessages,
  assistantMsgId,
  activeSessionId,
  resolvedWorkspaceId,
}: Pick<
  BaseProcessorContext,
  "assistantMsgId" | "activeSessionId" | "resolvedWorkspaceId" | "setMessages"
> &
  ToolTrackingContext & {
    data: AgentEventToolInputDelta;
  }) {
  const accumulatedArguments = data.accumulated_arguments ?? data.delta;
  const toolName =
    data.tool_name || toolNameByToolId.get(data.tool_id) || "工具输入准备中";
  const progressDescription = accumulatedArguments.trim()
    ? `正在生成工具输入：${truncateForLog(accumulatedArguments, 120)}`
    : "正在生成工具输入";

  if (!toolLogIdByToolId.has(data.tool_id)) {
    const toolLogId = activityLogger.log({
      eventType: "tool_start",
      status: "pending",
      title: `准备工具 ${toolName}`,
      description: progressDescription,
      workspaceId: resolvedWorkspaceId,
      sessionId: activeSessionId,
      source: "aster-chat",
      correlationId: data.tool_id,
      metadata: {
        toolId: data.tool_id,
        toolName,
        provider: data.provider,
        inputStreaming: true,
      },
    });
    toolLogIdByToolId.set(data.tool_id, toolLogId);
    toolStartedAtByToolId.set(data.tool_id, Date.now());
  } else {
    const toolLogId = toolLogIdByToolId.get(data.tool_id);
    if (toolLogId) {
      activityLogger.updateLog(toolLogId, {
        status: "pending",
        description: progressDescription,
      });
    }
  }
  toolNameByToolId.set(data.tool_id, toolName);

  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== assistantMsgId) {
        return message;
      }

      const updateToolCall = (
        toolCall: AgentToolCallState,
      ): AgentToolCallState =>
        toolCall.id === data.tool_id
          ? {
              ...toolCall,
              name: data.tool_name || toolCall.name,
              arguments: accumulatedArguments,
              status: "running",
              progress: {
                ...(toolCall.progress || {}),
                message: progressDescription,
                metadata: {
                  ...(toolCall.progress?.metadata || {}),
                  provider: data.provider,
                  input_streaming: true,
                },
                updatedAt: new Date(),
              },
              logs: appendToolLiveLog(toolCall.logs, progressDescription),
            }
          : toolCall;
      const existingToolCall = message.toolCalls?.find(
        (toolCall) => toolCall.id === data.tool_id,
      );

      if (existingToolCall) {
        return {
          ...message,
          toolCalls: message.toolCalls?.map(updateToolCall),
          contentParts: message.contentParts?.map((part) =>
            part.type === "tool_use" && part.toolCall.id === data.tool_id
              ? toolUseContentPart(updateToolCall(part.toolCall), data, part)
              : part,
          ),
        };
      }

      const newToolCall: AgentToolCallState = {
        id: data.tool_id,
        name: toolName,
        arguments: accumulatedArguments,
        status: "running",
        progress: {
          message: progressDescription,
          metadata: {
            provider: data.provider,
            input_streaming: true,
          },
          updatedAt: new Date(),
        },
        logs: [progressDescription],
        startTime: new Date(),
      };

      return {
        ...message,
        toolCalls: [...(message.toolCalls || []), newToolCall],
        contentParts: [
          ...(message.contentParts || []),
          toolUseContentPart(newToolCall, data),
        ],
      };
    }),
  );
}

export function handleToolProgressEvent({
  data,
  toolLogIdByToolId,
  setMessages,
  assistantMsgId,
}: Pick<BaseProcessorContext, "assistantMsgId" | "setMessages"> &
  Pick<ToolTrackingContext, "toolLogIdByToolId"> & {
    data: AgentEventToolProgress;
  }) {
  const progressMessage = data.progress.message?.trim();
  const progressDescription =
    progressMessage ||
    (typeof data.progress.progress === "number"
      ? `工具进度 ${data.progress.progress}${
          typeof data.progress.total === "number"
            ? `/${data.progress.total}`
            : ""
        }`
      : undefined);

  const toolLogId = toolLogIdByToolId.get(data.tool_id);
  if (toolLogId && progressDescription) {
    activityLogger.updateLog(toolLogId, {
      status: "pending",
      description: truncateForLog(progressDescription, 120),
    });
  }

  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== assistantMsgId) {
        return message;
      }

      const updateToolCall = (
        toolCall: AgentToolCallState,
      ): AgentToolCallState => {
        if (toolCall.id !== data.tool_id) {
          return toolCall;
        }

        return {
          ...toolCall,
          progress: {
            ...data.progress,
            updatedAt: new Date(),
          },
          logs: appendToolLiveLog(toolCall.logs, progressDescription),
        };
      };

      return {
        ...message,
        toolCalls: message.toolCalls?.map(updateToolCall),
        contentParts: message.contentParts?.map((part) =>
          part.type === "tool_use" && part.toolCall.id === data.tool_id
            ? toolUseContentPart(updateToolCall(part.toolCall), data, part)
            : part,
        ),
      };
    }),
  );
}

export function handleToolOutputDeltaEvent({
  data,
  toolLogIdByToolId,
  setMessages,
  assistantMsgId,
}: Pick<BaseProcessorContext, "assistantMsgId" | "setMessages"> &
  Pick<ToolTrackingContext, "toolLogIdByToolId"> & {
    data: AgentEventToolOutputDelta;
  }) {
  if (!data.delta) {
    return;
  }

  const toolLogId = toolLogIdByToolId.get(data.tool_id);
  if (toolLogId) {
    activityLogger.updateLog(toolLogId, {
      status: "pending",
      description: truncateForLog(data.delta, 120),
    });
  }

  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== assistantMsgId) {
        return message;
      }

      const updateToolCall = (
        toolCall: AgentToolCallState,
      ): AgentToolCallState => {
        if (toolCall.id !== data.tool_id) {
          return toolCall;
        }

        const currentResult = toolCall.result;
        const nextOutput = `${currentResult?.output || ""}${data.delta}`;
        return {
          ...toolCall,
          result: {
            success: currentResult?.success ?? true,
            output: nextOutput,
            error: currentResult?.error,
            images: currentResult?.images,
            metadata: mergeToolStreamMetadata(
              currentResult?.metadata,
              data.metadata,
              {
                streaming: true,
                ...(data.output_kind ? { output_kind: data.output_kind } : {}),
              },
            ),
          },
          logs: appendToolLiveLog(toolCall.logs, data.delta),
        };
      };

      return {
        ...message,
        toolCalls: message.toolCalls?.map(updateToolCall),
        contentParts: message.contentParts?.map((part) =>
          part.type === "tool_use" && part.toolCall.id === data.tool_id
            ? toolUseContentPart(updateToolCall(part.toolCall), data, part)
            : part,
        ),
      };
    }),
  );
}

export function handleToolEndEvent({
  data,
  onWriteFile,
  toolLogIdByToolId,
  toolStartedAtByToolId,
  toolNameByToolId,
  setMessages,
  assistantMsgId,
  activeSessionId,
  resolvedWorkspaceId,
}: BaseProcessorContext &
  ArtifactWriteOptions &
  ToolTrackingContext & {
    data: AgentEventToolEnd;
  }) {
  const normalizedResult =
    normalizeIncomingToolResult(data.result) || data.result;
  const isSuccess = isToolResultSuccessful(normalizedResult);
  const eventType = isSuccess ? "tool_complete" : "tool_error";
  const startedAt = toolStartedAtByToolId.get(data.tool_id);
  const toolName = toolNameByToolId.get(data.tool_id) || "未知工具";
  const duration =
    typeof startedAt === "number" ? Date.now() - startedAt : undefined;
  const toolLogId = toolLogIdByToolId.get(data.tool_id);
  const outputText = truncateForLog(
    normalizedResult.output || normalizedResult.error || "",
    120,
  );

  if (toolLogId) {
    activityLogger.updateLog(toolLogId, {
      eventType,
      status: isSuccess ? "success" : "error",
      duration,
      description: outputText || (isSuccess ? "工具执行完成" : "工具执行失败"),
      error: isSuccess ? undefined : outputText || "工具返回失败状态",
    });
  } else {
    activityLogger.log({
      eventType,
      status: isSuccess ? "success" : "error",
      title: `工具 ${toolName}`,
      description: outputText || (isSuccess ? "工具执行完成" : "工具执行失败"),
      duration,
      workspaceId: resolvedWorkspaceId,
      sessionId: activeSessionId,
      source: "aster-chat",
      correlationId: data.tool_id,
    });
  }

  setMessages((prev) => {
    let completedImageTaskId: string | null = null;
    const nextMessages = prev.map((message) => {
      if (message.id !== assistantMsgId) {
        return message;
      }

      const currentToolCall = message.toolCalls?.find(
        (toolCall) => toolCall.id === data.tool_id,
      );
      const currentToolArguments = currentToolCall?.arguments;
      const normalizedResultRecord =
        normalizedResult &&
        typeof normalizedResult === "object" &&
        !Array.isArray(normalizedResult)
          ? (normalizedResult as unknown as Record<string, unknown>)
          : undefined;
      const updatedToolCalls = (message.toolCalls || []).map((toolCall) =>
        toolCall.id === data.tool_id
          ? {
              ...toolCall,
              status: isSuccess ? ("completed" as const) : ("failed" as const),
              result: normalizedResult,
              endTime: new Date(),
            }
          : toolCall,
      );
      const updatedContentParts = (message.contentParts || []).map((part) => {
        if (part.type !== "tool_use" || part.toolCall.id !== data.tool_id) {
          return part;
        }

        return toolUseContentPart(
          {
            ...part.toolCall,
            status: isSuccess ? ("completed" as const) : ("failed" as const),
            result: normalizedResult,
            endTime: new Date(),
          },
          data,
          part,
        );
      });

      // 文件工具完成后，把所有 file mutation tool_use parts 收拢成一个 file_changes_batch
      const updatedToolCallsForAggregate = updatedToolCalls;
      const hasFileMutationTools = updatedToolCallsForAggregate.some(
        (tc) => isFileMutationToolName(tc.name) && tc.status !== "running",
      );
      const finalContentParts = hasFileMutationTools
        ? (() => {
            const nonFileParts = updatedContentParts.filter(
              (part) =>
                !(
                  part.type === "tool_use" &&
                  isFileMutationToolName(part.toolCall.name)
                ) && part.type !== "file_changes_batch",
            );
            const completedFileCalls = updatedToolCallsForAggregate.filter(
              (tc) =>
                isFileMutationToolName(tc.name) && tc.status !== "running",
            );
            const aggregate = aggregateFileChanges(completedFileCalls);
            if (aggregate.fileCount === 0) {
              return updatedContentParts;
            }
            return [
              ...nonFileParts,
              { type: "file_changes_batch" as const, aggregate },
            ];
          })()
        : updatedContentParts;

      const imageTaskPreview = buildImageTaskPreviewFromToolResult({
        toolId: data.tool_id,
        toolName: currentToolCall?.name || "",
        toolArguments: currentToolArguments,
        toolResult: normalizedResultRecord,
        fallbackPrompt: message.content || "图片任务进行中",
      });
      completedImageTaskId = imageTaskPreview?.taskId || null;
      const taskPreview = imageTaskPreview
        ? null
        : buildTaskPreviewFromToolResult({
            toolId: data.tool_id,
            toolName: currentToolCall?.name || "",
            toolArguments: currentToolArguments,
            toolResult: normalizedResultRecord,
            fallbackPrompt: message.content || "任务进行中",
          });

      return {
        ...message,
        toolCalls: updatedToolCalls,
        contentParts: finalContentParts,
        imageWorkbenchPreview: imageTaskPreview
          ? {
              ...(message.imageWorkbenchPreview || {}),
              ...imageTaskPreview,
            }
          : message.imageWorkbenchPreview,
        taskPreview: imageTaskPreview
          ? undefined
          : taskPreview
            ? {
                ...(message.taskPreview || {}),
                ...taskPreview,
              }
            : message.taskPreview,
      };
    });

    return completedImageTaskId
      ? collapseAssistantImageTaskPreviewDuplicates({
          messages: nextMessages,
          assistantMsgId,
          taskId: completedImageTaskId,
        })
      : nextMessages;
  });

  const normalizedResultRecord =
    normalizedResult &&
    typeof normalizedResult === "object" &&
    !Array.isArray(normalizedResult)
      ? (normalizedResult as unknown as Record<string, unknown>)
      : undefined;
  const toolResultArtifact = buildToolResultArtifactFromToolResult({
    toolId: data.tool_id,
    toolName,
    toolArguments: undefined,
    toolResult: normalizedResultRecord,
    fallbackPrompt: "",
  });
  if (toolResultArtifact) {
    const writeContext: WriteArtifactContext = {
      artifactId: `artifact:${assistantMsgId}:${toolResultArtifact.filePath}`,
      source: "tool_result",
      sourceMessageId: assistantMsgId,
      status: isSuccess ? "complete" : "error",
      metadata: buildWriteMetadata(toolResultArtifact.metadata, {
        source: "tool_result",
        phase: isSuccess ? "completed" : "failed",
        content: toolResultArtifact.content,
        isPartial: false,
      }),
    };
    const nextArtifact = upsertAssistantWriteArtifact({
      assistantMsgId,
      setMessages,
      filePath: toolResultArtifact.filePath,
      content: toolResultArtifact.content,
      context: writeContext,
    });
    const emittedArtifact =
      nextArtifact ||
      buildArtifactFromWrite({
        filePath: toolResultArtifact.filePath,
        content: toolResultArtifact.content,
        context: writeContext,
      });

    if (emittedArtifact) {
      onWriteFile?.(emittedArtifact.content, toolResultArtifact.filePath, {
        artifact: emittedArtifact,
        artifactId: emittedArtifact.id,
        source: "tool_result",
        sourceMessageId: assistantMsgId,
        status: emittedArtifact.status,
        metadata: emittedArtifact.meta,
      });
    }
  }

  const artifactPaths = extractArtifactProtocolPaths(normalizedResult.metadata);
  if (artifactPaths.length === 0) {
    refreshAssistantArtifactDocumentsFromToolSources({
      assistantMsgId,
      activeSessionId,
      resolvedWorkspaceId,
      setMessages,
      onWriteFile,
    });
    return;
  }

  for (const artifactPath of artifactPaths) {
    if (
      shouldSkipBinaryArtifactWrite({
        filePath: artifactPath,
        content: "",
        source: "tool_result",
      })
    ) {
      continue;
    }

    const writeContext: WriteArtifactContext = {
      artifactId: `artifact:${assistantMsgId}:${artifactPath}`,
      source: "tool_result",
      sourceMessageId: assistantMsgId,
      status: isSuccess ? "complete" : "error",
      metadata: buildWriteMetadata(normalizedResult.metadata, {
        source: "tool_result",
        phase: isSuccess ? "completed" : "failed",
        content: "",
        isPartial: false,
      }),
    };
    const nextArtifact = upsertAssistantWriteArtifact({
      assistantMsgId,
      setMessages,
      filePath: artifactPath,
      content: "",
      context: writeContext,
    });
    const emittedArtifact =
      nextArtifact ||
      buildArtifactFromWrite({
        filePath: artifactPath,
        content: "",
        context: writeContext,
      });

    if (emittedArtifact) {
      onWriteFile?.(emittedArtifact.content, artifactPath, {
        artifact: emittedArtifact,
        artifactId: emittedArtifact.id,
        source: "tool_result",
        sourceMessageId: assistantMsgId,
        status: emittedArtifact.status,
        metadata: emittedArtifact.meta,
      });
    }
  }
}

export function handleArtifactSnapshotEvent({
  data,
  onWriteFile,
  setMessages,
  assistantMsgId,
  activeSessionId,
}: BaseProcessorContext &
  ArtifactWriteOptions & {
    data: AgentEventArtifactSnapshot;
  }) {
  const artifactPath = data.artifact.filePath;
  if (!artifactPath) {
    return;
  }

  const metadata = data.artifact.metadata;
  const snapshotContent =
    typeof data.artifact.content === "string" ? data.artifact.content : "";
  if (
    shouldSkipBinaryArtifactWrite({
      filePath: artifactPath,
      content: snapshotContent,
      source: "artifact_snapshot",
    })
  ) {
    return;
  }
  const writeContext: WriteArtifactContext = {
    artifactId:
      data.artifact.artifactId || `artifact:${assistantMsgId}:${artifactPath}`,
    source: "artifact_snapshot",
    sourceMessageId: assistantMsgId,
    status: "streaming",
    metadata: buildWriteMetadata(
      {
        ...(metadata || {}),
        sessionId: activeSessionId,
        artifactId: data.artifact.artifactId,
        artifactRef: data.artifact.artifactId || artifactPath,
      },
      {
        source: "artifact_snapshot",
        phase: metadata?.complete === false ? "streaming" : "persisted",
        content: snapshotContent,
        isPartial: metadata?.complete === false,
      },
    ),
  };
  const nextArtifact = upsertAssistantWriteArtifact({
    assistantMsgId,
    setMessages,
    filePath: artifactPath,
    content: snapshotContent,
    context: writeContext,
  });
  const emittedArtifact =
    nextArtifact ||
    buildArtifactFromWrite({
      filePath: artifactPath,
      content: snapshotContent,
      context: writeContext,
    });

  if (emittedArtifact) {
    onWriteFile?.(emittedArtifact.content, artifactPath, {
      artifact: emittedArtifact,
      artifactId: emittedArtifact.id,
      source: "artifact_snapshot",
      sourceMessageId: assistantMsgId,
      status: emittedArtifact.status,
      metadata: emittedArtifact.meta,
    });
  }
}

export function handleActionRequiredEvent({
  data,
  eventName,
  actionLoggedKeys,
  effectiveExecutionStrategy,
  runtime,
  setPendingActions,
  setMessages,
  assistantMsgId,
  activeSessionId,
  resolvedWorkspaceId,
}: BaseProcessorContext & {
  data: AgentEventActionRequired;
  eventName: string;
  actionLoggedKeys: Set<string>;
  effectiveExecutionStrategy: AsterExecutionStrategy;
  runtime: AgentRuntimeAdapter;
  setPendingActions: Dispatch<SetStateAction<ActionRequired[]>>;
}) {
  const actionData = governActionRequest({
    requestId: data.request_id,
    actionType: data.action_type,
    toolName: data.tool_name,
    arguments: data.arguments,
    prompt: data.prompt,
    questions:
      normalizeActionQuestions(data.questions) ||
      extractQuestionsFromRequestedSchema(data.requested_schema) ||
      normalizeActionQuestions(undefined, data.prompt),
    requestedSchema: data.requested_schema,
    scope: data.scope
      ? {
          sessionId: data.scope.session_id,
          threadId: data.scope.thread_id,
          turnId: data.scope.turn_id,
        }
      : undefined,
    eventName,
    isFallback: false,
  });
  const actionKey =
    actionData.requestId ||
    `${actionData.actionType}:${actionData.prompt || actionData.toolName || ""}`;
  if (!actionLoggedKeys.has(actionKey)) {
    actionLoggedKeys.add(actionKey);
    activityLogger.log({
      eventType: "action_required",
      status: "success",
      title: "等待用户确认",
      description:
        truncateForLog(actionData.prompt || "", 120) ||
        `类型: ${actionData.actionType}`,
      workspaceId: resolvedWorkspaceId,
      sessionId: activeSessionId,
      source: "aster-chat",
      correlationId: actionData.requestId,
      metadata: {
        actionType: actionData.actionType,
        toolName: actionData.toolName,
        requestId: actionData.requestId,
      },
    });
  }

  void effectiveExecutionStrategy;
  void runtime;

  upsertAssistantActionRequest({
    assistantMsgId,
    actionData,
    replaceByPrompt:
      actionData.actionType === "ask_user" ||
      actionData.actionType === "elicitation",
    setPendingActions,
    setMessages,
  });
}

export function handleContextTraceEvent({
  data,
  setMessages,
  assistantMsgId,
}: BaseProcessorContext & {
  data: AgentEventContextTrace;
}) {
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    return;
  }

  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== assistantMsgId) {
        return message;
      }

      const seen = new Set(
        (message.contextTrace || []).map(
          (step) => `${step.stage}::${step.detail}`,
        ),
      );
      const nextSteps = [...(message.contextTrace || [])];

      for (const step of data.steps) {
        const key = `${step.stage}::${step.detail}`;
        if (!seen.has(key)) {
          seen.add(key);
          nextSteps.push(step);
        }
      }

      return {
        ...message,
        contextTrace: nextSteps,
        runtimeStatus: buildContextRuntimeStatus(nextSteps),
      };
    }),
  );
}
