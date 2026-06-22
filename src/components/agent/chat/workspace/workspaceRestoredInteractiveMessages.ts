export interface RestoredInteractiveMessageSnapshot {
  sessionId: string | null;
  ids: Set<string>;
  capturedInitial: boolean;
  pendingRestoreCapture: boolean;
}

export interface ResolveReadOnlyInteractiveMessageIdsParams {
  snapshot: RestoredInteractiveMessageSnapshot;
  activeSessionKey: string | null;
  messages: readonly { id: string }[];
  normalizedInitialSessionId: string | null;
  isAutoRestoringSession: boolean;
  isSessionHydrating: boolean;
  isLoadingFullSessionHistory: boolean;
}

export function createRestoredInteractiveMessageSnapshot(): RestoredInteractiveMessageSnapshot {
  return {
    sessionId: null,
    ids: new Set<string>(),
    capturedInitial: false,
    pendingRestoreCapture: false,
  };
}

function resetRestoredInteractiveMessageSnapshot(
  snapshot: RestoredInteractiveMessageSnapshot,
  sessionId: string | null,
): void {
  snapshot.sessionId = sessionId;
  snapshot.ids = new Set<string>();
  snapshot.capturedInitial = false;
  snapshot.pendingRestoreCapture = false;
}

export function resolveReadOnlyInteractiveMessageIds({
  snapshot,
  activeSessionKey,
  messages,
  normalizedInitialSessionId,
  isAutoRestoringSession,
  isSessionHydrating,
  isLoadingFullSessionHistory,
}: ResolveReadOnlyInteractiveMessageIdsParams): ReadonlySet<string> {
  if (!activeSessionKey) {
    resetRestoredInteractiveMessageSnapshot(snapshot, null);
    return snapshot.ids;
  }

  if (snapshot.sessionId !== activeSessionKey) {
    resetRestoredInteractiveMessageSnapshot(snapshot, activeSessionKey);
  }

  if (isAutoRestoringSession || isSessionHydrating) {
    snapshot.pendingRestoreCapture = true;
  }

  const shouldCaptureInitialSessionMessages =
    normalizedInitialSessionId === activeSessionKey &&
    !snapshot.capturedInitial &&
    messages.length > 0;
  const shouldCaptureRestoredMessages =
    snapshot.pendingRestoreCapture ||
    shouldCaptureInitialSessionMessages ||
    isLoadingFullSessionHistory;

  if (shouldCaptureRestoredMessages && messages.length > 0) {
    for (const message of messages) {
      snapshot.ids.add(message.id);
    }
    snapshot.capturedInitial = true;
    snapshot.pendingRestoreCapture = false;
    return new Set(snapshot.ids);
  }

  return snapshot.ids;
}
