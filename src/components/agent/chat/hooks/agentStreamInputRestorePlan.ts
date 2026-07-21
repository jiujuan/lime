import { formatAgentRuntimeStatusSummary } from "../utils/agentRuntimeStatus";
import { isAgentMessageFinalAnswerPhase } from "../utils/agentMessagePhase";
import type { Message } from "../types";
import type {
  InterruptedInputDraftSnapshot,
  InterruptedInputRestorePlan,
} from "./agentStreamInputRestoreTypes";

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
}): InterruptedInputRestorePlan {
  const draft = normalizeInterruptedInputDraft(params.submittedDraft);
  const hasSideEffectActivity = messageHasSideEffectActivity(
    params.assistantMessage,
  );
  const hasVisibleText = messageHasVisibleText(params.assistantMessage);
  const hasThinkingOnlySignal = messageHasThinkingOnlySignal(
    params.assistantMessage,
  );

  if (!draft) {
    return {
      shouldRestoreComposer: false,
      reason: "no_submitted_draft",
      draft: null,
    };
  }

  if (hasSideEffectActivity) {
    return {
      shouldRestoreComposer: false,
      reason: "side_effect_activity_present",
      draft: null,
    };
  }

  if (hasVisibleText) {
    return {
      shouldRestoreComposer: false,
      reason: "visible_output_present",
      draft: null,
    };
  }

  return {
    shouldRestoreComposer: true,
    reason: hasThinkingOnlySignal
      ? "thinking_only_cancelled_turn"
      : "output_free_interrupted_turn",
    draft,
  };
}
