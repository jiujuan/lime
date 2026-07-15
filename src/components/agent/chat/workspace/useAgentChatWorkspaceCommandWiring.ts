import { useTrayModelShortcuts } from "../hooks/useTrayModelShortcuts";
import { useGeneralWorkbenchInitialDispatchRuntime } from "./useGeneralWorkbenchInitialDispatchRuntime";
import { useWorkspaceCanvasMessageSyncRuntime } from "./useWorkspaceCanvasMessageSyncRuntime";
import { useWorkspacePersistenceRuntime } from "./useWorkspacePersistenceRuntime";
import { useWorkspaceResetRuntime } from "./useWorkspaceResetRuntime";
import { useWorkspaceSendSurfaceRuntime } from "./useWorkspaceSendSurfaceRuntime";
import { useWorkspaceSessionRestore } from "./useWorkspaceSessionRestore";
import { useWorkspaceTaskCenterDraftStateRuntime } from "./useWorkspaceTaskCenterDraftStateRuntime";
import { useWorkspaceTaskCenterNavigationRuntime } from "./useWorkspaceTaskCenterNavigationRuntime";
import { useWorkspaceWorkbenchActionSurfaceRuntime } from "./useWorkspaceWorkbenchActionSurfaceRuntime";

type DraftStateParams = Parameters<
  typeof useWorkspaceTaskCenterDraftStateRuntime
>[0];
type PersistenceParams = Parameters<typeof useWorkspacePersistenceRuntime>[0];
type InitialDispatchParams = Parameters<
  typeof useGeneralWorkbenchInitialDispatchRuntime
>[0];
type SessionRestoreParams = Parameters<typeof useWorkspaceSessionRestore>[0];
type ResetParams = Parameters<typeof useWorkspaceResetRuntime>[0];
type NavigationParams = Parameters<
  typeof useWorkspaceTaskCenterNavigationRuntime
>[0];
type TrayShortcutParams = Parameters<typeof useTrayModelShortcuts>[0];
type CanvasMessageSyncParams = Parameters<
  typeof useWorkspaceCanvasMessageSyncRuntime
>[0];
type SendSurfaceParams = Parameters<typeof useWorkspaceSendSurfaceRuntime>[0];
type WorkbenchActionParams = Parameters<
  typeof useWorkspaceWorkbenchActionSurfaceRuntime
>[0];
type ImageWorkbenchParams = SendSurfaceParams["imageWorkbench"];
type SendActionsParams = SendSurfaceParams["sendActions"];
type CanvasWorkflowParams = WorkbenchActionParams["canvasWorkflow"];
type EntryPromptParams = WorkbenchActionParams["entryPrompt"];

type CommandScope = DraftStateParams &
  Omit<PersistenceParams, "draftSendInFlight"> &
  InitialDispatchParams &
  Omit<SessionRestoreParams, "sessionFiles" | "sessionMeta"> &
  Omit<ResetParams, "resetGuideState" | "resetRestoredSessionState"> &
  Omit<
    NavigationParams,
    | "resetTopicLocalState"
    | "projectId"
    | "onBeforeTopicSwitch"
    | "setActiveTaskCenterDraftTabId"
    | "setHomePendingPreviewRequest"
    | "setTaskCenterDraftSendRequest"
    | "setTaskCenterDraftTabs"
    | "shouldHydrateEmptyMatchedInitialSession"
    | "shouldPauseInitialSessionNavigationForTaskCenterDraft"
    | "taskCenterDraftSurfaceActiveRef"
  > &
  Omit<TrayShortcutParams, "activeTheme"> &
  CanvasMessageSyncParams &
  ImageWorkbenchParams &
  Omit<
    SendActionsParams,
    | "bootstrapDispatchPreview"
    | "finalizeAfterSendSuccess"
    | "resolveSendBoundary"
    | "rollbackAfterSendFailure"
  > &
  Omit<CanvasWorkflowParams, "onRunImageWorkbenchCommand" | "sendRef"> &
  Omit<
    EntryPromptParams,
    | "consumeInitialPrompt"
    | "dismissGeneralWorkbenchEntryPrompt"
    | "generalWorkbenchEntryPrompt"
    | "handleSendRef"
    | "initialDispatchKey"
  >;

interface UseAgentChatWorkspaceCommandWiringParams {
  scope: CommandScope;
  navigationProjectId: NavigationParams["projectId"];
  trayActiveTheme: TrayShortcutParams["activeTheme"];
  consumePendingSkill: SendSurfaceParams["pendingSkill"]["consumePendingSkill"];
  pendingSkillKey: SendSurfaceParams["pendingSkill"]["key"];
  sceneGateResumeHandlerRef: SendSurfaceParams["sceneGateResumeHandlerRef"];
}

/** 只组合既有 command owners，不持有 runtime 或 read-model truth。 */
export function useAgentChatWorkspaceCommandWiring({
  scope,
  navigationProjectId,
  trayActiveTheme,
  consumePendingSkill,
  pendingSkillKey,
  sceneGateResumeHandlerRef,
}: UseAgentChatWorkspaceCommandWiringParams) {
  const taskCenterDraftState = useWorkspaceTaskCenterDraftStateRuntime(scope);
  const persistence = useWorkspacePersistenceRuntime({
    ...scope,
    draftSendInFlight: Boolean(
      taskCenterDraftState.taskCenterDraftSendRequest ||
      taskCenterDraftState.homePendingPreviewRequest,
    ),
  });
  const initialDispatch = useGeneralWorkbenchInitialDispatchRuntime(scope);
  const sessionRestore = useWorkspaceSessionRestore({
    ...scope,
    sessionFiles: persistence.sessionFiles,
    sessionMeta: persistence.sessionMeta,
  });
  const reset = useWorkspaceResetRuntime({
    ...scope,
    resetGuideState: initialDispatch.resetGuideState,
    resetRestoredSessionState: sessionRestore.resetRestoredSessionState,
  });
  const taskCenterNavigation = useWorkspaceTaskCenterNavigationRuntime({
    ...scope,
    projectId: navigationProjectId,
    onBeforeTopicSwitch: taskCenterDraftState.handleBeforeTopicSwitch,
    resetTopicLocalState: reset.resetTopicLocalState,
    setActiveTaskCenterDraftTabId:
      taskCenterDraftState.setActiveTaskCenterDraftTabId,
    setHomePendingPreviewRequest:
      taskCenterDraftState.setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest:
      taskCenterDraftState.setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs: taskCenterDraftState.setTaskCenterDraftTabs,
    shouldHydrateEmptyMatchedInitialSession:
      taskCenterDraftState.shouldHydrateEmptyMatchedInitialSession,
    shouldPauseInitialSessionNavigationForTaskCenterDraft:
      taskCenterDraftState.shouldPauseInitialSessionNavigationForTaskCenterDraft,
    taskCenterDraftSurfaceActiveRef:
      taskCenterDraftState.taskCenterDraftSurfaceActiveRef,
  });

  useTrayModelShortcuts({
    ...scope,
    activeTheme: trayActiveTheme,
  });
  useWorkspaceCanvasMessageSyncRuntime(scope);

  const send = useWorkspaceSendSurfaceRuntime({
    imageWorkbench: scope,
    pendingSkill: {
      consumePendingSkill,
      isThemeWorkbench: scope.isThemeWorkbench,
      key: pendingSkillKey,
    },
    sceneGateResumeHandlerRef,
    sendActions: {
      ...scope,
      bootstrapDispatchPreview: initialDispatch.bootstrapDispatchPreview,
      finalizeAfterSendSuccess: initialDispatch.finalizeAfterSendSuccess,
      resolveSendBoundary: initialDispatch.resolveSendBoundary,
      rollbackAfterSendFailure: initialDispatch.rollbackAfterSendFailure,
    },
  });
  const workbenchActionsRuntime = useWorkspaceWorkbenchActionSurfaceRuntime({
    canvasWorkflow: {
      ...scope,
      onRunImageWorkbenchCommand: send.handleImageWorkbenchCommand,
      sendRef: send.handleSendRef,
    },
    entryPrompt: {
      ...scope,
      consumeInitialPrompt: initialDispatch.consumeInitialPrompt,
      dismissGeneralWorkbenchEntryPrompt:
        initialDispatch.dismissGeneralWorkbenchEntryPrompt,
      generalWorkbenchEntryPrompt: initialDispatch.generalWorkbenchEntryPrompt,
      handleSendRef: send.handleSendRef,
      initialDispatchKey: initialDispatch.initialDispatchKey,
    },
  });

  return {
    initialDispatch,
    persistence,
    reset,
    send,
    taskCenterDraftState,
    taskCenterNavigation,
    workbenchActions: workbenchActionsRuntime,
  };
}
