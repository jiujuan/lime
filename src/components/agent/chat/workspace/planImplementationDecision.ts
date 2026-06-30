import type { ActionRequired, AgentThreadItem, Message } from "../types";
import { splitProposedPlanSegments } from "../utils/proposedPlan";

const PROPOSED_PLAN_OPEN_TAG = "<proposed_plan>";

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
  dismissedRequestIds?: ReadonlySet<string>;
  messages?: readonly Message[];
  planState?: PlanImplementationState | null;
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

function stablePlanFingerprint(planText: string): string {
  let hash = 0;
  for (let index = 0; index < planText.length; index += 1) {
    hash = (hash * 31 + planText.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
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

function messageContainsProposedPlanTag(message: Message): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  if (
    typeof message.content === "string" &&
    message.content.includes(PROPOSED_PLAN_OPEN_TAG)
  ) {
    return true;
  }

  return (message.contentParts || []).some(
    (part) =>
      part.type === "text" &&
      typeof part.text === "string" &&
      part.text.includes(PROPOSED_PLAN_OPEN_TAG),
  );
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
        planRevisionId: readPlanRevisionId(item.metadata),
        sourceItemId: item.id,
        turnId: item.turn_id,
        planSource: "thread_item",
      };
    });
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

  return [
    {
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
    },
  ];
}

export function hasProposedPlanImplementationSignals({
  messages,
  planState,
  threadItems,
}: HasProposedPlanImplementationSignalsOptions): boolean {
  if (
    planState?.phase === "ready" &&
    planState.items.some((item) => normalizePlanText(item.content).length > 0)
  ) {
    return true;
  }

  if (
    threadItems?.some(
      (item) =>
        item.type === "plan" &&
        item.status === "completed" &&
        normalizePlanText(item.text).length > 0,
    )
  ) {
    return true;
  }

  return messages?.some(messageContainsProposedPlanTag) ?? false;
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

export function selectProposedPlanImplementationDecision({
  dismissedRequestIds,
  messages,
  planState,
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
  if (
    dismissedRequestIds?.has(requestId) ||
    submittedRequestIds?.has(requestId)
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
    }),
    latest_plan_revision:
      Object.keys(latestPlanRevision).length > 0
        ? latestPlanRevision
        : undefined,
  });
}
