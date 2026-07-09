import type {
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import {
  compactProjectionFields,
  definedString,
  readRecord,
  readStringArray,
  readStringField,
  truncateText,
} from "./normalization.js";

export type AgentUiReviewDelivery = "inline" | "detached";

export type AgentUiReviewStartIssueCode =
  | "missing_review_start_response"
  | "missing_turn_id"
  | "missing_review_thread_id"
  | "inline_review_thread_mismatch"
  | "inline_thread_started"
  | "detached_review_thread_not_new"
  | "detached_missing_thread_started"
  | "detached_thread_started_after_review_item"
  | "missing_entered_review_mode"
  | "missing_exited_review_mode"
  | "review_item_id_mismatch"
  | "review_prompt_rendered_as_transcript"
  | "review_final_rendered_as_plain_assistant"
  | "approval_item_id_mismatch"
  | "approval_turn_id_mismatch";

export interface AgentUiReviewStartIssue {
  code: AgentUiReviewStartIssueCode;
  path: string;
  message: string;
}

export interface AgentUiReviewStartItemInput {
  threadId?: string | null;
  delivery?: string | null;
  reviewStartResponse?: unknown;
  notifications?: unknown[];
  itemStarted?: unknown[];
  itemCompleted?: unknown[];
  threadStartedNotifications?: unknown[];
  commandExecutionItems?: unknown[];
  commandApprovalRequests?: unknown[];
  visibleTranscriptItems?: unknown[];
}

export interface AgentUiReviewNotificationTimelineEntry {
  index: number;
  method: string;
  threadId?: string;
  itemType?: string;
  itemId?: string;
}

export interface AgentUiReviewStartSnapshot {
  threadId?: string;
  reviewThreadId?: string;
  turnId?: string;
  delivery: AgentUiReviewDelivery;
  reviewLabel?: string;
  reviewTextPreview?: string;
  enteredSeen: boolean;
  exitedSeen: boolean;
  itemIdsMatch: boolean;
  inlineThreadStable: boolean;
  detachedThreadStartedBeforeReview: boolean;
  promptHiddenFromTranscript: boolean;
  finalReviewKeptOutOfPlainAssistant: boolean;
  approvalItemIdsMatch: boolean;
  approvalTurnIdsMatch: boolean;
  notificationTimeline: AgentUiReviewNotificationTimelineEntry[];
  validationIssues: AgentUiReviewStartIssue[];
}

interface ReviewItem {
  id?: string;
  review?: string;
}

interface NotificationEntry {
  method: string;
  threadId?: string;
  item?: Record<string, unknown>;
}

function issue(
  code: AgentUiReviewStartIssueCode,
  path: string,
  message: string,
): AgentUiReviewStartIssue {
  return { code, path, message };
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readParams(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return readRecord(record?.params) ?? record;
}

function notificationEntry(value: unknown): NotificationEntry | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  const params = readParams(record);
  const item = readRecord(params?.item);
  const thread =
    readStringField(params, ["threadId", "thread_id"]) ??
    readStringField(readRecord(params?.thread), ["id", "threadId", "session_id"]);
  return {
    method: readStringField(record, ["method"]) ?? readStringField(params, ["method"]) ?? "",
    threadId: thread,
    item,
  };
}

function itemType(item: Record<string, unknown> | undefined): string | undefined {
  return readStringField(item, ["type", "itemType", "kind"]);
}

function reviewItem(item: Record<string, unknown> | undefined): ReviewItem | undefined {
  const type = itemType(item);
  if (type !== "enteredReviewMode" && type !== "exitedReviewMode") {
    return undefined;
  }
  return {
    id: readStringField(item, ["id", "itemId"]),
    review: readStringField(item, ["review", "text"]),
  };
}

function collectItemNotifications(
  directItems: unknown[] | undefined,
  notifications: readonly NotificationEntry[],
  method: string,
  type: "enteredReviewMode" | "exitedReviewMode",
): ReviewItem[] {
  const fromDirect = readArray(directItems)
    .map((value) => reviewItem(readRecord(value)?.item ? readRecord(readRecord(value)?.item) : readRecord(value)))
    .filter((item): item is ReviewItem => Boolean(item));
  const fromTimeline = notifications
    .filter((entry) => entry.method === method && itemType(entry.item) === type)
    .map((entry) => reviewItem(entry.item))
    .filter((item): item is ReviewItem => Boolean(item));
  return [...fromDirect, ...fromTimeline].filter((item) => {
    if (type === "enteredReviewMode") {
      return item.review !== undefined || item.id !== undefined;
    }
    return item.review !== undefined || item.id !== undefined;
  });
}

function responseRecord(input: AgentUiReviewStartItemInput): Record<string, unknown> | undefined {
  const result = readRecord(readRecord(input.reviewStartResponse)?.result);
  return result ?? readRecord(input.reviewStartResponse);
}

function turnRecord(response: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return readRecord(response?.turn);
}

function reviewThreadId(response: Record<string, unknown> | undefined): string | undefined {
  return readStringField(response, ["reviewThreadId", "review_thread_id"]);
}

function turnIdFromResponse(response: Record<string, unknown> | undefined): string | undefined {
  return readStringField(turnRecord(response), ["id", "turnId", "turn_id"]);
}

function userPromptFromTurn(response: Record<string, unknown> | undefined): string | undefined {
  const turn = turnRecord(response);
  for (const item of readArray(turn?.items)) {
    const record = readRecord(item);
    const type = readStringField(record, ["type"]);
    if (type !== "userMessage" && type !== "user_message") continue;
    const parts = readArray(record?.content);
    const text = parts
      .flatMap((part) => {
        const partRecord = readRecord(part);
        return readStringArray(partRecord?.text);
      })
      .join("\n");
    const normalized = definedString(text);
    if (normalized) return normalized;
  }
  return undefined;
}

function normalizeDelivery(
  input: AgentUiReviewStartItemInput,
  threadId: string | undefined,
  reviewThreadIdValue: string | undefined,
): AgentUiReviewDelivery {
  const delivery = definedString(input.delivery ?? undefined)?.toLowerCase();
  if (delivery === "detached") return "detached";
  if (delivery === "inline") return "inline";
  return threadId && reviewThreadIdValue && threadId !== reviewThreadIdValue
    ? "detached"
    : "inline";
}

function timeline(input: AgentUiReviewStartItemInput): NotificationEntry[] {
  const explicit = readArray(input.notifications)
    .map(notificationEntry)
    .filter((entry): entry is NotificationEntry => Boolean(entry));
  if (explicit.length > 0) return explicit;
  return [
    ...readArray(input.threadStartedNotifications).map((entry) => ({
      method: "thread/started",
      threadId:
        readStringField(readRecord(entry), ["threadId", "thread_id"]) ??
        readStringField(readRecord(readRecord(entry)?.thread), ["id", "session_id"]),
    })),
    ...readArray(input.itemStarted).map((entry) => ({
      method: "item/started",
      threadId: readStringField(readRecord(entry), ["threadId", "thread_id"]),
      item: readRecord(readRecord(entry)?.item) ?? readRecord(entry),
    })),
    ...readArray(input.itemCompleted).map((entry) => ({
      method: "item/completed",
      threadId: readStringField(readRecord(entry), ["threadId", "thread_id"]),
      item: readRecord(readRecord(entry)?.item) ?? readRecord(entry),
    })),
  ];
}

function timelineSummary(entries: readonly NotificationEntry[]): AgentUiReviewNotificationTimelineEntry[] {
  return entries.map((entry, index) =>
    compactProjectionFields({
      index,
      method: entry.method,
      threadId: entry.threadId,
      itemType: itemType(entry.item),
      itemId: readStringField(entry.item, ["id", "itemId"]),
    } satisfies AgentUiReviewNotificationTimelineEntry),
  );
}

function indexOfThreadStarted(entries: readonly NotificationEntry[], threadId: string | undefined): number {
  if (!threadId) return -1;
  return entries.findIndex(
    (entry) => entry.method === "thread/started" && entry.threadId === threadId,
  );
}

function indexOfItem(entries: readonly NotificationEntry[], type: string): number {
  return entries.findIndex((entry) => itemType(entry.item) === type);
}

function textOfTranscriptItem(value: unknown): string | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  const direct = readStringField(record, ["text", "review", "preview", "content"]);
  if (direct) return direct;
  const content = readArray(record.content)
    .flatMap((part) => {
      const partRecord = readRecord(part);
      return readStringArray(partRecord?.text);
    })
    .join("\n");
  return definedString(content);
}

function roleOfTranscriptItem(value: unknown): string | undefined {
  const record = readRecord(value);
  return readStringField(record, ["role", "type", "itemType"]);
}

function transcriptContainsUserPrompt(
  transcriptItems: readonly unknown[],
  prompt: string | undefined,
): boolean {
  if (!prompt) return false;
  return transcriptItems.some((item) => {
    const role = roleOfTranscriptItem(item);
    const text = textOfTranscriptItem(item);
    return Boolean(
      text &&
        text.includes(prompt) &&
        (role === "user" || role === "userMessage" || role === "user_message"),
    );
  });
}

function transcriptContainsPlainAssistantReview(
  transcriptItems: readonly unknown[],
  reviewText: string | undefined,
): boolean {
  if (!reviewText) return false;
  return transcriptItems.some((item) => {
    const role = roleOfTranscriptItem(item);
    const text = textOfTranscriptItem(item);
    return Boolean(
      text &&
        text.includes(reviewText) &&
        (role === "assistant" || role === "agentMessage" || role === "agent_message"),
    );
  });
}

function commandItemIds(items: unknown[] | undefined): Set<string> {
  return new Set(
    readArray(items)
      .map((item) => readStringField(readRecord(item), ["id", "itemId"]))
      .filter((id): id is string => Boolean(id)),
  );
}

function approvalRecords(input: AgentUiReviewStartItemInput): Record<string, unknown>[] {
  return readArray(input.commandApprovalRequests)
    .map((item) => readRecord(readRecord(item)?.params) ?? readRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function validateSnapshot(
  input: AgentUiReviewStartItemInput,
  snapshot: Omit<AgentUiReviewStartSnapshot, "validationIssues">,
): AgentUiReviewStartIssue[] {
  const issues: AgentUiReviewStartIssue[] = [];
  if (!input.reviewStartResponse) {
    issues.push(
      issue(
        "missing_review_start_response",
        "$.reviewStartResponse",
        "review/start must return the review turn and reviewThreadId.",
      ),
    );
  }
  if (!snapshot.turnId) {
    issues.push(issue("missing_turn_id", "$.reviewStartResponse.turn.id", "Review turn id is required."));
  }
  if (!snapshot.reviewThreadId) {
    issues.push(
      issue(
        "missing_review_thread_id",
        "$.reviewStartResponse.reviewThreadId",
        "review/start must expose the owning review thread id.",
      ),
    );
  }
  if (snapshot.delivery === "inline" && !snapshot.inlineThreadStable) {
    issues.push(
      issue(
        "inline_review_thread_mismatch",
        "$.reviewStartResponse.reviewThreadId",
        "Inline review must stay on the source thread.",
      ),
    );
  }
  if (snapshot.delivery === "inline" && snapshot.notificationTimeline.some((entry) => entry.method === "thread/started" && entry.threadId === snapshot.reviewThreadId)) {
    issues.push(
      issue(
        "inline_thread_started",
        "$.notifications",
        "Inline review must not emit a new thread/started notification.",
      ),
    );
  }
  if (snapshot.delivery === "detached" && snapshot.threadId === snapshot.reviewThreadId) {
    issues.push(
      issue(
        "detached_review_thread_not_new",
        "$.reviewStartResponse.reviewThreadId",
        "Detached review must run on a new review thread.",
      ),
    );
  }
  if (snapshot.delivery === "detached" && !snapshot.detachedThreadStartedBeforeReview) {
    const hasThreadStarted = snapshot.notificationTimeline.some(
      (entry) => entry.method === "thread/started" && entry.threadId === snapshot.reviewThreadId,
    );
    issues.push(
      issue(
        hasThreadStarted
          ? "detached_thread_started_after_review_item"
          : "detached_missing_thread_started",
        "$.notifications",
        "Detached review must emit thread/started for the new review thread before review items.",
      ),
    );
  }
  if (!snapshot.enteredSeen) {
    issues.push(
      issue(
        "missing_entered_review_mode",
        "$.notifications",
        "review/start must stream an enteredReviewMode item.",
      ),
    );
  }
  if (!snapshot.exitedSeen) {
    issues.push(
      issue(
        "missing_exited_review_mode",
        "$.notifications",
        "review/start must complete with an exitedReviewMode item.",
      ),
    );
  }
  if (!snapshot.itemIdsMatch) {
    issues.push(
      issue(
        "review_item_id_mismatch",
        "$.notifications",
        "enteredReviewMode and exitedReviewMode must bind to the same review turn id.",
      ),
    );
  }
  if (!snapshot.promptHiddenFromTranscript) {
    issues.push(
      issue(
        "review_prompt_rendered_as_transcript",
        "$.visibleTranscriptItems",
        "The generated review prompt must not render as an ordinary user transcript row.",
      ),
    );
  }
  if (!snapshot.finalReviewKeptOutOfPlainAssistant) {
    issues.push(
      issue(
        "review_final_rendered_as_plain_assistant",
        "$.visibleTranscriptItems",
        "The final review must stay on the review lane instead of ordinary assistant transcript.",
      ),
    );
  }
  if (!snapshot.approvalItemIdsMatch) {
    issues.push(
      issue(
        "approval_item_id_mismatch",
        "$.commandApprovalRequests",
        "Review command approval request item_id must match the commandExecution item id.",
      ),
    );
  }
  if (!snapshot.approvalTurnIdsMatch) {
    issues.push(
      issue(
        "approval_turn_id_mismatch",
        "$.commandApprovalRequests",
        "Review command approval request turn_id must match the review turn.",
      ),
    );
  }
  return issues;
}

export function extractCodexReviewStartItemSnapshot(
  input: AgentUiReviewStartItemInput,
): AgentUiReviewStartSnapshot {
  const response = responseRecord(input);
  const threadId = definedString(input.threadId ?? undefined);
  const reviewThread = reviewThreadId(response);
  const turnId = turnIdFromResponse(response);
  const delivery = normalizeDelivery(input, threadId, reviewThread);
  const entries = timeline(input);
  const entered = collectItemNotifications(input.itemStarted, entries, "item/started", "enteredReviewMode")[0];
  const exited = collectItemNotifications(input.itemCompleted, entries, "item/completed", "exitedReviewMode")[0];
  const threadStartedIndex = indexOfThreadStarted(entries, reviewThread);
  const firstReviewItemIndex = Math.min(
    ...[indexOfItem(entries, "enteredReviewMode"), indexOfItem(entries, "exitedReviewMode")]
      .filter((index) => index >= 0),
  );
  const prompt = userPromptFromTurn(response);
  const transcriptItems = readArray(input.visibleTranscriptItems);
  const approvals = approvalRecords(input);
  const commandIds = commandItemIds(input.commandExecutionItems);
  const approvalItemIdsMatch = approvals.every((approval) => {
    const itemId = readStringField(approval, ["item_id", "itemId"]);
    return itemId ? commandIds.has(itemId) : false;
  });
  const approvalTurnIdsMatch = approvals.every((approval) => {
    const approvalTurnId = readStringField(approval, ["turn_id", "turnId"]);
    return approvalTurnId === turnId;
  });
  const base = {
    threadId,
    reviewThreadId: reviewThread,
    turnId,
    delivery,
    reviewLabel: entered?.review,
    reviewTextPreview: truncateText(exited?.review, 240),
    enteredSeen: Boolean(entered),
    exitedSeen: Boolean(exited),
    itemIdsMatch: Boolean(entered?.id && exited?.id && turnId && entered.id === turnId && exited.id === turnId),
    inlineThreadStable: Boolean(threadId && reviewThread && threadId === reviewThread),
    detachedThreadStartedBeforeReview:
      delivery === "detached" &&
      threadStartedIndex >= 0 &&
      firstReviewItemIndex >= 0 &&
      threadStartedIndex < firstReviewItemIndex,
    promptHiddenFromTranscript: !transcriptContainsUserPrompt(transcriptItems, prompt),
    finalReviewKeptOutOfPlainAssistant: !transcriptContainsPlainAssistantReview(
      transcriptItems,
      exited?.review,
    ),
    approvalItemIdsMatch: approvals.length === 0 || approvalItemIdsMatch,
    approvalTurnIdsMatch: approvals.length === 0 || approvalTurnIdsMatch,
    notificationTimeline: timelineSummary(entries),
  };
  return {
    ...base,
    validationIssues: validateSnapshot(input, base),
  };
}

function runtimeStatus(snapshot: AgentUiReviewStartSnapshot): AgentUiRuntimeStatus {
  if (snapshot.validationIssues.length > 0) return "failed";
  return snapshot.exitedSeen ? "completed" : "running";
}

function phase(snapshot: AgentUiReviewStartSnapshot): AgentUiPhase {
  if (snapshot.validationIssues.length > 0) return "failed";
  return snapshot.exitedSeen ? "completed" : "reviewing";
}

export function buildCodexReviewStartItemProjectionEvent(
  input: AgentUiReviewStartItemInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const snapshot = extractCodexReviewStartItemSnapshot(input);
  const status = runtimeStatus(snapshot);
  const base = buildAgentUiProjectionBase(
    { sourceType: "review_start_item_projection" },
    {
      ...context,
      threadId: snapshot.reviewThreadId ?? input.threadId ?? context.threadId,
      turnId: snapshot.turnId ?? context.turnId,
      runtimeEntity: "subagent_turn",
    },
  );

  return compactProjectionFields({
    ...base,
    type: snapshot.exitedSeen ? "review.completed" : "review.requested",
    sequence: context.sequence,
    reviewId: snapshot.turnId,
    parentThreadId:
      snapshot.delivery === "detached" ? snapshot.threadId : undefined,
    owner: "evidence",
    scope: "evidence",
    phase: phase(snapshot),
    surface: "review_lane",
    persistence: snapshot.exitedSeen ? "archive" : "snapshot",
    control: "request_review",
    topology: "review_team",
    runtimeEntity: "subagent_turn",
    runtimeStatus: status,
    latestTurnStatus: status,
    payload: {
      reviewEvent: "review_start_item",
      ...snapshot,
    },
  } satisfies AgentUiProjectionEvent);
}
