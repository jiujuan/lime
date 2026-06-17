export const AGENT_MESSAGE_PHASE_COMMENTARY = "commentary";
export const AGENT_MESSAGE_PHASE_FINAL_ANSWER = "final_answer";

function normalizeAgentMessagePhase(phase?: string | null): string | null {
  const normalized = phase?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function isAgentMessageCommentaryPhase(
  phase?: string | null,
): boolean {
  return normalizeAgentMessagePhase(phase) === AGENT_MESSAGE_PHASE_COMMENTARY;
}

export function isAgentMessageFinalAnswerPhase(
  phase?: string | null,
): boolean {
  const normalized = normalizeAgentMessagePhase(phase);
  return (
    normalized === AGENT_MESSAGE_PHASE_FINAL_ANSWER ||
    normalized === "final"
  );
}

export function shouldUseAgentMessageAsFinalText(
  phase?: string | null,
): boolean {
  const normalized = normalizeAgentMessagePhase(phase);
  return (
    normalized === null ||
    normalized === AGENT_MESSAGE_PHASE_FINAL_ANSWER ||
    normalized === "final"
  );
}

export interface AgentMessagePhaseSelectionCandidate {
  id: string;
  type: string;
  turn_id?: string | null;
  sequence?: number | null;
  phase?: string | null;
  text?: string | null;
  content?: string | null;
  message?: string | null;
}

function resolveSelectionTurnId(
  item: AgentMessagePhaseSelectionCandidate,
): string {
  return item.turn_id?.trim() || "__legacy_turn__";
}

function compareSelectionOrder(
  left: AgentMessagePhaseSelectionCandidate,
  right: AgentMessagePhaseSelectionCandidate,
): number {
  const leftSequence = Number.isFinite(left.sequence)
    ? Number(left.sequence)
    : Number.MAX_SAFE_INTEGER;
  const rightSequence = Number.isFinite(right.sequence)
    ? Number(right.sequence)
    : Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  return left.id.localeCompare(right.id);
}

export function resolveFinalAgentMessageItemIds<
  T extends AgentMessagePhaseSelectionCandidate,
>(items: readonly T[]): Set<string> {
  const itemsByTurn = new Map<string, T[]>();
  for (const item of items) {
    if (item.type !== "agent_message") {
      continue;
    }
    const text = item.text ?? item.content ?? item.message;
    if (text !== undefined && text !== null && !text.trim()) {
      continue;
    }
    const turnId = resolveSelectionTurnId(item);
    const turnItems = itemsByTurn.get(turnId) || [];
    turnItems.push(item);
    itemsByTurn.set(turnId, turnItems);
  }

  const selectedIds = new Set<string>();
  for (const turnItems of itemsByTurn.values()) {
    const explicitFinalItems = turnItems.filter((item) =>
      isAgentMessageFinalAnswerPhase(item.phase),
    );
    if (explicitFinalItems.length > 0) {
      for (const item of explicitFinalItems) {
        selectedIds.add(item.id);
      }
      continue;
    }

    const legacyFinalCandidates = turnItems
      .filter((item) => shouldUseAgentMessageAsFinalText(item.phase))
      .sort(compareSelectionOrder);
    const finalItem =
      legacyFinalCandidates[legacyFinalCandidates.length - 1] || null;
    if (finalItem) {
      selectedIds.add(finalItem.id);
    }
  }

  return selectedIds;
}
