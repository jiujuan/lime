import type { QueuedTurnSnapshot } from "@/lib/api/queuedTurn";
import { formatAgentRuntimeStatusSummary } from "../utils/agentRuntimeStatus";
import { isAgentMessageFinalAnswerPhase } from "../utils/agentMessagePhase";
import type { Message, MessageImage, MessagePathReference } from "../types";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type {
  InterruptedInputDraftSnapshot,
  InterruptedInputRestorePlan,
} from "./agentStreamInputRestoreTypes";
import {
  normalizeQueuedTurnsFromReadModel,
  readArrayField,
  readBooleanField,
  readNumberField,
  readRecord,
  readStringField,
} from "./agentStreamReadModelParsing";

const INTERRUPTED_PLACEHOLDER_TEXT = "(已停止)";

function hasDraftPayload(draft: InterruptedInputDraftSnapshot): boolean {
  return (
    draft.text.trim().length > 0 ||
    (draft.images?.length ?? 0) > 0 ||
    (draft.pathReferences?.length ?? 0) > 0 ||
    (draft.textElements?.length ?? 0) > 0 ||
    Boolean(draft.inputCapabilityRoute)
  );
}

function normalizeQueuedTurnImage(value: unknown): MessageImage | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const metadata = readRecord(record.metadata) ?? {};
  const uri = readStringField(record, "uri", "sourceUri", "source_uri");
  const sourcePath =
    readStringField(record, "sourcePath", "source_path") ??
    readStringField(metadata, "sourcePath", "source_path") ??
    undefined;
  const mediaType =
    readStringField(record, "mediaType", "media_type") ??
    readStringField(metadata, "mediaType", "media_type") ??
    (uri?.startsWith("data:image/") ? uri.slice(5, uri.indexOf(";")) : null);
  const rawDataField =
    readStringField(record, "data") ?? readStringField(metadata, "data");
  const uriLooksLikeBase64Payload =
    Boolean(uri?.trim()) && !/^[a-z][a-z0-9+.-]*:/iu.test(uri ?? "");
  const rawData = rawDataField?.startsWith("data:")
    ? rawDataField.slice(rawDataField.indexOf(",") + 1)
    : (rawDataField ??
      (uri?.startsWith("data:")
        ? uri.slice(uri.indexOf(",") + 1)
        : uriLooksLikeBase64Payload
          ? uri
          : null));
  const previewUrl =
    readStringField(record, "previewUrl", "preview_url") ??
    readStringField(metadata, "previewUrl", "preview_url") ??
    (uri && /^(?:data:image\/|https?:|file:|asset:|blob:)/iu.test(uri)
      ? uri
      : undefined);
  if (
    !mediaType?.startsWith("image/") ||
    (!rawData?.trim() && !uri?.trim() && !sourcePath?.trim() && !previewUrl)
  ) {
    return null;
  }
  return {
    data: rawData ?? "",
    mediaType,
    sourceUri: uri ?? undefined,
    sourcePath,
    previewUrl,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function normalizeQueuedTurnPathReference(
  value: unknown,
): MessagePathReference | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const path = readStringField(record, "path");
  const name = readStringField(record, "name") ?? path?.split(/[\\/]/u).pop();
  if (!path || !name) {
    return null;
  }
  const source = readStringField(record, "source");
  return {
    id: readStringField(record, "id") ?? `file:${path}`,
    path,
    name,
    isDir: readBooleanField(record, "isDir", "is_dir") ?? false,
    size: readNumberField(record, "size"),
    mimeType: readStringField(record, "mimeType", "mime_type"),
    source:
      source === "system_drop" || source === "file_manager"
        ? source
        : "file_manager",
  };
}

function normalizeQueuedTurnTextElements(value: unknown[]): unknown[] {
  const textElements: unknown[] = [];
  for (const item of value) {
    const record = readRecord(item);
    if (record) {
      textElements.push({ ...record });
    }
  }
  return textElements;
}

function queuedTurnToInterruptedInputDraft(
  queuedTurn: QueuedTurnSnapshot | null | undefined,
): InterruptedInputDraftSnapshot | null {
  if (!queuedTurn) {
    return null;
  }
  const record = queuedTurn as unknown as Record<string, unknown>;
  const textElements = normalizeQueuedTurnTextElements(
    readArrayField(record, "text_elements", "textElements"),
  );
  const textFromElement = textElements
    .map((item) => readStringField(readRecord(item), "text"))
    .find((text): text is string => Boolean(text));
  const text = textFromElement ?? queuedTurn.message_text ?? "";
  const images = readArrayField(
    record,
    "input_attachments",
    "inputAttachments",
    "attachments",
  )
    .map(normalizeQueuedTurnImage)
    .filter((item): item is MessageImage => Boolean(item));
  const pathReferences = readArrayField(
    record,
    "path_references",
    "pathReferences",
  )
    .map(normalizeQueuedTurnPathReference)
    .filter((item): item is MessagePathReference => Boolean(item));
  const inputCapabilityRoute =
    readRecord(record.input_capability_route) ??
    readRecord(record.inputCapabilityRoute) ??
    undefined;
  return normalizeInterruptedInputDraft({
    text,
    images,
    pathReferences,
    textElements,
    inputCapabilityRoute:
      inputCapabilityRoute as InterruptedInputDraftSnapshot["inputCapabilityRoute"],
  });
}

function normalizeInterruptedInputDraft(
  draft: InterruptedInputDraftSnapshot | null | undefined,
): InterruptedInputDraftSnapshot | null {
  if (!draft || !hasDraftPayload(draft)) {
    return null;
  }

  return {
    text: draft.text,
    images: draft.images ? [...draft.images] : [],
    pathReferences: draft.pathReferences ? [...draft.pathReferences] : [],
    textElements: draft.textElements ? [...draft.textElements] : [],
    inputCapabilityRoute: draft.inputCapabilityRoute,
  };
}

function sortQueuedTurnsForRestore(
  queuedTurns: readonly QueuedTurnSnapshot[] | null | undefined,
): readonly QueuedTurnSnapshot[] {
  return [...(queuedTurns ?? [])].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }
    return left.created_at - right.created_at;
  });
}

function shouldRefreshQueuedTurnsForRestore(
  plan: InterruptedInputRestorePlan,
): boolean {
  if (plan.queuedTurns.length > 0) {
    return false;
  }
  return plan.reason !== "output_free_interrupted_turn";
}

export async function resolveQueuedTurnsForRestore(params: {
  activeSessionId?: string | null;
  initialQueuedTurns: readonly QueuedTurnSnapshot[];
  onError?: (error: unknown) => void;
  restorePlan: InterruptedInputRestorePlan;
  runtime: Pick<AgentRuntimeAdapter, "getSessionReadModel">;
}): Promise<readonly QueuedTurnSnapshot[]> {
  if (
    !shouldRefreshQueuedTurnsForRestore(params.restorePlan) ||
    !params.activeSessionId?.trim()
  ) {
    return params.initialQueuedTurns;
  }

  try {
    const threadRead = await params.runtime.getSessionReadModel(
      params.activeSessionId,
    );
    const refreshedQueuedTurns = normalizeQueuedTurnsFromReadModel(threadRead);
    return refreshedQueuedTurns.length > 0
      ? refreshedQueuedTurns
      : params.initialQueuedTurns;
  } catch (error) {
    params.onError?.(error);
    return params.initialQueuedTurns;
  }
}

function messageHasVisibleText(message: Message | null | undefined): boolean {
  if (!message) {
    return false;
  }
  if (
    textBlocksInterruptedInputRestore(message.content) &&
    !isRuntimeStatusPlaceholderText(message.content, message.runtimeStatus)
  ) {
    return true;
  }
  return (
    message.contentParts?.some(
      (part) =>
        part.type === "text" &&
        part.text.trim().length > 0 &&
        textPartBlocksInterruptedInputRestore(part),
    ) ?? false
  );
}

function textPartBlocksInterruptedInputRestore(
  part: Extract<NonNullable<Message["contentParts"]>[number], { type: "text" }>,
): boolean {
  if (!textBlocksInterruptedInputRestore(part.text)) {
    return false;
  }

  const phase =
    typeof part.metadata?.phase === "string" ? part.metadata.phase : null;
  if (phase) {
    return isAgentMessageFinalAnswerPhase(phase);
  }

  return true;
}

function textBlocksInterruptedInputRestore(text: string | null | undefined) {
  const normalized = text?.trim();
  return Boolean(normalized && normalized !== INTERRUPTED_PLACEHOLDER_TEXT);
}

function isRuntimeStatusPlaceholderText(
  text: string | null | undefined,
  runtimeStatus: Message["runtimeStatus"],
): boolean {
  const normalized = text?.trim();
  if (!normalized || !runtimeStatus) {
    return false;
  }

  return new Set(
    [
      runtimeStatus.title,
      runtimeStatus.detail,
      formatAgentRuntimeStatusSummary(runtimeStatus),
    ]
      .map((value) => value?.trim())
      .filter(Boolean),
  ).has(normalized);
}

function messageHasThinkingOnlySignal(
  message: Message | null | undefined,
): boolean {
  if (!message) {
    return false;
  }
  return Boolean(
    message.isThinking ||
    message.thinkingContent?.trim() ||
    message.contentParts?.some(
      (part) => part.type === "thinking" && part.text.trim().length > 0,
    ),
  );
}

function messageHasSideEffectActivity(
  message: Message | null | undefined,
): boolean {
  if (!message) {
    return false;
  }
  return Boolean(
    (message.toolCalls?.length ?? 0) > 0 ||
    (message.actionRequests?.length ?? 0) > 0 ||
    (message.artifacts?.length ?? 0) > 0 ||
    message.imageWorkbenchPreview ||
    message.taskPreview ||
    message.contentParts?.some(
      (part) =>
        part.type === "tool_use" ||
        part.type === "action_required" ||
        part.type === "file_changes_batch",
    ),
  );
}

export function resolveInterruptedInputRestorePlan(params: {
  submittedDraft?: InterruptedInputDraftSnapshot | null;
  assistantMessage?: Message | null;
  queuedTurns?: readonly QueuedTurnSnapshot[] | null;
}): InterruptedInputRestorePlan {
  const draft = normalizeInterruptedInputDraft(params.submittedDraft);
  const queuedTurns = sortQueuedTurnsForRestore(params.queuedTurns);
  const queuedDraft = queuedTurnToInterruptedInputDraft(queuedTurns[0]);
  const queuedTurnHandling = queuedTurns.length > 0 ? "preserve" : "none";
  const hasSideEffectActivity = messageHasSideEffectActivity(
    params.assistantMessage,
  );
  const hasVisibleText = messageHasVisibleText(params.assistantMessage);
  const hasThinkingOnlySignal = messageHasThinkingOnlySignal(
    params.assistantMessage,
  );

  if (
    queuedDraft &&
    (!draft || hasSideEffectActivity || hasVisibleText || hasThinkingOnlySignal)
  ) {
    return {
      shouldRestoreComposer: true,
      reason: "queued_turn_restored_after_interrupt",
      draft: queuedDraft,
      queuedTurnHandling: "restore_first",
      queuedTurns,
    };
  }

  if (!draft) {
    return {
      shouldRestoreComposer: false,
      reason: "no_submitted_draft",
      draft: null,
      queuedTurnHandling,
      queuedTurns,
    };
  }

  if (hasSideEffectActivity) {
    return {
      shouldRestoreComposer: false,
      reason: "side_effect_activity_present",
      draft: null,
      queuedTurnHandling,
      queuedTurns,
    };
  }

  if (hasVisibleText) {
    return {
      shouldRestoreComposer: false,
      reason: "visible_output_present",
      draft: null,
      queuedTurnHandling,
      queuedTurns,
    };
  }

  return {
    shouldRestoreComposer: true,
    reason: hasThinkingOnlySignal
      ? "thinking_only_cancelled_turn"
      : "output_free_interrupted_turn",
    draft,
    queuedTurnHandling,
    queuedTurns,
  };
}
