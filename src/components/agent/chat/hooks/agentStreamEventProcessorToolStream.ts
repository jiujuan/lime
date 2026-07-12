import type { Dispatch, SetStateAction } from "react";
import type {
  AgentEventToolInputDelta,
  AgentEventToolOutputDelta,
  AgentEventToolProgress,
  AgentEventToolStart,
  AgentToolCallState,
} from "@/lib/api/agentProtocol";
import type { ActionRequired, WriteArtifactContext } from "../types";
import { activityLogger } from "@/lib/workspace/workbenchRuntime";
import {
  isAskToolName,
  normalizeAskOptions,
  normalizeActionQuestions,
  parseJsonObject,
  resolveAskQuestionText,
  resolveAskRequestId,
  truncateForLog,
} from "./agentChatCoreUtils";
import { upsertAssistantActionRequest } from "./agentChatActionState";
import { buildArtifactFromWrite } from "../utils/messageArtifacts";
import {
  appendToolLiveLog,
  buildWriteMetadata,
  extractToolArgPath,
  extractWriteLikeContent,
  isFileMutationToolName,
  mergeToolStreamMetadata,
  toolUseContentPart,
  upsertAssistantWriteArtifact,
  type ArtifactWriteOptions,
  type BaseProcessorContext,
  type ToolTrackingContext,
} from "./agentStreamEventProcessorArtifacts";

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
      source: "agent-chat",
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
      source: "agent-chat",
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
