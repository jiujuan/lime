import type { AgentToolCallState } from "@/lib/api/agentProtocol";
import {
  isAgentMessageCommentaryPhase,
  shouldUseAgentMessageAsFinalText,
} from "../utils/agentMessagePhase";
import type { AgentThreadItem, Message } from "../types";
import {
  aggregateFileChanges,
  type FileChangesAggregate,
} from "../utils/fileChangeSummary";
import {
  hasImportedSourceProcessItem,
  isImportedSourceProcessItem,
} from "../utils/importedSourceProcess";
import {
  toActionRequired,
  toToolCallState,
} from "./timeline-utils/itemConverters";
import {
  isUnifiedWebFetchToolName,
  isUnifiedWebSearchToolName,
} from "../utils/toolNameFamily";

type MessageContentPart = NonNullable<Message["contentParts"]>[number];

function stringifyTimelineArguments(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveTimelineToolStatus(
  status: AgentThreadItem["status"],
): AgentToolCallState["status"] {
  if (status === "in_progress") {
    return "running";
  }
  return status;
}

function appendTextContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "text") {
    lastPart.text = `${lastPart.text}\n${normalized}`;
    return;
  }

  parts.push({ type: "text", text: normalized });
}

function appendThinkingContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
  metadata?: Record<string, unknown>,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "thinking") {
    lastPart.text = `${lastPart.text}\n\n${normalized}`;
    if (!lastPart.metadata && metadata) {
      lastPart.metadata = metadata;
    }
    return;
  }

  parts.push({
    type: "thinking",
    text: normalized,
    ...(metadata ? { metadata } : {}),
  });
}

function appendPlanContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }
  appendTextContentPart(
    parts,
    `<proposed_plan>\n${normalized}\n</proposed_plan>`,
  );
}

function isTextContentPart(
  part: MessageContentPart,
): part is Extract<MessageContentPart, { type: "text" }> {
  return part.type === "text";
}

function isThinkingContentPart(
  part: MessageContentPart,
): part is Extract<MessageContentPart, { type: "thinking" }> {
  return part.type === "thinking";
}

function collectExistingProcessLeadParts(
  parts?: Message["contentParts"],
): MessageContentPart[] {
  const leadParts: MessageContentPart[] = [];
  for (const part of parts || []) {
    if (isThinkingContentPart(part) && part.text.trim().length > 0) {
      leadParts.push(part);
      continue;
    }

    if (
      part.type === "tool_use" ||
      part.type === "action_required" ||
      part.type === "file_changes_batch"
    ) {
      break;
    }

    if (isTextContentPart(part)) {
      break;
    }
  }
  return leadParts;
}

function resolveExistingFinalTextPart(
  parts?: Message["contentParts"],
): Extract<MessageContentPart, { type: "text" }> | null {
  const textParts = (parts || []).filter(isTextContentPart);
  return textParts[textParts.length - 1] || null;
}

function normalizeFinalTextSignature(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

function hasSameFinalTextContentPart(params: {
  finalText: string;
  parts: MessageContentPart[];
}): boolean {
  const finalTextSignature = normalizeFinalTextSignature(params.finalText);
  const firstProcessIndex = params.parts.findIndex(isProcessContentPart);
  return params.parts.some((part, index) => {
    if (!isTextContentPart(part)) {
      return false;
    }
    if (firstProcessIndex >= 0 && index <= firstProcessIndex) {
      return false;
    }
    const text = part.text.trim();
    return (
      text === params.finalText ||
      (finalTextSignature.length >= 12 &&
        normalizeFinalTextSignature(text) === finalTextSignature)
    );
  });
}

function collectThinkingText(parts: MessageContentPart[]): string {
  return parts
    .filter(isThinkingContentPart)
    .map((part) => part.text)
    .join("")
    .trim();
}

function removeTimelineLeadThinkingCoveredByExistingLead(params: {
  timelineParts: MessageContentPart[];
  existingLeadParts: MessageContentPart[];
}): MessageContentPart[] {
  const existingLeadThinking = collectThinkingText(params.existingLeadParts);
  if (!existingLeadThinking) {
    return params.timelineParts;
  }

  let changed = false;
  const nextParts: MessageContentPart[] = [];
  for (const part of params.timelineParts) {
    if (
      !nextParts.length &&
      isThinkingContentPart(part) &&
      existingLeadThinking.startsWith(part.text.trim())
    ) {
      changed = true;
      continue;
    }
    nextParts.push(part);
  }

  return changed ? nextParts : params.timelineParts;
}

function mergeExistingLeadAndFinalParts(params: {
  parts: MessageContentPart[];
  existingContentParts?: Message["contentParts"];
  displayContent: string;
}): MessageContentPart[] {
  const existingLeadParts = collectExistingProcessLeadParts(
    params.existingContentParts,
  );
  const existingFinalTextPart = resolveExistingFinalTextPart(
    params.existingContentParts,
  );
  if (!existingLeadParts.length && !existingFinalTextPart) {
    return params.parts;
  }

  const timelineParts = removeTimelineLeadThinkingCoveredByExistingLead({
    timelineParts: params.parts,
    existingLeadParts,
  });
  const merged = [...existingLeadParts, ...timelineParts];
  const finalText = existingFinalTextPart?.text.trim();
  if (!finalText) {
    return merged;
  }

  const hasSameFinalText = hasSameFinalTextContentPart({
    finalText,
    parts: merged,
  });
  const planOnlyTextPart =
    merged.filter(isTextContentPart).length === 1 &&
    merged.some(
      (part) =>
        isTextContentPart(part) &&
        part.text.trim().startsWith("<proposed_plan>"),
    );
  if (
    existingFinalTextPart &&
    (!hasSameFinalText ||
      (planOnlyTextPart && finalText === params.displayContent.trim()))
  ) {
    merged.push(existingFinalTextPart);
  }

  return merged;
}

function shouldRenderTimelineAgentMessageText(item: AgentThreadItem): boolean {
  if (item.type !== "agent_message") {
    return false;
  }

  return shouldUseAgentMessageAsFinalText(item.phase);
}

function shouldRenderTimelineAgentMessageAsThinking(
  item: AgentThreadItem,
): item is Extract<AgentThreadItem, { type: "agent_message" }> {
  return (
    item.type === "agent_message" && isAgentMessageCommentaryPhase(item.phase)
  );
}

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function buildTimelineToolContentPart(
  item: AgentThreadItem,
): MessageContentPart | null {
  if (
    item.type === "tool_call" ||
    item.type === "command_execution" ||
    item.type === "web_search"
  ) {
    const toolCall = toToolCallState(item);
    if (!toolCall) {
      return null;
    }
    const metadata = metadataRecord(item.metadata);
    return {
      type: "tool_use",
      toolCall,
      ...(metadata ? { metadata } : {}),
    };
  }

  return null;
}

function buildTimelineActionContentPart(
  item: AgentThreadItem,
): MessageContentPart | null {
  if (item.type !== "approval_request" && item.type !== "request_user_input") {
    return null;
  }

  const actionRequired = toActionRequired(item);
  if (!actionRequired) {
    return null;
  }

  return {
    type: "action_required",
    actionRequired,
  };
}

function hasFinalTextContentPart(parts: MessageContentPart[]): boolean {
  return parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
}

function isProcessContentPart(part: MessageContentPart): boolean {
  return (
    part.type === "thinking" ||
    part.type === "tool_use" ||
    part.type === "action_required" ||
    part.type === "file_changes_batch"
  );
}

function parseTimelineTimeMs(value?: string | null): number | null {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function resolveThreadItemTimeMs(item: AgentThreadItem): number | null {
  return (
    parseTimelineTimeMs(item.started_at) ??
    parseTimelineTimeMs(item.updated_at) ??
    parseTimelineTimeMs(item.completed_at)
  );
}

function resolveContentPartTimeMs(part: MessageContentPart): number | null {
  if (part.type !== "tool_use") {
    return null;
  }
  const startedAt = part.toolCall.startTime?.getTime();
  if (Number.isFinite(startedAt)) {
    return startedAt ?? null;
  }
  const endedAt = part.toolCall.endTime?.getTime();
  return Number.isFinite(endedAt) ? (endedAt ?? null) : null;
}

function resolveContentPartSequence(
  part: MessageContentPart,
  timelineSequenceById: Map<string, number>,
): number | null {
  if (part.type !== "tool_use") {
    return null;
  }
  const metadataSequence = finiteNumber(
    part.metadata?.sequence ?? part.toolCall.metadata?.sequence,
  );
  if (metadataSequence !== null) {
    return metadataSequence;
  }
  const sequence = timelineSequenceById.get(part.toolCall.id);
  return typeof sequence === "number" && Number.isFinite(sequence)
    ? sequence
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isWebRetrievalContentPart(part: MessageContentPart): boolean {
  return (
    part.type === "tool_use" &&
    (isUnifiedWebSearchToolName(part.toolCall.name) ||
      isUnifiedWebFetchToolName(part.toolCall.name))
  );
}

function buildSparseTimelineProcessPart(
  item: AgentThreadItem,
): MessageContentPart | null {
  if (item.type === "reasoning") {
    const part: MessageContentPart[] = [];
    appendThinkingContentPart(part, item.text, metadataRecord(item.metadata));
    return part[0] ?? null;
  }

  if (shouldRenderTimelineAgentMessageAsThinking(item)) {
    const part: MessageContentPart[] = [];
    appendThinkingContentPart(part, item.text, metadataRecord(item.metadata));
    return part[0] ?? null;
  }

  return null;
}

function normalizeSparseProcessText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function getSparseProcessPartKey(part: MessageContentPart): string | null {
  if (isThinkingContentPart(part)) {
    const text = normalizeSparseProcessText(part.text);
    return text ? `thinking:${text}` : null;
  }
  return null;
}

function collectSparseProcessPartKeys(
  parts: MessageContentPart[],
): Set<string> {
  const keys = new Set<string>();
  for (const part of parts) {
    const key = getSparseProcessPartKey(part);
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

function canMergeSparseTimelineProcessItem(item: AgentThreadItem): boolean {
  if (item.type === "agent_message") {
    return (
      item.text.trim().length > 0 &&
      (shouldRenderTimelineAgentMessageText(item) ||
        shouldRenderTimelineAgentMessageAsThinking(item))
    );
  }
  if (item.type === "reasoning") {
    return item.text.trim().length > 0;
  }
  return false;
}

function canIgnoreSparseTimelineProcessItem(item: AgentThreadItem): boolean {
  return item.type === "turn_summary";
}

function mergeSparseTimelineProcessIntoExistingParts(params: {
  items: AgentThreadItem[];
  existingContentParts?: Message["contentParts"];
  displayContent: string;
}): MessageContentPart[] | null {
  const existingParts = params.existingContentParts || [];
  if (!existingParts.some(isProcessContentPart)) {
    return null;
  }

  if (
    !params.items.every(
      (item) =>
        canMergeSparseTimelineProcessItem(item) ||
        canIgnoreSparseTimelineProcessItem(item),
    )
  ) {
    return null;
  }

  const pending = params.items
    .filter(canMergeSparseTimelineProcessItem)
    .map((item) => ({
      item,
      part: buildSparseTimelineProcessPart(item),
      timeMs: resolveThreadItemTimeMs(item),
    }))
    .filter(
      (entry): entry is {
        item: AgentThreadItem;
        part: MessageContentPart;
        timeMs: number | null;
      } => Boolean(entry.part),
    )
    .sort((left, right) => {
      if (left.timeMs !== null && right.timeMs !== null) {
        return left.timeMs - right.timeMs;
      }
      if (left.timeMs !== null) {
        return -1;
      }
      if (right.timeMs !== null) {
        return 1;
      }
      return left.item.sequence - right.item.sequence;
    });

  if (pending.length === 0) {
    return null;
  }

  const seenProcessKeys = collectSparseProcessPartKeys(existingParts);
  const uniquePending: typeof pending = [];
  for (const entry of pending) {
    const key = getSparseProcessPartKey(entry.part);
    if (key && seenProcessKeys.has(key)) {
      continue;
    }
    if (key) {
      seenProcessKeys.add(key);
    }
    uniquePending.push(entry);
  }

  if (uniquePending.length === 0) {
    return null;
  }

  const timelineSequenceById = new Map<string, number>();
  for (const item of params.items) {
    if (Number.isFinite(item.sequence)) {
      timelineSequenceById.set(item.id, item.sequence);
    }
  }

  const nextParts: MessageContentPart[] = [];
  let pendingIndex = 0;
  let sawProcess = false;
  let sawWebRetrievalProcess = false;
  const shouldUseWebRetrievalOrderFallback =
    uniquePending.length > 0 &&
    existingParts.some(isWebRetrievalContentPart) &&
    !params.items.some(
      (item) =>
        item.type === "tool_call" ||
        item.type === "web_search" ||
        item.type === "command_execution" ||
        item.type === "patch",
    );
  const flushPendingBefore = (
    timeMs: number | null,
    options: { includeUnknownTime: boolean } = { includeUnknownTime: true },
  ) => {
    while (pendingIndex < uniquePending.length) {
      const pendingTimeMs = uniquePending[pendingIndex]!.timeMs;
      if (
        timeMs !== null &&
        !(
          (options.includeUnknownTime && pendingTimeMs === null) ||
          (pendingTimeMs !== null && pendingTimeMs < timeMs)
        )
      ) {
        break;
      }
      nextParts.push(uniquePending[pendingIndex]!.part);
      pendingIndex += 1;
    }
  };
  const flushPendingBeforeSequence = (sequence: number | null) => {
    if (sequence === null) {
      return;
    }
    while (
      pendingIndex < uniquePending.length &&
      uniquePending[pendingIndex]!.timeMs === null &&
      Number.isFinite(uniquePending[pendingIndex]!.item.sequence) &&
      uniquePending[pendingIndex]!.item.sequence < sequence
    ) {
      nextParts.push(uniquePending[pendingIndex]!.part);
      pendingIndex += 1;
    }
  };

  for (const part of existingParts) {
    const partTimeMs = resolveContentPartTimeMs(part);
    const partSequence = resolveContentPartSequence(part, timelineSequenceById);
    if (part.type === "text" && sawProcess) {
      flushPendingBefore(null);
      nextParts.push(part);
      continue;
    }

    flushPendingBeforeSequence(partSequence);
    if (partTimeMs !== null) {
      flushPendingBefore(partTimeMs, {
        includeUnknownTime: partSequence === null,
      });
    } else {
      flushPendingBeforeSequence(partSequence);
    }
    nextParts.push(part);
    if (
      shouldUseWebRetrievalOrderFallback &&
      !sawWebRetrievalProcess &&
      isWebRetrievalContentPart(part)
    ) {
      sawWebRetrievalProcess = true;
      flushPendingBefore(null);
    }
    if (isProcessContentPart(part)) {
      sawProcess = true;
    }
  }

  flushPendingBefore(null);
  if (!hasFinalTextContentPart(nextParts)) {
    appendTextContentPart(nextParts, params.displayContent);
  }

  return nextParts;
}

function buildTimelinePatchContentPart(
  item: AgentThreadItem,
): MessageContentPart | null {
  if (item.type !== "patch") {
    return null;
  }

  const aggregate = aggregateFileChanges([buildTimelinePatchToolCall(item)]);
  if (aggregate.fileCount === 0) {
    const fallbackAggregate = buildTimelinePatchFallbackAggregate(item);
    return fallbackAggregate
      ? { type: "file_changes_batch", aggregate: fallbackAggregate }
      : null;
  }

  return { type: "file_changes_batch", aggregate };
}

function buildTimelinePatchToolCall(
  item: Extract<AgentThreadItem, { type: "patch" }>,
): AgentToolCallState {
  const status = resolveTimelineToolStatus(item.status);
  const metadata = metadataRecord(item.metadata);
  const primaryPath = item.paths?.find((path) => path.trim().length > 0);
  return {
    id: item.id,
    name: "Patch",
    arguments: stringifyTimelineArguments({
      path: primaryPath,
      paths: item.paths,
    }),
    status,
    startTime: new Date(item.started_at),
    endTime: item.completed_at ? new Date(item.completed_at) : undefined,
    metadata,
    result:
      status === "running"
        ? undefined
        : {
            success: item.success !== false,
            output: [item.stdout, item.stderr, item.text]
              .filter((value): value is string => Boolean(value?.trim()))
              .join("\n"),
            metadata,
          },
  };
}

function buildTimelinePatchFallbackAggregate(
  item: Extract<AgentThreadItem, { type: "patch" }>,
): FileChangesAggregate | null {
  const paths = (item.paths?.length ? item.paths : item.summary || [])
    .map((path) => path.trim())
    .filter(Boolean);
  const uniquePaths = Array.from(new Set(paths));
  if (uniquePaths.length === 0) {
    return null;
  }

  const files = uniquePaths.map((path) => ({
    path,
    kind: "update" as const,
    linesAdded: 0,
    linesRemoved: 0,
    diff: [],
    truncated: false,
    source: "backend" as const,
    status: resolveTimelineToolStatus(item.status),
  }));

  return {
    files,
    totalAdded: 0,
    totalRemoved: 0,
    fileCount: files.length,
  };
}

export function buildTimelineInlineContentParts(params: {
  displayContent: string;
  existingContentParts?: Message["contentParts"];
  items?: AgentThreadItem[];
}): Message["contentParts"] | undefined {
  const items = params.items || [];
  const sparseMergedParts = mergeSparseTimelineProcessIntoExistingParts({
    items,
    existingContentParts: params.existingContentParts,
    displayContent: params.displayContent,
  });
  if (sparseMergedParts) {
    return sparseMergedParts;
  }

  const hasAgentMessage = items.some(
    (item) => {
      if (item.type !== "agent_message") {
        return false;
      }
      return (
        (shouldRenderTimelineAgentMessageText(item) ||
          shouldRenderTimelineAgentMessageAsThinking(item)) &&
        item.text.trim().length > 0
      );
    },
  );
  const hasImportedProcess = hasImportedSourceProcessItem(items);

  const reasoningCount = items.filter(
    (item) => item.type === "reasoning" && item.text.trim().length > 0,
  ).length;
  const planCount = items.filter(
    (item) => item.type === "plan" && item.text.trim().length > 0,
  ).length;
  const hasImportedReasoning = items.some(
    (item) =>
      item.type === "reasoning" &&
      item.text.trim().length > 0 &&
      isImportedSourceProcessItem(item),
  );
  const toolLikeCount = items.filter(
    (item) =>
      item.type === "tool_call" ||
      item.type === "command_execution" ||
      item.type === "patch" ||
      item.type === "web_search" ||
      item.type === "subagent_activity" ||
      item.type === "context_compaction",
  ).length;
  const actionLikeCount = items.filter(
    (item) =>
      item.type === "approval_request" || item.type === "request_user_input",
  ).length;
  if (
    reasoningCount < 2 &&
    planCount === 0 &&
    !hasImportedReasoning &&
    toolLikeCount === 0 &&
    actionLikeCount === 0
  ) {
    return undefined;
  }
  if (
    !hasAgentMessage &&
    !hasImportedProcess &&
    reasoningCount === 0 &&
    planCount === 0 &&
    toolLikeCount === 0 &&
    actionLikeCount === 0
  ) {
    return undefined;
  }

  const parts: MessageContentPart[] = [];
  for (const item of items) {
    if (item.type === "reasoning") {
      appendThinkingContentPart(
        parts,
        item.text,
        metadataRecord(item.metadata),
      );
      continue;
    }

    if (item.type === "plan") {
      appendPlanContentPart(parts, item.text);
      continue;
    }

    if (
      item.type === "agent_message" &&
      shouldRenderTimelineAgentMessageText(item)
    ) {
      appendTextContentPart(parts, item.text);
      continue;
    }

    if (shouldRenderTimelineAgentMessageAsThinking(item)) {
      appendThinkingContentPart(
        parts,
        item.text,
        metadataRecord(item.metadata),
      );
      continue;
    }

    const patchPart = buildTimelinePatchContentPart(item);
    if (patchPart) {
      parts.push(patchPart);
      continue;
    }

    const toolPart = buildTimelineToolContentPart(item);
    if (toolPart) {
      parts.push(toolPart);
      continue;
    }

    const actionPart = buildTimelineActionContentPart(item);
    if (actionPart) {
      parts.push(actionPart);
    }
  }

  if (!hasFinalTextContentPart(parts)) {
    appendTextContentPart(parts, params.displayContent);
  }

  const hasTextPart = parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
  const hasProcessPart = parts.some(
    (part) =>
      part.type === "thinking" ||
      part.type === "tool_use" ||
      part.type === "file_changes_batch" ||
      part.type === "action_required",
  );
  if (!hasTextPart && !hasProcessPart) {
    return undefined;
  }

  const mergedParts = mergeExistingLeadAndFinalParts({
    parts,
    existingContentParts: params.existingContentParts,
    displayContent: params.displayContent,
  });

  const fileChangeParts = (params.existingContentParts || []).filter(
    (part) => part.type === "file_changes_batch",
  );
  if (fileChangeParts.length > 0) {
    mergedParts.push(...fileChangeParts);
  }

  return mergedParts;
}
