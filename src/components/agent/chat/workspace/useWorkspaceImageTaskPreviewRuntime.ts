import {
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { listDirectory, readFilePreview } from "@/lib/api/fileBrowser";
import {
  getMediaTaskArtifact,
  listMediaTaskArtifacts,
  type MediaTaskArtifactOutput,
} from "@/lib/api/mediaTasks";
import { safeListen } from "@/lib/dev-bridge";
import {
  hasTauriInvokeCapability,
  hasTauriRuntimeMarkers,
} from "@/lib/tauri-runtime";
import { resolveAbsoluteWorkspacePath } from "./workspacePath";
import {
  buildImageTaskLookupRequest,
  IMAGE_TASKS_ROOT_RELATIVE_PATH,
  normalizeImageTaskPath,
} from "./imageTaskLocator";
import { parseImageWorkbenchCommand } from "../utils/imageWorkbenchCommand";
import type { CanvasStateUnion } from "@/lib/workspace/workbenchCanvas";
import {
  replaceDocumentImageTaskPlaceholderWithImage,
  upsertDocumentImageTaskPlaceholder,
} from "@/components/workspace/document/utils/imageTaskPlaceholder";
import type {
  ContentPart,
  ImageRuntimeContractSnapshot,
  ImageStoryboardSlot,
  Message,
  MessageImageWorkbenchPreview,
} from "../types";
import {
  resolveImageWorkbenchAssistantMessageId,
  resolveScopedImageWorkbenchApplyTarget,
  type ImageWorkbenchOutput,
  type ImageWorkbenchTask,
  type SessionImageWorkbenchState,
} from "./imageWorkbenchHelpers";
import { buildImageWorkbenchCaption } from "../utils/imageWorkbenchPresentation";
import { buildImageTaskAssistantContent } from "./imageTaskPersona";
import {
  isImageWorkbenchStatusOnlyText,
  isImageWorkbenchSubmissionTemplateText,
} from "../utils/imageWorkbenchStatusText";

const IMAGE_TASK_EVENT_NAME = "lime://creation_task_submitted";
const IMAGE_TASK_FILE_PREVIEW_MAX_SIZE = 256 * 1024;
const IMAGE_TASK_POLL_INTERVAL_MS = 1500;
const IMAGE_TASK_ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const IMAGE_TASK_RESTORE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const IMAGE_TASK_RESTORE_LIMIT = 8;
const IMAGE_TASKS_RESTORE_SCAN_DEPTH = 2;
const EMPTY_MESSAGES: Message[] = [];
const IMAGE_GENERATION_CONTRACT_KEY = "image_generation";
const IMAGE_GENERATION_CONTRACT_ROUTING_FAILURE_CODES = new Set([
  "image_generation_contract_mismatch",
  "image_generation_capability_gap",
  "image_generation_routing_slot_mismatch",
  "image_generation_model_capability_gap",
]);

interface CreationTaskSubmittedPayload {
  task_id?: string;
  task_type?: string;
  task_family?: string;
  status?: string;
  current_attempt_id?: string;
  path?: string;
  absolute_path?: string;
  prompt?: string;
  size?: string;
  mode?: string;
  layout_hint?: string;
  raw_text?: string;
  persona_context?: Record<string, unknown>;
  presentation?: Record<string, unknown>;
  taste_context?: Record<string, unknown>;
  provider?: string;
  provider_id?: string;
  model?: string;
  count?: number;
  reused_existing?: boolean;
  session_id?: string;
  thread_id?: string;
  turn_id?: string;
  project_id?: string;
  content_id?: string;
  entry_source?: string;
  requested_target?: string;
  slot_id?: string;
  anchor_hint?: string;
  anchor_section_title?: string;
  anchor_text?: string;
}

interface TrackedImageTask {
  taskId: string;
  taskType: string;
  taskFamily: string;
  artifactPath: string;
  absolutePath: string;
  lookupTaskRef: string;
  timerId: number | null;
  polling: boolean;
}

interface ParsedImageTaskSnapshot {
  taskId: string;
  message: Message;
  task: ImageWorkbenchTask;
  outputs: ImageWorkbenchOutput[];
  terminal: boolean;
  updatedAt: number;
}

interface UseWorkspaceImageTaskPreviewRuntimeParams {
  sessionId?: string | null;
  projectId?: string | null;
  contentId?: string | null;
  projectRootPath?: string | null;
  restoreFromWorkspace?: boolean;
  messages?: Message[];
  currentImageWorkbenchState?: SessionImageWorkbenchState;
  canvasState: CanvasStateUnion | null;
  setCanvasState: Dispatch<SetStateAction<CanvasStateUnion | null>>;
  setChatMessages: Dispatch<SetStateAction<Message[]>>;
  updateCurrentImageWorkbenchState: (
    updater: (
      current: SessionImageWorkbenchState,
    ) => SessionImageWorkbenchState,
  ) => void;
}

interface TaskContextMetadata {
  sessionId?: string;
  projectId?: string;
  contentId?: string;
}

interface LoadedImageTaskSnapshot {
  snapshot: ParsedImageTaskSnapshot;
  taskRecord: Record<string, unknown>;
}

interface RestoredImageTaskSnapshot extends LoadedImageTaskSnapshot {
  absolutePath: string;
  taskType: string;
  taskFamily: string;
}

interface ImageTaskPreviewRuntimeContext {
  sessionId?: string | null;
  projectId?: string | null;
  contentId?: string | null;
  projectRootPath?: string | null;
  messages?: Message[];
  currentImageWorkbenchState?: SessionImageWorkbenchState;
  canvasState: CanvasStateUnion | null;
}

function shouldPreferLoadedImageTaskSnapshot(
  current: LoadedImageTaskSnapshot | null,
  candidate: LoadedImageTaskSnapshot | null,
): boolean {
  if (!candidate) {
    return false;
  }
  if (!current) {
    return true;
  }

  const currentIsTerminal = current.snapshot.terminal;
  const candidateIsTerminal = candidate.snapshot.terminal;
  if (currentIsTerminal !== candidateIsTerminal) {
    return candidateIsTerminal;
  }

  const currentOutputCount = current.snapshot.outputs.length;
  const candidateOutputCount = candidate.snapshot.outputs.length;
  if (currentOutputCount !== candidateOutputCount) {
    return candidateOutputCount > currentOutputCount;
  }

  return candidate.snapshot.updatedAt > current.snapshot.updatedAt;
}

interface SeedImageTaskRecord {
  taskId: string;
  taskFilePath?: string;
  artifactPath?: string;
}

function isDraftImageWorkbenchTaskId(taskId?: string | null): boolean {
  return taskId?.trim().startsWith("draft-image-") === true;
}

function contentPartContainsProcess(part: ContentPart): boolean {
  return part.type !== "text";
}

function extractMessageThinkingContent(
  message: Pick<Message, "thinkingContent" | "contentParts">,
): string | undefined {
  const explicitThinking = message.thinkingContent?.trim()
    ? message.thinkingContent
    : undefined;
  if (explicitThinking) {
    return explicitThinking;
  }

  const thinkingText = (message.contentParts || [])
    .filter(
      (
        part,
      ): part is Extract<ContentPart, { type: "thinking"; text: string }> =>
        part.type === "thinking" && part.text.trim().length > 0,
    )
    .map((part) => part.text)
    .join("");
  return thinkingText.trim() ? thinkingText : undefined;
}

function mergeMessageThinkingContent(params: {
  existingMessage: Message;
  nextMessage: Message;
}): string | undefined {
  const existingThinking = extractMessageThinkingContent(
    params.existingMessage,
  );
  const nextThinking = extractMessageThinkingContent(params.nextMessage);

  if (!existingThinking) {
    return nextThinking;
  }
  if (!nextThinking) {
    return existingThinking;
  }
  if (
    existingThinking === nextThinking ||
    existingThinking.includes(nextThinking)
  ) {
    return existingThinking;
  }
  if (nextThinking.includes(existingThinking)) {
    return nextThinking;
  }
  return `${existingThinking}\n\n${nextThinking}`;
}

function collectSeedImageTasks(messages?: Message[]): SeedImageTaskRecord[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  const tasks: SeedImageTaskRecord[] = [];
  const seen = new Set<string>();
  messages.forEach((message) => {
    if (message.role !== "assistant") {
      return;
    }

    const taskId = message.imageWorkbenchPreview?.taskId?.trim();
    if (!taskId || isDraftImageWorkbenchTaskId(taskId) || seen.has(taskId)) {
      return;
    }

    seen.add(taskId);
    tasks.push({
      taskId,
      taskFilePath: normalizeImageTaskPath(
        message.imageWorkbenchPreview?.taskFilePath,
      ),
      artifactPath: normalizeImageTaskPath(
        message.imageWorkbenchPreview?.artifactPath,
      ),
    });
  });
  return tasks;
}

function isImageWorkbenchTaskSatisfiedByCache(params: {
  imageWorkbenchState?: SessionImageWorkbenchState;
  taskId: string;
}): boolean {
  const imageWorkbenchState = params.imageWorkbenchState;
  if (!imageWorkbenchState) {
    return false;
  }

  const task = imageWorkbenchState.tasks.find(
    (item) => item.id === params.taskId,
  );
  if (!task) {
    return false;
  }

  const outputs = imageWorkbenchState.outputs.filter(
    (output) => output.taskId === params.taskId,
  );
  if (outputs.length > 0) {
    return true;
  }

  return (
    task.status === "cancelled" ||
    task.status === "error" ||
    task.status === "partial" ||
    task.status === "complete"
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string | undefined {
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
  return undefined;
}

function readImageTaskPresentationText(
  candidates: Array<Record<string, unknown> | null | undefined>,
): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const presentation = asRecord(candidate.presentation) || candidate;
    const value = readString(
      [presentation],
      [
        "assistant_intro",
        "assistantIntro",
        "opening_text",
        "openingText",
        "intro",
      ],
    );
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readNestedPresentationCaption(
  presentation: Record<string, unknown> | null | undefined,
  status: MessageImageWorkbenchPreview["status"],
): string | undefined {
  if (!presentation) {
    return undefined;
  }

  const resultCaptions = asRecord(presentation.result_captions);
  const statusSpecificKeys: string[] = (() => {
    switch (status) {
      case "complete":
        return ["completion_caption", "completionCaption", "complete"];
      case "partial":
        return ["partial_caption", "partialCaption", "partial"];
      case "failed":
        return [
          "failed_caption",
          "failedCaption",
          "failure_caption",
          "failureCaption",
          "failed",
          "failure",
        ];
      case "cancelled":
        return ["cancelled_caption", "cancelledCaption", "cancelled"];
      case "running":
      default:
        return [];
    }
  })();

  return readString(
    [presentation, resultCaptions],
    [...statusSpecificKeys, "result_caption", "resultCaption"],
  );
}

function readImageTaskPresentationCaption(
  candidates: Array<Record<string, unknown> | null | undefined>,
  status: MessageImageWorkbenchPreview["status"],
): string | undefined {
  if (status === "running") {
    return undefined;
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const value = readNestedPresentationCaption(
      asRecord(candidate.presentation) || candidate,
      status,
    );
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readPositiveNumber(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): number | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
      }
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
  }
  return undefined;
}

function readBoolean(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): boolean | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") {
          return true;
        }
        if (normalized === "false") {
          return false;
        }
      }
    }
  }
  return undefined;
}

function readStringArray(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string[] {
  const values: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (!Array.isArray(value)) {
        continue;
      }
      for (const item of value) {
        if (typeof item !== "string") {
          continue;
        }
        const trimmed = item.trim();
        if (!trimmed || values.includes(trimmed)) {
          continue;
        }
        values.push(trimmed);
      }
      if (values.length > 0) {
        return values;
      }
    }
  }
  return values;
}

function isImageGenerationContractRoutingFailureCode(
  value?: string | null,
): boolean {
  return Boolean(
    value && IMAGE_GENERATION_CONTRACT_ROUTING_FAILURE_CODES.has(value.trim()),
  );
}

function resolveImageRuntimeContractSnapshot(params: {
  taskRecord: Record<string, unknown>;
  normalizedStatus: string;
}): ImageRuntimeContractSnapshot | null {
  const payload = asRecord(params.taskRecord.payload);
  const runtimeContract = asRecord(payload?.runtime_contract);
  const limecorePolicySnapshot =
    asRecord(runtimeContract?.limecore_policy_snapshot) ||
    asRecord(runtimeContract?.limecorePolicySnapshot) ||
    asRecord(payload?.limecore_policy_snapshot) ||
    asRecord(payload?.limecorePolicySnapshot);
  const limecorePolicyEvaluation =
    asRecord(limecorePolicySnapshot?.policy_evaluation) ||
    asRecord(limecorePolicySnapshot?.policyEvaluation);
  const modelCapabilityAssessment = asRecord(
    payload?.model_capability_assessment,
  );
  const lastErrorRecord = asRecord(params.taskRecord.last_error);
  const failureCode = readString([lastErrorRecord], ["code"]);
  const requiredCapabilities = readStringArray(
    [payload],
    ["required_capabilities", "requiredCapabilities"],
  );
  const contractKey =
    readString([payload], ["modality_contract_key", "modalityContractKey"]) ||
    readString([runtimeContract], ["contract_key", "contractKey"]) ||
    null;
  const routingSlot =
    readString([payload, runtimeContract], ["routing_slot", "routingSlot"]) ||
    null;
  const modelCapabilityAssessmentSource =
    readString([modelCapabilityAssessment], ["source"]) || null;
  const hasRuntimeContractSignal = Boolean(
    contractKey ||
    routingSlot ||
    requiredCapabilities.includes(IMAGE_GENERATION_CONTRACT_KEY) ||
    modelCapabilityAssessmentSource ||
    isImageGenerationContractRoutingFailureCode(failureCode),
  );

  if (!hasRuntimeContractSignal) {
    return null;
  }

  const isRoutingBlocked =
    isImageGenerationContractRoutingFailureCode(failureCode);
  const routingOutcome = isRoutingBlocked
    ? "blocked"
    : params.normalizedStatus === "failed"
      ? "failed"
      : "accepted";

  return {
    contractKey,
    routingSlot,
    providerId:
      readString(
        [payload, modelCapabilityAssessment],
        ["provider_id", "providerId"],
      ) || null,
    model:
      readString(
        [payload, modelCapabilityAssessment],
        ["model", "model_id", "modelId"],
      ) || null,
    routingEvent: isRoutingBlocked
      ? "routing_not_possible"
      : "model_routing_decision",
    routingOutcome,
    failureCode: failureCode || null,
    modelCapabilityAssessmentSource,
    modelSupportsImageGeneration:
      readBoolean(
        [modelCapabilityAssessment],
        ["supports_image_generation", "supportsImageGeneration"],
      ) ?? null,
    limecorePolicySnapshotStatus:
      readString([limecorePolicySnapshot], ["status"]) || null,
    limecorePolicyDecision:
      readString([limecorePolicySnapshot], ["decision"]) || null,
    limecorePolicyDecisionSource:
      readString(
        [limecorePolicySnapshot],
        ["decision_source", "decisionSource"],
      ) || null,
    limecorePolicyDecisionScope:
      readString(
        [limecorePolicySnapshot],
        ["decision_scope", "decisionScope"],
      ) || null,
    limecorePolicyDecisionReason:
      readString(
        [limecorePolicySnapshot],
        ["decision_reason", "decisionReason"],
      ) || null,
    limecorePolicyMissingInputs: readStringArray(
      [limecorePolicySnapshot],
      ["missing_inputs", "missingInputs"],
    ),
    limecorePolicyPendingHitRefs: readStringArray(
      [limecorePolicySnapshot],
      ["pending_hit_refs", "pendingHitRefs"],
    ),
    limecorePolicyEvaluationStatus:
      readString([limecorePolicyEvaluation], ["status"]) || null,
    limecorePolicyEvaluationDecision:
      readString([limecorePolicyEvaluation], ["decision"]) || null,
    limecorePolicyEvaluationDecisionSource:
      readString(
        [limecorePolicyEvaluation],
        ["decision_source", "decisionSource"],
      ) || null,
    limecorePolicyEvaluationDecisionScope:
      readString(
        [limecorePolicyEvaluation],
        ["decision_scope", "decisionScope"],
      ) || null,
    limecorePolicyEvaluationDecisionReason:
      readString(
        [limecorePolicyEvaluation],
        ["decision_reason", "decisionReason"],
      ) || null,
    limecorePolicyEvaluationBlockingRefs: readStringArray(
      [limecorePolicyEvaluation],
      ["blocking_refs", "blockingRefs"],
    ),
    limecorePolicyEvaluationAskRefs: readStringArray(
      [limecorePolicyEvaluation],
      ["ask_refs", "askRefs"],
    ),
    limecorePolicyEvaluationPendingRefs: readStringArray(
      [limecorePolicyEvaluation],
      ["pending_refs", "pendingRefs"],
    ),
  };
}

function sanitizeStoryboardSlotText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveMessageTimestampMsLocal(message: Message): number | null {
  return message.timestamp instanceof Date ? message.timestamp.getTime() : null;
}

function buildNormalizedStoryboardSlot(params: {
  slotIndex: number;
  slotId?: string | null;
  label?: string | null;
  prompt?: string | null;
  shotType?: string | null;
  status?: string | null;
}): ImageStoryboardSlot | null {
  if (!Number.isFinite(params.slotIndex) || params.slotIndex <= 0) {
    return null;
  }

  return {
    slotId:
      sanitizeStoryboardSlotText(params.slotId) ||
      `storyboard-slot-${params.slotIndex}`,
    slotIndex: Math.trunc(params.slotIndex),
    label: sanitizeStoryboardSlotText(params.label),
    prompt: sanitizeStoryboardSlotText(params.prompt),
    shotType: sanitizeStoryboardSlotText(params.shotType),
    status: sanitizeStoryboardSlotText(params.status),
  };
}

function readStoryboardSlotsFromUnknown(value: unknown): ImageStoryboardSlot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }

      const slotIndex =
        readPositiveNumber([record], ["slot_index", "slotIndex"]) || index + 1;
      return buildNormalizedStoryboardSlot({
        slotIndex,
        slotId: readString([record], ["slot_id", "slotId"]),
        label: readString([record], ["label", "slot_label", "slotLabel"]),
        prompt: readString(
          [record],
          ["prompt", "slot_prompt", "slotPrompt", "revised_prompt"],
        ),
        shotType: readString([record], ["shot_type", "shotType"]),
        status: readString([record], ["status"]),
      });
    })
    .filter((item): item is ImageStoryboardSlot => Boolean(item))
    .sort((left, right) => left.slotIndex - right.slotIndex);
}

function mergeStoryboardSlots(
  ...sources: Array<ImageStoryboardSlot[] | null | undefined>
): ImageStoryboardSlot[] {
  const bySlotKey = new Map<string, ImageStoryboardSlot>();

  sources.forEach((source) => {
    (source || []).forEach((slot) => {
      const slotKey =
        slot.slotId.trim() || `storyboard-slot-${Math.max(1, slot.slotIndex)}`;
      const existing = bySlotKey.get(slotKey);
      bySlotKey.set(slotKey, {
        ...existing,
        ...slot,
        slotId: slotKey,
        slotIndex:
          slot.slotIndex ||
          existing?.slotIndex ||
          Math.max(1, bySlotKey.size + 1),
        label: slot.label ?? existing?.label ?? null,
        prompt: slot.prompt ?? existing?.prompt ?? null,
        shotType: slot.shotType ?? existing?.shotType ?? null,
        status: slot.status ?? existing?.status ?? null,
      });
    });
  });

  return Array.from(bySlotKey.values()).sort(
    (left, right) => left.slotIndex - right.slotIndex,
  );
}

function buildPreviewImageUrls(outputs: ImageWorkbenchOutput[]): string[] {
  const urls: string[] = [];
  outputs.forEach((output) => {
    const normalized = output.url.trim();
    if (!normalized || urls.includes(normalized)) {
      return;
    }
    urls.push(normalized);
  });
  return urls.slice(0, 9);
}

function normalizeRenderableImageUrl(value?: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  if (
    normalized.toLowerCase().startsWith("data:image/") ||
    normalized.startsWith("blob:") ||
    normalized.startsWith("file://") ||
    /^https?:\/\//i.test(normalized)
  ) {
    return normalized;
  }
  return null;
}

function resolveTaskSlotId(
  taskRecord: Record<string, unknown>,
): string | undefined {
  return readString(
    [asRecord(taskRecord.relationships), asRecord(taskRecord.payload)],
    ["slot_id", "slotId"],
  );
}

function resolveTaskAnchorSectionTitle(
  taskRecord: Record<string, unknown>,
): string | undefined {
  return readString(
    [asRecord(taskRecord.payload)],
    ["anchor_section_title", "anchorSectionTitle"],
  );
}

function resolveTaskAnchorText(
  taskRecord: Record<string, unknown>,
): string | undefined {
  return readString(
    [asRecord(taskRecord.payload)],
    ["anchor_text", "anchorText"],
  );
}

function isDocumentInlineTaskRecord(
  taskRecord: Record<string, unknown>,
): boolean {
  const payload = asRecord(taskRecord.payload);
  return (
    readString([payload], ["usage"]) === "document-inline" ||
    Boolean(resolveTaskSlotId(taskRecord))
  );
}

function normalizeTaskFamily(
  taskType: string,
  taskFamily?: string,
): string | undefined {
  const normalizedFamily = taskFamily?.trim().toLowerCase();
  if (normalizedFamily) {
    return normalizedFamily;
  }

  const normalizedType = taskType.trim().toLowerCase();
  if (normalizedType.includes("image") || normalizedType.includes("cover")) {
    return "image";
  }
  if (normalizedType.includes("video")) {
    return "video";
  }
  return undefined;
}

function normalizeTaskRef(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeTaskStatus(status?: string): string {
  switch ((status || "").trim().toLowerCase()) {
    case "pending_submit":
    case "pending":
      return "pending";
    case "queued":
      return "queued";
    case "running":
    case "processing":
    case "in_progress":
      return "running";
    case "partial":
      return "partial";
    case "completed":
    case "success":
    case "succeeded":
      return "succeeded";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "pending";
  }
}

function matchesRuntimeEventContext(params: {
  payload: CreationTaskSubmittedPayload;
  sessionId?: string | null;
  projectId?: string | null;
  contentId?: string | null;
}): boolean {
  const normalizedSessionId = normalizeTaskRef(params.sessionId);
  const normalizedProjectId = normalizeTaskRef(params.projectId);
  const normalizedContentId = normalizeTaskRef(params.contentId);
  const payloadSessionId = normalizeTaskRef(params.payload.session_id);
  const payloadProjectId = normalizeTaskRef(params.payload.project_id);
  const payloadContentId = normalizeTaskRef(params.payload.content_id);
  let matchedScopedContext = false;

  if (
    normalizedSessionId &&
    payloadSessionId &&
    payloadSessionId !== normalizedSessionId
  ) {
    return false;
  }
  if (normalizedSessionId && payloadSessionId === normalizedSessionId) {
    matchedScopedContext = true;
  }
  if (
    normalizedProjectId &&
    payloadProjectId &&
    payloadProjectId !== normalizedProjectId
  ) {
    return false;
  }
  if (
    normalizedContentId &&
    payloadContentId &&
    payloadContentId !== normalizedContentId
  ) {
    return false;
  }
  if (normalizedContentId && payloadContentId === normalizedContentId) {
    matchedScopedContext = true;
  }

  if (normalizedSessionId || normalizedContentId) {
    return matchedScopedContext;
  }

  return true;
}

function resolveTaskRecordTimestamp(
  taskRecord: Record<string, unknown>,
): number {
  const timestampRaw =
    readString(
      [taskRecord],
      ["updated_at", "updatedAt", "created_at", "createdAt"],
    ) || "";
  const timestamp = Date.parse(timestampRaw);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function isNonTerminalTaskStatus(status: string): boolean {
  return (
    status === "pending" ||
    status === "queued" ||
    status === "running" ||
    status === "partial"
  );
}

function isRecentlyActiveTaskRecord(
  taskRecord: Record<string, unknown>,
): boolean {
  return (
    Date.now() - resolveTaskRecordTimestamp(taskRecord) <=
    IMAGE_TASK_ACTIVE_WINDOW_MS
  );
}

function shouldRestoreLoadedImageTaskSnapshot(
  snapshot: LoadedImageTaskSnapshot,
): boolean {
  if (snapshot.snapshot.terminal) {
    return true;
  }

  return isRecentlyActiveTaskRecord(snapshot.taskRecord);
}

function resolveTaskContextMetadata(
  taskRecord: Record<string, unknown>,
): TaskContextMetadata {
  const payload = asRecord(taskRecord.payload);
  return {
    sessionId: normalizeTaskRef(
      readString([taskRecord, payload], ["session_id", "sessionId"]),
    ),
    projectId: normalizeTaskRef(
      readString([taskRecord, payload], ["project_id", "projectId"]),
    ),
    contentId: normalizeTaskRef(
      readString([taskRecord, payload], ["content_id", "contentId"]),
    ),
  };
}

function shouldRestoreImageTaskRecord(params: {
  taskRecord: Record<string, unknown>;
  sessionId?: string | null;
  projectId?: string | null;
  contentId?: string | null;
}): boolean {
  const taskType =
    readString([params.taskRecord], ["task_type", "taskType"]) || "";
  const taskFamily = normalizeTaskFamily(
    taskType,
    readString([params.taskRecord], ["task_family", "taskFamily"]),
  );
  if (taskFamily !== "image") {
    return false;
  }

  const metadata = resolveTaskContextMetadata(params.taskRecord);
  const normalizedSessionId = normalizeTaskRef(params.sessionId);
  const normalizedProjectId = normalizeTaskRef(params.projectId);
  const normalizedContentId = normalizeTaskRef(params.contentId);
  let matchedScopedContext = false;

  if (
    normalizedSessionId &&
    metadata.sessionId &&
    metadata.sessionId !== normalizedSessionId
  ) {
    return false;
  }
  if (
    normalizedProjectId &&
    metadata.projectId &&
    metadata.projectId !== normalizedProjectId
  ) {
    return false;
  }
  if (
    normalizedContentId &&
    metadata.contentId &&
    metadata.contentId !== normalizedContentId
  ) {
    return false;
  }

  if (normalizedSessionId && metadata.sessionId === normalizedSessionId) {
    matchedScopedContext = true;
  }
  if (normalizedContentId && metadata.contentId === normalizedContentId) {
    matchedScopedContext = true;
  }

  const normalizedStatus = normalizeTaskStatus(
    readString([params.taskRecord], ["normalized_status", "status"]),
  );
  if (
    isNonTerminalTaskStatus(normalizedStatus) &&
    !isRecentlyActiveTaskRecord(params.taskRecord)
  ) {
    return false;
  }

  if (normalizedSessionId || normalizedContentId) {
    return matchedScopedContext;
  }
  if (normalizedProjectId && metadata.projectId === normalizedProjectId) {
    return true;
  }

  if (isNonTerminalTaskStatus(normalizedStatus)) {
    return true;
  }

  return (
    Date.now() - resolveTaskRecordTimestamp(params.taskRecord) <=
    IMAGE_TASK_RESTORE_LOOKBACK_MS
  );
}

function messageHasImageWorkbenchProcessSignal(message: Message): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  return (
    Boolean(message.isThinking) ||
    Boolean(message.runtimeStatus) ||
    Boolean(message.imageWorkbenchPreview) ||
    isImageWorkbenchSubmissionTemplateText(message.content) ||
    (message.toolCalls?.length || 0) > 0 ||
    (message.contentParts || []).some(contentPartContainsProcess)
  );
}

function resolvePendingImageCommandRecoverySignature(
  messages?: Message[],
): string | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    const parsedCommand = parseImageWorkbenchCommand(message.content || "");
    if (!parsedCommand) {
      continue;
    }

    const trailingMessages = messages.slice(index + 1);
    if (trailingMessages.length === 0) {
      return null;
    }

    if (
      trailingMessages.some(
        (candidate) =>
          candidate.role === "assistant" &&
          Boolean(candidate.imageWorkbenchPreview),
      )
    ) {
      return null;
    }

    if (!trailingMessages.some(messageHasImageWorkbenchProcessSignal)) {
      return null;
    }

    const messageTimestamp = resolveMessageTimestampMsLocal(message);
    return [
      message.id,
      messageTimestamp === null ? "" : String(messageTimestamp),
      normalizeImageWorkbenchPreviewIdentityText(parsedCommand.rawText),
    ].join("::");
  }

  return null;
}

async function collectImageTaskCandidatePaths(
  projectRootPath: string,
): Promise<string[]> {
  const normalizedProjectRoot = projectRootPath.trim();
  if (!normalizedProjectRoot) {
    return [];
  }

  const rootPath = resolveAbsoluteWorkspacePath(
    normalizedProjectRoot,
    IMAGE_TASKS_ROOT_RELATIVE_PATH,
  );
  if (!rootPath) {
    return [];
  }

  const pendingDirs: Array<{ path: string; depth: number }> = [
    { path: rootPath, depth: 0 },
  ];
  const discoveredPaths: string[] = [];
  const visitedDirs = new Set<string>();

  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.shift();
    if (!currentDir || visitedDirs.has(currentDir.path)) {
      continue;
    }
    visitedDirs.add(currentDir.path);

    try {
      const listing = await listDirectory(currentDir.path);
      if (listing.error) {
        continue;
      }

      for (const entry of listing.entries) {
        if (entry.isDir) {
          if (currentDir.depth < IMAGE_TASKS_RESTORE_SCAN_DEPTH) {
            pendingDirs.push({
              path: entry.path,
              depth: currentDir.depth + 1,
            });
          }
          continue;
        }

        if (entry.name.toLowerCase().endsWith(".json")) {
          discoveredPaths.push(entry.path);
        }
      }
    } catch {
      continue;
    }
  }

  return discoveredPaths;
}

function sanitizePreviewPrompt(value?: string): string {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "";
  }

  const mediaTagMatch = trimmed.match(/^\[(?:img|video):(.+)\]$/i);
  if (mediaTagMatch?.[1]) {
    return mediaTagMatch[1].trim();
  }

  return trimmed;
}

function resolveDisplayPromptFromImageTaskPayload(params: {
  payload?: Record<string, unknown> | null;
  fallbackPrompt: string;
}): string {
  const rawText = sanitizePreviewPrompt(
    readString([params.payload || null], ["raw_text", "rawText"]) || "",
  );
  const parsedRawText = rawText ? parseImageWorkbenchCommand(rawText) : null;
  const parsedPrompt = sanitizePreviewPrompt(parsedRawText?.prompt || "");

  return parsedPrompt || rawText || params.fallbackPrompt;
}

function syncDocumentInlineImageTask(params: {
  taskRecord: Record<string, unknown>;
  taskId: string;
  outputs: ImageWorkbenchOutput[];
  setCanvasState: Dispatch<SetStateAction<CanvasStateUnion | null>>;
}): void {
  if (!isDocumentInlineTaskRecord(params.taskRecord)) {
    return;
  }

  const payload = asRecord(params.taskRecord.payload);
  const prompt =
    sanitizePreviewPrompt(readString([payload], ["prompt"])) || "配图任务";
  const slotId = resolveTaskSlotId(params.taskRecord);
  const anchorSectionTitle = resolveTaskAnchorSectionTitle(params.taskRecord);
  const anchorText = resolveTaskAnchorText(params.taskRecord);
  const normalizedStatus = normalizeTaskStatus(
    readString([params.taskRecord], ["normalized_status", "status"]),
  );
  const firstOutputUrl = params.outputs[0]?.url?.trim();

  params.setCanvasState((previous) => {
    if (!previous || previous.type !== "document") {
      return previous;
    }

    let nextContent = previous.content;
    if (
      (normalizedStatus === "succeeded" || normalizedStatus === "partial") &&
      firstOutputUrl
    ) {
      nextContent = replaceDocumentImageTaskPlaceholderWithImage(
        previous.content,
        {
          taskId: params.taskId,
          slotId,
          anchorSectionTitle,
          anchorText,
          prompt,
          imageUrl: firstOutputUrl,
        },
      );
    } else {
      nextContent = upsertDocumentImageTaskPlaceholder(previous.content, {
        taskId: params.taskId,
        slotId,
        anchorSectionTitle,
        anchorText,
        prompt,
        status:
          normalizedStatus === "failed"
            ? "failed"
            : normalizedStatus === "cancelled"
              ? "cancelled"
              : "running",
      });
    }

    if (nextContent === previous.content) {
      return previous;
    }

    return {
      ...previous,
      content: nextContent,
    };
  });
}

function normalizeTaskModeValue(
  value?: string,
): ImageWorkbenchTask["mode"] | undefined {
  switch ((value || "").trim().toLowerCase()) {
    case "edit":
      return "edit";
    case "variation":
    case "variant":
      return "variation";
    case "generate":
      return "generate";
    default:
      return undefined;
  }
}

function resolveTaskLabel(
  taskType: string,
  taskMode: ImageWorkbenchTask["mode"],
): string {
  const normalizedType = taskType.trim().toLowerCase();
  if (normalizedType === "cover_generate") {
    return "封面任务";
  }
  switch (taskMode) {
    case "edit":
      return "图片编辑任务";
    case "variation":
      return "图片重绘任务";
    case "generate":
    default:
      return normalizedType.includes("image") ? "图片任务" : "媒体任务";
  }
}

function resolveTaskMode(
  taskType: string,
  taskRecord?: Record<string, unknown>,
): ImageWorkbenchTask["mode"] {
  const payloadMode = normalizeTaskModeValue(
    readString([asRecord(taskRecord?.payload)], ["mode", "task_mode"]),
  );
  if (payloadMode) {
    return payloadMode;
  }
  const normalizedType = taskType.trim().toLowerCase();
  if (normalizedType.includes("edit")) {
    return "edit";
  }
  if (
    normalizedType.includes("variation") ||
    normalizedType.includes("variant")
  ) {
    return "variation";
  }
  return "generate";
}

function resolveTaskRequestedTarget(taskType: string): "generate" | "cover" {
  return taskType.trim().toLowerCase() === "cover_generate"
    ? "cover"
    : "generate";
}

function resolveTaskLabelFromMode(mode: ImageWorkbenchTask["mode"]): string {
  switch (mode) {
    case "edit":
      return "图片编辑任务";
    case "variation":
      return "图片重绘任务";
    case "generate":
    default:
      return "图片任务";
  }
}

function resolvePreviewStatus(
  normalizedStatus: string,
): MessageImageWorkbenchPreview["status"] {
  switch (normalizedStatus) {
    case "partial":
      return "partial";
    case "succeeded":
      return "complete";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    case "pending":
    case "queued":
    case "running":
    default:
      return "running";
  }
}

function resolveWorkbenchStatus(
  normalizedStatus: string,
): ImageWorkbenchTask["status"] {
  switch (normalizedStatus) {
    case "pending":
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "partial":
      return "partial";
    case "succeeded":
      return "complete";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "error";
    default:
      return "routing";
  }
}

function resolvePendingProgressPhase(status?: string): string {
  switch (normalizeTaskStatus(status)) {
    case "partial":
      return "partial";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "pending":
    default:
      return "pending_submit";
  }
}

function resolvePreviewPhaseFromWorkbenchTaskStatus(
  status: ImageWorkbenchTask["status"],
): string {
  switch (status) {
    case "complete":
      return "succeeded";
    case "partial":
      return "partial";
    case "cancelled":
      return "cancelled";
    case "error":
      return "failed";
    case "queued":
      return "queued";
    case "routing":
    case "running":
    default:
      return "running";
  }
}

function resolveTaskProgressPhase(
  progressRecord: Record<string, unknown> | null,
  normalizedStatus: string,
): string | null {
  return (
    readString([progressRecord], ["phase"]) ||
    resolvePendingProgressPhase(normalizedStatus)
  );
}

function resolveAttemptRecord(
  taskRecord: Record<string, unknown>,
): Record<string, unknown> | null {
  const attempts = Array.isArray(taskRecord.attempts)
    ? taskRecord.attempts
    : [];
  if (attempts.length === 0) {
    return null;
  }

  const currentAttemptId =
    typeof taskRecord.current_attempt_id === "string"
      ? taskRecord.current_attempt_id.trim()
      : "";
  if (currentAttemptId) {
    const matched = attempts.find((attempt) => {
      const attemptRecord = asRecord(attempt);
      return attemptRecord?.attempt_id === currentAttemptId;
    });
    if (matched) {
      return asRecord(matched);
    }
  }

  return asRecord(attempts[attempts.length - 1]);
}

interface ParsedImageOutputSeed {
  url: string;
  prompt?: string;
  providerName?: string;
  modelName?: string;
  size?: string;
  slotId?: string | null;
  slotIndex?: number;
  slotLabel?: string | null;
  slotPrompt?: string | null;
  shotType?: string | null;
}

function appendImageOutputSeed(
  target: ParsedImageOutputSeed[],
  seenUrls: Set<string>,
  value: unknown,
  fallbackPrompt: string,
  fallbackProviderName?: string,
  fallbackModelName?: string,
  fallbackSize?: string,
  depth = 0,
): void {
  if (value === null || value === undefined || depth > 4) {
    return;
  }

  if (typeof value === "string") {
    const url = value.trim();
    if (!url || seenUrls.has(url)) {
      return;
    }
    seenUrls.add(url);
    target.push({
      url,
      prompt: fallbackPrompt || undefined,
      providerName: fallbackProviderName,
      modelName: fallbackModelName,
      size: fallbackSize,
      slotId: null,
      slotLabel: null,
      slotPrompt: null,
      shotType: null,
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) =>
      appendImageOutputSeed(
        target,
        seenUrls,
        item,
        fallbackPrompt,
        fallbackProviderName,
        fallbackModelName,
        fallbackSize,
        depth + 1,
      ),
    );
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  const url = readString([record], ["url", "src", "imageUrl", "image_url"]);
  const prompt = readString([record], ["prompt", "revised_prompt", "title"]);
  const providerName = readString(
    [record],
    ["providerName", "provider_name", "provider", "providerId", "provider_id"],
  );
  const modelName = readString([record], ["modelName", "model_name", "model"]);
  const size = readString([record], ["size", "resolution"]);
  const slotId = readString([record], ["slot_id", "slotId"]);
  const slotIndex = readPositiveNumber([record], ["slot_index", "slotIndex"]);
  const slotLabel = readString([record], ["slot_label", "slotLabel", "label"]);
  const slotPrompt = readString([record], ["slot_prompt", "slotPrompt"]);
  const shotType = readString([record], ["shot_type", "shotType"]);

  if (url && !seenUrls.has(url)) {
    seenUrls.add(url);
    target.push({
      url,
      prompt: prompt || fallbackPrompt || undefined,
      providerName: providerName || fallbackProviderName,
      modelName: modelName || fallbackModelName,
      size: size || fallbackSize,
      slotId: slotId || null,
      slotIndex,
      slotLabel: slotLabel || null,
      slotPrompt: slotPrompt || null,
      shotType: shotType || null,
    });
  }

  [
    record.images,
    record.outputs,
    record.results,
    record.items,
    record.data,
    record.output,
    record.result,
    record.image,
    record.asset,
    record.assets,
  ].forEach((nested) =>
    appendImageOutputSeed(
      target,
      seenUrls,
      nested,
      prompt || fallbackPrompt,
      providerName || fallbackProviderName,
      modelName || fallbackModelName,
      size || fallbackSize,
      depth + 1,
    ),
  );
}

function buildParsedImageTaskSnapshot(params: {
  taskRecord: Record<string, unknown>;
  taskId: string;
  taskType: string;
  projectId?: string | null;
  contentId?: string | null;
  taskFilePath?: string | null;
  artifactPath?: string | null;
  canvasState: CanvasStateUnion | null;
}): ParsedImageTaskSnapshot | null {
  const payload = asRecord(params.taskRecord.payload);
  const targetOutputSummary = asRecord(payload?.target_output_summary);
  const progressRecord = asRecord(params.taskRecord.progress);
  const uiHintsRecord = asRecord(params.taskRecord.ui_hints);
  const lastErrorRecord = asRecord(params.taskRecord.last_error);
  const currentAttempt = resolveAttemptRecord(params.taskRecord);
  const currentAttemptResult = currentAttempt?.result_snapshot;
  const resultValue = params.taskRecord.result;
  const resultRecord = asRecord(resultValue);
  const attemptResultRecord = asRecord(currentAttemptResult);
  const normalizedStatus = normalizeTaskStatus(
    typeof params.taskRecord.normalized_status === "string"
      ? params.taskRecord.normalized_status
      : typeof params.taskRecord.status === "string"
        ? params.taskRecord.status
        : undefined,
  );
  const runtimeContract = resolveImageRuntimeContractSnapshot({
    taskRecord: params.taskRecord,
    normalizedStatus,
  });
  const prompt = sanitizePreviewPrompt(
    readString(
      [payload, params.taskRecord, uiHintsRecord],
      ["prompt", "summary", "title", "placeholder_text", "placeholderText"],
    ) || "",
  );
  const displayPrompt = resolveDisplayPromptFromImageTaskPayload({
    payload,
    fallbackPrompt: prompt,
  });
  const rawText =
    sanitizePreviewPrompt(
      readString([payload], ["raw_text", "rawText"]) || "",
    ) ||
    prompt ||
    displayPrompt;
  const fallbackProviderName = readString(
    [currentAttempt, payload],
    ["provider", "providerName", "provider_name", "providerId", "provider_id"],
  );
  const fallbackModelName = readString(
    [currentAttempt, payload],
    ["model", "modelName", "model_name"],
  );
  const fallbackSize = readString([payload], ["size", "resolution"]);
  const requestedCount = readPositiveNumber(
    [payload],
    ["count", "imageCount", "image_count"],
  );
  const targetOutputId = readString(
    [payload],
    ["target_output_id", "targetOutputId"],
  );
  const targetOutputRefId = readString(
    [payload],
    ["target_output_ref_id", "targetOutputRefId"],
  );
  const referenceImages = readStringArray(
    [payload],
    ["reference_images", "referenceImages"],
  );
  const sourceImageUrl =
    normalizeRenderableImageUrl(
      readString(
        [targetOutputSummary],
        ["url", "src", "imageUrl", "image_url"],
      ),
    ) ?? normalizeRenderableImageUrl(referenceImages[0]);
  const sourceImagePrompt = sanitizePreviewPrompt(
    readString([targetOutputSummary], ["prompt", "summary", "title"]) || "",
  );
  const sourceImageCount =
    referenceImages.length > 0
      ? referenceImages.length
      : targetOutputId || targetOutputRefId
        ? 1
        : undefined;
  const payloadStoryboardSlots = readStoryboardSlotsFromUnknown(
    payload?.storyboard_slots,
  );
  const progressStoryboardSlots = readStoryboardSlotsFromUnknown(
    progressRecord?.preview_slots,
  );
  const expectedCount = Math.max(
    requestedCount || 1,
    payloadStoryboardSlots.length,
    progressStoryboardSlots.length,
  );
  const layoutHint =
    readString(
      [payload, uiHintsRecord, params.taskRecord],
      ["layout_hint", "layoutHint"],
    ) || null;
  const taskMode = resolveTaskMode(params.taskType, params.taskRecord);
  const taskLabel = resolveTaskLabel(params.taskType, taskMode);
  const lastError =
    readString([lastErrorRecord, progressRecord], ["message"]) ||
    (typeof params.taskRecord.last_error === "string"
      ? params.taskRecord.last_error.trim()
      : undefined);

  const outputSeeds: ParsedImageOutputSeed[] = [];
  const seenUrls = new Set<string>();
  [
    resultValue,
    currentAttemptResult,
    payload?.imageUrl,
    payload?.image_url,
  ].forEach((candidate) =>
    appendImageOutputSeed(
      outputSeeds,
      seenUrls,
      candidate,
      prompt,
      fallbackProviderName,
      fallbackModelName,
      fallbackSize,
    ),
  );
  outputSeeds.sort(
    (left, right) =>
      (left.slotIndex ?? Number.MAX_SAFE_INTEGER) -
      (right.slotIndex ?? Number.MAX_SAFE_INTEGER),
  );

  const applyTarget = resolveScopedImageWorkbenchApplyTarget({
    canvasState: params.canvasState,
    projectId: params.projectId ?? null,
    contentId: params.contentId ?? null,
    requestedTarget: resolveTaskRequestedTarget(params.taskType),
  });
  const createdAtRaw =
    readString(
      [params.taskRecord],
      ["updated_at", "updatedAt", "created_at", "createdAt"],
    ) || new Date().toISOString();
  const createdAt = Number.isNaN(Date.parse(createdAtRaw))
    ? Date.now()
    : Date.parse(createdAtRaw);
  const outputs: ImageWorkbenchOutput[] = outputSeeds.map((output, index) => ({
    id: `${params.taskId}:output:${output.slotIndex ?? index + 1}`,
    taskId: params.taskId,
    hookImageId: `${params.taskId}:hook:${output.slotIndex ?? index + 1}`,
    refId: `img-${params.taskId.slice(0, 6)}-${output.slotIndex ?? index + 1}`,
    url: output.url,
    prompt: output.prompt || prompt || `${taskLabel}结果`,
    slotId: output.slotId ?? null,
    slotIndex: output.slotIndex ?? index + 1,
    slotLabel: output.slotLabel ?? null,
    slotPrompt: output.slotPrompt ?? null,
    createdAt,
    providerName: output.providerName,
    modelName: output.modelName,
    size: output.size,
    parentOutputId: targetOutputId ?? null,
    resourceSaved: false,
    applyTarget,
  }));
  const storyboardSlots = mergeStoryboardSlots(
    payloadStoryboardSlots,
    progressStoryboardSlots,
    outputs
      .map((output, index) =>
        buildNormalizedStoryboardSlot({
          slotIndex: output.slotIndex ?? index + 1,
          slotId: output.slotId,
          label: output.slotLabel,
          prompt: output.slotPrompt || output.prompt,
          status: "complete",
        }),
      )
      .filter((item): item is ImageStoryboardSlot => Boolean(item)),
  );
  const successCount = outputs.length;
  const previewStatus = resolvePreviewStatus(normalizedStatus);
  const attemptCount = Array.isArray(params.taskRecord.attempts)
    ? params.taskRecord.attempts.length
    : undefined;
  const taskFilePath = normalizeImageTaskPath(params.taskFilePath) ?? null;
  const artifactPath = normalizeImageTaskPath(params.artifactPath) ?? null;
  const previewProviderName =
    outputs[0]?.providerName ?? fallbackProviderName ?? null;
  const previewModelName =
    outputs[0]?.modelName ??
    fallbackModelName ??
    runtimeContract?.model ??
    null;
  const previewPrompt = displayPrompt || prompt || `${taskLabel}进行中`;
  const presentationText = readImageTaskPresentationText([
    resultRecord,
    attemptResultRecord,
    payload,
    uiHintsRecord,
    params.taskRecord,
  ]);
  const previewCaption =
    readImageTaskPresentationCaption(
      [
        resultRecord,
        attemptResultRecord,
        payload,
        uiHintsRecord,
        params.taskRecord,
      ],
      previewStatus,
    ) ||
    buildImageWorkbenchCaption({
      prompt: previewPrompt,
      status: previewStatus,
      imageCount: successCount || undefined,
      statusMessage: lastError || null,
    });
  const preview: MessageImageWorkbenchPreview = {
    taskId: params.taskId,
    prompt: previewPrompt,
    mode: taskMode,
    status: previewStatus,
    projectId: params.projectId ?? null,
    contentId: params.contentId ?? null,
    taskFilePath,
    artifactPath,
    imageUrl: outputs[0]?.url ?? null,
    previewImages: buildPreviewImageUrls(outputs),
    imageCount:
      previewStatus === "running" ? expectedCount : successCount || undefined,
    expectedImageCount: expectedCount,
    providerName: previewProviderName,
    modelName: previewModelName,
    caption: previewCaption,
    layoutHint,
    storyboardSlots: storyboardSlots.length > 0 ? storyboardSlots : undefined,
    sourceImageUrl,
    sourceImagePrompt: sourceImagePrompt || null,
    sourceImageRef: targetOutputRefId ?? null,
    sourceImageCount,
    size: fallbackSize,
    phase: resolveTaskProgressPhase(progressRecord, normalizedStatus),
    statusMessage:
      readString([progressRecord], ["message"]) || lastError || null,
    retryable: readBoolean([lastErrorRecord], ["retryable"]),
    attemptCount,
    placeholderText:
      readString([uiHintsRecord], ["placeholder_text", "placeholderText"]) ||
      null,
    runtimeContract,
  };

  const messageTimestamp = new Date(createdAt);

  return {
    taskId: params.taskId,
    message: {
      id: resolveImageWorkbenchAssistantMessageId(params.taskId),
      role: "assistant",
      content:
        presentationText ||
        buildImageTaskAssistantContent({
          prompt: previewPrompt,
          mode: taskMode,
          modelName: previewModelName,
        }),
      timestamp: messageTimestamp,
      imageWorkbenchPreview: preview,
    },
    task: {
      sessionId: params.taskId,
      id: params.taskId,
      mode: taskMode,
      status: resolveWorkbenchStatus(normalizedStatus),
      prompt: previewPrompt,
      assistantIntro: presentationText || null,
      caption: previewCaption,
      rawText,
      expectedCount,
      layoutHint,
      storyboardSlots: storyboardSlots.length > 0 ? storyboardSlots : undefined,
      outputIds: outputs.map((output) => output.id),
      targetOutputId: targetOutputId ?? null,
      targetOutputRefId: targetOutputRefId ?? null,
      sourceImageUrl,
      sourceImagePrompt: sourceImagePrompt || null,
      sourceImageRef: targetOutputRefId ?? null,
      sourceImageCount,
      createdAt,
      failureMessage: lastError,
      runtimeContract,
      hookImageIds: outputs.map((output) => output.hookImageId),
      applyTarget,
      taskFilePath,
      artifactPath,
    },
    outputs,
    terminal:
      normalizedStatus === "succeeded" ||
      normalizedStatus === "failed" ||
      normalizedStatus === "cancelled",
    updatedAt: createdAt,
  };
}

function buildPendingImageTaskSnapshot(params: {
  taskId: string;
  taskType: string;
  status?: string;
  payload?: Record<string, unknown>;
  progressMessage?: string;
  projectId?: string | null;
  contentId?: string | null;
  taskFilePath?: string | null;
  artifactPath?: string | null;
  canvasState: CanvasStateUnion | null;
}): ParsedImageTaskSnapshot {
  const taskMode = resolveTaskMode(params.taskType, {
    payload: params.payload || {},
  });
  const storyboardSlots = readStoryboardSlotsFromUnknown(
    params.payload?.storyboard_slots,
  );
  const expectedCount = Math.max(
    readPositiveNumber([params.payload || null], ["count", "image_count"]) || 1,
    storyboardSlots.length,
  );
  const layoutHint =
    readString([params.payload || null], ["layout_hint", "layoutHint"]) || null;
  const taskLabel = resolveTaskLabel(params.taskType, taskMode);
  const startedAt = new Date();
  const previewPrompt =
    resolveDisplayPromptFromImageTaskPayload({
      payload: params.payload,
      fallbackPrompt:
        readString([params.payload || null], ["prompt", "summary", "title"]) ||
        "",
    }) || `${taskLabel}进行中`;
  const rawText =
    sanitizePreviewPrompt(
      readString([params.payload || null], ["raw_text", "rawText"]) || "",
    ) || previewPrompt;
  const previewModelName =
    readString(
      [params.payload || null],
      ["model", "modelName", "model_name"],
    ) || null;
  return (
    buildParsedImageTaskSnapshot({
      taskRecord: {
        task_id: params.taskId,
        task_type: params.taskType,
        status: params.status || "pending_submit",
        normalized_status: normalizeTaskStatus(params.status),
        payload: params.payload || {},
        progress: {
          phase: resolvePendingProgressPhase(params.status),
          message: params.progressMessage || "正在生成图片。",
        },
        created_at: new Date().toISOString(),
      },
      taskId: params.taskId,
      taskType: params.taskType,
      projectId: params.projectId ?? null,
      contentId: params.contentId ?? null,
      taskFilePath: params.taskFilePath ?? null,
      artifactPath: params.artifactPath ?? null,
      canvasState: params.canvasState,
    }) || {
      taskId: params.taskId,
      message: {
        id: resolveImageWorkbenchAssistantMessageId(params.taskId),
        role: "assistant",
        content:
          readImageTaskPresentationText([params.payload || null]) ||
          buildImageTaskAssistantContent({
            prompt: previewPrompt,
            mode: taskMode,
            modelName: previewModelName,
          }),
        timestamp: startedAt,
        isThinking: false,
        imageWorkbenchPreview: {
          taskId: params.taskId,
          prompt: previewPrompt,
          mode: taskMode,
          status: "running",
          expectedImageCount: expectedCount,
          providerName:
            readString(
              [params.payload || null],
              ["provider", "providerName", "provider_name", "provider_id"],
            ) || null,
          modelName: previewModelName,
          caption: null,
          projectId: params.projectId ?? null,
          contentId: params.contentId ?? null,
          taskFilePath: normalizeImageTaskPath(params.taskFilePath) ?? null,
          artifactPath: normalizeImageTaskPath(params.artifactPath) ?? null,
          imageCount: expectedCount,
          layoutHint,
          storyboardSlots:
            storyboardSlots.length > 0 ? storyboardSlots : undefined,
          phase: resolvePendingProgressPhase(params.status),
          statusMessage: params.progressMessage || "正在生成图片。",
        },
      },
      task: {
        sessionId: params.taskId,
        id: params.taskId,
        mode: taskMode,
        status: "queued",
        prompt: previewPrompt,
        assistantIntro:
          readImageTaskPresentationText([params.payload || null]) || null,
        caption: null,
        rawText,
        expectedCount,
        layoutHint,
        storyboardSlots:
          storyboardSlots.length > 0 ? storyboardSlots : undefined,
        outputIds: [],
        targetOutputId: null,
        createdAt: Date.now(),
        hookImageIds: [],
        applyTarget: resolveScopedImageWorkbenchApplyTarget({
          canvasState: params.canvasState,
          projectId: params.projectId ?? null,
          contentId: params.contentId ?? null,
          requestedTarget: resolveTaskRequestedTarget(params.taskType),
        }),
        taskFilePath: normalizeImageTaskPath(params.taskFilePath) ?? null,
        artifactPath: normalizeImageTaskPath(params.artifactPath) ?? null,
      },
      outputs: [],
      terminal: false,
      updatedAt: Date.now(),
    }
  );
}

function buildImageTaskSnapshotFromArtifactOutput(params: {
  artifact: MediaTaskArtifactOutput;
  projectId?: string | null;
  contentId?: string | null;
  canvasState: CanvasStateUnion | null;
}): ParsedImageTaskSnapshot | null {
  const record = asRecord(params.artifact.record);

  if (record) {
    return (
      buildParsedImageTaskSnapshot({
        taskRecord: record,
        taskId: params.artifact.task_id,
        taskType: params.artifact.task_type,
        projectId: params.projectId ?? null,
        contentId: params.contentId ?? null,
        taskFilePath: params.artifact.absolute_path,
        artifactPath: params.artifact.artifact_path,
        canvasState: params.canvasState,
      }) || null
    );
  }

  if (!params.artifact.task_id || !params.artifact.task_type) {
    return null;
  }

  return buildPendingImageTaskSnapshot({
    taskId: params.artifact.task_id,
    taskType: params.artifact.task_type,
    status: params.artifact.status,
    projectId: params.projectId ?? null,
    contentId: params.contentId ?? null,
    taskFilePath: params.artifact.absolute_path,
    artifactPath: params.artifact.artifact_path,
    canvasState: params.canvasState,
  });
}

function normalizeImageWorkbenchPreviewIdentityText(
  value?: string | null,
): string {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function buildRunningImageWorkbenchPreviewFallbackKey(
  preview?: MessageImageWorkbenchPreview,
): string {
  if (!preview || preview.status !== "running") {
    return "";
  }

  const prompt = normalizeImageWorkbenchPreviewIdentityText(preview.prompt);
  if (!prompt) {
    return "";
  }

  return [
    preview.projectId?.trim() || "",
    preview.contentId?.trim() || "",
    preview.mode,
    preview.layoutHint || "",
    preview.size || "",
    String(preview.expectedImageCount ?? preview.imageCount ?? ""),
    prompt,
  ].join("::");
}

function resolveImageWorkbenchPreviewPathKey(
  preview?: MessageImageWorkbenchPreview,
): string {
  const normalizedTaskFilePath = normalizeImageTaskPath(preview?.taskFilePath);
  if (normalizedTaskFilePath) {
    return normalizedTaskFilePath.toLowerCase();
  }

  const normalizedArtifactPath = normalizeImageTaskPath(preview?.artifactPath);
  return normalizedArtifactPath ? normalizedArtifactPath.toLowerCase() : "";
}

function previewsReferToSameImageWorkbenchTask(
  left?: MessageImageWorkbenchPreview,
  right?: MessageImageWorkbenchPreview,
): boolean {
  if (!left || !right) {
    return false;
  }

  const leftTaskId = left.taskId?.trim();
  const rightTaskId = right.taskId?.trim();
  if (leftTaskId && rightTaskId && leftTaskId === rightTaskId) {
    return true;
  }

  const leftPathKey = resolveImageWorkbenchPreviewPathKey(left);
  const rightPathKey = resolveImageWorkbenchPreviewPathKey(right);
  if (leftPathKey && rightPathKey && leftPathKey === rightPathKey) {
    return true;
  }

  const leftRunningKey = buildRunningImageWorkbenchPreviewFallbackKey(left);
  const rightRunningKey = buildRunningImageWorkbenchPreviewFallbackKey(right);
  return Boolean(
    leftRunningKey && rightRunningKey && leftRunningKey === rightRunningKey,
  );
}

function isDraftImageWorkbenchPreview(
  preview?: MessageImageWorkbenchPreview,
): boolean {
  return isDraftImageWorkbenchTaskId(preview?.taskId);
}

function isDraftAndResolvedImageWorkbenchPreviewPair(
  left?: MessageImageWorkbenchPreview,
  right?: MessageImageWorkbenchPreview,
): boolean {
  if (!left || !right) {
    return false;
  }

  return isDraftImageWorkbenchPreview(left) !== isDraftImageWorkbenchPreview(right);
}

function resolveImageWorkbenchPreviewIdentityKeys(
  preview?: MessageImageWorkbenchPreview,
): string[] {
  if (!preview) {
    return [];
  }

  const keys = new Set<string>();
  const taskId = preview.taskId?.trim();
  if (taskId) {
    keys.add(`task:${taskId}`);
  }

  const pathKey = resolveImageWorkbenchPreviewPathKey(preview);
  if (pathKey) {
    keys.add(`path:${pathKey}`);
  }

  const runningKey = buildRunningImageWorkbenchPreviewFallbackKey(preview);
  if (runningKey) {
    keys.add(`running:${runningKey}`);
  }

  return Array.from(keys);
}

function isImageWorkbenchStatusOnlyMessage(message: Message): boolean {
  return isImageWorkbenchStatusOnlyText(message.content);
}

function isImageWorkbenchSubmissionTemplateMessage(message: Message): boolean {
  return isImageWorkbenchSubmissionTemplateText(message.content);
}

function hasReplaceableImageWorkbenchMessageBody(message: Message): boolean {
  return (
    !message.content.trim() ||
    isImageWorkbenchSubmissionTemplateMessage(message) ||
    isImageWorkbenchStatusOnlyMessage(message)
  );
}

function shouldReplaceImageWorkbenchMessageBody(params: {
  existingMessage: Message;
  nextMessage: Message;
}): boolean {
  const nextPreview = params.nextMessage.imageWorkbenchPreview;
  if (!nextPreview) {
    return false;
  }

  const existingPreview = params.existingMessage.imageWorkbenchPreview;
  const shouldPromoteTerminalSnapshot =
    previewsReferToSameImageWorkbenchTask(existingPreview, nextPreview) &&
    isImageWorkbenchSubmissionTemplateMessage(params.existingMessage) &&
    nextPreview.status !== "running";
  const isActiveRuntimeMessage =
    Boolean(params.existingMessage.isThinking) &&
    Boolean(params.existingMessage.runtimeTurnId) &&
    params.existingMessage.runtimeTurnId === params.nextMessage.runtimeTurnId;
  if (
    isActiveRuntimeMessage &&
    !isImageWorkbenchSubmissionTemplateMessage(params.existingMessage) &&
    !isImageWorkbenchStatusOnlyMessage(params.existingMessage)
  ) {
    return false;
  }

  const shouldUseCanonicalImageMessageBody =
    Boolean(nextPreview) &&
    hasReplaceableImageWorkbenchMessageBody(params.existingMessage) &&
    (previewsReferToSameImageWorkbenchTask(existingPreview, nextPreview) ||
      (Boolean(params.existingMessage.runtimeTurnId) &&
        params.existingMessage.runtimeTurnId ===
          params.nextMessage.runtimeTurnId));

  return (
    shouldUseCanonicalImageMessageBody ||
    shouldPromoteTerminalSnapshot ||
    (params.existingMessage.id ===
      resolveImageWorkbenchAssistantMessageId(nextPreview.taskId) &&
      hasReplaceableImageWorkbenchMessageBody(params.existingMessage)) ||
    hasReplaceableImageWorkbenchMessageBody(params.existingMessage)
  );
}

function buildImageWorkbenchMessageStateSignature(
  message: Pick<
    Message,
    | "content"
    | "contentParts"
    | "toolCalls"
    | "timestamp"
    | "isThinking"
    | "thinkingContent"
    | "runtimeStatus"
    | "imageWorkbenchPreview"
  >,
): string {
  return JSON.stringify({
    content: message.content,
    contentParts: message.contentParts ?? null,
    toolCalls: message.toolCalls ?? null,
    timestamp:
      message.timestamp instanceof Date ? message.timestamp.getTime() : null,
    isThinking: message.isThinking,
    thinkingContent: message.thinkingContent ?? null,
    runtimeStatus: message.runtimeStatus ?? null,
    imageWorkbenchPreview: message.imageWorkbenchPreview ?? null,
  });
}

function hasImageWorkbenchProcessContentParts(
  parts: Message["contentParts"] | undefined,
): boolean {
  return Boolean(parts?.some(contentPartContainsProcess));
}

function mergeImageWorkbenchContentParts(params: {
  existingMessage: Message;
  nextMessage: Message;
  replaceBody: boolean;
}): Message["contentParts"] | undefined {
  const existingParts = params.existingMessage.contentParts;
  const nextParts = params.nextMessage.contentParts;
  if (!existingParts?.length) {
    return nextParts;
  }
  if (!nextParts?.length) {
    return existingParts;
  }
  if (!params.replaceBody) {
    return existingParts;
  }
  if (hasImageWorkbenchProcessContentParts(existingParts)) {
    return existingParts;
  }
  return nextParts;
}

function mergeImageWorkbenchToolCalls(params: {
  existingMessage: Message;
  nextMessage: Message;
  replaceBody: boolean;
}): Message["toolCalls"] | undefined {
  const existingToolCalls = params.existingMessage.toolCalls;
  const nextToolCalls = params.nextMessage.toolCalls;
  if (!existingToolCalls?.length) {
    return nextToolCalls;
  }
  if (!nextToolCalls?.length) {
    return existingToolCalls;
  }
  if (!params.replaceBody) {
    return existingToolCalls;
  }

  const merged = new Map<string, NonNullable<Message["toolCalls"]>[number]>();
  for (const toolCall of [...existingToolCalls, ...nextToolCalls]) {
    merged.set(toolCall.id, toolCall);
  }
  return Array.from(merged.values());
}

function resolveImageWorkbenchPreviewProgressScore(
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

function mergeImageWorkbenchPreviewByProgress(
  existingPreview?: MessageImageWorkbenchPreview,
  nextPreview?: MessageImageWorkbenchPreview,
): MessageImageWorkbenchPreview | undefined {
  if (!existingPreview) {
    return nextPreview;
  }
  if (
    !nextPreview ||
    !previewsReferToSameImageWorkbenchTask(existingPreview, nextPreview)
  ) {
    if (
      isDraftAndResolvedImageWorkbenchPreviewPair(existingPreview, nextPreview)
    ) {
      return isDraftImageWorkbenchPreview(existingPreview)
        ? nextPreview
        : existingPreview;
    }
    return nextPreview || existingPreview;
  }

  const nextIsAtLeastAsFresh =
    resolveImageWorkbenchPreviewProgressScore(nextPreview) >=
    resolveImageWorkbenchPreviewProgressScore(existingPreview);
  return nextIsAtLeastAsFresh
    ? {
        ...existingPreview,
        ...nextPreview,
      }
    : {
        ...nextPreview,
        ...existingPreview,
      };
}

function mergeImageWorkbenchPreviewMessage(params: {
  existingMessage: Message;
  nextMessage: Message;
}): Message {
  const existingPreview = params.existingMessage.imageWorkbenchPreview;
  const nextPreview = params.nextMessage.imageWorkbenchPreview;
  const mergedPreview = mergeImageWorkbenchPreviewByProgress(
    existingPreview,
    nextPreview,
  );
  const replaceBody = shouldReplaceImageWorkbenchMessageBody(params);
  const mergedMessage: Message = {
    ...params.existingMessage,
    content:
      replaceBody || !params.existingMessage.content.trim()
        ? params.nextMessage.content
        : params.existingMessage.content,
    contentParts: mergeImageWorkbenchContentParts({
      existingMessage: params.existingMessage,
      nextMessage: params.nextMessage,
      replaceBody,
    }),
    toolCalls: mergeImageWorkbenchToolCalls({
      existingMessage: params.existingMessage,
      nextMessage: params.nextMessage,
      replaceBody,
    }),
    timestamp: replaceBody
      ? params.nextMessage.timestamp
      : params.existingMessage.timestamp,
    isThinking: replaceBody
      ? params.nextMessage.isThinking
      : mergedPreview?.status === "running"
        ? params.existingMessage.isThinking
        : false,
    thinkingContent: mergeMessageThinkingContent(params),
    runtimeStatus: params.nextMessage.runtimeStatus,
    imageWorkbenchPreview: mergedPreview,
  };

  return buildImageWorkbenchMessageStateSignature(mergedMessage) ===
    buildImageWorkbenchMessageStateSignature(params.existingMessage)
    ? params.existingMessage
    : mergedMessage;
}

function dedupeImageWorkbenchPreviewMessages(messages: Message[]): Message[] {
  const dedupedMessages: Message[] = [];
  const previewMessageIndex = new Map<string, number>();

  messages.forEach((message) => {
    const preview = message.imageWorkbenchPreview;
    const previewKeys = resolveImageWorkbenchPreviewIdentityKeys(preview);
    if (previewKeys.length === 0) {
      dedupedMessages.push(message);
      return;
    }

    const existingIndex = previewKeys.reduce<number | undefined>(
      (matchedIndex, key) => matchedIndex ?? previewMessageIndex.get(key),
      undefined,
    );
    if (existingIndex === undefined) {
      const nextIndex = dedupedMessages.length;
      dedupedMessages.push(message);
      previewKeys.forEach((key) => {
        previewMessageIndex.set(key, nextIndex);
      });
      return;
    }

    dedupedMessages[existingIndex] = mergeImageWorkbenchPreviewMessage({
      existingMessage: dedupedMessages[existingIndex],
      nextMessage: message,
    });
    resolveImageWorkbenchPreviewIdentityKeys(
      dedupedMessages[existingIndex].imageWorkbenchPreview,
    ).forEach((key) => {
      previewMessageIndex.set(key, existingIndex);
    });
  });

  return dedupedMessages;
}

function shouldMergeImageWorkbenchPreviewIntoPreviousMessage(
  previous: Message | undefined,
  current: Message,
): boolean {
  if (
    !previous ||
    previous.role !== "assistant" ||
    current.role !== "assistant" ||
    !current.imageWorkbenchPreview
  ) {
    return false;
  }

  if (
    previous.runtimeTurnId &&
    current.runtimeTurnId &&
    previous.runtimeTurnId === current.runtimeTurnId
  ) {
    return true;
  }

  if (
    isDraftAndResolvedImageWorkbenchPreviewPair(
      previous.imageWorkbenchPreview,
      current.imageWorkbenchPreview,
    )
  ) {
    return true;
  }

  return isImageWorkbenchSubmissionTemplateMessage(previous);
}

function mergeAdjacentImageWorkbenchPreviewMessages(
  messages: Message[],
): Message[] {
  const mergedMessages: Message[] = [];

  messages.forEach((message) => {
    const previous = mergedMessages.at(-1);
    if (
      shouldMergeImageWorkbenchPreviewIntoPreviousMessage(previous, message)
    ) {
      mergedMessages[mergedMessages.length - 1] =
        mergeImageWorkbenchPreviewMessage({
          existingMessage: previous!,
          nextMessage: message,
        });
      return;
    }

    mergedMessages.push(message);
  });

  return mergedMessages;
}

function isImageWorkbenchSkillFailureText(value?: string | null): boolean {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("skill_execute_failed") ||
    normalized.includes("skill 执行失败") ||
    (normalized.includes("execute_skill") &&
      (normalized.includes("failed") || normalized.includes("失败")))
  );
}

function normalizeImageWorkbenchRuntimeFailureMessage(
  message: Message,
): Message {
  const preview = message.imageWorkbenchPreview;
  if (
    message.role !== "assistant" ||
    !preview ||
    preview.status !== "running" ||
    !isImageWorkbenchSkillFailureText(message.content)
  ) {
    return message;
  }

  const retainedContentParts = (message.contentParts || []).filter(
    (part) => part.type !== "text",
  );
  const nextPreview: MessageImageWorkbenchPreview = {
    ...preview,
    status: "failed",
    phase: "failed",
    statusMessage: null,
    caption:
      preview.caption ??
      buildImageWorkbenchCaption({
        prompt: preview.prompt,
        status: "failed",
        imageCount: preview.imageCount,
        statusMessage: null,
      }),
    retryable: true,
  };
  const nextMessage: Message = {
    ...message,
    content: "",
    contentParts:
      retainedContentParts.length > 0 ? retainedContentParts : undefined,
    isThinking: false,
    runtimeStatus: undefined,
    imageWorkbenchPreview: nextPreview,
  };

  return buildImageWorkbenchMessageStateSignature(nextMessage) ===
    buildImageWorkbenchMessageStateSignature(message)
    ? message
    : nextMessage;
}

function finalizePreviewMessages(
  previousMessages: Message[],
  nextMessages: Message[],
): Message[] {
  const normalizedMessages = nextMessages.map(
    normalizeImageWorkbenchRuntimeFailureMessage,
  );
  const dedupedMessages = mergeAdjacentImageWorkbenchPreviewMessages(
    dedupeImageWorkbenchPreviewMessages(normalizedMessages),
  );
  if (
    dedupedMessages.length === previousMessages.length &&
    dedupedMessages.every(
      (message, index) => message === previousMessages[index],
    )
  ) {
    return previousMessages;
  }

  return dedupedMessages;
}

function buildImageWorkbenchMessagePatchFromTask(params: {
  task: ImageWorkbenchTask;
  outputs: ImageWorkbenchOutput[];
  preview: MessageImageWorkbenchPreview;
}): Pick<
  Message,
  | "content"
  | "timestamp"
  | "isThinking"
  | "toolCalls"
  | "contentParts"
  | "runtimeStatus"
> {
  const prompt =
    params.preview.prompt ||
    params.task.prompt ||
    `${resolveTaskLabelFromMode(params.task.mode)}进行中`;
  const startedAt = new Date(params.task.createdAt || Date.now());

  return {
    content: buildImageTaskAssistantContent({
      prompt,
      mode: params.task.mode,
      modelName:
        params.preview.modelName ||
        params.outputs[0]?.modelName ||
        params.task.runtimeContract?.model ||
        null,
    }),
    timestamp: startedAt,
    isThinking: false,
    toolCalls: undefined,
    contentParts: undefined,
    runtimeStatus: undefined,
  };
}

function buildImageWorkbenchPreviewMessageFromTask(params: {
  task: ImageWorkbenchTask;
  outputs: ImageWorkbenchOutput[];
  projectId?: string | null;
  contentId?: string | null;
}): Message {
  const outputs = orderTaskOutputs(params.task, params.outputs);
  const preferredOutput = outputs[0];
  const previewStatus = resolvePreviewStatusFromWorkbenchTask(
    params.task.status,
  );
  const previewProviderName = preferredOutput?.providerName ?? null;
  const previewModelName =
    preferredOutput?.modelName ?? params.task.runtimeContract?.model ?? null;
  const previewPrompt = params.task.prompt || "图片任务";
  const preview: MessageImageWorkbenchPreview = {
    taskId: params.task.id,
    prompt: previewPrompt,
    mode: params.task.mode,
    status: previewStatus,
    projectId: params.projectId ?? null,
    contentId: params.contentId ?? null,
    taskFilePath: params.task.taskFilePath ?? null,
    artifactPath: params.task.artifactPath ?? null,
    imageUrl: preferredOutput?.url || null,
    previewImages: buildPreviewImageUrls(outputs),
    imageCount:
      outputs.length > 0
        ? outputs.length
        : previewStatus === "running"
          ? params.task.expectedCount
          : undefined,
    expectedImageCount: params.task.expectedCount,
    providerName: previewProviderName,
    modelName: previewModelName,
    caption:
      params.task.caption ||
      buildImageWorkbenchCaption({
        prompt: previewPrompt,
        status: previewStatus,
        imageCount: outputs.length || undefined,
        statusMessage: params.task.failureMessage || null,
      }),
    layoutHint: params.task.layoutHint ?? null,
    storyboardSlots: params.task.storyboardSlots,
    sourceImageUrl: params.task.sourceImageUrl ?? null,
    sourceImagePrompt: params.task.sourceImagePrompt ?? null,
    sourceImageRef: params.task.sourceImageRef ?? null,
    sourceImageCount: params.task.sourceImageCount,
    size: preferredOutput?.size,
    phase: resolvePreviewPhaseFromWorkbenchTaskStatus(params.task.status),
    statusMessage:
      previewStatus === "running"
        ? null
        : params.task.status === "error" || params.task.status === "cancelled"
          ? params.task.failureMessage || null
          : null,
    runtimeContract: params.task.runtimeContract ?? null,
  };

  return {
    id: resolveImageWorkbenchAssistantMessageId(params.task.id),
    role: "assistant",
    ...buildImageWorkbenchMessagePatchFromTask({
      task: params.task,
      outputs,
      preview,
    }),
    imageWorkbenchPreview: preview,
  };
}

function buildImageWorkbenchUserMessageFromTask(
  task: ImageWorkbenchTask,
): Message | null {
  const fallbackTexts = new Set([
    "图片任务",
    `${resolveTaskLabelFromMode(task.mode)}进行中`,
    `${resolveTaskLabel(task.id, task.mode)}进行中`,
  ]);
  const rawText = (task.rawText || "").trim();
  const promptText = (task.prompt || "").trim();
  const content = rawText || promptText;
  if (!content || fallbackTexts.has(content)) {
    return null;
  }

  return {
    id: `image-workbench:${task.id}:user`,
    role: "user",
    content,
    timestamp: new Date(Math.max(0, (task.createdAt || Date.now()) - 1)),
  };
}

function hasUserMessageForImageWorkbenchTask(params: {
  messages: Message[];
  task?: ImageWorkbenchTask;
  preview: MessageImageWorkbenchPreview;
}): boolean {
  const taskTexts = buildImageTaskConversationTextSet({
    task: params.task,
    preview: params.preview,
  });
  if (taskTexts.size === 0) {
    return false;
  }

  return params.messages.some((message) =>
    userMessageMatchesImageTask(message, taskTexts),
  );
}

function hasPrecedingUserMessage(messages: Message[], index: number): boolean {
  return messages.slice(0, index).some((message) => message.role === "user");
}

function ensureImageWorkbenchUserMessagesFromState(params: {
  messages: Message[];
  imageWorkbenchState?: SessionImageWorkbenchState;
}): Message[] {
  const taskById = new Map(
    (params.imageWorkbenchState?.tasks || []).map((task) => [task.id, task]),
  );
  let nextMessages = params.messages;

  for (let index = 0; index < nextMessages.length; index += 1) {
    const message = nextMessages[index];
    const preview = message?.imageWorkbenchPreview;
    if (message?.role !== "assistant" || !preview?.taskId) {
      continue;
    }

    const task = taskById.get(preview.taskId);
    const userMessage = task
      ? buildImageWorkbenchUserMessageFromTask(task)
      : null;
    if (
      !userMessage ||
      hasPrecedingUserMessage(nextMessages, index) ||
      hasUserMessageForImageWorkbenchTask({
        messages: nextMessages,
        task,
        preview,
      })
    ) {
      continue;
    }

    if (nextMessages === params.messages) {
      nextMessages = [...params.messages];
    }
    nextMessages.splice(index, 0, userMessage);
    index += 1;
  }

  return nextMessages;
}

function buildImageWorkbenchPreviewMessagesFromState(params: {
  imageWorkbenchState?: SessionImageWorkbenchState;
  projectId?: string | null;
  contentId?: string | null;
  includeUserMessages?: boolean;
}): Message[] {
  const imageWorkbenchState = params.imageWorkbenchState;
  if (!imageWorkbenchState || imageWorkbenchState.tasks.length === 0) {
    return [];
  }

  const outputsByTaskId = new Map<string, ImageWorkbenchOutput[]>();
  imageWorkbenchState.outputs.forEach((output) => {
    const current = outputsByTaskId.get(output.taskId) || [];
    current.push(output);
    outputsByTaskId.set(output.taskId, current);
  });

  return imageWorkbenchState.tasks
    .slice()
    .sort((left, right) => left.createdAt - right.createdAt)
    .flatMap((task) => {
      const assistantMessage = buildImageWorkbenchPreviewMessageFromTask({
        task,
        outputs: outputsByTaskId.get(task.id) || [],
        projectId: params.projectId,
        contentId: params.contentId,
      });
      const userMessage = params.includeUserMessages
        ? buildImageWorkbenchUserMessageFromTask(task)
        : null;
      return userMessage ? [userMessage, assistantMessage] : [assistantMessage];
    });
}

function upsertPreviewMessage(
  messages: Message[],
  nextMessage: Message,
  options?: {
    runtimeTurnId?: string | null;
  },
): Message[] {
  const nextMessages = [...messages];
  const nextPreview = nextMessage.imageWorkbenchPreview;
  const normalizedRuntimeTurnId = normalizeTaskRef(options?.runtimeTurnId);
  if (nextPreview && normalizedRuntimeTurnId) {
    const turnMatchedIndex = nextMessages.findIndex(
      (message) =>
        message.role === "assistant" &&
        message.runtimeTurnId === normalizedRuntimeTurnId,
    );
    if (turnMatchedIndex >= 0) {
      const existingTurnMessage = nextMessages[turnMatchedIndex];
      const runtimeBoundNextMessage = {
        ...nextMessage,
        runtimeTurnId:
          nextMessage.runtimeTurnId || existingTurnMessage.runtimeTurnId,
      };
      const mergedMessage = mergeImageWorkbenchPreviewMessage({
        existingMessage: existingTurnMessage,
        nextMessage: runtimeBoundNextMessage,
      });
      nextMessages[turnMatchedIndex] = mergedMessage;
      const withoutDuplicatePreviewMessages = nextMessages.filter(
        (message, index) =>
          index === turnMatchedIndex ||
          message.role !== "assistant" ||
          !previewsReferToSameImageWorkbenchTask(
            message.imageWorkbenchPreview,
            nextPreview,
          ),
      );
      if (
        mergedMessage === existingTurnMessage &&
        withoutDuplicatePreviewMessages.length === messages.length
      ) {
        return messages;
      }
      return finalizePreviewMessages(messages, withoutDuplicatePreviewMessages);
    }
  }

  const existingIndex = nextMessages.findIndex(
    (message) => message.id === nextMessage.id,
  );
  if (existingIndex >= 0) {
    const mergedMessage = mergeImageWorkbenchPreviewMessage({
      existingMessage: nextMessages[existingIndex],
      nextMessage,
    });
    if (mergedMessage === nextMessages[existingIndex]) {
      return messages;
    }
    nextMessages[existingIndex] = mergedMessage;
    return finalizePreviewMessages(messages, nextMessages);
  }

  if (nextPreview) {
    const taskMatchedIndex = nextMessages.findIndex(
      (message) =>
        message.role === "assistant" &&
        previewsReferToSameImageWorkbenchTask(
          message.imageWorkbenchPreview,
          nextPreview,
        ),
    );
    if (taskMatchedIndex >= 0) {
      const mergedMessage = mergeImageWorkbenchPreviewMessage({
        existingMessage: nextMessages[taskMatchedIndex],
        nextMessage,
      });
      if (mergedMessage === nextMessages[taskMatchedIndex]) {
        return messages;
      }
      nextMessages[taskMatchedIndex] = mergedMessage;
      return finalizePreviewMessages(messages, nextMessages);
    }
  }

  nextMessages.push(nextMessage);
  return finalizePreviewMessages(messages, nextMessages);
}

function mergeImageTaskSnapshot(
  current: SessionImageWorkbenchState,
  snapshot: ParsedImageTaskSnapshot,
): SessionImageWorkbenchState {
  const previousTask = current.tasks.find(
    (task) => task.id === snapshot.taskId,
  );
  const previousOutputs = current.outputs.filter(
    (output) => output.taskId === snapshot.taskId,
  );
  const previousProgressScore = previousTask
    ? resolveImageTaskSnapshotProgressScore({
        taskStatus: previousTask.status,
        outputCount: previousOutputs.length,
      })
    : -1;
  const nextProgressScore = resolveImageTaskSnapshotProgressScore({
    taskStatus: snapshot.task.status,
    outputCount: snapshot.outputs.length,
  });

  if (previousTask && nextProgressScore < previousProgressScore) {
    return current;
  }

  const preservedSelectedOutputId = current.outputs.find(
    (output) =>
      output.id === current.selectedOutputId &&
      output.taskId === snapshot.taskId,
  )?.id;
  const preservedSelectedOutputUrl = current.outputs.find(
    (output) =>
      output.id === current.selectedOutputId &&
      output.taskId === snapshot.taskId,
  )?.url;
  const mergedOutputs = snapshot.outputs.map((output) => {
    const previousOutput = previousOutputs.find(
      (candidate) => candidate.url === output.url,
    );
    return previousOutput
      ? {
          ...previousOutput,
          ...output,
        }
      : output;
  });
  const nextTasks = [
    {
      ...snapshot.task,
      sessionId: previousTask?.sessionId || snapshot.task.sessionId,
      assistantIntro:
        snapshot.task.assistantIntro ?? previousTask?.assistantIntro ?? null,
      caption: snapshot.task.caption ?? previousTask?.caption ?? null,
      taskFilePath:
        snapshot.task.taskFilePath ?? previousTask?.taskFilePath ?? null,
      artifactPath:
        snapshot.task.artifactPath ?? previousTask?.artifactPath ?? null,
      runtimeContract:
        snapshot.task.runtimeContract ?? previousTask?.runtimeContract ?? null,
    },
    ...current.tasks.filter((task) => task.id !== snapshot.taskId),
  ];
  const nextOutputs = [
    ...mergedOutputs,
    ...current.outputs.filter((output) => output.taskId !== snapshot.taskId),
  ];
  const isSelectedSnapshotTask = current.selectedTaskId === snapshot.taskId;
  const selectedOutputId = isSelectedSnapshotTask
    ? preservedSelectedOutputId &&
      mergedOutputs.some((output) => output.id === preservedSelectedOutputId)
      ? preservedSelectedOutputId
      : preservedSelectedOutputUrl
        ? (mergedOutputs.find(
            (output) => output.url === preservedSelectedOutputUrl,
          )?.id ??
          mergedOutputs[0]?.id ??
          null)
        : mergedOutputs[0]?.id || null
    : current.selectedOutputId &&
        nextOutputs.some((output) => output.id === current.selectedOutputId)
      ? current.selectedOutputId
      : nextOutputs[0]?.id || null;
  const selectedTaskId =
    current.selectedTaskId &&
    nextTasks.some((task) => task.id === current.selectedTaskId)
      ? current.selectedTaskId
      : selectedOutputId
        ? (nextOutputs.find((output) => output.id === selectedOutputId)
            ?.taskId ?? null)
        : nextTasks[0]?.id || null;

  return {
    ...current,
    tasks: nextTasks,
    outputs: nextOutputs,
    selectedTaskId,
    selectedOutputId,
  };
}

function resolveImageTaskSnapshotProgressScore(params: {
  taskStatus?: ImageWorkbenchTask["status"];
  outputCount: number;
}): number {
  switch (params.taskStatus) {
    case "complete":
    case "error":
    case "cancelled":
      return 4;
    case "partial":
      return 3;
    case "running":
      return params.outputCount > 0 ? 3 : 2;
    case "queued":
    case "routing":
      return params.outputCount > 0 ? 2 : 1;
    default:
      return params.outputCount > 0 ? 2 : 0;
  }
}

function resolvePreviewStatusFromWorkbenchTask(
  status: ImageWorkbenchTask["status"],
): MessageImageWorkbenchPreview["status"] {
  switch (status) {
    case "complete":
      return "complete";
    case "partial":
      return "partial";
    case "cancelled":
      return "cancelled";
    case "error":
      return "failed";
    case "queued":
    case "routing":
    case "running":
    default:
      return "running";
  }
}

function orderTaskOutputs(
  task: ImageWorkbenchTask,
  outputs: ImageWorkbenchOutput[],
): ImageWorkbenchOutput[] {
  const ordered = task.outputIds
    .map((outputId) => outputs.find((output) => output.id === outputId))
    .filter((output): output is ImageWorkbenchOutput => Boolean(output));
  const remaining = outputs.filter(
    (output) => !ordered.some((item) => item.id === output.id),
  );
  return [...ordered, ...remaining];
}

function normalizeImageTaskConversationText(value?: string | null): string {
  return normalizeImageWorkbenchPreviewIdentityText(value).replace(
    /^@\S+(?:\s+\S+)?\s*/u,
    "",
  );
}

function addImageTaskConversationText(
  values: Set<string>,
  value?: string | null,
) {
  const normalized = normalizeImageTaskConversationText(value);
  if (normalized) {
    values.add(normalized);
  }

  const parsed = value ? parseImageWorkbenchCommand(value) : null;
  const parsedPrompt = normalizeImageTaskConversationText(parsed?.prompt);
  if (parsedPrompt) {
    values.add(parsedPrompt);
  }
}

function buildImageTaskConversationTextSet(params: {
  task?: ImageWorkbenchTask;
  preview: MessageImageWorkbenchPreview;
}): Set<string> {
  const values = new Set<string>();
  addImageTaskConversationText(values, params.preview.prompt);
  addImageTaskConversationText(values, params.task?.prompt);
  addImageTaskConversationText(values, params.task?.rawText);
  return values;
}

function imageTaskConversationTextMatches(
  left: string,
  right: string,
): boolean {
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }

  const minLength = Math.min(left.length, right.length);
  return minLength >= 4 && (left.includes(right) || right.includes(left));
}

function userMessageMatchesImageTask(
  message: Message,
  taskTexts: Set<string>,
): boolean {
  if (message.role !== "user" || taskTexts.size === 0) {
    return false;
  }

  const candidates = new Set<string>();
  addImageTaskConversationText(candidates, message.content);
  for (const candidate of candidates) {
    for (const taskText of taskTexts) {
      if (imageTaskConversationTextMatches(candidate, taskText)) {
        return true;
      }
    }
  }
  return false;
}

function attachImageWorkbenchPreviewToMatchingTurn(params: {
  messages: Message[];
  previewMessage: Message;
  task?: ImageWorkbenchTask;
}): { messages: Message[]; attached: boolean } {
  const preview = params.previewMessage.imageWorkbenchPreview;
  if (!preview) {
    return { messages: params.messages, attached: false };
  }

  const taskTexts = buildImageTaskConversationTextSet({
    task: params.task,
    preview,
  });
  if (taskTexts.size === 0) {
    return { messages: params.messages, attached: false };
  }

  for (let index = 0; index < params.messages.length; index += 1) {
    const message = params.messages[index];
    if (!message || !userMessageMatchesImageTask(message, taskTexts)) {
      continue;
    }

    let insertIndex = index + 1;
    for (
      let candidateIndex = index + 1;
      candidateIndex < params.messages.length;
      candidateIndex += 1
    ) {
      const candidate = params.messages[candidateIndex];
      if (!candidate || candidate.role === "user") {
        break;
      }

      insertIndex = candidateIndex + 1;
      if (candidate.role !== "assistant") {
        continue;
      }

      if (
        previewsReferToSameImageWorkbenchTask(
          candidate.imageWorkbenchPreview,
          preview,
        )
      ) {
        return { messages: params.messages, attached: true };
      }

      if (!candidate.imageWorkbenchPreview) {
        const nextMessages = [...params.messages];
        nextMessages[candidateIndex] = mergeImageWorkbenchPreviewMessage({
          existingMessage: candidate,
          nextMessage: params.previewMessage,
        });
        return { messages: nextMessages, attached: true };
      }
    }

    const nextMessages = [...params.messages];
    nextMessages.splice(insertIndex, 0, params.previewMessage);
    return { messages: nextMessages, attached: true };
  }

  return { messages: params.messages, attached: false };
}

function patchMessagesWithImageWorkbenchState(params: {
  messages: Message[];
  imageWorkbenchState?: SessionImageWorkbenchState;
}): Message[] {
  const imageWorkbenchState = params.imageWorkbenchState;
  if (!imageWorkbenchState || params.messages.length === 0) {
    return params.messages;
  }

  const outputsByTaskId = new Map<string, ImageWorkbenchOutput[]>();
  imageWorkbenchState.outputs.forEach((output) => {
    const current = outputsByTaskId.get(output.taskId) || [];
    current.push(output);
    outputsByTaskId.set(output.taskId, current);
  });

  let changed = false;
  const nextMessages = params.messages.map((message) => {
    const preview = message.imageWorkbenchPreview;
    if (!preview?.taskId) {
      return message;
    }

    const task = imageWorkbenchState.tasks.find(
      (item) => item.id === preview.taskId,
    );
    if (!task) {
      return message;
    }

    const outputs = orderTaskOutputs(task, outputsByTaskId.get(task.id) || []);
    const preferredOutput = outputs[0];
    const nextPreviewStatus = resolvePreviewStatusFromWorkbenchTask(
      task.status,
    );
    const nextProviderName =
      preferredOutput?.providerName ?? preview.providerName ?? null;
    const nextModelName =
      preferredOutput?.modelName ??
      preview.modelName ??
      task.runtimeContract?.model ??
      preview.runtimeContract?.model ??
      null;
    const nextPreview: MessageImageWorkbenchPreview = {
      ...preview,
      prompt: preview.prompt || task.prompt,
      mode: task.mode,
      status: nextPreviewStatus,
      taskFilePath: task.taskFilePath ?? preview.taskFilePath ?? null,
      artifactPath: task.artifactPath ?? preview.artifactPath ?? null,
      imageUrl: preferredOutput?.url || preview.imageUrl || null,
      previewImages:
        outputs.length > 0
          ? buildPreviewImageUrls(outputs)
          : preview.previewImages,
      imageCount: outputs.length > 0 ? outputs.length : preview.imageCount,
      expectedImageCount: task.expectedCount || preview.expectedImageCount,
      providerName: nextProviderName,
      modelName: nextModelName,
      caption:
        task.caption ||
        preview.caption ||
        buildImageWorkbenchCaption({
          prompt: preview.prompt || task.prompt,
          status: nextPreviewStatus,
          imageCount: outputs.length || preview.imageCount,
          statusMessage: task.failureMessage || preview.statusMessage || null,
        }),
      layoutHint: task.layoutHint ?? preview.layoutHint ?? null,
      storyboardSlots: task.storyboardSlots ?? preview.storyboardSlots,
      sourceImageUrl: task.sourceImageUrl ?? preview.sourceImageUrl ?? null,
      sourceImagePrompt:
        task.sourceImagePrompt ?? preview.sourceImagePrompt ?? null,
      sourceImageRef: task.sourceImageRef ?? preview.sourceImageRef ?? null,
      sourceImageCount: task.sourceImageCount ?? preview.sourceImageCount,
      size: preferredOutput?.size || preview.size,
      phase: resolvePreviewPhaseFromWorkbenchTaskStatus(task.status),
      statusMessage:
        nextPreviewStatus === "running"
          ? (preview.statusMessage ?? null)
          : task.status === "error" || task.status === "cancelled"
            ? task.failureMessage || preview.statusMessage || null
            : null,
      runtimeContract: task.runtimeContract ?? preview.runtimeContract ?? null,
      retryable:
        typeof preview.retryable === "boolean"
          ? preview.retryable
          : task.status === "error"
            ? false
            : preview.retryable,
    };
    const nextMessage = mergeImageWorkbenchPreviewMessage({
      existingMessage: message,
      nextMessage: {
        ...message,
        ...buildImageWorkbenchMessagePatchFromTask({
          task,
          outputs,
          preview: nextPreview,
        }),
        imageWorkbenchPreview: nextPreview,
      },
    });

    if (nextMessage === message) {
      return message;
    }

    changed = true;
    return nextMessage;
  });

  return finalizePreviewMessages(
    params.messages,
    changed ? nextMessages : params.messages,
  );
}

function syncMessagesWithImageWorkbenchState(params: {
  messages: Message[];
  imageWorkbenchState?: SessionImageWorkbenchState;
  projectId?: string | null;
  contentId?: string | null;
  allowAppendCachedPreviewMessages?: boolean;
}): Message[] {
  const patchedMessages = ensureImageWorkbenchUserMessagesFromState({
    messages: patchMessagesWithImageWorkbenchState({
      messages: params.messages,
      imageWorkbenchState: params.imageWorkbenchState,
    }),
    imageWorkbenchState: params.imageWorkbenchState,
  });
  if (params.allowAppendCachedPreviewMessages !== true) {
    return patchedMessages;
  }

  const cachedPreviewMessages = buildImageWorkbenchPreviewMessagesFromState({
    imageWorkbenchState: params.imageWorkbenchState,
    projectId: params.projectId,
    contentId: params.contentId,
    includeUserMessages: patchedMessages.length === 0,
  }).filter(
    (candidateMessage) =>
      !patchedMessages.some(
        (message) =>
          message.role === "assistant" &&
          previewsReferToSameImageWorkbenchTask(
            message.imageWorkbenchPreview,
            candidateMessage.imageWorkbenchPreview,
          ),
      ),
  );
  if (cachedPreviewMessages.length === 0) {
    return patchedMessages;
  }

  const taskById = new Map(
    (params.imageWorkbenchState?.tasks || []).map((task) => [task.id, task]),
  );
  let nextMessages = patchedMessages;
  for (const message of cachedPreviewMessages) {
    const preview = message.imageWorkbenchPreview;
    const task = preview?.taskId ? taskById.get(preview.taskId) : undefined;
    if (patchedMessages.length > 0) {
      const attached = attachImageWorkbenchPreviewToMatchingTurn({
        messages: nextMessages,
        previewMessage: message,
        task,
      });
      if (attached.attached) {
        nextMessages = attached.messages;
      }
      continue;
    }

    nextMessages = upsertPreviewMessage(nextMessages, message);
  }
  return finalizePreviewMessages(patchedMessages, nextMessages);
}

export function useWorkspaceImageTaskPreviewRuntime({
  sessionId,
  projectId,
  contentId,
  projectRootPath,
  restoreFromWorkspace = true,
  messages,
  currentImageWorkbenchState,
  canvasState,
  setCanvasState,
  setChatMessages,
  updateCurrentImageWorkbenchState,
}: UseWorkspaceImageTaskPreviewRuntimeParams) {
  const effectiveMessages = messages ?? EMPTY_MESSAGES;
  const trackedTasksRef = useRef<Map<string, TrackedImageTask>>(new Map());
  const restoreSeedMessagesRef = useRef<
    ((seedMessages?: Message[]) => void) | null
  >(null);
  const runtimeContextRef = useRef<ImageTaskPreviewRuntimeContext>({
    sessionId,
    projectId,
    contentId,
    projectRootPath,
    messages: effectiveMessages,
    currentImageWorkbenchState,
    canvasState,
  });

  runtimeContextRef.current = {
    sessionId,
    projectId,
    contentId,
    projectRootPath,
    messages: effectiveMessages,
    currentImageWorkbenchState,
    canvasState,
  };

  useEffect(() => {
    const finalizedMessages = finalizePreviewMessages(
      effectiveMessages,
      effectiveMessages,
    );
    if (finalizedMessages === effectiveMessages) {
      return;
    }

    setChatMessages((previous) => finalizePreviewMessages(previous, previous));
  }, [effectiveMessages, setChatMessages]);

  useLayoutEffect(() => {
    const nextMessages = syncMessagesWithImageWorkbenchState({
      messages: effectiveMessages,
      imageWorkbenchState: currentImageWorkbenchState,
      projectId,
      contentId,
      allowAppendCachedPreviewMessages: restoreFromWorkspace,
    });
    if (nextMessages === effectiveMessages) {
      return;
    }

    setChatMessages((previous) => {
      return syncMessagesWithImageWorkbenchState({
        messages: previous,
        imageWorkbenchState: currentImageWorkbenchState,
        projectId,
        contentId,
        allowAppendCachedPreviewMessages: restoreFromWorkspace,
      });
    });
  }, [
    contentId,
    currentImageWorkbenchState,
    effectiveMessages,
    projectId,
    restoreFromWorkspace,
    setChatMessages,
  ]);

  useEffect(() => {
    restoreSeedMessagesRef.current?.(messages);
  }, [messages, projectRootPath, sessionId]);

  useEffect(() => {
    const shouldRestoreWorkspaceTaskCatalog =
      restoreFromWorkspace &&
      (hasTauriInvokeCapability() || hasTauriRuntimeMarkers());

    const trackedTasks = trackedTasksRef.current;
    trackedTasks.forEach((trackedTask) => {
      if (trackedTask.timerId !== null) {
        window.clearTimeout(trackedTask.timerId);
      }
    });
    trackedTasks.clear();

    let cancelled = false;
    let unlisten: (() => void) | null = null;
    const restoredSeedTaskIds = new Set<string>();
    let lastPendingImageCommandRecoverySignature = "";

    const loadTaskSnapshotFromArtifactApi = async (params: {
      taskId: string;
      taskFilePath?: string | null;
      artifactPath?: string | null;
    }): Promise<LoadedImageTaskSnapshot | null> => {
      const request = buildImageTaskLookupRequest({
        taskId: params.taskId,
        taskFilePath: params.taskFilePath,
        artifactPath: params.artifactPath,
        projectRootPath: runtimeContextRef.current.projectRootPath,
      });
      if (!request) {
        return null;
      }

      try {
        const artifact = await getMediaTaskArtifact(request);
        if (cancelled) {
          return null;
        }

        const taskRecord = asRecord(artifact.record);
        if (!taskRecord) {
          return null;
        }

        const snapshot = buildImageTaskSnapshotFromArtifactOutput({
          artifact,
          projectId: runtimeContextRef.current.projectId,
          contentId: runtimeContextRef.current.contentId,
          canvasState: runtimeContextRef.current.canvasState,
        });
        if (!snapshot) {
          return null;
        }

        return {
          snapshot,
          taskRecord,
        };
      } catch {
        return null;
      }
    };

    const applyLoadedTaskSnapshot = (params: LoadedImageTaskSnapshot) => {
      setChatMessages((previous) =>
        upsertPreviewMessage(previous, params.snapshot.message),
      );
      updateCurrentImageWorkbenchState((current) =>
        mergeImageTaskSnapshot(current, params.snapshot),
      );
      syncDocumentInlineImageTask({
        taskRecord: params.taskRecord,
        taskId: params.snapshot.taskId,
        outputs: params.snapshot.outputs,
        setCanvasState,
      });
    };

    const trackTaskForPolling = (params: {
      taskId: string;
      taskType?: string;
      absolutePath?: string;
      artifactPath?: string;
    }) => {
      const existing = trackedTasks.get(params.taskId);
      if (existing && existing.timerId !== null) {
        window.clearTimeout(existing.timerId);
      }
      trackedTasks.set(params.taskId, {
        taskId: params.taskId,
        taskType: params.taskType || existing?.taskType || "image_generate",
        taskFamily: "image",
        artifactPath: params.artifactPath || existing?.artifactPath || "",
        absolutePath: params.absolutePath || existing?.absolutePath || "",
        lookupTaskRef:
          params.absolutePath || existing?.lookupTaskRef || params.taskId,
        timerId: null,
        polling: false,
      });
    };

    const scheduleNextPoll = (taskId: string) => {
      const trackedTask = trackedTasks.get(taskId);
      if (!trackedTask || cancelled) {
        return;
      }
      if (trackedTask.timerId !== null) {
        window.clearTimeout(trackedTask.timerId);
      }
      trackedTask.timerId = window.setTimeout(() => {
        trackedTask.timerId = null;
        void syncTaskFile(taskId);
      }, IMAGE_TASK_POLL_INTERVAL_MS);
    };

    const syncTaskFile = async (taskId: string) => {
      const trackedTask = trackedTasks.get(taskId);
      if (!trackedTask || trackedTask.polling || cancelled) {
        return;
      }

      trackedTask.polling = true;

      try {
        let loadedSnapshot: LoadedImageTaskSnapshot | null = null;

        try {
          if (trackedTask.absolutePath) {
            const preview = await readFilePreview(
              trackedTask.absolutePath,
              IMAGE_TASK_FILE_PREVIEW_MAX_SIZE,
            );
            if (cancelled || !trackedTasks.has(taskId)) {
              return;
            }

            if (!preview.error && preview.content?.trim()) {
              const parsed = JSON.parse(preview.content) as Record<
                string,
                unknown
              >;
              const snapshot = buildParsedImageTaskSnapshot({
                taskRecord: parsed,
                taskId: trackedTask.taskId,
                taskType: trackedTask.taskType,
                projectId: runtimeContextRef.current.projectId,
                contentId: runtimeContextRef.current.contentId,
                taskFilePath: trackedTask.absolutePath,
                artifactPath: trackedTask.artifactPath,
                canvasState: runtimeContextRef.current.canvasState,
              });
              if (snapshot) {
                loadedSnapshot = {
                  snapshot,
                  taskRecord: parsed,
                };
              }
            }
          }
        } catch {
          loadedSnapshot = null;
        }

        const shouldProbeArtifactApi =
          !loadedSnapshot ||
          !loadedSnapshot.snapshot.terminal ||
          loadedSnapshot.snapshot.outputs.length === 0;

        if (shouldProbeArtifactApi) {
          const artifactSnapshot = await loadTaskSnapshotFromArtifactApi({
            taskId,
            taskFilePath: trackedTask.absolutePath || trackedTask.lookupTaskRef,
            artifactPath: trackedTask.artifactPath,
          });
          if (
            shouldPreferLoadedImageTaskSnapshot(
              loadedSnapshot,
              artifactSnapshot,
            )
          ) {
            loadedSnapshot = artifactSnapshot;
          }
        }
        if (!loadedSnapshot) {
          scheduleNextPoll(taskId);
          return;
        }

        trackedTask.lookupTaskRef =
          loadedSnapshot.snapshot.task.taskFilePath ||
          trackedTask.absolutePath ||
          trackedTask.lookupTaskRef;
        trackedTask.absolutePath =
          loadedSnapshot.snapshot.task.taskFilePath || trackedTask.absolutePath;
        trackedTask.artifactPath =
          loadedSnapshot.snapshot.task.artifactPath || trackedTask.artifactPath;
        applyLoadedTaskSnapshot(loadedSnapshot);

        if (loadedSnapshot.snapshot.terminal) {
          trackedTasks.delete(taskId);
          return;
        }

        scheduleNextPoll(taskId);
      } catch {
        scheduleNextPoll(taskId);
      } finally {
        const trackedTaskAfterSync = trackedTasks.get(taskId);
        if (trackedTaskAfterSync) {
          trackedTaskAfterSync.polling = false;
        }
      }
    };

    const restoreTrackedTasksFromWorkspace = async () => {
      const currentProjectRootPath =
        runtimeContextRef.current.projectRootPath?.trim();
      if (!currentProjectRootPath || cancelled) {
        return;
      }

      let restoredSnapshots: RestoredImageTaskSnapshot[] | null = null;

      try {
        const artifactList = await listMediaTaskArtifacts({
          projectRootPath: currentProjectRootPath,
          taskFamily: "image",
          limit: IMAGE_TASK_RESTORE_LIMIT * 4,
        });
        if (cancelled) {
          return;
        }

        restoredSnapshots = artifactList.tasks.reduce<
          RestoredImageTaskSnapshot[]
        >((items, artifact) => {
          const taskRecord = asRecord(artifact.record);
          if (!taskRecord) {
            return items;
          }
          if (
            !shouldRestoreImageTaskRecord({
              taskRecord,
              sessionId: runtimeContextRef.current.sessionId,
              projectId: runtimeContextRef.current.projectId,
              contentId: runtimeContextRef.current.contentId,
            })
          ) {
            return items;
          }

          const taskFamily = normalizeTaskFamily(
            artifact.task_type,
            artifact.task_family,
          );
          if (taskFamily !== "image") {
            return items;
          }

          const snapshot = buildImageTaskSnapshotFromArtifactOutput({
            artifact,
            projectId: runtimeContextRef.current.projectId,
            contentId: runtimeContextRef.current.contentId,
            canvasState: runtimeContextRef.current.canvasState,
          });
          if (!snapshot) {
            return items;
          }

          items.push({
            snapshot,
            taskRecord,
            absolutePath: artifact.absolute_path,
            taskType: artifact.task_type,
            taskFamily,
          });
          return items;
        }, []);
      } catch {
        restoredSnapshots = null;
      }

      if (restoredSnapshots === null) {
        const candidatePaths = await collectImageTaskCandidatePaths(
          currentProjectRootPath,
        );
        if (cancelled || candidatePaths.length === 0) {
          return;
        }

        restoredSnapshots = [];
        const seenTaskIds = new Set<string>();

        for (const candidatePath of candidatePaths) {
          try {
            const preview = await readFilePreview(
              candidatePath,
              IMAGE_TASK_FILE_PREVIEW_MAX_SIZE,
            );
            if (cancelled || preview.error || !preview.content?.trim()) {
              continue;
            }

            const parsed = JSON.parse(preview.content) as Record<
              string,
              unknown
            >;
            if (
              !shouldRestoreImageTaskRecord({
                taskRecord: parsed,
                sessionId: runtimeContextRef.current.sessionId,
                projectId: runtimeContextRef.current.projectId,
                contentId: runtimeContextRef.current.contentId,
              })
            ) {
              continue;
            }

            const taskId = readString([parsed], ["task_id", "taskId"]);
            const taskType = readString([parsed], ["task_type", "taskType"]);
            const taskFamily = normalizeTaskFamily(
              taskType || "",
              readString([parsed], ["task_family", "taskFamily"]),
            );
            if (
              !taskId ||
              !taskType ||
              taskFamily !== "image" ||
              seenTaskIds.has(taskId)
            ) {
              continue;
            }

            const snapshot = buildParsedImageTaskSnapshot({
              taskRecord: parsed,
              taskId,
              taskType,
              projectId: runtimeContextRef.current.projectId,
              contentId: runtimeContextRef.current.contentId,
              taskFilePath: candidatePath,
              canvasState: runtimeContextRef.current.canvasState,
            });
            if (!snapshot) {
              continue;
            }

            seenTaskIds.add(taskId);
            restoredSnapshots.push({
              snapshot,
              taskRecord: parsed,
              absolutePath: candidatePath,
              taskType,
              taskFamily,
            });
          } catch {
            continue;
          }
        }
      }

      if (cancelled || restoredSnapshots.length === 0) {
        return;
      }

      const selectedSnapshots = restoredSnapshots
        .sort(
          (left, right) => right.snapshot.updatedAt - left.snapshot.updatedAt,
        )
        .slice(0, IMAGE_TASK_RESTORE_LIMIT)
        .reverse();

      setChatMessages((previous) =>
        selectedSnapshots.reduce(
          (messages, item) =>
            upsertPreviewMessage(messages, item.snapshot.message),
          previous,
        ),
      );
      updateCurrentImageWorkbenchState((current) =>
        selectedSnapshots.reduce(
          (state, item) => mergeImageTaskSnapshot(state, item.snapshot),
          current,
        ),
      );
      selectedSnapshots.forEach((item) => {
        syncDocumentInlineImageTask({
          taskRecord: item.taskRecord,
          taskId: item.snapshot.taskId,
          outputs: item.snapshot.outputs,
          setCanvasState,
        });
      });

      for (const item of selectedSnapshots) {
        if (item.snapshot.terminal) {
          continue;
        }
        trackedTasks.set(item.snapshot.taskId, {
          taskId: item.snapshot.taskId,
          taskType: item.taskType,
          taskFamily: item.taskFamily,
          artifactPath: item.snapshot.task.artifactPath || "",
          absolutePath: item.snapshot.task.taskFilePath || item.absolutePath,
          lookupTaskRef:
            item.snapshot.task.taskFilePath ||
            item.absolutePath ||
            item.snapshot.taskId,
          timerId: null,
          polling: false,
        });
        scheduleNextPoll(item.snapshot.taskId);
      }
    };

    const restoreTrackedTasksFromMessages = async (
      seedMessages?: Message[],
    ): Promise<boolean> => {
      const taskSeeds = collectSeedImageTasks(
        seedMessages || runtimeContextRef.current.messages,
      ).filter((task) => !restoredSeedTaskIds.has(task.taskId));
      if (taskSeeds.length === 0 || cancelled) {
        return false;
      }

      taskSeeds.forEach((task) => {
        restoredSeedTaskIds.add(task.taskId);
      });

      const unresolvedTaskSeeds = taskSeeds.filter(
        (task) =>
          !isImageWorkbenchTaskSatisfiedByCache({
            imageWorkbenchState:
              runtimeContextRef.current.currentImageWorkbenchState,
            taskId: task.taskId,
          }),
      );
      if (unresolvedTaskSeeds.length === 0) {
        return true;
      }

      const loadedSnapshots = await Promise.all(
        unresolvedTaskSeeds.map(async (task) => ({
          task,
          loaded: await loadTaskSnapshotFromArtifactApi({
            taskId: task.taskId,
            taskFilePath: task.taskFilePath,
            artifactPath: task.artifactPath,
          }),
        })),
      );
      if (cancelled) {
        return false;
      }

      const resolvedSnapshots = loadedSnapshots.filter(
        (
          item,
        ): item is {
          task: SeedImageTaskRecord;
          loaded: LoadedImageTaskSnapshot;
        } =>
          Boolean(item.loaded) &&
          shouldRestoreLoadedImageTaskSnapshot(
            item.loaded as LoadedImageTaskSnapshot,
          ),
      );
      if (resolvedSnapshots.length === 0) {
        return false;
      }

      resolvedSnapshots.forEach((item) => {
        applyLoadedTaskSnapshot(item.loaded);
        if (!item.loaded.snapshot.terminal) {
          trackTaskForPolling({
            taskId: item.task.taskId,
            absolutePath:
              item.loaded.snapshot.task.taskFilePath || item.task.taskFilePath,
            artifactPath:
              item.loaded.snapshot.task.artifactPath || item.task.artifactPath,
          });
          scheduleNextPoll(item.task.taskId);
        }
      });

      return resolvedSnapshots.length === unresolvedTaskSeeds.length;
    };

    const restorePendingImageTasksFromCurrentSession =
      async (): Promise<boolean> => {
        const recoverySignature = resolvePendingImageCommandRecoverySignature(
          runtimeContextRef.current.messages,
        );
        if (!recoverySignature || cancelled) {
          return false;
        }
        if (recoverySignature === lastPendingImageCommandRecoverySignature) {
          return false;
        }

        const currentProjectRootPath =
          runtimeContextRef.current.projectRootPath?.trim();
        if (!currentProjectRootPath) {
          return false;
        }

        lastPendingImageCommandRecoverySignature = recoverySignature;

        let artifactList: Awaited<
          ReturnType<typeof listMediaTaskArtifacts>
        > | null = null;
        try {
          artifactList = await listMediaTaskArtifacts({
            projectRootPath: currentProjectRootPath,
            taskFamily: "image",
            limit: IMAGE_TASK_RESTORE_LIMIT,
          });
        } catch {
          return false;
        }

        if (cancelled || !artifactList) {
          return false;
        }

        const selectedSnapshots = artifactList.tasks
          .reduce<RestoredImageTaskSnapshot[]>((items, artifact) => {
            const taskRecord = asRecord(artifact.record);
            if (!taskRecord) {
              return items;
            }
            if (
              !shouldRestoreImageTaskRecord({
                taskRecord,
                sessionId: runtimeContextRef.current.sessionId,
                projectId: runtimeContextRef.current.projectId,
                contentId: runtimeContextRef.current.contentId,
              })
            ) {
              return items;
            }

            const taskFamily = normalizeTaskFamily(
              artifact.task_type,
              artifact.task_family,
            );
            if (taskFamily !== "image") {
              return items;
            }

            const snapshot = buildImageTaskSnapshotFromArtifactOutput({
              artifact,
              projectId: runtimeContextRef.current.projectId,
              contentId: runtimeContextRef.current.contentId,
              canvasState: runtimeContextRef.current.canvasState,
            });
            if (!snapshot) {
              return items;
            }

            items.push({
              snapshot,
              taskRecord,
              absolutePath: artifact.absolute_path,
              taskType: artifact.task_type,
              taskFamily,
            });
            return items;
          }, [])
          .filter(
            (item) =>
              !isImageWorkbenchTaskSatisfiedByCache({
                imageWorkbenchState:
                  runtimeContextRef.current.currentImageWorkbenchState,
                taskId: item.snapshot.taskId,
              }),
          )
          .sort(
            (left, right) => right.snapshot.updatedAt - left.snapshot.updatedAt,
          )
          .slice(0, IMAGE_TASK_RESTORE_LIMIT)
          .reverse();

        if (selectedSnapshots.length === 0) {
          return false;
        }

        setChatMessages((previous) =>
          selectedSnapshots.reduce(
            (messages, item) =>
              upsertPreviewMessage(messages, item.snapshot.message),
            previous,
          ),
        );
        updateCurrentImageWorkbenchState((current) =>
          selectedSnapshots.reduce(
            (state, item) => mergeImageTaskSnapshot(state, item.snapshot),
            current,
          ),
        );
        selectedSnapshots.forEach((item) => {
          syncDocumentInlineImageTask({
            taskRecord: item.taskRecord,
            taskId: item.snapshot.taskId,
            outputs: item.snapshot.outputs,
            setCanvasState,
          });
        });

        for (const item of selectedSnapshots) {
          if (item.snapshot.terminal) {
            continue;
          }
          trackedTasks.set(item.snapshot.taskId, {
            taskId: item.snapshot.taskId,
            taskType: item.taskType,
            taskFamily: item.taskFamily,
            artifactPath: item.snapshot.task.artifactPath || "",
            absolutePath: item.snapshot.task.taskFilePath || item.absolutePath,
            lookupTaskRef:
              item.snapshot.task.taskFilePath ||
              item.absolutePath ||
              item.snapshot.taskId,
            timerId: null,
            polling: false,
          });
          scheduleNextPoll(item.snapshot.taskId);
        }

        return true;
      };

    restoreSeedMessagesRef.current = (seedMessages) => {
      if (!restoreFromWorkspace || cancelled) {
        return;
      }
      void restoreTrackedTasksFromMessages(seedMessages).then(
        (restoredFromMessages) => {
          if (!restoredFromMessages && !shouldRestoreWorkspaceTaskCatalog) {
            void restorePendingImageTasksFromCurrentSession();
          }
        },
      );
    };

    safeListen<CreationTaskSubmittedPayload>(IMAGE_TASK_EVENT_NAME, (event) => {
      if (cancelled) {
        return;
      }

      const payload = event.payload || {};
      const taskId = payload.task_id?.trim();
      const taskType = payload.task_type?.trim();
      const taskFamily = normalizeTaskFamily(
        taskType || "",
        payload.task_family,
      );
      const matchesRuntimeContext = matchesRuntimeEventContext({
        payload,
        sessionId: runtimeContextRef.current.sessionId,
        projectId: runtimeContextRef.current.projectId,
        contentId: runtimeContextRef.current.contentId,
      });
      if (!matchesRuntimeContext) {
        return;
      }
      const artifactPath =
        payload.path?.trim() || payload.absolute_path?.trim() || "";
      const absolutePath = resolveAbsoluteWorkspacePath(
        runtimeContextRef.current.projectRootPath,
        payload.absolute_path?.trim() || artifactPath,
      );
      const normalizedEventStatus = normalizeTaskStatus(payload.status);
      const progressMessage = payload.reused_existing
        ? "正在生成图片。"
        : normalizedEventStatus === "succeeded"
          ? "图片生成完成。"
          : normalizedEventStatus === "partial"
            ? "图片返回部分结果。"
            : normalizedEventStatus === "failed"
              ? "图片生成失败。"
              : normalizedEventStatus === "cancelled"
                ? "图片生成已取消。"
                : "正在生成图片。";
      const pendingSnapshot =
        taskId && taskType && taskFamily === "image"
          ? buildPendingImageTaskSnapshot({
              taskId,
              taskType,
              status: payload.status,
              payload: {
                prompt: payload.prompt,
                size: payload.size,
                mode: payload.mode,
                layout_hint: payload.layout_hint,
                raw_text: payload.raw_text,
                persona_context: payload.persona_context,
                presentation: payload.presentation,
                taste_context: payload.taste_context,
                provider: payload.provider,
                provider_id: payload.provider_id,
                model: payload.model,
                count:
                  typeof payload.count === "number" ? payload.count : undefined,
                session_id: payload.session_id,
                thread_id: payload.thread_id,
                turn_id: payload.turn_id,
                project_id: payload.project_id,
                content_id: payload.content_id,
                entry_source: payload.entry_source,
                requested_target: payload.requested_target,
                slot_id: payload.slot_id,
                anchor_hint: payload.anchor_hint,
                anchor_section_title: payload.anchor_section_title,
                anchor_text: payload.anchor_text,
              },
              progressMessage,
              projectId:
                payload.project_id || runtimeContextRef.current.projectId,
              contentId:
                payload.content_id || runtimeContextRef.current.contentId,
              taskFilePath: absolutePath,
              artifactPath,
              canvasState: runtimeContextRef.current.canvasState,
            })
          : null;
      if (pendingSnapshot && taskId && taskType) {
        setChatMessages((previous) =>
          upsertPreviewMessage(previous, pendingSnapshot.message, {
            runtimeTurnId: payload.turn_id,
          }),
        );
        updateCurrentImageWorkbenchState((current) =>
          mergeImageTaskSnapshot(current, pendingSnapshot),
        );
        syncDocumentInlineImageTask({
          taskRecord: {
            task_id: taskId,
            task_type: taskType,
            status: payload.status || "pending_submit",
            normalized_status: normalizeTaskStatus(payload.status),
            relationships: payload.slot_id
              ? {
                  slot_id: payload.slot_id,
                }
              : undefined,
            payload: {
              prompt: payload.prompt,
              size: payload.size,
              mode: payload.mode,
              layout_hint: payload.layout_hint,
              raw_text: payload.raw_text,
              provider: payload.provider,
              provider_id: payload.provider_id,
              model: payload.model,
              count:
                typeof payload.count === "number" ? payload.count : undefined,
              session_id: payload.session_id,
              thread_id: payload.thread_id,
              turn_id: payload.turn_id,
              project_id: payload.project_id,
              content_id: payload.content_id,
              entry_source: payload.entry_source,
              requested_target: payload.requested_target,
              slot_id: payload.slot_id,
              anchor_hint: payload.anchor_hint,
              anchor_section_title: payload.anchor_section_title,
              anchor_text: payload.anchor_text,
              usage: payload.slot_id ? "document-inline" : undefined,
            },
          },
          taskId,
          outputs: pendingSnapshot.outputs,
          setCanvasState,
        });
      }

      if (!taskId || !taskType || taskFamily !== "image" || !absolutePath) {
        return;
      }

      const previousTracked = trackedTasks.get(taskId);
      if (previousTracked && previousTracked.timerId !== null) {
        window.clearTimeout(previousTracked.timerId);
      }
      trackedTasks.set(taskId, {
        taskId,
        taskType,
        taskFamily,
        artifactPath,
        absolutePath,
        lookupTaskRef: absolutePath,
        timerId: null,
        polling: false,
      });

      void syncTaskFile(taskId);
    })
      .then((dispose) => {
        if (cancelled) {
          void dispose();
          return;
        }
        unlisten = dispose;
      })
      .catch((error) => {
        console.warn("[AgentChatPage] 监听图片任务事件失败:", error);
      });

    if (restoreFromWorkspace) {
      void restoreTrackedTasksFromMessages().then((restoredFromMessages) => {
        if (!restoredFromMessages) {
          if (shouldRestoreWorkspaceTaskCatalog) {
            void restoreTrackedTasksFromWorkspace();
          } else {
            void restorePendingImageTasksFromCurrentSession();
          }
        }
      });
    }

    return () => {
      cancelled = true;
      restoreSeedMessagesRef.current = null;
      trackedTasks.forEach((trackedTask) => {
        if (trackedTask.timerId !== null) {
          window.clearTimeout(trackedTask.timerId);
        }
      });
      trackedTasks.clear();
      if (unlisten) {
        unlisten();
      }
    };
  }, [
    projectRootPath,
    restoreFromWorkspace,
    sessionId,
    setCanvasState,
    setChatMessages,
    updateCurrentImageWorkbenchState,
  ]);
}
