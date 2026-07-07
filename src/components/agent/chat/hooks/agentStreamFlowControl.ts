import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type { QueuedTurnSnapshot } from "@/lib/api/agentRuntime";
import { normalizeQueuedTurnSnapshots } from "@/lib/api/queuedTurn";
import { logAgentDebug } from "@/lib/agentDebug";
import type { Message, MessageImage, MessagePathReference } from "../types";
import type { ActiveStreamState } from "./agentStreamSubmissionLifecycle";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type {
  InterruptedInputDraftSnapshot,
  InterruptedInputRestorePlan,
  InterruptedInputRestoreRequest,
} from "./agentStreamInputRestoreTypes";
import { updateMessageArtifactsStatus } from "../utils/messageArtifacts";
import { isAgentMessageFinalAnswerPhase } from "../utils/agentMessagePhase";
import { formatAgentRuntimeStatusSummary } from "../utils/agentRuntimeStatus";
import {
  removeThreadItemState,
  removeThreadTurnState,
} from "./agentThreadState";
import { rememberLocallyInterruptedAgentStreamBinding } from "./agentStreamResumeBinding";

interface AgentStreamFlowNotify {
  info: (message: string) => void;
  error: (message: string) => void;
}

interface StopAgentStreamOptions {
  activeStream: ActiveStreamState | null;
  sessionIdRef: MutableRefObject<string | null>;
  runtime: AgentRuntimeAdapter;
  removeStreamListener: (eventName: string) => boolean;
  refreshSessionReadModel: (targetSessionId?: string) => Promise<boolean>;
  setQueuedTurns: Dispatch<SetStateAction<QueuedTurnSnapshot[]>>;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  getMessages?: () => readonly Message[];
  getQueuedTurns?: () => readonly QueuedTurnSnapshot[];
  setActiveStream: (nextActive: ActiveStreamState | null) => void;
  submittedDraftFallback?: InterruptedInputDraftSnapshot | null;
  onRestoreInterruptedInput?: (request: InterruptedInputRestoreRequest) => void;
  notify: AgentStreamFlowNotify;
  onInterruptError?: (error: unknown) => void;
}

function resolveInterruptTurnId(activeStream: ActiveStreamState | null) {
  const explicitTurnId = activeStream?.turnId?.trim();
  if (explicitTurnId) {
    return explicitTurnId;
  }

  const pendingTurnKey = activeStream?.pendingTurnKey?.trim();
  if (pendingTurnKey && !pendingTurnKey.startsWith("pending-turn:")) {
    return pendingTurnKey;
  }

  return undefined;
}

const INTERRUPTED_TOOL_RESULT_TEXT = "本轮已中止";
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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringField(
  value: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!value) {
    return null;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function readBooleanField(
  value: Record<string, unknown> | null | undefined,
  ...keys: string[]
): boolean | null {
  if (!value) {
    return null;
  }
  for (const key of keys) {
    if (typeof value[key] === "boolean") {
      return value[key];
    }
  }
  return null;
}

function readNumberField(
  value: Record<string, unknown> | null | undefined,
  ...keys: string[]
): number | null {
  if (!value) {
    return null;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readArrayField(
  value: Record<string, unknown> | null | undefined,
  ...keys: string[]
): unknown[] {
  if (!value) {
    return [];
  }
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return [...candidate];
    }
  }
  return [];
}

function normalizeQueuedTurnsFromReadModel(value: unknown): QueuedTurnSnapshot[] {
  const root = readRecord(value);
  const detail = readRecord(root?.detail);
  const detailThreadRead =
    readRecord(detail?.thread_read) ?? readRecord(detail?.threadRead);
  const candidates = [
    readArrayField(root, "queued_turns", "queuedTurns"),
    readArrayField(detailThreadRead, "queued_turns", "queuedTurns"),
    readArrayField(detail, "queued_turns", "queuedTurns"),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeQueuedTurnSnapshots(candidate);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
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
    readStringField(record, "data") ??
    readStringField(metadata, "data");
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
  return value
    .map((item) => {
      const record = readRecord(item);
      return record ? { ...record } : null;
    })
    .filter(Boolean);
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

async function resolveQueuedTurnsForRestore(params: {
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

function settleInterruptedToolCall<
  T extends { status: string; result?: unknown; endTime?: Date },
>(toolCall: T): T {
  if (toolCall.status !== "running") {
    return toolCall;
  }

  return {
    ...toolCall,
    status: "failed",
    endTime: new Date(),
    result: {
      success: false,
      output: "",
      error: INTERRUPTED_TOOL_RESULT_TEXT,
    },
  };
}

export function settleInterruptedMessageProcess(message: Message): Message {
  const nextToolCalls = message.toolCalls?.map(settleInterruptedToolCall);
  const nextContentParts = message.contentParts?.map((part) => {
    if (part.type !== "tool_use") {
      return part;
    }

    return {
      ...part,
      toolCall: settleInterruptedToolCall(part.toolCall),
    };
  });

  return {
    ...message,
    toolCalls: nextToolCalls,
    contentParts: nextContentParts,
  };
}

interface QueueActionOptions {
  sessionIdRef: MutableRefObject<string | null>;
  refreshSessionReadModel: (targetSessionId?: string) => Promise<boolean>;
  setQueuedTurns: Dispatch<SetStateAction<QueuedTurnSnapshot[]>>;
  notify: AgentStreamFlowNotify;
}

interface RemoveQueuedTurnOptions extends QueueActionOptions {
  runtime: Pick<AgentRuntimeAdapter, "removeQueuedTurn">;
  queuedTurnId: string;
  onError?: (error: unknown) => void;
}

interface PromoteQueuedTurnOptions extends QueueActionOptions {
  runtime: Pick<AgentRuntimeAdapter, "promoteQueuedTurn">;
  queuedTurnId: string;
  activeStream: ActiveStreamState | null;
  removeStreamListener: (eventName: string) => boolean;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setActiveStream: (nextActive: ActiveStreamState | null) => void;
  onError?: (error: unknown) => void;
}

interface ResumeThreadOptions extends Omit<
  QueueActionOptions,
  "setQueuedTurns"
> {
  runtime: Pick<AgentRuntimeAdapter, "resumeThread">;
  onError?: (error: unknown) => void;
}

export function removeQueuedTurnFromState(
  queuedTurns: QueuedTurnSnapshot[],
  queuedTurnId: string,
) {
  return queuedTurns
    .filter((item) => item.queued_turn_id !== queuedTurnId)
    .map((item, index) => ({
      ...item,
      position: index + 1,
    }));
}

export async function stopActiveAgentStream(options: StopAgentStreamOptions) {
  const {
    activeStream,
    sessionIdRef,
    runtime,
    removeStreamListener,
    refreshSessionReadModel,
    setQueuedTurns,
    setThreadItems,
    setThreadTurns,
    setCurrentTurnId,
    setMessages,
    getMessages,
    getQueuedTurns,
    setActiveStream,
    submittedDraftFallback,
    onRestoreInterruptedInput,
    notify,
    onInterruptError,
  } = options;

  if (activeStream) {
    removeStreamListener(activeStream.eventName);
  }
  rememberLocallyInterruptedAgentStreamBinding(activeStream);

  const activeSessionId = activeStream?.sessionId || sessionIdRef.current;
  const assistantMessage =
    activeStream?.assistantMsgId && getMessages
      ? (getMessages().find(
          (message) => message.id === activeStream.assistantMsgId,
        ) ?? null)
      : null;
  const initialQueuedTurns = getQueuedTurns?.() ?? [];
  let restorePlan = resolveInterruptedInputRestorePlan({
    submittedDraft: activeStream?.submittedDraft ?? submittedDraftFallback,
    assistantMessage,
    queuedTurns: initialQueuedTurns,
  });
  const refreshedQueuedTurns =
    typeof runtime.getSessionReadModel === "function"
      ? await resolveQueuedTurnsForRestore({
          activeSessionId,
          initialQueuedTurns,
          onError: onInterruptError,
          restorePlan,
          runtime,
        })
      : initialQueuedTurns;
  if (refreshedQueuedTurns !== initialQueuedTurns) {
    restorePlan = resolveInterruptedInputRestorePlan({
      submittedDraft: activeStream?.submittedDraft ?? submittedDraftFallback,
      assistantMessage,
      queuedTurns: refreshedQueuedTurns,
    });
  }
  const queuedTurnToRestore =
    onRestoreInterruptedInput &&
    restorePlan.queuedTurnHandling === "restore_first"
      ? restorePlan.queuedTurns[0]
      : null;
  logAgentDebug("AgentStream", "inputRestorePlan", {
    assistantMessageContentLength: assistantMessage?.content?.trim().length ?? 0,
    assistantMessagePartCount: assistantMessage?.contentParts?.length ?? 0,
    draftImageCount: restorePlan.draft?.images?.length ?? 0,
    draftPathReferenceCount: restorePlan.draft?.pathReferences?.length ?? 0,
    draftTextLength: restorePlan.draft?.text.trim().length ?? 0,
    eventName: activeStream?.eventName ?? null,
    hasActiveStream: Boolean(activeStream),
    hasActiveStreamDraft: Boolean(activeStream?.submittedDraft),
    hasSubmittedDraftFallback: Boolean(submittedDraftFallback),
    queuedTurnsAvailableCount: restorePlan.queuedTurns.length,
    queuedTurnsRefreshed: refreshedQueuedTurns !== initialQueuedTurns,
    queuedTurnHandling: restorePlan.queuedTurnHandling,
    queuedTurnToRestoreId: queuedTurnToRestore?.queued_turn_id ?? null,
    reason: restorePlan.reason,
    shouldRestoreComposer: restorePlan.shouldRestoreComposer,
  });
  const restoreInterruptedInput = () => {
    if (!restorePlan.shouldRestoreComposer || !restorePlan.draft) {
      return;
    }
    logAgentDebug("AgentStream", "inputRestoreDispatch", {
      draftImageCount: restorePlan.draft.images?.length ?? 0,
      draftPathReferenceCount: restorePlan.draft.pathReferences?.length ?? 0,
      draftTextLength: restorePlan.draft.text.trim().length,
      eventName: activeStream?.eventName ?? null,
      reason: restorePlan.reason,
    });
    onRestoreInterruptedInput?.({
      requestId: crypto.randomUUID(),
      reason: restorePlan.reason,
      draft: restorePlan.draft,
    });
  };
  const runInterruptAndRefresh = async () => {
    if (!activeSessionId) {
      return;
    }
    try {
      if (queuedTurnToRestore?.queued_turn_id) {
        await runtime.removeQueuedTurn(
          activeSessionId,
          queuedTurnToRestore.queued_turn_id,
        );
      }
    } catch (error) {
      onInterruptError?.(error);
    }
    try {
      await runtime.interruptTurn(
        activeSessionId,
        resolveInterruptTurnId(activeStream),
        activeStream?.eventName,
      );
    } catch (error) {
      onInterruptError?.(error);
    }
    try {
      await refreshSessionReadModel(activeSessionId);
    } catch (error) {
      onInterruptError?.(error);
    }
  };

  if (activeStream?.assistantMsgId) {
    if (activeStream.pendingItemKey) {
      setThreadItems((prev) =>
        removeThreadItemState(prev, activeStream.pendingItemKey!),
      );
    }
    if (activeStream.pendingTurnKey) {
      setThreadTurns((prev) =>
        removeThreadTurnState(prev, activeStream.pendingTurnKey!),
      );
      setCurrentTurnId((prev) =>
        prev === activeStream.pendingTurnKey ? null : prev,
      );
    }
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === activeStream.assistantMsgId
          ? {
              ...updateMessageArtifactsStatus(
                settleInterruptedMessageProcess(msg),
                "complete",
              ),
              isThinking: false,
              content: msg.content || "(已停止)",
              runtimeStatus: undefined,
            }
          : msg,
      ),
    );
  }

  setActiveStream(null);
  if (queuedTurnToRestore?.queued_turn_id) {
    setQueuedTurns((prev) =>
      removeQueuedTurnFromState(prev, queuedTurnToRestore.queued_turn_id),
    );
  }
  restoreInterruptedInput();
  notify.info("已停止生成");
  void runInterruptAndRefresh();
}

export async function removeQueuedAgentTurn(options: RemoveQueuedTurnOptions) {
  const {
    runtime,
    queuedTurnId,
    sessionIdRef,
    refreshSessionReadModel,
    setQueuedTurns,
    notify,
    onError,
  } = options;
  const activeSessionId = sessionIdRef.current;
  if (!activeSessionId || !queuedTurnId.trim()) {
    return false;
  }

  try {
    const removed = await runtime.removeQueuedTurn(
      activeSessionId,
      queuedTurnId,
    );
    if (removed) {
      setQueuedTurns((prev) => removeQueuedTurnFromState(prev, queuedTurnId));
    }
    await refreshSessionReadModel(activeSessionId);
    return removed;
  } catch (error) {
    onError?.(error);
    await refreshSessionReadModel(activeSessionId);
    notify.error("移除排队消息失败");
    return false;
  }
}

export async function promoteQueuedAgentTurn(
  options: PromoteQueuedTurnOptions,
) {
  const {
    runtime,
    queuedTurnId,
    activeStream,
    removeStreamListener,
    sessionIdRef,
    refreshSessionReadModel,
    setQueuedTurns,
    setThreadItems,
    setThreadTurns,
    setCurrentTurnId,
    setMessages,
    setActiveStream,
    notify,
    onError,
  } = options;
  const activeSessionId = sessionIdRef.current;
  if (!activeSessionId || !queuedTurnId.trim()) {
    return false;
  }

  if (activeStream) {
    removeStreamListener(activeStream.eventName);
    if (activeStream.pendingItemKey) {
      setThreadItems((prev) =>
        removeThreadItemState(prev, activeStream.pendingItemKey!),
      );
    }
    if (activeStream.pendingTurnKey) {
      setThreadTurns((prev) =>
        removeThreadTurnState(prev, activeStream.pendingTurnKey!),
      );
      setCurrentTurnId((prev) =>
        prev === activeStream.pendingTurnKey ? null : prev,
      );
    }
    if (activeStream.assistantMsgId) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === activeStream.assistantMsgId
            ? {
                ...updateMessageArtifactsStatus(msg, "complete"),
                isThinking: false,
                runtimeStatus: undefined,
              }
            : msg,
        ),
      );
    }
    setActiveStream(null);
  }

  setQueuedTurns((prev) => removeQueuedTurnFromState(prev, queuedTurnId));

  try {
    const promoted = await runtime.promoteQueuedTurn(
      activeSessionId,
      queuedTurnId,
    );
    await refreshSessionReadModel(activeSessionId);
    if (!promoted) {
      return false;
    }

    notify.info("正在切换到该排队任务");
    return true;
  } catch (error) {
    onError?.(error);
    await refreshSessionReadModel(activeSessionId);
    notify.error("立即执行排队消息失败");
    return false;
  }
}

export async function resumeAgentStreamThread(options: ResumeThreadOptions) {
  const { runtime, sessionIdRef, refreshSessionReadModel, notify, onError } =
    options;
  const activeSessionId = sessionIdRef.current;
  if (!activeSessionId) {
    return false;
  }

  try {
    const resumed = await runtime.resumeThread(activeSessionId);
    await refreshSessionReadModel(activeSessionId);
    if (resumed) {
      notify.info("正在恢复排队执行");
    }
    return resumed;
  } catch (error) {
    onError?.(error);
    await refreshSessionReadModel(activeSessionId);
    notify.error("恢复线程执行失败");
    return false;
  }
}
