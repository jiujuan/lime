export interface ResolveWorkspaceSceneSessionProjectionParams<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn,
> {
  shouldHideCurrentSessionContent: boolean;
  displayMessages: TMessage[];
  homePendingPreviewMessages: TMessage[];
  turns: TTurn[];
  effectiveThreadItems: TThreadItem[];
  currentTurnId: string | null;
  threadRead: TThreadRead | null;
  executionRuntime: TExecutionRuntime | null;
  planComposerPendingActions: TPendingAction[];
  submittedActionsInFlight: TSubmittedAction[];
  queuedTurns: TQueuedTurn[];
  isPreparingSend: boolean;
  isTaskCenterDraftSendPending: boolean;
  isSending: boolean;
}

export interface WorkspaceSceneSessionProjection<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn,
> {
  sceneDisplayMessages: TMessage[];
  sceneTurns: TTurn[];
  sceneThreadItems: TThreadItem[];
  sceneCurrentTurnId: string | null;
  sceneThreadRead: TThreadRead | null;
  sceneExecutionRuntime: TExecutionRuntime | null;
  scenePendingActions: TPendingAction[];
  sceneSubmittedActionsInFlight: TSubmittedAction[];
  sceneQueuedTurns: TQueuedTurn[];
  sceneIsPreparingSend: boolean;
  sceneIsSending: boolean;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeStatus(value: unknown): string | null {
  return typeof value === "string" ? value.trim().toLowerCase() || null : null;
}

export function hasRunningThreadReadActivity(threadRead: unknown): boolean {
  const record = readRecord(threadRead);
  if (!record) {
    return false;
  }
  if (
    normalizeStatus(record.status) === "running" ||
    normalizeStatus(record.profile_status) === "running"
  ) {
    return true;
  }
  if (
    typeof record.active_turn_id === "string" &&
    record.active_turn_id.trim()
  ) {
    return true;
  }
  const turns = Array.isArray(record.turns) ? record.turns : [];
  return turns.some((turn) => normalizeStatus(readRecord(turn)?.status) === "running");
}

export function resolveWorkspaceSceneSessionProjection<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn,
>({
  shouldHideCurrentSessionContent,
  displayMessages,
  homePendingPreviewMessages,
  turns,
  effectiveThreadItems,
  currentTurnId,
  threadRead,
  executionRuntime,
  planComposerPendingActions,
  submittedActionsInFlight,
  queuedTurns,
  isPreparingSend,
  isTaskCenterDraftSendPending,
  isSending,
}: ResolveWorkspaceSceneSessionProjectionParams<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn
>): WorkspaceSceneSessionProjection<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn
> {
  if (shouldHideCurrentSessionContent) {
    return {
      sceneDisplayMessages: [],
      sceneTurns: [],
      sceneThreadItems: [],
      sceneCurrentTurnId: null,
      sceneThreadRead: null,
      sceneExecutionRuntime: null,
      scenePendingActions: [],
      sceneSubmittedActionsInFlight: [],
      sceneQueuedTurns: [],
      sceneIsPreparingSend: false,
      sceneIsSending: false,
    };
  }

  return {
    sceneDisplayMessages:
      displayMessages.length > 0 ? displayMessages : homePendingPreviewMessages,
    sceneTurns: turns,
    sceneThreadItems: effectiveThreadItems,
    sceneCurrentTurnId: currentTurnId,
    sceneThreadRead: threadRead,
    sceneExecutionRuntime: executionRuntime,
    scenePendingActions: planComposerPendingActions,
    sceneSubmittedActionsInFlight: submittedActionsInFlight,
    sceneQueuedTurns: queuedTurns,
    sceneIsPreparingSend: isPreparingSend || isTaskCenterDraftSendPending,
    sceneIsSending: isSending || hasRunningThreadReadActivity(threadRead),
  };
}
