import { useCallback, useMemo, type MutableRefObject } from "react";
import type {
  A2UIFormData,
  A2UIResponse,
} from "@/components/workspace/a2ui/types";
import type { AgentPendingServiceSkillLaunchParams } from "@/types/page";
import type {
  ActionRequired,
  ConfirmResponse,
  Message,
  PendingA2UISource,
} from "../types";
import type { SendMessageFn } from "../hooks/agentChatShared";
import type { ServiceSkillHomeItem } from "../service-skills/types";
import type { CreationReplayMetadata } from "../utils/creationReplayMetadata";
import { selectPendingInputbarApprovalAction } from "./inputbarApprovalAction";
import { useInitialPendingServiceSkillLaunchRuntime } from "./useInitialPendingServiceSkillLaunchRuntime";
import { useWorkspaceA2UIRuntime } from "./useWorkspaceA2UIRuntime";
import { useWorkspaceA2UISubmitActions } from "./useWorkspaceA2UISubmitActions";
import { useWorkspaceSceneGateRuntime } from "./useWorkspaceSceneGateRuntime";
import type { ServiceSkillSelectionOptions } from "./workspaceServiceSkillEntryActionsViewModel";

interface UseWorkspacePendingInputRuntimeParams {
  activeTheme: string;
  applyProjectSelection?: (projectId?: string | null) => void;
  contentId?: string | null;
  creationReplay?: CreationReplayMetadata;
  dismissedInitialPendingServiceSkillLaunchSignatureRef: MutableRefObject<string>;
  handlePendingServiceSkillLaunchSubmit: (
    formData: A2UIFormData,
  ) => Promise<boolean>;
  handlePermissionResponse: (response: ConfirmResponse) => Promise<void>;
  handledInitialPendingServiceSkillLaunchSignatureRef: MutableRefObject<string>;
  initialPendingServiceSkillLaunch?: AgentPendingServiceSkillLaunchParams;
  initialPendingServiceSkillLaunchSignature: string;
  messages: Message[];
  onSelectServiceSkill: (
    skill: ServiceSkillHomeItem,
    options?: ServiceSkillSelectionOptions,
  ) => void;
  pendingActions: ActionRequired[];
  pendingServiceSkillLaunchForm: A2UIResponse | null;
  pendingServiceSkillLaunchSource: PendingA2UISource | null;
  projectId?: string | null;
  readOnlyInteractiveMessageIds?: ReadonlySet<string>;
  sceneGateResumeHandlerRef: MutableRefObject<
    (input: {
      rawText: string;
      requestMetadata: Record<string, unknown>;
    }) => Promise<boolean>
  >;
  sendMessage: SendMessageFn;
  serviceSkills: ServiceSkillHomeItem[];
  serviceSkillsError?: string | null;
  serviceSkillsLoading: boolean;
  submittedActionsInFlight: ActionRequired[];
  clearPendingServiceSkillLaunch: () => void;
}

/** 输入栏只显示一个待处理表单，优先级在此处统一决策。 */
export function useWorkspacePendingInputRuntime({
  activeTheme,
  applyProjectSelection,
  clearPendingServiceSkillLaunch,
  contentId,
  creationReplay,
  dismissedInitialPendingServiceSkillLaunchSignatureRef,
  handlePendingServiceSkillLaunchSubmit,
  handlePermissionResponse,
  handledInitialPendingServiceSkillLaunchSignatureRef,
  initialPendingServiceSkillLaunch,
  initialPendingServiceSkillLaunchSignature,
  messages,
  onSelectServiceSkill,
  pendingActions,
  pendingServiceSkillLaunchForm,
  pendingServiceSkillLaunchSource,
  projectId,
  readOnlyInteractiveMessageIds,
  sceneGateResumeHandlerRef,
  sendMessage,
  serviceSkills,
  serviceSkillsError,
  serviceSkillsLoading,
  submittedActionsInFlight,
}: UseWorkspacePendingInputRuntimeParams) {
  useInitialPendingServiceSkillLaunchRuntime({
    activeTheme,
    initialPendingServiceSkillLaunch,
    initialPendingServiceSkillLaunchSignature,
    handledSignatureRef: handledInitialPendingServiceSkillLaunchSignatureRef,
    dismissedSignatureRef:
      dismissedInitialPendingServiceSkillLaunchSignatureRef,
    serviceSkills,
    serviceSkillsError,
    serviceSkillsLoading,
    onSelectServiceSkill,
  });

  const pendingInputbarApprovalAction = useMemo(
    () =>
      selectPendingInputbarApprovalAction(
        pendingActions,
        submittedActionsInFlight,
      ),
    [pendingActions, submittedActionsInFlight],
  );
  const suppressPendingA2UIForApproval = Boolean(pendingInputbarApprovalAction);
  const {
    a2uiSubmissionNotice,
    pendingA2UIForm,
    pendingA2UISource,
    pendingActionRequest,
    pendingPromotedA2UIActionRequest,
    resolvePendingA2UISubmit,
  } = useWorkspaceA2UIRuntime({
    messages,
    readOnlyInteractiveMessageIds,
    suppressPendingA2UI: suppressPendingA2UIForApproval,
  });
  const {
    pendingSceneGateForm,
    pendingSceneGateSource,
    openRuntimeSceneGate,
    handleSceneGateSubmit,
    clearRuntimeSceneGate,
  } = useWorkspaceSceneGateRuntime({
    serviceSkills: activeTheme === "general" ? serviceSkills : [],
    projectId,
    contentId,
    creationReplay,
    applyProjectSelection,
    resumeSceneGate: async (input) =>
      await sceneGateResumeHandlerRef.current(input),
  });
  const effectivePendingA2UIForm = suppressPendingA2UIForApproval
    ? null
    : (pendingServiceSkillLaunchForm ??
      pendingSceneGateForm ??
      pendingA2UIForm);
  const effectivePendingA2UISource = suppressPendingA2UIForApproval
    ? null
    : (pendingServiceSkillLaunchSource ??
      pendingSceneGateSource ??
      pendingA2UISource);
  const hasPendingA2UIForm = Boolean(effectivePendingA2UIForm);
  const clearEntryPendingA2UI = useCallback(() => {
    if (initialPendingServiceSkillLaunchSignature) {
      dismissedInitialPendingServiceSkillLaunchSignatureRef.current =
        initialPendingServiceSkillLaunchSignature;
    }

    clearPendingServiceSkillLaunch();
    clearRuntimeSceneGate();
  }, [
    clearPendingServiceSkillLaunch,
    clearRuntimeSceneGate,
    dismissedInitialPendingServiceSkillLaunchSignatureRef,
    initialPendingServiceSkillLaunchSignature,
  ]);
  const { handleInputbarA2UISubmit } = useWorkspaceA2UISubmitActions({
    handlePermissionResponse,
    pendingPromotedA2UIActionRequest,
    resolvePendingA2UISubmit,
    sendMessage,
  });
  const handlePendingA2UISubmit = useCallback(
    (formData: A2UIFormData) => {
      if (pendingServiceSkillLaunchForm) {
        void handlePendingServiceSkillLaunchSubmit(formData);
        return;
      }

      if (pendingSceneGateForm) {
        void handleSceneGateSubmit(formData);
        return;
      }

      handleInputbarA2UISubmit(formData);
    },
    [
      handleInputbarA2UISubmit,
      handlePendingServiceSkillLaunchSubmit,
      handleSceneGateSubmit,
      pendingSceneGateForm,
      pendingServiceSkillLaunchForm,
    ],
  );
  const handleMessageA2UISubmit = useCallback(
    (formData: A2UIFormData, _messageId: string) => {
      handleInputbarA2UISubmit(formData);
    },
    [handleInputbarA2UISubmit],
  );

  return {
    a2uiSubmissionNotice,
    clearEntryPendingA2UI,
    effectivePendingA2UIForm,
    effectivePendingA2UISource,
    handleMessageA2UISubmit,
    handlePendingA2UISubmit,
    hasPendingA2UIForm,
    openRuntimeSceneGate,
    pendingActionRequest,
    pendingPromotedA2UIActionRequest,
  };
}
