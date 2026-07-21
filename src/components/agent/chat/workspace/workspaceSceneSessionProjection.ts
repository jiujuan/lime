import { hasActiveThreadReadActivity } from "../projection/threadReadActivity";

export { hasActiveThreadReadActivity } from "../projection/threadReadActivity";

export interface ResolveWorkspaceSceneSessionProjectionParams<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
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
> {
  sceneDisplayMessages: TMessage[];
  sceneTurns: TTurn[];
  sceneThreadItems: TThreadItem[];
  sceneCurrentTurnId: string | null;
  sceneThreadRead: TThreadRead | null;
  sceneExecutionRuntime: TExecutionRuntime | null;
  scenePendingActions: TPendingAction[];
  sceneSubmittedActionsInFlight: TSubmittedAction[];
  sceneIsPreparingSend: boolean;
  sceneIsSending: boolean;
}

export function resolveWorkspaceSceneSessionProjection<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
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
  TSubmittedAction
>): WorkspaceSceneSessionProjection<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction
> {
  if (shouldHideCurrentSessionContent) {
    if (homePendingPreviewMessages.length > 0) {
      return {
        sceneDisplayMessages: homePendingPreviewMessages,
        sceneTurns: [],
        sceneThreadItems: [],
        sceneCurrentTurnId: null,
        sceneThreadRead: null,
        sceneExecutionRuntime: null,
        scenePendingActions: [],
        sceneSubmittedActionsInFlight: [],
        sceneIsPreparingSend: isPreparingSend || isTaskCenterDraftSendPending,
        sceneIsSending: isSending,
      };
    }

    return {
      sceneDisplayMessages: [],
      sceneTurns: [],
      sceneThreadItems: [],
      sceneCurrentTurnId: null,
      sceneThreadRead: null,
      sceneExecutionRuntime: null,
      scenePendingActions: [],
      sceneSubmittedActionsInFlight: [],
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
    sceneIsPreparingSend: isPreparingSend || isTaskCenterDraftSendPending,
    sceneIsSending: isSending || hasActiveThreadReadActivity(threadRead),
  };
}
