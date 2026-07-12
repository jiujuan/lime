import type { AgentEventToolEnd } from "@/lib/api/agentProtocol";
import { extractArtifactProtocolPaths } from "@/lib/artifact-protocol";
import { logAgentDebug } from "@/lib/agentDebug";
import type { WriteArtifactContext } from "../types";
import { activityLogger } from "@/lib/workspace/workbenchRuntime";
import {
  isToolResultSuccessful,
  normalizeIncomingToolResult,
} from "./agentChatToolResult";
import { aggregateFileChanges } from "../utils/fileChangeSummary";
import { buildArtifactFromWrite } from "../utils/messageArtifacts";
import { truncateForLog } from "./agentChatCoreUtils";
import {
  buildImageTaskPreviewFromToolResult,
  buildTaskPreviewFromToolResult,
  buildToolResultArtifactFromToolResult,
} from "../utils/taskPreviewFromToolResult";
import { isImageTaskToolResultLike } from "../utils/imageTaskToolResult";
import {
  buildWriteMetadata,
  collapseAssistantImageTaskPreviewDuplicates,
  isFileMutationToolName,
  refreshAssistantArtifactDocumentsFromToolSources,
  shouldSkipBinaryArtifactWrite,
  toolUseContentPart,
  upsertAssistantWriteArtifact,
  type ArtifactWriteOptions,
  type BaseProcessorContext,
  type ToolTrackingContext,
} from "./agentStreamEventProcessorArtifacts";

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
      source: "agent-chat",
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
      const resolvedToolName =
        currentToolCall?.name || toolNameByToolId.get(data.tool_id) || "";
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
        toolName: resolvedToolName,
        toolArguments: currentToolArguments,
        toolResult: normalizedResultRecord,
        fallbackPrompt: message.content || "图片任务进行中",
      });
      completedImageTaskId = imageTaskPreview?.taskId || null;
      const isImageTaskLike = isImageTaskToolResultLike({
        toolName: resolvedToolName,
        output: normalizedResultRecord?.output,
        metadata: normalizedResultRecord?.metadata,
        result: normalizedResultRecord,
        toolResult: normalizedResultRecord,
      });
      const taskPreview =
        imageTaskPreview || isImageTaskLike
          ? null
          : buildTaskPreviewFromToolResult({
              toolId: data.tool_id,
              toolName: resolvedToolName,
              toolArguments: currentToolArguments,
              toolResult: normalizedResultRecord,
              fallbackPrompt: message.content || "任务进行中",
            });
      if (imageTaskPreview || isImageTaskLike) {
        logAgentDebug(
          "AgentStream",
          imageTaskPreview
            ? "imageTask.toolEndPreview.applied"
            : "imageTask.toolEndPreview.missed",
          {
            toolId: data.tool_id,
            resolvedToolName,
            hasCurrentToolCall: Boolean(currentToolCall),
            hasToolNameFallback: Boolean(toolNameByToolId.get(data.tool_id)),
            imageTaskLike: isImageTaskLike,
            previewTaskId: imageTaskPreview?.taskId ?? null,
            previewStatus: imageTaskPreview?.status ?? null,
            previewPhase: imageTaskPreview?.phase ?? null,
            resultKeys: normalizedResultRecord
              ? Object.keys(normalizedResultRecord).slice(0, 12)
              : [],
            metadataKeys:
              normalizedResultRecord?.metadata &&
              typeof normalizedResultRecord.metadata === "object" &&
              !Array.isArray(normalizedResultRecord.metadata)
                ? Object.keys(normalizedResultRecord.metadata).slice(0, 12)
                : [],
          },
          { level: imageTaskPreview ? "debug" : "warn" },
        );
      }
      const shouldSuppressImageTaskToolCall =
        Boolean(imageTaskPreview) || isImageTaskLike;
      const displayToolCalls = shouldSuppressImageTaskToolCall
        ? updatedToolCalls.filter((toolCall) => toolCall.id !== data.tool_id)
        : updatedToolCalls;
      const displayContentParts = shouldSuppressImageTaskToolCall
        ? finalContentParts.filter(
            (part) =>
              part.type !== "tool_use" || part.toolCall.id !== data.tool_id,
          )
        : finalContentParts;

      return {
        ...message,
        toolCalls: displayToolCalls.length > 0 ? displayToolCalls : undefined,
        contentParts:
          displayContentParts.length > 0 ? displayContentParts : undefined,
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
