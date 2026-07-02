import type { Dispatch, SetStateAction } from "react";
import type {
  AgentEventImageTaskCreated,
  AgentEventImageTaskPresentationGenerated,
} from "@/lib/api/agentProtocol";
import { logAgentDebug } from "@/lib/agentDebug";
import type { Message } from "../types";
import { buildImageTaskAssistantContent } from "../utils/imageWorkbenchPresentation";
import {
  isImageWorkbenchStatusOnlyText,
  isImageWorkbenchSubmissionTemplateText,
} from "../utils/imageWorkbenchStatusText";
import { buildImageTaskPreviewFromToolResult } from "../utils/taskPreviewFromToolResult";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringifyRecord(
  value: Record<string, unknown> | null,
): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function readString(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return "";
}

function isReplaceableImageTaskLeadText(value?: string | null): boolean {
  return (
    isImageWorkbenchStatusOnlyText(value) ||
    isImageWorkbenchSubmissionTemplateText(value)
  );
}

function readImageTaskPresentationFields(
  event: AgentEventImageTaskCreated,
): {
  assistantIntro: string;
  completionCaption: string;
} {
  const response = asRecord(event.response);
  const responseRecord = asRecord(response?.record);
  const payload = asRecord(event.payload) || asRecord(responseRecord?.payload);
  const presentation =
    asRecord(payload?.presentation) ||
    asRecord(responseRecord?.presentation) ||
    asRecord(response?.presentation);
  return {
    assistantIntro: readString(
      [presentation, payload, responseRecord, response],
      [
        "assistant_intro",
        "assistantIntro",
        "opening_text",
        "openingText",
        "intro",
      ],
    ),
    completionCaption: readString(
      [presentation, asRecord(presentation?.result_captions), payload],
      [
        "completion_caption",
        "completionCaption",
        "result_caption",
        "resultCaption",
        "complete",
      ],
    ),
  };
}

function readImageTaskAssistantIntro(params: {
  event: AgentEventImageTaskCreated;
  preview: NonNullable<Message["imageWorkbenchPreview"]>;
  currentAssistantContent?: string;
}): string {
  const presentationFields = readImageTaskPresentationFields(params.event);
  if (presentationFields.assistantIntro) {
    return presentationFields.assistantIntro;
  }

  const currentAssistantContent = params.currentAssistantContent?.trim();
  if (
    currentAssistantContent &&
    !isReplaceableImageTaskLeadText(currentAssistantContent)
  ) {
    return currentAssistantContent;
  }

  return buildImageTaskAssistantContent({
    prompt: params.preview.prompt,
    mode: params.preview.mode,
    modelName:
      params.preview.modelName || params.preview.runtimeContract?.model || null,
  });
}

function buildImageTaskToolResultFromEvent(
  event: AgentEventImageTaskCreated,
): Record<string, unknown> {
  const response = asRecord(event.response);
  const responseRecord = asRecord(response?.record);
  const payload = asRecord(event.payload) || asRecord(responseRecord?.payload);
  const metadata = {
    ...(response ?? {}),
    task_id: event.task_id,
    task_type: event.task_type ?? response?.task_type,
    task_family: event.task_family ?? response?.task_family,
    status: event.status ?? response?.status,
    normalized_status: event.normalized_status ?? response?.normalized_status,
    artifact_path: event.artifact_path ?? response?.artifact_path,
    absolute_path: event.absolute_path ?? response?.absolute_path,
    ...(payload ? { payload } : {}),
  };

  return {
    success: true,
    output: "",
    metadata,
    ...(response ? { result: response } : {}),
  };
}

function buildImageTaskCreatedAssistantMessage(params: {
  assistantMsgId: string;
  preview: NonNullable<Message["imageWorkbenchPreview"]>;
  assistantIntro: string;
}): Message {
  return {
    id: params.assistantMsgId,
    role: "assistant",
    content: params.assistantIntro,
    timestamp: new Date(),
    isThinking: true,
    imageWorkbenchPreview: params.preview,
  };
}

function shouldFillAssistantLead(params: {
  message: Message;
}): boolean {
  if (
    params.message.content.trim() &&
    !isReplaceableImageTaskLeadText(params.message.content)
  ) {
    return false;
  }
  return !params.message.contentParts?.some(
    (part) =>
      part.type === "text" &&
      part.text.trim() &&
      !isReplaceableImageTaskLeadText(part.text),
  );
}

function readGeneratedPresentationFields(
  event: AgentEventImageTaskPresentationGenerated,
): {
  assistantIntro: string;
  completionCaption: string;
} {
  const presentation = asRecord(event.presentation);
  return {
    assistantIntro: readString(
      [presentation],
      [
        "assistant_intro",
        "assistantIntro",
        "opening_text",
        "openingText",
        "intro",
      ],
    ),
    completionCaption: readString(
      [presentation, asRecord(presentation?.result_captions)],
      [
        "completion_caption",
        "completionCaption",
        "result_caption",
        "resultCaption",
        "complete",
      ],
    ),
  };
}

export function applyAgentStreamImageTaskPresentationGeneratedEvent(params: {
  assistantMsgId: string;
  event: AgentEventImageTaskPresentationGenerated;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}): boolean {
  const presentation = readGeneratedPresentationFields(params.event);
  if (!presentation.assistantIntro && !presentation.completionCaption) {
    return false;
  }

  let didApply = false;
  params.setMessages((previous) => {
    let changed = false;
    const nextMessages = previous.map((message) => {
      if (message.id !== params.assistantMsgId) {
        return message;
      }

      didApply = true;
      const shouldFillLead =
        Boolean(presentation.assistantIntro) &&
        shouldFillAssistantLead({ message });
      const preview = message.imageWorkbenchPreview;
      const shouldRetainCaption =
        Boolean(presentation.completionCaption) &&
        Boolean(preview) &&
        !preview?.caption?.trim();
      if (!shouldFillLead && !shouldRetainCaption) {
        return message;
      }

      changed = true;
      return {
        ...message,
        content: shouldFillLead
          ? presentation.assistantIntro
          : message.content,
        imageWorkbenchPreview:
          preview && shouldRetainCaption
            ? {
                ...preview,
                caption: presentation.completionCaption,
              }
            : preview,
      };
    });

    return changed ? nextMessages : previous;
  });

  logAgentDebug("AgentStream", "imageTask.presentationGenerated.applied", {
    assistantMsgId: params.assistantMsgId,
    didApply,
    hasAssistantIntro: Boolean(presentation.assistantIntro),
    hasCompletionCaption: Boolean(presentation.completionCaption),
    turnId: params.event.turn_id ?? null,
  });
  return didApply;
}

export function applyAgentStreamImageTaskCreatedEvent(params: {
  assistantMsgId: string;
  currentAssistantContent?: string;
  event: AgentEventImageTaskCreated;
  fallbackPrompt: string;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}): boolean {
  const response = asRecord(params.event.response);
  const responseRecord = asRecord(response?.record);
  const payload =
    asRecord(params.event.payload) || asRecord(responseRecord?.payload);
  const preview = buildImageTaskPreviewFromToolResult({
    toolId: params.event.task_id,
    toolName: "lime_create_image_generation_task",
    toolArguments: stringifyRecord(payload),
    toolResult: buildImageTaskToolResultFromEvent(params.event),
    fallbackPrompt: params.fallbackPrompt || "图片任务进行中",
  });
  if (!preview) {
    logAgentDebug(
      "AgentStream",
      "imageTask.createdPreview.missed",
      {
        assistantMsgId: params.assistantMsgId,
        taskId: params.event.task_id,
        taskType: params.event.task_type ?? null,
        taskFamily: params.event.task_family ?? null,
        status: params.event.status ?? null,
        responseKeys: response ? Object.keys(response).slice(0, 12) : [],
        payloadKeys: payload ? Object.keys(payload).slice(0, 12) : [],
      },
      { level: "warn" },
    );
    return false;
  }

  params.setMessages((previous) => {
    let didApply = false;
    let didFillLead = false;
    const assistantIntro = readImageTaskAssistantIntro({
      event: params.event,
      preview,
      currentAssistantContent: params.currentAssistantContent,
    });
    const presentationFields = readImageTaskPresentationFields(params.event);
    const nextMessages = previous.map((message) => {
      const isTargetMessage =
        message.id === params.assistantMsgId ||
        message.imageWorkbenchPreview?.taskId === preview.taskId;
      if (!isTargetMessage) {
        return message;
      }
      didApply = true;
      const shouldFillLead = shouldFillAssistantLead({
        message,
      });
      if (shouldFillLead) {
        didFillLead = true;
      }
      const existingPreview = message.imageWorkbenchPreview;
      const completionCaption =
        presentationFields.completionCaption ||
        (typeof existingPreview?.caption === "string"
          ? existingPreview.caption
          : "");
      return {
        ...message,
        content: shouldFillLead ? assistantIntro : message.content,
        imageWorkbenchPreview: {
          ...(existingPreview || {}),
          ...preview,
          caption: preview.caption || completionCaption || null,
        },
        taskPreview: undefined,
      };
    });

    if (didApply) {
      logAgentDebug("AgentStream", "imageTask.createdPreview.upserted", {
        assistantMsgId: params.assistantMsgId,
        taskId: preview.taskId,
        status: preview.status,
        phase: preview.phase ?? null,
        modelName: preview.modelName ?? preview.runtimeContract?.model ?? null,
        didFillLead,
      });
      return nextMessages;
    }

    logAgentDebug("AgentStream", "imageTask.createdPreview.shellCreated", {
      assistantMsgId: params.assistantMsgId,
      taskId: preview.taskId,
      status: preview.status,
      phase: preview.phase ?? null,
      modelName: preview.modelName ?? preview.runtimeContract?.model ?? null,
    });
    return [
      ...nextMessages,
      buildImageTaskCreatedAssistantMessage({
        assistantMsgId: params.assistantMsgId,
        preview,
        assistantIntro,
      }),
    ];
  });

  return true;
}
