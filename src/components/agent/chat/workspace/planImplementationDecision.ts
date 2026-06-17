import type { ActionRequired, AgentThreadItem, Message } from "../types";
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
  source: "message" | "thread_item";
}

interface SelectProposedPlanImplementationDecisionOptions {
  dismissedRequestIds?: ReadonlySet<string>;
  messages?: readonly Message[];
  planState?: PlanImplementationState | null;
  submittedRequestIds?: ReadonlySet<string>;
  threadItems?: readonly AgentThreadItem[];
}

function normalizePlanText(value: string | null | undefined): string {
  return (value || "").trim();
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
  const planText =
    itemLines.length > 0
      ? itemLines.map((content) => `- ${content}`).join("\n")
      : normalizePlanText(planState.summaryText);
  if (!planText) {
    return [];
  }

  return [
    {
      id: [
        "plan-state",
        planState.sourceToolCallId || "ready",
        itemLines.length,
        stablePlanFingerprint(planText),
      ].join(":"),
      completedAt: 0,
      planText,
      sequence: Number.MAX_SAFE_INTEGER,
      source: "thread_item",
    },
  ];
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
      arguments: {
        proposed_plan: latestCandidate.planText,
        plan_approval_request: true,
        source: latestCandidate.source,
      },
    },
  };
}
