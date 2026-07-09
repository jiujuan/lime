import type { HandleSendOptions } from "../hooks/handleSendTypes";
import type {
  ActionRequired,
  AgentThreadItem,
  ConfirmResponse,
  Message,
} from "../types";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";
import { splitProposedPlanSegments } from "../utils/proposedPlan";

export interface PlanImplementationStateItem {
  id?: string;
  content: string;
  status?: string;
}

export interface PlanImplementationState {
  phase: "idle" | "planning" | "ready" | string;
  items: readonly PlanImplementationStateItem[];
  sourceToolCallId?: string;
  summaryText?: string;
  revisionId?: string;
  turnId?: string;
  source?: string;
}

export interface ProposedPlanImplementationDecision {
  action: ActionRequired;
  planText: string;
}

export type PlanImplementationSubmitPlan =
  | {
      kind: "invalid";
      reason: "missing_request_id";
    }
  | {
      kind: "dismiss";
      requestId: string;
      confirmationKeys: readonly string[];
    }
  | {
      kind: "send";
      decision: "accepted" | "adjustment";
      requestId: string;
      confirmationKeys: readonly string[];
      textOverride: string;
      sendOptions: HandleSendOptions & {
        toolPreferencesOverride: ChatToolPreferences;
      };
    };

interface LatestProposedPlanCandidate {
  id: string;
  completedAt: number;
  planText: string;
  sequence: number;
  source: "message" | "thread_item" | "plan_state";
  planRevisionId?: string;
  sourceItemId?: string;
  turnId?: string;
  planSource?: string;
}

interface SelectProposedPlanImplementationDecisionOptions {
  dismissedConfirmationKeys?: ReadonlySet<string>;
  dismissedRequestIds?: ReadonlySet<string>;
  messages?: readonly Message[];
  planState?: PlanImplementationState | null;
  submittedConfirmationKeys?: ReadonlySet<string>;
  submittedRequestIds?: ReadonlySet<string>;
  threadItems?: readonly AgentThreadItem[];
}

interface HasProposedPlanImplementationSignalsOptions {
  messages?: readonly Message[];
  planState?: PlanImplementationState | null;
  threadItems?: readonly AgentThreadItem[];
}

function normalizePlanText(value: string | null | undefined): string {
  return (value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringField(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function compactRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function readPlanRevisionId(metadata: unknown): string | undefined {
  const record = asRecord(metadata);
  return readStringField(record, "revisionId", "revision_id");
}

function readPlanSource(metadata: unknown): string | undefined {
  const record = asRecord(metadata);
  return readStringField(record, "source", "planSource", "plan_source");
}

function isLegacyUpdatePlanValue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized === "update_plan" ||
    normalized === "updateplantool" ||
    normalized.startsWith("update_plan:") ||
    normalized.startsWith("updateplan:") ||
    normalized.startsWith("plan:update_plan:")
  );
}

function isCurrentStructuredPlanCandidate(
  candidate: LatestProposedPlanCandidate,
): boolean {
  if (candidate.source === "message") {
    return true;
  }
  if (!candidate.planRevisionId?.trim()) {
    return false;
  }
  return ![
    candidate.planRevisionId,
    candidate.planSource,
    candidate.sourceItemId,
  ].some(isLegacyUpdatePlanValue);
}

function stablePlanFingerprint(planText: string): string {
  let hash = 0;
  for (let index = 0; index < planText.length; index += 1) {
    hash = (hash * 31 + planText.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function dateToEpoch(value: Date | string | undefined): number {
  if (!value) {
    return 0;
  }
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function collectMessagePlanCandidates(
  messages: readonly Message[] | undefined,
): LatestProposedPlanCandidate[] {
  if (!messages?.length) {
    return [];
  }

  const candidates: LatestProposedPlanCandidate[] = [];
  messages.forEach((message, messageIndex) => {
    if (message.role !== "assistant") {
      return;
    }

    const textCandidates = [
      message.content,
      ...(message.contentParts || [])
        .filter((part): part is Extract<typeof part, { type: "text" }> => {
          return part.type === "text";
        })
        .map((part) => part.text),
    ];

    textCandidates.forEach((text, textIndex) => {
      const planSegments = splitProposedPlanSegments(text).filter(
        (segment) =>
          segment.type === "plan" &&
          segment.isComplete &&
          normalizePlanText(segment.content).length > 0,
      );
      planSegments.forEach((segment, segmentIndex) => {
        const planText = normalizePlanText(segment.content);
        candidates.push({
          id: [
            "message",
            message.id,
            textIndex,
            segmentIndex,
            stablePlanFingerprint(planText),
          ].join(":"),
          completedAt: dateToEpoch(message.timestamp),
          planText,
          sequence: messageIndex * 1000 + textIndex * 100 + segmentIndex,
          source: "message",
          sourceItemId: message.id,
        });
      });
    });
  });

  return candidates;
}

function collectThreadItemPlanCandidates(
  threadItems: readonly AgentThreadItem[] | undefined,
): LatestProposedPlanCandidate[] {
  if (!threadItems?.length) {
    return [];
  }

  return threadItems
    .filter(
      (item): item is Extract<AgentThreadItem, { type: "plan" }> =>
        item.type === "plan" &&
        item.status === "completed" &&
        normalizePlanText(item.text).length > 0,
    )
    .map((item) => {
      const planText = normalizePlanText(item.text);
      const planRevisionId = readPlanRevisionId(item.metadata);
      return {
        id: [
          "thread",
          item.turn_id,
          item.id,
          stablePlanFingerprint(planText),
        ].join(":"),
        completedAt: dateToEpoch(item.completed_at || item.updated_at),
        planText,
        sequence: item.sequence,
        source: "thread_item" as const,
        planRevisionId,
        sourceItemId: item.id,
        turnId: item.turn_id,
        planSource: readPlanSource(item.metadata) || "thread_item",
      };
    })
    .filter(isCurrentStructuredPlanCandidate);
}

function collectPlanStateCandidates(
  planState: PlanImplementationState | null | undefined,
): LatestProposedPlanCandidate[] {
  if (!planState || planState.phase !== "ready") {
    return [];
  }

  const itemLines = planState.items
    .map((item) => normalizePlanText(item.content))
    .filter((content) => content.length > 0);
  if (itemLines.length === 0) {
    return [];
  }

  const planText = itemLines.map((content) => `- ${content}`).join("\n");
  if (!planText) {
    return [];
  }

  const candidate: LatestProposedPlanCandidate = {
    id: [
      "plan-state",
      planState.revisionId || planState.sourceToolCallId || "ready",
      itemLines.length,
      stablePlanFingerprint(planText),
    ].join(":"),
    completedAt: 0,
    planText,
    sequence: Number.MAX_SAFE_INTEGER,
    source: "plan_state",
    planRevisionId: planState.revisionId,
    sourceItemId: planState.sourceToolCallId,
    turnId: planState.turnId,
    planSource: planState.source,
  };

  return isCurrentStructuredPlanCandidate(candidate) ? [candidate] : [];
}

export function hasProposedPlanImplementationSignals({
  messages,
  planState,
  threadItems,
}: HasProposedPlanImplementationSignalsOptions): boolean {
  return (
    collectMessagePlanCandidates(messages).some(
      isCurrentStructuredPlanCandidate,
    ) ||
    collectThreadItemPlanCandidates(threadItems).length > 0 ||
    collectPlanStateCandidates(planState).length > 0
  );
}

function selectLatestCandidate(
  candidates: readonly LatestProposedPlanCandidate[],
): LatestProposedPlanCandidate | null {
  if (!candidates.length) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    if (left.completedAt !== right.completedAt) {
      return right.completedAt - left.completedAt;
    }
    if (left.sequence !== right.sequence) {
      return right.sequence - left.sequence;
    }
    return right.id.localeCompare(left.id);
  })[0];
}

export function buildPlanImplementationRequestId(
  candidateId: string,
  planText: string,
): string {
  return [
    "local-plan-implementation",
    candidateId,
    planText.length,
    stablePlanFingerprint(planText),
  ].join(":");
}

function buildPlanTextConfirmationKey(planText: string): string | undefined {
  const normalizedPlan = normalizePlanText(planText);
  if (!normalizedPlan) {
    return undefined;
  }
  return [
    "plan-text",
    normalizedPlan.length,
    stablePlanFingerprint(normalizedPlan),
  ].join(":");
}

function buildPlanRevisionConfirmationKey(
  planRevisionId: string | undefined,
  planText: string,
): string | undefined {
  const normalizedRevision = planRevisionId?.trim();
  const normalizedPlan = normalizePlanText(planText);
  if (!normalizedRevision || !normalizedPlan) {
    return undefined;
  }
  return [
    "plan-revision",
    normalizedRevision,
    normalizedPlan.length,
    stablePlanFingerprint(normalizedPlan),
  ].join(":");
}

function buildPlanConfirmationKeys(params: {
  planRevisionId?: string;
  planText: string;
}): string[] {
  return uniqueStrings([
    buildPlanRevisionConfirmationKey(params.planRevisionId, params.planText),
    buildPlanTextConfirmationKey(params.planText),
  ]);
}

export function readPlanImplementationConfirmationKeys(
  requestArguments?: unknown,
): string[] {
  const args = asRecord(requestArguments);
  const explicitKeys = [
    ...(Array.isArray(args?.plan_confirmation_keys)
      ? args?.plan_confirmation_keys
      : []),
    ...(Array.isArray(args?.planConfirmationKeys)
      ? args?.planConfirmationKeys
      : []),
  ].filter((value): value is string => typeof value === "string");
  const explicitKey = readStringField(
    args,
    "plan_confirmation_key",
    "planConfirmationKey",
  );
  const proposedPlan = readStringField(args, "proposed_plan", "proposedPlan");
  const planRevisionId = readStringField(
    args,
    "plan_revision_id",
    "planRevisionId",
  );

  return uniqueStrings([
    explicitKey,
    ...explicitKeys,
    ...buildPlanConfirmationKeys({
      planRevisionId,
      planText: proposedPlan || "",
    }),
  ]);
}

function hasAnyPlanConfirmationKey(
  keys: readonly string[],
  selectedKeys?: ReadonlySet<string>,
): boolean {
  return keys.some((key) => selectedKeys?.has(key));
}

export function selectProposedPlanImplementationDecision({
  dismissedConfirmationKeys,
  dismissedRequestIds,
  messages,
  planState,
  submittedConfirmationKeys,
  submittedRequestIds,
  threadItems,
}: SelectProposedPlanImplementationDecisionOptions): ProposedPlanImplementationDecision | null {
  const latestCandidate = selectLatestCandidate([
    ...collectMessagePlanCandidates(messages),
    ...collectThreadItemPlanCandidates(threadItems),
    ...collectPlanStateCandidates(planState),
  ]);
  if (!latestCandidate) {
    return null;
  }

  const requestId = buildPlanImplementationRequestId(
    latestCandidate.id,
    latestCandidate.planText,
  );
  const confirmationKeys = buildPlanConfirmationKeys({
    planRevisionId: latestCandidate.planRevisionId,
    planText: latestCandidate.planText,
  });
  if (
    dismissedRequestIds?.has(requestId) ||
    submittedRequestIds?.has(requestId) ||
    hasAnyPlanConfirmationKey(confirmationKeys, dismissedConfirmationKeys) ||
    hasAnyPlanConfirmationKey(confirmationKeys, submittedConfirmationKeys)
  ) {
    return null;
  }

  return {
    planText: latestCandidate.planText,
    action: {
      requestId,
      actionType: "ask_user",
      status: "pending",
      arguments: compactRecord({
        proposed_plan: latestCandidate.planText,
        plan_approval_request: true,
        source: latestCandidate.source,
        plan_confirmation_key: confirmationKeys[0],
        planConfirmationKey: confirmationKeys[0],
        plan_confirmation_keys: confirmationKeys,
        planConfirmationKeys: confirmationKeys,
        plan_revision_id: latestCandidate.planRevisionId,
        planRevisionId: latestCandidate.planRevisionId,
        source_item_id: latestCandidate.sourceItemId,
        sourceItemId: latestCandidate.sourceItemId,
        turn_id: latestCandidate.turnId,
        turnId: latestCandidate.turnId,
        plan_source: latestCandidate.planSource,
      }),
    },
  };
}

export function buildPlanImplementationHarnessMetadata(params: {
  requestArguments?: unknown;
  requestId: string;
  decision: "accepted" | "adjustment";
}): Record<string, unknown> {
  const args = asRecord(params.requestArguments);
  const planRevisionId = readStringField(
    args,
    "plan_revision_id",
    "planRevisionId",
  );
  const sourceItemId = readStringField(args, "source_item_id", "sourceItemId");
  const turnId = readStringField(args, "turn_id", "turnId");
  const source = readStringField(args, "plan_source", "source");
  const proposedPlan = readStringField(args, "proposed_plan", "proposedPlan");
  const confirmationKeys = readPlanImplementationConfirmationKeys(
    params.requestArguments,
  );
  const latestPlanRevision = compactRecord({
    revision_id: planRevisionId,
    source_item_id: sourceItemId,
    turn_id: turnId,
    source,
  });

  return compactRecord({
    plan_implementation_decision: compactRecord({
      request_id: params.requestId,
      decision: params.decision,
      plan_revision_id: planRevisionId,
      source_item_id: sourceItemId,
      turn_id: turnId,
      source,
      proposed_plan: proposedPlan,
      plan_confirmation_key: confirmationKeys[0],
    }),
    latest_plan_revision:
      Object.keys(latestPlanRevision).length > 0
        ? latestPlanRevision
        : undefined,
  });
}

export function buildPlanImplementationSubmitPlan(params: {
  acceptedLabel: string;
  effectiveChatToolPreferences: ChatToolPreferences;
  requestArguments?: unknown;
  response: ConfirmResponse;
}): PlanImplementationSubmitPlan {
  const requestId = params.response.requestId.trim();
  if (!requestId) {
    return { kind: "invalid", reason: "missing_request_id" };
  }
  if (!params.response.confirmed) {
    return {
      kind: "dismiss",
      requestId,
      confirmationKeys: readPlanImplementationConfirmationKeys(
        params.requestArguments,
      ),
    };
  }

  const userData = asRecord(params.response.userData);
  const adjustment =
    (typeof userData?.answer === "string" ? userData.answer.trim() : "") ||
    (typeof params.response.response === "string"
      ? params.response.response.trim()
      : "");
  const isAdjustment = Boolean(
    adjustment && adjustment !== params.acceptedLabel,
  );
  const decision = isAdjustment ? "adjustment" : "accepted";
  const planImplementationMetadata = buildPlanImplementationHarnessMetadata({
    requestArguments: params.requestArguments,
    requestId,
    decision,
  });

  if (isAdjustment) {
    return {
      kind: "send",
      decision,
      requestId,
      confirmationKeys: readPlanImplementationConfirmationKeys(
        params.requestArguments,
      ),
      textOverride: adjustment,
      sendOptions: {
        requestMetadata: {
          harness: {
            ...planImplementationMetadata,
            collaboration_mode: {
              mode: "plan",
              source: "plan_implementation_adjustment",
            },
            preferences: {
              task: true,
              task_mode: true,
            },
            task_mode_enabled: true,
          },
        },
        skipSceneCommandRouting: true,
        toolPreferencesOverride: {
          ...params.effectiveChatToolPreferences,
          task: true,
        },
      },
    };
  }

  return {
    kind: "send",
    decision,
    requestId,
    confirmationKeys: readPlanImplementationConfirmationKeys(
      params.requestArguments,
    ),
    textOverride: "Implement the plan.",
    sendOptions: {
      requestMetadata: {
        harness: {
          ...planImplementationMetadata,
          collaboration_mode: {
            mode: "implement",
            source: "plan_implementation_accept",
          },
        },
      },
      skipSceneCommandRouting: true,
      toolPreferencesOverride: {
        ...params.effectiveChatToolPreferences,
        task: false,
      },
    },
  };
}
