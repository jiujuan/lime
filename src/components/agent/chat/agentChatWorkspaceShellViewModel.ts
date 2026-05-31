export interface AgentChatWorkspaceShellViewModelInput {
  agentEntry: string;
  showChatPanel: boolean;
  contentId?: string | null;
  displayMessageCount: number;
  isHomePendingPreviewActive: boolean;
  shouldSuppressTaskCenterDraftContent: boolean;
  hasCanvasWorkbenchContent: boolean;
  isThemeWorkbench: boolean;
  shouldUseCompactGeneralWorkbench: boolean;
  isBootstrapDispatchPending: boolean;
  isSessionHydrating: boolean;
  isSending: boolean;
  queuedTurnCount: number;
}

export interface AgentChatWorkspaceShellViewModel {
  hasDisplayMessages: boolean;
  hasMessages: boolean;
  effectiveShowChatPanel: boolean;
  allowTopicSidebarToggle: boolean;
  shouldRestoreImageTasksFromWorkspace: boolean;
}

export function resolveAgentChatWorkspaceShellViewModel({
  agentEntry,
  showChatPanel,
  contentId,
  displayMessageCount,
  isHomePendingPreviewActive,
  shouldSuppressTaskCenterDraftContent,
  hasCanvasWorkbenchContent,
  isThemeWorkbench,
  shouldUseCompactGeneralWorkbench,
  isBootstrapDispatchPending,
  isSessionHydrating,
  isSending,
  queuedTurnCount,
}: AgentChatWorkspaceShellViewModelInput): AgentChatWorkspaceShellViewModel {
  const hasDisplayMessages =
    !shouldSuppressTaskCenterDraftContent &&
    (displayMessageCount > 0 || isHomePendingPreviewActive);
  const effectiveShowChatPanel =
    showChatPanel ||
    hasCanvasWorkbenchContent ||
    (agentEntry === "new-task" &&
      (hasDisplayMessages ||
        isThemeWorkbench ||
        (!shouldUseCompactGeneralWorkbench && isBootstrapDispatchPending) ||
        isSessionHydrating ||
        isHomePendingPreviewActive ||
        isSending ||
        queuedTurnCount > 0));
  const allowTopicSidebarToggle =
    showChatPanel || (agentEntry === "new-task" && effectiveShowChatPanel);
  const shouldRestoreImageTasksFromWorkspace = !(
    agentEntry === "new-task" &&
    !contentId &&
    !hasDisplayMessages &&
    !isSending &&
    queuedTurnCount === 0 &&
    !isBootstrapDispatchPending
  );

  return {
    hasDisplayMessages,
    hasMessages: hasDisplayMessages,
    effectiveShowChatPanel,
    allowTopicSidebarToggle,
    shouldRestoreImageTasksFromWorkspace,
  };
}
