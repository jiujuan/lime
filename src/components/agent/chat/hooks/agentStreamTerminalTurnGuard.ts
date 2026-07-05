function normalizeTurnId(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function shouldApplyAgentStreamTerminalEvent(params: {
  activeTextSegmentTurnId?: string | null;
  currentTurnId?: string | null;
  queuedTurnId?: string | null;
  terminalTurnId?: string | null;
}): boolean {
  const terminalTurnId = normalizeTurnId(params.terminalTurnId);
  if (!terminalTurnId) {
    return true;
  }

  const activeTextSegmentTurnId = normalizeTurnId(
    params.activeTextSegmentTurnId,
  );
  const currentTurnId = normalizeTurnId(params.currentTurnId);
  const queuedTurnId = normalizeTurnId(params.queuedTurnId);
  const comparableTurnIds = [activeTextSegmentTurnId, currentTurnId].filter(
    (turnId): turnId is string => Boolean(turnId),
  );
  const allowedTurnIds = [
    activeTextSegmentTurnId,
    currentTurnId,
    queuedTurnId,
  ].filter((turnId): turnId is string => Boolean(turnId));

  if (comparableTurnIds.length > 0) {
    return allowedTurnIds.includes(terminalTurnId);
  }

  return true;
}
