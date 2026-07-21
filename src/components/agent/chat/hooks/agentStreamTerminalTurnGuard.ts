function normalizeTurnId(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function shouldApplyAgentStreamTerminalEvent(params: {
  activeTextSegmentTurnId?: string | null;
  currentTurnId?: string | null;
  terminalTurnId?: string | null;
}): boolean {
  const terminalTurnId = normalizeTurnId(params.terminalTurnId);
  if (!terminalTurnId) {
    return false;
  }

  const activeTextSegmentTurnId = normalizeTurnId(
    params.activeTextSegmentTurnId,
  );
  const currentTurnId = normalizeTurnId(params.currentTurnId);
  const activeTurnIds = [activeTextSegmentTurnId, currentTurnId].filter(
    (turnId): turnId is string => Boolean(turnId),
  );

  if (activeTurnIds.length > 0) {
    return activeTurnIds.includes(terminalTurnId);
  }

  return true;
}
