import { resolveAgentRuntimeErrorPresentation } from "../utils/agentRuntimeErrorPresentation";
import { shouldUseAgentMessageAsFinalText } from "../utils/agentMessagePhase";
import { sanitizeMessageTextForDisplay } from "../utils/messageDisplaySanitizer";
import { isUpdatePlanToolName } from "../utils/toolNameFamily";
import type {
  AgentThreadItem,
  AgentThreadTurn,
  Message,
  PendingA2UISource,
} from "../types";

const TERMINAL_THREAD_TURN_STATUSES = new Set<AgentThreadTurn["status"]>([
  "completed",
  "failed",
  "canceled",
  "cancelled",
  "aborted",
  "interrupted",
]);

export function isTerminalThreadTurnStatus(
  status?: AgentThreadTurn["status"] | string | null,
): boolean {
  return TERMINAL_THREAD_TURN_STATUSES.has(status as AgentThreadTurn["status"]);
}

function normalizeFailureContentForCompare(value?: string | null): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

export function isTrivialAssistantFinalText(value?: string | null): boolean {
  const normalized = (value || "").trim();
  if (!normalized) {
    return true;
  }

  return /^[\s.,!?;:，。！？；：、…]+$/.test(normalized);
}

function stripRuntimeFailureDiagnosticSegments(value: string): string {
  const diagnosticMarkers = [
    "执行失败：",
    "执行失败:",
    "Execution failed:",
    "execution failed:",
  ];

  return value
    .split(/\r?\n+/)
    .map((line) => {
      const markerIndex = diagnosticMarkers.reduce<number | null>(
        (earliest, marker) => {
          const index = line.indexOf(marker);
          if (index < 0) {
            return earliest;
          }
          return earliest === null ? index : Math.min(earliest, index);
        },
        null,
      );

      return (markerIndex === null ? line : line.slice(0, markerIndex)).trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

function dedupeAdjacentFailureParagraphs(value: string): string {
  const paragraphs = value
    .split(/\r?\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const deduped: string[] = [];

  for (const paragraph of paragraphs) {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      normalizeFailureContentForCompare(previous) ===
        normalizeFailureContentForCompare(paragraph)
    ) {
      continue;
    }
    deduped.push(paragraph);
  }

  return deduped.join("\n\n");
}

export function sanitizeRuntimeFailureAssistantText(
  message: Message,
  actionContent: string,
): string {
  if (
    message.role !== "assistant" ||
    message.runtimeStatus?.phase !== "failed" ||
    !actionContent.trim() ||
    isTrivialAssistantFinalText(actionContent)
  ) {
    return actionContent;
  }

  return dedupeAdjacentFailureParagraphs(
    stripRuntimeFailureDiagnosticSegments(actionContent),
  );
}

export function isRuntimeFailureOnlyAssistantText(
  message: Message,
  actionContent: string,
): boolean {
  if (
    message.role !== "assistant" ||
    message.runtimeStatus?.phase !== "failed"
  ) {
    return false;
  }

  const detailText = normalizeFailureContentForCompare(
    message.runtimeStatus.detail,
  );
  const contentText = normalizeFailureContentForCompare(actionContent);
  if (!detailText || !contentText) {
    return false;
  }

  const rawFailureText = contentText.replace(/^执行失败：/, "").trim();
  if (rawFailureText && rawFailureText !== contentText) {
    const presentedFailureText = normalizeFailureContentForCompare(
      resolveAgentRuntimeErrorPresentation(rawFailureText).displayMessage,
    );
    if (presentedFailureText === detailText) {
      return true;
    }
  }

  return (
    contentText === detailText ||
    contentText === `执行失败：${detailText}` ||
    contentText === `执行失败: ${detailText}` ||
    contentText === `当前处理失败 ${detailText}`
  );
}

export function isRuntimeFailureDiagnosticAliasText(
  message: Message,
  actionContent: string,
): boolean {
  if (
    message.role !== "assistant" ||
    message.runtimeStatus?.phase !== "failed"
  ) {
    return false;
  }

  const detailText = normalizeFailureContentForCompare(
    message.runtimeStatus.detail,
  );
  if (!detailText) {
    return false;
  }

  const contentText = normalizeFailureContentForCompare(actionContent);
  const rawFailureText = contentText.replace(/^执行失败[:：]\s*/, "").trim();
  if (!rawFailureText || rawFailureText === detailText) {
    return false;
  }

  return (
    normalizeFailureContentForCompare(
      resolveAgentRuntimeErrorPresentation(rawFailureText).displayMessage,
    ) === detailText
  );
}

export function resolveRuntimeFailureFallbackAssistantText(
  message: Message,
  actionContent: string,
): string {
  if (
    message.role !== "assistant" ||
    message.runtimeStatus?.phase !== "failed"
  ) {
    return "";
  }

  const rawContent = actionContent
    .trim()
    .replace(/^执行失败[:：]\s*/, "")
    .trim();
  const sourceText =
    normalizeFailureContentForCompare(message.runtimeStatus.detail) ||
    normalizeFailureContentForCompare(rawContent) ||
    normalizeFailureContentForCompare(message.runtimeStatus.title);
  if (!sourceText) {
    return normalizeFailureContentForCompare(message.runtimeStatus.title);
  }

  return normalizeFailureContentForCompare(
    resolveAgentRuntimeErrorPresentation(sourceText).displayMessage,
  );
}

export function shouldUseFirstTokenRuntimeStatus(
  status?: Message["runtimeStatus"] | null,
): boolean {
  const phase = status?.phase;
  return (
    phase === "routing" ||
    phase === "preparing" ||
    phase === "context" ||
    phase === "synthesizing" ||
    phase === "continuing" ||
    phase === "retrying"
  );
}

export function sanitizeProjectedMessageText(
  message: Message,
  value: string,
): string {
  if (!value.trim()) {
    return "";
  }

  return sanitizeMessageTextForDisplay(value, {
    role: message.role,
    hasImages: Array.isArray(message.images) && message.images.length > 0,
  });
}

export function canMergeTimelineAsSparseProcessPatch(
  items?: AgentThreadItem[],
): boolean {
  return Boolean(
    items?.length &&
    items.every(
      (item) => item.type === "reasoning" || item.type === "turn_summary",
    ),
  );
}

export function canTimelineOwnInlineProcessFlow(
  items?: AgentThreadItem[],
): boolean {
  return Boolean(
    items?.some((item) => {
      if (item.type === "tool_call") {
        return !isUpdatePlanToolName(item.tool_name);
      }
      return (
        item.type === "plan" ||
        item.type === "command_execution" ||
        item.type === "patch" ||
        item.type === "web_search" ||
        item.type === "approval_request" ||
        item.type === "request_user_input" ||
        item.type === "subagent_activity" ||
        item.type === "context_compaction"
      );
    }),
  );
}

export function resolveTimelineOwnedVisibleText(
  parts?: Message["contentParts"],
  options: { includeCommentary?: boolean } = {},
): string | null {
  const text = (parts || [])
    .filter(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "text"; text: string }
      > => part.type === "text" && part.text.trim().length > 0,
    )
    .filter(
      (part) =>
        options.includeCommentary === true ||
        shouldUseAgentMessageAsFinalText(
          typeof part.metadata?.phase === "string" ? part.metadata.phase : null,
        ),
    )
    .map((part) => part.text.trim())
    .join("\n\n")
    .trim();

  return text || null;
}

export function resolveMessageInteractiveProjectionState(params: {
  activePendingA2UISource: PendingA2UISource | null;
  hasActiveInteractiveRuntime: boolean;
  hasActiveStreamingOverlay: boolean;
  isActiveProcessOnlyOutput: boolean;
  isSending: boolean;
  lastAssistantMessageId: string | null;
  message: Message;
}) {
  const hasActivePendingSourceForMessage = (() => {
    const source = params.activePendingA2UISource;
    if (!source) {
      return false;
    }
    if (source.kind === "assistant_message") {
      return source.messageId === params.message.id;
    }
    if (source.kind !== "action_request") {
      return false;
    }
    return (
      (params.message.actionRequests || []).some(
        (request) => request.requestId === source.requestId,
      ) ||
      (params.message.contentParts || []).some(
        (part) =>
          part.type === "action_required" &&
          part.actionRequired.requestId === source.requestId,
      )
    );
  })();
  const hasPendingActionRequestForMessage =
    (params.message.actionRequests || []).some(
      (request) => request.status !== "submitted",
    ) ||
    (params.message.contentParts || []).some(
      (part) =>
        part.type === "action_required" &&
        part.actionRequired.status !== "submitted",
    );
  const isCurrentInteractiveAssistantMessage =
    params.message.role === "assistant" &&
    (hasActivePendingSourceForMessage ||
      params.hasActiveStreamingOverlay ||
      (params.message.id === params.lastAssistantMessageId &&
        params.hasActiveInteractiveRuntime &&
        (params.isSending ||
          hasPendingActionRequestForMessage ||
          params.isActiveProcessOnlyOutput)));
  const shouldReadOnlyInteractiveContent =
    params.message.role === "assistant" &&
    !isCurrentInteractiveAssistantMessage;

  return {
    isCurrentInteractiveAssistantMessage,
    shouldReadOnlyInteractiveContent,
  };
}
