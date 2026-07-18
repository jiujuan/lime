import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import {
  shouldPauseTaskCenterInitialSessionNavigation,
  type TaskCenterDraftTab,
} from "./agentChatWorkspaceHelpers";

interface UseWorkspaceTaskCenterDraftStateRuntimeParams {
  agentEntry?: string;
  deferSessionRecentMetadataSyncForNavigation: (sessionId: string) => void;
  effectiveThreadItemCount: number;
  hasInitialSessionTopic: boolean;
  initialSessionMessagesCount?: number | null;
  messagesLength: number;
  normalizedInitialSessionId: string | null;
  sessionId?: string | null;
}

interface WorkspaceTaskCenterDraftStateRuntime {
  activeTaskCenterDraftTabId: string | null;
  homePendingPreviewRequest: TaskCenterDraftSendRequest | null;
  setActiveTaskCenterDraftTabId: Dispatch<SetStateAction<string | null>>;
  setHomePendingPreviewRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  setTaskCenterDraftSendRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  setTaskCenterDraftTabs: Dispatch<SetStateAction<TaskCenterDraftTab[]>>;
  shouldHydrateEmptyMatchedInitialSession: boolean;
  shouldPauseInitialSessionNavigationForTaskCenterDraft: boolean;
  taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
  taskCenterDraftSurfaceActiveRef: MutableRefObject<boolean>;
  taskCenterDraftTabs: TaskCenterDraftTab[];
  handleBeforeTopicSwitch: (topicId: string) => void;
}

export function useWorkspaceTaskCenterDraftStateRuntime({
  agentEntry,
  deferSessionRecentMetadataSyncForNavigation,
  effectiveThreadItemCount,
  hasInitialSessionTopic,
  initialSessionMessagesCount,
  messagesLength,
  normalizedInitialSessionId,
  sessionId,
}: UseWorkspaceTaskCenterDraftStateRuntimeParams): WorkspaceTaskCenterDraftStateRuntime {
  const [taskCenterDraftSendRequest, setTaskCenterDraftSendRequest] =
    useState<TaskCenterDraftSendRequest | null>(null);
  const [homePendingPreviewRequest, setHomePendingPreviewRequest] =
    useState<TaskCenterDraftSendRequest | null>(null);
  const taskCenterDraftSurfaceActiveRef = useRef(false);
  const [taskCenterDraftTabs, setTaskCenterDraftTabs] = useState<
    TaskCenterDraftTab[]
  >([]);
  const [activeTaskCenterDraftTabId, setActiveTaskCenterDraftTabId] = useState<
    string | null
  >(null);
  const previousAgentEntryRef = useRef(agentEntry);

  useLayoutEffect(() => {
    const previousAgentEntry = previousAgentEntryRef.current;
    previousAgentEntryRef.current = agentEntry;

    if (previousAgentEntry !== "new-task" || agentEntry !== "claw") {
      return;
    }

    taskCenterDraftSurfaceActiveRef.current = false;
    setActiveTaskCenterDraftTabId(null);
    setTaskCenterDraftTabs((current) => (current.length > 0 ? [] : current));
  }, [agentEntry]);

  const handleBeforeTopicSwitch = useCallback(
    (topicId: string) => {
      taskCenterDraftSurfaceActiveRef.current = false;
      setActiveTaskCenterDraftTabId(null);
      setTaskCenterDraftSendRequest(null);
      setHomePendingPreviewRequest(null);
      deferSessionRecentMetadataSyncForNavigation(topicId);
    },
    [deferSessionRecentMetadataSyncForNavigation],
  );

  const hasTaskCenterHomeHotpathPending = Boolean(
    taskCenterDraftSendRequest || homePendingPreviewRequest,
  );
  const shouldPauseInitialSessionNavigationForTaskCenterDraft =
    shouldPauseTaskCenterInitialSessionNavigation({
      agentEntry,
      draftSurfaceActive: taskCenterDraftSurfaceActiveRef.current,
      activeDraftTabId: activeTaskCenterDraftTabId,
      draftTabCount: taskCenterDraftTabs.length,
      hasHomeHotpathPending: hasTaskCenterHomeHotpathPending,
    });
  const shouldHydrateEmptyMatchedInitialSession =
    !hasTaskCenterHomeHotpathPending &&
    Boolean(normalizedInitialSessionId) &&
    normalizedInitialSessionId === (sessionId?.trim() || null) &&
    messagesLength === 0 &&
    effectiveThreadItemCount === 0 &&
    (!hasInitialSessionTopic || (initialSessionMessagesCount ?? 0) > 0);

  return {
    activeTaskCenterDraftTabId,
    handleBeforeTopicSwitch,
    homePendingPreviewRequest,
    setActiveTaskCenterDraftTabId,
    setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs,
    shouldHydrateEmptyMatchedInitialSession,
    shouldPauseInitialSessionNavigationForTaskCenterDraft,
    taskCenterDraftSendRequest,
    taskCenterDraftSurfaceActiveRef,
    taskCenterDraftTabs,
  };
}
