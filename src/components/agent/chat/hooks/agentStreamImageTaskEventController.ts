import type { Dispatch, SetStateAction } from "react";
import type {
  AgentEventImageTaskCreated,
  AgentEventImageTaskPresentationGenerated,
} from "@/lib/api/agentProtocol";
import { logAgentDebug } from "@/lib/agentDebug";
import type { Message } from "../types";
import type { PendingImageTaskPresentation } from "./agentStreamRuntimeHandlerTypes";
import { sanitizeImageWorkbenchPresentationText } from "../utils/imageWorkbenchPresentation";
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
  languageSource?: string | null,
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
  const promptSource =
    languageSource ||
    readString(
      [payload, responseRecord, response],
      ["prompt", "raw_text", "rawText", "summary", "title"],
    );
  return {
    assistantIntro: sanitizeImageWorkbenchPresentationText(
      readString(
        [presentation, payload, responseRecord, response],
        [
          "assistant_intro",
          "assistantIntro",
          "opening_text",
          "openingText",
          "intro",
        ],
      ),
      { languageSource: promptSource },
    ),
    completionCaption: sanitizeImageWorkbenchPresentationText(
      readString(
        [presentation, asRecord(presentation?.result_captions), payload],
        [
          "completion_caption",
          "completionCaption",
          "result_caption",
          "resultCaption",
          "complete",
        ],
      ),
      { languageSource: promptSource },
    ),
  };
}

function readImageTaskAssistantIntro(params: {
  event: AgentEventImageTaskCreated;
  preview: NonNullable<Message["imageWorkbenchPreview"]>;
  currentAssistantContent?: string;
}): string {
  const presentationFields = readImageTaskPresentationFields(
    params.event,
    params.preview.prompt,
  );
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

  return "";
}

function sanitizeImageTaskMessageText(
  value: string | null | undefined,
  languageSource?: string | null,
): string {
  return sanitizeImageWorkbenchPresentationText(value, { languageSource });
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
  const assistantIntro = params.assistantIntro.trim();
  return {
    id: params.assistantMsgId,
    role: "assistant",
    content: assistantIntro,
    timestamp: new Date(),
    isThinking: true,
    contentParts: assistantIntro
      ? [
          {
            type: "text",
            text: assistantIntro,
          },
        ]
      : undefined,
    imageWorkbenchPreview: params.preview,
  };
}

function shouldFillAssistantLead(params: { message: Message }): boolean {
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

type MessageContentPart = NonNullable<Message["contentParts"]>[number];

function isReplaceableLeadTextPart(part: MessageContentPart): boolean {
  return (
    part.type === "text" &&
    (!part.text.trim() || isReplaceableImageTaskLeadText(part.text))
  );
}

function upsertImageTaskAssistantLeadTextPart(params: {
  parts: Message["contentParts"];
  text: string;
}): Message["contentParts"] {
  const text = params.text.trim();
  if (!text) {
    return params.parts;
  }

  const parts = params.parts || [];
  let didInsert = false;
  const nextParts = parts.flatMap<MessageContentPart>((part) => {
    if (part.type !== "text" || !isReplaceableLeadTextPart(part)) {
      return [part];
    }

    if (!didInsert) {
      didInsert = true;
      return [
        {
          ...part,
          text,
        },
      ];
    }

    return isReplaceableLeadTextPart(part) ? [] : [part];
  });

  return didInsert
    ? nextParts
    : [
        ...nextParts,
        {
          type: "text",
          text,
        },
      ];
}

function readGeneratedPresentationFields(
  event: AgentEventImageTaskPresentationGenerated,
  languageSource?: string | null,
): {
  assistantIntro: string;
  completionCaption: string;
} {
  const presentation = asRecord(event.presentation);
  return {
    assistantIntro: sanitizeImageWorkbenchPresentationText(
      readString(
        [presentation],
        [
          "assistant_intro",
          "assistantIntro",
          "opening_text",
          "openingText",
          "intro",
        ],
      ),
      { languageSource },
    ),
    completionCaption: sanitizeImageWorkbenchPresentationText(
      readString(
        [presentation, asRecord(presentation?.result_captions)],
        [
          "completion_caption",
          "completionCaption",
          "result_caption",
          "resultCaption",
          "complete",
        ],
      ),
      { languageSource },
    ),
  };
}

function readImageTaskCreatedWorkflowRunId(
  event: AgentEventImageTaskCreated,
): string | null {
  const response = asRecord(event.response);
  const responseRecord = asRecord(response?.record);
  const payload = asRecord(event.payload) || asRecord(responseRecord?.payload);
  return (
    readString(
      [payload, responseRecord, response],
      ["workflowRunId", "workflow_run_id", "runId", "run_id"],
    ) || null
  );
}

function readImageTaskCreatedTurnId(
  event: AgentEventImageTaskCreated,
): string | null {
  const response = asRecord(event.response);
  const responseRecord = asRecord(response?.record);
  const payload = asRecord(event.payload) || asRecord(responseRecord?.payload);
  return (
    readString([payload, responseRecord, response], ["turnId", "turn_id"]) ||
    null
  );
}

function pendingPresentationMatchesImageTaskCreatedEvent(params: {
  pending: PendingImageTaskPresentation;
  event: AgentEventImageTaskCreated;
}): boolean {
  const workflowRunId = readImageTaskCreatedWorkflowRunId(params.event);
  if (
    params.pending.workflowRunId &&
    workflowRunId &&
    params.pending.workflowRunId !== workflowRunId
  ) {
    return false;
  }
  const turnId = readImageTaskCreatedTurnId(params.event);
  if (params.pending.turnId && turnId && params.pending.turnId !== turnId) {
    return false;
  }
  return true;
}

export function applyAgentStreamImageTaskPresentationGeneratedEvent(params: {
  assistantMsgId: string;
  event: AgentEventImageTaskPresentationGenerated;
  cachePresentation?: (presentation: PendingImageTaskPresentation) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}): boolean {
  const rawPresentation = readGeneratedPresentationFields(params.event);
  if (!rawPresentation.assistantIntro && !rawPresentation.completionCaption) {
    return false;
  }

  let didFindTargetMessage = false;
  let didApplyAssistantIntro = false;
  let didApplyCompletionCaption = false;
  let targetHasNaturalLead = false;
  params.setMessages((previous) => {
    let changed = false;
    const nextMessages = previous.map((message) => {
      if (message.id !== params.assistantMsgId) {
        return message;
      }

      didFindTargetMessage = true;
      const languageSource =
        message.imageWorkbenchPreview?.prompt || message.content;
      const presentation = readGeneratedPresentationFields(
        params.event,
        languageSource,
      );
      const shouldFillLead =
        Boolean(presentation.assistantIntro) &&
        shouldFillAssistantLead({ message });
      if (!shouldFillLead) {
        targetHasNaturalLead = !shouldFillAssistantLead({ message });
      }
      const preview = message.imageWorkbenchPreview;
      const shouldRetainCaption =
        Boolean(presentation.completionCaption) &&
        Boolean(preview) &&
        !preview?.caption?.trim();
      if (!shouldFillLead && !shouldRetainCaption) {
        return message;
      }

      changed = true;
      didApplyAssistantIntro = didApplyAssistantIntro || shouldFillLead;
      didApplyCompletionCaption =
        didApplyCompletionCaption || shouldRetainCaption;
      return {
        ...message,
        content: shouldFillLead ? presentation.assistantIntro : message.content,
        contentParts: shouldFillLead
          ? upsertImageTaskAssistantLeadTextPart({
              parts: message.contentParts,
              text: presentation.assistantIntro,
            })
          : message.contentParts,
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

  const shouldCacheAssistantIntro =
    Boolean(rawPresentation.assistantIntro) &&
    !didApplyAssistantIntro &&
    (!didFindTargetMessage || !targetHasNaturalLead);
  const shouldCacheCompletionCaption =
    Boolean(rawPresentation.completionCaption) && !didApplyCompletionCaption;
  if (
    params.cachePresentation &&
    (shouldCacheAssistantIntro || shouldCacheCompletionCaption)
  ) {
    params.cachePresentation({
      assistantIntro: shouldCacheAssistantIntro
        ? rawPresentation.assistantIntro
        : "",
      completionCaption: shouldCacheCompletionCaption
        ? rawPresentation.completionCaption
        : "",
      workflowRunId: params.event.workflow_run_id ?? null,
      turnId: params.event.turn_id ?? null,
    });
  }

  logAgentDebug("AgentStream", "imageTask.presentationGenerated.applied", {
    assistantMsgId: params.assistantMsgId,
    didFindTargetMessage,
    didApplyAssistantIntro,
    didApplyCompletionCaption,
    didCacheAssistantIntro: shouldCacheAssistantIntro,
    didCacheCompletionCaption: shouldCacheCompletionCaption,
    hasAssistantIntro: Boolean(rawPresentation.assistantIntro),
    hasCompletionCaption: Boolean(rawPresentation.completionCaption),
    turnId: params.event.turn_id ?? null,
  });
  return didApplyAssistantIntro || didApplyCompletionCaption;
}

export function applyAgentStreamImageTaskCreatedEvent(params: {
  assistantMsgId: string;
  currentAssistantContent?: string;
  event: AgentEventImageTaskCreated;
  fallbackPrompt: string;
  pendingPresentation?: PendingImageTaskPresentation | null;
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

  const pendingPresentation =
    params.pendingPresentation &&
    pendingPresentationMatchesImageTaskCreatedEvent({
      pending: params.pendingPresentation,
      event: params.event,
    })
      ? params.pendingPresentation
      : null;
  const assistantIntro =
    readImageTaskAssistantIntro({
      event: params.event,
      preview,
      currentAssistantContent: params.currentAssistantContent,
    }) ||
    sanitizeImageTaskMessageText(
      pendingPresentation?.assistantIntro,
      preview.prompt,
    );
  const presentationFields = readImageTaskPresentationFields(
    params.event,
    preview.prompt,
  );
  const pendingCompletionCaption = sanitizeImageTaskMessageText(
    pendingPresentation?.completionCaption,
    preview.prompt,
  );
  const hasPendingAssistantIntro = Boolean(
    pendingPresentation?.assistantIntro?.trim(),
  );
  const assistantIntroSource = assistantIntro
    ? presentationFields.assistantIntro
      ? "task_event_presentation"
      : hasPendingAssistantIntro
        ? "pending_presentation"
        : params.currentAssistantContent?.trim()
          ? "current_assistant_content"
          : "none"
    : "none";
  const baseCompletionCaption =
    presentationFields.completionCaption || pendingCompletionCaption;
  const previewForNewMessage = {
    ...preview,
    caption:
      sanitizeImageTaskMessageText(
        preview.caption || baseCompletionCaption,
        preview.prompt,
      ) || null,
  };

  params.setMessages((previous) => {
    let didApply = false;
    let didFillLead = false;
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
        baseCompletionCaption ||
        (typeof existingPreview?.caption === "string"
          ? sanitizeImageTaskMessageText(
              existingPreview.caption,
              preview.prompt,
            )
          : "");
      const nextContent = shouldFillLead
        ? assistantIntro
        : sanitizeImageTaskMessageText(message.content, preview.prompt) ||
          message.content;
      return {
        ...message,
        content: nextContent,
        contentParts:
          shouldFillLead && assistantIntro
            ? upsertImageTaskAssistantLeadTextPart({
                parts: message.contentParts,
                text: assistantIntro,
              })
            : message.contentParts,
        imageWorkbenchPreview: {
          ...(existingPreview || {}),
          ...preview,
          caption:
            sanitizeImageTaskMessageText(
              preview.caption || completionCaption,
              preview.prompt,
            ) || null,
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
        assistantIntroSource,
        assistantIntroChars: assistantIntro.length,
        hasPendingAssistantIntro,
      });
      return nextMessages;
    }

    logAgentDebug("AgentStream", "imageTask.createdPreview.shellCreated", {
      assistantMsgId: params.assistantMsgId,
      taskId: preview.taskId,
      status: preview.status,
      phase: preview.phase ?? null,
      modelName: preview.modelName ?? preview.runtimeContract?.model ?? null,
      assistantIntroSource,
      assistantIntroChars: assistantIntro.length,
      hasPendingAssistantIntro,
    });
    return [
      ...nextMessages,
      buildImageTaskCreatedAssistantMessage({
        assistantMsgId: params.assistantMsgId,
        preview: previewForNewMessage,
        assistantIntro,
      }),
    ];
  });

  return true;
}
